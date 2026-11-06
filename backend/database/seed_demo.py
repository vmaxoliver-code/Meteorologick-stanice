"""
Generátor realistických historických meteorologických dat pro prvotní naplnění databáze.
Simuluje denní cyklus teploty, inverzní korelaci vlhkosti, přechod tlakové níže
a realistické srážkové události za posledních 30 dní.
"""

import math
import random
import uuid
import aiosqlite
from datetime import datetime, timezone, timedelta
from typing import Any


async def generate_initial_history(db_manager: Any, days: int = 30):
    """
    Vygeneruje realistickou historii měření v jedné rychlé dávkové transakci (executemany).
    """
    now = datetime.now(timezone.utc)
    base_pressure = 1013.25
    rows_to_insert = []

    # 1. Generování po hodinách pro 30 dní
    total_hours = days * 24
    for h in range(total_hours, 24, -1):
        point_time = now - timedelta(hours=h)
        hour_of_day = point_time.hour

        # Teplotní denní cyklus
        diurnal = math.sin((hour_of_day - 9) * math.pi / 12) * 5.0
        synoptic = math.sin(h / 30.0) * 4.0
        temp = round(14.0 + diurnal + synoptic + random.uniform(-0.5, 0.5), 1)

        # Vlhkost: inverzní k teplotě
        humidity = round(max(30.0, min(98.0, 95.0 - (temp * 2.8) + random.uniform(-4, 4))), 1)

        # Tlak vzduchu
        pressure = round(base_pressure + math.sin(h / 24.0) * 12.0 + math.cos(h / 72.0) * 8.0 + random.uniform(-0.3, 0.3), 1)

        # Srážky
        rainfall = 0.0
        if pressure < 1006.0 and humidity > 85.0 and random.random() < 0.4:
            rainfall = round(random.uniform(0.5, 6.5), 1)

        wind_speed = max(0.5, round(2.5 + abs(math.sin(h / 15.0)) * 6.0 + random.uniform(-1, 2), 1))
        wind_dir = int((180 + math.sin(h / 40.0) * 120 + random.uniform(-20, 20)) % 360)

        is_daylight = 7 <= hour_of_day <= 18
        batt_v = round((4.15 if is_daylight else 3.88) + random.uniform(-0.04, 0.04), 2)

        rows_to_insert.append((
            str(uuid.uuid4()),
            point_time.isoformat(),
            temp,
            humidity,
            pressure,
            wind_speed,
            wind_dir,
            rainfall,
            batt_v
        ))

    # 2. Posledních 24 hodin s krokem 15 minut (96 bodů)
    for m in range(24 * 4, -1, -1):
        point_time = now - timedelta(minutes=m * 15)
        hour_of_day = point_time.hour + point_time.minute / 60.0

        diurnal = math.sin((hour_of_day - 9) * math.pi / 12) * 4.5
        temp = round(16.5 + diurnal + random.uniform(-0.3, 0.3), 1)
        humidity = round(max(35.0, min(95.0, 90.0 - (temp * 2.5) + random.uniform(-2, 2))), 1)
        pressure = round(1015.0 - (24 * 4 - m) * 0.05 + random.uniform(-0.15, 0.15), 1)
        
        rainfall = 0.0
        if m in range(8, 14):
            rainfall = round(random.uniform(1.2, 3.4), 1)

        wind_speed = max(0.8, round(3.2 + random.uniform(-1.0, 2.5), 1))
        wind_dir = int((225 + random.uniform(-25, 25)) % 360)
        batt_v = round(4.05 + random.uniform(-0.03, 0.03), 2)

        rows_to_insert.append((
            str(uuid.uuid4()),
            point_time.isoformat(),
            temp,
            humidity,
            pressure,
            wind_speed,
            wind_dir,
            rainfall,
            batt_v
        ))

    # Hromadný zápis v jediné transakci (trvá cca 20 milisekund)
    async with aiosqlite.connect(db_manager.db_path) as db:
        await db.executemany(
            """
            INSERT INTO weather_readings (
                id, timestamp, temperature, humidity, pressure,
                wind_speed, wind_direction, rainfall_mm, battery_voltage
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows_to_insert
        )
        await db.commit()

    print(f"[METEO SEEDER] Úspěšně dávkově uloženo {len(rows_to_insert)} historických záznamů.")
