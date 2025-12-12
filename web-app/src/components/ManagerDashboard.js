import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';

const ManagerDashboard = () => {
    const [branchKpis, setBranchKpis] = useState([]);
    const [totals, setTotals] = useState(null);
    const [visitReport, setVisitReport] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [activeTab, setActiveTab] = useState('kpis'); // kpis, visits

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
                                        <tr key={v.id}>
                                            <td>{formatDate(v.check_in_time)}</td>
                                            <td>{v.coordinator_name || `Coord. #${v.coordinator_id}`}</td>
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

                        {/* INFO DE CHECKLIST */}
                        <div className="form-card" style={{ marginTop: '2rem', borderLeft: '4px solid #3b82f6' }}>
                            <h4>📝 Checklist de Revisión de Motos</h4>
                            <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
                                Los coordinadores completan el siguiente checklist durante cada visita:
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.5rem' }}>
                                <div>✅ Cantidad de motos operativas</div>
                                <div>✅ Documentos al día</div>
                                <div>✅ Horario de entrada cumplido</div>
                                <div>✅ Uniforme y equipo completo</div>
                                <div>✅ Pedidos entregados a tiempo</div>
                                <div>✅ Luces funcionando</div>
                                <div>✅ Frenos en buen estado</div>
                                <div>✅ App de rider funcionando</div>
                                <div>✅ GPS/Tracking activo</div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ManagerDashboard;

