package handlers

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password,omitempty"`
	Role     string `json:"role"`
	Branch   string `json:"branch"`
}

var db *sql.DB

func SetDB(database *sql.DB) {
	db = database
}

// GetUsers returns all users (admin only)
func GetUsers(c *gin.Context) {
	rows, err := db.Query("SELECT id, name, email, role, branch FROM users ORDER BY id")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Branch); err != nil {
			continue
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
	err = db.QueryRow("SELECT id, name, email, role, branch FROM users WHERE id = $1", id).
		Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Branch)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
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

	err = db.QueryRow(
		"INSERT INTO users (name, email, password_hash, role, branch) VALUES ($1, $2, $3, $4, $5) RETURNING id",
		u.Name, u.Email, string(hashedPassword), u.Role, u.Branch,
	).Scan(&u.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	u.Password = "" // omit password from response
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
	query := "UPDATE users SET name = $1, email = $2, role = $3, branch = $4"
	args := []interface{}{u.Name, u.Email, u.Role, u.Branch}
	argIdx := 5

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
	c.JSON(http.StatusOK, u)
}

// DeleteUser deletes a user (admin only)
func DeleteUser(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid id"})
		return
	}

	_, err = db.Exec("DELETE FROM users WHERE id = $1", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "User deleted"})
}
