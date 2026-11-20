import { describe, expect, it } from 'vitest';
import { loadDefaultFlightNetwork, validateFlightNetworkDataset } from './dataLoader';
import { runSimulation } from './simulationEngine';
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
});

describe('simulationEngine - aircraft turnaround & delay propagation', () => {
  it('enforces minimum 30-minute turnaround and cascades delays across subsequent legs', () => {
    const dataset = loadDefaultFlightNetwork();
    // VT-DS04:
    // DS0401 BOM->GOI 07:45-08:50
    // DS0402 GOI->BOM 09:20-10:25 (scheduled turnaround = 30m)
    // DS0403 BOM->PNQ 11:35-12:15 (scheduled turnaround = 70m)
    // DS0404 PNQ->BOM 12:50-13:30 (scheduled turnaround = 35m)
    // DS0405 BOM->AMD 14:45-15:55 (scheduled turnaround = 75m)
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
    // CR03: duty_start 11:30 (690), max_duty_mins 600 (limit 21:30 = 1290).
    // DS0304 DEL->CCU scheduled 18:55-21:20 (590m baseline duty).
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
