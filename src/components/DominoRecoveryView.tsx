import React, { useMemo } from 'react';
import { BeforeAfterComparisonPanel } from './BeforeAfterComparisonPanel';
import { DominoTimelinePanel } from './DominoTimelinePanel';
import { RecoveryIntelligencePanel } from './RecoveryIntelligencePanel';
import { buildDominoTimeline } from '../recoveryEngine';
import type {
  AirportClosureInput,
  FlightNetworkDataset,
  RecoveryAction,
  RecoveryStrategyCandidate,
  RecoveryValidationResult,
  SimulationResult,
} from '../types';

interface DominoRecoveryViewProps {
  dataset: FlightNetworkDataset;
  closures: AirportClosureInput[];
  baselineResult: SimulationResult;
  disruptedResult: SimulationResult;
  activeResult: SimulationResult;
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
  onTriggerPresetScenario: (airportId: string, startTime: string, endTime: string) => void;
  onOpenSimulator: () => void;
}

export const DominoRecoveryView: React.FC<DominoRecoveryViewProps> = React.memo(
  ({
    dataset,
    closures,
    baselineResult,
    disruptedResult,
    activeResult,
    strategies,
    rejectedCount,
    selectedPreviewId,
    appliedStrategy,
    onSelectPreview,
    onApplyStrategy,
    onApplyCustomStrategy,
    onClearAppliedStrategy,
    onTriggerPresetScenario,
    onOpenSimulator,
  }) => {
    const timelineEvents = useMemo(
      () =>
        buildDominoTimeline(
          disruptedResult,
          baselineResult,
          appliedStrategy ? activeResult : null,
          appliedStrategy
        ),
      [disruptedResult, baselineResult, appliedStrategy, activeResult]
    );

    const previewStrategy = useMemo(() => {
      if (appliedStrategy) return null;
      if (selectedPreviewId) {
        return strategies.find((s) => s.id === selectedPreviewId) ?? null;
      }
      return strategies[0] ?? null;
    }, [appliedStrategy, selectedPreviewId, strategies]);

    const comparisonTargetResult = appliedStrategy
      ? activeResult
      : previewStrategy
        ? previewStrategy.simulationResult
        : disruptedResult;

    return (
      <div className="space-y-4">
        {/* Scenario Quick Bar */}
        <div className="bg-white border border-[#DCE2E8] rounded-md px-4 py-2.5 shadow-[0_1px_2px_rgba(23,35,51,0.04)] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[#253342]">Active Scenario:</span>
            <span className="font-mono text-[#596775]">
              {closures.length === 0
                ? 'Baseline Schedule (0 closures)'
                : closures.map((c) => `${c.airportId} ${c.startTime}–${c.endTime}`).join(' · ')}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[#596775]">Quick Scenarios:</span>
            <button
              type="button"
              onClick={() => onTriggerPresetScenario('BOM', '07:30', '09:30')}
              className="h-7 px-2.5 rounded bg-[#F3F5F7] hover:bg-[#E7ECF0] border border-[#DCE2E8] text-[11px] font-medium text-[#253342] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
            >
              BOM Morning (07:30–09:30)
            </button>
            <button
              type="button"
              onClick={() => onTriggerPresetScenario('DEL', '08:00', '10:00')}
              className="h-7 px-2.5 rounded bg-[#F3F5F7] hover:bg-[#E7ECF0] border border-[#DCE2E8] text-[11px] font-medium text-[#253342] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
            >
              DEL Peak (08:00–10:00)
            </button>
            <button
              type="button"
              onClick={() => onTriggerPresetScenario('AMD', '06:00', '08:00')}
              className="h-7 px-2.5 rounded bg-[#F3F5F7] hover:bg-[#E7ECF0] border border-[#DCE2E8] text-[11px] font-medium text-[#253342] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
            >
              AMD Hub (06:00–08:00)
            </button>
          </div>
        </div>

        {/* Feature 1: Interactive Disruption Timeline */}
        <DominoTimelinePanel
          events={timelineEvents}
          hasClosures={closures.length > 0}
          onTriggerPresetScenario={onTriggerPresetScenario}
          onOpenSimulator={onOpenSimulator}
        />

        {/* Feature 2 & 4: Recovery Strategy Engine & Transparent Scorecard */}
        <RecoveryIntelligencePanel
          dataset={dataset}
          closures={closures}
          disruptedResult={disruptedResult}
          strategies={strategies}
          rejectedCount={rejectedCount}
          selectedPreviewId={selectedPreviewId}
          appliedStrategy={appliedStrategy}
          onSelectPreview={onSelectPreview}
          onApplyStrategy={onApplyStrategy}
          onApplyCustomStrategy={onApplyCustomStrategy}
          onClearAppliedStrategy={onClearAppliedStrategy}
        />

        {/* Feature 3: Before-and-After Operational Comparison */}
        {closures.length > 0 && (
          <BeforeAfterComparisonPanel
            disruptedResult={disruptedResult}
            comparisonTargetResult={comparisonTargetResult}
            activeStrategy={appliedStrategy}
            previewStrategy={previewStrategy}
            onClearAppliedStrategy={onClearAppliedStrategy}
          />
        )}
      </div>
    );
  }
);

DominoRecoveryView.displayName = 'DominoRecoveryView';
