package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type Shift struct {
	ID              int        `json:"id"`
	DriverID        int        `json:"driver_id"`
	Branch          string     `json:"branch"`
	StartTime       time.Time  `json:"start_time"`
	EndTime         *time.Time `json:"end_time,omitempty"`
	Status          string     `json:"status"`
	TotalDistanceKm float64    `json:"total_distance_km"`
	TotalDeliveries int        `json:"total_deliveries"`
	Notes           string     `json:"notes,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type RoutePoint struct {
	ID        int        `json:"id"`
	ShiftID   int        `json:"shift_id"`
	Latitude  float64    `json:"latitude"`
	Longitude float64    `json:"longitude"`
	Accuracy  *float64   `json:"accuracy,omitempty"`
	Speed     *float64   `json:"speed,omitempty"`
	Heading   *float64   `json:"heading,omitempty"`
	Altitude  *float64   `json:"altitude,omitempty"`
	Timestamp time.Time  `json:"timestamp"`
	PointType string     `json:"point_type"`
	OrderID   *int       `json:"order_id,omitempty"`
	Address   string     `json:"address,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

type StartShiftRequest struct {
	DriverID  int     `json:"driver_id" binding:"required"`
	Branch    string  `json:"branch"`
	Latitude  float64 `json:"latitude" binding:"required"`
	Longitude float64 `json:"longitude" binding:"required"`
	Address   string  `json:"address"`
}

type AddRoutePointRequest struct {
	Latitude  float64  `json:"latitude" binding:"required"`
	Longitude float64  `json:"longitude" binding:"required"`
	Accuracy  *float64 `json:"accuracy"`
	Speed     *float64 `json:"speed"`
	Heading   *float64 `json:"heading"`
	Altitude  *float64 `json:"altitude"`
	PointType string   `json:"point_type"`
	OrderID   *int     `json:"order_id"`
	Address   string   `json:"address"`
}

type EndShiftRequest struct {
	Latitude  float64 `json:"latitude" binding:"required"`
	Longitude float64 `json:"longitude" binding:"required"`
	Notes     string  `json:"notes"`
}

// InitShiftHandlers inicializa los handlers con la conexión a BD
func InitShiftHandlers(database *sql.DB) {
	db = database
}

// StartShift inicia un nuevo turno
func StartShift(c *gin.Context) {
	var req StartShiftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos: " + err.Error()})
		return
	}

	// Verificar si el driver ya tiene un turno activo
	var activeShiftCount int
	err := db.QueryRow(`
		SELECT COUNT(*) FROM shifts 
		WHERE driver_id = $1 AND status = 'ACTIVE'
	`, req.DriverID).Scan(&activeShiftCount)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al verificar turnos activos"})
		return
	}

	if activeShiftCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "El driver ya tiene un turno activo"})
		return
	}

	// Crear el turno
	tx, err := db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al iniciar transacción"})
		return
	}
	defer tx.Rollback()

	var shift Shift
	err = tx.QueryRow(`
		INSERT INTO shifts (driver_id, branch, start_time, status)
		VALUES ($1, COALESCE($2, 'central'), NOW(), 'ACTIVE')
		RETURNING id, driver_id, branch, start_time, status, total_distance_km, 
				  total_deliveries, created_at, updated_at
	`, req.DriverID, req.Branch).Scan(
		&shift.ID, &shift.DriverID, &shift.Branch, &shift.StartTime,
		&shift.Status, &shift.TotalDistanceKm, &shift.TotalDeliveries,
		&shift.CreatedAt, &shift.UpdatedAt,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear turno"})
		return
	}

	// Crear punto inicial
	var routePoint RoutePoint
	err = tx.QueryRow(`
		INSERT INTO route_points (shift_id, latitude, longitude, point_type, address, timestamp)
		VALUES ($1, $2, $3, 'START', $4, NOW())
		RETURNING id, shift_id, latitude, longitude, timestamp, point_type, address, created_at
	`, shift.ID, req.Latitude, req.Longitude, req.Address).Scan(
		&routePoint.ID, &routePoint.ShiftID, &routePoint.Latitude,
		&routePoint.Longitude, &routePoint.Timestamp, &routePoint.PointType,
		&routePoint.Address, &routePoint.CreatedAt,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear punto inicial"})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al confirmar transacción"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"shift":       shift,
		"start_point": routePoint,
		"message":     "Turno iniciado exitosamente",
	})
}

// AddRoutePoint agrega un punto GPS al turno activo
func AddRoutePoint(c *gin.Context) {
	shiftID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de turno inválido"})
		return
	}

	var req AddRoutePointRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos: " + err.Error()})
		return
	}

	// Verificar que el turno existe y está activo
	var status string
	err = db.QueryRow("SELECT status FROM shifts WHERE id = $1", shiftID).Scan(&status)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Turno no encontrado"})
		return
	}
	if status != "ACTIVE" {
		c.JSON(http.StatusConflict, gin.H{"error": "El turno no está activo"})
		return
	}

	// Establecer tipo de punto por defecto
	pointType := "TRACKING"
	if req.PointType != "" {
		pointType = req.PointType
	}

	// Insertar punto de ruta
	var routePoint RoutePoint
	err = db.QueryRow(`
		INSERT INTO route_points (
			shift_id, latitude, longitude, accuracy, speed, heading, altitude,
			point_type, order_id, address, timestamp
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
		RETURNING id, shift_id, latitude, longitude, accuracy, speed, heading, 
				  altitude, timestamp, point_type, order_id, address, created_at
	`, shiftID, req.Latitude, req.Longitude, req.Accuracy, req.Speed,
		req.Heading, req.Altitude, pointType, req.OrderID, req.Address).Scan(
		&routePoint.ID, &routePoint.ShiftID, &routePoint.Latitude,
		&routePoint.Longitude, &routePoint.Accuracy, &routePoint.Speed,
		&routePoint.Heading, &routePoint.Altitude, &routePoint.Timestamp,
		&routePoint.PointType, &routePoint.OrderID, &routePoint.Address,
		&routePoint.CreatedAt,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al guardar punto de ruta"})
		return
	}

	c.JSON(http.StatusCreated, routePoint)
}

// EndShift finaliza un turno
func EndShift(c *gin.Context) {
	shiftID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de turno inválido"})
		return
	}

	var req EndShiftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos: " + err.Error()})
		return
	}

	tx, err := db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al iniciar transacción"})
		return
	}
	defer tx.Rollback()

	// Crear punto final
	_, err = tx.Exec(`
		INSERT INTO route_points (shift_id, latitude, longitude, point_type, timestamp)
		VALUES ($1, $2, $3, 'END', NOW())
	`, shiftID, req.Latitude, req.Longitude)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear punto final"})
		return
	}

	// Actualizar turno
	var shift Shift
	err = tx.QueryRow(`
		UPDATE shifts 
		SET end_time = NOW(), 
		    status = 'COMPLETED',
		    notes = $2,
		    total_deliveries = (
		        SELECT COUNT(DISTINCT order_id) 
		        FROM route_points 
		        WHERE shift_id = $1 AND point_type = 'DELIVERY' AND order_id IS NOT NULL
		    )
		WHERE id = $1
		RETURNING id, driver_id, branch, start_time, end_time, status, 
				  total_distance_km, total_deliveries, notes, created_at, updated_at
	`, shiftID, req.Notes).Scan(
		&shift.ID, &shift.DriverID, &shift.Branch, &shift.StartTime,
		&shift.EndTime, &shift.Status, &shift.TotalDistanceKm,
		&shift.TotalDeliveries, &shift.Notes, &shift.CreatedAt, &shift.UpdatedAt,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al finalizar turno"})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al confirmar transacción"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"shift":   shift,
		"message": "Turno finalizado exitosamente",
	})
}

// GetShiftRoute obtiene todos los puntos de ruta de un turno
func GetShiftRoute(c *gin.Context) {
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener ruta"})
		return
	}
	defer rows.Close()

	var points []RoutePoint
	for rows.Next() {
		var point RoutePoint
		err := rows.Scan(
			&point.ID, &point.ShiftID, &point.Latitude, &point.Longitude,
			&point.Accuracy, &point.Speed, &point.Heading, &point.Altitude,
			&point.Timestamp, &point.PointType, &point.OrderID, &point.Address,
			&point.CreatedAt,
		)
		if err != nil {
			continue
		}
		points = append(points, point)
	}

	c.JSON(http.StatusOK, gin.H{
		"shift_id": shiftID,
		"points":   points,
		"total":    len(points),
	})
}

// GetDriverShifts obtiene todos los turnos de un driver
func GetDriverShifts(c *gin.Context) {
	driverID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de driver inválido"})
		return
	}

	// Query parameters opcionales
	status := c.Query("status")
	branch := c.Query("branch")
	limit := c.DefaultQuery("limit", "50")

	query := `
		SELECT id, driver_id, branch, start_time, end_time, status,
		       total_distance_km, total_deliveries, notes, created_at, updated_at
		FROM shifts
		WHERE driver_id = $1
	`
	args := []interface{}{driverID}
	argIdx := 2

	if status != "" {
		query += " AND status = $" + strconv.Itoa(argIdx)
		args = append(args, status)
		argIdx++
	}

	if branch != "" {
		query += " AND branch = $" + strconv.Itoa(argIdx)
		args = append(args, branch)
		argIdx++
	}

	query += " ORDER BY start_time DESC LIMIT $" + strconv.Itoa(argIdx)
	args = append(args, limit)

	rows, err := db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener turnos"})
		return
	}
	defer rows.Close()

	var shifts []Shift
	for rows.Next() {
		var shift Shift
		err := rows.Scan(
			&shift.ID, &shift.DriverID, &shift.Branch, &shift.StartTime,
			&shift.EndTime, &shift.Status, &shift.TotalDistanceKm,
			&shift.TotalDeliveries, &shift.Notes, &shift.CreatedAt, &shift.UpdatedAt,
		)
		if err != nil {
			continue
		}
		shifts = append(shifts, shift)
	}

	c.JSON(http.StatusOK, gin.H{
		"driver_id": driverID,
		"shifts":    shifts,
		"total":     len(shifts),
	})
}

// GetActiveShifts obtiene todos los turnos activos (para supervisores)
func GetActiveShifts(c *gin.Context) {
	branch := c.Query("branch")

	query := `
		SELECT s.id, s.driver_id, s.branch, s.start_time, s.status,
		       s.total_distance_km, s.total_deliveries, s.created_at, s.updated_at,
		       u.name as driver_name, u.email as driver_email,
		       COUNT(rp.id) as total_points
		FROM shifts s
		INNER JOIN users u ON s.driver_id = u.id
		LEFT JOIN route_points rp ON s.id = rp.shift_id
		WHERE s.status = 'ACTIVE'
	`
	args := []interface{}{}

	if branch != "" {
		query += " AND s.branch = $1"
		args = append(args, branch)
	}

	query += " GROUP BY s.id, u.name, u.email ORDER BY s.start_time DESC"

	rows, err := db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener turnos activos"})
		return
	}
	defer rows.Close()

	type ActiveShiftInfo struct {
		Shift
		DriverName  string `json:"driver_name"`
		DriverEmail string `json:"driver_email"`
		TotalPoints int    `json:"total_points"`
	}

	var shifts []ActiveShiftInfo
	for rows.Next() {
		var shift ActiveShiftInfo
		err := rows.Scan(
			&shift.ID, &shift.DriverID, &shift.Branch, &shift.StartTime,
			&shift.Status, &shift.TotalDistanceKm, &shift.TotalDeliveries,
			&shift.CreatedAt, &shift.UpdatedAt, &shift.DriverName,
			&shift.DriverEmail, &shift.TotalPoints,
		)
		if err != nil {
			continue
		}
		shifts = append(shifts, shift)
	}

	c.JSON(http.StatusOK, gin.H{
		"active_shifts": shifts,
		"total":         len(shifts),
	})
}
