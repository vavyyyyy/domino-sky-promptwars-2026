import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import type { OperationalAlert } from '../simulationViewModels';

interface OperationalAlertsPanelProps {
  alerts: OperationalAlert[];
  totalFlights: number;
  totalConnections: number;
  totalCrews: number;
}

export const OperationalAlertsPanel: React.FC<OperationalAlertsPanelProps> = React.memo(
  ({ alerts, totalFlights, totalConnections, totalCrews }) => {
    return (
      <section
        aria-label="Operational alerts"
        className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] flex-1 flex flex-col min-h-[240px]"
      >
        <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5 text-[#647D91]" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-[#253342]">Operational Alerts</h3>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-[#596775]">
            {alerts.length} items
          </span>
        </div>

        <div className="overflow-y-auto max-h-[260px]">
          {alerts.length === 0 ? (
            <div className="p-4 text-xs text-[#596775] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#2E7D5B] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-[#253342] font-medium">All network operations nominal</p>
                <p className="mt-0.5 text-[#596775]">
                  {totalFlights} flights on schedule, {totalConnections} passenger connections
                  protected, and {totalCrews} crew rosters within duty limits.
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-[#DCE2E8]">
              {alerts.map((alert) => (
                <li key={alert.id} className="px-4 py-2.5 text-xs space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold ${
                        alert.severity === 'critical' ? 'text-[#B94A48]' : 'text-[#A16D28]'
                      }`}
                    >
                      {alert.severity === 'critical' ? (
                        <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                      ) : (
                        <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                      )}
                      {alert.severity.toUpperCase()} · {alert.category}
                    </span>
                  </div>
                  <p className="text-[#253342] font-medium">{alert.message}</p>
                  <p className="text-[11px] text-[#596775] font-mono tabular-nums">
                    {alert.detail}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }
);

OperationalAlertsPanel.displayName = 'OperationalAlertsPanel';
