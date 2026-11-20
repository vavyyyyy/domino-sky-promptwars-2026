import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  GitBranch,
  Lock,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import type { DominoTimelineEvent, TimelineStageKind } from '../types';

interface DominoTimelinePanelProps {
  events: DominoTimelineEvent[];
  hasClosures: boolean;
  onTriggerPresetScenario?: (airportId: string, startTime: string, endTime: string) => void;
  onOpenSimulator?: () => void;
}

type StageFilter = 'ALL' | TimelineStageKind;

export const DominoTimelinePanel: React.FC<DominoTimelinePanelProps> = React.memo(
  ({ events, hasClosures, onTriggerPresetScenario, onOpenSimulator }) => {
    const [stageFilter, setStageFilter] = useState<StageFilter>('ALL');
    const [currentStep, setCurrentStep] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [speedMs, setSpeedMs] = useState<number>(950);

    const filteredEvents = useMemo(() => {
      if (stageFilter === 'ALL') return events;
      return events.filter((e) => e.stageKind === stageFilter);
    }, [events, stageFilter]);

    // Reset playback position cleanly when event count or filter changes
    useEffect(() => {
      setIsPlaying(false);
      setCurrentStep(filteredEvents.length > 0 ? filteredEvents.length : 0);
    }, [filteredEvents.length, stageFilter]);

    useEffect(() => {
      if (!isPlaying || filteredEvents.length === 0) return;
      if (currentStep >= filteredEvents.length) {
        setIsPlaying(false);
        return;
      }
      const id = window.setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= filteredEvents.length) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, speedMs);
      return () => window.clearInterval(id);
    }, [isPlaying, currentStep, filteredEvents.length, speedMs]);

    const visibleEvents = useMemo(
      () => filteredEvents.slice(0, currentStep),
      [filteredEvents, currentStep]
    );

    const activeEvent =
      currentStep > 0 && currentStep <= filteredEvents.length
        ? filteredEvents[currentStep - 1]
        : null;

    // Progressive cascade metrics up to the current playback cursor
    const cascadeSnapshot = useMemo(() => {
      const airports = new Set<string>();
      const delayedFlightIds = new Set<string>();
      let cumulativeDelayMins = 0;
      let brokenConnections = 0;
      let strandedPax = 0;
      let crewBreaches = 0;
      let recoverySteps = 0;

      for (const evt of visibleEvents) {
        if (evt.airportId) airports.add(evt.airportId);
        if (evt.targetAirportId && evt.stageKind !== 'ORIGINAL_EVENT') {
          airports.add(evt.targetAirportId);
        }
        if (
          (evt.type === 'FLIGHT_DELAY' || evt.type === 'ROTATION_CASCADE') &&
          evt.flightId &&
          !delayedFlightIds.has(evt.flightId)
        ) {
          delayedFlightIds.add(evt.flightId);
          cumulativeDelayMins += evt.delayMinutes ?? 0;
        }
        if (evt.type === 'CONNECTION_FAILURE') {
          brokenConnections += 1;
          strandedPax += evt.passengersAffected ?? 0;
        }
        if (evt.type === 'CREW_VIOLATION') {
          crewBreaches += 1;
        }
        if (evt.type === 'RECOVERY_ACTION') {
          recoverySteps += 1;
        }
      }

      return {
        airports: Array.from(airports),
        delayedFlights: delayedFlightIds.size,
        cumulativeDelayMins,
        brokenConnections,
        strandedPax,
        crewBreaches,
        recoverySteps,
      };
    }, [visibleEvents]);

    const handlePlayPause = () => {
      if (filteredEvents.length === 0) return;
      if (isPlaying) {
        setIsPlaying(false);
        return;
      }
      if (currentStep >= filteredEvents.length) {
        setCurrentStep(1);
      }
      setIsPlaying(true);
    };

    const handleRestart = () => {
      setIsPlaying(false);
      setCurrentStep(filteredEvents.length > 0 ? 1 : 0);
    };

    const handleStepForward = () => {
      setIsPlaying(false);
      setCurrentStep((prev) => Math.min(filteredEvents.length, prev + 1));
    };

    const handleStepBack = () => {
      setIsPlaying(false);
      setCurrentStep((prev) => Math.max(0, prev - 1));
    };

    if (!hasClosures || events.length === 0) {
      return (
        <section
          aria-label="Interactive disruption timeline"
          className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] p-6"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[#253342]">
                <Clock className="w-4 h-4 text-[#477F7A]" aria-hidden="true" />
                <h3 className="text-sm font-semibold">
                  Interactive Domino Effect Timeline (Baseline Nominal)
                </h3>
              </div>
              <p className="mt-1 text-xs text-[#596775] max-w-2xl">
                No airport closures are active in the current simulation. Trigger an operational
                disruption preset or configure custom closures to step through rotation cascades,
                broken passenger connections, crew duty breaches, and recovery actions.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onTriggerPresetScenario && (
                <>
                  <button
                    type="button"
                    onClick={() => onTriggerPresetScenario('BOM', '07:30', '09:30')}
                    className="h-8 px-3 rounded bg-[#477F7A] hover:bg-[#3A6A66] text-white text-xs font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                  >
                    Simulate BOM Closure (07:30–09:30)
                  </button>
                  <button
                    type="button"
                    onClick={() => onTriggerPresetScenario('DEL', '08:00', '10:00')}
                    className="h-8 px-3 rounded bg-white hover:bg-[#F3F5F7] text-[#253342] border border-[#DCE2E8] text-xs font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                  >
                    Simulate DEL Closure (08:00–10:00)
                  </button>
                </>
              )}
              {onOpenSimulator && (
                <button
                  type="button"
                  onClick={onOpenSimulator}
                  className="h-8 px-3 rounded bg-white hover:bg-[#F3F5F7] text-[#477F7A] border border-[#DCE2E8] text-xs font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                >
                  Open Simulator Controls
                </button>
              )}
            </div>
          </div>
        </section>
      );
    }

    return (
      <section
        aria-label="Interactive disruption cascade timeline"
        className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden"
      >
        {/* Header & Playback Toolbar */}
        <div className="px-4 py-3 border-b border-[#DCE2E8] flex flex-wrap items-center justify-between gap-3 bg-[#F8FAFB]">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-[#477F7A]" aria-hidden="true" />
            <div>
              <h3 className="text-xs font-semibold text-[#253342]">
                Interactive Disruption Cascade Timeline
              </h3>
              <p className="text-[11px] text-[#596775]">
                Chronological progression from airfield closure to aircraft, passenger, crew &
                recovery impact
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Stage Filter */}
            <div
              role="group"
              aria-label="Filter timeline event types"
              className="flex items-center bg-white border border-[#DCE2E8] rounded p-0.5"
            >
              {(
                [
                  { id: 'ALL', label: 'All Events' },
                  { id: 'ORIGINAL_EVENT', label: 'Origin' },
                  { id: 'PREDICTED_IMPACT', label: 'Impacts' },
                  { id: 'RECOVERY_ACTION', label: 'Recovery' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={stageFilter === tab.id}
                  onClick={() => setStageFilter(tab.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A] ${
                    stageFilter === tab.id
                      ? 'bg-[#263746] text-white'
                      : 'text-[#596775] hover:text-[#253342]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-1 bg-white border border-[#DCE2E8] rounded p-0.5">
              <button
                type="button"
                onClick={handleRestart}
                aria-label="Restart timeline to event 1"
                title="Restart timeline"
                className="p-1.5 rounded text-[#253342] hover:bg-[#F3F5F7] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleStepBack}
                disabled={currentStep <= 0}
                aria-label="Step backward one event"
                title="Step backward"
                className="p-1.5 rounded text-[#253342] hover:bg-[#F3F5F7] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handlePlayPause}
                aria-label={isPlaying ? 'Pause timeline playback' : 'Play timeline playback'}
                className="px-2.5 py-1 rounded bg-[#477F7A] hover:bg-[#3A6A66] text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3 h-3" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current" aria-hidden="true" />
                    Play
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleStepForward}
                disabled={currentStep >= filteredEvents.length}
                aria-label="Step forward one event"
                title="Step forward"
                className="p-1.5 rounded text-[#253342] hover:bg-[#F3F5F7] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
              >
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setSpeedMs((s) => (s === 950 ? 450 : 950))}
                aria-label={`Playback speed ${speedMs === 450 ? '2x' : '1x'}`}
                className="px-2 py-1 rounded text-[11px] font-mono text-[#596775] hover:bg-[#F3F5F7] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
              >
                {speedMs === 450 ? '2x' : '1x'}
              </button>
            </div>
          </div>
        </div>

        {/* Scrubber & Cumulative Cascade Readout */}
        <div className="px-4 py-2.5 border-b border-[#DCE2E8] space-y-2.5 bg-white">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="timeline-scrubber" className="text-[11px] font-mono text-[#596775]">
              Step {currentStep}/{filteredEvents.length}
              {activeEvent ? ` · ${activeEvent.timeLabel} IST` : ''}
            </label>
            <input
              id="timeline-scrubber"
              type="range"
              min={0}
              max={filteredEvents.length}
              value={currentStep}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentStep(Number(e.target.value));
              }}
              aria-label="Timeline progression scrubber"
              className="flex-1 min-w-[160px] accent-[#477F7A] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
            />
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setCurrentStep(filteredEvents.length);
              }}
              className="text-[11px] font-medium text-[#477F7A] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A] rounded"
            >
              Show All
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="bg-[#F8FAFB] border border-[#DCE2E8] rounded px-2.5 py-1.5">
              <div className="text-[10px] text-[#596775]">Delayed Flights</div>
              <div className="font-mono font-semibold tabular-nums text-[#253342]">
                {cascadeSnapshot.delayedFlights}
              </div>
            </div>
            <div className="bg-[#F8FAFB] border border-[#DCE2E8] rounded px-2.5 py-1.5">
              <div className="text-[10px] text-[#596775]">Accumulated Delay</div>
              <div className="font-mono font-semibold tabular-nums text-[#A16D28]">
                {cascadeSnapshot.cumulativeDelayMins}m
              </div>
            </div>
            <div className="bg-[#F8FAFB] border border-[#DCE2E8] rounded px-2.5 py-1.5">
              <div className="text-[10px] text-[#596775]">Broken Connections</div>
              <div className="font-mono font-semibold tabular-nums text-[#B94A48]">
                {cascadeSnapshot.brokenConnections} ({cascadeSnapshot.strandedPax} pax)
              </div>
            </div>
            <div className="bg-[#F8FAFB] border border-[#DCE2E8] rounded px-2.5 py-1.5">
              <div className="text-[10px] text-[#596775]">Crew Violations</div>
              <div className="font-mono font-semibold tabular-nums text-[#B94A48]">
                {cascadeSnapshot.crewBreaches}
              </div>
            </div>
            <div className="bg-[#F8FAFB] border border-[#DCE2E8] rounded px-2.5 py-1.5 col-span-2 sm:col-span-1">
              <div className="text-[10px] text-[#596775]">Airports Reached</div>
              <div className="font-mono text-[11px] font-medium text-[#253342] truncate">
                {cascadeSnapshot.airports.length > 0
                  ? `${cascadeSnapshot.airports.length}: ${cascadeSnapshot.airports.join(' › ')}`
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Chronological Event List */}
        <div className="max-h-[360px] overflow-y-auto divide-y divide-[#DCE2E8]">
          {visibleEvents.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#596775]">
              Timeline at step 0. Press Play or Step Forward to watch the disruption cascade
              chronologically.
            </div>
          ) : (
            visibleEvents.map((evt, index) => {
              const isLatest = index === visibleEvents.length - 1;
              const badgeColor =
                evt.stageKind === 'ORIGINAL_EVENT'
                  ? 'text-[#B94A48] bg-[#B94A48]/10 border-[#B94A48]/30'
                  : evt.stageKind === 'RECOVERY_ACTION'
                    ? 'text-[#477F7A] bg-[#477F7A]/10 border-[#477F7A]/35'
                    : evt.severity === 'critical'
                      ? 'text-[#B94A48] bg-[#B94A48]/10 border-[#B94A48]/25'
                      : 'text-[#A16D28] bg-[#C18B45]/12 border-[#C18B45]/35';

              const stageLabel =
                evt.stageKind === 'ORIGINAL_EVENT'
                  ? 'ORIGINAL EVENT'
                  : evt.stageKind === 'RECOVERY_ACTION'
                    ? 'RECOVERY ACTION'
                    : 'PREDICTED IMPACT';

              return (
                <div
                  key={evt.id}
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStep(index + 1);
                  }}
                  className={`px-4 py-2.5 flex items-start gap-3 text-xs cursor-pointer transition-colors ${
                    isLatest ? 'bg-[#477F7A]/6' : 'hover:bg-[#F7F9FB]'
                  }`}
                >
                  {/* Timestamp Column */}
                  <div className="w-20 shrink-0 font-mono tabular-nums pt-0.5">
                    <span className="text-[#253342] font-semibold">{evt.timeLabel}</span>
                    <span className="block text-[10px] text-[#596775]">#{evt.sequence} IST</span>
                  </div>

                  {/* Event Type Icon */}
                  <div className="pt-0.5 shrink-0">
                    {evt.type === 'DISRUPTION_ORIGIN' && (
                      <Lock className="w-4 h-4 text-[#B94A48]" aria-hidden="true" />
                    )}
                    {evt.type === 'FLIGHT_DELAY' && (
                      <Clock className="w-4 h-4 text-[#A16D28]" aria-hidden="true" />
                    )}
                    {evt.type === 'ROTATION_CASCADE' && (
                      <GitBranch className="w-4 h-4 text-[#647D91]" aria-hidden="true" />
                    )}
                    {evt.type === 'CONNECTION_FAILURE' && (
                      <XCircle className="w-4 h-4 text-[#B94A48]" aria-hidden="true" />
                    )}
                    {evt.type === 'CREW_VIOLATION' && (
                      <AlertTriangle className="w-4 h-4 text-[#B94A48]" aria-hidden="true" />
                    )}
                    {evt.type === 'RECOVERY_ACTION' && (
                      <ShieldCheck className="w-4 h-4 text-[#477F7A]" aria-hidden="true" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-mono font-semibold ${badgeColor}`}
                      >
                        {stageLabel}
                      </span>
                      <span className="font-semibold text-[#253342]">{evt.title}</span>
                    </div>

                    <p className="text-[#596775] leading-relaxed">{evt.description}</p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-[#596775]">
                      <span className="inline-flex items-center gap-1 text-[#253342]">
                        {evt.airportId}
                        {evt.targetAirportId && (
                          <>
                            <ArrowRight className="w-3 h-3 text-[#596775]" aria-hidden="true" />
                            {evt.targetAirportId}
                          </>
                        )}
                      </span>
                      {evt.tailId && <span>Tail {evt.tailId}</span>}
                      {evt.passengersAffected !== undefined && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3 h-3" aria-hidden="true" />
                          {evt.passengersAffected} pax
                        </span>
                      )}
                      {evt.causedByEventId && (
                        <span className="text-[#647D91]">
                          Cause: {evt.causedByEventId.replace('evt-', '')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    );
  }
);

DominoTimelinePanel.displayName = 'DominoTimelinePanel';
