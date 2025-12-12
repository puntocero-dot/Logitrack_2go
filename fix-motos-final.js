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

        // Add all missing columns to motos
        console.log('🔄 Adding missing columns to motos...');
        await client.query(`ALTER TABLE motos ADD COLUMN IF NOT EXISTS max_orders_capacity INTEGER DEFAULT 5`);
        await client.query(`ALTER TABLE motos ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true`);
        await client.query(`ALTER TABLE motos ADD COLUMN IF NOT EXISTS model VARCHAR(100)`);
        await client.query(`ALTER TABLE motos ADD COLUMN IF NOT EXISTS year INTEGER`);
        await client.query(`ALTER TABLE motos ADD COLUMN IF NOT EXISTS color VARCHAR(50)`);
        await client.query(`ALTER TABLE motos ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`);
        await client.query(`ALTER TABLE motos ADD COLUMN IF NOT EXISTS transfer_expires_at TIMESTAMP`);
        console.log('✅ All missing columns added to motos\n');

        console.log('Done!');

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

main();
