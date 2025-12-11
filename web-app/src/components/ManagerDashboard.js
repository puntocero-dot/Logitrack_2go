import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';

const ManagerDashboard = () => {
    const [branchKpis, setBranchKpis] = useState([]);
    const [totals, setTotals] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);

    useEffect(() => {
        fetchKPIs();
        // Actualizar cada 30 segundos
        const interval = setInterval(fetchKPIs, 30000);
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
                    <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                        Última actualización: {lastUpdate}
                        <button
                            className="btn btn-secondary"
                            style={{ marginLeft: '1rem', padding: '0.25rem 0.75rem' }}
                            onClick={fetchKPIs}
                        >
                            🔄 Actualizar
                        </button>
                    </div>
                </div>

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
            </div>
        </div>
    );
};

export default ManagerDashboard;
