# Guía Completa de Variables de Entorno — POS Restaurante Guatemala

Este documento concentra **todas las variables de entorno** utilizadas por el sistema en sus tres capas:
1. **Raíz (`/.env`)** — Docker Compose (PostgreSQL y despliegue `--profile full`).
2. **Backend (`backend/.env`)** — API Node.js (JavaScript) + Express + Sequelize + PostgreSQL.
3. **Frontend (`frontend/.env`)** — Aplicación React + TypeScript + Vite.

> **Seguridad:** Los archivos `.env` están ignorados por Git (`.gitignore`). Nunca subas contraseñas ni claves reales al repositorio; usa estos bloques como plantilla.

---

## 1. Raíz del Repositorio (`/.env`) — Docker Compose

Plantilla lista para copiar en `.env`:

```dotenv
# Credenciales obligatorias de PostgreSQL (docker-compose.yml falla si faltan)
POSTGRES_USER=pos_admin
POSTGRES_PASSWORD=cambia-esta-contrasena-segura
POSTGRES_DB=pos_restaurante_gt
POSTGRES_PORT=5432
DEFAULT_TIMEZONE=America/Guatemala

# Variables adicionales para levantar todo el stack:
# docker compose --profile full up -d --build
APP_DB_USER=pos_app
APP_DB_PASSWORD=cambia-esta-clave-de-16-o-mas-caracteres-sin-simbolos-url
BACKEND_PORT=4000
FRONTEND_PORT=8080
CORS_ORIGIN=http://localhost:8080
# En producción DEBE tener >= 32 caracteres aleatorios (sin palabras de ejemplo)
JWT_SECRET=reemplaza-con-una-clave-aleatoria-de-32-o-mas-caracteres
TRUST_PROXY=1
```

| Variable | Obligatoria | Valor por defecto | Descripción |
|---|:---:|---|---|
| `POSTGRES_USER` | Sí | — | Usuario dueño del esquema PostgreSQL (usado solo por `migrator`) |
| `POSTGRES_PASSWORD` | Sí | — | Contraseña de PostgreSQL para el contenedor |
| `POSTGRES_DB` | Sí | — | Nombre de la base de datos inicial |
| `POSTGRES_PORT` | No | `5432` | Puerto expuesto en `127.0.0.1` para PostgreSQL local |
| `DEFAULT_TIMEZONE` | No | `America/Guatemala` | Zona horaria del contenedor PostgreSQL y backend |
| `APP_DB_USER` | Sí | — | Usuario de BD con privilegio mínimo (`pos_app_rol`) usado por la API |
| `APP_DB_PASSWORD` | Sí | — | Contraseña de `APP_DB_USER` (`16+` chars sin `@ : / ? # %`) |
| `FRONTEND_PORT` | No | `8080` | Puerto expuesto en el host para Nginx (`--profile full`) |
| `CORS_ORIGIN` | No | `http://localhost:8080` | Origen permitido por CORS en modo Docker completo |
| `JWT_SECRET` | Sí | — | Secreto JWT (`>= 32` chars aleatorios sin palabras de ejemplo) |
| `TRUST_PROXY` | No | `1` | Saltos de proxy confiables (`1` con Nginx; `2` si hay otro proxy HTTPS delante) |

---

## 2. Backend (`backend/.env`)

Plantilla lista para copiar en `backend/.env`:

```dotenv
# ==================== SERVIDOR Y RED ====================
NODE_ENV=development
PORT=4000
API_PREFIX=/api/v1
CORS_ORIGIN=http://localhost:5173
# Usar "1" o subred solo detrás de proxy inverso confiable (Nginx/Cloudflare/ALB)
TRUST_PROXY=false
JSON_BODY_LIMIT=2mb
REQUEST_TIMEOUT_MS=15000

# ==================== BASE DE DATOS (SEQUELIZE + POSTGRESQL) ====================
DATABASE_URL="postgresql://USUARIO:CONTRASENA@localhost:5432/pos_restaurante_gt"
# Usada automáticamente cuando NODE_ENV=test (obligatoria y distinta de DATABASE_URL)
DATABASE_URL_TEST="postgresql://USUARIO:CONTRASENA@localhost:5432/pos_restaurante_test"
# Conexión del dueño del esquema usada exclusivamente por migraciones
DATABASE_MIGRATION_URL="postgresql://ADMIN_BD:CONTRASENA@localhost:5432/pos_restaurante_gt"
DATABASE_MIGRATION_URL_TEST="postgresql://ADMIN_BD:CONTRASENA@localhost:5432/pos_restaurante_test"
MIGRATE_ON_START=false
DB_POOL_MAX=10
DB_POOL_MIN=1
DB_POOL_ACQUIRE_MS=8000
DB_POOL_IDLE_MS=10000
DB_LOCK_TIMEOUT_MS=3000
DB_STATEMENT_TIMEOUT_MS=10000
# SSL para PostgreSQL gestionado en la nube (auto | true | false)
DB_SSL=auto
DB_SSL_REJECT_UNAUTHORIZED=false

# ==================== SEGURIDAD, JWT, COOKIES httpOnly Y CSRF ====================
# En NODE_ENV=production debe tener >= 32 caracteres aleatorios sin palabras de ejemplo
JWT_SECRET="reemplaza-por-una-clave-aleatoria-segura-de-32-caracteres-minimo"
JWT_EXPIRES_IN="12h"
BCRYPT_SALT_ROUNDS=10
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=10
AUTH_RATE_LIMIT_IP_MAX=30
AUTH_LOCKOUT_MAX_ATTEMPTS=5
AUTH_LOCKOUT_MINUTES=15
PASSWORD_MIN_LENGTH=10
LOG_LEVEL=info
PERMISOS_CACHE_TTL_MS=30000
ADMIN_ROLE_CODE=ADMIN
AUTH_COOKIE_NAME=pos_session
AUTH_COOKIE_SAMESITE=lax
# En producción se fuerza Secure=true automáticamente
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_MAX_AGE_MS=43200000
CSRF_PROTECTION_ENABLED=true

# ==================== SEED DE DATOS DE PRUEBA ====================
ALLOW_SEED_IN_PRODUCTION=false
SEED_ADMIN_PASSWORD=
SEED_CAJERO_PASSWORD=
SEED_MESERO_PASSWORD=

# ==================== PARÁMETROS FISCALES, UNIDADES Y PAGINACIÓN ====================
IVA_RATE=0.12
CURRENCY_CODE=GTQ
CURRENCY_SYMBOL=Q
DEFAULT_TIMEZONE=America/Guatemala
UNIT_OZ_PER_LB=16
FACTURAS_PAGE_SIZE=10
DEFAULT_PAGE_SIZE=20
MAX_PAGE_SIZE=100

# ==================== OPERACIÓN POS Y LÍMITES ====================
ENABLE_TABLE_SERVICE=false
DEFAULT_SERVICE_TYPE=MOSTRADOR
SPECIAL_MENU_DEFAULT_NOTICE_DAYS=5
VENTA_MAX_LINEAS=50
VENTA_MAX_CANTIDAD_POR_LINEA=100
DELIVERY_JSON_MAX_KEYS=20
DELIVERY_JSON_MAX_DEPTH=2
DELIVERY_JSON_MAX_BYTES=2048
```

| Variable | Obligatoria | Defecto | Descripción |
|---|:---:|---|---|
| `NODE_ENV` | No | `development` | Entorno: `development`, `test` o `production` |
| `PORT` | No | `4000` | Puerto HTTP del servidor Express |
| `API_PREFIX` | No | `/api/v1` | Prefijo versionado de todas las rutas REST |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Orígenes permitidos separados por coma (con `credentials: true`) |
| `TRUST_PROXY` | No | `false` | Configuración de `app.set('trust proxy', ...)` para `req.ip` confiable |
| `JSON_BODY_LIMIT` | No | `2mb` | Tamaño máximo de payload JSON aceptado por Express |
| `REQUEST_TIMEOUT_MS` | No | `15000` | Timeout HTTP anti-cola (`1000`–`120000` ms); responde `503` si excede |
| `DATABASE_URL` | Sí | — | Cadena de conexión PostgreSQL principal |
| `DATABASE_URL_TEST` | No | *(usa `DATABASE_URL`)* | Base de datos aislada usada automáticamente con `NODE_ENV=test` |
| `DB_POOL_MAX` | No | `10` | Conexiones máximas simultáneas del pool Sequelize |
| `DB_POOL_MIN` | No | `1` | Conexiones mínimas mantenidas en el pool |
| `DB_POOL_ACQUIRE_MS` | No | `8000` | Espera máxima para adquirir una conexión del pool |
| `DB_POOL_IDLE_MS` | No | `10000` | Tiempo de inactividad antes de liberar una conexión |
| `DB_LOCK_TIMEOUT_MS` | No | `3000` | `SET LOCAL lock_timeout` anti-cola por bloqueos de fila |
| `DB_STATEMENT_TIMEOUT_MS` | No | `10000` | `SET LOCAL statement_timeout` máximo por consulta SQL |
| `JWT_SECRET` | Sí | — | Clave de firma JWT (`>= 16` chars en dev; `>= 32` aleatorios en prod) |
| `JWT_EXPIRES_IN` | No | `12h` | Vigencia del token JWT |
| `BCRYPT_SALT_ROUNDS` | No | `10` | Factor de costo `bcryptjs` (`8`–`15`) |
| `AUTH_RATE_LIMIT_WINDOW_MS` | No | `900000` | Ventana del rate limiter de `POST /auth/login` (15 min) |
| `AUTH_RATE_LIMIT_MAX` | No | `10` | Máximo de intentos por clave `IP + identificador` en la ventana |
| `ADMIN_ROLE_CODE` | No | `ADMIN` | Código del rol Administrador exclusivo |
| `AUTH_COOKIE_NAME` | No | `pos_session` | Nombre de la cookie `httpOnly` de sesión |
| `AUTH_COOKIE_SAMESITE` | No | `lax` | Política `SameSite` de la cookie (`lax`, `strict`, `none`) |
| `AUTH_COOKIE_SECURE` | No | `false` | Bandera `Secure` en cookie (en producción siempre es `true`) |
| `AUTH_COOKIE_MAX_AGE_MS` | No | `43200000` | Duración de la cookie en milisegundos (12 horas) |
| `CSRF_PROTECTION_ENABLED` | No | `true` | Activa validación `X-Requested-With` + `Origin`/`Referer` en mutaciones |
| `ALLOW_SEED_IN_PRODUCTION` | No | `false` | Permite correr `seed.js` en producción solo si es `true` |
| `SEED_ADMIN_PASSWORD` | Prod seed | `Admin123!` *(solo dev)* | Contraseña del usuario `admin` creado por `seed.js` |
| `SEED_CAJERO_PASSWORD` | Prod seed | `Cajero123!` *(solo dev)* | Contraseña del usuario `cajero` creado por `seed.js` |
| `SEED_MESERO_PASSWORD` | Prod seed | `Mesero123!` *(solo dev)* | Contraseña del usuario `mesero` creado por `seed.js` |
| `IVA_RATE` | No | `0.12` | Tasa de IVA incluido en precios (Guatemala 12%) |
| `CURRENCY_CODE` | No | `GTQ` | Código ISO de moneda |
| `CURRENCY_SYMBOL` | No | `Q` | Símbolo monetario |
| `DEFAULT_TIMEZONE` | No | `America/Guatemala` | Zona horaria IANA usada por `dates.js` (Luxon) |
| `UNIT_OZ_PER_LB` | No | `16` | Factor de conversión de libras a onzas |
| `FACTURAS_PAGE_SIZE` | No | `10` | Registros por página en módulo de facturas |
| `DEFAULT_PAGE_SIZE` | No | `20` | Paginación por defecto |
| `MAX_PAGE_SIZE` | No | `100` | Límite máximo de registros por página |
| `ENABLE_TABLE_SERVICE` | No | `false` | Habilita o deshabilita servicio en mesa (`MESA`) |
| `DEFAULT_SERVICE_TYPE` | No | `MOSTRADOR` | Tipo de servicio por defecto (`MOSTRADOR`, `LLEVAR`, `MESA`, `DELIVERY`) |
| `SPECIAL_MENU_DEFAULT_NOTICE_DAYS` | No | `5` | Días de aviso previo para menús especiales |
| `DELIVERY_JSON_MAX_KEYS` | No | `20` | Máximo de claves permitidas en `datosDeliveryJson` |
| `DELIVERY_JSON_MAX_DEPTH` | No | `2` | Profundidad máxima de anidación en `datosDeliveryJson` |
| `DELIVERY_JSON_MAX_BYTES` | No | `2048` | Tamaño máximo serializado en bytes de `datosDeliveryJson` |
| `FEL_ENABLED` | No | `false` | Activa certificación y anulación FEL post-commit |
| `FEL_PROVIDER` | No | `NONE` | Proveedor FEL (`NONE`, `SIMULADOR` o certificador SAT) |

---

## 3. Frontend (`frontend/.env`)

Plantilla lista para copiar en `frontend/.env`:

```dotenv
# URL base de la API REST versionada
VITE_API_BASE_URL=http://localhost:4000/api/v1
VITE_API_TIMEOUT_MS=15000

# Identidad y configuración regional (Guatemala)
VITE_APP_NAME="La Parrilla Chapina POS"
VITE_CURRENCY_SYMBOL=Q
VITE_CURRENCY_CODE=GTQ
VITE_LOCALE=es-GT
VITE_IVA_RATE=0.12

# Reglas operativas de UI
VITE_OZ_PER_LB=16
VITE_FACTURAS_PAGE_SIZE=10
VITE_DEFAULT_PAGE_SIZE=15
VITE_ADMIN_ROLE_CODE=ADMIN
VITE_AUTH_STORAGE_KEY=pos_restaurante_gt_session
VITE_AUTO_PRINT_ENABLED=true
VITE_ENABLE_TABLE_SERVICE=false
VITE_DEFAULT_SERVICE_TYPE=MOSTRADOR
VITE_SPECIAL_MENU_NOTICE_DAYS=5
```

| Variable | Defecto | Descripción |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:4000/api/v1` | URL base del backend (en Docker con Nginx usar `/api/v1`) |
| `VITE_API_TIMEOUT_MS` | `15000` | Timeout del cliente HTTP (`fetch` + `AbortController`) |
| `VITE_APP_NAME` | `POS Restaurante Guatemala` | Nombre mostrado en encabezado, login y comprobantes |
| `VITE_CURRENCY_SYMBOL` | `Q` | Símbolo de moneda en pantalla |
| `VITE_CURRENCY_CODE` | `GTQ` | Código de moneda en etiquetas |
| `VITE_LOCALE` | `es-GT` | Formato regional de números y fechas |
| `VITE_IVA_RATE` | `0.12` | Tasa de IVA incluido para previsualización en carrito |
| `VITE_OZ_PER_LB` | `16` | Factor `lb ↔ oz` para vistas previas en inventario/compras |
| `VITE_FACTURAS_PAGE_SIZE` | `10` | Filas por página en vista de facturas |
| `VITE_DEFAULT_PAGE_SIZE` | `15` | Filas por página en tablas generales |
| `VITE_ADMIN_ROLE_CODE` | `ADMIN` | Código de rol usado para habilitar menús exclusivos de Admin |
| `VITE_AUTH_STORAGE_KEY` | `pos_restaurante_gt_session` | Clave heredada que se limpia automáticamente (sesión ahora en cookie `httpOnly`) |
| `VITE_AUTO_PRINT_ENABLED` | `true` | Abre automáticamente el modal de impresión térmica tras cobrar |
| `VITE_ENABLE_TABLE_SERVICE` | `false` | Muestra/oculta la pestaña y selector de servicio en mesa |
| `VITE_DEFAULT_SERVICE_TYPE` | `MOSTRADOR` | Servicio preseleccionado en el POS |
| `VITE_SPECIAL_MENU_NOTICE_DAYS` | `5` | Días de aviso previo por defecto al crear menús especiales |
