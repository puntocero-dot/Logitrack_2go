# 🔌 LOGITRACK - Plan de Integración con APIs de Negocios

## 📋 Resumen Ejecutivo

Este documento detalla cómo Logitrack puede conectarse con sistemas de pedidos de clientes empresariales, permitiendo:

1. **Recibir pedidos automáticamente** desde el sistema del cliente
2. **Sincronizar estados** en tiempo real
3. **Enviar notificaciones** de entrega
4. **Funcionar en modo online u offline**

---

## 🏗️ Arquitectura de Integración

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SISTEMA DEL CLIENTE                                 │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ ERP/POS     │  │ E-commerce  │  │ CRM         │  │ App Móvil   │   │
│  │ (SAP, etc)  │  │ (Shopify)   │  │ (Salesforce)│  │ (Custom)    │   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘   │
│         │                │                │                │           │
│         └────────────────┴────────────────┴────────────────┘           │
│                                   │                                     │
│                    ┌──────────────▼──────────────┐                     │
│                    │      API/Base de Datos      │                     │
│                    │      del Cliente            │                     │
│                    └──────────────┬──────────────┘                     │
│                                   │                                     │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
            ▼                       ▼                       ▼
     ┌──────────────┐     ┌──────────────┐      ┌──────────────┐
     │  OPCIÓN 1    │     │  OPCIÓN 2    │      │  OPCIÓN 3    │
     │  API Pull    │     │  Webhook     │      │  DB Direct   │
     │  (Polling)   │     │  (Push)      │      │  (Query)     │
     └──────┬───────┘     └──────┬───────┘      └──────┬───────┘
            │                    │                     │
            └────────────────────┼─────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   INTEGRATION SERVICE   │
                    │      (Logitrack)        │
                    │                         │
                    │  • Transformador        │
                    │  • Validador            │
                    │  • Mapper de campos     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     ORDER SERVICE       │
                    │      (Logitrack)        │
                    └─────────────────────────┘
```

---

## 📡 Métodos de Integración

### Opción 1: API Polling (Nosotros consultamos)

**Caso de uso:** El cliente tiene una API REST que expone sus pedidos.

```
Logitrack ────(GET /api/orders)────► API del Cliente
                                            │
                                            ▼
                                    [Lista de pedidos]
                                            │
Logitrack ◄──────────────────────────────────┘
    │
    ▼
Crear pedidos en Logitrack
```

**Configuración en Logitrack:**

```json
{
  "name": "ClienteXYZ",
  "type": "api",
  "endpoint": "https://api.clientexyz.com/orders?status=pending",
  "auth_type": "bearer",
  "auth_value": "sk_live_xxxxx",
  "poll_interval_seconds": 300,
  "field_mapping": {
    "external_id": "order_number",
    "client_name": "customer.name",
    "address": "shipping_address.full",
    "latitude": "shipping_address.lat",
    "longitude": "shipping_address.lng"
  }
}
```

**Ventajas:** Simple, el cliente no necesita desarrollar nada.
**Desventajas:** No es tiempo real (delay de X minutos).

---

### Opción 2: Webhook (El cliente nos envía)

**Caso de uso:** El cliente puede configurar webhooks en su sistema.

```
Sistema del Cliente
    │
    │ (Nuevo pedido creado)
    │
    ▼
POST https://api.logitrack.app/webhook/clientexyz
    │
    ▼
Integration Service recibe
    │
    ▼
Crear pedido inmediatamente
```

**Endpoint para el cliente:**

```bash
POST https://api.logitrack.app/webhook/{nombre_integracion}

Headers:
  Content-Type: application/json
  X-Webhook-Secret: {secreto_compartido}

Body:
{
  "external_id": "ORD-12345",
  "client_name": "Juan Pérez",
  "client_phone": "+502 5555-1234",
  "address": "Zona 10, Guatemala Ciudad",
  "latitude": 14.5900,
  "longitude": -90.5200,
  "notes": "Entregar en recepción"
}
```

**Ventajas:** Tiempo real, inmediato.
**Desventajas:** El cliente debe desarrollar el envío.

---

### Opción 3: Conexión Directa a Base de Datos

**Caso de uso:** Instalación on-premise o VPN al cliente.

```
┌──────────────────┐           ┌──────────────────┐
│  Base de Datos   │◄─────────►│   Logitrack      │
│  del Cliente     │   VPN     │   On-Premise     │
│  (MySQL/Oracle)  │           │                  │
└──────────────────┘           └──────────────────┘
```

**Query de ejemplo:**

```sql
-- Tabla del cliente
SELECT 
  order_id as external_id,
  customer_name as client_name,
  delivery_address as address,
  COALESCE(lat, 0) as latitude,
  COALESCE(lng, 0) as longitude
FROM orders
WHERE status = 'ready_to_ship'
  AND logitrack_synced = FALSE
ORDER BY created_at
LIMIT 100;
```

**Ventajas:** Acceso directo, muy flexible.
**Desventajas:** Requiere VPN o instalación local.

---

## 🔄 Flujo de Sincronización Bidireccional

```
┌─────────────────────────────────────────────────────────────────────┐
│                      FLUJO COMPLETO                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. PEDIDO NUEVO                                                    │
│     Cliente → Logitrack                                             │
│     ────────────────────                                            │
│     • Webhook recibe pedido                                         │
│     • Validar datos mínimos                                         │
│     • Crear en order-service                                        │
│     • Retornar ID interno                                           │
│                                                                     │
│  2. ASIGNACIÓN                                                      │
│     Logitrack (interno)                                             │
│     ────────────────────                                            │
│     • IA asigna moto                                                │
│     • Supervisor confirma                                           │
│     • Status: assigned                                              │
│                                                                     │
│  3. ACTUALIZACIÓN DE ESTADO                                         │
│     Logitrack → Cliente                                             │
│     ────────────────────                                            │
│     • Webhook de callback                                           │
│     • "Estado: en_ruta"                                             │
│     • ETA estimado                                                  │
│                                                                     │
│  4. ENTREGA COMPLETADA                                              │
│     Logitrack → Cliente                                             │
│     ────────────────────                                            │
│     • "Estado: delivered"                                           │
│     • Firma/foto del cliente                                        │
│     • Timestamp de entrega                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Mapeo de Campos

### Campos Requeridos (Mínimos)

| Campo Logitrack | Descripción | Ejemplo |
|-----------------|-------------|---------|
| `external_id` | ID único del cliente | "ORD-12345" |
| `client_name` | Nombre del destinatario | "Juan Pérez" |
| `address` | Dirección de entrega | "Zona 10, Calle 5-20" |

### Campos Opcionales (Recomendados)

| Campo Logitrack | Descripción | Ejemplo |
|-----------------|-------------|---------|
| `latitude` | Coordenada GPS | 14.5900 |
| `longitude` | Coordenada GPS | -90.5200 |
| `client_phone` | Teléfono de contacto | "+502 5555-1234" |
| `client_email` | Email del cliente | "juan@email.com" |
| `notes` | Instrucciones especiales | "Tocar timbre 3 veces" |
| `priority` | Prioridad (1-5) | 1 |
| `scheduled_time` | Hora de entrega | "2024-01-15T14:00:00" |
| `branch` | Sucursal que procesa | "central" |

### Ejemplo de Transformación

```javascript
// Datos del cliente (Shopify)
{
  "id": 5678,
  "name": "#1234",
  "customer": {
    "first_name": "Juan",
    "last_name": "Pérez"
  },
  "shipping_address": {
    "address1": "5ta Avenida 10-20",
    "city": "Guatemala",
    "zip": "01010"
  }
}

// Transformado a Logitrack
{
  "external_id": "shopify-5678",
  "client_name": "Juan Pérez",
  "address": "5ta Avenida 10-20, Guatemala 01010",
  "branch": "central"
}
```

---

## 🔐 Seguridad

### Autenticación Soportada

| Método | Uso | Configuración |
|--------|-----|---------------|
| **API Key** | Header X-API-Key | `auth_type: "apikey"` |
| **Bearer Token** | Header Authorization | `auth_type: "bearer"` |
| **Basic Auth** | Usuario:Contraseña | `auth_type: "basic"` |
| **Webhook Secret** | Firma HMAC | Header X-Webhook-Signature |

### Verificación de Webhook

```go
// Verificar firma del webhook
func verifyWebhook(payload []byte, signature string, secret string) bool {
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(payload)
    expected := hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(signature), []byte(expected))
}
```

---

## 🚀 Implementación Paso a Paso

### 1. Configurar Integración (Admin)

```bash
POST /integrations
{
  "name": "cliente_abc",
  "type": "webhook",
  "auth_type": "apikey",
  "auth_value": "secreto_compartido",
  "is_active": true
}
```

### 2. Compartir Endpoint con Cliente

```
URL: https://api.logitrack.app/webhook/cliente_abc
Method: POST
Headers: 
  - Content-Type: application/json
  - X-API-Key: secreto_compartido
```

### 3. El Cliente Envía Pedidos

```bash
curl -X POST https://api.logitrack.app/webhook/cliente_abc \
  -H "Content-Type: application/json" \
  -H "X-API-Key: secreto_compartido" \
  -d '[
    {
      "external_id": "PED-001",
      "client_name": "María García",
      "address": "Zona 15, Guatemala",
      "latitude": 14.5800,
      "longitude": -90.4900
    }
  ]'
```

### 4. Respuesta

```json
{
  "total_received": 1,
  "created": 1,
  "updated": 0,
  "errors": 0
}
```

---

## 📱 Callback de Estados (Notificar al Cliente)

### Configuración (Próxima Implementación)

```json
{
  "name": "cliente_abc",
  "callback_url": "https://api.cliente.com/logitrack/updates",
  "callback_events": ["assigned", "in_route", "delivered", "cancelled"]
}
```

### Payload de Callback

```json
{
  "event": "delivered",
  "timestamp": "2024-01-15T15:30:00Z",
  "order": {
    "external_id": "PED-001",
    "internal_id": 1234,
    "status": "delivered",
    "delivered_at": "2024-01-15T15:28:00Z",
    "delivery_proof": {
      "signature_url": "https://...",
      "photo_url": "https://..."
    }
  }
}
```

---

## 🏠 Despliegue On-Premise

Para clientes que requieren instalación local:

### Requisitos Mínimos

| Componente | Especificación |
|------------|----------------|
| CPU | 4 cores |
| RAM | 8 GB |
| Disco | 50 GB SSD |
| OS | Linux (Ubuntu 22.04) o Windows Server 2019+ |
| Docker | 20.10+ |

### Script de Instalación

```bash
#!/bin/bash
# install-logitrack.sh

# 1. Clonar repositorio
git clone https://github.com/logitrack/logitrack-onpremise.git
cd logitrack-onpremise

# 2. Configurar variables
cp .env.example .env
nano .env  # Editar configuración

# 3. Levantar servicios
docker-compose up -d

# 4. Verificar
curl http://localhost:8085/health
```

### Conexión a BD del Cliente

```yaml
# docker-compose.override.yml
services:
  integration-service:
    environment:
      CLIENT_DB_HOST: 192.168.1.100
      CLIENT_DB_PORT: 3306
      CLIENT_DB_USER: logitrack_reader
      CLIENT_DB_PASSWORD: ${CLIENT_DB_PASSWORD}
      CLIENT_DB_NAME: erp_production
```

---

## 📊 Monitoreo de Integraciones

### Dashboard de Sync

```
┌─────────────────────────────────────────────────────────────────────┐
│  INTEGRACIONES ACTIVAS                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  cliente_abc          │ Webhook  │ ✅ Activo  │ Último: hace 5min  │
│  cliente_xyz          │ API Poll │ ✅ Activo  │ Último: hace 1min  │
│  shopify_store        │ Webhook  │ ⚠️ Error   │ Último: hace 2hrs  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  ÚLTIMAS SINCRONIZACIONES                                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  14:30  │ cliente_abc  │ +5 pedidos  │ 0 errores                   │
│  14:25  │ cliente_xyz  │ +12 pedidos │ 1 error (campo faltante)    │
│  14:20  │ cliente_abc  │ +3 pedidos  │ 0 errores                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ✅ Checklist de Integración

### Para el Cliente

- [ ] Seleccionar método de integración (webhook/api/db)
- [ ] Proporcionar endpoint o credenciales
- [ ] Definir mapeo de campos
- [ ] Configurar callback URL (opcional)
- [ ] Pruebas en ambiente de staging

### Para Logitrack

- [ ] Crear configuración de integración
- [ ] Configurar mapeo de campos
- [ ] Establecer frecuencia de sync (si es polling)
- [ ] Configurar alertas de errores
- [ ] Documentar proceso específico del cliente

---

## 📞 Soporte

Para nuevas integraciones, contactar:
- Email: integraciones@logitrack.app
- Documentación: https://docs.logitrack.app/integrations
