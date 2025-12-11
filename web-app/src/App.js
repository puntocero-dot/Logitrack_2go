import React from 'react';
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
import CoordinatorDashboard from './components/CoordinatorDashboard';
import ManagerDashboard from './components/ManagerDashboard';
import MotoTransfers from './components/MotoTransfers';
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

// Nueva ruta para roles con acceso a funciones específicas
function RoleRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to="/dashboard" replace />;
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

  // Determinar ruta inicial según rol
  const getHomeRoute = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'admin':
        return '/dashboard';
      case 'manager':
        return '/manager';
      case 'coordinator':
        return '/coordinator';
      case 'supervisor':
        return '/dashboard';
      case 'analyst':
        return '/manager'; // Analistas ven el dashboard gerencial
      case 'driver':
        return '/driver';
      default:
        return '/dashboard';
    }
  };

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Dashboard Supervisor (acceso: admin, supervisor, manager) */}
      <Route
        path="/dashboard"
        element={
          <RoleRoute allowedRoles={['admin', 'supervisor', 'manager', 'analyst']}>
            <SupervisorDashboard />
          </RoleRoute>
        }
      />

      {/* Dashboard Gerencial (acceso: admin, manager, analyst) */}
      <Route
        path="/manager"
        element={
          <RoleRoute allowedRoles={['admin', 'manager', 'analyst']}>
            <ManagerDashboard />
          </RoleRoute>
        }
      />

      {/* Dashboard Coordinador (acceso: admin, coordinator, manager) */}
      <Route
        path="/coordinator"
        element={
          <RoleRoute allowedRoles={['admin', 'coordinator', 'manager']}>
            <CoordinatorDashboard />
          </RoleRoute>
        }
      />

      {/* Admin Motos */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminMotos />
          </AdminRoute>
        }
      />

      {/* Transferencias de Motos */}
      <Route
        path="/transfers"
        element={
          <RoleRoute allowedRoles={['admin', 'supervisor', 'manager']}>
            <MotoTransfers />
          </RoleRoute>
        }
      />

      {/* Gestión de Usuarios */}
      <Route
        path="/users"
        element={
          <AdminRoute>
            <UsersManagement />
          </AdminRoute>
        }
      />

      {/* Perfil de Moto */}
      <Route
        path="/motos/:id"
        element={
          <RoleRoute allowedRoles={['admin', 'supervisor', 'manager']}>
            <MotoProfile />
          </RoleRoute>
        }
      />

      {/* Driver Dashboard */}
      <Route
        path="/driver"
        element={
          <DriverRoute>
            <DriverDashboard />
          </DriverRoute>
        }
      />

      {/* Driver Shift Panel */}
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

      {/* Ruta raíz - redirige según rol */}
      <Route
        path="/"
        element={<Navigate to={getHomeRoute()} replace />}
      />

      {/* Ruta 404 - redirige al home */}
      <Route
        path="*"
        element={<Navigate to={getHomeRoute()} replace />}
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
