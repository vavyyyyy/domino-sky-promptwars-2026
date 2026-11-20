import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { Airport, AirportClosureInput } from '../types';

interface ClosureControlsPanelProps {
  airports: Airport[];
  formAirport: string;
  formStart: string;
  formEnd: string;
  stagedClosures: AirportClosureInput[];
  committedClosures: AirportClosureInput[];
  hasPendingChanges: boolean;
  closureError: string | null;
  compact?: boolean;
  onFormAirportChange: (value: string) => void;
  onFormStartChange: (value: string) => void;
  onFormEndChange: (value: string) => void;
  onAddClosure: (e: React.FormEvent) => void;
  onRemoveClosure: (id: string) => void;
  onRunSimulation: () => void;
  onResetToBaseline: () => void;
}

export const ClosureControlsPanel: React.FC<ClosureControlsPanelProps> = React.memo(
  ({
    airports,
    formAirport,
    formStart,
    formEnd,
    stagedClosures,
    committedClosures,
    hasPendingChanges,
    closureError,
    compact = false,
    onFormAirportChange,
    onFormStartChange,
    onFormEndChange,
    onAddClosure,
    onRemoveClosure,
    onRunSimulation,
    onResetToBaseline,
  }) => {
    const idPrefix = compact ? 'compact-closure' : 'full-closure';

    return (
      <section
        aria-label="Airport closure controls"
        className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] p-3.5 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#477F7A]" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-[#253342]">Airport Closure Controls</h3>
          </div>
          {hasPendingChanges && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#A16D28]">
              <Clock className="w-3 h-3" aria-hidden="true" />
              Pending simulation
            </span>
          )}
        </div>

        <form
          onSubmit={onAddClosure}
          aria-describedby={`${idPrefix}-help`}
          className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
        >
          <div className={compact ? 'sm:col-span-5' : 'sm:col-span-4'}>
            <label
              htmlFor={`${idPrefix}-airport-input`}
              className="block text-[11px] font-medium text-[#596775] mb-1"
            >
              Station
            </label>
            <select
              id={`${idPrefix}-airport-input`}
              value={formAirport}
              onChange={(e) => onFormAirportChange(e.target.value)}
              className="w-full h-8 bg-white border border-[#DCE2E8] rounded px-2 text-xs text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A] focus-visible:border-[#477F7A]"
            >
              {airports.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} — {a.city}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label
              htmlFor={`${idPrefix}-start-input`}
              className="block text-[11px] font-medium text-[#596775] mb-1"
            >
              Start (IST)
            </label>
            <input
              id={`${idPrefix}-start-input`}
              type="time"
              value={formStart}
              onChange={(e) => onFormStartChange(e.target.value)}
              required
              className="w-full h-8 bg-white border border-[#DCE2E8] rounded px-2 text-xs font-mono tabular-nums text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A] focus-visible:border-[#477F7A]"
            />
          </div>

          <div className="sm:col-span-3">
            <label
              htmlFor={`${idPrefix}-end-input`}
              className="block text-[11px] font-medium text-[#596775] mb-1"
            >
              End (IST)
            </label>
            <input
              id={`${idPrefix}-end-input`}
              type="time"
              value={formEnd}
              onChange={(e) => onFormEndChange(e.target.value)}
              required
              className="w-full h-8 bg-white border border-[#DCE2E8] rounded px-2 text-xs font-mono tabular-nums text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A] focus-visible:border-[#477F7A]"
            />
          </div>

          <div className={compact ? 'sm:col-span-1' : 'sm:col-span-2'}>
            <button
              type="submit"
              aria-label="Add closure window"
              title="Add closure window"
              className="w-full h-8 flex items-center justify-center gap-1 bg-[#F3F5F7] hover:bg-[#E7ECF0] text-[#253342] border border-[#DCE2E8] rounded px-2 text-xs font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
            >
              <Plus className="w-3.5 h-3.5 text-[#477F7A]" aria-hidden="true" />
              {!compact && <span>Add</span>}
            </button>
          </div>
        </form>

        <p id={`${idPrefix}-help`} className="text-[11px] text-[#596775]">
          Closures restrict both departures and arrivals within [Start, End) IST while preserving
          scheduled block duration.
        </p>

        {closureError && (
          <div
            role="alert"
            className="flex items-start gap-2 text-[11px] text-[#B94A48] bg-[#B94A48]/10 border border-[#B94A48]/30 rounded px-2.5 py-1.5"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{closureError}</span>
          </div>
        )}

        {stagedClosures.length > 0 && (
          <ul className="space-y-1.5" aria-label="Configured airport closures">
            {stagedClosures.map((c) => {
              const isCommitted = committedClosures.some((cc) => cc.id === c.id);
              return (
                <li
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
                    <span className="inline-flex items-center gap-1 font-sans text-[11px] text-[#596775]">
                      {isCommitted ? (
                        <CheckCircle2 className="w-3 h-3 text-[#B94A48]" aria-hidden="true" />
                      ) : (
                        <Clock className="w-3 h-3 text-[#A16D28]" aria-hidden="true" />
                      )}
                      {isCommitted ? 'Active' : 'Staged'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveClosure(c.id)}
                    aria-label={`Remove ${c.airportId} closure ${c.startTime} to ${c.endTime}`}
                    className="p-1 rounded text-[#596775] hover:text-[#B94A48] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onRunSimulation}
            className="flex-1 h-8 flex items-center justify-center gap-1.5 bg-[#477F7A] hover:bg-[#3A6A66] text-white font-semibold rounded px-3 text-xs cursor-pointer transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A] focus-visible:ring-offset-1"
          >
            <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            Run Simulation
          </button>
          <button
            type="button"
            onClick={onResetToBaseline}
            disabled={stagedClosures.length === 0 && committedClosures.length === 0}
            className="h-8 flex items-center justify-center gap-1 bg-white hover:bg-[#F3F5F7] disabled:opacity-45 disabled:cursor-not-allowed text-[#253342] border border-[#DCE2E8] rounded px-3 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            Reset
          </button>
        </div>
      </section>
    );
  }
);

ClosureControlsPanel.displayName = 'ClosureControlsPanel';
