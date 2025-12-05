package handlers

import (
	"database/sql"
	"net/http"
	"github.com/gin-gonic/gin"
	"github.com/logitrack/geolocation-service/models"
)

var db *sql.DB

func SetDB(database *sql.DB) {
	db = database
}

func SaveLocation(c *gin.Context) {
	var loc models.Location
	if err := c.ShouldBindJSON(&loc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_, err := db.Exec("INSERT INTO locations (order_id, moto_id, latitude, longitude, type) VALUES ($1, $2, $3, $4, $5)",
		loc.OrderID, loc.MotoID, loc.Latitude, loc.Longitude, loc.Type)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save location"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Location saved"})
}

func GetLocations(c *gin.Context) {
	rows, err := db.Query("SELECT id, order_id, moto_id, latitude, longitude, type FROM locations")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var locations []models.Location
	for rows.Next() {
		var loc models.Location
		err := rows.Scan(&loc.ID, &loc.OrderID, &loc.MotoID, &loc.Latitude, &loc.Longitude, &loc.Type)
		if err != nil {
			continue
		}
		locations = append(locations, loc)
	}
	c.JSON(http.StatusOK, locations)
}

// GetLatestLocationsByMoto returns the latest 'current' location for each moto.
func GetLatestLocationsByMoto(c *gin.Context) {
	rows, err := db.Query(`SELECT DISTINCT ON (moto_id) id, order_id, moto_id, latitude, longitude, type FROM locations WHERE moto_id IS NOT NULL AND type = 'current' ORDER BY moto_id, timestamp DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var locations []models.Location
	for rows.Next() {
		var loc models.Location
		if err := rows.Scan(&loc.ID, &loc.OrderID, &loc.MotoID, &loc.Latitude, &loc.Longitude, &loc.Type); err != nil {
			continue
		}
		locations = append(locations, loc)
	}

	c.JSON(http.StatusOK, locations)
}
