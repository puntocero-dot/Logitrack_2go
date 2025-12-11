-- =====================================================
-- MIGRACIÓN: Transferencia Temporal de Motos + Filtros
-- =====================================================

-- 1. Agregar campos para transferencia temporal en motos
DO $$ 
BEGIN
    -- current_branch_id: sucursal donde está actualmente (puede diferir de branch_id)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='motos' AND column_name='current_branch_id') THEN
        ALTER TABLE motos ADD COLUMN current_branch_id INTEGER REFERENCES branches(id);
    END IF;
    
    -- transfer_expires_at: cuándo expira la transferencia temporal
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='motos' AND column_name='transfer_expires_at') THEN
        ALTER TABLE motos ADD COLUMN transfer_expires_at TIMESTAMP;
    END IF;
    
    -- transfer_reason: motivo de la transferencia
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='motos' AND column_name='transfer_reason') THEN
        ALTER TABLE motos ADD COLUMN transfer_reason TEXT;
    END IF;
    
    -- transferred_by: quién autorizó la transferencia
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='motos' AND column_name='transferred_by') THEN
        ALTER TABLE motos ADD COLUMN transferred_by INTEGER REFERENCES users(id);
    END IF;
END $$;

-- 2. Inicializar current_branch_id = branch_id (donde no esté seteado)
UPDATE motos 
SET current_branch_id = branch_id 
WHERE current_branch_id IS NULL AND branch_id IS NOT NULL;

-- 3. Crear índice para búsquedas por sucursal actual
CREATE INDEX IF NOT EXISTS idx_motos_current_branch ON motos(current_branch_id);

-- 4. Tabla de historial de transferencias
CREATE TABLE IF NOT EXISTS moto_transfers (
    id SERIAL PRIMARY KEY,
    moto_id INTEGER NOT NULL REFERENCES motos(id),
    from_branch_id INTEGER REFERENCES branches(id),
    to_branch_id INTEGER REFERENCES branches(id),
    transferred_by INTEGER REFERENCES users(id),
    reason TEXT,
    transfer_type VARCHAR(50) DEFAULT 'temporary' CHECK (transfer_type IN ('temporary', 'permanent')),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    ended_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_transfers_moto ON moto_transfers(moto_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON moto_transfers(status);

-- 5. Función para auto-expirar transferencias
CREATE OR REPLACE FUNCTION expire_moto_transfers() RETURNS void AS $$
BEGIN
    -- Marcar transferencias expiradas
    UPDATE moto_transfers 
    SET status = 'completed', ended_at = CURRENT_TIMESTAMP
    WHERE status = 'active' AND expires_at < CURRENT_TIMESTAMP;
    
    -- Regresar motos a su sucursal original
    UPDATE motos m
    SET current_branch_id = m.branch_id,
        transfer_expires_at = NULL,
        transfer_reason = NULL,
        transferred_by = NULL
    WHERE m.transfer_expires_at < CURRENT_TIMESTAMP
    AND m.current_branch_id != m.branch_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Vista para motos con sucursal efectiva
CREATE OR REPLACE VIEW v_motos_with_branch AS
SELECT 
    m.id,
    m.license_plate,
    m.driver_id,
    m.status,
    m.latitude,
    m.longitude,
    m.max_orders_capacity,
    m.current_orders_count,
    m.branch_id as home_branch_id,
    COALESCE(m.current_branch_id, m.branch_id) as effective_branch_id,
    hb.name as home_branch_name,
    cb.name as current_branch_name,
    CASE WHEN m.current_branch_id != m.branch_id THEN true ELSE false END as is_transferred,
    m.transfer_expires_at,
    m.transfer_reason
FROM motos m
LEFT JOIN branches hb ON hb.id = m.branch_id
LEFT JOIN branches cb ON cb.id = COALESCE(m.current_branch_id, m.branch_id);

SELECT 'Migración de transferencias completada' as resultado;
