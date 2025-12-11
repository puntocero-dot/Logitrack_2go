# 🏗️ LOGITRACK - Arquitectura del Sistema

## 📊 Visión General

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           LOGITRACK PLATFORM                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │  Web App    │  │ Client View │  │ Coord App   │  │ Driver App  │   │
│  │  (React)    │  │  (React)    │  │  (React)    │  │  (React)    │   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘   │
│         │                │                │                │           │
│         └────────────────┴────────────────┴────────────────┘           │
│                                   │                                     │
│                          ┌────────▼────────┐                           │
│                          │   API Gateway   │ ← Rate Limiting, CORS     │
│                          │   (Go + Gin)    │   Auth, Logging           │
│                          └────────┬────────┘                           │
│                                   │                                     │
│         ┌─────────────────────────┼─────────────────────────┐          │
│         │                         │                         │          │
│  ┌──────▼──────┐  ┌───────────────▼───────────────┐  ┌──────▼──────┐  │
│  │ User Service│  │       Order Service           │  │  AI Service │  │
│  │   (Go)      │  │         (Go)                  │  │  (Python)   │  │
│  │             │  │  • Orders  • Motos            │  │             │  │
│  │ • Auth      │  │  • Branches • Routes          │  │ • Optimize  │  │
│  │ • Users     │  │  • KPIs    • Optimization     │  │ • ETA Calc  │  │
│  │ • Roles     │  │                               │  │             │  │
│  └──────┬──────┘  └───────────────┬───────────────┘  └─────────────┘  │
│         │                         │                                     │
│         └─────────────────────────┴─────────────────────────┐          │
│                                   │                         │          │
│                          ┌────────▼────────┐  ┌─────────────▼────────┐ │
│                          │   PostgreSQL    │  │       Redis          │ │
│                          │   (Persistence) │  │   (Cache/Sessions)   │ │
│                          └─────────────────┘  └──────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 👥 Jerarquía de Roles

```
                    ┌─────────────────────┐
                    │   ADMIN (Tú)        │ ← Acceso total, configuración
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Gerente Logística   │ ← Overview gerencial, KPIs globales
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
┌─────────▼─────────┐ ┌────────▼────────┐ ┌────────▼────────┐
│  Coordinador      │ │  Supervisor     │ │ Analista Rutas  │
│  (Visitas/Audit)  │ │  (Operaciones)  │ │ (Reportes)      │
└─────────┬─────────┘ └────────┬────────┘ └─────────────────┘
          │                    │
          │           ┌────────▼────────┐
          │           │     Drivers     │
          │           │  (Motoristas)   │
          │           └─────────────────┘
          │
┌─────────▼─────────┐
│   Sucursales      │
│   (Branches)      │
└───────────────────┘
```

---

## 🔗 Flujo de Datos Actual

### 1. Creación de Pedido
```
Cliente → Sistema Externo → [FUTURO: API Integration] → Order Service → PostgreSQL
                                                              ↓
                                                        Status: pending
```

### 2. Asignación de Pedidos (IA)
```
Supervisor → "Optimizar" → API Gateway → Order Service → AI Service
                                              ↓
                                        Obtiene motos disponibles
                                        Obtiene pedidos pendientes
                                              ↓
                                        AI calcula Round-Robin
                                              ↓
                                        Sugerencias de asignación
```

### 3. Ejecución de Entrega
```
Driver → Inicia turno → GPS Tracking → Recoge pedido → En ruta → Entregado
              ↓              ↓              ↓            ↓          ↓
        shift: ACTIVE   route_points   status:assigned  in_route  delivered
```

---

## 📁 Estructura de Microservicios

```
Logitrack/
├── api-gateway/          # Puerta de entrada (Go)
│   ├── main.go           # Rutas y proxy
│   └── middleware/       # Rate limit, auth, CORS
│
├── user-service/         # Gestión de usuarios (Go)
│   ├── handlers/         # Login, CRUD usuarios
│   └── models/           # User, roles
│
├── order-service/        # Core del negocio (Go)
│   ├── handlers/
│   │   ├── order.go      # CRUD pedidos
│   │   ├── moto.go       # CRUD motos
│   │   ├── optimization.go # Integración IA
│   │   └── kpis.go       # Métricas
│   └── models/           # Order, Moto, Branch, Route
│
├── ai-service/           # Inteligencia (Python)
│   └── app.py            # Algoritmo Round-Robin
│
├── geolocation-service/  # GPS Tracking (Go)
│   └── handlers/         # Ubicaciones en tiempo real
│
├── web-app/              # Frontend principal (React)
└── client-view/          # Vista cliente (React)
```

---

## 🚂 Railway: Problema del Monorepo

### ¿Por qué tienes que actualizar servicio por servicio?

Railway detecta cambios en el repositorio completo, pero cada "Service" en Railway está configurado con su propio **Root Directory**. Si no hay cambios en ESA carpeta específica, Railway no reconstruye ese servicio.

### Solución: railway.json (Archivo de Configuración)

Crear un archivo `railway.json` en la raíz que configure todos los servicios:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Pero la mejor solución es:

### Opción 1: GitHub Actions (Automatización)
Crear un workflow que detecte qué carpetas cambiaron y dispare rebuilds solo de esos servicios.

### Opción 2: Railway CLI
```bash
# Instalar CLI
npm install -g @railway/cli

# Login
railway login

# Forzar redeploy de un servicio
railway up --service api-gateway
railway up --service order-service
```

### Opción 3: Script de Deploy Unificado
Lo creo más adelante con todas las variables de entorno.

---

## 🔌 Integración con Sistemas Externos

### Escenario: Cliente tiene su propio sistema de pedidos

```
┌─────────────────────┐         ┌─────────────────────────────────┐
│  Sistema del        │         │          LOGITRACK              │
│  Cliente            │         │                                 │
│  ┌───────────────┐  │         │  ┌─────────────────────────┐   │
│  │ Base de Datos │──┼────────▶│  │  Integration Service    │   │
│  │ (MySQL/Oracle)│  │ Opción 1│  │  (Nuevo microservicio)  │   │
│  └───────────────┘  │         │  │                         │   │
│                     │         │  │  • DB Connector         │   │
│  ┌───────────────┐  │         │  │  • API Poller           │   │
│  │ API REST      │──┼────────▶│  │  • Webhook Receiver     │   │
│  │               │  │ Opción 2│  │  • Data Transformer     │   │
│  └───────────────┘  │         │  └───────────┬─────────────┘   │
│                     │         │              │                  │
│  ┌───────────────┐  │         │              ▼                  │
│  │ Webhook Push  │──┼────────▶│  ┌─────────────────────────┐   │
│  │               │  │ Opción 3│  │    Order Service        │   │
│  └───────────────┘  │         │  └─────────────────────────┘   │
└─────────────────────┘         └─────────────────────────────────┘
```

### Opciones de Integración:

| Método | Descripción | Complejidad |
|--------|-------------|-------------|
| **API Polling** | Consultamos su API cada X minutos | Baja |
| **Webhook** | Ellos nos envían pedidos cuando se crean | Media |
| **DB Direct** | Conectamos directamente a su BD | Alta (requiere VPN) |
| **Archivo/FTP** | Cargan CSV que procesamos | Baja |
| **Cola de Mensajes** | RabbitMQ/Kafka entre sistemas | Alta |

---

## 🖥️ Despliegue On-Premise (Local)

### ¿Por qué un cliente querría esto?
1. **Seguridad**: Datos sensibles no salen de sus instalaciones
2. **Latencia**: Sin dependencia de internet
3. **Regulación**: Algunas industrias lo exigen
4. **Costo**: Sin costos de nube recurrentes

### Nuestra Preparación Actual:

✅ **Docker Compose**: Ya funciona 100% local
✅ **Variables de Entorno**: Configuración externa (.env)
✅ **PostgreSQL/Redis**: Incluidos en el stack

### Lo que necesitaríamos agregar:

| Componente | Para On-Premise |
|------------|-----------------|
| **Instalador** | Script .bat/.sh de instalación |
| **Certificados** | HTTPS con Let's Encrypt o certificados del cliente |
| **Backup** | Cron jobs para respaldos automáticos |
| **Monitoreo** | Prometheus + Grafana incluidos |
| **Actualización** | Mecanismo para aplicar updates |

---

## 📋 PRÓXIMOS DESARROLLOS

### 1. Coordinador App (NUEVO)
```
Funcionalidades:
├── Check-in en sucursal (GPS + hora)
├── Checklist de auditoría configurable
├── Toma de fotos con geolocalización
├── Tiempo en sucursal (duración)
├── Reportes de hallazgos
└── Historial de visitas
```

### 2. Gerente Dashboard (NUEVO)
```
Métricas Gerenciales:
├── KPIs globales por sucursal
├── Comparativo de rendimiento
├── Alertas de SLA
├── Mapa de calor de entregas
└── Reportes exportables (PDF/Excel)
```

### 3. Analista de Rutas (NUEVO)
```
Herramientas:
├── Alertas de sucursal sin motos
├── Predicción de demanda
├── Balanceo de carga sugerido
└── Dashboard de eficiencia
```

### 4. Integration Service (NUEVO)
```
Conectores:
├── API REST genérico
├── Base de datos (MySQL, Oracle, PostgreSQL)
├── Webhooks (recibir/enviar)
├── Archivos (CSV, Excel)
└── Cola de mensajes (RabbitMQ)
```

---

## 🗺️ ROADMAP PROPUESTO

### Fase 1: Estabilización (1-2 semanas)
- [ ] Resolver tema Railway (GitHub Actions)
- [ ] Pruebas completas del flujo actual
- [ ] Documentación de API

### Fase 2: Nuevos Roles (2-3 semanas)
- [ ] Modelo de datos para Coordinadores
- [ ] App de Coordinadores (check-in, checklist)
- [ ] Dashboard Gerencial
- [ ] Rol Analista de Rutas

### Fase 3: Integraciones (2-3 semanas)
- [ ] Integration Service base
- [ ] Conector API REST
- [ ] Conector Database
- [ ] Webhook receiver

### Fase 4: Enterprise Ready (2-3 semanas)
- [ ] Instalador On-Premise
- [ ] Monitoreo (Prometheus/Grafana)
- [ ] Backup automatizado
- [ ] Multi-tenant support

---

## 📞 ¿SIGUIENTE PASO?

1. **Railway Fix**: Crear GitHub Action para auto-deploy
2. **Coordinador App**: Empezar el nuevo módulo
3. **Integration Service**: Preparar para conectar con cliente
4. **Otro**: Especificar qué necesitas primero
