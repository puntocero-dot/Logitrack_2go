-- Init DB schema
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('supervisor', 'admin', 'operator', 'driver', 'client')),
    branch VARCHAR(50) DEFAULT 'central',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================
-- SUCURSALES / BRANCHES (Nueva Entidad)
-- ============================================
CREATE TABLE IF NOT EXISTS branches (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,  -- 'central', 'zona_a', 'norte', etc.
    address TEXT,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    radius_km DECIMAL(5, 2) DEFAULT 10.0,  -- Radio de cobertura en km
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active);

-- Insertar sucursales por defecto (Guatemala Ciudad como ejemplo)
INSERT INTO branches (name, code, address, latitude, longitude, radius_km) VALUES
    ('Central', 'central', 'Zona 1, Guatemala Ciudad', 14.6349, -90.5069, 15.0),
    ('Zona Norte', 'norte', 'Zona 18, Guatemala Ciudad', 14.6800, -90.4800, 10.0),
    ('Zona Sur', 'sur', 'Zona 12, Guatemala Ciudad', 14.5900, -90.5200, 10.0)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- MOTOS (Actualizada con ubicación)
-- ============================================
CREATE TABLE IF NOT EXISTS motos (
    id SERIAL PRIMARY KEY,
    license_plate VARCHAR(50) UNIQUE NOT NULL,
    driver_id INTEGER REFERENCES users(id),
    branch_id INTEGER REFERENCES branches(id),
    status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'in_route', 'maintenance')),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    last_location_update TIMESTAMP,
    max_orders_capacity INTEGER DEFAULT 5,  -- Máximo de pedidos simultáneos
    current_orders_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_motos_branch ON motos(branch_id);
CREATE INDEX IF NOT EXISTS idx_motos_status ON motos(status);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    client_name VARCHAR(255),
    client_email VARCHAR(255),
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_route', 'delivered', 'cancelled')),
    assigned_moto_id INTEGER REFERENCES motos(id),
    branch VARCHAR(50) DEFAULT 'central',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_branch ON orders(branch);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    moto_id INTEGER REFERENCES motos(id),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    type VARCHAR(50) CHECK (type IN ('pickup', 'delivery', 'current'))
);

CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    moto_id INTEGER REFERENCES motos(id),
    order_sequence JSONB,
    optimized_path JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kpis (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    checkpoint VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TRACKING DE RUTAS - HISTORIAL DE TURNOS
-- ============================================

-- Tabla de turnos/shifts de drivers
CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch VARCHAR(50) DEFAULT 'central',
    start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' 
        CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
    total_distance_km DECIMAL(10, 2) DEFAULT 0.0,
    total_deliveries INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de puntos de ruta (GPS tracking continuo)
CREATE TABLE IF NOT EXISTS route_points (
    id SERIAL PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(10, 2),
    speed DECIMAL(10, 2),
    heading DECIMAL(5, 2),
    altitude DECIMAL(10, 2),
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    point_type VARCHAR(20) NOT NULL DEFAULT 'TRACKING' 
        CHECK (point_type IN ('START', 'TRACKING', 'DELIVERY', 'PAUSE', 'END')),
    order_id INTEGER NULL REFERENCES orders(id) ON DELETE SET NULL,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimización de queries
CREATE INDEX IF NOT EXISTS idx_shifts_driver_id ON shifts(driver_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_branch ON shifts(branch);
CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON shifts(start_time);

CREATE INDEX IF NOT EXISTS idx_route_points_shift_id ON route_points(shift_id);
CREATE INDEX IF NOT EXISTS idx_route_points_timestamp ON route_points(timestamp);
CREATE INDEX IF NOT EXISTS idx_route_points_type ON route_points(point_type);
CREATE INDEX IF NOT EXISTS idx_route_points_order_id ON route_points(order_id);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_shifts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shifts_updated_at_trigger
BEFORE UPDATE ON shifts
FOR EACH ROW
EXECUTE FUNCTION update_shifts_updated_at();
