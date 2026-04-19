package main

// Version: 3.0.0 - Branches CRUD + Full Users Management
import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/logitrack/api-gateway/logging"
	"github.com/logitrack/api-gateway/middleware"
)

func main() {
	// Inicializar logger estructurado
	logging.InitLogger("api-gateway")
	logger := logging.Logger

	r := gin.Default()

	// ========================================
	// INICIALIZAR RATE LIMITER CON REDIS
	// ========================================
	if err := middleware.InitRateLimiter(); err != nil {
		logger.Fatal().Err(err).Msg("Error inicializando rate limiter")
	}
	logger.Info().Msg("Rate limiter inicializado con Redis")

	// ========================================
	// MIDDLEWARES GLOBALES (ORDEN IMPORTANTE)
	// ========================================

	// 1. Request ID (correlación)
	r.Use(middleware.RequestIDMiddleware())

	// 2. Security headers
	r.Use(middleware.SecurityHeaders())

	// 3. CORS estricto (solo orígenes permitidos)
	// Los orígenes se cargan desde ALLOWED_ORIGINS (comma-separated) o defaults seguros
	allowedOrigins := loadAllowedOrigins()

	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		if allowedOrigins[origin] {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}

		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	})

	// 5. Métricas Prometheus (último para medir todo)
	r.Use(middleware.MetricsMiddleware())

	// ========================================
	// URLS DE SERVICIOS INTERNOS
	// ========================================
	userServiceURL := getEnv("USER_SERVICE_URL", "http://user-service:8081")
	orderServiceURL := getEnv("ORDER_SERVICE_URL", "http://order-service:8080")
	geoServiceURL := getEnv("GEO_SERVICE_URL", "http://geolocation-service:8083")
	aiServiceURL := getEnv("AI_SERVICE_URL", "http://ai-service:5000")
	integrationServiceURL := getEnv("INTEGRATION_SERVICE_URL", "http://integration-service:8084")

	// ========================================
	// ✅ RUTAS PÚBLICAS
	// ========================================
	r.POST("/auth/login", middleware.RateLimitLogin(), proxyTo(userServiceURL, "/login"))
	r.POST("/auth/refresh", middleware.RateLimitRefresh(), proxyTo(userServiceURL, "/refresh"))
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "api-gateway"})
	})

	// ========================================
	// 🔐 RUTAS PROTEGIDAS (Requieren JWT)
	// ========================================
	protected := r.Group("/")
	protected.Use(middleware.RateLimitMiddleware())
	protected.Use(middleware.AuthMiddleware())
	{
		// RUTAS DE USUARIOS (Solo Admin)
		adminOnly := protected.Group("/")
		adminOnly.Use(middleware.RoleMiddleware("admin"))
		{
			adminOnly.GET("/users", proxyTo(userServiceURL, "/users"))
			adminOnly.GET("/users/:id", proxyToWithParam(userServiceURL, "/users"))
			adminOnly.POST("/users", proxyTo(userServiceURL, "/users"))
			adminOnly.PUT("/users/:id", proxyToWithParam(userServiceURL, "/users"))
			adminOnly.DELETE("/users/:id", proxyToWithParam(userServiceURL, "/users"))
			// Alias antiguos
			adminOnly.GET("/auth/users", proxyTo(userServiceURL, "/users"))
			adminOnly.GET("/auth/users/:id", proxyToWithParam(userServiceURL, "/users"))
			adminOnly.POST("/auth/users", proxyTo(userServiceURL, "/users"))
			adminOnly.PUT("/auth/users/:id", proxyToWithParam(userServiceURL, "/users"))
			adminOnly.DELETE("/auth/users/:id", proxyToWithParam(userServiceURL, "/users"))

			// Gestión de Sucursales (Admin/Superadmin)
			adminOnly.POST("/branches", proxyTo(orderServiceURL, "/branches"))
			adminOnly.PUT("/branches/:id", proxyToWithParam(orderServiceURL, "/branches"))
			adminOnly.DELETE("/branches/:id", proxyToWithParam(orderServiceURL, "/branches"))
			adminOnly.PUT("/branches/:id/toggle", proxyToWithNestedParam(orderServiceURL, "/branches", "/toggle"))

			// Integraciones (Solo Admin)
			adminOnly.GET("/integrations", proxyTo(integrationServiceURL, "/integrations"))
			adminOnly.POST("/integrations", proxyTo(integrationServiceURL, "/integrations"))
			adminOnly.PUT("/integrations/:id", proxyToWithParam(integrationServiceURL, "/integrations"))
			adminOnly.DELETE("/integrations/:id", proxyToWithParam(integrationServiceURL, "/integrations"))
			adminOnly.POST("/sync/:id", proxyToWithParam(integrationServiceURL, "/sync"))
			adminOnly.GET("/sync/status/:id", proxyToWithNestedParam(integrationServiceURL, "/sync/status", ""))
			adminOnly.POST("/import/orders", proxyTo(integrationServiceURL, "/import/orders"))
		}

		// RUTAS DE PEDIDOS (Operativos)
		protected.GET("/orders", proxyTo(orderServiceURL, "/orders"))
		protected.GET("/orders/:id", proxyToWithParam(orderServiceURL, "/orders"))
		protected.POST("/orders", proxyTo(orderServiceURL, "/orders"))
		protected.PUT("/orders/:id/status", proxyToWithNestedParam(orderServiceURL, "/orders", "/status"))
		protected.PUT("/orders/:id/assign", proxyToWithNestedParam(orderServiceURL, "/orders", "/assign"))
		protected.GET("/orders/:id/eta", proxyToWithNestedParam(orderServiceURL, "/orders", "/eta"))
		protected.POST("/orders/:id/delivery-proof", proxyToWithNestedParam(orderServiceURL, "/orders", "/delivery-proof"))
		protected.GET("/orders/:id/delivery-proof", proxyToWithNestedParam(orderServiceURL, "/orders", "/delivery-proof"))

		// RUTAS DE MOTOS
		protected.GET("/motos", proxyTo(orderServiceURL, "/motos"))
		protected.GET("/motos/available", proxyTo(orderServiceURL, "/motos/available"))
		protected.GET("/motos/:id", proxyToWithParam(orderServiceURL, "/motos"))
		protected.POST("/motos", proxyTo(orderServiceURL, "/motos"))
		protected.PUT("/motos/:id", proxyToWithParam(orderServiceURL, "/motos"))
		protected.PUT("/motos/:id/location", proxyToWithNestedParam(orderServiceURL, "/motos", "/location"))
		protected.PUT("/motos/:id/status", proxyToWithNestedParam(orderServiceURL, "/motos", "/status"))
		protected.DELETE("/motos/:id", proxyToWithParam(orderServiceURL, "/motos"))

		// RUTAS DE SUCURSALES (Lectura)
		protected.GET("/branches", proxyTo(orderServiceURL, "/branches"))
		protected.GET("/branches/all", proxyTo(orderServiceURL, "/branches/all"))

		// RUTAS DE OPTIMIZACIÓN
		protected.GET("/optimization/assignments", proxyTo(orderServiceURL, "/optimization/assignments"))
		protected.POST("/optimization/apply", proxyTo(orderServiceURL, "/optimization/apply"))

		// RUTAS DE KPIs
		protected.GET("/kpis/motos", proxyTo(orderServiceURL, "/kpis/motos"))
		protected.GET("/kpis/branches", proxyTo(orderServiceURL, "/kpis/branches"))

		// RUTAS DE COORDINADORES
		protected.POST("/visits/check-in", proxyTo(orderServiceURL, "/visits/check-in"))
		protected.PUT("/visits/:id/check-out", proxyToWithNestedParam(orderServiceURL, "/visits", "/check-out"))
		protected.GET("/visits/active", proxyTo(orderServiceURL, "/visits/active"))
		protected.GET("/visits/all-active", proxyTo(orderServiceURL, "/visits/all-active"))
		protected.GET("/visits", proxyTo(orderServiceURL, "/visits"))
		protected.GET("/checklist/templates", proxyTo(orderServiceURL, "/checklist/templates"))
		protected.POST("/visits/:id/checklist", proxyToWithNestedParam(orderServiceURL, "/visits", "/checklist"))
		protected.GET("/visits/:id/checklist", proxyToWithNestedParam(orderServiceURL, "/visits", "/checklist"))

		// RUTAS DE TRANSFERENCIAS
		protected.POST("/transfers", proxyTo(orderServiceURL, "/transfers"))
		protected.PUT("/motos/:id/return", proxyToWithNestedParam(orderServiceURL, "/motos", "/return"))
		protected.GET("/transfers", proxyTo(orderServiceURL, "/transfers"))
		protected.GET("/transfers/history", proxyTo(orderServiceURL, "/transfers/history"))
		protected.POST("/transfers/expire", proxyTo(orderServiceURL, "/transfers/expire"))

		// RUTAS DE GEOLOCALIZACIÓN Y IA
		protected.Any("/geo/*path", proxyWildcard(geoServiceURL))
		protected.Any("/ai/*path", proxyWildcard(aiServiceURL))

		// NOTA: /geo/shifts/:id/live (WebSocket) pasa por el wildcard anterior.
		// El geolocation-service valida el JWT via ?token= query param internamente,
		// por lo que el AuthMiddleware HTTP del gateway también lo cubre (token en header).
		// Si el cliente WS no puede enviar el header, el token como query param
		// lo valida el geolocation-service directamente.

		// Webhooks (deben ser protegidos o tener su propia validación)
		protected.POST("/webhook/:name", proxyToWithParam(integrationServiceURL, "/webhook"))
	}

	// Iniciar servidor
	port := getEnv("PORT", "8080")
	logger.Info().Str("port", port).Msg("API Gateway iniciado")
	logger.Info().Str("user_service", userServiceURL).Msg("User Service URL")
	logger.Info().Str("order_service", orderServiceURL).Msg("Order Service URL")
	logger.Info().Str("geo_service", geoServiceURL).Msg("Geo Service URL")
	logger.Info().Str("ai_service", aiServiceURL).Msg("AI Service URL")
	logger.Info().Str("integration_service", integrationServiceURL).Msg("Integration Service URL")

	if err := r.Run(":" + port); err != nil {
		logger.Fatal().Err(err).Msg("Error al iniciar gateway")
	}
}

// ========================================
// ✅ FUNCIONES DE PROXY
// ========================================

// proxyTo crea proxy para rutas sin parámetros
// Ejemplo: /auth/login → http://user-service:8081/login
func proxyTo(targetBase, targetPath string) gin.HandlerFunc {
	targetURL, _ := url.Parse(targetBase)
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// Modificar respuesta para eliminar headers CORS duplicados
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("Access-Control-Allow-Origin")
		resp.Header.Del("Access-Control-Allow-Methods")
		resp.Header.Del("Access-Control-Allow-Headers")
		resp.Header.Del("Access-Control-Max-Age")
		return nil
	}

	return func(c *gin.Context) {
		c.Request.URL.Path = targetPath
		c.Request.URL.Host = targetURL.Host
		c.Request.URL.Scheme = targetURL.Scheme
		c.Request.Host = targetURL.Host
		proxy.ServeHTTP(c.Writer, c.Request)
	}
}

// proxyToWithParam crea proxy para rutas con :id
// Ejemplo: /users/5 → http://user-service:8081/users/5
func proxyToWithParam(targetBase, basePath string) gin.HandlerFunc {
	targetURL, _ := url.Parse(targetBase)
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// Modificar respuesta para eliminar headers CORS duplicados
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("Access-Control-Allow-Origin")
		resp.Header.Del("Access-Control-Allow-Methods")
		resp.Header.Del("Access-Control-Allow-Headers")
		resp.Header.Del("Access-Control-Max-Age")
		return nil
	}

	return func(c *gin.Context) {
		id := c.Param("id")
		c.Request.URL.Path = basePath + "/" + id
		c.Request.URL.Host = targetURL.Host
		c.Request.URL.Scheme = targetURL.Scheme
		c.Request.Host = targetURL.Host
		proxy.ServeHTTP(c.Writer, c.Request)
	}
}

// proxyToWithNestedParam crea proxy para rutas con :id y sufijo
// Ejemplo: /orders/5/status → http://order-service:8082/orders/5/status
func proxyToWithNestedParam(targetBase, basePath, suffix string) gin.HandlerFunc {
	targetURL, _ := url.Parse(targetBase)
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// Modificar respuesta para eliminar headers CORS duplicados
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("Access-Control-Allow-Origin")
		resp.Header.Del("Access-Control-Allow-Methods")
		resp.Header.Del("Access-Control-Allow-Headers")
		resp.Header.Del("Access-Control-Max-Age")
		return nil
	}

	return func(c *gin.Context) {
		id := c.Param("id")
		c.Request.URL.Path = basePath + "/" + id + suffix
		c.Request.URL.Host = targetURL.Host
		c.Request.URL.Scheme = targetURL.Scheme
		c.Request.Host = targetURL.Host
		proxy.ServeHTTP(c.Writer, c.Request)
	}
}

// proxyWildcard crea proxy para rutas wildcard
// Ejemplo: /geo/locations → http://geolocation-service:8083/locations
func proxyWildcard(targetBase string) gin.HandlerFunc {
	targetURL, _ := url.Parse(targetBase)
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// Modificar respuesta para eliminar headers CORS duplicados
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("Access-Control-Allow-Origin")
		resp.Header.Del("Access-Control-Allow-Methods")
		resp.Header.Del("Access-Control-Allow-Headers")
		resp.Header.Del("Access-Control-Max-Age")
		return nil
	}

	return func(c *gin.Context) {
		path := c.Param("path")
		c.Request.URL.Path = path
		c.Request.URL.Host = targetURL.Host
		c.Request.URL.Scheme = targetURL.Scheme
		c.Request.Host = targetURL.Host
		proxy.ServeHTTP(c.Writer, c.Request)
	}
}

// loadAllowedOrigins parsea la env var ALLOWED_ORIGINS (comma-separated) una sola vez al arranque.
// Si está vacía, usa los orígenes por defecto (desarrollo local + producción Railway).
// Retorna map[string]bool para O(1) lookup en cada request.
func loadAllowedOrigins() map[string]bool {
	env := os.Getenv("ALLOWED_ORIGINS")
	if env == "" {
		// Defaults: 4 locales + 2 Railway (no romper dev ni prod si la var no está seteada)
		return map[string]bool{
			"http://localhost:3001":    true, // web-app desarrollo
			"http://localhost:3002":    true, // client-view desarrollo
			"http://10.23.150.40:3001": true, // web-app LAN
			"http://10.23.150.40:3002": true, // client-view LAN
			// Railway producción
			"https://web-app-production-05a3.up.railway.app":     true,
			"https://client-view-production-f0c1.up.railway.app": true,
		}
	}
	origins := make(map[string]bool)
	for _, o := range strings.Split(env, ",") {
		trimmed := strings.TrimSpace(o)
		if trimmed != "" {
			origins[trimmed] = true
		}
	}
	return origins
}

// getEnv obtiene variable de entorno con valor por defecto
func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
