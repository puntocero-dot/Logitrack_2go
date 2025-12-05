package middleware

import (
	"github.com/gin-gonic/gin"
)

// SecurityHeaders agrega headers de seguridad HTTP
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Prevenir clickjacking
		c.Header("X-Frame-Options", "DENY")

		// Prevenir MIME type sniffing
		c.Header("X-Content-Type-Options", "nosniff")

		// Habilitar XSS protection en navegadores antiguos
		c.Header("X-XSS-Protection", "1; mode=block")

		// Forzar HTTPS (solo en producción)
		// En desarrollo comentar esta línea
		// c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")

		// Content Security Policy básica
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' http://localhost:* ws://localhost:*")

		// Referrer Policy
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")

		// Permissions Policy (antes Feature-Policy)
		c.Header("Permissions-Policy", "geolocation=(self), microphone=(), camera=()")

		c.Next()
	}
}
