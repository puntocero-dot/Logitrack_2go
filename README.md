# Logitrack - Aplicación de Logística de Domicilios

## Descripción
Logitrack es una plataforma de logística para entregas eficientes, con rutas optimizadas por IA, monitoreo en tiempo real y dashboards gerenciales.

## Arquitectura
- **Polyrepo**: Cada servicio es un repositorio separado.
- **Servicios**:
  - api-gateway: Punto de entrada central (puerto 8085).
  - user-service: Gestión de usuarios y autenticación (puerto 8086).
  - order-service: Manejo de pedidos (puerto 8087).
  - geolocation-service: GPS y mapas (puerto 8088).
  - ai-service: Optimización de rutas y predicciones (puerto 5001) (Python).
  - web-app: Dashboards para supervisores/admin/operadores (puerto 3001) (React).
  - mobile-app: App para conductores (Flutter).
  - client-view: Seguimiento público (puerto 3002) (React).
  - shared: Utilidades comunes y esquemas de BD.

## Tecnologías
- Backend: Go (microservicios).
- BD: PostgreSQL (puerto 5433).
- Frontend: React, Flutter.
- IA: Python con OR-Tools, scikit-learn.
- Infra: Docker, Kubernetes en AWS.

## Inicio Rápido
1. Instala Docker y Docker Compose.
2. Ejecuta `docker-compose up --build` desde la raíz.
3. Accede a los servicios en los puertos indicados.

## Desarrollo
- Cada servicio tiene su propio Dockerfile.
- Usa Git en cada carpeta para commits independientes.
