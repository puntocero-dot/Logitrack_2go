import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom icons
const orderIcon = (status) => L.divIcon({
  className: 'custom-marker',
  html: `<div style="
        width: 28px;
        height: 28px;
        background: ${status === 'delivered' ? '#10b981' : status === 'in_route' ? '#f59e0b' : '#ef4444'};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.9rem;
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">📦</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14]
});

const motoIcon = (status) => L.divIcon({
  className: 'custom-marker',
  html: `<div style="
        width: 32px;
        height: 32px;
        background: ${status === 'available' ? '#3b82f6' : status === 'in_route' ? '#f59e0b' : '#6b7280'};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">🏍️</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

// Component to fit bounds
function FitBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.latitude, p.longitude]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }, []);

  return null;
}

const MapView = ({ orders, motos }) => {
  const validOrders = Array.isArray(orders)
    ? orders.filter(o => typeof o.latitude === 'number' && typeof o.longitude === 'number')
    : [];

  const validMotos = Array.isArray(motos)
    ? motos.filter(m => m.latitude && m.longitude && typeof m.latitude === 'number' && typeof m.longitude === 'number')
    : [];

  const allPoints = [...validOrders, ...validMotos];

  const defaultCenter = useMemo(() => {
    if (allPoints.length === 0) {
      return [14.6349, -90.5069]; // Guatemala City
    }
    const avgLat = allPoints.reduce((sum, p) => sum + p.latitude, 0) / allPoints.length;
    const avgLng = allPoints.reduce((sum, p) => sum + p.longitude, 0) / allPoints.length;
    return [avgLat, avgLng];
  }, [allPoints]);

  return (
    <div style={{ height: '400px', marginTop: '20px', borderRadius: '12px', overflow: 'hidden' }}>
      <MapContainer
        center={defaultCenter}
        zoom={12}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {allPoints.length > 0 && <FitBounds points={allPoints} />}

        {validOrders.map(order => (
          <Marker
            key={`order-${order.id}`}
            position={[order.latitude, order.longitude]}
            icon={orderIcon(order.status)}
          >
            <Popup>
              <div style={{ minWidth: 140 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>📦 Pedido #{order.id}</div>
                <div style={{ fontSize: 13, color: '#666' }}>{order.client_name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{order.address}</div>
                <div style={{ marginTop: 6 }}>
                  <span style={{
                    background: order.status === 'delivered' ? '#10b981' :
                      order.status === 'in_route' ? '#f59e0b' : '#ef4444',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    textTransform: 'uppercase',
                  }}>
                    {order.status}
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {validMotos.map(moto => (
          <Marker
            key={`moto-${moto.id}`}
            position={[moto.latitude, moto.longitude]}
            icon={motoIcon(moto.status)}
          >
            <Popup>
              <div style={{ minWidth: 140 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>🏍️ {moto.license_plate}</div>
                <div style={{ fontSize: 13, color: '#666' }}>
                  {moto.driver_id ? `Driver ID: ${moto.driver_id}` : 'Sin driver'}
                </div>
                <div style={{ marginTop: 6 }}>
                  <span style={{
                    background: moto.status === 'available' ? '#3b82f6' :
                      moto.status === 'in_route' ? '#f59e0b' : '#6b7280',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    textTransform: 'uppercase',
                  }}>
                    {moto.status}
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default MapView;
