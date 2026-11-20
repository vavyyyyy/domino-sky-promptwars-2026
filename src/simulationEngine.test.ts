import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  formatClosureWindowLabel,
  getAvailableClosurePresets,
  stepTimeString,
  validateClosureWindow,
} from './closureUtils';
import { DominoTimelinePanel } from './components/DominoTimelinePanel';
import { IndiaNetworkMap } from './components/IndiaNetworkMap';
import { RecoveryIntelligencePanel } from './components/RecoveryIntelligencePanel';
import { loadDefaultFlightNetwork, validateFlightNetworkDataset } from './dataLoader';
import {
  buildDominoTimeline,
  computeBeforeAfterComparison,
  computeRecoveryScorecard,
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

describe('custom airport closure scheduling, overnight windows & validation', () => {
  it('supports arbitrary minute-level closure times and recalculates block duration, rotations, connections, and crew duty', () => {
    const dataset = loadDefaultFlightNetwork();
    // Arbitrary non-preset airport & minute-level times: BLR 07:13-08:47
    // DS0602 (COK->BLR arr 09:00) unaffected, while DS0501 (MAA->BLR arr 07:15) hits destination closure!
    // DS0501 (60m block) arrival pushed 07:15 -> 08:47 (+92m), dep pushed 06:15 -> 07:47.
    const closures: AirportClosureInput[] = [
      { id: 'arb-blr', airportId: 'BLR', startTime: '07:13', endTime: '08:47' },
    ];
    const result = runSimulation(dataset, closures);
    const ds0501 = result.flights.find((f) => f.flightId === 'DS0501')!;
    const ds0502 = result.flights.find((f) => f.flightId === 'DS0502')!;

    expect(ds0501.actualDep).toBe('07:47');
    expect(ds0501.actualArr).toBe('08:47');
    expect(ds0501.delayMinutes).toBe(92);
    expect(ds0501.actualArrMins - ds0501.actualDepMins).toBe(ds0501.blockMinutes);
    expect(ds0501.delayReasons).toContain('DESTINATION_CLOSURE');

    // DS0502 departs BLR at 07:55, hits BLR origin closure (08:47) AND incoming turnaround (08:47+30=09:17)
    expect(ds0502.actualDep).toBe('09:17');
    expect(ds0502.turnaroundBeforeActualMins).toBe(30);
    expect(result.kpis.failedConnectionsCount).toBeGreaterThan(0);
    expect(result.crews.find((c) => c.crewId === 'CR05')?.actualDutyMins).toBeGreaterThan(
      result.crews.find((c) => c.crewId === 'CR05')!.scheduledDutyMins
    );
  });

  it('simulates multiple simultaneous closures across different airports accurately', () => {
    const dataset = loadDefaultFlightNetwork();
    const closures: AirportClosureInput[] = [
      { id: 'm1', airportId: 'BLR', startTime: '08:00', endTime: '10:00' },
      { id: 'm2', airportId: 'DEL', startTime: '08:15', endTime: '09:45' },
      { id: 'm3', airportId: 'AMD', startTime: '06:05', endTime: '07:50' },
    ];
    const result = runSimulation(dataset, closures);

    expect(result.closures).toHaveLength(3);
    expect(result.airportImpacts.find((a) => a.airportId === 'BLR')?.isClosed).toBe(true);
    expect(result.airportImpacts.find((a) => a.airportId === 'DEL')?.isClosed).toBe(true);
    expect(result.airportImpacts.find((a) => a.airportId === 'AMD')?.isClosed).toBe(true);
    expect(result.airportImpacts.find((a) => a.airportId === 'GOI')?.isClosed).toBe(false);

    // Confirm no flight actually departs or arrives inside any of the 3 closure windows
    for (const f of result.flights) {
      for (const c of result.closures) {
        if (f.origin === c.airportId) {
          expect(f.actualDepMins < c.startMins || f.actualDepMins >= c.endMins).toBe(true);
        }
        if (f.destination === c.airportId) {
          expect(f.actualArrMins < c.startMins || f.actualArrMins >= c.endMins).toBe(true);
        }
      }
    }
  });

  it('handles overnight closures such as 22:00-02:00 accurately and merges with late-evening windows', () => {
    const dataset = loadDefaultFlightNetwork();
    const validIds = new Set(dataset.airports.map((a) => a.id));

    const overnightCheck = validateClosureWindow(
      { airportId: 'CCU', startTime: '22:00', endTime: '02:00' },
      validIds
    );
    expect(overnightCheck.valid).toBe(true);
    if (overnightCheck.valid) {
      expect(overnightCheck.normalized.isOvernight).toBe(true);
      expect(overnightCheck.normalized.startMins).toBe(22 * 60);
      expect(overnightCheck.normalized.endMins).toBe(26 * 60);
      expect(overnightCheck.normalized.durationMinutes).toBe(240);
      expect(formatClosureWindowLabel(overnightCheck.normalized)).toBe('22:00–02:00 (+1d)');
    }

    // Push DS0304 (DEL->CCU, 18:55-21:20, 145m block) via DEL 18:30-20:00 so it arrives CCU at 22:25,
    // colliding with overnight CCU 22:00-02:00 closure!
    // Arrival must wait until 02:00+1d (1560m), holding departure to 23:35 (1415m) with 145m block preserved.
    const result = runSimulation(dataset, [
      { id: 'c-del', airportId: 'DEL', startTime: '18:30', endTime: '20:00' },
      { id: 'c-ccu-night', airportId: 'CCU', startTime: '22:00', endTime: '02:00' },
    ]);

    const ds0304 = result.flights.find((f) => f.flightId === 'DS0304')!;
    expect(ds0304.actualArr).toBe('02:00+1d');
    expect(ds0304.actualDep).toBe('23:35');
    expect(ds0304.actualArrMins - ds0304.actualDepMins).toBe(145);
    expect(ds0304.delayReasons).toContain('DESTINATION_CLOSURE');

    // Merge check: overlapping CCU 20:30-22:30 + CCU 22:00-02:00
    const mergedResult = runSimulation(dataset, [
      { id: 'c-del', airportId: 'DEL', startTime: '18:30', endTime: '20:00' },
      { id: 'c-ccu-eve', airportId: 'CCU', startTime: '20:30', endTime: '22:30' },
      { id: 'c-ccu-night', airportId: 'CCU', startTime: '22:00', endTime: '02:00' },
    ]);
    const ds0304Merged = mergedResult.flights.find((f) => f.flightId === 'DS0304')!;
    expect(ds0304Merged.actualArr).toBe('02:00+1d');

    // Timeline should include the overnight closure cleanly
    const baseline = runSimulation(dataset, []);
    const timeline = buildDominoTimeline(result, baseline);
    const ccuOriginEvt = timeline.find((e) => e.airportId === 'CCU' && e.type === 'DISRUPTION_ORIGIN');
    expect(ccuOriginEvt?.endTimeLabel).toBe('02:00+1d');
  });

  it('rejects invalid times, zero-duration closures, unknown stations, and duplicate entries', () => {
    const dataset = loadDefaultFlightNetwork();
    const validIds = new Set(dataset.airports.map((a) => a.id));

    const badTimes = [
      { airportId: 'BOM', startTime: '25:00', endTime: '10:00' },
      { airportId: 'BOM', startTime: '08:60', endTime: '10:00' },
      { airportId: 'BOM', startTime: '8:00', endTime: '10:00' },
      { airportId: 'BOM', startTime: '24:00', endTime: '02:00' },
      { airportId: 'BOM', startTime: '08:00 AM', endTime: '10:00' },
      { airportId: 'BOM', startTime: '08:00', endTime: '08:00' }, // zero-duration
      { airportId: 'XYZ', startTime: '08:00', endTime: '10:00' }, // unknown station
    ];

    for (const bad of badTimes) {
      const check = validateClosureWindow(bad, validIds);
      expect(check.valid).toBe(false);
      expect(() =>
        runSimulation(dataset, [{ id: 'bad', ...bad }])
      ).toThrow();
    }

    // Duplicate detection in validator + engine (including 22:00-00:00 vs 22:00-24:00 equivalence)
    const staged: AirportClosureInput[] = [
      { id: 'c1', airportId: 'BLR', startTime: '08:00', endTime: '10:00' },
      { id: 'c2', airportId: 'DEL', startTime: '22:00', endTime: '00:00' },
    ];
    const dup1 = validateClosureWindow(
      { airportId: 'BLR', startTime: '08:00', endTime: '10:00' },
      validIds,
      staged
    );
    expect(dup1.valid).toBe(false);
    expect(dup1.valid === false && dup1.error).toMatch(/Duplicate closure/i);

    const dup2 = validateClosureWindow(
      { airportId: 'DEL', startTime: '22:00', endTime: '24:00' },
      validIds,
      staged
    );
    expect(dup2.valid).toBe(false);

    // Editing closure c1 in place must allow saving non-conflicting changes and reject conflicts with c2
    const editSelfOk = validateClosureWindow(
      { airportId: 'BLR', startTime: '08:15', endTime: '10:15' },
      validIds,
      staged,
      'c1'
    );
    expect(editSelfOk.valid).toBe(true);

    const editConflict = validateClosureWindow(
      { airportId: 'DEL', startTime: '22:00', endTime: '00:00' },
      validIds,
      staged,
      'c1'
    );
    expect(editConflict.valid).toBe(false);

    // Simulation engine itself rejects exact duplicates
    expect(() =>
      runSimulation(dataset, [
        { id: 'd1', airportId: 'BLR', startTime: '08:00', endTime: '10:00' },
        { id: 'd2', airportId: 'BLR', startTime: '08:00', endTime: '10:00' },
      ])
    ).toThrow(/Duplicate closure/i);
  });

  it('exposes dataset-filtered optional BLR/DEL/AMD presets and keyboard minute-step helper', () => {
    const dataset = loadDefaultFlightNetwork();
    const presets = getAvailableClosurePresets(dataset.airports);
    expect(presets.map((p) => p.airportId)).toEqual(
      expect.arrayContaining(['BLR', 'DEL', 'AMD'])
    );

    // Filtering prevents showing presets for airports absent in a smaller custom dataset
    const subsetPresets = getAvailableClosurePresets(
      dataset.airports.filter((a) => a.id === 'DEL' || a.id === 'BOM')
    );
    expect(subsetPresets.some((p) => p.airportId === 'BLR')).toBe(false);
    expect(subsetPresets.some((p) => p.airportId === 'DEL')).toBe(true);

    expect(stepTimeString('23:59', 1)).toBe('00:00');
    expect(stepTimeString('00:00', -1)).toBe('23:59');
    expect(stepTimeString('23:45', 15, true)).toBe('24:00');
  });
});

describe('Priority 1 regression - HOLD_CONNECTING_FLIGHT preserves STD/STA and real operational impact', () => {
  it('keeps scheduledDep and scheduledArr immutable after connection holds while updating actuals and downstream rotations', () => {
    const dataset = loadDefaultFlightNetwork();
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'AMD', startTime: '06:00', endTime: '08:00' },
    ];
    const disrupted = runSimulation(dataset, closures);

    // Hold DS1502 (STD 08:50, STA 11:00) by +65m to rescue CX01
    const holdRes = validateRecoveryActions(
      dataset,
      closures,
      [
        {
          type: 'HOLD_CONNECTING_FLIGHT',
          connectionId: 'CX01',
          flightId: 'DS1502',
          holdMinutes: 65,
        },
      ],
      disrupted
    );

    expect(holdRes.valid).toBe(true);
    const sim = holdRes.simulationResult!;
    const ds1502 = sim.flights.find((f) => f.flightId === 'DS1502')!;
    const ds1503 = sim.flights.find((f) => f.flightId === 'DS1503')!;

    // STD/STA remain strictly immutable
    expect(ds1502.scheduledDep).toBe('08:50');
    expect(ds1502.scheduledArr).toBe('11:00');
    // Actual times & delay accurately reflect the +65m operational hold
    expect(ds1502.actualDep).toBe('09:55');
    expect(ds1502.actualArr).toBe('12:05');
    expect(ds1502.delayMinutes).toBe(65);
    expect(ds1502.delayReasons).toContain('CONNECTION_HOLD');

    // Downstream rotation DS1503 (STD 11:45) propagates to 12:05 + 30m = 12:35
    expect(ds1503.scheduledDep).toBe('11:45');
    expect(ds1503.actualDep).toBe('12:35');
    expect(ds1503.delayMinutes).toBe(50);

    // Timeline places HOLD_CONNECTING_FLIGHT at STD (08:50), not shifted backwards
    const baseline = runSimulation(dataset, []);
    const timeline = buildDominoTimeline(disrupted, baseline, sim, {
      id: 'hold-test',
      title: 'Hold DS1502',
      category: 'CONNECTION_HOLD',
      summary: 'Hold DS1502',
      rationale: 'Test',
      actions: [{ type: 'HOLD_CONNECTING_FLIGHT', connectionId: 'CX01', flightId: 'DS1502', holdMinutes: 65 }],
      actionDescriptions: ['Hold DS1502'],
      validation: holdRes,
      simulationResult: sim,
      comparison: computeBeforeAfterComparison(disrupted, sim),
      scorecard: computeRecoveryScorecard(disrupted, sim, computeBeforeAfterComparison(disrupted, sim), 1, 0, 1),
      recommended: false,
    });
    const holdEvt = timeline.find((e) => e.type === 'RECOVERY_ACTION')!;
    expect(holdEvt.timeLabel).toBe('08:50');
  });

  it('never claims passenger savings or fabricates delay savings for ineffective holds', () => {
    const dataset = loadDefaultFlightNetwork();

    // Case A: BOM 07:30-09:30 already delays DS1502 to 10:00 (+70m). Holding +15m (STD+15m = 09:05) changes nothing.
    const bomClosures: AirportClosureInput[] = [
      { id: 'c-bom', airportId: 'BOM', startTime: '07:30', endTime: '09:30' },
    ];
    const bomDisrupted = runSimulation(dataset, bomClosures);
    const noOpHold = validateRecoveryActions(
      dataset,
      bomClosures,
      [
        {
          type: 'HOLD_CONNECTING_FLIGHT',
          connectionId: 'CX01',
          flightId: 'DS1502',
          holdMinutes: 15,
        },
      ],
      bomDisrupted
    );
    expect(noOpHold.valid).toBe(true);
    const bomComp = computeBeforeAfterComparison(bomDisrupted, noOpHold.simulationResult!);
    expect(bomComp.deltas.delayMinutesSaved).toBe(0);
    expect(bomComp.deltas.flightsRecoveredCount).toBe(0);
    expect(bomComp.deltas.strandedPassengersSaved).toBe(0);
    expect(noOpHold.simulationResult!.flights.find((f) => f.flightId === 'DS1502')!.scheduledDep).toBe('08:50');

    // Case B: AMD 06:00-08:00 requires +65m for CX01; holding only +15m delays DS1502 (+15m) without rescuing CX01
    const amdClosures: AirportClosureInput[] = [
      { id: 'c-amd', airportId: 'AMD', startTime: '06:00', endTime: '08:00' },
    ];
    const amdDisrupted = runSimulation(dataset, amdClosures);
    const shortHold = validateRecoveryActions(
      dataset,
      amdClosures,
      [
        {
          type: 'HOLD_CONNECTING_FLIGHT',
          connectionId: 'CX01',
          flightId: 'DS1502',
          holdMinutes: 15,
        },
      ],
      amdDisrupted
    );
    expect(shortHold.valid).toBe(true);
    const amdComp = computeBeforeAfterComparison(amdDisrupted, shortHold.simulationResult!);
    expect(amdComp.deltas.delayMinutesSaved).toBe(-15);
    expect(amdComp.deltas.strandedPassengersSaved).toBe(0);
  });

  it('propagates downstream turnaround delays cleanly when holding Leg 1 past Leg 2 STD without corrupting schedule order', () => {
    const dataset = loadDefaultFlightNetwork();
    const baseline = runSimulation(dataset, []);
    // Hold DS0401 (STD 07:45, STA 08:50) by +120m -> actualDep 09:45, actualArr 10:50 (past DS0402 STD 09:20)
    const holdLeg1 = validateRecoveryActions(
      dataset,
      [],
      [
        {
          type: 'HOLD_CONNECTING_FLIGHT',
          connectionId: 'CX01',
          flightId: 'DS0401',
          holdMinutes: 120,
        },
      ],
      baseline
    );

    if (holdLeg1.valid) {
      const sim = holdLeg1.simulationResult!;
      const ds0401 = sim.flights.find((f) => f.flightId === 'DS0401')!;
      const ds0402 = sim.flights.find((f) => f.flightId === 'DS0402')!;
      expect(ds0401.scheduledDep).toBe('07:45');
      expect(ds0401.actualDep).toBe('09:45');
      expect(ds0401.delayMinutes).toBe(120);
      expect(ds0402.scheduledDep).toBe('09:20');
      expect(ds0402.actualDep).toBe('11:20');
      expect(ds0402.delayMinutes).toBe(120);
      expect(ds0402.turnaroundBeforeActualMins).toBe(30);
    } else {
      // Or rejected cleanly if crew/constraints are exceeded
      expect(holdLeg1.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe('Priority 2 regression - scorecard baseline isolation & crew/passenger curves', () => {
  it('does not penalize a recovery strategy for unchanged pre-existing baseline tight turnarounds or crew buffers', () => {
    const dataset = loadDefaultFlightNetwork();
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'AMD', startTime: '06:00', endTime: '08:00' },
    ];
    const disrupted = runSimulation(dataset, closures);

    // Deploy VT-DS17 on DS1204+: leaves CR03/CR10/CR11 and DS0402/DS1202 pre-existing tight margins untouched
    const cleanSpareRes = validateRecoveryActions(
      dataset,
      closures,
      [
        {
          type: 'DEPLOY_SPARE_TAIL_SUFFIX',
          spareTailId: 'VT-DS17',
          targetTailId: 'VT-DS12',
          fromFlightId: 'DS1204',
        },
      ],
      disrupted
    );
    expect(cleanSpareRes.valid).toBe(true);
    const cleanSim = cleanSpareRes.simulationResult!;
    const cleanComp = computeBeforeAfterComparison(disrupted, cleanSim);
    const cleanScorecard = computeRecoveryScorecard(
      disrupted,
      cleanSim,
      cleanComp,
      1,
      cleanSpareRes.reassignedFlightsCount,
      0
    );

    // Unchanged pre-existing DS0402/DS1202 (30m) and CR03/CR10/CR11 (<=20m) must not deduct points
    expect(cleanScorecard.crewLegalityScore).toBe(20);
    expect(cleanScorecard.aircraftFeasibilityScore).toBe(10);

    // Deploy VT-DS18 on DS1202+: CR-SP-DS18 starts with 0m duty margin -> deducts only for CR-SP-DS18 (19/20), not CR03/CR10/CR11
    const spareRes = validateRecoveryActions(
      dataset,
      closures,
      [
        {
          type: 'DEPLOY_SPARE_TAIL_SUFFIX',
          spareTailId: 'VT-DS18',
          targetTailId: 'VT-DS12',
          fromFlightId: 'DS1202',
        },
      ],
      disrupted
    );
    expect(spareRes.valid).toBe(true);
    const sim = spareRes.simulationResult!;
    const comp = computeBeforeAfterComparison(disrupted, sim);
    const scorecard = computeRecoveryScorecard(disrupted, sim, comp, 1, spareRes.reassignedFlightsCount, 0);

    expect(scorecard.crewLegalityScore).toBe(19);
    expect(scorecard.aircraftFeasibilityScore).toBe(10);
  });

  it('penalizes recovery-induced tight turnarounds, crew buffers, and drops unresolved crew violations to 0 when severe', () => {
    const dataset = loadDefaultFlightNetwork();
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'AMD', startTime: '06:00', endTime: '08:00' },
    ];
    const disrupted = runSimulation(dataset, closures);

    // Construct a recovered simulation with 2 unresolved crew violations and a recovery-induced 30m turnaround
    const mutatedSim = structuredClone(disrupted);
    mutatedSim.kpis.crewViolationsCount = 2;
    mutatedSim.kpis.totalCrewOvertimeMinutes = 50;
    const targetFlight = mutatedSim.flights.find((f) => f.flightId === 'DS0202')!;
    targetFlight.turnaroundBeforeActualMins = 30;
    targetFlight.actualDepMins += 5; // Changed from disrupted

    const comp = computeBeforeAfterComparison(disrupted, mutatedSim);
    const scorecard = computeRecoveryScorecard(disrupted, mutatedSim, comp, 1, 0, 1);

    expect(scorecard.crewLegalityScore).toBe(0);
    expect(scorecard.aircraftFeasibilityScore).toBe(9.5);
  });

  it('uses a consistent passenger protection curve across stranded and delayed-only scenarios', () => {
    const dataset = loadDefaultFlightNetwork();
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'BOM', startTime: '07:30', endTime: '08:00' },
    ];
    const disrupted = runSimulation(dataset, closures);
    const improved = runSimulation(dataset, []); // Full recovery baseline comparison

    // Force 0 stranded vs 1 stranded in disrupted to verify smooth transition without cliff jump
    const zeroStranded = structuredClone(disrupted);
    zeroStranded.kpis.strandedPassengers = 0;
    zeroStranded.kpis.failedConnectionsCount = 0;
    const oneStranded = structuredClone(disrupted);
    oneStranded.kpis.strandedPassengers = 1;

    const scoreZero = computeRecoveryScorecard(
      zeroStranded,
      improved,
      computeBeforeAfterComparison(zeroStranded, improved),
      1,
      2,
      0
    ).passengerProtectionScore;
    const scoreOne = computeRecoveryScorecard(
      oneStranded,
      improved,
      computeBeforeAfterComparison(oneStranded, improved),
      1,
      2,
      0
    ).passengerProtectionScore;

    expect(scoreZero).toBe(30);
    expect(scoreOne).toBe(30);
  });
});

describe('Priority 3 regression - hourly departure profile includes <05:00 and post-midnight departures', () => {
  it('captures pre-05:00 scheduled flights and avoids clamping >=24:00 next-day departures into 23:00', () => {
    const dataset = loadDefaultFlightNetwork();
    const modified = structuredClone(dataset) as FlightNetworkDataset;

    // Add a standalone 02:30-04:40 tail rotation (not colliding with existing aircraft)
    modified.flights.push({
      flight_id: 'DS9901',
      tail_id: 'VT-DS99',
      leg_order: 1,
      origin: 'AMD',
      destination: 'BOM',
      dep: '02:30',
      arr: '04:40',
      block_minutes: 130,
      pax: 120,
      turnaround_before_min: null,
    });
    modified.crews.push({
      crew_id: 'CR99',
      tail_id: 'VT-DS99',
      base: 'AMD',
      duty_start: '01:45',
      max_duty_mins: 600,
      flight_ids: ['DS9901'],
    });

    // Trigger CCU overnight closure pushing DS0304 (18:55 -> 21:20) to 23:35, or even past 00:00+1d
    const validated = validateFlightNetworkDataset(modified);
    const sim = runSimulation(validated, [
      { id: 'c-del', airportId: 'DEL', startTime: '18:30', endTime: '20:45' },
      { id: 'c-ccu', airportId: 'CCU', startTime: '22:00', endTime: '02:45' },
    ]);

    const ds0304 = sim.flights.find((f) => f.flightId === 'DS0304')!;
    expect(ds0304.actualDepMins).toBeGreaterThanOrEqual(1440); // 00:20+1d

    const profile = buildHourlyDepartureProfile(sim);
    const sumScheduled = profile.reduce((s, b) => s + b.scheduled, 0);
    const sumActual = profile.reduce((s, b) => s + b.actual, 0);

    expect(sumScheduled).toBe(validated.flights.length); // Includes 02:30 departure (71 total)
    expect(sumActual).toBe(validated.flights.length);
    expect(profile[0].hour).toBe('02:00');
    expect(profile[0].scheduled).toBe(1);
    expect(profile.some((b) => b.hour === '00:00+1d' && b.actual >= 1)).toBe(true);
  });
});

describe('Priority 4 & 5 regression - dataset sync, custom swap option & UI accessibility', () => {
  it('renders native accessible button items in DominoTimelinePanel and dynamic station counts in IndiaNetworkMap', () => {
    const dataset = loadDefaultFlightNetwork();
    const baseline = runSimulation(dataset, []);
    const closures: AirportClosureInput[] = [
      { id: 'c1', airportId: 'AMD', startTime: '06:00', endTime: '08:00' },
    ];
    const disrupted = runSimulation(dataset, closures);
    const events = buildDominoTimeline(disrupted, baseline);

    const timelineHtml = renderToStaticMarkup(
      React.createElement(DominoTimelinePanel, {
        events,
        hasClosures: true,
      })
    );
    expect(timelineHtml).toContain('<button type="button"');
    expect(timelineHtml).toContain('aria-current="step"');

    // Dynamic 2-airport map ARIA label must not be hardcoded to "16 stations"
    const miniHtml = renderToStaticMarkup(
      React.createElement(IndiaNetworkMap, {
        airports: dataset.airports.slice(0, 2),
        flights: disrupted.flights.slice(0, 1),
        airportImpacts: disrupted.airportImpacts.slice(0, 2),
        selectedAirportId: null,
        onSelectAirport: () => {},
      })
    );
    expect(miniHtml).toContain('aria-label="India airline route network map showing 2 stations');
    expect(miniHtml).not.toContain('showing 16 stations');

    // RecoveryIntelligencePanel renders cleanly with custom minimal dataset
    const { strategies, rejectedCount } = evaluateRecoveryStrategies(dataset, closures, disrupted);
    const recHtml = renderToStaticMarkup(
      React.createElement(RecoveryIntelligencePanel, {
        dataset: {
          ...dataset,
          spare_aircraft: [],
          connections: [],
        },
        closures,
        disruptedResult: disrupted,
        strategies,
        rejectedCount,
        selectedPreviewId: null,
        appliedStrategy: null,
        onSelectPreview: () => {},
        onApplyStrategy: () => {},
        onApplyCustomStrategy: () => {},
        onClearAppliedStrategy: () => {},
      })
    );
    expect(recHtml).toContain('Recovery Strategy Engine &amp; Scorecard');
  });
});



