-- Migración 001: Índices para optimizar queries de tracking de ruta del driver
-- Aplicar manualmente o via docker-compose con init.sql actualizado

-- Índice compuesto para queries ordenadas por turno+tiempo (el más consultado)
CREATE INDEX IF NOT EXISTS idx_route_points_shift_timestamp
    ON route_points(shift_id, timestamp DESC);

-- Índice para filtrar por tipo de punto dentro de un turno
CREATE INDEX IF NOT EXISTS idx_route_points_shift_type
    ON route_points(shift_id, point_type);

-- Índice parcial en order_id (solo filas donde no es NULL — DELIVERY points)
CREATE INDEX IF NOT EXISTS idx_route_points_order
    ON route_points(order_id) WHERE order_id IS NOT NULL;

-- Índice compuesto para buscar turno activo de un driver
CREATE INDEX IF NOT EXISTS idx_shifts_driver_status
    ON shifts(driver_id, status);

-- Índice parcial para turnos activos por sucursal (supervisor dashboard)
CREATE INDEX IF NOT EXISTS idx_shifts_status_branch
    ON shifts(status, branch) WHERE status = 'ACTIVE';
