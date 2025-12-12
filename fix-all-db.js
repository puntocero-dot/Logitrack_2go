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

        // 1. Add branch_id to motos
        console.log('🔄 Adding branch_id to motos...');
        await client.query(`ALTER TABLE motos ADD COLUMN IF NOT EXISTS branch_id INTEGER`);
        console.log('✅ branch_id added to motos\n');

        // 2. Add client_email to orders
        console.log('🔄 Adding client_email to orders...');
        await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_email VARCHAR(255)`);
        await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_name VARCHAR(255)`);
        console.log('✅ client_email and client_name added to orders\n');

        // 3. Create branches table
        console.log('🔄 Creating branches table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        address TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        radius_km DOUBLE PRECISION DEFAULT 10,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        console.log('✅ branches table created\n');

        // 4. Create transfer_history table
        console.log('🔄 Creating transfer_history table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS transfer_history (
        id SERIAL PRIMARY KEY,
        moto_id INTEGER REFERENCES motos(id),
        from_branch_id INTEGER,
        to_branch_id INTEGER,
        reason TEXT,
        transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
      )
    `);
        console.log('✅ transfer_history table created\n');

        // 5. Create visits table
        console.log('🔄 Creating visits table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS visits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        branch_id INTEGER REFERENCES branches(id),
        check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        check_out_time TIMESTAMP,
        notes TEXT
      )
    `);
        console.log('✅ visits table created\n');

        // 6. Create checklist_templates table
        console.log('🔄 Creating checklist_templates table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS checklist_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        items JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        console.log('✅ checklist_templates table created\n');

        // 7. Create checklist_responses table
        console.log('🔄 Creating checklist_responses table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS checklist_responses (
        id SERIAL PRIMARY KEY,
        visit_id INTEGER REFERENCES visits(id),
        template_id INTEGER REFERENCES checklist_templates(id),
        responses JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        console.log('✅ checklist_responses table created\n');

        // 8. Seed a default branch
        console.log('🔄 Creating default branch...');
        await client.query(`
      INSERT INTO branches (name, code, address, latitude, longitude, is_active)
      VALUES ('Sucursal Principal', 'MAIN', 'Dirección Principal, Ciudad', 14.6349, -90.5069, true)
      ON CONFLICT (code) DO NOTHING
    `);
        console.log('✅ Default branch created\n');

        // Verify tables
        const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
        console.log('📋 All tables in database:');
        tables.rows.forEach(t => console.log(`  - ${t.table_name}`));

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

main();
