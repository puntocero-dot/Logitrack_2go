import React, { useState } from 'react';
import axios from 'axios';
import { ORDER_API_BASE_URL } from './config/api';

function App() {
  const [orderId, setOrderId] = useState('');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [eta, setEta] = useState(null);

  const fetchOrder = async (e) => {
    e.preventDefault();
    if (!orderId.trim()) {
      setError('Por favor ingresa un ID de pedido.');
      return;
    }
    setLoading(true);
    setError('');
    setOrder(null);
    setEta(null);
    try {
      const res = await axios.get(`${ORDER_API_BASE_URL}/orders/${orderId}`);
      setOrder(res.data);
      // Fetch ETA if assigned and in route
      if (res.data.assigned_moto_id && (res.data.status === 'assigned' || res.data.status === 'in_route')) {
        try {
          const etaRes = await axios.get(`${ORDER_API_BASE_URL}/orders/${orderId}/eta`);
          setEta(etaRes.data);
        } catch (etaErr) {
          // Ignore ETA error
        }
      }
    } catch (err) {
      if (err.response && err.response.status === 404) {
        setError('Pedido no encontrado. Verifica el ID e intenta de nuevo.');
      } else {
        setError('No se pudo cargar el pedido. Intenta más tarde.');
      }
    } finally {
      setLoading(false);
    }
  };

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
    <div className="client-shell">
      <div className="client-inner">
        <div className="client-header">
          <h2 className="client-title">Seguimiento de Pedidos</h2>
          <p className="client-subtitle">Ingresa tu ID de pedido para ver el estado</p>
        </div>

        <form onSubmit={fetchOrder} className="client-form">
          <input
            type="text"
            className="client-input"
            placeholder="Ej: 1"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </form>

        {error && <div className="client-error">{error}</div>}

        {order && (
          <div className="client-card">
            <div className="client-card-header">
              <span className="client-card-title">Pedido #{order.id}</span>
              <span className={getStatusBadgeClass(order.status)}>{order.status}</span>
            </div>
            <div className="client-card-body">
              <div className="client-info">
                <span className="client-info-label">Cliente:</span>
                <span>{order.client_name}</span>
              </div>
              <div className="client-info">
                <span className="client-info-label">Dirección:</span>
                <span>{order.address}</span>
              </div>
              {eta && (
                <div className="client-info">
                  <span className="client-info-label">ETA:</span>
                  <span>{formatEta(eta) || 'Calculando...'}</span>
                </div>
              )}
              {order.assigned_moto_id && (
                <div className="client-info">
                  <span className="client-info-label">Moto asignada:</span>
                  <span>ID {order.assigned_moto_id}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <style jsx>{`
          .client-shell {
            --bg: #1a1a1a;
            --surface: #2a2a2a;
            --primary: #3b82f6;
            --text: #e5e5e5;
            --border: #444;
            --error: #ef4444;
            --success: #10b981;
            --warning: #f59e0b;

            min-height: 100vh;
            background-color: var(--bg);
            color: var(--text);
            padding: 2rem 1rem;
            font-family: system-ui, sans-serif;
          }

          .client-inner {
            max-width: 480px;
            margin: 0 auto;
          }

          .client-header {
            text-align: center;
            margin-bottom: 2rem;
          }

          .client-title {
            font-size: 2rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
          }

          .client-subtitle {
            color: #9ca3af;
            font-size: 1rem;
          }

          .client-form {
            display: flex;
            gap: 0.75rem;
            margin-bottom: 1.5rem;
          }

          .client-input {
            flex: 1;
            padding: 0.75rem;
            border-radius: 8px;
            border: 1px solid var(--border);
            background-color: var(--surface);
            color: var(--text);
            font-size: 1rem;
          }

          .client-input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
          }

          .btn {
            padding: 0.75rem 1.5rem;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
          }

          .btn-primary {
            background-color: var(--primary);
            color: white;
          }

          .btn-primary:hover:not(:disabled) {
            background-color: #2563eb;
          }

          .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .client-error {
            background-color: var(--error);
            color: white;
            padding: 0.75rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
            text-align: center;
          }

          .client-card {
            background-color: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1.5rem;
          }

          .client-card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
          }

          .client-card-title {
            font-size: 1.25rem;
            font-weight: 600;
          }

          .badge-status {
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.875rem;
            font-weight: 500;
            text-transform: uppercase;
          }

          .badge-pending {
            background-color: #fbbf24;
            color: #78350f;
          }

          .badge-assigned {
            background-color: #60a5fa;
            color: #1e3a8a;
          }

          .badge-in_route {
            background-color: var(--warning);
            color: #78350f;
          }

          .badge-delivered {
            background-color: var(--success);
            color: white;
          }

          .badge-cancelled {
            background-color: var(--error);
            color: white;
          }

          .client-card-body {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }

          .client-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .client-info-label {
            color: #9ca3af;
            font-size: 0.875rem;
          }
        `}</style>
      </div>
    </div>
  );
}

export default App;
