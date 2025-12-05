package middleware

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total de requests HTTP por servicio, método, ruta y status",
		},
		[]string{"service", "method", "path", "status"},
	)

	httpRequestDurationSeconds = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "Duración de requests HTTP por servicio, método, ruta y status",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"service", "method", "path", "status"},
	)
)

const serviceName = "user-service"

func MetricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		c.Next()

		statusCode := c.Writer.Status()
		method := c.Request.Method
		path := c.FullPath()
		if path == "" {
			path = c.Request.URL.Path
		}

		labels := prometheus.Labels{
			"service": serviceName,
			"method":  method,
			"path":    path,
			"status":  strconv.Itoa(statusCode),
		}

		httpRequestsTotal.With(labels).Inc()
		duration := time.Since(start).Seconds()
		httpRequestDurationSeconds.With(labels).Observe(duration)
	}
}
