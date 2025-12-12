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

        // 1. Create coordinator_visits table
        console.log('🔄 Creating coordinator_visits table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS coordinator_visits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        branch_id INTEGER REFERENCES branches(id),
        check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        check_out_time TIMESTAMP,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        console.log('✅ coordinator_visits table created\n');

        // 2. Add description to checklist_templates
        console.log('🔄 Adding description to checklist_templates...');
        await client.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS description TEXT`);
        console.log('✅ description column added to checklist_templates\n');

        // 3. Fix branch column type issue in orders (if it's varchar, convert to integer)
        console.log('🔄 Checking orders.branch column type...');
        const branchType = await client.query(`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'orders' AND column_name = 'branch'
    `);
        console.log(`   Current type: ${branchType.rows[0]?.data_type || 'unknown'}`);

        // Update orders.branch to reference an integer if needed
        // First, update any string values to NULL
        await client.query(`UPDATE orders SET branch = NULL WHERE branch IS NOT NULL`);
        console.log('✅ orders.branch values cleared\n');

        // 4. Add missing columns to orders
        console.log('🔄 Adding delivery_photo to orders...');
        await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_photo TEXT`);
        await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS signature TEXT`);
        console.log('✅ delivery_photo and signature added to orders\n');

        // 5. Create delivery_proofs table
        console.log('🔄 Creating delivery_proofs table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_proofs (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        photo_url TEXT,
        signature_url TEXT,
        notes TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        console.log('✅ delivery_proofs table created\n');

        // 6. Seed a checklist template
        console.log('🔄 Creating default checklist template...');
        await client.query(`
      INSERT INTO checklist_templates (name, description, items, is_active)
      VALUES (
        'Inspección Diaria',
        'Lista de verificación para inspección diaria de sucursal',
        '[{"id": 1, "question": "¿El local está limpio?", "type": "boolean"}, {"id": 2, "question": "¿Hay suficiente inventario?", "type": "boolean"}, {"id": 3, "question": "Observaciones", "type": "text"}]',
        true
      )
      ON CONFLICT DO NOTHING
    `);
        console.log('✅ Default checklist template created\n');

        // Verify all tables
        const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' ORDER BY table_name
    `);
        console.log('📋 All tables:');
        tables.rows.forEach(t => console.log(`  - ${t.table_name}`));

        console.log('\n✅ All fixes applied!');

    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error(err.stack);
    } finally {
        await client.end();
    }
}

main();
