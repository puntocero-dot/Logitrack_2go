import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ORDER_API_BASE_URL } from './config/api';

function App() {
  const [orderId, setOrderId] = useState('');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [eta, setEta] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchOrder = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (!orderId.trim()) {
      setError('Por favor ingresa un ID de pedido.');
      return;
    }
    setLoading(true);
    setError('');
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
      // Auto-refresh si está en ruta
      if (res.data.status === 'in_route' || res.data.status === 'assigned') {
        setAutoRefresh(true);
      } else {
        setAutoRefresh(false);
      }
    } catch (err) {
      if (err.response && err.response.status === 404) {
        setError('Pedido no encontrado. Verifica el ID e intenta de nuevo.');
      } else {
        setError('No se pudo cargar el pedido. Intenta más tarde.');
      }
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // Auto-refresh cada 15 segundos si está en ruta
  useEffect(() => {
    if (autoRefresh && order) {
      const interval = setInterval(() => {
        fetchOrder();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, order, fetchOrder]);

  const getStatusInfo = (status) => {
    const statuses = {
      pending: { icon: '⏳', label: 'Pendiente', description: 'Tu pedido está en espera de asignación', color: '#f59e0b' },
      assigned: { icon: '🏍️', label: 'Asignado', description: 'Un motorista ha sido asignado a tu pedido', color: '#3b82f6' },
      in_route: { icon: '🚀', label: 'En Camino', description: 'Tu pedido está en camino', color: '#8b5cf6' },
      delivered: { icon: '✅', label: 'Entregado', description: '¡Tu pedido ha sido entregado!', color: '#10b981' },
      cancelled: { icon: '❌', label: 'Cancelado', description: 'El pedido fue cancelado', color: '#ef4444' },
    };
    return statuses[status] || { icon: '📦', label: status, description: '', color: '#6b7280' };
  };

  const getProgress = (status) => {
    const steps = ['pending', 'assigned', 'in_route', 'delivered'];
    const currentIndex = steps.indexOf(status);
    if (status === 'cancelled') return 0;
    return ((currentIndex + 1) / steps.length) * 100;
  };

  const formatEta = (eta) => {
    if (!eta || typeof eta.distance_km !== 'number' || typeof eta.eta_min !== 'number') {
      return null;
    }
    const km = eta.distance_km.toFixed(1);
    const roundedMinutes = Math.max(1, Math.round(eta.eta_min / 5) * 5);
    return { km, minutes: roundedMinutes };
  };

  const statusInfo = order ? getStatusInfo(order.status) : null;
  const etaFormatted = eta ? formatEta(eta) : null;

  return (
    <div className="client-shell">
      <div className="client-inner">
        {/* Header con logo */}
        <div className="client-header">
          <div className="logo-container">
            <span className="logo-emoji">🚀</span>
            <span className="logo-text">LOGITRACK</span>
          </div>
          <h2 className="client-title">Seguimiento de Pedidos</h2>
          <p className="client-subtitle">Ingresa tu número de pedido para ver el estado en tiempo real</p>
        </div>

        {/* Formulario de búsqueda */}
        <form onSubmit={fetchOrder} className="client-form">
          <input
            type="text"
            className="client-input"
            placeholder="Número de pedido (Ej: 1)"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? '🔄' : '🔍'}
          </button>
        </form>

        {error && <div className="client-error">{error}</div>}

        {/* Resultado del pedido */}
        {order && statusInfo && (
          <div className="order-result">
            {/* Status Card principal */}
            <div className="status-hero" style={{ borderColor: statusInfo.color }}>
              <div className="status-icon" style={{ backgroundColor: statusInfo.color }}>
                {statusInfo.icon}
              </div>
              <h3 className="status-label">{statusInfo.label}</h3>
              <p className="status-description">{statusInfo.description}</p>

              {/* ETA */}
              {etaFormatted && (order.status === 'assigned' || order.status === 'in_route') && (
                <div className="eta-display">
                  <div className="eta-time">{etaFormatted.minutes} min</div>
                  <div className="eta-distance">{etaFormatted.km} km de distancia</div>
                </div>
              )}

              {autoRefresh && (
                <div className="auto-refresh-badge">
                  🔄 Actualizando en tiempo real
                </div>
              )}
            </div>

            {/* Progress Timeline */}
            <div className="timeline">
              <div className="timeline-track">
                <div
                  className="timeline-progress"
                  style={{ width: `${getProgress(order.status)}%`, backgroundColor: statusInfo.color }}
                />
              </div>
              <div className="timeline-steps">
                {['pending', 'assigned', 'in_route', 'delivered'].map((step, idx) => {
                  const stepInfo = getStatusInfo(step);
                  const isActive = ['pending', 'assigned', 'in_route', 'delivered'].indexOf(order.status) >= idx;
                  const isCurrent = order.status === step;
                  return (
                    <div
                      key={step}
                      className={`timeline-step ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}`}
                    >
                      <div className="step-dot" style={isActive ? { backgroundColor: stepInfo.color } : {}}>
                        {stepInfo.icon}
                      </div>
                      <span className="step-label">{stepInfo.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detalles del pedido */}
            <div className="order-details">
              <h4>Detalles del Pedido #{order.id}</h4>
              <div className="detail-row">
                <span className="detail-label">📍 Dirección</span>
                <span className="detail-value">{order.address}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">👤 Cliente</span>
                <span className="detail-value">{order.client_name}</span>
              </div>
              {order.assigned_moto_id && (
                <div className="detail-row">
                  <span className="detail-label">🏍️ Motorista</span>
                  <span className="detail-value">Moto #{order.assigned_moto_id}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="client-footer">
          <p>Powered by <strong>Logitrack</strong></p>
        </div>

        <style>{`
          :root {
            --bg: #0a0f1c;
            --surface: #1f2937;
            --primary: #3b82f6;
            --text: #f9fafb;
            --text-secondary: #9ca3af;
            --border: rgba(255,255,255,0.1);
            --error: #ef4444;
            --success: #10b981;
            --warning: #f59e0b;
          }

          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          .client-shell {
            min-height: 100vh;
            background: linear-gradient(135deg, var(--bg) 0%, #111827 100%);
            color: var(--text);
            padding: 2rem 1rem;
            font-family: 'Inter', system-ui, sans-serif;
          }

          .client-inner {
            max-width: 500px;
            margin: 0 auto;
          }

          .client-header {
            text-align: center;
            margin-bottom: 2rem;
          }

          .logo-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            margin-bottom: 1rem;
          }

          .logo-emoji {
            font-size: 2rem;
          }

          .logo-text {
            font-size: 1.5rem;
            font-weight: 700;
            background: linear-gradient(135deg, var(--primary), #8b5cf6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }

          .client-title {
            font-size: 1.75rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
          }

          .client-subtitle {
            color: var(--text-secondary);
            font-size: 0.95rem;
          }

          .client-form {
            display: flex;
            gap: 0.75rem;
            margin-bottom: 1.5rem;
          }

          .client-input {
            flex: 1;
            padding: 1rem;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: var(--surface);
            color: var(--text);
            font-size: 1rem;
            transition: all 0.2s;
          }

          .client-input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
          }

          .btn {
            padding: 1rem 1.5rem;
            border: none;
            border-radius: 12px;
            font-size: 1.25rem;
            cursor: pointer;
            transition: all 0.2s;
          }

          .btn-primary {
            background: linear-gradient(135deg, var(--primary), #2563eb);
            color: white;
          }

          .btn-primary:hover:not(:disabled) {
            transform: scale(1.05);
          }

          .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .client-error {
            background: linear-gradient(135deg, var(--error), #dc2626);
            color: white;
            padding: 1rem;
            border-radius: 12px;
            margin-bottom: 1.5rem;
            text-align: center;
          }

          .order-result {
            animation: fadeIn 0.3s ease;
          }

          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }

          .status-hero {
            background: var(--surface);
            border-radius: 20px;
            padding: 2rem;
            text-align: center;
            border-left: 4px solid;
            margin-bottom: 1.5rem;
          }

          .status-icon {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2.5rem;
            margin: 0 auto 1rem;
          }

          .status-label {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
          }

          .status-description {
            color: var(--text-secondary);
            margin-bottom: 1rem;
          }

          .eta-display {
            background: rgba(59, 130, 246, 0.1);
            border-radius: 12px;
            padding: 1rem;
            margin-top: 1rem;
          }

          .eta-time {
            font-size: 2rem;
            font-weight: 700;
            color: var(--primary);
          }

          .eta-distance {
            color: var(--text-secondary);
            font-size: 0.9rem;
          }

          .auto-refresh-badge {
            background: rgba(139, 92, 246, 0.2);
            color: #a78bfa;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            font-size: 0.8rem;
            margin-top: 1rem;
            display: inline-block;
          }

          .timeline {
            background: var(--surface);
            border-radius: 16px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
          }

          .timeline-track {
            height: 6px;
            background: rgba(255,255,255,0.1);
            border-radius: 3px;
            margin-bottom: 1rem;
            overflow: hidden;
          }

          .timeline-progress {
            height: 100%;
            border-radius: 3px;
            transition: width 0.5s ease;
          }

          .timeline-steps {
            display: flex;
            justify-content: space-between;
          }

          .timeline-step {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
            opacity: 0.4;
            transition: opacity 0.3s;
          }

          .timeline-step.active {
            opacity: 1;
          }

          .timeline-step.current {
            transform: scale(1.1);
          }

          .step-dot {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: var(--border);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1rem;
          }

          .step-label {
            font-size: 0.7rem;
            color: var(--text-secondary);
            text-align: center;
          }

          .order-details {
            background: var(--surface);
            border-radius: 16px;
            padding: 1.5rem;
          }

          .order-details h4 {
            margin-bottom: 1rem;
            font-size: 1rem;
            color: var(--text-secondary);
          }

          .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 0.75rem 0;
            border-bottom: 1px solid var(--border);
          }

          .detail-row:last-child {
            border-bottom: none;
          }

          .detail-label {
            color: var(--text-secondary);
            font-size: 0.9rem;
          }

          .detail-value {
            font-weight: 500;
            text-align: right;
          }

          .client-footer {
            text-align: center;
            margin-top: 2rem;
            color: var(--text-secondary);
            font-size: 0.85rem;
          }
        `}</style>
      </div>
    </div>
  );
}

export default App;
