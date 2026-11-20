import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildAirportDelayChartData,
  buildDelayCauseData,
  buildFleetUtilisationData,
  buildHourlyDepartureProfile,
} from '../simulationViewModels';
import type { SimulationResult } from '../types';

interface AnalyticsViewProps {
  simulationResult: SimulationResult;
}

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderColor: '#DCE2E8',
  borderRadius: '4px',
  fontSize: '12px',
  color: '#253342',
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = React.memo(({ simulationResult }) => {
  const { kpis } = simulationResult;

  const airportDelayChartData = useMemo(
    () => buildAirportDelayChartData(simulationResult),
    [simulationResult]
  );
  const delayCauseData = useMemo(
    () => buildDelayCauseData(simulationResult),
    [simulationResult]
  );
  const hourlyDepartureProfile = useMemo(
    () => buildHourlyDepartureProfile(simulationResult),
    [simulationResult]
  );
  const fleetUtilisationData = useMemo(
    () => buildFleetUtilisationData(simulationResult),
    [simulationResult]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Chart 1: Airport Departure Delay Minutes */}
      <section
        aria-label="Departure delay by airport chart"
        className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-semibold text-[#253342]">
              Departure Delay by Airport (Top 10)
            </h3>
            <p className="text-[11px] text-[#596775]">
              Total departure delay minutes per station
            </p>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-[#596775]">
            Total {kpis.totalDelayMinutes}m
          </span>
        </div>
        {kpis.totalDelayMinutes === 0 ? (
          <div className="h-56 flex items-center justify-center border border-dashed border-[#DCE2E8] rounded text-xs text-[#596775]">
            Baseline active (0m delay). Run a closure scenario to inspect station delays.
          </div>
        ) : (
          <div className="h-56 w-full min-w-0">
            <ResponsiveContainer width="100%" height={224}>
              <BarChart
                data={airportDelayChartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E9EE" />
                <XAxis dataKey="airportId" stroke="#596775" fontSize={11} />
                <YAxis stroke="#596775" fontSize={11} unit="m" />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar
                  dataKey="totalDepartureDelayMinutes"
                  name="Departure Delay (m)"
                  radius={[2, 2, 0, 0]}
                >
                  {airportDelayChartData.map((entry) => (
                    <Cell
                      key={entry.airportId}
                      fill={
                        entry.isClosed
                          ? '#B94A48'
                          : entry.totalDepartureDelayMinutes > 0
                            ? '#C18B45'
                            : '#647D91'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Chart 2: Delay Attribution Breakdown */}
      <section
        aria-label="Delay attribution by root cause chart"
        className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-semibold text-[#253342]">
              Delay Attribution by Root Cause
            </h3>
            <p className="text-[11px] text-[#596775]">
              Flights affected and delay minutes by mechanism
            </p>
          </div>
        </div>
        {kpis.totalDelayMinutes === 0 ? (
          <div className="h-56 flex items-center justify-center border border-dashed border-[#DCE2E8] rounded text-xs text-[#596775]">
            No delayed legs in current simulation.
          </div>
        ) : (
          <div className="h-56 w-full min-w-0">
            <ResponsiveContainer width="100%" height={224}>
              <BarChart
                data={delayCauseData}
                margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E9EE" />
                <XAxis dataKey="reason" stroke="#596775" fontSize={11} />
                <YAxis stroke="#596775" fontSize={11} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  dataKey="delayMins"
                  name="Delay Minutes"
                  fill="#C18B45"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="flights"
                  name="Affected Flights"
                  fill="#647D91"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Chart 3: Hourly Departure Profile (Scheduled vs Actual) */}
      <section
        aria-label="Hourly departure profile chart"
        className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-semibold text-[#253342]">
              Hourly Departure Profile (Scheduled vs Actual)
            </h3>
            <p className="text-[11px] text-[#596775]">
              Departures per IST hour bucket across the operating day
            </p>
          </div>
        </div>
        <div className="h-56 w-full min-w-0">
          <ResponsiveContainer width="100%" height={224}>
            <BarChart
              data={hourlyDepartureProfile}
              margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E9EE" />
              <XAxis dataKey="hour" stroke="#596775" fontSize={11} />
              <YAxis stroke="#596775" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar
                dataKey="scheduled"
                name="Scheduled Deps"
                fill="#647D91"
                radius={[2, 2, 0, 0]}
              />
              <Bar dataKey="actual" name="Actual Deps" fill="#477F7A" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Chart 4: Aircraft 24h Utilisation */}
      <section
        aria-label="Active fleet utilisation chart"
        className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-semibold text-[#253342]">Active Fleet Utilisation (%)</h3>
            <p className="text-[11px] text-[#596775]">
              Block hours flown as percentage of 24-hour operating day
            </p>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-[#596775]">
            Mean {kpis.averageAircraftUtilisationPct}%
          </span>
        </div>
        <div className="h-56 w-full min-w-0">
          <ResponsiveContainer width="100%" height={224}>
            <BarChart
              data={fleetUtilisationData}
              margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E9EE" />
              <XAxis dataKey="tailId" stroke="#596775" fontSize={10} />
              <YAxis stroke="#596775" fontSize={11} unit="%" />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar
                dataKey="utilisationPct"
                name="24h Utilisation (%)"
                fill="#477F7A"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
});

AnalyticsView.displayName = 'AnalyticsView';
