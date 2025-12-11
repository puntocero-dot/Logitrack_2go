package main

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/logitrack/api-gateway/logging"
	"github.com/logitrack/api-gateway/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
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
	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		// Lista de orígenes permitidos
		allowedOrigins := map[string]bool{
			"http://localhost:3001":    true, // web-app desarrollo
			"http://localhost:3002":    true, // client-view desarrollo
			"http://10.23.150.40:3001": true, // web-app LAN
			"http://10.23.150.40:3002": true, // client-view LAN
			// Railway production
			"https://web-app-production-05a3.up.railway.app":     true,
			"https://client-view-production-f0c1.up.railway.app": true,
		}

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

	// 4. Rate limiting (después de CORS)
	r.Use(middleware.RateLimitMiddleware())

	// 5. Métricas Prometheus (último para medir todo)
	r.Use(middleware.MetricsMiddleware())

	// Health check del gateway
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "api-gateway"})
	})

	// Endpoint de métricas Prometheus
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// ✅ URLs de servicios internos (Docker network)
	userServiceURL := getEnv("USER_SERVICE_URL", "http://user-service:8081")
	orderServiceURL := getEnv("ORDER_SERVICE_URL", "http://order-service:8080")
	geoServiceURL := getEnv("GEO_SERVICE_URL", "http://geolocation-service:8083")
	aiServiceURL := getEnv("AI_SERVICE_URL", "http://ai-service:5000")
	integrationServiceURL := getEnv("INTEGRATION_SERVICE_URL", "http://integration-service:8084")

	// ========================================
	// ✅ RUTAS DE AUTENTICACIÓN (sin /auth prefix en destino)
	// ========================================
	r.POST("/auth/login", proxyTo(userServiceURL, "/login"))
	r.POST("/auth/refresh", proxyTo(userServiceURL, "/refresh"))
	r.POST("/auth/logout", proxyTo(userServiceURL, "/logout"))

	// ========================================
	// ✅ RUTAS DE USUARIOS
	// ========================================
	r.GET("/users", proxyTo(userServiceURL, "/users"))
	r.GET("/users/:id", proxyToWithParam(userServiceURL, "/users"))
	r.POST("/users", proxyTo(userServiceURL, "/users"))
	r.PUT("/users/:id", proxyToWithParam(userServiceURL, "/users"))
	r.DELETE("/users/:id", proxyToWithParam(userServiceURL, "/users"))
	r.GET("/auth/users", proxyTo(userServiceURL, "/users"))
	r.GET("/auth/users/:id", proxyToWithParam(userServiceURL, "/users"))
	r.POST("/auth/users", proxyTo(userServiceURL, "/users"))
	r.PUT("/auth/users/:id", proxyToWithParam(userServiceURL, "/users"))
	r.DELETE("/auth/users/:id", proxyToWithParam(userServiceURL, "/users"))

	// ========================================
	// ✅ RUTAS DE PEDIDOS
	// ========================================
	r.GET("/orders", proxyTo(orderServiceURL, "/orders"))
	r.GET("/orders/:id", proxyToWithParam(orderServiceURL, "/orders"))
	r.POST("/orders", proxyTo(orderServiceURL, "/orders"))
	r.PUT("/orders/:id/status", proxyToWithNestedParam(orderServiceURL, "/orders", "/status"))
	r.PUT("/orders/:id/assign", proxyToWithNestedParam(orderServiceURL, "/orders", "/assign"))
	r.GET("/orders/:id/eta", proxyToWithNestedParam(orderServiceURL, "/orders", "/eta"))

	// ========================================
	// ✅ RUTAS DE MOTOS
	// ========================================
	r.GET("/motos", proxyTo(orderServiceURL, "/motos"))
	r.GET("/motos/available", proxyTo(orderServiceURL, "/motos/available"))
	r.GET("/motos/:id", proxyToWithParam(orderServiceURL, "/motos"))
	r.POST("/motos", proxyTo(orderServiceURL, "/motos"))
	r.PUT("/motos/:id", proxyToWithParam(orderServiceURL, "/motos"))
	r.PUT("/motos/:id/location", proxyToWithNestedParam(orderServiceURL, "/motos", "/location"))
	r.PUT("/motos/:id/status", proxyToWithNestedParam(orderServiceURL, "/motos", "/status"))
	r.DELETE("/motos/:id", proxyToWithParam(orderServiceURL, "/motos"))

	// ========================================
	// ✅ RUTAS DE SUCURSALES (BRANCHES)
	// ========================================
	r.GET("/branches", proxyTo(orderServiceURL, "/branches"))
	r.POST("/branches", proxyTo(orderServiceURL, "/branches"))

	// ========================================
	// ✅ RUTAS DE OPTIMIZACIÓN
	// ========================================
	r.GET("/optimization/assignments", proxyTo(orderServiceURL, "/optimization/assignments"))
	r.POST("/optimization/apply", proxyTo(orderServiceURL, "/optimization/apply"))

	// ========================================
	// ✅ RUTAS DE KPIs (Dashboard Gerencial)
	// ========================================
	r.GET("/kpis/motos", proxyTo(orderServiceURL, "/kpis/motos"))
	r.GET("/kpis/branches", proxyTo(orderServiceURL, "/kpis/branches"))

	// ========================================
	// ✅ RUTAS DE COORDINADORES (Visitas y Checklist)
	// ========================================
	r.POST("/visits/check-in", proxyTo(orderServiceURL, "/visits/check-in"))
	r.PUT("/visits/:id/check-out", proxyToWithNestedParam(orderServiceURL, "/visits", "/check-out"))
	r.GET("/visits/active", proxyTo(orderServiceURL, "/visits/active"))
	r.GET("/visits", proxyTo(orderServiceURL, "/visits"))
	r.GET("/checklist/templates", proxyTo(orderServiceURL, "/checklist/templates"))
	r.POST("/visits/:id/checklist", proxyToWithNestedParam(orderServiceURL, "/visits", "/checklist"))
	r.GET("/visits/:id/checklist", proxyToWithNestedParam(orderServiceURL, "/visits", "/checklist"))

	// ========================================
	// ✅ RUTAS DE GEOLOCALIZACIÓN (wildcard)
	// ========================================
	r.Any("/geo/*path", proxyWildcard(geoServiceURL))

	// ========================================
	// ✅ RUTAS DE IA (wildcard)
	// ========================================
	r.Any("/ai/*path", proxyWildcard(aiServiceURL))

	// ========================================
	// ✅ RUTAS DE INTEGRACIÓN (conexión con sistemas externos)
	// ========================================
	r.GET("/integrations", proxyTo(integrationServiceURL, "/integrations"))
	r.POST("/integrations", proxyTo(integrationServiceURL, "/integrations"))
	r.PUT("/integrations/:id", proxyToWithParam(integrationServiceURL, "/integrations"))
	r.DELETE("/integrations/:id", proxyToWithParam(integrationServiceURL, "/integrations"))
	r.POST("/sync/:id", proxyToWithParam(integrationServiceURL, "/sync"))
	r.GET("/sync/status/:id", proxyToWithNestedParam(integrationServiceURL, "/sync/status", ""))
	r.POST("/webhook/:name", proxyToWithParam(integrationServiceURL, "/webhook"))
	r.POST("/import/orders", proxyTo(integrationServiceURL, "/import/orders"))

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

// getEnv obtiene variable de entorno con valor por defecto
func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
