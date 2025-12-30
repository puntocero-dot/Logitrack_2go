import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

const ReportsDashboard = () => {
    // Data state
    const [orders, setOrders] = useState([]);
    const [motos, setMotos] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const today = new Date().toISOString().split('T')[0];
    const [dateFrom, setDateFrom] = useState(today);
    const [dateTo, setDateTo] = useState(today);
    const [selectedBranch, setSelectedBranch] = useState('all');
    const [selectedMoto, setSelectedMoto] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all');

    // View mode: 'dashboard' or 'table'
    const [viewMode, setViewMode] = useState('dashboard');

    // Selected metrics for custom dashboard
    const [selectedMetrics, setSelectedMetrics] = useState([
        'orders_by_status', 'orders_by_day', 'delivery_times', 'moto_performance'
    ]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [ordersRes, motosRes, branchesRes] = await Promise.all([
                axios.get(`${ORDER_API_BASE_URL}/orders`),
                axios.get(`${ORDER_API_BASE_URL}/motos`),
                axios.get(`${ORDER_API_BASE_URL}/branches`)
            ]);
            setOrders(ordersRes.data || []);
            setMotos(motosRes.data || []);
            setBranches(branchesRes.data || []);
        } catch (err) {
            console.error('Error fetching data:', err);
        }
        setLoading(false);
    };

    // Filter orders based on selections
    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            // Date filter
            if (o.created_at) {
                const orderDate = o.created_at.split('T')[0];
                if (orderDate < dateFrom || orderDate > dateTo) return false;
            }
            // Branch filter
            if (selectedBranch !== 'all' && o.branch !== selectedBranch) return false;
            // Moto filter
            if (selectedMoto !== 'all' && o.assigned_moto_id != selectedMoto) return false;
            // Status filter
            if (selectedStatus !== 'all' && o.status !== selectedStatus) return false;
            return true;
        });
    }, [orders, dateFrom, dateTo, selectedBranch, selectedMoto, selectedStatus]);

    // Calculate stats
    const stats = useMemo(() => {
        const total = filteredOrders.length;
        const delivered = filteredOrders.filter(o => o.status === 'delivered').length;
        const pending = filteredOrders.filter(o => o.status === 'pending').length;
        const inRoute = filteredOrders.filter(o => o.status === 'in_route').length;
        const cancelled = filteredOrders.filter(o => o.status === 'cancelled').length;
        const assigned = filteredOrders.filter(o => o.status === 'assigned').length;

        // Calculate delivery times
        const deliveredOrders = filteredOrders.filter(o => o.status === 'delivered' && o.created_at && o.updated_at);
        let avgDeliveryTime = 0;
        if (deliveredOrders.length > 0) {
            const totalMinutes = deliveredOrders.reduce((sum, o) => {
                const start = new Date(o.created_at);
                const end = new Date(o.updated_at);
                return sum + (end - start) / 60000;
            }, 0);
            avgDeliveryTime = Math.round(totalMinutes / deliveredOrders.length);
        }

        const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

        return { total, delivered, pending, inRoute, cancelled, assigned, avgDeliveryTime, deliveryRate };
    }, [filteredOrders]);

    // Orders by day chart data
    const ordersByDayData = useMemo(() => {
        const dayMap = {};
        filteredOrders.forEach(o => {
            if (!o.created_at) return;
            const day = o.created_at.split('T')[0];
            if (!dayMap[day]) dayMap[day] = { delivered: 0, pending: 0, other: 0 };
            if (o.status === 'delivered') dayMap[day].delivered++;
            else if (o.status === 'pending') dayMap[day].pending++;
            else dayMap[day].other++;
        });

        const sortedDays = Object.keys(dayMap).sort();
        return {
            labels: sortedDays.map(d => new Date(d).toLocaleDateString('es-SV', { weekday: 'short', day: 'numeric' })),
            datasets: [
                {
                    label: 'Entregados',
                    data: sortedDays.map(d => dayMap[d].delivered),
                    backgroundColor: '#10b981',
                    borderRadius: 4,
                },
                {
                    label: 'Pendientes',
                    data: sortedDays.map(d => dayMap[d].pending),
                    backgroundColor: '#f59e0b',
                    borderRadius: 4,
                },
                {
                    label: 'Otros',
                    data: sortedDays.map(d => dayMap[d].other),
                    backgroundColor: '#6b7280',
                    borderRadius: 4,
                }
            ]
        };
    }, [filteredOrders]);

    // Moto performance data
    const motoPerformanceData = useMemo(() => {
        const motoMap = {};
        filteredOrders.filter(o => o.assigned_moto_id).forEach(o => {
            const motoId = o.assigned_moto_id;
            if (!motoMap[motoId]) motoMap[motoId] = { delivered: 0, total: 0 };
            motoMap[motoId].total++;
            if (o.status === 'delivered') motoMap[motoId].delivered++;
        });

        const motoLabels = Object.keys(motoMap).map(id => {
            const moto = motos.find(m => m.id == id);
            return moto ? moto.license_plate : `Moto ${id}`;
        });

        return {
            labels: motoLabels,
            datasets: [{
                label: 'Entregas',
                data: Object.values(motoMap).map(m => m.delivered),
                backgroundColor: '#3b82f6',
                borderRadius: 4,
            }]
        };
    }, [filteredOrders, motos]);

    // Status distribution
    const statusData = {
        labels: ['Pendientes', 'Asignados', 'En Ruta', 'Entregados', 'Cancelados'],
        datasets: [{
            data: [stats.pending, stats.assigned, stats.inRoute, stats.delivered, stats.cancelled],
            backgroundColor: ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444'],
            borderWidth: 0,
        }]
    };

    // Export to CSV
    const exportToCSV = () => {
        const headers = ['ID', 'Cliente', 'Dirección', 'Estado', 'Moto', 'Creado', 'Entregado'];
        const rows = filteredOrders.map(o => [
            o.id,
            o.client_name || '',
            o.address || '',
            o.status,
            o.assigned_moto_id || '',
            o.created_at || '',
            o.status === 'delivered' ? o.updated_at : ''
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_${dateFrom}_${dateTo}.csv`;
        a.click();
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: '#9ca3af' } },
        },
        scales: {
            x: { ticks: { color: '#9ca3af' }, grid: { display: false } },
            y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
    };

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } },
        cutout: '60%',
    };

    if (loading) {
        return (
            <div className="dashboard-shell">
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                    <div className="loading-spinner"></div>
                    <p>Cargando datos...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="reports-dashboard">
            <div className="reports-header">
                <h2>📊 Centro de Reportes</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        className={`btn ${viewMode === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setViewMode('dashboard')}
                    >
                        📈 Dashboard
                    </button>
                    <button
                        className={`btn ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setViewMode('table')}
                    >
                        📋 Tabla
                    </button>
                    <button className="btn btn-secondary" onClick={exportToCSV}>
                        ⬇️ Exportar CSV
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="filter-group">
                    <label>Desde:</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} max={dateTo} />
                </div>
                <div className="filter-group">
                    <label>Hasta:</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom} max={today} />
                </div>
                <div className="filter-group">
                    <label>Sucursal:</label>
                    <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}>
                        <option value="all">Todas</option>
                        {branches.map(b => <option key={b.id} value={b.code}>{b.name}</option>)}
                    </select>
                </div>
                <div className="filter-group">
                    <label>Moto:</label>
                    <select value={selectedMoto} onChange={e => setSelectedMoto(e.target.value)}>
                        <option value="all">Todas</option>
                        {motos.map(m => <option key={m.id} value={m.id}>{m.license_plate}</option>)}
                    </select>
                </div>
                <div className="filter-group">
                    <label>Estado:</label>
                    <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
                        <option value="all">Todos</option>
                        <option value="pending">Pendiente</option>
                        <option value="assigned">Asignado</option>
                        <option value="in_route">En Ruta</option>
                        <option value="delivered">Entregado</option>
                        <option value="cancelled">Cancelado</option>
                    </select>
                </div>
                <button className="btn btn-primary" onClick={fetchData}>🔄 Actualizar</button>
            </div>

            {viewMode === 'dashboard' ? (
                <>
                    {/* KPI Cards */}
                    <div className="kpi-row">
                        <div className="kpi-card">
                            <div className="kpi-icon blue">📦</div>
                            <div className="kpi-content">
                                <span className="kpi-value">{stats.total}</span>
                                <span className="kpi-label">Total Pedidos</span>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon green">✅</div>
                            <div className="kpi-content">
                                <span className="kpi-value">{stats.delivered}</span>
                                <span className="kpi-label">Entregados</span>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon yellow">⏳</div>
                            <div className="kpi-content">
                                <span className="kpi-value">{stats.pending}</span>
                                <span className="kpi-label">Pendientes</span>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon purple">🏍️</div>
                            <div className="kpi-content">
                                <span className="kpi-value">{stats.inRoute}</span>
                                <span className="kpi-label">En Ruta</span>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon blue">⏱️</div>
                            <div className="kpi-content">
                                <span className="kpi-value">{stats.avgDeliveryTime} min</span>
                                <span className="kpi-label">Tiempo Promedio</span>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon green">📈</div>
                            <div className="kpi-content">
                                <span className="kpi-value">{stats.deliveryRate}%</span>
                                <span className="kpi-label">Tasa Entrega</span>
                            </div>
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="charts-grid">
                        <div className="chart-card wide">
                            <h3>📅 Pedidos por Día</h3>
                            <div className="chart-container">
                                <Bar data={ordersByDayData} options={chartOptions} />
                            </div>
                        </div>
                        <div className="chart-card">
                            <h3>📊 Estado de Pedidos</h3>
                            <div className="chart-container doughnut">
                                <Doughnut data={statusData} options={doughnutOptions} />
                            </div>
                        </div>
                        <div className="chart-card">
                            <h3>🏍️ Entregas por Moto</h3>
                            <div className="chart-container">
                                <Bar data={motoPerformanceData} options={chartOptions} />
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                /* Table View */
                <div className="table-wrapper" style={{ marginTop: '1rem' }}>
                    <div style={{ marginBottom: '0.5rem', color: '#9ca3af' }}>
                        Mostrando {filteredOrders.length} registros
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Cliente</th>
                                <th>Dirección</th>
                                <th>Estado</th>
                                <th>Moto</th>
                                <th>Creado</th>
                                <th>Entregado</th>
                                <th>Tiempo (min)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.map(order => {
                                const moto = motos.find(m => m.id === order.assigned_moto_id);
                                let deliveryTime = '-';
                                if (order.status === 'delivered' && order.created_at && order.updated_at) {
                                    const mins = Math.round((new Date(order.updated_at) - new Date(order.created_at)) / 60000);
                                    deliveryTime = mins > 0 ? mins : '-';
                                }
                                return (
                                    <tr key={order.id}>
                                        <td>{order.id}</td>
                                        <td>{order.client_name || '-'}</td>
                                        <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {order.address || '-'}
                                        </td>
                                        <td>
                                            <span className={`status-badge status-${order.status}`}>{order.status}</span>
                                        </td>
                                        <td>{moto ? moto.license_plate : '-'}</td>
                                        <td style={{ fontSize: '0.8rem' }}>
                                            {order.created_at ? new Date(order.created_at).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                                        </td>
                                        <td style={{ fontSize: '0.8rem' }}>
                                            {order.status === 'delivered' && order.updated_at
                                                ? new Date(order.updated_at).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' })
                                                : '-'}
                                        </td>
                                        <td>{deliveryTime}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <style>{`
                .reports-dashboard {
                    padding: 1.5rem;
                    background: #0a0f1c;
                    min-height: 100vh;
                }
                .reports-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                }
                .reports-header h2 {
                    color: #f9fafb;
                    margin: 0;
                }
                .filters-bar {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 1rem;
                    align-items: flex-end;
                    background: #1f2937;
                    padding: 1rem;
                    border-radius: 12px;
                    margin-bottom: 1.5rem;
                }
                .filter-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }
                .filter-group label {
                    font-size: 0.75rem;
                    color: #9ca3af;
                }
                .filter-group input, .filter-group select {
                    background: #374151;
                    border: 1px solid #4b5563;
                    border-radius: 6px;
                    color: white;
                    padding: 0.5rem;
                    font-size: 0.85rem;
                }
                .kpi-row {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                .kpi-card {
                    background: #1f2937;
                    border-radius: 12px;
                    padding: 1rem;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    border: 1px solid rgba(255,255,255,0.05);
                }
                .kpi-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.25rem;
                }
                .kpi-icon.blue { background: rgba(59, 130, 246, 0.2); }
                .kpi-icon.green { background: rgba(16, 185, 129, 0.2); }
                .kpi-icon.yellow { background: rgba(245, 158, 11, 0.2); }
                .kpi-icon.purple { background: rgba(139, 92, 246, 0.2); }
                .kpi-content { display: flex; flex-direction: column; }
                .kpi-value { font-size: 1.5rem; font-weight: 700; color: #f9fafb; }
                .kpi-label { color: #9ca3af; font-size: 0.8rem; }
                .charts-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1rem;
                }
                .chart-card {
                    background: #1f2937;
                    border-radius: 12px;
                    padding: 1rem;
                    border: 1px solid rgba(255,255,255,0.05);
                }
                .chart-card.wide { grid-column: span 2; }
                .chart-card h3 { color: #f9fafb; font-size: 0.95rem; margin: 0 0 0.75rem 0; }
                .chart-container { height: 250px; position: relative; }
                .chart-container.doughnut { height: 220px; }
                .status-badge {
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: 500;
                }
                .status-pending { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
                .status-assigned { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
                .status-in_route { background: rgba(139, 92, 246, 0.2); color: #8b5cf6; }
                .status-delivered { background: rgba(16, 185, 129, 0.2); color: #10b981; }
                .status-cancelled { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
                @media (max-width: 900px) {
                    .charts-grid { grid-template-columns: 1fr; }
                    .chart-card.wide { grid-column: 1; }
                }
            `}</style>
        </div>
    );
};

export default ReportsDashboard;
