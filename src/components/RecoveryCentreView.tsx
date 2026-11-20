import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { formatDuration } from '../timeUtils';
import type { SimulationResult } from '../types';

interface RecoveryCentreViewProps {
  simulationResult: SimulationResult;
}

export const RecoveryCentreView: React.FC<RecoveryCentreViewProps> = React.memo(
  ({ simulationResult }) => {
    const { kpis } = simulationResult;

    const sortedConnections = useMemo(
      () =>
        [...simulationResult.connections].sort(
          (a, b) =>
            Number(b.failed) - Number(a.failed) ||
            a.availableConnectMinutes - b.availableConnectMinutes
        ),
      [simulationResult.connections]
    );

    const sortedCrews = useMemo(
      () =>
        [...simulationResult.crews].sort(
          (a, b) =>
            Number(b.exceedsLimit) - Number(a.exceedsLimit) ||
            a.maxDutyMins - a.actualDutyMins - (b.maxDutyMins - b.actualDutyMins)
        ),
      [simulationResult.crews]
    );

    return (
      <div className="space-y-4">
        {/* Standby Spare Aircraft & Fleet Utilisation */}
        <section
          aria-label="Fleet and standby spare aircraft"
          className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden"
        >
          <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#253342]">Fleet & Standby Spare Aircraft</h3>
            <span className="text-[11px] font-mono tabular-nums text-[#596775]">
              {kpis.activeAircraftCount} active · {kpis.spareAircraftCount} standby spares
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <caption className="sr-only">
                Active fleet and standby spare aircraft utilisation, operating windows, and
                accumulated delays.
              </caption>
              <thead>
                <tr className="bg-[#F8FAFB] text-[#596775] border-b border-[#DCE2E8] text-[11px] font-medium">
                  <th scope="col" className="py-2 px-4">
                    Tail ID
                  </th>
                  <th scope="col" className="py-2 px-3">
                    Role / Base
                  </th>
                  <th scope="col" className="py-2 px-3 text-right">
                    Seats
                  </th>
                  <th scope="col" className="py-2 px-3 text-right">
                    Legs
                  </th>
                  <th scope="col" className="py-2 px-3">
                    Operating Window
                  </th>
                  <th scope="col" className="py-2 px-3 text-right">
                    Block Time
                  </th>
                  <th scope="col" className="py-2 px-3 text-right">
                    Ground Turn
                  </th>
                  <th scope="col" className="py-2 px-3 text-right">
                    Total Delay
                  </th>
                  <th scope="col" className="py-2 px-4 text-right">
                    24h Util
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE2E8] font-mono tabular-nums">
                {simulationResult.aircraftUtilisation.map((ac) => (
                  <tr key={ac.tailId} className="h-9 hover:bg-[#F7F9FB]">
                    <td className="py-1.5 px-4 font-semibold text-[#253342]">{ac.tailId}</td>
                    <td className="py-1.5 px-3 font-sans">
                      {ac.isSpare ? (
                        <span className="text-[#477F7A] font-medium">
                          Standby Spare ({ac.base})
                        </span>
                      ) : (
                        <span className="text-[#253342]">Active ({ac.base})</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right text-[#253342]">{ac.seats}</td>
                    <td className="py-1.5 px-3 text-right text-[#253342]">
                      {ac.flightsOperated}
                    </td>
                    <td className="py-1.5 px-3 text-[#253342] whitespace-nowrap">
                      {ac.firstActualDep && ac.lastActualArr
                        ? `${ac.firstActualDep} – ${ac.lastActualArr}`
                        : 'Available'}
                    </td>
                    <td className="py-1.5 px-3 text-right text-[#253342]">
                      {formatDuration(ac.actualBlockMinutes)}
                    </td>
                    <td className="py-1.5 px-3 text-right text-[#596775]">
                      {formatDuration(ac.totalGroundTurnaroundMinutes)}
                    </td>
                    <td
                      className={`py-1.5 px-3 text-right font-medium ${
                        ac.totalDelayMinutes > 0 ? 'text-[#A16D28]' : 'text-[#2E7D5B]'
                      }`}
                    >
                      {ac.totalDelayMinutes > 0 ? `+${ac.totalDelayMinutes}m` : '0m'}
                    </td>
                    <td className="py-1.5 px-4 text-right text-[#253342]">
                      {ac.utilisation24hPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Passenger Connections Recovery Matrix */}
          <section
            aria-label="Passenger connections integrity"
            className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#253342]">
                Passenger Connections Integrity
              </h3>
              <span className="text-[11px] font-mono tabular-nums text-[#596775]">
                {kpis.failedConnectionsCount} failed · {kpis.strandedPassengers} pax stranded
              </span>
            </div>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <caption className="sr-only">
                  Passenger connection transfers evaluated against minimum connection time.
                </caption>
                <thead>
                  <tr className="bg-[#F8FAFB] text-[#596775] border-b border-[#DCE2E8] text-[11px] font-medium sticky top-0">
                    <th scope="col" className="py-2 px-3">
                      ID
                    </th>
                    <th scope="col" className="py-2 px-2">
                      Hub
                    </th>
                    <th scope="col" className="py-2 px-2">
                      Transfer
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      Avail / Min
                    </th>
                    <th scope="col" className="py-2 px-2">
                      Status
                    </th>
                    <th scope="col" className="py-2 px-3 text-right">
                      Pax
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE2E8] font-mono tabular-nums">
                  {sortedConnections.map((c) => (
                    <tr key={c.connectionId} className="h-9 hover:bg-[#F7F9FB]">
                      <td className="py-1.5 px-3 font-semibold text-[#253342]">
                        {c.connectionId}
                      </td>
                      <td className="py-1.5 px-2 text-[#477F7A] font-semibold">{c.airport}</td>
                      <td className="py-1.5 px-2 text-[#253342] whitespace-nowrap">
                        {c.fromFlightId} ({c.fromActualArr}) → {c.toFlightId} ({c.toActualDep})
                      </td>
                      <td
                        className={`py-1.5 px-2 text-right ${
                          c.failed ? 'text-[#B94A48] font-semibold' : 'text-[#253342]'
                        }`}
                      >
                        {c.availableConnectMinutes}m / {c.minConnectMinutes}m
                      </td>
                      <td className="py-1.5 px-2 font-sans whitespace-nowrap">
                        {c.failed ? (
                          <span className="inline-flex items-center gap-1 text-[#B94A48] font-medium">
                            <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                            Failed (-{c.shortfallMinutes}m)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[#2E7D5B] font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            Intact
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-1.5 px-3 text-right font-semibold ${
                          c.failed ? 'text-[#B94A48]' : 'text-[#253342]'
                        }`}
                      >
                        {c.passengers}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Crew Duty Legality Table */}
          <section
            aria-label="Crew duty time and legality monitor"
            className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#253342]">
                Crew Duty Time & Legality Monitor
              </h3>
              <span className="text-[11px] font-mono tabular-nums text-[#596775]">
                {kpis.crewViolationsCount} violations
              </span>
            </div>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <caption className="sr-only">
                  Crew duty start, end, total duration, and maximum duty legality status.
                </caption>
                <thead>
                  <tr className="bg-[#F8FAFB] text-[#596775] border-b border-[#DCE2E8] text-[11px] font-medium sticky top-0">
                    <th scope="col" className="py-2 px-3">
                      Crew
                    </th>
                    <th scope="col" className="py-2 px-2">
                      Tail
                    </th>
                    <th scope="col" className="py-2 px-2">
                      Window
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      Duty / Max
                    </th>
                    <th scope="col" className="py-2 px-3 text-right">
                      Legality
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE2E8] font-mono tabular-nums">
                  {sortedCrews.map((cr) => {
                    const margin = cr.maxDutyMins - cr.actualDutyMins;
                    return (
                      <tr key={cr.crewId} className="h-9 hover:bg-[#F7F9FB]">
                        <td className="py-1.5 px-3 font-semibold text-[#253342]">{cr.crewId}</td>
                        <td className="py-1.5 px-2 text-[#253342]">
                          {cr.tailId} <span className="text-[#596775]">({cr.base})</span>
                        </td>
                        <td className="py-1.5 px-2 text-[#253342] whitespace-nowrap">
                          {cr.dutyStart} – {cr.actualDutyEnd}
                        </td>
                        <td className="py-1.5 px-2 text-right text-[#253342]">
                          {cr.actualDutyMins}m / {cr.maxDutyMins}m
                        </td>
                        <td className="py-1.5 px-3 text-right font-sans whitespace-nowrap">
                          {cr.exceedsLimit ? (
                            <span className="inline-flex items-center justify-end gap-1 text-[#B94A48] font-semibold font-mono">
                              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                              Violation (+{cr.overtimeMins}m)
                            </span>
                          ) : margin <= 20 ? (
                            <span className="inline-flex items-center justify-end gap-1 text-[#A16D28] font-medium font-mono">
                              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                              Watch ({margin}m margin)
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-end gap-1 text-[#2E7D5B] font-mono">
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              Legal ({margin}m margin)
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
      </div>
    );
  }
);

RecoveryCentreView.displayName = 'RecoveryCentreView';
