package database

import (
	"os"
	"strings"
)

// BuildDSN returns the DATABASE_URL, replacing sslmode=disable with sslmode=require in production.
func BuildDSN() string {
	dsn := os.Getenv("DATABASE_URL")
	if os.Getenv("ENV") == "production" && strings.Contains(dsn, "sslmode=disable") {
		dsn = strings.ReplaceAll(dsn, "sslmode=disable", "sslmode=require")
	}
	return dsn
}
