import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Lock, MapPin } from 'lucide-react';
import type { Airport, AirportImpactSummary, FlightSimulationResult } from '../types';

interface IndiaNetworkMapProps {
  airports: Airport[];
  flights: FlightSimulationResult[];
  airportImpacts: AirportImpactSummary[];
  selectedAirportId: string | null;
  onSelectAirport: (airportId: string | null) => void;
  onQuickCloseAirport?: (airportId: string) => void;
  compact?: boolean;
}

// Geographical projection bounds covering India mainland
const MIN_LNG = 67.2;
const MAX_LNG = 98.0;
const MIN_LAT = 6.8;
const MAX_LAT = 36.2;
const VIEW_WIDTH = 680;
const VIEW_HEIGHT = 620;
const PADDING = 28;

// Cosine aspect correction around India's central latitude (~21.5°N)
const COS_LAT = Math.cos((21.5 * Math.PI) / 180);

function projectPoint(lat: number, lng: number): { x: number; y: number } {
  const usableW = VIEW_WIDTH - PADDING * 2;
  const usableH = VIEW_HEIGHT - PADDING * 2;
  const lngSpan = (MAX_LNG - MIN_LNG) * COS_LAT;
  const latSpan = MAX_LAT - MIN_LAT;
  const scale = Math.min(usableW / lngSpan, usableH / latSpan);

  const mapW = lngSpan * scale;
  const mapH = latSpan * scale;
  const offsetX = (VIEW_WIDTH - mapW) / 2;
  const offsetY = (VIEW_HEIGHT - mapH) / 2;

  const x = offsetX + (lng - MIN_LNG) * COS_LAT * scale;
  const y = offsetY + (MAX_LAT - lat) * scale;
  return { x, y };
}

// Geographical outline of India [lat, lng]
const INDIA_OUTLINE: Array<[number, number]> = [
  [35.4, 76.8],
  [34.6, 77.9],
  [33.4, 78.9],
  [32.1, 78.6],
  [31.1, 79.0],
  [30.2, 80.2],
  [29.4, 80.2],
  [28.6, 81.2],
  [27.6, 83.2],
  [27.3, 85.2],
  [26.5, 87.9],
  [27.8, 88.1],
  [27.9, 88.9],
  [27.0, 88.8],
  [26.8, 90.0],
  [26.9, 91.9],
  [27.7, 92.2],
  [28.9, 94.8],
  [28.2, 97.1],
  [27.1, 95.8],
  [26.0, 95.1],
  [24.3, 94.5],
  [22.4, 93.1],
  [23.7, 92.2],
  [24.0, 91.2],
  [25.1, 92.1],
  [25.2, 89.9],
  [24.5, 88.6],
  [22.6, 88.9],
  [21.6, 88.1],
  [21.5, 87.0],
  [20.4, 86.7],
  [19.4, 85.1],
  [18.2, 83.9],
  [17.0, 82.3],
  [15.8, 80.8],
  [13.8, 80.2],
  [12.1, 79.9],
  [10.3, 79.8],
  [9.2, 79.2],
  [8.1, 77.55],
  [8.8, 76.6],
  [10.2, 76.15],
  [11.9, 75.3],
  [13.4, 74.7],
  [15.3, 73.9],
  [17.6, 73.1],
  [19.1, 72.8],
  [20.8, 72.7],
  [21.6, 72.3],
  [20.7, 70.9],
  [22.2, 68.9],
  [23.3, 68.6],
  [24.2, 69.5],
  [24.6, 71.0],
  [26.6, 70.2],
  [28.1, 70.9],
  [29.9, 73.8],
  [31.3, 74.6],
  [32.5, 74.5],
  [33.8, 74.1],
  [34.7, 74.4],
  [35.4, 76.8],
];

const LABEL_OFFSET: Record<
  string,
  { dx: number; dy: number; anchor?: 'start' | 'end' | 'middle' }
> = {
  DEL: { dx: 8, dy: -6, anchor: 'start' },
  IXC: { dx: 8, dy: -4, anchor: 'start' },
  JAI: { dx: -8, dy: 4, anchor: 'end' },
  LKO: { dx: 8, dy: 4, anchor: 'start' },
  AMD: { dx: -8, dy: -4, anchor: 'end' },
  BOM: { dx: -9, dy: 2, anchor: 'end' },
  PNQ: { dx: 9, dy: 4, anchor: 'start' },
  GOI: { dx: -8, dy: 5, anchor: 'end' },
  HYD: { dx: 8, dy: 3, anchor: 'start' },
  BLR: { dx: 8, dy: -4, anchor: 'start' },
  MAA: { dx: 9, dy: 4, anchor: 'start' },
  COK: { dx: -8, dy: 2, anchor: 'end' },
  TRV: { dx: 8, dy: 6, anchor: 'start' },
  CCU: { dx: 8, dy: 4, anchor: 'start' },
  BBI: { dx: 8, dy: 5, anchor: 'start' },
  GAU: { dx: 8, dy: -5, anchor: 'start' },
};

type RouteStatus = 'normal' | 'delayed' | 'disrupted';

interface AggregatedRoute {
  key: string;
  from: Airport;
  to: Airport;
  flightCount: number;
  delayedCount: number;
  maxDelay: number;
  status: RouteStatus;
}

export const IndiaNetworkMap: React.FC<IndiaNetworkMapProps> = React.memo(
  ({
    airports,
    flights,
    airportImpacts,
    selectedAirportId,
    onSelectAirport,
    onQuickCloseAirport,
    compact = false,
  }) => {
    const airportById = useMemo(() => {
      const map = new Map<string, Airport>();
      for (const a of airports) map.set(a.id, a);
      return map;
    }, [airports]);

    const impactById = useMemo(() => {
      const map = new Map<string, AirportImpactSummary>();
      for (const imp of airportImpacts) map.set(imp.airportId, imp);
      return map;
    }, [airportImpacts]);

    const indiaPath = useMemo(() => {
      return (
        INDIA_OUTLINE.map(([lat, lng], idx) => {
          const { x, y } = projectPoint(lat, lng);
          return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ') + ' Z'
      );
    }, []);

    const gridLines = useMemo(() => {
      const lats = [10, 15, 20, 25, 30, 35];
      const lngs = [70, 75, 80, 85, 90, 95];
      return {
        horizontals: lats.map((lat) => ({
          lat,
          y: projectPoint(lat, MIN_LNG).y,
        })),
        verticals: lngs.map((lng) => ({
          lng,
          x: projectPoint(MIN_LAT, lng).x,
        })),
      };
    }, []);

    const routes: AggregatedRoute[] = useMemo(() => {
      const grouped = new Map<
        string,
        {
          from: Airport;
          to: Airport;
          flightCount: number;
          delayedCount: number;
          maxDelay: number;
          touchesClosed: boolean;
        }
      >();

      for (const f of flights) {
        const a1 = airportById.get(f.origin);
        const a2 = airportById.get(f.destination);
        if (!a1 || !a2) continue;

        const [first, second] = f.origin < f.destination ? [a1, a2] : [a2, a1];
        const key = `${first.id}-${second.id}`;
        const existing = grouped.get(key) ?? {
          from: first,
          to: second,
          flightCount: 0,
          delayedCount: 0,
          maxDelay: 0,
          touchesClosed: false,
        };

        existing.flightCount += 1;
        if (f.delayMinutes > 0) existing.delayedCount += 1;
        existing.maxDelay = Math.max(existing.maxDelay, f.delayMinutes);
        if (impactById.get(f.origin)?.isClosed || impactById.get(f.destination)?.isClosed) {
          existing.touchesClosed = true;
        }
        grouped.set(key, existing);
      }

      const list: AggregatedRoute[] = Array.from(grouped.entries()).map(([key, r]) => {
        let status: RouteStatus = 'normal';
        if (r.maxDelay >= 60 || (r.touchesClosed && r.delayedCount > 0)) {
          status = 'disrupted';
        } else if (r.delayedCount > 0) {
          status = 'delayed';
        }
        return {
          key,
          from: r.from,
          to: r.to,
          flightCount: r.flightCount,
          delayedCount: r.delayedCount,
          maxDelay: r.maxDelay,
          status,
        };
      });

      const rank: Record<RouteStatus, number> = { normal: 0, delayed: 1, disrupted: 2 };
      return list.sort((a, b) => rank[a.status] - rank[b.status]);
    }, [flights, airportById, impactById]);

    const selectedAirport = selectedAirportId ? airportById.get(selectedAirportId) ?? null : null;
    const selectedImpact = selectedAirportId ? impactById.get(selectedAirportId) ?? null : null;

    return (
      <div className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] flex flex-col h-full">
        {/* Map Header Controls */}
        <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-[#477F7A]" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-[#253342] tracking-tight">
              India Flight Network
            </h3>
            <span className="text-[11px] text-[#596775] font-mono tabular-nums">
              {airports.length} stations · {routes.length} corridors
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="map-station-select" className="sr-only">
              Select airport station on network map
            </label>
            <select
              id="map-station-select"
              value={selectedAirportId ?? ''}
              onChange={(e) => onSelectAirport(e.target.value || null)}
              className="h-7 bg-white border border-[#DCE2E8] rounded px-2 text-xs text-[#253342] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A] focus-visible:border-[#477F7A]"
            >
              <option value="">All Stations</option>
              {airports.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} — {a.city}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Geographical Map Viewport */}
        <div
          className={`relative bg-[#EAEFF4] flex-1 flex items-center justify-center overflow-hidden ${
            compact ? 'min-h-[340px]' : 'min-h-[460px]'
          }`}
        >
          <svg
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            className="w-full h-full max-h-[540px] select-none"
            role="img"
            aria-label="India airline route network map showing 16 stations and flight corridors"
          >
            {/* Lat/Lng Graticule */}
            <g stroke="#D6DFE7" strokeWidth="0.8">
              {gridLines.horizontals.map((g) => (
                <line key={`lat-${g.lat}`} x1={0} y1={g.y} x2={VIEW_WIDTH} y2={g.y} />
              ))}
              {gridLines.verticals.map((g) => (
                <line key={`lng-${g.lng}`} x1={g.x} y1={0} x2={g.x} y2={VIEW_HEIGHT} />
              ))}
            </g>

            {/* India Landmass */}
            <path
              d={indiaPath}
              fill="#FFFFFF"
              stroke="#9DB0C0"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />

            {/* Flight Corridors */}
            <g>
              {routes.map((route) => {
                const p1 = projectPoint(route.from.lat, route.from.lng);
                const p2 = projectPoint(route.to.lat, route.to.lng);
                const isHighlighted =
                  selectedAirportId !== null &&
                  (route.from.id === selectedAirportId || route.to.id === selectedAirportId);
                const isDimmed = selectedAirportId !== null && !isHighlighted;

                let stroke = '#647D91';
                let strokeOpacity = isHighlighted ? 0.92 : 0.45;
                let strokeWidth = isHighlighted ? 1.7 : 1.05;
                let strokeDasharray: string | undefined;

                if (route.status === 'disrupted') {
                  stroke = '#B94A48';
                  strokeOpacity = isHighlighted ? 0.98 : 0.85;
                  strokeWidth = isHighlighted ? 2.1 : 1.55;
                  strokeDasharray = '4 2';
                } else if (route.status === 'delayed') {
                  stroke = '#C18B45';
                  strokeOpacity = isHighlighted ? 0.95 : 0.82;
                  strokeWidth = isHighlighted ? 1.9 : 1.35;
                  strokeDasharray = '6 2';
                }

                if (isDimmed) {
                  strokeOpacity = 0.14;
                }

                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const cx = midX - dy * 0.08;
                const cy = midY + dx * 0.08;

                return (
                  <path
                    key={route.key}
                    d={`M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`}
                    fill="none"
                    stroke={stroke}
                    strokeOpacity={strokeOpacity}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                  >
                    <title>
                      {`${route.from.id} ↔ ${route.to.id}: ${route.flightCount} flights (${route.delayedCount} delayed, max +${route.maxDelay}m)`}
                    </title>
                  </path>
                );
              })}
            </g>

            {/* Airport Stations */}
            <g>
              {airports.map((airport) => {
                const { x, y } = projectPoint(airport.lat, airport.lng);
                const impact = impactById.get(airport.id);
                const isClosed = impact?.isClosed ?? false;
                const hasDelay = (impact?.delayedDepartures ?? 0) > 0;
                const isSelected = selectedAirportId === airport.id;

                const radius =
                  airport.tier === 'mega_hub' ? 5.2 : airport.tier === 'regional_hub' ? 4.2 : 3.3;

                let fill = airport.tier === 'spoke' ? '#647D91' : '#477F7A';
                const stroke = '#FFFFFF';
                let statusText = 'Open';
                if (isClosed) {
                  fill = '#B94A48';
                  statusText = 'Closed';
                } else if (hasDelay) {
                  fill = '#C18B45';
                  statusText = `${impact?.delayedDepartures ?? 0} delayed departures`;
                }

                const labelCfg = LABEL_OFFSET[airport.id] ?? { dx: 7, dy: 3, anchor: 'start' };

                return (
                  <g
                    key={airport.id}
                    transform={`translate(${x.toFixed(1)}, ${y.toFixed(1)})`}
                    onClick={() => onSelectAirport(isSelected ? null : airport.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectAirport(isSelected ? null : airport.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`${airport.id} ${airport.city}, status: ${statusText}`}
                    className="group cursor-pointer focus:outline-none"
                  >
                    {/* Accessible visible focus indicator for keyboard navigation */}
                    <circle
                      r={radius + 6.5}
                      fill="none"
                      stroke="#253342"
                      strokeWidth="1.6"
                      strokeDasharray="2 2"
                      className="opacity-0 group-focus-visible:opacity-100"
                    />
                    {(isSelected || isClosed) && (
                      <circle
                        r={radius + 4}
                        fill="none"
                        stroke={isClosed ? '#B94A48' : '#477F7A'}
                        strokeWidth="1.4"
                      />
                    )}
                    <circle r={radius} fill={fill} stroke={stroke} strokeWidth="1.5" />
                    <text
                      x={labelCfg.dx}
                      y={labelCfg.dy}
                      textAnchor={labelCfg.anchor ?? 'start'}
                      className="font-mono text-[10px] font-semibold"
                      fill={isClosed ? '#B94A48' : isSelected ? '#477F7A' : '#253342'}
                    >
                      {airport.id}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Compact Map Legend (Bottom-Left Overlay) */}
          <div className="absolute bottom-3 left-3 bg-white/95 border border-[#DCE2E8] rounded px-2.5 py-2 text-[11px] text-[#253342] space-y-1 shadow-[0_1px_2px_rgba(23,35,51,0.04)]">
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-[#647D91] inline-block" aria-hidden="true" />
              <span>Normal Corridor</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-4 border-t-2 border-dashed border-[#C18B45] inline-block"
                aria-hidden="true"
              />
              <span>Delayed Corridor</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-4 border-t-2 border-dotted border-[#B94A48] inline-block"
                aria-hidden="true"
              />
              <span>Disrupted / Closed</span>
            </div>
          </div>
        </div>

        {/* Selected Station Operational Readout */}
        <div className="px-4 py-2.5 border-t border-[#DCE2E8] bg-[#F8FAFB] flex flex-wrap items-center justify-between gap-3 text-xs">
          {selectedAirport && selectedImpact ? (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono font-semibold text-[#477F7A]">
                  {selectedAirport.id}
                </span>
                <span className="text-[#253342] font-medium">
                  {selectedAirport.city} · {selectedAirport.name}
                </span>
                <span className="text-[#596775] font-mono tabular-nums">
                  Cap {selectedAirport.capacity_per_hour}/hr
                </span>
                {selectedImpact.isClosed ? (
                  <span className="inline-flex items-center gap-1 text-[#B94A48] font-semibold">
                    <Lock className="w-3 h-3" aria-hidden="true" />
                    CLOSED
                  </span>
                ) : selectedImpact.delayedDepartures > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[#A16D28] font-semibold">
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                    IMPACTED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[#2E7D5B] font-semibold">
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                    OPEN
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-[#253342]">
                <span>
                  Dep {selectedImpact.departuresCount} ({selectedImpact.delayedDepartures} delayed)
                </span>
                <span>
                  Arr {selectedImpact.arrivalsCount} ({selectedImpact.delayedArrivals} delayed)
                </span>
                <span>Delay {selectedImpact.totalDepartureDelayMinutes}m</span>
                {onQuickCloseAirport && (
                  <button
                    type="button"
                    onClick={() => onQuickCloseAirport(selectedAirport.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#477F7A] hover:bg-[#3A6A66] text-white text-[11px] font-sans font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477F7A] focus-visible:ring-offset-1"
                  >
                    <Lock className="w-3 h-3" aria-hidden="true" />
                    Close {selectedAirport.id}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="w-full flex items-center justify-between text-[#596775]">
              <span>Select any airport node on the map to inspect station throughput and delays.</span>
              <span className="font-mono tabular-nums text-[#253342]">
                Closed stations: {airportImpacts.filter((a) => a.isClosed).length}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
);

IndiaNetworkMap.displayName = 'IndiaNetworkMap';
