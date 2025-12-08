# 🚂 Instrucciones de Deploy en Railway - Logitrack

**Proyecto Railway ID:** `4e1f428d-6b1b-45e5-b18d-cda6f33b2008`  
**Repo GitHub:** `https://github.com/puntocero-dot/Logitrack_2go.git`

---

## ✅ LO QUE YA ESTÁ LISTO (hecho por IA)

- ✅ CORS actualizado para aceptar automáticamente dominios `*.railway.app`
- ✅ Archivos `railway.json` de configuración
- ✅ Variables de entorno documentadas
- ✅ Código optimizado para Railway

---

## 🎯 LO QUE DEBES HACER TÚ (Paso a Paso)

### PASO 1: Subir los cambios a GitHub

En tu terminal local (PowerShell):

```powershell
cd C:\Users\DELL\Desktop\Proyectos\Logitrack
git add .
git commit -m "Configure Railway deployment with dynamic CORS"
git push origin main
```

**¿Por qué?** Railway leerá el código desde GitHub. Necesitamos que tenga los últimos cambios.

---

### PASO 2: Crear Bases de Datos en Railway

1. Ve a tu proyecto: https://railway.app/project/4e1f428d-6b1b-45e5-b18d-cda6f33b2008

2. **Agregar PostgreSQL:**
   - Click en **"+ New"** (botón morado arriba derecha)
   - Selecciona **"Database"** → **"Add PostgreSQL"**
   - Espera a que se cree (toma ~30 segundos)
   - ✅ Listo, Railway ya tiene `DATABASE_URL` configurado

3. **Agregar Redis:**
   - Click en **"+ New"** otra vez
   - Selecciona **"Database"** → **"Add Redis"**
   - Espera a que se cree
   - ✅ Listo, Railway ya tiene `REDIS_URL` configurado

4. **Inicializar la Base de Datos:**
   - Click en el servicio **"Postgres"** que acabas de crear
   - Ve a la pestaña **"Data"**
   - Click en **"Query"**
   - Abre el archivo `init.sql` de tu proyecto local
   - Copia TODO el contenido
   - Pégalo en el Query editor de Railway
   - Click en **"Run Query"**
   - ✅ Ahora tienes las tablas creadas

---

### PASO 3: Crear Servicios Backend (5 servicios)

Para cada servicio, harás lo mismo. Te lo explico una vez y lo repites 5 veces:

#### 3.1 API Gateway (PRIMERO - Este es público)

1. Click **"+ New"** → **"GitHub Repo"**
2. Selecciona `puntocero-dot/Logitrack_2go`
3. Railway creará un servicio. Click en él
4. Click en **"Settings"** (⚙️ arriba derecha)
5. Cambia estos valores:
   - **Name:** `api-gateway`
   - **Root Directory:** `api-gateway` (sin `/` al inicio)
   - **Watch Paths:** `api-gateway/**`
6. Click en **"Variables"** (pestaña al lado de Settings)
7. Click en **"+ New Variable"** y agrega estas (una por una):

```
PORT=8080
REDIS_URL=${{Redis.REDIS_URL}}
USER_SERVICE_URL=http://user-service.railway.internal:8080
ORDER_SERVICE_URL=http://order-service.railway.internal:8080
GEO_SERVICE_URL=http://geolocation-service.railway.internal:8080
AI_SERVICE_URL=http://ai-service.railway.internal:8080
```

8. Ve a **"Settings"** → **"Networking"**
9. En **"Public Networking"**, click en **"Generate Domain"**
10. ✅ Railway te dará una URL tipo: `api-gateway-production-xxxx.up.railway.app`
11. **📝 COPIA ESTA URL** (la necesitarás después)

#### 3.2 User Service

1. Click **"+ New"** → **"GitHub Repo"** → `Logitrack_2go`
2. Settings:
   - **Name:** `user-service`
   - **Root Directory:** `user-service`
   - **Watch Paths:** `user-service/**`
3. Variables:
```
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=logitrack_jwt_secret_super_seguro_2024_cambiar_en_produccion
```
4. **NO** generes dominio público (este es interno)

#### 3.3 Order Service

1. Click **"+ New"** → **"GitHub Repo"** → `Logitrack_2go`
2. Settings:
   - **Name:** `order-service`
   - **Root Directory:** `order-service`
   - **Watch Paths:** `order-service/**`
3. Variables:
```
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}
```
4. **NO** generes dominio público

#### 3.4 Geolocation Service

1. Click **"+ New"** → **"GitHub Repo"** → `Logitrack_2go`
2. Settings:
   - **Name:** `geolocation-service`
   - **Root Directory:** `geolocation-service`
   - **Watch Paths:** `geolocation-service/**`
3. Variables:
```
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}
```
4. **NO** generes dominio público

#### 3.5 AI Service

1. Click **"+ New"** → **"GitHub Repo"** → `Logitrack_2go`
2. Settings:
   - **Name:** `ai-service`
   - **Root Directory:** `ai-service`
   - **Watch Paths:** `ai-service/**`
3. Variables:
```
PORT=8080
```
4. **NO** generes dominio público

---

### PASO 4: Crear Frontend Web App (Público)

1. Click **"+ New"** → **"GitHub Repo"** → `Logitrack_2go`
2. Settings:
   - **Name:** `web-app`
   - **Root Directory:** `web-app`
   - **Watch Paths:** `web-app/**`
3. Variables:
```
REACT_APP_API_URL=https://api-gateway-production-xxxx.up.railway.app
```
   ⚠️ **IMPORTANTE:** Reemplaza `xxxx` con la URL que copiaste del API Gateway en el paso 3.1

4. Ve a **"Settings"** → **"Networking"** → **"Generate Domain"**
5. ✅ Railway te dará una URL tipo: `web-app-production-yyyy.up.railway.app`
6. **📝 ESTA ES TU APP PRINCIPAL** - Guarda esta URL

---

### PASO 5: Crear Client View (Público)

1. Click **"+ New"** → **"GitHub Repo"** → `Logitrack_2go`
2. Settings:
   - **Name:** `client-view`
   - **Root Directory:** `client-view`
   - **Watch Paths:** `client-view/**`
3. Variables:
```
REACT_APP_API_URL=https://api-gateway-production-xxxx.up.railway.app
```
   ⚠️ Usa la misma URL del API Gateway

4. Ve a **"Settings"** → **"Networking"** → **"Generate Domain"**
5. ✅ Railway te dará otra URL para la vista de clientes

---

### PASO 6: Verificar que Todo Funciona

1. **Espera a que todos los servicios terminen de deployar** (verás ✅ verde en cada uno)

2. **Prueba el API Gateway:**
   - Abre en tu navegador: `https://api-gateway-production-xxxx.up.railway.app/health`
   - Debes ver: `{"status":"ok","service":"api-gateway"}`

3. **Prueba el login:**
   - Abre: `https://web-app-production-yyyy.up.railway.app`
   - Haz login con:
     - Email: `admin@logitrack.com`
     - Password: `admin123`
   - ✅ Si entras al dashboard, **¡TODO FUNCIONA!** 🎉

---

## 🆘 Si Algo Sale Mal

### Ver los logs:
1. Click en el servicio que falla
2. Ve a **"Deployments"**
3. Click en el último deployment
4. Ve a **"View Logs"**
5. Busca líneas con `ERROR` o `FATAL`

### Errores comunes:

**"Cannot connect to database"**
- Verifica que el servicio tenga la variable `DATABASE_URL=${{Postgres.DATABASE_URL}}`

**"CORS error" en el navegador**
- Verifica que el `REACT_APP_API_URL` en web-app tenga la URL correcta del API Gateway

**"Service not found"**
- Verifica que los nombres de los servicios sean exactos: `user-service`, `order-service`, etc.

---

## 📊 Resumen de URLs

Al final tendrás:

- 🌐 **Web App (Principal):** `https://web-app-production-yyyy.up.railway.app`
- 🌐 **Client View:** `https://client-view-production-zzzz.up.railway.app`
- 🔌 **API Gateway:** `https://api-gateway-production-xxxx.up.railway.app`
- 🔒 **Servicios internos:** No tienen URL pública (solo comunicación interna)

---

## 💰 Costos Estimados

Railway te da **$5 USD gratis al mes**.

Costos aproximados de Logitrack:
- Postgres: ~$1/mes
- Redis: ~$0.50/mes
- 7 servicios: ~$3-4/mes

**Total:** ~$5/mes (cubierto por el plan gratuito) 🎉

---

## ✅ Checklist Final

Marca cada paso cuando lo completes:

- [ ] Código subido a GitHub
- [ ] PostgreSQL creado en Railway
- [ ] Redis creado en Railway
- [ ] Base de datos inicializada con init.sql
- [ ] api-gateway deployado (público)
- [ ] user-service deployado (privado)
- [ ] order-service deployado (privado)
- [ ] geolocation-service deployado (privado)
- [ ] ai-service deployado (privado)
- [ ] web-app deployado (público)
- [ ] client-view deployado (público)
- [ ] Login funciona en web-app
- [ ] Dashboards cargan datos

---

**¿Necesitas ayuda?** Mándame un mensaje con:
1. El nombre del servicio que falla
2. Los logs (copia/pega las últimas 20 líneas)
3. Screenshot del error si es en el navegador
