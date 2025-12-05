package logging

import (
	"os"
	"strings"

	"github.com/rs/zerolog"
)

// Logger es el logger global estructurado para el servicio
var Logger zerolog.Logger

// InitLogger inicializa el logger con nivel y nombre de servicio
func InitLogger(serviceName string) {
	level := zerolog.InfoLevel
	if lvlStr := strings.ToLower(os.Getenv("LOG_LEVEL")); lvlStr != "" {
		if parsed, err := zerolog.ParseLevel(lvlStr); err == nil {
			level = parsed
		}
	}

	Logger = zerolog.New(os.Stdout).
		Level(level).
		With().
		Timestamp().
		Str("service", serviceName).
		Logger()
}
