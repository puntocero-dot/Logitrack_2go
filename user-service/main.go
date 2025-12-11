package main

// Version: 2.1.0 - December 2024 - Forced redeploy
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
	// Hash passwords before inserting
	defaultPass := os.Getenv("SEED_USER_PASSWORD")
	if defaultPass == "" {
		defaultPass = "admin123" // Default password for development
	}

	passwordHash, _ := bcrypt.GenerateFromPassword([]byte(defaultPass), bcrypt.DefaultCost)

	// Superadmin password (specific)
	superadminPass := "Diego1989r$"
	superadminHash, _ := bcrypt.GenerateFromPassword([]byte(superadminPass), bcrypt.DefaultCost)

	log.Printf("🌱 Seeding users with password hash...")

	// Create superadmin first
	_, err := db.Exec(`
		INSERT INTO users (name, email, password_hash, role, active) VALUES
		('Super Admin', 'superadmin@logitrack.com', $1, 'superadmin', true)
		ON CONFLICT (email) DO UPDATE SET
			password_hash = EXCLUDED.password_hash,
			role = EXCLUDED.role,
			active = true
	`, superadminHash)
	if err != nil {
		log.Println("⚠️ Failed to seed superadmin:", err)
	} else {
		log.Println("✅ Superadmin created: superadmin@logitrack.com")
	}

	// Seed other users
	_, err = db.Exec(`
		INSERT INTO users (name, email, password_hash, role, active) VALUES
		('Admin User', 'admin@logitrack.com', $1, 'admin', true),
		('Supervisor', 'supervisor@logitrack.com', $1, 'supervisor', true),
		('Manager', 'manager@logitrack.com', $1, 'manager', true),
		('Coordinator', 'coordinator@logitrack.com', $1, 'coordinator', true),
		('Analyst', 'analyst@logitrack.com', $1, 'analyst', true),
		('Driver', 'driver@logitrack.com', $1, 'driver', true)
		ON CONFLICT (email) DO UPDATE SET
			password_hash = EXCLUDED.password_hash,
			role = EXCLUDED.role
	`, passwordHash)
	if err != nil {
		log.Println("⚠️ Failed to seed users:", err)
	} else {
		log.Println("✅ Users seeded successfully")
	}

	// Force admin role for admin@logitrack.com (in case it was changed)
	_, err = db.Exec(`UPDATE users SET role = 'admin' WHERE email = 'admin@logitrack.com'`)
	if err != nil {
		log.Println("⚠️ Failed to update admin role:", err)
	} else {
		log.Println("✅ Admin role enforced for admin@logitrack.com")
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

	logger.Info().Msg("🚀 User service iniciado en puerto 8080")
	r.Run(":8080")
}
