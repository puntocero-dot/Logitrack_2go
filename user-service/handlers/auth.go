package handlers

import (
	"database/sql"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/logitrack/user-service/redis"
	"golang.org/x/crypto/bcrypt"
)

var jwtSecret = []byte(os.Getenv("JWT_SECRET"))

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"` // segundos
	User         User   `json:"user"`
}

type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type Claims struct {
	UserID int    `json:"user_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// Login maneja el inicio de sesión
func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email y contraseña son requeridos"})
		return
	}

	// Buscar usuario por email (usando password_hash)
	var user User
	var passwordHash string
	var name sql.NullString
	var active bool

	err := db.QueryRow(`
		SELECT id, COALESCE(name, ''), email, password_hash, role, COALESCE(active, true)
		FROM users 
		WHERE email = $1
	`, req.Email).Scan(&user.ID, &name, &user.Email, &passwordHash, &user.Role, &active)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Credenciales inválidas"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al buscar usuario"})
		return
	}

	// Verificar que usuario esté activo
	if !active {
		c.JSON(http.StatusForbidden, gin.H{"error": "Usuario desactivado. Contacte al administrador."})
		return
	}

	// Asignar nombre
	if name.Valid {
		user.Name = &name.String
	}

	// Verificar contraseña con bcrypt
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Credenciales inválidas"})
		return
	}

	// Generar ACCESS TOKEN (15 minutos)
	accessTokenExpiry := time.Now().Add(15 * time.Minute)
	accessClaims := &Claims{
		UserID: user.ID,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(accessTokenExpiry),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessTokenString, err := accessToken.SignedString(jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al generar access token"})
		return
	}

	// Generar REFRESH TOKEN (7 días)
	refreshToken := uuid.New().String()
	refreshTokenTTL := 7 * 24 * time.Hour

	// Guardar refresh token en Redis
	if err := redis.SetRefreshToken(refreshToken, user.ID, refreshTokenTTL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al guardar refresh token"})
		return
	}

	// Respuesta con ambos tokens
	c.JSON(http.StatusOK, LoginResponse{
		AccessToken:  accessTokenString,
		RefreshToken: refreshToken,
		ExpiresIn:    900, // 15 minutos en segundos
		User:         user,
	})
}

// RefreshToken renueva el access token usando un refresh token válido
func RefreshToken(c *gin.Context) {
	var req RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Refresh token requerido"})
		return
	}

	// Validar refresh token en Redis
	userID, err := redis.GetRefreshToken(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token inválido o expirado"})
		return
	}

	// Obtener datos del usuario
	var user User
	err = db.QueryRow(`
		SELECT id, email, role
		FROM users 
		WHERE id = $1
	`, userID).Scan(&user.ID, &user.Email, &user.Role)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener usuario"})
		return
	}

	// ROTACIÓN: Invalidar refresh token viejo
	if err := redis.DeleteRefreshToken(req.RefreshToken); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al invalidar refresh token"})
		return
	}

	// Generar NUEVO access token (15 minutos)
	accessTokenExpiry := time.Now().Add(15 * time.Minute)
	accessClaims := &Claims{
		UserID: user.ID,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(accessTokenExpiry),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessTokenString, err := accessToken.SignedString(jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al generar access token"})
		return
	}

	// Generar NUEVO refresh token (7 días)
	newRefreshToken := uuid.New().String()
	refreshTokenTTL := 7 * 24 * time.Hour

	if err := redis.SetRefreshToken(newRefreshToken, user.ID, refreshTokenTTL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al guardar nuevo refresh token"})
		return
	}

	// Respuesta con nuevos tokens
	c.JSON(http.StatusOK, LoginResponse{
		AccessToken:  accessTokenString,
		RefreshToken: newRefreshToken,
		ExpiresIn:    900,
		User:         user,
	})
}

// Logout invalida el refresh token (logout seguro)
func Logout(c *gin.Context) {
	var req RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Refresh token requerido"})
		return
	}

	// Invalidar refresh token
	if err := redis.DeleteRefreshToken(req.RefreshToken); err != nil {
		// No fallar si el token ya no existe
		c.JSON(http.StatusOK, gin.H{"message": "Sesión cerrada"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Sesión cerrada exitosamente"})
}
