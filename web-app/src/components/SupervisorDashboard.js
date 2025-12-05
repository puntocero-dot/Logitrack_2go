import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';
import MapView from './MapView';

const SupervisorDashboard = () => {
  const [orders, setOrders] = useState([]);
  const [motos, setMotos] = useState([]);
  const [motoKPIs, setMotoKPIs] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [optimizing, setOptimizing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [etas, setEtas] = useState({});
  const [optimizationMessage, setOptimizationMessage] = useState('');
  const [orderForm, setOrderForm] = useState({
    client_name: '',
    client_email: '',
    address: '',
    latitude: '',
    longitude: '',
  });
  const [orderMessage, setOrderMessage] = useState('');

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const branch = user.role === 'supervisor' ? user.branch : undefined;
        const url = branch ? `${ORDER_API_BASE_URL}/orders?branch=${branch}` : `${ORDER_API_BASE_URL}/orders`;
        const res = await axios.get(url);
        const data = Array.isArray(res.data) ? res.data : [];
        setOrders(data);
      } catch (err) {
        console.error('Error fetching orders', err);
        setOrders([]);
      }
    };

    const fetchMotos = async () => {
    try {
      const res = await axios.get(`${ORDER_API_BASE_URL}/motos`);
      const data = Array.isArray(res.data) ? res.data : [];
      setMotos(data);
    } catch (err) {
      console.error('Error fetching motos', err);
      setMotos([]);
    }
  };

  const fetchMotoKPIs = async () => {
    try {
      const res = await axios.get(`${ORDER_API_BASE_URL}/kpis/motos`);
      setMotoKPIs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching moto KPIs', err);
      setMotoKPIs([]);
    }
  };

  fetchOrders();
  fetchMotos();
  fetchMotoKPIs();
  }, []);

  const handleOrderChange = (e) => {
    const { name, value } = e.target;
    setOrderForm(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    setOrderMessage('');
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const branch = user.role === 'supervisor' ? user.branch : 'central';

      const payload = {
        client_name: orderForm.client_name || 'Cliente sin nombre',
        client_email: orderForm.client_email || null,
        address: orderForm.address || 'Sin dirección',
        latitude: orderForm.latitude ? parseFloat(orderForm.latitude) : 10.0,
        longitude: orderForm.longitude ? parseFloat(orderForm.longitude) : -75.0,
        branch,
      };

      const res = await axios.post(`${ORDER_API_BASE_URL}/orders`, payload);
      const newOrder = res.data;
      setOrders(prev => [...prev, newOrder]);
      setOrderMessage('Pedido creado.');
      setOrderForm({ client_name: '', client_email: '', address: '', latitude: '', longitude: '' });
    } catch (err) {
      setOrderMessage('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter(o => o.status === 'pending').length;
    const inRoute = orders.filter(o => o.status === 'in_route').length;
    const delivered = orders.filter(o => o.status === 'delivered').length;
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(o => o.created_at && o.created_at.startsWith(today)).length;
    const activeMotos = motos.filter(m => m.status === 'available' || m.status === 'in_route').length;
    return { total, pending, inRoute, delivered, todayOrders, activeMotos };
  }, [orders, motos]);

  const availableMotos = useMemo(
    () => motos.filter(m => m.status === 'available'),
    [motos]
  );

  const fetchOptimization = async () => {
    setOptimizing(true);
    setOptimizationMessage('');
    try {
      const res = await axios.get(`${ORDER_API_BASE_URL}/optimization/assignments`);
      const data = res.data && Array.isArray(res.data.assignments) ? res.data.assignments : [];
      setSuggestions(data);
      if (!data.length) {
        setOptimizationMessage('No hay pedidos pendientes o motos disponibles para optimizar.');
      }
    } catch (err) {
      console.error('Error fetching optimization suggestions', err);
      setSuggestions([]);
      setOptimizationMessage('No se pudo calcular la optimización. Intenta de nuevo.');
    } finally {
      setOptimizing(false);
    }
  };

  const applySuggestions = async () => {
    if (!suggestions.length) return;
    setApplying(true);
    try {
      // Use the new batch endpoint that also persists routes
      await axios.post(`${ORDER_API_BASE_URL}/optimization/apply`, {
        assignments: suggestions,
      });

      const [ordersRes, motosRes] = await Promise.all([
        axios.get(`${ORDER_API_BASE_URL}/orders`),
        axios.get(`${ORDER_API_BASE_URL}/motos`),
      ]);

      const newOrders = Array.isArray(ordersRes.data) ? ordersRes.data : [];
      const newMotos = Array.isArray(motosRes.data) ? motosRes.data : [];
      setOrders(newOrders);
      setMotos(newMotos);
      setSuggestions([]);
    } catch (err) {
      console.error('Error applying optimization suggestions', err);
    } finally {
      setApplying(false);
    }
  };

  const fetchETA = async (orderId) => {
    try {
      const res = await axios.get(`${ORDER_API_BASE_URL}/orders/${orderId}/eta`);
      const data = res.data || {};
      setEtas(prev => ({ ...prev, [orderId]: data }));
    } catch (err) {
      console.error(`Error fetching ETA for order ${orderId}`, err);
    }
  };

  useEffect(() => {
    const assignedOrInRoute = orders.filter(o => o.assigned_moto_id && (o.status === 'assigned' || o.status === 'in_route'));
    assignedOrInRoute.forEach(o => fetchETA(o.id));
  }, [orders]);

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'pending':
        return 'badge-status badge-pending';
      case 'in_route':
        return 'badge-status badge-in_route';
      case 'delivered':
        return 'badge-status badge-delivered';
      case 'assigned':
        return 'badge-status badge-assigned';
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

  return (
    <div className="dashboard-shell">
      <div className="dashboard-inner">
        <div className="dashboard-header">
          <h2 className="dashboard-title">Supervisor Dashboard</h2>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={fetchOptimization}
              disabled={optimizing}
            >
              {optimizing ? 'Calculando rutas...' : 'Optimizar asignación'}
            </button>
          </div>
        </div>

        {orderMessage && (
          <div
            className={`alert ${orderMessage.toLowerCase().startsWith('error') ? 'alert--error' : 'alert--success'}`}
          >
            {orderMessage}
          </div>
        )}

        <div className="form-card" style={{ marginBottom: 20 }}>
          <h3>Crear Pedido</h3>
          <form onSubmit={handleCreateOrder} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <input
              type="text"
              name="client_name"
              placeholder="Nombre del cliente"
              value={orderForm.client_name}
              onChange={handleOrderChange}
              className="form-input"
            />
            <input
              type="email"
              name="client_email"
              placeholder="Email del cliente (opcional)"
              value={orderForm.client_email}
              onChange={handleOrderChange}
              className="form-input"
            />
            <input
              type="text"
              name="address"
              placeholder="Dirección"
              value={orderForm.address}
              onChange={handleOrderChange}
              className="form-input"
            />
            <input
              type="number"
              step="0.0001"
              name="latitude"
              placeholder="Latitud (ej. 10.0)"
              value={orderForm.latitude}
              onChange={handleOrderChange}
              className="form-input"
            />
            <input
              type="number"
              step="0.0001"
              name="longitude"
              placeholder="Longitud (ej. -75.0)"
              value={orderForm.longitude}
              onChange={handleOrderChange}
              className="form-input"
            />
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">
                Crear
              </button>
            </div>
          </form>
        </div>

        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-label">Total</div>
            <div className="metric-value">{stats.total}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Hoy</div>
            <div className="metric-value">{stats.todayOrders}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Pendientes</div>
            <div className="metric-value">{stats.pending}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">En ruta</div>
            <div className="metric-value">{stats.inRoute}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Entregados</div>
            <div className="metric-value">{stats.delivered}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Motos activas</div>
            <div className="metric-value">{stats.activeMotos}</div>
          </div>
        </div>

        {(suggestions.length > 0 || optimizationMessage) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div className="metric-label">Sugerencias de IA</div>
              {suggestions.length > 0 && (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={applySuggestions}
                  disabled={applying}
                >
                  {applying ? 'Aplicando…' : 'Aplicar sugerencias'}
                </button>
              )}
            </div>
            {optimizationMessage && (
              <div style={{ marginBottom: 8, fontSize: 13, color: '#9ca3af' }}>
                {optimizationMessage}
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Moto sugerida</th>
                      <th>Distancia (km)</th>
                      <th>ETA (min)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((sug, idx) => {
                      const order = orders.find(o => o.id === sug.order_id);
                      const moto = motos.find(m => m.id === sug.moto_id);
                      const friendlyEta = formatEta({ distance_km: sug.distance_km, eta_min: sug.eta_min });
                      return (
                        <tr key={idx}>
                          <td>{sug.order_id}{order ? ` - ${order.address}` : ''}</td>
                          <td>{moto ? moto.license_plate : sug.moto_id}</td>
                          <td>{sug.distance_km.toFixed ? sug.distance_km.toFixed(1) : sug.distance_km}</td>
                          <td>{friendlyEta || `${sug.eta_min} min`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Dirección</th>
                <th>Estado</th>
                <th>Moto</th>
                <th>ETA</th>
                <th>Lat</th>
                <th>Lng</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(orders || []).map(order => (
                <tr key={order.id}>
                  <td>{order.id}</td>
                  <td>{order.client_name}</td>
                  <td>{order.address}</td>
                  <td>
                    <span className={getStatusBadgeClass(order.status)}>{order.status}</span>
                  </td>
                  <td>
                    <select
                      className="select-status"
                      value={order.assigned_moto_id || ''}
                      onChange={async (e) => {
                        const motoId = e.target.value;
                        if (!motoId) return;
                        try {
                          await axios.put(`${ORDER_API_BASE_URL}/orders/${order.id}/assign`, null, {
                            params: { moto_id: motoId },
                          });
                          setOrders(prev =>
                            prev.map(o =>
                              o.id === order.id
                                ? {
                                  ...o,
                                  assigned_moto_id: parseInt(motoId, 10),
                                  status: o.status === 'pending' ? 'assigned' : o.status,
                                }
                                : o
                              )
                          );
                        } catch (err) {
                          console.error('Error assigning moto', err);
                        }
                      }}
                    >
                      <option value="">{order.assigned_moto_id ? 'Cambiar moto' : 'Asignar moto'}</option>
                      {availableMotos.map(moto => (
                        <option key={moto.id} value={moto.id}>
                          {moto.license_plate}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {order.assigned_moto_id && (order.status === 'assigned' || order.status === 'in_route')
                      ? etas[order.id]
                        ? formatEta(etas[order.id]) || 'Calculando...'
                        : 'Calculando...'
                      : '-'}
                  </td>
                  <td>{order.latitude}</td>
                  <td>{order.longitude}</td>
                  <td>
                    <select
                      className="select-status"
                      value={order.status}
                      onChange={async (e) => {
                        const newStatus = e.target.value;
                        try {
                          await axios.put(`${ORDER_API_BASE_URL}/orders/${order.id}/status`, null, {
                            params: { status: newStatus },
                          });
                          setOrders(prev =>
                            prev.map(o => (o.id === order.id ? { ...o, status: newStatus } : o))
                          );
                        } catch (err) {
                          console.error('Error updating status', err);
                        }
                      }}
                    >
                      <option value="pending">pending</option>
                      <option value="assigned">assigned</option>
                      <option value="in_route">in_route</option>
                      <option value="delivered">delivered</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="map-card">
          <MapView orders={orders} motos={motos} />
        </div>

        <div className="kpi-motos-section">
          <h3 className="kpi-section-title">KPIs por Moto</h3>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Moto</th>
                  <th>Entregadas Hoy</th>
                  <th>Tiempo Promedio Entrega (min)</th>
                  <th>Tiempo Total Ruta (min)</th>
                  <th>Última Entrega</th>
                </tr>
              </thead>
              <tbody>
                {motoKPIs.map((kpi) => (
                  <tr key={kpi.moto_id}>
                    <td>{kpi.license_plate}</td>
                    <td>
                      <span className="badge-count">{kpi.delivered_today}</span>
                    </td>
                    <td>
                      {kpi.avg_delivery_time_min != null
                        ? Math.round(kpi.avg_delivery_time_min)
                        : '-'}
                    </td>
                    <td>
                      {kpi.total_route_time_min != null
                        ? Math.round(kpi.total_route_time_min)
                        : '-'}
                    </td>
                    <td>{kpi.last_delivery_at || '-'}</td>
                  </tr>
                ))}
                {motoKPIs.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: '#9ca3af' }}>
                      Sin datos de KPIs
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
;

export default SupervisorDashboard;
