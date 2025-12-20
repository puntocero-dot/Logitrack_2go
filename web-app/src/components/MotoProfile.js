import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { ORDER_API_BASE_URL, USER_API_BASE_URL } from '../config/api';

const MotoProfile = () => {
  const { id } = useParams();
  const motoId = id;
  const [moto, setMoto] = useState(null);
  const [allMotos, setAllMotos] = useState([]);
  const [driver, setDriver] = useState(null);
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ driver_id: '' });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!motoId) return;
    fetchData();
  }, [motoId]);

  const fetchData = async () => {
    try {
      const [motoRes, ordersRes, usersRes, motosRes] = await Promise.all([
        axios.get(`${ORDER_API_BASE_URL}/motos/${motoId}`),
        axios.get(`${ORDER_API_BASE_URL}/orders?assigned_moto_id=${motoId}`),
        axios.get(`${USER_API_BASE_URL}/users`),
        axios.get(`${ORDER_API_BASE_URL}/motos`),
      ]);
      const motoData = motoRes.data;
      setMoto(motoData);
      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
      setAllMotos(Array.isArray(motosRes.data) ? motosRes.data : []);

      // Filter only users with role 'driver' and active
      const allUsers = Array.isArray(usersRes.data) ? usersRes.data : [];
      const driverUsers = allUsers.filter(u => u.role === 'driver' && u.active !== false);
      setDrivers(driverUsers);

      setForm({ driver_id: motoData.driver_id || '' });
      if (motoData.driver_id) {
        const driverUser = allUsers.find(u => u.id === motoData.driver_id);
        setDriver(driverUser || null);
      }
    } catch (err) {
      console.error('Error fetching moto data', err);
    } finally {
      setLoading(false);
    }
  };

  // Check if a driver is already assigned to another moto
  const isDriverAssigned = (driverId) => {
    if (!driverId) return false;
    const assignedMoto = allMotos.find(m => m.driver_id === parseInt(driverId) && m.id !== parseInt(motoId));
    return assignedMoto !== undefined;
  };

  const getAssignedMotoPlate = (driverId) => {
    if (!driverId) return null;
    const assignedMoto = allMotos.find(m => m.driver_id === parseInt(driverId) && m.id !== parseInt(motoId));
    return assignedMoto ? assignedMoto.license_plate : null;
  };

  const handleAssignDriver = async (e) => {
    e.preventDefault();
    setMessage('');

    // Validate driver is not already assigned to another moto
    if (form.driver_id && isDriverAssigned(form.driver_id)) {
      const plate = getAssignedMotoPlate(form.driver_id);
      setMessage(`❌ Este conductor ya está asignado a la moto ${plate}`);
      return;
    }

    try {
      await axios.put(`${ORDER_API_BASE_URL}/motos/${motoId}`, {
        driver_id: form.driver_id ? parseInt(form.driver_id, 10) : null,
      });
      setMessage('✅ Conductor asignado correctamente');
      setEditing(false);
      fetchData();
    } catch (err) {
      setMessage('❌ Error: ' + (err.response?.data?.error || err.message));
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

        {message && (
          <div className={`alert ${message.includes('❌') ? 'alert--error' : 'alert--success'}`}>
            {message}
          </div>
        )}

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
                {drivers.map(u => {
                  const alreadyAssigned = isDriverAssigned(u.id);
                  return (
                    <option
                      key={u.id}
                      value={u.id}
                      disabled={alreadyAssigned}
                    >
                      {u.name || u.email} {alreadyAssigned ? `(Asignado a ${getAssignedMotoPlate(u.id)})` : ''}
                    </option>
                  );
                })}
              </select>
              <button type="submit" className="btn btn-primary">Guardar</button>
            </form>
          )}

          {drivers.length === 0 && editing && (
            <p style={{ color: '#f59e0b', marginTop: '0.5rem', fontSize: '0.9rem' }}>
              ⚠️ No hay usuarios con rol "driver" activos. Crea usuarios con rol driver en la sección Usuarios.
            </p>
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
              <span>{moto.branch_name || moto.branch_id || '-'}</span>
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
