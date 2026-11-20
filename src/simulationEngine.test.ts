import { describe, expect, it } from 'vitest';
import { loadDefaultFlightNetwork, validateFlightNetworkDataset } from './dataLoader';
import {
  buildDominoTimeline,
  computeBeforeAfterComparison,
  evaluateRecoveryStrategies,
  validateRecoveryActions,
} from './recoveryEngine';
import { runSimulation } from './simulationEngine';
import {
  buildDelayCauseData,
  buildHourlyDepartureProfile,
  buildOperationalAlerts,
  buildScenarioComparisonRows,
  filterAndSortFlights,
} from './simulationViewModels';
import { formatMinutesToTime, parseClosureTimeToMinutes, parseTimeToMinutes } from './timeUtils';
import type { AirportClosureInput, FlightNetworkDataset } from './types';

describe('timeUtils', () => {
  it('parses and formats standard HH:MM times consistently in integer minutes', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('08:35')).toBe(515);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
    expect(parseClosureTimeToMinutes('24:00')).toBe(1440);
    expect(formatMinutesToTime(515)).toBe('08:35');
    expect(formatMinutesToTime(1440)).toBe('00:00+1d');
    expect(formatMinutesToTime(1505)).toBe('01:05+1d');
  });

  it('rejects malformed or out-of-range times', () => {
    expect(() => parseTimeToMinutes('24:00')).toThrow();
    expect(() => parseTimeToMinutes('12:60')).toThrow();
    expect(() => parseTimeToMinutes('8:00')).toThrow();
  });
});

describe('dataLoader', () => {
  it('loads and validates the Domino Sky dataset without inventing records', () => {
    const dataset = loadDefaultFlightNetwork();
    expect(dataset.airports).toHaveLength(16);
    expect(dataset.flights).toHaveLength(70);
    expect(dataset.connections).toHaveLength(21);
    expect(dataset.crews).toHaveLength(16);
    expect(dataset.spare_aircraft).toHaveLength(2);
    expect(dataset.meta.min_turnaround_minutes).toBe(30);
    expect(dataset.meta.seats_per_aircraft).toBe(180);
  });

  it('rejects broken aircraft route continuity', () => {
    const dataset = loadDefaultFlightNetwork();
    const broken = structuredClone(dataset) as FlightNetworkDataset;
    broken.flights[1].origin = 'BLR'; // Breaks VT-DS01 JAI continuity
    expect(() => validateFlightNetworkDataset(broken)).toThrow(/discontinuity/i);
  });

  it('rejects connection hub mismatches, crew tail mismatches, and spare tail collisions', () => {
    const dataset = loadDefaultFlightNetwork();

    const badConn = structuredClone(dataset) as FlightNetworkDataset;
    badConn.connections[0].airport = 'BLR';
    expect(() => validateFlightNetworkDataset(badConn)).toThrow(/connection hub/i);

    const badCrewTail = structuredClone(dataset) as FlightNetworkDataset;
    badCrewTail.crews[0].tail_id = 'VT-DS02';
    expect(() => validateFlightNetworkDataset(badCrewTail)).toThrow(/expected VT-DS02/i);

    const badCrewDuty = structuredClone(dataset) as FlightNetworkDataset;
    badCrewDuty.crews[0].duty_start = '23:00';
    expect(() => validateFlightNetworkDataset(badCrewDuty)).toThrow(/before crew duty_start/i);

    const badSpare = structuredClone(dataset) as FlightNetworkDataset;
    badSpare.spare_aircraft[0].tail_id = 'VT-DS01';
    expect(() => validateFlightNetworkDataset(badSpare)).toThrow(/collides with active/i);
  });
});

describe('simulationEngine - baseline schedule', () => {
  it('runs a clean baseline with zero delays, zero failed connections, and zero crew violations', () => {
    const dataset = loadDefaultFlightNetwork();
    const baseline = runSimulation(dataset, []);

    expect(baseline.kpis.totalFlights).toBe(70);
    expect(baseline.kpis.onTimeFlights).toBe(70);
    expect(baseline.kpis.delayedFlights).toBe(0);
    expect(baseline.kpis.totalDelayMinutes).toBe(0);
    expect(baseline.kpis.failedConnectionsCount).toBe(0);
    expect(baseline.kpis.strandedPassengers).toBe(0);
    expect(baseline.kpis.crewViolationsCount).toBe(0);

    for (const f of baseline.flights) {
      expect(f.actualDepMins).toBe(f.scheduledDepMins);
      expect(f.actualArrMins).toBe(f.scheduledArrMins);
      expect(f.actualArrMins - f.actualDepMins).toBe(f.blockMinutes);
    }
  });
});

describe('simulationEngine - airport closures & block preservation', () => {
  it('applies closure restrictions to departures and treats closure [start, end) as half-open', () => {
    const dataset = loadDefaultFlightNetwork();
    // DS0201 DEL->BOM dep 06:00, arr 08:10.
    // Closing DEL 06:00-07:00 pushes DS0201 to 07:00 (+60m), arr 09:10 (block 130m preserved).
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'DEL', startTime: '06:00', endTime: '07:00' },
    ];
    const result = runSimulation(dataset, closures);
    const ds0201 = result.flights.find((f) => f.flightId === 'DS0201')!;

    expect(ds0201.actualDep).toBe('07:00');
    expect(ds0201.actualArr).toBe('09:10');
    expect(ds0201.delayMinutes).toBe(60);
    expect(ds0201.actualArrMins - ds0201.actualDepMins).toBe(ds0201.blockMinutes);
    expect(ds0201.delayReasons).toContain('ORIGIN_CLOSURE');

    // Closing DEL 07:00-08:00 should NOT delay DS0101 (DEL->JAI dep 08:00)
    const boundaryResult = runSimulation(dataset, [
      { id: 'c2', airportId: 'DEL', startTime: '07:00', endTime: '08:00' },
    ]);
    const ds0101 = boundaryResult.flights.find((f) => f.flightId === 'DS0101')!;
    expect(ds0101.delayMinutes).toBe(0);
    expect(ds0101.actualDep).toBe('08:00');
  });

  it('applies closure restrictions to arrivals and holds departure to preserve block_minutes', () => {
    const dataset = loadDefaultFlightNetwork();
    // DS0201 DEL->BOM dep 06:00, arr 08:10 (130m block).
    // Closing BOM 08:00-10:00 blocks arrival at 08:10 -> arr pushed to 10:00, dep pushed to 07:50 (+110m).
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'BOM', startTime: '08:00', endTime: '10:00' },
    ];
    const result = runSimulation(dataset, closures);
    const ds0201 = result.flights.find((f) => f.flightId === 'DS0201')!;

    expect(ds0201.actualArr).toBe('10:00');
    expect(ds0201.actualDep).toBe('07:50');
    expect(ds0201.delayMinutes).toBe(110);
    expect(ds0201.actualArrMins - ds0201.actualDepMins).toBe(130);
    expect(ds0201.delayReasons).toEqual(['DESTINATION_CLOSURE']);
  });

  it('merges overlapping/contiguous closures and resolves simultaneous origin + destination closures cleanly', () => {
    const dataset = loadDefaultFlightNetwork();
    // Overlapping DEL closures (06:00-06:45 and 06:30-07:15) + BOM arrival closure (08:30-10:00)
    // DS0201 DEL->BOM (06:00-08:10, 130m block):
    // 1) DEL merged 06:00-07:15 pushes dep to 07:15, arr 09:25
    // 2) BOM 08:30-10:00 hits arr 09:25 -> pushes arr to 10:00, dep 07:50 (outside DEL 06:00-07:15)
    const result = runSimulation(dataset, [
      { id: 'c1', airportId: 'DEL', startTime: '06:00', endTime: '06:45' },
      { id: 'c2', airportId: 'DEL', startTime: '06:30', endTime: '07:15' },
      { id: 'c3', airportId: 'BOM', startTime: '08:30', endTime: '10:00' },
    ]);

    const ds0201 = result.flights.find((f) => f.flightId === 'DS0201')!;
    expect(ds0201.actualDep).toBe('07:50');
    expect(ds0201.actualArr).toBe('10:00');
    expect(ds0201.delayReasons).toContain('ORIGIN_CLOSURE');
    expect(ds0201.delayReasons).toContain('DESTINATION_CLOSURE');
  });
});

describe('simulationEngine - aircraft turnaround & delay propagation', () => {
  it('enforces minimum 30-minute turnaround and cascades delays across subsequent legs', () => {
    const dataset = loadDefaultFlightNetwork();
    const result = runSimulation(dataset, [
      { id: 'c1', airportId: 'BOM', startTime: '07:30', endTime: '08:45' },
    ]);

    const get = (id: string) => result.flights.find((f) => f.flightId === id)!;
    expect(get('DS0401').delayMinutes).toBe(60);
    expect(get('DS0402').actualDep).toBe('10:20');
    expect(get('DS0402').delayMinutes).toBe(60);
    expect(get('DS0402').delayReasons).toContain('TURNAROUND_PROPAGATION');

    expect(get('DS0403').actualDep).toBe('11:55');
    expect(get('DS0403').delayMinutes).toBe(20);
    expect(get('DS0404').actualDep).toBe('13:05');
    expect(get('DS0404').delayMinutes).toBe(15);
    expect(get('DS0405').actualDep).toBe('14:45');
    expect(get('DS0405').delayMinutes).toBe(0);
  });
});

describe('simulationEngine - connections & stranded passengers', () => {
  it('breaks connections when actual departure < actual arrival + min_connect_minutes and counts each failed connection once', () => {
    const dataset = loadDefaultFlightNetwork();
    const result = runSimulation(dataset, [
      { id: 'c1', airportId: 'AMD', startTime: '06:00', endTime: '08:00' },
    ]);

    const failedIds = result.failedConnections.map((c) => c.connectionId).sort();
    expect(failedIds).toEqual(['CX01', 'CX02', 'CX10']);
    expect(result.kpis.failedConnectionsCount).toBe(3);
    expect(result.kpis.strandedPassengers).toBe(43 + 20 + 18);
  });
});

describe('simulationEngine - crew duty limits', () => {
  it('flags crew duty violations strictly when actualDutyMins > max_duty_mins', () => {
    const dataset = loadDefaultFlightNetwork();
    const atLimit = runSimulation(dataset, [
      { id: 'c1', airportId: 'DEL', startTime: '18:30', endTime: '19:05' },
    ]);
    const cr03AtLimit = atLimit.crews.find((c) => c.crewId === 'CR03')!;
    expect(cr03AtLimit.actualDutyMins).toBe(600);
    expect(cr03AtLimit.exceedsLimit).toBe(false);

    const overLimit = runSimulation(dataset, [
      { id: 'c2', airportId: 'DEL', startTime: '18:30', endTime: '19:06' },
    ]);
    const cr03Over = overLimit.crews.find((c) => c.crewId === 'CR03')!;
    expect(cr03Over.actualDutyMins).toBe(601);
    expect(cr03Over.overtimeMins).toBe(1);
    expect(cr03Over.exceedsLimit).toBe(true);
    expect(overLimit.kpis.crewViolationsCount).toBe(1);
  });
});

describe('simulationEngine - determinism', () => {
  it('produces identical outputs across repeated invocations with identical inputs', () => {
    const dataset = loadDefaultFlightNetwork();
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'BOM', startTime: '08:00', endTime: '10:30' },
      { id: 'c2', airportId: 'DEL', startTime: '14:00', endTime: '15:30' },
    ];

    const runA = runSimulation(dataset, closures);
    const runB = runSimulation(dataset, closures);
    expect(runA).toEqual(runB);
  });
});

describe('simulationViewModels', () => {
  it('derives alerts, filtered/sorted flights, and analytics summaries accurately', () => {
    const dataset = loadDefaultFlightNetwork();
    const baseline = runSimulation(dataset, []);
    const disrupted = runSimulation(dataset, [
      { id: 'c1', airportId: 'AMD', startTime: '06:00', endTime: '08:00' },
    ]);

    const alerts = buildOperationalAlerts(disrupted);
    expect(alerts.some((a) => a.category === 'AIRPORT CLOSURE')).toBe(true);
    expect(alerts.some((a) => a.category === 'MISSED CONNECTION')).toBe(true);

    const delayedOnly = filterAndSortFlights(disrupted.flights, {
      flightFilter: 'delayed',
      airportFilter: 'AMD',
      searchQuery: '',
      sortField: 'delayMinutes',
      sortDir: 'desc',
    });
    expect(delayedOnly.length).toBeGreaterThan(0);
    expect(delayedOnly.every((f) => f.delayMinutes > 0)).toBe(true);
    expect(delayedOnly.every((f) => f.origin === 'AMD' || f.destination === 'AMD')).toBe(true);

    const causes = buildDelayCauseData(disrupted);
    expect(causes.find((c) => c.reason === 'Origin Closure')?.flights).toBeGreaterThan(0);

    const hourly = buildHourlyDepartureProfile(disrupted);
    const totalScheduled = hourly.reduce((s, b) => s + b.scheduled, 0);
    expect(totalScheduled).toBe(70);

    const comparison = buildScenarioComparisonRows(baseline.kpis, disrupted.kpis);
    expect(comparison).toHaveLength(7);
    expect(comparison.find((r) => r.label === 'Failed Connections')?.delta).toBe(3);
  });
});

describe('recoveryEngine - interactive domino timeline', () => {
  it('orders original disruption, propagation cascades, connection failures, and crew violations chronologically', () => {
    const dataset = loadDefaultFlightNetwork();
    const baseline = runSimulation(dataset, []);
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'BOM', startTime: '07:30', endTime: '09:30' },
    ];
    const disrupted = runSimulation(dataset, closures);
    const timeline = buildDominoTimeline(disrupted, baseline);

    expect(timeline.length).toBeGreaterThan(5);
    expect(timeline[0].type).toBe('DISRUPTION_ORIGIN');
    expect(timeline[0].stageKind).toBe('ORIGINAL_EVENT');

    // Strictly monotonic timeMins ordering
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].timeMins).toBeGreaterThanOrEqual(timeline[i - 1].timeMins);
      expect(timeline[i].sequence).toBe(i + 1);
    }

    // Verify spread across multiple airports & rotation cascades exist
    expect(timeline.some((e) => e.type === 'ROTATION_CASCADE')).toBe(true);
    expect(timeline.some((e) => e.type === 'CONNECTION_FAILURE')).toBe(true);
    const touchedAirports = new Set(timeline.map((e) => e.airportId));
    expect(touchedAirports.size).toBeGreaterThan(2);
  });

  it('includes RECOVERY_ACTION stage events chronologically when a recovery strategy is applied', () => {
    const dataset = loadDefaultFlightNetwork();
    const baseline = runSimulation(dataset, []);
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'BOM', startTime: '07:30', endTime: '09:30' },
    ];
    const disrupted = runSimulation(dataset, closures);
    const { strategies } = evaluateRecoveryStrategies(dataset, closures, disrupted);
    expect(strategies.length).toBeGreaterThan(0);

    const best = strategies[0];
    const timeline = buildDominoTimeline(disrupted, baseline, best.simulationResult, best);
    expect(timeline.some((e) => e.stageKind === 'RECOVERY_ACTION')).toBe(true);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].timeMins).toBeGreaterThanOrEqual(timeline[i - 1].timeMins);
    }
  });
});

describe('recoveryEngine - validation & feasibility constraints', () => {
  it('validates feasible spare deployment and tail swap actions while preserving rotation & turnaround constraints', () => {
    const dataset = loadDefaultFlightNetwork();
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'BOM', startTime: '07:30', endTime: '09:30' },
    ];
    const disrupted = runSimulation(dataset, closures);

    // Valid spare deployment: VT-DS18 (based BOM) takes over VT-DS04 from DS0403 (BOM->PNQ 11:35)
    const spareValid = validateRecoveryActions(
      dataset,
      closures,
      [
        {
          type: 'DEPLOY_SPARE_TAIL_SUFFIX',
          spareTailId: 'VT-DS18',
          targetTailId: 'VT-DS04',
          fromFlightId: 'DS0403',
        },
      ],
      disrupted
    );
    expect(spareValid.valid).toBe(true);
    expect(spareValid.simulationResult).not.toBeNull();
    expect(spareValid.simulationResult!.flights.find((f) => f.flightId === 'DS0403')!.tailId).toBe(
      'VT-DS18'
    );
    expect(spareValid.simulationResult!.flights.find((f) => f.flightId === 'DS0403')!.delayMinutes).toBe(
      0
    );
  });

  it('rejects impossible aircraft movements, insufficient spare seats, wrong base, and illegal crew schedules', () => {
    const dataset = loadDefaultFlightNetwork();
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'BOM', startTime: '07:30', endTime: '09:30' },
    ];
    const disrupted = runSimulation(dataset, closures);

    // 1. Wrong base (VT-DS17 is at DEL, cannot originate DS0403 at BOM)
    const wrongBase = validateRecoveryActions(
      dataset,
      closures,
      [
        {
          type: 'DEPLOY_SPARE_TAIL_SUFFIX',
          spareTailId: 'VT-DS17',
          targetTailId: 'VT-DS04',
          fromFlightId: 'DS0403',
        },
      ],
      disrupted
    );
    expect(wrongBase.valid).toBe(false);
    expect(wrongBase.reasons.join(' ')).toMatch(/stationed at DEL/i);

    // 2. Insufficient spare capacity
    const smallSpareDataset = structuredClone(dataset) as FlightNetworkDataset;
    smallSpareDataset.spare_aircraft[1].seats = 50; // VT-DS18 too small for DS0403 (122 pax)
    const tooSmall = validateRecoveryActions(
      smallSpareDataset,
      closures,
      [
        {
          type: 'DEPLOY_SPARE_TAIL_SUFFIX',
          spareTailId: 'VT-DS18',
          targetTailId: 'VT-DS04',
          fromFlightId: 'DS0403',
        },
      ],
      disrupted
    );
    expect(tooSmall.valid).toBe(false);
    expect(tooSmall.reasons.join(' ')).toMatch(/exceeding/i);

    // 3. Tail swap at mismatched hub airports
    const badSwap = validateRecoveryActions(
      dataset,
      closures,
      [
        {
          type: 'SWAP_TAIL_SUFFIXES',
          tailAId: 'VT-DS04',
          fromFlightAId: 'DS0403', // BOM
          tailBId: 'VT-DS01',
          fromFlightBId: 'DS0103', // DEL
          hubAirportId: 'BOM',
        },
      ],
      disrupted
    );
    expect(badSwap.valid).toBe(false);
    expect(badSwap.reasons.join(' ')).toMatch(/must originate at hub BOM/i);

    // 4. Holding a flight past crew duty limit must be rejected (CR03 reaches 590m baseline; +20m hold = 610m > 600m)
    const illegalCrewHold = validateRecoveryActions(
      dataset,
      [{ id: 'c-del', airportId: 'DEL', startTime: '18:30', endTime: '19:05' }],
      [
        {
          type: 'HOLD_CONNECTING_FLIGHT',
          connectionId: 'CX15',
          flightId: 'DS0304',
          holdMinutes: 20,
        },
      ],
      runSimulation(dataset, [{ id: 'c-del', airportId: 'DEL', startTime: '18:30', endTime: '19:05' }])
    );
    expect(illegalCrewHold.valid).toBe(false);
    expect(illegalCrewHold.reasons.join(' ')).toMatch(/illegal crew duty|exceeds|violation/i);
  });

  it('rescues missed passenger connections via validated connection holds and updates metrics accurately', () => {
    const dataset = loadDefaultFlightNetwork();
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'AMD', startTime: '06:00', endTime: '08:00' },
    ];
    const disrupted = runSimulation(dataset, closures);
    expect(disrupted.kpis.failedConnectionsCount).toBe(3);

    // CX01: DS1201->DS1502 at BOM (43 pax). Holding DS1502 recovers CX01 cleanly.
    const cx01 = disrupted.failedConnections.find((c) => c.connectionId === 'CX01')!;
    const holdValid = validateRecoveryActions(
      dataset,
      closures,
      [
        {
          type: 'HOLD_CONNECTING_FLIGHT',
          connectionId: 'CX01',
          flightId: cx01.toFlightId,
          holdMinutes: cx01.shortfallMinutes,
        },
      ],
      disrupted
    );

    expect(holdValid.valid).toBe(true);
    expect(holdValid.simulationResult).not.toBeNull();
    const afterConn = holdValid.simulationResult!.connections.find((c) => c.connectionId === 'CX01')!;
    expect(afterConn.failed).toBe(false);
    expect(holdValid.simulationResult!.kpis.strandedPassengers).toBeLessThan(
      disrupted.kpis.strandedPassengers
    );
  });
});

describe('recoveryEngine - scorecard, before-after accuracy & determinism', () => {
  it('computes accurate before-after comparisons with null percentages on zero denominators and identical deterministic rankings', () => {
    const dataset = loadDefaultFlightNetwork();
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'BOM', startTime: '07:30', endTime: '09:30' },
    ];
    const disrupted = runSimulation(dataset, closures);

    const evalA = evaluateRecoveryStrategies(dataset, closures, disrupted);
    const evalB = evaluateRecoveryStrategies(dataset, closures, disrupted);

    expect(evalA.strategies.length).toBeGreaterThan(0);
    expect(evalA).toEqual(evalB);

    const best = evalA.strategies[0];
    expect(best.recommended).toBe(true);
    expect(best.scorecard.totalScore).toBeGreaterThan(0);
    expect(best.scorecard.totalScore).toBeLessThanOrEqual(100);

    const comp = computeBeforeAfterComparison(disrupted, best.simulationResult);
    expect(comp.deltas.delayMinutesSaved).toBe(
      disrupted.kpis.totalDelayMinutes - best.simulationResult.kpis.totalDelayMinutes
    );
    expect(comp.deltas.flightsRecoveredCount).toBeGreaterThan(0);
    expect(comp.deltas.delayMinutesPctReduction).not.toBeNull();

    // Verify percentage reduction is null when disrupted metric denominator is 0
    if (disrupted.kpis.crewViolationsCount === 0) {
      expect(comp.deltas.crewViolationsPctReduction).toBeNull();
    }
  });
});


