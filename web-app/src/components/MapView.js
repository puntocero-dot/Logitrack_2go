import React, { useMemo } from 'react';
import Map, { Marker, Popup } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

const MapView = ({ orders, motos }) => {
  const validOrders = Array.isArray(orders)
    ? orders.filter(o => typeof o.latitude === 'number' && typeof o.longitude === 'number')
    : [];

  const validMotos = Array.isArray(motos)
    ? motos
        .filter(m => m.latitude && m.longitude && typeof m.latitude === 'number' && typeof m.longitude === 'number')
        .map(m => ({ ...m, latitude: m.latitude, longitude: m.longitude }))
    : [];

  const initialViewState = useMemo(() => {
    const allPoints = [...validOrders, ...validMotos];
    if (allPoints.length === 0) {
      return {
        latitude: 10.0,
        longitude: -75.0,
        zoom: 12,
      };
    }
    const avgLat = allPoints.reduce((sum, p) => sum + p.latitude, 0) / allPoints.length;
    const avgLng = allPoints.reduce((sum, p) => sum + p.longitude, 0) / allPoints.length;
    return {
      latitude: avgLat,
      longitude: avgLng,
      zoom: 12,
    };
  }, [validOrders, validMotos]);

  const [popupInfo, setPopupInfo] = React.useState(null);

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{ height: '400px', marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2a2a2a', color: '#9ca3af', borderRadius: 8 }}>
        Configura REACT_APP_MAPBOX_TOKEN en el archivo .env para ver el mapa.
      </div>
    );
  }

  return (
    <div style={{ height: '400px', marginTop: '20px' }}>
      <Map
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        {validOrders.map(order => (
          <Marker
            key={`order-${order.id}`}
            longitude={order.longitude}
            latitude={order.latitude}
            anchor="bottom"
            color={order.status === 'delivered' ? '#10b981' : order.status === 'in_route' ? '#f59e0b' : '#ef4444'}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setPopupInfo({ type: 'order', data: order, lng: order.longitude, lat: order.latitude });
            }}
          />
        ))}

        {validMotos.map(moto => (
          <Marker
            key={`moto-${moto.id}`}
            longitude={moto.longitude}
            latitude={moto.latitude}
            anchor="bottom"
            color={moto.status === 'available' ? '#3b82f6' : moto.status === 'in_route' ? '#f59e0b' : '#6b7280'}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setPopupInfo({ type: 'moto', data: moto, lng: moto.longitude, lat: moto.latitude });
            }}
          />
        ))}

        {popupInfo && (
          <Popup
            longitude={popupInfo.lng}
            latitude={popupInfo.lat}
            anchor="top"
            onClose={() => setPopupInfo(null)}
            style={{ background: '#1a1a1a', color: '#e5e5e5', border: '1px solid #444' }}
          >
            <div style={{ padding: 8, minWidth: 140 }}>
              {popupInfo.type === 'order' ? (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Pedido #{popupInfo.data.id}</div>
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>{popupInfo.data.client_name}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{popupInfo.data.address}</div>
                  <div style={{ marginTop: 6 }}>
                    <span
                      style={{
                        background:
                          popupInfo.data.status === 'delivered'
                            ? '#10b981'
                            : popupInfo.data.status === 'in_route'
                            ? '#f59e0b'
                            : '#ef4444',
                        color: '#fff',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                        textTransform: 'uppercase',
                      }}
                    >
                      {popupInfo.data.status}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Moto {popupInfo.data.license_plate}</div>
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>
                    {popupInfo.data.driver_id ? `Driver ID: ${popupInfo.data.driver_id}` : 'Sin driver'}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <span
                      style={{
                        background:
                          popupInfo.data.status === 'available'
                            ? '#3b82f6'
                            : popupInfo.data.status === 'in_route'
                            ? '#f59e0b'
                            : '#6b7280',
                        color: '#fff',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                        textTransform: 'uppercase',
                      }}
                    >
                      {popupInfo.data.status}
                    </span>
                  </div>
                </>
              )}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
};

export default MapView;
