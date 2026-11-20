import React, { useMemo } from 'react';
import { ArrowRight, CheckCircle2, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { computeBeforeAfterComparison } from '../recoveryEngine';
import type { RecoveryStrategyCandidate, SimulationResult } from '../types';

interface BeforeAfterComparisonPanelProps {
  disruptedResult: SimulationResult;
  comparisonTargetResult: SimulationResult;
  activeStrategy: RecoveryStrategyCandidate | null;
  previewStrategy: RecoveryStrategyCandidate | null;
  onClearAppliedStrategy?: () => void;
}

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderColor: '#DCE2E8',
  borderRadius: '4px',
  fontSize: '12px',
  color: '#253342',
};

export const BeforeAfterComparisonPanel: React.FC<BeforeAfterComparisonPanelProps> = React.memo(
  ({
    disruptedResult,
    comparisonTargetResult,
    activeStrategy,
    previewStrategy,
    onClearAppliedStrategy,
  }) => {
    const isApplied = activeStrategy !== null;
    const scenarioLabel = activeStrategy
      ? `Active Recovered Scenario: ${activeStrategy.title}`
      : previewStrategy
        ? `Previewing Candidate: ${previewStrategy.title}`
        : 'Disrupted Scenario (No Recovery Applied)';

    const comparison = useMemo(
      () => computeBeforeAfterComparison(disruptedResult, comparisonTargetResult),
      [disruptedResult, comparisonTargetResult]
    );

    const { disrupted, recovered, deltas } = comparison;

    const scaleChartData = useMemo(
      () => [
        {
          metric: 'Total Delay (m)',
          Disrupted: disrupted.totalDelayMinutes,
          Recovered: recovered.totalDelayMinutes,
        },
        {
          metric: 'Stranded Pax',
          Disrupted: disrupted.strandedPassengers,
          Recovered: recovered.strandedPassengers,
        },
      ],
      [disrupted, recovered]
    );

    const countChartData = useMemo(
      () => [
        {
          metric: 'Delayed Flights',
          Disrupted: disrupted.delayedFlights,
          Recovered: recovered.delayedFlights,
        },
        {
          metric: 'Failed Connections',
          Disrupted: disrupted.failedConnectionsCount,
          Recovered: recovered.failedConnectionsCount,
        },
        {
          metric: 'Crew Violations',
          Disrupted: disrupted.crewViolationsCount,
          Recovered: recovered.crewViolationsCount,
        },
      ],
      [disrupted, recovered]
    );

    const changedFlights = useMemo(() => {
      const beforeMap = new Map(disruptedResult.flights.map((f) => [f.flightId, f]));
      return comparisonTargetResult.flights
        .map((after) => {
          const before = beforeMap.get(after.flightId);
          if (!before) return null;
          if (before.delayMinutes === after.delayMinutes && before.tailId === after.tailId) {
            return null;
          }
          return { before, after };
        })
        .filter((x): x is { before: typeof disruptedResult.flights[0]; after: typeof comparisonTargetResult.flights[0] } => x !== null);
    }, [disruptedResult.flights, comparisonTargetResult.flights]);

    const metricRows = [
      {
        label: 'Total Accumulated Flight Delay',
        before: `${disrupted.totalDelayMinutes}m`,
        after: `${recovered.totalDelayMinutes}m`,
        delta: deltas.delayMinutesSaved > 0 ? `-${deltas.delayMinutesSaved}m` : `${-deltas.delayMinutesSaved}m`,
        pct: deltas.delayMinutesPctReduction,
        improved: deltas.delayMinutesSaved > 0,
        worsened: deltas.delayMinutesSaved < 0,
      },
      {
        label: 'Delayed Flights',
        before: disrupted.delayedFlights,
        after: recovered.delayedFlights,
        delta: deltas.delayedFlightsReduced > 0 ? `-${deltas.delayedFlightsReduced}` : `${-deltas.delayedFlightsReduced}`,
        pct: deltas.delayedFlightsPctReduction,
        improved: deltas.delayedFlightsReduced > 0,
        worsened: deltas.delayedFlightsReduced < 0,
      },
      {
        label: 'Cancelled Flights (Schedule Preserved)',
        before: disrupted.cancelledFlights,
        after: recovered.cancelledFlights,
        delta: '0',
        pct: null,
        improved: false,
        worsened: false,
      },
      {
        label: 'Passengers with Missed Connections',
        before: `${disrupted.strandedPassengers} (${disrupted.failedConnectionsCount} conn)`,
        after: `${recovered.strandedPassengers} (${recovered.failedConnectionsCount} conn)`,
        delta:
          deltas.strandedPassengersSaved > 0
            ? `-${deltas.strandedPassengersSaved} pax`
            : `${-deltas.strandedPassengersSaved} pax`,
        pct: deltas.strandedPassengersPctReduction,
        improved: deltas.strandedPassengersSaved > 0,
        worsened: deltas.strandedPassengersSaved < 0,
      },
      {
        label: 'Crew Duty Violations',
        before: disrupted.crewViolationsCount,
        after: recovered.crewViolationsCount,
        delta:
          deltas.crewViolationsReduced > 0
            ? `-${deltas.crewViolationsReduced}`
            : `${-deltas.crewViolationsReduced}`,
        pct: deltas.crewViolationsPctReduction,
        improved: deltas.crewViolationsReduced > 0,
        worsened: deltas.crewViolationsReduced < 0,
      },
      {
        label: 'Active Fleet Utilisation (24h)',
        before: `${disrupted.averageAircraftUtilisationPct}%`,
        after: `${recovered.averageAircraftUtilisationPct}%`,
        delta: `${deltas.aircraftUtilisationDeltaPct >= 0 ? '+' : ''}${deltas.aircraftUtilisationDeltaPct} pp`,
        pct: null,
        improved: false,
        worsened: false,
      },
      {
        label: 'Flights Recovered (Delay Reduced / On-Time)',
        before: '0',
        after: `${deltas.flightsRecoveredCount} (${deltas.flightsRestoredOnTimeCount} on-time)`,
        delta: `+${deltas.flightsRecoveredCount}`,
        pct: null,
        improved: deltas.flightsRecoveredCount > 0,
        worsened: false,
      },
    ];

    return (
      <section
        aria-label="Before and after recovery comparison"
        className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden"
      >
        {/* Header with clear active scenario identification */}
        <div className="px-4 py-3 border-b border-[#DCE2E8] bg-[#F8FAFB] flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-semibold text-[#253342]">
                Before-and-After Operational Comparison
              </h3>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                  isApplied
                    ? 'bg-[#477F7A]/15 text-[#477F7A]'
                    : previewStrategy
                      ? 'bg-[#647D91]/15 text-[#253342]'
                      : 'bg-[#C18B45]/15 text-[#A16D28]'
                }`}
              >
                {isApplied && <CheckCircle2 className="w-3 h-3" aria-hidden="true" />}
                {scenarioLabel}
              </span>
            </div>
            <p className="text-[11px] text-[#596775] mt-0.5">
              Compares unrecovered disrupted simulation against{' '}
              {isApplied ? 'applied recovery state' : previewStrategy ? 'selected candidate preview' : 'current state'}.
              Percentage reduction shown only where baseline disrupted metric is non-zero.
            </p>
          </div>

          {isApplied && onClearAppliedStrategy && (
            <button
              type="button"
              onClick={onClearAppliedStrategy}
              className="h-7 px-2.5 rounded bg-white hover:bg-[#F3F5F7] border border-[#DCE2E8] text-xs font-medium text-[#253342] inline-flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              Revert to Disrupted
            </button>
          )}
        </div>

        {/* Comparison Table + Side-by-Side Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-[#DCE2E8]">
          <div className="xl:col-span-7 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <caption className="sr-only">
                Operational KPI comparison before and after applying recovery actions.
              </caption>
              <thead>
                <tr className="bg-[#F8FAFB] text-[#596775] border-b border-[#DCE2E8] text-[11px] font-medium">
                  <th scope="col" className="py-2 px-4">
                    Operational Metric
                  </th>
                  <th scope="col" className="py-2 px-3 text-right">
                    Before (Disrupted)
                  </th>
                  <th scope="col" className="py-2 px-3 text-right">
                    After (Recovered)
                  </th>
                  <th scope="col" className="py-2 px-4 text-right">
                    Improvement
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE2E8] font-mono tabular-nums">
                {metricRows.map((row) => (
                  <tr key={row.label} className="h-9 hover:bg-[#F7F9FB]">
                    <td className="py-1.5 px-4 font-sans text-[#253342]">{row.label}</td>
                    <td className="py-1.5 px-3 text-right text-[#596775]">{row.before}</td>
                    <td className="py-1.5 px-3 text-right font-semibold text-[#253342]">
                      {row.after}
                    </td>
                    <td
                      className={`py-1.5 px-4 text-right font-semibold ${
                        row.improved
                          ? 'text-[#2E7D5B]'
                          : row.worsened
                            ? 'text-[#B94A48]'
                            : 'text-[#596775]'
                      }`}
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        {row.improved && <TrendingDown className="w-3 h-3" aria-hidden="true" />}
                        {row.worsened && <TrendingUp className="w-3 h-3" aria-hidden="true" />}
                        <span>{row.delta}</span>
                        {row.pct !== null && (
                          <span className="text-[11px] font-normal">({row.pct}%)</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Two Clean Dual-Scale Comparison Charts */}
          <div className="xl:col-span-5 p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4 bg-[#FAFBFD]">
            <div>
              <h4 className="text-[11px] font-semibold text-[#253342] mb-1.5">
                Delay Minutes & Stranded Passengers
              </h4>
              <div className="h-36 w-full min-w-0">
                <ResponsiveContainer width="100%" height={144}>
                  <BarChart data={scaleChartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9EE" />
                    <XAxis dataKey="metric" stroke="#596775" fontSize={10} />
                    <YAxis stroke="#596775" fontSize={10} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="Disrupted" fill="#B94A48" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Recovered" fill="#477F7A" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-semibold text-[#253342] mb-1.5">
                Delayed Flights, Connections & Crew Violations
              </h4>
              <div className="h-36 w-full min-w-0">
                <ResponsiveContainer width="100%" height={144}>
                  <BarChart data={countChartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9EE" />
                    <XAxis dataKey="metric" stroke="#596775" fontSize={10} />
                    <YAxis stroke="#596775" fontSize={10} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="Disrupted" fill="#C18B45" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Recovered" fill="#477F7A" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Flight-Level Delta Table */}
        {changedFlights.length > 0 && (
          <div className="border-t border-[#DCE2E8]">
            <div className="px-4 py-2 bg-[#F8FAFB] border-b border-[#DCE2E8] flex items-center justify-between">
              <h4 className="text-[11px] font-semibold text-[#253342]">
                Flight-Level Impact Changes ({changedFlights.length} legs modified or improved)
              </h4>
            </div>
            <div className="overflow-x-auto max-h-52 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <caption className="sr-only">
                  Individual flights whose assigned aircraft or delay changed after recovery.
                </caption>
                <thead>
                  <tr className="bg-[#F8FAFB] text-[#596775] border-b border-[#DCE2E8] text-[11px] font-medium sticky top-0">
                    <th scope="col" className="py-1.5 px-4">
                      Flight
                    </th>
                    <th scope="col" className="py-1.5 px-3">
                      Sector
                    </th>
                    <th scope="col" className="py-1.5 px-3">
                      Tail Assignment
                    </th>
                    <th scope="col" className="py-1.5 px-3 text-right">
                      Before Delay
                    </th>
                    <th scope="col" className="py-1.5 px-3 text-right">
                      After Delay
                    </th>
                    <th scope="col" className="py-1.5 px-4 text-right">
                      Net Change
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE2E8] font-mono tabular-nums">
                  {changedFlights.map(({ before, after }) => {
                    const diff = after.delayMinutes - before.delayMinutes;
                    return (
                      <tr key={after.flightId} className="h-8 hover:bg-[#F7F9FB]">
                        <td className="py-1 px-4 font-semibold text-[#253342]">
                          {after.flightId}
                        </td>
                        <td className="py-1 px-3 text-[#253342]">
                          {after.origin} → {after.destination}
                        </td>
                        <td className="py-1 px-3 text-[#253342]">
                          {before.tailId === after.tailId ? (
                            after.tailId
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[#477F7A] font-semibold">
                              {before.tailId}
                              <ArrowRight className="w-3 h-3" aria-hidden="true" />
                              {after.tailId}
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-3 text-right text-[#596775]">
                          +{before.delayMinutes}m
                        </td>
                        <td className="py-1 px-3 text-right font-semibold text-[#253342]">
                          {after.delayMinutes === 0 ? 'On Time' : `+${after.delayMinutes}m`}
                        </td>
                        <td
                          className={`py-1 px-4 text-right font-semibold ${
                            diff < 0
                              ? 'text-[#2E7D5B]'
                              : diff > 0
                                ? 'text-[#B94A48]'
                                : 'text-[#596775]'
                          }`}
                        >
                          {diff === 0 ? 'Reassigned' : `${diff > 0 ? '+' : ''}${diff}m`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    );
  }
);

BeforeAfterComparisonPanel.displayName = 'BeforeAfterComparisonPanel';
