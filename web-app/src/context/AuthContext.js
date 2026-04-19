import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { AUTH_API_BASE_URL } from '../config/api';

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
      // El API devuelve access_token y user (no solo token)
      const rawToken = res.data.access_token || res.data.token;
      const userData = res.data.user;

      setToken(rawToken);
      localStorage.setItem('token', rawToken);

      // Usar datos del user si existe, sino decodificar token
      if (userData && userData.role) {
        setUser({
          id: userData.id,
          email: userData.email,
          name: userData.name,
          role: userData.role
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

  // ── Interceptor global (se re-registra cada vez que cambia el token) ──
  useEffect(() => {
    const reqId = axios.interceptors.request.use((config) => {
      const t = localStorage.getItem('token');
      if (t) config.headers['Authorization'] = `Bearer ${t}`;
      return config;
    });

    const resId = axios.interceptors.response.use(
      (res) => res,
      (error) => {
        const isLogin = error.config?.url?.includes('/auth/login');
        if (error.response?.status === 401 && !isLogin) {
          localStorage.removeItem('token');
          window.location.href = '/';
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(reqId);
      axios.interceptors.response.eject(resId);
    };
  }, [token]);

  useEffect(() => {
    if (token && !user) {
      const claims = decodeToken(token);
      if (claims) {
        setUser({ id: claims.user_id, role: claims.role });
      }
    }
  }, [token, user]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
