import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  const handleNavClick = (path) => {
    navigate(path);
    setMenuOpen(false);
  };

  const getNavLinks = () => {
    const links = [];
    const role = user?.role;

    // Superadmin: acceso total + configuración del sistema
    if (role === 'superadmin') {
      links.push({ path: '/dashboard', label: 'Dashboard', icon: '📊' });
      links.push({ path: '/map', label: 'Mapa', icon: '🗺️' });
      links.push({ path: '/analytics', label: 'Analytics', icon: '📉' });
      links.push({ path: '/manager', label: 'Gerencial', icon: '📈' });
      links.push({ path: '/coordinator', label: 'Coordinador', icon: '📋' });
      links.push({ path: '/transfers', label: 'Transferencias', icon: '🔄' });
      links.push({ path: '/admin', label: 'Motos', icon: '🏍️' });
      links.push({ path: '/branches', label: 'Sucursales', icon: '🏢' });
      links.push({ path: '/users', label: 'Usuarios', icon: '👥' });
      links.push({ path: window.location.origin + '/docs/index.html', label: 'Docs', icon: '📄', external: true });
    }
    // Admin: acceso total
    else if (role === 'admin') {
      links.push({ path: '/dashboard', label: 'Dashboard', icon: '📊' });
      links.push({ path: '/map', label: 'Mapa', icon: '🗺️' });
      links.push({ path: '/analytics', label: 'Analytics', icon: '📉' });
      links.push({ path: '/manager', label: 'Gerencial', icon: '📈' });
      links.push({ path: '/coordinator', label: 'Coordinador', icon: '📋' });
      links.push({ path: '/transfers', label: 'Transferencias', icon: '🔄' });
      links.push({ path: '/admin', label: 'Motos', icon: '🏍️' });
      links.push({ path: '/users', label: 'Usuarios', icon: '👥' });
      links.push({ path: window.location.origin + '/docs/index.html', label: 'Docs', icon: '📄', external: true });
    }
    // Manager: vista gerencial + supervisor
    else if (role === 'manager') {
      links.push({ path: '/manager', label: 'Gerencial', icon: '📈' });
      links.push({ path: '/analytics', label: 'Analytics', icon: '📉' });
      links.push({ path: '/map', label: 'Mapa', icon: '🗺️' });
      links.push({ path: '/dashboard', label: 'Operaciones', icon: '📊' });
      links.push({ path: '/transfers', label: 'Transferencias', icon: '🔄' });
      links.push({ path: '/coordinator', label: 'Visitas', icon: '📋' });
    }
    // Coordinator: check-in y checklist
    else if (role === 'coordinator') {
      links.push({ path: '/coordinator', label: 'Mis Visitas', icon: '📋' });
    }
    // Supervisor: operaciones
    else if (role === 'supervisor') {
      links.push({ path: '/dashboard', label: 'Dashboard', icon: '📊' });
      links.push({ path: '/map', label: 'Mapa', icon: '🗺️' });
      links.push({ path: '/analytics', label: 'Analytics', icon: '📉' });
      links.push({ path: '/transfers', label: 'Transferencias', icon: '🔄' });
      links.push({ path: window.location.origin + '/docs/index.html', label: 'Docs', icon: '📄', external: true });
    }
    // Analyst: reportes
    else if (role === 'analyst') {
      links.push({ path: '/analytics', label: 'Analytics', icon: '📉' });
      links.push({ path: '/manager', label: 'Métricas', icon: '📈' });
      links.push({ path: '/map', label: 'Mapa', icon: '🗺️' });
      links.push({ path: '/dashboard', label: 'Operaciones', icon: '📊' });
    }
    // Driver: entregas
    else if (role === 'driver') {
      links.push({ path: '/driver', label: 'Mis Pedidos', icon: '📦' });
    }

    return links;
  };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-container">
          <div className="navbar-brand" onClick={() => handleNavClick('/')}>
            <span className="brand-text">Logitrack</span>
          </div>

          {/* Desktop Menu */}
          <div className="navbar-menu desktop-only">
            {getNavLinks().map(link => (
              link.external ? (
                <a
                  key={link.path}
                  href={link.path}
                  className="nav-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="nav-icon">{link.icon}</span>
                  <span className="nav-label">{link.label}</span>
                </a>
              ) : (
                <button
                  key={link.path}
                  className={`nav-link ${isActive(link.path) ? 'active' : ''}`}
                  onClick={() => handleNavClick(link.path)}
                >
                  <span className="nav-icon">{link.icon}</span>
                  <span className="nav-label">{link.label}</span>
                </button>
              )
            ))}
          </div>

          {/* Desktop User Info */}
          <div className="navbar-actions desktop-only">
            <span className="user-info">
              {user?.email} ({user?.role})
            </span>
            <button className="logout-btn" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </div>

          {/* Mobile Hamburger Button */}
          <button
            className="hamburger-btn mobile-only"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menú"
          >
            <span className={`hamburger-line ${menuOpen ? 'open' : ''}`}></span>
            <span className={`hamburger-line ${menuOpen ? 'open' : ''}`}></span>
            <span className={`hamburger-line ${menuOpen ? 'open' : ''}`}></span>
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {menuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setMenuOpen(false)}>
          <div className="mobile-menu" onClick={(e) => e.stopPropagation()}>
            {/* User Info at top */}
            <div className="mobile-user-info">
              <div className="mobile-user-avatar">
                {user?.name?.charAt(0) || user?.email?.charAt(0) || '?'}
              </div>
              <div className="mobile-user-details">
                <div className="mobile-user-name">{user?.name || user?.email}</div>
                <div className="mobile-user-role">{user?.role}</div>
              </div>
            </div>

            {/* Navigation Links */}
            <div className="mobile-nav-links">
              {getNavLinks().map(link => (
                link.external ? (
                  <a
                    key={link.path}
                    href={link.path}
                    className="mobile-nav-link"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className="mobile-nav-icon">{link.icon}</span>
                    <span className="mobile-nav-label">{link.label}</span>
                  </a>
                ) : (
                  <button
                    key={link.path}
                    className={`mobile-nav-link ${isActive(link.path) ? 'active' : ''}`}
                    onClick={() => handleNavClick(link.path)}
                  >
                    <span className="mobile-nav-icon">{link.icon}</span>
                    <span className="mobile-nav-label">{link.label}</span>
                  </button>
                )
              ))}
            </div>

            {/* Logout Button */}
            <button className="mobile-logout-btn" onClick={handleLogout}>
              🚪 Cerrar sesión
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .navbar {
          background: #001940;
          padding: 0 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .navbar-container {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 60px;
        }

        .navbar-brand {
          flex-shrink: 0;
          cursor: pointer;
        }

        .brand-text {
          color: #ffffff;
          font-size: 1.4rem;
          font-weight: 700;
        }

        /* Desktop Menu */
        .navbar-menu {
          display: flex;
          gap: 4px;
          align-items: center;
          flex-wrap: wrap;
        }

        .nav-link {
          background: transparent;
          border: none;
          color: #e5e5e5;
          padding: 6px 10px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          text-decoration: none;
        }

        .nav-icon {
          font-size: 1.1rem;
        }

        .nav-label {
          font-size: 0.75rem;
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
          font-size: 0.8rem;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .logout-btn {
          background: #ef4444;
          border: none;
          color: #ffffff;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.85rem;
          transition: background-color 0.2s;
        }

        .logout-btn:hover {
          background-color: #dc2626;
        }

        /* Hamburger Button */
        .hamburger-btn {
          display: none;
          flex-direction: column;
          justify-content: space-around;
          width: 40px;
          height: 40px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 8px;
          cursor: pointer;
          padding: 8px;
        }

        .hamburger-line {
          width: 100%;
          height: 3px;
          background: #ffffff;
          border-radius: 2px;
          transition: all 0.3s ease;
        }

        .hamburger-line.open:nth-child(1) {
          transform: rotate(45deg) translate(5px, 5px);
        }

        .hamburger-line.open:nth-child(2) {
          opacity: 0;
        }

        .hamburger-line.open:nth-child(3) {
          transform: rotate(-45deg) translate(5px, -5px);
        }

        /* Mobile Menu Overlay */
        .mobile-menu-overlay {
          position: fixed;
          top: 60px;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          z-index: 99;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .mobile-menu {
          background: #0a1628;
          width: 85%;
          max-width: 320px;
          height: 100%;
          overflow-y: auto;
          padding: 0;
          animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }

        .mobile-user-info {
          background: linear-gradient(135deg, #1e3a5f 0%, #0a1628 100%);
          padding: 24px 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .mobile-user-avatar {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          font-weight: 700;
          color: white;
        }

        .mobile-user-details {
          flex: 1;
          min-width: 0;
        }

        .mobile-user-name {
          color: #fff;
          font-weight: 600;
          font-size: 1rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .mobile-user-role {
          color: #9ca3af;
          font-size: 0.85rem;
          text-transform: capitalize;
        }

        .mobile-nav-links {
          padding: 12px 0;
        }

        .mobile-nav-link {
          display: flex;
          align-items: center;
          gap: 16px;
          width: 100%;
          padding: 16px 24px;
          background: transparent;
          border: none;
          color: #e5e5e5;
          font-size: 1rem;
          cursor: pointer;
          text-align: left;
          text-decoration: none;
          transition: background 0.2s;
        }

        .mobile-nav-link:hover,
        .mobile-nav-link:active {
          background: rgba(255, 255, 255, 0.08);
        }

        .mobile-nav-link.active {
          background: rgba(59, 130, 246, 0.2);
          color: #3b82f6;
          border-left: 3px solid #3b82f6;
        }

        .mobile-nav-icon {
          font-size: 1.5rem;
          width: 32px;
          text-align: center;
        }

        .mobile-nav-label {
          font-size: 1rem;
        }

        .mobile-logout-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: calc(100% - 32px);
          margin: 16px;
          padding: 14px;
          background: #ef4444;
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
        }

        /* Responsive */
        .desktop-only {
          display: flex;
        }

        .mobile-only {
          display: none;
        }

        @media (max-width: 1024px) {
          .desktop-only {
            display: none;
          }

          .mobile-only {
            display: flex;
          }
        }
      `}</style>
    </>
  );
};

export default Navbar;
