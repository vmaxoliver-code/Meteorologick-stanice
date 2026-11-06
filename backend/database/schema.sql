-- =============================================================================
-- SQL SCHEMA: LOKÁLNÍ METEOROLOGICKÁ STANICE (POSTGRESQL / TIMESCALEDB)
-- =============================================================================

-- 1. Povolení rozšíření pro UUID a časové řady (pokud jsou dostupné)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- CREATE EXTENSION IF NOT EXISTS "timescaledb"; -- Odkomentujte při použití TimescaleDB

-- 2. Hlavní tabulka meteorologických měření
CREATE TABLE IF NOT EXISTS weather_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    temperature NUMERIC(4, 2),          -- °C, např. -40.00 až 85.00
    humidity NUMERIC(5, 2),             -- %, např. 0.00 až 100.00
    pressure NUMERIC(6, 2),             -- hPa, např. 850.00 až 1100.00
    wind_speed NUMERIC(5, 2),           -- m/s, např. 0.00 až 100.00
    wind_direction SMALLINT,            -- stupně 0 - 360
    rainfall_mm NUMERIC(6, 2),          -- mm za poslední hodinu (nebo kumulativní)
    battery_voltage NUMERIC(4, 2),      -- V, diagnostické napětí (např. 2.8V - 4.2V / 12V)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Optimalizační indexy pro časové řady a rychlé dotazování
CREATE INDEX IF NOT EXISTS idx_weather_readings_timestamp_desc 
    ON weather_readings (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_weather_readings_trend_lookup 
    ON weather_readings (timestamp DESC, pressure, temperature);

-- 4. TimescaleDB integrace (volitelné pro produkční velkoobjemová data)
-- Převede tabulku na optimalizovanou "hypertable" s automatickým chunkováním po 7 dnech:
-- SELECT create_hypertable('weather_readings', 'timestamp', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);

-- 5. TimescaleDB kompresní politika (pro data starší než 14 dní - úspora 90 % místa na disku)
-- ALTER TABLE weather_readings SET (
--     timescaledb.compress,
--     timescaledb.compress_segmentby = 'id',
--     timescaledb.compress_orderby = 'timestamp DESC'
-- );
-- SELECT add_compression_policy('weather_readings', INTERVAL '14 days');

-- 6. Kontinuální agregát (Materialized View) pro hodinové statistiky:
-- CREATE MATERIALIZED VIEW IF NOT EXISTS weather_hourly_summary
-- WITH (timescaledb.continuous) AS
-- SELECT 
--     time_bucket('1 hour', timestamp) AS bucket,
--     AVG(temperature) AS avg_temp,
--     MIN(temperature) AS min_temp,
--     MAX(temperature) AS max_temp,
--     AVG(humidity) AS avg_humidity,
--     AVG(pressure) AS avg_pressure,
--     MAX(wind_speed) AS max_wind_speed,
--     SUM(rainfall_mm) AS total_rainfall
-- FROM weather_readings
-- GROUP BY bucket;
