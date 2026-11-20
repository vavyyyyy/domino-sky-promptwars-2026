import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Moon,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatClosureDurationSummary,
  getAvailableClosurePresets,
  stepTimeString,
  validateClosureWindow,
} from '../closureUtils';
import type { Airport, AirportClosureInput } from '../types';

export interface UpdateClosureResult {
  ok: boolean;
  error?: string;
}

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
  onStagePresetClosure: (airportId: string, startTime: string, endTime: string) => void;
  onUpdateClosure: (
    id: string,
    airportId: string,
    startTime: string,
    endTime: string
  ) => UpdateClosureResult;
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
    onStagePresetClosure,
    onUpdateClosure,
    onRemoveClosure,
    onRunSimulation,
    onResetToBaseline,
  }) => {
    const idPrefix = compact ? 'compact-closure' : 'full-closure';

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editAirport, setEditAirport] = useState<string>('');
    const [editStart, setEditStart] = useState<string>('');
    const [editEnd, setEditEnd] = useState<string>('');
    const [editError, setEditError] = useState<string | null>(null);

    const validAirportIds = useMemo(() => new Set(airports.map((a) => a.id)), [airports]);
    const airportById = useMemo(() => new Map(airports.map((a) => [a.id, a])), [airports]);
    const availablePresets = useMemo(() => getAvailableClosurePresets(airports), [airports]);

    const liveFormPreview = useMemo(
      () =>
        validateClosureWindow(
          { airportId: formAirport, startTime: formStart, endTime: formEnd },
          validAirportIds
        ),
      [formAirport, formStart, formEnd, validAirportIds]
    );

    const startEditingRow = (closure: AirportClosureInput) => {
      setEditingId(closure.id);
      setEditAirport(closure.airportId);
      setEditStart(closure.startTime);
      setEditEnd(closure.endTime);
      setEditError(null);
    };

    const cancelEditingRow = () => {
      setEditingId(null);
      setEditError(null);
    };

    const saveEditingRow = (id: string) => {
      const res = onUpdateClosure(id, editAirport, editStart, editEnd);
      if (res.ok) {
        setEditingId(null);
        setEditError(null);
      } else {
        setEditError(res.error ?? 'Unable to update closure window.');
      }
    };

    const handleTimeKeyDown = (
      e: React.KeyboardEvent<HTMLInputElement>,
      currentValue: string,
      onChange: (next: string) => void,
      allow2400 = false,
      onEnter?: () => void,
      onEscape?: () => void
    ) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 15 : 1);
        const stepped = stepTimeString(currentValue, delta, allow2400);
        if (stepped) {
          e.preventDefault();
          onChange(stepped);
        }
      } else if (e.key === 'Enter' && onEnter) {
        e.preventDefault();
        onEnter();
      } else if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
      }
    };

    const displayedError = editError ?? closureError;

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
          <div className="flex items-center gap-2">
            {stagedClosures.length > 0 && (
              <span className="text-[11px] font-mono tabular-nums text-[#596775]">
                {stagedClosures.length} window{stagedClosures.length === 1 ? '' : 's'}
              </span>
            )}
            {hasPendingChanges && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#A16D28]">
                <Clock className="w-3 h-3" aria-hidden="true" />
                Pending simulation
              </span>
            )}
          </div>
        </div>

        {/* Custom Closure Scheduling Form */}
        <form
          onSubmit={onAddClosure}
          noValidate
          aria-describedby={`${idPrefix}-help`}
          className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
        >
          <div className={compact ? 'sm:col-span-5' : 'sm:col-span-4'}>
            <label
              htmlFor={`${idPrefix}-airport-input`}
              className="block text-[11px] font-medium text-[#596775] mb-1"
            >
              Airport Station
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
              Start (24h IST)
            </label>
            <input
              id={`${idPrefix}-start-input`}
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder="HH:MM"
              value={formStart}
              onChange={(e) => onFormStartChange(e.target.value)}
              onKeyDown={(e) => handleTimeKeyDown(e, formStart, onFormStartChange, false)}
              aria-invalid={formStart.trim().length >= 5 && !liveFormPreview.valid}
              required
              className="w-full h-8 bg-white border border-[#DCE2E8] rounded px-2 text-xs font-mono tabular-nums text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A] focus-visible:border-[#477F7A]"
            />
          </div>

          <div className="sm:col-span-3">
            <label
              htmlFor={`${idPrefix}-end-input`}
              className="block text-[11px] font-medium text-[#596775] mb-1"
            >
              End (24h IST)
            </label>
            <input
              id={`${idPrefix}-end-input`}
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder="HH:MM"
              value={formEnd}
              onChange={(e) => onFormEndChange(e.target.value)}
              onKeyDown={(e) => handleTimeKeyDown(e, formEnd, onFormEndChange, true)}
              aria-invalid={formEnd.trim().length >= 5 && !liveFormPreview.valid}
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

        {/* Live Window Duration / Format Helper */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <p id={`${idPrefix}-help`} className="text-[#596775]">
            24h IST minute precision (e.g. 07:15–09:45 or overnight 22:00–02:00). Affects arrivals
            &amp; departures.
          </p>
          {liveFormPreview.valid ? (
            <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#477F7A] font-medium">
              {liveFormPreview.normalized.isOvernight && (
                <Moon className="w-3 h-3 text-[#647D91]" aria-hidden="true" />
              )}
              {formatClosureDurationSummary(
                liveFormPreview.normalized.durationMinutes,
                liveFormPreview.normalized.isOvernight
              )}
            </span>
          ) : (
            formStart.trim().length > 0 &&
            formEnd.trim().length > 0 && (
              <span className="text-[#B94A48] font-medium">Check HH:MM range</span>
            )
          )}
        </div>

        {/* Optional Quick Presets (Non-restrictive shortcuts) */}
        {availablePresets.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-1.5 pt-0.5"
            role="group"
            aria-label="Optional quick closure presets"
          >
            <span className="text-[11px] text-[#596775] mr-0.5">Quick presets:</span>
            {availablePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  onStagePresetClosure(preset.airportId, preset.startTime, preset.endTime)
                }
                title={`Stage optional preset ${preset.airportId} ${preset.startTime}–${preset.endTime} IST`}
                className="h-6 px-2 rounded bg-[#F3F5F7] hover:bg-[#E7ECF0] border border-[#DCE2E8] text-[11px] font-mono tabular-nums text-[#253342] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
              >
                {preset.airportId} {preset.startTime}–{preset.endTime}
              </button>
            ))}
          </div>
        )}

        {displayedError && (
          <div
            role="alert"
            className="flex items-start gap-2 text-[11px] text-[#B94A48] bg-[#B94A48]/10 border border-[#B94A48]/30 rounded px-2.5 py-1.5"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{displayedError}</span>
          </div>
        )}

        {/* Staged & Active Closures Table */}
        {stagedClosures.length > 0 ? (
          <div className="border border-[#DCE2E8] rounded overflow-x-auto">
            <table
              className="w-full text-left border-collapse text-xs"
              aria-label="Staged and active airport closures"
            >
              <thead>
                <tr className="bg-[#F8FAFB] text-[#596775] border-b border-[#DCE2E8] text-[11px] font-medium">
                  <th scope="col" className="py-1.5 px-2.5">
                    Station
                  </th>
                  <th scope="col" className="py-1.5 px-2.5">
                    Window (IST)
                  </th>
                  <th scope="col" className="py-1.5 px-2.5">
                    Duration
                  </th>
                  <th scope="col" className="py-1.5 px-2.5">
                    Status
                  </th>
                  <th scope="col" className="py-1.5 px-2.5 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE2E8]">
                {stagedClosures.map((c) => {
                  const isCommitted = committedClosures.some(
                    (cc) =>
                      cc.id === c.id &&
                      cc.airportId === c.airportId &&
                      cc.startTime === c.startTime &&
                      cc.endTime === c.endTime
                  );
                  const isEditing = editingId === c.id;
                  const parsed = validateClosureWindow(c, validAirportIds);
                  const isOvernight = parsed.valid && parsed.normalized.isOvernight;
                  const durationMins = parsed.valid ? parsed.normalized.durationMinutes : 0;
                  const airportInfo = airportById.get(c.airportId);

                  if (isEditing) {
                    const editCheck = validateClosureWindow(
                      { airportId: editAirport, startTime: editStart, endTime: editEnd },
                      validAirportIds,
                      stagedClosures,
                      c.id
                    );
                    return (
                      <tr key={c.id} className="bg-[#F8FAFB]">
                        <td className="py-1.5 px-2">
                          <label htmlFor={`${idPrefix}-edit-airport-${c.id}`} className="sr-only">
                            Edit station
                          </label>
                          <select
                            id={`${idPrefix}-edit-airport-${c.id}`}
                            value={editAirport}
                            onChange={(e) => {
                              setEditAirport(e.target.value);
                              setEditError(null);
                            }}
                            className="w-full h-7 bg-white border border-[#DCE2E8] rounded px-1.5 text-[11px] text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                          >
                            {airports.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.id}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1.5 px-2" colSpan={2}>
                          <div className="flex items-center gap-1">
                            <label htmlFor={`${idPrefix}-edit-start-${c.id}`} className="sr-only">
                              Edit start time (IST)
                            </label>
                            <input
                              id={`${idPrefix}-edit-start-${c.id}`}
                              type="text"
                              inputMode="numeric"
                              maxLength={5}
                              placeholder="HH:MM"
                              value={editStart}
                              onChange={(e) => {
                                setEditStart(e.target.value);
                                setEditError(null);
                              }}
                              onKeyDown={(e) =>
                                handleTimeKeyDown(
                                  e,
                                  editStart,
                                  setEditStart,
                                  false,
                                  () => saveEditingRow(c.id),
                                  cancelEditingRow
                                )
                              }
                              className="w-16 h-7 bg-white border border-[#DCE2E8] rounded px-1.5 text-[11px] font-mono tabular-nums text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                            />
                            <span className="text-[#596775]">–</span>
                            <label htmlFor={`${idPrefix}-edit-end-${c.id}`} className="sr-only">
                              Edit end time (IST)
                            </label>
                            <input
                              id={`${idPrefix}-edit-end-${c.id}`}
                              type="text"
                              inputMode="numeric"
                              maxLength={5}
                              placeholder="HH:MM"
                              value={editEnd}
                              onChange={(e) => {
                                setEditEnd(e.target.value);
                                setEditError(null);
                              }}
                              onKeyDown={(e) =>
                                handleTimeKeyDown(
                                  e,
                                  editEnd,
                                  setEditEnd,
                                  true,
                                  () => saveEditingRow(c.id),
                                  cancelEditingRow
                                )
                              }
                              className="w-16 h-7 bg-white border border-[#DCE2E8] rounded px-1.5 text-[11px] font-mono tabular-nums text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                            />
                            {editCheck.valid && editCheck.normalized.isOvernight && (
                              <span className="text-[10px] font-mono text-[#647D91]">+1d</span>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-[11px] text-[#596775]">Editing</td>
                        <td className="py-1.5 px-2 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => saveEditingRow(c.id)}
                              aria-label={`Save closure changes for ${editAirport}`}
                              title="Save changes"
                              className="p-1 rounded bg-[#477F7A] text-white hover:bg-[#3A6A66] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingRow}
                              aria-label="Cancel closure edit"
                              title="Cancel edit"
                              className="p-1 rounded border border-[#DCE2E8] bg-white text-[#596775] hover:text-[#253342] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                            >
                              <X className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={c.id}
                      className={isCommitted ? 'bg-[#B94A48]/5' : 'bg-[#C18B45]/5'}
                    >
                      <td className="py-1.5 px-2.5 whitespace-nowrap">
                        <span className="font-mono font-semibold text-[#477F7A]">
                          {c.airportId}
                        </span>
                        {!compact && airportInfo && (
                          <span className="ml-1.5 text-[11px] text-[#596775]">
                            {airportInfo.city}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2.5 font-mono tabular-nums text-[#253342] whitespace-nowrap">
                        <span>
                          {c.startTime}–{c.endTime}
                        </span>
                        {isOvernight && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-sans font-medium text-[#647D91]">
                            (+1d)
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2.5 font-mono tabular-nums text-[#596775] whitespace-nowrap">
                        {parsed.valid
                          ? formatClosureDurationSummary(durationMins, isOvernight)
                          : '—'}
                      </td>
                      <td className="py-1.5 px-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                            isCommitted ? 'text-[#B94A48]' : 'text-[#A16D28]'
                          }`}
                        >
                          {isCommitted ? (
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                          ) : (
                            <Clock className="w-3 h-3" aria-hidden="true" />
                          )}
                          {isCommitted ? 'Active' : 'Staged'}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditingRow(c)}
                            aria-label={`Edit ${c.airportId} closure ${c.startTime} to ${c.endTime}`}
                            title="Edit closure window"
                            className="p-1 rounded text-[#596775] hover:text-[#477F7A] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (editingId === c.id) cancelEditingRow();
                              onRemoveClosure(c.id);
                            }}
                            aria-label={`Remove ${c.airportId} closure ${c.startTime} to ${c.endTime}`}
                            title="Remove closure window"
                            className="p-1 rounded text-[#596775] hover:text-[#B94A48] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          !compact && (
            <p className="text-[11px] text-[#596775] bg-[#F8FAFB] border border-dashed border-[#DCE2E8] rounded px-3 py-2">
              No closure windows staged. Select any airport and enter custom 24-hour IST start/end
              times above, or use a quick preset shortcut.
            </p>
          )
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
            onClick={() => {
              cancelEditingRow();
              onResetToBaseline();
            }}
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
