'use client';

import React from 'react';
import { Battery, BatteryCharging, Radio, Wifi, WifiOff, Clock } from 'lucide-react';
import { BatteryStatus } from '../types/weather';

interface DiagnosticsCardProps {
  online: boolean;
  lastSeenSeconds: number | null;
  battery: BatteryStatus;
}

export const DiagnosticsCard: React.FC<DiagnosticsCardProps> = ({
  online,
  lastSeenSeconds,
  battery
}) => {
  const formatLastSeen = (sec: number | null) => {
    if (sec === null || sec === undefined) return 'Zatím nepřipojeno';
    if (sec < 60) return `před ${sec} s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `před ${min} min`;
    const h = Math.floor(min / 60);
    return `před ${h} h ${min % 60} min`;
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Diagnostika HW Stanice
        </span>
        <Radio className="w-4 h-4 text-zinc-400" />
      </div>

      <div className="space-y-4">
        {/* Stav spojení (Online / Offline timeout > 5 min) */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            {online ? (
              <div className="relative flex items-center justify-center">
                <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </div>
            ) : (
              <span className="inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
            )}
            <div>
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">
                {online ? 'STANICE ONLINE' : 'STANICE OFFLINE'}
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                Poslední odezva: {formatLastSeen(lastSeenSeconds)}
              </span>
            </div>
          </div>

          <div className="text-right">
            {online ? (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                <Wifi className="w-3 h-3" /> Aktivní
              </span>
            ) : (
              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-1 rounded-md border border-rose-200 dark:border-rose-800 flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Timeout &gt; 5 min
              </span>
            )}
          </div>
        </div>

        {/* Stav baterie stanice */}
        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
              <Battery className="w-4 h-4 text-zinc-500" />
              Napětí akumulátoru
            </span>
            <span className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {battery.voltage !== null ? `${battery.voltage} V` : '--'} ({battery.percentage} %)
            </span>
          </div>

          {/* Kapacitní ukazatel */}
          <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                battery.color === 'green'
                  ? 'bg-emerald-500'
                  : battery.color === 'yellow'
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
              style={{ width: `${battery.percentage}%` }}
            ></div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>Stav: <strong className="text-zinc-700 dark:text-zinc-300">{battery.health}</strong></span>
            <span>Typ: Li-Ion / 1S</span>
          </div>
        </div>
      </div>
    </div>
  );
};
