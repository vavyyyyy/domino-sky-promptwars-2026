import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  Clock,
  Globe,
  LayoutDashboard,
  Plane,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Upload,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { IndiaNetworkMap } from './components/IndiaNetworkMap';
import { loadDefaultFlightNetwork, validateFlightNetworkDataset } from './dataLoader';
import { runSimulation } from './simulationEngine';
import { formatDuration, parseClosureTimeToMinutes } from './timeUtils';
import type {
  AirportClosureInput,
  DelayReason,
  FlightNetworkDataset,
  FlightSimulationResult,
  SimulationResult,
} from './types';

type NavSection =
  | 'overview'
  | 'flights'
  | 'map'
  | 'simulator'
  | 'recovery'
  | 'analytics';

type FlightFilter = 'all' | 'delayed' | 'ontime';

type SortField =
  | 'flightId'
  | 'tailId'
  | 'origin'
  | 'scheduledDepMins'
  | 'actualDepMins'
  | 'blockMinutes'
  | 'delayMinutes'
  | 'pax';

type SortDirection = 'asc' | 'desc';

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'flights', label: 'Flight Operations', icon: Plane },
  { id: 'map', label: 'Network Map', icon: Globe },
  { id: 'simulator', label: 'Disruption Simulator', icon: SlidersHorizontal },
  { id: 'recovery', label: 'Recovery Centre', icon: Wrench },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

const NAV_TITLES: Record<NavSection, string> = {
  overview: 'Network Operations Overview',
  flights: 'Flight Operations Schedule',
  map: 'India Flight Network Map',
  simulator: 'Disruption Cascade Simulator',
  recovery: 'Recovery & Resource Centre',
  analytics: 'Operational Analytics',
};

const DELAY_REASON_LABEL: Record<DelayReason, string> = {
  ORIGIN_CLOSURE: 'Origin Closure',
  DESTINATION_CLOSURE: 'Destination Closure',
  TURNAROUND_PROPAGATION: 'Turnaround Cascade',
};

function formatDelta(current: number, base: number, suffix = ''): string | null {
  const diff = Number((current - base).toFixed(1));
  if (diff === 0) return null;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff}${suffix} vs baseline`;
}

function formatCurrentIstClock(now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);
  } catch {
    return now.toISOString().slice(11, 19);
  }
}

export function App() {
  const initialLoad = useMemo(() => {
    try {
      return { dataset: loadDefaultFlightNetwork(), error: null as string | null };
    } catch (err) {
      return {
        dataset: null as FlightNetworkDataset | null,
        error: err instanceof Error ? err.message : 'Failed to load flight_network.json',
      };
    }
  }, []);

  const [dataset, setDataset] = useState<FlightNetworkDataset | null>(initialLoad.dataset);
  const [loadError, setLoadError] = useState<string | null>(initialLoad.error);

  const [activeNav, setActiveNav] = useState<NavSection>('overview');
  const [selectedAirportId, setSelectedAirportId] = useState<string | null>(null);

  const [stagedClosures, setStagedClosures] = useState<AirportClosureInput[]>([]);
  const [committedClosures, setCommittedClosures] = useState<AirportClosureInput[]>([]);
  const [formAirport, setFormAirport] = useState<string>('BOM');
  const [formStart, setFormStart] = useState<string>('08:00');
  const [formEnd, setFormEnd] = useState<string>('10:00');
  const [closureError, setClosureError] = useState<string | null>(null);

  const [flightFilter, setFlightFilter] = useState<FlightFilter>('all');
  const [airportFilter, setAirportFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('scheduledDepMins');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const baselineResult: SimulationResult | null = useMemo(() => {
    if (!dataset) return null;
    return runSimulation(dataset, []);
  }, [dataset]);

  const simulationResult: SimulationResult | null = useMemo(() => {
    if (!dataset) return null;
    return runSimulation(dataset, committedClosures);
  }, [dataset, committedClosures]);

  const hasPendingChanges = useMemo(() => {
    return JSON.stringify(stagedClosures) !== JSON.stringify(committedClosures);
  }, [stagedClosures, committedClosures]);

  const handleAddClosure = (e: React.FormEvent) => {
    e.preventDefault();
    setClosureError(null);
    try {
      const startMins = parseClosureTimeToMinutes(formStart);
      const endMins = parseClosureTimeToMinutes(formEnd);
      if (endMins <= startMins) {
        setClosureError('Closure end time must be strictly after start time.');
        return;
      }
      const next: AirportClosureInput = {
        id: `${formAirport}-${formStart}-${formEnd}-${stagedClosures.length + 1}`,
        airportId: formAirport,
        startTime: formStart,
        endTime: formEnd,
      };
      setStagedClosures((prev) => [...prev, next]);
    } catch (err) {
      setClosureError(err instanceof Error ? err.message : 'Invalid time input.');
    }
  };

  const handleRemoveClosure = (id: string) => {
    setStagedClosures((prev) => prev.filter((c) => c.id !== id));
  };

  const handleRunSimulation = () => {
    setClosureError(null);
    setCommittedClosures([...stagedClosures]);
  };

  const handleResetToBaseline = () => {
    setClosureError(null);
    setStagedClosures([]);
    setCommittedClosures([]);
  };

  const handleQuickCloseAirport = (airportId: string) => {
    setFormAirport(airportId);
    setActiveNav('simulator');
  };

  const handleUploadDataset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validated = validateFlightNetworkDataset(parsed);
      setDataset(validated);
      setLoadError(null);
      setStagedClosures([]);
      setCommittedClosures([]);
      setSelectedAirportId(null);
      if (validated.airports.length > 0) {
        setFormAirport(validated.airports[0].id);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Invalid JSON dataset.');
    } finally {
      e.target.value = '';
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'delayMinutes' ? 'desc' : 'asc');
    }
  };

  const filteredAndSortedFlights: FlightSimulationResult[] = useMemo(() => {
    if (!simulationResult) return [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = simulationResult.flights.filter((f) => {
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
  }, [simulationResult, flightFilter, airportFilter, searchQuery, sortField, sortDir]);

  const operationalAlerts = useMemo(() => {
    if (!simulationResult) return [];
    const alerts: Array<{
      id: string;
      severity: 'critical' | 'warning';
      category: string;
      message: string;
      detail: string;
    }> = [];

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
  }, [simulationResult]);

  const airportDelayChartData = useMemo(() => {
    if (!simulationResult) return [];
    return [...simulationResult.airportImpacts]
      .sort((a, b) => b.totalDepartureDelayMinutes - a.totalDepartureDelayMinutes)
      .slice(0, 10);
  }, [simulationResult]);

  const delayCauseData = useMemo(() => {
    if (!simulationResult) return [];
    const counts: Record<DelayReason, { reason: string; flights: number; delayMins: number }> = {
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
  }, [simulationResult]);

  const hourlyDepartureProfile = useMemo(() => {
    if (!simulationResult) return [];
    const buckets = new Map<number, { hour: string; scheduled: number; actual: number }>();
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
  }, [simulationResult]);

  const fleetUtilisationData = useMemo(() => {
    if (!simulationResult) return [];
    return simulationResult.aircraftUtilisation
      .filter((a) => !a.isSpare)
      .map((a) => ({
        tailId: a.tailId.replace('VT-', ''),
        blockHours: Number((a.actualBlockMinutes / 60).toFixed(2)),
        delayMins: a.totalDelayMinutes,
        utilisationPct: a.utilisation24hPct,
      }));
  }, [simulationResult]);

  if (!dataset || !baselineResult || !simulationResult) {
    return (
      <div className="min-h-screen bg-[#F3F5F7] text-[#253342] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-[#B94A48]/40 rounded-md p-6 shadow-[0_1px_2px_rgba(23,35,51,0.04)]">
          <div className="flex items-center gap-2.5 text-[#B94A48] mb-2">
            <AlertTriangle className="w-5 h-5" />
            <h1 className="text-base font-semibold">Dataset Validation Error</h1>
          </div>
          <p className="text-xs text-[#253342]">{loadError ?? 'Unable to initialize dataset.'}</p>
        </div>
      </div>
    );
  }

  const { kpis } = simulationResult;
  const baseKpis = baselineResult.kpis;
  const isDisrupted = committedClosures.length > 0;

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-[#75818D] inline ml-1" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-[#477F7A] inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[#477F7A] inline ml-1" />
    );
  };

  const renderFlightTable = (maxRows?: number) => {
    const rows = maxRows ? filteredAndSortedFlights.slice(0, maxRows) : filteredAndSortedFlights;
    return (
      <div className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <h3 className="text-xs font-semibold text-[#253342] tracking-tight">
              Flight Operations Schedule
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-[#75818D]">
              {filteredAndSortedFlights.length} of {simulationResult.flights.length} legs
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#75818D] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search flight, tail, station..."
                aria-label="Search flights"
                className="h-7 w-48 bg-[#F8FAFB] border border-[#DCE2E8] rounded pl-7 pr-2 text-xs text-[#253342] placeholder:text-[#75818D] focus-visible:outline-none focus-visible:border-[#477F7A] focus-visible:bg-white"
              />
            </div>

            <div className="flex items-center bg-[#F3F5F7] border border-[#DCE2E8] rounded p-0.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'delayed', label: `Delayed (${kpis.delayedFlights})` },
                  { id: 'ontime', label: `On Time (${kpis.onTimeFlights})` },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFlightFilter(opt.id)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    flightFilter === opt.id
                      ? 'bg-[#477F7A] text-white'
                      : 'text-[#75818D] hover:text-[#253342]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <select
              aria-label="Filter by airport"
              value={airportFilter}
              onChange={(e) => setAirportFilter(e.target.value)}
              className="h-7 bg-white border border-[#DCE2E8] rounded px-2 text-xs text-[#253342] focus-visible:outline-none focus-visible:border-[#477F7A]"
            >
              <option value="ALL">All Stations</option>
              {dataset.airports.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} — {a.city}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F8FAFB] text-[#75818D] border-b border-[#DCE2E8] text-[11px] font-medium">
                <th className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => handleSort('flightId')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap"
                  >
                    Flight {renderSortIcon('flightId')}
                  </button>
                </th>
                <th className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => handleSort('tailId')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap"
                  >
                    Tail / Leg {renderSortIcon('tailId')}
                  </button>
                </th>
                <th className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => handleSort('origin')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap"
                  >
                    Sector {renderSortIcon('origin')}
                  </button>
                </th>
                <th className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => handleSort('scheduledDepMins')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap"
                  >
                    STD / STA {renderSortIcon('scheduledDepMins')}
                  </button>
                </th>
                <th className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => handleSort('actualDepMins')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap"
                  >
                    ETD / ETA {renderSortIcon('actualDepMins')}
                  </button>
                </th>
                <th className="py-2 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('blockMinutes')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap"
                  >
                    Block {renderSortIcon('blockMinutes')}
                  </button>
                </th>
                <th className="py-2 px-3 text-right">Turn</th>
                <th className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => handleSort('delayMinutes')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap"
                  >
                    Status / Delay {renderSortIcon('delayMinutes')}
                  </button>
                </th>
                <th className="py-2 px-3">Attribution</th>
                <th className="py-2 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('pax')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap"
                  >
                    Pax {renderSortIcon('pax')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE2E8]">
              {rows.map((f) => {
                const isDelayed = f.delayMinutes > 0;
                const isSevere = f.delayMinutes >= 60;
                return (
                  <tr key={f.flightId} className="hover:bg-[#F7F9FB] transition-colors h-9">
                    <td className="py-1.5 px-3 font-mono tabular-nums font-semibold text-[#253342] whitespace-nowrap">
                      {f.flightId}
                    </td>
                    <td className="py-1.5 px-3 font-mono tabular-nums text-[#253342] whitespace-nowrap">
                      {f.tailId} <span className="text-[#75818D]">L{f.legOrder}</span>
                    </td>
                    <td className="py-1.5 px-3 font-mono whitespace-nowrap text-[#253342]">
                      <span>{f.origin}</span>
                      <ArrowRight className="inline w-3 h-3 mx-1 text-[#75818D]" />
                      <span>{f.destination}</span>
                    </td>
                    <td className="py-1.5 px-3 font-mono tabular-nums text-[#75818D] whitespace-nowrap">
                      {f.scheduledDep} – {f.scheduledArr}
                    </td>
                    <td
                      className={`py-1.5 px-3 font-mono tabular-nums font-medium whitespace-nowrap ${
                        isSevere
                          ? 'text-[#B94A48]'
                          : isDelayed
                            ? 'text-[#C18B45]'
                            : 'text-[#253342]'
                      }`}
                    >
                      {f.actualDep} – {f.actualArr}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-[#253342]">
                      {f.blockMinutes}m
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-[#75818D]">
                      {f.turnaroundBeforeActualMins !== null
                        ? `${f.turnaroundBeforeActualMins}m`
                        : '—'}
                    </td>
                    <td className="py-1.5 px-3 font-mono tabular-nums whitespace-nowrap">
                      {isDelayed ? (
                        <span
                          className={`inline-flex items-center gap-1.5 font-semibold ${
                            isSevere ? 'text-[#B94A48]' : 'text-[#C18B45]'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSevere ? 'bg-[#B94A48]' : 'bg-[#C18B45]'
                            }`}
                          />
                          Delayed +{f.delayMinutes}m
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[#2E7D5B] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D5B]" />
                          On Time
                        </span>
                      )}
                    </td>
                    <td
                      className="py-1.5 px-3 text-[#75818D] max-w-[220px] truncate"
                      title={f.delayNotes.join(' | ')}
                    >
                      {f.delayReasons.length === 0
                        ? '—'
                        : f.delayReasons.map((r) => DELAY_REASON_LABEL[r]).join(' · ')}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-[#253342]">
                      {f.pax}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-[#75818D]">
                    No flights match the current filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {maxRows && filteredAndSortedFlights.length > maxRows && (
          <div className="px-4 py-2 border-t border-[#DCE2E8] bg-[#F8FAFB] flex items-center justify-between text-xs text-[#75818D]">
            <span>
              Showing {maxRows} of {filteredAndSortedFlights.length} flights
            </span>
            <button
              type="button"
              onClick={() => setActiveNav('flights')}
              className="text-[#477F7A] hover:text-[#35635F] font-medium cursor-pointer"
            >
              View full Flight Operations schedule →
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderClosureControlsPanel = (compact = false) => (
    <div className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#477F7A]" />
          <h3 className="text-xs font-semibold text-[#253342]">Airport Closure Controls</h3>
        </div>
        {hasPendingChanges && (
          <span className="text-[11px] font-medium text-[#C18B45]">Pending simulation</span>
        )}
      </div>

      <form onSubmit={handleAddClosure} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
        <div className={compact ? 'sm:col-span-5' : 'sm:col-span-4'}>
          <label
            htmlFor="closure-airport-input"
            className="block text-[11px] text-[#75818D] mb-1"
          >
            Station
          </label>
          <select
            id="closure-airport-input"
            value={formAirport}
            onChange={(e) => setFormAirport(e.target.value)}
            className="w-full h-8 bg-white border border-[#DCE2E8] rounded px-2 text-xs text-[#253342] focus-visible:outline-none focus-visible:border-[#477F7A]"
          >
            {dataset.airports.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id} — {a.city}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-3">
          <label
            htmlFor="closure-start-input"
            className="block text-[11px] text-[#75818D] mb-1"
          >
            Start (IST)
          </label>
          <input
            id="closure-start-input"
            type="time"
            value={formStart}
            onChange={(e) => setFormStart(e.target.value)}
            required
            className="w-full h-8 bg-white border border-[#DCE2E8] rounded px-2 text-xs font-mono tabular-nums text-[#253342] focus-visible:outline-none focus-visible:border-[#477F7A]"
          />
        </div>

        <div className="sm:col-span-3">
          <label
            htmlFor="closure-end-input"
            className="block text-[11px] text-[#75818D] mb-1"
          >
            End (IST)
          </label>
          <input
            id="closure-end-input"
            type="time"
            value={formEnd}
            onChange={(e) => setFormEnd(e.target.value)}
            required
            className="w-full h-8 bg-white border border-[#DCE2E8] rounded px-2 text-xs font-mono tabular-nums text-[#253342] focus-visible:outline-none focus-visible:border-[#477F7A]"
          />
        </div>

        <div className={compact ? 'sm:col-span-1' : 'sm:col-span-2'}>
          <button
            type="submit"
            title="Add closure window"
            className="w-full h-8 flex items-center justify-center gap-1 bg-[#F3F5F7] hover:bg-[#E7ECF0] text-[#253342] border border-[#DCE2E8] rounded px-2 text-xs font-medium cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-[#477F7A]" />
            {!compact && <span>Add</span>}
          </button>
        </div>
      </form>

      {closureError && (
        <p className="text-[11px] text-[#B94A48] bg-[#B94A48]/10 border border-[#B94A48]/30 rounded px-2.5 py-1">
          {closureError}
        </p>
      )}

      {stagedClosures.length > 0 && (
        <div className="space-y-1.5">
          {stagedClosures.map((c) => {
            const isCommitted = committedClosures.some((cc) => cc.id === c.id);
            return (
              <div
                key={c.id}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded border text-xs ${
                  isCommitted
                    ? 'bg-[#B94A48]/8 border-[#B94A48]/30 text-[#253342]'
                    : 'bg-[#C18B45]/10 border-[#C18B45]/35 text-[#253342]'
                }`}
              >
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <span className="font-semibold text-[#477F7A]">{c.airportId}</span>
                  <span>
                    {c.startTime}–{c.endTime}
                  </span>
                  <span className="font-sans text-[11px] text-[#75818D]">
                    {isCommitted ? 'Active' : 'Staged'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveClosure(c.id)}
                  aria-label={`Remove ${c.airportId} closure`}
                  className="p-1 text-[#75818D] hover:text-[#B94A48] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleRunSimulation}
          className="flex-1 h-8 flex items-center justify-center gap-1.5 bg-[#477F7A] hover:bg-[#3A6A66] text-white font-semibold rounded px-3 text-xs cursor-pointer transition-colors whitespace-nowrap"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Run Simulation
        </button>
        <button
          type="button"
          onClick={handleResetToBaseline}
          disabled={stagedClosures.length === 0 && committedClosures.length === 0}
          className="h-8 flex items-center justify-center gap-1 bg-white hover:bg-[#F3F5F7] disabled:opacity-45 disabled:cursor-not-allowed text-[#253342] border border-[#DCE2E8] rounded px-3 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F3F5F7] text-[#253342] flex font-sans">
      {/* Fixed Left Enterprise Sidebar (#172333 deep navy, #263746 secondary panels) */}
      <aside className="w-60 bg-[#172333] border-r border-[#263746] flex flex-col shrink-0 lg:fixed lg:inset-y-0 lg:left-0 z-20 text-white">
        {/* Brand Mark */}
        <div className="h-12 px-4 border-b border-[#263746] flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-[#263746] border border-[#477F7A]/50 flex items-center justify-center shrink-0">
            <Plane className="w-4 h-4 text-[#DCE2E8]" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-bold tracking-tight text-white block leading-none">
              DOMINO SKY
            </span>
            <span className="text-[10px] text-[#9FB0C0] tracking-wide block mt-0.5">
              Network OCC
            </span>
          </div>
        </div>

        {/* Navigation Links (Muted teal #477F7A active highlight) */}
        <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#477F7A] text-white'
                    : 'text-[#B8C4D0] hover:text-white hover:bg-[#263746]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.id === 'simulator' && stagedClosures.length > 0 && (
                  <span
                    className={`font-mono tabular-nums text-[11px] font-semibold ${
                      isActive ? 'text-white' : 'text-[#E3B26F]'
                    }`}
                  >
                    {stagedClosures.length}
                  </span>
                )}
                {item.id === 'recovery' &&
                  kpis.failedConnectionsCount + kpis.crewViolationsCount > 0 && (
                    <span
                      className={`font-mono tabular-nums text-[11px] font-semibold ${
                        isActive ? 'text-white' : 'text-[#E08785]'
                      }`}
                    >
                      {kpis.failedConnectionsCount + kpis.crewViolationsCount}
                    </span>
                  )}
              </button>
            );
          })}
        </nav>

        {/* Dataset Telemetry & Upload Footer (#263746 secondary panel) */}
        <div className="p-3 border-t border-[#263746] bg-[#1D2B3D] space-y-2 text-[11px]">
          <div className="flex justify-between text-[#9FB0C0]">
            <span>Schedule</span>
            <span className="font-mono text-white truncate max-w-[125px]">
              {dataset.meta.dataset}
            </span>
          </div>
          <div className="flex justify-between text-[#9FB0C0] font-mono tabular-nums">
            <span className="font-sans">Turnaround Min</span>
            <span className="text-white">{dataset.meta.min_turnaround_minutes}m</span>
          </div>
          <div className="flex justify-between text-[#9FB0C0] font-mono tabular-nums">
            <span className="font-sans">Fleet</span>
            <span className="text-white">
              {kpis.activeAircraftCount} active · {kpis.spareAircraftCount} spare
            </span>
          </div>
          <label className="mt-1 w-full h-7 flex items-center justify-center gap-1.5 rounded bg-[#263746] hover:bg-[#314557] border border-[#3B5166] text-[#E6ECF2] hover:text-white cursor-pointer transition-colors">
            <Upload className="w-3 h-3 text-[#9FB0C0]" />
            <span>Load Network JSON</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleUploadDataset}
              className="hidden"
            />
          </label>
          {loadError && (
            <p className="text-[#E08785] text-[11px] leading-snug">{loadError}</p>
          )}
        </div>
      </aside>

      {/* Main Content Area (#F3F5F7 light-grey workspace) */}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        {/* Compact Top Operational Header */}
        <header className="h-12 bg-white border-b border-[#DCE2E8] px-5 flex items-center justify-between gap-4 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-sm font-semibold text-[#253342] truncate">
              {NAV_TITLES[activeNav]}
            </h1>
            <span className="text-[#DCE2E8] hidden sm:inline" aria-hidden="true">
              /
            </span>
            <span
              className={`text-xs font-medium hidden sm:inline whitespace-nowrap ${
                isDisrupted ? 'text-[#B94A48]' : 'text-[#2E7D5B]'
              }`}
            >
              {isDisrupted
                ? `Disrupted · ${committedClosures.length} closure${committedClosures.length > 1 ? 's' : ''} active`
                : 'System Nominal · Baseline Schedule'}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs shrink-0">
            {hasPendingChanges && (
              <button
                type="button"
                onClick={handleRunSimulation}
                className="h-7 px-2.5 rounded bg-[#477F7A] hover:bg-[#3A6A66] text-white font-semibold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3 h-3 fill-current" />
                Apply Changes
              </button>
            )}

            <div className="hidden md:flex items-center gap-1.5 text-[#75818D] font-mono tabular-nums">
              <Clock className="w-3.5 h-3.5 text-[#647D91]" />
              <span>
                {dataset.meta.operating_day} · {formatCurrentIstClock(now)} IST
              </span>
            </div>

            <div className="flex items-center gap-2 pl-3 border-l border-[#DCE2E8] text-[#253342]">
              <div className="w-6 h-6 rounded bg-[#F3F5F7] border border-[#DCE2E8] flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-[#647D91]" />
              </div>
              <span className="hidden sm:inline text-xs font-medium whitespace-nowrap">
                OCC Dispatch
              </span>
            </div>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 p-4 lg:p-5 space-y-4">
          {/* Compact Enterprise KPI Strip */}
          {(activeNav === 'overview' || activeNav === 'simulator' || activeNav === 'recovery') && (
            <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
              <div className="bg-white border border-[#DCE2E8] rounded-md px-3.5 py-2.5 shadow-[0_1px_2px_rgba(23,35,51,0.04)]">
                <div className="flex items-center justify-between text-[11px] text-[#75818D]">
                  <span>On-Time Performance</span>
                  <span
                    className={`font-medium font-mono tabular-nums ${
                      kpis.onTimePerformancePct === 100
                        ? 'text-[#2E7D5B]'
                        : kpis.onTimePerformancePct >= 85
                          ? 'text-[#C18B45]'
                          : 'text-[#B94A48]'
                    }`}
                  >
                    {kpis.onTimeFlights}/{kpis.totalFlights}
                  </span>
                </div>
                <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-[#253342]">
                  {kpis.onTimePerformancePct}%
                </div>
                <div className="text-[11px] text-[#75818D] font-mono tabular-nums">
                  {kpis.delayedFlights} delayed flights
                </div>
              </div>

              <div className="bg-white border border-[#DCE2E8] rounded-md px-3.5 py-2.5 shadow-[0_1px_2px_rgba(23,35,51,0.04)]">
                <div className="flex items-center justify-between text-[11px] text-[#75818D]">
                  <span>Total Network Delay</span>
                  <span className="text-[#75818D] font-mono tabular-nums">
                    Max {kpis.maxDelayMinutes}m
                  </span>
                </div>
                <div
                  className={`mt-1 text-lg font-semibold font-mono tabular-nums ${
                    kpis.totalDelayMinutes > 0 ? 'text-[#C18B45]' : 'text-[#253342]'
                  }`}
                >
                  {kpis.totalDelayMinutes}m
                </div>
                <div className="text-[11px] text-[#75818D] font-mono tabular-nums">
                  Avg {kpis.averageDelayPerDelayedFlight}m / delayed leg
                </div>
              </div>

              <div className="bg-white border border-[#DCE2E8] rounded-md px-3.5 py-2.5 shadow-[0_1px_2px_rgba(23,35,51,0.04)]">
                <div className="flex items-center justify-between text-[11px] text-[#75818D]">
                  <span>Failed Connections</span>
                  <span className="text-[#75818D] font-mono tabular-nums">
                    of {kpis.totalConnections}
                  </span>
                </div>
                <div
                  className={`mt-1 text-lg font-semibold font-mono tabular-nums ${
                    kpis.failedConnectionsCount > 0 ? 'text-[#B94A48]' : 'text-[#2E7D5B]'
                  }`}
                >
                  {kpis.failedConnectionsCount}
                </div>
                <div className="text-[11px] text-[#75818D] font-mono tabular-nums">
                  {formatDelta(kpis.failedConnectionsCount, baseKpis.failedConnectionsCount) ??
                    '100% connections intact'}
                </div>
              </div>

              <div className="bg-white border border-[#DCE2E8] rounded-md px-3.5 py-2.5 shadow-[0_1px_2px_rgba(23,35,51,0.04)]">
                <div className="flex items-center justify-between text-[11px] text-[#75818D]">
                  <span>Stranded Passengers</span>
                  <span className="text-[#75818D] font-mono tabular-nums">
                    {kpis.delayedPassengers} delayed
                  </span>
                </div>
                <div
                  className={`mt-1 text-lg font-semibold font-mono tabular-nums ${
                    kpis.strandedPassengers > 0 ? 'text-[#B94A48]' : 'text-[#253342]'
                  }`}
                >
                  {kpis.strandedPassengers}
                </div>
                <div className="text-[11px] text-[#75818D] font-mono tabular-nums">
                  of {kpis.totalPassengers} scheduled pax
                </div>
              </div>

              <div className="bg-white border border-[#DCE2E8] rounded-md px-3.5 py-2.5 shadow-[0_1px_2px_rgba(23,35,51,0.04)] col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-[11px] text-[#75818D]">
                  <span>Crew Violations</span>
                  <span className="text-[#75818D] font-mono tabular-nums">
                    Util {kpis.averageAircraftUtilisationPct}%
                  </span>
                </div>
                <div
                  className={`mt-1 text-lg font-semibold font-mono tabular-nums ${
                    kpis.crewViolationsCount > 0 ? 'text-[#B94A48]' : 'text-[#2E7D5B]'
                  }`}
                >
                  {kpis.crewViolationsCount} / {kpis.totalCrews}
                </div>
                <div className="text-[11px] text-[#75818D] font-mono tabular-nums">
                  {kpis.totalCrewOvertimeMinutes > 0
                    ? `${kpis.totalCrewOvertimeMinutes}m total overtime`
                    : 'All crews legal'}
                </div>
              </div>
            </section>
          )}

          {/* VIEW 1: OVERVIEW */}
          {activeNav === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
                <div className="xl:col-span-7 flex flex-col">
                  <IndiaNetworkMap
                    airports={dataset.airports}
                    flights={simulationResult.flights}
                    airportImpacts={simulationResult.airportImpacts}
                    selectedAirportId={selectedAirportId}
                    onSelectAirport={setSelectedAirportId}
                    onQuickCloseAirport={handleQuickCloseAirport}
                    compact
                  />
                </div>

                <div className="xl:col-span-5 flex flex-col gap-4">
                  {/* Dedicated Operational Alerts Panel */}
                  <div className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] flex-1 flex flex-col min-h-[240px]">
                    <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-3.5 h-3.5 text-[#647D91]" />
                        <h3 className="text-xs font-semibold text-[#253342]">Operational Alerts</h3>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-[#75818D]">
                        {operationalAlerts.length} items
                      </span>
                    </div>

                    <div className="divide-y divide-[#DCE2E8] overflow-y-auto max-h-[260px]">
                      {operationalAlerts.length === 0 ? (
                        <div className="p-4 text-xs text-[#75818D] flex items-start gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-[#2E7D5B] shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[#253342] font-medium">
                              All network operations nominal
                            </p>
                            <p className="mt-0.5 text-[#75818D]">
                              70 flights on schedule, 21 passenger connections protected, and 16 crew
                              rosters within duty limits.
                            </p>
                          </div>
                        </div>
                      ) : (
                        operationalAlerts.map((alert) => (
                          <div key={alert.id} className="px-4 py-2.5 text-xs space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-[10px] font-mono font-semibold ${
                                  alert.severity === 'critical'
                                    ? 'text-[#B94A48]'
                                    : 'text-[#C18B45]'
                                }`}
                              >
                                {alert.category}
                              </span>
                            </div>
                            <p className="text-[#253342] font-medium">{alert.message}</p>
                            <p className="text-[11px] text-[#75818D] font-mono tabular-nums">
                              {alert.detail}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Quick Closure Simulator */}
                  {renderClosureControlsPanel(true)}
                </div>
              </div>

              {/* Flight Operations Table */}
              {renderFlightTable(20)}
            </div>
          )}

          {/* VIEW 2: FLIGHT OPERATIONS */}
          {activeNav === 'flights' && <div className="space-y-4">{renderFlightTable()}</div>}

          {/* VIEW 3: NETWORK MAP */}
          {activeNav === 'map' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              <div className="xl:col-span-7">
                <IndiaNetworkMap
                  airports={dataset.airports}
                  flights={simulationResult.flights}
                  airportImpacts={simulationResult.airportImpacts}
                  selectedAirportId={selectedAirportId}
                  onSelectAirport={setSelectedAirportId}
                  onQuickCloseAirport={handleQuickCloseAirport}
                />
              </div>

              <div className="xl:col-span-5 bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#253342]">
                    Station Operational Summary
                  </h3>
                  <span className="text-[11px] text-[#75818D] font-mono tabular-nums">
                    Click row to focus
                  </span>
                </div>
                <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F8FAFB] text-[#75818D] border-b border-[#DCE2E8] text-[11px] font-medium sticky top-0">
                        <th className="py-2 px-3">Station</th>
                        <th className="py-2 px-2 text-right">Dep</th>
                        <th className="py-2 px-2 text-right">Arr</th>
                        <th className="py-2 px-2 text-right">Delayed</th>
                        <th className="py-2 px-2 text-right">Delay</th>
                        <th className="py-2 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE2E8]">
                      {simulationResult.airportImpacts.map((imp) => {
                        const isSelected = selectedAirportId === imp.airportId;
                        return (
                          <tr
                            key={imp.airportId}
                            onClick={() =>
                              setSelectedAirportId(isSelected ? null : imp.airportId)
                            }
                            className={`cursor-pointer transition-colors h-9 ${
                              isSelected ? 'bg-[#477F7A]/10' : 'hover:bg-[#F7F9FB]'
                            }`}
                          >
                            <td className="py-1.5 px-3">
                              <span className="font-mono font-semibold text-[#477F7A]">
                                {imp.airportId}
                              </span>{' '}
                              <span className="text-[#253342]">{imp.city}</span>
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-[#253342]">
                              {imp.departuresCount}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-[#253342]">
                              {imp.arrivalsCount}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-[#253342]">
                              {imp.delayedDepartures}
                            </td>
                            <td
                              className={`py-1.5 px-2 text-right font-mono tabular-nums ${
                                imp.totalDepartureDelayMinutes > 0
                                  ? 'text-[#C18B45] font-medium'
                                  : 'text-[#75818D]'
                              }`}
                            >
                              {imp.totalDepartureDelayMinutes}m
                            </td>
                            <td className="py-1.5 px-3 text-right font-medium">
                              {imp.isClosed ? (
                                <span className="text-[#B94A48]">Closed</span>
                              ) : imp.delayedDepartures > 0 ? (
                                <span className="text-[#C18B45]">Impacted</span>
                              ) : (
                                <span className="text-[#2E7D5B]">Open</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 4: DISRUPTION SIMULATOR */}
          {activeNav === 'simulator' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                <div className="xl:col-span-5">{renderClosureControlsPanel(false)}</div>

                <div className="xl:col-span-7 bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-[#253342]">
                      Scenario Impact Comparison (Baseline vs Active)
                    </h3>
                    <span className="text-[11px] font-mono tabular-nums text-[#75818D]">
                      {committedClosures.length} active closure
                      {committedClosures.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F8FAFB] text-[#75818D] border-b border-[#DCE2E8] text-[11px] font-medium">
                        <th className="py-2 px-4">Operational Metric</th>
                        <th className="py-2 px-4 text-right">Baseline</th>
                        <th className="py-2 px-4 text-right">Simulated</th>
                        <th className="py-2 px-4 text-right">Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE2E8] font-mono tabular-nums">
                      {[
                        {
                          label: 'On-Time Performance (%)',
                          base: `${baseKpis.onTimePerformancePct}%`,
                          sim: `${kpis.onTimePerformancePct}%`,
                          delta: Number(
                            (kpis.onTimePerformancePct - baseKpis.onTimePerformancePct).toFixed(1)
                          ),
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
                          delta:
                            kpis.totalCrewOvertimeMinutes - baseKpis.totalCrewOvertimeMinutes,
                          unit: 'm',
                          goodIfPositive: false,
                        },
                      ].map((row) => {
                        const isZero = row.delta === 0;
                        const isBad = row.goodIfPositive ? row.delta < 0 : row.delta > 0;
                        return (
                          <tr key={row.label} className="h-9 hover:bg-[#F7F9FB]">
                            <td className="py-1.5 px-4 font-sans text-[#253342]">{row.label}</td>
                            <td className="py-1.5 px-4 text-right text-[#75818D]">{row.base}</td>
                            <td className="py-1.5 px-4 text-right text-[#253342] font-semibold">
                              {row.sim}
                            </td>
                            <td
                              className={`py-1.5 px-4 text-right font-semibold ${
                                isZero
                                  ? 'text-[#75818D]'
                                  : isBad
                                    ? 'text-[#B94A48]'
                                    : 'text-[#2E7D5B]'
                              }`}
                            >
                              {isZero
                                ? '0'
                                : `${row.delta > 0 ? '+' : ''}${row.delta}${row.unit}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {renderFlightTable()}
            </div>
          )}

          {/* VIEW 5: RECOVERY CENTRE */}
          {activeNav === 'recovery' && (
            <div className="space-y-4">
              {/* Standby Spare Aircraft & Fleet Utilisation */}
              <div className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#253342]">
                    Fleet & Standby Spare Aircraft
                  </h3>
                  <span className="text-[11px] font-mono tabular-nums text-[#75818D]">
                    {kpis.activeAircraftCount} active · {kpis.spareAircraftCount} standby spares
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F8FAFB] text-[#75818D] border-b border-[#DCE2E8] text-[11px] font-medium">
                        <th className="py-2 px-4">Tail ID</th>
                        <th className="py-2 px-3">Role / Base</th>
                        <th className="py-2 px-3 text-right">Seats</th>
                        <th className="py-2 px-3 text-right">Legs</th>
                        <th className="py-2 px-3">Operating Window</th>
                        <th className="py-2 px-3 text-right">Block Time</th>
                        <th className="py-2 px-3 text-right">Ground Turn</th>
                        <th className="py-2 px-3 text-right">Total Delay</th>
                        <th className="py-2 px-4 text-right">24h Util</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE2E8] font-mono tabular-nums">
                      {simulationResult.aircraftUtilisation.map((ac) => (
                        <tr key={ac.tailId} className="h-9 hover:bg-[#F7F9FB]">
                          <td className="py-1.5 px-4 font-semibold text-[#253342]">
                            {ac.tailId}
                          </td>
                          <td className="py-1.5 px-3 font-sans">
                            {ac.isSpare ? (
                              <span className="text-[#477F7A] font-medium">
                                Standby Spare ({ac.base})
                              </span>
                            ) : (
                              <span className="text-[#253342]">Active ({ac.base})</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-right text-[#253342]">{ac.seats}</td>
                          <td className="py-1.5 px-3 text-right text-[#253342]">
                            {ac.flightsOperated}
                          </td>
                          <td className="py-1.5 px-3 text-[#253342] whitespace-nowrap">
                            {ac.firstActualDep && ac.lastActualArr
                              ? `${ac.firstActualDep} – ${ac.lastActualArr}`
                              : 'Available'}
                          </td>
                          <td className="py-1.5 px-3 text-right text-[#253342]">
                            {formatDuration(ac.actualBlockMinutes)}
                          </td>
                          <td className="py-1.5 px-3 text-right text-[#75818D]">
                            {formatDuration(ac.totalGroundTurnaroundMinutes)}
                          </td>
                          <td
                            className={`py-1.5 px-3 text-right font-medium ${
                              ac.totalDelayMinutes > 0 ? 'text-[#C18B45]' : 'text-[#2E7D5B]'
                            }`}
                          >
                            {ac.totalDelayMinutes > 0 ? `+${ac.totalDelayMinutes}m` : '0m'}
                          </td>
                          <td className="py-1.5 px-4 text-right text-[#253342]">
                            {ac.utilisation24hPct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Passenger Connections Recovery Matrix */}
                <div className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-[#253342]">
                      Passenger Connections Integrity
                    </h3>
                    <span className="text-[11px] font-mono tabular-nums text-[#75818D]">
                      {kpis.failedConnectionsCount} failed · {kpis.strandedPassengers} pax stranded
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#F8FAFB] text-[#75818D] border-b border-[#DCE2E8] text-[11px] font-medium sticky top-0">
                          <th className="py-2 px-3">ID</th>
                          <th className="py-2 px-2">Hub</th>
                          <th className="py-2 px-2">Transfer</th>
                          <th className="py-2 px-2 text-right">Avail / Min</th>
                          <th className="py-2 px-2">Status</th>
                          <th className="py-2 px-3 text-right">Pax</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#DCE2E8] font-mono tabular-nums">
                        {[...simulationResult.connections]
                          .sort(
                            (a, b) =>
                              Number(b.failed) - Number(a.failed) ||
                              a.availableConnectMinutes - b.availableConnectMinutes
                          )
                          .map((c) => (
                            <tr key={c.connectionId} className="h-9 hover:bg-[#F7F9FB]">
                              <td className="py-1.5 px-3 font-semibold text-[#253342]">
                                {c.connectionId}
                              </td>
                              <td className="py-1.5 px-2 text-[#477F7A] font-semibold">
                                {c.airport}
                              </td>
                              <td className="py-1.5 px-2 text-[#253342] whitespace-nowrap">
                                {c.fromFlightId} ({c.fromActualArr}) → {c.toFlightId} (
                                {c.toActualDep})
                              </td>
                              <td
                                className={`py-1.5 px-2 text-right ${
                                  c.failed ? 'text-[#B94A48] font-semibold' : 'text-[#253342]'
                                }`}
                              >
                                {c.availableConnectMinutes}m / {c.minConnectMinutes}m
                              </td>
                              <td className="py-1.5 px-2 font-sans whitespace-nowrap">
                                {c.failed ? (
                                  <span className="inline-flex items-center gap-1 text-[#B94A48] font-medium">
                                    <XCircle className="w-3.5 h-3.5" />
                                    Failed (-{c.shortfallMinutes}m)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[#2E7D5B] font-medium">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Intact
                                  </span>
                                )}
                              </td>
                              <td
                                className={`py-1.5 px-3 text-right font-semibold ${
                                  c.failed ? 'text-[#B94A48]' : 'text-[#253342]'
                                }`}
                              >
                                {c.passengers}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Crew Duty Legality Table */}
                <div className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-[#253342]">
                      Crew Duty Time & Legality Monitor
                    </h3>
                    <span className="text-[11px] font-mono tabular-nums text-[#75818D]">
                      {kpis.crewViolationsCount} violations
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#F8FAFB] text-[#75818D] border-b border-[#DCE2E8] text-[11px] font-medium sticky top-0">
                          <th className="py-2 px-3">Crew</th>
                          <th className="py-2 px-2">Tail</th>
                          <th className="py-2 px-2">Window</th>
                          <th className="py-2 px-2 text-right">Duty / Max</th>
                          <th className="py-2 px-3 text-right">Legality</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#DCE2E8] font-mono tabular-nums">
                        {[...simulationResult.crews]
                          .sort(
                            (a, b) =>
                              Number(b.exceedsLimit) - Number(a.exceedsLimit) ||
                              a.maxDutyMins -
                                a.actualDutyMins -
                                (b.maxDutyMins - b.actualDutyMins)
                          )
                          .map((cr) => {
                            const margin = cr.maxDutyMins - cr.actualDutyMins;
                            return (
                              <tr key={cr.crewId} className="h-9 hover:bg-[#F7F9FB]">
                                <td className="py-1.5 px-3 font-semibold text-[#253342]">
                                  {cr.crewId}
                                </td>
                                <td className="py-1.5 px-2 text-[#253342]">
                                  {cr.tailId}{' '}
                                  <span className="text-[#75818D]">({cr.base})</span>
                                </td>
                                <td className="py-1.5 px-2 text-[#253342] whitespace-nowrap">
                                  {cr.dutyStart} – {cr.actualDutyEnd}
                                </td>
                                <td className="py-1.5 px-2 text-right text-[#253342]">
                                  {cr.actualDutyMins}m / {cr.maxDutyMins}m
                                </td>
                                <td className="py-1.5 px-3 text-right font-sans whitespace-nowrap">
                                  {cr.exceedsLimit ? (
                                    <span className="text-[#B94A48] font-semibold font-mono">
                                      Violation (+{cr.overtimeMins}m)
                                    </span>
                                  ) : margin <= 20 ? (
                                    <span className="text-[#C18B45] font-medium font-mono">
                                      Watch ({margin}m margin)
                                    </span>
                                  ) : (
                                    <span className="text-[#2E7D5B] font-mono">
                                      Legal ({margin}m margin)
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 6: ANALYTICS */}
          {activeNav === 'analytics' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Chart 1: Airport Departure Delay Minutes */}
              <div className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-semibold text-[#253342]">
                      Departure Delay by Airport (Top 10)
                    </h3>
                    <p className="text-[11px] text-[#75818D]">
                      Total departure delay minutes per station
                    </p>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-[#75818D]">
                    Total {kpis.totalDelayMinutes}m
                  </span>
                </div>
                {kpis.totalDelayMinutes === 0 ? (
                  <div className="h-56 flex items-center justify-center border border-dashed border-[#DCE2E8] rounded text-xs text-[#75818D]">
                    Baseline active (0m delay). Run a closure scenario to inspect station delays.
                  </div>
                ) : (
                  <div className="h-56 w-full min-w-0">
                    <ResponsiveContainer width="100%" height={224}>
                      <BarChart
                        data={airportDelayChartData}
                        margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E9EE" />
                        <XAxis dataKey="airportId" stroke="#75818D" fontSize={11} />
                        <YAxis stroke="#75818D" fontSize={11} unit="m" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#DCE2E8',
                            borderRadius: '4px',
                            fontSize: '12px',
                            color: '#253342',
                          }}
                        />
                        <Bar
                          dataKey="totalDepartureDelayMinutes"
                          name="Departure Delay (m)"
                          radius={[2, 2, 0, 0]}
                        >
                          {airportDelayChartData.map((entry) => (
                            <Cell
                              key={entry.airportId}
                              fill={
                                entry.isClosed
                                  ? '#B94A48'
                                  : entry.totalDepartureDelayMinutes > 0
                                    ? '#C18B45'
                                    : '#647D91'
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Chart 2: Delay Attribution Breakdown */}
              <div className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-semibold text-[#253342]">
                      Delay Attribution by Root Cause
                    </h3>
                    <p className="text-[11px] text-[#75818D]">
                      Flights affected and delay minutes by mechanism
                    </p>
                  </div>
                </div>
                {kpis.totalDelayMinutes === 0 ? (
                  <div className="h-56 flex items-center justify-center border border-dashed border-[#DCE2E8] rounded text-xs text-[#75818D]">
                    No delayed legs in current simulation.
                  </div>
                ) : (
                  <div className="h-56 w-full min-w-0">
                    <ResponsiveContainer width="100%" height={224}>
                      <BarChart
                        data={delayCauseData}
                        margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E9EE" />
                        <XAxis dataKey="reason" stroke="#75818D" fontSize={11} />
                        <YAxis stroke="#75818D" fontSize={11} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#DCE2E8',
                            borderRadius: '4px',
                            fontSize: '12px',
                            color: '#253342',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar
                          dataKey="delayMins"
                          name="Delay Minutes"
                          fill="#C18B45"
                          radius={[2, 2, 0, 0]}
                        />
                        <Bar
                          dataKey="flights"
                          name="Affected Flights"
                          fill="#647D91"
                          radius={[2, 2, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Chart 3: Hourly Departure Profile (Scheduled vs Actual) */}
              <div className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-semibold text-[#253342]">
                      Hourly Departure Profile (Scheduled vs Actual)
                    </h3>
                    <p className="text-[11px] text-[#75818D]">
                      Departures per IST hour bucket across the operating day
                    </p>
                  </div>
                </div>
                <div className="h-56 w-full min-w-0">
                  <ResponsiveContainer width="100%" height={224}>
                    <BarChart
                      data={hourlyDepartureProfile}
                      margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E9EE" />
                      <XAxis dataKey="hour" stroke="#75818D" fontSize={11} />
                      <YAxis stroke="#75818D" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderColor: '#DCE2E8',
                          borderRadius: '4px',
                          fontSize: '12px',
                          color: '#253342',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar
                        dataKey="scheduled"
                        name="Scheduled Deps"
                        fill="#647D91"
                        radius={[2, 2, 0, 0]}
                      />
                      <Bar
                        dataKey="actual"
                        name="Actual Deps"
                        fill="#477F7A"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 4: Aircraft 24h Utilisation */}
              <div className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-semibold text-[#253342]">
                      Active Fleet Utilisation (%)
                    </h3>
                    <p className="text-[11px] text-[#75818D]">
                      Block hours flown as percentage of 24-hour operating day
                    </p>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-[#75818D]">
                    Mean {kpis.averageAircraftUtilisationPct}%
                  </span>
                </div>
                <div className="h-56 w-full min-w-0">
                  <ResponsiveContainer width="100%" height={224}>
                    <BarChart
                      data={fleetUtilisationData}
                      margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E9EE" />
                      <XAxis dataKey="tailId" stroke="#75818D" fontSize={10} />
                      <YAxis stroke="#75818D" fontSize={11} unit="%" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderColor: '#DCE2E8',
                          borderRadius: '4px',
                          fontSize: '12px',
                          color: '#253342',
                        }}
                      />
                      <Bar
                        dataKey="utilisationPct"
                        name="24h Utilisation (%)"
                        fill="#477F7A"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
