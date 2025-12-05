package logging

import (
	"os"
	"strings"

	"github.com/rs/zerolog"
)

var Logger zerolog.Logger

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
