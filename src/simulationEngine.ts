import { validateClosureWindow } from './closureUtils';
import {
  MINUTES_PER_DAY,
  formatMinutesToTime,
  parseTimeToMinutes,
} from './timeUtils';
import type {
  AircraftUtilisationResult,
  AirportClosureInput,
  AirportImpactSummary,
  ConnectionSimulationResult,
  CrewSimulationResult,
  DelayReason,
  FlightHoldConstraint,
  FlightNetworkDataset,
  FlightSimulationResult,
  NormalizedClosure,
  RawFlight,
  SimulationKPIs,
  SimulationOptions,
  SimulationResult,
} from './types';

interface MergedClosureWindow {
  startMins: number;
  endMins: number;
  labels: string[];
}

function normalizeClosures(
  closures: AirportClosureInput[],
  validAirportIds: ReadonlySet<string>
): NormalizedClosure[] {
  const seenKeys = new Set<string>();
  const normalized: NormalizedClosure[] = closures.map((closure) => {
    const check = validateClosureWindow(closure, validAirportIds);
    if (!check.valid) {
      throw new Error(check.error);
    }

    const dedupeKey = `${check.normalized.airportId}|${check.normalized.startMins}|${check.normalized.endMins}`;
    if (seenKeys.has(dedupeKey)) {
      throw new Error(
        `Duplicate closure: ${check.normalized.airportId} ${check.normalized.startTime}–${check.normalized.endTime} is already configured.`
      );
    }
    seenKeys.add(dedupeKey);

    return {
      id: closure.id,
      ...check.normalized,
    };
  });

  // Deterministic ordering by airport, startMins, endMins, id
  return normalized.sort((a, b) => {
    if (a.airportId !== b.airportId) return a.airportId.localeCompare(b.airportId);
    if (a.startMins !== b.startMins) return a.startMins - b.startMins;
    if (a.endMins !== b.endMins) return a.endMins - b.endMins;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Merges overlapping or contiguous half-open closure windows [start, end) per airport
 * so fixed-point departure/arrival resolution always converges cleanly.
 */
function buildMergedClosuresByAirport(
  normalizedClosures: NormalizedClosure[]
): Map<string, MergedClosureWindow[]> {
  const byAirport = new Map<string, MergedClosureWindow[]>();

  for (const c of normalizedClosures) {
    const label = c.isOvernight ? `${c.startTime}-${c.endTime}+1d` : `${c.startTime}-${c.endTime}`;
    const list = byAirport.get(c.airportId) ?? [];
    const last = list[list.length - 1];

    if (last && c.startMins <= last.endMins) {
      last.endMins = Math.max(last.endMins, c.endMins);
      if (!last.labels.includes(label)) {
        last.labels.push(label);
      }
    } else {
      list.push({
        startMins: c.startMins,
        endMins: c.endMins,
        labels: [label],
      });
    }

    byAirport.set(c.airportId, list);
  }

  return byAirport;
}

interface ResolvedFlightHold {
  holdMinutes: number;
  connectionIds: string[];
}

function resolveFlightTiming(
  flight: RawFlight,
  prevFlightResult: FlightSimulationResult | null,
  minTurnaroundMinutes: number,
  mergedClosuresByAirport: Map<string, MergedClosureWindow[]>,
  holdConstraint?: ResolvedFlightHold
): FlightSimulationResult {
  const scheduledDepMins = parseTimeToMinutes(flight.dep);
  const scheduledArrMins = parseTimeToMinutes(flight.arr);
  const blockMinutes = flight.block_minutes;

  let actualDepMins = scheduledDepMins;
  const reasonSet = new Set<DelayReason>();
  const delayNotes: string[] = [];

  if (prevFlightResult !== null) {
    const earliestByTurnaround = prevFlightResult.actualArrMins + minTurnaroundMinutes;
    if (earliestByTurnaround > actualDepMins) {
      actualDepMins = earliestByTurnaround;
      reasonSet.add('TURNAROUND_PROPAGATION');
      delayNotes.push(
        `Turnaround after ${prevFlightResult.flightId} (arr ${prevFlightResult.actualArr} + ${minTurnaroundMinutes}m)`
      );
    }
  }

  if (holdConstraint && holdConstraint.holdMinutes > 0) {
    const holdEarliestDepMins = scheduledDepMins + holdConstraint.holdMinutes;
    if (holdEarliestDepMins > actualDepMins) {
      actualDepMins = holdEarliestDepMins;
      reasonSet.add('CONNECTION_HOLD');
      const connSuffix =
        holdConstraint.connectionIds.length > 0
          ? ` (${holdConstraint.connectionIds.join(', ')})`
          : '';
      delayNotes.push(`Connection hold +${holdConstraint.holdMinutes}m${connSuffix}`);
    }
  }

  const originClosures = mergedClosuresByAirport.get(flight.origin) ?? [];
  const destClosures = mergedClosuresByAirport.get(flight.destination) ?? [];

  // Fixed-point solver: guarantees both departure at origin and arrival at destination
  // lie outside all closure windows [startMins, endMins), while preserving blockMinutes.
  const maxIterations = (originClosures.length + destClosures.length) * 4 + 10;
  let converged = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    let adjusted = false;

    for (const closure of originClosures) {
      if (actualDepMins >= closure.startMins && actualDepMins < closure.endMins) {
        actualDepMins = closure.endMins;
        reasonSet.add('ORIGIN_CLOSURE');
        const note = `${flight.origin} dep closure (${closure.labels.join(', ')})`;
        if (!delayNotes.includes(note)) delayNotes.push(note);
        adjusted = true;
        break;
      }
    }
    if (adjusted) continue;

    const candidateArrMins = actualDepMins + blockMinutes;
    for (const closure of destClosures) {
      if (candidateArrMins >= closure.startMins && candidateArrMins < closure.endMins) {
        // Hold departure at origin so arrival aligns with destination reopening
        // and scheduled block duration is preserved.
        actualDepMins = closure.endMins - blockMinutes;
        reasonSet.add('DESTINATION_CLOSURE');
        const note = `${flight.destination} arr closure (${closure.labels.join(', ')})`;
        if (!delayNotes.includes(note)) delayNotes.push(note);
        adjusted = true;
        break;
      }
    }

    if (!adjusted) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    throw new Error(
      `Flight ${flight.flight_id} failed to converge outside airport closure windows.`
    );
  }

  const actualArrMins = actualDepMins + blockMinutes;
  const delayMinutes = actualDepMins - scheduledDepMins;
  const turnaroundBeforeActualMins =
    prevFlightResult !== null ? actualDepMins - prevFlightResult.actualArrMins : null;

  return {
    flightId: flight.flight_id,
    tailId: flight.tail_id,
    legOrder: flight.leg_order,
    origin: flight.origin,
    destination: flight.destination,
    scheduledDep: flight.dep,
    scheduledArr: flight.arr,
    scheduledDepMins,
    scheduledArrMins,
    actualDep: formatMinutesToTime(actualDepMins),
    actualArr: formatMinutesToTime(actualArrMins),
    actualDepMins,
    actualArrMins,
    blockMinutes,
    delayMinutes,
    delayReasons: Array.from(reasonSet),
    delayNotes,
    pax: flight.pax,
    turnaroundBeforeActualMins,
  };
}

function evaluateConnections(
  dataset: FlightNetworkDataset,
  flightResultsById: Map<string, FlightSimulationResult>
): ConnectionSimulationResult[] {
  return dataset.connections.map((conn) => {
    const fromFlight = flightResultsById.get(conn.from_flight);
    const toFlight = flightResultsById.get(conn.to_flight);
    if (!fromFlight || !toFlight) {
      throw new Error(`Connection ${conn.connection_id} references missing flight.`);
    }

    const availableConnectMinutes = toFlight.actualDepMins - fromFlight.actualArrMins;
    const failed = availableConnectMinutes < conn.min_connect_minutes;
    const shortfallMinutes = failed ? conn.min_connect_minutes - availableConnectMinutes : 0;

    return {
      connectionId: conn.connection_id,
      airport: conn.airport,
      fromFlightId: conn.from_flight,
      toFlightId: conn.to_flight,
      passengers: conn.passengers,
      minConnectMinutes: conn.min_connect_minutes,
      fromActualArr: fromFlight.actualArr,
      toActualDep: toFlight.actualDep,
      availableConnectMinutes,
      shortfallMinutes,
      failed,
    };
  });
}

function evaluateCrews(
  dataset: FlightNetworkDataset,
  flightResultsById: Map<string, FlightSimulationResult>
): CrewSimulationResult[] {
  return dataset.crews.map((crew) => {
    const dutyStartMins = parseTimeToMinutes(crew.duty_start);
    const crewFlights = crew.flight_ids.map((fid) => {
      const fr = flightResultsById.get(fid);
      if (!fr) throw new Error(`Crew ${crew.crew_id} references missing flight ${fid}.`);
      return fr;
    });

    const scheduledDutyEndMins = Math.max(...crewFlights.map((f) => f.scheduledArrMins));
    const actualDutyEndMins = Math.max(...crewFlights.map((f) => f.actualArrMins));

    const scheduledDutyMins = scheduledDutyEndMins - dutyStartMins;
    const actualDutyMins = actualDutyEndMins - dutyStartMins;
    const overtimeMins = Math.max(0, actualDutyMins - crew.max_duty_mins);
    const exceedsLimit = actualDutyMins > crew.max_duty_mins;

    return {
      crewId: crew.crew_id,
      tailId: crew.tail_id,
      base: crew.base,
      dutyStart: crew.duty_start,
      dutyStartMins,
      maxDutyMins: crew.max_duty_mins,
      flightIds: [...crew.flight_ids],
      scheduledDutyEnd: formatMinutesToTime(scheduledDutyEndMins),
      scheduledDutyMins,
      actualDutyEnd: formatMinutesToTime(actualDutyEndMins),
      actualDutyEndMins,
      actualDutyMins,
      overtimeMins,
      exceedsLimit,
    };
  });
}

function computeAircraftUtilisation(
  dataset: FlightNetworkDataset,
  sortedTailIds: string[],
  tailResultsMap: Map<string, FlightSimulationResult[]>
): {
  activeUtilisation: AircraftUtilisationResult[];
  spareUtilisation: AircraftUtilisationResult[];
} {
  const crewBaseByTail = new Map<string, string>();
  for (const crew of dataset.crews) {
    crewBaseByTail.set(crew.tail_id, crew.base);
  }

  const activeUtilisation: AircraftUtilisationResult[] = sortedTailIds.map((tailId) => {
    const legs = tailResultsMap.get(tailId) ?? [];
    const scheduledBlockMinutes = legs.reduce((s, f) => s + f.blockMinutes, 0);
    const actualBlockMinutes = legs.reduce((s, f) => s + (f.actualArrMins - f.actualDepMins), 0);
    const totalDelayMinutes = legs.reduce((s, f) => s + f.delayMinutes, 0);
    const totalGroundTurnaroundMinutes = legs.reduce(
      (s, f) => s + (f.turnaroundBeforeActualMins ?? 0),
      0
    );

    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];
    const activeSpanMinutes =
      firstLeg && lastLeg ? lastLeg.actualArrMins - firstLeg.actualDepMins : 0;

    return {
      tailId,
      isSpare: false,
      base: crewBaseByTail.get(tailId) ?? firstLeg?.origin ?? 'N/A',
      seats: dataset.meta.seats_per_aircraft,
      flightsOperated: legs.length,
      scheduledBlockMinutes,
      actualBlockMinutes,
      firstActualDep: firstLeg ? firstLeg.actualDep : null,
      lastActualArr: lastLeg ? lastLeg.actualArr : null,
      activeSpanMinutes,
      totalGroundTurnaroundMinutes,
      totalDelayMinutes,
      utilisation24hPct: Number(((actualBlockMinutes / MINUTES_PER_DAY) * 100).toFixed(2)),
    };
  });

  const spareUtilisation: AircraftUtilisationResult[] = [...dataset.spare_aircraft]
    .sort((a, b) => a.tail_id.localeCompare(b.tail_id))
    .map((spare) => ({
      tailId: spare.tail_id,
      isSpare: true,
      base: spare.base,
      seats: spare.seats,
      flightsOperated: 0,
      scheduledBlockMinutes: 0,
      actualBlockMinutes: 0,
      firstActualDep: null,
      lastActualArr: null,
      activeSpanMinutes: 0,
      totalGroundTurnaroundMinutes: 0,
      totalDelayMinutes: 0,
      utilisation24hPct: 0,
    }));

  return { activeUtilisation, spareUtilisation };
}

function computeKPIs(
  flightResults: FlightSimulationResult[],
  connectionResults: ConnectionSimulationResult[],
  failedConnections: ConnectionSimulationResult[],
  strandedPassengers: number,
  crewResults: CrewSimulationResult[],
  crewViolations: CrewSimulationResult[],
  activeUtilisation: AircraftUtilisationResult[],
  spareUtilisation: AircraftUtilisationResult[]
): SimulationKPIs {
  const totalFlights = flightResults.length;
  const delayedFlightList = flightResults.filter((f) => f.delayMinutes > 0);
  const delayedFlights = delayedFlightList.length;
  const onTimeFlights = totalFlights - delayedFlights;
  const totalDelayMinutes = flightResults.reduce((s, f) => s + f.delayMinutes, 0);
  const maxDelayMinutes = flightResults.reduce((m, f) => Math.max(m, f.delayMinutes), 0);
  const totalPassengers = flightResults.reduce((s, f) => s + f.pax, 0);
  const delayedPassengers = delayedFlightList.reduce((s, f) => s + f.pax, 0);
  const totalCrewOvertimeMinutes = crewViolations.reduce((s, c) => s + c.overtimeMins, 0);
  const averageAircraftUtilisationPct =
    activeUtilisation.length > 0
      ? Number(
          (
            activeUtilisation.reduce((s, a) => s + a.utilisation24hPct, 0) /
            activeUtilisation.length
          ).toFixed(2)
        )
      : 0;

  return {
    totalFlights,
    onTimeFlights,
    delayedFlights,
    onTimePerformancePct:
      totalFlights > 0 ? Number(((onTimeFlights / totalFlights) * 100).toFixed(1)) : 0,
    totalDelayMinutes,
    averageDelayPerDelayedFlight:
      delayedFlights > 0 ? Number((totalDelayMinutes / delayedFlights).toFixed(1)) : 0,
    averageDelayAllFlights:
      totalFlights > 0 ? Number((totalDelayMinutes / totalFlights).toFixed(1)) : 0,
    maxDelayMinutes,
    totalPassengers,
    delayedPassengers,
    totalConnections: connectionResults.length,
    failedConnectionsCount: failedConnections.length,
    strandedPassengers,
    totalCrews: crewResults.length,
    crewViolationsCount: crewViolations.length,
    totalCrewOvertimeMinutes,
    activeAircraftCount: activeUtilisation.length,
    spareAircraftCount: spareUtilisation.length,
    averageAircraftUtilisationPct,
  };
}

function buildFlightHoldMap(
  flightHolds?: FlightHoldConstraint[]
): Map<string, ResolvedFlightHold> {
  const map = new Map<string, ResolvedFlightHold>();
  if (!flightHolds) return map;

  for (const hold of flightHolds) {
    if (!Number.isFinite(hold.holdMinutes) || hold.holdMinutes <= 0) continue;
    const existing = map.get(hold.flightId);
    if (existing) {
      existing.holdMinutes += hold.holdMinutes;
      if (hold.connectionId && !existing.connectionIds.includes(hold.connectionId)) {
        existing.connectionIds.push(hold.connectionId);
      }
    } else {
      map.set(hold.flightId, {
        holdMinutes: hold.holdMinutes,
        connectionIds: hold.connectionId ? [hold.connectionId] : [],
      });
    }
  }
  return map;
}

export function runSimulation(
  dataset: FlightNetworkDataset,
  closureInputs: AirportClosureInput[] = [],
  options?: SimulationOptions
): SimulationResult {
  const validAirportIds = new Set(dataset.airports.map((a) => a.id));
  const normalizedClosures = normalizeClosures(closureInputs, validAirportIds);
  const mergedClosuresByAirport = buildMergedClosuresByAirport(normalizedClosures);
  const flightHoldMap = buildFlightHoldMap(options?.flightHolds);

  // Group flights by aircraft tail and sort strictly by leg_order
  const flightsByTail = new Map<string, RawFlight[]>();
  for (const flight of dataset.flights) {
    const list = flightsByTail.get(flight.tail_id) ?? [];
    list.push(flight);
    flightsByTail.set(flight.tail_id, list);
  }

  const flightResultsById = new Map<string, FlightSimulationResult>();
  const tailResultsMap = new Map<string, FlightSimulationResult[]>();

  const sortedTailIds = Array.from(flightsByTail.keys()).sort((a, b) => a.localeCompare(b));
  for (const tailId of sortedTailIds) {
    const legs = [...(flightsByTail.get(tailId) ?? [])].sort((a, b) => a.leg_order - b.leg_order);
    const resolvedLegs: FlightSimulationResult[] = [];
    let prevLeg: FlightSimulationResult | null = null;

    for (const leg of legs) {
      const result = resolveFlightTiming(
        leg,
        prevLeg,
        dataset.meta.min_turnaround_minutes,
        mergedClosuresByAirport,
        flightHoldMap.get(leg.flight_id)
      );
      resolvedLegs.push(result);
      flightResultsById.set(result.flightId, result);
      prevLeg = result;
    }

    tailResultsMap.set(tailId, resolvedLegs);
  }

  // Sort all flight results deterministically by scheduled departure, then tail/leg
  const flightResults = Array.from(flightResultsById.values()).sort((a, b) => {
    if (a.scheduledDepMins !== b.scheduledDepMins) return a.scheduledDepMins - b.scheduledDepMins;
    if (a.tailId !== b.tailId) return a.tailId.localeCompare(b.tailId);
    return a.legOrder - b.legOrder;
  });

  // Evaluate passenger connections; count each failed connection's passengers exactly once
  const connectionResults = evaluateConnections(dataset, flightResultsById);
  const failedConnections = connectionResults.filter((c) => c.failed);
  const strandedPassengers = failedConnections.reduce((sum, c) => sum + c.passengers, 0);

  // Evaluate crew duty durations and flag max_duty_mins violations
  const crewResults = evaluateCrews(dataset, flightResultsById);
  const crewViolations = crewResults.filter((c) => c.exceedsLimit);

  // Compute aircraft utilisation for active fleet + spare aircraft
  const { activeUtilisation, spareUtilisation } = computeAircraftUtilisation(
    dataset,
    sortedTailIds,
    tailResultsMap
  );
  const aircraftUtilisation = [...activeUtilisation, ...spareUtilisation];

  // Airport-level impact summary
  const airportImpacts: AirportImpactSummary[] = dataset.airports.map((airport) => {
    const deps = flightResults.filter((f) => f.origin === airport.id);
    const arrs = flightResults.filter((f) => f.destination === airport.id);
    const failedAtAirport = failedConnections.filter((c) => c.airport === airport.id);

    return {
      airportId: airport.id,
      city: airport.city,
      tier: airport.tier,
      departuresCount: deps.length,
      arrivalsCount: arrs.length,
      delayedDepartures: deps.filter((f) => f.delayMinutes > 0).length,
      delayedArrivals: arrs.filter((f) => f.delayMinutes > 0).length,
      totalDepartureDelayMinutes: deps.reduce((s, f) => s + f.delayMinutes, 0),
      failedConnectionsAtAirport: failedAtAirport.length,
      strandedPassengersAtAirport: failedAtAirport.reduce((s, c) => s + c.passengers, 0),
      isClosed: mergedClosuresByAirport.has(airport.id),
    };
  });

  const kpis = computeKPIs(
    flightResults,
    connectionResults,
    failedConnections,
    strandedPassengers,
    crewResults,
    crewViolations,
    activeUtilisation,
    spareUtilisation
  );

  return {
    closures: normalizedClosures,
    flights: flightResults,
    connections: connectionResults,
    failedConnections,
    crews: crewResults,
    crewViolations,
    aircraftUtilisation,
    airportImpacts,
    kpis,
  };
}
