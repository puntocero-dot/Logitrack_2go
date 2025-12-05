import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { USER_API_BASE_URL } from '../config/api';

const UsersManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'operator',
    branch: 'central',
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchUsers();
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

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const resetForm = () => {
    setForm({ name: '', email: '', password: '', role: 'operator', branch: 'central' });
    setEditing(null);
    setMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      if (editing) {
        await axios.put(`${USER_API_BASE_URL}/users/${editing.id}`, {
          name: form.name,
          email: form.email,
          role: form.role,
          branch: form.branch,
          ...(form.password ? { password: form.password } : {}),
        });
        setMessage('Usuario actualizado.');
      } else {
        await axios.post(`${USER_API_BASE_URL}/users`, form);
        setMessage('Usuario creado.');
      }
      resetForm();
      fetchUsers();
    } catch (err) {
      setMessage('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleEdit = (user) => {
    setForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'operator',
      branch: user.branch || 'central',
    });
    setEditing(user);
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('¿Eliminar este usuario?')) return;
    try {
      await axios.delete(`${USER_API_BASE_URL}/users/${userId}`);
      setMessage('Usuario eliminado.');
      fetchUsers();
    } catch (err) {
      setMessage('Error al eliminar.');
    }
  };

  const getStatusBadgeClass = (role) => {
    switch (role) {
      case 'admin':
        return 'badge-role badge-admin';
      case 'supervisor':
        return 'badge-role badge-supervisor';
      case 'driver':
        return 'badge-role badge-driver';
      case 'operator':
        return 'badge-role badge-operator';
      default:
        return 'badge-role';
    }
  };

  if (loading) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-inner">
          <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af' }}>
            Cargando usuarios...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <div className="dashboard-inner">
        <div className="dashboard-header">
          <h2 className="dashboard-title">Gestión de Usuarios</h2>
        </div>

        {message && (
          <div
            className={`alert ${message.toLowerCase().startsWith('error') ? 'alert--error' : 'alert--success'}`}
          >
            {message}
          </div>
        )}

        <div className="form-card">
          <h3>{editing ? 'Editar Usuario' : 'Crear Usuario'}</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              name="name"
              placeholder="Nombre completo"
              value={form.name}
              onChange={handleChange}
              required
              className="form-input"
            />
            <input
              type="email"
              name="email"
              placeholder="Correo electrónico"
              value={form.email}
              onChange={handleChange}
              required
              className="form-input"
            />
            <input
              type="password"
              name="password"
              placeholder={editing ? 'Nueva contraseña (dejar en blanco para no cambiar)' : 'Contraseña'}
              value={form.password}
              onChange={handleChange}
              required={!editing}
              className="form-input"
            />
            <select name="role" value={form.role} onChange={handleChange} className="form-select">
              <option value="admin">Admin</option>
              <option value="supervisor">Supervisor</option>
              <option value="operator">Operator</option>
              <option value="driver">Driver</option>
            </select>
            <select name="branch" value={form.branch} onChange={handleChange} className="form-select">
              <option value="central">Central</option>
              <option value="norte">Norte</option>
              <option value="sur">Sur</option>
              <option value="este">Este</option>
              <option value="oeste">Oeste</option>
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary">
                {editing ? 'Actualizar' : 'Crear'}
              </button>
              {editing && (
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Sucursal</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={getStatusBadgeClass(user.role)}>{user.role}</span>
                  </td>
                  <td>{user.branch || '-'}</td>
                  <td>
                    <button className="btn btn-secondary" onClick={() => handleEdit(user)}>
                      Editar
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDelete(user.id)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: '#9ca3af' }}>
                    Sin usuarios registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UsersManagement;
