package models

import (
	"database/sql"
	"encoding/json"
	"time"
)

type Route struct {
	ID            int       `json:"id"`
	MotoID        int       `json:"moto_id"`
	OrderSequence []int     `json:"order_sequence"`
	OptimizedPath []float64 `json:"optimized_path"` // [lat, lng, lat, lng, ...] o GeoJSON simple
	CreatedAt     time.Time `json:"created_at"`
}

type RouteRepository struct {
	db *sql.DB
}

func NewRouteRepository(db *sql.DB) *RouteRepository {
	return &RouteRepository{db: db}
}

func (r *RouteRepository) CreateRoute(motoID int, orderSequence []int, optimizedPath []float64) error {
	orderSeqJSON, _ := json.Marshal(orderSequence)
	pathJSON, _ := json.Marshal(optimizedPath)
	_, err := r.db.Exec(
		"INSERT INTO routes (moto_id, order_sequence, optimized_path) VALUES ($1, $2, $3)",
		motoID, orderSeqJSON, pathJSON,
	)
	return err
}

func (r *RouteRepository) GetRoutesByMoto(motoID int) ([]Route, error) {
	rows, err := r.db.Query(
		"SELECT id, moto_id, order_sequence, optimized_path, created_at FROM routes WHERE moto_id = $1 ORDER BY created_at DESC",
		motoID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var routes []Route
	for rows.Next() {
		var route Route
		var orderSeqJSON, pathJSON []byte
		if err := rows.Scan(&route.ID, &route.MotoID, &orderSeqJSON, &pathJSON, &route.CreatedAt); err != nil {
			return nil, err
		}
		json.Unmarshal(orderSeqJSON, &route.OrderSequence)
		json.Unmarshal(pathJSON, &route.OptimizedPath)
		routes = append(routes, route)
	}
	return routes, nil
}
