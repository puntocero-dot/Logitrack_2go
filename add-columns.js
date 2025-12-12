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
        console.log('✅ Connected\n');

        // 1. Add coordinator_id to coordinator_visits
        console.log('Adding coordinator_id...');
        await client.query('ALTER TABLE coordinator_visits ADD COLUMN IF NOT EXISTS coordinator_id INTEGER');
        console.log('✅ coordinator_id added\n');

        // 2. Add category to checklist_templates
        console.log('Adding category...');
        await client.query('ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS category VARCHAR(100)');
        console.log('✅ category added\n');

        // 3. Verify kpis table
        console.log('Checking kpis table...');
        const kpisCols = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'kpis' ORDER BY ordinal_position
    `);
        console.log('KPIs columns:');
        kpisCols.rows.forEach(r => console.log(`  - ${r.column_name}: ${r.data_type}`));

        // 4. Verify branches table has branch_id column
        console.log('\nChecking branches table...');
        const branchesCols = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'branches' ORDER BY ordinal_position
    `);
        console.log('Branches columns:');
        branchesCols.rows.forEach(r => console.log(`  - ${r.column_name}: ${r.data_type}`));

        console.log('\n✅ Done!');

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

main();
