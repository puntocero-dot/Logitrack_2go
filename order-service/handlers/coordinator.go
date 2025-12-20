package handlers

import (
	"database/sql"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/logitrack/order-service/models"
)

// ========================================
// VISITAS DE COORDINADORES
// ========================================

// CheckInRequest representa la solicitud de check-in
type CheckInRequest struct {
	BranchID  int     `json:"branch_id" binding:"required"`
	Latitude  float64 `json:"latitude" binding:"required"`
	Longitude float64 `json:"longitude" binding:"required"`
	Notes     string  `json:"notes"`
}

// CheckIn registra el inicio de una visita
func CheckIn(c *gin.Context) {
	// Obtener coordinator_id del token (por ahora del query param para testing)
	coordinatorID, _ := strconv.Atoi(c.Query("coordinator_id"))
	if coordinatorID == 0 {
		coordinatorID = 1 // Default para testing
	}

	var req CheckInRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Obtener coordenadas de la sucursal para calcular distancia
	var branchLat, branchLng float64
	err := db.QueryRow("SELECT latitude, longitude FROM branches WHERE id = $1", req.BranchID).
		Scan(&branchLat, &branchLng)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Sucursal no encontrada"})
		return
	}

	// Calcular distancia en metros
	distance := haversineMeters(req.Latitude, req.Longitude, branchLat, branchLng)

	// Crear visita
	var visitID int
	err = db.QueryRow(`
		INSERT INTO coordinator_visits 
		(coordinator_id, branch_id, check_in_latitude, check_in_longitude, distance_to_branch_meters, notes, status)
		VALUES ($1, $2, $3, $4, $5, $6, 'in_progress')
		RETURNING id`,
		coordinatorID, req.BranchID, req.Latitude, req.Longitude, int(distance), req.Notes,
	).Scan(&visitID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear visita: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"visit_id":         visitID,
		"message":          "Check-in exitoso",
		"distance_meters":  int(distance),
		"is_within_branch": distance <= 500, // Dentro de 500m de la sucursal
	})
}

// CheckOut registra el fin de una visita
func CheckOut(c *gin.Context) {
	visitID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de visita inválido"})
		return
	}

	var req struct {
		Latitude  float64 `json:"latitude"`
		Longitude float64 `json:"longitude"`
		Notes     string  `json:"notes"`
	}
	c.ShouldBindJSON(&req)

	_, err = db.Exec(`
		UPDATE coordinator_visits 
		SET check_out_time = CURRENT_TIMESTAMP,
		    check_out_latitude = $1,
		    check_out_longitude = $2,
		    notes = COALESCE(notes || ' | ' || $3, notes),
		    status = 'completed'
		WHERE id = $4 AND status = 'in_progress'`,
		req.Latitude, req.Longitude, req.Notes, visitID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al hacer check-out"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Check-out exitoso"})
}

// GetActiveVisit obtiene la visita activa del coordinador
func GetActiveVisit(c *gin.Context) {
	coordinatorID, _ := strconv.Atoi(c.Query("coordinator_id"))
	if coordinatorID == 0 {
		coordinatorID = 1
	}

	var visit models.CoordinatorVisit
	var checkOut sql.NullTime
	err := db.QueryRow(`
		SELECT cv.id, cv.coordinator_id, cv.branch_id, b.name, cv.check_in_time, cv.check_out_time,
		       cv.check_in_latitude, cv.check_in_longitude, cv.distance_to_branch_meters, cv.status, cv.notes
		FROM coordinator_visits cv
		JOIN branches b ON b.id = cv.branch_id
		WHERE cv.coordinator_id = $1 AND cv.status = 'in_progress'
		ORDER BY cv.check_in_time DESC
		LIMIT 1`,
		coordinatorID,
	).Scan(&visit.ID, &visit.CoordinatorID, &visit.BranchID, &visit.BranchName, &visit.CheckInTime,
		&checkOut, &visit.CheckInLatitude, &visit.CheckInLongitude, &visit.DistanceToBranchMeters,
		&visit.Status, &visit.Notes)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusOK, gin.H{"active_visit": nil})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if checkOut.Valid {
		visit.CheckOutTime = &checkOut.Time
	}

	c.JSON(http.StatusOK, gin.H{"active_visit": visit})
}

// GetAllActiveVisits obtiene todas las visitas activas de todos los coordinadores (para el mapa)
func GetAllActiveVisits(c *gin.Context) {
	rows, err := db.Query(`
		SELECT cv.id, cv.coordinator_id, COALESCE(u.name, 'Coordinador ' || cv.coordinator_id::text), 
		       cv.branch_id, b.name, cv.check_in_time,
		       cv.check_in_latitude, cv.check_in_longitude, cv.distance_to_branch_meters, cv.status
		FROM coordinator_visits cv
		JOIN branches b ON b.id = cv.branch_id
		LEFT JOIN users u ON u.id = cv.coordinator_id
		WHERE cv.status = 'in_progress'
		ORDER BY cv.check_in_time DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var visits []map[string]interface{}
	for rows.Next() {
		var id, coordinatorID, branchID, distanceMeters int
		var coordinatorName, branchName, status string
		var checkInTime time.Time
		var lat, lng float64

		err := rows.Scan(&id, &coordinatorID, &coordinatorName, &branchID, &branchName,
			&checkInTime, &lat, &lng, &distanceMeters, &status)
		if err != nil {
			continue
		}

		visits = append(visits, map[string]interface{}{
			"id":               id,
			"coordinator_id":   coordinatorID,
			"coordinator_name": coordinatorName,
			"branch_id":        branchID,
			"branch_name":      branchName,
			"check_in_time":    checkInTime,
			"latitude":         lat,
			"longitude":        lng,
			"distance_meters":  distanceMeters,
			"status":           status,
		})
	}

	c.JSON(http.StatusOK, visits)
}

// GetVisitHistory obtiene el historial de visitas
func GetVisitHistory(c *gin.Context) {
	coordinatorID := c.Query("coordinator_id")
	branchID := c.Query("branch_id")
	limit := c.DefaultQuery("limit", "50")

	query := `
		SELECT cv.id, cv.coordinator_id, u.name, cv.branch_id, b.name, 
		       cv.check_in_time, cv.check_out_time, cv.status, cv.notes,
		       cv.check_in_latitude, cv.check_in_longitude, cv.distance_to_branch_meters,
		       EXTRACT(EPOCH FROM (COALESCE(cv.check_out_time, CURRENT_TIMESTAMP) - cv.check_in_time))/60 as duration
		FROM coordinator_visits cv
		JOIN branches b ON b.id = cv.branch_id
		LEFT JOIN users u ON u.id = cv.coordinator_id
		WHERE 1=1`

	args := []interface{}{}
	argNum := 1

	if coordinatorID != "" {
		query += " AND cv.coordinator_id = $" + strconv.Itoa(argNum)
		args = append(args, coordinatorID)
		argNum++
	}
	if branchID != "" {
		query += " AND cv.branch_id = $" + strconv.Itoa(argNum)
		args = append(args, branchID)
		argNum++
	}

	query += " ORDER BY cv.check_in_time DESC LIMIT $" + strconv.Itoa(argNum)
	args = append(args, limit)

	rows, err := db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var visits []models.CoordinatorVisit
	for rows.Next() {
		var v models.CoordinatorVisit
		var checkOut sql.NullTime
		var coordName, notes sql.NullString
		var duration sql.NullFloat64
		var lat, lng sql.NullFloat64
		var distanceMeters sql.NullInt64

		err := rows.Scan(&v.ID, &v.CoordinatorID, &coordName, &v.BranchID, &v.BranchName,
			&v.CheckInTime, &checkOut, &v.Status, &notes, &lat, &lng, &distanceMeters, &duration)
		if err != nil {
			continue
		}

		if checkOut.Valid {
			v.CheckOutTime = &checkOut.Time
		}
		if coordName.Valid {
			v.CoordinatorName = coordName.String
		}
		if notes.Valid {
			v.Notes = notes.String
		}
		if duration.Valid {
			d := int(duration.Float64)
			v.Duration = &d
		}
		if lat.Valid {
			v.CheckInLatitude = &lat.Float64
		}
		if lng.Valid {
			v.CheckInLongitude = &lng.Float64
		}
		if distanceMeters.Valid {
			dm := int(distanceMeters.Int64)
			v.DistanceToBranchMeters = &dm
		}

		visits = append(visits, v)
	}

	c.JSON(http.StatusOK, visits)
}

// ========================================
// CHECKLIST
// ========================================

// GetChecklistTemplates obtiene los items del checklist
func GetChecklistTemplates(c *gin.Context) {
	rows, err := db.Query(`
		SELECT id, name, description, category, is_required, display_order, is_active
		FROM checklist_templates
		WHERE is_active = true
		ORDER BY display_order ASC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var templates []models.ChecklistTemplate
	for rows.Next() {
		var t models.ChecklistTemplate
		var desc sql.NullString
		if err := rows.Scan(&t.ID, &t.Name, &desc, &t.Category, &t.IsRequired, &t.DisplayOrder, &t.IsActive); err != nil {
			continue
		}
		if desc.Valid {
			t.Description = desc.String
		}
		templates = append(templates, t)
	}

	c.JSON(http.StatusOK, templates)
}

// SaveChecklistResponses guarda las respuestas del checklist para una visita
func SaveChecklistResponses(c *gin.Context) {
	visitID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de visita inválido"})
		return
	}

	var responses []models.ChecklistResponse
	if err := c.ShouldBindJSON(&responses); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	savedCount := 0
	for _, r := range responses {
		_, err := db.Exec(`
			INSERT INTO checklist_responses 
			(visit_id, template_id, response_type, response_boolean, response_text, response_number, response_rating, photo_url, notes)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT DO NOTHING`,
			visitID, r.TemplateID, r.ResponseType, r.ResponseBoolean, r.ResponseText,
			r.ResponseNumber, r.ResponseRating, r.PhotoURL, r.Notes,
		)
		if err == nil {
			savedCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":     "Respuestas guardadas",
		"saved_count": savedCount,
		"total_sent":  len(responses),
	})
}

// GetVisitChecklist obtiene las respuestas del checklist de una visita
func GetVisitChecklist(c *gin.Context) {
	visitID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de visita inválido"})
		return
	}

	rows, err := db.Query(`
		SELECT cr.id, cr.template_id, ct.name, cr.response_type, 
		       cr.response_boolean, cr.response_text, cr.response_number, cr.response_rating,
		       cr.photo_url, cr.notes
		FROM checklist_responses cr
		JOIN checklist_templates ct ON ct.id = cr.template_id
		WHERE cr.visit_id = $1
		ORDER BY ct.display_order ASC`, visitID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var responses []models.ChecklistResponse
	for rows.Next() {
		var r models.ChecklistResponse
		var respBool sql.NullBool
		var respText, photoURL, notes sql.NullString
		var respNum sql.NullFloat64
		var respRating sql.NullInt64

		if err := rows.Scan(&r.ID, &r.TemplateID, &r.TemplateName, &r.ResponseType,
			&respBool, &respText, &respNum, &respRating, &photoURL, &notes); err != nil {
			continue
		}

		if respBool.Valid {
			r.ResponseBoolean = &respBool.Bool
		}
		if respText.Valid {
			r.ResponseText = respText.String
		}
		if respNum.Valid {
			r.ResponseNumber = &respNum.Float64
		}
		if respRating.Valid {
			rating := int(respRating.Int64)
			r.ResponseRating = &rating
		}
		if photoURL.Valid {
			r.PhotoURL = photoURL.String
		}
		if notes.Valid {
			r.Notes = notes.String
		}

		r.VisitID = visitID
		responses = append(responses, r)
	}

	c.JSON(http.StatusOK, responses)
}

// ========================================
// DASHBOARD GERENCIAL (KPIs)
// ========================================

// GetBranchKPIs obtiene KPIs consolidados por sucursal
func GetBranchKPIs(c *gin.Context) {
	rows, err := db.Query(`
		SELECT 
			b.id, b.name, b.code,
			COUNT(DISTINCT m.id) as total_motos,
			COUNT(DISTINCT CASE WHEN m.status = 'available' THEN m.id END) as motos_available,
			COUNT(DISTINCT CASE WHEN m.status = 'in_route' THEN m.id END) as motos_in_route,
			(SELECT COUNT(*) FROM orders o WHERE o.branch = b.code AND o.status = 'pending') as pending_orders,
			(SELECT COUNT(*) FROM orders o WHERE o.branch = b.code AND o.status = 'assigned') as assigned_orders,
			(SELECT COUNT(*) FROM orders o WHERE o.branch = b.code AND o.status = 'delivered' AND o.updated_at >= CURRENT_DATE) as delivered_today,
			(SELECT COUNT(*) FROM coordinator_visits cv WHERE cv.branch_id = b.id AND cv.check_in_time >= CURRENT_DATE) as visits_today
		FROM branches b
		LEFT JOIN motos m ON m.branch_id = b.id
		WHERE b.is_active = true
		GROUP BY b.id, b.name, b.code
		ORDER BY b.name`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var kpis []models.BranchKPI
	totals := models.BranchKPI{BranchName: "TOTAL", BranchCode: "all"}

	for rows.Next() {
		var k models.BranchKPI
		if err := rows.Scan(&k.BranchID, &k.BranchName, &k.BranchCode,
			&k.TotalMotos, &k.MotosAvailable, &k.MotosInRoute,
			&k.PendingOrders, &k.AssignedOrders, &k.DeliveredToday, &k.VisitsToday); err != nil {
			continue
		}
		kpis = append(kpis, k)

		// Acumular totales
		totals.TotalMotos += k.TotalMotos
		totals.MotosAvailable += k.MotosAvailable
		totals.MotosInRoute += k.MotosInRoute
		totals.PendingOrders += k.PendingOrders
		totals.AssignedOrders += k.AssignedOrders
		totals.DeliveredToday += k.DeliveredToday
		totals.VisitsToday += k.VisitsToday
	}

	c.JSON(http.StatusOK, gin.H{
		"branches":     kpis,
		"totals":       totals,
		"generated_at": time.Now().Format(time.RFC3339),
	})
}

// ========================================
// HELPERS
// ========================================

// haversineMeters calcula distancia en metros entre dos puntos GPS
func haversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000 // Radio de la Tierra en metros
	phi1 := lat1 * math.Pi / 180
	phi2 := lat2 * math.Pi / 180
	deltaPhi := (lat2 - lat1) * math.Pi / 180
	deltaLambda := (lon2 - lon1) * math.Pi / 180

	a := math.Sin(deltaPhi/2)*math.Sin(deltaPhi/2) +
		math.Cos(phi1)*math.Cos(phi2)*
			math.Sin(deltaLambda/2)*math.Sin(deltaLambda/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return R * c
}
