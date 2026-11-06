"""
Startovací skript meteorologického serveru a monitorovacího centra.
Spustí FastAPI aplikaci, inicializuje asynchronní databázi,
připraví WebSocket endpointy a začne servírovat real-time dashboard.
"""

import sys
import os

# Zajištění UTF-8 výstupu na Windows konzoli
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Přidání kořenového adresáře do sys.path pro čisté relativní importy
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))

    print("=" * 75)
    print("[METEOCENTER PRO] Meteorologické monitorovací & predikční centrum")
    print("=" * 75)
    print(f"-> Webový Dashboard:        http://localhost:{port}")
    print(f"-> Interaktivní Swagger:    http://localhost:{port}/docs")
    print(f"-> Příjem telemetrie (POST): http://localhost:{port}/api/telemetry")
    print(f"-> Real-time WebSocket:     ws://localhost:{port}/ws")
    print(f"-> CSV Export dat:          http://localhost:{port}/api/export/csv?timeframe=24h")
    print("=" * 75)
    print("Pro simulaci fyzické meteostanice spusťte v druhém okně: python simulate_station.py")
    print("Server běží... Ukončení: stiskněte Ctrl+C\n")

    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
