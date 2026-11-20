import React from 'react';
import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { IndiaNetworkMap } from './IndiaNetworkMap';
import type { Airport, AirportImpactSummary, FlightSimulationResult } from '../types';

interface NetworkMapViewProps {
  airports: Airport[];
  flights: FlightSimulationResult[];
  airportImpacts: AirportImpactSummary[];
  selectedAirportId: string | null;
  onSelectAirport: (airportId: string | null) => void;
  onQuickCloseAirport: (airportId: string) => void;
}

export const NetworkMapView: React.FC<NetworkMapViewProps> = React.memo(
  ({
    airports,
    flights,
    airportImpacts,
    selectedAirportId,
    onSelectAirport,
    onQuickCloseAirport,
  }) => {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-7">
          <IndiaNetworkMap
            airports={airports}
            flights={flights}
            airportImpacts={airportImpacts}
            selectedAirportId={selectedAirportId}
            onSelectAirport={onSelectAirport}
            onQuickCloseAirport={onQuickCloseAirport}
          />
        </div>

        <section
          aria-label="Station operational summary"
          className="xl:col-span-5 bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden"
        >
          <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#253342]">Station Operational Summary</h3>
            <span className="text-[11px] text-[#596775] font-mono tabular-nums">
              Select station to focus
            </span>
          </div>
          <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <caption className="sr-only">
                Airport-level departure, arrival, delay, and operational status summary.
              </caption>
              <thead>
                <tr className="bg-[#F8FAFB] text-[#596775] border-b border-[#DCE2E8] text-[11px] font-medium sticky top-0">
                  <th scope="col" className="py-2 px-3">
                    Station
                  </th>
                  <th scope="col" className="py-2 px-2 text-right">
                    Dep
                  </th>
                  <th scope="col" className="py-2 px-2 text-right">
                    Arr
                  </th>
                  <th scope="col" className="py-2 px-2 text-right">
                    Delayed
                  </th>
                  <th scope="col" className="py-2 px-2 text-right">
                    Delay
                  </th>
                  <th scope="col" className="py-2 px-3 text-right">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE2E8]">
                {airportImpacts.map((imp) => {
                  const isSelected = selectedAirportId === imp.airportId;
                  return (
                    <tr
                      key={imp.airportId}
                      onClick={() => onSelectAirport(isSelected ? null : imp.airportId)}
                      className={`cursor-pointer transition-colors h-9 ${
                        isSelected ? 'bg-[#477F7A]/10' : 'hover:bg-[#F7F9FB]'
                      }`}
                    >
                      <td className="py-1.5 px-3">
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectAirport(isSelected ? null : imp.airportId);
                          }}
                          className="text-left rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A]"
                        >
                          <span className="font-mono font-semibold text-[#477F7A]">
                            {imp.airportId}
                          </span>{' '}
                          <span className="text-[#253342]">{imp.city}</span>
                        </button>
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
                            ? 'text-[#A16D28] font-medium'
                            : 'text-[#596775]'
                        }`}
                      >
                        {imp.totalDepartureDelayMinutes}m
                      </td>
                      <td className="py-1.5 px-3 text-right font-medium">
                        {imp.isClosed ? (
                          <span className="inline-flex items-center justify-end gap-1 text-[#B94A48]">
                            <Lock className="w-3 h-3" aria-hidden="true" />
                            Closed
                          </span>
                        ) : imp.delayedDepartures > 0 ? (
                          <span className="inline-flex items-center justify-end gap-1 text-[#A16D28]">
                            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                            Impacted
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-end gap-1 text-[#2E7D5B]">
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                            Open
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }
);

NetworkMapView.displayName = 'NetworkMapView';
