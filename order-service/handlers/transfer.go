package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// TransferRequest representa una solicitud de transferencia
type TransferRequest struct {
	MotoID        int    `json:"moto_id" binding:"required"`
	ToBranchID    int    `json:"to_branch_id" binding:"required"`
	Reason        string `json:"reason"`
	DurationHours int    `json:"duration_hours"` // 0 = permanente
}

// TransferMoto transfiere una moto a otra sucursal
func TransferMoto(c *gin.Context) {
	// Obtener usuario que hace la transferencia
	userID, _ := strconv.Atoi(c.GetHeader("X-User-ID"))
	userRole := c.GetHeader("X-User-Role")

	// Solo admin y supervisores pueden transferir
	if userRole != "admin" && userRole != "supervisor" && userRole != "manager" {
		c.JSON(http.StatusForbidden, gin.H{"error": "No tienes permiso para transferir motos"})
		return
	}

	var req TransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Obtener sucursal actual de la moto
	var currentBranchID int
	err := db.QueryRow(`
		SELECT COALESCE(current_branch_id, branch_id) 
		FROM motos WHERE id = $1`, req.MotoID,
	).Scan(&currentBranchID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Moto no encontrada"})
		return
	}

	// Calcular expiración
	var expiresAt *time.Time
	transferType := "permanent"
	if req.DurationHours > 0 {
		t := time.Now().Add(time.Duration(req.DurationHours) * time.Hour)
		expiresAt = &t
		transferType = "temporary"
	}

	// Actualizar moto
	_, err = db.Exec(`
		UPDATE motos 
		SET current_branch_id = $1, 
		    transfer_expires_at = $2, 
		    transfer_reason = $3,
		    transferred_by = $4
		WHERE id = $5`,
		req.ToBranchID, expiresAt, req.Reason, userID, req.MotoID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al transferir moto"})
		return
	}

	// Registrar en historial
	db.Exec(`
		INSERT INTO moto_transfers 
		(moto_id, from_branch_id, to_branch_id, transferred_by, reason, transfer_type, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		req.MotoID, currentBranchID, req.ToBranchID, userID, req.Reason, transferType, expiresAt,
	)

	c.JSON(http.StatusOK, gin.H{
		"message":    "Moto transferida exitosamente",
		"moto_id":    req.MotoID,
		"to_branch":  req.ToBranchID,
		"expires_at": expiresAt,
		"type":       transferType,
	})
}

// ReturnMotoToBranch regresa una moto a su sucursal original
func ReturnMotoToBranch(c *gin.Context) {
	motoID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	userRole := c.GetHeader("X-User-Role")
	if userRole != "admin" && userRole != "supervisor" && userRole != "manager" {
		c.JSON(http.StatusForbidden, gin.H{"error": "No tienes permiso"})
		return
	}

	// Regresar moto a su branch original
	result, err := db.Exec(`
		UPDATE motos 
		SET current_branch_id = branch_id,
		    transfer_expires_at = NULL,
		    transfer_reason = NULL,
		    transferred_by = NULL
		WHERE id = $1 AND current_branch_id != branch_id`,
		motoID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La moto ya está en su sucursal original"})
		return
	}

	// Marcar transferencia como completada
	db.Exec(`
		UPDATE moto_transfers 
		SET status = 'completed', ended_at = CURRENT_TIMESTAMP
		WHERE moto_id = $1 AND status = 'active'`,
		motoID,
	)

	c.JSON(http.StatusOK, gin.H{"message": "Moto regresada a su sucursal original"})
}

// GetTransferredMotos obtiene las motos actualmente transferidas
func GetTransferredMotos(c *gin.Context) {
	rows, err := db.Query(`
		SELECT m.id, m.license_plate, m.branch_id, hb.name, 
		       m.current_branch_id, cb.name, m.transfer_expires_at, m.transfer_reason
		FROM motos m
		JOIN branches hb ON hb.id = m.branch_id
		JOIN branches cb ON cb.id = m.current_branch_id
		WHERE m.current_branch_id != m.branch_id
		ORDER BY m.transfer_expires_at ASC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var transfers []map[string]interface{}
	for rows.Next() {
		var motoID, homeBranchID, currentBranchID int
		var licensePlate, homeBranchName, currentBranchName string
		var expiresAt sql.NullTime
		var reason sql.NullString

		rows.Scan(&motoID, &licensePlate, &homeBranchID, &homeBranchName,
			&currentBranchID, &currentBranchName, &expiresAt, &reason)

		t := map[string]interface{}{
			"moto_id":             motoID,
			"license_plate":       licensePlate,
			"home_branch_id":      homeBranchID,
			"home_branch_name":    homeBranchName,
			"current_branch_id":   currentBranchID,
			"current_branch_name": currentBranchName,
		}
		if expiresAt.Valid {
			t["expires_at"] = expiresAt.Time
		}
		if reason.Valid {
			t["reason"] = reason.String
		}
		transfers = append(transfers, t)
	}

	c.JSON(http.StatusOK, transfers)
}

// GetTransferHistory obtiene el historial de transferencias
func GetTransferHistory(c *gin.Context) {
	motoID := c.Query("moto_id")
	branchID := c.Query("branch_id")
	limit := c.DefaultQuery("limit", "50")

	query := `
		SELECT mt.id, mt.moto_id, m.license_plate, 
		       mt.from_branch_id, fb.name, mt.to_branch_id, tb.name,
		       mt.reason, mt.transfer_type, mt.started_at, mt.expires_at, mt.ended_at, mt.status
		FROM moto_transfers mt
		JOIN motos m ON m.id = mt.moto_id
		LEFT JOIN branches fb ON fb.id = mt.from_branch_id
		LEFT JOIN branches tb ON tb.id = mt.to_branch_id
		WHERE 1=1`

	args := []interface{}{}
	argNum := 1

	if motoID != "" {
		query += " AND mt.moto_id = $" + strconv.Itoa(argNum)
		args = append(args, motoID)
		argNum++
	}
	if branchID != "" {
		query += " AND (mt.from_branch_id = $" + strconv.Itoa(argNum) + " OR mt.to_branch_id = $" + strconv.Itoa(argNum) + ")"
		args = append(args, branchID)
		argNum++
	}

	query += " ORDER BY mt.started_at DESC LIMIT $" + strconv.Itoa(argNum)
	args = append(args, limit)

	rows, err := db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var history []map[string]interface{}
	for rows.Next() {
		var id, motoIDVal, fromBranchID, toBranchID int
		var licensePlate, fromBranchName, toBranchName, transferType, status string
		var reason sql.NullString
		var startedAt time.Time
		var expiresAt, endedAt sql.NullTime

		rows.Scan(&id, &motoIDVal, &licensePlate, &fromBranchID, &fromBranchName,
			&toBranchID, &toBranchName, &reason, &transferType, &startedAt, &expiresAt, &endedAt, &status)

		h := map[string]interface{}{
			"id":               id,
			"moto_id":          motoIDVal,
			"license_plate":    licensePlate,
			"from_branch_id":   fromBranchID,
			"from_branch_name": fromBranchName,
			"to_branch_id":     toBranchID,
			"to_branch_name":   toBranchName,
			"transfer_type":    transferType,
			"started_at":       startedAt,
			"status":           status,
		}
		if reason.Valid {
			h["reason"] = reason.String
		}
		if expiresAt.Valid {
			h["expires_at"] = expiresAt.Time
		}
		if endedAt.Valid {
			h["ended_at"] = endedAt.Time
		}
		history = append(history, h)
	}

	c.JSON(http.StatusOK, history)
}

// ExpireTransfers cron job para expirar transferencias automáticamente
func ExpireTransfers(c *gin.Context) {
	_, err := db.Exec("SELECT expire_moto_transfers()")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Transferencias expiradas procesadas"})
}
