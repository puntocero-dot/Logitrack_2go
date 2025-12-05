package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/logitrack/api-gateway/logging"
)

const (
	// RequestIDHeader es el header HTTP usado para correlación
	RequestIDHeader = "X-Request-ID"
	// RequestIDKey es la clave en el contexto Gin
	RequestIDKey = "request_id"
)

// RequestIDMiddleware asegura que cada request tenga un X-Request-ID
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.Request.Header.Get(RequestIDHeader)
		if requestID == "" {
			requestID = uuid.New().String()
		}

		// Guardar en contexto y propagar en headers
		c.Set(RequestIDKey, requestID)
		c.Writer.Header().Set(RequestIDHeader, requestID)
		c.Request.Header.Set(RequestIDHeader, requestID)

		// Logger por request con campos estándar
		logger := logging.Logger.With().
			Str("request_id", requestID).
			Str("method", c.Request.Method).
			Str("path", c.FullPath()).
			Logger()
		c.Set("logger", &logger)

		c.Next()
	}
}
