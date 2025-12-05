import React, { useState, useEffect } from 'react';
import useShiftTracking from '../hooks/useShiftTracking';
import DriverRouteMap from './DriverRouteMap';
import './DriverShiftPanel.css';

/**
 * Panel de control de turnos para drivers
 * Gestiona inicio/fin de turno, tracking GPS automático, y visualización de rutas
 * 
 * @param {number} driverId - ID del driver
 * @param {string} driverName - Nombre del driver
 * @param {string} branch - Sucursal del driver
 */
const DriverShiftPanel = ({ driverId, driverName, branch = 'central' }) => {
  const {
    activeShift,
    isTracking,
    error,
    lastPosition,
    trackingStats,
    startShift,
    endShift,
    addRoutePoint,
    getDriverShifts,
    getShiftRoute,
    clearError,
  } = useShiftTracking(driverId, branch);

  const [shiftHistory, setShiftHistory] = useState([]);
  const [selectedShift, setSelectedShift] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [endNotes, setEndNotes] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Cargar historial de turnos al montar
  useEffect(() => {
    loadShiftHistory();
  }, []);

  // Cargar ruta del turno activo
  useEffect(() => {
    if (activeShift) {
      loadActiveShiftRoute();
    }
  }, [activeShift, trackingStats.pointsRecorded]);

  const loadShiftHistory = async () => {
    try {
      const data = await getDriverShifts(null, 10);
      setShiftHistory(data.shifts || []);
    } catch (err) {
      console.error('Error al cargar historial:', err);
    }
  };

  const loadActiveShiftRoute = async () => {
    if (!activeShift) return;
    try {
      const data = await getShiftRoute(activeShift.id);
      setRoutePoints(data.points || []);
    } catch (err) {
      console.error('Error al cargar ruta activa:', err);
    }
  };

  const handleStartShift = async () => {
    setLoading(true);
    clearError();
    try {
      await startShift();
      await loadShiftHistory();
    } catch (err) {
      console.error('Error al iniciar turno:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEndShift = async () => {
    if (!window.confirm('¿Finalizar turno actual?')) return;

    setLoading(true);
    clearError();
    try {
      await endShift(endNotes);
      setEndNotes('');
      setRoutePoints([]);
      await loadShiftHistory();
    } catch (err) {
      console.error('Error al finalizar turno:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDelivery = async (orderId = null) => {
    if (!activeShift) return;
    setLoading(true);
    try {
      await addRoutePoint('DELIVERY', orderId);
    } catch (err) {
      console.error('Error al marcar entrega:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewShiftRoute = async (shift) => {
    setLoading(true);
    try {
      const data = await getShiftRoute(shift.id);
      setSelectedShift(shift);
      setRoutePoints(data.points || []);
      setShowHistory(false);
    } catch (err) {
      console.error('Error al cargar ruta:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (startTime, endTime) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end - start;
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="driver-shift-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="driver-info">
          <h2>Panel de Turnos</h2>
          <p className="driver-name">👤 {driverName}</p>
          <p className="driver-branch">📍 Sucursal: {branch}</p>
        </div>
        <div className="panel-actions">
          <button
            className="btn-history"
            onClick={() => setShowHistory(!showHistory)}
          >
            📋 {showHistory ? 'Ocultar' : 'Ver'} Historial
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert alert-error">
          <span>⚠️ {error}</span>
          <button onClick={clearError} className="alert-close">×</button>
        </div>
      )}

      {/* Active Shift Card */}
      {activeShift ? (
        <div className="shift-card active-shift">
          <div className="shift-card-header">
            <h3>🟢 Turno Activo</h3>
            <span className="shift-status-badge active">EN CURSO</span>
          </div>
          <div className="shift-stats-grid">
            <div className="stat-item">
              <span className="stat-label">Inicio</span>
              <span className="stat-value">{formatDateTime(activeShift.start_time)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Duración</span>
              <span className="stat-value">{formatDuration(activeShift.start_time, null)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Entregas</span>
              <span className="stat-value">{activeShift.total_deliveries}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Puntos GPS</span>
              <span className="stat-value">{trackingStats.pointsRecorded}</span>
            </div>
          </div>

          {lastPosition && (
            <div className="last-position">
              <p>📍 Última posición: {lastPosition.latitude.toFixed(6)}, {lastPosition.longitude.toFixed(6)}</p>
              <small>Actualizado: {trackingStats.lastUpdate?.toLocaleTimeString()}</small>
            </div>
          )}

          <div className="shift-actions">
            <button
              className="btn btn-warning"
              onClick={handleMarkDelivery}
              disabled={loading}
            >
              📦 Marcar Entrega
            </button>
            <button
              className="btn btn-danger"
              onClick={handleEndShift}
              disabled={loading}
            >
              🏁 Finalizar Turno
            </button>
          </div>

          <div className="end-notes-input">
            <label>Notas al finalizar (opcional):</label>
            <textarea
              value={endNotes}
              onChange={(e) => setEndNotes(e.target.value)}
              placeholder="Ej: Completé 5 entregas sin incidentes"
              rows={2}
            />
          </div>
        </div>
      ) : (
        <div className="shift-card no-shift">
          <div className="no-shift-content">
            <h3>No hay turno activo</h3>
            <p>Inicia un turno para comenzar el tracking GPS automático</p>
            <button
              className="btn btn-primary btn-large"
              onClick={handleStartShift}
              disabled={loading}
            >
              {loading ? '⏳ Iniciando...' : '🚀 Iniciar Turno'}
            </button>
          </div>
        </div>
      )}

      {/* Route Map */}
      {(activeShift || selectedShift) && routePoints.length > 0 && (
        <DriverRouteMap
          shiftId={activeShift?.id || selectedShift?.id}
          routePoints={routePoints}
          autoRefresh={!!activeShift}
          onRefresh={loadActiveShiftRoute}
        />
      )}

      {/* Shift History */}
      {showHistory && (
        <div className="shift-history">
          <h3>📋 Historial de Turnos</h3>
          {shiftHistory.length === 0 ? (
            <p className="no-history">No hay turnos registrados</p>
          ) : (
            <div className="history-list">
              {shiftHistory.map((shift) => (
                <div key={shift.id} className="history-item">
                  <div className="history-item-header">
                    <span className="history-date">{formatDateTime(shift.start_time)}</span>
                    <span className={`shift-status-badge ${shift.status.toLowerCase()}`}>
                      {shift.status}
                    </span>
                  </div>
                  <div className="history-item-stats">
                    <span>⏱️ {formatDuration(shift.start_time, shift.end_time)}</span>
                    <span>📦 {shift.total_deliveries} entregas</span>
                    <span>📏 {shift.total_distance_km} km</span>
                  </div>
                  <button
                    className="btn-view-route"
                    onClick={() => handleViewShiftRoute(shift)}
                    disabled={loading}
                  >
                    🗺️ Ver Ruta
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DriverShiftPanel;
