import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  GitBranch,
  Globe,
  LayoutDashboard,
  Menu,
  Plane,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { AnalyticsView } from './components/AnalyticsView';
import { ClosureControlsPanel } from './components/ClosureControlsPanel';
import { DominoRecoveryView } from './components/DominoRecoveryView';
import { FlightOperationsTable } from './components/FlightOperationsTable';
import { IndiaNetworkMap } from './components/IndiaNetworkMap';
import { IstClock } from './components/IstClock';
import { KpiStrip } from './components/KpiStrip';
import { NetworkMapView } from './components/NetworkMapView';
import { OperationalAlertsPanel } from './components/OperationalAlertsPanel';
import { RecoveryCentreView } from './components/RecoveryCentreView';
import { ScenarioComparisonTable } from './components/ScenarioComparisonTable';
import { loadDefaultFlightNetwork, validateFlightNetworkDataset } from './dataLoader';
import {
  computeBeforeAfterComparison,
  computeRecoveryScorecard,
  evaluateRecoveryStrategies,
} from './recoveryEngine';
import { runSimulation } from './simulationEngine';
import {
  buildOperationalAlerts,
  filterAndSortFlights,
  type FlightFilter,
  type SortDirection,
  type SortField,
} from './simulationViewModels';
import { parseClosureTimeToMinutes } from './timeUtils';
import type {
  AirportClosureInput,
  FlightNetworkDataset,
  RecoveryAction,
  RecoveryStrategyCandidate,
  RecoveryValidationResult,
  SimulationResult,
} from './types';

type NavSection =
  | 'overview'
  | 'flights'
  | 'map'
  | 'simulator'
  | 'domino'
  | 'recovery'
  | 'analytics';

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'flights', label: 'Flight Operations', icon: Plane },
  { id: 'map', label: 'Network Map', icon: Globe },
  { id: 'simulator', label: 'Disruption Simulator', icon: SlidersHorizontal },
  { id: 'domino', label: 'Domino & Recovery', icon: GitBranch },
  { id: 'recovery', label: 'Recovery Centre', icon: Wrench },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

const NAV_TITLES: Record<NavSection, string> = {
  overview: 'Network Operations Overview',
  flights: 'Flight Operations Schedule',
  map: 'India Flight Network Map',
  simulator: 'Disruption Cascade Simulator',
  domino: 'Domino Effect & Recovery Intelligence',
  recovery: 'Recovery & Resource Centre',
  analytics: 'Operational Analytics',
};

function safeRunSimulation(
  dataset: FlightNetworkDataset | null,
  closures: AirportClosureInput[]
): { result: SimulationResult | null; error: string | null } {
  if (!dataset) return { result: null, error: null };
  try {
    return { result: runSimulation(dataset, closures), error: null };
  } catch (err) {
    return {
      result: null,
      error: err instanceof Error ? err.message : 'Simulation execution failed.',
    };
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
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);
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

  const [appliedStrategy, setAppliedStrategy] = useState<RecoveryStrategyCandidate | null>(null);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);

  const [statusAnnouncement, setStatusAnnouncement] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const baselineOutcome = useMemo(() => safeRunSimulation(dataset, []), [dataset]);
  const disruptedOutcome = useMemo(
    () => safeRunSimulation(dataset, committedClosures),
    [dataset, committedClosures]
  );

  const baselineResult = baselineOutcome.result;
  const disruptedResult = disruptedOutcome.result ?? baselineResult;
  const simulationResult = appliedStrategy?.simulationResult ?? disruptedResult;
  const simulationError = disruptedOutcome.error ?? baselineOutcome.error;

  const recoveryEvaluation = useMemo(() => {
    if (!dataset || !disruptedResult) {
      return { strategies: [] as RecoveryStrategyCandidate[], rejectedCount: 0 };
    }
    return evaluateRecoveryStrategies(dataset, committedClosures, disruptedResult);
  }, [dataset, committedClosures, disruptedResult]);

  const hasPendingChanges = useMemo(() => {
    return JSON.stringify(stagedClosures) !== JSON.stringify(committedClosures);
  }, [stagedClosures, committedClosures]);

  const handleSelectNav = useCallback((section: NavSection) => {
    setActiveNav(section);
    setMobileNavOpen(false);
  }, []);

  const handleAddClosure = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setClosureError(null);
      if (!dataset) return;

      try {
        const airportExists = dataset.airports.some((a) => a.id === formAirport);
        if (!airportExists) {
          setClosureError(`Unknown airport station "${formAirport}".`);
          return;
        }
        const startMins = parseClosureTimeToMinutes(formStart);
        const endMins = parseClosureTimeToMinutes(formEnd);
        if (endMins <= startMins) {
          setClosureError('Closure end time must be strictly after start time.');
          return;
        }
        const duplicate = stagedClosures.some(
          (c) =>
            c.airportId === formAirport && c.startTime === formStart && c.endTime === formEnd
        );
        if (duplicate) {
          setClosureError(
            `Closure ${formAirport} ${formStart}–${formEnd} is already staged.`
          );
          return;
        }

        const next: AirportClosureInput = {
          id: `${formAirport}-${formStart}-${formEnd}-${Date.now()}`,
          airportId: formAirport,
          startTime: formStart,
          endTime: formEnd,
        };
        setStagedClosures((prev) => [...prev, next]);
        setStatusAnnouncement(
          `Staged closure for ${formAirport} from ${formStart} to ${formEnd} IST. Run simulation to apply.`
        );
      } catch (err) {
        setClosureError(err instanceof Error ? err.message : 'Invalid time input.');
      }
    },
    [dataset, formAirport, formStart, formEnd, stagedClosures]
  );

  const handleRemoveClosure = useCallback((id: string) => {
    setStagedClosures((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target) {
        setStatusAnnouncement(
          `Removed staged closure for ${target.airportId} ${target.startTime} to ${target.endTime}.`
        );
      }
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  const handleRunSimulation = useCallback(() => {
    setClosureError(null);
    if (!dataset) return;
    const nextCommitted = [...stagedClosures];
    try {
      const preview = runSimulation(dataset, nextCommitted);
      setCommittedClosures(nextCommitted);
      setAppliedStrategy(null);
      setSelectedPreviewId(null);
      setStatusAnnouncement(
        `Simulation updated with ${nextCommitted.length} active closure${
          nextCommitted.length === 1 ? '' : 's'
        }: ${preview.kpis.delayedFlights} delayed flights, ${preview.kpis.failedConnectionsCount} failed connections, ${preview.kpis.crewViolationsCount} crew violations.`
      );
    } catch (err) {
      setClosureError(err instanceof Error ? err.message : 'Simulation failed to run.');
    }
  }, [dataset, stagedClosures]);

  const handleResetToBaseline = useCallback(() => {
    setClosureError(null);
    setStagedClosures([]);
    setCommittedClosures([]);
    setAppliedStrategy(null);
    setSelectedPreviewId(null);
    setStatusAnnouncement('Simulation reset to baseline schedule with zero active closures.');
  }, []);

  const handleTriggerPresetScenario = useCallback(
    (airportId: string, startTime: string, endTime: string) => {
      if (!dataset) return;
      const presetClosure: AirportClosureInput = {
        id: `preset-${airportId}-${startTime}-${endTime}`,
        airportId,
        startTime,
        endTime,
      };
      try {
        const preview = runSimulation(dataset, [presetClosure]);
        setClosureError(null);
        setStagedClosures([presetClosure]);
        setCommittedClosures([presetClosure]);
        setAppliedStrategy(null);
        setSelectedPreviewId(null);
        setStatusAnnouncement(
          `Triggered ${airportId} closure ${startTime} to ${endTime} IST: ${preview.kpis.delayedFlights} delayed flights, ${preview.kpis.failedConnectionsCount} failed connections.`
        );
      } catch (err) {
        setClosureError(err instanceof Error ? err.message : 'Preset scenario failed.');
      }
    },
    [dataset]
  );

  const handleApplyStrategy = useCallback((strategy: RecoveryStrategyCandidate) => {
    setAppliedStrategy(strategy);
    setSelectedPreviewId(strategy.id);
    setStatusAnnouncement(
      `Applied recovery strategy ${strategy.title}. Delay reduced by ${strategy.comparison.deltas.delayMinutesSaved} minutes, ${strategy.comparison.deltas.strandedPassengersSaved} passengers rescued.`
    );
  }, []);

  const handleApplyCustomStrategy = useCallback(
    (
      title: string,
      actions: RecoveryAction[],
      validation: RecoveryValidationResult
    ) => {
      if (!validation.valid || !validation.simulationResult || !disruptedResult) return;
      const comparison = computeBeforeAfterComparison(
        disruptedResult,
        validation.simulationResult
      );
      const scorecard = computeRecoveryScorecard(
        disruptedResult,
        validation.simulationResult,
        comparison,
        actions.length,
        validation.reassignedFlightsCount,
        validation.rescheduledFlightsCount
      );
      const customCandidate: RecoveryStrategyCandidate = {
        id: `custom-${Date.now()}`,
        title,
        category:
          actions[0]?.type === 'HOLD_CONNECTING_FLIGHT' ? 'CONNECTION_HOLD' : 'SPARE_AIRCRAFT',
        summary: title,
        rationale: 'Operator-validated recovery action.',
        actions,
        actionDescriptions: [title],
        validation,
        simulationResult: validation.simulationResult,
        comparison,
        scorecard,
        recommended: false,
      };
      setAppliedStrategy(customCandidate);
      setSelectedPreviewId(customCandidate.id);
      setStatusAnnouncement(`Applied validated custom action: ${title}.`);
    },
    [disruptedResult]
  );

  const handleClearAppliedStrategy = useCallback(() => {
    setAppliedStrategy(null);
    setStatusAnnouncement('Reverted to unrecovered disrupted scenario.');
  }, []);

  const handleQuickCloseAirport = useCallback((airportId: string) => {
    setFormAirport(airportId);
    setActiveNav('simulator');
    setMobileNavOpen(false);
    setStatusAnnouncement(`Prepared closure form for station ${airportId}.`);
  }, []);

  const handleUploadDataset = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validated = validateFlightNetworkDataset(parsed);
      setDataset(validated);
      setLoadError(null);
      setClosureError(null);
      setStagedClosures([]);
      setCommittedClosures([]);
      setAppliedStrategy(null);
      setSelectedPreviewId(null);
      setSelectedAirportId(null);
      setAirportFilter('ALL');
      if (validated.airports.length > 0) {
        setFormAirport(validated.airports[0].id);
      }
      setStatusAnnouncement(
        `Loaded network dataset ${validated.meta.dataset} with ${validated.flights.length} flights across ${validated.airports.length} airports.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON dataset.';
      setLoadError(msg);
      setStatusAnnouncement(`Dataset upload failed: ${msg}`);
    } finally {
      e.target.value = '';
    }
  }, []);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir(field === 'delayMinutes' ? 'desc' : 'asc');
      }
    },
    [sortField]
  );

  const handleViewAllFlights = useCallback(() => {
    setActiveNav('flights');
    setMobileNavOpen(false);
  }, []);

  const filteredAndSortedFlights = useMemo(() => {
    if (!simulationResult) return [];
    return filterAndSortFlights(simulationResult.flights, {
      flightFilter,
      airportFilter,
      searchQuery,
      sortField,
      sortDir,
    });
  }, [simulationResult, flightFilter, airportFilter, searchQuery, sortField, sortDir]);

  const operationalAlerts = useMemo(() => {
    if (!simulationResult) return [];
    return buildOperationalAlerts(simulationResult);
  }, [simulationResult]);

  if (!dataset || !baselineResult || !disruptedResult || !simulationResult) {
    return (
      <div className="min-h-screen bg-[#F3F5F7] text-[#253342] flex items-center justify-center p-6">
        <div
          role="alert"
          className="max-w-lg w-full bg-white border border-[#B94A48]/40 rounded-md p-6 shadow-[0_1px_2px_rgba(23,35,51,0.04)]"
        >
          <div className="flex items-center gap-2.5 text-[#B94A48] mb-2">
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            <h1 className="text-base font-semibold">Dataset Validation Error</h1>
          </div>
          <p className="text-xs text-[#253342]">
            {loadError ?? simulationError ?? 'Unable to initialize dataset.'}
          </p>
        </div>
      </div>
    );
  }

  const { kpis } = simulationResult;
  const baseKpis = baselineResult.kpis;
  const isDisrupted = committedClosures.length > 0;

  return (
    <div className="min-h-screen bg-[#F3F5F7] text-[#253342] flex font-sans">
      <a
        href="#main-workspace"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded focus:bg-[#477F7A] focus:text-white focus:text-xs focus:font-semibold"
      >
        Skip to main workspace
      </a>

      {/* Accessible Live Status Announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {statusAnnouncement}
      </div>

      {/* Mobile Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-[#172333]/50 z-20 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Fixed Left Enterprise Sidebar (#172333 deep navy, #263746 secondary panels) */}
      <aside
        aria-label="Application sidebar"
        className={`w-60 bg-[#172333] border-r border-[#263746] flex flex-col shrink-0 fixed inset-y-0 left-0 z-30 text-white transition-transform duration-200 lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Mark */}
        <div className="h-12 px-4 border-b border-[#263746] flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded bg-[#263746] border border-[#477F7A]/50 flex items-center justify-center shrink-0">
              <Plane className="w-4 h-4 text-[#DCE2E8]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold tracking-tight text-white block leading-none">
                DOMINO SKY
              </span>
              <span className="text-[10px] text-[#B8C4D0] tracking-wide block mt-0.5">
                Network OCC
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
            className="lg:hidden p-1 rounded text-[#B8C4D0] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
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
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleSelectNav(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  isActive
                    ? 'bg-[#477F7A] text-white'
                    : 'text-[#C8D2DC] hover:text-white hover:bg-[#263746]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
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
                {item.id === 'domino' && recoveryEvaluation.strategies.length > 0 && (
                  <span
                    className={`font-mono tabular-nums text-[11px] font-semibold ${
                      isActive ? 'text-white' : 'text-[#84C7C1]'
                    }`}
                  >
                    {recoveryEvaluation.strategies.length}
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
          <div className="flex justify-between text-[#B8C4D0]">
            <span>Schedule</span>
            <span className="font-mono text-white truncate max-w-[125px]">
              {dataset.meta.dataset}
            </span>
          </div>
          <div className="flex justify-between text-[#B8C4D0] font-mono tabular-nums">
            <span className="font-sans">Turnaround Min</span>
            <span className="text-white">{dataset.meta.min_turnaround_minutes}m</span>
          </div>
          <div className="flex justify-between text-[#B8C4D0] font-mono tabular-nums">
            <span className="font-sans">Fleet</span>
            <span className="text-white">
              {kpis.activeAircraftCount} active · {kpis.spareAircraftCount} spare
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleUploadDataset}
            aria-label="Upload network JSON dataset"
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-1 w-full h-7 flex items-center justify-center gap-1.5 rounded bg-[#263746] hover:bg-[#314557] border border-[#3B5166] text-[#E6ECF2] hover:text-white cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Upload className="w-3 h-3 text-[#B8C4D0]" aria-hidden="true" />
            <span>Load Network JSON</span>
          </button>
          {loadError && (
            <p role="alert" className="text-[#F1A3A1] text-[11px] leading-snug">
              {loadError}
            </p>
          )}
        </div>
      </aside>

      {/* Main Content Area (#F3F5F7 light-grey workspace) */}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        {/* Compact Top Operational Header */}
        <header className="h-12 bg-white border-b border-[#DCE2E8] px-4 lg:px-5 flex items-center justify-between gap-4 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 -ml-1.5 rounded text-[#253342] hover:bg-[#F3F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
            </button>

            <h1 className="text-sm font-semibold text-[#253342] truncate">
              {NAV_TITLES[activeNav]}
            </h1>
            <span className="text-[#DCE2E8] hidden sm:inline" aria-hidden="true">
              /
            </span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium hidden sm:inline-flex whitespace-nowrap ${
                appliedStrategy
                  ? 'text-[#477F7A]'
                  : isDisrupted
                    ? 'text-[#B94A48]'
                    : 'text-[#2E7D5B]'
              }`}
            >
              {appliedStrategy ? (
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              ) : isDisrupted ? (
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {appliedStrategy
                ? `Recovered · ${appliedStrategy.title}`
                : isDisrupted
                  ? `Disrupted · ${committedClosures.length} closure${committedClosures.length > 1 ? 's' : ''} active`
                  : 'System Nominal · Baseline Schedule'}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs shrink-0">
            {hasPendingChanges && (
              <button
                type="button"
                onClick={handleRunSimulation}
                className="h-7 px-2.5 rounded bg-[#477F7A] hover:bg-[#3A6A66] text-white font-semibold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A] focus-visible:ring-offset-1"
              >
                <Play className="w-3 h-3 fill-current" aria-hidden="true" />
                Apply Changes
              </button>
            )}

            <IstClock operatingDay={dataset.meta.operating_day} />

            <div className="flex items-center gap-2 pl-3 border-l border-[#DCE2E8] text-[#253342]">
              <div className="w-6 h-6 rounded bg-[#F3F5F7] border border-[#DCE2E8] flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-[#647D91]" aria-hidden="true" />
              </div>
              <span className="hidden sm:inline text-xs font-medium whitespace-nowrap">
                OCC Dispatch
              </span>
            </div>
          </div>
        </header>

        {/* Main Workspace */}
        <main id="main-workspace" className="flex-1 p-4 lg:p-5 space-y-4">
          {simulationError && (
            <div
              role="alert"
              className="bg-white border border-[#B94A48]/40 rounded-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[#B94A48]"
            >
              <span className="inline-flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                Simulation error: {simulationError}
              </span>
              <button
                type="button"
                onClick={handleResetToBaseline}
                className="px-2.5 py-1 rounded border border-[#B94A48]/40 text-[#B94A48] hover:bg-[#B94A48]/10 font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B94A48]"
              >
                Reset to Baseline
              </button>
            </div>
          )}

          {/* Compact Enterprise KPI Strip */}
          {(activeNav === 'overview' ||
            activeNav === 'simulator' ||
            activeNav === 'domino' ||
            activeNav === 'recovery') && <KpiStrip kpis={kpis} baseKpis={baseKpis} />}

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
                  <OperationalAlertsPanel
                    alerts={operationalAlerts}
                    totalFlights={kpis.totalFlights}
                    totalConnections={kpis.totalConnections}
                    totalCrews={kpis.totalCrews}
                  />

                  <ClosureControlsPanel
                    airports={dataset.airports}
                    formAirport={formAirport}
                    formStart={formStart}
                    formEnd={formEnd}
                    stagedClosures={stagedClosures}
                    committedClosures={committedClosures}
                    hasPendingChanges={hasPendingChanges}
                    closureError={closureError}
                    compact
                    onFormAirportChange={setFormAirport}
                    onFormStartChange={setFormStart}
                    onFormEndChange={setFormEnd}
                    onAddClosure={handleAddClosure}
                    onRemoveClosure={handleRemoveClosure}
                    onRunSimulation={handleRunSimulation}
                    onResetToBaseline={handleResetToBaseline}
                  />
                </div>
              </div>

              <FlightOperationsTable
                flights={filteredAndSortedFlights}
                totalFlightsCount={simulationResult.flights.length}
                onTimeFlightsCount={kpis.onTimeFlights}
                delayedFlightsCount={kpis.delayedFlights}
                airports={dataset.airports}
                flightFilter={flightFilter}
                airportFilter={airportFilter}
                searchQuery={searchQuery}
                sortField={sortField}
                sortDir={sortDir}
                maxRows={20}
                onFlightFilterChange={setFlightFilter}
                onAirportFilterChange={setAirportFilter}
                onSearchQueryChange={setSearchQuery}
                onSort={handleSort}
                onViewAllFlights={handleViewAllFlights}
              />
            </div>
          )}

          {/* VIEW 2: FLIGHT OPERATIONS */}
          {activeNav === 'flights' && (
            <div className="space-y-4">
              <FlightOperationsTable
                flights={filteredAndSortedFlights}
                totalFlightsCount={simulationResult.flights.length}
                onTimeFlightsCount={kpis.onTimeFlights}
                delayedFlightsCount={kpis.delayedFlights}
                airports={dataset.airports}
                flightFilter={flightFilter}
                airportFilter={airportFilter}
                searchQuery={searchQuery}
                sortField={sortField}
                sortDir={sortDir}
                onFlightFilterChange={setFlightFilter}
                onAirportFilterChange={setAirportFilter}
                onSearchQueryChange={setSearchQuery}
                onSort={handleSort}
              />
            </div>
          )}

          {/* VIEW 3: NETWORK MAP */}
          {activeNav === 'map' && (
            <NetworkMapView
              airports={dataset.airports}
              flights={simulationResult.flights}
              airportImpacts={simulationResult.airportImpacts}
              selectedAirportId={selectedAirportId}
              onSelectAirport={setSelectedAirportId}
              onQuickCloseAirport={handleQuickCloseAirport}
            />
          )}

          {/* VIEW 4: DISRUPTION SIMULATOR */}
          {activeNav === 'simulator' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                <div className="xl:col-span-5">
                  <ClosureControlsPanel
                    airports={dataset.airports}
                    formAirport={formAirport}
                    formStart={formStart}
                    formEnd={formEnd}
                    stagedClosures={stagedClosures}
                    committedClosures={committedClosures}
                    hasPendingChanges={hasPendingChanges}
                    closureError={closureError}
                    onFormAirportChange={setFormAirport}
                    onFormStartChange={setFormStart}
                    onFormEndChange={setFormEnd}
                    onAddClosure={handleAddClosure}
                    onRemoveClosure={handleRemoveClosure}
                    onRunSimulation={handleRunSimulation}
                    onResetToBaseline={handleResetToBaseline}
                  />
                </div>

                <div className="xl:col-span-7">
                  <ScenarioComparisonTable
                    baseKpis={baseKpis}
                    kpis={kpis}
                    activeClosuresCount={committedClosures.length}
                  />
                </div>
              </div>

              <FlightOperationsTable
                flights={filteredAndSortedFlights}
                totalFlightsCount={simulationResult.flights.length}
                onTimeFlightsCount={kpis.onTimeFlights}
                delayedFlightsCount={kpis.delayedFlights}
                airports={dataset.airports}
                flightFilter={flightFilter}
                airportFilter={airportFilter}
                searchQuery={searchQuery}
                sortField={sortField}
                sortDir={sortDir}
                onFlightFilterChange={setFlightFilter}
                onAirportFilterChange={setAirportFilter}
                onSearchQueryChange={setSearchQuery}
                onSort={handleSort}
              />
            </div>
          )}

          {/* VIEW 4.5: DOMINO EFFECT & RECOVERY INTELLIGENCE */}
          {activeNav === 'domino' && (
            <DominoRecoveryView
              dataset={dataset}
              closures={committedClosures}
              baselineResult={baselineResult}
              disruptedResult={disruptedResult}
              activeResult={simulationResult}
              strategies={recoveryEvaluation.strategies}
              rejectedCount={recoveryEvaluation.rejectedCount}
              selectedPreviewId={selectedPreviewId}
              appliedStrategy={appliedStrategy}
              onSelectPreview={setSelectedPreviewId}
              onApplyStrategy={handleApplyStrategy}
              onApplyCustomStrategy={handleApplyCustomStrategy}
              onClearAppliedStrategy={handleClearAppliedStrategy}
              onTriggerPresetScenario={handleTriggerPresetScenario}
              onOpenSimulator={() => handleSelectNav('simulator')}
            />
          )}

          {/* VIEW 5: RECOVERY CENTRE */}
          {activeNav === 'recovery' && <RecoveryCentreView simulationResult={simulationResult} />}

          {/* VIEW 6: ANALYTICS */}
          {activeNav === 'analytics' && <AnalyticsView simulationResult={simulationResult} />}
        </main>
      </div>
    </div>
  );
}

export default App;
