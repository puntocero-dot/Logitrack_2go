import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ORDER_API_BASE_URL } from '../config/api';

// Fix for default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker for visit points
const visitIcon = (index, status) => L.divIcon({
    className: 'custom-marker',
    html: `<div style="
        width: 32px;
        height: 32px;
        background: ${status === 'completed' ? '#10b981' : '#f59e0b'};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.9rem;
        font-weight: bold;
        color: white;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">${index}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
});

// Fit bounds component
function FitBounds({ points }) {
    const map = useMap();

    useEffect(() => {
        if (points.length > 0) {
            const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }
    }, [points, map]);

    return null;
}

const ManagerDashboard = () => {
    const [branchKpis, setBranchKpis] = useState([]);
    const [totals, setTotals] = useState(null);
    const [visitReport, setVisitReport] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [activeTab, setActiveTab] = useState('kpis'); // kpis, visits
    const [selectedCoordinator, setSelectedCoordinator] = useState(null);
    const [coordinatorVisits, setCoordinatorVisits] = useState([]);
    const [showRouteModal, setShowRouteModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        fetchKPIs();
        fetchVisitReport();
        const interval = setInterval(() => {
            fetchKPIs();
            fetchVisitReport();
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchKPIs = async () => {
        try {
            const res = await axios.get(`${ORDER_API_BASE_URL}/kpis/branches`);
            setBranchKpis(res.data.branches || []);
            setTotals(res.data.totals);
            setLastUpdate(new Date().toLocaleTimeString());
        } catch (err) {
            console.error('Error fetching KPIs', err);
        }
        setLoading(false);
    };

    const fetchVisitReport = async () => {
        try {
            const res = await axios.get(`${ORDER_API_BASE_URL}/visits?limit=50`);
            setVisitReport(res.data || []);
        } catch (err) {
            console.error('Error fetching visits', err);
        }
    };

    // Get unique coordinators from visits
    const getUniqueCoordinators = () => {
        const coordMap = {};
        visitReport.forEach(v => {
            const id = v.coordinator_id;
            if (!coordMap[id]) {
                coordMap[id] = {
                    id,
                    name: v.coordinator_name || `Coordinador #${id}`,
                    visitCount: 0,
                    lastVisit: null
                };
            }
            coordMap[id].visitCount++;
            if (!coordMap[id].lastVisit || new Date(v.check_in_time) > new Date(coordMap[id].lastVisit)) {
                coordMap[id].lastVisit = v.check_in_time;
            }
        });
        return Object.values(coordMap);
    };

    // Fetch visits for a specific coordinator on a specific date
    const fetchCoordinatorRoute = async (coordinatorId, coordName) => {
        setSelectedCoordinator({ id: coordinatorId, name: coordName });

        // Filter visits for this coordinator on the selected date
        const dayVisits = visitReport.filter(v => {
            const visitDate = new Date(v.check_in_time).toISOString().split('T')[0];
            return v.coordinator_id === coordinatorId && visitDate === selectedDate;
        }).sort((a, b) => new Date(a.check_in_time) - new Date(b.check_in_time));

        setCoordinatorVisits(dayVisits);
        setShowRouteModal(true);
    };

    // Get route points for the map
    const routePoints = useMemo(() => {
        return coordinatorVisits
            .filter(v => v.check_in_latitude && v.check_in_longitude)
            .map((v, i) => ({
                lat: v.check_in_latitude,
                lng: v.check_in_longitude,
                branch: v.branch_name,
                time: v.check_in_time,
                status: v.status,
                duration: v.duration_minutes,
                notes: v.notes,
                index: i + 1
            }));
    }, [coordinatorVisits]);

    const getStatusIndicator = (available, total) => {
        if (total === 0) return { color: '#6b7280', text: 'Sin motos' };
        const ratio = available / total;
        if (ratio >= 0.5) return { color: '#10b981', text: 'Normal' };
        if (ratio >= 0.2) return { color: '#f59e0b', text: 'Limitado' };
        return { color: '#ef4444', text: 'Crítico' };
    };

    const getPendingIndicator = (pending) => {
        if (pending === 0) return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
        if (pending <= 5) return { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' };
        return { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' };
    };

    const formatDuration = (minutes) => {
        if (!minutes) return '-';
        const hrs = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
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

    const formatTime = (dateStr) => {
        return new Date(dateStr).toLocaleTimeString('es-GT', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Calcular estadísticas de visitas por sucursal
    const getVisitStats = () => {
        const stats = {};
        visitReport.forEach(v => {
            if (!stats[v.branch_name]) {
                stats[v.branch_name] = { count: 0, totalDuration: 0, completed: 0 };
            }
            stats[v.branch_name].count++;
            if (v.duration_minutes) {
                stats[v.branch_name].totalDuration += v.duration_minutes;
            }
            if (v.status === 'completed') {
                stats[v.branch_name].completed++;
            }
        });
        return Object.entries(stats).map(([name, data]) => ({
            branch: name,
            visits: data.count,
            completed: data.completed,
            avgDuration: data.count > 0 ? Math.round(data.totalDuration / data.count) : 0
        }));
    };

    if (loading) {
        return (
            <div className="dashboard-shell">
                <div className="dashboard-inner">
                    <div style={{ textAlign: 'center', padding: '3rem' }}>
                        <div className="loading-spinner"></div>
                        <p>Cargando métricas...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-shell">
            <div className="dashboard-inner">
                <div className="dashboard-header">
                    <h2 className="dashboard-title">📊 Dashboard Gerencial</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                            Última actualización: {lastUpdate}
                        </span>
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.75rem' }}
                            onClick={() => { fetchKPIs(); fetchVisitReport(); }}
                        >
                            🔄 Actualizar
                        </button>
                    </div>
                </div>

                {/* TABS */}
                <div className="metrics-row" style={{ marginBottom: '1.5rem' }}>
                    <button
                        className={`btn ${activeTab === 'kpis' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab('kpis')}
                    >
                        📊 KPIs por Sucursal
                    </button>
                    <button
                        className={`btn ${activeTab === 'visits' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab('visits')}
                    >
                        📋 Reporte de Visitas
                    </button>
                    <button
                        className={`btn ${activeTab === 'routes' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab('routes')}
                    >
                        🗺️ Rutas de Coordinadores
                    </button>
                </div>

                {activeTab === 'kpis' && (
                    <>
                        {/* RESUMEN GENERAL */}
                        {totals && (
                            <div className="metrics-row" style={{ marginBottom: '2rem' }}>
                                <div className="metric-card">
                                    <div className="metric-label">Total Motos</div>
                                    <div className="metric-value">{totals.total_motos}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#10b981' }}>
                                        {totals.motos_available} disponibles
                                    </div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-label">Pedidos Pendientes</div>
                                    <div className="metric-value" style={{ color: totals.pending_orders > 0 ? '#f59e0b' : '#10b981' }}>
                                        {totals.pending_orders}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                                        {totals.assigned_orders} asignados
                                    </div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-label">Entregados Hoy</div>
                                    <div className="metric-value" style={{ color: '#10b981' }}>
                                        {totals.delivered_today}
                                    </div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-label">Visitas Hoy</div>
                                    <div className="metric-value">{totals.visits_today}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                                        coordinadores
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* MÉTRICAS POR SUCURSAL */}
                        <h3 style={{ marginBottom: '1rem' }}>📍 Estado por Sucursal</h3>
                        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
                            {branchKpis.map((branch) => {
                                const status = getStatusIndicator(branch.motos_available, branch.total_motos);
                                const pendingStyle = getPendingIndicator(branch.pending_orders);

                                return (
                                    <div
                                        key={branch.branch_id}
                                        className="form-card"
                                        style={{
                                            borderLeft: `4px solid ${status.color}`,
                                            padding: '1.25rem',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{branch.branch_name}</h4>
                                                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{branch.branch_code}</span>
                                            </div>
                                            <span
                                                className="badge-status"
                                                style={{ backgroundColor: status.color, color: '#fff' }}
                                            >
                                                {status.text}
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                                            <div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{branch.total_motos}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Motos</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                                                    {branch.motos_available}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Disponibles</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>
                                                    {branch.motos_in_route}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>En Ruta</div>
                                            </div>
                                            <div style={{ backgroundColor: pendingStyle.bg, borderRadius: '8px', padding: '0.25rem' }}>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: pendingStyle.color }}>
                                                    {branch.pending_orders}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Pendientes</div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                            <div>
                                                <span style={{ fontSize: '0.85rem' }}>
                                                    ✅ <strong>{branch.delivered_today}</strong> entregados hoy
                                                </span>
                                            </div>
                                            <div>
                                                <span style={{ fontSize: '0.85rem' }}>
                                                    📋 <strong>{branch.visits_today}</strong> visitas hoy
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {branchKpis.length === 0 && (
                            <div className="form-card" style={{ textAlign: 'center', color: '#9ca3af' }}>
                                No hay sucursales configuradas
                            </div>
                        )}

                        {/* ALERTAS */}
                        {branchKpis.some((b) => b.pending_orders > 5 || b.motos_available === 0) && (
                            <div className="form-card" style={{ borderLeft: '4px solid #ef4444', marginTop: '2rem' }}>
                                <h4 style={{ color: '#ef4444', marginBottom: '0.75rem' }}>⚠️ Alertas</h4>
                                <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                                    {branchKpis
                                        .filter((b) => b.pending_orders > 5)
                                        .map((b) => (
                                            <li key={`pending-${b.branch_id}`}>
                                                <strong>{b.branch_name}</strong>: {b.pending_orders} pedidos pendientes
                                            </li>
                                        ))}
                                    {branchKpis
                                        .filter((b) => b.motos_available === 0 && b.total_motos > 0)
                                        .map((b) => (
                                            <li key={`motos-${b.branch_id}`}>
                                                <strong>{b.branch_name}</strong>: Sin motos disponibles
                                            </li>
                                        ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'visits' && (
                    <>
                        {/* ESTADÍSTICAS DE VISITAS POR SUCURSAL */}
                        <h3 style={{ marginBottom: '1rem' }}>📊 Resumen de Visitas por Sucursal</h3>
                        <div className="metrics-row" style={{ marginBottom: '2rem' }}>
                            {getVisitStats().map((stat) => (
                                <div key={stat.branch} className="metric-card">
                                    <div className="metric-label">{stat.branch}</div>
                                    <div className="metric-value">{stat.visits}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                                        {stat.completed} completadas | ⏱️ {formatDuration(stat.avgDuration)} promedio
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* TABLA DE HISTORIAL DE VISITAS */}
                        <h3 style={{ marginBottom: '1rem' }}>📋 Historial de Visitas de Coordinadores</h3>
                        <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1rem' }}>
                            💡 Haz click en un coordinador para ver su ruta del día
                        </p>
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Coordinador</th>
                                        <th>Sucursal</th>
                                        <th>Duración</th>
                                        <th>Estado</th>
                                        <th>Notas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visitReport.map((v) => (
                                        <tr
                                            key={v.id}
                                            onClick={() => {
                                                setSelectedDate(new Date(v.check_in_time).toISOString().split('T')[0]);
                                                fetchCoordinatorRoute(v.coordinator_id, v.coordinator_name || `Coordinador #${v.coordinator_id}`);
                                            }}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <td>{formatDate(v.check_in_time)}</td>
                                            <td style={{ color: '#3b82f6', fontWeight: 500 }}>
                                                {v.coordinator_name || `Coord. #${v.coordinator_id}`}
                                                <span style={{ marginLeft: '8px', fontSize: '0.85rem' }}>📍</span>
                                            </td>
                                            <td>{v.branch_name}</td>
                                            <td>
                                                <span style={{
                                                    color: v.duration_minutes > 60 ? '#10b981' :
                                                        v.duration_minutes > 30 ? '#f59e0b' : '#ef4444'
                                                }}>
                                                    {formatDuration(v.duration_minutes)}
                                                </span>
                                            </td>
                                            <td>
                                                <span
                                                    className={`badge-status ${v.status === 'completed' ? 'badge-success' : 'badge-warning'}`}
                                                >
                                                    {v.status === 'completed' ? '✅ Completada' : '🔄 En progreso'}
                                                </span>
                                            </td>
                                            <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {v.notes || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                    {visitReport.length === 0 && (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', color: '#9ca3af' }}>
                                                Sin visitas registradas
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {activeTab === 'routes' && (
                    <>
                        <h3 style={{ marginBottom: '1rem' }}>🗺️ Rutas de Coordinadores</h3>
                        <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1rem' }}>
                            Selecciona un coordinador para ver su ruta del día
                        </p>

                        {/* Date selector */}
                        <div className="form-card" style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                <label style={{ color: '#9ca3af' }}>📅 Fecha:</label>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="form-input"
                                    style={{ width: 'auto' }}
                                />
                            </div>
                        </div>

                        {/* Coordinator cards */}
                        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                            {getUniqueCoordinators().map((coord) => {
                                const dayVisits = visitReport.filter(v => {
                                    const visitDate = new Date(v.check_in_time).toISOString().split('T')[0];
                                    return v.coordinator_id === coord.id && visitDate === selectedDate;
                                });

                                return (
                                    <div
                                        key={coord.id}
                                        className="form-card"
                                        style={{
                                            cursor: 'pointer',
                                            borderLeft: dayVisits.length > 0 ? '4px solid #10b981' : '4px solid #6b7280',
                                            transition: 'transform 0.2s, box-shadow 0.2s'
                                        }}
                                        onClick={() => fetchCoordinatorRoute(coord.id, coord.name)}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-2px)';
                                            e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = 'none';
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{
                                                width: '50px',
                                                height: '50px',
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '1.3rem'
                                            }}>
                                                👤
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{coord.name}</div>
                                                <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                                                    {dayVisits.length} visitas el {selectedDate}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{
                                                    fontSize: '1.5rem',
                                                    fontWeight: 'bold',
                                                    color: dayVisits.length > 0 ? '#10b981' : '#6b7280'
                                                }}>
                                                    {dayVisits.length}
                                                </div>
                                                <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>
                                                    Ver Ruta
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {getUniqueCoordinators().length === 0 && (
                            <div className="form-card" style={{ textAlign: 'center', color: '#9ca3af' }}>
                                No hay coordinadores con visitas registradas
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ROUTE MODAL */}
            {showRouteModal && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.8)',
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem'
                    }}
                    onClick={() => setShowRouteModal(false)}
                >
                    <div
                        style={{
                            background: '#0f1d3b',
                            borderRadius: '16px',
                            width: '100%',
                            maxWidth: '900px',
                            maxHeight: '90vh',
                            overflow: 'hidden',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <h3 style={{ margin: 0 }}>🗺️ Ruta de {selectedCoordinator?.name}</h3>
                                <p style={{ margin: '0.25rem 0 0', color: '#9ca3af', fontSize: '0.9rem' }}>
                                    📅 {new Date(selectedDate).toLocaleDateString('es-GT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </p>
                            </div>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowRouteModal(false)}
                                style={{ padding: '8px 16px' }}
                            >
                                ✕ Cerrar
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(90vh - 80px)' }}>
                            {/* Map */}
                            <div style={{ flex: 1, minHeight: '300px' }}>
                                {routePoints.length > 0 ? (
                                    <MapContainer
                                        center={[routePoints[0].lat, routePoints[0].lng]}
                                        zoom={13}
                                        style={{ width: '100%', height: '100%' }}
                                    >
                                        <TileLayer
                                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        />
                                        <FitBounds points={routePoints} />

                                        {/* Route line */}
                                        <Polyline
                                            positions={routePoints.map(p => [p.lat, p.lng])}
                                            color="#3b82f6"
                                            weight={4}
                                            opacity={0.8}
                                            dashArray="10, 10"
                                        />

                                        {/* Visit markers */}
                                        {routePoints.map((point, index) => (
                                            <Marker
                                                key={index}
                                                position={[point.lat, point.lng]}
                                                icon={visitIcon(point.index, point.status)}
                                            >
                                                <Popup>
                                                    <div style={{ minWidth: '180px' }}>
                                                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                                                            📍 Visita #{point.index}
                                                        </div>
                                                        <div style={{ color: '#333' }}>{point.branch}</div>
                                                        <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
                                                            🕐 {formatTime(point.time)}
                                                        </div>
                                                        {point.duration && (
                                                            <div style={{ fontSize: '0.85rem', color: '#666' }}>
                                                                ⏱️ {formatDuration(point.duration)}
                                                            </div>
                                                        )}
                                                        {point.notes && (
                                                            <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '4px', fontStyle: 'italic' }}>
                                                                "{point.notes}"
                                                            </div>
                                                        )}
                                                    </div>
                                                </Popup>
                                            </Marker>
                                        ))}
                                    </MapContainer>
                                ) : (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: '100%',
                                        background: '#112250',
                                        color: '#9ca3af'
                                    }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🗺️</p>
                                            <p>No hay visitas con ubicación para esta fecha</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Timeline */}
                            <div style={{
                                maxHeight: '200px',
                                overflowY: 'auto',
                                padding: '1rem 1.5rem',
                                borderTop: '1px solid rgba(255,255,255,0.1)',
                                background: '#112250'
                            }}>
                                <h4 style={{ margin: '0 0 0.75rem' }}>📋 Detalle de Visitas ({coordinatorVisits.length})</h4>
                                {coordinatorVisits.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {coordinatorVisits.map((v, i) => (
                                            <div
                                                key={v.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '1rem',
                                                    padding: '0.5rem',
                                                    background: 'rgba(255,255,255,0.05)',
                                                    borderRadius: '8px'
                                                }}
                                            >
                                                <div style={{
                                                    width: '28px',
                                                    height: '28px',
                                                    borderRadius: '50%',
                                                    background: v.status === 'completed' ? '#10b981' : '#f59e0b',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 'bold',
                                                    flexShrink: 0
                                                }}>
                                                    {i + 1}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 500 }}>{v.branch_name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                                                        {formatTime(v.check_in_time)} • {formatDuration(v.duration_minutes)}
                                                    </div>
                                                </div>
                                                <span className={`badge-status ${v.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                                                    {v.status === 'completed' ? '✅' : '🔄'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ color: '#9ca3af', margin: 0 }}>Sin visitas registradas para esta fecha</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManagerDashboard;
