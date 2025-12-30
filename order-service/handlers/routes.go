package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// RoutePoint represents a GPS tracking point
type RoutePoint struct {
	ID             int       `json:"id"`
	MotoID         int       `json:"moto_id"`
	OrderID        *int      `json:"order_id"`
	Latitude       float64   `json:"latitude"`
	Longitude      float64   `json:"longitude"`
	SpeedKmh       *float64  `json:"speed_kmh"`
	Heading        *float64  `json:"heading"`
	AccuracyMeters *float64  `json:"accuracy_meters"`
	RecordedAt     time.Time `json:"recorded_at"`
	PointType      string    `json:"point_type"`
}

// GetMotoRoute returns the GPS route history for a moto
func GetMotoRoute(c *gin.Context) {
	motoID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid moto id"})
		return
	}

	// Optional filters
	dateFrom := c.Query("date_from") // YYYY-MM-DD
	dateTo := c.Query("date_to")     // YYYY-MM-DD
	orderID := c.Query("order_id")

	query := `SELECT id, moto_id, order_id, latitude, longitude, speed_kmh, heading, 
	          accuracy_meters, recorded_at, point_type 
	          FROM route_points WHERE moto_id = $1`
	args := []interface{}{motoID}
	argNum := 2

	if orderID != "" {
		query += " AND order_id = $" + strconv.Itoa(argNum)
		args = append(args, orderID)
		argNum++
	}

	if dateFrom != "" {
		query += " AND DATE(recorded_at) >= $" + strconv.Itoa(argNum)
		args = append(args, dateFrom)
		argNum++
	}

	if dateTo != "" {
		query += " AND DATE(recorded_at) <= $" + strconv.Itoa(argNum)
		args = append(args, dateTo)
		argNum++
	}

	query += " ORDER BY recorded_at ASC"

	rows, err := db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get route: " + err.Error()})
		return
	}
	defer rows.Close()

	var points []RoutePoint
	for rows.Next() {
		var p RoutePoint
		if err := rows.Scan(&p.ID, &p.MotoID, &p.OrderID, &p.Latitude, &p.Longitude,
			&p.SpeedKmh, &p.Heading, &p.AccuracyMeters, &p.RecordedAt, &p.PointType); err != nil {
			continue
		}
		points = append(points, p)
	}

	// Calculate route statistics
	var totalDistance float64
	var totalTime float64
	var avgSpeed float64
	var speedCount int

	for i := 1; i < len(points); i++ {
		// Distance between consecutive points (Haversine)
		dist := haversineDistance(points[i-1].Latitude, points[i-1].Longitude,
			points[i].Latitude, points[i].Longitude)
		totalDistance += dist

		// Time difference
		timeDiff := points[i].RecordedAt.Sub(points[i-1].RecordedAt).Seconds()
		totalTime += timeDiff

		if points[i].SpeedKmh != nil {
			avgSpeed += *points[i].SpeedKmh
			speedCount++
		}
	}

	if speedCount > 0 {
		avgSpeed = avgSpeed / float64(speedCount)
	}

	c.JSON(http.StatusOK, gin.H{
		"moto_id":            motoID,
		"points":             points,
		"total_points":       len(points),
		"total_distance_km":  totalDistance,
		"total_time_minutes": totalTime / 60,
		"average_speed_kmh":  avgSpeed,
	})
}

// GetOrderRoute returns the GPS route for a specific order
func GetOrderRoute(c *gin.Context) {
	orderID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid order id"})
		return
	}

	query := `SELECT id, moto_id, order_id, latitude, longitude, speed_kmh, heading, 
	          accuracy_meters, recorded_at, point_type 
	          FROM route_points WHERE order_id = $1 ORDER BY recorded_at ASC`

	rows, err := db.Query(query, orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get route: " + err.Error()})
		return
	}
	defer rows.Close()

	var points []RoutePoint
	for rows.Next() {
		var p RoutePoint
		if err := rows.Scan(&p.ID, &p.MotoID, &p.OrderID, &p.Latitude, &p.Longitude,
			&p.SpeedKmh, &p.Heading, &p.AccuracyMeters, &p.RecordedAt, &p.PointType); err != nil {
			continue
		}
		points = append(points, p)
	}

	// Get order info
	var orderLat, orderLng float64
	var orderStatus, clientName string
	db.QueryRow(`SELECT latitude, longitude, status, client_name FROM orders WHERE id = $1`, orderID).
		Scan(&orderLat, &orderLng, &orderStatus, &clientName)

	// Calculate route statistics
	var totalDistance float64
	for i := 1; i < len(points); i++ {
		dist := haversineDistance(points[i-1].Latitude, points[i-1].Longitude,
			points[i].Latitude, points[i].Longitude)
		totalDistance += dist
	}

	// Calculate delivery time if applicable
	var deliveryTimeMinutes float64
	if len(points) >= 2 {
		startTime := points[0].RecordedAt
		endTime := points[len(points)-1].RecordedAt
		deliveryTimeMinutes = endTime.Sub(startTime).Minutes()
	}

	c.JSON(http.StatusOK, gin.H{
		"order_id":              orderID,
		"client_name":           clientName,
		"order_status":          orderStatus,
		"destination":           gin.H{"latitude": orderLat, "longitude": orderLng},
		"points":                points,
		"total_points":          len(points),
		"total_distance_km":     totalDistance,
		"delivery_time_minutes": deliveryTimeMinutes,
	})
}

// haversineDistance calculates distance between two lat/lng points in km
func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371 // Earth radius in km
	dLat := (lat2 - lat1) * 0.0174533
	dLon := (lon2 - lon1) * 0.0174533
	lat1Rad := lat1 * 0.0174533
	lat2Rad := lat2 * 0.0174533

	a := (dLat/2)*(dLat/2) + (dLon/2)*(dLon/2)*lat1Rad*lat2Rad
	c := 2 * a // Simplified for small distances
	return R * c
}
