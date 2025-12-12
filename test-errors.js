const axios = require('axios');

async function testEndpoints() {
    const BASE_URL = 'https://api-gateway-production-ad21.up.railway.app';

    const endpoints = [
        '/kpis/branches',
        '/visits/active',
        '/checklist/templates',
        '/visits?limit=20',
    ];

    for (const endpoint of endpoints) {
        try {
            console.log(`Testing ${endpoint}...`);
            const res = await axios.get(`${BASE_URL}${endpoint}`, { timeout: 10000 });
            console.log(`  ✅ ${res.status}: ${JSON.stringify(res.data).substring(0, 100)}\n`);
        } catch (err) {
            console.log(`  ❌ ${err.response?.status || 'ERROR'}: ${err.response?.data?.error || err.message}\n`);
        }
    }
}

testEndpoints();
