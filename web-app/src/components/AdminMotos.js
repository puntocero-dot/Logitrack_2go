import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';
import { useNavigate } from 'react-router-dom';

const AdminMotos = () => {
  const [motos, setMotos] = useState([]);
  const [form, setForm] = useState({ license_plate: '', status: 'available', driver_id: '' });
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    fetchMotos();
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

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const resetForm = () => {
    setForm({ license_plate: '', status: 'available', driver_id: '' });
    setEditing(null);
    setMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      if (editing) {
        await axios.put(`${ORDER_API_BASE_URL}/motos/${editing.id}`, {
          license_plate: form.license_plate,
          status: form.status,
          driver_id: form.driver_id ? parseInt(form.driver_id, 10) : null,
        });
        setMessage('Moto actualizada.');
      } else {
        await axios.post(`${ORDER_API_BASE_URL}/motos`, {
          license_plate: form.license_plate,
          status: form.status,
          driver_id: form.driver_id ? parseInt(form.driver_id, 10) : null,
        });
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

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'available':
        return 'badge-status badge-moto-available';
      case 'in_route':
        return 'badge-status badge-moto-in_route';
      case 'inactive':
        return 'badge-status badge-moto-inactive';
      default:
        return 'badge-status';
    }
  };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-inner">
        <div className="dashboard-header">
          <h2 className="dashboard-title">Administrar Motos</h2>
        </div>

        {message && (
          <div
            className={`alert ${message.toLowerCase().startsWith('error') || message.toLowerCase().includes('no se puede') ? 'alert--error' : 'alert--success'}`}
          >
            {message}
          </div>
        )}

        <div className="form-card">
          <h3>{editing ? 'Editar Moto' : 'Crear Moto'}</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              name="license_plate"
              placeholder="Placa"
              value={form.license_plate}
              onChange={handleChange}
              required
              className="form-input"
            />
            <select name="status" value={form.status} onChange={handleChange} className="form-select">
              <option value="available">Disponible</option>
              <option value="in_route">En ruta</option>
              <option value="inactive">Inactiva</option>
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
                <th>Placa</th>
                <th>Estado</th>
                <th>Driver ID</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {motos.map(moto => (
                <tr key={moto.id}>
                  <td>{moto.id}</td>
                  <td>{moto.license_plate}</td>
                  <td>
                    <span className={getStatusBadgeClass(moto.status)}>{moto.status}</span>
                  </td>
                  <td>{moto.driver_id || '-'}</td>
                  <td>
                    <button className="btn btn-secondary" onClick={() => handleEdit(moto)}>
                      Editar
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => navigate(`/motos/${moto.id}`)}
                    >
                      Ver Perfil
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDelete(moto.id)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {motos.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: '#9ca3af' }}>
                    Sin motos registradas.
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
