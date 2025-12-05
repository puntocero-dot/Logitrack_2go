package redis

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/go-redis/redis/v8"
)

var (
	Client *redis.Client
	ctx    = context.Background()
)

// InitRedis inicializa la conexión a Redis
func InitRedis() error {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://:logitrack_redis_password@localhost:6379/0"
	}

	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return fmt.Errorf("error parsing Redis URL: %w", err)
	}

	Client = redis.NewClient(opt)

	// Verificar conexión
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := Client.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("error connecting to Redis: %w", err)
	}

	return nil
}

// SetRefreshToken guarda un refresh token en Redis con TTL
func SetRefreshToken(token string, userID int, ttl time.Duration) error {
	key := fmt.Sprintf("refresh_token:%s", token)
	return Client.Set(ctx, key, userID, ttl).Err()
}

// GetRefreshToken obtiene el userID asociado a un refresh token
func GetRefreshToken(token string) (int, error) {
	key := fmt.Sprintf("refresh_token:%s", token)
	val, err := Client.Get(ctx, key).Int()
	if err == redis.Nil {
		return 0, fmt.Errorf("refresh token not found or expired")
	}
	if err != nil {
		return 0, err
	}
	return val, nil
}

// DeleteRefreshToken invalida un refresh token (logout o rotación)
func DeleteRefreshToken(token string) error {
	key := fmt.Sprintf("refresh_token:%s", token)
	return Client.Del(ctx, key).Err()
}

// BlacklistAccessToken agrega un access token a la blacklist
func BlacklistAccessToken(token string, ttl time.Duration) error {
	key := fmt.Sprintf("blacklist:%s", token)
	return Client.Set(ctx, key, "1", ttl).Err()
}

// IsTokenBlacklisted verifica si un access token está en blacklist
func IsTokenBlacklisted(token string) bool {
	key := fmt.Sprintf("blacklist:%s", token)
	val, err := Client.Get(ctx, key).Result()
	return err == nil && val == "1"
}
