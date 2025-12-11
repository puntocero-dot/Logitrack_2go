package handlers

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/logitrack/order-service/models"
)

// ========================================
// MOTOS HANDLERS (Actualizado con ubicación)
// ========================================

func GetMotos(c *gin.Context) {
	branchID := c.Query("branch_id")
	status := c.Query("status")
	userBranch := c.GetHeader("X-User-Branch")
	userRole := c.GetHeader("X-User-Role")

	// Query actualizada para usar current_branch_id (sucursal efectiva)
	query := `SELECT m.id, m.license_plate, m.driver_id, m.branch_id, 
	          COALESCE(m.current_branch_id, m.branch_id) as effective_branch_id,
	          m.status, m.latitude, m.longitude, m.max_orders_capacity, m.current_orders_count,
	          m.transfer_expires_at, m.transfer_reason,
	          CASE WHEN m.current_branch_id != m.branch_id AND m.current_branch_id IS NOT NULL THEN true ELSE false END as is_transferred
	          FROM motos m WHERE 1=1`
	args := []interface{}{}
	argCount := 0

	// Filtro explícito por branch_id del query param
	if branchID != "" {
		argCount++
		query += " AND COALESCE(m.current_branch_id, m.branch_id) = $" + strconv.Itoa(argCount)
		args = append(args, branchID)
	} else if userRole != "admin" && userRole != "manager" && userRole != "coordinator" && userBranch != "" {
		// Si no es admin/manager/coordinator, filtrar por sucursal del usuario
		argCount++
		query += " AND COALESCE(m.current_branch_id, m.branch_id) = (SELECT id FROM branches WHERE code = $" + strconv.Itoa(argCount) + ")"
		args = append(args, userBranch)
	}

	if status != "" {
		argCount++
		query += " AND m.status = $" + strconv.Itoa(argCount)
		args = append(args, status)
	}

	query += " ORDER BY m.license_plate"

	rows, err := db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var motos []map[string]interface{}
	for rows.Next() {
		var id, maxCapacity, currentCount int
		var licensePlate, status string
		var driverID, branchID, effectiveBranchID sql.NullInt64
		var lat, lng sql.NullFloat64
		var transferExpires sql.NullTime
		var transferReason sql.NullString
		var isTransferred bool

		if err := rows.Scan(&id, &licensePlate, &driverID, &branchID, &effectiveBranchID,
			&status, &lat, &lng, &maxCapacity, &currentCount,
			&transferExpires, &transferReason, &isTransferred); err != nil {
			continue
		}

		moto := map[string]interface{}{
			"id":                   id,
			"license_plate":        licensePlate,
			"status":               status,
			"max_orders_capacity":  maxCapacity,
			"current_orders_count": currentCount,
			"is_transferred":       isTransferred,
		}
		if driverID.Valid {
			moto["driver_id"] = driverID.Int64
		}
		if branchID.Valid {
			moto["branch_id"] = branchID.Int64
		}
		if effectiveBranchID.Valid {
			moto["effective_branch_id"] = effectiveBranchID.Int64
		}
		if lat.Valid {
			moto["latitude"] = lat.Float64
		}
		if lng.Valid {
			moto["longitude"] = lng.Float64
		}
		if transferExpires.Valid {
			moto["transfer_expires_at"] = transferExpires.Time
		}
		if transferReason.Valid {
			moto["transfer_reason"] = transferReason.String
		}

		motos = append(motos, moto)
	}

	c.JSON(http.StatusOK, motos)
}

func GetMotoByID(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid moto id"})
		return
	}

	var m models.Moto
	var driverID, branchID sql.NullInt64
	var lat, lng sql.NullFloat64
	err = db.QueryRow(`SELECT id, license_plate, driver_id, branch_id, status, 
	                   latitude, longitude, max_orders_capacity, current_orders_count 
	                   FROM motos WHERE id = $1`, id).
		Scan(&m.ID, &m.LicensePlate, &driverID, &branchID, &m.Status,
			&lat, &lng, &m.MaxOrdersCapacity, &m.CurrentOrdersCount)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Moto not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get moto"})
		return
	}
	if driverID.Valid {
		v := int(driverID.Int64)
		m.DriverID = &v
	}
	if branchID.Valid {
		v := int(branchID.Int64)
		m.BranchID = &v
	}
	if lat.Valid {
		m.Latitude = &lat.Float64
	}
	if lng.Valid {
		m.Longitude = &lng.Float64
	}

	c.JSON(http.StatusOK, m)
}

type CreateMotoRequest struct {
	LicensePlate      string   `json:"license_plate" binding:"required"`
	DriverID          *int     `json:"driver_id"`
	BranchID          *int     `json:"branch_id"`
	Status            string   `json:"status"`
	Latitude          *float64 `json:"latitude"`
	Longitude         *float64 `json:"longitude"`
	MaxOrdersCapacity int      `json:"max_orders_capacity"`
}

func CreateMoto(c *gin.Context) {
	var req CreateMotoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Status == "" {
		req.Status = "available"
	}
	if req.MaxOrdersCapacity <= 0 {
		req.MaxOrdersCapacity = 5
	}

	var m models.Moto
	err := db.QueryRow(`INSERT INTO motos (license_plate, driver_id, branch_id, status, latitude, longitude, max_orders_capacity, current_orders_count) 
	                    VALUES ($1, $2, $3, $4, $5, $6, $7, 0) RETURNING id`,
		req.LicensePlate, req.DriverID, req.BranchID, req.Status, req.Latitude, req.Longitude, req.MaxOrdersCapacity,
	).Scan(&m.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create moto: " + err.Error()})
		return
	}

	m.LicensePlate = req.LicensePlate
	m.DriverID = req.DriverID
	m.BranchID = req.BranchID
	m.Status = req.Status
	m.Latitude = req.Latitude
	m.Longitude = req.Longitude
	m.MaxOrdersCapacity = req.MaxOrdersCapacity
	m.CurrentOrdersCount = 0

	c.JSON(http.StatusCreated, m)
}

type UpdateMotoRequest struct {
	LicensePlate      *string  `json:"license_plate"`
	DriverID          *int     `json:"driver_id"`
	BranchID          *int     `json:"branch_id"`
	Status            *string  `json:"status"`
	Latitude          *float64 `json:"latitude"`
	Longitude         *float64 `json:"longitude"`
	MaxOrdersCapacity *int     `json:"max_orders_capacity"`
}

func UpdateMoto(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid moto id"})
		return
	}
	var req UpdateMotoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Construir query dinámico solo con campos presentes
	updates := []string{}
	args := []interface{}{}
	argNum := 1

	if req.LicensePlate != nil {
		updates = append(updates, "license_plate = $"+strconv.Itoa(argNum))
		args = append(args, *req.LicensePlate)
		argNum++
	}
	if req.DriverID != nil {
		updates = append(updates, "driver_id = $"+strconv.Itoa(argNum))
		args = append(args, *req.DriverID)
		argNum++
	}
	if req.BranchID != nil {
		updates = append(updates, "branch_id = $"+strconv.Itoa(argNum))
		args = append(args, *req.BranchID)
		argNum++
	}
	if req.Status != nil {
		updates = append(updates, "status = $"+strconv.Itoa(argNum))
		args = append(args, *req.Status)
		argNum++
	}
	if req.Latitude != nil {
		updates = append(updates, "latitude = $"+strconv.Itoa(argNum))
		args = append(args, *req.Latitude)
		argNum++
	}
	if req.Longitude != nil {
		updates = append(updates, "longitude = $"+strconv.Itoa(argNum))
		args = append(args, *req.Longitude)
		argNum++
	}
	if req.MaxOrdersCapacity != nil {
		updates = append(updates, "max_orders_capacity = $"+strconv.Itoa(argNum))
		args = append(args, *req.MaxOrdersCapacity)
		argNum++
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No fields to update"})
		return
	}

	query := "UPDATE motos SET "
	for i, u := range updates {
		if i > 0 {
			query += ", "
		}
		query += u
	}
	query += " WHERE id = $" + strconv.Itoa(argNum)
	args = append(args, id)

	res, err := db.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update moto"})
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Moto not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Moto updated"})
}

func UpdateMotoStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid moto id"})
		return
	}
	status := c.Query("status")
	if status == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status is required"})
		return
	}
	res, err := db.Exec("UPDATE motos SET status = $1 WHERE id = $2", status, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update moto status"})
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Moto not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Moto status updated"})
}

// UpdateMotoLocation actualiza la ubicación GPS de una moto en tiempo real
func UpdateMotoLocation(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid moto id"})
		return
	}
	var req struct {
		Latitude  float64 `json:"latitude" binding:"required"`
		Longitude float64 `json:"longitude" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := db.Exec(`UPDATE motos SET latitude = $1, longitude = $2, last_location_update = CURRENT_TIMESTAMP WHERE id = $3`,
		req.Latitude, req.Longitude, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update moto location"})
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Moto not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Location updated"})
}

func DeleteMoto(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid moto id"})
		return
	}
	res, err := db.Exec("DELETE FROM motos WHERE id = $1", id)
	if err != nil {
		// Most probable cause: FK constraint with existing orders
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete moto, it may have historical orders"})
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Moto not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Moto deleted"})
}

// ========================================
// BRANCHES HANDLERS (Nuevo)
// ========================================

func GetBranches(c *gin.Context) {
	rows, err := db.Query(`SELECT id, name, code, address, latitude, longitude, radius_km, is_active FROM branches WHERE is_active = true`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var branches []models.Branch
	for rows.Next() {
		var b models.Branch
		if err := rows.Scan(&b.ID, &b.Name, &b.Code, &b.Address, &b.Latitude, &b.Longitude, &b.RadiusKm, &b.IsActive); err != nil {
			continue
		}
		branches = append(branches, b)
	}

	c.JSON(http.StatusOK, branches)
}

func CreateBranch(c *gin.Context) {
	var b models.Branch
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if b.Name == "" || b.Code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and code are required"})
		return
	}
	if b.RadiusKm <= 0 {
		b.RadiusKm = 10.0
	}
	b.IsActive = true

	err := db.QueryRow(`INSERT INTO branches (name, code, address, latitude, longitude, radius_km, is_active) 
	                    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		b.Name, b.Code, b.Address, b.Latitude, b.Longitude, b.RadiusKm, b.IsActive,
	).Scan(&b.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create branch: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, b)
}

// GetAllBranches returns all branches including inactive ones
func GetAllBranches(c *gin.Context) {
	rows, err := db.Query(`SELECT id, name, code, address, latitude, longitude, radius_km, is_active FROM branches ORDER BY name`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var branches []models.Branch
	for rows.Next() {
		var b models.Branch
		if err := rows.Scan(&b.ID, &b.Name, &b.Code, &b.Address, &b.Latitude, &b.Longitude, &b.RadiusKm, &b.IsActive); err != nil {
			continue
		}
		branches = append(branches, b)
	}

	c.JSON(http.StatusOK, branches)
}

// UpdateBranch updates an existing branch
func UpdateBranch(c *gin.Context) {
	id := c.Param("id")
	var b models.Branch
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := db.Exec(`UPDATE branches SET name = $1, code = $2, address = $3, 
	                   latitude = $4, longitude = $5, radius_km = $6, is_active = $7
	                   WHERE id = $8`,
		b.Name, b.Code, b.Address, b.Latitude, b.Longitude, b.RadiusKm, b.IsActive, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update branch: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Branch updated"})
}

// DeleteBranch deletes a branch (soft delete by setting is_active = false)
func DeleteBranch(c *gin.Context) {
	id := c.Param("id")

	// Soft delete - just deactivate
	_, err := db.Exec(`UPDATE branches SET is_active = false WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete branch: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Branch deactivated"})
}

// ToggleBranchActive toggles active status of a branch
func ToggleBranchActive(c *gin.Context) {
	id := c.Param("id")

	_, err := db.Exec(`UPDATE branches SET is_active = NOT is_active WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to toggle branch status: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Branch status toggled"})
}

// GetMotosAvailableForAssignment devuelve motos disponibles con capacidad
func GetMotosAvailableForAssignment(c *gin.Context) {
	branchID := c.Query("branch_id")

	query := `SELECT id, license_plate, driver_id, branch_id, status, 
	          latitude, longitude, max_orders_capacity, current_orders_count 
	          FROM motos 
	          WHERE status = 'available' 
	          AND current_orders_count < max_orders_capacity`
	args := []interface{}{}

	if branchID != "" {
		query += " AND branch_id = $1"
		args = append(args, branchID)
	}

	query += " ORDER BY current_orders_count ASC" // Priorizar motos con menos carga

	rows, err := db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var motos []models.Moto
	for rows.Next() {
		var m models.Moto
		var driverID, branchID sql.NullInt64
		var lat, lng sql.NullFloat64
		if err := rows.Scan(&m.ID, &m.LicensePlate, &driverID, &branchID, &m.Status,
			&lat, &lng, &m.MaxOrdersCapacity, &m.CurrentOrdersCount); err != nil {
			continue
		}
		if driverID.Valid {
			v := int(driverID.Int64)
			m.DriverID = &v
		}
		if branchID.Valid {
			v := int(branchID.Int64)
			m.BranchID = &v
		}
		if lat.Valid {
			m.Latitude = &lat.Float64
		}
		if lng.Valid {
			m.Longitude = &lng.Float64
		}
		motos = append(motos, m)
	}

	c.JSON(http.StatusOK, motos)
}
