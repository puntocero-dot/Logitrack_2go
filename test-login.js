// Test login para verificar qué rol devuelve
const axios = require('axios');

async function testLogin() {
    try {
        const response = await axios.post('https://api-gateway-production-ad21.up.railway.app/auth/login', {
            email: 'superadmin@logitrack.com',
            password: 'Diego1989r$'
        });

        console.log('Login Response:');
        console.log('User:', response.data.user);
        console.log('Role:', response.data.user?.role);

        // Decode JWT
        const token = response.data.access_token;
        const parts = token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        console.log('\nJWT Payload:', payload);

    } catch (err) {
        console.error('Error:', err.response?.data || err.message);
    }
}

testLogin();
