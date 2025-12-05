import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { ORDER_API_BASE_URL, AUTH_API_BASE_URL } from '../config/api';

const MotoProfile = () => {
  const { id } = useParams();
  const motoId = id;
  const [moto, setMoto] = useState(null);
  const [driver, setDriver] = useState(null);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ driver_id: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!motoId) return;
    fetchData();
  }, [motoId]);

  const fetchData = async () => {
    try {
      const [motoRes, ordersRes, usersRes] = await Promise.all([
        axios.get(`${ORDER_API_BASE_URL}/motos/${motoId}`),
        axios.get(`${ORDER_API_BASE_URL}/orders?assigned_moto_id=${motoId}`),
        axios.get(`${AUTH_API_BASE_URL}/users?role=driver`),
      ]);
      const motoData = motoRes.data;
      setMoto(motoData);
      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setForm({ driver_id: motoData.driver_id || '' });
      if (motoData.driver_id) {
        const driverRes = await axios.get(`${AUTH_API_BASE_URL}/users/${motoData.driver_id}`);
        setDriver(driverRes.data);
      }
    } catch (err) {
      console.error('Error fetching moto data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignDriver = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${ORDER_API_BASE_URL}/motos/${motoId}`, {
        driver_id: form.driver_id ? parseInt(form.driver_id, 10) : null,
      });
      setEditing(false);
      fetchData();
    } catch (err) {
      console.error('Error assigning driver', err);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'available':
        return 'badge-status badge-available';
      case 'in_route':
        return 'badge-status badge-in_route';
      case 'inactive':
        return 'badge-status badge-inactive';
      default:
        return 'badge-status';
    }
  };

  const getStatusBadgeClassOrder = (status) => {
    switch (status) {
      case 'pending':
        return 'badge-status badge-pending';
      case 'assigned':
        return 'badge-status badge-assigned';
      case 'in_route':
        return 'badge-status badge-in_route';
      case 'delivered':
        return 'badge-status badge-delivered';
      case 'cancelled':
        return 'badge-status badge-cancelled';
      default:
        return 'badge-status';
    }
  };

  if (loading) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-inner">
          <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af' }}>
            Cargando perfil de moto...
          </div>
        </div>
      </div>
    );
  }

  if (!moto) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-inner">
          <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af' }}>
            Moto no encontrada.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <div className="dashboard-inner">
        <div className="dashboard-header">
          <h2 className="dashboard-title">Perfil de Moto</h2>
        </div>

        <div className="profile-card">
          <div className="profile-header">
            <div>
              <h3>{moto.license_plate}</h3>
              <span className={getStatusBadgeClass(moto.status)}>{moto.status}</span>
            </div>
            <button className="btn btn-secondary" onClick={() => setEditing(!editing)}>
              {editing ? 'Cancelar' : 'Asignar Driver'}
            </button>
          </div>

          {editing && (
            <form onSubmit={handleAssignDriver} style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={form.driver_id}
                onChange={(e) => setForm({ driver_id: e.target.value })}
                className="form-select"
                style={{ flex: 1 }}
              >
                <option value="">Sin driver</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary">Guardar</button>
            </form>
          )}

          <div className="profile-info">
            <div className="info-row">
              <span className="info-label">Driver asignado:</span>
              <span>{driver ? `${driver.name} (${driver.email})` : 'Sin asignar'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">ID:</span>
              <span>{moto.id}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Sucursal:</span>
              <span>{driver?.branch || '-'}</span>
            </div>
          </div>
        </div>

        <div className="profile-section">
          <h4>Historial de Pedidos ({orders.length})</h4>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID Pedido</th>
                  <th>Cliente</th>
                  <th>Dirección</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id}>
                    <td>#{order.id}</td>
                    <td>{order.client_name}</td>
                    <td>{order.address}</td>
                    <td>
                      <span className={getStatusBadgeClassOrder(order.status)}>{order.status}</span>
                    </td>
                    <td>{order.created_at ? new Date(order.created_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: '#9ca3af' }}>
                      Sin pedidos asignados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style jsx>{`
        .profile-card {
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        }
        .profile-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .profile-header h3 {
          margin: 0;
          color: #e5e5e5;
          font-size: 1.5rem;
        }
        .profile-info {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
        }
        .info-label {
          color: #9ca3af;
          font-size: 0.875rem;
        }
        .profile-section h4 {
          margin-bottom: 1rem;
          color: #e5e5e5;
        }
        .form-select {
          padding: 0.75rem;
          border-radius: 8px;
          border: 1px solid #444;
          background: #1a1a1a;
          color: #e5e5e5;
          font-size: 1rem;
        }
        .form-select:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
        .badge-available {
          background: #3b82f6;
          color: white;
        }
        .badge-in_route {
          background: #f59e0b;
          color: #78350f;
        }
        .badge-inactive {
          background: #6b7280;
          color: white;
        }
      `}</style>
    </div>
  );
};

export default MotoProfile;
