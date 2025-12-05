package models

type Location struct {
	ID       int     `json:"id"`
	OrderID  *int    `json:"order_id"`
	MotoID   *int    `json:"moto_id"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Type     string  `json:"type"`
}
