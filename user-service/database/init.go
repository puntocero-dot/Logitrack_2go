package database

import (
	"database/sql"
	"log"
)

// InitSchema crea las tablas si no existen
func InitSchema(db *sql.DB) error {
	schema := `
-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('superadmin', 'admin', 'manager', 'supervisor', 'coordinator', 'analyst', 'operator', 'driver', 'client')),
    branch_id INTEGER,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Tabla de motos
CREATE TABLE IF NOT EXISTS motos (
    id SERIAL PRIMARY KEY,
    license_plate VARCHAR(20) UNIQUE NOT NULL,
    driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'in_route', 'maintenance', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para motos
CREATE INDEX IF NOT EXISTS idx_motos_status ON motos(status);
CREATE INDEX IF NOT EXISTS idx_motos_driver ON motos(driver_id);

-- Tabla de pedidos
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(50),
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_route', 'delivered', 'cancelled')),
    assigned_moto_id INTEGER REFERENCES motos(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP
);

-- Índices para orders
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_moto ON orders(assigned_moto_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- Tabla de ubicaciones (GPS tracking)
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    moto_id INTEGER REFERENCES motos(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    type VARCHAR(50) DEFAULT 'current' CHECK (type IN ('current', 'historical'))
);

-- Índices para locations
CREATE INDEX IF NOT EXISTS idx_locations_order ON locations(order_id);
CREATE INDEX IF NOT EXISTS idx_locations_moto ON locations(moto_id);
CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp);
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);

-- Tabla de rutas optimizadas
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    moto_id INTEGER REFERENCES motos(id) ON DELETE CASCADE,
    order_ids INTEGER[] NOT NULL,
    total_distance DECIMAL(10, 2),
    estimated_time INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para routes
CREATE INDEX IF NOT EXISTS idx_routes_moto ON routes(moto_id);
CREATE INDEX IF NOT EXISTS idx_routes_created ON routes(created_at);

-- Tabla de KPIs
CREATE TABLE IF NOT EXISTS kpis (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    total_orders INTEGER DEFAULT 0,
    delivered_orders INTEGER DEFAULT 0,
    cancelled_orders INTEGER DEFAULT 0,
    avg_delivery_time INTEGER,
    total_distance DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para kpis
CREATE INDEX IF NOT EXISTS idx_kpis_date ON kpis(date);

-- Insertar usuarios por defecto si no existen
INSERT INTO users (email, password_hash, role)
VALUES 
    ('admin@logitrack.com', '$2a$10$rN8Z3Z3Z3Z3Z3Z3Z3Z3Z3uO8Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z', 'admin'),
    ('supervisor@logitrack.com', '$2a$10$rN8Z3Z3Z3Z3Z3Z3Z3Z3Z3uO8Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z', 'supervisor')
ON CONFLICT (email) DO NOTHING;
`

	_, err := db.Exec(schema)
	if err != nil {
		log.Printf("Error initializing schema: %v", err)
		return err
	}

	log.Println("✅ Database schema initialized successfully")
	return nil
}
