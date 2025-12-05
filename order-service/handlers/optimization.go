package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/logitrack/order-service/models"
)

type simpleMoto struct {
	ID        int     `json:"id"`
	Latitude  float64 `json:"latitude,omitempty"`
	Longitude float64 `json:"longitude,omitempty"`
}

type simpleOrder struct {
	ID        int     `json:"id"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type optimizeRequest struct {
	Motos    []simpleMoto  `json:"motos"`
	Orders   []simpleOrder `json:"orders"`
	DepotLat float64       `json:"depot_lat"`
	DepotLng float64       `json:"depot_lng"`
	SpeedKmh float64       `json:"speed_kmh"`
}

type Assignment struct {
	OrderID    int     `json:"order_id"`
	MotoID     int     `json:"moto_id"`
	DistanceKm float64 `json:"distance_km"`
	EtaMin     float64 `json:"eta_min"`
}

type optimizeResponse struct {
	Assignments []Assignment `json:"assignments"`
}

type motoLocation struct {
	ID        int     `json:"id"`
	OrderID   *int    `json:"order_id"`
	MotoID    *int    `json:"moto_id"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Type      string  `json:"type"`
}

// OptimizeAssignments collects pending orders and available motos and calls ai-service.
func OptimizeAssignments(c *gin.Context) {
	// Collect pending orders
	orows, err := db.Query("SELECT id, latitude, longitude FROM orders WHERE status = 'pending'")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer orows.Close()

	orders := []simpleOrder{}
	for orows.Next() {
		var o simpleOrder
		if err := orows.Scan(&o.ID, &o.Latitude, &o.Longitude); err != nil {
			continue
		}
		orders = append(orders, o)
	}

	// Collect available motos
	mrows, err := db.Query("SELECT id FROM motos WHERE status = 'available'")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer mrows.Close()

	motos := []simpleMoto{}
	for mrows.Next() {
		var m simpleMoto
		if err := mrows.Scan(&m.ID); err != nil {
			continue
		}
		motos = append(motos, m)
	}

	// Enrich motos with latest real positions from geolocation-service when available.
	locResp, err := http.Get("http://geolocation-service:8083/locations/motos/latest")
	if err == nil {
		defer locResp.Body.Close()
		var locs []motoLocation
		if err := json.NewDecoder(locResp.Body).Decode(&locs); err == nil {
			byMoto := make(map[int]motoLocation)
			for _, loc := range locs {
				if loc.MotoID != nil {
					byMoto[*loc.MotoID] = loc
				}
			}
			for i, m := range motos {
				if loc, ok := byMoto[m.ID]; ok {
					motos[i].Latitude = loc.Latitude
					motos[i].Longitude = loc.Longitude
				}
			}
		}
	}

	if len(orders) == 0 || len(motos) == 0 {
		c.JSON(http.StatusOK, gin.H{"assignments": []Assignment{}})
		return
	}

	// Build request for ai-service
	payload := optimizeRequest{
		Motos:    motos,
		Orders:   orders,
		DepotLat: 10.0,
		DepotLng: -75.0,
		SpeedKmh: 25.0,
	}
	buf, err := json.Marshal(payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to marshal payload"})
		return
	}

	resp, err := http.Post("http://ai-service:5000/optimize-assignments", "application/json", bytes.NewReader(buf))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to call ai-service"})
		return
	}
	defer resp.Body.Close()

	var out optimizeResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse ai-service response"})
		return
	}

	c.JSON(http.StatusOK, out)
}

// ApplyOptimizedAssignments applies suggested assignments and persists routes
func ApplyOptimizedAssignments(c *gin.Context) {
	var req optimizeResponse
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	routeRepo := models.NewRouteRepository(db)

	// Group assignments by moto for route creation
	byMoto := make(map[int][]int)
	for _, a := range req.Assignments {
		// Assign order to moto
		_, err := db.Exec("UPDATE orders SET assigned_moto_id = $1, status = 'assigned' WHERE id = $2", a.MotoID, a.OrderID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to assign order"})
			return
		}
		byMoto[a.MotoID] = append(byMoto[a.MotoID], a.OrderID)
	}

	// Create routes for each moto with assignments
	for motoID, orderSeq := range byMoto {
		// Simple optimized path: depot + order coords (placeholder)
		var path []float64
		path = append(path, 10.0, -75.0) // depot
		for _, oid := range orderSeq {
			var lat, lng float64
			err := db.QueryRow("SELECT latitude, longitude FROM orders WHERE id = $1", oid).Scan(&lat, &lng)
			if err == nil {
				path = append(path, lat, lng)
			}
		}
		if err := routeRepo.CreateRoute(motoID, orderSeq, path); err != nil {
			// Log error but don't fail the whole operation
			// TODO: add proper logging
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Assignments applied and routes saved"})
}
