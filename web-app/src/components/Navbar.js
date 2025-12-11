import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  const getNavLinks = () => {
    const links = [];
    const role = user?.role;

    // Admin: acceso total
    if (role === 'admin') {
      links.push({ path: '/dashboard', label: '📊 Dashboard', icon: '📊' });
      links.push({ path: '/map', label: '🗺️ Mapa', icon: '🗺️' });
      links.push({ path: '/analytics', label: '📉 Analytics', icon: '📉' });
      links.push({ path: '/manager', label: '📈 Gerencial', icon: '📈' });
      links.push({ path: '/coordinator', label: '📋 Coordinador', icon: '📋' });
      links.push({ path: '/transfers', label: '🔄 Transferencias', icon: '🔄' });
      links.push({ path: '/admin', label: '🏍️ Motos', icon: '🏍️' });
      links.push({ path: '/users', label: '👥 Usuarios', icon: '👥' });
      links.push({ path: window.location.origin + '/docs/index.html', label: '📄 Docs', icon: '📄', external: true });
    }
    // Manager: vista gerencial + supervisor
    else if (role === 'manager') {
      links.push({ path: '/manager', label: '📈 Gerencial', icon: '📈' });
      links.push({ path: '/analytics', label: '📉 Analytics', icon: '📉' });
      links.push({ path: '/map', label: '🗺️ Mapa', icon: '🗺️' });
      links.push({ path: '/dashboard', label: '📊 Operaciones', icon: '📊' });
      links.push({ path: '/transfers', label: '🔄 Transferencias', icon: '🔄' });
      links.push({ path: '/coordinator', label: '📋 Visitas', icon: '📋' });
    }
    // Coordinator: check-in y checklist
    else if (role === 'coordinator') {
      links.push({ path: '/coordinator', label: '📋 Mis Visitas', icon: '📋' });
    }
    // Supervisor: operaciones
    else if (role === 'supervisor') {
      links.push({ path: '/dashboard', label: '📊 Dashboard', icon: '📊' });
      links.push({ path: '/map', label: '🗺️ Mapa', icon: '🗺️' });
      links.push({ path: '/analytics', label: '📉 Analytics', icon: '📉' });
      links.push({ path: '/transfers', label: '🔄 Transferencias', icon: '🔄' });
      links.push({ path: window.location.origin + '/docs/index.html', label: '📄 Docs', icon: '📄', external: true });
    }
    // Analyst: reportes
    else if (role === 'analyst') {
      links.push({ path: '/analytics', label: '📉 Analytics', icon: '📉' });
      links.push({ path: '/manager', label: '📈 Métricas', icon: '📈' });
      links.push({ path: '/map', label: '🗺️ Mapa', icon: '🗺️' });
      links.push({ path: '/dashboard', label: '📊 Operaciones', icon: '📊' });
    }
    // Driver: entregas
    else if (role === 'driver') {
      links.push({ path: '/driver', label: '📦 Mis Pedidos', icon: '📦' });
    }

    return links;
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <span className="brand-text">Logitrack</span>
        </div>

        <div className="navbar-menu">
          {getNavLinks().map(link => (
            link.external ? (
              <a
                key={link.path}
                href={link.path}
                className="nav-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ) : (
              <button
                key={link.path}
                className={`nav-link ${isActive(link.path) ? 'active' : ''}`}
                onClick={() => navigate(link.path)}
              >
                {link.label}
              </button>
            )
          ))}
        </div>

        <div className="navbar-actions">
          <span className="user-info">
            {user?.email} ({user?.role})
          </span>
          <button className="logout-btn" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>

        <div className="navbar-toggle">
          <input type="checkbox" id="navbar-toggle-checkbox" />
          <label htmlFor="navbar-toggle-checkbox" className="navbar-toggle-label">
            <span></span>
          </label>
          <div className="navbar-menu-mobile">
            {getNavLinks().map(link => (
              <button
                key={link.path}
                className={`nav-link ${isActive(link.path) ? 'active' : ''}`}
                onClick={() => {
                  navigate(link.path);
                  document.getElementById('navbar-toggle-checkbox').checked = false;
                }}
              >
                {link.label}
              </button>
            ))}
            <button className="logout-btn" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .navbar {
          background: #001940;
          padding: 0 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .navbar-container {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 64px;
        }

        .navbar-brand {
          flex-shrink: 0;
        }

        .brand-text {
          color: #ffffff;
          font-size: 1.5rem;
          font-weight: 700;
        }

        .navbar-menu {
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .nav-link {
          background: transparent;
          border: none;
          color: #e5e5e5;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 1rem;
          transition: background-color 0.2s;
        }

        .nav-link:hover {
          background-color: rgba(255, 255, 255, 0.1);
        }

        .nav-link.active {
          background-color: #3b82f6;
          color: #ffffff;
        }

        .navbar-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .user-info {
          color: #9ca3af;
          font-size: 0.875rem;
        }

        .logout-btn {
          background: #ef4444;
          border: none;
          color: #ffffff;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.875rem;
          transition: background-color 0.2s;
        }

        .logout-btn:hover {
          background-color: #dc2626;
        }

        .navbar-toggle {
          display: none;
          position: relative;
        }

        #navbar-toggle-checkbox {
          display: none;
        }

        .navbar-toggle-label {
          display: flex;
          flex-direction: column;
          cursor: pointer;
        }

        .navbar-toggle-label span {
          width: 24px;
          height: 2px;
          background: #ffffff;
          margin: 3px 0;
          transition: 0.3s;
        }

        #navbar-toggle-checkbox:checked ~ .navbar-toggle-label span:nth-child(1) {
          transform: rotate(45deg) translate(5px, 5px);
        }

        #navbar-toggle-checkbox:checked ~ .navbar-toggle-label span:nth-child(2) {
          opacity: 0;
        }

        #navbar-toggle-checkbox:checked ~ .navbar-toggle-label span:nth-child(3) {
          transform: rotate(-45deg) translate(7px, -6px);
        }

        .navbar-menu-mobile {
          display: none;
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #001940;
          flex-direction: column;
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        }

        #navbar-toggle-checkbox:checked ~ .navbar-menu-mobile {
          display: flex;
        }

        @media (max-width: 768px) {
          .navbar-menu,
          .navbar-actions {
            display: none;
          }

          .navbar-toggle {
            display: block;
          }
        }
      `}</style>
    </nav>
  );
};

export default Navbar;
