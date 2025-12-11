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

        // 1. Drop old constraint and add new one with superadmin
        console.log('🔄 Updating role constraint...');
        await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
        await client.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('superadmin', 'admin', 'manager', 'supervisor', 'coordinator', 'analyst', 'operator', 'driver', 'client'))`);
        console.log('✅ Role constraint updated');

        // 2. Add missing columns
        console.log('🔄 Adding missing columns...');
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id INTEGER`);
        console.log('✅ Columns added');

        // 3. Generate bcrypt hash for Diego1989r$
        // Using the same salt format as the existing hashes
        // This is a valid bcrypt hash for 'Diego1989r$'
        const bcrypt = require('bcryptjs');
        const passwordHash = await bcrypt.hash('Diego1989r$', 10);
        console.log('🔐 Password hash generated');

        // 4. Insert superadmin
        console.log('🔄 Creating superadmin...');
        const result = await client.query(`
      INSERT INTO users (name, email, password_hash, role, active)
      VALUES ('Super Admin', 'superadmin@logitrack.com', $1, 'superadmin', true)
      ON CONFLICT (email) DO UPDATE SET
        name = 'Super Admin',
        password_hash = EXCLUDED.password_hash,
        role = 'superadmin',
        active = true
      RETURNING id, email, role
    `, [passwordHash]);

        console.log('✅ Superadmin created:', result.rows[0]);

        // 5. Verify
        const users = await client.query('SELECT id, email, role, active FROM users ORDER BY id');
        console.log('\n📋 All users:');
        users.rows.forEach(u => console.log(`  - ${u.id}: ${u.email} (${u.role}) active=${u.active}`));

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

main();
