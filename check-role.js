const { Client } = require('pg');
const c = new Client({
    host: 'ballast.proxy.rlwy.net',
    port: 29198,
    user: 'postgres',
    password: 'MnYbJdUfIxkThIHDNhoKATYyNBewRJTf',
    database: 'railway',
    ssl: { rejectUnauthorized: false }
});

c.connect()
    .then(() => c.query("SELECT id, email, role FROM users WHERE email = 'superadmin@logitrack.com'"))
    .then(r => {
        console.log('DB Role:', r.rows[0]);
        c.end();
    });
