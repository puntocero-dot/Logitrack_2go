import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom icons
const createCustomIcon = (emoji, bgColor) => {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            background: ${bgColor};
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            border: 3px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        ">${emoji}</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
    });
};

const branchIcon = L.divIcon({
    className: 'branch-marker',
    html: `<div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        font-size: 1.75rem;
    ">🏢</div>`,
    iconSize: [35, 35],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17]
});

const orderIcon = (color) => L.divIcon({
    className: 'order-marker',
    html: `<div style="
        width: 32px;
        height: 32px;
        background: #1f2937;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 3px solid ${color};
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    "><span style="transform: rotate(45deg); font-size: 1rem;">📦</span></div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -35]
});

// Coordinator icon
const coordinatorIcon = L.divIcon({
    className: 'coordinator-marker',
    html: `<div style="
        background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        border: 3px solid white;
        box-shadow: 0 4px 15px rgba(6, 182, 212, 0.5);
        animation: coordinatorPulse 2s infinite;
    ">👷</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22]
});

// Component to fit bounds ONLY on initial load
function FitBounds({ markers, initialFitDone, setInitialFitDone }) {
    const map = useMap();

    useEffect(() => {
        // Only fit bounds once on initial load
        if (markers.length > 0 && !initialFitDone) {
            const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
            setInitialFitDone(true);
        }
    }, [markers, map, initialFitDone, setInitialFitDone]);

    return null;
}

const LiveMap = () => {
    const [motos, setMotos] = useState([]);
    const [orders, setOrders] = useState([]);
    const [branches, setBranches] = useState([]);
    const [coordinators, setCoordinators] = useState([]);
    const [initialFitDone, setInitialFitDone] = useState(false);
    const [filters, setFilters] = useState({
        showMotos: true,
        showOrders: true,
        showBranches: true,
        showCoordinators: true,
        statusFilter: 'all'
    });

    const fetchData = useCallback(async () => {
        try {
            const [motosRes, ordersRes, branchesRes, coordinatorsRes] = await Promise.all([
                axios.get(`${ORDER_API_BASE_URL}/motos`),
                axios.get(`${ORDER_API_BASE_URL}/orders`),
                axios.get(`${ORDER_API_BASE_URL}/branches`),
                axios.get(`${ORDER_API_BASE_URL}/visits/all-active`)
            ]);
            setMotos(motosRes.data || []);
            setOrders(ordersRes.data || []);
            setBranches(branchesRes.data || []);
            setCoordinators(coordinatorsRes.data || []);
        } catch (err) {
            console.error('Error fetching map data:', err);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const getStatusColor = (status) => {
        const colors = {
            available: '#10b981',
            busy: '#f59e0b',
            offline: '#6b7280',
            in_route: '#8b5cf6',
            pending: '#f59e0b',
            assigned: '#3b82f6',
            delivered: '#10b981',
            cancelled: '#ef4444'
        };
        return colors[status] || '#6b7280';
    };

    const filteredOrders = orders.filter(o => {
        if (filters.statusFilter === 'all') return true;
        return o.status === filters.statusFilter;
    });

    const activeMotos = motos.filter(m => m.latitude && m.longitude);
    const activeCoordinators = coordinators.filter(c => c.latitude && c.longitude);

    // Route lines (moto -> assigned orders)
    const routeLines = [];
    activeMotos.forEach(moto => {
        const assignedOrders = filteredOrders.filter(o => o.assigned_moto_id === moto.id && o.latitude && o.longitude);
        assignedOrders.forEach(order => {
            routeLines.push({
                positions: [
                    [moto.latitude, moto.longitude],
                    [order.latitude, order.longitude]
                ],
                motoId: moto.id,
                orderId: order.id
            });
        });
    });

    // Collect all markers for bounds
    const allMarkers = [
        ...activeMotos.map(m => ({ lat: m.latitude, lng: m.longitude })),
        ...branches.filter(b => b.latitude && b.longitude).map(b => ({ lat: b.latitude, lng: b.longitude })),
        ...filteredOrders.filter(o => o.latitude && o.longitude).map(o => ({ lat: o.latitude, lng: o.longitude })),
        ...activeCoordinators.map(c => ({ lat: c.latitude, lng: c.longitude }))
    ];

    // Default center (Guatemala City)
    const defaultCenter = [14.6349, -90.5069];

    // Format time ago
    const formatTimeAgo = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return `${diffMins} min`;
        const diffHours = Math.floor(diffMins / 60);
        return `${diffHours}h ${diffMins % 60}m`;
    };

    return (
        <div className="live-map-container">
            {/* Control Panel */}
            <div className="map-controls">
                <h3>🗺️ Mapa en Vivo</h3>
                <div className="filter-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={filters.showMotos}
                            onChange={(e) => setFilters({ ...filters, showMotos: e.target.checked })}
                        />
                        🏍️ Motos ({activeMotos.length})
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={filters.showCoordinators}
                            onChange={(e) => setFilters({ ...filters, showCoordinators: e.target.checked })}
                        />
                        👷 Coordinadores ({activeCoordinators.length})
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={filters.showOrders}
                            onChange={(e) => setFilters({ ...filters, showOrders: e.target.checked })}
                        />
                        📦 Pedidos ({filteredOrders.length})
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={filters.showBranches}
                            onChange={(e) => setFilters({ ...filters, showBranches: e.target.checked })}
                        />
                        🏢 Sucursales ({branches.length})
                    </label>
                </div>
                <div className="filter-group">
                    <label>Estado pedidos:</label>
                    <select
                        value={filters.statusFilter}
                        onChange={(e) => setFilters({ ...filters, statusFilter: e.target.value })}
                    >
                        <option value="all">Todos</option>
                        <option value="pending">Pendientes</option>
                        <option value="assigned">Asignados</option>
                        <option value="in_route">En Ruta</option>
                        <option value="delivered">Entregados</option>
                    </select>
                </div>
                <div className="map-legend">
                    <div className="legend-item">
                        <span className="legend-dot" style={{ background: '#10b981' }}></span> Moto Disponible
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot" style={{ background: '#f59e0b' }}></span> Moto Ocupada
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot" style={{ background: '#8b5cf6' }}></span> Moto En Ruta
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot" style={{ background: '#06b6d4' }}></span> Coordinador Activo
                    </div>
                </div>
                <button className="btn btn-secondary" onClick={fetchData} style={{ marginTop: '1rem', width: '100%' }}>
                    🔄 Actualizar
                </button>
            </div>

            {/* Map */}
            <div className="map-wrapper">
                <MapContainer
                    center={defaultCenter}
                    zoom={12}
                    style={{ width: '100%', height: '100%' }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {allMarkers.length > 0 && <FitBounds markers={allMarkers} initialFitDone={initialFitDone} setInitialFitDone={setInitialFitDone} />}

                    {/* Route Lines */}
                    {routeLines.map((route, idx) => (
                        <Polyline
                            key={`route-${idx}`}
                            positions={route.positions}
                            pathOptions={{
                                color: '#8b5cf6',
                                weight: 2,
                                opacity: 0.7,
                                dashArray: '5, 10'
                            }}
                        />
                    ))}

                    {/* Branches */}
                    {filters.showBranches && branches.map(branch => (
                        branch.latitude && branch.longitude && (
                            <Marker
                                key={`branch-${branch.id}`}
                                position={[branch.latitude, branch.longitude]}
                                icon={branchIcon}
                            >
                                <Popup>
                                    <div className="map-popup">
                                        <h4>🏢 {branch.name}</h4>
                                        <p><strong>Código:</strong> {branch.code}</p>
                                        <p><strong>Dirección:</strong> {branch.address || 'N/A'}</p>
                                    </div>
                                </Popup>
                            </Marker>
                        )
                    ))}

                    {/* Coordinators */}
                    {filters.showCoordinators && activeCoordinators.map(coord => (
                        <Marker
                            key={`coord-${coord.id}`}
                            position={[coord.latitude, coord.longitude]}
                            icon={coordinatorIcon}
                        >
                            <Popup>
                                <div className="map-popup">
                                    <h4>👷 {coord.coordinator_name}</h4>
                                    <p><strong>Sucursal:</strong> {coord.branch_name}</p>
                                    <p><strong>Tiempo:</strong> {formatTimeAgo(coord.check_in_time)}</p>
                                    <p><strong>Distancia:</strong> {coord.distance_meters}m de sucursal</p>
                                    <p className="coordinator-active-badge">🟢 En visita activa</p>
                                </div>
                            </Popup>
                        </Marker>
                    ))}

                    {/* Motos */}
                    {filters.showMotos && activeMotos.map(moto => (
                        <Marker
                            key={`moto-${moto.id}`}
                            position={[moto.latitude, moto.longitude]}
                            icon={createCustomIcon('🏍️', getStatusColor(moto.status))}
                        >
                            <Popup>
                                <div className="map-popup">
                                    <h4>🏍️ {moto.license_plate}</h4>
                                    <p><strong>Estado:</strong> {moto.status}</p>
                                    <p><strong>Capacidad:</strong> {moto.current_orders_count || 0}/{moto.max_orders_capacity || 5}</p>
                                    {moto.is_transferred && (
                                        <p className="transferred-badge">🔄 Transferida</p>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    ))}

                    {/* Orders */}
                    {filters.showOrders && filteredOrders.map(order => (
                        order.latitude && order.longitude && (
                            <Marker
                                key={`order-${order.id}`}
                                position={[order.latitude, order.longitude]}
                                icon={orderIcon(getStatusColor(order.status))}
                            >
                                <Popup>
                                    <div className="map-popup">
                                        <h4>📦 Pedido #{order.id}</h4>
                                        <p><strong>Cliente:</strong> {order.client_name}</p>
                                        <p><strong>Estado:</strong> {order.status}</p>
                                        <p><strong>Dirección:</strong> {order.address}</p>
                                        {order.assigned_moto_id && (
                                            <p><strong>Moto:</strong> #{order.assigned_moto_id}</p>
                                        )}
                                    </div>
                                </Popup>
                            </Marker>
                        )
                    ))}
                </MapContainer>
            </div>

            <style>{`
        .live-map-container {
          display: flex;
          height: calc(100vh - 64px);
          background: #0a0f1c;
        }

        .map-controls {
          width: 280px;
          background: #1f2937;
          padding: 1.5rem;
          border-right: 1px solid rgba(255,255,255,0.1);
          overflow-y: auto;
        }

        .map-controls h3 {
          color: #f9fafb;
          margin-bottom: 1rem;
          font-size: 1.25rem;
        }

        .filter-group {
          margin-bottom: 1.5rem;
        }

        .filter-group label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #e5e5e5;
          margin-bottom: 0.5rem;
          cursor: pointer;
        }

        .filter-group select {
          width: 100%;
          padding: 0.5rem;
          border-radius: 8px;
          background: #111827;
          color: #e5e5e5;
          border: 1px solid rgba(255,255,255,0.1);
          margin-top: 0.5rem;
        }

        .map-legend {
          background: rgba(0,0,0,0.3);
          padding: 0.75rem;
          border-radius: 8px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #9ca3af;
          font-size: 0.85rem;
          margin-bottom: 0.25rem;
        }

        .legend-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .map-wrapper {
          flex: 1;
          position: relative;
        }

        .map-popup {
          min-width: 180px;
        }

        .map-popup h4 {
          margin: 0 0 0.5rem 0;
          font-size: 1rem;
          color: #1f2937;
        }

        .map-popup p {
          margin: 0.25rem 0;
          font-size: 0.85rem;
          color: #374151;
        }

        .transferred-badge {
          background: #fef3c7;
          color: #92400e;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          display: inline-block;
        }

        .coordinator-active-badge {
          background: #d1fae5;
          color: #065f46;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          display: inline-block;
          margin-top: 0.5rem;
        }

        .custom-marker {
          background: none;
          border: none;
        }

        .leaflet-popup-content-wrapper {
          border-radius: 12px;
        }

        .leaflet-popup-content {
          margin: 0.75rem 1rem;
        }

        @keyframes coordinatorPulse {
          0% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.6); }
          70% { box-shadow: 0 0 0 15px rgba(6, 182, 212, 0); }
          100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0); }
        }
      `}</style>
        </div>
    );
};

export default LiveMap;
