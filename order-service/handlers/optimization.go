package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/logitrack/order-service/models"
)

type simpleMoto struct {
	ID                 int      `json:"id"`
	LicensePlate       string   `json:"license_plate"`
	Latitude           *float64 `json:"latitude,omitempty"`
	Longitude          *float64 `json:"longitude,omitempty"`
	MaxOrdersCapacity  int      `json:"max_orders_capacity"`
	CurrentOrdersCount int      `json:"current_orders_count"`
}

type simpleOrder struct {
	ID        int     `json:"id"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Address   string  `json:"address"`
}

type optimizeRequest struct {
	Motos            []simpleMoto  `json:"motos"`
	Orders           []simpleOrder `json:"orders"`
	DepotLat         float64       `json:"depot_lat"`
	DepotLng         float64       `json:"depot_lng"`
	SpeedKmh         float64       `json:"speed_kmh"`
	MaxOrdersPerMoto int           `json:"max_orders_per_moto"`
}

type Assignment struct {
	OrderID      int     `json:"order_id"`
	MotoID       int     `json:"moto_id"`
	MotoPlate    string  `json:"moto_plate,omitempty"`
	DistanceKm   float64 `json:"distance_km"`
	EtaMin       float64 `json:"eta_min"`
	OrderAddress string  `json:"order_address,omitempty"`
}

type OptimizationStats struct {
	TotalOrdersAssigned int     `json:"total_orders_assigned"`
	OrdersRemaining     int     `json:"orders_remaining"`
	MotosUsed           int     `json:"motos_used"`
	TotalDistanceKm     float64 `json:"total_distance_km"`
	AvgDistancePerOrder float64 `json:"avg_distance_per_order"`
}

type optimizeResponse struct {
	Assignments      []Assignment      `json:"assignments"`
	Stats            OptimizationStats `json:"stats,omitempty"`
	UnassignedOrders []int             `json:"unassigned_orders,omitempty"`
	Message          string            `json:"message,omitempty"`
}

// OptimizeAssignments collects pending orders and available motos and calls ai-service.
func OptimizeAssignments(c *gin.Context) {
	branchID := c.Query("branch_id")

	// Collect pending orders
	orderQuery := "SELECT id, latitude, longitude, address FROM orders WHERE status = 'pending'"
	orderArgs := []interface{}{}
	if branchID != "" {
		orderQuery += " AND branch = $1"
		orderArgs = append(orderArgs, branchID)
	}

	orows, err := db.Query(orderQuery, orderArgs...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer orows.Close()

	orders := []simpleOrder{}
	for orows.Next() {
		var o simpleOrder
		var addr sql.NullString
		if err := orows.Scan(&o.ID, &o.Latitude, &o.Longitude, &addr); err != nil {
			continue
		}
		if addr.Valid {
			o.Address = addr.String
		}
		orders = append(orders, o)
	}

	// Collect available motos with capacity
	motoQuery := `SELECT id, license_plate, latitude, longitude, max_orders_capacity, current_orders_count 
	              FROM motos 
	              WHERE status = 'available' 
	              AND current_orders_count < max_orders_capacity`
	motoArgs := []interface{}{}
	if branchID != "" {
		motoQuery += " AND branch_id = (SELECT id FROM branches WHERE code = $1)"
		motoArgs = append(motoArgs, branchID)
	}
	motoQuery += " ORDER BY current_orders_count ASC"

	mrows, err := db.Query(motoQuery, motoArgs...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer mrows.Close()

	motos := []simpleMoto{}
	for mrows.Next() {
		var m simpleMoto
		var lat, lng sql.NullFloat64
		if err := mrows.Scan(&m.ID, &m.LicensePlate, &lat, &lng, &m.MaxOrdersCapacity, &m.CurrentOrdersCount); err != nil {
			continue
		}
		if lat.Valid {
			m.Latitude = &lat.Float64
		}
		if lng.Valid {
			m.Longitude = &lng.Float64
		}
		motos = append(motos, m)
	}

	if len(orders) == 0 {
		c.JSON(http.StatusOK, optimizeResponse{
			Assignments: []Assignment{},
			Message:     "No hay pedidos pendientes para optimizar",
		})
		return
	}

	if len(motos) == 0 {
		c.JSON(http.StatusOK, optimizeResponse{
			Assignments: []Assignment{},
			Message:     "No hay motos disponibles con capacidad",
		})
		return
	}

	// Get depot coordinates from branch if specified, otherwise use default (Guatemala)
	depotLat := 14.6349
	depotLng := -90.5069
	if branchID != "" {
		var branchLat, branchLng float64
		err := db.QueryRow("SELECT latitude, longitude FROM branches WHERE code = $1", branchID).Scan(&branchLat, &branchLng)
		if err == nil {
			depotLat = branchLat
			depotLng = branchLng
		}
	}

	// Build request for ai-service
	payload := optimizeRequest{
		Motos:            motos,
		Orders:           orders,
		DepotLat:         depotLat,
		DepotLng:         depotLng,
		SpeedKmh:         25.0,
		MaxOrdersPerMoto: 5,
	}
	buf, err := json.Marshal(payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to marshal payload"})
		return
	}

	resp, err := http.Post("http://ai-service:5000/optimize-assignments", "application/json", bytes.NewReader(buf))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to call ai-service: " + err.Error()})
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

	if len(req.Assignments) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No assignments to apply"})
		return
	}

	routeRepo := models.NewRouteRepository(db)

	// Group assignments by moto for route creation
	byMoto := make(map[int][]int)
	appliedCount := 0

	for _, a := range req.Assignments {
		// Assign order to moto and update status
		_, err := db.Exec(`UPDATE orders SET assigned_moto_id = $1, status = 'assigned', updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
			a.MotoID, a.OrderID)
		if err != nil {
			continue // Log but don't fail entire operation
		}

		// Increment moto's current order count
		_, err = db.Exec(`UPDATE motos SET current_orders_count = current_orders_count + 1 WHERE id = $1`, a.MotoID)
		if err != nil {
			// Log error but continue
		}

		byMoto[a.MotoID] = append(byMoto[a.MotoID], a.OrderID)
		appliedCount++
	}

	// Create routes for each moto with assignments
	routesCreated := 0
	for motoID, orderSeq := range byMoto {
		// Get depot coordinates
		var depotLat, depotLng float64 = 14.6349, -90.5069

		// Try to get moto's branch depot
		err := db.QueryRow(`
			SELECT b.latitude, b.longitude 
			FROM motos m 
			JOIN branches b ON m.branch_id = b.id 
			WHERE m.id = $1`, motoID).Scan(&depotLat, &depotLng)
		if err != nil {
			// Use default if no branch found
		}

		// Build path: depot + order coordinates
		var path []float64
		path = append(path, depotLat, depotLng)
		for _, oid := range orderSeq {
			var lat, lng float64
			err := db.QueryRow("SELECT latitude, longitude FROM orders WHERE id = $1", oid).Scan(&lat, &lng)
			if err == nil {
				path = append(path, lat, lng)
			}
		}

		if err := routeRepo.CreateRoute(motoID, orderSeq, path); err == nil {
			routesCreated++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":         "Assignments applied successfully",
		"orders_assigned": appliedCount,
		"routes_created":  routesCreated,
		"motos_involved":  len(byMoto),
	})
}
