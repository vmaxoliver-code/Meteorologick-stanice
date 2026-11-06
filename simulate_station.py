"""
Simulátor fyzické meteostanice (ESP32 / Arduino / Raspberry Pi).
Periodicky generuje reálná fyzická data a posílá je metodou POST ve formátu JSON
na endpoint http://localhost:8000/api/telemetry.
Umožňuje také simulovat šum a výpadky senzorů pro ověření odolnosti backendu.
"""

import sys
import time
import math
import random
import urllib.request
import json
from datetime import datetime, timezone

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

API_URL = "http://localhost:8000/api/telemetry"


def run_simulation(interval_seconds: float = 3.0):
    print("=" * 70)
    print("[SIMULATOR] Simulator hardwarové meteostanice spuštěn")
    print(f"Cílový endpoint: {API_URL}")
    print(f"Interval odesílání: {interval_seconds} s (Ukončení: Ctrl+C)")
    print("=" * 70)

    t_base = 18.5
    p_base = 1012.0
    step = 0

    while True:
        step += 1
        now = datetime.now(timezone.utc)
        
        # Plynulá simulace změn veličin
        temp = t_base + math.sin(step * 0.05) * 4.0 + random.uniform(-0.15, 0.15)
        humidity = max(20.0, min(95.0, 65.0 - (temp - 18.0) * 2.0 + random.uniform(-1.0, 1.0)))
        # Pomalý pokles tlaku simulující příchod fronty
        pressure = p_base - (step * 0.04) + random.uniform(-0.1, 0.1)
        wind_speed = max(0.2, round(2.8 + math.sin(step * 0.1) * 2.5 + random.uniform(-0.5, 1.2), 1))
        wind_dir = int((210 + math.sin(step * 0.08) * 35) % 360)
        
        # Občasné srážky
        rainfall = 0.0
        if step % 8 == 0:
            rainfall = round(random.uniform(0.2, 1.5), 1)

        batt = 4.08 - (step * 0.001)

        payload = {
            "timestamp": now.isoformat(),
            "temperature": round(temp, 2),
            "humidity": round(humidity, 1),
            "pressure": round(pressure, 2),
            "wind_speed": wind_speed,
            "wind_direction": wind_dir,
            "rainfall_mm": rainfall,
            "battery_voltage": round(batt, 2)
        }

        # Jednou za 15 paketů nasimulujeme drobnou chybu senzoru (null hodnota),
        # abychom otestovali robustnost validační vrstvy backendu:
        if step % 15 == 0:
            print("[Simulace HW šumu] Posílám paket s chybějící teplotou (null)...")
            payload["temperature"] = None

        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            API_URL,
            data=data_bytes,
            headers={"Content-Type": "application/json"}
        )

        try:
            with urllib.request.urlopen(req, timeout=4.0) as resp:
                res = json.loads(resp.read().decode())
                print(f"[{now.strftime('%H:%M:%S')}] OK: T={payload['temperature']}°C | P={payload['pressure']}hPa | Vlhkost={payload['humidity']}% | Status: {res.get('status')}")
        except Exception as e:
            print(f"[{now.strftime('%H:%M:%S')}] CHYBA: {e}")

        time.sleep(interval_seconds)


if __name__ == "__main__":
    run_simulation()
