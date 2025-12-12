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

        // Crear tabla moto_transfers
        console.log('🔄 Creating moto_transfers table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS moto_transfers (
        id SERIAL PRIMARY KEY,
        moto_id INTEGER REFERENCES motos(id),
        from_branch_id INTEGER REFERENCES branches(id),
        to_branch_id INTEGER REFERENCES branches(id),
        reason TEXT,
        transfer_type VARCHAR(50) DEFAULT 'permanent',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        ended_at TIMESTAMP,
        status VARCHAR(50) DEFAULT 'active',
        created_by INTEGER,
        notes TEXT
      )
    `);
        console.log('✅ moto_transfers table created\n');

        // Verificar
        const result = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'moto_transfers'
    `);
        console.log('Table exists:', result.rows.length > 0);

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

main();
