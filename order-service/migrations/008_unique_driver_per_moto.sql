-- Migration 008: Enforce one moto per driver
-- Un driver solo puede tener asignada UNA moto a la vez.
-- Antes de agregar el constraint, desasignamos duplicados (conservamos el más reciente).

-- Quitar duplicados: si un driver tiene > 1 moto, dejar solo la de menor id (la primera asignada)
UPDATE motos
SET driver_id = NULL
WHERE id NOT IN (
    SELECT MIN(id)
    FROM motos
    WHERE driver_id IS NOT NULL
    GROUP BY driver_id
);

-- Agregar UNIQUE constraint (permite múltiples NULL = motos sin driver)
ALTER TABLE motos
    DROP CONSTRAINT IF EXISTS motos_driver_id_unique;

ALTER TABLE motos
    ADD CONSTRAINT motos_driver_id_unique UNIQUE (driver_id);
