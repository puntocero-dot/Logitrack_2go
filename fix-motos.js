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
        console.log('✅ Connected to Railway Postgres');

        // Add latitude column to motos if it doesn't exist
        console.log('🔄 Adding latitude column to motos...');
        await client.query(`ALTER TABLE motos ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION`);
        await client.query(`ALTER TABLE motos ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`);
        console.log('✅ Latitude/Longitude columns added to motos');

        // Verify the table structure
        const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'motos'
      ORDER BY ordinal_position
    `);
        console.log('\n📋 Motos table columns:');
        result.rows.forEach(col => console.log(`  - ${col.column_name}: ${col.data_type}`));

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

main();
