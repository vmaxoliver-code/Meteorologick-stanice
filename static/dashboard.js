/**
 * MeteoCenter Pro - Real-Time Dashboard Controller
 * Zajišťuje WebSocket streamování, vykreslování Chart.js grafů,
 * obsluhu přepínačů filtrů, tmavého režimu a CSV exportu.
 */

let currentTimeframe = '24h';
let currentMetric = 'temperature';
let weatherChart = null;
let currentRawData = [];

// Metriky pro grafy
const METRIC_CONFIGS = {
  temperature: { label: 'Teplota', unit: '°C', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' },
  humidity: { label: 'Relativní vlhkost', unit: '%', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
  pressure: { label: 'Atmosférický tlak', unit: 'hPa', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  wind_speed: { label: 'Rychlost větru', unit: 'm/s', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  rainfall_mm: { label: 'Srážky', unit: 'mm', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' }
};

// Inicializace po načtení DOM
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  initThemeToggle();
  initTimeframeButtons();
  initMetricButtons();
  initCsvExport();
  initTestSendButton();
  initLocationModule();

  // Spuštění datových toků
  initChart();
  fetchCurrentStatus();
  fetchPrediction();
  fetchHistoryAndStats(currentTimeframe);
  initWebSocket();

  // Pravidelný polling pro udržení aktuálnosti
  setInterval(() => {
    fetchCurrentStatus();
    fetchPrediction();
  }, 10000);
});

// --- TÉMA (DARK / LIGHT MÓD) ---
function initThemeToggle() {
  const btn = document.getElementById('btnThemeToggle');
  const icon = document.getElementById('themeIcon');
  const html = document.documentElement;

  btn.addEventListener('click', () => {
    const isDark = html.classList.toggle('dark');
    if (isDark) {
      icon.setAttribute('data-lucide', 'sun');
      icon.className = 'w-4 h-4 text-amber-400';
    } else {
      icon.setAttribute('data-lucide', 'moon');
      icon.className = 'w-4 h-4 text-zinc-600';
    }
    if (window.lucide) lucide.createIcons();
    updateChartTheme();
  });
}

// --- ČASOVÝ FILTR (24h, 7d, 30d) ---
function initTimeframeButtons() {
  const buttons = document.querySelectorAll('.btn-tf');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => {
        b.className = 'btn-tf px-3 py-1.5 text-xs font-semibold rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all';
      });
      btn.className = 'btn-tf px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm transition-all';
      
      currentTimeframe = btn.getAttribute('data-tf');
      const labelMap = { '24h': '24 hodin', '7d': '7 dní', '30d': '30 dní' };
      document.getElementById('statsTfLabel').textContent = labelMap[currentTimeframe];
      fetchHistoryAndStats(currentTimeframe);
    });
  });
}

// --- PŘEPÍNAČ METRIK ---
function initMetricButtons() {
  const container = document.getElementById('metricButtonsContainer');
  const buttons = container.querySelectorAll('.btn-metric');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const metric = btn.getAttribute('data-metric');
      currentMetric = metric;

      buttons.forEach(b => {
        b.className = 'btn-metric px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100';
        b.style.backgroundColor = '';
        b.style.color = '';
      });

      const cfg = METRIC_CONFIGS[metric];
      btn.className = 'btn-metric px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm border border-transparent';
      btn.style.backgroundColor = cfg.color;

      renderChartData();
    });
  });
}

// --- EXPORT CSV ---
function initCsvExport() {
  const btn = document.getElementById('btnExportCsv');
  btn.addEventListener('click', () => {
    window.location.href = `/api/export/csv?timeframe=${currentTimeframe}`;
  });
}

// --- TESTOVACÍ TLAČÍTKO PRO SIMULACI IMPULSU ---
function initTestSendButton() {
  const btn = document.getElementById('btnSendTestReading');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.innerHTML = '<span>Odesílám...</span>';

    const testPayload = {
      temperature: +(19.0 + (Math.random() * 5 - 2.5)).toFixed(1),
      humidity: +(55.0 + (Math.random() * 20 - 10)).toFixed(1),
      pressure: +(1011.0 + (Math.random() * 4 - 2)).toFixed(1),
      wind_speed: +(3.0 + Math.random() * 4).toFixed(1),
      wind_direction: Math.floor(Math.random() * 360),
      rainfall_mm: Math.random() < 0.3 ? +(Math.random() * 1.5).toFixed(1) : 0.0,
      battery_voltage: +(4.05 + Math.random() * 0.08).toFixed(2)
    };

    try {
      await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });
    } catch (e) {
      console.error(e);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5"></i><span>Simulovat impuls</span>';
      if (window.lucide) lucide.createIcons();
    }
  });
}

// --- WEBSOCKET ENGINE ---
function initWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
  const dot = document.getElementById('wsDot');
  const text = document.getElementById('wsText');

  let socket = null;

  function connect() {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
      text.textContent = 'Real-time WS';
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'telemetry_update' && msg.payload) {
          if (msg.payload.status) updateDashboardUI(msg.payload.status);
          if (msg.payload.prediction) updatePredictionUI(msg.payload.prediction);
          
          // Pokud je otevřen 24h pohled, zaktualizujeme graf i statistiky
          if (currentTimeframe === '24h') {
            fetchHistoryAndStats('24h');
          }
        } else if (msg.type === 'init' && msg.payload) {
          if (msg.payload.status) updateDashboardUI(msg.payload.status);
          if (msg.payload.prediction) updatePredictionUI(msg.payload.prediction);
        }
      } catch (err) {
        console.error('Chyba zpracování WS:', err);
      }
    };

    socket.onclose = () => {
      dot.className = 'w-2 h-2 rounded-full bg-amber-500';
      text.textContent = 'Znovupřipojování...';
      setTimeout(connect, 3000);
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  connect();
}

// --- REST API VOLÁNÍ ---
async function fetchCurrentStatus() {
  try {
    const res = await fetch('/api/readings/current');
    if (res.ok) {
      const data = await res.json();
      updateDashboardUI(data);
    }
  } catch (err) {
    console.warn('Nelze načíst status:', err);
  }
}

async function fetchPrediction() {
  try {
    const res = await fetch('/api/prediction');
    if (res.ok) {
      const data = await res.json();
      updatePredictionUI(data);
    }
  } catch (err) {
    console.warn('Nelze načíst predikci:', err);
  }
}

async function fetchHistoryAndStats(tf) {
  try {
    const [histRes, statsRes] = await Promise.all([
      fetch(`/api/readings/history?timeframe=${tf}`),
      fetch(`/api/statistics?timeframe=${tf}`)
    ]);

    if (histRes.ok) {
      currentRawData = await histRes.json();
      renderChartData();
    }
    if (statsRes.ok) {
      const stats = await statsRes.json();
      updateStatisticsUI(stats);
    }
  } catch (err) {
    console.error('Chyba historie/statik:', err);
  }
}

// --- AKTUALIZACE DOM ROZHRANÍ ---
function updateDashboardUI(data) {
  if (!data || !data.current) return;
  const c = data.current;
  const tr = data.trends_1h || {};

  // Hodnoty na kartách
  document.getElementById('valTemp').textContent = c.temperature !== null ? c.temperature : '--';
  document.getElementById('valHumidity').textContent = c.humidity !== null ? c.humidity : '--';
  document.getElementById('valPressure').textContent = c.pressure !== null ? c.pressure : '--';
  document.getElementById('valRain').textContent = c.rainfall_mm !== null ? c.rainfall_mm : '0.0';

  if (c.timestamp) {
    const d = new Date(c.timestamp);
    document.getElementById('lastUpdated').textContent = 'Aktualizováno: ' + d.toLocaleTimeString();
  }

  // Trendy za 1h
  renderTrendBadge('trendTemp', tr.temperature, '°C');
  renderTrendBadge('trendHumidity', tr.humidity, '%');
  renderTrendBadge('trendPressure', tr.pressure, 'hPa');

  // Srážky stav
  const rainStatusEl = document.getElementById('rainStatus');
  if (c.rainfall_mm && c.rainfall_mm > 0) {
    rainStatusEl.textContent = `Detekovány srážky (+${c.rainfall_mm} mm)`;
    rainStatusEl.className = 'mt-2 text-xs text-blue-500 font-semibold';
  } else {
    rainStatusEl.textContent = 'Bez srážek';
    rainStatusEl.className = 'mt-2 text-xs text-zinc-500 dark:text-zinc-400 font-medium';
  }

  // Vítr
  document.getElementById('valWindSpeed').textContent = c.wind_speed !== null ? c.wind_speed : '--';
  document.getElementById('valWindKmh').textContent = c.wind_speed !== null ? `(${(c.wind_speed * 3.6).toFixed(1)} km/h)` : '(-- km/h)';

  const cardDirections = ['S', 'SSV', 'SV', 'VSV', 'V', 'VJV', 'JV', 'JJV', 'J', 'JJZ', 'JZ', 'ZJZ', 'Z', 'ZSZ', 'SZ', 'SSZ'];
  const deg = c.wind_direction;
  const cardStr = deg !== null ? cardDirections[Math.round(deg / 22.5) % 16] : '--';
  document.getElementById('valWindDir').textContent = deg !== null ? `${deg}° (${cardStr})` : '--';

  const needle = document.getElementById('windCompassNeedle');
  if (needle && deg !== null) {
    needle.style.transform = `rotate(${deg}deg)`;
  }

  // HW Diagnostika (Online/Offline > 5 min)
  const isOnline = data.online;
  const stationDot = document.getElementById('stationDot');
  const stationLabel = document.getElementById('stationStatusLabel');
  const stationBadge = document.getElementById('stationBadge');
  const stationLastSeen = document.getElementById('stationLastSeen');

  if (isOnline) {
    stationDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
    stationLabel.textContent = 'STANICE ONLINE';
    stationBadge.textContent = 'Aktivní';
    stationBadge.className = 'text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800';
  } else {
    stationDot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
    stationLabel.textContent = 'STANICE OFFLINE';
    stationBadge.textContent = 'Timeout > 5 min';
    stationBadge.className = 'text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800';
  }

  const sec = data.last_seen_seconds_ago;
  if (sec !== null && sec !== undefined) {
    stationLastSeen.textContent = sec < 60 ? `Poslední odezva: před ${sec} s` : `Poslední odezva: před ${Math.floor(sec / 60)} min`;
  } else {
    stationLastSeen.textContent = 'Poslední odezva: neznámá';
  }

  // Baterie
  const batt = data.battery_status || {};
  document.getElementById('valBattery').textContent = batt.voltage ? `${batt.voltage} V (${batt.percentage} %)` : '-- V';
  const bBar = document.getElementById('batteryBar');
  bBar.style.width = `${batt.percentage || 0}%`;
  bBar.className = batt.color === 'green' ? 'h-full bg-emerald-500 rounded-full' : (batt.color === 'yellow' ? 'h-full bg-amber-500 rounded-full' : 'h-full bg-rose-500 rounded-full');
  document.getElementById('batteryHealth').textContent = batt.health || 'Neznámý';
}

function renderTrendBadge(elementId, trend, unit) {
  const el = document.getElementById(elementId);
  if (!el || !trend) return;

  const { direction, delta } = trend;
  if (direction === 'rising') {
    el.innerHTML = `<span class="text-emerald-500 font-semibold flex items-center">▲ +${delta} ${unit}</span> <span class="text-[11px] text-zinc-400">oproti 1h</span>`;
  } else if (direction === 'falling') {
    el.innerHTML = `<span class="text-rose-500 font-semibold flex items-center">▼ ${delta} ${unit}</span> <span class="text-[11px] text-zinc-400">oproti 1h</span>`;
  } else {
    el.innerHTML = `<span class="text-zinc-400 font-medium">▬ 0.0 ${unit} (stabilní)</span> <span class="text-[11px] text-zinc-400">oproti 1h</span>`;
  }
}

function updatePredictionUI(pred) {
  if (!pred) return;

  document.getElementById('zambrettiCodeBadge').textContent = `Zambretti: ${pred.zambretti_code}`;
  document.getElementById('forecastText12h').textContent = pred.forecast_12h_24h;
  
  const dp = pred.pressure_delta_3h;
  document.getElementById('valDeltaP').textContent = (dp > 0 ? `+${dp}` : dp) + ' hPa';
  document.getElementById('labelTendency').textContent = pred.barometric_tendency;

  document.getElementById('valDewPoint').textContent = pred.dew_point_c !== null ? `${pred.dew_point_c} °C` : '--';
  document.getElementById('valRainProb').textContent = `${pred.rain_probability_pct} %`;

  const rBar = document.getElementById('rainProbBar');
  rBar.style.width = `${pred.rain_probability_pct}%`;
  const rBadge = document.getElementById('rainProbBadge');

  if (pred.rain_probability_pct >= 70) {
    rBar.className = 'h-full bg-rose-500 rounded-full';
    rBadge.textContent = 'Vysoké';
    rBadge.className = 'text-[10px] font-bold px-1.5 py-0.5 rounded border text-rose-500 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900';
  } else if (pred.rain_probability_pct >= 35) {
    rBar.className = 'h-full bg-amber-500 rounded-full';
    rBadge.textContent = 'Střední';
    rBadge.className = 'text-[10px] font-bold px-1.5 py-0.5 rounded border text-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900';
  } else {
    rBar.className = 'h-full bg-emerald-500 rounded-full';
    rBadge.textContent = 'Nízké';
    rBadge.className = 'text-[10px] font-bold px-1.5 py-0.5 rounded border text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800';
  }

  document.getElementById('zambrettiDesc').textContent = pred.zambretti_forecast;
}

function updateStatisticsUI(stats) {
  if (!stats) return;
  document.getElementById('statTmax').textContent = stats.temp_max !== null ? `${stats.temp_max} °C` : '--';
  document.getElementById('statTmin').textContent = stats.temp_min !== null ? `${stats.temp_min} °C` : '--';
  document.getElementById('statTavg').textContent = stats.temp_avg !== null ? `${stats.temp_avg} °C` : '--';
  document.getElementById('statHavg').textContent = stats.humidity_avg !== null ? `${stats.humidity_avg} %` : '--';
  document.getElementById('statRsum').textContent = `${stats.rainfall_total} mm`;
  document.getElementById('statWmax').textContent = stats.wind_speed_max !== null ? `${stats.wind_speed_max} m/s` : '--';
}

// --- GRAF (CHART.JS) ---
function initChart() {
  const ctx = document.getElementById('weatherChart').getContext('2d');
  const isDark = document.documentElement.classList.contains('dark');

  weatherChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: METRIC_CONFIGS.temperature.label,
        data: [],
        borderColor: METRIC_CONFIGS.temperature.color,
        backgroundColor: METRIC_CONFIGS.temperature.bg,
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHitRadius: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#18181b',
          titleColor: '#f4f4f5',
          bodyColor: '#f4f4f5',
          borderColor: '#27272a',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} ${METRIC_CONFIGS[currentMetric].unit}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: isDark ? '#27272a40' : '#e4e4e760' },
          ticks: { color: '#888888', font: { size: 11 }, maxTicksLimit: 8 }
        },
        y: {
          grid: { color: isDark ? '#27272a40' : '#e4e4e760' },
          ticks: { color: '#888888', font: { size: 11 } }
        }
      }
    }
  });
}

function renderChartData() {
  if (!weatherChart || !currentRawData) return;

  const cfg = METRIC_CONFIGS[currentMetric];
  const labels = currentRawData.map(d => {
    try {
      const dt = new Date(d.timestamp);
      if (currentTimeframe === '24h') {
        return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (currentTimeframe === '7d') {
        return `${dt.getDate()}.${dt.getMonth() + 1}. ${dt.getHours()}:00`;
      } else {
        return `${dt.getDate()}.${dt.getMonth() + 1}.`;
      }
    } catch {
      return d.timestamp;
    }
  });

  const values = currentRawData.map(d => d[currentMetric] !== undefined ? d[currentMetric] : null);

  weatherChart.data.labels = labels;
  weatherChart.data.datasets[0].label = `${cfg.label} (${cfg.unit})`;
  weatherChart.data.datasets[0].data = values;
  weatherChart.data.datasets[0].borderColor = cfg.color;
  weatherChart.data.datasets[0].backgroundColor = cfg.bg;
  weatherChart.update();
}

function updateChartTheme() {
  if (!weatherChart) return;
  const isDark = document.documentElement.classList.contains('dark');
  weatherChart.options.scales.x.grid.color = isDark ? '#27272a40' : '#e4e4e760';
  weatherChart.options.scales.y.grid.color = isDark ? '#27272a40' : '#e4e4e760';
  weatherChart.update();
}

// --- MODUL LOKALITY & REÁLNÝCH METEOROLOGICKÝCH DAT ---
let currentStationLocation = {
  name: "Praha - Karlov",
  latitude: 50.08,
  longitude: 14.43,
  elevation_m: 280,
  auto_reduce_pressure: true
};

function initLocationModule() {
  fetchLocationConfig();

  const modal = document.getElementById('locationModal');
  const btnOpen = document.getElementById('btnOpenLocationModal');
  const btnClose = document.getElementById('btnCloseLocationModal');
  const btnCancel = document.getElementById('btnCancelLocation');
  const btnSave = document.getElementById('btnSaveLocation');
  const btnDetect = document.getElementById('btnDetectGps');
  const btnQuickSync = document.getElementById('btnSyncRealWeather');

  const openModal = () => {
    document.getElementById('inputLocName').value = currentStationLocation.name;
    document.getElementById('inputLocLat').value = currentStationLocation.latitude;
    document.getElementById('inputLocLon').value = currentStationLocation.longitude;
    document.getElementById('inputLocElev').value = currentStationLocation.elevation_m;
    modal.classList.remove('hidden');
  };

  const closeModal = () => modal.classList.add('hidden');

  if (btnOpen) btnOpen.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  // Rychlé předvolby měst
  document.querySelectorAll('.btn-city-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('inputLocName').value = btn.getAttribute('data-city');
      document.getElementById('inputLocLat').value = btn.getAttribute('data-lat');
      document.getElementById('inputLocLon').value = btn.getAttribute('data-lon');
      document.getElementById('inputLocElev').value = btn.getAttribute('data-elev');
    });
  });

  // Detekce reálné GPS polohy zařízení přes HTML5 Geolocation
  if (btnDetect) {
    btnDetect.addEventListener('click', () => {
      if (!navigator.geolocation) {
        alert('Váš prohlížeč nepodporuje HTML5 Geolocation API.');
        return;
      }

      btnDetect.disabled = true;
      btnDetect.innerHTML = '<span class="animate-pulse">Zaměřuji satelity GPS zařízení...</span>';

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = +pos.coords.latitude.toFixed(4);
          const lon = +pos.coords.longitude.toFixed(4);
          let elev = pos.coords.altitude ? Math.round(pos.coords.altitude) : 250;

          document.getElementById('inputLocLat').value = lat;
          document.getElementById('inputLocLon').value = lon;
          document.getElementById('inputLocName').value = `Moje poloha (${lat}, ${lon})`;

          // Pokus o získání přesné nadmořské výšky ze satelitního modelu
          try {
            const elevRes = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
            if (elevRes.ok) {
              const elevData = await elevRes.json();
              if (elevData.elevation && elevData.elevation[0]) {
                elev = Math.round(elevData.elevation[0]);
              }
            }
          } catch (_) {}

          document.getElementById('inputLocElev').value = elev;
          btnDetect.disabled = false;
          btnDetect.innerHTML = '<i data-lucide="crosshair" class="w-4 h-4"></i><span>Poloha zaměřena!</span>';
          if (window.lucide) lucide.createIcons();
        },
        (err) => {
          btnDetect.disabled = false;
          btnDetect.innerHTML = '<i data-lucide="crosshair" class="w-4 h-4"></i><span>Detekovat mou GPS polohu</span>';
          if (window.lucide) lucide.createIcons();
          alert(`Nelze získat polohu: ${err.message}. Zadejte souřadnice ručně.`);
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  }

  // Uložení lokality a stažení reálných dat
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const name = document.getElementById('inputLocName').value.trim() || 'Moje meteostanice';
      const lat = parseFloat(document.getElementById('inputLocLat').value) || 50.08;
      const lon = parseFloat(document.getElementById('inputLocLon').value) || 14.43;
      const elev = parseFloat(document.getElementById('inputLocElev').value) || 280;
      const syncReal = document.getElementById('checkSyncReal').checked;

      btnSave.disabled = true;
      btnSave.textContent = 'Ukládám...';

      currentStationLocation = {
        name,
        latitude: lat,
        longitude: lon,
        elevation_m: elev,
        auto_reduce_pressure: true
      };

      updateLocationBadge();

      if (syncReal) {
        btnSave.textContent = 'Stahuji reálná data...';
        await syncRealWeatherDataForLocation(lat, lon, elev, name);
      } else {
        await fetch('/api/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentStationLocation)
        });
      }

      btnSave.disabled = false;
      btnSave.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i><span>Uložit a synchronizovat</span>';
      if (window.lucide) lucide.createIcons();
      closeModal();
    });
  }

  // Tlačítko rychlé synchronizace v hlavičce
  if (btnQuickSync) {
    btnQuickSync.addEventListener('click', async () => {
      const text = document.getElementById('syncRealText');
      text.textContent = 'Stahuji...';
      btnQuickSync.disabled = true;
      await syncRealWeatherDataForLocation(
        currentStationLocation.latitude,
        currentStationLocation.longitude,
        currentStationLocation.elevation_m,
        currentStationLocation.name
      );
      btnQuickSync.disabled = false;
      text.textContent = 'Reálné počasí';
    });
  }
}

async function fetchLocationConfig() {
  try {
    const res = await fetch('/api/location');
    if (res.ok) {
      currentStationLocation = await res.json();
      updateLocationBadge();
    }
  } catch (_) {}
}

function updateLocationBadge() {
  const badge = document.getElementById('locHeaderBadge');
  if (badge) {
    badge.textContent = `Lokalita: ${currentStationLocation.name} (${currentStationLocation.elevation_m} m)`;
  }
}

/**
 * Klíčová funkce: Stáhne reálná data z meteorologického modelu Open-Meteo
 * pro zadané GPS souřadnice lokality a nahraje je do naší databáze.
 */
async function syncRealWeatherDataForLocation(lat, lon, elevation, name) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,precipitation&hourly=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,precipitation&past_days=30&forecast_days=1&timezone=auto`;
    
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Chyba při komunikaci s meteorologickým modelem');
    
    const meteoData = await resp.json();
    const hourly = meteoData.hourly;

    const readings = [];
    const count = hourly.time.length;

    for (let i = 0; i < count; i++) {
      const rawP = hourly.surface_pressure[i];
      const temp = hourly.temperature_2m[i];
      let p_sea = rawP;
      if (rawP && elevation > 0) {
        const factor = 1.0 - (0.0065 * elevation) / (temp + 0.0065 * elevation + 273.15);
        p_sea = +(rawP * Math.pow(factor, -5.257)).toFixed(1);
      }

      readings.push({
        timestamp: new Date(hourly.time[i]).toISOString(),
        temperature: hourly.temperature_2m[i],
        humidity: hourly.relative_humidity_2m[i],
        pressure: p_sea,
        wind_speed: +(hourly.wind_speed_10m[i] / 3.6).toFixed(1),
        wind_direction: hourly.wind_direction_10m[i],
        rainfall_mm: hourly.precipitation[i] || 0.0,
        battery_voltage: 4.10
      });
    }

    const saveResp = await fetch('/api/location/seed_real', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: {
          name,
          latitude: lat,
          longitude: lon,
          elevation_m: elevation,
          auto_reduce_pressure: true
        },
        readings
      })
    });

    if (saveResp.ok) {
      await fetchCurrentStatus();
      await fetchPrediction();
      await fetchHistoryAndStats(currentTimeframe);
      alert(`✅ Hodnoty byly úspěšně synchronizovány s reálnou lokalitou: ${name} (${elevation} m n.m.)!\nAktualizováno ${readings.length} reálných časových záznamů.`);
    }
  } catch (err) {
    console.error('Chyba synchronizace reálných dat:', err);
    alert(`Nelze synchronizovat reálná data: ${err.message}. Zkontrolujte připojení k internetu v prohlížeči.`);
  }
}
