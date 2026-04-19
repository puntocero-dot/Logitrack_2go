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
	loginLimiter   *limiter.Limiter
	refreshLimiter *limiter.Limiter
	defaultLimiter *limiter.Limiter
	redisClient    *redis.Client
)

// InitRateLimiter inicializa los rate limiters con Redis
func InitRateLimiter() error {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		return fmt.Errorf("REDIS_URL must be set")
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

	loginStore, err := sredis.NewStoreWithOptions(redisClient, limiter.StoreOptions{
		Prefix:   "rl:login",
		MaxRetry: 3,
	})
	if err != nil {
		return fmt.Errorf("error creating login rate limiter store: %w", err)
	}
	loginLimiter = limiter.New(loginStore, limiter.Rate{Period: 1 * time.Minute, Limit: 5})

	refreshStore, err := sredis.NewStoreWithOptions(redisClient, limiter.StoreOptions{
		Prefix:   "rl:refresh",
		MaxRetry: 3,
	})
	if err != nil {
		return fmt.Errorf("error creating refresh rate limiter store: %w", err)
	}
	refreshLimiter = limiter.New(refreshStore, limiter.Rate{Period: 1 * time.Minute, Limit: 10})

	defaultStore, err := sredis.NewStoreWithOptions(redisClient, limiter.StoreOptions{
		Prefix:   "rl:general",
		MaxRetry: 3,
	})
	if err != nil {
		return fmt.Errorf("error creating default rate limiter store: %w", err)
	}
	defaultLimiter = limiter.New(defaultStore, limiter.Rate{Period: 1 * time.Minute, Limit: 100})

	return nil
}

func rateLimitWith(l *limiter.Limiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		ctx := c.Request.Context()
		limiterCtx, err := l.Get(ctx, ip)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Rate limiter error"})
			c.Abort()
			return
		}

		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", limiterCtx.Limit))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", limiterCtx.Remaining))
		c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", limiterCtx.Reset))

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

// RateLimitLogin aplica rate limiting para /auth/login (5 req/min)
func RateLimitLogin() gin.HandlerFunc {
	return rateLimitWith(loginLimiter)
}

// RateLimitRefresh aplica rate limiting para /auth/refresh (10 req/min)
func RateLimitRefresh() gin.HandlerFunc {
	return rateLimitWith(refreshLimiter)
}

// RateLimitGeneral aplica rate limiting general (100 req/min), prefijo rl:general
func RateLimitGeneral() gin.HandlerFunc {
	return rateLimitWith(defaultLimiter)
}

// RateLimitMiddleware es un alias de RateLimitGeneral para compatibilidad con código existente
func RateLimitMiddleware() gin.HandlerFunc {
	return RateLimitGeneral()
}

// GetRedisClient retorna el cliente Redis para uso en otros módulos
func GetRedisClient() *redis.Client {
	return redisClient
}
