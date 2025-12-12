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

        // 1. Add current_branch_id to motos
        console.log('🔄 Adding current_branch_id to motos...');
        await client.query(`ALTER TABLE motos ADD COLUMN IF NOT EXISTS current_branch_id INTEGER`);
        await client.query(`ALTER TABLE motos ADD COLUMN IF NOT EXISTS original_branch_id INTEGER`);
        console.log('✅ current_branch_id and original_branch_id added to motos\n');

        // 2. Add branch to orders
        console.log('🔄 Adding branch column to orders...');
        await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch INTEGER`);
        await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id INTEGER`);
        console.log('✅ branch columns added to orders\n');

        // Verify motos columns
        const motosColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'motos'
      ORDER BY ordinal_position
    `);
        console.log('📋 Motos table columns:');
        motosColumns.rows.forEach(col => console.log(`  - ${col.column_name}: ${col.data_type}`));

        // Verify orders columns
        const ordersColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'orders'
      ORDER BY ordinal_position
    `);
        console.log('\n📋 Orders table columns:');
        ordersColumns.rows.forEach(col => console.log(`  - ${col.column_name}: ${col.data_type}`));

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

main();
