"""
Zambrettiho predikční algoritmus a analýza barometrické tendence.
Implementuje lokální empirický model pro předpověď počasí na základě 3-hodinové změny tlaku,
směru větru a ročního období pro středoevropské podmínky.
"""

from typing import Tuple, Dict, Any
from datetime import datetime


class ZambrettiForecaster:
    """
    Zambrettiho algoritmus (Negretti & Zambra, 1915).
    Převádí barometrický tlak, jeho 3h tendenci a směr větru na přesnou lokální předpověď.
    """

    # Zambrettiho předpovědní tabulka (A až Z) přeložená do češtiny s meteorologickými detaily
    FORECASTS: Dict[str, str] = {
        "A": "Ustálené pěkné počasí, jasno a slunečno.",
        "B": "Pěkné počasí, stabilní podmínky.",
        "C": "Počasí se zlepšuje, ubývání oblačnosti.",
        "D": "Pěkné počasí s možností přechodné oblačnosti.",
        "E": "Pěkné počasí, možný výskyt ojedinělých přeháněk.",
        "F": "Pěkné počasí, v pozdějších hodinách nárůst oblačnosti.",
        "G": "Pěkné počasí, mírné riziko přeháněk.",
        "H": "Přechodné vyjasnění, proměnlivé podmínky.",
        "I": "Proměnlivo, možnost lokálních dešťových přeháněk.",
        "J": "Nestálé počasí s přeháňkami, tendence ke zlepšování.",
        "K": "Nestálé počasí, občasný déšť.",
        "L": "Nestálé počasí, přeháňky a proměnlivý vítr.",
        "M": "Proměnlivo s přibývajícím deštěm.",
        "N": "Přeháňky, postupně vyjasňování.",
        "O": "Časté přeháňky, zhoršování počasí.",
        "P": "Nestálé, občasný vytrvalejší déšť.",
        "Q": "Nestálé počasí, brzký déšť.",
        "R": "Zataženo s deštěm, nestabilní atmosféra.",
        "S": "Déšť s krátkými přestávkami, sychravo.",
        "T": "Zhoršování počasí, příchod frontální oblačnosti a deště.",
        "U": "Déšť v pravidelných intervalech, větrno.",
        "V": "Trvalejší déšť, ochlazení.",
        "W": "Vydatný déšť, zhoršená dohlednost.",
        "X": "Velmi deštivo, riziko bouřek.",
        "Y": "Bouřlivé počasí, silný déšť a poryvy větru.",
        "Z": "Bouře, prudký pokles tlaku, vydatné srážky a silný vichr."
    }

    @staticmethod
    def get_barometric_tendency(delta_p_3h: float) -> Tuple[str, str]:
        """
        Vyhodnotí barometrickou tendenci za poslední 3 hodiny.
        delta_p_3h = P(nyní) - P(před 3 hodinami)
        Vrací (kategorie: 'rising'|'falling'|'steady', popis: str)
        """
        if delta_p_3h >= 2.5:
            return "rising", "Rychlý vzestup (zlepšování počasí)"
        elif delta_p_3h >= 1.0:
            return "rising", "Pomalý vzestup (stabilizace)"
        elif delta_p_3h > -1.0:
            return "steady", "Stabilní tlak (beze změny)"
        elif delta_p_3h > -2.5:
            return "falling", "Pomalý pokles (zhoršování počasí)"
        else:
            return "falling", "Rychlý pokles (blížící se fronta / bouřka)"

    @classmethod
    def calculate(
        cls,
        pressure_hpa: float,
        delta_p_3h: float,
        wind_direction: int | None = None,
        month: int | None = None
    ) -> Dict[str, Any]:
        """
        Vypočítá Zambrettiho index a předpověď.
        
        :param pressure_hpa: Aktuální atmosférický tlak redukovaný na hladinu moře (hPa).
        :param delta_p_3h: Změna tlaku za 3 hodiny v hPa (kladná = stoupá, záporná = klesá).
        :param wind_direction: Směr větru ve stupních (0-360).
        :param month: Měsíc v roce (1-12) pro sezónní korekci (léto/zima).
        """
        if month is None:
            month = datetime.now().month

        is_winter = month in [10, 11, 12, 1, 2, 3]

        tendency_type, tendency_label = cls.get_barometric_tendency(delta_p_3h)

        # Normalizace tlaku na standardní rozsah (cca 950 - 1050 hPa)
        p = max(950.0, min(1050.0, pressure_hpa))

        # Vliv směru větru na severní polokouli:
        # Severní/východní větry zvyšují stabilitu tlaku (anticyklona),
        # jižní/západní větry přinášejí atlantské/středomořské fronty.
        wind_corr = 0
        if wind_direction is not None:
            # 0° = S, 90° = V, 180° = J, 270° = Z
            if 0 <= wind_direction < 45 or 315 <= wind_direction <= 360:
                wind_corr = 2  # Severní vítr (anticyklonální)
            elif 45 <= wind_direction < 135:
                wind_corr = 1  # Východní vítr
            elif 135 <= wind_direction < 225:
                wind_corr = -2 # Jižní vítr (teplá fronta / srážky)
            elif 225 <= wind_direction < 315:
                wind_corr = -1 # Západní vítr (oceánská fronta)

        # Výpočet indexu Z podle základních Zambrettiho rovnic
        z_num = 13
        if tendency_type == "falling":
            # Tlak klesá -> vzorec pro klesající tlak
            z_val = 127.0 - 0.12 * p
            z_num = int(round(z_val))
            if is_winter:
                z_num += 1
            z_num += wind_corr
            # Omezení pro klesající: J až Z (indexy 10 až 26)
            z_num = max(10, min(26, z_num))

        elif tendency_type == "rising":
            # Tlak stoupá -> vzorec pro stoupající tlak
            z_val = 185.0 - 0.16 * p
            z_num = int(round(z_val))
            if not is_winter:
                z_num -= 1
            z_num -= wind_corr
            # Omezení pro stoupající: A až M (indexy 1 až 13)
            z_num = max(1, min(13, z_num))

        else: # steady
            # Tlak stabilní -> vzorec pro ustálený tlak
            z_val = 144.0 - 0.13 * p
            z_num = int(round(z_val))
            z_num += (wind_corr // 2)
            # Omezení pro stabilní: D až T (indexy 4 až 20)
            z_num = max(4, min(20, z_num))

        # Mapování čísla 1..26 na písmeno A..Z
        letter = chr(ord('A') + (z_num - 1))
        forecast_text = cls.FORECASTS.get(letter, "Ustálené podmínky s mírnou oblačností.")

        return {
            "zambretti_code": letter,
            "zambretti_index": z_num,
            "tendency_type": tendency_type,
            "tendency_label": tendency_label,
            "pressure_delta_3h": round(delta_p_3h, 2),
            "forecast": forecast_text
        }
