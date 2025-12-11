package handlers

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID        int     `json:"id"`
	Name      *string `json:"name"`
	Email     string  `json:"email"`
	Password  string  `json:"password,omitempty"`
	Role      string  `json:"role"`
	BranchID  *int    `json:"branch_id"`
	Active    *bool   `json:"active"`
	CreatedAt string  `json:"created_at,omitempty"`
	UpdatedAt string  `json:"updated_at,omitempty"`
}

var db *sql.DB

func SetDB(database *sql.DB) {
	db = database
}

// GetUsers returns all users (admin only)
func GetUsers(c *gin.Context) {
	rows, err := db.Query(`
		SELECT id, COALESCE(name, ''), email, role, branch_id, COALESCE(active, true), created_at, updated_at 
		FROM users 
		ORDER BY id
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		var name, createdAt, updatedAt string
		var branchID sql.NullInt64
		var active bool
		if err := rows.Scan(&u.ID, &name, &u.Email, &u.Role, &branchID, &active, &createdAt, &updatedAt); err != nil {
			continue
		}
		u.Name = &name
		u.Active = &active
		u.CreatedAt = createdAt
		u.UpdatedAt = updatedAt
		if branchID.Valid {
			bid := int(branchID.Int64)
			u.BranchID = &bid
		}
		users = append(users, u)
	}
	c.JSON(http.StatusOK, users)
}

// GetUser returns a single user by id
func GetUser(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid id"})
		return
	}

	var u User
	var name string
	var branchID sql.NullInt64
	var active bool
	err = db.QueryRow(`
		SELECT id, COALESCE(name, ''), email, role, branch_id, COALESCE(active, true) 
		FROM users WHERE id = $1
	`, id).Scan(&u.ID, &name, &u.Email, &u.Role, &branchID, &active)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	u.Name = &name
	u.Active = &active
	if branchID.Valid {
		bid := int(branchID.Int64)
		u.BranchID = &bid
	}
	c.JSON(http.StatusOK, u)
}

// CreateUser creates a new user (admin only)
func CreateUser(c *gin.Context) {
	var u User
	if err := c.ShouldBindJSON(&u); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	// Default active to true
	activeVal := true
	if u.Active != nil {
		activeVal = *u.Active
	}

	err = db.QueryRow(`
		INSERT INTO users (name, email, password_hash, role, branch_id, active) 
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
	`, u.Name, u.Email, string(hashedPassword), u.Role, u.BranchID, activeVal).Scan(&u.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	u.Password = "" // omit password from response
	u.Active = &activeVal
	c.JSON(http.StatusCreated, u)
}

// UpdateUser updates an existing user (admin only)
func UpdateUser(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid id"})
		return
	}

	var u User
	if err := c.ShouldBindJSON(&u); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Build dynamic query
	query := "UPDATE users SET name = $1, email = $2, role = $3, branch_id = $4, active = $5, updated_at = NOW()"
	activeVal := true
	if u.Active != nil {
		activeVal = *u.Active
	}
	args := []interface{}{u.Name, u.Email, u.Role, u.BranchID, activeVal}
	argIdx := 6

	if u.Password != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
			return
		}
		query += ", password_hash = $" + strconv.Itoa(argIdx)
		args = append(args, string(hashedPassword))
		argIdx++
	}

	query += " WHERE id = $" + strconv.Itoa(argIdx)
	args = append(args, id)

	_, err = db.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	u.ID = id
	u.Password = ""
	u.Active = &activeVal
	c.JSON(http.StatusOK, u)
}

// DeleteUser deletes a user (admin only)
func DeleteUser(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid id"})
		return
	}

	// Prevent deleting superadmin
	var role string
	err = db.QueryRow("SELECT role FROM users WHERE id = $1", id).Scan(&role)
	if err == nil && role == "superadmin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot delete superadmin"})
		return
	}

	_, err = db.Exec("DELETE FROM users WHERE id = $1", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "User deleted"})
}
