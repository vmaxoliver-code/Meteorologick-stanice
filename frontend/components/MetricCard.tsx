'use client';

import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { TrendInfo } from '../types/weather';

interface MetricCardProps {
  title: string;
  value: number | string | null;
  unit: string;
  icon: React.ReactNode;
  trend?: TrendInfo;
  subtext?: string;
  trendLabel?: string;
  colorClass?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  icon,
  trend,
  subtext,
  trendLabel = 'oproti 1h',
  colorClass = 'text-blue-500'
}) => {
  const renderTrend = () => {
    if (!trend) return null;

    const { direction, delta } = trend;
    const isRising = direction === 'rising';
    const isFalling = direction === 'falling';

    return (
      <div className="flex items-center gap-1.5 text-xs font-medium mt-2">
        {isRising && (
          <span className="flex items-center text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
            +{delta} {unit}
          </span>
        )}
        {isFalling && (
          <span className="flex items-center text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
            <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
            {delta} {unit}
          </span>
        )}
        {!isRising && !isFalling && (
          <span className="flex items-center text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700">
            <Minus className="w-3.5 h-3.5 mr-0.5" />
            0.0 {unit} (stabilní)
          </span>
        )}
        <span className="text-zinc-400 dark:text-zinc-500 text-[11px]">{trendLabel}</span>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {title}
        </span>
        <div className={`p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 ${colorClass}`}>
          {icon}
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 font-mono">
          {value !== null && value !== undefined ? value : '--'}
        </span>
        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
          {unit}
        </span>
      </div>

      {renderTrend()}

      {subtext && (
        <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {subtext}
        </div>
      )}
    </div>
  );
};
