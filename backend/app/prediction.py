"""
Hybridní predikční modul pro lokální meteorologickou stanici.
Kombinuje fyzikální deterministické výpočty (Rosný bod, Zambretti)
se statisticko-pravděpodobnostním modelem srážek na 12 až 24 hodin dopředu.
"""

import math
from typing import Optional, Dict, Any
from .zambretti import ZambrettiForecaster


class WeatherPredictor:
    """
    Predikční analytický stroj pracující v reálném čase nad datovými toky stanice.
    """

    @staticmethod
    def reduce_pressure_to_sea_level(
        pressure_hpa: Optional[float],
        elevation_m: float,
        temperature_c: Optional[float] = 15.0
    ) -> Optional[float]:
        """
        Barometrická redukce staničního tlaku na hladinu moře (QNH / MSL).
        Využívá mezinárodní hypsometrickou formuli WMO / ICAO:
          P_sea = P_station * (1 - (0.0065 * h) / (T + 0.0065 * h + 273.15)) ^ (-5.257)
        Kde:
          h = nadmořská výška stanice v metrech
          T = teplota v °C
        """
        if pressure_hpa is None or pressure_hpa <= 0:
            return None
        if elevation_m <= 0:
            return round(pressure_hpa, 2)

        temp = temperature_c if temperature_c is not None else 15.0
        try:
            factor = 1.0 - (0.0065 * elevation_m) / (temp + 0.0065 * elevation_m + 273.15)
            p_sea = pressure_hpa * math.pow(factor, -5.257)
            return round(p_sea, 2)
        except (ValueError, ZeroDivisionError):
            return round(pressure_hpa, 2)

    @staticmethod
    def calculate_dew_point(temperature_c: Optional[float], humidity_pct: Optional[float]) -> Optional[float]:
        """
        Výpočet rosného bodu (Dew Point) pomocí Magnus-Tetensovy aproximace
        doporučené Světovou meteorologickou organizací (WMO).
        
        Vzorec:
          alpha = (a * T) / (b + T) + ln(RH / 100)
          T_d = (b * alpha) / (a - alpha)
        Kde a = 17.27, b = 237.7 °C
        """
        if temperature_c is None or humidity_pct is None:
            return None
        if humidity_pct <= 0:
            return None

        # Omezení vlhkosti na maximálně 100 % pro logaritmus
        rh = min(100.0, max(0.1, humidity_pct))

        a = 17.27
        b = 237.7

        try:
            alpha = ((a * temperature_c) / (b + temperature_c)) + math.log(rh / 100.0)
            dew_point = (b * alpha) / (a - alpha)
            return round(dew_point, 1)
        except (ValueError, ZeroDivisionError):
            return None

    @classmethod
    def calculate_rain_probability(
        cls,
        pressure_delta_3h: float,
        humidity_pct: Optional[float],
        temperature_c: Optional[float],
        dew_point_c: Optional[float],
        wind_speed_ms: Optional[float] = None
    ) -> int:
        """
        Výpočet procentuální pravděpodobnosti srážek (0 - 100 %) pro okno 12-24 hodin.
        Algoritmus váží:
          - Pokles tlaku (barometrický gradient za 3 hodiny)
          - Relativní vlhkost vzduchu
          - Depresi rosného bodu (rozdíl T - T_d; menší rozdíl = nasycený vzduch)
          - Rychlost a nárazy větru (frontální turbulence)
        """
        prob = 15.0  # Základní klimatické pozadí

        # 1. Komponenta změny tlaku (váha až 40 %)
        if pressure_delta_3h <= -3.0:
            prob += 40.0  # Masivní pokles tlaku -> příchod cyklóny
        elif pressure_delta_3h <= -1.5:
            prob += 25.0
        elif pressure_delta_3h <= -0.5:
            prob += 10.0
        elif pressure_delta_3h >= 2.0:
            prob -= 20.0  # Silný vzestup -> rozpouštění oblačnosti
        elif pressure_delta_3h >= 1.0:
            prob -= 10.0

        # 2. Komponenta relativní vlhkosti (váha až 35 %)
        if humidity_pct is not None:
            if humidity_pct >= 90:
                prob += 35.0
            elif humidity_pct >= 80:
                prob += 20.0
            elif humidity_pct >= 70:
                prob += 10.0
            elif humidity_pct < 45:
                prob -= 20.0
            elif humidity_pct < 35:
                prob -= 30.0

        # 3. Komponenta deprese rosného bodu (T - T_d) (váha až 20 %)
        if temperature_c is not None and dew_point_c is not None:
            depression = temperature_c - dew_point_c
            if depression <= 1.5:
                prob += 20.0  # Vzduch je téměř nasycen, kondenzace a srážky
            elif depression <= 3.0:
                prob += 10.0
            elif depression >= 8.0:
                prob -= 15.0  # Suchý vzduch, déšť je nepravděpodobný

        # 4. Komponenta větru (dynamika fronty)
        if wind_speed_ms is not None and wind_speed_ms > 8.0:
            if pressure_delta_3h < 0:
                prob += 10.0  # Větrno při poklesu tlaku = aktivní frontální vlna

        # Ořezání výsledku na rozmezí 0 - 100 %
        return int(max(0, min(100, round(prob))))

    @classmethod
    def generate_forecast_text(
        cls,
        zambretti: Dict[str, Any],
        rain_prob: int,
        pressure_delta_3h: float,
        temperature_c: Optional[float],
        wind_speed_ms: Optional[float]
    ) -> str:
        """
        Sestaví syntetickou textovou předpověď pro okno 12-24 hodin.
        """
        tendency = zambretti.get("tendency_type", "steady")
        
        if rain_prob >= 75:
            if pressure_delta_3h <= -2.5:
                return "Blížící se výrazná srážková fronta. Očekávejte déšť během 3-6 hodin s možností silnějšího větru."
            return "Vysoká pravděpodobnost deště v následujících 6-12 hodinách. Zataženo, přeháňky."
        
        if rain_prob >= 50:
            return "Proměnlivé počasí s přibýváním oblačnosti. Během 12 hodin nelze vyloučit místní dešťové přeháňky."
        
        if tendency == "rising" and rain_prob < 30:
            return "Tlaková výše zpevňuje své pole. Očekávejte postupné vyjasňování a stabilní příznivé počasí na 24 hodin."
        
        if tendency == "steady" and rain_prob < 35:
            return "Stabilní barometrické podmínky bez výrazných změn. Převážně polojasno až jasno bez srážek."
            
        return zambretti.get("forecast", "Ustálené podmínky s proměnlivou oblačností.")

    @classmethod
    def analyze_battery(cls, voltage: Optional[float]) -> Dict[str, Any]:
        """
        Diagnostika stavu napájení stanice.
        Předpokládá buď 1S Li-Ion akumulátor (3.0V - 4.2V) nebo 12V záložní aku.
        """
        if voltage is None or voltage <= 0:
            return {
                "voltage": None,
                "percentage": 0,
                "health": "Neznámý",
                "color": "gray"
            }

        # Detekce typu (Li-Ion vs 12V systém)
        if voltage <= 5.5:
            # 1S Li-Ion / LiFePO4: 3.3V (prázdná) až 4.2V (plná)
            pct = int(max(0, min(100, (voltage - 3.3) / (4.2 - 3.3) * 100)))
            if voltage >= 3.7:
                health, color = "Dobrý (Optimální)", "green"
            elif voltage >= 3.45:
                health, color = "Střední (Doporučeno dobít)", "yellow"
            else:
                health, color = "Kritický (Riziko výpadku)", "red"
        else:
            # 12V olověný / solární systém: 11.5V (vybito) až 13.8V (plně nabito/float)
            pct = int(max(0, min(100, (voltage - 11.5) / (13.8 - 11.5) * 100)))
            if voltage >= 12.4:
                health, color = "Dobrý (Optimální)", "green"
            elif voltage >= 11.8:
                health, color = "Střední", "yellow"
            else:
                health, color = "Kritický", "red"

        return {
            "voltage": round(voltage, 2),
            "percentage": pct,
            "health": health,
            "color": color
        }
