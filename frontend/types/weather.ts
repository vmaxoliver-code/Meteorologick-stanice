/**
 * TypeScript definice pro meteorologickou telemetrii, trendy a predikční model.
 */

export interface WeatherReading {
  id: string;
  timestamp: string; // ISO 8601
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  rainfall_mm: number;
  battery_voltage: number | null;
}

export type TrendDirection = 'rising' | 'falling' | 'steady';

export interface TrendInfo {
  direction: TrendDirection;
  delta: number;
  percentage_change?: number | null;
}

export interface BatteryStatus {
  voltage: number | null;
  percentage: number;
  health: string;
  color: 'green' | 'yellow' | 'red' | 'gray';
}

export interface CurrentStatus {
  online: boolean;
  last_seen_seconds_ago: number | null;
  status_label: 'ONLINE' | 'OFFLINE';
  current: WeatherReading;
  trends_1h: {
    temperature: TrendInfo;
    humidity: TrendInfo;
    pressure: TrendInfo;
    wind_speed: TrendInfo;
  };
  battery_status: BatteryStatus;
}

export interface PeriodStats {
  timeframe: '24h' | '7d' | '30d';
  sample_count: number;
  temp_max: number | null;
  temp_min: number | null;
  temp_avg: number | null;
  humidity_avg: number | null;
  pressure_avg: number | null;
  rainfall_total: number;
  wind_speed_max: number | null;
  wind_speed_avg: number | null;
}

export interface PredictionDetails {
  dew_point_c: number | null;
  barometric_tendency: string;
  pressure_delta_3h: number;
  zambretti_code: string;
  zambretti_forecast: string;
  rain_probability_pct: number;
  forecast_12h_24h: string;
  advisory?: string | null;
}
