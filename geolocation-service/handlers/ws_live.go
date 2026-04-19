package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

// ============================================================
// HUB DE WEBSOCKET — live tracking de turno
// ============================================================

// connEntry agrupa el conn con su canal de salida para evitar escrituras concurrentes
type connEntry struct {
	conn   *websocket.Conn
	send   chan []byte
	closed bool
	mu     sync.Mutex
}

// LiveHubType mantiene conexiones activas agrupadas por shiftID
type LiveHubType struct {
	mu      sync.RWMutex
	clients map[int][]*connEntry
}

// LiveHub es la instancia global del hub, accesible desde shifts.go
var LiveHub = &LiveHubType{
	clients: make(map[int][]*connEntry),
}

func NewLiveHub() *LiveHubType {
	return &LiveHubType{clients: make(map[int][]*connEntry)}
}

// Register registra una nueva conexión WS bajo un shiftID
func (h *LiveHubType) Register(shiftID int, conn *websocket.Conn) *connEntry {
	entry := &connEntry{
		conn: conn,
		send: make(chan []byte, 64),
	}
	h.mu.Lock()
	h.clients[shiftID] = append(h.clients[shiftID], entry)
	h.mu.Unlock()
	return entry
}

// Unregister elimina una conexión del hub
func (h *LiveHubType) Unregister(shiftID int, target *connEntry) {
	h.mu.Lock()
	defer h.mu.Unlock()
	list := h.clients[shiftID]
	newList := list[:0]
	for _, e := range list {
		if e != target {
			newList = append(newList, e)
		}
	}
	if len(newList) == 0 {
		delete(h.clients, shiftID)
	} else {
		h.clients[shiftID] = newList
	}
}

// Broadcast envía un payload JSON a todas las conexiones activas de un shiftID
func (h *LiveHubType) Broadcast(shiftID int, payload interface{}) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.mu.RLock()
	entries := h.clients[shiftID]
	h.mu.RUnlock()

	for _, e := range entries {
		e.mu.Lock()
		if !e.closed {
			select {
			case e.send <- data:
			default:
				// Canal lleno — cliente lento, descartamos el mensaje
			}
		}
		e.mu.Unlock()
	}
}

// ============================================================
// UPGRADER
// ============================================================

var wsUpgrader = websocket.Upgrader{
	HandshakeTimeout: 10 * time.Second,
	ReadBufferSize:   512,
	WriteBufferSize:  4096,
	CheckOrigin: func(r *http.Request) bool {
		// Validamos el origen contra ALLOWED_ORIGINS (mismo env que api-gateway)
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // conexión no-browser (e.g. tests)
		}
		allowedRaw := os.Getenv("ALLOWED_ORIGINS")
		if allowedRaw == "" {
			// Defaults de desarrollo
			allowedRaw = "http://localhost:3001,http://localhost:3002,http://10.23.150.40:3001,http://10.23.150.40:3002"
		}
		for _, o := range strings.Split(allowedRaw, ",") {
			if strings.TrimSpace(o) == origin {
				return true
			}
		}
		return false
	},
}

// ============================================================
// VALIDACIÓN JWT (replica mínima de api-gateway/middleware/auth.go)
// El WS no puede enviar header Authorization, así que acepta ?token=
// ============================================================

func validateWSToken(tokenStr string) (int, string, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return 0, "", fmt.Errorf("JWT_SECRET no configurado")
	}

	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("método de firma inesperado: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return 0, "", fmt.Errorf("token inválido o expirado")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, "", fmt.Errorf("claims inválidos")
	}

	userIDf, _ := claims["user_id"].(float64)
	role, _ := claims["role"].(string)
	return int(userIDf), role, nil
}

// ============================================================
// HANDLER: GET /shifts/:id/live  (upgrade a WebSocket)
// ============================================================

// WSLive maneja la conexión WebSocket para live tracking de un turno.
// El cliente debe enviar el JWT como query param: ?token=<bearer_token>
func WSLive(c *gin.Context) {
	// 1. Validar shift ID
	shiftID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de turno inválido"})
		return
	}

	// 2. Validar JWT desde query param (los browsers no soportan Auth header en WS)
	tokenStr := c.Query("token")
	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Se requiere ?token= para WebSocket"})
		return
	}
	_, _, err = validateWSToken(tokenStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Token inválido: " + err.Error()})
		return
	}

	// 3. Verificar que el turno existe (opcional pero útil para 404 temprano)
	var status string
	dbErr := db.QueryRow("SELECT status FROM shifts WHERE id = $1", shiftID).Scan(&status)
	if dbErr != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Turno no encontrado"})
		return
	}

	// 4. Upgrade a WebSocket
	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		// Upgrade falla si ya se escribió algo — no podemos responder JSON aquí
		return
	}
	defer conn.Close()

	// 5. Registrar en el hub
	entry := LiveHub.Register(shiftID, conn)
	defer LiveHub.Unregister(shiftID, entry)

	// 6. Goroutine de escritura (único escritor para este conn)
	writeDone := make(chan struct{})
	go func() {
		defer close(writeDone)
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case msg, ok := <-entry.send:
				if !ok {
					return
				}
				conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					return
				}
			case <-ticker.C:
				// Ping heartbeat
				conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}()

	// 7. Loop de lectura (mantenemos la conn viva y procesamos Pong / Close)
	conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(70 * time.Second))
		return nil
	})

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break // cliente desconectado o timeout
		}
	}

	// 8. Señalizar al writer que se cierre
	entry.mu.Lock()
	entry.closed = true
	close(entry.send)
	entry.mu.Unlock()

	<-writeDone
}
