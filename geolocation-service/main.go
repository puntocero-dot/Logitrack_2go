package main

import (
	"database/sql"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	"github.com/logitrack/geolocation-service/handlers"
	"github.com/logitrack/geolocation-service/logging"
	"github.com/logitrack/geolocation-service/middleware"
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
}

func main() {
	initDB()
	handlers.InitShiftHandlers(db) // Inicializar handlers de turnos

	// Inicializar logger estructurado
	logging.InitLogger("geolocation-service")
	logger := logging.Logger

	r := gin.Default()

	// Middlewares globales: request-id + métricas
	r.Use(middleware.RequestIDMiddleware())
	r.Use(middleware.MetricsMiddleware())

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "geolocation-service"})
	})

	// Rutas de ubicaciones (existentes - mantener)
	r.POST("/locations", handlers.SaveLocation)
	r.GET("/locations", handlers.GetLocations)
	r.GET("/locations/motos/latest", handlers.GetLatestLocationsByMoto)

	// Rutas de turnos (nuevas)
	shifts := r.Group("/shifts")
	{
		shifts.POST("/start", handlers.StartShift)        // Iniciar turno
		shifts.POST("/:id/point", handlers.AddRoutePoint) // Agregar punto GPS
		shifts.POST("/:id/end", handlers.EndShift)        // Finalizar turno
		shifts.GET("/:id/route", handlers.GetShiftRoute)  // Obtener ruta completa
		shifts.GET("/active", handlers.GetActiveShifts)   // Turnos activos (supervisores)
	}

	// Rutas de drivers
	drivers := r.Group("/drivers")
	{
		drivers.GET("/:id/shifts", handlers.GetDriverShifts) // Historial de turnos
	}

	// Endpoint de métricas Prometheus
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	logger.Info().Msg("Geolocation service running on port 8080")
	r.Run(":8080")
}
