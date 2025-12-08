# ✅ TU CHECKLIST PERSONAL - Railway Deploy

## 🎯 SOLO 3 PASOS PRINCIPALES

---

## PASO 1: Sube el Código (2 minutos)

Abre PowerShell y ejecuta:

```powershell
cd C:\Users\DELL\Desktop\Proyectos\Logitrack
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

✅ **Listo cuando:** Veas "Everything up-to-date" o el push termine sin errores

---

## PASO 2: Crea las Bases de Datos (2 minutos)

Ve a: https://railway.app/project/4e1f428d-6b1b-45e5-b18d-cda6f33b2008

### 2.1 PostgreSQL
1. Click **"+ New"** (botón morado)
2. Click **"Database"**
3. Click **"Add PostgreSQL"**
4. Espera 30 segundos ⏳
5. ✅ Listo

### 2.2 Redis
1. Click **"+ New"** otra vez
2. Click **"Database"**
3. Click **"Add Redis"**
4. Espera 30 segundos ⏳
5. ✅ Listo

### 2.3 Inicializar Tablas
**✨ AUTO-INICIALIZACIÓN:** Las tablas se crean automáticamente cuando `user-service` arranque.

**No necesitas hacer nada aquí.** El código ya tiene un script que crea todas las tablas si no existen.

✅ Puedes saltar este paso

---

## PASO 3: Crea los Servicios (15 minutos)

Vas a crear **7 servicios**. Para cada uno haces lo mismo:

### Patrón General (repite 7 veces):
1. Click **"+ New"** → **"GitHub Repo"**
2. Selecciona `puntocero-dot/Logitrack_2go`
3. Click en el servicio que se creó
4. Click en **"Settings"** (⚙️)
5. Cambia el **Name** y **Root Directory** según la tabla abajo
6. Click en **"Variables"**
7. Copia/pega las variables de la tabla abajo
8. (Solo para los 3 públicos): Click en **"Networking"** → **"Generate Domain"**

---

### 📋 TABLA DE SERVICIOS (Copy/Paste)

#### 1️⃣ api-gateway (PÚBLICO ⭐)
**Settings:**
- Name: `api-gateway`
- Root Directory: `api-gateway`

**Variables:**
```
PORT=8080
REDIS_URL=${{Redis.REDIS_URL}}
USER_SERVICE_URL=http://user-service.railway.internal:8080
ORDER_SERVICE_URL=http://order-service.railway.internal:8080
GEO_SERVICE_URL=http://geolocation-service.railway.internal:8080
AI_SERVICE_URL=http://ai-service.railway.internal:5000
```

**Networking:** ✅ Generate Domain → **📝 GUARDA ESTA URL**

    http://api-gateway-production-ad21.up.railway.app

#### 2️⃣ user-service (privado)
**Settings:**
- Name: `user-service`
- Root Directory: `user-service`

**Variables:**
```
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=logitrack_jwt_secret_super_seguro_2024
```

**Networking:** ❌ No generar dominio

---

#### 3️⃣ order-service (privado)
**Settings:**
- Name: `order-service`
- Root Directory: `order-service`

**Variables:**
```
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

**Networking:** ❌ No generar dominio

---

#### 4️⃣ geolocation-service (privado)
**Settings:**
- Name: `geolocation-service`
- Root Directory: `geolocation-service`

**Variables:**
```
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

**Networking:** ❌ No generar dominio

---

#### 5️⃣ ai-service (privado)
**Settings:**
- Name: `ai-service`
- Root Directory: `ai-service`

**Variables:**
```
PORT=8080
```

**Networking:** ❌ No generar dominio

---

#### 6️⃣ web-app (PÚBLICO ⭐)
**Settings:**
- Name: `web-app`
- Root Directory: `web-app`

**Variables:**
```
REACT_APP_API_URL=api-gateway-production-ad21.up.railway.app
```
⚠️ **IMPORTANTE:** Reemplaza con la URL que guardaste del api-gateway (paso 1)

**Networking:** ✅ Generate Domain → **📝 ESTA ES TU APP PRINCIPAL**
web-app-production-05a3.up.railway.app

#### 7️⃣ client-view (PÚBLICO ⭐)
**Settings:**
- Name: `client-view`
- Root Directory: `client-view`

**Variables:**
```
REACT_APP_API_URL=api-gateway-production-ad21.up.railway.app
```
⚠️ Usa la misma URL del api-gateway

**Networking:** ✅ Generate Domain

client-view-production.up.railway.app


## ✅ VERIFICACIÓN FINAL

Espera a que todos los servicios tengan ✅ verde (toma 2-5 minutos)

### Prueba 1: API
Abre en tu navegador:
```
https://TU-API-GATEWAY-URL.up.railway.app/health
```
Debes ver: `{"status":"ok","service":"api-gateway"}`

### Prueba 2: Login
Abre en tu navegador:
```
https://TU-WEB-APP-URL.up.railway.app
```
Login con:
- Email: `admin@logitrack.com`
- Password: `admin123`

Si entras al dashboard → **🎉 ¡FUNCIONÓ!**

---

## 🆘 Si Algo Falla

### Ver los logs:
1. Click en el servicio que falla
2. Click en **"Deployments"**
3. Click en el último deployment
4. Click en **"View Logs"**
5. Busca líneas con `ERROR`

### Errores comunes:

**"Cannot connect to database"**
→ Verifica que pusiste `DATABASE_URL=${{Postgres.DATABASE_URL}}`

**"CORS error" en el navegador**
→ Verifica que el `REACT_APP_API_URL` tenga la URL correcta del api-gateway

**"Build failed"**
→ Verifica que el Root Directory sea correcto (sin `/` al inicio)

---

## 📊 Progreso

Marca cada servicio cuando esté ✅:

- [ ✅] Postgres creado
- [✅ ] Redis creado
- [ ] Tablas inicializadas (init.sql)
- [ ✅] api-gateway deployado
- [✅ ] user-service deployado
- [✅ ] order-service deployado
- [✅ ] geolocation-service deployado
- [✅ ] ai-service deployado
- [✅ ] web-app deployado
- [✅ ] client-view deployado
- [ ] Login funciona
- [ ] Dashboard carga datos

---

**Tiempo total:** 20-25 minutos ⏱️

**¿Atascado?** Mándame:
1. Nombre del servicio que falla
2. Screenshot del error
3. Últimas 20 líneas de los logs
