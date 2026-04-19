package handlers

import (
	"math"
	"time"
)

// haversineDistance calcula la distancia en kilómetros entre dos coordenadas GPS
// usando la fórmula de Haversine (error < 0.5% para distancias < 20km)
func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371 // Radio medio de la Tierra en km
	dLat := (lat2 - lat1) * (math.Pi / 180)
	dLon := (lon2 - lon1) * (math.Pi / 180)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*(math.Pi/180))*math.Cos(lat2*(math.Pi/180))*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// StopInfo representa una parada detectada en la ruta
type StopInfo struct {
	Latitude        float64   `json:"latitude"`
	Longitude       float64   `json:"longitude"`
	StartedAt       time.Time `json:"started_at"`
	EndedAt         time.Time `json:"ended_at"`
	DurationSeconds int       `json:"duration_seconds"`
}

// detectStops detecta paradas en una serie de puntos GPS.
// Una "parada" se define como ≥3 puntos consecutivos donde:
//   - La distancia máxima entre cualquier par del cluster < 30 metros
//   - La duración total del cluster ≥ 120 segundos
//
// Retorna la lista de paradas detectadas.
func detectStops(points []RoutePoint) []StopInfo {
	const (
		maxRadiusKm     = 0.030 // 30 metros
		minDurationSecs = 120   // 2 minutos
		minPoints       = 3
	)

	var stops []StopInfo
	if len(points) < minPoints {
		return stops
	}

	i := 0
	for i < len(points) {
		// Intentar abrir un cluster desde la posición i
		clusterStart := i
		anchorLat := points[i].Latitude
		anchorLng := points[i].Longitude

		j := i + 1
		for j < len(points) {
			d := haversineDistance(anchorLat, anchorLng, points[j].Latitude, points[j].Longitude)
			if d > maxRadiusKm {
				break
			}
			j++
		}

		clusterLen := j - clusterStart
		if clusterLen >= minPoints {
			duration := int(points[j-1].Timestamp.Sub(points[clusterStart].Timestamp).Seconds())
			if duration >= minDurationSecs {
				stops = append(stops, StopInfo{
					Latitude:        anchorLat,
					Longitude:       anchorLng,
					StartedAt:       points[clusterStart].Timestamp,
					EndedAt:         points[j-1].Timestamp,
					DurationSeconds: duration,
				})
				i = j // saltar el cluster entero
				continue
			}
		}
		i++
	}

	return stops
}

// speedMsToKmh convierte velocidad de m/s a km/h
// El browser Geolocation API reporta speed en m/s (null si no disponible)
func speedMsToKmh(speedMs float64) float64 {
	return speedMs * 3.6
}

// calcAvgSpeed calcula la velocidad promedio en km/h dados distancia y duración
func calcAvgSpeed(distanceKm float64, durationSeconds int) float64 {
	if durationSeconds < 5 || distanceKm < 0.01 {
		return 0
	}
	return distanceKm / (float64(durationSeconds) / 3600.0)
}
