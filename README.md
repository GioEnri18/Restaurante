# POS Restaurante Guatemala — Sistema Punto de Venta Modular

Sistema de Punto de Venta (POS) diseñado para restaurantes en Guatemala, con control de moneda en **Quetzales (`GTQ` / `Q`)**, cálculo fiscal con **IVA 12% incluido** (Decreto 27-92), manejo de recetas e inventario en **libras (`lb`) y onzas (`oz`, `1 lb = 16 oz`)**, **control RBAC por rol y permisos**, **auditoría inmutable**, y soporte preparado para **FEL (SAT Guatemala)**, **multi-sucursal**, **delivery** y **reservas**.

---

## Arquitectura y Tecnologías

### Backend (`backend/`)
- **Runtime y lenguaje:** Node.js 22+ en **JavaScript puro (CommonJS `.js`)**.
- **Framework HTTP:** Express 4 con arquitectura **MVC estricta** (`models/`, `services/`, `controllers/`, `routes/`, `middlewares/`, `config/`, `database/`).
- **ORM y Base de Datos:** Sequelize 6 + **PostgreSQL 16** (`pg`), con migraciones SQL versionadas (`schema_migrations`), bloqueo pesimista `SELECT ... FOR UPDATE`, rollbacks explícitos, callbacks `onAfterCommit` y timeouts anti-cola (`REQUEST_TIMEOUT_MS`, `DB_LOCK_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`).
- **Seguridad:** JWT almacenado en cookie `httpOnly` (`SameSite=Lax`, `Secure` automático en producción), protección CSRF (`X-Requested-With` + validación de `Origin`), `bcryptjs`, `helmet`, `cors` con credenciales, rate limiting exclusivo en `POST /auth/login` (clave IP + usuario), mitigación de enumeración de usuarios y trigger PostgreSQL que impide `UPDATE`/`DELETE` sobre `auditoria_logs`.
- **Zona horaria y FEL:** Fechas normalizadas con `luxon` en `America/Guatemala`; certificación y anulación FEL ejecutadas **siempre post-commit fuera de la transacción** (`FelAdapter`).
- **Reportes:** Exportación nativa a PDF (`pdfkit`) y Excel (`exceljs`).

### Frontend (`frontend/`)
- **Stack:** React 19 + TypeScript estricto + Tailwind CSS 3.4 + Vite 6 + Zustand + Recharts.
- **Patrón:** MVC + Adapter (`src/config/env.ts`, `src/models/`, `src/adapters/`, `src/services/`, `src/store/`, `src/ui/components/<dominio>/`, `src/ui/pages/`).
- **Autenticación:** Sin `localStorage`; las peticiones envían la cookie `httpOnly` (`credentials: 'include'`) y restauran sesión vía `GET /api/v1/auth/me`.

---

## Estructura del Repositorio

```text
.
├── backend/
│   ├── src/
│   │   ├── app.js                     # Configuración Express, Helmet, CORS, Cookies, CSRF y timeouts
│   │   ├── server.js                  # Bootstrap y apagado limpio
│   │   ├── config/                    # env.js (Zod), constants.js, database.js (Sequelize + withTransaction)
│   │   ├── models/                    # 25 modelos Sequelize, enums y asociaciones relacionales
│   │   ├── services/                  # Lógica de negocio (incluyendo menu, menus-especiales, platillos y checkout)
│   │   ├── controllers/               # Controladores MVC de los 9 dominios
│   │   ├── routes/                    # Enrutadores /api/v1 y validaciones Zod
│   │   ├── middlewares/               # authenticate, authorize, csrfProtection, validate, requestTimeout, errorHandler
│   │   ├── shared/                    # AppError, AuditService, FelAdapter, UnitConversionService, dates.js, tax.js
│   │   └── database/                  # migrate.js, seed.js, checkSyntax.js y migrations/*.sql
│   ├── tests/                         # Pruebas unitarias e integración (node:test)
│   ├── Dockerfile                     # Imagen multi-stage no-root
│   └── eslint.config.js
├── frontend/
│   ├── src/
│   │   ├── config/                    # env.ts (variables VITE_*)
│   │   ├── models/                    # Modelos de dominio TypeScript
│   │   ├── adapters/                  # Traducción estricta JSON API -> modelos (sin any)
│   │   ├── services/                  # Cliente HTTP (cookies httpOnly) y servicios por dominio
│   │   ├── store/                     # Estado global Zustand
│   │   └── ui/                        # Componentes modulares por dominio y 10 vistas
│   ├── Dockerfile                     # Build Vite + Nginx SPA + proxy /api/
│   └── eslint.config.js
├── postman/                           # Colección Postman v2.1 (52 rutas) + Environment
├── .github/workflows/ci.yml           # Pipeline CI (check, typecheck, lint, test con PostgreSQL, build)
└── docker-compose.yml                 # PostgreSQL local o stack completo (--profile full)
```

---

## Requisitos Previos

- **Node.js** `>= 22.0.0` y **npm** `>= 10.0.0`
- **Docker** y **Docker Compose** (para PostgreSQL 16 o despliegue completo)

---

## Configuración de Variables de Entorno

1. **Raíz del repositorio (Docker Compose):**
   ```bash
   cp .env.example .env
   ```
   Define `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (obligatorias, sin contraseñas de respaldo en `docker-compose.yml`).

2. **Backend (`backend/.env`):**
   ```bash
   cp backend/.env.example backend/.env
   ```
   Variables principales:
   - `DATABASE_URL` / `DATABASE_URL_TEST`: conexión PostgreSQL principal y de pruebas.
   - `JWT_SECRET`: obligatorio; en `NODE_ENV=production` exige mínimo 32 caracteres aleatorios sin palabras de ejemplo.
   - `TRUST_PROXY`: `false` en desarrollo local; configurar (`1` o subred) detrás de proxy inverso.
   - `AUTH_RATE_LIMIT_WINDOW_MS` (`900000`) / `AUTH_RATE_LIMIT_MAX` (`10`): límite exclusivo en `POST /auth/login`.
   - `AUTH_COOKIE_NAME`, `AUTH_COOKIE_SAMESITE`, `AUTH_COOKIE_SECURE`, `CSRF_PROTECTION_ENABLED`.
   - `REQUEST_TIMEOUT_MS`, `DB_POOL_MAX`, `DB_LOCK_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`.
   - `DEFAULT_TIMEZONE=America/Guatemala`, `IVA_RATE=0.12`, `UNIT_OZ_PER_LB=16`.
   - `FEL_ENABLED=false`, `FEL_PROVIDER=NONE` (o `SIMULADOR` en pruebas locales).
   - `ALLOW_SEED_IN_PRODUCTION=false`, `SEED_ADMIN_PASSWORD`, `SEED_CAJERO_PASSWORD`, `SEED_MESERO_PASSWORD`.

3. **Frontend (`frontend/.env`):**
   ```bash
   cp frontend/.env.example frontend/.env
   ```

---

## Ejecución en Desarrollo Local

```bash
# 1. Levantar PostgreSQL 16
docker compose up -d

# 2. Instalar dependencias
npm run backend:install
npm run frontend:install

# 3. Aplicar migraciones SQL versionadas y cargar datos iniciales (solo desarrollo)
npm run backend:migrate
npm run backend:seed

# 4. Levantar backend (puerto 4000) y frontend (puerto 5173)
npm run backend:dev
npm run frontend:dev
```

> **Advertencia sobre usuarios de prueba (solo desarrollo):**
> El script `backend/src/database/seed.js` **se bloquea automáticamente si `NODE_ENV=production`** (salvo que se establezca explícitamente `ALLOW_SEED_IN_PRODUCTION=true` y se definan contraseñas seguras por entorno). En desarrollo local crea 3 cuentas de demostración (`admin`, `cajero`, `mesero`) cuyas contraseñas se leen de `SEED_*_PASSWORD` (o defaults locales de desarrollo). **Nunca uses estas credenciales en producción.**

---

## Despliegue Completo con Docker

Configura el archivo `.env` en la raíz (incluyendo un `JWT_SECRET` aleatorio de al menos 32 caracteres) y ejecuta:

```bash
docker compose --profile full up -d --build
```

- Frontend (Nginx): `http://localhost:8080`
- Backend API: `http://localhost:4000/api/v1/health`

---

## Pruebas, Calidad y Postman

```bash
# Backend: verificación de sintaxis, ESLint y formato
npm --prefix backend run check
npm --prefix backend run lint

# Backend: pruebas unitarias (sin BD) y suite completa (unitarias + integración PostgreSQL)
npm --prefix backend run test:unit
npm --prefix backend test
npm --prefix backend run test:watch

# Frontend: verificación de tipos, ESLint y build de producción
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

- **Base de datos de pruebas separada:** al ejecutar con `NODE_ENV=test`, Sequelize utiliza automáticamente `DATABASE_URL_TEST` (si está definida en `backend/.env`), evitando afectar los datos de desarrollo.
- **Colección Postman:** importa `postman/POS_Restaurante_GT.postman_collection.json` y `postman/POS_Restaurante_GT.postman_environment.json` para probar los 52 endpoints reales con manejo automático de cookies `httpOnly`, encabezados CSRF y validaciones `pm.test`.
