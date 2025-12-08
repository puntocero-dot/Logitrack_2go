# ⚡ Quick Start - Railway Deploy

## 🎯 Lo Mínimo que Necesitas Hacer

### 1. Sube el código a GitHub (1 minuto)
```powershell
cd C:\Users\DELL\Desktop\Proyectos\Logitrack
git add .
git commit -m "Railway deployment ready"
git push origin main
```

### 2. En Railway Dashboard (10 minutos)

**URL:** https://railway.app/project/4e1f428d-6b1b-45e5-b18d-cda6f33b2008

#### A. Bases de Datos (2 clicks)
1. **"+ New"** → **"Database"** → **"PostgreSQL"** ✅
2. **"+ New"** → **"Database"** → **"Redis"** ✅
3. Click en Postgres → **"Data"** → **"Query"** → Pega `init.sql` → **"Run"** ✅

#### B. Servicios Backend (5 servicios, 2 minutos cada uno)

Para cada servicio:
1. **"+ New"** → **"GitHub Repo"** → `Logitrack_2go`
2. **Settings:** Nombre + Root Directory
3. **Variables:** Copiar/pegar del listado abajo
4. Solo para `api-gateway`: **"Generate Domain"** (público)

**Servicios a crear:**
- `api-gateway` (ROOT: `api-gateway`) - **PÚBLICO** ⭐
- `user-service` (ROOT: `user-service`) - privado
- `order-service` (ROOT: `order-service`) - privado
- `geolocation-service` (ROOT: `geolocation-service`) - privado
- `ai-service` (ROOT: `ai-service`) - privado

#### C. Frontend (2 servicios, 2 minutos cada uno)

- `web-app` (ROOT: `web-app`) - **PÚBLICO** ⭐
- `client-view` (ROOT: `client-view`) - **PÚBLICO** ⭐

---

## 📋 Variables por Servicio (Copy/Paste)

### api-gateway
```
PORT=8080
REDIS_URL=${{Redis.REDIS_URL}}
USER_SERVICE_URL=http://user-service.railway.internal:8080
ORDER_SERVICE_URL=http://order-service.railway.internal:8080
GEO_SERVICE_URL=http://geolocation-service.railway.internal:8080
AI_SERVICE_URL=http://ai-service.railway.internal:8080
```

### user-service
```
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=logitrack_jwt_secret_super_seguro_2024
```

### order-service
```
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

### geolocation-service
```
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

### ai-service
```
PORT=8080
```

### web-app
```
REACT_APP_API_URL=https://TU-API-GATEWAY-URL.up.railway.app
```
⚠️ Reemplaza con la URL real del api-gateway

### client-view
```
REACT_APP_API_URL=https://TU-API-GATEWAY-URL.up.railway.app
```
⚠️ Usa la misma URL del api-gateway

---

## ✅ Verificación Rápida

1. **API:** `https://api-gateway-xxx.up.railway.app/health` → `{"status":"ok"}`
2. **Web:** `https://web-app-xxx.up.railway.app` → Login → Dashboard ✅

---

## 🆘 Ayuda Rápida

**Error de CORS:** Verifica que `REACT_APP_API_URL` tenga la URL correcta  
**Error de BD:** Verifica que `DATABASE_URL=${{Postgres.DATABASE_URL}}`  
**Servicio no inicia:** Ve a Logs del servicio en Railway

---

**Tiempo total estimado:** 15-20 minutos ⏱️
