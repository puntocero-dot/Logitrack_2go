package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// MotoKPI agrupa métricas de rendimiento por moto para el día actual
type MotoKPI struct {
	MotoID             int      `json:"moto_id"`
	LicensePlate       string   `json:"license_plate"`
	DeliveredToday     int      `json:"delivered_today"`
	AvgDeliveryTimeMin *float64 `json:"avg_delivery_time_min"`
	TotalRouteTimeMin  *float64 `json:"total_route_time_min"`
	LastDeliveryAt     *string  `json:"last_delivery_at"`
	// KPIs nuevos (Fase 3)
	OnTimeRate          *float64 `json:"on_time_rate_pct"`          // % entregas dentro del ETA estimado
	AvgDistanceKm       *float64 `json:"avg_distance_km"`           // distancia promedio por entrega
	TotalDistanceKm     *float64 `json:"total_distance_km"`         // distancia total estimada
	ETAMethod           *string  `json:"eta_method,omitempty"`      // método más usado para calcular ETA
}

// BranchKPI agrupa métricas por sucursal
type BranchKPI struct {
	Branch             string   `json:"branch"`
	TotalDelivered     int      `json:"total_delivered"`
	TotalPending       int      `json:"total_pending"`
	TotalCancelled     int      `json:"total_cancelled"`
	AvgDeliveryTimeMin *float64 `json:"avg_delivery_time_min"`
	OnTimeRate         *float64 `json:"on_time_rate_pct"`
	TotalDistanceKm    *float64 `json:"total_distance_km"`
}

// GetMotosKPIs devuelve KPIs del día por moto, incluyendo on_time_rate y distancias
func GetMotosKPIs(c *gin.Context) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	rows, err := db.Query(`
		WITH order_times AS (
			SELECT
				o.id,
				o.assigned_moto_id,
				o.updated_at                                        AS delivered_at,
				o.estimated_eta_min,
				o.estimated_distance_km,
				o.eta_method,
				COALESCE(
					(SELECT MIN(timestamp) FROM kpis WHERE order_id = o.id AND checkpoint = 'assigned'),
					o.created_at
				)                                                   AS start_time
			FROM orders o
			WHERE o.status = 'delivered' AND o.updated_at >= $1
		),
		on_time AS (
			-- Un pedido se considera "a tiempo" si llegó antes del ETA estimado desde la asignación
			SELECT
				assigned_moto_id,
				COUNT(*)                                                                     AS total_with_eta,
				SUM(CASE
					WHEN estimated_eta_min IS NOT NULL
					  AND EXTRACT(EPOCH FROM (delivered_at - start_time)) / 60.0 <= estimated_eta_min * 1.10
					  -- 10% de tolerancia sobre el ETA estimado
					THEN 1 ELSE 0
				END)                                                                         AS on_time_count
			FROM order_times
			GROUP BY assigned_moto_id
		)
		SELECT
			m.id,
			m.license_plate,
			COUNT(ot.id)                                                                     AS delivered_today,
			AVG(LEAST(EXTRACT(EPOCH FROM (ot.delivered_at - ot.start_time)) / 60.0, 180))  AS avg_delivery_time_min,
			SUM(LEAST(EXTRACT(EPOCH FROM (ot.delivered_at - ot.start_time)) / 60.0, 180))  AS total_route_time_min,
			MAX(ot.delivered_at)                                                             AS last_delivery_at,
			-- on_time_rate: % entregas dentro del ETA (con tolerancia 10%)
			CASE WHEN ont.total_with_eta > 0
				THEN ROUND(ont.on_time_count::DECIMAL / ont.total_with_eta * 100, 1)
				ELSE NULL
			END                                                                              AS on_time_rate_pct,
			AVG(ot.estimated_distance_km)                                                    AS avg_distance_km,
			SUM(ot.estimated_distance_km)                                                    AS total_distance_km,
			MODE() WITHIN GROUP (ORDER BY ot.eta_method)                                     AS eta_method
		FROM motos m
		LEFT JOIN order_times ot ON m.id = ot.assigned_moto_id
		LEFT JOIN on_time ont     ON m.id = ont.assigned_moto_id
		GROUP BY m.id, m.license_plate, ont.total_with_eta, ont.on_time_count
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
		var etaMethod sql.NullString
		err := rows.Scan(
			&k.MotoID, &k.LicensePlate, &k.DeliveredToday,
			&k.AvgDeliveryTimeMin, &k.TotalRouteTimeMin, &lastDelivery,
			&k.OnTimeRate, &k.AvgDistanceKm, &k.TotalDistanceKm, &etaMethod,
		)
		if err != nil {
			continue
		}
		if lastDelivery.Valid {
			formatted := lastDelivery.Time.Format("2006-01-02 15:04:05")
			k.LastDeliveryAt = &formatted
		}
		if etaMethod.Valid {
			k.ETAMethod = &etaMethod.String
		}
		kpis = append(kpis, k)
	}

	c.JSON(http.StatusOK, kpis)
}

// GetBranchesKPIs devuelve métricas agregadas por sucursal para el período especificado.
// Query param: ?days=1 (default 1 = hoy)
func GetBranchesKPIs(c *gin.Context) {
	days := 1
	if d := c.Query("days"); d != "" {
		if parsed, err := parseInt(d); err == nil && parsed > 0 && parsed <= 90 {
			days = parsed
		}
	}

	since := time.Now().AddDate(0, 0, -days+1)
	since = time.Date(since.Year(), since.Month(), since.Day(), 0, 0, 0, 0, since.Location())

	rows, err := db.Query(`
		WITH order_times AS (
			SELECT
				o.branch,
				o.status,
				o.estimated_eta_min,
				o.estimated_distance_km,
				o.updated_at                                             AS delivered_at,
				COALESCE(
					(SELECT MIN(timestamp) FROM kpis WHERE order_id = o.id AND checkpoint = 'assigned'),
					o.created_at
				)                                                        AS start_time
			FROM orders o
			WHERE o.updated_at >= $1 OR o.status IN ('pending', 'assigned', 'in_route')
		)
		SELECT
			COALESCE(branch, 'sin_sucursal')                             AS branch,
			SUM(CASE WHEN status = 'delivered'  THEN 1 ELSE 0 END)      AS total_delivered,
			SUM(CASE WHEN status IN ('pending','assigned','in_route') THEN 1 ELSE 0 END) AS total_pending,
			SUM(CASE WHEN status = 'cancelled'  THEN 1 ELSE 0 END)      AS total_cancelled,
			AVG(CASE WHEN status = 'delivered'
				THEN LEAST(EXTRACT(EPOCH FROM (delivered_at - start_time)) / 60.0, 180)
				ELSE NULL END)                                           AS avg_delivery_time_min,
			CASE WHEN SUM(CASE WHEN status = 'delivered' AND estimated_eta_min IS NOT NULL THEN 1 ELSE 0 END) > 0
				THEN ROUND(
					SUM(CASE
						WHEN status = 'delivered' AND estimated_eta_min IS NOT NULL
						  AND EXTRACT(EPOCH FROM (delivered_at - start_time)) / 60.0 <= estimated_eta_min * 1.10
						THEN 1 ELSE 0
					END)::DECIMAL /
					SUM(CASE WHEN status = 'delivered' AND estimated_eta_min IS NOT NULL THEN 1 ELSE 0 END) * 100,
					1)
				ELSE NULL
			END                                                          AS on_time_rate_pct,
			SUM(CASE WHEN status = 'delivered' THEN estimated_distance_km ELSE NULL END) AS total_distance_km
		FROM order_times
		GROUP BY branch
		ORDER BY total_delivered DESC
	`, since)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var kpis []BranchKPI
	for rows.Next() {
		var k BranchKPI
		err := rows.Scan(
			&k.Branch, &k.TotalDelivered, &k.TotalPending, &k.TotalCancelled,
			&k.AvgDeliveryTimeMin, &k.OnTimeRate, &k.TotalDistanceKm,
		)
		if err != nil {
			continue
		}
		kpis = append(kpis, k)
	}

	c.JSON(http.StatusOK, gin.H{
		"period_days": days,
		"since":       since.Format("2006-01-02"),
		"branches":    kpis,
	})
}

// parseInt es un helper para parsear query params numéricos
func parseInt(s string) (int, error) {
	v := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("not a number")
		}
		v = v*10 + int(c-'0')
	}
	return v, nil
}
