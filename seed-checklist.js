const { Client } = require('pg');

const client = new Client({
    host: 'ballast.proxy.rlwy.net',
    port: 29198,
    user: 'postgres',
    password: 'MnYbJdUfIxkThIHDNhoKATYyNBewRJTf',
    database: 'railway',
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        await client.connect();
        console.log('✅ Connected to Railway Postgres\n');

        // 1. Limpiar checklist templates existentes
        console.log('🔄 Limpiando checklist templates...');
        await client.query('DELETE FROM checklist_templates');

        // 2. Insertar checklist para revisión de motocicletas
        console.log('🔄 Insertando checklist de revisión de motos...');

        const templates = [
            { name: 'Cantidad de motos operativas', desc: 'Verificar cuántas motos están disponibles y funcionando', category: 'inventario', order: 1, required: true },
            { name: 'Motos con documentos al día', desc: 'Seguro, circulación, tarjeta de propiedad vigentes', category: 'documentos', order: 2, required: true },
            { name: 'Horario de entrada cumplido', desc: 'Pilotos llegaron a tiempo según horario asignado', category: 'horarios', order: 3, required: true },
            { name: 'Uniforme y equipo completo', desc: 'Chaleco, casco, mochila térmica en buen estado', category: 'equipo', order: 4, required: true },
            { name: 'Pedidos entregados a tiempo', desc: 'Revisar % de entregas dentro del tiempo prometido', category: 'operaciones', order: 5, required: true },
            { name: 'Combustible suficiente', desc: 'Todas las motos tienen combustible para el turno', category: 'mantenimiento', order: 6, required: false },
            { name: 'Llantas en buen estado', desc: 'Sin desgaste excesivo, presión correcta', category: 'mantenimiento', order: 7, required: false },
            { name: 'Luces funcionando', desc: 'Faros delanteros, traseros y direccionales', category: 'seguridad', order: 8, required: true },
            { name: 'Frenos en buen estado', desc: 'Revisar respuesta de frenos delantero y trasero', category: 'seguridad', order: 9, required: true },
            { name: 'Limpieza de moto', desc: 'Moto limpia y presentable para entregas', category: 'imagen', order: 10, required: false },
            { name: 'App de rider funcionando', desc: 'Aplicación de entrega instalada y operativa', category: 'tecnologia', order: 11, required: true },
            { name: 'GPS/Tracking activo', desc: 'Sistema de rastreo funcionando correctamente', category: 'tecnologia', order: 12, required: true },
        ];

        for (const t of templates) {
            await client.query(`
        INSERT INTO checklist_templates (name, description, category, display_order, is_required, is_active)
        VALUES ($1, $2, $3, $4, $5, true)
      `, [t.name, t.desc, t.category, t.order, t.required]);
        }
        console.log(`✅ ${templates.length} checklist templates insertados\n`);

        // 3. Verificar columnas requeridas en coordinator_visits
        console.log('🔄 Verificando columnas en coordinator_visits...');
        await client.query(`ALTER TABLE coordinator_visits ADD COLUMN IF NOT EXISTS duration_minutes INTEGER`);
        console.log('✅ Columnas verificadas\n');

        // 4. Mostrar todos los templates
        const result = await client.query('SELECT * FROM checklist_templates ORDER BY display_order');
        console.log('📋 Checklist Templates creados:');
        result.rows.forEach(r => {
            console.log(`  ${r.display_order}. [${r.is_required ? 'REQ' : 'OPT'}] ${r.name}`);
        });

        console.log('\n✅ Done!');

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

main();
