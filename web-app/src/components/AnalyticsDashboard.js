import React, { useState, useEffect } from 'react';
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
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';

// Registrar componentes de Chart.js
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

const AnalyticsDashboard = () => {
    const [kpis, setKpis] = useState(null);
    const [orders, setOrders] = useState([]);
    const [motos, setMotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState('week'); // today, week, month

    useEffect(() => {
        fetchData();
    }, [dateRange]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [kpisRes, ordersRes, motosRes] = await Promise.all([
                axios.get(`${ORDER_API_BASE_URL}/kpis/branches`),
                axios.get(`${ORDER_API_BASE_URL}/orders`),
                axios.get(`${ORDER_API_BASE_URL}/motos`)
            ]);
            setKpis(kpisRes.data);
            setOrders(ordersRes.data || []);
            setMotos(motosRes.data || []);
        } catch (err) {
            console.error('Error fetching analytics:', err);
        }
        setLoading(false);
    };

    // Calcular estadísticas
    const statusCounts = orders.reduce((acc, o) => {
        acc[o.status] = (acc[o.status] || 0) + 1;
        return acc;
    }, {});

    const motosStatusCounts = motos.reduce((acc, m) => {
        acc[m.status] = (acc[m.status] || 0) + 1;
        return acc;
    }, {});

    // Simular datos históricos (en producción vendrían de la API)
    const generateHistoricalData = () => {
        const days = dateRange === 'today' ? 24 : dateRange === 'week' ? 7 : 30;
        const labels = [];
        const deliveredData = [];
        const pendingData = [];

        for (let i = days - 1; i >= 0; i--) {
            if (dateRange === 'today') {
                labels.push(`${23 - i}:00`);
            } else {
                const date = new Date();
                date.setDate(date.getDate() - i);
                labels.push(date.toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric' }));
            }
            // Datos simulados (en producción serían reales)
            deliveredData.push(Math.floor(Math.random() * 20) + 5);
            pendingData.push(Math.floor(Math.random() * 10) + 2);
        }

        return { labels, deliveredData, pendingData };
    };

    const historicalData = generateHistoricalData();

    // Configuración de gráficos
    const lineChartData = {
        labels: historicalData.labels,
        datasets: [
            {
                label: 'Entregados',
                data: historicalData.deliveredData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4,
            },
            {
                label: 'Pendientes',
                data: historicalData.pendingData,
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                fill: true,
                tension: 0.4,
            },
        ],
    };

    const lineChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: '#9ca3af' }
            },
        },
        scales: {
            x: {
                ticks: { color: '#9ca3af' },
                grid: { color: 'rgba(255,255,255,0.05)' }
            },
            y: {
                ticks: { color: '#9ca3af' },
                grid: { color: 'rgba(255,255,255,0.05)' }
            },
        },
    };

    const doughnutOrdersData = {
        labels: ['Pendientes', 'Asignados', 'En Ruta', 'Entregados', 'Cancelados'],
        datasets: [
            {
                data: [
                    statusCounts.pending || 0,
                    statusCounts.assigned || 0,
                    statusCounts.in_route || 0,
                    statusCounts.delivered || 0,
                    statusCounts.cancelled || 0,
                ],
                backgroundColor: ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444'],
                borderWidth: 0,
            },
        ],
    };

    const doughnutMotosData = {
        labels: ['Disponibles', 'Ocupadas', 'Offline'],
        datasets: [
            {
                data: [
                    motosStatusCounts.available || 0,
                    motosStatusCounts.busy || motosStatusCounts.in_route || 0,
                    motosStatusCounts.offline || 0,
                ],
                backgroundColor: ['#10b981', '#8b5cf6', '#6b7280'],
                borderWidth: 0,
            },
        ],
    };

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: { color: '#9ca3af', padding: 15 }
            },
        },
        cutout: '65%',
    };

    // Datos por sucursal
    const branchBarData = {
        labels: kpis?.branches?.map(b => b.branch_name) || ['Central', 'Norte', 'Sur'],
        datasets: [
            {
                label: 'Entregados Hoy',
                data: kpis?.branches?.map(b => b.delivered_today) || [15, 12, 8],
                backgroundColor: '#10b981',
                borderRadius: 6,
            },
            {
                label: 'Pendientes',
                data: kpis?.branches?.map(b => b.pending_orders) || [5, 8, 3],
                backgroundColor: '#f59e0b',
                borderRadius: 6,
            },
        ],
    };

    const barChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: '#9ca3af' }
            },
        },
        scales: {
            x: {
                ticks: { color: '#9ca3af' },
                grid: { display: false }
            },
            y: {
                ticks: { color: '#9ca3af' },
                grid: { color: 'rgba(255,255,255,0.05)' }
            },
        },
    };

    if (loading) {
        return (
            <div className="dashboard-shell">
                <div className="dashboard-inner" style={{ textAlign: 'center', paddingTop: '4rem' }}>
                    <div className="loading-spinner"></div>
                    <p>Cargando métricas...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="analytics-dashboard">
            <div className="analytics-header">
                <h2>📊 Analytics Dashboard</h2>
                <div className="date-filter">
                    {['today', 'week', 'month'].map((range) => (
                        <button
                            key={range}
                            className={`filter-btn ${dateRange === range ? 'active' : ''}`}
                            onClick={() => setDateRange(range)}
                        >
                            {range === 'today' ? 'Hoy' : range === 'week' ? '7 días' : '30 días'}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPIs Resumen */}
            <div className="kpi-grid">
                <div className="kpi-card">
                    <div className="kpi-icon blue">📦</div>
                    <div className="kpi-content">
                        <span className="kpi-value">{orders.length}</span>
                        <span className="kpi-label">Pedidos Totales</span>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon green">✅</div>
                    <div className="kpi-content">
                        <span className="kpi-value">{statusCounts.delivered || 0}</span>
                        <span className="kpi-label">Entregados</span>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon yellow">⏳</div>
                    <div className="kpi-content">
                        <span className="kpi-value">{statusCounts.pending || 0}</span>
                        <span className="kpi-label">Pendientes</span>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon purple">🏍️</div>
                    <div className="kpi-content">
                        <span className="kpi-value">{motos.length}</span>
                        <span className="kpi-label">Motos Activas</span>
                    </div>
                </div>
            </div>

            {/* Gráficos principales */}
            <div className="charts-grid">
                {/* Línea de tendencia */}
                <div className="chart-card wide">
                    <h3>📈 Tendencia de Entregas</h3>
                    <div className="chart-container">
                        <Line data={lineChartData} options={lineChartOptions} />
                    </div>
                </div>

                {/* Donas */}
                <div className="chart-card">
                    <h3>📦 Estado de Pedidos</h3>
                    <div className="chart-container doughnut">
                        <Doughnut data={doughnutOrdersData} options={doughnutOptions} />
                    </div>
                </div>

                <div className="chart-card">
                    <h3>🏍️ Estado de Motos</h3>
                    <div className="chart-container doughnut">
                        <Doughnut data={doughnutMotosData} options={doughnutOptions} />
                    </div>
                </div>

                {/* Barras por sucursal */}
                <div className="chart-card wide">
                    <h3>🏢 Rendimiento por Sucursal</h3>
                    <div className="chart-container">
                        <Bar data={branchBarData} options={barChartOptions} />
                    </div>
                </div>
            </div>

            <style>{`
        .analytics-dashboard {
          padding: 2rem;
          background: #0a0f1c;
          min-height: 100vh;
        }

        .analytics-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .analytics-header h2 {
          color: #f9fafb;
          font-size: 1.75rem;
          margin: 0;
        }

        .date-filter {
          display: flex;
          gap: 0.5rem;
          background: #1f2937;
          border-radius: 12px;
          padding: 0.25rem;
        }

        .filter-btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: #9ca3af;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.9rem;
        }

        .filter-btn.active {
          background: #3b82f6;
          color: white;
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .kpi-card {
          background: #1f2937;
          border-radius: 16px;
          padding: 1.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          border: 1px solid rgba(255,255,255,0.05);
        }

        .kpi-icon {
          width: 56px;
          height: 56px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
        }

        .kpi-icon.blue { background: rgba(59, 130, 246, 0.2); }
        .kpi-icon.green { background: rgba(16, 185, 129, 0.2); }
        .kpi-icon.yellow { background: rgba(245, 158, 11, 0.2); }
        .kpi-icon.purple { background: rgba(139, 92, 246, 0.2); }

        .kpi-content {
          display: flex;
          flex-direction: column;
        }

        .kpi-value {
          font-size: 2rem;
          font-weight: 700;
          color: #f9fafb;
        }

        .kpi-label {
          color: #9ca3af;
          font-size: 0.9rem;
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }

        .chart-card {
          background: #1f2937;
          border-radius: 16px;
          padding: 1.5rem;
          border: 1px solid rgba(255,255,255,0.05);
        }

        .chart-card.wide {
          grid-column: span 2;
        }

        .chart-card h3 {
          color: #f9fafb;
          font-size: 1rem;
          margin: 0 0 1rem 0;
        }

        .chart-container {
          height: 280px;
          position: relative;
        }

        .chart-container.doughnut {
          height: 250px;
        }

        @media (max-width: 900px) {
          .charts-grid {
            grid-template-columns: 1fr;
          }
          .chart-card.wide {
            grid-column: span 1;
          }
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255,255,255,0.1);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 1rem;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};

export default AnalyticsDashboard;
