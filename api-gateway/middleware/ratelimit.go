package middleware

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/ulule/limiter/v3"
	sredis "github.com/ulule/limiter/v3/drivers/store/redis"
)

var (
	rateLimiter *limiter.Limiter
	redisClient *redis.Client
)

// InitRateLimiter inicializa el rate limiter con Redis
func InitRateLimiter() error {
	// Conectar a Redis
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://:logitrack_redis_password@localhost:6379/0"
	}

	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return fmt.Errorf("error parsing Redis URL: %w", err)
	}

	redisClient = redis.NewClient(opt)

	// Verificar conexión
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := redisClient.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("error connecting to Redis: %w", err)
	}

	// Configurar rate limiter: 100 requests por minuto por IP
	rate := limiter.Rate{
		Period: 1 * time.Minute,
		Limit:  100,
	}

	store, err := sredis.NewStoreWithOptions(redisClient, limiter.StoreOptions{
		Prefix:   "ratelimit",
		MaxRetry: 3,
	})
	if err != nil {
		return fmt.Errorf("error creating rate limiter store: %w", err)
	}

	rateLimiter = limiter.New(store, rate)

	return nil
}

// RateLimitMiddleware aplica rate limiting por IP
func RateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Obtener IP del cliente
		ip := c.ClientIP()

		// Verificar rate limit
		ctx := c.Request.Context()
		limiterCtx, err := rateLimiter.Get(ctx, ip)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Rate limiter error",
			})
			c.Abort()
			return
		}

		// Agregar headers de rate limit
		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", limiterCtx.Limit))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", limiterCtx.Remaining))
		c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", limiterCtx.Reset))

		// Si se excedió el límite
		if limiterCtx.Reached {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "Rate limit exceeded",
				"message":     fmt.Sprintf("Too many requests. Limit: %d requests per minute", limiterCtx.Limit),
				"retry_after": limiterCtx.Reset,
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// GetRedisClient retorna el cliente Redis para uso en otros módulos
func GetRedisClient() *redis.Client {
	return redisClient
}
