import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import { validateRecoveryActions } from '../recoveryEngine';
import type {
  AirportClosureInput,
  FlightNetworkDataset,
  RecoveryAction,
  RecoveryStrategyCandidate,
  RecoveryStrategyCategory,
  RecoveryValidationResult,
  SimulationResult,
} from '../types';

interface RecoveryIntelligencePanelProps {
  dataset: FlightNetworkDataset;
  closures: AirportClosureInput[];
  disruptedResult: SimulationResult;
  strategies: RecoveryStrategyCandidate[];
  rejectedCount: number;
  selectedPreviewId: string | null;
  appliedStrategy: RecoveryStrategyCandidate | null;
  onSelectPreview: (strategyId: string | null) => void;
  onApplyStrategy: (strategy: RecoveryStrategyCandidate) => void;
  onApplyCustomStrategy: (
    title: string,
    actions: RecoveryAction[],
    validation: RecoveryValidationResult
  ) => void;
  onClearAppliedStrategy: () => void;
}

const CATEGORY_LABEL: Record<RecoveryStrategyCategory, string> = {
  SPARE_AIRCRAFT: 'Spare Aircraft',
  TAIL_SWAP: 'Tail Swap',
  CONNECTION_HOLD: 'Connection Hold',
  COMPOSITE_RECOVERY: 'Coordinated Plan',
};

export const RecoveryIntelligencePanel: React.FC<RecoveryIntelligencePanelProps> = React.memo(
  ({
    dataset,
    closures,
    disruptedResult,
    strategies,
    rejectedCount,
    selectedPreviewId,
    appliedStrategy,
    onSelectPreview,
    onApplyStrategy,
    onApplyCustomStrategy,
    onClearAppliedStrategy,
  }) => {
    const [showCustomBuilder, setShowCustomBuilder] = useState(false);
    const [customActionType, setCustomActionType] = useState<
      'DEPLOY_SPARE_TAIL_SUFFIX' | 'HOLD_CONNECTING_FLIGHT'
    >('DEPLOY_SPARE_TAIL_SUFFIX');
    const [customSpareId, setCustomSpareId] = useState<string>(
      dataset.spare_aircraft[0]?.tail_id ?? ''
    );
    const [customFlightId, setCustomFlightId] = useState<string>(
      dataset.flights[0]?.flight_id ?? ''
    );
    const [customHoldConnId, setCustomHoldConnId] = useState<string>(
      dataset.connections[0]?.connection_id ?? ''
    );
    const [customHoldMinutes, setCustomHoldMinutes] = useState<number>(15);
    const [customValidation, setCustomValidation] = useState<{
      actions: RecoveryAction[];
      title: string;
      result: RecoveryValidationResult;
    } | null>(null);

    const inspectedStrategy = useMemo(() => {
      if (appliedStrategy) {
        return strategies.find((s) => s.id === appliedStrategy.id) ?? appliedStrategy;
      }
      if (selectedPreviewId) {
        return strategies.find((s) => s.id === selectedPreviewId) ?? strategies[0] ?? null;
      }
      return strategies[0] ?? null;
    }, [strategies, selectedPreviewId, appliedStrategy]);

    const handleValidateCustom = (e: React.FormEvent) => {
      e.preventDefault();
      let action: RecoveryAction;
      let title = '';

      if (customActionType === 'DEPLOY_SPARE_TAIL_SUFFIX') {
        const targetFlight = dataset.flights.find((f) => f.flight_id === customFlightId);
        action = {
          type: 'DEPLOY_SPARE_TAIL_SUFFIX',
          spareTailId: customSpareId,
          targetTailId: targetFlight?.tail_id ?? '',
          fromFlightId: customFlightId,
        };
        title = `Custom Spare: ${customSpareId} → ${customFlightId}+`;
      } else {
        const conn = dataset.connections.find((c) => c.connection_id === customHoldConnId);
        action = {
          type: 'HOLD_CONNECTING_FLIGHT',
          connectionId: customHoldConnId,
          flightId: conn?.to_flight ?? '',
          holdMinutes: Math.trunc(customHoldMinutes),
        };
        title = `Custom Hold: ${conn?.to_flight ?? ''} (+${Math.trunc(customHoldMinutes)}m)`;
      }

      const result = validateRecoveryActions(dataset, closures, [action], disruptedResult);
      setCustomValidation({ actions: [action], title, result });
    };

    const hasDisruption =
      closures.length > 0 &&
      (disruptedResult.kpis.delayedFlights > 0 ||
        disruptedResult.kpis.failedConnectionsCount > 0 ||
        disruptedResult.kpis.crewViolationsCount > 0);

    return (
      <section
        aria-label="Recovery strategy engine and scorecard"
        className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#DCE2E8] bg-[#F8FAFB] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Wrench className="w-4 h-4 text-[#477F7A]" aria-hidden="true" />
            <div>
              <h3 className="text-xs font-semibold text-[#253342]">
                Recovery Strategy Engine & Scorecard
              </h3>
              <p className="text-[11px] text-[#596775]">
                Deterministic, constraint-verified recovery plans scored from actual simulation
                outcomes
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            {hasDisruption && (
              <span className="text-[#596775]">
                {strategies.length} feasible
                {rejectedCount > 0 ? ` · ${rejectedCount} infeasible filtered` : ''}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setShowCustomBuilder((v) => !v);
                setCustomValidation(null);
              }}
              aria-expanded={showCustomBuilder}
              className="h-7 px-2.5 rounded bg-white hover:bg-[#F3F5F7] border border-[#DCE2E8] text-[#253342] font-sans font-medium inline-flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
            >
              <span>Test Custom Action</span>
              {showCustomBuilder ? (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Custom Constraint Validation Tester */}
        {showCustomBuilder && (
          <div className="p-4 border-b border-[#DCE2E8] bg-[#FAFBFD] space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-[#253342]">
                Manual Recovery Constraint Validator
              </h4>
              <span className="text-[11px] text-[#596775]">
                Tests rotation continuity, ≥30m turnaround, closure windows, and crew duty legality
              </span>
            </div>

            <form
              onSubmit={handleValidateCustom}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
            >
              <div className="sm:col-span-3">
                <label
                  htmlFor="custom-action-type"
                  className="block text-[11px] font-medium text-[#596775] mb-1"
                >
                  Intervention Type
                </label>
                <select
                  id="custom-action-type"
                  value={customActionType}
                  onChange={(e) => {
                    setCustomActionType(
                      e.target.value as 'DEPLOY_SPARE_TAIL_SUFFIX' | 'HOLD_CONNECTING_FLIGHT'
                    );
                    setCustomValidation(null);
                  }}
                  className="w-full h-8 bg-white border border-[#DCE2E8] rounded px-2 text-xs text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                >
                  <option value="DEPLOY_SPARE_TAIL_SUFFIX">Deploy Standby Spare</option>
                  <option value="HOLD_CONNECTING_FLIGHT">Hold Connecting Flight</option>
                </select>
              </div>

              {customActionType === 'DEPLOY_SPARE_TAIL_SUFFIX' ? (
                <>
                  <div className="sm:col-span-3">
                    <label
                      htmlFor="custom-spare-tail"
                      className="block text-[11px] font-medium text-[#596775] mb-1"
                    >
                      Standby Spare Aircraft
                    </label>
                    <select
                      id="custom-spare-tail"
                      value={customSpareId}
                      onChange={(e) => {
                        setCustomSpareId(e.target.value);
                        setCustomValidation(null);
                      }}
                      className="w-full h-8 bg-white border border-[#DCE2E8] rounded px-2 text-xs text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                    >
                      {dataset.spare_aircraft.map((sp) => (
                        <option key={sp.tail_id} value={sp.tail_id}>
                          {sp.tail_id} (Base {sp.base}, avail {sp.available_from})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-4">
                    <label
                      htmlFor="custom-target-flight"
                      className="block text-[11px] font-medium text-[#596775] mb-1"
                    >
                      Take Over From Flight
                    </label>
                    <select
                      id="custom-target-flight"
                      value={customFlightId}
                      onChange={(e) => {
                        setCustomFlightId(e.target.value);
                        setCustomValidation(null);
                      }}
                      className="w-full h-8 bg-white border border-[#DCE2E8] rounded px-2 text-xs text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                    >
                      {dataset.flights.map((f) => (
                        <option key={f.flight_id} value={f.flight_id}>
                          {f.flight_id} ({f.tail_id} · {f.origin}→{f.destination} {f.dep})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="sm:col-span-4">
                    <label
                      htmlFor="custom-hold-conn"
                      className="block text-[11px] font-medium text-[#596775] mb-1"
                    >
                      Target Connection
                    </label>
                    <select
                      id="custom-hold-conn"
                      value={customHoldConnId}
                      onChange={(e) => {
                        setCustomHoldConnId(e.target.value);
                        setCustomValidation(null);
                      }}
                      className="w-full h-8 bg-white border border-[#DCE2E8] rounded px-2 text-xs text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                    >
                      {dataset.connections.map((c) => (
                        <option key={c.connection_id} value={c.connection_id}>
                          {c.connection_id} ({c.airport}: {c.from_flight}→{c.to_flight},{' '}
                          {c.passengers} pax)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      htmlFor="custom-hold-mins"
                      className="block text-[11px] font-medium text-[#596775] mb-1"
                    >
                      Hold Minutes (1–180)
                    </label>
                    <input
                      id="custom-hold-mins"
                      type="number"
                      min={1}
                      max={180}
                      value={customHoldMinutes}
                      onChange={(e) => {
                        setCustomHoldMinutes(Number(e.target.value));
                        setCustomValidation(null);
                      }}
                      className="w-full h-8 bg-white border border-[#DCE2E8] rounded px-2 text-xs font-mono text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                    />
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full h-8 px-3 rounded bg-[#263746] hover:bg-[#172333] text-white text-xs font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                >
                  Validate
                </button>
              </div>
            </form>

            {customValidation && (
              <div
                role="status"
                className={`rounded border p-3 text-xs flex flex-wrap items-center justify-between gap-3 ${
                  customValidation.result.valid
                    ? 'bg-[#2E7D5B]/8 border-[#2E7D5B]/30 text-[#253342]'
                    : 'bg-[#B94A48]/8 border-[#B94A48]/30 text-[#B94A48]'
                }`}
              >
                <div className="flex items-start gap-2">
                  {customValidation.result.valid ? (
                    <CheckCircle2 className="w-4 h-4 text-[#2E7D5B] shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-[#B94A48] shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {customValidation.result.valid
                        ? `Valid recovery action (${customValidation.title})`
                        : 'Action rejected by operational constraint validator'}
                    </p>
                    <p className="text-[11px] mt-0.5">
                      {customValidation.result.valid && customValidation.result.simulationResult
                        ? `Result: ${customValidation.result.simulationResult.kpis.totalDelayMinutes}m delay, ${customValidation.result.simulationResult.kpis.strandedPassengers} stranded pax, ${customValidation.result.simulationResult.kpis.crewViolationsCount} crew violations.`
                        : customValidation.result.reasons.join(' ')}
                    </p>
                  </div>
                </div>

                {customValidation.result.valid && (
                  <button
                    type="button"
                    onClick={() =>
                      onApplyCustomStrategy(
                        customValidation.title,
                        customValidation.actions,
                        customValidation.result
                      )
                    }
                    className="h-7 px-3 rounded bg-[#477F7A] hover:bg-[#3A6A66] text-white text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                  >
                    Apply Validated Action
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Strategy List + Transparent Scorecard */}
        {!hasDisruption ? (
          <div className="p-6 text-xs text-[#596775]">
            Baseline schedule is nominal with zero delays, zero missed connections, and zero crew
            violations. No recovery interventions are needed.
          </div>
        ) : strategies.length === 0 ? (
          <div className="p-6 text-xs text-[#596775] flex items-start gap-2">
            <Info className="w-4 h-4 text-[#647D91] shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              No single or composite automated recovery strategy yields a constraint-legal net
              improvement for the current closure window (all candidate actions were either neutral
              or rejected by rotation/turnaround/crew legality checks).
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-[#DCE2E8]">
            {/* Strategy Candidate Comparison Table */}
            <div className="xl:col-span-7 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <caption className="sr-only">
                  Ranked recovery strategy candidates evaluated by delay reduction, passenger
                  protection, crew legality, feasibility, and operational complexity.
                </caption>
                <thead>
                  <tr className="bg-[#F8FAFB] text-[#596775] border-b border-[#DCE2E8] text-[11px] font-medium">
                    <th scope="col" className="py-2 px-3">
                      Strategy
                    </th>
                    <th scope="col" className="py-2 px-2">
                      Type
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      Score
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      Delay Δ
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      Pax Saved
                    </th>
                    <th scope="col" className="py-2 px-2 text-center">
                      Crew
                    </th>
                    <th scope="col" className="py-2 px-3 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE2E8]">
                  {strategies.map((strat) => {
                    const isApplied = appliedStrategy?.id === strat.id;
                    const isInspected = inspectedStrategy?.id === strat.id;
                    const delaySaved = strat.comparison.deltas.delayMinutesSaved;
                    const paxSaved = strat.comparison.deltas.strandedPassengersSaved;
                    const crewLegal = strat.simulationResult.kpis.crewViolationsCount === 0;

                    return (
                      <tr
                        key={strat.id}
                        onClick={() => onSelectPreview(strat.id)}
                        className={`cursor-pointer transition-colors ${
                          isApplied
                            ? 'bg-[#477F7A]/10'
                            : isInspected
                              ? 'bg-[#F3F5F7]'
                              : 'hover:bg-[#F7F9FB]'
                        }`}
                      >
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectPreview(strat.id);
                              }}
                              aria-pressed={isInspected}
                              className="text-left font-semibold text-[#253342] hover:text-[#477F7A] cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                            >
                              {strat.title}
                            </button>
                            {strat.recommended && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#477F7A]/15 text-[#477F7A] text-[10px] font-semibold whitespace-nowrap">
                                <Award className="w-2.5 h-2.5" aria-hidden="true" />
                                Top Ranked
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#596775] mt-0.5 line-clamp-1">
                            {strat.summary}
                          </p>
                        </td>
                        <td className="py-2 px-2 text-[11px] text-[#596775] whitespace-nowrap">
                          {CATEGORY_LABEL[strat.category]}
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums font-bold text-[#253342]">
                          {strat.scorecard.totalScore}
                        </td>
                        <td
                          className={`py-2 px-2 text-right font-mono tabular-nums font-medium ${
                            delaySaved > 0
                              ? 'text-[#2E7D5B]'
                              : delaySaved < 0
                                ? 'text-[#B94A48]'
                                : 'text-[#596775]'
                          }`}
                        >
                          {delaySaved > 0 ? `-${delaySaved}m` : `${-delaySaved}m`}
                        </td>
                        <td
                          className={`py-2 px-2 text-right font-mono tabular-nums font-medium ${
                            paxSaved > 0 ? 'text-[#2E7D5B]' : 'text-[#596775]'
                          }`}
                        >
                          {paxSaved > 0 ? `+${paxSaved}` : paxSaved}
                        </td>
                        <td className="py-2 px-2 text-center whitespace-nowrap">
                          {crewLegal ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#2E7D5B] font-medium">
                              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                              Legal
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#A16D28] font-medium">
                              <AlertCircle className="w-3 h-3" aria-hidden="true" />
                              {strat.simulationResult.kpis.crewViolationsCount} rem
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          {isApplied ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onClearAppliedStrategy();
                              }}
                              className="h-7 px-2.5 rounded bg-white border border-[#477F7A] text-[#477F7A] text-[11px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                            >
                              Applied (Undo)
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onApplyStrategy(strat);
                              }}
                              className="h-7 px-2.5 rounded bg-[#477F7A] hover:bg-[#3A6A66] text-white text-[11px] font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                            >
                              Apply
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Selected Strategy Scorecard & Constraint Proof */}
            {inspectedStrategy && (
              <div className="xl:col-span-5 p-4 space-y-3.5 bg-[#FAFBFD]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#596775]">
                      Recovery Scorecard Breakdown
                    </span>
                    <h4 className="text-xs font-semibold text-[#253342]">
                      {inspectedStrategy.title}
                    </h4>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <span className="text-lg font-bold text-[#477F7A]">
                      {inspectedStrategy.scorecard.totalScore}
                    </span>
                    <span className="text-[11px] text-[#596775]"> / 100</span>
                  </div>
                </div>

                {/* 5 Transparent Metric Bars */}
                <div className="space-y-2 text-[11px]">
                  {[
                    {
                      label: 'Delay Reduction',
                      score: inspectedStrategy.scorecard.delayReductionScore,
                      max: 30,
                    },
                    {
                      label: 'Passenger Protection',
                      score: inspectedStrategy.scorecard.passengerProtectionScore,
                      max: 30,
                    },
                    {
                      label: 'Crew Legality',
                      score: inspectedStrategy.scorecard.crewLegalityScore,
                      max: 20,
                    },
                    {
                      label: 'Aircraft Feasibility',
                      score: inspectedStrategy.scorecard.aircraftFeasibilityScore,
                      max: 10,
                    },
                    {
                      label: 'Operational Simplicity',
                      score: inspectedStrategy.scorecard.operationalSimplicityScore,
                      max: 10,
                    },
                  ].map((item) => {
                    const pct = Math.max(0, Math.min(100, (item.score / item.max) * 100));
                    return (
                      <div key={item.label}>
                        <div className="flex justify-between mb-0.5">
                          <span className="text-[#253342] font-medium">{item.label}</span>
                          <span className="font-mono tabular-nums text-[#596775]">
                            {item.score} / {item.max}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-[#DCE2E8] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#477F7A]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Formula Documentation */}
                <div className="bg-white border border-[#DCE2E8] rounded p-2.5 space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#596775]">
                    Deterministic Scoring Formula
                  </div>
                  <ul className="space-y-0.5 text-[11px] text-[#596775] font-mono">
                    {inspectedStrategy.scorecard.formulaNotes.map((note) => (
                      <li key={note}>• {note}</li>
                    ))}
                  </ul>
                </div>

                {/* Constraint Verification Checks */}
                <div className="bg-white border border-[#DCE2E8] rounded p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#596775]">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#477F7A]" aria-hidden="true" />
                    Pre-Application Constraint Verification
                  </div>
                  <ul className="space-y-1 text-[11px]">
                    {inspectedStrategy.validation.checks.map((chk) => (
                      <li key={chk.name} className="flex items-start gap-1.5">
                        {chk.passed ? (
                          <CheckCircle2
                            className="w-3.5 h-3.5 text-[#2E7D5B] shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        ) : (
                          <XCircle
                            className="w-3.5 h-3.5 text-[#B94A48] shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        )}
                        <div>
                          <span className="font-medium text-[#253342]">{chk.name}:</span>{' '}
                          <span className="text-[#596775]">{chk.detail}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    );
  }
);

RecoveryIntelligencePanel.displayName = 'RecoveryIntelligencePanel';
