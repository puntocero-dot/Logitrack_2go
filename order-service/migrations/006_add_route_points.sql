-- Migration: Create route_points table for GPS tracking history
-- This stores the complete route history for each moto/order

DO $$
BEGIN
    -- Create route_points table if not exists
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'route_points') THEN
        CREATE TABLE route_points (
            id SERIAL PRIMARY KEY,
            moto_id INTEGER REFERENCES motos(id),
            order_id INTEGER REFERENCES orders(id),
            latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL,
            speed_kmh DOUBLE PRECISION,
            heading DOUBLE PRECISION,
            accuracy_meters DOUBLE PRECISION,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            point_type VARCHAR(20) DEFAULT 'tracking' -- 'start', 'tracking', 'stop', 'delivery'
        );
        
        -- Index for efficient queries
        CREATE INDEX idx_route_points_moto_id ON route_points(moto_id);
        CREATE INDEX idx_route_points_order_id ON route_points(order_id);
        CREATE INDEX idx_route_points_recorded_at ON route_points(recorded_at);
        CREATE INDEX idx_route_points_moto_date ON route_points(moto_id, recorded_at);
    END IF;
END $$;
