import type {
  AirportImpactSummary,
  DelayReason,
  FlightSimulationResult,
  SimulationKPIs,
  SimulationResult,
} from './types';

export type FlightFilter = 'all' | 'delayed' | 'ontime';

export type SortField =
  | 'flightId'
  | 'tailId'
  | 'origin'
  | 'scheduledDepMins'
  | 'actualDepMins'
  | 'blockMinutes'
  | 'delayMinutes'
  | 'pax';

export type SortDirection = 'asc' | 'desc';

export interface OperationalAlert {
  id: string;
  severity: 'critical' | 'warning';
  category: string;
  message: string;
  detail: string;
}

export interface DelayCauseSummary {
  reason: string;
  flights: number;
  delayMins: number;
}

export interface HourlyDepartureBucket {
  hour: string;
  scheduled: number;
  actual: number;
}

export interface FleetUtilisationPoint {
  tailId: string;
  blockHours: number;
  delayMins: number;
  utilisationPct: number;
}

export interface ScenarioComparisonRow {
  label: string;
  base: string | number;
  sim: string | number;
  delta: number;
  unit: string;
  goodIfPositive: boolean;
}

export const DELAY_REASON_LABEL: Record<DelayReason, string> = {
  ORIGIN_CLOSURE: 'Origin Closure',
  DESTINATION_CLOSURE: 'Destination Closure',
  TURNAROUND_PROPAGATION: 'Turnaround Cascade',
};

export function formatDelta(current: number, base: number, suffix = ''): string | null {
  const diff = Number((current - base).toFixed(1));
  if (diff === 0) return null;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff}${suffix} vs baseline`;
}

export function filterAndSortFlights(
  flights: FlightSimulationResult[],
  options: {
    flightFilter: FlightFilter;
    airportFilter: string;
    searchQuery: string;
    sortField: SortField;
    sortDir: SortDirection;
  }
): FlightSimulationResult[] {
  const { flightFilter, airportFilter, searchQuery, sortField, sortDir } = options;
  const q = searchQuery.trim().toLowerCase();

  const filtered = flights.filter((f) => {
    if (flightFilter === 'delayed' && f.delayMinutes === 0) return false;
    if (flightFilter === 'ontime' && f.delayMinutes > 0) return false;
    if (airportFilter !== 'ALL' && f.origin !== airportFilter && f.destination !== airportFilter) {
      return false;
    }
    if (q) {
      const match =
        f.flightId.toLowerCase().includes(q) ||
        f.tailId.toLowerCase().includes(q) ||
        f.origin.toLowerCase().includes(q) ||
        f.destination.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'flightId':
        cmp = a.flightId.localeCompare(b.flightId);
        break;
      case 'tailId':
        cmp = a.tailId.localeCompare(b.tailId) || a.legOrder - b.legOrder;
        break;
      case 'origin':
        cmp = a.origin.localeCompare(b.origin) || a.destination.localeCompare(b.destination);
        break;
      case 'scheduledDepMins':
        cmp = a.scheduledDepMins - b.scheduledDepMins;
        break;
      case 'actualDepMins':
        cmp = a.actualDepMins - b.actualDepMins;
        break;
      case 'blockMinutes':
        cmp = a.blockMinutes - b.blockMinutes;
        break;
      case 'delayMinutes':
        cmp = a.delayMinutes - b.delayMinutes;
        break;
      case 'pax':
        cmp = a.pax - b.pax;
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
}

export function buildOperationalAlerts(simulationResult: SimulationResult): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  for (const c of simulationResult.closures) {
    alerts.push({
      id: `closure-${c.id}`,
      severity: 'critical',
      category: 'AIRPORT CLOSURE',
      message: `${c.airportId} closed ${c.startTime}–${c.endTime} IST`,
      detail: 'Departures and arrivals held outside closure window.',
    });
  }

  for (const cr of simulationResult.crewViolations) {
    alerts.push({
      id: `crew-${cr.crewId}`,
      severity: 'critical',
      category: 'CREW LEGALITY',
      message: `${cr.crewId} (${cr.tailId}) exceeds duty limit by +${cr.overtimeMins}m`,
      detail: `Actual duty ${cr.actualDutyMins}m vs max ${cr.maxDutyMins}m (end ${cr.actualDutyEnd}).`,
    });
  }

  for (const conn of simulationResult.failedConnections) {
    alerts.push({
      id: `conn-${conn.connectionId}`,
      severity: 'critical',
      category: 'MISSED CONNECTION',
      message: `${conn.connectionId} at ${conn.airport}: ${conn.passengers} pax stranded`,
      detail: `${conn.fromFlightId} (${conn.fromActualArr}) → ${conn.toFlightId} (${conn.toActualDep}) · shortfall ${conn.shortfallMinutes}m.`,
    });
  }

  const severeFlights = simulationResult.flights.filter((f) => f.delayMinutes >= 60);
  for (const f of severeFlights.slice(0, 6)) {
    alerts.push({
      id: `flt-${f.flightId}`,
      severity: 'warning',
      category: 'SEVERE DELAY',
      message: `${f.flightId} (${f.origin}→${f.destination}) delayed +${f.delayMinutes}m`,
      detail: `New ETD ${f.actualDep} · ${f.delayReasons.map((r) => DELAY_REASON_LABEL[r]).join(', ')}`,
    });
  }

  const tightCrews = simulationResult.crews.filter(
    (cr) => !cr.exceedsLimit && cr.maxDutyMins - cr.actualDutyMins <= 20
  );
  for (const cr of tightCrews) {
    alerts.push({
      id: `watch-${cr.crewId}`,
      severity: 'warning',
      category: 'DUTY MARGIN WATCH',
      message: `${cr.crewId} (${cr.tailId}) has ${cr.maxDutyMins - cr.actualDutyMins}m duty buffer`,
      detail: `Scheduled/actual duty ${cr.actualDutyMins}m of ${cr.maxDutyMins}m limit.`,
    });
  }

  return alerts;
}

export function buildAirportDelayChartData(
  simulationResult: SimulationResult
): AirportImpactSummary[] {
  return [...simulationResult.airportImpacts]
    .sort((a, b) => b.totalDepartureDelayMinutes - a.totalDepartureDelayMinutes)
    .slice(0, 10);
}

export function buildDelayCauseData(simulationResult: SimulationResult): DelayCauseSummary[] {
  const counts: Record<DelayReason, DelayCauseSummary> = {
    ORIGIN_CLOSURE: { reason: 'Origin Closure', flights: 0, delayMins: 0 },
    DESTINATION_CLOSURE: { reason: 'Destination Closure', flights: 0, delayMins: 0 },
    TURNAROUND_PROPAGATION: { reason: 'Turnaround Cascade', flights: 0, delayMins: 0 },
  };
  for (const f of simulationResult.flights) {
    if (f.delayMinutes <= 0) continue;
    for (const r of f.delayReasons) {
      counts[r].flights += 1;
      counts[r].delayMins += f.delayMinutes;
    }
  }
  return Object.values(counts);
}

export function buildHourlyDepartureProfile(
  simulationResult: SimulationResult
): HourlyDepartureBucket[] {
  const buckets = new Map<number, HourlyDepartureBucket>();
  for (let h = 5; h <= 23; h++) {
    buckets.set(h, { hour: `${String(h).padStart(2, '0')}:00`, scheduled: 0, actual: 0 });
  }
  for (const f of simulationResult.flights) {
    const sh = Math.floor(f.scheduledDepMins / 60);
    const ah = Math.min(23, Math.floor(f.actualDepMins / 60));
    const sb = buckets.get(sh);
    if (sb) sb.scheduled += 1;
    const ab = buckets.get(ah);
    if (ab) ab.actual += 1;
  }
  return Array.from(buckets.values()).filter((b) => b.scheduled > 0 || b.actual > 0);
}

export function buildFleetUtilisationData(
  simulationResult: SimulationResult
): FleetUtilisationPoint[] {
  return simulationResult.aircraftUtilisation
    .filter((a) => !a.isSpare)
    .map((a) => ({
      tailId: a.tailId.replace('VT-', ''),
      blockHours: Number((a.actualBlockMinutes / 60).toFixed(2)),
      delayMins: a.totalDelayMinutes,
      utilisationPct: a.utilisation24hPct,
    }));
}

export function buildScenarioComparisonRows(
  baseKpis: SimulationKPIs,
  kpis: SimulationKPIs
): ScenarioComparisonRow[] {
  return [
    {
      label: 'On-Time Performance (%)',
      base: `${baseKpis.onTimePerformancePct}%`,
      sim: `${kpis.onTimePerformancePct}%`,
      delta: Number((kpis.onTimePerformancePct - baseKpis.onTimePerformancePct).toFixed(1)),
      unit: '%',
      goodIfPositive: true,
    },
    {
      label: 'Delayed Flights',
      base: baseKpis.delayedFlights,
      sim: kpis.delayedFlights,
      delta: kpis.delayedFlights - baseKpis.delayedFlights,
      unit: '',
      goodIfPositive: false,
    },
    {
      label: 'Total Delay Minutes',
      base: `${baseKpis.totalDelayMinutes}m`,
      sim: `${kpis.totalDelayMinutes}m`,
      delta: kpis.totalDelayMinutes - baseKpis.totalDelayMinutes,
      unit: 'm',
      goodIfPositive: false,
    },
    {
      label: 'Failed Connections',
      base: baseKpis.failedConnectionsCount,
      sim: kpis.failedConnectionsCount,
      delta: kpis.failedConnectionsCount - baseKpis.failedConnectionsCount,
      unit: '',
      goodIfPositive: false,
    },
    {
      label: 'Stranded Passengers',
      base: baseKpis.strandedPassengers,
      sim: kpis.strandedPassengers,
      delta: kpis.strandedPassengers - baseKpis.strandedPassengers,
      unit: '',
      goodIfPositive: false,
    },
    {
      label: 'Crew Duty Violations',
      base: baseKpis.crewViolationsCount,
      sim: kpis.crewViolationsCount,
      delta: kpis.crewViolationsCount - baseKpis.crewViolationsCount,
      unit: '',
      goodIfPositive: false,
    },
    {
      label: 'Crew Overtime Minutes',
      base: `${baseKpis.totalCrewOvertimeMinutes}m`,
      sim: `${kpis.totalCrewOvertimeMinutes}m`,
      delta: kpis.totalCrewOvertimeMinutes - baseKpis.totalCrewOvertimeMinutes,
      unit: 'm',
      goodIfPositive: false,
    },
  ];
}
