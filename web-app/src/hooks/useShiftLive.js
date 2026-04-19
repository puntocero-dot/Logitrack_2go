import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook para live tracking de un turno vía WebSocket.
 * Conecta a /geo/shifts/:shiftId/live?token=<jwt> y acumula puntos GPS en tiempo real.
 *
 * @param {number|null} shiftId - ID del turno a seguir. null = no conectar.
 * @param {string|null} token   - JWT Bearer del usuario autenticado.
 * @returns {{
 *   lastPoint: object|null,    — último RoutePoint recibido
 *   points: object[],          — acumulado de todos los puntos recibidos en esta sesión WS
 *   connected: boolean,
 *   error: string|null
 * }}
 */
const useShiftLive = (shiftId, token) => {
  const [lastPoint, setLastPoint] = useState(null);
  const [points, setPoints] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const retryCount = useRef(0);
  const unmounted = useRef(false);

  // Derivar la URL base del WebSocket desde la URL del API
  const buildWsUrl = useCallback(() => {
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8085';
    // http:// → ws://, https:// → wss://
    const wsBase = apiUrl.replace(/^http/, 'ws');
    return `${wsBase}/geo/shifts/${shiftId}/live?token=${encodeURIComponent(token)}`;
  }, [shiftId, token]);

  const connect = useCallback(() => {
    if (!shiftId || !token || unmounted.current) return;

    const url = buildWsUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) { ws.close(); return; }
      setConnected(true);
      setError(null);
      retryCount.current = 0;
    };

    ws.onmessage = (event) => {
      if (unmounted.current) return;
      try {
        const point = JSON.parse(event.data);
        setLastPoint(point);
        setPoints((prev) => [...prev, point]);
      } catch {
        // Ignorar mensajes no-JSON (e.g. pings de texto)
      }
    };

    ws.onerror = () => {
      if (unmounted.current) return;
      setError('Error de conexión WebSocket');
    };

    ws.onclose = (event) => {
      if (unmounted.current) return;
      setConnected(false);

      // No reconectar si el cierre fue limpio o el componente se desmontó
      if (event.wasClean || unmounted.current) return;

      // Backoff exponencial: 1s, 2s, 4s, 8s, máx 30s
      const delay = Math.min(1000 * Math.pow(2, retryCount.current), 30000);
      retryCount.current += 1;

      reconnectTimer.current = setTimeout(() => {
        if (!unmounted.current) connect();
      }, delay);
    };
  }, [shiftId, token, buildWsUrl]);

  useEffect(() => {
    unmounted.current = false;
    retryCount.current = 0;
    setPoints([]);
    setLastPoint(null);
    setError(null);

    if (shiftId && token) {
      connect();
    }

    return () => {
      unmounted.current = true;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close(1000, 'Componente desmontado');
      }
    };
  }, [shiftId, token, connect]);

  return { lastPoint, points, connected, error };
};

export default useShiftLive;
