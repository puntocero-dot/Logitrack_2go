package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// etaResponse es la respuesta del endpoint GET /orders/:id/eta
type etaResponse struct {
	DistanceKm float64 `json:"distance_km"`
	EtaMin     float64 `json:"eta_min"`
	Method     string  `json:"method"`   // "mapbox_directions" | "haversine_fallback"
	UpdatedAt  string  `json:"updated_at,omitempty"`
}

// ── Haversine (fallback) ───────────────────────────────────────────────────

func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	R := 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLon := (lon2 - lon1) * math.Pi / 180.0
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180.0)*math.Cos(lat2*math.Pi/180.0)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// ── Mapbox Directions API ─────────────────────────────────────────────────
// Docs: https://docs.mapbox.com/api/navigation/directions/
//
// Env var requerida: MAPBOX_TOKEN (token público o secreto con scopo directions)
// Si no está configurado, se usa haversine automáticamente.

type mapboxRoute struct {
	Distance float64 `json:"distance"` // metros
	Duration float64 `json:"duration"` // segundos
}
type mapboxResponse struct {
	Routes []mapboxRoute `json:"routes"`
	Code   string        `json:"code"` // "Ok" si exitoso
}

var httpClient = &http.Client{Timeout: 5 * time.Second}

func getETAFromMapbox(fromLat, fromLng, toLat, toLng float64) (distanceKm, etaMin float64, err error) {
	token := os.Getenv("MAPBOX_TOKEN")
	if token == "" {
		return 0, 0, fmt.Errorf("MAPBOX_TOKEN no configurado")
	}

	// Formato de coordenadas: lng,lat (Mapbox usa lon antes que lat)
	coords := fmt.Sprintf("%f,%f;%f,%f", fromLng, fromLat, toLng, toLat)
	apiURL := fmt.Sprintf(
		"https://api.mapbox.com/directions/v5/mapbox/driving/%s",
		url.PathEscape(coords),
	)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return 0, 0, fmt.Errorf("error creando request Mapbox: %w", err)
	}
	q := req.URL.Query()
	q.Set("access_token", token)
	q.Set("geometries", "geojson")
	q.Set("overview", "simplified")
	req.URL.RawQuery = q.Encode()

	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, 0, fmt.Errorf("error llamando Mapbox Directions: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, 0, fmt.Errorf("Mapbox respondió %d", resp.StatusCode)
	}

	var mbResp mapboxResponse
	if err := json.NewDecoder(resp.Body).Decode(&mbResp); err != nil {
		return 0, 0, fmt.Errorf("error parseando respuesta Mapbox: %w", err)
	}
	if mbResp.Code != "Ok" || len(mbResp.Routes) == 0 {
		return 0, 0, fmt.Errorf("Mapbox no encontró ruta (code=%s)", mbResp.Code)
	}

	route := mbResp.Routes[0]
	distanceKm = route.Distance / 1000.0
	etaMin = route.Duration / 60.0
	return distanceKm, etaMin, nil
}

// ── Handler principal ─────────────────────────────────────────────────────

// GetOrderETA devuelve la distancia y ETA desde la posición actual de la moto
// asignada hasta el destino del pedido.
//
// Estrategia:
//  1. Intenta Mapbox Directions API (tiempo real, considera calles y tráfico)
//  2. Si falla (sin token, red, quota), cae en haversine + 25 km/h
func GetOrderETA(c *gin.Context) {
	idStr := c.Param("id")
	orderID, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de pedido inválido"})
		return
	}

	// Obtener detalles del pedido (destino + moto asignada)
	var assignedMotoID *int
	var orderLat, orderLng float64
	err = db.QueryRow("SELECT assigned_moto_id, latitude, longitude FROM orders WHERE id = $1", orderID).
		Scan(&assignedMotoID, &orderLat, &orderLng)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pedido no encontrado"})
		return
	}
	if assignedMotoID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El pedido no tiene moto asignada"})
		return
	}
	motoID := *assignedMotoID

	// Obtener ubicación actual de la moto (última posición registrada)
	var motoLat, motoLng float64
	err = db.QueryRow(`
		SELECT latitude, longitude FROM locations
		WHERE moto_id = $1 AND type = 'current'
		ORDER BY timestamp DESC LIMIT 1`, motoID).
		Scan(&motoLat, &motoLng)
	if err != nil {
		// Fallback: coordenadas de la sucursal de la moto
		var bLat, bLng sql.NullFloat64
		db.QueryRow(`
			SELECT COALESCE(m.latitude, b.latitude), COALESCE(m.longitude, b.longitude)
			FROM motos m LEFT JOIN branches b ON m.branch_id = b.id
			WHERE m.id = $1`, motoID).Scan(&bLat, &bLng)
		if bLat.Valid && bLng.Valid {
			motoLat, motoLng = bLat.Float64, bLng.Float64
		} else {
			motoLat, motoLng = 13.6929, -89.2182 // San Salvador como último recurso
		}
	}

	// ── Intentar Mapbox Directions ──
	distKm, etaMin, mapboxErr := getETAFromMapbox(motoLat, motoLng, orderLat, orderLng)
	method := "mapbox_directions"

	if mapboxErr != nil {
		// Fallback haversine + velocidad promedio urbana
		distKm = haversine(motoLat, motoLng, orderLat, orderLng)
		etaMin = distKm / 25.0 * 60.0
		method = "haversine_fallback"
	}

	c.JSON(http.StatusOK, etaResponse{
		DistanceKm: math.Round(distKm*100) / 100,
		EtaMin:     math.Round(etaMin*10) / 10,
		Method:     method,
		UpdatedAt:  time.Now().Format(time.RFC3339),
	})
}

// StoreETAOnAssignment guarda el ETA calculado en la orden al momento de la asignación.
// Se llama desde ApplyOptimizedAssignments para poder calcular on_time_rate después.
func StoreETAOnAssignment(orderID int, motoLat, motoLng, orderLat, orderLng float64) {
	distKm, etaMin, err := getETAFromMapbox(motoLat, motoLng, orderLat, orderLng)
	method := "mapbox_directions"
	if err != nil {
		distKm = haversine(motoLat, motoLng, orderLat, orderLng)
		etaMin = distKm / 25.0 * 60.0
		method = "haversine_fallback"
	}

	db.Exec(`
		UPDATE orders
		SET estimated_eta_min = $2, estimated_distance_km = $3, eta_method = $4
		WHERE id = $1
	`, orderID, math.Round(etaMin*10)/10, math.Round(distKm*100)/100, method)
}
