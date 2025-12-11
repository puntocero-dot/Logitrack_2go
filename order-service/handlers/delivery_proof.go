package handlers

import (
	"database/sql"
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// DeliveryProofRequest representa la prueba de entrega
type DeliveryProofRequest struct {
	SignatureBase64 string `json:"signature_base64" binding:"required"`
	PhotoBase64     string `json:"photo_base64"`
	RecipientName   string `json:"recipient_name"`
	Notes           string `json:"notes"`
}

// DeliveryProof modelo de base de datos
type DeliveryProof struct {
	ID            int       `json:"id"`
	OrderID       int       `json:"order_id"`
	SignatureURL  string    `json:"signature_url"`
	PhotoURL      string    `json:"photo_url,omitempty"`
	RecipientName string    `json:"recipient_name,omitempty"`
	Notes         string    `json:"notes,omitempty"`
	CapturedAt    time.Time `json:"captured_at"`
	Latitude      *float64  `json:"latitude,omitempty"`
	Longitude     *float64  `json:"longitude,omitempty"`
}

// SaveDeliveryProof guarda la prueba de entrega (firma + foto)
func SaveDeliveryProof(c *gin.Context) {
	orderID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de orden inválido"})
		return
	}

	var req DeliveryProofRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verificar que la orden existe
	var exists bool
	err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM orders WHERE id = $1)", orderID).Scan(&exists)
	if err != nil || !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Orden no encontrada"})
		return
	}

	// Crear directorio de uploads si no existe
	uploadsDir := os.Getenv("UPLOADS_DIR")
	if uploadsDir == "" {
		uploadsDir = "/tmp/uploads/delivery_proofs"
	}
	os.MkdirAll(uploadsDir, 0755)

	timestamp := time.Now().Format("20060102_150405")
	var signatureURL, photoURL string

	// Guardar firma
	if req.SignatureBase64 != "" {
		signatureData, err := decodeBase64Image(req.SignatureBase64)
		if err == nil {
			signatureFilename := fmt.Sprintf("sig_%d_%s.png", orderID, timestamp)
			signaturePath := filepath.Join(uploadsDir, signatureFilename)
			if err := os.WriteFile(signaturePath, signatureData, 0644); err == nil {
				signatureURL = "/uploads/delivery_proofs/" + signatureFilename
			}
		}
	}

	// Guardar foto si existe
	if req.PhotoBase64 != "" {
		photoData, err := decodeBase64Image(req.PhotoBase64)
		if err == nil {
			photoFilename := fmt.Sprintf("photo_%d_%s.jpg", orderID, timestamp)
			photoPath := filepath.Join(uploadsDir, photoFilename)
			if err := os.WriteFile(photoPath, photoData, 0644); err == nil {
				photoURL = "/uploads/delivery_proofs/" + photoFilename
			}
		}
	}

	// Guardar en base de datos
	var proofID int
	err = db.QueryRow(`
		INSERT INTO delivery_proofs 
		(order_id, signature_url, photo_url, recipient_name, notes, captured_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id`,
		orderID, signatureURL, photoURL, req.RecipientName, req.Notes, time.Now(),
	).Scan(&proofID)

	if err != nil {
		// Si no existe la tabla, crearla
		db.Exec(`
			CREATE TABLE IF NOT EXISTS delivery_proofs (
				id SERIAL PRIMARY KEY,
				order_id INTEGER NOT NULL REFERENCES orders(id),
				signature_url TEXT,
				photo_url TEXT,
				recipient_name TEXT,
				notes TEXT,
				captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				latitude DOUBLE PRECISION,
				longitude DOUBLE PRECISION
			)
		`)
		// Reintentar inserción
		err = db.QueryRow(`
			INSERT INTO delivery_proofs 
			(order_id, signature_url, photo_url, recipient_name, notes, captured_at)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id`,
			orderID, signatureURL, photoURL, req.RecipientName, req.Notes, time.Now(),
		).Scan(&proofID)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al guardar prueba: " + err.Error()})
		return
	}

	// Notificar a sistemas externos
	go NotifyDeliveryCompleted(orderID, "", time.Now(), signatureURL, photoURL)

	c.JSON(http.StatusOK, gin.H{
		"message":       "Prueba de entrega guardada",
		"proof_id":      proofID,
		"signature_url": signatureURL,
		"photo_url":     photoURL,
	})
}

// GetDeliveryProof obtiene la prueba de entrega de una orden
func GetDeliveryProof(c *gin.Context) {
	orderID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	var proof DeliveryProof
	var photoURL, recipientName, notes sql.NullString
	var lat, lng sql.NullFloat64

	err = db.QueryRow(`
		SELECT id, order_id, signature_url, photo_url, recipient_name, notes, captured_at, latitude, longitude
		FROM delivery_proofs
		WHERE order_id = $1
		ORDER BY captured_at DESC
		LIMIT 1`,
		orderID,
	).Scan(&proof.ID, &proof.OrderID, &proof.SignatureURL, &photoURL, &recipientName, &notes, &proof.CapturedAt, &lat, &lng)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "No hay prueba de entrega"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if photoURL.Valid {
		proof.PhotoURL = photoURL.String
	}
	if recipientName.Valid {
		proof.RecipientName = recipientName.String
	}
	if notes.Valid {
		proof.Notes = notes.String
	}
	if lat.Valid {
		proof.Latitude = &lat.Float64
	}
	if lng.Valid {
		proof.Longitude = &lng.Float64
	}

	c.JSON(http.StatusOK, proof)
}

// decodeBase64Image decodifica una imagen base64 (con o sin prefijo data:)
func decodeBase64Image(data string) ([]byte, error) {
	// Remover prefijo data:image/xxx;base64, si existe
	if strings.Contains(data, ",") {
		parts := strings.SplitN(data, ",", 2)
		if len(parts) == 2 {
			data = parts[1]
		}
	}
	return base64.StdEncoding.DecodeString(data)
}
