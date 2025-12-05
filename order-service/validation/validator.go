package validation

import (
	"github.com/go-playground/validator/v10"
)

var validate *validator.Validate

func init() {
	validate = validator.New()
}

// CreateOrderRequest con validaciones
type CreateOrderRequest struct {
	ClientName  string  `json:"client_name" validate:"required,min=3,max=100"`
	ClientEmail string  `json:"client_email" validate:"omitempty,email"`
	Address     string  `json:"address" validate:"required,min=10,max=500"`
	Latitude    float64 `json:"latitude" validate:"required,min=-90,max=90"`
	Longitude   float64 `json:"longitude" validate:"required,min=-180,max=180"`
	Branch      string  `json:"branch" validate:"required,oneof=central norte sur este oeste"`
}

// UpdateOrderStatusRequest con validaciones
type UpdateOrderStatusRequest struct {
	Status string `json:"status" validate:"required,oneof=pending assigned in_route delivered cancelled"`
}

// AssignMotoRequest con validaciones
type AssignMotoRequest struct {
	MotoID int `json:"moto_id" validate:"required,min=1"`
}

// CreateMotoRequest con validaciones
type CreateMotoRequest struct {
	LicensePlate string `json:"license_plate" validate:"required,min=3,max=20,alphanum"`
	DriverID     *int   `json:"driver_id" validate:"omitempty,min=1"`
}

// UpdateMotoRequest con validaciones
type UpdateMotoRequest struct {
	LicensePlate string `json:"license_plate" validate:"omitempty,min=3,max=20,alphanum"`
	DriverID     *int   `json:"driver_id" validate:"omitempty,min=1"`
	Status       string `json:"status" validate:"omitempty,oneof=available in_route maintenance"`
}

// Validate valida una estructura
func Validate(s interface{}) error {
	return validate.Struct(s)
}
