"""
Modely a schémata pro validaci telemetrických dat meteostanice.
Zajišťuje robustní ošetření nevalidních hodnot, chybějících polí a null parametrů,
aby nedošlo k pádu databáze nebo API.
"""

from datetime import datetime, timezone
from typing import Optional, Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, field_validator


class TelemetryInput(BaseModel):
    """
    Vstupní payload přijímaný na endpointu /api/telemetry z fyzické stanice (POST)
    nebo sériového portu. Všechna pole jsou volitelná a validovaná pro fyzikální rozsahy.
    """
    timestamp: Optional[datetime] = None
    temperature: Optional[float] = Field(default=None, description="Teplota v °C (-50 až +80)")
    humidity: Optional[float] = Field(default=None, description="Relativní vlhkost v % (0 až 100)")
    pressure: Optional[float] = Field(default=None, description="Atmosférický tlak v hPa (800 až 1200)")
    wind_speed: Optional[float] = Field(default=None, description="Rychlost větru v m/s (0 až 150)")
    wind_direction: Optional[int] = Field(default=None, description="Směr větru ve stupních (0 až 360)")
    rainfall_mm: Optional[float] = Field(default=None, description="Srážky v mm za poslední hodinu (>= 0)")
    battery_voltage: Optional[float] = Field(default=None, description="Napětí baterie stanice ve V (0 až 24)")

    @field_validator("temperature", mode="before")
    @classmethod
    def sanitize_temperature(cls, v):
        if v is None:
            return None
        try:
            val = float(v)
            # Fyzikální sanitizace pro Zemi (-60 °C až +85 °C)
            if -60.0 <= val <= 85.0:
                return round(val, 2)
            return None
        except (ValueError, TypeError):
            return None

    @field_validator("humidity", mode="before")
    @classmethod
    def sanitize_humidity(cls, v):
        if v is None:
            return None
        try:
            val = float(v)
            if 0.0 <= val <= 100.0:
                return round(val, 1)
            # Oříznutí mírných odchylek levných senzorů (např. 101 % -> 100 %)
            if 100.0 < val <= 105.0:
                return 100.0
            return None
        except (ValueError, TypeError):
            return None

    @field_validator("pressure", mode="before")
    @classmethod
    def sanitize_pressure(cls, v):
        if v is None:
            return None
        try:
            val = float(v)
            if 750.0 <= val <= 1150.0:
                return round(val, 2)
            return None
        except (ValueError, TypeError):
            return None

    @field_validator("wind_speed", mode="before")
    @classmethod
    def sanitize_wind_speed(cls, v):
        if v is None:
            return None
        try:
            val = float(v)
            if val < 0:
                return 0.0
            if val <= 120.0:
                return round(val, 2)
            return None
        except (ValueError, TypeError):
            return None

    @field_validator("wind_direction", mode="before")
    @classmethod
    def sanitize_wind_direction(cls, v):
        if v is None:
            return None
        try:
            val = int(round(float(v)))
            return val % 360
        except (ValueError, TypeError):
            return None

    @field_validator("rainfall_mm", mode="before")
    @classmethod
    def sanitize_rainfall(cls, v):
        if v is None:
            return None
        try:
            val = float(v)
            return round(max(0.0, val), 2)
        except (ValueError, TypeError):
            return 0.0

    @field_validator("battery_voltage", mode="before")
    @classmethod
    def sanitize_battery(cls, v):
        if v is None:
            return None
        try:
            val = float(v)
            if 0.0 <= val <= 30.0:
                return round(val, 2)
            return None
        except (ValueError, TypeError):
            return None


class WeatherReading(BaseModel):
    """
    Kompletní entita uložená v databázi weather_readings.
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    pressure: Optional[float] = None
    wind_speed: Optional[float] = None
    wind_direction: Optional[int] = None
    rainfall_mm: Optional[float] = 0.0
    battery_voltage: Optional[float] = None


class TrendInfo(BaseModel):
    """Trend veličiny oproti stavu před 1 hodinou"""
    direction: Literal["rising", "falling", "steady"]
    delta: float
    percentage_change: Optional[float] = None


class CurrentStatusResponse(BaseModel):
    """Odpověď pro hlavní stavové karty na Dashboardu"""
    online: bool
    last_seen_seconds_ago: Optional[int]
    status_label: Literal["ONLINE", "OFFLINE"]
    current: WeatherReading
    trends_1h: dict[str, TrendInfo]  # temperature, humidity, pressure, wind_speed
    battery_status: dict  # level_percent, voltage, health_label ("Dobrý", "Nízký", "Kritický")


class PeriodStatistics(BaseModel):
    """Statistiky za zvolené období (24h, 7d, 30d)"""
    timeframe: str
    sample_count: int
    temp_max: Optional[float]
    temp_min: Optional[float]
    temp_avg: Optional[float]
    humidity_avg: Optional[float]
    pressure_avg: Optional[float]
    rainfall_total: float
    wind_speed_max: Optional[float]
    wind_speed_avg: Optional[float]


class PredictionDetails(BaseModel):
    """Kompletní výstup predikčního modulu"""
    dew_point_c: Optional[float]
    barometric_tendency: str  # např. "Rychlý pokles", "Stabilní"
    pressure_delta_3h: float
    zambretti_code: str
    zambretti_forecast: str
    rain_probability_pct: int
    forecast_12h_24h: str
    advisory: Optional[str] = None
