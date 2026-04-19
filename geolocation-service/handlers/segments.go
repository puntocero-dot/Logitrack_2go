package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ============================================================
// TIPOS
// ============================================================

// SegmentEndpoint describe un punto ancla (START, DELIVERY, END) que delimita un segmento
type SegmentEndpoint struct {
	PointType string  `json:"type"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Timestamp string  `json:"timestamp"` // RFC3339
	Address   string  `json:"address,omitempty"`
	OrderID   *int    `json:"order_id,omitempty"`
}

// RouteSegment representa el recorrido entre dos eventos clave
type RouteSegment struct {
	SegmentIndex    int             `json:"segment_index"`
	FromPoint       SegmentEndpoint `json:"from_point"`
	ToPoint         SegmentEndpoint `json:"to_point"`
	DurationSeconds int             `json:"duration_seconds"`
	DistanceKm      float64         `json:"distance_km"`
	AvgSpeedKmh     float64         `json:"avg_speed_kmh"`
	MaxSpeedKmh     float64         `json:"max_speed_kmh"`
	PointsCount     int             `json:"points_count"`
	Stops           []StopInfo      `json:"stops"`
	// Polyline en formato GeoJSON [[lng, lat], ...]
	Polyline [][2]float64 `json:"polyline"`
}

// SegmentTotals agrega estadísticas globales del turno
type SegmentTotals struct {
	TotalDistanceKm      float64 `json:"total_distance_km"`
	TotalDurationSeconds int     `json:"total_duration_seconds"`
	TotalStops           int     `json:"total_stops"`
	DeliveryCount        int     `json:"delivery_count"`
	AvgSegmentDistanceKm float64 `json:"avg_segment_distance_km"`
}

// ============================================================
// HELPERS
// ============================================================

// isAnchorType retorna true si el point_type delimita un segmento
func isAnchorType(pt string) bool {
	return pt == "START" || pt == "DELIVERY" || pt == "END"
}

// buildSegment construye un RouteSegment a partir de un slice de puntos.
// El primer y último punto deben ser de tipo ancla.
func buildSegment(idx int, pts []RoutePoint) RouteSegment {
	if len(pts) == 0 {
		return RouteSegment{SegmentIndex: idx}
	}

	first := pts[0]
	last := pts[len(pts)-1]

	from := SegmentEndpoint{
		PointType: first.PointType,
		Latitude:  first.Latitude,
		Longitude: first.Longitude,
		Timestamp: first.Timestamp.Format("2006-01-02T15:04:05Z07:00"),
		Address:   first.Address,
		OrderID:   first.OrderID,
	}
	to := SegmentEndpoint{
		PointType: last.PointType,
		Latitude:  last.Latitude,
		Longitude: last.Longitude,
		Timestamp: last.Timestamp.Format("2006-01-02T15:04:05Z07:00"),
		Address:   last.Address,
		OrderID:   last.OrderID,
	}

	// Duración
	durationSecs := int(last.Timestamp.Sub(first.Timestamp).Seconds())

	// Distancia acumulada + polyline + max speed
	var totalDist float64
	var maxSpeed float64
	polyline := make([][2]float64, 0, len(pts))

	for i, p := range pts {
		polyline = append(polyline, [2]float64{p.Longitude, p.Latitude})

		if i > 0 {
			totalDist += haversineDistance(pts[i-1].Latitude, pts[i-1].Longitude, p.Latitude, p.Longitude)
		}

		// Speed: el browser Geolocation API reporta en m/s, convertimos a km/h
		if p.Speed != nil {
			kmh := speedMsToKmh(*p.Speed)
			if kmh > maxSpeed {
				maxSpeed = kmh
			}
		}
	}

	// Si speed no vino del device, estimar max speed entre puntos consecutivos via delta tiempo
	if maxSpeed == 0 && len(pts) > 1 {
		for i := 1; i < len(pts); i++ {
			dt := pts[i].Timestamp.Sub(pts[i-1].Timestamp).Hours()
			if dt > 0 {
				d := haversineDistance(pts[i-1].Latitude, pts[i-1].Longitude, pts[i].Latitude, pts[i].Longitude)
				spd := d / dt
				if spd > maxSpeed {
					maxSpeed = spd
				}
			}
		}
	}

	stops := detectStops(pts)

	return RouteSegment{
		SegmentIndex:    idx,
		FromPoint:       from,
		ToPoint:         to,
		DurationSeconds: durationSecs,
		DistanceKm:      totalDist,
		AvgSpeedKmh:     calcAvgSpeed(totalDist, durationSecs),
		MaxSpeedKmh:     maxSpeed,
		PointsCount:     len(pts),
		Stops:           stops,
		Polyline:        polyline,
	}
}

// ============================================================
// HANDLERS
// ============================================================

// GetShiftSegments devuelve la ruta del turno segmentada por entregas.
// GET /shifts/:id/segments
//
// Cada segmento cubre el recorrido entre dos puntos ancla consecutivos
// (START → DELIVERY, DELIVERY → DELIVERY, DELIVERY → END).
// Incluye tiempos exactos, distancia, velocidad promedio/máxima, paradas detectadas y polyline.
func GetShiftSegments(c *gin.Context) {
	shiftID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de turno inválido"})
		return
	}

	// Cargar todos los puntos del turno ordenados cronológicamente
	rows, err := db.Query(`
		SELECT id, shift_id, latitude, longitude, accuracy, speed, heading, altitude,
		       timestamp, point_type, order_id, address, created_at
		FROM route_points
		WHERE shift_id = $1
		ORDER BY timestamp ASC
	`, shiftID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener puntos de ruta"})
		return
	}
	defer rows.Close()

	var allPoints []RoutePoint
	for rows.Next() {
		var p RoutePoint
		if err := rows.Scan(
			&p.ID, &p.ShiftID, &p.Latitude, &p.Longitude,
			&p.Accuracy, &p.Speed, &p.Heading, &p.Altitude,
			&p.Timestamp, &p.PointType, &p.OrderID, &p.Address, &p.CreatedAt,
		); err != nil {
			continue
		}
		allPoints = append(allPoints, p)
	}

	if len(allPoints) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"shift_id": shiftID,
			"segments": []RouteSegment{},
			"totals":   SegmentTotals{},
		})
		return
	}

	// Partir los puntos en segmentos usando los puntos ancla como delimitadores
	var segments []RouteSegment
	var currentSegment []RoutePoint
	segIdx := 0

	for _, p := range allPoints {
		currentSegment = append(currentSegment, p)

		// Cuando llegamos a un ancla que NO es el punto de inicio del segmento actual,
		// cerramos el segmento
		if isAnchorType(p.PointType) && len(currentSegment) > 1 {
			seg := buildSegment(segIdx, currentSegment)
			segments = append(segments, seg)
			segIdx++
			// El punto ancla es también el inicio del siguiente segmento
			currentSegment = []RoutePoint{p}
		}
	}

	// Si quedan puntos sin cerrar (turno aún activo), crear segmento abierto
	if len(currentSegment) > 1 {
		seg := buildSegment(segIdx, currentSegment)
		segments = append(segments, seg)
	}

	// Calcular totales
	var totals SegmentTotals
	for _, seg := range segments {
		totals.TotalDistanceKm += seg.DistanceKm
		totals.TotalDurationSeconds += seg.DurationSeconds
		totals.TotalStops += len(seg.Stops)
		if seg.ToPoint.PointType == "DELIVERY" {
			totals.DeliveryCount++
		}
	}
	if len(segments) > 0 {
		totals.AvgSegmentDistanceKm = totals.TotalDistanceKm / float64(len(segments))
	}

	c.JSON(http.StatusOK, gin.H{
		"shift_id": shiftID,
		"segments": segments,
		"totals":   totals,
	})
}

// GetShiftStops devuelve todas las paradas detectadas en un turno (sin segmentar).
// GET /shifts/:id/stops
//
// Útil para mostrar en el mapa todos los puntos donde el driver se detuvo
// (semáforos, esperas de cliente, tráfico), con tiempo exacto de inicio y duración.
func GetShiftStops(c *gin.Context) {
	shiftID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de turno inválido"})
		return
	}

	rows, err := db.Query(`
		SELECT id, shift_id, latitude, longitude, accuracy, speed, heading, altitude,
		       timestamp, point_type, order_id, address, created_at
		FROM route_points
		WHERE shift_id = $1
		ORDER BY timestamp ASC
	`, shiftID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener puntos de ruta"})
		return
	}
	defer rows.Close()

	var allPoints []RoutePoint
	for rows.Next() {
		var p RoutePoint
		if err := rows.Scan(
			&p.ID, &p.ShiftID, &p.Latitude, &p.Longitude,
			&p.Accuracy, &p.Speed, &p.Heading, &p.Altitude,
			&p.Timestamp, &p.PointType, &p.OrderID, &p.Address, &p.CreatedAt,
		); err != nil {
			continue
		}
		allPoints = append(allPoints, p)
	}

	stops := detectStops(allPoints)

	c.JSON(http.StatusOK, gin.H{
		"shift_id": shiftID,
		"stops":    stops,
		"total":    len(stops),
	})
}
