export const GATEWAY_API_BASE_URL = process.env.REACT_APP_GATEWAY_URL || 'http://localhost:8085';

// API URLs (sin prefijos duplicados)
// AUTH_API_BASE_URL: solo para login (/auth/login)
export const AUTH_API_BASE_URL = `${GATEWAY_API_BASE_URL}/auth`;
// USER_API_BASE_URL: CRUD de usuarios directo en el gateway (/users)
export const USER_API_BASE_URL = GATEWAY_API_BASE_URL;
// ORDER_API_BASE_URL: pedidos, motos, optimización, kpis
export const ORDER_API_BASE_URL = GATEWAY_API_BASE_URL;  // Sin /orders prefix
export const GEO_API_BASE_URL = `${GATEWAY_API_BASE_URL}/geo`;
export const AI_API_BASE_URL = `${GATEWAY_API_BASE_URL}/ai`;
