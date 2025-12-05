package handlers

import (
	"database/sql"
	"net/http"

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
	rows, err := db.Query(`
		SELECT 
			m.id,
			m.license_plate,
			COUNT(o.id) FILTER (WHERE o.status = 'delivered' AND DATE(o.created_at) = CURRENT_DATE) AS delivered_today,
			AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/60) FILTER (WHERE o.status = 'delivered') AS avg_delivery_time_min,
			SUM(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/60) FILTER (WHERE o.status IN ('in_route', 'delivered')) AS total_route_time_min,
			MAX(o.updated_at) FILTER (WHERE o.status = 'delivered') AS last_delivery_at
		FROM motos m
		LEFT JOIN orders o ON m.id = o.assigned_moto_id
		GROUP BY m.id, m.license_plate
		ORDER BY delivered_today DESC, avg_delivery_time_min ASC NULLS LAST
	`)
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
			formatted := lastDelivery.Time.Format("2006-01-02 15:04:05")
			k.LastDeliveryAt = &formatted
		}
		kpis = append(kpis, k)
	}

	c.JSON(http.StatusOK, kpis)
}
