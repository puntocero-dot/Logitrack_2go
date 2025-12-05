package models

type Order struct {
	ID             int     `json:"id"`
	ClientName     string  `json:"client_name"`
	ClientEmail    string  `json:"client_email"`
	Address        string  `json:"address"`
	Latitude       float64 `json:"latitude"`
	Longitude      float64 `json:"longitude"`
	Status         string  `json:"status"`
	AssignedMotoID *int    `json:"assigned_moto_id"`
	Branch         string  `json:"branch"`
}
