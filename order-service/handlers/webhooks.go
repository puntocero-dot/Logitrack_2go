package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// WebhookConfig configuración de callbacks para un cliente
type WebhookConfig struct {
	ID          int        `json:"id"`
	Integration string     `json:"integration_name"`
	CallbackURL string     `json:"callback_url"`
	Secret      string     `json:"secret,omitempty"`
	Events      []string   `json:"events"` // assigned, in_route, delivered, cancelled
	IsActive    bool       `json:"is_active"`
	RetryCount  int        `json:"retry_count"`
	LastSuccess *time.Time `json:"last_success,omitempty"`
	LastError   string     `json:"last_error,omitempty"`
}

// WebhookPayload payload que se envía al cliente
type WebhookPayload struct {
	Event      string                 `json:"event"`
	Timestamp  time.Time              `json:"timestamp"`
	OrderID    int                    `json:"order_id"`
	ExternalID string                 `json:"external_id,omitempty"`
	Status     string                 `json:"status"`
	Data       map[string]interface{} `json:"data,omitempty"`
}

// NotifyOrderStatusChange envía notificación a sistemas externos cuando cambia el estado
func NotifyOrderStatusChange(orderID int, externalID, newStatus string, extraData map[string]interface{}) {
	// Obtener configuraciones de webhook activas
	rows, err := db.Query(`
		SELECT ic.id, ic.name, ic.endpoint, ic.auth_value
		FROM integration_configs ic
		WHERE ic.is_active = true 
		AND ic.type = 'webhook'
		AND ic.endpoint IS NOT NULL
		AND ic.endpoint != ''`)

	if err != nil {
		log.Printf("Error obteniendo webhooks: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var name, endpoint, secret string
		rows.Scan(&id, &name, &endpoint, &secret)

		// Enviar en goroutine para no bloquear
		go sendWebhookNotification(id, name, endpoint, secret, WebhookPayload{
			Event:      "order_status_changed",
			Timestamp:  time.Now(),
			OrderID:    orderID,
			ExternalID: externalID,
			Status:     newStatus,
			Data:       extraData,
		})
	}
}

// sendWebhookNotification envía el webhook con reintentos
func sendWebhookNotification(integrationID int, name, endpoint, secret string, payload WebhookPayload) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error serializando webhook: %v", err)
		return
	}

	// Calcular firma HMAC
	signature := ""
	if secret != "" {
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(payloadBytes)
		signature = hex.EncodeToString(mac.Sum(nil))
	}

	// Intentar hasta 3 veces
	maxRetries := 3
	for attempt := 1; attempt <= maxRetries; attempt++ {
		req, err := http.NewRequest("POST", endpoint, bytes.NewReader(payloadBytes))
		if err != nil {
			log.Printf("Webhook %s: error creando request: %v", name, err)
			continue
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Logitrack-Event", payload.Event)
		req.Header.Set("X-Logitrack-Timestamp", payload.Timestamp.Format(time.RFC3339))
		if signature != "" {
			req.Header.Set("X-Logitrack-Signature", signature)
		}

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)

		if err != nil {
			log.Printf("Webhook %s intento %d: error: %v", name, attempt, err)
			if attempt < maxRetries {
				time.Sleep(time.Duration(attempt*2) * time.Second) // Backoff exponencial
			}
			continue
		}

		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			log.Printf("Webhook %s: éxito (status %d)", name, resp.StatusCode)
			// Guardar éxito
			db.Exec(`UPDATE integration_configs SET last_sync = CURRENT_TIMESTAMP WHERE id = $1`, integrationID)
			return
		}

		log.Printf("Webhook %s intento %d: status %d", name, attempt, resp.StatusCode)
		if attempt < maxRetries {
			time.Sleep(time.Duration(attempt*2) * time.Second)
		}
	}

	log.Printf("Webhook %s: falló después de %d intentos", name, maxRetries)
}

// NotifyDeliveryCompleted notificación especial cuando se completa una entrega
func NotifyDeliveryCompleted(orderID int, externalID string, deliveredAt time.Time, signatureURL, photoURL string) {
	NotifyOrderStatusChange(orderID, externalID, "delivered", map[string]interface{}{
		"delivered_at":  deliveredAt.Format(time.RFC3339),
		"signature_url": signatureURL,
		"photo_url":     photoURL,
	})
}

// NotifyMotoAssigned notificación cuando se asigna una moto
func NotifyMotoAssigned(orderID int, externalID string, motoPlate string, driverName string, etaMinutes int) {
	NotifyOrderStatusChange(orderID, externalID, "assigned", map[string]interface{}{
		"moto_plate":  motoPlate,
		"driver_name": driverName,
		"eta_minutes": etaMinutes,
	})
}

// NotifyInRoute notificación cuando el motorista está en camino
func NotifyInRoute(orderID int, externalID string, motoLat, motoLng float64) {
	NotifyOrderStatusChange(orderID, externalID, "in_route", map[string]interface{}{
		"current_latitude":  motoLat,
		"current_longitude": motoLng,
	})
}
