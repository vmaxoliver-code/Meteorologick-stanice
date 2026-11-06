'use client';

import React from 'react';
import { Wind, Navigation } from 'lucide-react';

interface WindRoseProps {
  speed: number | null;
  direction: number | null;
}

export const WindRose: React.FC<WindRoseProps> = ({ speed, direction }) => {
  const getCardinal = (deg: number | null): string => {
    if (deg === null || deg === undefined) return '--';
    const directions = ['S', 'SSV', 'SV', 'VSV', 'V', 'VJV', 'JV', 'JJV', 'J', 'JJZ', 'JZ', 'ZJZ', 'Z', 'ZSZ', 'SZ', 'SSZ'];
    const index = Math.round(deg / 22.5) % 16;
    return directions[index];
  };

  const speedKmh = speed !== null ? (speed * 3.6).toFixed(1) : '--';
  const cardinal = getCardinal(direction);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Větrné podmínky
        </span>
        <Wind className="w-4 h-4 text-blue-500" />
      </div>

      <div className="flex items-center justify-around py-3">
        {/* Vizuální kompasová růžice */}
        <div className="relative w-28 h-28 flex items-center justify-center rounded-full border-2 border-dashed border-zinc-200 dark:border-zinc-700">
          <span className="absolute top-1 text-[10px] font-bold text-zinc-400">S</span>
          <span className="absolute right-1.5 text-[10px] font-bold text-zinc-400">V</span>
          <span className="absolute bottom-1 text-[10px] font-bold text-zinc-400">J</span>
          <span className="absolute left-1.5 text-[10px] font-bold text-zinc-400">Z</span>

          {/* Střelka kompasu rotující podle azimutu větru */}
          <div
            className="w-12 h-12 flex items-center justify-center transition-transform duration-700 ease-out"
            style={{ transform: `rotate(${direction ?? 0}deg)` }}
          >
            <Navigation className="w-8 h-8 text-blue-500 fill-blue-500/20" />
          </div>
        </div>

        {/* Textové hodnoty rychlosti a směru */}
        <div className="space-y-2">
          <div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block">Rychlost</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                {speed !== null ? speed : '--'}
              </span>
              <span className="text-xs text-zinc-500">m/s</span>
            </div>
            <span className="text-[11px] text-zinc-400 font-mono">({speedKmh} km/h)</span>
          </div>

          <div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block">Směr větru</span>
            <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 font-mono">
              {direction !== null ? `${direction}° (${cardinal})` : '--'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
