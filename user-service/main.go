package main

import (
	"database/sql"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	"github.com/logitrack/user-service/database"
	"github.com/logitrack/user-service/handlers"
	"github.com/logitrack/user-service/logging"
	"github.com/logitrack/user-service/middleware"
	"github.com/logitrack/user-service/redis"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/crypto/bcrypt"
)

var db *sql.DB

func initDB() {
	var err error
	db, err = sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}

	// Inicializar schema (crear tablas si no existen)
	if err := database.InitSchema(db); err != nil {
		log.Fatalf("❌ Error inicializando schema: %v", err)
	}

	handlers.SetDB(db)
	seedUsers()
}

func initRedis() {
	if err := redis.InitRedis(); err != nil {
		log.Fatalf("❌ Error inicializando Redis: %v", err)
	}
	log.Println("✅ Redis inicializado correctamente")
}

func seedUsers() {
	// Hash passwords before inserting. Use enviroment variable or default for dev only.
	defaultPass := os.Getenv("SEED_USER_PASSWORD")
	if defaultPass == "" {
		defaultPass = "dev_password_do_not_use_in_prod"
	}

	adminHash, _ := bcrypt.GenerateFromPassword([]byte(defaultPass), bcrypt.DefaultCost)
	superCentralHash, _ := bcrypt.GenerateFromPassword([]byte(defaultPass), bcrypt.DefaultCost)
	superEsteHash, _ := bcrypt.GenerateFromPassword([]byte(defaultPass), bcrypt.DefaultCost)
	superOesteHash, _ := bcrypt.GenerateFromPassword([]byte(defaultPass), bcrypt.DefaultCost)
	driver1Hash, _ := bcrypt.GenerateFromPassword([]byte(defaultPass), bcrypt.DefaultCost)
	driver2Hash, _ := bcrypt.GenerateFromPassword([]byte(defaultPass), bcrypt.DefaultCost)
	driver3Hash, _ := bcrypt.GenerateFromPassword([]byte(defaultPass), bcrypt.DefaultCost)
	clienteHash, _ := bcrypt.GenerateFromPassword([]byte(defaultPass), bcrypt.DefaultCost)

	_, err := db.Exec(`
		INSERT INTO users (name, email, password_hash, role, branch) VALUES
		('Admin User', 'admin@logitrack.com', $1, 'admin', 'central'),
		('Supervisor Central', 'supervisor.central@logitrack.com', $2, 'supervisor', 'central'),
		('Supervisor Este', 'supervisor.este@logitrack.com', $3, 'supervisor', 'este'),
		('Supervisor Oeste', 'supervisor.oeste@logitrack.com', $4, 'supervisor', 'oeste'),
		('Driver Central', 'driver1@logitrack.com', $5, 'driver', 'central'),
		('Driver Este', 'driver2@logitrack.com', $6, 'driver', 'este'),
		('Driver Oeste', 'driver3@logitrack.com', $7, 'driver', 'oeste'),
		('Cliente Demo', 'cliente@demo.com', $8, 'client', 'central')
		ON CONFLICT (email) DO NOTHING
	`, adminHash, superCentralHash, superEsteHash, superOesteHash, driver1Hash, driver2Hash, driver3Hash, clienteHash)
	if err != nil {
		log.Println("failed to seed users:", err)
	} else {
		log.Println("Users seeded successfully")
	}
}

func main() {
	initDB()
	initRedis()

	// Inicializar logger estructurado
	logging.InitLogger("user-service")
	logger := logging.Logger

	r := gin.Default()

	// No CORS middleware - handled by API Gateway

	// Middlewares globales: request-id + métricas
	r.Use(middleware.RequestIDMiddleware())
	r.Use(middleware.MetricsMiddleware())

	// Auth routes
	r.POST("/login", handlers.Login)
	r.POST("/refresh", handlers.RefreshToken)
	r.POST("/logout", handlers.Logout)

	// User routes
	r.GET("/users", handlers.GetUsers)
	r.GET("/users/:id", handlers.GetUser)
	r.POST("/users", handlers.CreateUser)
	r.PUT("/users/:id", handlers.UpdateUser)
	r.DELETE("/users/:id", handlers.DeleteUser)

	// Endpoint de métricas Prometheus
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	logger.Info().Msg("🚀 User service iniciado en puerto 8081")
	r.Run(":8081")
}
