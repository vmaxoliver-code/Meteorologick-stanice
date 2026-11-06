"""
Konfigurace lokality stanice, nadmořské výšky a barometrické korekce.
"""

import os
import json
from pydantic import BaseModel, Field

CONFIG_FILE = os.getenv("STATION_CONFIG_PATH", "station_config.json")


class StationLocationConfig(BaseModel):
    name: str = Field(default="Praha - Karlov", description="Název lokality stanice")
    latitude: float = Field(default=50.08, description="Zeměpisná šířka")
    longitude: float = Field(default=14.43, description="Zeměpisná délka")
    elevation_m: float = Field(default=280.0, description="Nadmořská výška stanice v metrech (pro redukci tlaku)")
    auto_reduce_pressure: bool = Field(default=True, description="Zda automaticky redukovat staniční tlak na hladinu moře")


def load_station_config() -> StationLocationConfig:
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return StationLocationConfig(**data)
        except Exception:
            pass
    return StationLocationConfig()


def save_station_config(config: StationLocationConfig):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config.model_dump(), f, ensure_ascii=False, indent=2)


current_config = load_station_config()
