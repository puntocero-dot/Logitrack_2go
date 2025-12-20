import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';

const DriverDashboard = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [myMoto, setMyMoto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [etas, setEtas] = useState({});

  // Get driver ID from logged-in user
  const driverId = user?.id;

  const fetchMyMoto = useCallback(async () => {
    if (!driverId) return null;
    try {
      const res = await axios.get(`${ORDER_API_BASE_URL}/motos`);
      const motos = Array.isArray(res.data) ? res.data : [];
      const assigned = motos.find(m => m.driver_id === driverId);
      setMyMoto(assigned || null);
      return assigned;
    } catch (err) {
      console.error('Error fetching my moto', err);
      setMyMoto(null);
      return null;
    }
  }, [driverId]);

  const fetchMyOrders = useCallback(async (moto) => {
    if (!moto) {
      setOrders([]);
      return;
    }
    try {
      const res = await axios.get(`${ORDER_API_BASE_URL}/orders`);
      const all = Array.isArray(res.data) ? res.data : [];
      const myOrders = all.filter(o => o.assigned_moto_id === moto.id);
      setOrders(myOrders);
    } catch (err) {
      console.error('Error fetching orders', err);
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!driverId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const moto = await fetchMyMoto();
      await fetchMyOrders(moto);
      setLoading(false);
    };

    fetchData();

    // Poll every 30s for new orders/ETA
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [driverId, fetchMyMoto, fetchMyOrders]);

  useEffect(() => {
    const assignedOrInRoute = orders.filter(o => o.status === 'assigned' || o.status === 'in_route');
    assignedOrInRoute.forEach(o => {
      if (!etas[o.id]) {
        fetchETA(o.id);
      }
    });
  }, [orders, etas]);

  const fetchETA = async (orderId) => {
    try {
      const res = await axios.get(`${ORDER_API_BASE_URL}/orders/${orderId}/eta`);
      setEtas(prev => ({ ...prev, [orderId]: res.data }));
    } catch (err) {
      console.error(`Error fetching ETA for order ${orderId}`, err);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    setUpdating(prev => ({ ...prev, [orderId]: true }));
    try {
      await axios.put(`${ORDER_API_BASE_URL}/orders/${orderId}/status`, null, {
        params: { status: newStatus },
      });
      setOrders(prev =>
        prev.map(o => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
    } catch (err) {
      console.error('Error updating status', err);
    } finally {
      setUpdating(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const getStatusBadgeClass = (status) => {
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

  const formatEta = (eta) => {
    if (!eta || typeof eta.distance_km !== 'number' || typeof eta.eta_min !== 'number') {
      return null;
    }
    const km = eta.distance_km.toFixed(1);
    const roundedMinutes = Math.max(1, Math.round(eta.eta_min / 5) * 5);
    return `${km} km • ${roundedMinutes} min`;
  };

  if (loading) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-inner">
          <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af' }}>
            Cargando...
          </div>
        </div>
      </div>
    );
  }

  if (!myMoto) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-inner">
          <div className="dashboard-header">
            <h2 className="dashboard-title">Mi Dashboard</h2>
            <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
              👤 {user?.name || user?.email} (ID: {driverId})
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af' }}>
            <p style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>🏍️ No tienes una moto asignada.</p>
            <p>Contacta al administrador para que te asigne una moto.</p>
            <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#6b7280' }}>
              Tu ID de usuario: <strong>{driverId}</strong>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <div className="dashboard-inner">
        <div className="dashboard-header">
          <h2 className="dashboard-title">Mi Dashboard</h2>
          <div style={{ color: '#9ca3af' }}>
            <div>👤 {user?.name || user?.email}</div>
            <div>
              Moto: <strong>{myMoto.license_plate}</strong> | Estado:{' '}
              <span className={getStatusBadgeClass(myMoto.status)}>{myMoto.status}</span>
            </div>
          </div>
        </div>

        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-label">Pedidos asignados</div>
            <div className="metric-value">{orders.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Pendientes</div>
            <div className="metric-value">{orders.filter(o => o.status === 'assigned').length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">En ruta</div>
            <div className="metric-value">{orders.filter(o => o.status === 'in_route').length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Entregados</div>
            <div className="metric-value">{orders.filter(o => o.status === 'delivered').length}</div>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Dirección</th>
                <th>Estado</th>
                <th>ETA</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td>{order.client_name}</td>
                  <td>{order.address}</td>
                  <td>
                    <span className={getStatusBadgeClass(order.status)}>{order.status}</span>
                  </td>
                  <td>
                    {order.status === 'assigned' || order.status === 'in_route'
                      ? etas[order.id]
                        ? formatEta(etas[order.id]) || 'Calculando...'
                        : 'Calculando...'
                      : '-'}
                  </td>
                  <td>
                    {order.status === 'assigned' && (
                      <button
                        className="btn btn-primary"
                        onClick={() => updateOrderStatus(order.id, 'in_route')}
                        disabled={updating[order.id]}
                      >
                        {updating[order.id] ? 'Actualizando...' : 'Iniciar ruta'}
                      </button>
                    )}
                    {order.status === 'in_route' && (
                      <button
                        className="btn btn-success"
                        onClick={() => updateOrderStatus(order.id, 'delivered')}
                        disabled={updating[order.id]}
                      >
                        {updating[order.id] ? 'Actualizando...' : 'Marcar entregado'}
                      </button>
                    )}
                    {order.status === 'delivered' && (
                      <span style={{ color: '#10b981', fontSize: 13 }}>Entregado</span>
                    )}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: '#9ca3af' }}>
                    No tienes pedidos asignados.
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

export default DriverDashboard;
