package models

type Moto struct {
	ID           int   `json:"id"`
	LicensePlate string `json:"license_plate"`
	DriverID     *int  `json:"driver_id"`
	Status       string `json:"status"`
}
