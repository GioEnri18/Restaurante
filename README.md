# POS Restaurante Guatemala — Sistema Punto de Venta Modular

Sistema de Punto de Venta (POS) diseñado para restaurantes en Guatemala, con control de moneda en **Quetzales (`GTQ` / `Q`)**, cálculo fiscal con **IVA 12% incluido** (Decreto 27-92), manejo de recetas e inventario en **libras (`lb`) y onzas (`oz`, `1 lb = 16 oz`)**, **control RBAC por rol y permisos**, **auditoría inmutable**, y facturas emitidas como **comprobante interno** (no se certifican ante la SAT), **multi-sucursal**, **delivery** y **reservas**.

---

## Arquitectura y Tecnologías

### Backend (`backend/`)
- **Runtime y lenguaje:** Node.js 22+ en **JavaScript puro (CommonJS `.js`)**.
- **Framework HTTP:** Express 4 con arquitectura **MVC estricta** (`models/`, `services/`, `controllers/`, `routes/`, `middlewares/`, `config/`, `database/`).
- **ORM y Base de Datos:** Sequelize 6 + **PostgreSQL 16** (`pg`), con migraciones SQL versionadas (`schema_migrations`), bloqueo pesimista `SELECT ... FOR UPDATE`, rollbacks explícitos, callbacks `onAfterCommit` y timeouts anti-cola (`REQUEST_TIMEOUT_MS`, `DB_LOCK_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`).
- **Seguridad:** JWT almacenado en cookie `httpOnly` (`SameSite=Lax`, `Secure` automático en producción), protección CSRF (`X-Requested-With` + validación de `Origin`), `bcryptjs`, `helmet`, `cors` con credenciales, rate limiting exclusivo en `POST /auth/login` (clave IP + usuario), mitigación de enumeración de usuarios y trigger PostgreSQL que impide `UPDATE`/`DELETE` sobre `auditoria_logs`.
- **Zona horaria:** Fechas normalizadas con `luxon` en `America/Guatemala` y leídas siempre en UTC desde PostgreSQL.
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
│   │   ├── shared/                    # AppError, AuditService, UnitConversionService, dates.js, tax.js
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
├── postman/                           # Colección Postman v2.1 (55 rutas) + Environment
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
   Crea `.env` localmente. Define `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB`. Usa el mismo usuario, contraseña y nombre de base en la conexión de desarrollo del backend.

2. **Backend (`backend/.env`, plantilla en `backend/.env.example`):**
   Crea `backend/.env` para arrancar la API fuera de Docker. Variables principales:
   - `DATABASE_URL` / `DATABASE_URL_TEST`: conexión PostgreSQL principal y de pruebas.
   - `JWT_SECRET`: obligatorio; en `NODE_ENV=production` exige mínimo 32 caracteres aleatorios sin palabras de ejemplo.
   - `TRUST_PROXY`: `false` en desarrollo local; configurar (`1` o subred) detrás de proxy inverso.
   - `AUTH_RATE_LIMIT_WINDOW_MS` (`900000`) / `AUTH_RATE_LIMIT_MAX` (`10`): límite exclusivo en `POST /auth/login`.
   - `AUTH_COOKIE_NAME`, `AUTH_COOKIE_SAMESITE`, `AUTH_COOKIE_SECURE`, `CSRF_PROTECTION_ENABLED`.
   - `REQUEST_TIMEOUT_MS`, `DB_POOL_MAX`, `DB_LOCK_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`.
   - `DEFAULT_TIMEZONE=America/Guatemala`, `IVA_RATE=0.12`, `UNIT_OZ_PER_LB=16`.
   - `ALLOW_SEED_IN_PRODUCTION=false`, `SEED_ADMIN_PASSWORD`, `SEED_CAJERO_PASSWORD`, `SEED_MESERO_PASSWORD`.
   - **Auditoría de investigación:**
     - `AUDIT_IMPACTO_ALTO_Q` (default `500`): monto en Quetzales a partir del cual egresos, mermas, ajustes o compras escalan a severidad `ALTA`.
     - `AUDIT_DIFERENCIA_CAJA_ALTA_Q` (default `50`): diferencia de arqueo de caja (`|contado - esperado|`) en Quetzales que escala a `ALTA`.
     - `AUDIT_REPETICION_UMBRAL` (default `3`): ocurrencias repetitivas en un mismo turno (o aprobador recurrente) que disparan alerta y/o severidad `ALTA`.
     - `AUDIT_EXPORT_MAX_ROWS` (default `10000`): límite máximo de filas permitidas por exportación CSV.

3. **Frontend (`frontend/.env`):**
   Crea `frontend/.env` si necesitas sobrescribir la URL local de la API. Define `VITE_API_BASE_URL` y guarda las credenciales en el backend. Vite expone las variables `VITE_*` al navegador.

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

Configura el archivo `.env` local de la raíz. Debe incluir un `JWT_SECRET` aleatorio de al menos 32 caracteres y `APP_DB_USER`/`APP_DB_PASSWORD` para el usuario de base de datos de la API. Después ejecuta:

```bash
docker compose --profile full up -d --build
```

- Entrada única (nginx del frontend): `http://localhost:8080`. En producción, el HTTPS lo termina un proxy delante de ese puerto (Caddy, Traefik, el nginx del servidor o el balanceador), con `TRUST_PROXY=2` y `CORS_ORIGIN` apuntando a la URL `https://`.
- La API **no** publica puertos: solo se alcanza por nginx en `/api/v1`. Disponibilidad: `/api/v1/health/ready`, que verifica PostgreSQL.
- PostgreSQL solo escucha en `127.0.0.1`. En un servidor de producción, elimina su sección `ports`.
- En cada despliegue, el servicio `migrator` aplica las migraciones con el usuario dueño (`POSTGRES_USER`) y crea o actualiza `APP_DB_USER`, miembro de `pos_app_rol`. La API se conecta con ese usuario: sin DDL, sin borrar ventas, facturas ni caja, y la auditoría es de solo `INSERT`/`SELECT`.
- Al desplegar estos cambios, los JWT emitidos antes de la migración de sesiones quedan inválidos y los usuarios deben volver a iniciar sesión.

### Fotos de platillos

El administrador puede agregar o cambiar fotos en Inventario → Recetas y Precios. La API admite un JPG, PNG o WebP sin animación de hasta 5.000.000 bytes y 20 megapíxeles. Solo conserva una miniatura WebP de hasta 480 px por lado y 10.000 bytes. PostgreSQL guarda la ruta relativa de la foto.

Docker guarda las miniaturas en el volumen `platillos_media`. El backend escribe en el volumen y Nginx lo monta en modo de solo lectura para servir las fotos bajo `/media/platillos/`. Si hay un proxy HTTPS delante de Nginx, configúralo para aceptar solicitudes de al menos 6 MB. Fuera de Docker, la API sirve las fotos desde `backend/media/platillos` por defecto.

### Menú base de Restaurante Exprés BX

La migración incorpora el catálogo permanente en las sucursales activas y un trigger de PostgreSQL lo precarga al insertar una nueva sucursal activa. Para reponer productos faltantes por SKU, ejecuta el comando con el código de la sucursal.

```bash
npm --prefix backend run db:cargar-menu-base -- SUC-01
# En el stack Docker
docker compose exec backend npm run db:cargar-menu-base -- SUC-01
```

La carga crea borradores por SKU y puede repetirse sin duplicar productos ni sobrescribir recetas, precios o fotos editadas. Las fotos iniciales WebP se sirven desde la aplicación y las que suba el administrador se guardan en el volumen. Los gramajes son pruebas por porción almacenadas en onzas en el POS. Los insumos nuevos empiezan sin existencias y sin costo registrado. Los combos requieren composición y las bebidas envasadas requieren definir su control por presentación. Antes de habilitar cualquier producto, confirma su receta, registra los costos de compra y asigna el precio de venta. Los menús de temporada se siguen gestionando por fechas desde Menús Especiales.

### Demostración BX en una sucursal aislada

Ejecuta el comando desde el backend después de migrar. Configura `BX_DEMO_PASSWORD` en el entorno del proceso con una contraseña de al menos 16 caracteres, letras y números. El usuario `cajero_demo_bx` entra a la sucursal `QA-BX-DEMO` con los permisos necesarios para probar caja y ventas. La primera activación carga precios, existencias, una compra y recetas ficticias en esa sucursal. Reactivar conserva los movimientos que ya se hicieron y cambia la contraseña de la cuenta de prueba.

```bash
npm run db:demo-bx -- activar
npm run db:demo-bx -- desactivar
```

Al desactivar se revocan las sesiones del cajero y se retira la sucursal de uso. Su historial queda disponible para una futura reactivación y sus datos quedan separados de las sucursales operativas.

### Respaldos

Respalda y restaura el volumen `platillos_media` junto con PostgreSQL para conservar las fotos y sus rutas.

```bash
sh scripts/respaldo-bd.sh                                   # genera backups/<base>_<fecha>.dump
sh scripts/verificar-restauracion.sh backups/<archivo>.dump pos_restaurante_gt
```

La verificación restaura el respaldo en una base temporal y compara las filas de cada tabla con la base de origen. También revisa las migraciones y los triggers de auditoría, y al final borra la base temporal. Un respaldo que nunca se restauró no está comprobado.

---

## Módulo de Auditoría de Investigación

La bitácora `auditoria_logs` es estrictamente **APPEND-ONLY** (trigger `trg_auditoria_logs_inmutable` bloquea `UPDATE`/`DELETE`, trigger anti-`TRUNCATE` y `pos_app_rol` solo tiene `SELECT` e `INSERT`). Cada evento de negocio se registra dentro de la misma transacción Sequelize y centraliza la redacción de secretos/tarjetas (`[REDACTADO]`) en `AuditService`.

- **Contexto de negocio persistido:** `actor_rol_codigo` (snapshot), `aprobador_id` (supervisor en control dual), `caja_sesion_id` (turno), `severidad` (`BAJA` | `MEDIA` | `ALTA`), `codigo_motivo` estandarizado, `impacto_financiero` en Q (con signo contable) y `correlacion_id` (UUID para agrupar eventos de una misma operación). Los registros históricos (`severidad IS NULL`) derivan su severidad en tiempo de lectura sin backfill.
- **Endpoints (`/api/v1/auditoria`):**
  - `GET /auditoria`: listado paginado con filtros unificados (`severidad`, `accion`, `usuarioId`, `aprobadorId`, `cajaSesionId`, `entidad`, `entidadId`, `impactoMin`, `impactoMax`, `fechaDesde`, `fechaHasta` en `America/Guatemala`).
  - `GET /auditoria/resumen`: KPIs agregados en SQL (`GROUP BY`), conteo por severidad, monto anulado, diferencia neta de caja, reimpresiones, rankings de usuarios/aprobadores y alertas automáticas de patrones repetitivos (`ANULACIONES_REPETIDAS_TURNO`, `APROBADOR_RECURRENTE`).
  - `GET /auditoria/:id`: detalle con diff antes/después, enlace a la entidad origen y eventos correlacionados.
  - `GET /auditoria/exportar`: descarga CSV por streaming (lotes de 500 filas, protección anti formula-injection, requiere permisos `auditoria:ver` + `auditoria:exportar` y audita su propia ejecución con `EXPORTAR_AUDITORIA`).
  - `GET /auditoria/nomina`: exclusivo `ADMIN`; `GESTION_NOMINA` permanece totalmente excluida de listados, resúmenes, detalles y exportaciones para el resto de roles.

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
- **Colección Postman.** Importa `postman/POS_Restaurante_GT.postman_collection.json` y crea un entorno local con la URL de la API y las credenciales de prueba. La colección incluye manejo de cookies `httpOnly`, encabezados CSRF y validaciones `pm.test`.
