import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import axios from 'axios';
import Navbar from './components/Navbar';
import SupervisorDashboard from './components/SupervisorDashboard';
import AdminMotos from './components/AdminMotos';
import DriverDashboard from './components/DriverDashboard';
import DriverShiftPanel from './components/DriverShiftPanel';
import UsersManagement from './components/UsersManagement';
import MotoProfile from './components/MotoProfile';
import Login from './components/Login';
import './styles.css';

// Axios interceptor to include token
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}

function DriverRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'driver') return <Navigate to="/dashboard" replace />;
  return children;
}

function AppLayout({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const showNavbar = user && location.pathname !== '/login';

  return (
    <>
      {showNavbar && <Navbar />}
      {children}
    </>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <SupervisorDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminMotos />
          </AdminRoute>
        }
      />
      <Route
        path="/users"
        element={
          <AdminRoute>
            <UsersManagement />
          </AdminRoute>
        }
      />
      <Route
        path="/motos/:id"
        element={
          <AdminRoute>
            <MotoProfile />
          </AdminRoute>
        }
      />
      <Route
        path="/driver"
        element={
          <DriverRoute>
            <DriverDashboard />
          </DriverRoute>
        }
      />
      <Route
        path="/driver/shift"
        element={
          <DriverRoute>
            <DriverShiftPanel 
              driverId={user?.id} 
              driverName={user?.name}
              branch={user?.branch}
            />
          </DriverRoute>
        }
      />
      <Route
        path="/"
        element={
          user ? (
            user.role === 'driver' ? (
              <Navigate to="/driver" replace />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppLayout>
          <AppRoutes />
        </AppLayout>
      </Router>
    </AuthProvider>
  );
}

export default App;
