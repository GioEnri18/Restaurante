# Sistema POS para Restaurante — Guatemala (GTQ · IVA 12%)

Sistema de Punto de Venta (POS) modular y escalable para restaurante en Guatemala, enfocado actualmente en **servicio en mostrador y para llevar** (con soporte completo de **mesas** listo para habilitar por variable de entorno), preparado para multi-sucursal (`sucursal_id`), **FEL (SAT)**, **Delivery** y **Reservas**.

## Estándar de Arquitectura y Carpetas

```text
f:\App_Punto de venta/
├── docker-compose.yml              # PostgreSQL 16 (America/Guatemala)
├── package.json                    # Scripts de orquestación del monorepo
├── README.md
│
├── backend/                        # API REST /api/v1 (MVC + Servicio por dominio)
│   ├── .env / .env.example         # 100% de la configuración en variables de entorno
│   ├── prisma/
│   │   ├── schema.prisma           # 25 tablas relacionales + índices + multi-sucursal
│   │   ├── migrations/             # Migraciones SQL versionadas
│   │   └── seed.ts                 # Datos iniciales (roles, permisos, menú, recetas)
│   └── src/
│       ├── app.ts / server.ts
│       ├── config/                 # env.ts (Zod), database.ts, constants.ts
│       ├── shared/                 # errors/, middlewares/, services/ (lb↔oz, auditoría, FEL), utils/
│       ├── types/                  # Extensión de tipos Express
│       └── modules/                # 9 dominios (model + service + controller + routes)
│           ├── auth/
│           ├── ventas/             # Menú, platillos, recetas, checkout atómico y menús especiales
│           ├── facturas/
│           ├── inventario/
│           ├── mermas/
│           ├── caja/
│           ├── reportes/
│           ├── auditoria/
│           └── accesos/
│
└── frontend/                       # React + TypeScript + Tailwind CSS (MVC + Adapters + UI)
    ├── .env / .env.example         # Configuración VITE_* centralizada
    └── src/
        ├── config/env.ts           # Lectura tipada de variables de entorno
        ├── models/index.ts         # Modelos de dominio limpios (desacoplados del JSON)
        ├── adapters/               # Traducción exclusiva JSON <-> Modelos (1 por dominio)
        ├── services/               # Comunicación HTTP (/api/v1) + httpClient.ts
        ├── store/                  # Estado global Zustand (auth.store.ts, cart.store.ts)
        ├── utils/formatters.ts     # Quetzales (Q), IVA 12% incluido, fechas es-GT y lb↔oz
        └── ui/
            ├── components/         # common/, layout/, print/ (tickets térmicos 80mm)
            └── pages/              # Las 9 vistas obligatorias + MenusEspecialesPage (Admin)
```

---

## Instalación y Ejecución

### 1. Levantar PostgreSQL 16
```bash
npm run db:up
```

### 2. Preparar Backend (migraciones y seeders)
```bash
npm run backend:install
npm --prefix backend run prisma:generate
npm run backend:migrate
npm run backend:seed
```

### 3. Preparar Frontend
```bash
npm run frontend:install
```

### 4. Ejecutar en Desarrollo
**Terminal 1 — Backend (`http://localhost:4000/api/v1`)**
```bash
npm run backend:dev
```

**Terminal 2 — Frontend (`http://localhost:5173`)**
```bash
npm run frontend:dev
```

---

## Usuarios de Prueba y Roles

| Rol | Usuario | Contraseña | Vista Inicial | Alcance Actual |
| :--- | :--- | :--- | :--- | :--- |
| **Administrador** | `admin` | `Admin123!` | `/reportes` | Control total, Menús Especiales con avisos, Reportes PDF/Excel, Auditoría y Accesos |
| **Cajero** | `cajero` | `Cajero123!` | `/ventas` | Menú / Ventas (mostrador) y Caja (apertura, movimientos y cuadre GTQ) |
| **Mesero** | `mesero` | `Mesero123!` | `/ventas` | Menú / Ventas y consulta de Facturas |

> **Habilitar servicio en mesas en el futuro:** cambia `ENABLE_TABLE_SERVICE=true` en `backend/.env` y `VITE_ENABLE_TABLE_SERVICE=true` en `frontend/.env` sin modificar código.
