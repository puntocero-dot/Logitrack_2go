package handlers

import (
	"math"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type etaResponse struct {
	DistanceKm float64 `json:"distance_km"`
	EtaMin     float64 `json:"eta_min"`
}

// Haversine km
func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	R := 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLon := (lon2 - lon1) * math.Pi / 180.0
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180.0)*math.Cos(lat2*math.Pi/180.0)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

// GetOrderETA returns distance and ETA from the assigned moto's latest location to the order destination.
func GetOrderETA(c *gin.Context) {
	idStr := c.Param("id")
	orderID, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid order id"})
		return
	}

	// Get order details (destination and assigned moto)
	var assignedMotoID *int
	var orderLat, orderLng float64
	err = db.QueryRow("SELECT assigned_moto_id, latitude, longitude FROM orders WHERE id = $1", orderID).
		Scan(&assignedMotoID, &orderLat, &orderLng)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		return
	}
	if assignedMotoID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order has no assigned moto"})
		return
	}
	motoID := *assignedMotoID

	// Get latest location for this moto (type='current')
	var motoLat, motoLng float64
	err = db.QueryRow(`SELECT latitude, longitude FROM locations 
		WHERE moto_id = $1 AND type = 'current' ORDER BY timestamp DESC LIMIT 1`, motoID).
		Scan(&motoLat, &motoLng)
	if err != nil {
		// Fallback to depot if no location yet
		motoLat, motoLng = 10.0, -75.0
	}

	// Compute distance and ETA
	distanceKm := haversine(motoLat, motoLng, orderLat, orderLng)
	speedKmh := 25.0 // average city speed
	etaMin := distanceKm / speedKmh * 60.0

	c.JSON(http.StatusOK, etaResponse{
		DistanceKm: distanceKm,
		EtaMin:     etaMin,
	})
}
