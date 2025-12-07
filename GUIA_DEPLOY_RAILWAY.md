# 🚀 Guía de Despliegue en Railway (Sin Vercel)

Esta guía te permite desplegar **TODO** el sistema (Frontend, Backend, IA, Base de Datos) en una sola plataforma: **Railway**.

## Requisitos Previos

1.  Una cuenta en [GitHub](https://github.com/) (Gratis).
2.  Una cuenta en [Railway.app](https://railway.app/) (Gratis para empezar, luego ~$5/mes).
3.  Tener Git instalado (¡Ya lo tienes!).

---

## PASO 1: Subir tu Código a GitHub
Como "Caja Fuerte" del código, GitHub es esencial. Railway leerá tu código desde aquí.

1.  Ve a **[github.com/new](https://github.com/new)**.
2.  Crea un repositorio llamado `logitrack-monorepo`.
    *   Mantenlo **Público** (o Privado si tienes cuenta Pro).
    *   **NO** agregues README ni .gitignore (ya los tenemos).
3.  Copia la URL del repositorio (ej. `https://github.com/TU_USUARIO/logitrack-monorepo.git`).
4.  En tu terminal local, ejecuta:
    ```powershell
    git remote add origin PEGA_TU_URL_AQUI
    git push -u origin master
    ```

---

## PASO 2: Configurar Railway

1.  Ve a **[Railway Dashboard](https://railway.app/dashboard)** -> **New Project**.
2.  Selecciona **"Deploy from GitHub repo"**.
3.  Selecciona `logitrack-monorepo`.
4.  **¡IMPORTANTE! Configurar Monorepo:**
    Railway intentará detectar el proyecto. Como tenemos muchos servicios, debemos añadirlos uno por uno dentro del mismo proyecto de Railway.

### A. Base de Datos (Postgres + Redis)
1.  En tu proyecto Railway, clic derecho o "New" -> **Database** -> **PostgreSQL**.
2.  Repite para **Redis**.
3.  Railway te dará variables de conexión (`DATABASE_URL`, `REDIS_URL`).

### B. Servicios (Backend)
Para cada microservicio (`user-service`, `order-service`, `api-gateway`...), haz lo siguiente en Railway:
1.  Clic en **+ New** -> **GitHub Repo** -> `logitrack-monorepo`.
2.  Entra a la configuración del servicio creado -> **Settings**.
3.  Busca **Root Directory** y pon la carpeta del servicio (ej. `/user-service`).
    *   Esto le dice a Railway: "Solo mira esta carpeta y usa su Dockerfile".
4.  Ve a **Variables** y agrega las necesarias (ver tabla abajo).

### C. Frontend (Web App)
1.  Añade otro servicio desde el mismo repo.
2.  **Root Directory:** `/web-app`.
3.  Railway detectará el `Dockerfile`, construirá la app con Nginx y te dará una URL pública (ej. `web-app-production.railway.app`).

---

## Variables de Entorno (Tabla de Referencia)

| Servicio | Variable | Valor (Ejemplo) |
| :--- | :--- | :--- |
| **user-service** | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway autocompleta esto) |
| | `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| | `JWT_SECRET` | `inventa-algo-seguro` |
| **api-gateway** | `USER_SERVICE_URL` | `http://${{user-service.RAILWAY_PRIVATE_DOMAIN}}:8080` |
| | `ORDER_SERVICE_URL` | `http://${{order-service.RAILWAY_PRIVATE_DOMAIN}}:8080` |
| **web-app** | `REACT_APP_GATEWAY_URL` | `https://api-gateway-production.railway.app` (URL pública del Gateway) |

> **Nota:** Railway permite comunicación interna privada. Usa esa para conectar servicios entre sí, y la pública solo para el Frontend -> Gateway.

---

## PASO 3: Dominio Personalizado
1.  En el servicio `web-app` en Railway/Settings -> **Public Networking**.
2.  Clic en **Custom Domain**.
3.  Escribe `app.tudominio.com` (si compraste uno) o usa el dominio gratuito que te regalan.

¡Listo! Todo tu ecosistema vive ahora en la nube.
