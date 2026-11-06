"""
Hlavní aplikační server meteorologické stanice (FastAPI + WebSockets).
Zajišťuje příjem dat z HW, real-time broadcast přes WebSockets,
databázové ukládání a běh hybridního predikčního jádra.
"""

import os
import io
import csv
import asyncio
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse

from .models import (
    TelemetryInput,
    WeatherReading,
    CurrentStatusResponse,
    TrendInfo,
    PeriodStatistics,
    PredictionDetails
)
from .database import db_manager
from .zambretti import ZambrettiForecaster
from .prediction import WeatherPredictor
from .serial_reader import SerialMeteoReader
from .config import current_config, StationLocationConfig, save_station_config


# --- WEBSOCKET CONNECTION MANAGER ---
class WebSocketManager:
    """Správce aktivních WebSocket spojení pro reálný čas."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, event_type: str, data: Dict[str, Any]):
        """Odešle JSON zprávu všem připojeným klientům (Dashboardům)."""
        payload = {"type": event_type, "payload": data, "timestamp": datetime.now(timezone.utc).isoformat()}
        for connection in list(self.active_connections):
            try:
                await connection.send_json(payload)
            except Exception:
                self.disconnect(connection)


ws_manager = WebSocketManager()
serial_reader: Optional[SerialMeteoReader] = None


# --- POMOCNÉ ANALYTICKÉ FUNKCE ---
async def compute_current_status() -> CurrentStatusResponse:
    """Sestaví kompletní stav stanice včetně 1h trendů a online detekce."""
    latest = await db_manager.get_latest_reading()
    if not latest:
        # Prázdná databáze - vrátí defaultní offline stav
        dummy = WeatherReading(
            timestamp=datetime.now(timezone.utc),
            temperature=None,
            humidity=None,
            pressure=None,
            wind_speed=None,
            wind_direction=None,
            rainfall_mm=0.0,
            battery_voltage=None
        )
        return CurrentStatusResponse(
            online=False,
            last_seen_seconds_ago=None,
            status_label="OFFLINE",
            current=dummy,
            trends_1h={
                "temperature": TrendInfo(direction="steady", delta=0.0),
                "humidity": TrendInfo(direction="steady", delta=0.0),
                "pressure": TrendInfo(direction="steady", delta=0.0),
                "wind_speed": TrendInfo(direction="steady", delta=0.0),
            },
            battery_status={"percentage": 0, "voltage": None, "health": "Neznámý"}
        )

    # 1. Detekce Online/Offline (timeout > 5 minut = 300 sekund)
    now = datetime.now(timezone.utc)
    seconds_ago = int((now - latest.timestamp).total_seconds())
    is_online = seconds_ago <= 300

    # 2. Výpočet trendů za 1 hodinu
    reading_1h = await db_manager.get_reading_near_offset(hours_ago=1.0)
    trends = {}

    def calc_trend(current_val: Optional[float], old_val: Optional[float], tolerance: float = 0.1) -> TrendInfo:
        if current_val is None or old_val is None:
            return TrendInfo(direction="steady", delta=0.0)
        delta = round(current_val - old_val, 2)
        if delta > tolerance:
            direction = "rising"
        elif delta < -tolerance:
            direction = "falling"
        else:
            direction = "steady"
        pct = round((delta / old_val * 100.0), 1) if old_val != 0 else None
        return TrendInfo(direction=direction, delta=delta, percentage_change=pct)

    trends["temperature"] = calc_trend(latest.temperature, reading_1h.temperature if reading_1h else None, tolerance=0.2)
    trends["humidity"] = calc_trend(latest.humidity, reading_1h.humidity if reading_1h else None, tolerance=1.0)
    trends["pressure"] = calc_trend(latest.pressure, reading_1h.pressure if reading_1h else None, tolerance=0.3)
    trends["wind_speed"] = calc_trend(latest.wind_speed, reading_1h.wind_speed if reading_1h else None, tolerance=0.5)

    # 3. Diagnostika baterie
    battery_info = WeatherPredictor.analyze_battery(latest.battery_voltage)

    return CurrentStatusResponse(
        online=is_online,
        last_seen_seconds_ago=max(0, seconds_ago),
        status_label="ONLINE" if is_online else "OFFLINE",
        current=latest,
        trends_1h=trends,
        battery_status=battery_info
    )


async def compute_prediction() -> PredictionDetails:
    """Vypočítá Zambrettiho algoritmus, rosný bod a 12-24h předpověď."""
    latest = await db_manager.get_latest_reading()
    if not latest or latest.pressure is None:
        return PredictionDetails(
            dew_point_c=None,
            barometric_tendency="Není dostatek dat",
            pressure_delta_3h=0.0,
            zambretti_code="N/A",
            zambretti_forecast="Čekání na první telemetrická data ze stanice...",
            rain_probability_pct=0,
            forecast_12h_24h="Data se načítají."
        )

    # Získání tlaku před 3 hodinami pro Zambrettiho
    reading_3h = await db_manager.get_reading_near_offset(hours_ago=3.0)
    old_p = reading_3h.pressure if (reading_3h and reading_3h.pressure) else latest.pressure
    delta_p_3h = round(latest.pressure - old_p, 2)

    # 1. Rosný bod
    dew_point = WeatherPredictor.calculate_dew_point(latest.temperature, latest.humidity)

    # 2. Zambretti
    zambretti = ZambrettiForecaster.calculate(
        pressure_hpa=latest.pressure,
        delta_p_3h=delta_p_3h,
        wind_direction=latest.wind_direction
    )

    # 3. Pravděpodobnost srážek (hybridní model)
    rain_prob = WeatherPredictor.calculate_rain_probability(
        pressure_delta_3h=delta_p_3h,
        humidity_pct=latest.humidity,
        temperature_c=latest.temperature,
        dew_point_c=dew_point,
        wind_speed_ms=latest.wind_speed
    )

    # 4. Textová prognóza na 12-24 hodin
    forecast_text = WeatherPredictor.generate_forecast_text(
        zambretti=zambretti,
        rain_prob=rain_prob,
        pressure_delta_3h=delta_p_3h,
        temperature_c=latest.temperature,
        wind_speed_ms=latest.wind_speed
    )

    return PredictionDetails(
        dew_point_c=dew_point,
        barometric_tendency=zambretti["tendency_label"],
        pressure_delta_3h=delta_p_3h,
        zambretti_code=zambretti["zambretti_code"],
        zambretti_forecast=zambretti["forecast"],
        rain_probability_pct=rain_prob,
        forecast_12h_24h=forecast_text
    )


# --- LIFESPAN PRO INICIALIZACI DB A SEEDING ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Inicializace DB tabulek
    await db_manager.init_db()

    # 2. Automatické nasazení realistických demo dat, pokud je DB prázdná
    latest = await db_manager.get_latest_reading()
    if not latest:
        print("[METEO SERVER] Inicializace prázdné databáze: Generuji počáteční realistická měření...")
        from ..database.seed_demo import generate_initial_history
        await generate_initial_history(db_manager)

    # 3. Volitelné spuštění sériového čtení na pozadí
    enable_serial = os.getenv("ENABLE_SERIAL_READER", "false").lower() == "true"
    if enable_serial:
        global serial_reader
        loop = asyncio.get_event_loop()
        def on_serial_packet(telemetry: TelemetryInput):
            asyncio.run_coroutine_threadsafe(handle_incoming_telemetry(telemetry), loop)
        serial_reader = SerialMeteoReader(callback=on_serial_packet)
        serial_reader.start()

    yield

    if serial_reader:
        serial_reader.stop()


app = FastAPI(
    title="Local Weather Station Monitoring & Prediction Center",
    description="Full-stack systém pro sběr, ukládání, real-time vizualizaci a předpověď počasí.",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def handle_incoming_telemetry(data: TelemetryInput) -> WeatherReading:
    """Centrální rutina pro uložení dat a odeslání do WebSocketů."""
    # Pokud je aktivní automatická barometrická redukce podle nadmořské výšky lokality:
    if current_config.auto_reduce_pressure and data.pressure is not None:
        # Pokud stanice posílá staniční tlak (např. v 300 m n.m. je to cca 980 hPa),
        # redukujeme jej na hladinu moře pro standardizované meteorologické zobrazení a Zambrettiho
        if data.pressure < 1000 and current_config.elevation_m > 100:
            reduced_p = WeatherPredictor.reduce_pressure_to_sea_level(
                data.pressure, current_config.elevation_m, data.temperature
            )
            data.pressure = reduced_p

    saved_reading = await db_manager.insert_reading(data)
    
    # Okamžitě sestavíme nový status a predikci a rozešleme je do všech připojených klientů
    status = await compute_current_status()
    prediction = await compute_prediction()
    
    await ws_manager.broadcast("telemetry_update", {
        "reading": saved_reading.model_dump(mode="json"),
        "status": status.model_dump(mode="json"),
        "prediction": prediction.model_dump(mode="json")
    })
    return saved_reading


# =============================================================================
# REST API ENDPOINTS
# =============================================================================

@app.post("/api/telemetry", summary="Příjem dat z fyzické meteostanice")
async def receive_telemetry(payload: TelemetryInput):
    """
    Klíčový endpoint pro fyzickou stanici (ESP32, Arduino, Raspberry Pi, GSM modul).
    Přijímá POST s JSON daty.
    Validuje a sanitizuje hodnoty (odolné vůči null a poškozeným senzorům).
    """
    try:
        saved = await handle_incoming_telemetry(payload)
        return {
            "status": "success",
            "message": "Telemetry reading recorded successfully",
            "reading_id": saved.id,
            "timestamp": saved.timestamp.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chyba při ukládání telemetrie: {str(e)}")


@app.get("/api/readings/current", response_model=CurrentStatusResponse, summary="Aktuální stav a 1h trendy")
async def get_current_reading():
    """Vrací nejnovější měření, stav online/offline a 1h trendy pro karty dashboardu."""
    return await compute_current_status()


@app.get("/api/readings/history", summary="Historická časová řada pro grafy")
async def get_readings_history(timeframe: str = Query(default="24h", pattern="^(24h|7d|30d)$")):
    """
    Vrátí data pro interaktivní spojnicové grafy (Recharts).
    Podporuje filtrování: 24h (minutová data), 7d (hodinové agregace), 30d (denní agregace).
    """
    return await db_manager.get_history(timeframe=timeframe)


@app.get("/api/statistics", response_model=PeriodStatistics, summary="Statistické agregáty za zvolené období")
async def get_period_stats(timeframe: str = Query(default="24h", pattern="^(24h|7d|30d)$")):
    """
    Vypočítá Tmax, Tmin, Tavg, průměrnou vlhkost a celkový úhrn srážek pro zvolené okno.
    """
    return await db_manager.get_period_statistics(timeframe=timeframe)


@app.get("/api/prediction", response_model=PredictionDetails, summary="Předpovědní modul (Zambretti + 12/24h)")
async def get_weather_prediction():
    """
    Poskytuje hybridní předpověď:
    - Rosný bod
    - Barometrická tendence (změna za 3 hodiny)
    - Zambrettiho kód a popis
    - Pravděpodobnost srážek (0-100 %)
    - 12h/24h syntetický text předpovědi
    """
    return await compute_prediction()


@app.get("/api/export/csv", summary="Export vyfiltrovaných dat do CSV")
async def export_csv(timeframe: str = Query(default="24h", pattern="^(24h|7d|30d)$")):
    """
    Umožňuje stažení historických dat ve formátu CSV pro datovou analýzu v Excelu / Pythonu.
    """
    data = await db_manager.get_history(timeframe=timeframe)
    if not data:
        raise HTTPException(status_code=404, detail="Žádná data pro export v daném období.")

    output = io.StringIO()
    writer = csv.writer(output)
    
    # Hlavička CSV
    writer.writerow([
        "timestamp_iso",
        "temperature_c",
        "humidity_pct",
        "pressure_hpa",
        "wind_speed_ms",
        "rainfall_mm",
        "battery_v"
    ])
    
    for row in data:
        writer.writerow([
            row.get("timestamp"),
            row.get("temperature"),
            row.get("humidity"),
            row.get("pressure"),
            row.get("wind_speed"),
            row.get("rainfall_mm", 0.0),
            row.get("battery_voltage")
        ])

    output.seek(0)
    filename = f"meteo_export_{timeframe}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@app.get("/api/location", summary="Získání aktuální lokality stanice")
def get_station_location():
    """Vrací nastavenou geografickou polohu a nadmořskou výšku stanice."""
    return current_config.model_dump()


@app.post("/api/location", summary="Aktualizace lokality stanice")
def update_station_location(cfg: StationLocationConfig):
    """Uloží novou polohu (GPS, město, nadmořskou výšku) stanice."""
    current_config.name = cfg.name
    current_config.latitude = cfg.latitude
    current_config.longitude = cfg.longitude
    current_config.elevation_m = cfg.elevation_m
    current_config.auto_reduce_pressure = cfg.auto_reduce_pressure
    save_station_config(current_config)
    return {"status": "success", "location": current_config.model_dump()}


class RealSeedPayload(BaseModel):
    location: Optional[StationLocationConfig] = None
    readings: List[Dict[str, Any]]


@app.post("/api/location/seed_real", summary="Nahrání reálných dat z lokality")
async def seed_real_location_data(payload: RealSeedPayload):
    """
    Přijme reálná meteorologická data stažená klientem pro GPS lokaci stanice
    a provede aktualizaci celé databáze.
    """
    if payload.location:
        current_config.name = payload.location.name
        current_config.latitude = payload.location.latitude
        current_config.longitude = payload.location.longitude
        current_config.elevation_m = payload.location.elevation_m
        save_station_config(current_config)

    count = await db_manager.replace_with_real_history(payload.readings)
    status = await compute_current_status()
    prediction = await compute_prediction()

    await ws_manager.broadcast("telemetry_update", {
        "status": status.model_dump(mode="json"),
        "prediction": prediction.model_dump(mode="json")
    })

    return {
        "status": "success",
        "message": f"Úspěšně synchronizováno {count} reálných záznamů pro lokalitu {current_config.name}",
        "location": current_config.model_dump()
    }


@app.get("/api/serial/ports", summary="Seznam dostupných sériových portů")
def list_serial_ports():
    """Vrací seznam připojených USB-to-UART / COM převodníků pro HW diagnostiku."""
    return SerialMeteoReader.list_available_ports()


# --- WEBSOCKET ENDPOINT ---
@app.websocket("/ws")
async def websocket_telemetry_stream(websocket: WebSocket):
    """
    Real-time WebSocket kanál pro Dashboard.
    Při připojení ihned odešle aktuální stav a poté posílá živé aktualizace.
    """
    await ws_manager.connect(websocket)
    try:
        # Pošli ihned po připojení úvodní stav
        initial_status = await compute_current_status()
        initial_pred = await compute_prediction()
        await websocket.send_json({
            "type": "init",
            "payload": {
                "status": initial_status.model_dump(mode="json"),
                "prediction": initial_pred.model_dump(mode="json")
            }
        })
        
        while True:
            # Udržení spojení (ping-pong)
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


# Mountování složky se statickým live webovým dashboardem
static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
