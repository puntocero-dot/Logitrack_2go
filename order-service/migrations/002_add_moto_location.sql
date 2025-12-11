-- =====================================================
-- MIGRACIÓN: Agregar soporte para ubicación de motos
-- Ejecutar en bases de datos existentes
-- =====================================================

-- 1. Crear tabla de sucursales si no existe
CREATE TABLE IF NOT EXISTS branches (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    address TEXT,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    radius_km DECIMAL(5, 2) DEFAULT 10.0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Insertar sucursales por defecto
INSERT INTO branches (name, code, address, latitude, longitude, radius_km) VALUES
    ('Central', 'central', 'Zona 1, Guatemala Ciudad', 14.6349, -90.5069, 15.0),
    ('Zona Norte', 'norte', 'Zona 18, Guatemala Ciudad', 14.6800, -90.4800, 10.0),
    ('Zona Sur', 'sur', 'Zona 12, Guatemala Ciudad', 14.5900, -90.5200, 10.0)
ON CONFLICT (code) DO NOTHING;

-- 3. Agregar columnas nuevas a motos (si no existen)
DO $$ 
BEGIN
    -- branch_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='motos' AND column_name='branch_id') THEN
        ALTER TABLE motos ADD COLUMN branch_id INTEGER REFERENCES branches(id);
    END IF;
    
    -- latitude
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='motos' AND column_name='latitude') THEN
        ALTER TABLE motos ADD COLUMN latitude DECIMAL(10, 8);
    END IF;
    
    -- longitude
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='motos' AND column_name='longitude') THEN
        ALTER TABLE motos ADD COLUMN longitude DECIMAL(11, 8);
    END IF;
    
    -- last_location_update
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='motos' AND column_name='last_location_update') THEN
        ALTER TABLE motos ADD COLUMN last_location_update TIMESTAMP;
    END IF;
    
    -- max_orders_capacity
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='motos' AND column_name='max_orders_capacity') THEN
        ALTER TABLE motos ADD COLUMN max_orders_capacity INTEGER DEFAULT 5;
    END IF;
    
    -- current_orders_count
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='motos' AND column_name='current_orders_count') THEN
        ALTER TABLE motos ADD COLUMN current_orders_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- 4. Crear índices
CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active);
CREATE INDEX IF NOT EXISTS idx_motos_branch ON motos(branch_id);
CREATE INDEX IF NOT EXISTS idx_motos_status ON motos(status);

-- 5. Actualizar motos existentes con valores por defecto
UPDATE motos 
SET branch_id = 1, 
    latitude = 14.6349, 
    longitude = -90.5069,
    max_orders_capacity = COALESCE(max_orders_capacity, 5),
    current_orders_count = COALESCE(current_orders_count, 0)
WHERE branch_id IS NULL;

-- 6. Recalcular current_orders_count basado en pedidos asignados
UPDATE motos m
SET current_orders_count = (
    SELECT COUNT(*) 
    FROM orders o 
    WHERE o.assigned_moto_id = m.id 
    AND o.status IN ('assigned', 'in_route')
);

SELECT 'Migración completada exitosamente' as resultado;
