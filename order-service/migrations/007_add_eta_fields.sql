-- Migración 007: Campos para comparar ETA estimado vs tiempo real de entrega
-- Permite calcular on_time_rate y route_efficiency KPIs

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS estimated_eta_min   DECIMAL(8,2),    -- ETA calculado al momento de asignación
    ADD COLUMN IF NOT EXISTS estimated_distance_km DECIMAL(10,3),  -- Distancia calculada al momento de asignación
    ADD COLUMN IF NOT EXISTS eta_method          VARCHAR(30);      -- 'mapbox_directions' | 'haversine'

-- Índice para consultas de KPI: pedidos entregados con ETA
CREATE INDEX IF NOT EXISTS idx_orders_delivered_eta
    ON orders(status, updated_at, estimated_eta_min)
    WHERE status = 'delivered' AND estimated_eta_min IS NOT NULL;
