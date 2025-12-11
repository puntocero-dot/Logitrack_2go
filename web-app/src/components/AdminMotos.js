import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';
import { useNavigate } from 'react-router-dom';

const AdminMotos = () => {
  const [motos, setMotos] = useState([]);
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({
    license_plate: '',
    status: 'available',
    driver_id: '',
    branch_id: '',
    latitude: '',
    longitude: '',
    max_orders_capacity: 5
  });
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    fetchMotos();
    fetchBranches();
  }, []);

  const fetchMotos = async () => {
    try {
      const res = await axios.get(`${ORDER_API_BASE_URL}/motos`);
      setMotos(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching motos', err);
      setMotos([]);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await axios.get(`${ORDER_API_BASE_URL}/branches`);
      setBranches(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching branches', err);
      setBranches([]);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const resetForm = () => {
    setForm({
      license_plate: '',
      status: 'available',
      driver_id: '',
      branch_id: '',
      latitude: '',
      longitude: '',
      max_orders_capacity: 5
    });
    setEditing(null);
    setMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const payload = {
        license_plate: form.license_plate,
        status: form.status,
        driver_id: form.driver_id ? parseInt(form.driver_id, 10) : null,
        branch_id: form.branch_id ? parseInt(form.branch_id, 10) : null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        max_orders_capacity: parseInt(form.max_orders_capacity, 10) || 5,
      };

      if (editing) {
        await axios.put(`${ORDER_API_BASE_URL}/motos/${editing.id}`, payload);
        setMessage('Moto actualizada.');
      } else {
        await axios.post(`${ORDER_API_BASE_URL}/motos`, payload);
        setMessage('Moto creada.');
      }
      resetForm();
      fetchMotos();
    } catch (err) {
      setMessage('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleEdit = (moto) => {
    setForm({
      license_plate: moto.license_plate,
      status: moto.status,
      driver_id: moto.driver_id || '',
      branch_id: moto.branch_id || '',
      latitude: moto.latitude || '',
      longitude: moto.longitude || '',
      max_orders_capacity: moto.max_orders_capacity || 5,
    });
    setEditing(moto);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta moto?')) return;
    try {
      await axios.delete(`${ORDER_API_BASE_URL}/motos/${id}`);
      setMessage('Moto eliminada.');
      fetchMotos();
    } catch (err) {
      setMessage('No se puede eliminar: tiene pedidos asociados.');
    }
  };

  // Obtener ubicación actual del navegador
  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setForm({
            ...form,
            latitude: position.coords.latitude.toFixed(6),
            longitude: position.coords.longitude.toFixed(6),
          });
          setMessage('Ubicación obtenida del GPS.');
        },
        (error) => {
          setMessage('Error al obtener ubicación: ' + error.message);
        }
      );
    } else {
      setMessage('Geolocalización no soportada en este navegador.');
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'available':
        return 'badge-status badge-moto-available';
      case 'in_route':
        return 'badge-status badge-moto-in_route';
      case 'maintenance':
        return 'badge-status badge-moto-inactive';
      default:
        return 'badge-status';
    }
  };

  const getBranchName = (branchId) => {
    const branch = branches.find(b => b.id === branchId);
    return branch ? branch.name : '-';
  };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-inner">
        <div className="dashboard-header">
          <h2 className="dashboard-title">Administrar Motos</h2>
          <div className="metrics-row" style={{ marginBottom: 0 }}>
            <div className="metric-card">
              <div className="metric-label">Total Motos</div>
              <div className="metric-value">{motos.length}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Disponibles</div>
              <div className="metric-value">{motos.filter(m => m.status === 'available').length}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">En Ruta</div>
              <div className="metric-value">{motos.filter(m => m.status === 'in_route').length}</div>
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`alert ${message.toLowerCase().startsWith('error') || message.toLowerCase().includes('no se puede') ? 'alert--error' : 'alert--success'}`}
          >
            {message}
          </div>
        )}

        <div className="form-card">
          <h3>{editing ? 'Editar Moto' : 'Crear Nueva Moto'}</h3>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <input
              type="text"
              name="license_plate"
              placeholder="Placa (ej: M-001)"
              value={form.license_plate}
              onChange={handleChange}
              required
              className="form-input"
            />
            <select name="status" value={form.status} onChange={handleChange} className="form-select">
              <option value="available">Disponible</option>
              <option value="in_route">En ruta</option>
              <option value="maintenance">Mantenimiento</option>
            </select>
            <select name="branch_id" value={form.branch_id} onChange={handleChange} className="form-select">
              <option value="">-- Sucursal --</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <input
              type="number"
              name="max_orders_capacity"
              placeholder="Capacidad máx. pedidos"
              value={form.max_orders_capacity}
              onChange={handleChange}
              min="1"
              max="20"
              className="form-input"
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                step="0.0001"
                name="latitude"
                placeholder="Latitud"
                value={form.latitude}
                onChange={handleChange}
                className="form-input"
                style={{ flex: 1 }}
              />
              <input
                type="number"
                step="0.0001"
                name="longitude"
                placeholder="Longitud"
                value={form.longitude}
                onChange={handleChange}
                className="form-input"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleGetLocation}
                title="Usar mi ubicación actual"
              >
                📍
              </button>
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">
                {editing ? 'Actualizar' : 'Crear Moto'}
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
                <th>Placa</th>
                <th>Sucursal</th>
                <th>Estado</th>
                <th>Capacidad</th>
                <th>Pedidos Asig.</th>
                <th>Ubicación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {motos.map(moto => (
                <tr key={moto.id}>
                  <td>{moto.id}</td>
                  <td><strong>{moto.license_plate}</strong></td>
                  <td>{getBranchName(moto.branch_id)}</td>
                  <td>
                    <span className={getStatusBadgeClass(moto.status)}>{moto.status}</span>
                  </td>
                  <td>{moto.max_orders_capacity || 5}</td>
                  <td>
                    <span className="badge-count">{moto.current_orders_count || 0}</span>
                  </td>
                  <td>
                    {moto.latitude && moto.longitude
                      ? `${moto.latitude.toFixed(4)}, ${moto.longitude.toFixed(4)}`
                      : <span style={{ color: '#9ca3af' }}>Sin ubicación</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary" onClick={() => handleEdit(moto)}>
                        Editar
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => navigate(`/motos/${moto.id}`)}
                      >
                        Perfil
                      </button>
                      <button className="btn btn-danger" onClick={() => handleDelete(moto.id)}>
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {motos.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', color: '#9ca3af' }}>
                    Sin motos registradas. Crea una nueva moto para comenzar.
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

export default AdminMotos;
