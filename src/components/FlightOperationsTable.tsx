import React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Search,
} from 'lucide-react';
import {
  DELAY_REASON_LABEL,
  type FlightFilter,
  type SortDirection,
  type SortField,
} from '../simulationViewModels';
import type { Airport, FlightSimulationResult } from '../types';

interface FlightOperationsTableProps {
  flights: FlightSimulationResult[];
  totalFlightsCount: number;
  onTimeFlightsCount: number;
  delayedFlightsCount: number;
  airports: Airport[];
  flightFilter: FlightFilter;
  airportFilter: string;
  searchQuery: string;
  sortField: SortField;
  sortDir: SortDirection;
  maxRows?: number;
  onFlightFilterChange: (filter: FlightFilter) => void;
  onAirportFilterChange: (airportId: string) => void;
  onSearchQueryChange: (query: string) => void;
  onSort: (field: SortField) => void;
  onViewAllFlights?: () => void;
}

export const FlightOperationsTable: React.FC<FlightOperationsTableProps> = React.memo(
  ({
    flights,
    totalFlightsCount,
    onTimeFlightsCount,
    delayedFlightsCount,
    airports,
    flightFilter,
    airportFilter,
    searchQuery,
    sortField,
    sortDir,
    maxRows,
    onFlightFilterChange,
    onAirportFilterChange,
    onSearchQueryChange,
    onSort,
    onViewAllFlights,
  }) => {
    const rows = maxRows ? flights.slice(0, maxRows) : flights;

    const getAriaSort = (field: SortField): 'ascending' | 'descending' | 'none' => {
      if (sortField !== field) return 'none';
      return sortDir === 'asc' ? 'ascending' : 'descending';
    };

    const renderSortIcon = (field: SortField) => {
      if (sortField !== field) {
        return <ArrowUpDown className="w-3 h-3 text-[#596775] inline ml-1" aria-hidden="true" />;
      }
      return sortDir === 'asc' ? (
        <ArrowUp className="w-3 h-3 text-[#477F7A] inline ml-1" aria-hidden="true" />
      ) : (
        <ArrowDown className="w-3 h-3 text-[#477F7A] inline ml-1" aria-hidden="true" />
      );
    };

    return (
      <section
        aria-label="Flight operations schedule"
        className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden"
      >
        <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <h3 className="text-xs font-semibold text-[#253342] tracking-tight">
              Flight Operations Schedule
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-[#596775]">
              {flights.length} of {totalFlightsCount} legs
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <label htmlFor="flight-search-input" className="sr-only">
                Search flights by flight ID, tail ID, or station
              </label>
              <Search
                className="w-3.5 h-3.5 text-[#596775] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="flight-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="Search flight, tail, station..."
                className="h-7 w-48 bg-[#F8FAFB] border border-[#DCE2E8] rounded pl-7 pr-2 text-xs text-[#253342] placeholder:text-[#596775] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A] focus-visible:border-[#477F7A] focus-visible:bg-white"
              />
            </div>

            <div
              role="group"
              aria-label="Filter flights by schedule status"
              className="flex items-center bg-[#F3F5F7] border border-[#DCE2E8] rounded p-0.5"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'delayed', label: `Delayed (${delayedFlightsCount})` },
                  { id: 'ontime', label: `On Time (${onTimeFlightsCount})` },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={flightFilter === opt.id}
                  onClick={() => onFlightFilterChange(opt.id)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A] ${
                    flightFilter === opt.id
                      ? 'bg-[#477F7A] text-white'
                      : 'text-[#596775] hover:text-[#253342]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="flight-station-filter" className="sr-only">
                Filter flights by airport station
              </label>
              <select
                id="flight-station-filter"
                value={airportFilter}
                onChange={(e) => onAirportFilterChange(e.target.value)}
                className="h-7 bg-white border border-[#DCE2E8] rounded px-2 text-xs text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A] focus-visible:border-[#477F7A]"
              >
                <option value="ALL">All Stations</option>
                {airports.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id} — {a.city}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <caption className="sr-only">
              Simulated flight operations schedule showing scheduled and actual departure and
              arrival times, delays, and root cause attributions.
            </caption>
            <thead>
              <tr className="bg-[#F8FAFB] text-[#596775] border-b border-[#DCE2E8] text-[11px] font-medium">
                <th scope="col" aria-sort={getAriaSort('flightId')} className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => onSort('flightId')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                  >
                    Flight {renderSortIcon('flightId')}
                  </button>
                </th>
                <th scope="col" aria-sort={getAriaSort('tailId')} className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => onSort('tailId')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                  >
                    Tail / Leg {renderSortIcon('tailId')}
                  </button>
                </th>
                <th scope="col" aria-sort={getAriaSort('origin')} className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => onSort('origin')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                  >
                    Sector {renderSortIcon('origin')}
                  </button>
                </th>
                <th scope="col" aria-sort={getAriaSort('scheduledDepMins')} className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => onSort('scheduledDepMins')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                  >
                    STD / STA {renderSortIcon('scheduledDepMins')}
                  </button>
                </th>
                <th scope="col" aria-sort={getAriaSort('actualDepMins')} className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => onSort('actualDepMins')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                  >
                    ETD / ETA {renderSortIcon('actualDepMins')}
                  </button>
                </th>
                <th
                  scope="col"
                  aria-sort={getAriaSort('blockMinutes')}
                  className="py-2 px-3 text-right"
                >
                  <button
                    type="button"
                    onClick={() => onSort('blockMinutes')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                  >
                    Block {renderSortIcon('blockMinutes')}
                  </button>
                </th>
                <th scope="col" className="py-2 px-3 text-right">
                  Turn
                </th>
                <th scope="col" aria-sort={getAriaSort('delayMinutes')} className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => onSort('delayMinutes')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                  >
                    Status / Delay {renderSortIcon('delayMinutes')}
                  </button>
                </th>
                <th scope="col" className="py-2 px-3">
                  Attribution
                </th>
                <th scope="col" aria-sort={getAriaSort('pax')} className="py-2 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSort('pax')}
                    className="hover:text-[#253342] cursor-pointer whitespace-nowrap rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
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
                      {f.tailId} <span className="text-[#596775]">L{f.legOrder}</span>
                    </td>
                    <td className="py-1.5 px-3 font-mono whitespace-nowrap text-[#253342]">
                      <span>{f.origin}</span>
                      <ArrowRight
                        className="inline w-3 h-3 mx-1 text-[#596775]"
                        aria-label="to"
                      />
                      <span>{f.destination}</span>
                    </td>
                    <td className="py-1.5 px-3 font-mono tabular-nums text-[#596775] whitespace-nowrap">
                      {f.scheduledDep} – {f.scheduledArr}
                    </td>
                    <td
                      className={`py-1.5 px-3 font-mono tabular-nums font-medium whitespace-nowrap ${
                        isSevere
                          ? 'text-[#B94A48]'
                          : isDelayed
                            ? 'text-[#A16D28]'
                            : 'text-[#253342]'
                      }`}
                    >
                      {f.actualDep} – {f.actualArr}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-[#253342]">
                      {f.blockMinutes}m
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-[#596775]">
                      {f.turnaroundBeforeActualMins !== null
                        ? `${f.turnaroundBeforeActualMins}m`
                        : '—'}
                    </td>
                    <td className="py-1.5 px-3 font-mono tabular-nums whitespace-nowrap">
                      {isDelayed ? (
                        <span
                          className={`inline-flex items-center gap-1.5 font-semibold ${
                            isSevere ? 'text-[#B94A48]' : 'text-[#A16D28]'
                          }`}
                        >
                          {isSevere ? (
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          )}
                          Delayed +{f.delayMinutes}m
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[#2E7D5B] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          On Time
                        </span>
                      )}
                    </td>
                    <td
                      className="py-1.5 px-3 text-[#596775] max-w-[220px] truncate"
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
                  <td colSpan={10} className="py-8 text-center text-[#596775]">
                    No flights match the current filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {maxRows && flights.length > maxRows && onViewAllFlights && (
          <div className="px-4 py-2 border-t border-[#DCE2E8] bg-[#F8FAFB] flex items-center justify-between text-xs text-[#596775]">
            <span>
              Showing {maxRows} of {flights.length} flights
            </span>
            <button
              type="button"
              onClick={onViewAllFlights}
              className="text-[#477F7A] hover:text-[#35635F] font-medium cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
            >
              View full Flight Operations schedule →
            </button>
          </div>
        )}
      </section>
    );
  }
);

FlightOperationsTable.displayName = 'FlightOperationsTable';
