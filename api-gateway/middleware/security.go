package middleware

import (
	"crypto/rand"
	"encoding/base64"
	"os"

	"github.com/gin-gonic/gin"
)

// generarNonce crea un nonce criptográficamente aleatorio de 16 bytes en base64
// para usar en la Content Security Policy por request
func generarNonce() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// Si falla la generación, retornar string vacío — el header CSP seguirá siendo válido
		return ""
	}
	return base64.StdEncoding.EncodeToString(b)
}

// SecurityHeaders agrega headers de seguridad HTTP
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Prevenir clickjacking
		c.Header("X-Frame-Options", "DENY")

		// Prevenir MIME type sniffing
		c.Header("X-Content-Type-Options", "nosniff")

		// Habilitar XSS protection en navegadores antiguos
		c.Header("X-XSS-Protection", "1; mode=block")

		// HSTS solo en producción
		if os.Getenv("ENV") == "production" {
			c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
		}

		// Generar nonce por request para script-src
		// El nonce se guarda en el contexto Gin para que los handlers HTML puedan inyectarlo
		nonce := generarNonce()
		c.Set("csp_nonce", nonce)

		// Content Security Policy estricta con nonce por request:
		//
		// script-src: 'strict-dynamic' + nonce reemplaza 'unsafe-inline' y 'unsafe-eval'.
		//   strict-dynamic permite scripts cargados por scripts confiables (e.g. React bootstrap).
		//   Mapbox GL JS ≥v2 y Leaflet NO requieren unsafe-eval.
		//
		// style-src: mantiene 'unsafe-inline' porque React/CSS-in-JS (emotion, styled-components)
		//   inyectan estilos inline masivamente; quitarlo rompería la UI sin un refactor grande.
		//
		// connect-src: incluye dominios de Mapbox (tiles, API, eventos de telemetría)
		//   y wss: para WebSockets (soporte GPS en tiempo real, Fase 2).
		//
		// worker-src: blob: requerido por Mapbox GL JS que corre Web Workers desde blob URLs.
		//
		// img-src: data: y blob: para previews, https: para tiles de mapas externos.
		cspValue := "default-src 'self'; " +
			"script-src 'strict-dynamic' 'nonce-" + nonce + "' 'self'; " +
			"style-src 'self' 'unsafe-inline'; " +
			"img-src 'self' data: blob: https:; " +
			"font-src 'self' data:; " +
			"connect-src 'self' http://localhost:* ws://localhost:* wss: " +
			"https://*.mapbox.com https://api.mapbox.com https://events.mapbox.com; " +
			"worker-src 'self' blob:; " +
			"child-src blob:;"
		c.Header("Content-Security-Policy", cspValue)

		// Referrer Policy
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")

		// Permissions Policy (antes Feature-Policy)
		c.Header("Permissions-Policy", "geolocation=(self), microphone=(), camera=()")

		c.Next()
	}
}
