# 🚀 LOGITRACK - Estado del Proyecto

**Última actualización:** 2025-12-12

---

## 📁 ESTRUCTURA DEL PROYECTO

### Microservicios Backend (Go)

| Carpeta | Puerto | Descripción |
|---------|--------|-------------|
| `api-gateway/` | 8080 | Proxy central, CORS, rate limiting, routing |
| `user-service/` | 8080 | Auth (JWT), usuarios, roles (superadmin, admin, coordinator, driver, etc.) |
| `order-service/` | 8080 | Pedidos, motos, sucursales, KPIs, visitas, checklist |
| `geolocation-service/` | 8080 | GPS, tracking, ETAs, geofencing |
| `integration-service/` | 8084 | Webhooks, integraciones externas (Shopify, WooCommerce) |

### Frontend (React)

| Carpeta | URL | Descripción |
|---------|-----|-------------|
| `web-app/` | Railway | Dashboard admin/supervisor/coordinador/gerente |
| `client-view/` | Railway | Portal de tracking para clientes |

### Servicios Python
| Carpeta | Puerto | Descripción |
|---------|--------|-------------|
| `ai-service/` | 5000 | Optimización de rutas con IA |

---

## 📊 BASE DE DATOS (PostgreSQL en Railway)

### Tablas principales:
- `users` - Usuarios del sistema
- `motos` - Flota de motos
- `orders` - Pedidos/entregas  
- `branches` - Sucursales
- `coordinator_visits` - Check-in/out de coordinadores
- `checklist_templates` - Templates de revisión de motos (12 items)
- `checklist_responses` - Respuestas del checklist
- `moto_transfers` - Transferencias de motos entre sucursales

---

## ✅ FUNCIONALIDADES IMPLEMENTADAS

### Autenticación
- [x] Login con JWT
- [x] Roles: superadmin, admin, manager, coordinator, supervisor, analyst, driver
- [x] Rutas protegidas por rol

### Dashboard Supervisor
- [x] Crear pedidos
- [x] Asignar motos a pedidos
- [x] Cambiar estados
- [x] KPIs en tiempo real

### Dashboard Gerencial  
- [x] KPIs consolidados por sucursal
- [x] Alertas automáticas
- [x] **Reporte de visitas de coordinadores** ← NUEVO
- [x] Tiempo promedio por sucursal

### Dashboard Coordinador
- [x] Check-in/check-out con GPS
- [x] Checklist de revisión de motos (12 items)
- [x] Historial de visitas

### Gestión de Sucursales
- [x] CRUD completo
- [x] **Geocoding con Nominatim (gratis)** ← NUEVO
- [x] Mapa interactivo con click
- [x] Autocompletado de direcciones

### Otras funcionalidades
- [x] Mapa en vivo con tracking
- [x] Analytics Dashboard
- [x] Transferencias de motos
- [x] Portal de tracking para clientes (client-view)

---

## 🔧 ARCHIVOS DE CONFIGURACIÓN

| Archivo | Propósito |
|---------|-----------|
| `README.md` | Descripción general del proyecto |
| `ARQUITECTURA_SISTEMA.md` | Diagrama y explicación de microservicios |
| `GUIA_DEPLOY_RAILWAY.md` | Cómo hacer deploy en Railway |
| `GUIA_PRUEBAS_IA.md` | Cómo probar el servicio de IA |
| `PLAN_INTEGRACIONES.md` | Plan de integraciones futuras |
| `docker-compose.yml` | Para desarrollo local |
| `railway.json` | Configuración de Railway |
| `init.sql` | Script inicial de BD |
| `seed-checklist.js` | Script para poblar checklist templates |

---

## 🌐 URLs DE PRODUCCIÓN (Railway)

| Servicio | URL |
|----------|-----|
| API Gateway | https://api-gateway-production-ad21.up.railway.app |
| Web App | https://web-app-production-05a3.up.railway.app |
| Client View | https://client-view-production.up.railway.app |

---

## 👤 CREDENCIALES DE PRUEBA

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| superadmin@logitrack.com | superadmin123 | superadmin |
| admin@logitrack.com | admin123 | admin |
| coordinator@logitrack.com | coordinator123 | coordinator |

---

## ⚠️ PROBLEMAS CONOCIDOS/RESUELTOS

| Problema | Estado | Solución |
|----------|--------|----------|
| Mapbox 401 geocoding | ✅ Resuelto | Cambiado a Nominatim |
| /transfers/history 500 | ✅ Resuelto | Tabla moto_transfers creada |
| Motos/Usuarios redirige | ✅ Resuelto | RoleRoute acepta superadmin |
| Checklist vacío | ✅ Resuelto | seed-checklist.js ejecutado |

---

## 📋 PENDIENTES FUTUROS

1. **Notificaciones push** para drivers
2. **Integración WhatsApp** para clientes
3. **Reportes PDF** exportables
4. **App móvil** para drivers (React Native)
5. **Dashboard Analytics** más avanzado
6. **Sistema de calificaciones** de entregas

---

## 🛠️ SCRIPTS ÚTILES

```bash
# Poblar checklist templates
node seed-checklist.js

# Desarrollo local
docker-compose up -d

# Deploy (automático con push a master)
git push origin master
```

---

*Este documento sirve como memoria del proyecto para continuar en futuras sesiones.*
