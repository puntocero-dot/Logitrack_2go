import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';

// Haversine formula to calculate distance in meters
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const MAX_DISTANCE_METERS = 50; // Maximum allowed distance for check-in (50 meters)

const CoordinatorDashboard = () => {
    const { user } = useAuth();
    const [activeVisit, setActiveVisit] = useState(null);
    const [branches, setBranches] = useState([]);
    const [checklistTemplates, setChecklistTemplates] = useState([]);
    const [checklistResponses, setChecklistResponses] = useState({});
    const [visitHistory, setVisitHistory] = useState([]);
    const [location, setLocation] = useState(null);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [notes, setNotes] = useState('');
    const [message, setMessage] = useState({ type: '', text: '' });
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState('main'); // main, checklist, history
    const [distanceToBranch, setDistanceToBranch] = useState(null);

    // Get coordinator ID from logged-in user
    const coordinatorId = user?.id;

    // Obtener ubicación GPS
    const getLocation = useCallback(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLocation({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    });
                },
                (error) => {
                    setMessage({ type: 'error', text: 'Error GPS: ' + error.message });
                },
                { enableHighAccuracy: true }
            );
        }
    }, []);

    // Calculate distance when branch or location changes
    useEffect(() => {
        if (selectedBranch && location) {
            const branch = branches.find(b => b.id === parseInt(selectedBranch));
            if (branch && branch.latitude && branch.longitude) {
                const dist = calculateDistance(
                    location.latitude,
                    location.longitude,
                    branch.latitude,
                    branch.longitude
                );
                setDistanceToBranch(Math.round(dist));
            } else {
                setDistanceToBranch(null);
            }
        } else {
            setDistanceToBranch(null);
        }
    }, [selectedBranch, location, branches]);

    useEffect(() => {
        getLocation();
        fetchBranches();
        if (coordinatorId) {
            fetchActiveVisit();
            fetchVisitHistory();
        }
        fetchChecklistTemplates();
    }, [getLocation, coordinatorId]);

    const fetchBranches = async () => {
        try {
            const res = await axios.get(`${ORDER_API_BASE_URL}/branches`);
            setBranches(res.data || []);
        } catch (err) {
            console.error('Error fetching branches', err);
        }
    };

    const fetchActiveVisit = async () => {
        if (!coordinatorId) return;
        try {
            const res = await axios.get(`${ORDER_API_BASE_URL}/visits/active?coordinator_id=${coordinatorId}`);
            setActiveVisit(res.data.active_visit);
            if (res.data.active_visit) {
                fetchVisitChecklist(res.data.active_visit.id);
            }
        } catch (err) {
            console.error('Error fetching active visit', err);
        }
    };

    const fetchChecklistTemplates = async () => {
        try {
            const res = await axios.get(`${ORDER_API_BASE_URL}/checklist/templates`);
            setChecklistTemplates(res.data || []);
        } catch (err) {
            console.error('Error fetching checklist', err);
        }
    };

    const fetchVisitHistory = async () => {
        if (!coordinatorId) return;
        try {
            const res = await axios.get(`${ORDER_API_BASE_URL}/visits?coordinator_id=${coordinatorId}&limit=20`);
            setVisitHistory(res.data || []);
        } catch (err) {
            console.error('Error fetching history', err);
        }
    };

    const fetchVisitChecklist = async (visitId) => {
        try {
            const res = await axios.get(`${ORDER_API_BASE_URL}/visits/${visitId}/checklist`);
            const responses = {};
            (res.data || []).forEach((r) => {
                responses[r.template_id] = r.response_boolean;
            });
            setChecklistResponses(responses);
        } catch (err) {
            console.error('Error fetching visit checklist', err);
        }
    };

    const handleCheckIn = async () => {
        if (!selectedBranch) {
            setMessage({ type: 'error', text: 'Selecciona una sucursal' });
            return;
        }
        if (!location) {
            setMessage({ type: 'error', text: 'Esperando ubicación GPS...' });
            getLocation();
            return;
        }
        if (!coordinatorId) {
            setMessage({ type: 'error', text: 'Error: Usuario no identificado' });
            return;
        }

        // Check distance validation
        if (distanceToBranch !== null && distanceToBranch > MAX_DISTANCE_METERS) {
            const confirmFar = window.confirm(
                `⚠️ ADVERTENCIA: Estás a ${distanceToBranch} metros de la sucursal.\n\n` +
                `El límite permitido es ${MAX_DISTANCE_METERS} metros.\n\n` +
                `¿Deseas continuar de todos modos? Esta acción quedará registrada.`
            );
            if (!confirmFar) {
                setMessage({
                    type: 'error',
                    text: `❌ Check-in cancelado. Acércate a menos de ${MAX_DISTANCE_METERS}m de la sucursal.`
                });
                return;
            }
        }

        setLoading(true);
        try {
            const response = await axios.post(`${ORDER_API_BASE_URL}/visits/check-in?coordinator_id=${coordinatorId}`, {
                branch_id: parseInt(selectedBranch),
                latitude: location.latitude,
                longitude: location.longitude,
                notes: notes,
            });

            const distance = response.data.distance_meters;
            const isWithin = response.data.is_within_branch;

            if (distance > MAX_DISTANCE_METERS) {
                setMessage({
                    type: 'warning',
                    text: `⚠️ Check-in registrado a ${distance}m de la sucursal (fuera del rango permitido)`
                });
            } else {
                setMessage({ type: 'success', text: `✅ Check-in exitoso (${distance}m de la sucursal)` });
            }
            setNotes('');
            fetchActiveVisit();
        } catch (err) {
            setMessage({ type: 'error', text: 'Error: ' + (err.response?.data?.error || err.message) });
        }
        setLoading(false);
    };

    const handleCheckOut = async () => {
        if (!activeVisit) return;

        setLoading(true);
        try {
            // Primero guardar el checklist
            await saveChecklist();

            // Luego hacer check-out
            await axios.put(`${ORDER_API_BASE_URL}/visits/${activeVisit.id}/check-out`, {
                latitude: location?.latitude,
                longitude: location?.longitude,
                notes: notes,
            });
            setMessage({ type: 'success', text: '✅ Check-out exitoso. Visita completada.' });
            setActiveVisit(null);
            setChecklistResponses({});
            setNotes('');
            fetchVisitHistory();
        } catch (err) {
            setMessage({ type: 'error', text: 'Error: ' + (err.response?.data?.error || err.message) });
        }
        setLoading(false);
    };

    const saveChecklist = async () => {
        if (!activeVisit) return;

        const responses = Object.entries(checklistResponses).map(([templateId, value]) => ({
            template_id: parseInt(templateId),
            response_type: 'boolean',
            response_boolean: value,
        }));

        try {
            await axios.post(`${ORDER_API_BASE_URL}/visits/${activeVisit.id}/checklist`, responses);
        } catch (err) {
            console.error('Error saving checklist', err);
        }
    };

    const handleChecklistChange = (templateId, value) => {
        setChecklistResponses((prev) => ({
            ...prev,
            [templateId]: value,
        }));
    };

    const formatDuration = (minutes) => {
        if (!minutes) return '-';
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleString('es-GT', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Calcular tiempo en sucursal
    const getElapsedTime = () => {
        if (!activeVisit) return null;
        const start = new Date(activeVisit.check_in_time);
        const now = new Date();
        const diff = Math.floor((now - start) / 60000); // en minutos
        return formatDuration(diff);
    };

    // Get distance status color
    const getDistanceStatus = () => {
        if (distanceToBranch === null) return null;
        if (distanceToBranch <= 20) return { color: '#10b981', text: '✅ Dentro del rango', icon: '🟢' };
        if (distanceToBranch <= MAX_DISTANCE_METERS) return { color: '#f59e0b', text: '⚠️ En el límite', icon: '🟡' };
        return { color: '#ef4444', text: '❌ Fuera del rango', icon: '🔴' };
    };

    return (
        <div className="dashboard-shell">
            <div className="dashboard-inner">
                <div className="dashboard-header">
                    <h2 className="dashboard-title">📋 Panel de Coordinador</h2>
                    <div className="coordinator-info" style={{ fontSize: '0.9rem', color: '#9ca3af' }}>
                        👤 {user?.name || user?.email || 'Coordinador'} (ID: {coordinatorId})
                    </div>
                    <div className="metrics-row">
                        <button
                            className={`btn ${view === 'main' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setView('main')}
                        >
                            {activeVisit ? '🔴 Visita Activa' : 'Nueva Visita'}
                        </button>
                        <button
                            className={`btn ${view === 'history' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setView('history')}
                        >
                            📜 Historial
                        </button>
                    </div>
                </div>

                {message.text && (
                    <div className={`alert ${message.type === 'error' ? 'alert--error' : message.type === 'warning' ? 'alert--warning' : 'alert--success'}`}
                        style={message.type === 'warning' ? { backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' } : {}}>
                        {message.text}
                    </div>
                )}

                {view === 'main' && (
                    <>
                        {/* VISITA ACTIVA */}
                        {activeVisit ? (
                            <div className="form-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                                <h3>🔴 Visita en Progreso</h3>
                                <div className="metrics-row" style={{ marginBottom: '1rem' }}>
                                    <div className="metric-card">
                                        <div className="metric-label">Sucursal</div>
                                        <div className="metric-value">{activeVisit.branch_name}</div>
                                    </div>
                                    <div className="metric-card">
                                        <div className="metric-label">Tiempo en Sucursal</div>
                                        <div className="metric-value">{getElapsedTime()}</div>
                                    </div>
                                    <div className="metric-card">
                                        <div className="metric-label">Distancia Check-in</div>
                                        <div className="metric-value" style={{
                                            color: activeVisit.distance_to_branch_meters > MAX_DISTANCE_METERS ? '#ef4444' : '#10b981'
                                        }}>
                                            {activeVisit.distance_to_branch_meters
                                                ? `${activeVisit.distance_to_branch_meters}m`
                                                : '-'}
                                        </div>
                                    </div>
                                </div>

                                {activeVisit.distance_to_branch_meters > MAX_DISTANCE_METERS && (
                                    <div style={{
                                        backgroundColor: '#fef2f2',
                                        color: '#dc2626',
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        marginBottom: '1rem',
                                        border: '1px solid #fecaca'
                                    }}>
                                        ⚠️ Esta visita se registró a {activeVisit.distance_to_branch_meters}m de la sucursal (fuera del rango de {MAX_DISTANCE_METERS}m)
                                    </div>
                                )}

                                {/* CHECKLIST */}
                                <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>✅ Checklist de Auditoría</h4>
                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                    {checklistTemplates.map((item) => (
                                        <label
                                            key={item.id}
                                            className="form-card"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '1rem',
                                                padding: '0.75rem 1rem',
                                                cursor: 'pointer',
                                                backgroundColor: checklistResponses[item.id] === true
                                                    ? 'rgba(16, 185, 129, 0.1)'
                                                    : checklistResponses[item.id] === false
                                                        ? 'rgba(239, 68, 68, 0.1)'
                                                        : undefined,
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checklistResponses[item.id] === true}
                                                onChange={(e) => handleChecklistChange(item.id, e.target.checked)}
                                                style={{ width: '1.5rem', height: '1.5rem' }}
                                            />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: '500' }}>
                                                    {item.name}
                                                    {item.is_required && (
                                                        <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>*</span>
                                                    )}
                                                </div>
                                                {item.description && (
                                                    <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                                                        {item.description}
                                                    </div>
                                                )}
                                            </div>
                                        </label>
                                    ))}
                                </div>

                                {/* NOTAS Y CHECK-OUT */}
                                <div style={{ marginTop: '1.5rem' }}>
                                    <textarea
                                        placeholder="Notas adicionales sobre la visita..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="form-input"
                                        style={{ minHeight: '80px', resize: 'vertical' }}
                                    />
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleCheckOut}
                                        disabled={loading}
                                        style={{ marginTop: '1rem', width: '100%' }}
                                    >
                                        {loading ? 'Procesando...' : '🚪 Finalizar Visita (Check-out)'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* NUEVA VISITA */
                            <div className="form-card">
                                <h3>🆕 Iniciar Nueva Visita</h3>
                                <div style={{ display: 'grid', gap: '1rem' }}>
                                    <select
                                        value={selectedBranch}
                                        onChange={(e) => setSelectedBranch(e.target.value)}
                                        className="form-select"
                                    >
                                        <option value="">-- Selecciona Sucursal --</option>
                                        {branches.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.name} ({b.code})
                                            </option>
                                        ))}
                                    </select>

                                    {/* Distance indicator */}
                                    {selectedBranch && location && (
                                        <div style={{
                                            backgroundColor: distanceToBranch === null ? '#1f2937' :
                                                distanceToBranch <= 20 ? 'rgba(16, 185, 129, 0.1)' :
                                                    distanceToBranch <= MAX_DISTANCE_METERS ? 'rgba(245, 158, 11, 0.1)' :
                                                        'rgba(239, 68, 68, 0.1)',
                                            padding: '1rem',
                                            borderRadius: '8px',
                                            border: distanceToBranch !== null ?
                                                `1px solid ${getDistanceStatus()?.color}` : '1px solid rgba(255,255,255,0.1)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div>
                                                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>
                                                        📏 Distancia a sucursal: <span style={{ color: getDistanceStatus()?.color }}>
                                                            {distanceToBranch !== null ? `${distanceToBranch}m` : 'Calculando...'}
                                                        </span>
                                                    </div>
                                                    {distanceToBranch !== null && (
                                                        <div style={{
                                                            fontSize: '0.9rem',
                                                            color: getDistanceStatus()?.color,
                                                            marginTop: '0.25rem'
                                                        }}>
                                                            {getDistanceStatus()?.icon} {getDistanceStatus()?.text} (límite: {MAX_DISTANCE_METERS}m)
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {distanceToBranch !== null && distanceToBranch > MAX_DISTANCE_METERS && (
                                                <div style={{
                                                    marginTop: '0.75rem',
                                                    padding: '0.5rem',
                                                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                                    borderRadius: '4px',
                                                    fontSize: '0.85rem',
                                                    color: '#fca5a5'
                                                }}>
                                                    ⚠️ Estás muy lejos de la sucursal. El check-in se permitirá pero quedará registrada la distancia.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="form-card" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <span style={{ fontSize: '1.5rem' }}>📍</span>
                                                {location ? (
                                                    <div>
                                                        <div style={{ fontWeight: '500', color: '#10b981' }}>Ubicación GPS activa</div>
                                                        <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                                                            {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ color: '#f59e0b' }}>Obteniendo ubicación...</div>
                                                )}
                                            </div>
                                            <button
                                                className="btn btn-secondary"
                                                onClick={getLocation}
                                                style={{ padding: '0.5rem 1rem' }}
                                            >
                                                🔄 Actualizar
                                            </button>
                                        </div>
                                    </div>

                                    <textarea
                                        placeholder="Notas iniciales (opcional)"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="form-input"
                                    />

                                    <button
                                        className="btn btn-primary"
                                        onClick={handleCheckIn}
                                        disabled={loading || !location}
                                        style={{
                                            width: '100%',
                                            backgroundColor: distanceToBranch !== null && distanceToBranch > MAX_DISTANCE_METERS ? '#f59e0b' : undefined
                                        }}
                                    >
                                        {loading ? 'Procesando...' :
                                            distanceToBranch !== null && distanceToBranch > MAX_DISTANCE_METERS ?
                                                '⚠️ Hacer Check-in (Fuera de Rango)' : '📍 Hacer Check-in'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {view === 'history' && (
                    <div className="table-wrapper">
                        <h3>📜 Historial de Visitas</h3>
                        <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1rem' }}>
                            Mostrando visitas de: {user?.name || user?.email}
                        </p>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Sucursal</th>
                                    <th>Distancia</th>
                                    <th>Duración</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visitHistory.map((v) => (
                                    <tr key={v.id}>
                                        <td>{formatDate(v.check_in_time)}</td>
                                        <td>{v.branch_name}</td>
                                        <td style={{
                                            color: v.distance_to_branch_meters > MAX_DISTANCE_METERS ? '#ef4444' : '#10b981'
                                        }}>
                                            {v.distance_to_branch_meters ? `${v.distance_to_branch_meters}m` : '-'}
                                        </td>
                                        <td>{formatDuration(v.duration_minutes)}</td>
                                        <td>
                                            <span
                                                className={`badge-status ${v.status === 'completed' ? 'badge-success' : 'badge-warning'
                                                    }`}
                                            >
                                                {v.status === 'completed' ? 'Completada' : 'En progreso'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {visitHistory.length === 0 && (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', color: '#9ca3af' }}>
                                            Sin visitas registradas
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CoordinatorDashboard;
