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
      const rawToken = res.data.token;
      setToken(rawToken);
      localStorage.setItem('token', rawToken);
      const claims = decodeToken(rawToken);
      if (claims) {
        setUser({ id: claims.user_id, email, role: claims.role });
      } else {
        setUser({ email, role: 'supervisor' });
      }
      return true;
    } catch (err) {
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
  };

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
