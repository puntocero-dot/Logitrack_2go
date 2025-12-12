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

        // 1. coordinator_visits - add check_in_latitude
        console.log('Adding check_in columns to coordinator_visits...');
        await client.query('ALTER TABLE coordinator_visits ADD COLUMN IF NOT EXISTS check_in_latitude DOUBLE PRECISION');
        await client.query('ALTER TABLE coordinator_visits ADD COLUMN IF NOT EXISTS check_in_longitude DOUBLE PRECISION');
        await client.query('ALTER TABLE coordinator_visits ADD COLUMN IF NOT EXISTS check_out_latitude DOUBLE PRECISION');
        await client.query('ALTER TABLE coordinator_visits ADD COLUMN IF NOT EXISTS check_out_longitude DOUBLE PRECISION');
        console.log('✅ check_in/out columns added\n');

        // 2. checklist_templates - add is_required
        console.log('Adding is_required to checklist_templates...');
        await client.query('ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT false');
        console.log('✅ is_required added\n');

        // 3. Add branch_id to kpis
        console.log('Adding branch_id to kpis...');
        await client.query('ALTER TABLE kpis ADD COLUMN IF NOT EXISTS branch_id INTEGER');
        console.log('✅ branch_id added to kpis\n');

        console.log('✅ Done!');

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

main();
