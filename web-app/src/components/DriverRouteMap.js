import React, { useState, useEffect, useMemo } from 'react';
import Map, { Source, Layer, Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './DriverRouteMap.css';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

/**
 * Componente de mapa para visualizar ruta completa de un turno
 * Muestra polyline con trayectoria GPS y marcadores personalizados
 * 
 * @param {number} shiftId - ID del turno
 * @param {array} routePoints - Array de puntos GPS [{latitude, longitude, point_type, ...}]
 * @param {boolean} autoRefresh - Auto-refresh cada 30s (default: false)
 * @param {function} onRefresh - Callback al refrescar
 */
const DriverRouteMap = ({ shiftId, routePoints = [], autoRefresh = false, onRefresh }) => {
  const [refreshKey, setRefreshKey] = useState(0);

  // Auto-refresh cada 30 segundos si está habilitado
  useEffect(() => {
    if (autoRefresh && onRefresh) {
      const interval = setInterval(() => {
        onRefresh();
        setRefreshKey((prev) => prev + 1);
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [autoRefresh, onRefresh]);

  // Calcular centro del mapa y zoom basado en puntos
  const { center, bounds } = useMemo(() => {
    if (!routePoints || routePoints.length === 0) {
      return {
        center: { latitude: 13.6929, longitude: -89.2182, zoom: 12 },
        bounds: null,
      };
    }

    const lats = routePoints.map((p) => p.latitude);
    const lngs = routePoints.map((p) => p.longitude);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    return {
      center: { latitude: centerLat, longitude: centerLng, zoom: 13 },
      bounds: [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
    };
  }, [routePoints]);

  // Convertir puntos a GeoJSON LineString para polyline
  const routeGeoJSON = useMemo(() => {
    if (!routePoints || routePoints.length === 0) return null;

    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: routePoints.map((p) => [p.longitude, p.latitude]),
      },
    };
  }, [routePoints]);

  // Estilo de la polyline
  const lineLayer = {
    id: 'route-line',
    type: 'line',
    paint: {
      'line-color': '#3b82f6',
      'line-width': 4,
      'line-opacity': 0.8,
    },
  };

  // Filtrar marcadores especiales (START, DELIVERY, END)
  const specialMarkers = useMemo(() => {
    if (!routePoints) return [];
    return routePoints.filter((p) =>
      ['START', 'DELIVERY', 'END'].includes(p.point_type)
    );
  }, [routePoints]);

  // Configuración de marcadores por tipo
  const getMarkerConfig = (pointType) => {
    switch (pointType) {
      case 'START':
        return { color: '#10b981', label: 'Inicio', icon: '🏁' };
      case 'DELIVERY':
        return { color: '#f59e0b', label: 'Entrega', icon: '📦' };
      case 'END':
        return { color: '#ef4444', label: 'Fin', icon: '🏁' };
      default:
        return { color: '#6b7280', label: 'Punto', icon: '📍' };
    }
  };

  if (!MAPBOX_TOKEN) {
    return (
      <div className="driver-route-map-error">
        <p>⚠️ Configura REACT_APP_MAPBOX_TOKEN en el archivo .env</p>
      </div>
    );
  }

  if (!routePoints || routePoints.length === 0) {
    return (
      <div className="driver-route-map-empty">
        <p>📍 No hay puntos de ruta registrados</p>
        <small>Los puntos GPS aparecerán aquí durante el turno</small>
      </div>
    );
  }

  return (
    <div className="driver-route-map-container">
      <div className="route-map-header">
        <h3>Ruta del Turno #{shiftId}</h3>
        <div className="route-stats">
          <span className="stat-badge">
            📍 {routePoints.length} puntos
          </span>
          {autoRefresh && (
            <span className="stat-badge refresh-indicator">
              🔄 Auto-refresh
            </span>
          )}
        </div>
      </div>

      <div className="route-map-wrapper">
        <Map
          key={refreshKey}
          initialViewState={center}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          {/* Polyline de la ruta */}
          {routeGeoJSON && (
            <Source id="route" type="geojson" data={routeGeoJSON}>
              <Layer {...lineLayer} />
            </Source>
          )}

          {/* Marcadores especiales */}
          {specialMarkers.map((point, index) => {
            const config = getMarkerConfig(point.point_type);
            return (
              <Marker
                key={`${point.id}-${index}`}
                longitude={point.longitude}
                latitude={point.latitude}
                anchor="bottom"
              >
                <div className="custom-marker" style={{ borderColor: config.color }}>
                  <span className="marker-icon">{config.icon}</span>
                  <div className="marker-label" style={{ backgroundColor: config.color }}>
                    {config.label}
                  </div>
                </div>
              </Marker>
            );
          })}
        </Map>
      </div>

      {/* Leyenda */}
      <div className="route-legend">
        <div className="legend-item">
          <span className="legend-icon">🏁</span>
          <span>Inicio</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon">📦</span>
          <span>Entrega</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon">🏁</span>
          <span>Fin</span>
        </div>
        <div className="legend-item">
          <div className="legend-line"></div>
          <span>Ruta GPS</span>
        </div>
      </div>
    </div>
  );
};

export default DriverRouteMap;
