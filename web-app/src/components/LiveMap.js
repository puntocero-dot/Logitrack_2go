import React, { useState, useEffect, useCallback, useRef } from 'react';
import Map, { Marker, Popup, Source, Layer, NavigationControl } from 'react-map-gl';
import axios from 'axios';
import { ORDER_API_BASE_URL } from '../config/api';
import 'mapbox-gl/dist/mapbox-gl.css';

// Token de Mapbox (usar variable de entorno en producción)
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1IjoibG9naXRyYWNrIiwiYSI6ImNtNHJvOXBhZzBhMXYybG9jOGxkMGZyYTkifQ.placeholder';

const LiveMap = () => {
    const [motos, setMotos] = useState([]);
    const [orders, setOrders] = useState([]);
    const [branches, setBranches] = useState([]);
    const [selectedMoto, setSelectedMoto] = useState(null);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [viewState, setViewState] = useState({
        longitude: -90.5069,
        latitude: 14.6349,
        zoom: 12
    });
    const [filters, setFilters] = useState({
        showMotos: true,
        showOrders: true,
        showBranches: true,
        statusFilter: 'all'
    });
    const mapRef = useRef();

    const fetchData = useCallback(async () => {
        try {
            const [motosRes, ordersRes, branchesRes] = await Promise.all([
                axios.get(`${ORDER_API_BASE_URL}/motos`),
                axios.get(`${ORDER_API_BASE_URL}/orders`),
                axios.get(`${ORDER_API_BASE_URL}/branches`)
            ]);
            setMotos(motosRes.data || []);
            setOrders(ordersRes.data || []);
            setBranches(branchesRes.data || []);
        } catch (err) {
            console.error('Error fetching map data:', err);
        }
    }, []);

    useEffect(() => {
        fetchData();
        // Auto-refresh cada 10 segundos
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

    // Líneas de rutas (moto -> pedido asignado)
    const routeLines = [];
    activeMotos.forEach(moto => {
        const assignedOrders = filteredOrders.filter(o => o.assigned_moto_id === moto.id && o.latitude && o.longitude);
        assignedOrders.forEach(order => {
            routeLines.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [moto.longitude, moto.latitude],
                        [order.longitude, order.latitude]
                    ]
                },
                properties: {
                    motoId: moto.id,
                    orderId: order.id,
                    status: order.status
                }
            });
        });
    });

    const routeGeoJSON = {
        type: 'FeatureCollection',
        features: routeLines
    };

    return (
        <div className="live-map-container">
            {/* Panel de Filtros */}
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
                        <span className="legend-dot" style={{ background: '#10b981' }}></span> Disponible
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot" style={{ background: '#f59e0b' }}></span> Ocupado
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot" style={{ background: '#8b5cf6' }}></span> En Ruta
                    </div>
                </div>
                <button className="btn btn-secondary" onClick={fetchData} style={{ marginTop: '1rem', width: '100%' }}>
                    🔄 Actualizar
                </button>
            </div>

            {/* Mapa */}
            <div className="map-wrapper">
                <Map
                    ref={mapRef}
                    {...viewState}
                    onMove={evt => setViewState(evt.viewState)}
                    style={{ width: '100%', height: '100%' }}
                    mapStyle="mapbox://styles/mapbox/dark-v11"
                    mapboxAccessToken={MAPBOX_TOKEN}
                >
                    <NavigationControl position="top-right" />

                    {/* Líneas de ruta */}
                    <Source id="routes" type="geojson" data={routeGeoJSON}>
                        <Layer
                            id="route-lines"
                            type="line"
                            paint={{
                                'line-color': '#8b5cf6',
                                'line-width': 2,
                                'line-opacity': 0.7,
                                'line-dasharray': [2, 2]
                            }}
                        />
                    </Source>

                    {/* Sucursales */}
                    {filters.showBranches && branches.map(branch => (
                        branch.latitude && branch.longitude && (
                            <Marker
                                key={`branch-${branch.id}`}
                                longitude={branch.longitude}
                                latitude={branch.latitude}
                                anchor="center"
                            >
                                <div className="branch-marker">
                                    🏢
                                    <span className="marker-label">{branch.code}</span>
                                </div>
                            </Marker>
                        )
                    ))}

                    {/* Motos */}
                    {filters.showMotos && activeMotos.map(moto => (
                        <Marker
                            key={`moto-${moto.id}`}
                            longitude={moto.longitude}
                            latitude={moto.latitude}
                            anchor="center"
                            onClick={(e) => {
                                e.originalEvent.stopPropagation();
                                setSelectedMoto(moto);
                                setSelectedOrder(null);
                            }}
                        >
                            <div
                                className="moto-marker"
                                style={{
                                    background: getStatusColor(moto.status),
                                    animation: moto.status === 'in_route' ? 'pulse 1.5s infinite' : 'none'
                                }}
                            >
                                🏍️
                            </div>
                        </Marker>
                    ))}

                    {/* Pedidos */}
                    {filters.showOrders && filteredOrders.map(order => (
                        order.latitude && order.longitude && (
                            <Marker
                                key={`order-${order.id}`}
                                longitude={order.longitude}
                                latitude={order.latitude}
                                anchor="bottom"
                                onClick={(e) => {
                                    e.originalEvent.stopPropagation();
                                    setSelectedOrder(order);
                                    setSelectedMoto(null);
                                }}
                            >
                                <div
                                    className="order-marker"
                                    style={{ borderColor: getStatusColor(order.status) }}
                                >
                                    📦
                                </div>
                            </Marker>
                        )
                    ))}

                    {/* Popup Moto */}
                    {selectedMoto && (
                        <Popup
                            longitude={selectedMoto.longitude}
                            latitude={selectedMoto.latitude}
                            anchor="bottom"
                            onClose={() => setSelectedMoto(null)}
                            closeButton={true}
                        >
                            <div className="map-popup">
                                <h4>🏍️ {selectedMoto.license_plate}</h4>
                                <p><strong>Estado:</strong> {selectedMoto.status}</p>
                                <p><strong>Capacidad:</strong> {selectedMoto.current_orders_count || 0}/{selectedMoto.max_orders_capacity || 5}</p>
                                {selectedMoto.is_transferred && (
                                    <p className="transferred-badge">🔄 Transferida</p>
                                )}
                            </div>
                        </Popup>
                    )}

                    {/* Popup Pedido */}
                    {selectedOrder && (
                        <Popup
                            longitude={selectedOrder.longitude}
                            latitude={selectedOrder.latitude}
                            anchor="bottom"
                            onClose={() => setSelectedOrder(null)}
                            closeButton={true}
                        >
                            <div className="map-popup">
                                <h4>📦 Pedido #{selectedOrder.id}</h4>
                                <p><strong>Cliente:</strong> {selectedOrder.client_name}</p>
                                <p><strong>Estado:</strong> {selectedOrder.status}</p>
                                <p><strong>Dirección:</strong> {selectedOrder.address}</p>
                                {selectedOrder.assigned_moto_id && (
                                    <p><strong>Moto:</strong> #{selectedOrder.assigned_moto_id}</p>
                                )}
                            </div>
                        </Popup>
                    )}
                </Map>
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

        .moto-marker {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          transition: transform 0.2s;
        }

        .moto-marker:hover {
          transform: scale(1.2);
        }

        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.7); }
          70% { box-shadow: 0 0 0 15px rgba(139, 92, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
        }

        .order-marker {
          width: 36px;
          height: 36px;
          background: #1f2937;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 3px solid;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }

        .order-marker span,
        .order-marker::before {
          transform: rotate(45deg);
        }

        .branch-marker {
          display: flex;
          flex-direction: column;
          align-items: center;
          font-size: 1.5rem;
        }

        .marker-label {
          background: rgba(0,0,0,0.7);
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
          margin-top: 0.25rem;
        }

        .map-popup {
          color: #1f2937;
          min-width: 180px;
        }

        .map-popup h4 {
          margin: 0 0 0.5rem 0;
          font-size: 1rem;
        }

        .map-popup p {
          margin: 0.25rem 0;
          font-size: 0.85rem;
        }

        .transferred-badge {
          background: #fef3c7;
          color: #92400e;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
        }

        .mapboxgl-popup-content {
          border-radius: 12px;
          padding: 1rem;
        }

        .mapboxgl-popup-close-button {
          font-size: 1.25rem;
          padding: 0.5rem;
        }
      `}</style>
        </div>
    );
};

export default LiveMap;
