import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { buildScenarioComparisonRows } from '../simulationViewModels';
import type { SimulationKPIs } from '../types';

interface ScenarioComparisonTableProps {
  baseKpis: SimulationKPIs;
  kpis: SimulationKPIs;
  activeClosuresCount: number;
}

export const ScenarioComparisonTable: React.FC<ScenarioComparisonTableProps> = React.memo(
  ({ baseKpis, kpis, activeClosuresCount }) => {
    const rows = useMemo(
      () => buildScenarioComparisonRows(baseKpis, kpis),
      [baseKpis, kpis]
    );

    return (
      <section
        aria-label="Scenario impact comparison"
        className="bg-white border border-[#DCE2E8] rounded-md shadow-[0_1px_2px_rgba(23,35,51,0.04)] overflow-hidden"
      >
        <div className="px-4 py-2.5 border-b border-[#DCE2E8] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#253342]">
            Scenario Impact Comparison (Baseline vs Active)
          </h3>
          <span className="text-[11px] font-mono tabular-nums text-[#596775]">
            {activeClosuresCount} active closure{activeClosuresCount === 1 ? '' : 's'}
          </span>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <caption className="sr-only">
            Comparison of key operational metrics between the baseline schedule and active
            disruption simulation.
          </caption>
          <thead>
            <tr className="bg-[#F8FAFB] text-[#596775] border-b border-[#DCE2E8] text-[11px] font-medium">
              <th scope="col" className="py-2 px-4">
                Operational Metric
              </th>
              <th scope="col" className="py-2 px-4 text-right">
                Baseline
              </th>
              <th scope="col" className="py-2 px-4 text-right">
                Simulated
              </th>
              <th scope="col" className="py-2 px-4 text-right">
                Delta
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DCE2E8] font-mono tabular-nums">
            {rows.map((row) => {
              const isZero = row.delta === 0;
              const isBad = row.goodIfPositive ? row.delta < 0 : row.delta > 0;
              return (
                <tr key={row.label} className="h-9 hover:bg-[#F7F9FB]">
                  <td className="py-1.5 px-4 font-sans text-[#253342]">{row.label}</td>
                  <td className="py-1.5 px-4 text-right text-[#596775]">{row.base}</td>
                  <td className="py-1.5 px-4 text-right text-[#253342] font-semibold">
                    {row.sim}
                  </td>
                  <td
                    className={`py-1.5 px-4 text-right font-semibold ${
                      isZero
                        ? 'text-[#596775]'
                        : isBad
                          ? 'text-[#B94A48]'
                          : 'text-[#2E7D5B]'
                    }`}
                  >
                    {isZero ? (
                      '0'
                    ) : (
                      <span className="inline-flex items-center justify-end gap-1">
                        {isBad ? (
                          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                        )}
                        {`${row.delta > 0 ? '+' : ''}${row.delta}${row.unit}`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    );
  }
);

ScenarioComparisonTable.displayName = 'ScenarioComparisonTable';
