package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type MotoKPI struct {
	MotoID             int      `json:"moto_id"`
	LicensePlate       string   `json:"license_plate"`
	DeliveredToday     int      `json:"delivered_today"`
	AvgDeliveryTimeMin *float64 `json:"avg_delivery_time_min"`
	TotalRouteTimeMin  *float64 `json:"total_route_time_min"`
	LastDeliveryAt     *string  `json:"last_delivery_at"`
}

// GetMotosKPIs returns time-based KPIs for motos
func GetMotosKPIs(c *gin.Context) {
	// Get current date in local timezone for filtering
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	// Query: Only count today's deliveries, and calculate time only for orders
	// that were both assigned AND delivered today (to avoid multi-day calculations)
	rows, err := db.Query(`
		SELECT 
			m.id,
			m.license_plate,
			COUNT(o.id) FILTER (WHERE o.status = 'delivered' AND o.updated_at >= $1) AS delivered_today,
			AVG(
				LEAST(
					EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/60,
					120  -- Cap at 2 hours max to filter outliers
				)
			) FILTER (WHERE o.status = 'delivered' AND o.updated_at >= $1 AND o.created_at >= $1) AS avg_delivery_time_min,
			SUM(
				LEAST(
					EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/60,
					120
				)
			) FILTER (WHERE o.status = 'delivered' AND o.updated_at >= $1 AND o.created_at >= $1) AS total_route_time_min,
			MAX(o.updated_at) FILTER (WHERE o.status = 'delivered' AND o.updated_at >= $1) AS last_delivery_at
		FROM motos m
		LEFT JOIN orders o ON m.id = o.assigned_moto_id
		GROUP BY m.id, m.license_plate
		ORDER BY delivered_today DESC, avg_delivery_time_min ASC NULLS LAST
	`, todayStart)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var kpis []MotoKPI
	for rows.Next() {
		var k MotoKPI
		var lastDelivery sql.NullTime
		err := rows.Scan(
			&k.MotoID,
			&k.LicensePlate,
			&k.DeliveredToday,
			&k.AvgDeliveryTimeMin,
			&k.TotalRouteTimeMin,
			&lastDelivery,
		)
		if err != nil {
			continue
		}
		if lastDelivery.Valid {
			// Format with timezone
			formatted := lastDelivery.Time.Format("2006-01-02 15:04:05")
			k.LastDeliveryAt = &formatted
		}
		kpis = append(kpis, k)
	}

	c.JSON(http.StatusOK, kpis)
}
