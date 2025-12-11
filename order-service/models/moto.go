package models

type Moto struct {
	ID                  int      `json:"id"`
	LicensePlate        string   `json:"license_plate"`
	DriverID            *int     `json:"driver_id"`
	BranchID            *int     `json:"branch_id"`
	Status              string   `json:"status"`
	Latitude            *float64 `json:"latitude"`
	Longitude           *float64 `json:"longitude"`
	MaxOrdersCapacity   int      `json:"max_orders_capacity"`
	CurrentOrdersCount  int      `json:"current_orders_count"`
}

// Branch representa una sucursal con su zona geográfica
type Branch struct {
	ID        int     `json:"id"`
	Name      string  `json:"name"`
	Code      string  `json:"code"`
	Address   string  `json:"address"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	RadiusKm  float64 `json:"radius_km"`
	IsActive  bool    `json:"is_active"`
}
