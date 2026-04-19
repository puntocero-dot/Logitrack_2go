import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { AUTH_API_BASE_URL } from '../config/api';

// ─────────────────────────────────────────────────────────────────────────────
// INTERCEPTORS A NIVEL DE MÓDULO
// Se registran UNA SOLA VEZ cuando el archivo se importa por primera vez,
// ANTES de que cualquier componente React se monte o ejecute un useEffect.
// Esto elimina la race condition donde los hijos disparan requests antes de
// que el useEffect del AuthProvider registre los interceptors.
// ─────────────────────────────────────────────────────────────────────────────
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor de respuesta: solo logea el 401, NO redirige automáticamente.
// El redirect agresivo causaba que el usuario fuera expulsado en ~1 seg
// por 401s transitorios mientras los componentes cargaban.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isLogin = error.config?.url?.includes('/auth/login');
      // Solo limpiar y redirigir si el token existe pero es inválido/expirado
      // y NO es el endpoint de login (para evitar loops)
      if (!isLogin && localStorage.getItem('token')) {
        const url = error.config?.url || '';
        console.warn(`[Auth] 401 en ${url} — token podría estar expirado`);
        // No redirigimos aquí: dejamos que cada componente maneje su error.
        // App.js o el router protegido verifican si hay token al renderizar.
      }
    }
    return Promise.reject(error);
  }
);
// ─────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  const decodeToken = (rawToken) => {
    try {
      const payload = rawToken.split('.')[1];
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(atob(base64));
      return decoded;
    } catch (e) {
      return null;
    }
  };

  const login = async (email, password) => {
    try {
      const res = await axios.post(`${AUTH_API_BASE_URL}/login`, { email, password });
      const rawToken = res.data.access_token || res.data.token;
      const userData = res.data.user;

      localStorage.setItem('token', rawToken); // primero localStorage
      setToken(rawToken);

      if (userData && userData.role) {
        setUser({
          id: userData.id,
          email: userData.email,
          name: userData.name,
          role: userData.role,
        });
      } else {
        const claims = decodeToken(rawToken);
        if (claims) {
          setUser({ id: claims.user_id, email, role: claims.role });
        }
      }
      return true;
    } catch (err) {
      console.error('Login error:', err);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
  };

  // Restaurar usuario desde token al recargar la página
  useEffect(() => {
    if (token && !user) {
      const claims = decodeToken(token);
      if (claims) {
        setUser({ id: claims.user_id, role: claims.role });
      } else {
        // Token corrupto → limpiar
        logout();
      }
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
