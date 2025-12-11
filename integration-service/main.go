package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

var db *sql.DB

// IntegrationConfig almacena la configuración de una integración
type IntegrationConfig struct {
	ID           int       `json:"id"`
	Name         string    `json:"name"`
	Type         string    `json:"type"` // api, database, webhook, file
	Endpoint     string    `json:"endpoint"`
	AuthType     string    `json:"auth_type"` // none, basic, bearer, apikey
	AuthValue    string    `json:"auth_value,omitempty"`
	PollInterval int       `json:"poll_interval_seconds"` // Para polling automático
	IsActive     bool      `json:"is_active"`
	LastSync     time.Time `json:"last_sync,omitempty"`
	FieldMapping string    `json:"field_mapping"` // JSON con mapeo de campos
}

// ExternalOrder representa un pedido del sistema externo
type ExternalOrder struct {
	ExternalID    string  `json:"external_id"`
	ClientName    string  `json:"client_name"`
	ClientPhone   string  `json:"client_phone,omitempty"`
	ClientEmail   string  `json:"client_email,omitempty"`
	Address       string  `json:"address"`
	Latitude      float64 `json:"latitude,omitempty"`
	Longitude     float64 `json:"longitude,omitempty"`
	Branch        string  `json:"branch,omitempty"`
	Notes         string  `json:"notes,omitempty"`
	Priority      int     `json:"priority,omitempty"`
	ScheduledTime string  `json:"scheduled_time,omitempty"`
}

// SyncResult resultado de una sincronización
type SyncResult struct {
	TotalReceived int      `json:"total_received"`
	Created       int      `json:"created"`
	Updated       int      `json:"updated"`
	Errors        int      `json:"errors"`
	ErrorDetails  []string `json:"error_details,omitempty"`
}

func main() {
	initDB()

	r := gin.Default()

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "integration-service"})
	})

	// Configuración de integraciones
	r.GET("/integrations", getIntegrations)
	r.POST("/integrations", createIntegration)
	r.PUT("/integrations/:id", updateIntegration)
	r.DELETE("/integrations/:id", deleteIntegration)

	// Sync manual
	r.POST("/sync/:id", triggerSync)
	r.GET("/sync/status/:id", getSyncStatus)

	// Webhook receiver (para integraciones push)
	r.POST("/webhook/:integration_name", handleWebhook)

	// Importación masiva
	r.POST("/import/orders", importOrders)

	log.Println("🔌 Integration Service iniciado en puerto 8084")
	r.Run(":8084")
}

func initDB() {
	var err error
	db, err = sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("Error conectando a BD:", err)
	}
	createTables()
}

func createTables() {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS integration_configs (
			id SERIAL PRIMARY KEY,
			name VARCHAR(100) UNIQUE NOT NULL,
			type VARCHAR(50) NOT NULL,
			endpoint TEXT,
			auth_type VARCHAR(50) DEFAULT 'none',
			auth_value TEXT,
			poll_interval_seconds INTEGER DEFAULT 0,
			is_active BOOLEAN DEFAULT true,
			last_sync TIMESTAMP,
			field_mapping JSONB DEFAULT '{}',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS sync_logs (
			id SERIAL PRIMARY KEY,
			integration_id INTEGER REFERENCES integration_configs(id),
			sync_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			total_received INTEGER DEFAULT 0,
			created INTEGER DEFAULT 0,
			updated INTEGER DEFAULT 0,
			errors INTEGER DEFAULT 0,
			error_details JSONB
		);

		CREATE TABLE IF NOT EXISTS external_order_mapping (
			id SERIAL PRIMARY KEY,
			integration_id INTEGER REFERENCES integration_configs(id),
			external_id VARCHAR(255) NOT NULL,
			internal_order_id INTEGER,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(integration_id, external_id)
		);
	`)
	if err != nil {
		log.Println("Error creando tablas:", err)
	}
}

// ========================================
// CRUD DE INTEGRACIONES
// ========================================

func getIntegrations(c *gin.Context) {
	rows, err := db.Query(`
		SELECT id, name, type, endpoint, auth_type, poll_interval_seconds, is_active, last_sync, field_mapping
		FROM integration_configs
		ORDER BY name`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var integrations []IntegrationConfig
	for rows.Next() {
		var i IntegrationConfig
		var lastSync sql.NullTime
		var fieldMapping sql.NullString
		var endpoint sql.NullString

		if err := rows.Scan(&i.ID, &i.Name, &i.Type, &endpoint, &i.AuthType,
			&i.PollInterval, &i.IsActive, &lastSync, &fieldMapping); err != nil {
			continue
		}
		if lastSync.Valid {
			i.LastSync = lastSync.Time
		}
		if endpoint.Valid {
			i.Endpoint = endpoint.String
		}
		if fieldMapping.Valid {
			i.FieldMapping = fieldMapping.String
		}
		integrations = append(integrations, i)
	}

	c.JSON(http.StatusOK, integrations)
}

func createIntegration(c *gin.Context) {
	var config IntegrationConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := db.QueryRow(`
		INSERT INTO integration_configs (name, type, endpoint, auth_type, auth_value, poll_interval_seconds, is_active, field_mapping)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id`,
		config.Name, config.Type, config.Endpoint, config.AuthType, config.AuthValue,
		config.PollInterval, config.IsActive, config.FieldMapping,
	).Scan(&config.ID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error creando integración: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, config)
}

func updateIntegration(c *gin.Context) {
	id := c.Param("id")
	var config IntegrationConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := db.Exec(`
		UPDATE integration_configs 
		SET name=$1, type=$2, endpoint=$3, auth_type=$4, auth_value=$5, 
		    poll_interval_seconds=$6, is_active=$7, field_mapping=$8
		WHERE id=$9`,
		config.Name, config.Type, config.Endpoint, config.AuthType, config.AuthValue,
		config.PollInterval, config.IsActive, config.FieldMapping, id,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Integración actualizada"})
}

func deleteIntegration(c *gin.Context) {
	id := c.Param("id")
	_, err := db.Exec("DELETE FROM integration_configs WHERE id = $1", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Integración eliminada"})
}

// ========================================
// SINCRONIZACIÓN
// ========================================

func triggerSync(c *gin.Context) {
	id := c.Param("id")

	// Obtener configuración
	var config IntegrationConfig
	var endpoint sql.NullString
	err := db.QueryRow(`
		SELECT id, name, type, endpoint, auth_type, auth_value 
		FROM integration_configs WHERE id = $1 AND is_active = true`, id,
	).Scan(&config.ID, &config.Name, &config.Type, &endpoint, &config.AuthType, &config.AuthValue)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Integración no encontrada o inactiva"})
		return
	}
	if endpoint.Valid {
		config.Endpoint = endpoint.String
	}

	// Ejecutar sync según tipo
	var result SyncResult
	switch config.Type {
	case "api":
		result = syncFromAPI(config)
	case "webhook":
		c.JSON(http.StatusBadRequest, gin.H{"error": "Las integraciones webhook no usan sync manual"})
		return
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tipo de integración no soportado: " + config.Type})
		return
	}

	// Guardar log de sync
	db.Exec(`
		INSERT INTO sync_logs (integration_id, total_received, created, updated, errors)
		VALUES ($1, $2, $3, $4, $5)`,
		config.ID, result.TotalReceived, result.Created, result.Updated, result.Errors,
	)

	// Actualizar last_sync
	db.Exec("UPDATE integration_configs SET last_sync = CURRENT_TIMESTAMP WHERE id = $1", config.ID)

	c.JSON(http.StatusOK, result)
}

func syncFromAPI(config IntegrationConfig) SyncResult {
	result := SyncResult{}

	// Crear request
	req, err := http.NewRequest("GET", config.Endpoint, nil)
	if err != nil {
		result.Errors = 1
		result.ErrorDetails = append(result.ErrorDetails, "Error creando request: "+err.Error())
		return result
	}

	// Agregar autenticación
	switch config.AuthType {
	case "bearer":
		req.Header.Set("Authorization", "Bearer "+config.AuthValue)
	case "apikey":
		req.Header.Set("X-API-Key", config.AuthValue)
	case "basic":
		req.SetBasicAuth("user", config.AuthValue)
	}

	// Ejecutar request
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		result.Errors = 1
		result.ErrorDetails = append(result.ErrorDetails, "Error en request: "+err.Error())
		return result
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		result.Errors = 1
		result.ErrorDetails = append(result.ErrorDetails, "Status code: "+resp.Status)
		return result
	}

	// Parsear respuesta
	body, _ := io.ReadAll(resp.Body)
	var orders []ExternalOrder
	if err := json.Unmarshal(body, &orders); err != nil {
		// Intentar como objeto con array
		var wrapper struct {
			Orders []ExternalOrder `json:"orders"`
			Data   []ExternalOrder `json:"data"`
			Items  []ExternalOrder `json:"items"`
		}
		if err := json.Unmarshal(body, &wrapper); err != nil {
			result.Errors = 1
			result.ErrorDetails = append(result.ErrorDetails, "Error parseando respuesta: "+err.Error())
			return result
		}
		if len(wrapper.Orders) > 0 {
			orders = wrapper.Orders
		} else if len(wrapper.Data) > 0 {
			orders = wrapper.Data
		} else if len(wrapper.Items) > 0 {
			orders = wrapper.Items
		}
	}

	result.TotalReceived = len(orders)

	// Procesar cada orden
	for _, order := range orders {
		created, err := createOrderFromExternal(config.ID, order)
		if err != nil {
			result.Errors++
			result.ErrorDetails = append(result.ErrorDetails, "Order "+order.ExternalID+": "+err.Error())
		} else if created {
			result.Created++
		} else {
			result.Updated++
		}
	}

	return result
}

func createOrderFromExternal(integrationID int, ext ExternalOrder) (bool, error) {
	// Verificar si ya existe
	var existingID int
	err := db.QueryRow(`
		SELECT internal_order_id FROM external_order_mapping 
		WHERE integration_id = $1 AND external_id = $2`,
		integrationID, ext.ExternalID,
	).Scan(&existingID)

	if err == nil {
		// Ya existe, actualizar si es necesario (por ahora skip)
		return false, nil
	}

	// Crear orden en order-service via API interna
	orderPayload := map[string]interface{}{
		"client_name":  ext.ClientName,
		"client_email": ext.ClientEmail,
		"address":      ext.Address,
		"latitude":     ext.Latitude,
		"longitude":    ext.Longitude,
		"branch":       ext.Branch,
	}

	payloadBytes, _ := json.Marshal(orderPayload)

	// Llamar al order-service
	orderServiceURL := os.Getenv("ORDER_SERVICE_URL")
	if orderServiceURL == "" {
		orderServiceURL = "http://order-service:8080"
	}

	resp, err := http.Post(orderServiceURL+"/orders", "application/json", bytes.NewReader(payloadBytes))
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return false, json.Unmarshal(body, &struct{}{})
	}

	// Obtener ID del orden creado
	var createdOrder struct {
		ID int `json:"id"`
	}
	json.NewDecoder(resp.Body).Decode(&createdOrder)

	// Guardar mapeo
	db.Exec(`
		INSERT INTO external_order_mapping (integration_id, external_id, internal_order_id)
		VALUES ($1, $2, $3)`,
		integrationID, ext.ExternalID, createdOrder.ID,
	)

	return true, nil
}

func getSyncStatus(c *gin.Context) {
	id := c.Param("id")
	rows, err := db.Query(`
		SELECT sync_time, total_received, created, updated, errors
		FROM sync_logs
		WHERE integration_id = $1
		ORDER BY sync_time DESC
		LIMIT 10`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var logs []map[string]interface{}
	for rows.Next() {
		var syncTime time.Time
		var total, created, updated, errors int
		rows.Scan(&syncTime, &total, &created, &updated, &errors)
		logs = append(logs, map[string]interface{}{
			"sync_time":      syncTime,
			"total_received": total,
			"created":        created,
			"updated":        updated,
			"errors":         errors,
		})
	}

	c.JSON(http.StatusOK, logs)
}

// ========================================
// WEBHOOK RECEIVER
// ========================================

func handleWebhook(c *gin.Context) {
	integrationName := c.Param("integration_name")

	// Verificar que la integración existe
	var integrationID int
	err := db.QueryRow(`
		SELECT id FROM integration_configs 
		WHERE name = $1 AND type = 'webhook' AND is_active = true`,
		integrationName,
	).Scan(&integrationID)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Webhook no configurado: " + integrationName})
		return
	}

	// Leer body
	var orders []ExternalOrder
	if err := c.ShouldBindJSON(&orders); err != nil {
		// Intentar como orden individual
		var singleOrder ExternalOrder
		c.Request.Body = io.NopCloser(bytes.NewBuffer([]byte{}))
		if err := c.ShouldBindJSON(&singleOrder); err == nil && singleOrder.ExternalID != "" {
			orders = []ExternalOrder{singleOrder}
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Formato inválido"})
			return
		}
	}

	result := SyncResult{TotalReceived: len(orders)}
	for _, order := range orders {
		created, err := createOrderFromExternal(integrationID, order)
		if err != nil {
			result.Errors++
		} else if created {
			result.Created++
		} else {
			result.Updated++
		}
	}

	// Log
	db.Exec(`
		INSERT INTO sync_logs (integration_id, total_received, created, updated, errors)
		VALUES ($1, $2, $3, $4, $5)`,
		integrationID, result.TotalReceived, result.Created, result.Updated, result.Errors,
	)

	c.JSON(http.StatusOK, result)
}

// ========================================
// IMPORTACIÓN MASIVA
// ========================================

func importOrders(c *gin.Context) {
	var orders []ExternalOrder
	if err := c.ShouldBindJSON(&orders); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := SyncResult{TotalReceived: len(orders)}
	for _, order := range orders {
		if order.ExternalID == "" {
			order.ExternalID = "import-" + time.Now().Format("20060102150405")
		}
		created, err := createOrderFromExternal(0, order) // 0 = importación manual
		if err != nil {
			result.Errors++
			result.ErrorDetails = append(result.ErrorDetails, err.Error())
		} else if created {
			result.Created++
		}
	}

	c.JSON(http.StatusOK, result)
}
