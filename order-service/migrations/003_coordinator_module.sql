-- =====================================================
-- MIGRACIÓN: Nuevos Roles y Módulo de Coordinadores
-- =====================================================

-- 1. Actualizar constraint de roles para incluir nuevos roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('admin', 'manager', 'coordinator', 'supervisor', 'analyst', 'driver', 'operator', 'client'));

-- 2. Tabla para visitas de coordinadores a sucursales
CREATE TABLE IF NOT EXISTS coordinator_visits (
    id SERIAL PRIMARY KEY,
    coordinator_id INTEGER NOT NULL REFERENCES users(id),
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    
    -- Check-in / Check-out
    check_in_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    check_out_time TIMESTAMP,
    
    -- Ubicación GPS al hacer check-in
    check_in_latitude DECIMAL(10, 8),
    check_in_longitude DECIMAL(11, 8),
    check_out_latitude DECIMAL(10, 8),
    check_out_longitude DECIMAL(11, 8),
    
    -- Distancia a la sucursal (para validar que realmente esté ahí)
    distance_to_branch_meters INTEGER,
    
    -- Estado de la visita
    status VARCHAR(50) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
    
    -- Notas generales
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_visits_coordinator ON coordinator_visits(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_visits_branch ON coordinator_visits(branch_id);
CREATE INDEX IF NOT EXISTS idx_visits_date ON coordinator_visits(check_in_time);

-- 3. Tabla para items del checklist (configurable por admin)
CREATE TABLE IF NOT EXISTS checklist_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'general',
    is_required BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla para respuestas del checklist en cada visita
CREATE TABLE IF NOT EXISTS checklist_responses (
    id SERIAL PRIMARY KEY,
    visit_id INTEGER NOT NULL REFERENCES coordinator_visits(id) ON DELETE CASCADE,
    template_id INTEGER NOT NULL REFERENCES checklist_templates(id),
    
    -- Respuesta: puede ser boolean, texto, número, etc.
    response_type VARCHAR(50) DEFAULT 'boolean' CHECK (response_type IN ('boolean', 'text', 'number', 'rating')),
    response_boolean BOOLEAN,
    response_text TEXT,
    response_number DECIMAL(10, 2),
    response_rating INTEGER CHECK (response_rating >= 1 AND response_rating <= 5),
    
    -- Evidencia fotográfica (URL de la imagen)
    photo_url TEXT,
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checklist_visit ON checklist_responses(visit_id);

-- 5. Insertar items de checklist predeterminados
INSERT INTO checklist_templates (name, description, category, is_required, display_order) VALUES
    ('Motos en buen estado', '¿Las motocicletas están en condiciones operativas?', 'operaciones', true, 1),
    ('Conductores con equipo', '¿Los conductores tienen casco y chaleco?', 'seguridad', true, 2),
    ('Pedidos pendientes revisados', '¿Se revisó el listado de pedidos pendientes?', 'operaciones', true, 3),
    ('Limpieza del área', '¿El área de despacho está limpia y ordenada?', 'infraestructura', false, 4),
    ('Documentación al día', '¿Los documentos de motos y conductores están vigentes?', 'documentación', true, 5),
    ('Sistema funcionando', '¿El sistema de pedidos está operativo?', 'tecnología', true, 6),
    ('Stock de insumos', '¿Hay suficientes bolsas, sellos, etc.?', 'inventario', false, 7),
    ('Comunicación con supervisor', '¿Se estableció comunicación con el supervisor?', 'comunicación', false, 8)
ON CONFLICT DO NOTHING;

-- 6. Vista para dashboard gerencial (KPIs consolidados)
CREATE OR REPLACE VIEW v_branch_kpis AS
SELECT 
    b.id as branch_id,
    b.name as branch_name,
    b.code as branch_code,
    COUNT(DISTINCT m.id) as total_motos,
    COUNT(DISTINCT CASE WHEN m.status = 'available' THEN m.id END) as motos_available,
    COUNT(DISTINCT CASE WHEN m.status = 'in_route' THEN m.id END) as motos_in_route,
    COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'pending') as pending_orders,
    COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'assigned') as assigned_orders,
    COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered' AND o.updated_at >= CURRENT_DATE) as delivered_today,
    COUNT(DISTINCT cv.id) FILTER (WHERE cv.check_in_time >= CURRENT_DATE) as visits_today
FROM branches b
LEFT JOIN motos m ON m.branch_id = b.id
LEFT JOIN orders o ON o.branch = b.code
LEFT JOIN coordinator_visits cv ON cv.branch_id = b.id
WHERE b.is_active = true
GROUP BY b.id, b.name, b.code;

SELECT 'Migración de Coordinadores completada exitosamente' as resultado;
