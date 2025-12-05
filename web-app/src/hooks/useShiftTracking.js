import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const GEOLOCATION_API_BASE = 'http://localhost:8088';
const TRACKING_INTERVAL = 60000; // 60 segundos

/**
 * Hook personalizado para gestión de turnos y tracking GPS automático
 * 
 * @param {number} driverId - ID del driver
 * @param {string} branch - Sucursal del driver
 * @returns {object} Estado y funciones del tracking
 */
const useShiftTracking = (driverId, branch = 'central') => {
  const [activeShift, setActiveShift] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState(null);
  const [lastPosition, setLastPosition] = useState(null);
  const [trackingStats, setTrackingStats] = useState({
    pointsRecorded: 0,
    lastUpdate: null,
  });

  const trackingIntervalRef = useRef(null);
  const watchIdRef = useRef(null);

  /**
   * Obtener posición GPS actual
   */
  const getCurrentPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalización no soportada por el navegador'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            heading: position.coords.heading,
            altitude: position.coords.altitude,
          };
          resolve(coords);
        },
        (err) => {
          reject(new Error(`Error GPS: ${err.message}`));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  }, []);

  /**
   * Iniciar turno
   */
  const startShift = useCallback(async () => {
    try {
      setError(null);
      const position = await getCurrentPosition();

      const response = await axios.post(`${GEOLOCATION_API_BASE}/shifts/start`, {
        driver_id: driverId,
        branch: branch,
        latitude: position.latitude,
        longitude: position.longitude,
        address: '', // Opcional: agregar reverse geocoding
      });

      setActiveShift(response.data.shift);
      setLastPosition(position);
      setIsTracking(true);
      setTrackingStats({ pointsRecorded: 1, lastUpdate: new Date() });

      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Error al iniciar turno';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, [driverId, branch, getCurrentPosition]);

  /**
   * Agregar punto de ruta manual
   */
  const addRoutePoint = useCallback(async (pointType = 'TRACKING', orderId = null) => {
    if (!activeShift) {
      throw new Error('No hay turno activo');
    }

    try {
      const position = await getCurrentPosition();

      const response = await axios.post(
        `${GEOLOCATION_API_BASE}/shifts/${activeShift.id}/point`,
        {
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy,
          speed: position.speed,
          heading: position.heading,
          altitude: position.altitude,
          point_type: pointType,
          order_id: orderId,
          address: '', // Opcional: agregar reverse geocoding
        }
      );

      setLastPosition(position);
      setTrackingStats((prev) => ({
        pointsRecorded: prev.pointsRecorded + 1,
        lastUpdate: new Date(),
      }));

      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Error al guardar punto';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, [activeShift, getCurrentPosition]);

  /**
   * Finalizar turno
   */
  const endShift = useCallback(async (notes = '') => {
    if (!activeShift) {
      throw new Error('No hay turno activo');
    }

    try {
      setError(null);
      const position = await getCurrentPosition();

      const response = await axios.post(
        `${GEOLOCATION_API_BASE}/shifts/${activeShift.id}/end`,
        {
          latitude: position.latitude,
          longitude: position.longitude,
          notes: notes,
        }
      );

      setActiveShift(null);
      setIsTracking(false);
      setLastPosition(null);
      setTrackingStats({ pointsRecorded: 0, lastUpdate: null });

      // Limpiar tracking automático
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }

      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Error al finalizar turno';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, [activeShift, getCurrentPosition]);

  /**
   * Obtener historial de turnos del driver
   */
  const getDriverShifts = useCallback(async (status = null, limit = 50) => {
    try {
      const params = { limit };
      if (status) params.status = status;

      const response = await axios.get(
        `${GEOLOCATION_API_BASE}/drivers/${driverId}/shifts`,
        { params }
      );

      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Error al obtener turnos';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, [driverId]);

  /**
   * Obtener ruta completa de un turno
   */
  const getShiftRoute = useCallback(async (shiftId) => {
    try {
      const response = await axios.get(
        `${GEOLOCATION_API_BASE}/shifts/${shiftId}/route`
      );
      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Error al obtener ruta';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  /**
   * Tracking automático cada 60 segundos
   */
  useEffect(() => {
    if (isTracking && activeShift) {
      // Iniciar tracking automático
      trackingIntervalRef.current = setInterval(async () => {
        try {
          await addRoutePoint('TRACKING');
        } catch (err) {
          console.error('Error en tracking automático:', err);
        }
      }, TRACKING_INTERVAL);

      // Limpiar al desmontar o detener tracking
      return () => {
        if (trackingIntervalRef.current) {
          clearInterval(trackingIntervalRef.current);
          trackingIntervalRef.current = null;
        }
      };
    }
  }, [isTracking, activeShift, addRoutePoint]);

  /**
   * Limpiar watchers al desmontar
   */
  useEffect(() => {
    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
      }
    };
  }, []);

  return {
    // Estado
    activeShift,
    isTracking,
    error,
    lastPosition,
    trackingStats,

    // Funciones
    startShift,
    endShift,
    addRoutePoint,
    getDriverShifts,
    getShiftRoute,
    getCurrentPosition,

    // Utilidades
    clearError: () => setError(null),
  };
};

export default useShiftTracking;
