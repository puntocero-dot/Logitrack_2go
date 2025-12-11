package models

import "time"

// CoordinatorVisit representa una visita de auditoría a una sucursal
type CoordinatorVisit struct {
	ID                     int        `json:"id"`
	CoordinatorID          int        `json:"coordinator_id"`
	CoordinatorName        string     `json:"coordinator_name,omitempty"`
	BranchID               int        `json:"branch_id"`
	BranchName             string     `json:"branch_name,omitempty"`
	CheckInTime            time.Time  `json:"check_in_time"`
	CheckOutTime           *time.Time `json:"check_out_time,omitempty"`
	CheckInLatitude        *float64   `json:"check_in_latitude,omitempty"`
	CheckInLongitude       *float64   `json:"check_in_longitude,omitempty"`
	CheckOutLatitude       *float64   `json:"check_out_latitude,omitempty"`
	CheckOutLongitude      *float64   `json:"check_out_longitude,omitempty"`
	DistanceToBranchMeters *int       `json:"distance_to_branch_meters,omitempty"`
	Status                 string     `json:"status"`
	Notes                  string     `json:"notes,omitempty"`
	Duration               *int       `json:"duration_minutes,omitempty"` // Calculado
}

// ChecklistTemplate representa un item configurable del checklist
type ChecklistTemplate struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description,omitempty"`
	Category     string `json:"category"`
	IsRequired   bool   `json:"is_required"`
	DisplayOrder int    `json:"display_order"`
	IsActive     bool   `json:"is_active"`
}

// ChecklistResponse representa la respuesta a un item del checklist
type ChecklistResponse struct {
	ID              int      `json:"id"`
	VisitID         int      `json:"visit_id"`
	TemplateID      int      `json:"template_id"`
	TemplateName    string   `json:"template_name,omitempty"`
	ResponseType    string   `json:"response_type"`
	ResponseBoolean *bool    `json:"response_boolean,omitempty"`
	ResponseText    string   `json:"response_text,omitempty"`
	ResponseNumber  *float64 `json:"response_number,omitempty"`
	ResponseRating  *int     `json:"response_rating,omitempty"`
	PhotoURL        string   `json:"photo_url,omitempty"`
	Notes           string   `json:"notes,omitempty"`
}

// BranchKPI representa métricas consolidadas de una sucursal
type BranchKPI struct {
	BranchID       int    `json:"branch_id"`
	BranchName     string `json:"branch_name"`
	BranchCode     string `json:"branch_code"`
	TotalMotos     int    `json:"total_motos"`
	MotosAvailable int    `json:"motos_available"`
	MotosInRoute   int    `json:"motos_in_route"`
	PendingOrders  int    `json:"pending_orders"`
	AssignedOrders int    `json:"assigned_orders"`
	DeliveredToday int    `json:"delivered_today"`
	VisitsToday    int    `json:"visits_today"`
}
