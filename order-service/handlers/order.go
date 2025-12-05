package handlers

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/logitrack/order-service/models"
	"github.com/logitrack/order-service/validation"
)

var db *sql.DB

func SetDB(database *sql.DB) {
	db = database
}

func CreateOrder(c *gin.Context) {
	var req validation.CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON format"})
		return
	}

	// Validar con go-playground/validator
	if err := validation.Validate(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var orderID int
	err := db.QueryRow(`
		INSERT INTO orders (client_name, client_email, address, latitude, longitude, status, branch) 
		VALUES ($1, $2, $3, $4, $5, 'pending', $6) 
		RETURNING id
	`, req.ClientName, req.ClientEmail, req.Address, req.Latitude, req.Longitude, req.Branch).Scan(&orderID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create order"})
		return
	}

	// Devolver orden creada
	order := models.Order{
		ID:          orderID,
		ClientName:  req.ClientName,
		ClientEmail: req.ClientEmail,
		Address:     req.Address,
		Latitude:    req.Latitude,
		Longitude:   req.Longitude,
		Status:      "pending",
		Branch:      req.Branch,
	}

	c.JSON(http.StatusCreated, order)
}

func GetOrders(c *gin.Context) {
	branch := c.Query("branch")
	assignedMotoIDStr := c.Query("assigned_moto_id")
	var rows *sql.Rows
	var err error

	if assignedMotoIDStr != "" {
		motoID, convErr := strconv.Atoi(assignedMotoIDStr)
		if convErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid assigned_moto_id"})
			return
		}
		if branch != "" {
			rows, err = db.Query("SELECT id, client_name, client_email, address, latitude, longitude, status, assigned_moto_id, branch FROM orders WHERE branch = $1 AND assigned_moto_id = $2", branch, motoID)
		} else {
			rows, err = db.Query("SELECT id, client_name, client_email, address, latitude, longitude, status, assigned_moto_id, branch FROM orders WHERE assigned_moto_id = $1", motoID)
		}
	} else if branch != "" {
		rows, err = db.Query("SELECT id, client_name, client_email, address, latitude, longitude, status, assigned_moto_id, branch FROM orders WHERE branch = $1", branch)
	} else {
		rows, err = db.Query("SELECT id, client_name, client_email, address, latitude, longitude, status, assigned_moto_id, branch FROM orders")
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		var order models.Order
		err := rows.Scan(&order.ID, &order.ClientName, &order.ClientEmail, &order.Address, &order.Latitude, &order.Longitude, &order.Status, &order.AssignedMotoID, &order.Branch)
		if err != nil {
			continue
		}
		orders = append(orders, order)
	}
	c.JSON(http.StatusOK, orders)
}

func GetOrderByID(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid order id"})
		return
	}
	var order models.Order
	err = db.QueryRow("SELECT id, client_name, client_email, address, latitude, longitude, status, assigned_moto_id, branch FROM orders WHERE id = $1", id).
		Scan(&order.ID, &order.ClientName, &order.ClientEmail, &order.Address, &order.Latitude, &order.Longitude, &order.Status, &order.AssignedMotoID, &order.Branch)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get order"})
		return
	}
	c.JSON(http.StatusOK, order)
}

func UpdateOrderStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid order ID"})
		return
	}

	var req validation.UpdateOrderStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON format"})
		return
	}

	// Validar status
	if err := validation.Validate(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err = db.Exec("UPDATE orders SET status = $1 WHERE id = $2", req.Status, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update order"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Order status updated", "status": req.Status})
}

func AssignOrderToMoto(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid order ID"})
		return
	}

	var req validation.AssignMotoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON format"})
		return
	}

	// Validar moto_id
	if err := validation.Validate(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verificar que la moto existe
	var dummy int
	err = db.QueryRow("SELECT id FROM motos WHERE id = $1", req.MotoID).Scan(&dummy)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Moto not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify moto"})
		return
	}

	// Asignar moto al pedido
	res, err := db.Exec("UPDATE orders SET assigned_moto_id = $1, status = CASE WHEN status = 'pending' THEN 'assigned' ELSE status END WHERE id = $2", req.MotoID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to assign order"})
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Order assigned"})
}
