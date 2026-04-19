import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Map, { Source, Layer, Marker, Popup } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './DriverRouteMap.css';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

// ─── Colores por velocidad ────────────────────────────────────────────────────
// El browser Geolocation API reporta speed en m/s; el backend lo convierte a km/h
// antes de devolverlo en segments. Para routePoints crudos multiplicamos aquí.
const speedToColor = (speedKmh) => {
  if (speedKmh === null || speedKmh === undefined || speedKmh < 1) return '#ef4444'; // detenido
  if (speedKmh < 10) return '#ef4444';   // rojo — muy lento / semáforo
  if (speedKmh < 25) return '#f59e0b';   // amarillo — tráfico
  if (speedKmh < 50) return '#10b981';   // verde — normal
  return '#3b82f6';                       // azul — rápido
};

// Capa de polyline coloreada por velocidad (usa FeatureCollection de segmentos de 2 puntos)
const speedLineLayer = {
  id: 'route-speed',
  type: 'line',
  paint: {
    'line-color': ['get', 'color'],
    'line-width': 4,
    'line-opacity': 0.85,
  },
};

// Capa de polyline fallback (un solo color azul) para cuando no hay datos de velocidad
const plainLineLayer = {
  id: 'route-line',
  type: 'line',
  paint: {
    'line-color': '#3b82f6',
    'line-width': 4,
    'line-opacity': 0.8,
  },
};

// Formatea segundos a "Xh Ym" o "Xm Ys"
const formatDuration = (secs) => {
  if (!secs) return '0s';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
};

/**
 * Mapa de ruta del driver con:
 *  - Polyline coloreado por velocidad
 *  - Marcadores START / DELIVERY / END con timestamps
 *  - Marcadores de paradas detectadas (semáforos, esperas)
 *  - Tooltip on-hover con hora, velocidad y precisión
 *  - Panel lateral de segmentos clickable (zoom al segmento)
 *  - Auto-refresh o live via prop points
 *
 * @param {number}   shiftId     — ID del turno
 * @param {object[]} routePoints — puntos GPS [{latitude, longitude, speed, point_type, timestamp, ...}]
 * @param {object[]} stops       — paradas detectadas [{latitude, longitude, started_at, duration_seconds}]
 * @param {object[]} segments    — segmentos [{from_point, to_point, distance_km, duration_seconds, avg_speed_kmh, stops, polyline}]
 * @param {boolean}  autoRefresh — auto-refresh cada 30s
 * @param {function} onRefresh   — callback al refrescar
 */
const DriverRouteMap = ({
  shiftId,
  routePoints = [],
  stops = [],
  segments = [],
  autoRefresh = false,
  onRefresh,
}) => {
  const [mapRef, setMapRef] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null); // { longitude, latitude, speed, timestamp, accuracy }
  const [activeSegment, setActiveSegment] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Auto-refresh cada 30s
  useEffect(() => {
    if (autoRefresh && onRefresh) {
      const id = setInterval(() => {
        onRefresh();
        setRefreshKey((k) => k + 1);
      }, 30000);
      return () => clearInterval(id);
    }
  }, [autoRefresh, onRefresh]);

  // ─── Centro y bounds del mapa ───────────────────────────────────────────────
  const { center } = useMemo(() => {
    const pts = routePoints.length > 0 ? routePoints
      : segments.flatMap((s) => (s.polyline || []).map(([lng, lat]) => ({ latitude: lat, longitude: lng })));

    if (pts.length === 0) {
      return { center: { latitude: 13.6929, longitude: -89.2182, zoom: 12 } };
    }
    const lats = pts.map((p) => p.latitude ?? p[1]);
    const lngs = pts.map((p) => p.longitude ?? p[0]);
    return {
      center: {
        latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
        longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
        zoom: 13,
      },
    };
  }, [routePoints, segments]);

  // ─── GeoJSON de velocidad (FeatureCollection de pares de puntos) ────────────
  const speedGeoJSON = useMemo(() => {
    if (routePoints.length < 2) return null;
    const features = [];

    for (let i = 1; i < routePoints.length; i++) {
      const prev = routePoints[i - 1];
      const curr = routePoints[i];
      // speed viene en m/s del device → convertir a km/h
      const speedKmh = curr.speed != null ? curr.speed * 3.6
        : prev.speed != null ? prev.speed * 3.6
        : null;
      features.push({
        type: 'Feature',
        properties: { color: speedToColor(speedKmh), speed_kmh: speedKmh },
        geometry: {
          type: 'LineString',
          coordinates: [
            [prev.longitude, prev.latitude],
            [curr.longitude, curr.latitude],
          ],
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [routePoints]);

  // Fallback polyline plana (cuando no hay speed data)
  const plainGeoJSON = useMemo(() => {
    if (!speedGeoJSON && routePoints.length >= 2) {
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: routePoints.map((p) => [p.longitude, p.latitude]),
        },
      };
    }
    return null;
  }, [speedGeoJSON, routePoints]);

  // ─── Marcadores ancla (START / DELIVERY / END) ──────────────────────────────
  const anchorMarkers = useMemo(() => {
    return routePoints.filter((p) => ['START', 'DELIVERY', 'END'].includes(p.point_type));
  }, [routePoints]);

  const getMarkerConfig = (type) => {
    switch (type) {
      case 'START':    return { color: '#10b981', icon: '🏁', label: 'Inicio' };
      case 'DELIVERY': return { color: '#f59e0b', icon: '📦', label: 'Entrega' };
      case 'END':      return { color: '#ef4444', icon: '🏁', label: 'Fin' };
      default:         return { color: '#6b7280', icon: '📍', label: 'Punto' };
    }
  };

  // ─── Zoom a un segmento ─────────────────────────────────────────────────────
  const zoomToSegment = useCallback((seg) => {
    if (!mapRef || !seg.polyline || seg.polyline.length === 0) return;
    const lngs = seg.polyline.map(([lng]) => lng);
    const lats = seg.polyline.map(([, lat]) => lat);
    mapRef.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, duration: 800 }
    );
    setActiveSegment(seg.segment_index);
  }, [mapRef]);

  // ─── Hover tooltip sobre polyline ──────────────────────────────────────────
  // Buscamos el punto más cercano al cursor (entre los routePoints disponibles)
  const handleMouseMove = useCallback((event) => {
    if (!event.features || event.features.length === 0) {
      setHoveredPoint(null);
      return;
    }
    const { lng, lat } = event.lngLat;
    // Encontrar el routePoint más cercano al click/hover
    let closest = null;
    let minDist = Infinity;
    for (const p of routePoints) {
      const d = Math.hypot(p.longitude - lng, p.latitude - lat);
      if (d < minDist) { minDist = d; closest = p; }
    }
    if (closest) {
      setHoveredPoint({
        longitude: closest.longitude,
        latitude: closest.latitude,
        speed: closest.speed != null ? (closest.speed * 3.6).toFixed(1) : null,
        timestamp: closest.timestamp,
        accuracy: closest.accuracy,
      });
    }
  }, [routePoints]);

  const handleMouseLeave = useCallback(() => setHoveredPoint(null), []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="driver-route-map-error">
        <p>⚠️ Configura REACT_APP_MAPBOX_TOKEN en el archivo .env</p>
      </div>
    );
  }

  if (routePoints.length === 0 && segments.length === 0) {
    return (
      <div className="driver-route-map-empty">
        <p>📍 No hay puntos de ruta registrados</p>
        <small>Los puntos GPS aparecerán aquí durante el turno</small>
      </div>
    );
  }

  return (
    <div className="driver-route-map-container">
      {/* ── Header ── */}
      <div className="route-map-header">
        <h3>Ruta del Turno #{shiftId}</h3>
        <div className="route-stats">
          <span className="stat-badge">📍 {routePoints.length} puntos</span>
          {stops.length > 0 && (
            <span className="stat-badge stop-badge">⏸ {stops.length} paradas</span>
          )}
          {autoRefresh && (
            <span className="stat-badge refresh-indicator">🔄 Auto-refresh</span>
          )}
        </div>
      </div>

      <div className="route-map-body">
        {/* ── Mapa ── */}
        <div className="route-map-wrapper">
          <Map
            key={refreshKey}
            ref={setMapRef}
            initialViewState={center}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
            mapboxAccessToken={MAPBOX_TOKEN}
            interactiveLayerIds={speedGeoJSON ? ['route-speed'] : ['route-line']}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Polyline coloreada por velocidad */}
            {speedGeoJSON && (
              <Source id="route-speed" type="geojson" data={speedGeoJSON}>
                <Layer {...speedLineLayer} />
              </Source>
            )}

            {/* Polyline fallback plana */}
            {plainGeoJSON && (
              <Source id="route-plain" type="geojson" data={plainGeoJSON}>
                <Layer {...plainLineLayer} />
              </Source>
            )}

            {/* Marcadores ancla (START / DELIVERY / END) */}
            {anchorMarkers.map((point, idx) => {
              const cfg = getMarkerConfig(point.point_type);
              const ts = point.timestamp
                ? new Date(point.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : '';
              return (
                <Marker
                  key={`anchor-${point.id ?? idx}`}
                  longitude={point.longitude}
                  latitude={point.latitude}
                  anchor="bottom"
                >
                  <div className="custom-marker" style={{ borderColor: cfg.color }} title={`${cfg.label} — ${ts}`}>
                    <span className="marker-icon">{cfg.icon}</span>
                    <div className="marker-label" style={{ backgroundColor: cfg.color }}>
                      {cfg.label}
                      {ts && <span className="marker-time">{ts}</span>}
                    </div>
                  </div>
                </Marker>
              );
            })}

            {/* Marcadores de paradas detectadas */}
            {stops.map((stop, idx) => (
              <Marker
                key={`stop-${idx}`}
                longitude={stop.longitude}
                latitude={stop.latitude}
                anchor="center"
              >
                <div
                  className="stop-marker"
                  title={`Parada: ${formatDuration(stop.duration_seconds)} — ${new Date(stop.started_at).toLocaleTimeString('es')}`}
                >
                  ⏸
                  <div className="stop-label">{formatDuration(stop.duration_seconds)}</div>
                </div>
              </Marker>
            ))}

            {/* Tooltip on-hover */}
            {hoveredPoint && (
              <Popup
                longitude={hoveredPoint.longitude}
                latitude={hoveredPoint.latitude}
                closeButton={false}
                closeOnClick={false}
                anchor="top"
                className="route-point-popup"
              >
                <div className="popup-content">
                  {hoveredPoint.timestamp && (
                    <div className="popup-row">
                      🕐 <strong>{new Date(hoveredPoint.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
                    </div>
                  )}
                  {hoveredPoint.speed !== null && (
                    <div className="popup-row">
                      🚀 <span>{hoveredPoint.speed} km/h</span>
                    </div>
                  )}
                  {hoveredPoint.accuracy !== null && hoveredPoint.accuracy !== undefined && (
                    <div className="popup-row">
                      📡 <span>±{Math.round(hoveredPoint.accuracy)} m</span>
                    </div>
                  )}
                </div>
              </Popup>
            )}
          </Map>
        </div>

        {/* ── Panel de segmentos ── */}
        {segments.length > 0 && (
          <div className="segments-panel">
            <h4>Segmentos de ruta</h4>
            <ul className="segments-list">
              {segments.map((seg, i) => (
                <li
                  key={i}
                  className={`segment-item ${activeSegment === seg.segment_index ? 'active' : ''}`}
                  onClick={() => zoomToSegment(seg)}
                >
                  <div className="segment-header">
                    <span className="segment-num">Seg. {seg.segment_index + 1}</span>
                    <span className="segment-route">
                      {seg.from_point?.type} → {seg.to_point?.type}
                      {seg.to_point?.order_id ? ` #${seg.to_point.order_id}` : ''}
                    </span>
                  </div>
                  <div className="segment-meta">
                    <span>🕐 {new Date(seg.from_point?.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>📏 {seg.distance_km?.toFixed(2)} km</span>
                    <span>⏱ {formatDuration(seg.duration_seconds)}</span>
                    <span>🚀 {seg.avg_speed_kmh?.toFixed(1)} km/h</span>
                    {seg.stops?.length > 0 && (
                      <span className="seg-stops">⏸ {seg.stops.length} parada{seg.stops.length > 1 ? 's' : ''}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Leyenda de velocidad ── */}
      <div className="route-legend">
        <span className="legend-title">Velocidad:</span>
        <div className="legend-item"><span className="legend-dot" style={{ background: '#ef4444' }} />{'<10 km/h'}</div>
        <div className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b' }} />10–25</div>
        <div className="legend-item"><span className="legend-dot" style={{ background: '#10b981' }} />25–50</div>
        <div className="legend-item"><span className="legend-dot" style={{ background: '#3b82f6' }} />{'>50'}</div>
        <div className="legend-item"><span className="legend-dot" style={{ background: '#9ca3af', borderRadius: '50%', width: 12, height: 12 }} />Parada</div>
        <div className="legend-item"><span className="legend-icon">📦</span>Entrega</div>
      </div>
    </div>
  );
};

export default DriverRouteMap;
