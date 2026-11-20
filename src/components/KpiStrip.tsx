import React from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { formatDelta } from '../simulationViewModels';
import type { SimulationKPIs } from '../types';

interface KpiStripProps {
  kpis: SimulationKPIs;
  baseKpis: SimulationKPIs;
}

export const KpiStrip: React.FC<KpiStripProps> = React.memo(({ kpis, baseKpis }) => {
  return (
    <section
      aria-label="Operational key performance indicators"
      className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3"
    >
      <div className="bg-white border border-[#DCE2E8] rounded-md px-3.5 py-2.5 shadow-[0_1px_2px_rgba(23,35,51,0.04)]">
        <div className="flex items-center justify-between text-[11px] text-[#596775]">
          <span>On-Time Performance</span>
          <span
            className={`inline-flex items-center gap-1 font-medium font-mono tabular-nums ${
              kpis.onTimePerformancePct === 100
                ? 'text-[#2E7D5B]'
                : kpis.onTimePerformancePct >= 85
                  ? 'text-[#A16D28]'
                  : 'text-[#B94A48]'
            }`}
          >
            {kpis.onTimePerformancePct === 100 ? (
              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
            ) : kpis.onTimePerformancePct >= 85 ? (
              <Clock className="w-3 h-3" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            )}
            {kpis.onTimeFlights}/{kpis.totalFlights}
          </span>
        </div>
        <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-[#253342]">
          {kpis.onTimePerformancePct}%
        </div>
        <div className="text-[11px] text-[#596775] font-mono tabular-nums">
          {kpis.delayedFlights} delayed flights
        </div>
      </div>

      <div className="bg-white border border-[#DCE2E8] rounded-md px-3.5 py-2.5 shadow-[0_1px_2px_rgba(23,35,51,0.04)]">
        <div className="flex items-center justify-between text-[11px] text-[#596775]">
          <span>Total Network Delay</span>
          <span className="text-[#596775] font-mono tabular-nums">
            Max {kpis.maxDelayMinutes}m
          </span>
        </div>
        <div
          className={`mt-1 text-lg font-semibold font-mono tabular-nums ${
            kpis.totalDelayMinutes > 0 ? 'text-[#A16D28]' : 'text-[#253342]'
          }`}
        >
          {kpis.totalDelayMinutes}m
        </div>
        <div className="text-[11px] text-[#596775] font-mono tabular-nums">
          Avg {kpis.averageDelayPerDelayedFlight}m / delayed leg
        </div>
      </div>

      <div className="bg-white border border-[#DCE2E8] rounded-md px-3.5 py-2.5 shadow-[0_1px_2px_rgba(23,35,51,0.04)]">
        <div className="flex items-center justify-between text-[11px] text-[#596775]">
          <span>Failed Connections</span>
          <span className="text-[#596775] font-mono tabular-nums">
            of {kpis.totalConnections}
          </span>
        </div>
        <div
          className={`mt-1 text-lg font-semibold font-mono tabular-nums flex items-center gap-1.5 ${
            kpis.failedConnectionsCount > 0 ? 'text-[#B94A48]' : 'text-[#2E7D5B]'
          }`}
        >
          {kpis.failedConnectionsCount > 0 ? (
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          <span>{kpis.failedConnectionsCount}</span>
        </div>
        <div className="text-[11px] text-[#596775] font-mono tabular-nums">
          {formatDelta(kpis.failedConnectionsCount, baseKpis.failedConnectionsCount) ??
            '100% connections intact'}
        </div>
      </div>

      <div className="bg-white border border-[#DCE2E8] rounded-md px-3.5 py-2.5 shadow-[0_1px_2px_rgba(23,35,51,0.04)]">
        <div className="flex items-center justify-between text-[11px] text-[#596775]">
          <span>Stranded Passengers</span>
          <span className="text-[#596775] font-mono tabular-nums">
            {kpis.delayedPassengers} delayed
          </span>
        </div>
        <div
          className={`mt-1 text-lg font-semibold font-mono tabular-nums ${
            kpis.strandedPassengers > 0 ? 'text-[#B94A48]' : 'text-[#253342]'
          }`}
        >
          {kpis.strandedPassengers}
        </div>
        <div className="text-[11px] text-[#596775] font-mono tabular-nums">
          of {kpis.totalPassengers} scheduled pax
        </div>
      </div>

      <div className="bg-white border border-[#DCE2E8] rounded-md px-3.5 py-2.5 shadow-[0_1px_2px_rgba(23,35,51,0.04)] col-span-2 sm:col-span-1">
        <div className="flex items-center justify-between text-[11px] text-[#596775]">
          <span>Crew Violations</span>
          <span className="text-[#596775] font-mono tabular-nums">
            Util {kpis.averageAircraftUtilisationPct}%
          </span>
        </div>
        <div
          className={`mt-1 text-lg font-semibold font-mono tabular-nums flex items-center gap-1.5 ${
            kpis.crewViolationsCount > 0 ? 'text-[#B94A48]' : 'text-[#2E7D5B]'
          }`}
        >
          {kpis.crewViolationsCount > 0 ? (
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          <span>
            {kpis.crewViolationsCount} / {kpis.totalCrews}
          </span>
        </div>
        <div className="text-[11px] text-[#596775] font-mono tabular-nums">
          {kpis.totalCrewOvertimeMinutes > 0
            ? `${kpis.totalCrewOvertimeMinutes}m total overtime`
            : 'All crews legal'}
        </div>
      </div>
    </section>
  );
});

KpiStrip.displayName = 'KpiStrip';
