'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Thermometer,
  Droplets,
  Gauge,
  CloudRain,
  Download,
  Moon,
  Sun,
  RefreshCw,
  BarChart3,
  Activity
} from 'lucide-react';

import { CurrentStatus, PeriodStats, PredictionDetails } from '../types/weather';
import { MetricCard } from './MetricCard';
import { HistoryCharts } from './HistoryCharts';
import { PredictionWidget } from './PredictionWidget';
import { DiagnosticsCard } from './DiagnosticsCard';
import { WindRose } from './WindRose';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const Dashboard: React.FC = () => {
  // Stav aplikace
  const [darkMode, setDarkMode] = useState(true);
  const [status, setStatus] = useState<CurrentStatus | null>(null);
  const [prediction, setPrediction] = useState<PredictionDetails | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [periodStats, setPeriodStats] = useState<PeriodStats | null>(null);
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d'>('24h');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Synchronizace Dark módu do html classList
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Načtení dat přes REST API
  const fetchCurrentStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/readings/current`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.warn('Nelze načíst aktuální stav:', err);
    }
  }, []);

  const fetchPrediction = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/prediction`);
      if (res.ok) {
        const data = await res.json();
        setPrediction(data);
      }
    } catch (err) {
      console.warn('Nelze načíst predikci:', err);
    }
  }, []);

  const fetchHistoryAndStats = useCallback(async (tf: '24h' | '7d' | '30d') => {
    setIsLoadingHistory(true);
    try {
      const [histRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/readings/history?timeframe=${tf}`),
        fetch(`${API_BASE}/api/statistics?timeframe=${tf}`)
      ]);

      if (histRes.ok) {
        const histData = await histRes.json();
        setHistoryData(histData);
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setPeriodStats(statsData);
      }
    } catch (err) {
      console.error('Chyba při načítání historie:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Inicializace a WebSocket stream
  useEffect(() => {
    fetchCurrentStatus();
    fetchPrediction();
    fetchHistoryAndStats(timeframe);

    // WebSocket připojení
    const wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws';
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;

    const connectWs = () => {
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'telemetry_update' && msg.payload) {
              if (msg.payload.status) setStatus(msg.payload.status);
              if (msg.payload.prediction) setPrediction(msg.payload.prediction);
              // Při nové telemetrii osvěžíme graf pokud máme okno 24h
              if (timeframe === '24h') {
                fetchHistoryAndStats('24h');
              }
            } else if (msg.type === 'init' && msg.payload) {
              if (msg.payload.status) setStatus(msg.payload.status);
              if (msg.payload.prediction) setPrediction(msg.payload.prediction);
            }
          } catch (e) {
            console.error('Chyba parsování WS zprávy:', e);
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimer = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch (err) {
        console.warn('WS nelze inicializovat, použije se fallback polling:', err);
      }
    };

    connectWs();

    // Fallback polling každých 15 sekund
    const pollInterval = setInterval(() => {
      fetchCurrentStatus();
      fetchPrediction();
    }, 15000);

    return () => {
      clearInterval(pollInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [fetchCurrentStatus, fetchPrediction, fetchHistoryAndStats, timeframe]);

  // Přepnutí časového filtru
  const handleTimeframeChange = (tf: '24h' | '7d' | '30d') => {
    setTimeframe(tf);
    fetchHistoryAndStats(tf);
  };

  // Export vyfiltrovaných dat do CSV
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const downloadUrl = `${API_BASE}/api/export/csv?timeframe=${timeframe}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `meteo_export_${timeframe}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Chyba při exportu CSV: ' + err);
    } finally {
      setIsExporting(false);
    }
  };

  const cur = status?.current;
  const trends = status?.trends_1h;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      {/* HORNÍ NAVIGAČNÍ LIŠTA */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800 px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight">
                  MeteoCenter Pro
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  v2.0
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Monitorovací centrum & Predikční systém fyzické meteostanice
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* WS Status Badge */}
            <div className="hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              <span className="text-zinc-600 dark:text-zinc-300 font-mono text-[11px]">
                {wsConnected ? 'Real-time WS' : 'Polling'}
              </span>
            </div>

            {/* CSV Export Tlačítko */}
            <button
              onClick={handleExportCSV}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 transition-all shadow-sm"
              title="Exportovat vyfiltrovaná data do CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Export...' : `CSV (${timeframe})`}</span>
            </button>

            {/* Přepínač Tmavý / Světlý režim */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 transition-all"
              aria-label="Přepnout motiv"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
            </button>
          </div>
        </div>
      </header>

      {/* HLAVNÍ OBSAH DASHBOARDU */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* SEKCE A: AKTUÁLNÍ STAV - REAL-TIME KARTY S 1H TRENDEM */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Aktuální stav telemetrie
            </h2>
            <span className="text-xs text-zinc-400 font-mono">
              Čas: {cur?.timestamp ? new Date(cur.timestamp).toLocaleTimeString() : '--:--:--'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Teplota vzduchu"
              value={cur?.temperature ?? null}
              unit="°C"
              icon={<Thermometer className="w-5 h-5" />}
              trend={trends?.temperature}
              colorClass="text-orange-500"
            />
            <MetricCard
              title="Relativní vlhkost"
              value={cur?.humidity ?? null}
              unit="%"
              icon={<Droplets className="w-5 h-5" />}
              trend={trends?.humidity}
              colorClass="text-cyan-500"
            />
            <MetricCard
              title="Atmosférický tlak"
              value={cur?.pressure ?? null}
              unit="hPa"
              icon={<Gauge className="w-5 h-5" />}
              trend={trends?.pressure}
              colorClass="text-purple-500"
            />
            <MetricCard
              title="Srážky za 1h"
              value={cur?.rainfall_mm ?? 0}
              unit="mm"
              icon={<CloudRain className="w-5 h-5" />}
              colorClass="text-blue-500"
              subtext={cur?.rainfall_mm && cur.rainfall_mm > 0 ? 'Detekovány srážky' : 'Bez srážek'}
            />
          </div>
        </section>

        {/* SEKCE B & C: KOMBINACE DIAGNOSTIKY, VĚTRU A PREDIKČNÍHO BLOKU */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <PredictionWidget
              prediction={prediction}
              currentTemp={cur?.temperature}
            />
          </div>

          <div className="space-y-6">
            <WindRose
              speed={cur?.wind_speed ?? null}
              direction={cur?.wind_direction ?? null}
            />

            <DiagnosticsCard
              online={status?.online ?? false}
              lastSeenSeconds={status?.last_seen_seconds_ago ?? null}
              battery={status?.battery_status ?? { voltage: null, percentage: 0, health: 'Neznámý', color: 'gray' }}
            />
          </div>
        </div>

        {/* SEKCE D: STATISTIKY ZA ZVOLENÉ OBDOBÍ */}
        {periodStats && (
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Statistické vyhodnocení za vybrané období ({periodStats.timeframe})
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Tmax (Maximum)</span>
                <span className="text-lg font-bold font-mono text-rose-500">{periodStats.temp_max ?? '--'} °C</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Tmin (Minimum)</span>
                <span className="text-lg font-bold font-mono text-cyan-500">{periodStats.temp_min ?? '--'} °C</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Průměrná teplota</span>
                <span className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100">{periodStats.temp_avg ?? '--'} °C</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Průměrná vlhkost</span>
                <span className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100">{periodStats.humidity_avg ?? '--'} %</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Celkové srážky</span>
                <span className="text-lg font-bold font-mono text-blue-500">{periodStats.rainfall_total} mm</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Max. náraz větru</span>
                <span className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100">{periodStats.wind_speed_max ?? '--'} m/s</span>
              </div>
            </div>
          </section>
        )}

        {/* SEKCE E: INTERAKTIVNÍ HISTORICKÉ GRAFY (RECHARTS) */}
        <section>
          <HistoryCharts
            data={historyData}
            timeframe={timeframe}
            onTimeframeChange={handleTimeframeChange}
            isLoading={isLoadingHistory}
          />
        </section>
      </main>
    </div>
  );
};
