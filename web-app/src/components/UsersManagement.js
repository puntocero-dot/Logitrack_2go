import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { USER_API_BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';
import './UsersManagement.css';
import BulkUpload from './BulkUpload';

const UsersManagement = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState({ role: '', branch: '', active: '', search: '' });
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'operator',
    branch_id: '',
    active: true,
  });
  const [message, setMessage] = useState({ type: '', text: '' });

  const roles = [
    { value: 'superadmin', label: 'Super Admin', description: 'Control total del sistema' },
    { value: 'admin', label: 'Admin', description: 'Gestión completa' },
    { value: 'manager', label: 'Gerente', description: 'Vista gerencial y reportes' },
    { value: 'supervisor', label: 'Supervisor', description: 'Supervisión de operaciones' },
    { value: 'coordinator', label: 'Coordinador', description: 'Visitas y check-ins' },
    { value: 'analyst', label: 'Analista', description: 'Análisis y reportes' },
    { value: 'operator', label: 'Operador', description: 'Operaciones básicas' },
    { value: 'driver', label: 'Conductor', description: 'Entregas y rutas' },
  ];

  useEffect(() => {
    fetchUsers();
    fetchBranches();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${USER_API_BASE_URL}/users`);
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching users', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      // Branches endpoint is at /branches via the gateway
      const res = await axios.get(`${USER_API_BASE_URL}/branches`);
      setBranches(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching branches', err);
      setBranches([]);
    }
  };

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm({ ...form, [e.target.name]: value });
  };

  const handleFilterChange = (e) => {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  };

  const resetForm = () => {
    setForm({ name: '', email: '', password: '', role: 'operator', branch_id: '', active: true });
    setEditing(null);
    setShowForm(false);
    setMessage({ type: '', text: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    try {
      const payload = {
        name: form.name,
        email: form.email,
        role: form.role,
        branch_id: form.branch_id ? parseInt(form.branch_id) : null,
        active: form.active,
      };

      if (form.password) {
        payload.password = form.password;
      }

      if (editing) {
        await axios.put(`${USER_API_BASE_URL}/users/${editing.id}`, payload);
        setMessage({ type: 'success', text: '✅ Usuario actualizado correctamente.' });
      } else {
        if (!form.password) {
          setMessage({ type: 'error', text: 'La contraseña es requerida para nuevos usuarios.' });
          return;
        }
        payload.password = form.password;
        await axios.post(`${USER_API_BASE_URL}/users`, payload);
        setMessage({ type: 'success', text: '✅ Usuario creado correctamente.' });
      }
      resetForm();
      fetchUsers();
    } catch (err) {
      setMessage({ type: 'error', text: '❌ Error: ' + (err.response?.data?.error || err.message) });
    }
  };

  const handleEdit = (user) => {
    setForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'operator',
      branch_id: user.branch_id || '',
      active: user.active !== false,
    });
    setEditing(user);
    setShowForm(true);
  };

  const handleToggleActive = async (user) => {
    if (user.role === 'superadmin') {
      setMessage({ type: 'error', text: '❌ No se puede desactivar al Super Admin.' });
      return;
    }
    try {
      await axios.put(`${USER_API_BASE_URL}/users/${user.id}`, {
        ...user,
        active: !user.active
      });
      setMessage({ type: 'success', text: `✅ Usuario ${!user.active ? 'activado' : 'desactivado'}.` });
      fetchUsers();
    } catch (err) {
      setMessage({ type: 'error', text: '❌ Error al cambiar estado.' });
    }
  };

  const handleDelete = async (user) => {
    if (user.role === 'superadmin') {
      setMessage({ type: 'error', text: '❌ No se puede eliminar al Super Admin.' });
      return;
    }
    if (!window.confirm(`¿Eliminar permanentemente a ${user.name || user.email}?`)) return;
    try {
      await axios.delete(`${USER_API_BASE_URL}/users/${user.id}`);
      setMessage({ type: 'success', text: '✅ Usuario eliminado.' });
      fetchUsers();
    } catch (err) {
      setMessage({ type: 'error', text: '❌ Error al eliminar.' });
    }
  };

  const getRoleBadgeClass = (role) => {
    const classes = {
      superadmin: 'badge-superadmin',
      admin: 'badge-admin',
      manager: 'badge-manager',
      supervisor: 'badge-supervisor',
      coordinator: 'badge-coordinator',
      analyst: 'badge-analyst',
      operator: 'badge-operator',
      driver: 'badge-driver',
    };
    return `badge-role ${classes[role] || ''}`;
  };

  const filteredUsers = users.filter(user => {
    if (filter.role && user.role !== filter.role) return false;
    if (filter.branch && user.branch_id !== parseInt(filter.branch)) return false;
    if (filter.active === 'true' && !user.active) return false;
    if (filter.active === 'false' && user.active !== false) return false;
    if (filter.search) {
      const search = filter.search.toLowerCase();
      return (user.name?.toLowerCase().includes(search) || user.email?.toLowerCase().includes(search));
    }
    return true;
  });

  // Solo superadmin puede crear otros superadmins
  const availableRoles = currentUser?.role === 'superadmin'
    ? roles
    : roles.filter(r => r.value !== 'superadmin');

  if (loading) {
    return (
      <div className="users-management">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Cargando usuarios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="users-management">
      <div className="users-header">
        <div className="header-content">
          <h1>👥 Gestión de Usuarios</h1>
          <p>Administra usuarios, roles y permisos del sistema</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <BulkUpload
            entityName="usuarios"
            templateColumns={['name', 'email', 'password', 'role', 'branch_id']}
            templateExample={['Juan Pérez', 'juan@email.com', 'password123', 'driver', '1']}
            duplicateKey="email"
            onUpload={async (data) => {
              let success = 0;
              let duplicates = 0;
              const errors = [];
              const existingEmails = users.map(u => u.email?.toLowerCase());

              for (let i = 0; i < data.length; i++) {
                const row = data[i];
                if (existingEmails.includes(row.email?.toLowerCase())) {
                  duplicates++;
                  continue;
                }
                try {
                  await axios.post(`${USER_API_BASE_URL}/register`, {
                    name: row.name,
                    email: row.email,
                    password: row.password || 'Temp123!',
                    role: row.role || 'operator',
                    branch_id: row.branch_id ? parseInt(row.branch_id) : null,
                    active: true
                  });
                  success++;
                } catch (err) {
                  errors.push({ row: i + 2, message: err.response?.data?.error || err.message });
                }
              }
              fetchUsers();
              return { success, duplicates, errors };
            }}
          />
          <button className="btn-add" onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Cerrar' : '+ Nuevo Usuario'}
          </button>
        </div>
      </div>

      {message.text && (
        <div className={`alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Formulario de creación/edición */}
      {showForm && (
        <div className="user-form-card">
          <h3>{editing ? '✏️ Editar Usuario' : '➕ Crear Nuevo Usuario'}</h3>
          <form onSubmit={handleSubmit} className="user-form">
            <div className="form-row">
              <div className="form-group">
                <label>Nombre completo</label>
                <input
                  type="text"
                  name="name"
                  placeholder="Juan Pérez"
                  value={form.name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Correo electrónico</label>
                <input
                  type="email"
                  name="email"
                  placeholder="usuario@ejemplo.com"
                  value={form.email}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>{editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label>
                <input
                  type="password"
                  name="password"
                  placeholder={editing ? 'Dejar en blanco para no cambiar' : 'Contraseña segura'}
                  value={form.password}
                  onChange={handleChange}
                  required={!editing}
                />
              </div>
              <div className="form-group">
                <label>Rol</label>
                <select name="role" value={form.role} onChange={handleChange}>
                  {availableRoles.map(role => (
                    <option key={role.value} value={role.value}>
                      {role.label} - {role.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Sucursal</label>
                <select name="branch_id" value={form.branch_id} onChange={handleChange}>
                  <option value="">Sin asignar</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="active"
                    checked={form.active}
                    onChange={handleChange}
                  />
                  <span className="checkmark"></span>
                  Usuario activo
                </label>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editing ? '💾 Guardar Cambios' : '✅ Crear Usuario'}
              </button>
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros */}
      <div className="filters-bar">
        <div className="filter-group">
          <input
            type="text"
            name="search"
            placeholder="🔍 Buscar por nombre o email..."
            value={filter.search}
            onChange={handleFilterChange}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <select name="role" value={filter.role} onChange={handleFilterChange}>
            <option value="">Todos los roles</option>
            {roles.map(role => (
              <option key={role.value} value={role.value}>{role.label}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <select name="branch" value={filter.branch} onChange={handleFilterChange}>
            <option value="">Todas las sucursales</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <select name="active" value={filter.active} onChange={handleFilterChange}>
            <option value="">Todos los estados</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{users.length}</span>
          <span className="stat-label">Total Usuarios</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{users.filter(u => u.active !== false).length}</span>
          <span className="stat-label">Activos</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{users.filter(u => u.active === false).length}</span>
          <span className="stat-label">Inactivos</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{filteredUsers.length}</span>
          <span className="stat-label">Resultados</span>
        </div>
      </div>

      {/* Tabla de usuarios */}
      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Sucursal</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={user.id} className={user.active === false ? 'inactive-row' : ''}>
                <td>
                  <div className="user-info">
                    <div className="user-avatar">
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="user-name">{user.name || 'Sin nombre'}</span>
                  </div>
                </td>
                <td>{user.email}</td>
                <td>
                  <span className={getRoleBadgeClass(user.role)}>
                    {roles.find(r => r.value === user.role)?.label || user.role}
                  </span>
                </td>
                <td>
                  {branches.find(b => b.id === user.branch_id)?.name || '-'}
                </td>
                <td>
                  <span className={`status-badge ${user.active !== false ? 'status-active' : 'status-inactive'}`}>
                    {user.active !== false ? '✅ Activo' : '❌ Inactivo'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="btn-icon btn-edit"
                      onClick={() => handleEdit(user)}
                      title="Editar"
                    >
                      ✏️
                    </button>
                    <button
                      className={`btn-icon ${user.active !== false ? 'btn-deactivate' : 'btn-activate'}`}
                      onClick={() => handleToggleActive(user)}
                      title={user.active !== false ? 'Desactivar' : 'Activar'}
                      disabled={user.role === 'superadmin'}
                    >
                      {user.active !== false ? '🔒' : '🔓'}
                    </button>
                    <button
                      className="btn-icon btn-delete"
                      onClick={() => handleDelete(user)}
                      title="Eliminar"
                      disabled={user.role === 'superadmin'}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan="6" className="empty-row">
                  No se encontraron usuarios con los filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UsersManagement;
