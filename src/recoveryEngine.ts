import { validateFlightNetworkDataset } from './dataLoader';
import { runSimulation } from './simulationEngine';
import { formatMinutesToTime, parseTimeToMinutes } from './timeUtils';
import type {
  AirportClosureInput,
  BeforeAfterComparison,
  ConstraintCheckItem,
  DeploySpareTailAction,
  DominoTimelineEvent,
  FlightHoldConstraint,
  FlightNetworkDataset,
  FlightSimulationResult,
  HoldConnectingFlightAction,
  RawCrew,
  RawFlight,
  RecoveryAction,
  RecoveryScoreBreakdown,
  RecoveryStrategyCandidate,
  RecoveryStrategyCategory,
  RecoveryValidationResult,
  SimulationResult,
  SwapTailSuffixesAction,
} from './types';

function round1(val: number): number {
  return Number(val.toFixed(1));
}

function round2(val: number): number {
  return Number(val.toFixed(2));
}

function pctReduction(before: number, after: number): number | null {
  if (before <= 0) return null;
  return round1(((before - after) / before) * 100);
}

/**
 * Builds a strict chronological timeline from actual simulation outputs:
 * - ORIGINAL_EVENT: Airport closure windows [startMins, endMins)
 * - PREDICTED_IMPACT: Delayed departures (origin/dest closures & turnaround cascades),
 *   failed passenger connections at inbound arrival, and crew duty limit breaches.
 * - RECOVERY_ACTION: Execution steps of an applied recovery strategy (when active).
 */
export function buildDominoTimeline(
  disruptedResult: SimulationResult,
  baselineResult: SimulationResult,
  recoveredResult?: SimulationResult | null,
  appliedStrategy?: RecoveryStrategyCandidate | null
): DominoTimelineEvent[] {
  const events: DominoTimelineEvent[] = [];
  const baselineByFlight = new Map<string, FlightSimulationResult>();
  for (const f of baselineResult.flights) {
    baselineByFlight.set(f.flightId, f);
  }

  // 1. Original Disruption Events (Airport Closures)
  const closureEventIdByAirport = new Map<string, string>();
  for (const closure of disruptedResult.closures) {
    const id = `evt-closure-${closure.id}`;
    if (!closureEventIdByAirport.has(closure.airportId)) {
      closureEventIdByAirport.set(closure.airportId, id);
    }
    const endLabel = closure.isOvernight ? `${closure.endTime}+1d` : closure.endTime;
    events.push({
      id,
      sequence: 0,
      timeMins: closure.startMins,
      timeLabel: closure.startTime,
      endTimeMins: closure.endMins,
      endTimeLabel: endLabel,
      type: 'DISRUPTION_ORIGIN',
      stageKind: 'ORIGINAL_EVENT',
      severity: 'critical',
      title: `${closure.airportId} Airfield Closure (${closure.startTime}–${endLabel} IST)`,
      description: `All departures and arrivals suspended at ${closure.airportId} during [${closure.startTime}, ${endLabel}).`,
      airportId: closure.airportId,
    });
  }

  // Track flight event IDs per tail & leg so downstream cascades link cleanly to upstream legs
  const flightEventIdById = new Map<string, string>();
  const flightsSorted = [...disruptedResult.flights].sort(
    (a, b) =>
      a.scheduledDepMins - b.scheduledDepMins ||
      a.tailId.localeCompare(b.tailId) ||
      a.legOrder - b.legOrder
  );

  // Build tail -> ordered legs map for causal linking
  const disruptedByTail = new Map<string, FlightSimulationResult[]>();
  for (const f of disruptedResult.flights) {
    const list = disruptedByTail.get(f.tailId) ?? [];
    list.push(f);
    disruptedByTail.set(f.tailId, list);
  }
  for (const list of disruptedByTail.values()) {
    list.sort((a, b) => a.legOrder - b.legOrder);
  }

  // 2. Flight Delay & Rotation Cascade Events
  for (const f of flightsSorted) {
    if (f.delayMinutes <= 0) continue;

    const isCascade =
      f.delayReasons.includes('TURNAROUND_PROPAGATION') &&
      !f.delayReasons.includes('ORIGIN_CLOSURE') &&
      !f.delayReasons.includes('DESTINATION_CLOSURE');

    const evtId = `evt-flt-${f.flightId}`;
    flightEventIdById.set(f.flightId, evtId);

    const tailLegs = disruptedByTail.get(f.tailId) ?? [];
    const prevLeg = tailLegs.find((l) => l.legOrder === f.legOrder - 1);

    let causedByEventId: string | undefined;
    if (f.delayReasons.includes('ORIGIN_CLOSURE')) {
      causedByEventId = closureEventIdByAirport.get(f.origin);
    } else if (f.delayReasons.includes('DESTINATION_CLOSURE')) {
      causedByEventId = closureEventIdByAirport.get(f.destination);
    } else if (prevLeg) {
      causedByEventId = flightEventIdById.get(prevLeg.flightId);
    }

    const baseF = baselineByFlight.get(f.flightId);
    const baseWindow = baseF ? `${baseF.scheduledDep}→${baseF.scheduledArr}` : `${f.scheduledDep}→${f.scheduledArr}`;

    events.push({
      id: evtId,
      sequence: 0,
      timeMins: f.scheduledDepMins,
      timeLabel: f.scheduledDep,
      endTimeMins: f.actualArrMins,
      endTimeLabel: f.actualArr,
      type: isCascade ? 'ROTATION_CASCADE' : 'FLIGHT_DELAY',
      stageKind: 'PREDICTED_IMPACT',
      severity: f.delayMinutes >= 60 ? 'critical' : 'warning',
      title: isCascade
        ? `${f.flightId} Rotation Cascade (+${f.delayMinutes}m)`
        : `${f.flightId} Closure Hold (+${f.delayMinutes}m)`,
      description: `${f.tailId} L${f.legOrder} (${f.origin}→${f.destination}): STD ${baseWindow} shifted to ETD ${f.actualDep}→${f.actualArr}. ${f.delayNotes.join(' · ')}`,
      airportId: f.origin,
      targetAirportId: f.destination,
      flightId: f.flightId,
      tailId: f.tailId,
      delayMinutes: f.delayMinutes,
      passengersAffected: f.pax,
      causedByEventId,
    });
  }

  // 3. Passenger Connection Failure Events
  const flightById = new Map<string, FlightSimulationResult>();
  for (const f of disruptedResult.flights) {
    flightById.set(f.flightId, f);
  }

  for (const conn of disruptedResult.failedConnections) {
    const inbound = flightById.get(conn.fromFlightId);
    const eventTimeMins = inbound ? inbound.actualArrMins : 0;
    events.push({
      id: `evt-conn-${conn.connectionId}`,
      sequence: 0,
      timeMins: eventTimeMins,
      timeLabel: conn.fromActualArr,
      type: 'CONNECTION_FAILURE',
      stageKind: 'PREDICTED_IMPACT',
      severity: 'critical',
      title: `${conn.connectionId} Missed Connection at ${conn.airport} (${conn.passengers} pax)`,
      description: `Inbound ${conn.fromFlightId} arrives ${conn.fromActualArr} leaving ${conn.availableConnectMinutes}m before ${conn.toFlightId} (${conn.toActualDep}); requires ${conn.minConnectMinutes}m MCT (shortfall ${conn.shortfallMinutes}m).`,
      airportId: conn.airport,
      flightId: conn.fromFlightId,
      connectionId: conn.connectionId,
      passengersAffected: conn.passengers,
      causedByEventId: flightEventIdById.get(conn.fromFlightId),
    });
  }

  // 4. Crew Duty Limit Violations
  for (const cr of disruptedResult.crewViolations) {
    const breachMins = cr.dutyStartMins + cr.maxDutyMins;
    events.push({
      id: `evt-crew-${cr.crewId}`,
      sequence: 0,
      timeMins: breachMins,
      timeLabel: formatMinutesToTime(breachMins),
      endTimeMins: cr.actualDutyEndMins,
      endTimeLabel: cr.actualDutyEnd,
      type: 'CREW_VIOLATION',
      stageKind: 'PREDICTED_IMPACT',
      severity: 'critical',
      title: `${cr.crewId} (${cr.tailId}) Crew Duty Limit Breach (+${cr.overtimeMins}m)`,
      description: `Max duty ${cr.maxDutyMins}m exceeded at ${formatMinutesToTime(breachMins)}; actual duty extends to ${cr.actualDutyEnd} (${cr.actualDutyMins}m total).`,
      airportId: cr.base,
      crewId: cr.crewId,
      tailId: cr.tailId,
      delayMinutes: cr.overtimeMins,
      causedByEventId: flightEventIdById.get(cr.flightIds[cr.flightIds.length - 1]),
    });
  }

  // 5. Recovery Action Events (when an active strategy is applied)
  if (appliedStrategy && recoveredResult) {
    const recoveredById = new Map<string, FlightSimulationResult>();
    for (const f of recoveredResult.flights) {
      recoveredById.set(f.flightId, f);
    }

    appliedStrategy.actions.forEach((action, idx) => {
      if (action.type === 'DEPLOY_SPARE_TAIL_SUFFIX') {
        const recFlight = recoveredById.get(action.fromFlightId);
        const origFlight = flightById.get(action.fromFlightId);
        const execMins = recFlight ? recFlight.actualDepMins : origFlight?.scheduledDepMins ?? 0;
        const delayReduced =
          origFlight && recFlight ? origFlight.delayMinutes - recFlight.delayMinutes : 0;
        events.push({
          id: `evt-rec-${idx}-${action.fromFlightId}`,
          sequence: 0,
          timeMins: execMins,
          timeLabel: formatMinutesToTime(execMins),
          type: 'RECOVERY_ACTION',
          stageKind: 'RECOVERY_ACTION',
          severity: 'recovery',
          title: `Recovery: Deploy Spare ${action.spareTailId} on ${action.fromFlightId}+`,
          description: `Standby tail ${action.spareTailId} assumes ${action.targetTailId}'s rotation from ${action.fromFlightId} (${recFlight?.origin ?? ''}), cutting ${delayReduced}m delay on lead leg.`,
          airportId: recFlight?.origin ?? '',
          targetAirportId: recFlight?.destination,
          flightId: action.fromFlightId,
          tailId: action.spareTailId,
          sourceTailId: action.targetTailId,
        });
      } else if (action.type === 'SWAP_TAIL_SUFFIXES') {
        const recA = recoveredById.get(action.fromFlightAId);
        const execMins = recA ? recA.actualDepMins : 0;
        events.push({
          id: `evt-rec-${idx}-${action.fromFlightAId}-${action.fromFlightBId}`,
          sequence: 0,
          timeMins: execMins,
          timeLabel: formatMinutesToTime(execMins),
          type: 'RECOVERY_ACTION',
          stageKind: 'RECOVERY_ACTION',
          severity: 'recovery',
          title: `Recovery: Swap ${action.tailAId} ↔ ${action.tailBId} at ${action.hubAirportId}`,
          description: `Aircraft rotation suffixes swapped at ${action.hubAirportId} (${action.fromFlightAId} & ${action.fromFlightBId}) to absorb upstream turnaround delay.`,
          airportId: action.hubAirportId,
          flightId: action.fromFlightAId,
          tailId: action.tailBId,
          sourceTailId: action.tailAId,
        });
      } else if (action.type === 'HOLD_CONNECTING_FLIGHT') {
        const recF = recoveredById.get(action.flightId);
        const execMins = recF ? recF.scheduledDepMins : 0;
        events.push({
          id: `evt-rec-${idx}-${action.flightId}`,
          sequence: 0,
          timeMins: Math.max(0, execMins),
          timeLabel: formatMinutesToTime(Math.max(0, execMins)),
          type: 'RECOVERY_ACTION',
          stageKind: 'RECOVERY_ACTION',
          severity: 'recovery',
          title: `Recovery: Hold ${action.flightId} +${action.holdMinutes}m for ${action.connectionId}`,
          description: `Outbound ${action.flightId} held ${action.holdMinutes}m at ${recF?.origin ?? ''} to protect connecting passengers on ${action.connectionId}.`,
          airportId: recF?.origin ?? '',
          targetAirportId: recF?.destination,
          flightId: action.flightId,
          connectionId: action.connectionId,
          delayMinutes: action.holdMinutes,
        });
      }
    });
  }

  // Enforce causal monotonicity: an effect cannot precede the event that triggered it
  const eventById = new Map<string, DominoTimelineEvent>();
  for (const evt of events) {
    eventById.set(evt.id, evt);
  }
  for (let pass = 0; pass < 3; pass++) {
    for (const evt of events) {
      if (!evt.causedByEventId) continue;
      const cause = eventById.get(evt.causedByEventId);
      if (cause && evt.timeMins < cause.timeMins) {
        evt.timeMins = cause.timeMins;
        evt.timeLabel = formatMinutesToTime(evt.timeMins);
      }
    }
  }

  const stagePriority: Record<DominoTimelineEvent['stageKind'], number> = {
    ORIGINAL_EVENT: 0,
    RECOVERY_ACTION: 1,
    PREDICTED_IMPACT: 2,
  };

  events.sort((a, b) => {
    if (a.timeMins !== b.timeMins) return a.timeMins - b.timeMins;
    if (stagePriority[a.stageKind] !== stagePriority[b.stageKind]) {
      return stagePriority[a.stageKind] - stagePriority[b.stageKind];
    }
    return a.id.localeCompare(b.id);
  });

  return events.map((evt, idx) => ({
    ...evt,
    sequence: idx + 1,
  }));
}

function renumberTailLegs(flights: RawFlight[]): void {
  const byTail = new Map<string, RawFlight[]>();
  for (const f of flights) {
    const list = byTail.get(f.tail_id) ?? [];
    list.push(f);
    byTail.set(f.tail_id, list);
  }
  for (const list of byTail.values()) {
    list.sort((a, b) => a.leg_order - b.leg_order || parseTimeToMinutes(a.dep) - parseTimeToMinutes(b.dep));
    for (let i = 0; i < list.length; i++) {
      list[i].leg_order = i + 1;
      if (i === 0) {
        list[i].turnaround_before_min = null;
      } else {
        const prevArr = parseTimeToMinutes(list[i - 1].arr);
        const curDep = parseTimeToMinutes(list[i].dep);
        list[i].turnaround_before_min = Math.max(0, curDep - prevArr);
      }
    }
  }
}

function applySingleAction(
  dataset: FlightNetworkDataset,
  action: RecoveryAction,
  flightHoldMap: Map<string, { holdMinutes: number; connectionIds: string[] }>
): { reassignedCount: number; rescheduledCount: number; touchedCrews: Set<string>; touchedTails: Set<string> } {
  const touchedCrews = new Set<string>();
  const touchedTails = new Set<string>();

  if (action.type === 'DEPLOY_SPARE_TAIL_SUFFIX') {
    const spareIdx = dataset.spare_aircraft.findIndex((s) => s.tail_id === action.spareTailId);
    if (spareIdx === -1) {
      throw new Error(`Spare aircraft "${action.spareTailId}" is unavailable or already deployed.`);
    }
    const spare = dataset.spare_aircraft[spareIdx];

    const fromFlight = dataset.flights.find(
      (f) => f.flight_id === action.fromFlightId && f.tail_id === action.targetTailId
    );
    if (!fromFlight) {
      throw new Error(
        `Flight "${action.fromFlightId}" not found on target aircraft "${action.targetTailId}".`
      );
    }
    if (fromFlight.origin !== spare.base) {
      throw new Error(
        `Spare aircraft ${spare.tail_id} is stationed at ${spare.base} and cannot originate ${fromFlight.flight_id} from ${fromFlight.origin}.`
      );
    }

    const suffixLegs = dataset.flights
      .filter((f) => f.tail_id === action.targetTailId && f.leg_order >= fromFlight.leg_order)
      .sort((a, b) => a.leg_order - b.leg_order);

    const spareAvailMins = parseTimeToMinutes(spare.available_from);
    const firstDepMins = parseTimeToMinutes(suffixLegs[0].dep);
    if (firstDepMins < spareAvailMins) {
      throw new Error(
        `Spare ${spare.tail_id} is available from ${spare.available_from}, after ${suffixLegs[0].flight_id} departs (${suffixLegs[0].dep}).`
      );
    }

    for (const leg of suffixLegs) {
      if (leg.pax > spare.seats) {
        throw new Error(
          `Flight ${leg.flight_id} carries ${leg.pax} pax, exceeding ${spare.tail_id} capacity (${spare.seats} seats).`
        );
      }
    }

    const movedIds = new Set(suffixLegs.map((l) => l.flight_id));
    for (let i = 0; i < suffixLegs.length; i++) {
      suffixLegs[i].tail_id = spare.tail_id;
      suffixLegs[i].leg_order = i + 1;
    }
    renumberTailLegs(dataset.flights);

    // Remove deployed spare from standby pool
    dataset.spare_aircraft.splice(spareIdx, 1);

    // Update original crews and assign standby reserve crew at spare.base
    const updatedCrews: RawCrew[] = [];
    for (const crew of dataset.crews) {
      if (crew.tail_id === action.targetTailId) {
        const remainingIds = crew.flight_ids.filter((fid) => !movedIds.has(fid));
        if (remainingIds.length > 0) {
          crew.flight_ids = remainingIds;
          updatedCrews.push(crew);
          touchedCrews.add(crew.crew_id);
        }
      } else {
        updatedCrews.push(crew);
      }
    }

    const reserveDutyStartMins = Math.max(spareAvailMins, firstDepMins - 45);
    const reserveCrewId = `CR-SP-${spare.tail_id.replace('VT-', '')}`;
    updatedCrews.push({
      crew_id: reserveCrewId,
      tail_id: spare.tail_id,
      base: spare.base,
      duty_start: formatMinutesToTime(reserveDutyStartMins),
      max_duty_mins: 600,
      flight_ids: suffixLegs.map((l) => l.flight_id),
    });
    dataset.crews = updatedCrews;
    touchedCrews.add(reserveCrewId);
    touchedTails.add(action.targetTailId);
    touchedTails.add(spare.tail_id);

    return {
      reassignedCount: suffixLegs.length,
      rescheduledCount: 0,
      touchedCrews,
      touchedTails,
    };
  }

  if (action.type === 'SWAP_TAIL_SUFFIXES') {
    if (action.tailAId === action.tailBId) {
      throw new Error('Cannot swap an aircraft rotation with itself.');
    }

    const fromA = dataset.flights.find(
      (f) => f.flight_id === action.fromFlightAId && f.tail_id === action.tailAId
    );
    const fromB = dataset.flights.find(
      (f) => f.flight_id === action.fromFlightBId && f.tail_id === action.tailBId
    );
    if (!fromA || !fromB) {
      throw new Error('Swap references unknown flight or mismatched tail.');
    }
    if (fromA.origin !== action.hubAirportId || fromB.origin !== action.hubAirportId) {
      throw new Error(
        `Both swapped legs must originate at hub ${action.hubAirportId} (${fromA.origin} vs ${fromB.origin}).`
      );
    }

    const suffixA = dataset.flights
      .filter((f) => f.tail_id === action.tailAId && f.leg_order >= fromA.leg_order)
      .sort((a, b) => a.leg_order - b.leg_order);
    const suffixB = dataset.flights
      .filter((f) => f.tail_id === action.tailBId && f.leg_order >= fromB.leg_order)
      .sort((a, b) => a.leg_order - b.leg_order);

    for (const f of suffixA) f.tail_id = action.tailBId;
    for (const f of suffixB) f.tail_id = action.tailAId;

    // Preserve prefix + swapped suffix order via temporary synthetic leg_order offsets
    const newA = [
      ...dataset.flights
        .filter((f) => f.tail_id === action.tailAId && !suffixB.some((s) => s.flight_id === f.flight_id))
        .sort((a, b) => a.leg_order - b.leg_order),
      ...suffixB,
    ];
    newA.forEach((f, idx) => {
      f.leg_order = idx + 1;
    });

    const newB = [
      ...dataset.flights
        .filter((f) => f.tail_id === action.tailBId && !suffixA.some((s) => s.flight_id === f.flight_id))
        .sort((a, b) => a.leg_order - b.leg_order),
      ...suffixA,
    ];
    newB.forEach((f, idx) => {
      f.leg_order = idx + 1;
    });

    renumberTailLegs(dataset.flights);

    for (const crew of dataset.crews) {
      if (crew.tail_id === action.tailAId) {
        crew.flight_ids = newA.map((f) => f.flight_id);
        touchedCrews.add(crew.crew_id);
      } else if (crew.tail_id === action.tailBId) {
        crew.flight_ids = newB.map((f) => f.flight_id);
        touchedCrews.add(crew.crew_id);
      }
    }
    touchedTails.add(action.tailAId);
    touchedTails.add(action.tailBId);

    return {
      reassignedCount: suffixA.length + suffixB.length,
      rescheduledCount: 0,
      touchedCrews,
      touchedTails,
    };
  }

  // HOLD_CONNECTING_FLIGHT: track as separate operational earliest-release constraint (STD/STA remain immutable)
  if (!Number.isInteger(action.holdMinutes) || action.holdMinutes <= 0 || action.holdMinutes > 180) {
    throw new Error('Hold duration must be a positive integer between 1 and 180 minutes.');
  }

  const flight = dataset.flights.find((f) => f.flight_id === action.flightId);
  if (!flight) {
    throw new Error(`Flight "${action.flightId}" not found.`);
  }

  const existingHold = flightHoldMap.get(flight.flight_id);
  const totalHoldMinutes = (existingHold?.holdMinutes ?? 0) + action.holdMinutes;
  const heldArrMins = parseTimeToMinutes(flight.arr) + totalHoldMinutes;
  if (heldArrMins >= 1440) {
    throw new Error(
      `Holding ${flight.flight_id} by ${totalHoldMinutes}m pushes operational release arrival past 23:59 operating day.`
    );
  }

  const connectionIds = existingHold ? [...existingHold.connectionIds] : [];
  if (action.connectionId && !connectionIds.includes(action.connectionId)) {
    connectionIds.push(action.connectionId);
  }
  flightHoldMap.set(flight.flight_id, { holdMinutes: totalHoldMinutes, connectionIds });

  touchedTails.add(flight.tail_id);
  for (const crew of dataset.crews) {
    if (crew.tail_id === flight.tail_id) {
      touchedCrews.add(crew.crew_id);
    }
  }

  return {
    reassignedCount: 0,
    rescheduledCount: 1,
    touchedCrews,
    touchedTails,
  };
}

/**
 * Validates a sequence of recovery actions against all aviation constraints:
 * 1. Dataset structural integrity & no aircraft teleportation (origin === prev.destination)
 * 2. Airport closure compliance (no dep or arr inside closure window)
 * 3. Minimum turnaround enforcement (>= min_turnaround_minutes)
 * 4. Crew duty legality (no touched crew exceeds max_duty_mins; no overall violation increase)
 */
export function validateRecoveryActions(
  baseDataset: FlightNetworkDataset,
  closures: AirportClosureInput[],
  actions: RecoveryAction[],
  disruptedResult?: SimulationResult
): RecoveryValidationResult {
  if (actions.length === 0) {
    return {
      valid: false,
      reasons: ['At least one recovery action is required.'],
      checks: [],
      recoveredDataset: null,
      simulationResult: null,
      reassignedFlightsCount: 0,
      rescheduledFlightsCount: 0,
    };
  }

  const candidateDataset = structuredClone(baseDataset) as FlightNetworkDataset;
  const reasons: string[] = [];
  const touchedCrews = new Set<string>();
  const touchedTails = new Set<string>();
  const flightHoldMap = new Map<string, { holdMinutes: number; connectionIds: string[] }>();
  let reassignedFlightsCount = 0;
  let rescheduledFlightsCount = 0;

  try {
    for (const action of actions) {
      const outcome = applySingleAction(candidateDataset, action, flightHoldMap);
      reassignedFlightsCount += outcome.reassignedCount;
      rescheduledFlightsCount += outcome.rescheduledCount;
      outcome.touchedCrews.forEach((c) => touchedCrews.add(c));
      outcome.touchedTails.forEach((t) => touchedTails.add(t));
    }
  } catch (err) {
    return {
      valid: false,
      reasons: [err instanceof Error ? err.message : 'Invalid recovery action.'],
      checks: [
        {
          name: 'Action Preconditions',
          passed: false,
          detail: err instanceof Error ? err.message : 'Precondition check failed.',
        },
      ],
      recoveredDataset: null,
      simulationResult: null,
      reassignedFlightsCount: 0,
      rescheduledFlightsCount: 0,
    };
  }

  let validatedDataset: FlightNetworkDataset;
  try {
    validatedDataset = validateFlightNetworkDataset(candidateDataset);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Dataset constraint validation failed.';
    return {
      valid: false,
      reasons: [msg],
      checks: [
        {
          name: 'Aircraft Rotation & Continuity',
          passed: false,
          detail: msg,
        },
      ],
      recoveredDataset: null,
      simulationResult: null,
      reassignedFlightsCount,
      rescheduledFlightsCount,
    };
  }

  const flightHolds: FlightHoldConstraint[] = Array.from(flightHoldMap.entries()).map(
    ([flightId, entry]) => ({
      flightId,
      holdMinutes: entry.holdMinutes,
      connectionId: entry.connectionIds.join(', '),
    })
  );

  let simResult: SimulationResult;
  try {
    simResult = runSimulation(
      validatedDataset,
      closures,
      flightHolds.length > 0 ? { flightHolds } : undefined
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Simulation failed on recovered schedule.';
    return {
      valid: false,
      reasons: [msg],
      checks: [
        {
          name: 'Simulation Convergence',
          passed: false,
          detail: msg,
        },
      ],
      recoveredDataset: null,
      simulationResult: null,
      reassignedFlightsCount,
      rescheduledFlightsCount,
    };
  }

  const minTurn = validatedDataset.meta.min_turnaround_minutes;
  const turnaroundViolations = simResult.flights.filter(
    (f) => f.turnaroundBeforeActualMins !== null && f.turnaroundBeforeActualMins < minTurn
  );

  // Check closure compliance explicitly
  const closureViolations = simResult.flights.filter((f) =>
    simResult.closures.some(
      (c) =>
        (c.airportId === f.origin && f.actualDepMins >= c.startMins && f.actualDepMins < c.endMins) ||
        (c.airportId === f.destination && f.actualArrMins >= c.startMins && f.actualArrMins < c.endMins)
    )
  );

  // Check crew legality on touched crews + overall count
  const touchedCrewViolations = simResult.crews.filter(
    (c) => touchedCrews.has(c.crewId) && c.exceedsLimit
  );
  const overallViolationsIncreased =
    disruptedResult !== undefined &&
    simResult.kpis.crewViolationsCount > disruptedResult.kpis.crewViolationsCount;

  // Check turnaround feasibility (e.g. if a flight hold caused severe downstream delay on non-target tail? Handled in simulation + crew/score)
  const checks: ConstraintCheckItem[] = [
    {
      name: 'Rotation Continuity (No Teleportation)',
      passed: true,
      detail: 'All active tails maintain unbroken origin-to-destination leg sequencing.',
    },
    {
      name: `Minimum ${minTurn}m Turnaround`,
      passed: turnaroundViolations.length === 0,
      detail:
        turnaroundViolations.length === 0
          ? `All ground transitions >= ${minTurn}m.`
          : `${turnaroundViolations.length} leg(s) violate minimum turnaround.`,
    },
    {
      name: 'Airport Closure Compliance',
      passed: closureViolations.length === 0,
      detail:
        closureViolations.length === 0
          ? 'Zero departures or arrivals inside active closure windows.'
          : `${closureViolations.length} leg(s) intersect closure windows.`,
    },
    {
      name: 'Crew Duty Legality',
      passed: touchedCrewViolations.length === 0 && !overallViolationsIncreased,
      detail:
        touchedCrewViolations.length > 0
          ? `Illegal crew duty on ${touchedCrewViolations.map((c) => `${c.crewId} (+${c.overtimeMins}m)`).join(', ')}.`
          : overallViolationsIncreased
            ? 'Strategy introduces additional network crew duty violations.'
            : simResult.kpis.crewViolationsCount === 0
              ? 'All network crews operate within max_duty_mins.'
              : `Recovered crews legal (${simResult.kpis.crewViolationsCount} unrelated violation(s) remain).`,
    },
  ];

  for (const chk of checks) {
    if (!chk.passed) reasons.push(chk.detail);
  }

  return {
    valid: reasons.length === 0,
    reasons,
    checks,
    recoveredDataset: reasons.length === 0 ? validatedDataset : null,
    simulationResult: reasons.length === 0 ? simResult : null,
    reassignedFlightsCount,
    rescheduledFlightsCount,
  };
}

export function computeBeforeAfterComparison(
  disruptedResult: SimulationResult,
  recoveredResult: SimulationResult
): BeforeAfterComparison {
  const dk = disruptedResult.kpis;
  const rk = recoveredResult.kpis;

  const disruptedFlightMap = new Map<string, FlightSimulationResult>();
  for (const f of disruptedResult.flights) {
    disruptedFlightMap.set(f.flightId, f);
  }

  let flightsRecoveredCount = 0;
  let flightsRestoredOnTimeCount = 0;

  for (const rf of recoveredResult.flights) {
    const df = disruptedFlightMap.get(rf.flightId);
    if (!df) continue;
    if (df.delayMinutes > 0 && rf.delayMinutes < df.delayMinutes) {
      flightsRecoveredCount += 1;
      if (rf.delayMinutes === 0) {
        flightsRestoredOnTimeCount += 1;
      }
    }
  }

  return {
    disrupted: {
      totalDelayMinutes: dk.totalDelayMinutes,
      delayedFlights: dk.delayedFlights,
      cancelledFlights: 0,
      strandedPassengers: dk.strandedPassengers,
      failedConnectionsCount: dk.failedConnectionsCount,
      crewViolationsCount: dk.crewViolationsCount,
      averageAircraftUtilisationPct: dk.averageAircraftUtilisationPct,
    },
    recovered: {
      totalDelayMinutes: rk.totalDelayMinutes,
      delayedFlights: rk.delayedFlights,
      cancelledFlights: 0,
      strandedPassengers: rk.strandedPassengers,
      failedConnectionsCount: rk.failedConnectionsCount,
      crewViolationsCount: rk.crewViolationsCount,
      averageAircraftUtilisationPct: rk.averageAircraftUtilisationPct,
    },
    deltas: {
      delayMinutesSaved: dk.totalDelayMinutes - rk.totalDelayMinutes,
      delayMinutesPctReduction: pctReduction(dk.totalDelayMinutes, rk.totalDelayMinutes),
      delayedFlightsReduced: dk.delayedFlights - rk.delayedFlights,
      delayedFlightsPctReduction: pctReduction(dk.delayedFlights, rk.delayedFlights),
      cancelledFlightsDelta: 0,
      strandedPassengersSaved: dk.strandedPassengers - rk.strandedPassengers,
      strandedPassengersPctReduction: pctReduction(dk.strandedPassengers, rk.strandedPassengers),
      failedConnectionsSaved: dk.failedConnectionsCount - rk.failedConnectionsCount,
      crewViolationsReduced: dk.crewViolationsCount - rk.crewViolationsCount,
      crewViolationsPctReduction: pctReduction(dk.crewViolationsCount, rk.crewViolationsCount),
      aircraftUtilisationDeltaPct: round2(
        rk.averageAircraftUtilisationPct - dk.averageAircraftUtilisationPct
      ),
      flightsRecoveredCount,
      flightsRestoredOnTimeCount,
    },
  };
}

/**
 * Transparent, deterministic Recovery Scorecard (0 - 100):
 * - Delay Reduction (0-30): 20 * delayMinsRatio + 10 * flightsRecoveredRatio
 * - Passenger Protection (0-30): Unified weighted passenger-burden reduction
 *     (strandedPassengers * 10 + delayedPassengers) across both stranded and delayed pax
 * - Crew Legality (0-20): Full 20 for zero violations & zero recovery-induced <=20m buffers;
 *     strict deductions (no floor) for unresolved crew duty violations or overtime
 * - Aircraft Feasibility (0-10): Deducts 0.5 only for recovery-induced <=30m tight turnarounds
 *     (unchanged pre-existing constraints are not penalized)
 * - Operational Simplicity (0-10): 10 - (actionsCount - 1) * 1.0 - min(2, touchedLegs * 0.2)
 */
export function computeRecoveryScorecard(
  disruptedResult: SimulationResult,
  recoveredResult: SimulationResult,
  comparison: BeforeAfterComparison,
  actionsCount: number,
  reassignedFlightsCount: number,
  rescheduledFlightsCount: number
): RecoveryScoreBreakdown {
  const dk = disruptedResult.kpis;
  const rk = recoveredResult.kpis;

  let delayReductionScore = 0;
  if (dk.totalDelayMinutes > 0) {
    const minsRatio = Math.max(
      0,
      Math.min(1, comparison.deltas.delayMinutesSaved / dk.totalDelayMinutes)
    );
    const flightsRatio =
      dk.delayedFlights > 0
        ? Math.max(0, Math.min(1, comparison.deltas.flightsRecoveredCount / dk.delayedFlights))
        : 0;
    delayReductionScore = round1(minsRatio * 20 + flightsRatio * 10);
  } else {
    delayReductionScore = 30;
  }

  // Unified weighted passenger protection curve (stranded = 10x, delayed = 1x)
  const STRANDED_WEIGHT = 10;
  const disruptedWeightedPax = dk.strandedPassengers * STRANDED_WEIGHT + dk.delayedPassengers;
  const recoveredWeightedPax = rk.strandedPassengers * STRANDED_WEIGHT + rk.delayedPassengers;
  let passengerProtectionScore = 0;
  if (disruptedWeightedPax > 0) {
    const burdenRatio = Math.max(
      0,
      Math.min(1, (disruptedWeightedPax - recoveredWeightedPax) / disruptedWeightedPax)
    );
    passengerProtectionScore = round1(burdenRatio * 30);
  } else {
    passengerProtectionScore = recoveredWeightedPax > 0 ? 0 : 30;
  }

  // Crew legality: strict unresolved penalties; zero penalty for unchanged pre-existing buffers
  const disruptedCrewMap = new Map(disruptedResult.crews.map((c) => [c.crewId, c]));
  let crewLegalityScore = 20;
  let inducedWatchCrews = 0;
  if (rk.crewViolationsCount > 0) {
    const countPenalty = rk.crewViolationsCount * 10;
    const overtimePenalty = Math.min(8, rk.totalCrewOvertimeMinutes / 10);
    crewLegalityScore = round1(Math.max(0, 20 - countPenalty - overtimePenalty));
  } else {
    inducedWatchCrews = recoveredResult.crews.filter((c) => {
      if (c.exceedsLimit || c.maxDutyMins - c.actualDutyMins > 20) return false;
      const prev = disruptedCrewMap.get(c.crewId);
      if (!prev) return true;
      const prevMargin = prev.maxDutyMins - prev.actualDutyMins;
      const curMargin = c.maxDutyMins - c.actualDutyMins;
      const rosterChanged =
        prev.flightIds.length !== c.flightIds.length ||
        prev.flightIds.some((fid, idx) => fid !== c.flightIds[idx]);
      return curMargin < prevMargin || rosterChanged;
    }).length;
    crewLegalityScore = round1(Math.max(16, 20 - inducedWatchCrews));
  }

  // Aircraft feasibility: penalize only recovery-induced tight (<=30m) turnarounds
  const disruptedFlightMap = new Map(disruptedResult.flights.map((f) => [f.flightId, f]));
  const inducedTightTurnarounds = recoveredResult.flights.filter((rf) => {
    if (rf.turnaroundBeforeActualMins === null || rf.turnaroundBeforeActualMins > 30) {
      return false;
    }
    const df = disruptedFlightMap.get(rf.flightId);
    if (!df) return true;
    const unchangedPreExisting =
      df.tailId === rf.tailId &&
      df.actualDepMins === rf.actualDepMins &&
      df.turnaroundBeforeActualMins === rf.turnaroundBeforeActualMins;
    return !unchangedPreExisting;
  }).length;
  const aircraftFeasibilityScore = round1(Math.max(6, 10 - inducedTightTurnarounds * 0.5));

  const totalTouchedLegs = reassignedFlightsCount + rescheduledFlightsCount;
  const simplicityRaw = 10 - (actionsCount - 1) * 1.0 - Math.min(2, totalTouchedLegs * 0.2);
  const operationalSimplicityScore = round1(Math.max(3, Math.min(10, simplicityRaw)));

  const totalScore = round1(
    delayReductionScore +
      passengerProtectionScore +
      crewLegalityScore +
      aircraftFeasibilityScore +
      operationalSimplicityScore
  );

  const formulaNotes = [
    `Delay Reduction (${delayReductionScore}/30): 20 × (${comparison.deltas.delayMinutesSaved}m saved / ${dk.totalDelayMinutes}m) + 10 × (${comparison.deltas.flightsRecoveredCount} recovered / ${dk.delayedFlights} delayed).`,
    `Passenger Protection (${passengerProtectionScore}/30): Unified burden reduction (${dk.strandedPassengers} stranded×10 + ${dk.delayedPassengers} delayed → ${rk.strandedPassengers} stranded×10 + ${rk.delayedPassengers} delayed).`,
    rk.crewViolationsCount > 0
      ? `Crew Legality (${crewLegalityScore}/20): Penalized for ${rk.crewViolationsCount} unresolved crew violation(s) and +${rk.totalCrewOvertimeMinutes}m overtime.`
      : `Crew Legality (${crewLegalityScore}/20): Zero violations (${inducedWatchCrews} recovery-induced <=20m duty margin${inducedWatchCrews === 1 ? '' : 's'}).`,
    `Aircraft Feasibility (${aircraftFeasibilityScore}/10): Rotation continuity & >=30m turnarounds verified (${inducedTightTurnarounds} recovery-induced <=30m turnaround${inducedTightTurnarounds === 1 ? '' : 's'}).`,
    `Operational Simplicity (${operationalSimplicityScore}/10): Weighs action count (${actionsCount}) and touched legs (${totalTouchedLegs}).`,
  ];

  return {
    delayReductionScore,
    passengerProtectionScore,
    crewLegalityScore,
    aircraftFeasibilityScore,
    operationalSimplicityScore,
    totalScore,
    formulaNotes,
  };
}

function describeAction(action: RecoveryAction): string {
  if (action.type === 'DEPLOY_SPARE_TAIL_SUFFIX') {
    return `Deploy standby spare ${action.spareTailId} to cover ${action.targetTailId} from ${action.fromFlightId} onward`;
  }
  if (action.type === 'SWAP_TAIL_SUFFIXES') {
    return `Swap aircraft rotations at ${action.hubAirportId}: ${action.tailAId} (${action.fromFlightAId}+) ↔ ${action.tailBId} (${action.fromFlightBId}+)`;
  }
  return `Hold ${action.flightId} by +${action.holdMinutes}m to protect connection ${action.connectionId}`;
}

/**
 * Generates, validates, and scores deterministic recovery strategies for a disrupted scenario.
 * Returns only constraint-validated strategies that improve operational outcomes, plus any rejected count.
 */
export function evaluateRecoveryStrategies(
  baseDataset: FlightNetworkDataset,
  closures: AirportClosureInput[],
  disruptedResult: SimulationResult
): {
  strategies: RecoveryStrategyCandidate[];
  rejectedCount: number;
} {
  if (
    closures.length === 0 ||
    (disruptedResult.kpis.delayedFlights === 0 &&
      disruptedResult.kpis.failedConnectionsCount === 0 &&
      disruptedResult.kpis.crewViolationsCount === 0)
  ) {
    return { strategies: [], rejectedCount: 0 };
  }

  interface RawCandidateProposal {
    id: string;
    title: string;
    category: RecoveryStrategyCategory;
    summary: string;
    rationale: string;
    actions: RecoveryAction[];
  }

  const proposals: RawCandidateProposal[] = [];
  const delayedFlightMap = new Map<string, FlightSimulationResult>();
  const disruptedByTail = new Map<string, FlightSimulationResult[]>();
  const crewViolationByTail = new Set(disruptedResult.crewViolations.map((c) => c.tailId));

  for (const f of disruptedResult.flights) {
    if (f.delayMinutes > 0) delayedFlightMap.set(f.flightId, f);
    const list = disruptedByTail.get(f.tailId) ?? [];
    list.push(f);
    disruptedByTail.set(f.tailId, list);
  }
  for (const list of disruptedByTail.values()) {
    list.sort((a, b) => a.legOrder - b.legOrder);
  }

  // 1. Standby Spare Aircraft Deployments (single spare)
  const spareProposalsBySpareId = new Map<string, RawCandidateProposal[]>();
  for (const spare of baseDataset.spare_aircraft) {
    const spareAvailMins = parseTimeToMinutes(spare.available_from);
    const listForSpare: RawCandidateProposal[] = [];

    for (const [tailId, legs] of disruptedByTail.entries()) {
      for (const leg of legs) {
        if (leg.origin !== spare.base) continue;
        if (leg.scheduledDepMins < spareAvailMins) continue;

        const hasCascadeDelay = leg.delayReasons.includes('TURNAROUND_PROPAGATION');
        const tailHasViolation = crewViolationByTail.has(tailId);
        if (!hasCascadeDelay && !tailHasViolation) continue;
        if (leg.delayMinutes === 0 && !tailHasViolation) continue;

        const action: DeploySpareTailAction = {
          type: 'DEPLOY_SPARE_TAIL_SUFFIX',
          spareTailId: spare.tail_id,
          targetTailId: tailId,
          fromFlightId: leg.flightId,
        };
        const suffixCount = legs.length - leg.legOrder + 1;
        const prop: RawCandidateProposal = {
          id: `spare-${spare.tail_id}-${leg.flightId}`,
          title: `Spare Dispatch: ${spare.tail_id} → ${leg.flightId}+`,
          category: 'SPARE_AIRCRAFT',
          summary: `Assign ${spare.base}-based spare ${spare.tail_id} to take over ${tailId} from ${leg.flightId} (${suffixCount} leg${suffixCount > 1 ? 's' : ''}).`,
          rationale: `Breaks incoming turnaround cascade on ${tailId} at ${spare.base} and relieves original crew duty load.`,
          actions: [action],
        };
        proposals.push(prop);
        listForSpare.push(prop);
      }
    }
    spareProposalsBySpareId.set(spare.tail_id, listForSpare);
  }

  // 2. Active Tail Rotation Swaps at Hubs (where an earlier-ready donor tail covers a delayed tail's suffix)
  const swapHubs = ['BOM', 'DEL', 'BLR', 'HYD', 'MAA', 'CCU'];
  const minTurn = baseDataset.meta.min_turnaround_minutes;
  for (const hub of swapHubs) {
    const delayedCandidates: Array<{ leg: FlightSimulationResult; readyMins: number }> = [];
    const donorCandidates: Array<{ leg: FlightSimulationResult; readyMins: number }> = [];

    for (const [, legs] of disruptedByTail.entries()) {
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        if (leg.origin !== hub || leg.legOrder <= 1) continue;
        const prev = legs[i - 1];
        if (!prev) continue;
        const readyMins = prev.actualArrMins + minTurn;
        if (leg.delayReasons.includes('TURNAROUND_PROPAGATION')) {
          delayedCandidates.push({ leg, readyMins });
        } else if (leg.delayMinutes === 0 && leg.scheduledDepMins - prev.actualArrMins >= 45) {
          donorCandidates.push({ leg, readyMins });
        }
      }
    }

    for (const delayed of delayedCandidates.slice(0, 6)) {
      for (const donor of donorCandidates.slice(0, 6)) {
        if (delayed.leg.tailId === donor.leg.tailId) continue;
        if (donor.readyMins >= delayed.readyMins) continue;

        const action: SwapTailSuffixesAction = {
          type: 'SWAP_TAIL_SUFFIXES',
          tailAId: delayed.leg.tailId,
          fromFlightAId: delayed.leg.flightId,
          tailBId: donor.leg.tailId,
          fromFlightBId: donor.leg.flightId,
          hubAirportId: hub,
        };
        proposals.push({
          id: `swap-${hub}-${delayed.leg.flightId}-${donor.leg.flightId}`,
          title: `Hub Tail Swap (${hub}): ${delayed.leg.tailId} ↔ ${donor.leg.tailId}`,
          category: 'TAIL_SWAP',
          summary: `Swap remaining rotations at ${hub} between delayed ${delayed.leg.tailId} (${delayed.leg.flightId}+) and earlier-ready ${donor.leg.tailId} (${donor.leg.flightId}+).`,
          rationale: `Uses ${donor.leg.tailId}'s earlier availability at ${hub} to launch ${delayed.leg.flightId} closer to schedule.`,
          actions: [action],
        });
      }
    }
  }

  // 3. Connection Protection Holds (earliest-release hold beyond STD to save high-impact missed connections)
  const sortedFailedConns = [...disruptedResult.failedConnections].sort(
    (a, b) => b.passengers - a.passengers || a.shortfallMinutes - b.shortfallMinutes
  );

  const holdActions: HoldConnectingFlightAction[] = [];
  for (const conn of sortedFailedConns.slice(0, 5)) {
    const toFlight = disruptedResult.flights.find((f) => f.flightId === conn.toFlightId);
    const requiredHoldMinutes = (toFlight ? toFlight.delayMinutes : 0) + conn.shortfallMinutes;
    if (conn.shortfallMinutes <= 0 || requiredHoldMinutes <= 0 || requiredHoldMinutes > 120) {
      continue;
    }
    const action: HoldConnectingFlightAction = {
      type: 'HOLD_CONNECTING_FLIGHT',
      connectionId: conn.connectionId,
      flightId: conn.toFlightId,
      holdMinutes: requiredHoldMinutes,
    };
    holdActions.push(action);
    proposals.push({
      id: `hold-${conn.connectionId}-${conn.toFlightId}`,
      title: `Protect ${conn.connectionId}: Hold ${conn.toFlightId} (+${requiredHoldMinutes}m)`,
      category: 'CONNECTION_HOLD',
      summary: `Hold ${conn.toFlightId} at ${conn.airport} to STD+${requiredHoldMinutes}m to save ${conn.passengers} connecting passengers from ${conn.fromFlightId}.`,
      rationale: `Prioritizes passenger connection integrity on ${conn.connectionId} with minimal outbound delay trade-off.`,
      actions: [action],
    });
  }

  // Evaluate single-action proposals first
  let rejectedCount = 0;
  const validCandidates: RecoveryStrategyCandidate[] = [];
  const bestSpareById = new Map<string, RecoveryStrategyCandidate>();
  let bestHoldCandidate: RecoveryStrategyCandidate | null = null;

  const evaluateProposal = (prop: RawCandidateProposal): RecoveryStrategyCandidate | null => {
    const validation = validateRecoveryActions(baseDataset, closures, prop.actions, disruptedResult);
    if (!validation.valid || !validation.simulationResult) {
      rejectedCount += 1;
      return null;
    }

    const comparison = computeBeforeAfterComparison(disruptedResult, validation.simulationResult);
    if (prop.category === 'TAIL_SWAP' && comparison.deltas.delayMinutesSaved <= 0) {
      return null;
    }
    const hasNetImprovement =
      comparison.deltas.delayMinutesSaved > 0 ||
      comparison.deltas.strandedPassengersSaved > 0 ||
      comparison.deltas.crewViolationsReduced > 0 ||
      comparison.deltas.delayedFlightsReduced > 0;

    if (!hasNetImprovement) {
      return null;
    }

    const scorecard = computeRecoveryScorecard(
      disruptedResult,
      validation.simulationResult,
      comparison,
      prop.actions.length,
      validation.reassignedFlightsCount,
      validation.rescheduledFlightsCount
    );

    return {
      id: prop.id,
      title: prop.title,
      category: prop.category,
      summary: prop.summary,
      rationale: prop.rationale,
      actions: prop.actions,
      actionDescriptions: prop.actions.map(describeAction),
      validation,
      simulationResult: validation.simulationResult,
      comparison,
      scorecard,
      recommended: false,
    };
  };

  for (const prop of proposals) {
    const cand = evaluateProposal(prop);
    if (!cand) continue;
    validCandidates.push(cand);

    if (cand.category === 'SPARE_AIRCRAFT' && cand.actions[0].type === 'DEPLOY_SPARE_TAIL_SUFFIX') {
      const spId = cand.actions[0].spareTailId;
      const prev = bestSpareById.get(spId);
      if (!prev || cand.scorecard.totalScore > prev.scorecard.totalScore) {
        bestSpareById.set(spId, cand);
      }
    }
    if (cand.category === 'CONNECTION_HOLD') {
      if (!bestHoldCandidate || cand.scorecard.totalScore > bestHoldCandidate.scorecard.totalScore) {
        bestHoldCandidate = cand;
      }
    }
  }

  // 4. Composite Recovery: Dual-Spare Dispatch or Best Spare + Connection Hold
  const bestSpares = Array.from(bestSpareById.values());
  if (bestSpares.length >= 2) {
    const s1 = bestSpares[0];
    const s2 = bestSpares[1];
    if (
      s1.actions[0].type === 'DEPLOY_SPARE_TAIL_SUFFIX' &&
      s2.actions[0].type === 'DEPLOY_SPARE_TAIL_SUFFIX' &&
      s1.actions[0].targetTailId !== s2.actions[0].targetTailId
    ) {
      const comp = evaluateProposal({
        id: `comp-dual-spare-${s1.actions[0].spareTailId}-${s2.actions[0].spareTailId}`,
        title: `Dual-Hub Spare Recovery (${s1.actions[0].spareTailId} + ${s2.actions[0].spareTailId})`,
        category: 'COMPOSITE_RECOVERY',
        summary: `Coordinate both standby aircraft (${s1.actions[0].spareTailId} on ${s1.actions[0].fromFlightId}+ and ${s2.actions[0].spareTailId} on ${s2.actions[0].fromFlightId}+).`,
        rationale: 'Combines independent hub spare deployments to contain network-wide delay cascade.',
        actions: [...s1.actions, ...s2.actions],
      });
      if (comp) validCandidates.push(comp);
    }
  }

  if (bestSpares.length >= 1 && bestHoldCandidate) {
    const topSpare = bestSpares.sort((a, b) => b.scorecard.totalScore - a.scorecard.totalScore)[0];
    const compHold = evaluateProposal({
      id: `comp-spare-hold-${topSpare.id}-${bestHoldCandidate.id}`,
      title: 'Coordinated Spare Dispatch + Connection Hold',
      category: 'COMPOSITE_RECOVERY',
      summary: `${topSpare.summary} Plus ${bestHoldCandidate.summary}`,
      rationale:
        'Pairs spare tail insertion with targeted connection holding to maximize both OTP recovery and passenger retention.',
      actions: [...topSpare.actions, ...bestHoldCandidate.actions],
    });
    if (compHold) validCandidates.push(compHold);
  }

  // Deduplicate identical outcome signatures while keeping highest-scoring representative
  const dedupedBySignature = new Map<string, RecoveryStrategyCandidate>();
  for (const cand of validCandidates) {
    const k = cand.simulationResult.kpis;
    const sig = `${cand.category}-${k.totalDelayMinutes}-${k.delayedFlights}-${k.strandedPassengers}-${k.crewViolationsCount}`;
    const existing = dedupedBySignature.get(sig);
    if (!existing || cand.scorecard.totalScore > existing.scorecard.totalScore) {
      dedupedBySignature.set(sig, cand);
    }
  }

  const finalStrategies = Array.from(dedupedBySignature.values())
    .sort((a, b) => {
      if (b.scorecard.totalScore !== a.scorecard.totalScore) {
        return b.scorecard.totalScore - a.scorecard.totalScore;
      }
      if (b.comparison.deltas.delayMinutesSaved !== a.comparison.deltas.delayMinutesSaved) {
        return b.comparison.deltas.delayMinutesSaved - a.comparison.deltas.delayMinutesSaved;
      }
      return a.id.localeCompare(b.id);
    })
    .slice(0, 6);

  if (finalStrategies.length > 0) {
    finalStrategies[0] = { ...finalStrategies[0], recommended: true };
  }

  return {
    strategies: finalStrategies,
    rejectedCount,
  };
}
