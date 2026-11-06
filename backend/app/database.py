"""
Asynchronní databázová vrstva pro meteorologická data.
Poskytuje univerzální rozhraní s výchozím zero-config aiosqlite (WAL mód)
a snadným přepnutím na produkční PostgreSQL / TimescaleDB přes DATABASE_URL.
"""

import os
import aiosqlite
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from .models import WeatherReading, TelemetryInput, PeriodStatistics


DB_FILE = os.getenv("WEATHER_DB_PATH", "weather_station.db")


class DatabaseManager:
    """Správce databáze a dotazování časových řad."""

    def __init__(self, db_path: str = DB_FILE):
        self.db_path = db_path

    async def init_db(self):
        """Inicializace schématu a indexů při startu serveru."""
        async with aiosqlite.connect(self.db_path) as db:
            # Povolení Write-Ahead Logging (WAL) pro vysokou propustnost souběžného čtení a zápisu
            await db.execute("PRAGMA journal_mode = WAL;")
            await db.execute("PRAGMA synchronous = NORMAL;")
            
            await db.execute("""
                CREATE TABLE IF NOT EXISTS weather_readings (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    temperature REAL,
                    humidity REAL,
                    pressure REAL,
                    wind_speed REAL,
                    wind_direction INTEGER,
                    rainfall_mm REAL DEFAULT 0.0,
                    battery_voltage REAL,
                    created_at TEXT DEFAULT (datetime('now', 'utc'))
                );
            """)

            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_weather_timestamp 
                ON weather_readings(timestamp DESC);
            """)
            await db.commit()

    async def insert_reading(self, reading: TelemetryInput) -> WeatherReading:
        """
        Uloží nové měření. Ošetřuje chybějící/null hodnoty bez pádu.
        """
        import uuid
        reading_id = str(uuid.uuid4())
        ts = reading.timestamp or datetime.now(timezone.utc)
        ts_iso = ts.isoformat()

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT INTO weather_readings (
                    id, timestamp, temperature, humidity, pressure,
                    wind_speed, wind_direction, rainfall_mm, battery_voltage
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    reading_id,
                    ts_iso,
                    reading.temperature,
                    reading.humidity,
                    reading.pressure,
                    reading.wind_speed,
                    reading.wind_direction,
                    reading.rainfall_mm if reading.rainfall_mm is not None else 0.0,
                    reading.battery_voltage
                )
            )
            await db.commit()

        return WeatherReading(
            id=reading_id,
            timestamp=ts,
            temperature=reading.temperature,
            humidity=reading.humidity,
            pressure=reading.pressure,
            wind_speed=reading.wind_speed,
            wind_direction=reading.wind_direction,
            rainfall_mm=reading.rainfall_mm or 0.0,
            battery_voltage=reading.battery_voltage
        )

    async def replace_with_real_history(self, readings: List[Dict[str, Any]]) -> int:
        """
        Vyčistí databázi a nahraje reálnou časovou řadu (staženou pro GPS lokaci).
        """
        import uuid
        rows = []
        for r in readings:
            ts = r.get("timestamp")
            if not ts:
                continue
            rows.append((
                str(uuid.uuid4()),
                ts,
                r.get("temperature"),
                r.get("humidity"),
                r.get("pressure"),
                r.get("wind_speed"),
                r.get("wind_direction", 0),
                r.get("rainfall_mm", 0.0) or 0.0,
                r.get("battery_voltage", 4.10)
            ))

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM weather_readings;")
            await db.executemany(
                """
                INSERT INTO weather_readings (
                    id, timestamp, temperature, humidity, pressure,
                    wind_speed, wind_direction, rainfall_mm, battery_voltage
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows
            )
            await db.commit()

        return len(rows)

    async def get_latest_reading(self) -> Optional[WeatherReading]:
        """Vrátí nejnovější platný záznam."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM weather_readings ORDER BY timestamp DESC LIMIT 1"
            )
            row = await cursor.fetchone()
            if not row:
                return None
            return self._row_to_model(row)

    async def get_reading_near_offset(self, hours_ago: float) -> Optional[WeatherReading]:
        """
        Vyhledá záznam nejblíže času (nyní - hours_ago).
        Využívá se pro výpočet 1h trendu a 3h barometrické tendence.
        """
        target_time = (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            # Vybere záznam s minimálním časovým rozdílem od cílového času
            cursor = await db.execute(
                """
                SELECT * FROM weather_readings
                ORDER BY ABS(strftime('%s', timestamp) - strftime('%s', ?)) ASC
                LIMIT 1
                """,
                (target_time,)
            )
            row = await cursor.fetchone()
            if not row:
                return None
            return self._row_to_model(row)

    async def get_history(self, timeframe: str = "24h") -> List[Dict[str, Any]]:
        """
        Vrátí historická data pro grafy.
        Automaticky downsampluje starší data (7d, 30d) pro plynulý frontend:
        - 24h: minutová/pětiminutová data (bez agregace nebo po 5 min)
        - 7d: hodinové průměry
        - 30d: 3hodinové nebo denní průměry
        """
        now = datetime.now(timezone.utc)
        if timeframe == "7d":
            start_time = (now - timedelta(days=7)).isoformat()
            bucket_format = "%Y-%m-%d %H:00"  # po hodinách
        elif timeframe == "30d":
            start_time = (now - timedelta(days=30)).isoformat()
            bucket_format = "%Y-%m-%d"  # po dnech
        else: # 24h default
            start_time = (now - timedelta(hours=24)).isoformat()
            bucket_format = None

        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            
            if bucket_format:
                # Agregovaný dotaz pro dlouhá období
                query = f"""
                    SELECT 
                        strftime('{bucket_format}', timestamp) || ':00Z' AS bucket_ts,
                        ROUND(AVG(temperature), 2) AS temperature,
                        ROUND(AVG(humidity), 1) AS humidity,
                        ROUND(AVG(pressure), 2) AS pressure,
                        ROUND(AVG(wind_speed), 2) AS wind_speed,
                        ROUND(SUM(rainfall_mm), 2) AS rainfall_mm,
                        ROUND(AVG(battery_voltage), 2) AS battery_voltage
                    FROM weather_readings
                    WHERE timestamp >= ?
                    GROUP BY bucket_ts
                    ORDER BY bucket_ts ASC
                """
                cursor = await db.execute(query, (start_time,))
                rows = await cursor.fetchall()
                return [
                    {
                        "timestamp": r["bucket_ts"],
                        "temperature": r["temperature"],
                        "humidity": r["humidity"],
                        "pressure": r["pressure"],
                        "wind_speed": r["wind_speed"],
                        "rainfall_mm": r["rainfall_mm"] or 0.0,
                        "battery_voltage": r["battery_voltage"]
                    }
                    for r in rows
                ]
            else:
                # 24h: detailní data (omezeno na rozumný limit)
                cursor = await db.execute(
                    """
                    SELECT * FROM weather_readings
                    WHERE timestamp >= ?
                    ORDER BY timestamp ASC
                    """,
                    (start_time,)
                )
                rows = await cursor.fetchall()
                return [dict(self._row_to_model(r)) for r in rows]

    async def get_period_statistics(self, timeframe: str = "24h") -> PeriodStatistics:
        """
        Výpočet klíčových agregátů: Tmax, Tmin, Tavg, průměrná vlhkost, celkový úhrn srážek.
        """
        now = datetime.now(timezone.utc)
        hours = 24 if timeframe == "24h" else (168 if timeframe == "7d" else 720)
        start_time = (now - timedelta(hours=hours)).isoformat()

        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                SELECT 
                    COUNT(*) as count,
                    MAX(temperature) as t_max,
                    MIN(temperature) as t_min,
                    AVG(temperature) as t_avg,
                    AVG(humidity) as h_avg,
                    AVG(pressure) as p_avg,
                    SUM(rainfall_mm) as r_sum,
                    MAX(wind_speed) as w_max,
                    AVG(wind_speed) as w_avg
                FROM weather_readings
                WHERE timestamp >= ?
                """,
                (start_time,)
            )
            row = await cursor.fetchone()
            
            return PeriodStatistics(
                timeframe=timeframe,
                sample_count=row["count"] or 0,
                temp_max=round(row["t_max"], 1) if row["t_max"] is not None else None,
                temp_min=round(row["t_min"], 1) if row["t_min"] is not None else None,
                temp_avg=round(row["t_avg"], 1) if row["t_avg"] is not None else None,
                humidity_avg=round(row["h_avg"], 1) if row["h_avg"] is not None else None,
                pressure_avg=round(row["p_avg"], 1) if row["p_avg"] is not None else None,
                rainfall_total=round(row["r_sum"] or 0.0, 1),
                wind_speed_max=round(row["w_max"], 1) if row["w_max"] is not None else None,
                wind_speed_avg=round(row["w_avg"], 1) if row["w_avg"] is not None else None
            )

    @staticmethod
    def _row_to_model(row: aiosqlite.Row) -> WeatherReading:
        from datetime import datetime
        raw_ts = row["timestamp"]
        try:
            ts = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
        except Exception:
            ts = datetime.now(timezone.utc)

        return WeatherReading(
            id=row["id"],
            timestamp=ts,
            temperature=row["temperature"],
            humidity=row["humidity"],
            pressure=row["pressure"],
            wind_speed=row["wind_speed"],
            wind_direction=row["wind_direction"],
            rainfall_mm=row["rainfall_mm"] or 0.0,
            battery_voltage=row["battery_voltage"]
        )


db_manager = DatabaseManager()
