import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Sidebar = ({ mobileOpen = false, onMobileClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    if (onMobileClose) onMobileClose();
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  const getNavLinks = () => {
    const links = [];
    const role = user?.role;

    if (role === 'superadmin') {
      links.push({ path: '/dashboard',   label: 'Dashboard',       icon: '📊' });
      links.push({ path: '/map',         label: 'Mapa en Vivo',    icon: '🗺️' });
      links.push({ path: '/analytics',   label: 'Analytics',       icon: '📉' });
      links.push({ path: '/manager',     label: 'Gerencial',       icon: '📈' });
      links.push({ path: '/coordinator', label: 'Coordinador',     icon: '📋' });
      links.push({ path: '/transfers',   label: 'Transferencias',  icon: '🔄' });
      links.push({ path: '/admin',       label: 'Motos',           icon: '🏍️' });
      links.push({ path: '/branches',    label: 'Sucursales',      icon: '🏢' });
      links.push({ path: '/users',       label: 'Usuarios',        icon: '👥' });
    } else if (role === 'admin') {
      links.push({ path: '/dashboard',   label: 'Dashboard',       icon: '📊' });
      links.push({ path: '/map',         label: 'Mapa en Vivo',    icon: '🗺️' });
      links.push({ path: '/analytics',   label: 'Analytics',       icon: '📉' });
      links.push({ path: '/reports',     label: 'Reportes',        icon: '📋' });
      links.push({ path: '/manager',     label: 'Gerencial',       icon: '📈' });
      links.push({ path: '/coordinator', label: 'Coordinador',     icon: '👷' });
      links.push({ path: '/transfers',   label: 'Transferencias',  icon: '🔄' });
      links.push({ path: '/admin',       label: 'Motos',           icon: '🏍️' });
      links.push({ path: '/users',       label: 'Usuarios',        icon: '👥' });
    } else if (role === 'manager') {
      links.push({ path: '/manager',     label: 'Gerencial',       icon: '📈' });
      links.push({ path: '/analytics',   label: 'Analytics',       icon: '📉' });
      links.push({ path: '/reports',     label: 'Reportes',        icon: '📋' });
      links.push({ path: '/map',         label: 'Mapa en Vivo',    icon: '🗺️' });
      links.push({ path: '/dashboard',   label: 'Operaciones',     icon: '📊' });
      links.push({ path: '/transfers',   label: 'Transferencias',  icon: '🔄' });
      links.push({ path: '/coordinator', label: 'Visitas',         icon: '📋' });
    } else if (role === 'coordinator') {
      links.push({ path: '/coordinator', label: 'Mis Visitas',     icon: '📋' });
    } else if (role === 'supervisor') {
      links.push({ path: '/dashboard',   label: 'Dashboard',       icon: '📊' });
      links.push({ path: '/map',         label: 'Mapa en Vivo',    icon: '🗺️' });
      links.push({ path: '/analytics',   label: 'Analytics',       icon: '📉' });
      links.push({ path: '/reports',     label: 'Reportes',        icon: '📋' });
      links.push({ path: '/transfers',   label: 'Transferencias',  icon: '🔄' });
    } else if (role === 'analyst') {
      links.push({ path: '/reports',     label: 'Reportes',        icon: '📋' });
      links.push({ path: '/analytics',   label: 'Analytics',       icon: '📉' });
      links.push({ path: '/manager',     label: 'Métricas',        icon: '📈' });
      links.push({ path: '/map',         label: 'Mapa en Vivo',    icon: '🗺️' });
      links.push({ path: '/dashboard',   label: 'Operaciones',     icon: '📊' });
    } else if (role === 'driver') {
      links.push({ path: '/driver',      label: 'Mis Pedidos',     icon: '📦' });
    }

    return links;
  };

  const initials = (user?.name || user?.email || '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const roleLabel = {
    superadmin: 'Super Admin',
    admin: 'Admin',
    manager: 'Gerente',
    coordinator: 'Coordinador',
    supervisor: 'Supervisor',
    analyst: 'Analista',
    driver: 'Conductor',
  }[user?.role] || user?.role;

  const handleNavClick = (path) => {
    navigate(path);
    if (onMobileClose) onMobileClose();
  };

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${mobileOpen ? 'sidebar--mobile-open' : ''}`}>
      {/* Brand */}
      <div className="sidebar__brand">
        <span className="sidebar__brand-icon">🚚</span>
        {!collapsed && <span className="sidebar__brand-name">Logitrack</span>}
        <button
          className="sidebar__collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar__nav">
        {getNavLinks().map(link => (
          <button
            key={link.path}
            className={`sidebar__nav-item ${isActive(link.path) ? 'sidebar__nav-item--active' : ''}`}
            onClick={() => handleNavClick(link.path)}
            title={collapsed ? link.label : undefined}
          >
            <span className="sidebar__nav-icon">{link.icon}</span>
            {!collapsed && <span className="sidebar__nav-label">{link.label}</span>}
          </button>
        ))}
      </nav>

      {/* Footer: user info + logout */}
      <div className="sidebar__footer">
        <div className="sidebar__user">
          <div className="sidebar__avatar">{initials}</div>
          {!collapsed && (
            <div className="sidebar__user-info">
              <div className="sidebar__user-name">{user?.name || user?.email}</div>
              <div className="sidebar__user-role">{roleLabel}</div>
            </div>
          )}
        </div>
        <button
          className="sidebar__logout"
          onClick={handleLogout}
          title="Cerrar sesión"
        >
          <span className="sidebar__nav-icon">🚪</span>
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
