'use client';

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

interface ChartPoint {
  timestamp: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  wind_speed?: number;
  rainfall_mm?: number;
}

interface HistoryChartsProps {
  data: ChartPoint[];
  timeframe: '24h' | '7d' | '30d';
  onTimeframeChange: (tf: '24h' | '7d' | '30d') => void;
  isLoading?: boolean;
}

type MetricType = 'temperature' | 'humidity' | 'pressure' | 'wind_speed' | 'rainfall_mm';

interface MetricConfig {
  label: string;
  unit: string;
  color: string;
  gradientId: string;
}

const METRICS: Record<MetricType, MetricConfig> = {
  temperature: {
    label: 'Teplota',
    unit: '°C',
    color: '#f97316',
    gradientId: 'tempGrad'
  },
  humidity: {
    label: 'Relativní vlhkost',
    unit: '%',
    color: '#06b6d4',
    gradientId: 'humGrad'
  },
  pressure: {
    label: 'Atmosférický tlak',
    unit: 'hPa',
    color: '#8b5cf6',
    gradientId: 'presGrad'
  },
  wind_speed: {
    label: 'Rychlost větru',
    unit: 'm/s',
    color: '#3b82f6',
    gradientId: 'windGrad'
  },
  rainfall_mm: {
    label: 'Úhrn srážek',
    unit: 'mm',
    color: '#10b981',
    gradientId: 'rainGrad'
  }
};

export const HistoryCharts: React.FC<HistoryChartsProps> = ({
  data,
  timeframe,
  onTimeframeChange,
  isLoading = false
}) => {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('temperature');

  const currentCfg = METRICS[selectedMetric];

  const formatXAxis = (isoStr: string) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      if (timeframe === '24h') {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (timeframe === '7d') {
        return `${d.getDate()}.${d.getMonth() + 1}. ${d.getHours()}:00`;
      } else {
        return `${d.getDate()}.${d.getMonth() + 1}.`;
      }
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
      {/* Ovládací lišta: Volba metriky a časového rozsahu */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Historický průběh veličin
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Zobrazení naměřených hodnot v čase pro vybrané období
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Přepínač časového rozsahu */}
          <div className="inline-flex rounded-xl bg-zinc-100 dark:bg-zinc-800 p-1 border border-zinc-200 dark:border-zinc-700/60">
            {(['24h', '7d', '30d'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  timeframe === tf
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {tf === '24h' ? '24 hodin' : tf === '7d' ? '7 dní' : '30 dní'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Přepínače sledované veličiny */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(Object.keys(METRICS) as MetricType[]).map((key) => {
          const cfg = METRICS[key];
          const isSelected = selectedMetric === key;
          return (
            <button
              key={key}
              onClick={() => setSelectedMetric(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                isSelected
                  ? 'border-transparent text-white font-semibold shadow-sm'
                  : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              style={isSelected ? { backgroundColor: cfg.color } : {}}
            >
              {cfg.label} ({cfg.unit})
            </button>
          );
        })}
      </div>

      {/* Samotný graf (Recharts AreaChart) */}
      <div className="w-full h-72 md:h-80">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center text-zinc-400">
            <span className="animate-pulse">Načítám časovou řadu...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">
            Žádná naměřená data pro vybrané období.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={currentCfg.gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={currentCfg.color} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={currentCfg.color} stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#88888820" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatXAxis}
                tick={{ fontSize: 11, fill: '#888888' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#888888' }}
                axisLine={false}
                tickLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  borderColor: '#27272a',
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                  color: '#fff',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)'
                }}
                labelFormatter={(label) => {
                  try {
                    return new Date(label).toLocaleString();
                  } catch {
                    return label;
                  }
                }}
                formatter={(val: number) => [`${val} ${currentCfg.unit}`, currentCfg.label]}
              />
              <Area
                type="monotone"
                dataKey={selectedMetric}
                stroke={currentCfg.color}
                strokeWidth={2.5}
                fillOpacity={1}
                fill={`url(#${currentCfg.gradientId})`}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 1, fill: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
