package handlers

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/logitrack/order-service/models"
)

func GetMotos(c *gin.Context) {
	rows, err := db.Query("SELECT id, license_plate, driver_id, status FROM motos")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var motos []models.Moto
	for rows.Next() {
		var m models.Moto
		var driverID sql.NullInt64
		if err := rows.Scan(&m.ID, &m.LicensePlate, &driverID, &m.Status); err != nil {
			continue
		}
		if driverID.Valid {
			v := int(driverID.Int64)
			m.DriverID = &v
		} else {
			m.DriverID = nil
		}
		motos = append(motos, m)
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
	var driverID sql.NullInt64
	err = db.QueryRow("SELECT id, license_plate, driver_id, status FROM motos WHERE id = $1", id).
		Scan(&m.ID, &m.LicensePlate, &driverID, &m.Status)
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
	} else {
		m.DriverID = nil
	}

	c.JSON(http.StatusOK, m)
}

func CreateMoto(c *gin.Context) {
	var m models.Moto
	if err := c.ShouldBindJSON(&m); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if m.LicensePlate == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "license_plate is required"})
		return
	}
	if m.Status == "" {
		m.Status = "available"
	}
	err := db.QueryRow("INSERT INTO motos (license_plate, driver_id, status) VALUES ($1, $2, $3) RETURNING id",
		m.LicensePlate, m.DriverID, m.Status,
	).Scan(&m.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create moto"})
		return
	}
	c.JSON(http.StatusCreated, m)
}

func UpdateMoto(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid moto id"})
		return
	}
	var payload struct {
		LicensePlate string `json:"license_plate"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if payload.LicensePlate == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "license_plate is required"})
		return
	}
	res, err := db.Exec("UPDATE motos SET license_plate = $1 WHERE id = $2", payload.LicensePlate, id)
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
