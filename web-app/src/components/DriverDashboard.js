import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';

const DriverDashboard = () => {
  const [orders, setOrders] = useState([]);
  const [myMoto, setMyMoto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [etas, setEtas] = useState({});

  // Hardcoded driver for now; in real app, get from JWT token
  const DRIVER_ID = 1; //假设 driver id 1

  useEffect(() => {
    const fetchMyMoto = async () => {
      try {
        const res = await axios.get(`${ORDER_API_BASE_URL}/motos`);
        const motos = Array.isArray(res.data) ? res.data : [];
        const assigned = motos.find(m => m.driver_id === DRIVER_ID);
        setMyMoto(assigned || null);
      } catch (err) {
        console.error('Error fetching my moto', err);
        setMyMoto(null);
      }
    };

    const fetchMyOrders = async () => {
      try {
        const res = await axios.get(`${ORDER_API_BASE_URL}/orders`);
        const all = Array.isArray(res.data) ? res.data : [];
        const myOrders = all.filter(o => o.assigned_moto_id === myMoto?.id);
        setOrders(myOrders);
      } catch (err) {
        console.error('Error fetching orders', err);
        setOrders([]);
      }
    };

    const fetchData = async () => {
      setLoading(true);
      await fetchMyMoto();
      await fetchMyOrders();
      setLoading(false);
    };

    fetchData();

    // Poll every 30s for new orders/ETA
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [myMoto?.id]);

  useEffect(() => {
    const assignedOrInRoute = orders.filter(o => o.status === 'assigned' || o.status === 'in_route');
    assignedOrInRoute.forEach(o => {
      if (!etas[o.id]) {
        fetchETA(o.id);
      }
    });
  }, [orders]);

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
          </div>
          <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af' }}>
            No tienes una moto asignada. Contacta al administrador.
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
            Moto: <strong>{myMoto.license_plate}</strong> | Estado:{' '}
            <span className={getStatusBadgeClass(myMoto.status)}>{myMoto.status}</span>
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
