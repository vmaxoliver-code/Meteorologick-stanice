'use client';

import React from 'react';
import { CloudRain, Compass, Droplets, Sparkles, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { PredictionDetails } from '../types/weather';

interface PredictionWidgetProps {
  prediction: PredictionDetails | null;
  currentTemp?: number | null;
}

export const PredictionWidget: React.FC<PredictionWidgetProps> = ({
  prediction,
  currentTemp
}) => {
  if (!prediction) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 animate-pulse">
        <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3 mb-4"></div>
        <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-2/3"></div>
      </div>
    );
  }

  const {
    dew_point_c,
    barometric_tendency,
    pressure_delta_3h,
    zambretti_code,
    zambretti_forecast,
    rain_probability_pct,
    forecast_12h_24h
  } = prediction;

  // Barva indikátoru srážek
  const getRainColor = (prob: number) => {
    if (prob >= 70) return 'text-rose-500 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900';
    if (prob >= 40) return 'text-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900';
    return 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900';
  };

  const isRising = pressure_delta_3h >= 1.0;
  const isFalling = pressure_delta_3h <= -1.0;

  return (
    <div className="bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
      {/* Hlavička s odznakem AI / Predikce */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Predikční systém & Analytika
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Hybridní model: Zambrettiho barometrie + fyzikální pravidla
            </p>
          </div>
        </div>

        <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold border border-zinc-200 dark:border-zinc-700">
          Kód Zambretti: {zambretti_code}
        </span>
      </div>

      {/* Hlavní textová předpověď na 12/24 hodin */}
      <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-xl p-4 mb-5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-1">
          Výhled na 12 - 24 hodin
        </span>
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-relaxed">
          {forecast_12h_24h}
        </p>
      </div>

      {/* Grid se 3 analytickými pilíři */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Barometrická tendence (3h) */}
        <div className="bg-white dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Tendence tlaku (3h)</span>
            {isRising && <TrendingUp className="w-4 h-4 text-emerald-500" />}
            {isFalling && <TrendingDown className="w-4 h-4 text-rose-500" />}
            {!isRising && !isFalling && <Minus className="w-4 h-4 text-zinc-400" />}
          </div>
          <div className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100">
            {pressure_delta_3h > 0 ? `+${pressure_delta_3h}` : pressure_delta_3h} hPa
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 font-medium">
            {barometric_tendency}
          </p>
        </div>

        {/* 2. Rosný bod (Dew Point) */}
        <div className="bg-white dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Rosný bod</span>
            <Droplets className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100">
            {dew_point_c !== null ? `${dew_point_c} °C` : '--'}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            {currentTemp !== undefined && dew_point_c !== null && currentTemp !== null
              ? `Rozptyl (T - Td): ${(currentTemp - dew_point_c).toFixed(1)} °C`
              : 'Magnus-Tetens výpočet'}
          </p>
        </div>

        {/* 3. Pravděpodobnost srážek */}
        <div className="bg-white dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Riziko srážek</span>
            <CloudRain className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-zinc-900 dark:text-zinc-100">
              {rain_probability_pct} %
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getRainColor(rain_probability_pct)}`}>
              {rain_probability_pct >= 70 ? 'Vysoké' : rain_probability_pct >= 35 ? 'Střední' : 'Nízké'}
            </span>
          </div>

          {/* Vizuální progress bar */}
          <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-2 rounded-full mt-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                rain_probability_pct >= 70
                  ? 'bg-rose-500'
                  : rain_probability_pct >= 40
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${rain_probability_pct}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Podrobná poznámka Zambretti */}
      <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800/80 flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <Compass className="w-4 h-4 mt-0.5 text-zinc-400 shrink-0" />
        <span>
          <strong className="text-zinc-700 dark:text-zinc-300">Zambretti interpretace:</strong>{' '}
          {zambretti_forecast}
        </span>
      </div>
    </div>
  );
};
