"""
Modul pro čtení telemetrických dat z fyzického sériového portu (UART / USB CDC).
Slouží jako přímý HW fallback v případě, že stanice nedisponuje Wi-Fi/GSM modemem
a je připojena přímo k serveru přes USB/Serial (např. Arduino, ESP32, STM32, Davis Vantage).
"""

import json
import logging
import threading
import time
from typing import Optional, Callable
import serial
import serial.tools.list_ports

from .models import TelemetryInput

logger = logging.getLogger("SerialReader")
logging.basicConfig(level=logging.INFO)


class SerialMeteoReader:
    """
    Asynchronní / vláknový posluchač sériového portu s automatickým
    znovupřipojením (auto-reconnect) a robustním ošetřením chyb.
    """

    def __init__(
        self,
        port: Optional[str] = None,
        baudrate: int = 115200,
        callback: Optional[Callable[[TelemetryInput], None]] = None
    ):
        self.port = port
        self.baudrate = baudrate
        self.callback = callback
        self.running = False
        self.thread: Optional[threading.Thread] = None

    @staticmethod
    def list_available_ports():
        """Vrátí seznam všech dostupných sériových COM / tty portů v systému."""
        ports = serial.tools.list_ports.comports()
        return [
            {
                "device": p.device,
                "description": p.description,
                "hwid": p.hwid
            }
            for p in ports
        ]

    def start(self):
        """Spustí čtecí smyčku v dedikovaném daemon vlákně."""
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._worker_loop, daemon=True, name="SerialWorker")
        self.thread.start()
        logger.info(f"Sériový posluchač spuštěn na portu {self.port or 'AUTO-DETECT'} @ {self.baudrate} baud.")

    def stop(self):
        """Zastaví čtení sériového portu."""
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2.0)
        logger.info("Sériový posluchač byl bezpečně ukončen.")

    def _find_port(self) -> Optional[str]:
        """Automaticky detekuje USB serial port, pokud nebyl zadán pevně."""
        if self.port:
            return self.port
        ports = serial.tools.list_ports.comports()
        for p in ports:
            desc = p.description.lower()
            if any(k in desc for k in ["usb", "ch340", "cp210", "ftdi", "arduino", "serial"]):
                logger.info(f"Nalezen potenciální meteo HW port: {p.device} ({p.description})")
                return p.device
        if ports:
            return ports[0].device
        return None

    def _worker_loop(self):
        """Smyčka se samočinným zotavením při odpojení kabelu."""
        while self.running:
            target_port = self._find_port()
            if not target_port:
                logger.debug("Žádný sériový port není momentálně připojen. Čekám 5 s...")
                time.sleep(5)
                continue

            try:
                logger.info(f"Otevírám sériové spojení: {target_port}...")
                with serial.Serial(target_port, self.baudrate, timeout=2.0) as ser:
                    ser.reset_input_buffer()
                    logger.info(f"Sériový port {target_port} úspěšně otevřen. Čtu telemetrii...")

                    while self.running:
                        line = ser.readline().decode("utf-8", errors="ignore").strip()
                        if not line:
                            continue

                        # Očekáváme JSON řádek typu: {"temperature": 21.4, "humidity": 65.2, ...}
                        if line.startswith("{") and line.endswith("}"):
                            try:
                                data = json.loads(line)
                                telemetry = TelemetryInput(**data)
                                if self.callback:
                                    self.callback(telemetry)
                                logger.info(f"Přijata data ze sériové linky: T={telemetry.temperature}°C, P={telemetry.pressure}hPa")
                            except json.JSONDecodeError:
                                logger.warning(f"Poškozený JSON paket na sériové lince: {line[:50]}...")
                            except Exception as e:
                                logger.error(f"Chyba zpracování paketu: {e}")

            except serial.SerialException as se:
                logger.warning(f"Ztráta spojení se sériovým portem {target_port}: {se}. Pokus o znovupřipojení za 3 s...")
                time.sleep(3)
            except Exception as ex:
                logger.error(f"Neočekávaná chyba sériového rozhraní: {ex}")
                time.sleep(5)
