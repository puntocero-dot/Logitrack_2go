package main

import (
	"database/sql"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	"github.com/logitrack/order-service/handlers"
	"github.com/logitrack/order-service/logging"
	"github.com/logitrack/order-service/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var db *sql.DB

func initDB() {
	var err error
	db, err = sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	handlers.SetDB(db)
	seedMotos()
}

func seedMotos() {
	// Seed motos con ubicación inicial (Guatemala Ciudad)
	_, err := db.Exec(`INSERT INTO motos (license_plate, status, latitude, longitude, max_orders_capacity, current_orders_count, branch_id) VALUES 
		('MOTO-001', 'available', 14.6349, -90.5069, 5, 0, 1),
		('MOTO-002', 'available', 14.6400, -90.5100, 5, 0, 1),
		('MOTO-003', 'available', 14.6300, -90.5000, 5, 0, 1)
		ON CONFLICT (license_plate) DO NOTHING`)
	if err != nil {
		log.Println("failed to seed motos:", err)
	}
}

func main() {
	initDB()

	// Inicializar logger estructurado
	logging.InitLogger("order-service")
	logger := logging.Logger

	r := gin.Default()
	// No CORS middleware - handled by API Gateway

	// Middlewares globales: request-id + métricas
	r.Use(middleware.RequestIDMiddleware())
	r.Use(middleware.MetricsMiddleware())

	// Orders
	r.POST("/orders", handlers.CreateOrder)
	r.GET("/orders", handlers.GetOrders)
	r.GET("/orders/:id", handlers.GetOrderByID)
	r.GET("/orders/:id/eta", handlers.GetOrderETA)
	r.PUT("/orders/:id/status", handlers.UpdateOrderStatus)
	r.PUT("/orders/:id/assign", handlers.AssignOrderToMoto)

	// Motos
	r.GET("/motos", handlers.GetMotos)
	r.GET("/motos/:id", handlers.GetMotoByID)
	r.POST("/motos", handlers.CreateMoto)
	r.PUT("/motos/:id", handlers.UpdateMoto)
	r.PUT("/motos/:id/status", handlers.UpdateMotoStatus)
	r.PUT("/motos/:id/location", handlers.UpdateMotoLocation) // Nueva ruta
	r.DELETE("/motos/:id", handlers.DeleteMoto)
	r.GET("/motos/available", handlers.GetMotosAvailableForAssignment) // Nueva ruta

	// Branches (Sucursales)
	r.GET("/branches", handlers.GetBranches)
	r.POST("/branches", handlers.CreateBranch)

	// Optimization & KPIs
	r.GET("/optimization/assignments", handlers.OptimizeAssignments)
	r.POST("/optimization/apply", handlers.ApplyOptimizedAssignments)
	r.GET("/kpis/motos", handlers.GetMotosKPIs)
	r.GET("/kpis/branches", handlers.GetBranchKPIs) // Dashboard Gerencial

	// Coordinadores - Visitas
	r.POST("/visits/check-in", handlers.CheckIn)
	r.PUT("/visits/:id/check-out", handlers.CheckOut)
	r.GET("/visits/active", handlers.GetActiveVisit)
	r.GET("/visits", handlers.GetVisitHistory)

	// Coordinadores - Checklist
	r.GET("/checklist/templates", handlers.GetChecklistTemplates)
	r.POST("/visits/:id/checklist", handlers.SaveChecklistResponses)
	r.GET("/visits/:id/checklist", handlers.GetVisitChecklist)

	// Transferencias de Motos entre Sucursales
	r.POST("/transfers", handlers.TransferMoto)
	r.PUT("/motos/:id/return", handlers.ReturnMotoToBranch)
	r.GET("/transfers", handlers.GetTransferredMotos)
	r.GET("/transfers/history", handlers.GetTransferHistory)
	r.POST("/transfers/expire", handlers.ExpireTransfers) // Cron job endpoint

	// Prueba de Entrega (firma + foto)
	r.POST("/orders/:id/delivery-proof", handlers.SaveDeliveryProof)
	r.GET("/orders/:id/delivery-proof", handlers.GetDeliveryProof)

	// Endpoint de métricas Prometheus
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	logger.Info().Msg("🚀 Order service iniciado en puerto 8080")
	r.Run(":8080")
}
