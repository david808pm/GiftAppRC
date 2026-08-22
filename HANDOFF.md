# GiftApp — HANDOFF Document

> Documento de transferencia para retomar el proyecto en una nueva sesión.
> Última actualización: 20 de agosto de 2026 (Sesión 31 — Bulk Gift Import Excel + ZIP).

---

## 1. Descripción del Proyecto

**GiftApp** es una plataforma web para la gestión de campañas de regalos corporativos. Permite a empresas crear campañas, importar empleados y beneficiarios desde Excel, y que los empleados seleccionen regalos para sus beneficiarios a través de un flujo público.

### Arquitectura
- **Backend:** NestJS + Prisma ORM + PostgreSQL (Supabase)
- **Frontend:** React 19 + Vite 8 + React Router 7
- **Base de datos:** Supabase PostgreSQL (us-east-1)
- **Autenticación:** JWT (admin) + JWT público (empleados)

---

## 2. Estructura del Proyecto

```
mimo-regalostestv4/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Schema completo (12 modelos)
│   │   ├── seed.ts                # Seed de datos iniciales
│   │   └── migrations/            # Migraciones Prisma
│   ├── src/
│   │   ├── admin-users/           # CRUD usuarios admin
│   │   ├── auth/                  # Login admin, JWT strategy
│   │   ├── beneficiaries/         # CRUD beneficiarios [MODIFICADO] Paginación server-side
│   │   ├── campaigns/             # CRUD campañas + público por slug [MODIFICADO] Fix slug duplicado
│   │   ├── common/
  │   │   │   ├── config/env.ts      # Validación de variables de entorno
  │   │   │   ├── decorators/roles.decorator.ts
  │   │   │   ├── filters/http-exception.filter.ts
  │   │   │   ├── guards/roles.guard.ts
  │   │   │   ├── interceptors/timing.interceptor.ts  # [NUEVO] Medición de rendimiento (Phase B: performance-timing.interceptor.ts — [MODIFICADO] fix import allowlist keys)
  │   │   │   ├── services/
  │   │   │   │   ├── email.service.ts           # [NUEVO] EmailService con Resend (OTP)
  │   │   │   │   └── supabase-storage.service.ts
  │   │   │   └── utils/campaign-window.ts
  │   │   ├── companies/             # CRUD empresas (contiene generateSlug estático)
  │   │   ├── dashboard/
  │   │   │   ├── dashboard.cache.ts         # [NUEVO] Cache en memoria 30s
  │   │   │   └── dashboard.service.ts       # [MODIFICADO] Con cache
  │   │   ├── employees/             # CRUD empleados [MODIFICADO] Paginación server-side
  │   │   ├── gifts/                 # CRUD regalos + imágenes
  │   │   ├── gift-imports/           # [Sesión 31] Importación masiva de regalos (Excel + ZIP)
  │   │   │   ├── gift-import.admin.controller.ts # [NUEVO] validate / commit / template (SUPER_ADMIN)
  │   │   │   ├── gift-import.service.ts          # [NUEVO] validatePackage + commitImport (compensación all-or-nothing) + buildTemplate
  │   │   │   ├── gift-import-validation.ts       # [NUEVO] Capa pura de validación (headers, filas, códigos, límites)
  │   │   │   ├── gift-import-zip.ts              # [NUEVO] Parser ZIP seguro (jszip: traversal/bombs/ambigüedad/encrypted)
  │   │   │   ├── gift-import.module.ts           # [NUEVO] Reutiliza SupabaseStorageService exportado por GiftsModule
  │   │   │   ├── gift-import-validation.spec.ts  # [NUEVO] Validadores puros
  │   │   │   ├── gift-import-zip.spec.ts         # [NUEVO] Seguridad ZIP
  │   │   │   ├── gift-import-atomic.spec.ts      # [NUEVO] Regla atómica + compensación
  │   │   │   ├── gift-import-admin.controller.spec.ts # [NUEVO] Cardinalidad multipart + fileFilter
  │   │   │   ├── gift-manual-unchanged.spec.ts   # [NUEVO] Regresión creación manual intacta
  │   │   │   └── test-utils.ts                   # [NUEVO] Helpers de tests
  │   │   ├── imports/
│   │   │   ├── imports.admin.controller.ts # Admin endpoint
│   │   │   ├── imports.service.ts          # [MODIFICADO] Validación completa pre-write + regla atómica
│   │   │   ├── import-validation.ts        # [NUEVO] Capa de validación pura (tipos, códigos, validadores)
│   │   │   ├── imports-validation.spec.ts  # [NUEVO] 33 tests de validadores puros
│   │   │   └── imports-atomic.spec.ts      # [NUEVO] 8 tests de regla atómica (zero writes si hay errores)
  │   │   ├── prisma/prisma.service.ts
  │   │   ├── public-auth/           # Login público de empleados [MODIFICADO] + OTP email (request-code, verify-code)
  │   │   │   ├── dto/
  │   │   │   │   ├── employee-login.dto.ts
  │   │   │   │   ├── request-code.dto.ts     # [NUEVO]
  │   │   │   │   └── verify-code.dto.ts      # [NUEVO]
  │   │   │   ├── public-auth.controller.ts   # [MODIFICADO] +2 endpoints OTP
  │   │   │   ├── public-auth.service.ts      # [MODIFICADO] +requestCode, +verifyCode, refactor buildLoginResponse
  │   │   │   └── public-auth.module.ts       # [MODIFICADO] +EmailService provider
  │   │   ├── public-selection/      # Selección de regalos pública
│   │   ├── reports/               # Exportación Excel de selecciones
│   │   ├── selections/            # CRUD selecciones
│   │   ├── support-requests/      # CRUD solicitudes de soporte
│   │   ├── app.module.ts
│   │   └── main.ts                # [MODIFICADO] Con timing interceptor condicional
│   ├── test-timing.sh             # [NUEVO] Script de medición de rendimiento
│   ├── .env                       # Configuración local (us-east-1)
│   ├── .env.example
│   ├── .env.us-west-2-backup      # Backup del .env anterior (Oregon)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── apiClient.js               # Cliente HTTP con token
│   │   │   ├── backendApiService.js       # Llamadas al backend
│   │   │   ├── giftAppService.js          # [MODIFICADO] Con cache frontend + params opcionales en getEmployees/getBeneficiaries
│   │   │   └── localStorageService.js     # Modo demo/localStorage
│   │   ├── components/
│   │   │   ├── BannerEditor.jsx             # [MODIFICADO] Editor de banner controlado (create + edit)
│   │   │   ├── ConfirmDialog.jsx
│   │   │   ├── EmptyState.jsx
│   │   │   ├── GiftDetailModal.jsx
│   │   │   ├── Modal.jsx
│   │   │   ├── ProgressStepper.jsx
│   │   │   └── Toast.jsx
│   │   ├── pages/
│   │   │   ├── admin/
│   │   │   │   ├── AdminDashboard.jsx
│   │   │   │   ├── AdminLayout.jsx
│   │   │   │   ├── AdminLogin.jsx
│   │   │   │   ├── AdminUsers.jsx
│   │   │   │   ├── BeneficiariesAdmin.jsx  # [MODIFICADO] Paginación server-side
│   │   │   │   ├── Campaigns.jsx              # [MODIFICADO] Fix preview slug duplicado + [Sesión 30] Banner completo en create/edit
  │   │   │   │   ├── Employees.jsx          # [MODIFICADO] Paginación server-side + UX importación + reporte issues de validación
  │   │   │   │   ├── Gifts.jsx             # [Sesión 31] Botones Crear regalo + Importar regalos + modal 3 fases (Excel + ZIP)
  │   │   │   │   ├── Selections.jsx
│   │   │   │   └── SupportRequests.jsx
│   │   │   ├── public/
│   │   │   │   ├── AlreadyConfirmed.jsx
│   │   │   │   ├── BeneficiarySelection.jsx  # [MODIFICADO] Requests paralelos
  │   │   │   │   ├── CampaignWelcome.jsx
  │   │   │   │   ├── EmployeeLogin.jsx        # [MODIFICADO] Flujo OTP de 2 pasos (documentId → código)
  │   │   │   │   ├── Summary.jsx
│   │   │   │   ├── SupportRequest.jsx
│   │   │   │   └── ThankYou.jsx
│   │   │   └── NotFound.jsx
│   │   ├── routes/
│   │   │   └── AppRoutes.jsx              # [MODIFICADO] Code splitting con React.lazy
│   │   ├── styles/
│   │   │   └── global.css                 # ~1240 líneas, estilos globales + paginación
│   │   ├── utils/
│   │   │   ├── dates.js
│   │   │   ├── normalizers.js
│   │   │   ├── simpleCache.js             # [NUEVO] Cache frontend con TTL
│   │   │   ── validators.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env
│   ├── vite.config.js
│   └── package.json
├── tigo_import_500_empleados.xlsx              # Archivo de prueba (500 empleados) — original
├── tigo_import_500_empleados_nuevos_datos.xlsx # Archivo de prueba (500 empleados) — nuevos datos
└── Informe_Auditoria_mimo-regalos.docx
```

---

## 3. Configuración de Entorno

### Backend (.env)
```
DATABASE_URL="postgresql://postgres.uqxvrmcxumqnllaobrlh:muKcag-6rokho-bomkom@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10&connect_timeout=30&pool_timeout=30"
DIRECT_URL="postgresql://postgres.uqxvrmcxumqnllaobrlh:muKcag-6rokho-bomkom@aws-1-us-east-1.pooler.supabase.com:5432/postgres?connect_timeout=30"
JWT_SECRET="DKHUe7QRpy8MUhWZjQZgPnB8fe8apB30g6VOdt76L14tFfL7xCBede7a7iB9ymiL"
JWT_EXPIRES_IN="8h"
PUBLIC_JWT_SECRET="RzMhDXACmfDXssMRdh-o4UrnuUi_duZa6AY_UzFz-ocRGrFDpNemZBDMLbn2Eka5"
PUBLIC_JWT_EXPIRES_IN="4h"
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
ENABLE_TIMING_LOGS=false
ADMIN_SEED_EMAIL="admin@giftapp.com"
ADMIN_SEED_PASSWORD="Admin123!"

# Supabase Storage
SUPABASE_URL="https://uqxvrmcxumqnllaobrlh.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="(service role key)"
SUPABASE_STORAGE_BUCKET="gift-images"

# Email OTP — Login público de empleados
PUBLIC_LOGIN_OTP_ENABLED=true
PUBLIC_LOGIN_OTP_EXPIRY_MINUTES=10
PUBLIC_LOGIN_OTP_MAX_ATTEMPTS=5
PUBLIC_LOGIN_OTP_LOCK_MINUTES=10
PUBLIC_LOGIN_OTP_RESEND_COOLDOWN_SECONDS=60
RESEND_API_KEY="re_h2nBeuzU_..."   # Backend only, NUNCA exponer al frontend
EMAIL_FROM="onboarding@resend.dev" # TEMPORAL: solo envía al email del dueño de la cuenta Resend
```

### Frontend (.env)
```
VITE_ENABLE_DEMO_DATA=false
VITE_API_URL=/api
VITE_USE_BACKEND=true
```

### Credenciales de prueba
- **Admin:** admin@giftapp.com / Admin123!
- **Roles:** SUPER_ADMIN, ADMIN, COMPANY_VIEWER

---

## 4. Comandos de Desarrollo

### Backend
```bash
cd backend
npm install                    # Instalar dependencias
npx prisma generate            # Generar cliente Prisma
npx prisma migrate deploy      # Aplicar migraciones
npm run start:dev              # Desarrollo con hot-reload
npm run build                  # Build de producción
npm run start:prod             # Producción
ENABLE_TIMING_LOGS=true npm run start:dev  # Con logs de timing
```

### Frontend
```bash
cd frontend
npm install                    # Instalar dependencias
npm run dev                    # Desarrollo (http://localhost:5173)
npm run build                  # Build de producción
npm run preview                # Preview del build
```

### Script de medición de rendimiento
```bash
cd backend
./test-timing.sh               # Mide tiempos de endpoints admin
./scripts/benchmark-gift-import.ts   # [Sesión 31] Benchmark import de regalos: npm run benchmark:gift-import [10|25|50]
```

---

## 5. Optimizaciones de Rendimiento Implementadas

### 5.1 Backend — Timing Interceptor (Phase 1)
- **Archivo:** `backend/src/common/interceptors/timing.interceptor.ts`
- **Registro en:** `backend/src/main.ts` (condicional con `ENABLE_TIMING_LOGS`)
- **Log format:** `[HTTP] METHOD /url - statusCode - durationMs`
- **No registra:** bodies, datos sensibles

### 5.2 Backend — Dashboard Cache (Phase 2)
- **Archivo:** `backend/src/dashboard/dashboard.cache.ts`
- **TTL:** 30 segundos
- **Cache key:** `${role}_${companyId}` (ej: `SUPER_ADMIN_all`, `COMPANY_VIEWER_123`)
- **Impacto:** Dashboard pasa de ~900ms a ~12ms en cache hit
- **21 queries** consolidadas en cache, no se modificó lógica de negocio

### 5.3 Frontend — Public Flow Parallelization (Phase 3)
- **Archivo:** `frontend/src/pages/public/BeneficiarySelection.jsx`
- **Cambio:** `giftAppGetPublicEmployeeSession()` y `giftAppGetPublicCampaignBySlug(slug)` ahora se ejecutan en paralelo con `Promise.all`
- **Ahorro:** 1 round-trip de red (~50-200ms)

### 5.4 Frontend — Route Code Splitting (Phase 4)
- **Archivo:** `frontend/src/routes/AppRoutes.jsx`
- **Estrategia:** `React.lazy()` + `Suspense` para todas las rutas admin y flujo público de selección
- **Eager load:** CampaignWelcome, EmployeeLogin, NotFound (páginas ligeras)
- **Resultado:** Bundle principal de 360KB → 269KB (-25.5%)

### 5.5 Frontend — Simple Cache (Phase 5)
- **Archivo:** `frontend/src/utils/simpleCache.js`
- **Funciones:** `getCache(key)`, `setCache(key, data, ttl)`, `clearCache(key)`
- **Endpoints cacheados:**
  - `giftAppGetPublicCampaignBySlug(slug)` → key: `campaign_${slug}`, TTL: 60s
  - `giftAppGetCompanies()` → key: `companies`, TTL: 60s
  - `giftAppGetGifts(campaignId)` → key: `gifts_campaign_${campaignId}`, TTL: 30s

### 5.6 Backend — Import Batch Processing (Phase 6)
- **Archivo:** `backend/src/imports/imports.service.ts`
- **Problema:** Transacción única de 120s fallaba con 500 empleados en Supabase
- **Solución:** Batches de 10 grupos de empleados, cada uno en su propia transacción
- **Timeout por batch:** 120,000ms
- **Resultado:** 500 empleados importados exitosamente en 50 batches

### 5.7 Campaign Slug — Fix Duplicación de Prefijo de Empresa (Phase 7)
- **Archivos:** `backend/src/campaigns/campaigns.service.ts` y `frontend/src/pages/admin/Campaigns.jsx`
- **Problema:** Al crear campaña con nombre `emp-2026` para empresa con slug `emp`, se generaba `emp-emp-2026`
- **Causa:** La lógica siempre concatenaba `{company.slug}-{campaignName}` sin verificar si el nombre ya contenía el prefijo
- **Solución:** Si `campaignSlugPart` ya empieza con `{company.slug}-`, se usa tal cual; si no, se prepende
- **Impacto:** Flujo de importación Excel ahora funciona correctamente porque el slug coincide exactamente

### 5.8 Backend — Bulk Employee Optimization (Phase 8)
- **Archivo:** `backend/src/imports/imports.service.ts`
- **Problema:** Por cada grupo de empleado se ejecutaban `findUnique` y `create` individuales (~20 queries por batch de 10 grupos)
- **Solución:** Dentro de cada batch transaction:
  - 1 `findMany` para obtener todos los empleados del batch
  - 1 `createMany` para nuevos empleados
  - 1 re-fetch para obtener IDs
  - Updates individuales solo cuando hay cambios (preservado)
- **Reducción de queries:** ~20 → ~3 por batch (85% menos)
- **Impacto:** 100 empleados: ~150s → ~88s (-41%)

### 5.9 Backend — Bulk Beneficiary Optimization (Phase 9)
- **Archivo:** `backend/src/imports/imports.service.ts`
- **Problema:** Por cada empleado se ejecutaban `findMany` de beneficiarios y `create` individuales (~27 queries por batch)
- **Solución:** Dentro de cada batch transaction:
  - 1 `findMany` para todos los beneficiarios del batch (por employeeId IN)
  - Clave duplicada in-memory: `employeeId::normalizedFullName::age::gender`
  - 1 `createMany` para todos los beneficiarios nuevos
  - Normalización segura con `normalizeName()` (trim, lowercase, collapse spaces)
  - Detección de duplicados intra-archivo con `currentBatchDupSet`
- **Reducción de queries:** ~27 → ~2 por batch (93% menos)
- **Impacto:** 100 empleados: ~88s → ~14s (-84%); 500 empleados: ~471s → ~60s (-87%)
- **Nuevo helper:** `normalizeName()` (función a nivel de módulo)

### 5.10 Frontend/Backend — Employees Server-Side Pagination (Phase 2 — Admin Performance)
- **Archivos:**
  - `backend/src/employees/dto/employee-query.dto.ts` — Añadidos `page` y `pageSize` opcionales
  - `backend/src/employees/employees.service.ts` — `skip`/`take` + `count()`, retorno condicional `{ data, meta }`
  - `frontend/src/api/giftAppService.js` — `giftAppGetEmployees(params)` acepta parámetros opcionales
  - `frontend/src/pages/admin/Employees.jsx` — Paginación completa con UI de controles
  - `frontend/src/styles/global.css` — Estilos `.pagination-bar`, `.pagination-controls`, etc.
- **Problema:** 600+ filas en el DOM sin paginación, scrollHeight ~80,000px
- **Solución:** Paginación server-side con `page` y `pageSize` opcionales
  - Backend: Cuando se proveen `page`/`pageSize`, retorna `{ data, meta }`; si no, retorna array plano (backward compatible)
  - Frontend: pageSize por defecto 50, selector 25/50/100, controles Anterior/Siguiente, búsqueda/filtros server-side
  - Búsqueda backend ampliada: `fullName`, `documentId`, `email`, `phone`, `shippingCity`, `shippingAddress`
  - Mutaciones: create/import → página 1; edit/delete → página actual
- **Backward compatibility:** `giftAppGetEmployees()` sin params retorna array plano (dropdowns en SupportRequests, BeneficiariesAdmin funcionan)
- **Resultado DOM:** 600 → ~50 filas; scrollHeight ~80,000px → ~7,000px

### 5.11 Frontend/Backend — Beneficiaries Server-Side Pagination (Phase 3 — Admin Performance)
- **Archivos:**
  - `backend/src/beneficiaries/dto/beneficiary-query.dto.ts` — Añadidos `page` y `pageSize` opcionales
  - `backend/src/beneficiaries/beneficiaries.service.ts` — `skip`/`take` + `count()`, retorno condicional `{ data, meta }`
  - `frontend/src/api/giftAppService.js` — `giftAppGetBeneficiaries(params)` acepta parámetros opcionales
  - `frontend/src/pages/admin/BeneficiariesAdmin.jsx` — Paginación completa con UI de controles
- **Problema:** 1073+ filas en el DOM sin paginación, scrollHeight ~70,795px
- **Solución:** Mismo patrón que Employees — paginación server-side opcional, backward compatible
  - Búsqueda server-side: `fullName`, `employee.fullName`, `employee.documentId`
  - Employee dropdown: `giftAppGetEmployees()` sin params (array plano completo)
  - Mutaciones: create → página 1; edit/delete → página actual
- **Backward compatibility:** `giftAppGetBeneficiaries()` sin params retorna array plano
- **Resultado DOM:** 1073 → ~50 filas; scrollHeight ~70,795px → ~6,500px

---

## 6. Schema de Base de Datos (Resumen)

### Modelos principales
| Modelo | Descripción |
|--------|-------------|
| Company | Empresas clientes |
| Role | Roles: SUPER_ADMIN, ADMIN, COMPANY_VIEWER |
| AdminUser | Usuarios del panel admin |
| Campaign | Campañas de regalos (con soft-delete) |
| Employee | Empleados importados (con soft-delete). Campos OTP: `emailOtpHash`, `emailOtpExpiresAt`, `emailOtpSentAt`, `emailOtpLastUsedAt`, `emailOtpLockedUntil`, `emailOtpAttempts` |
| Beneficiary | Beneficiarios de empleados (con soft-delete) |
| Gift | Regalos disponibles (con imágenes, soft-delete) |
| GiftImage | Imágenes de regalos |
| Selection | Selección confirmada de un empleado |
| SelectionItem | Item individual (beneficiario + regalo) |
| SupportRequest | Solicitudes de soporte |
| SupportRequestHistory | Historial de cambios de soporte |
| StockMovement | Auditoría de movimientos de stock |
| EmailLog | Logs de emails (simulados por ahora) |

### Relaciones clave
- Company → Campaigns (1:N)
- Campaign → Employees, Gifts, Selections, SupportRequests (1:N)
- Employee → Beneficiaries (1:N)
- Selection → SelectionItems (1:N)
- Gift → GiftImages, StockMovements (1:N)

### Índices importantes
- `Campaign.slug` (unique)
- `Employee.campaignId_documentId` (unique compound)
- `Gift.campaignId_reference` (unique compound)
- `Selection.campaignId_employeeId` (unique compound)
- `SelectionItem.selectionId_beneficiaryId` (unique compound)

---

## 7. Flujos de la Aplicación

### Flujo Admin
1. Login con email/password → JWT token
2. Dashboard con estadísticas (cache 30s)
3. CRUD de campañas, empleados, beneficiarios, regalos
4. Importación masiva desde Excel (batch processing)
5. Gestión de selecciones y soporte
6. Exportación Excel de selecciones confirmadas

### Flujo Público (Empleado)
1. Acceso por URL: `/campaign/:slug`
2. Login — dos modos según feature flag `PUBLIC_LOGIN_OTP_ENABLED`:
   - **`false` (clásico):** Login con documentId → JWT público
   - **`true` (OTP):** Paso 1: ingresa documentId → se envía código de 6 dígitos por email (Resend). Paso 2: ingresa código → JWT público. Respuesta idéntica al login clásico (accessToken, employee, campaign, alreadyConfirmed).
3. Selección de regalos para cada beneficiario
4. Confirmación de selección (decrementa stock atómicamente)
5. Página de agradecimiento

### Roles y Permisos
- **SUPER_ADMIN:** Acceso total, sin company scoping
- **ADMIN:** Acceso total, sin company scoping
- **COMPANY_VIEWER:** Solo ve datos de su companyId

---

## 8. Archivos Modificados en Esta Sesión

### Sesión 17-18 de junio — Optimizaciones de rendimiento (Fases 1-6)
| Archivo | Cambio |
|---------|--------|
| `backend/src/common/interceptors/timing.interceptor.ts` | Creado - interceptor de timing |
| `backend/src/main.ts` | Registro condicional del timing interceptor |
| `backend/src/dashboard/dashboard.cache.ts` | Creado - cache en memoria |
| `backend/src/dashboard/dashboard.service.ts` | Integración de cache |
| `backend/src/imports/imports.service.ts` | Batch processing para importación |
| `backend/.env` | Agregado `ENABLE_TIMING_LOGS=false` |
| `backend/.env.example` | Agregado `ENABLE_TIMING_LOGS=false` |
| `backend/test-timing.sh` | Creado - script de medición |
| `frontend/src/utils/simpleCache.js` | Creado - cache frontend |
| `frontend/src/api/giftAppService.js` | Integración de cache en 3 endpoints |
| `frontend/src/pages/public/BeneficiarySelection.jsx` | Parallelización de requests |
| `frontend/src/routes/AppRoutes.jsx` | Code splitting con React.lazy |
| `frontend/src/pages/admin/Employees.jsx` | UX de importación mejorada |

### Sesión 20 de junio — Migración a us-east-1 + Fix slug duplicado (Fase 7-8)
| Archivo | Cambio |
|---------|--------|
| `backend/.env` | Migrado DATABASE_URL y DIRECT_URL a Supabase us-east-1 |
| `backend/.env.us-west-2-backup` | Creado - backup del .env anterior (Oregon) |
| `backend/src/campaigns/campaigns.service.ts` | Fix generación automática de slug (evita duplicar prefijo de empresa) |
| `frontend/src/pages/admin/Campaigns.jsx` | Fix preview de slug en formulario de nueva campaña |
| `HANDOFF.md` | Actualizado con todos los cambios recientes |

### Sesión 21 de junio — Bulk Employee + Beneficiary Optimization (Fase 8-9)
| Archivo | Cambio |
|---------|--------|
| `backend/src/imports/imports.service.ts` | Bulk employee (Phase 2): per-batch `findMany` + `createMany` para empleados |
| `backend/src/imports/imports.service.ts` | Bulk beneficiary (Phase 3): per-batch `findMany` + `createMany` para beneficiarios + helper `normalizeName()` |
| `HANDOFF.md` | Actualizado con todos los cambios recientes |

### Sesión 25 de junio — Admin Performance: Employees + Beneficiaries Pagination (Fases 2-3)
| Archivo | Cambio |
|---------|--------|
| `backend/src/employees/dto/employee-query.dto.ts` | Añadidos `page` y `pageSize` opcionales |
| `backend/src/employees/employees.service.ts` | Paginación server-side con `skip`/`take` + `count()`; búsqueda ampliada a 6 campos |
| `backend/src/beneficiaries/dto/beneficiary-query.dto.ts` | Añadidos `page` y `pageSize` opcionales |
| `backend/src/beneficiaries/beneficiaries.service.ts` | Paginación server-side con `skip`/`take` + `count()` |
| `frontend/src/api/giftAppService.js` | `giftAppGetEmployees(params)` y `giftAppGetBeneficiaries(params)` aceptan parámetros opcionales |
| `frontend/src/pages/admin/Employees.jsx` | Paginación completa: estado, fetch server-side, UI de controles, búsqueda/filtros server-side |
| `frontend/src/pages/admin/BeneficiariesAdmin.jsx` | Paginación completa: estado, fetch server-side, UI de controles, eliminado filtrado cliente |
| `frontend/src/styles/global.css` | Estilos de paginación (`.pagination-bar`, `.pagination-controls`, etc.) |

### Sesión 3 de julio — Fixes de bugs funcionales, datos y caché (Auditoría → Implementación)
| Archivo | Cambio |
|---------|--------|
| `backend/src/gifts/gifts.service.ts` | BUG-02: Fix filtro de edad (minAge-only/maxAge-only ya no son no-op). DATA-02: Restore de regalo no pisa stock a 0; StockMovement CORRECTION cuando stock cambia en restore |
| `backend/src/selections/selections.service.ts` | BUG-05: Búsqueda case-insensitive (`mode: 'insensitive'` en 6 filtros `contains`) |
| `backend/src/public-selection/public-selection.service.ts` | DATA-01: `gift.stock = newStock` después de cada decremento para auditoría StockMovement consistente cuando el mismo regalo se selecciona múltiples veces |
| `frontend/src/api/giftAppService.js` | BUG-06: Session `name` usa `user.name` con fallback a email. CACHE-01: `giftAppDeleteGift` limpia `gifts_all`. CACHE-02: `giftAppCreateCompany` limpia `companies`. CACHE-03: `giftAppUpdateCampaign`/`giftAppDeleteCampaign` limpian `campaign_${slug}` |
| `frontend/src/api/apiClient.js` | FE-06: `err.status = 401` en 3 throw sites (request, uploadRequest, downloadBlobRequest) |
| `frontend/src/api/backendApiService.js` | FE-06: `err.status = 401` en `publicRequest` |
| `frontend/src/pages/admin/AdminUsers.jsx` | BUG-01: Dropdown de compañía usa `giftAppGetCompanies()` en vez de `giftAppGetCampaigns()` |
| `frontend/src/pages/admin/Campaigns.jsx` | BUG-07: `setEditing(result)` después de crear campaña para evitar duplicado si falla upload de logo |
| `frontend/src/pages/admin/Selections.jsx` | FE-05: Toast de error en export (antes silencioso). Añadido `useToast` + `<Toast>` |
| `frontend/src/pages/public/BeneficiarySelection.jsx` | BUG-08: Empleado CONFIRMED redirige a `/already-confirmed` (no a `/login`). FE-06: `err.status === 401` en vez de string match |
| `frontend/src/pages/public/Summary.jsx` | BUG-08: Empleado CONFIRMED redirige a `/already-confirmed`. Guard de sessionStorage reestructurado. FE-06: `err.status === 401` |
| `frontend/src/pages/public/AlreadyConfirmed.jsx` | FE-06: `err.status === 401` en vez de string match |
| `frontend/src/utils/validators.js` | FE-04: `validateAge` rechaza vacío/whitespace/null/undefined antes de `Number()` |

### Sesión 4 de julio — Fix de logout inesperado por errores transitorios (BUG-09)
| Archivo | Cambio |
|---------|--------|
| `frontend/src/api/backendApiService.js` | BUG-09: `getAdminMe()` catch solo limpia token si `err.status === 401`. Errores 400/500/network ya no eliminan un token válido. |
| `frontend/src/pages/admin/AdminLayout.jsx` | BUG-09: Nuevo estado `sessionError`. Si `/auth/me` falla pero el token sigue en localStorage, muestra mensaje "No se pudo validar la sesión. Intenta recargar." con botón "Reintentar" en vez de redirigir a login. En 401 real, apiClient ya limpió el token y se redirige a login como antes. |

### Sesión 6 de julio — Email OTP público con Resend (Phases 2-7)
| Archivo | Cambio |
|---------|--------|
| `backend/prisma/schema.prisma` | +6 campos OTP en modelo Employee (emailOtpHash, emailOtpExpiresAt, emailOtpSentAt, emailOtpLastUsedAt, emailOtpLockedUntil, emailOtpAttempts) |
| `backend/prisma/migrations/20260706111836_add_employee_email_otp_fields/migration.sql` | Nueva migración — ALTER TABLE Employee ADD COLUMN (6 campos) |
| `backend/src/common/services/email.service.ts` | **NUEVO** — EmailService con Resend. Envía OTP por email. Key lazy-init. Nunca loguea el código. |
| `backend/src/public-auth/public-auth.service.ts` | +`requestCode()`, +`verifyCode()`, +`buildLoginResponse()` (shared), +`generateOtpCode()` (crypto.randomInt), +`getOtpConfig()`. Refactor: `employeeLogin()` ahora delega a `buildLoginResponse()`. Anti-enumeración: respuestas genéricas. Rollback de hash si Resend falla. Lock después de 5 intentos. |
| `backend/src/public-auth/public-auth.controller.ts` | +`POST auth/request-code`, +`POST auth/verify-code` (con @Throttle 5/min) |
| `backend/src/public-auth/public-auth.module.ts` | +EmailService como provider |
| `backend/src/public-auth/dto/request-code.dto.ts` | **NUEVO** — DTO con campaignSlug + documentId |
| `backend/src/public-auth/dto/verify-code.dto.ts` | **NUEVO** — DTO con campaignSlug + documentId + code (regex `^\d{6}$`) |
| `backend/src/campaigns/campaigns.service.ts` | `findBySlug()` ahora retorna `otpEnabled` (boolean derivado de `PUBLIC_LOGIN_OTP_ENABLED`) |
| `backend/.env` | +7 variables: PUBLIC_LOGIN_OTP_ENABLED, EXPIRY_MINUTES, MAX_ATTEMPTS, LOCK_MINUTES, RESEND_COOLDOWN_SECONDS, RESEND_API_KEY, EMAIL_FROM |
| `backend/.env.example` | +7 variables con documentación |
| `backend/package.json` | +dependencia `resend` |
| `frontend/src/api/backendApiService.js` | +`publicRequestOtpCode()`, +`publicVerifyOtpCode()` |
| `frontend/src/api/giftAppService.js` | +`giftAppPublicRequestOtpCode()`, +`giftAppPublicVerifyOtpCode()` (backend only) |
| `frontend/src/pages/public/EmployeeLogin.jsx` | Flujo OTP de 2 pasos condicional según `campaign.otpEnabled`. Paso 1: documentId + "Enviar código". Paso 2: input código 6 dígitos + "Continuar" + "Reenviar código" con cooldown 60s. Token storage y navegación idénticos al flujo clásico. |

### Sesión 8 de julio — Gift Images: Multi-file upload (up to 3 images per gift)
| Archivo | Cambio |
|---------|--------|
| `backend/src/gifts/gifts.admin.controller.ts` | `FileInterceptor` → `FilesInterceptor('image', 3)` con Multer `limits.fileSize` para early rejection. Método `uploadImage()` → `uploadImages()`. |
| `backend/src/gifts/gifts.service.ts` | `uploadImage(single)` → `uploadImages(files[])`. Count-based limit enforcement (max 3 total por gift). Append sortOrder en vez de shift. Preservar primary existente. Solo un `isPrimary=true`. |
| `frontend/src/pages/admin/Gifts.jsx` | `selectedImage` → `selectedImages[]`. Input con `multiple`. Preview grid con thumbnails, nombres, tamaños. Contador "(X de 3 imágenes)". Mensaje "Ya alcanzaste el máximo" cuando lleno. |
| `frontend/src/api/backendApiService.js` | `uploadGiftImage(giftId, files)` acepta `File \| File[]`. |

### Sesión 8 de julio — Gift Images: Parallel upload + debug
| Archivo | Cambio |
|---------|--------|
| `backend/src/gifts/gifts.service.ts` | Serial `for...of` → `Promise.all` para subir imágenes a Supabase en paralelo. Con 3 imágenes reduce de ~3× a ~1× el tiempo de subida. |

### Sesión 13 de julio — Runtime Stability Improvements (Fases P2A-P2D)

| Archivo | Cambio |
|---------|--------|
| `backend/src/common/filters/http-exception.filter.ts` | **P2A:** Clasificación de errores Prisma corregida. Transient errors (`P1001`, `P1002`, `P1008`, `P1017`, `P2024`, etc.) → 503. Unknown P-codes → 500. `P2003`/`P2007`/`P2014` → 400 explícito. Todos los códigos Prisma logueados server-side. |
| `backend/src/gifts/gifts.service.ts` | **P2B:** Compensating cleanup en `uploadImages`. `Promise.all` → `Promise.allSettled` con `storagePath` capturado. Si una subida falla o la transacción DB falla, los archivos subidos exitosamente se eliminan de Supabase Storage (best-effort). |
| `backend/src/employees/dto/employee-query.dto.ts` | **P2C:** Añadido `@Max(100)` a `pageSize`. |
| `backend/src/beneficiaries/dto/beneficiary-query.dto.ts` | **P2C:** Añadido `@Max(100)` a `pageSize`. |
| `backend/src/selections/dto/selection-query.dto.ts` | **P2C:** Añadido `@Max(100)` a `pageSize`. |
| `backend/jest.config.js` | **P2D:** Creado — configuración de Jest con ts-jest. |
| `backend/test/setup.ts` | **P2D:** Creado — setup de reflect-metadata para Jest. |
| `backend/test/mocks/prisma.factory.ts` | **P2D:** Creado — shared mock helpers para PrismaService. |
| `backend/src/common/filters/http-exception.filter.spec.ts` | **P2D:** Creado — 14 tests de clasificación de errores (P2002→409, P2025→404, P2003/P2007/P2014→400, P1001/P2024→503, unknown→500, generic Error→500, no Prisma leaks). |
| `backend/src/gifts/gifts.service.spec.ts` | **P2D:** Creado — 6 tests de limpieza compensatoria (success, one-fail cleanup, transaction-fail cleanup, cleanup-fail preserves error, slot limit, empty files). |
| `backend/src/employees/employees-query.spec.ts` | **P2D:** Creado — 8 tests de validación de pageSize en 3 DTOs (100 accept, 101 reject, omitted ok). |
| `backend/src/public-selection/public-selection.service.spec.ts` | **P2D:** Creado — 3 tests de stock decrement con mismo regalo para múltiples beneficiarios. |
| `backend/package.json` | **P2D:** Añadidos scripts `test`, `test:watch`, `test:cov`; devDeps `jest`, `ts-jest`, `@types/jest`, `@nestjs/testing`. |

### Sesión 13 de julio — Health and Version Endpoints (Phase A)

| Archivo | Cambio |
|---------|--------|
| `backend/src/health/health.module.ts` | **Creado** — NestJS module para health endpoints. |
| `backend/src/health/health.controller.ts` | **Creado** — 3 endpoints públicos con `@SkipThrottle()`: `live`, `ready`, `version`. |
| `backend/src/health/health.service.ts` | **Creado** — Liveness (no-op), readiness (`SELECT 1` + 2s timeout con `Promise.race`), version (package.json + env vars, leídos una vez en constructor). |
| `backend/src/health/health.controller.spec.ts` | **Creado** — 12 tests: liveness, readiness success/DB-failure/timeout (fake timers), version (APP_COMMIT/GIT_COMMIT fallbacks, BUILD_DATE, NODE_ENV fallback, no secrets). |
| `backend/src/app.module.ts` | **Modificado** — Añadido `HealthModule` a imports. |
| `backend/.env.example` | **Modificado** — Añadidos placeholders opcionales `APP_COMMIT`, `GIT_COMMIT`, `BUILD_DATE`. |

### Sesión 14 de julio — Structured Performance Timing (Phase B)

| Archivo | Cambio |
|---------|--------|
| `backend/src/main.ts` | **Modificado** — Eliminado registro global del viejo `TimingInterceptor` para prevenir eventos duplicados. |
| `backend/src/common/decorators/track-performance.decorator.ts` | **Creado** — `@TrackPerformance(operation)` con `SetMetadata`. |
| `backend/src/common/interceptors/performance-timing.interceptor.ts` | **Creado** — Interceptor basado en metadata con `process.hrtime.bigint()`, allowlist de metadata, y flag `ENABLE_TIMING_LOGS` (true/1/yes/on). Hooks `tap` + `catchError` garantizan exactamente un evento. |
| `backend/src/common/interceptors/performance-timing.interceptor.spec.ts` | **Creado** — 22 tests: flag disabled/enabled, success/failure, paginated metadata, import aggregates, export fileSizeBytes, privacy enforcement, all 9 operations, duplicate prevention. |
| `backend/src/auth/auth.controller.ts` | **Modificado** — `+@UseInterceptors` + `@TrackPerformance('admin.auth.me')` en `getProfile`. |
| `backend/src/dashboard/dashboard.admin.controller.ts` | **Modificado** — `+@UseInterceptors` + `@TrackPerformance('admin.dashboard.stats')` en `getStats`. |
| `backend/src/employees/employees.admin.controller.ts` | **Modificado** — `+@UseInterceptors` + `@TrackPerformance('admin.employees.list')` en `findAll`. |
| `backend/src/beneficiaries/beneficiaries.admin.controller.ts` | **Modificado** — `+@UseInterceptors` + `@TrackPerformance('admin.beneficiaries.list')` en `findAll`. |
| `backend/src/selections/selections.admin.controller.ts` | **Modificado** — `+@UseInterceptors` + `@TrackPerformance('admin.selections.list')` en `findAll`. |
| `backend/src/public-selection/public-selection.controller.ts` | **Modificado** — `+@UseInterceptors` + `@TrackPerformance('public.gifts.compatible')` en `getCompatibleGifts`; `+@UseInterceptors` + `@TrackPerformance('public.selection.confirm')` en `confirmSelection`. |
| `backend/src/imports/imports.admin.controller.ts` | **Modificado** — `+@UseInterceptors` + `@TrackPerformance('admin.import.employees-beneficiaries')` en `uploadEmployeesBeneficiaries`. |
| `backend/src/reports/reports.admin.controller.ts` | **Modificado** — `+@UseInterceptors` + `@TrackPerformance('admin.export.selections')` en `exportXlsx`. |

### Sesión 22 de julio — Employee Excel Export + Authorization Scoping (Fase G)

| Archivo | Cambio |
|---------|--------|
| `backend/src/employees/employees.service.ts` | **Modificado** — +import `ExcelJS`, `EmployeeStatus`, helpers locales (`sanitizeExcelCell`, `translateEmployeeStatus`, `formatDateCO`, `styleHeader`). +método `exportXlsx()`: single Prisma query, company scoping, status filtering (PENDING/IN_PROGRESS/CONFIRMED default, BLOCKED→400), `_count` beneficiaries, 13-column Excel workbook, formula-injection protection, deterministic ordering. |
| `backend/src/employees/employees.admin.controller.ts` | **Modificado** — +import `Res`, `Response`, `todayString()`. +endpoint `GET export-xlsx` con `@Roles('SUPER_ADMIN','COMPANY_VIEWER')` (ADMIN excluido), `@TrackPerformance('admin.export.employees')`, response `Content-Type: xlsx`. |
| `backend/src/common/interceptors/performance-timing.interceptor.ts` | **Modificado** — +`'admin.export.employees'` en la verificación de `fileSizeBytes`. |
| `frontend/src/api/backendApiService.js` | **Modificado** — +`downloadEmployeesExcel(query)` → `apiClient.downloadBlob('/admin/employees/export-xlsx', query)`. |
| `frontend/src/api/giftAppService.js` | **Modificado** — +`giftAppDownloadEmployeesExcel(params)` — backend-only. |
| `frontend/src/pages/admin/Employees.jsx` | **Modificado** — +import `giftAppDownloadEmployeesExcel`, +estado `exporting`, +`handleExport()` con UX guard para BLOCKED (toast sin llamada API), +botón "Exportar empleados" en `admin-topbar` visible para todos los roles. |
| `backend/src/employees/employees-export.spec.ts` | **Creado** — 42 tests: status defaults, BLOCKED exclusion, invalid→400, filters, no pagination, deterministic order, query structure, company scoping, workbook structure (sheet name, 13 Spanish headers, status translation, data mapping, leading zeros, null cells, no internal ID, no OTP fields), formula injection (=+−@), header styling (frozen, bold, autoFilter). |
| `backend/src/common/guards/roles-guard-employees-export.spec.ts` | **Creado** — 12 tests: SUPER_ADMIN/COMPANY_VIEWER allowed, ADMIN denied, unauthenticated denied, null/undefined user denied, existing list endpoint preserved (3 roles). |
| `backend/src/selections/selections-export-compatibility.spec.ts` | **Creado** — 10 tests: 3 sheets preserved, headers unchanged (13/12/7), scoping, no pagination (no skip/take), campaign/date filters, cross-company protection, valid buffer. |

### Sesión 23 de julio — Admin User Deletion (COMPANY_VIEWER)

| Archivo | Cambio |
|---------|--------|
| `backend/src/admin-users/admin-users.service.ts` | **Modificado** — +import `ForbiddenException`. +método `remove(targetUserId, authenticatedUserId)`: self-deletion guard, existencia check, atomic `deleteMany` con filtro `role: { name: 'COMPANY_VIEWER' }` (protección contra race condition), retorna `{ success, message }`. |
| `backend/src/admin-users/admin-users.admin.controller.ts` | **Modificado** — +imports `Delete`, `Req`, `Request`. +endpoint `DELETE :id` con `@HttpCode(HttpStatus.OK)`, extrae `req.user.userId` tipado como `{ userId: number }`, protegido por `@Roles('SUPER_ADMIN')` (heredado de clase). |
| `frontend/src/api/backendApiService.js` | **Modificado** — +`deleteAdminUser(id)` → `apiClient.delete('/admin/users/${id}')`. |
| `frontend/src/api/giftAppService.js` | **Modificado** — +`giftAppDeleteAdminUser(id)` — backend-only. |
| `frontend/src/pages/admin/AdminUsers.jsx` | **Modificado** — +import `giftAppDeleteAdminUser`, +`session` de `useOutletContext()`, +estado `deleteTarget`, +`handleDelete()`, +botón "Eliminar" visible solo si `isSuperAdmin && u.role?.name === 'COMPANY_VIEWER' && u.id !== session?.id`, +ConfirmDialog con mensaje de advertencia sobre preservación de datos, éxito: remueve de lista local + toast, fallo: preserva fila + toast error. |
| `backend/src/admin-users/admin-users-remove.spec.ts` | **Creado** — 16 tests: SUPER_ADMIN delete COMPANY_VIEWER, reject SUPER_ADMIN target, reject ADMIN target, reject self-deletion, NotFoundException, role leído de DB, race-condition protection (deleteMany count=0), single deleteMany call, related entities untouched, Prisma failure propagation, COMPANY_VIEWER rejected by route guard, unauthenticated rejected, deleted viewer findUnique returns null, deleted viewer JWT rejected, deleting SUPER_ADMIN stays logged in. |

---

## 9. Estado Actual de Git

```
Branch: versionD
Last commit: 9991fe5 "Merge pull request #5 from david808pm/version"

Changes not staged (sesiones previas + sesiones 3, 4, 6, 8, 13-14 y 23 de julio + Sesión 30):
   - backend/src/campaigns/campaigns.service.ts                    (fix slug duplicado + otpEnabled en findBySlug + Sesión 30: persistencia banner en create/update, selects con bannerImageUrl/bannerDecoration, P2022 fallback eliminado, limpieza compensatoria en uploadBanner)
   - backend/src/imports/imports.service.ts                        (Sesión 23b julio: validación completa pre-write + regla atómica; anterior: bulk employee + beneficiary optimization)
   - backend/src/prisma/prisma.service.ts                          (sin cambios funcionales)
   - backend/src/public-selection/public-selection.service.ts       (DATA-01: fix StockMovement stale previousStock)
   - backend/src/employees/dto/employee-query.dto.ts               (page + pageSize + @Max(100))
   - backend/src/employees/employees.service.ts                    (paginación + búsqueda ampliada)
   - backend/src/employees/employees.admin.controller.ts           (Phase B: +@TrackPerformance + @UseInterceptors)
   - backend/src/beneficiaries/dto/beneficiary-query.dto.ts        (page + pageSize + @Max(100))
   - backend/src/beneficiaries/beneficiaries.service.ts            (paginación)
   - backend/src/beneficiaries/beneficiaries.admin.controller.ts   (Phase B: +@TrackPerformance + @UseInterceptors)
   - backend/src/gifts/gifts.service.ts                            (BUG-02: fix age filter + DATA-02: fix restore stock + multi-image upload + parallel Supabase + compensating cleanup)
   - backend/src/gifts/gifts.admin.controller.ts                   (multi-image: FilesInterceptor + Multer limits)
   - backend/src/selections/selections.service.ts                 (BUG-05: case-insensitive search)
   - backend/src/selections/dto/selection-query.dto.ts            (@Max(100) en pageSize)
   - backend/src/selections/selections.admin.controller.ts        (Phase B: +@TrackPerformance + @UseInterceptors)
   - backend/src/common/interceptors/performance-timing.interceptor.ts (Phase G: +admin.export.employees fileSizeBytes check; Sesión 23b julio: FIX allowlist de import keys a keys canónicas de ImportResult)
   - backend/src/common/interceptors/performance-timing.interceptor.spec.ts (Sesión 23b julio: specs de import metadata actualizadas a keys canónicas)
   - backend/src/public-auth/public-auth.controller.ts             (+2 endpoints OTP)
   - backend/src/public-auth/public-auth.service.ts                (+requestCode, +verifyCode, refactor buildLoginResponse)
   - backend/src/public-auth/public-auth.module.ts                 (+EmailService provider)
   - backend/src/public-selection/public-selection.controller.ts  (Phase B: +@TrackPerformance ×2)
   - backend/src/common/filters/http-exception.filter.ts           (P2A: Prisma error classification — transient→503, unknown→500)
   - backend/src/app.module.ts                                  (Phase A: +HealthModule import)
   - backend/src/main.ts                                           (Phase B: removed old TimingInterceptor global reg)
   - backend/src/auth/auth.controller.ts                           (Phase B: +@TrackPerformance + @UseInterceptors)
   - backend/src/dashboard/dashboard.admin.controller.ts           (Phase B: +@TrackPerformance + @UseInterceptors)
   - backend/src/imports/imports.admin.controller.ts               (Phase B: +@TrackPerformance + @UseInterceptors)
   - backend/src/reports/reports.admin.controller.ts               (Phase B: +@TrackPerformance + @UseInterceptors)
   - backend/src/admin-users/admin-users.service.ts                (Sesión 23 julio: +remove() con atomic deleteMany)
   - backend/src/admin-users/admin-users.admin.controller.ts       (Sesión 23 julio: +DELETE :id endpoint)
   - backend/prisma/schema.prisma                                  (+6 campos OTP en Employee)
   - backend/.env.example                                          (+7 variables OTP/Resend + APP_COMMIT/GIT_COMMIT/BUILD_DATE placeholders)
   - backend/package.json                                          (+dependencia resend + test scripts + jest/ts-jest devDeps)
   - frontend/src/api/giftAppService.js                            (params opcionales + BUG-06 + CACHE-01/02/03 + funciones OTP + export empleados + deleteAdminUser)
   - frontend/src/api/apiClient.js                                 (FE-06: err.status = 401)
   - frontend/src/api/backendApiService.js                         (FE-06 + BUG-09 + funciones OTP + uploadGiftImage accepts File[] + export empleados + deleteAdminUser)
   - frontend/src/pages/admin/Gifts.jsx                            (multi-image input, previews, count display)
   - frontend/src/pages/admin/AdminLayout.jsx                      (BUG-09: estado error transitorio)
   - frontend/src/pages/admin/AdminUsers.jsx                       (BUG-01: company dropdown fix + Sesión 23 julio: delete button, ConfirmDialog, handler)
   - frontend/src/pages/admin/Campaigns.jsx                        (fix preview slug + BUG-07 + Sesión 30: banner en create/edit, estado canónico, preview blob, cache clear)
   - frontend/src/components/BannerEditor.jsx                      (Sesión 30: refactor a controlado — sin useEffects de sincronización)
   - frontend/src/api/giftAppService.js                            (Sesión 30: bannerImageUrl/bannerDecoration en payloads create/update)
   - frontend/src/pages/admin/Selections.jsx                       (FE-05: export error toast)
   - frontend/src/pages/admin/Employees.jsx                        (paginación server-side + export Excel empleados + UX guard BLOCKED + Sesión 23b julio: reporte de issues de validación con canImport banner)
   - frontend/src/pages/admin/BeneficiariesAdmin.jsx               (paginación server-side)
   - frontend/src/pages/public/BeneficiarySelection.jsx            (BUG-08 + FE-06)
   - frontend/src/pages/public/Summary.jsx                         (BUG-08 + FE-06)
   - frontend/src/pages/public/AlreadyConfirmed.jsx                (FE-06)
   - frontend/src/pages/public/EmployeeLogin.jsx                   (flujo OTP de 2 pasos)
   - frontend/src/utils/validators.js                              (FE-04: empty age validation)
   - frontend/src/styles/global.css                                (estilos de paginación)
   - HANDOFF.md                                                    (Sesión 31: sección 31 + esta lista)
   - backend/package.json                                          (Sesión 31: +jszip directa + script benchmark:gift-import)
   - backend/package-lock.json                                     (Sesión 31: jszip)
   - backend/src/app.module.ts                                     (Sesión 31: +GiftImportsModule)
   - backend/src/gifts/gifts.module.ts                             (Sesión 31: exporta SupabaseStorageService)
   - backend/src/common/interceptors/performance-timing.interceptor.ts (Sesión 31: allowlist gift-import.validate/commit)
   - backend/src/common/interceptors/performance-timing.interceptor.spec.ts (Sesión 31: +2 tests allowlist)
   - frontend/src/api/backendApiService.js                         (Sesión 31: +validateGiftImportPackage/+commitGiftImportPackage/+downloadGiftImportTemplate)
   - frontend/src/api/giftAppService.js                            (Sesión 31: +giftAppValidateGiftImport/+giftAppCommitGiftImport/+giftAppDownloadGiftImportTemplate)
   - frontend/src/pages/admin/Gifts.jsx                            (Sesión 31: botones Crear regalo + Importar regalos + modal 3 fases)

Deleted (not staged):
   - Informe_Auditoria_mimo-regalos.docx
   - empleados-test.xlsx
   - ~$empleados-test.xlsx

Untracked files:
   - HANDOFF.md
   - backend/.env.us-west-2-backup
   - backend/src/common/interceptors/timing.interceptor.ts
   - backend/src/common/services/email.service.ts               # [NUEVO] EmailService con Resend
   - backend/src/dashboard/dashboard.cache.ts
   - backend/src/public-auth/dto/request-code.dto.ts            # [NUEVO]
   - backend/src/public-auth/dto/verify-code.dto.ts             # [NUEVO]
   - backend/src/common/filters/http-exception.filter.spec.ts   # [NUEVO] P2D: 14 tests
   - backend/src/gifts/gifts.service.spec.ts                    # [NUEVO] P2D: 6 tests
   - backend/src/employees/employees-query.spec.ts              # [NUEVO] P2D: 8 tests
   - backend/src/public-selection/public-selection.service.spec.ts # [NUEVO] P2D: 3 tests
   - backend/jest.config.js                                     # [NUEVO] P2D
   - backend/test/setup.ts                                      # [NUEVO] P2D
    - backend/test/mocks/prisma.factory.ts                       # [NUEVO] P2D
    - backend/src/health/health.module.ts                        # [NUEVO] Phase A
    - backend/src/health/health.controller.ts                    # [NUEVO] Phase A
    - backend/src/health/health.service.ts                       # [NUEVO] Phase A
    - backend/src/health/health.controller.spec.ts               # [NUEVO] Phase A
    - backend/src/common/decorators/track-performance.decorator.ts # [NUEVO] Phase B
    - backend/src/common/interceptors/performance-timing.interceptor.ts # [NUEVO] Phase B
    - backend/src/common/interceptors/performance-timing.interceptor.spec.ts # [NUEVO] Phase B
    - backend/test-timing.sh
   - backend/uploads/campaign-logos/1781982821926-m3r40d.png
   - frontend/src/utils/simpleCache.js
   - backend/src/employees/employees-export.spec.ts              # [NUEVO] Fase G: 42 tests
   - backend/src/common/guards/roles-guard-employees-export.spec.ts # [NUEVO] Fase G: 12 tests
    - backend/src/selections/selections-export-compatibility.spec.ts # [NUEVO] Fase G: 10 tests
    - backend/src/admin-users/admin-users-remove.spec.ts            # [NUEVO] Sesión 23 julio: 16 tests
    - backend/src/imports/import-validation.ts                      # [NUEVO] Sesión 23b julio: capa de validación pura
    - backend/src/imports/imports-validation.spec.ts               # [NUEVO] Sesión 23b julio: 33 tests de validadores puros
    - backend/src/imports/imports-atomic.spec.ts                    # [NUEVO] Sesión 23b julio: 8 tests de regla atómica
    - backend/src/campaigns/campaigns-banner.spec.ts               # [NUEVO] Sesión 30: 11 tests de persistencia de banner
    - backend/prisma/migrations/20260804000000_add_campaign_banner_fields/migration.sql # [NUEVO] Sesión 30: ALTER TABLE idempotente (IF NOT EXISTS)
    - backend/test/mocks/prisma.factory.ts                       # [NUEVO] P2D
    - backend/src/health/health.module.ts                        # [NUEVO] Phase A
    - backend/src/health/health.controller.ts                    # [NUEVO] Phase A
    - backend/src/health/health.service.ts                       # [NUEVO] Phase A
    - backend/src/health/health.controller.spec.ts               # [NUEVO] Phase A
    - backend/src/common/decorators/track-performance.decorator.ts # [NUEVO] Phase B
    - backend/src/common/interceptors/performance-timing.interceptor.ts # [NUEVO] Phase B
    - backend/src/common/interceptors/performance-timing.interceptor.spec.ts # [NUEVO] Phase B
    - backend/test-timing.sh
   - backend/uploads/campaign-logos/1781982821926-m3r40d.png
   - frontend/src/utils/simpleCache.js
   - backend/src/employees/employees-export.spec.ts              # [NUEVO] Fase G: 42 tests
   - backend/src/common/guards/roles-guard-employees-export.spec.ts # [NUEVO] Fase G: 12 tests
    - backend/src/selections/selections-export-compatibility.spec.ts # [NUEVO] Fase G: 10 tests
    - backend/src/admin-users/admin-users-remove.spec.ts            # [NUEVO] Sesión 23 julio: 16 tests
    - backend/scripts/benchmark-gift-import.ts                      # [NUEVO] Sesión 31: benchmark manual 10/25/50 regalos
    - backend/src/gift-imports/                                     # [NUEVO] Sesión 31: Bulk Gift Import (Excel+ZIP) — 11 archivos
   - tigo_import_500_empleados.xlsx
   - tigo_import_500_empleados_nuevos_datos.xlsx
 ```

**IMPORTANTE:** Todos los cambios desde la sesión del 17 de junio NO han sido commiteados. Se deben commitear antes de desplegar a producción.

---

## 10. Problemas Conocidos y Deuda Técnica

### Alto impacto
1. ~~**Pool de conexiones = 10:** El dashboard dispara 21 queries paralelas. Con cache esto se mitiga, pero bajo carga concurrente puede saturarse.~~ → Resuelto: Dashboard consolidado de 21 → 9 queries con `groupBy` (Phase F).
2. **JWT strategy hace DB lookup en cada request:** Cada llamada autenticada al admin hace 1 query extra. Podría cachearse con TTL corto.

### Medio impacto
3. **Sin paginación en gifts, selections, support-requests:** Employees y beneficiaries ya tienen paginación server-side. Gifts, selections y support-requests aún no.
4. ~~**Sin caching en otros endpoints:** Solo el dashboard tiene cache. Campaigns se re-fetch en 6 de 8 páginas admin.~~ → Parcialmente resuelto: cache de companies, gifts y campaign por slug implementado con invalidación en mutaciones (CACHE-01/02/03). Faltan otros endpoints.
5. **Sin React.memo/useMemo/useCallback:** Todos los componentes re-renderizan completamente.
6. **Sin virtualización de tablas:** Paginación implementada para employees y beneficiaries; gifts, selections y support-requests aún renderizan todas las filas.

### Bajo impacto
7. **CSS global único:** 14KB de CSS se carga en todas las páginas.
8. **Duplicación de `publicRequest` en backendApiService.js:** ~40 líneas duplicadas de `request()`.

### Fixes completados en sesión 3 de julio (auditoría → implementación)
- ✅ BUG-01: AdminUsers dropdown de compañía usaba campañas en vez de companies
- ✅ BUG-02: Filtro de edad de regalos era no-op con un solo bound (minAge o maxAge)
- ✅ BUG-05: Búsqueda de selecciones era case-sensitive
- ✅ BUG-06: Sidebar mostraba email en vez de nombre
- ✅ BUG-07: Fallo de upload de logo tras crear campaña podía duplicar la campaña
- ✅ BUG-08: Empleado CONFIRMED en /select o /summary iba a /login en vez de /already-confirmed
- ✅ DATA-01: StockMovement.previousStock stale cuando mismo regalo seleccionado múltiples veces
- ✅ DATA-02: Restore de regalo soft-deleted pisaba stock a 0 si dto.stock omitido
- ✅ CACHE-01: Cache de gifts no se invalidaba al eliminar regalo
- ✅ CACHE-02: Cache de companies no se invalidaba al crear empresa
- ✅ CACHE-03: Cache de campaign por slug no se invalidaba al actualizar/eliminar campaña
- ✅ FE-04: Edad vacía pasaba validación como 0
- ✅ FE-05: Errores de export Excel eran silenciosos
- ✅ FE-06: Redirects 401 dependían de string matching frágil

### Fixes completados en sesión 4 de julio (sesión/logout regression)
- ✅ BUG-09: Logout inesperado por errores 400/500/network en `/api/auth/me`. `getAdminMe()` limpiaba token válido en cualquier error. Ahora solo limpia en 401 real. AdminLayout muestra estado de error transitorio con botón "Reintentar" en vez de redirigir a login.

### Fixes completados en sesión 13 de julio (estabilidad de runtime)
- ✅ DB-ERR-01: Errores transitorios de Prisma (P1001, P1002, P1008, P1017, P2024, etc.) se retornaban como HTTP 400. Ahora → HTTP 503 con mensaje genérico "Servicio no disponible temporalmente. Intenta nuevamente."
- ✅ DB-ERR-02: Códigos Prisma desconocidos se retornaban como HTTP 400. Ahora → HTTP 500.
- ✅ DB-ERR-03: P2002 y P2025 no se logueaban server-side. Ahora todos los códigos Prisma se loguean.
- ✅ IMG-ORPHAN-01: Archivos huérfanos en Supabase Storage cuando una subida o transacción fallaba. Ahora hay limpieza compensatoria con `Promise.allSettled` + `deleteFile` (best-effort).
- ✅ PAGESIZE-01: Sin límite en `pageSize` para employees, beneficiaries y selections. Ahora `@Max(100)` en los 3 DTOs.
- ✅ TEST-01: Sin tests automatizados. Ahora 31 tests unitarios en 4 suites con Jest + ts-jest.

### Pendientes de la auditoría (no abordados en esta fase)
- SEC-01: Secrets en git history (`.env.us-west-2-backup` trackeado)
- SEC-02: JWT secrets reutilizados entre proyectos
- SEC-03: CORS `origin: true` + credentials
- SEC-04: Gift image upload sin magic-byte validation
- SEC-05: Placeholder secrets pasan validación de `requireEnv`
- SEC-06: Public JWT strategy no re-valida contra DB
- SEC-07: RolesGuard no global (opt-in por controller)
- DEP-01: Migraciones gitignored, no en version control
- DEP-02: 2193 archivos de node_modules commiteados, sin root .gitignore
- DEP-03: NODE_ENV=development en .env de producción
- DEP-04: VITE_API_URL=/api relativo (requiere proxy en producción)
- DEP-05: Bucket `campaign-logos` hardcoded, no documentado en .env.example
- DEP-06: uploads/ commiteado en git
- ~~AUTH-01/02/03: Sin lockout por cuenta, sin trust proxy, documentId como única credencial~~ → **Parcialmente resuelto (sesión 6 de julio):** OTP por email implementado con lockout de 5 intentos / 10 min, cooldown de reenvío 60s, anti-enumeración. El endpoint clásico (documentId-only) sigue funcionando para rollback.
- BUG-03: Cancelled selection re-confirmation deadlock (latente)
- BUG-04: CONFIRMED employees bypass campaign window al re-emitir token
- FE-02: Token storage en localStorage (XSS)
- FE-03: Sin refresh token

---

## 11. Próximos Pasos Sugeridos (Priorizados)

### Inmediato
1. **Commitear todos los cambios** desde la sesión del 17 de junio (incluyendo fixes de las sesiones 3, 4 y 6 de julio)
2. **Actualizar variables de entorno en Render** con las nuevas DATABASE_URL y DIRECT_URL de us-east-1
3. **Redeploy backend en Render** y verificar conectividad
4. **Verificar que el frontend no tiene errores de consola**
5. **Verificar un dominio en Resend** (resend.com/domains) y cambiar `EMAIL_FROM` de `onboarding@resend.dev` a un dominio propio (ej: `no-reply@tudominio.com`). El `onboarding@resend.dev` solo permite enviar al email del dueño de la cuenta.

### Corto plazo
5. **Agregar paginación** a endpoints de lista restantes (gifts, selections, support-requests)
6. ~~**Cache de campañas en frontend** (se fetch en 6 páginas admin)~~ → Cache con invalidación implementado (CACHE-03)
7. **Aumentar connection_limit a 15** si se observa saturación del pool (propuesta conservadora)

### Mediano plazo
8. ~~**Consolidar queries del dashboard** con `groupBy` (21 queries → ~8 queries)~~ → Completado (Phase F, 21 → 9 queries)
9. **Agregar React.memo** a componentes de tabla y listas
10. **Implementar AbortController** para cancelar requests al desmontar componentes

### Completado
- ✅ Employees paginación server-side (pageSize 50, selector 25/50/100, búsqueda en 6 campos)
- ✅ Beneficiaries paginación server-side (pageSize 50, selector 25/50/100, búsqueda server-side)
- ✅ BUG-01: AdminUsers company dropdown fix
- ✅ BUG-02: Gifts age-range filter fix
- ✅ BUG-05: Selections case-insensitive search
- ✅ BUG-06: Admin sidebar name display fix
- ✅ BUG-07: Campaigns duplicate prevention on logo failure
- ✅ BUG-08: CONFIRMED employee redirect to already-confirmed
- ✅ BUG-09: Unexpected logout on transient /auth/me errors (400/500/network)
- ✅ DATA-01: StockMovement previousStock consistency fix
- ✅ DATA-02: Gift restore stock preservation fix
- ✅ CACHE-01/02/03: Cache invalidation on mutations (gifts, companies, campaigns)
- ✅ FE-04: Empty age validation fix
- ✅ FE-05: Export error toast
- ✅ FE-06: Structured 401 error status
- ✅ Employee Excel Export: endpoint `GET /admin/employees/exportxlsx`, 13 columnas, SUPER_ADMIN + COMPANY_VIEWER, company scoping, status filter (PENDING/IN_PROGRESS/CONFIRMED default, BLOCKED→400), formula-injection protection, single Prisma query sin N+1, 64 nuevos tests
- ✅ COMPANY_VIEWER Selection Export: ya funcionaba correctamente, verificado con 10 tests de compatibilidad
- ✅ Admin User Deletion: SUPER_ADMIN puede eliminar COMPANY_VIEWER via `DELETE /api/admin/users/:id`, atomic `deleteMany` con filtro de rol, self-deletion protegido, ADMIN/SUPER_ADMIN rechazados, 12 FK audit columns (ON DELETE SET NULL) seguras, sin migración de schema, 16 tests, frontend con ConfirmDialog y eliminación local de fila
- ✅ Excel Import Validation Hardening: capa de validación pura (`import-validation.ts`), códigos estables (14 códigos), validación completa de cada fila/columna (no para en el primer error), cross-row detection (DUPLICATE_BENEFICIARY_IN_FILE, CONFLICTING_EMPLOYEE_DATA), regla atómica (ERROR → 0 writes, `$transaction` nunca llamado), ImportResult extendido (`canImport`, `issues`, `errorCount`), fix del allowlist de PerformanceTimingInterceptor (import metadata ahora se emite), frontend con banner "Importación bloqueada" + lista rich de issues, 41 tests (33 de validadores puros + 8 de regla atómica con .xlsx reales), 16 suites / 243 tests total
- ✅ Bulk Gift Import (Excel + ZIP): Sesión 31. `POST /api/admin/gift-import/{validate,commit}` + `GET /template` (SUPER_ADMIN). Headers Excel en español (12 columnas, alias `Imagenes`), ZIP con carpetas top-level por regalo (máx 3 imágenes/regalo), parser jszip con seguridad (traversal, encrypted via loadAsync, zip bomb, ambigüedad case-insensitive `DUPLICATE_IMAGE_FOLDER_CASE_INSENSITIVE`, magic bytes), límites conservadores (Excel 5 MB, ZIP 50 MB, 50 regalos, 150 imágenes, 200 MB uncompressed, 300 entradas, concurrency 3), regla atómica (ERROR → 0 writes/uploads), **compensación all-or-nothing** en commit (borra gifts + GiftImage + storage objects del intento, espera subidas en curso, continúa si un delete falla, preserva error original; NO es atomicidad transaccional PG↔Supabase), `SupabaseStorageService` reutilizado vía export de `GiftsModule`, allowlist de timing para las 2 operaciones, modal de 3 fases en `Gifts.jsx` (`Crear regalo`/`Importar regalos`), plantilla descargable, benchmark manual 10/25/50 (`npm run benchmark:gift-import`), 66 tests nuevos, suite total 22 suites / 323 tests.

### Largo plazo
11. **Migrar a TanStack Query** para caching y deduplicación de requests
12. **Virtualización de tablas** con react-window para datasets grandes
13. ~~**Email real** (actualmente solo SIMULATED en EmailLog)~~ → **Completado (sesión 6 de julio):** Email OTP implementado con Resend. El EmailLog de confirmación de selección sigue siendo SIMULATED (futuro: integrar Resend también ahí).

---

## 12. Notas de Despliegue

### Backend
- Build: `npm run build` → genera `dist/`
- Producción: `npm run start:prod` → `node dist/main`
- Variables de entorno requeridas: DATABASE_URL, DIRECT_URL, JWT_SECRET, PUBLIC_JWT_SECRET
- Puerto: 3001 (configurable con PORT)
- Serve estático de uploads en `/uploads`

### Frontend
- Build: `npm run build` → genera `dist/`
- El build produce ~25 chunks por code splitting
- Variable VITE_API_URL debe apuntar al backend en producción
- No hay servidor estático incluido; usar Nginx, Vercel, etc.

### Base de datos
- Supabase PostgreSQL en us-east-1 (proyecto: `uqxvrmcxumqnllaobrlh`)
- Pooler transaccional en puerto 6543 (runtime)
- Pooler de sesión en puerto 5432 (migraciones)
- 2 migraciones aplicadas:
  1. `20260611015500_init_postgres` — schema inicial
  2. `20260706111836_add_employee_email_otp_fields` — campos OTP en Employee
- Backup del .env anterior (us-west-2) en `backend/.env.us-west-2-backup`

---

## 13. Reglas de Oro del Proyecto

Estas reglas se establecieron durante las optimizaciones y deben respetarse:

1. **NO modificar lógica de stock** — El decremento de stock en la confirmación de selección es atómico y crítico.
2. **NO modificar la transacción de confirmación de selección** — Garantiza consistencia entre selección, stock y email log.
3. **NO modificar el flujo público de autenticación** — Los empleados acceden con documentId + JWT público.
4. **NO modificar company scoping** — COMPANY_VIEWER solo ve datos de su empresa.
5. **NO modificar roles/permisos** — SUPER_ADMIN, ADMIN, COMPANY_VIEWER.
6. **NO modificar el schema de Prisma** sin migración explícita.
7. **NO agregar paquetes** sin aprobación explícita.
8. **NO cambiar connection_limit** sin evidencia de saturación del pool.

---

## 14. Archivos de Prueba

| Archivo | Descripción |
|---------|-------------|
| `tigo_import_500_empleados.xlsx` | 500 empleados para prueba de importación masiva (original) |
| `tigo_import_500_empleados_nuevos_datos.xlsx` | 500 empleados — nuevos datos, usa campaignSlug `tigo-2026` |

### Formato esperado del Excel de importación
Columnas: `campaignSlug`, `employeeDocumentId`, `employeeFullName`, `employeeEmail`, `employeePhone`, `shippingAddress`, `shippingCity`, `beneficiaryFullName`, `beneficiaryAge`, `beneficiaryGender`

**Reglas de validación:** ver Sección 29 para la lista completa de validaciones, códigos estables, regla atómica y validaciones por campo (email, teléfono, documento, edad, género, duplicados cross-row).

---

## 15. Contacto y Contexto Adicional

- **Proyecto original:** mimo-regalostestv7/mimo-regalostestv4
- **Versión anterior de referencia:** mimo-regalostestv4 (dentro del mismo directorio)
- **Informe de auditoría:** `Informe_Auditoria_mimo-regalos.docx`
- **Fecha de última sesión:** 20 de agosto de 2026
- **Sesiones previas:** 6 fases de optimización de rendimiento + migración a us-east-1 + fix slug duplicado + bulk employee/beneficiary + employees/beneficiaries pagination + auditoría completa + 14 fixes de bugs funcionales/datos/caché/frontend + BUG-09 fix logout + Email OTP público con Resend (request-code, verify-code, anti-enumeración, lockout, rollback) + Gift images multi-file upload (hasta 3 imágenes por regalo, FilesInterceptor, parallel Supabase upload) + Health/version endpoints (Phase A) + Structured performance timing (Phase B) + Reproducible benchmark + layered latency diagnosis (Phases C/D) + Auth/me query optimization (Phase E) + Dashboard query consolidation with groupBy (Phase F, 21→9 queries) + Employee Excel export + authorization scoping (Phase G) + Admin User Deletion (SUPER_ADMIN delete COMPANY_VIEWER, atomic deleteMany role filter, 16 tests) + Excel Import Validation Hardening (regla atómica, capa de validación pura, códigos estables, cross-row detection, 41 tests) + Campaign Banner en Create Mode (Sesión 30: persistencia completa de bannerImageUrl/bannerDecoration en create/update, selects admin, migración idempotente, BannerEditor controlado, limpieza compensatoria en uploadBanner, bucket campaign-logos creado en Supabase) + Bulk Gift Import Excel+ZIP (Sesión 31: validate/commit/template, jszip directa, compensación all-or-nothing, límites conservadores 50 regalos/150 imágenes, 66 tests, benchmark 10/25/50)
- **Supabase us-east-1:** Proyecto `uqxvrmcxumqnllaobrlh` en Virginia del Norte
- **Resend:** API key restringida a envío de emails. Cuenta: david808pm@hotmail.com. EMAIL_FROM temporal: `onboarding@resend.dev` (solo envía al dueño de la cuenta). Para producción: verificar dominio en resend.com/domains.
- **Empresas creadas:** Default Company, Nutresa, Coca-Cola, Tigo, EMP, Novaventa, TestCacheCompany (esta última creada durante verificación de CACHE-02)
- **Campañas activas:** `tigo-2026` (Tigo), `emp-navidad` (EMP), `coca-cola-mundial-2026` (Coca-Cola), `novaventa-premios` (Novaventa)

---

## 16. Gift Images — Supabase Storage (Multi-Image Support)

Gift image upload to Supabase Storage with support for **up to 3 images per gift**.

### Architecture
- SUPER_ADMIN selects image files from local PC via `<input type="file" multiple>`.
- Frontend sends files to backend using `multipart/form-data` (field name: `image`).
- Backend validates file type (`image/jpeg`, `image/png`, `image/webp`) and size (max 2MB per file).
- Backend uploads files to Supabase Storage bucket `gift-images` **in parallel** (`Promise.all`).
- Backend saves the Supabase public URLs in existing `GiftImage.imageUrl`.
- React does not connect directly to Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` is backend-only (never exposed to frontend).
- **No files stored in backend/uploads, local filesystem, or base64 in DB.**

### Storage path
```
campaign-{campaignId}/gift-{giftId}/{crypto.randomUUID()}.{ext}
```
Example: `campaign-7/gift-7/e2bf52e3-d58d-47b1-9096-bbea40a52aa6.png`

### Image limit — Max 3 total images
- Limit counts: existing GiftImage rows + external URL images + new uploaded files.
- 0 existing → can upload up to 3.
- 1 existing → can upload up to 2 more.
- 2 existing → can upload 1 more.
- 3 existing → upload rejected: "Un regalo puede tener máximo 3 imágenes."
- Validation runs **before** any file is uploaded to Supabase (no partial uploads).

### Upload ordering & isPrimary behavior
- **Gift has no existing images:** first uploaded becomes primary (`isPrimary=true`, `sortOrder=0`). Subsequent uploads get next sortOrder values.
- **Gift already has images:** existing images are **preserved** (not shifted). New images are **appended** with next sortOrder values. Existing primary image stays primary.
- Only one `isPrimary=true` per gift.
- `gift.imageUrls[0]` is always the primary image (sorted by `sortOrder asc`).
- Public gift card and summary continue using `gift.imageUrls[0]`.
- GiftDetailModal shows all available images (up to 3).

### Endpoint
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/admin/gifts/:id/images` | `SUPER_ADMIN` only | Upload 0-3 images via `multipart/form-data`, field `image` |

### Controller: `FilesInterceptor` (replaced old `FileInterceptor`)
- Accepts up to 3 files with field name `image`.
- Multer `limits.fileSize` = 2MB for early rejection.
- Backward compatible: single file with field `image` still works.

### Performance: Parallel Supabase uploads
- Files uploaded to Supabase Storage via `Promise.all()` instead of sequential `for...of`.
- With 3 images: upload time reduced from ~3× to ~1× single-upload duration.

### Frontend
- Admin gift form: `<input type="file" multiple accept="image/jpeg,image/png,image/webp">`.
- Shows file names, sizes, and preview thumbnails for each selected file.
- Shows "(X de 3 imágenes)" counter when editing.
- Disables file input with "Ya alcanzaste el máximo de 3 imágenes" when max reached.
- Existing external URL textarea preserved for backward compatibility.
- External URLs count toward the 3-image limit.
- Images uploaded **after** gift creation (create gift → upload images → refresh list).
- Cache `gifts_all` cleared after successful upload; list auto-refreshes.

### Data flow
```
Admin PC files → <input multiple> → FormData('image', file[]) → POST /api/admin/gifts/:id/images
→ FilesInterceptor extracts files → validate MIME/size/count → Promise.all upload to Supabase Storage
→ GiftImage rows created with sortOrder + isPrimary → findOne() returns updated gift
→ Frontend ignores response, clears cache, refetches gift list
→ mapGiftFromApi: gift.images → gift.imageUrls → render in table/public
```

### Validation
| Test | Result |
|------|--------|
| SUPER_ADMIN upload 1 image | ✅ |
| SUPER_ADMIN upload 3 images | ✅ |
| 4th image rejected | ✅ "Un regalo puede tener máximo 3 imágenes" |
| Invalid file type rejected | ✅ |
| File >2MB rejected | ✅ |
| COMPANY_VIEWER cannot upload | ✅ |
| Existing external URLs preserved | ✅ |
| Exactly one `isPrimary=true` per gift | ✅ |
| sortOrder deterministic (append, not shift) | ✅ |
| Images stored in Supabase Storage (not local fs) | ✅ |
| Public gift modal shows multiple images | ✅ |
| Public card uses `imageUrls[0]` | ✅ |
| Admin table shows `imageUrls[0]` | ✅ |
| Image previews (thumbnails, names, sizes) | ✅ |
| Edit flow shows existing count + remaining slots | ✅ |
| Backward compat: single file upload via `image` field | ✅ |
| Parallel Supabase upload via `Promise.all` | ✅ |

### Files modified (this session)
| File | Change |
|------|--------|
| `backend/src/gifts/gifts.admin.controller.ts` | `FileInterceptor` → `FilesInterceptor('image', 3)` with Multer `limits.fileSize` |
| `backend/src/gifts/gifts.service.ts` | `uploadImage()` → `uploadImages()`: count-based limit enforcement, append sortOrder (preserve primary), parallel Supabase upload with `Promise.all` |
| `frontend/src/pages/admin/Gifts.jsx` | `selectedImage` → `selectedImages[]`, multi-file input, preview grid with thumbnails/names/sizes, existing count display, max-reached message |
| `frontend/src/api/backendApiService.js` | `uploadGiftImage(giftId, files)` now accepts `File | File[]` |

### NO modifications to
- Prisma schema, GiftImage model
- Stock logic, selection confirmation
- Public employee flow, Excel import/export, logistics export
- Company scoping, roles/permissions, campaign logic, dashboard
- Pagination, Resend OTP, campaign logo upload, localStorageService
- GiftDetailModal (already supports multiple), public Summary, public gift card
- `supabase-storage.service.ts`, `gifts.module.ts`
- Route paths, UI design system

---

## 17. Validación Final del Flujo Público — 20 de junio de 2026

Se realizó una prueba completa del flujo público de selección de regalos con resultado exitoso.

### Empleado de prueba
- **Documento:** `7000000492`
- **Nombre:** Tatiana Emiliano Navarro Salazar
- **Campaña:** Tigo 2026
- **Beneficiarios:** 2 (Tomás Ortega Herrera, Renata Valencia Rodríguez)

### Regalo seleccionado
- PS5 / Referencia `10003` (mismo regalo para ambos beneficiarios)

### Resultados
| Verificación | Resultado |
|-------------|-----------|
| POST `/api/public/selections/confirm` | HTTP 200 |
| ThankYou page | "Gracias por usar la plataforma de selección de regalos" |
| Botón "Salir" | Redirige a `/campaign/tigo-2026/login` |
| Re-login | Redirige a AlreadyConfirmed |
| Estado del empleado | CONFIRMED |
| SelectionItems creados | 2 (coincide con beneficiarios) |
| Stock PS5 | 30 → 28 (decrementado correctamente) |
| Errores de consola | 0 |
| Viewport probado | 390×844 (iPhone 12/13/14) |

---

## 18. Sesión 3 de julio — Fixes de bugs funcionales, datos y caché

Se completó una auditoría completa del proyecto seguida de una fase de implementación de 14 fixes aprobados. No se modificó lógica de negocio protegida, schema, rutas, ni diseño UI.

### Auditoría previa
Se realizó una auditoría exhaustiva (read-only) cubriendo backend, frontend, schema, configuración y despliegue. Se identificaron ~50 findings clasificados por severidad. La auditoría completa está disponible en el historial de la sesión.

### Fixes implementados (14 items)

#### Group A — Bugs funcionales
| ID | Descripción | Archivos |
|----|-------------|----------|
| BUG-01 | AdminUsers dropdown de compañía usaba `giftAppGetCampaigns()` en vez de `giftAppGetCompanies()` — COMPANY_VIEWER recibía campaignId como companyId | `AdminUsers.jsx` |
| BUG-02 | Filtro de edad de regalos era no-op cuando solo se proveía minAge o maxAge (variables cruzadas) | `gifts.service.ts` |
| BUG-05 | Búsqueda de selecciones era case-sensitive (sin `mode: 'insensitive'`) | `selections.service.ts` |
| BUG-06 | `giftAppService.js` mapeaba `name: user.email` — sidebar mostraba email en vez de nombre | `giftAppService.js` |
| BUG-07 | Tras crear campaña + fallo de upload de logo, el modal quedaba en modo create — re-click duplicaba la campaña | `Campaigns.jsx` |
| BUG-08 | Empleado CONFIRMED visitando `/select` o `/summary` era redirigido a `/login` en vez de `/already-confirmed` | `BeneficiarySelection.jsx`, `Summary.jsx` |

#### Group B — Data correctness
| ID | Descripción | Archivos |
|----|-------------|----------|
| DATA-01 | `StockMovement.previousStock` era stale cuando el mismo regalo se seleccionaba para múltiples beneficiarios — `gift.stock` del snapshot in-memory no se actualizaba entre decrementos | `public-selection.service.ts` |
| DATA-02 | Restore de regalo soft-deleted pisaba stock a 0 si `dto.stock` era omitido; sin StockMovement de auditoría | `gifts.service.ts` |

#### Group C — Cache invalidation
| ID | Descripción | Archivos |
|----|-------------|----------|
| CACHE-01 | `giftAppDeleteGift` no invalidaba cache `gifts_all` — regalo eliminado visible por 30s | `giftAppService.js` |
| CACHE-02 | `giftAppCreateCompany` no invalidaba cache `companies` — empresa nueva invisible por 60s | `giftAppService.js` |
| CACHE-03 | `giftAppUpdateCampaign`/`giftAppDeleteCampaign` no invalidaban cache `campaign_${slug}` — página pública stale por 60s | `giftAppService.js` |

#### Group D — Frontend form/functionality
| ID | Descripción | Archivos |
|----|-------------|----------|
| FE-04 | `validateAge('')` pasaba como edad 0 (Number('') === 0) — edad vacía aceptada silenciosamente | `validators.js` |
| FE-05 | Errores de export Excel en Selections eran silenciosamente ignorados (`catch { // silently ignore }`) | `Selections.jsx` |
| FE-06 | Redirects 401 en flujo público usaban `err.message.includes('Sesión')` — string matching frágil | `apiClient.js`, `backendApiService.js`, `BeneficiarySelection.jsx`, `Summary.jsx`, `AlreadyConfirmed.jsx` |

### Cambios técnicos clave

**BUG-02 (age filter):** Las condiciones estaban cruzadas — `minAge` branch usaba `maxAge` y viceversa. Corregido: cada branch usa su propia variable.
```typescript
// Antes (bug): minAge branch referencia maxAge → no-op si maxAge es undefined
if (minAge !== undefined) { where.AND.push({ minAge: { lte: maxAge } }); }
if (maxAge !== undefined) { where.AND.push({ maxAge: { gte: minAge } }); }

// Después (fix): cada branch usa su propia variable
if (minAge !== undefined) { where.AND.push({ maxAge: { gte: minAge } }); }
if (maxAge !== undefined) { where.AND.push({ minAge: { lte: maxAge } }); }
```

**DATA-01 (StockMovement):** Una sola línea añadida después del `newStock` para actualizar el snapshot in-memory:
```typescript
gift.stock = newStock; // Update in-memory snapshot for next iteration's previousStock
```
El guard atómico `updateMany({ where: { stock: { gt: 0 } } })` NO fue modificado.

**DATA-02 (restore stock):** Cambio de `stock: dto.stock ?? 0` a inclusión condicional:
```typescript
if (dto.stock !== undefined) { restoreData.stock = dto.stock; }
```
Más StockMovement CORRECTION cuando stock cambia explícitamente.

**BUG-07 (duplicate prevention):** `setEditing(result)` después de `giftAppCreateCampaign` para que re-submit sea update, no create.

**BUG-08 (Summary redirect):** Guard de sessionStorage reestructurado — si `sessionRaw` existe pero `selectionsRaw` no (cleared tras confirmación), se procede al session check en vez de redirigir a login inmediatamente.

**FE-06 (401 status):** `err.status = 401` adjuntado al Error lanzado; páginas públicas usan `err.status === 401` en vez de string matching.

### Verificación

| Test | Resultado |
|------|-----------|
| AdminUsers: dropdown usa companies | ✅ Browser |
| AdminUsers: company column muestra Nutresa | ✅ Browser |
| Gifts: minAge-only filter funciona | ✅ API |
| Gifts: maxAge-only filter funciona | ✅ API |
| Gifts: both bounds filter funciona | ✅ API |
| Selections: case-insensitive search | ✅ API |
| Admin sidebar: muestra "Super Admin" (nombre) | ✅ Browser |
| CONFIRMED employee /select → /already-confirmed | ✅ Browser |
| CONFIRMED employee /summary → /already-confirmed | ✅ Browser |
| Campaigns: company aparece inmediatamente tras crear | ✅ Browser (TestCacheCompany) |
| Export Excel funciona | ✅ Browser |
| validateAge('') → error | ✅ Console |
| validateAge('0') → null (valid) | ✅ Console |
| Backend build | ✅ |
| Frontend build | ✅ |

### Áreas protegidas confirmadas como no modificadas (sesiones 3 y 4 de julio)
- Stock decrement logic (updateMany guard)
- Selection confirmation transaction
- Public flow behavior (except approved redirects)
- Excel import/export contract
- Logistics export format
- Company scoping
- Roles/permissions
- Prisma schema
- Migrations
- Route paths
- UI design
- localStorageService
- Supabase Storage strategy
- DIRECT_URL/directClient strategy
- JWT payloads (no modificados en BUG-09)
- Refresh token logic (no implementado, no introducido)
- Public employee token handling (aislado del fix de admin)

### Datos de prueba creados
- **TestCacheCompany:** Empresa creada durante verificación de CACHE-02. Puede eliminarse via admin UI si se desea.

---

## 19. Sesión 6 de julio — Email OTP Público con Resend

Se implementó el login de empleados públicos por código OTP (one-time password) enviado por email usando Resend. El endpoint clásico de documentId-only se mantiene sin cambios para rollback.

### Feature flag
`PUBLIC_LOGIN_OTP_ENABLED` controla todo:
- `false`: frontend usa flujo clásico (documentId → JWT). Endpoints OTP retornan 403.
- `true`: frontend usa flujo OTP (documentId → código email → JWT). Endpoint clásico sigue funcionando.

El campo `otpEnabled` (boolean) se añadió a la respuesta de `GET /api/public/campaigns/:slug` para que el frontend detecte el modo sin exponer secrets.

### Endpoints nuevos

| Método | Path | Descripción |
|--------|------|-------------|
| POST | `/api/public/auth/request-code` | Genera OTP de 6 dígitos, hashea con bcrypt, envía por email via Resend |
| POST | `/api/public/auth/verify-code` | Verifica el código, retorna misma response shape que `employee-login` |

**Payload request-code:** `{ campaignSlug, documentId }`
**Payload verify-code:** `{ campaignSlug, documentId, code }`

Ambos con `@Throttle({ default: { ttl: 60000, limit: 5 } })` (5 req/min por IP).

### Anti-enumeración
- **request-code** siempre retorna 200 con mensaje genérico: `"Si los datos son válidos, enviaremos un código al correo registrado."` — sin importar si el empleado existe, está bloqueado, o no tiene email.
- **verify-code** retorna 400 con `"El código es inválido o ha expirado."` para cualquier fallo (código incorrecto, expirado, sin hash, empleado no existe).
- Lock después de 5 intentos: `"Has excedido el número de intentos permitidos. Intenta nuevamente en unos minutos."`

### Seguridad
- OTP se genera con `crypto.randomInt` (criptográficamente seguro)
- OTP se hashea con bcrypt antes de guardar (nunca se almacena plain)
- OTP **nunca** se loguea (ningún `console.log`/`Logger` incluye el código)
- `RESEND_API_KEY` solo en backend `.env` (gitignored). Nunca se expone al frontend.
- No existe `VITE_RESEND_API_KEY` en ningún archivo del proyecto.
- Cooldown de reenvío: 60 segundos (configurable)
- Lock: 5 intentos fallidos → 10 minutos de bloqueo (configurable)
- Expiración: 10 minutos (configurable)
- Si Resend falla después de guardar el hash: se hace rollback (hash, expiresAt, sentAt, attempts, lockedUntil → null/0) y se retorna 503 controlado: `"No fue posible enviar el código. Intenta nuevamente en unos minutos."`

### Response shape de verify-code (idéntica a employee-login)
```json
// Empleado PENDING/IN_PROGRESS:
{
  "accessToken": "eyJ...",
  "employee": { "id": 101, "fullName": "...", "documentId": "...", "status": "IN_PROGRESS" },
  "campaign": { "id": 1, "name": "...", "slug": "...", "logoText": "...", "primaryColor": "..." }
}

// Empleado CONFIRMED:
{
  "alreadyConfirmed": true,
  "accessToken": "eyJ...",
  "employee": { "id": 109, "fullName": "...", "documentId": "...", "status": "CONFIRMED" },
  "campaign": { "id": 1, "name": "...", "slug": "...", "logoText": "...", "primaryColor": "..." }
}
```

### Email template
- **Subject:** `"Tu código de acceso para seleccionar tu regalo"`
- **Contenido:** Nombre del empleado, nombre de la campaña, URL de la campaña, código de 6 dígitos (grande, con letter-spacing), fecha de expiración, mensaje `"Si no solicitaste este código, puedes ignorar este correo."`
- HTML profesional con inline styles, HTML-escaped para prevenir inyección.

### Refactor del endpoint clásico
`employeeLogin()` ahora delega a `buildLoginResponse(employee, campaign)` — método privado compartido con `verifyCode()`. Esto garantiza que la response shape sea idéntica. La lógica (BLOCKED check, CONFIRMED check, window check, beneficiary check, PENDING→IN_PROGRESS, issue token) no cambió — solo se movió a un método compartido.

### Frontend — EmployeeLogin.jsx
- Si `campaign.otpEnabled === true`: flujo de 2 pasos.
  - Paso 1: input documentId + botón "Enviar código". On success: mensaje "Revisa tu correo electrónico..." + avanza al paso 2.
  - Paso 2: input código 6 dígitos + botón "Continuar" + botón "Reenviar código" (con cooldown 60s client-side). Botón "Volver" al paso 1.
- Si `campaign.otpEnabled !== true`: flujo clásico (documentId + "Continuar").
- Token storage, sessionStorage y navegación idénticos en ambos modos.

### Migración
`20260706111836_add_employee_email_otp_fields` — ALTER TABLE Employee ADD COLUMN:
- `emailOtpHash` VARCHAR(255) nullable
- `emailOtpExpiresAt` TIMESTAMP nullable
- `emailOtpSentAt` TIMESTAMP nullable
- `emailOtpLastUsedAt` TIMESTAMP nullable
- `emailOtpLockedUntil` TIMESTAMP nullable
- `emailOtpAttempts` INTEGER NOT NULL DEFAULT 0

No se modificaron constraints, relaciones ni otros modelos.

### Variables de entorno añadidas
| Variable | Default | Descripción |
|----------|---------|-------------|
| `PUBLIC_LOGIN_OTP_ENABLED` | `false` | Feature flag principal |
| `PUBLIC_LOGIN_OTP_EXPIRY_MINUTES` | `10` | Tiempo de vida del OTP |
| `PUBLIC_LOGIN_OTP_MAX_ATTEMPTS` | `5` | Intentos fallidos antes de lock |
| `PUBLIC_LOGIN_OTP_LOCK_MINUTES` | `10` | Duración del lock |
| `PUBLIC_LOGIN_OTP_RESEND_COOLDOWN_SECONDS` | `60` | Cooldown entre envíos |
| `RESEND_API_KEY` | — | API key de Resend (backend only) |
| `EMAIL_FROM` | `no-reply@giftapp.local` | Remitente del email |

### Pruebas realizadas (6 de julio)

**Feature flag OFF:**
| Test | Resultado |
|------|----------|
| Campaign response incluye `otpEnabled: false` | ✅ |
| Login clásico (documentId-only) funciona | ✅ |
| Endpoints OTP retornan 403 | ✅ |

**Feature flag ON (con dummy key — Resend falla):**
| Test | Resultado |
|------|----------|
| Campaign response incluye `otpEnabled: true` | ✅ |
| Request-code válido → 503 controlado + rollback de hash | ✅ |
| Wrong documentId → 200 genérico (sin enumeración) | ✅ |
| Invalid code format → 400 validación DTO | ✅ |
| Verify sin OTP generado → 400 genérico | ✅ |
| Wrong code → 400 genérico + attempt increment | ✅ |
| 5 intentos fallidos → lock (emailOtpAttempts=5, lockedUntil set) | ✅ |
| Old endpoint funciona alongside new (rollback) | ✅ |

**Feature flag ON (con Resend key real — email llega):**
| Test | Resultado |
|------|----------|
| Request-code válido → 200 genérico + email enviado via Resend | ✅ |
| Email recibido en david808pm@hotmail.com con código 6 dígitos | ✅ |
| Verify-code con código correcto → 200 + accessToken + employee + campaign | ✅ |
| PENDING → IN_PROGRESS | ✅ |
| OTP fields cleared after verify (hash=null, attempts=0, lastUsedAt set) | ✅ |
| CONFIRMED employee verifica código → alreadyConfirmed: true + accessToken | ✅ |

### Configuración de Resend
- **API key:** Restringida a solo envío de emails (no puede listar/crear dominios)
- **Cuenta:** david808pm@hotmail.com
- **EMAIL_FROM actual:** `onboarding@resend.dev` — **TEMPORAL**, solo envía al email del dueño de la cuenta
- **Para producción:** Verificar un dominio en resend.com/domains y cambiar `EMAIL_FROM` a `no-reply@tudominio.com`

### Áreas protegidas confirmadas como no modificadas
- Stock logic (updateMany guard)
- Selection confirmation transaction
- Public selection behavior after login (mismo JWT, mismo buildLoginResponse)
- Excel import/export
- Logistics export
- Company scoping
- Roles/permissions
- Supabase Storage
- Route paths (AppRoutes.jsx no modificado)
- UI design (mismo layout, estilos, responsive)
- localStorageService
- DIRECT_URL/directClient strategy
- JWT payloads (mismo issueToken, mismo public JWT payload)
- Migrations existentes (solo se añadió una nueva, no se modificaron las existentes)
- Constraints y relationships (no se tocaron)

---

## 20. Sesión 13 de julio — Runtime Stability Improvements

### 20.1 Prisma error classification

**Archivo:** `backend/src/common/filters/http-exception.filter.ts`

El filtro global de excepciones HTTP ahora clasifica correctamente los errores de Prisma:

| Prisma Code | HTTP Status | Meaning |
|---|---|---|
| `P2002` | 409 Conflict | Unique constraint violation |
| `P2025` | 404 Not Found | Record not found |
| `P2003`, `P2007`, `P2014` | 400 Bad Request | FK constraint, data validation, invalid relation |
| `P1001`, `P1002`, `P1003`, `P1008`, `P1010`, `P1011`, `P1012`, `P1013`, `P1015`, `P1017`, `P2024` | **503 Service Unavailable** | Transient database errors (connection, timeout, pool) |
| Unknown P-code | 500 Internal Server Error | Unexpected |

**Before:** Todos los códigos no-P2002/P2025 de `PrismaClientKnownRequestError` se retornaban como HTTP 400 — incluyendo errores transitorios como conexiones caídas (`P1001`), timeouts (`P1002`, `P1008`, `P2024`) y cierres de servidor (`P1017`).

**After:** Errores transitorios → 503 con mensaje `"Servicio no disponible temporalmente. Intenta nuevamente."`. Errores desconocidos → 500. Detalles de Prisma (código, stack, meta) se loguean server-side pero **nunca** se retornan al cliente.

**Cambio adicional:** Los códigos `P2002` y `P2025` ahora también se loguean server-side (antes no se logueaban).

### 20.2 Gift image upload cleanup

**Archivo:** `backend/src/gifts/gifts.service.ts` (método `uploadImages`, líneas 363–459)

Las subidas paralelas a Supabase Storage ahora incluyen limpieza compensatoria:

- Se usa `Promise.allSettled` en vez de `Promise.all` para conocer el resultado de cada subida.
- Se captura `storagePath` de cada archivo subido para poder eliminarlo en caso de fallo.
- Si **una subida falla**, los archivos exitosos de la misma petición se eliminan de Supabase Storage (best-effort).
- Si la **transacción Prisma falla** después de subidas exitosas, todos los archivos subidos se eliminan.
- Los errores de limpieza no reemplazan el error original (se loguean con `logger.warn`).
- No se crean filas parciales de `GiftImage`.
- No se eliminan imágenes preexistentes del regalo.
- El límite de 3 imágenes, tipos MIME, 2MB límite, bucket, storage path, comportamiento primary/sortOrder, y response shape exitosa **no cambiaron**.

### 20.3 Pagination protection

**Archivos:**
- `backend/src/employees/dto/employee-query.dto.ts`
- `backend/src/beneficiaries/dto/beneficiary-query.dto.ts`
- `backend/src/selections/dto/selection-query.dto.ts`

Se añadió `@Max(100, { message: 'pageSize no debe ser mayor a 100.' })` al campo `pageSize` en los 3 DTOs de paginación.

| pageSize | Result |
|---|---|
| 25, 50, 100 | Aceptado |
| 101+ | HTTP 400 rechazado |
| Omitido (sin `page`/`pageSize`) | Flat array backward-compatible |

**No se añadió paginación a otros módulos.** Las llamadas no-paginadas (dropdowns, export) siguen funcionando sin cambios.

### 20.4 Automated tests

**Archivos creados:**
- `backend/jest.config.js`
- `backend/test/setup.ts` (import de `reflect-metadata`)
- `backend/test/mocks/prisma.factory.ts` (shared mock helpers)
- `backend/src/common/filters/http-exception.filter.spec.ts` (14 tests)
- `backend/src/gifts/gifts.service.spec.ts` (6 tests)
- `backend/src/employees/employees-query.spec.ts` (8 tests)
- `backend/src/public-selection/public-selection.service.spec.ts` (3 tests)

**Dependencias añadidas:** `jest`, `ts-jest`, `@types/jest`, `@nestjs/testing`

**Scripts añadidos a `backend/package.json`:**
- `npm test` — `jest`
- `npm run test:watch` — `jest --watch`
- `npm run test:cov` — `jest --coverage`

**Resultados:**
```
Test Suites: 4 passed, 4 total
Tests:       31 passed, 31 total
```

**Cobertura de tests:**

| Suite | Tests | Escenarios cubiertos |
|---|---|---|
| http-exception.filter.spec.ts | 14 | P2002→409, P2025→404, P2003/P2007/P2014→400, P1001/P2024→503, unknown→500, generic Error→500, no Prisma leaks, response shape, HttpException passthrough |
| gifts.service.spec.ts | 6 | All uploads succeed, one fails→cleanup, transaction fails→cleanup, cleanup-fail preserves original error, slot limit enforcement, empty files |
| employees-query.spec.ts | 8 | EmployeeQueryDto: 25/50/100 accepted, 101 rejected, omitted ok; BeneficiaryQueryDto/SelectionQueryDto: 100 accepted, 101 rejected |
| public-selection.service.spec.ts | 3 | Same gift for 2 beneficiaries: stock=2 succeeds, stock=1 second fails, StockMovement previousStock tracking correct |

**Los tests no se conectan a Supabase, no envían emails via Resend, y no suben archivos a Storage real. Usan mocks exclusivamente.**

### 20.5 Build verification

| Build | Result |
|---|---|
| Backend (`npm run build`) | ✅ |
| Frontend (`npm run build`) | ✅ |

### 20.6 Áreas protegidas confirmadas como no modificadas

- Stock decrement rules (`updateMany` guard atómico)
- Selection confirmation transaction
- Public gift selection behavior
- OTP authentication behavior
- Admin JWT architecture
- JWT payloads and expiration
- Excel import/export contract
- Logistics workbook structure
- Company scoping
- Roles/permissions
- Prisma schema or migrations
- Route paths (no se añadieron rutas nuevas)
- UI design (ningún archivo de frontend modificado)
- Supabase Storage architecture (bucket, path scheme unchanged)
- `localStorageService.js`
- No Redis, queues, microservices, Kubernetes, refresh tokens, or new infrastructure

---

## 21. Sesión 13 de julio — Health and Version Endpoints

### 21.1 Health endpoints

**Archivos:**
- `backend/src/health/health.module.ts`
- `backend/src/health/health.controller.ts`
- `backend/src/health/health.service.ts`
- `backend/src/health/health.controller.spec.ts`
- `backend/src/app.module.ts` (modificado — +HealthModule)
- `backend/.env.example` (modificado — +APP_COMMIT, GIT_COMMIT, BUILD_DATE)

Se implementó un módulo `HealthModule` con tres endpoints públicos sin autenticación:

| Método | Path | Propósito |
|--------|------|-----------|
| GET | `/api/health/live` | Confirma que el proceso NestJS está corriendo. No accede a DB ni servicios externos. |
| GET | `/api/health/ready` | Ejecuta `SELECT 1` usando el `PrismaService` pooled con timeout de 2 segundos. Retorna 503 si la DB no está disponible o excede el timeout. |
| GET | `/api/health/version` | Retorna metadatos de build: nombre y versión desde `package.json`, commit desde `APP_COMMIT` o `GIT_COMMIT`, build date desde `BUILD_DATE`, environment desde `NODE_ENV`. |

### 21.2 Response shapes

**`GET /api/health/live`** (200):
```json
{ "status": "ok", "live": true, "timestamp": "<ISO>" }
```

**`GET /api/health/ready`** (200):
```json
{ "status": "ok", "ready": true, "timestamp": "<ISO>" }
```

**`GET /api/health/ready`** fallo/timeout (503):
```json
{ "status": "error", "ready": false, "timestamp": "<ISO>" }
```

**`GET /api/health/version`** (200):
```json
{ "status": "ok", "name": "giftapp-backend", "version": "1.0.0", "commit": "unknown", "buildDate": "unknown", "environment": "development" }
```

### 21.3 Implementation details

- **Liveness:** Retorno estático, sin side effects.
- **Readiness:** `Promise.race` entre `prisma.$queryRaw\`SELECT 1\`` y un timeout de 2000ms. El error real se loguea server-side; el cliente recibe solo `{ ready: false }`. El controller usa `@Res()` para retornar 503 explícitamente sin pasar por el `HttpExceptionFilter`.
- **Version:** `name` y `version` se leen una vez de `package.json` con `readFileSync` en el constructor del `HealthService`. `commit`, `buildDate`, `environment` se leen de `process.env` en el constructor. No se ejecuta Git en runtime. No se genera ningún archivo fuente (`version.ts`).
- **Throttling:** `@SkipThrottle()` a nivel de clase para que los health probes no sean limitados por el `ThrottlerGuard` global.
- **Seguridad:** No se exponen `DATABASE_URL`, `SUPABASE_URL`, `RESEND_API_KEY`, `JWT_SECRET`, ni ninguna otra variable sensible. Solo campos públicos y controlados.

### 21.4 Tests

12 tests en `health.controller.spec.ts`:
- Liveness: `status=ok`, `live=true`, ISO timestamp válido.
- Readiness success: `SELECT 1` resuelve → `ready=true`.
- Readiness DB failure: Prisma rechaza → 503, sin detalles de DB en respuesta.
- Readiness timeout: fake timers → Prisma excede 2s → 503.
- Version: name/version correctos, `APP_COMMIT` → `GIT_COMMIT` → `'unknown'`, `BUILD_DATE` → `'unknown'`, `NODE_ENV` fallback a `'development'`, sin secrets en respuesta.

### 21.5 Build verification

| Verificación | Resultado |
|---|---|
| `npm run build` | ✅ |
| `npm test` (5 suites, 43 tests) | ✅ |
| Admin login funcional | ✅ |
| Public campaign route funcional | ✅ |
| No secrets en health responses | ✅ |
| No startup errors | ✅ |
| `HealthModule` inicializado sin errores | ✅ |

### 21.6 Variables de entorno opcionales añadidas

| Variable | Descripción |
|----------|-------------|
| `APP_COMMIT` | Commit hash (usado en `/api/health/version`) |
| `GIT_COMMIT` | Fallback para commit si `APP_COMMIT` no está definido |
| `BUILD_DATE` | Fecha de build ISO (usado en `/api/health/version`) |

Todas son opcionales. Si no están definidas, el endpoint retorna `"unknown"`.

### 21.7 Áreas protegidas confirmadas como no modificadas

- Stock decrement rules
- Selection confirmation transaction
- Public gift selection behavior
- OTP behavior
- Admin JWT architecture
- JWT payloads and expiration
- Excel import/export contract
- Logistics workbook structure
- Company scoping
- Roles/permissions
- Prisma schema or migrations
- Route paths (solo se añadieron `/api/health/*`, ninguna ruta existente fue modificada)
- UI design (ningún archivo de frontend modificado)
- Supabase Storage architecture
- `localStorageService.js`
- No Redis, queues, microservices, Kubernetes, refresh tokens, or new infrastructure
- No `@nestjs/terminus` añadido
- No archivo `version.ts` generado
- No script `generate-version.js` creado

---

## 22. Sesión 14 de julio — Structured Performance Timing

### 22.1 Overview

Se implementó un sistema de timing estructurado opt-in usando un decorador `@TrackPerformance` y un interceptor `PerformanceTimingInterceptor`. El viejo `TimingInterceptor` global fue removido de `main.ts` para prevenir eventos duplicados.

### 22.2 Feature flag

`ENABLE_TIMING_LOGS`

Valores habilitados (case-insensitive):
- `true`
- `1`
- `yes`
- `on`

Cualquier otro valor (`false`, `0`, `off`, undefined) deshabilita el timing. Se requiere reinicio del backend tras cambiar la variable. La resolución se hace una vez en el constructor del interceptor.

### 22.3 Instrumented operations

| # | Operation | Method | Controller Method |
|---|---|---|---|
| 1 | `admin.auth.me` | GET | `AuthController.getProfile` |
| 2 | `admin.dashboard.stats` | GET | `DashboardAdminController.getStats` |
| 3 | `admin.employees.list` | GET | `EmployeesAdminController.findAll` |
| 4 | `admin.beneficiaries.list` | GET | `BeneficiariesAdminController.findAll` |
| 5 | `admin.selections.list` | GET | `SelectionsAdminController.findAll` |
| 6 | `public.gifts.compatible` | GET | `PublicSelectionController.getCompatibleGifts` |
| 7 | `admin.import.employees-beneficiaries` | POST | `ImportsAdminController.uploadEmployeesBeneficiaries` |
| 8 | `admin.export.selections` | GET | `ReportsAdminController.exportXlsx` |
| 9 | `admin.export.employees` | GET | `EmployeesAdminController.exportXlsx` |
| 10 | `public.selection.confirm` | POST | `PublicSelectionController.confirmSelection` |

### 22.4 Architecture

**Archivos:**
- `backend/src/common/decorators/track-performance.decorator.ts` — `@TrackPerformance(operation)` con `SetMetadata`.
- `backend/src/common/interceptors/performance-timing.interceptor.ts` — Interceptor con DI de `Reflector`, `process.hrtime.bigint()`, y extracción de metadata por allowlist.
- `backend/src/main.ts` — Eliminado el registro global del viejo `TimingInterceptor`.

**RxJS design:**
- `tap` emite el evento de éxito.
- `catchError` emite el evento de fallo y re-lanza el error original.
- Garantía: exactamente un evento por request aprobado, nunca ambos.

**Decorator:** `@TrackPerformance('op.name')` + `@UseInterceptors(PerformanceTimingInterceptor)` en cada método aprobado.

### 22.5 Event schema

Evento emitido como JSON string via `Logger.log()` con contexto `PerformanceTiming`:

```json
{
  "event": "request_timing",
  "operation": "admin.employees.list",
  "method": "GET",
  "normalizedRoute": "/api/admin/employees",
  "statusCode": 200,
  "success": true,
  "durationMs": 45.23,
  "timestamp": "2026-07-15T02:31:56.753Z"
}
```

`durationMs` usa `process.hrtime.bigint()` con precisión de 2 decimales.

`statusCode`: del Express `response.statusCode` (éxito), `err.getStatus()` (HttpException), o `500` (error desconocido).

### 22.6 Safe optional metadata

| Operation | Metadata fields |
|---|---|
| `admin.employees.list` | `page`, `pageSize`, `resultCount`, `hasSearch`, `hasCampaignFilter`, `hasStatusFilter` |
| `admin.beneficiaries.list` | Igual que employees |
| `admin.selections.list` | Igual que employees |
| `public.gifts.compatible` | `resultCount` |
| `admin.import.employees-beneficiaries` | `rowCount`, `createdEmployees`, `createdBeneficiaries`, `skippedCount`, `errorCount` (allowlist de 5 keys de `ImportResult`) |
| `admin.export.selections` | `fileSizeBytes` (solo si el controller retorna un `Buffer` directamente) |
| `admin.auth.me`, `admin.dashboard.stats`, `public.selection.confirm` | Solo campos core — sin metadata extra |

Toda la metadata se extrae por allowlist. Nunca se copian `request.body`, `request.headers`, valores de `query` (solo booleanos de presencia), ni objetos completos de respuesta.

### 22.7 Privacy enforcement

Nunca se loguea:
- JWTs, authorization headers, cookies
- OTPs o hashes OTP
- search text, document IDs, employee/beneficiary IDs
- nombres, emails, teléfonos, direcciones
- request bodies
- filenames, image URLs
- database URLs, Prisma codes/messages
- Supabase/Resend secrets

### 22.8 Known limitations

1. **Error status puede diferir:** El interceptor registra `500` para errores desconocidos. El `HttpExceptionFilter` global puede remapear errores de Prisma a otros status codes (ej: 503). El `statusCode` logueado puede no coincidir con el HTTP response final para errores de Prisma.
2. **Export timing mide solo el handler:** `exportXlsx` usa `@Res()` y no retorna el `Buffer` al interceptor. `fileSizeBytes` se omite. Solo se mide el tiempo de ejecución del handler, no la transferencia de red.
3. **Requests rechazados por guards:** `JwtAuthGuard` rechaza antes de que el interceptor se ejecute. Requests no autenticados no producen eventos de timing.
4. **Cold-start:** El primer request tras reinicio incluye warmup de conexiones/Prisma (~1800ms). Requests subsecuentes son más rápidos (~200ms con cache).

### 22.9 Tests

22 nuevos tests en `performance-timing.interceptor.spec.ts`:
- Flag disabled: sin log, respuesta/error sin cambios.
- Flag enabled success: exactamente un timing event, identidad de respuesta preservada.
- HttpException: un failure event, statusCode de la excepción, error original preservado.
- Unknown Error: statusCode=500, error original preservado.
- Paginated metadata: page/pageSize/resultCount/filter booleans.
- Compatible gifts: resultCount desde array.
- Import aggregates: solo las 5 keys allowlist.
- Export: fileSizeBytes para Buffer, omitido para no-Buffer.
- Privacy: sin IDs/nombres/emails/search-text en eventos.
- Duration: finito y >= 0.
- Core-only operations: auth/me, confirmation, dashboard sin keys extra.
- Integration: las 9 operaciones emiten el operation metadata correcto.
- Duplicate prevention: endpoints no aprobados emiten 0 eventos, aprobados emiten exactamente 1.
- Flag values: undefined y `off` tratados como disabled.

### 22.10 Build verification

| Verificación | Resultado |
|---|---|
| Backend `npm run build` | ✅ |
| Backend `npm test` (6 suites, 74 tests) | ✅ |
| Backend `npm run test:cov` | ✅ PerformanceTiming: 100% statements |
| Frontend `npm run build` | ✅ |
| Manual: `ENABLE_TIMING_LOGS=true` | ✅ 1 evento por request aprobado, 0 para health, sin secrets |
| Manual: `ENABLE_TIMING_LOGS=false` | ✅ 0 eventos, respuestas idénticas |
| Admin login funcional | ✅ |
| Public campaign route funcional | ✅ |

### 22.11 Áreas protegidas confirmadas como no modificadas

- Stock decrement rules
- Selection confirmation transaction
- Public gift selection behavior
- OTP behavior
- Admin JWT architecture
- JWT payloads and expiration
- Excel import/export contract
- Logistics workbook structure
- Company scoping
- Roles/permissions
- Prisma schema or migrations
- Route paths (ninguna ruta existente modificada)
- UI design (ningún archivo de frontend modificado)
- Supabase Storage architecture
- `localStorageService.js`
- `HttpExceptionFilter` (no modificado)
- No Redis, queues, microservices, Kubernetes, refresh tokens, or new infrastructure

---

## 23. Sesión 15 de julio — Reproducible Performance Benchmark and Baseline (Phase C)

### 23.1 Overview

Se creó una herramienta de benchmark reproducible y de solo lectura para establecer una línea base de rendimiento. **No se realizaron optimizaciones en esta fase.**

### 23.2 Archivos creados

| Archivo | Descripción |
|---------|-------------|
| `backend/scripts/benchmark.ts` | Script principal de benchmark HTTP. Autentica, descubre campañas, mide 17 endpoints con warmup/cold/warm phases. Salida JSON + resumen en consola. |
| `backend/scripts/lib/stats.ts` | Helpers estadísticos puros: `percentile`, `mean`, `stddev`, `stats` (retorna `StatsResult` con p50/p95/p99/mean/min/max/stddev/samples). |
| `backend/scripts/lib/safety.ts` | Guardas de seguridad: `assertSafeTarget(url)` rechaza hosts de producción conocidos y requiere `ALLOW_REMOTE_BENCHMARK=true` para targets remotos. `classifyEndpoint(method, path)` clasifica endpoints como read-only/mutation/unknown. |
| `backend/scripts/lib/runner.ts` | Runner HTTP con warmup, cold-start y medición aislada por endpoint. Usa `performance.now()` para timing de cliente. |
| `backend/scripts/__tests__/stats.spec.ts` | 14 tests para helpers estadísticos (percentile, mean, stddev, stats). |
| `backend/scripts/__tests__/safety.spec.ts` | 13 tests para guardas de seguridad (localhost ok, producción rechazada, ALLOW_REMOTE_BENCHMARK, classifyEndpoint). |
| `backend/scripts/benchmark-results/` | Directorio para reportes JSON (gitignored). |

### 23.3 Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `backend/package.json` | +script `"benchmark": "npx ts-node scripts/benchmark.ts"` |
| `backend/jest.config.js` | +`'<rootDir>/scripts/**/*.spec.ts'` en `testMatch` |
| `backend/.gitignore` | +`benchmark-results/` |

### 23.4 Baseline (15 de julio, localhost → Supabase us-east-1, 5 iteraciones)

| Endpoint | p50(ms) | p95(ms) | Categoría |
|---|---|---|---|
| `health.live` | 1.86 | 2.28 | Green (~2ms) |
| `health.version` | 1.89 | 2.40 | Green (~2ms) |
| `health.ready` | 1309.64 | 1530.39 | Red (SELECT 1 + varianza) |
| `public.campaign.by-slug` | 327.41 | 330.41 | Yellow (~330ms) |
| `admin.support-requests.list` | 774.86 | 1137.77 | Yellow (~775ms) |
| `admin.companies.list` | 788.57 | 1030.38 | Yellow (~790ms) |
| `admin.dashboard.stats` | 918.47 | 1926.45 | Red (~920ms, alta varianza) |
| `admin.selections.paginated` | 950.43 | 958.35 | Yellow (~950ms) |
| `admin.users.list` | 1038.37 | 1087.77 | Yellow (~1040ms) |
| `admin.auth.me` | 994.88 | 2150.08 | Yellow (~995ms, 2 DB queries) |
| `admin.employees.paginated` | 1160.31 | 1943.71 | Yellow (~1160ms) |
| `admin.beneficiaries.paginated` | 1233.34 | 1306.85 | Yellow (~1230ms) |
| `admin.gifts.list` | 1301.79 | 1373.13 | Yellow (~1300ms) |
| `admin.employees.list` | 1878.94 | 3146.78 | Red (~1880ms, unpaginated) |
| `admin.beneficiaries.list` | 2122.15 | 2288.96 | Red (~2120ms, unpaginated) |
| `admin.selections.list` | 1913.15 | 2467.93 | Red (~1913ms, unpaginated) |
| `admin.campaigns.list` | 2112.18 | 3288.32 | Red (~2110ms, unpaginated) |

### 23.5 Observaciones clave

- Latencia de red mínima: ~350ms (SELECT 1 a us-east-1)
- Dashboard cache 30s efectivo: cold 1824ms → warm 918ms (-50%)
- Listas sin paginación ~2× más lentas que paginadas
- Alta varianza en varios endpoints (stddev > 500ms) sugiere contención de pool
- Auth JWT añade ~300-400ms overhead por request

### 23.6 Verificación

| Verificación | Resultado |
|---|---|
| Backend `npm test` (8 suites, 111 tests) | ✅ |
| Backend `npm run build` | ✅ |
| Benchmark ejecutado contra localhost | ✅ |
| Safety guard rechaza producción | ✅ |

---

## 24. Sesión 15 de julio — Layered Latency Diagnosis (Phase D)

### 24.1 Overview

Se creó una herramienta de diagnóstico de latencia que mide queries de base de datos de forma aislada (sin overhead NestJS/HTTP) para determinar exactamente dónde se gasta el tiempo. **No se realizaron optimizaciones.**

### 24.2 Archivos creados

| Archivo | Descripción |
|---------|-------------|
| `backend/scripts/diagnose-latency.ts` | Cliente standalone de Prisma. Mide 14 tipos de query con warmup + 8 iteraciones. Incluye: SELECT 1, findUnique, count, findMany con y sin paginación, 21 queries paralelos (simulando dashboard). |
| `backend/package.json` | +script `"diagnose": "npx ts-node scripts/diagnose-latency.ts"` |

### 24.3 Resultados del diagnóstico DB (8 iteraciones, Prisma standalone)

| Query | p50(ms) | Descripción |
|---|---|---|
| `db.raw.select-1` | 350 | Mínimo round-trip de red + DB |
| `db.jwt.validate` | 841 | `adminUser.findUnique(id, include role)` — costo de JwtStrategy |
| `db.auth.me` | 903 | `adminUser.findUnique(id, include role+company)` — costo de /auth/me |
| `db.count.campaigns` | 352 | COUNT simple — sin costo extra sobre baseline |
| `db.count.employees` | 609 | COUNT con join filter — +259ms |
| `db.findMany.employees-10` | 633 | findMany(skip=0, take=10) — paginado |
| `db.findMany.employees-all` | 972 | findMany todas las filas + relaciones |
| `db.parallel.21-counts` | 1485 | 21 queries en Promise.all (dashboard cache-miss) |

### 24.4 Desglose por capas

| Capa | Costo | % del total |
|---|---|---|
| HTTP + NestJS (health.live) | ~2ms | <1% |
| Red + DB mínimo (SELECT 1) | ~350ms | 47% |
| JWT auth (findUnique por request) | ~841ms | — |
| Query del controlador | 350-1000ms | variable |
| Serialización de respuesta | ~5-10ms | <1% |

### 24.5 Hallazgos críticos

1. **Latencia de red es 47-72% del tiempo total.** Ninguna optimización de aplicación puede reducir los 350ms mínimos de round-trip a us-east-1.
2. **JWT auth añade ~840ms por request autenticado.** Cada request ejecuta `adminUser.findUnique` en `JwtStrategy.validate()`, duplicando el tiempo DB para endpoints simples.
3. **Dashboard cache es efectivo.** Cache-miss (21 queries paralelos): p50=1485ms. Cache-hit: HTTP p50=918ms. Con connection_limit=10, el pool se satura con 21 queries concurrentes.
4. **Paginación beneficia más en HTTP que en DB.** DB: employees-all vs employees-10 = -35%. HTTP: -38%. El costo de serialización escala con el número de filas.
5. **Tamaño de datos no es el costo primario.** El overhead fijo de red (350ms) domina sobre el costo de transferencia de datos.

### 24.6 Verificación

| Verificación | Resultado |
|---|---|
| Backend `npm test` (8 suites, 111 tests) | ✅ |
| Diagnóstico DB ejecutado (14 queries, 8 iteraciones) | ✅ |

---

## 25. Sesión 15 de julio — Admin Auth Profile Performance Optimization (Phase E)

### 25.1 Overview

Se optimizó `GET /api/auth/me` para eliminar una consulta redundante a la base de datos. El endpoint realizaba dos lookups del mismo `AdminUser` por request HTTP: uno en `JwtStrategy.validate()` y otro en `AuthService.getProfile()`.

### 25.2 Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `backend/src/auth/strategies/jwt.strategy.ts` | `validate()` ahora incluye `name` y `company` en el query y los retorna en `req.user`. El include de Prisma expandido: `role: { select: { name: true } }` + `company: { select: { id, name, slug } }`. |
| `backend/src/auth/auth.controller.ts` | `getProfile()` reescrito para construir la respuesta directamente desde `req.user` sin llamar a `AuthService.getProfile()`. Validación de roles inline con `ForbiddenException`. Sin segundo query a DB. |

### 25.3 Archivos creados

| Archivo | Descripción |
|---------|-------------|
| `backend/src/auth/auth.controller.spec.ts` | 6 tests: respuesta desde req.user, roles ADMIN/SUPER_ADMIN/COMPANY_VIEWER aceptados, roles no-admin rechazados, mapeo userId→id, preservación de todos los campos. |
| `backend/src/auth/jwt.strategy.spec.ts` | 5 tests: perfil completo con name+company, company null, include correcto en query Prisma, user no encontrado, user inactivo. |
| `backend/scripts/benchmark-auth-me.ts` | Benchmark específico para `/auth/me` con 15 iteraciones. |

### 25.4 Resultados

| Métrica | Antes (2 queries) | Después (1 query) | Cambio |
|---|---|---|---|
| DB queries por `/auth/me` | 2 | 1 | **-50%** |
| p50 latency | 995 ms | 471 ms | **-53%** |
| p95 latency | 2150 ms | 735 ms | **-66%** |
| mean latency | 1283 ms | 512 ms | **-60%** |

### 25.5 Comportamiento de seguridad preservado

- JWT se valida contra la base de datos en cada request protegido (sin cambios).
- El `AdminUser` actual se consulta desde la base de datos (sin cambios en JwtStrategy).
- No se agregó caché de usuarios.
- Datos de rol y compañía permanecen actualizados (vienen del query de JwtStrategy).
- Usuarios no encontrados, inactivos o expirados siguen siendo rechazados.
- Forma de la respuesta sin cambios (verificado con SUPER_ADMIN y COMPANY_VIEWER).
- `AuthService.getProfile()` y `AuthService.validateUser()` preservados sin modificaciones.

### 25.6 Áreas protegidas confirmadas como no modificadas

- Admin login behavior
- Public employee login
- OTP behavior
- JWT payloads, signing, expiration
- Token storage / clearing
- Guards (JwtAuthGuard, RolesGuard)
- RolesGuard behavior
- Company scoping
- Role permissions
- Stock logic / selection confirmation
- Prisma schema / migrations
- Route paths
- Frontend UI / session behavior
- Supabase Storage
- Health endpoints
- request_timing event schema
- localStorageService

### 25.7 Verificación

| Verificación | Resultado |
|---|---|
| Backend `npm test` (10 suites, 122 tests) | ✅ |
| Backend `npm run build` | ✅ |
| Todos los endpoints autenticados funcionales (dashboard, campaigns, employees, selections, gifts, companies) | ✅ |
| Response shape preservado (SUPER_ADMIN y COMPANY_VIEWER) | ✅ |
| `/auth/me` post-cambio: p50=471ms (antes: 995ms) | ✅ |

---

## 26. Sesión 14 de julio — Safe Dashboard Query Consolidation (Phase F)

### 26.1 Overview

Se consolidaron las 21 consultas de base de datos ejecutadas por `DashboardService.getStats()` durante un cache-miss en ~9 consultas usando `Prisma.groupBy`. La forma de la respuesta del dashboard se preserva exactamente igual.

### 26.2 Estrategia de consolidación

Cada conjunto de `count()` agrupados por status se reemplazó con un único `groupBy`:

| Conjunto | Queries antes | Queries después | Técnica |
|----------|---------------|-----------------|---------|
| Campañas | 4 × `count` (all, ACTIVE, CLOSED/ARCHIVED/PAUSED, DRAFT) | 1 × `groupBy(status)` | `sumGroupCounts` + `countByField` |
| Empleados | 5 × `count` (all, PENDING, IN_PROGRESS, CONFIRMED, BLOCKED) | 1 × `groupBy(status)` | `sumGroupCounts` + `countByField` |
| Beneficiarios | 1 × `count` | 1 × `count` | Sin cambios (una sola query) |
| Regalos (counts) | 2 × `count` (all, ACTIVE, INACTIVE) | 1 × `groupBy(status)` | `sumGroupCounts` + `countByField` |
| Regalos (stock) | 1 × `aggregate(_sum: stock)` | 1 × `aggregate(_sum: stock)` | Sin cambios |
| Solicitudes soporte | 4 × `count` (all, OPEN, IN_REVIEW, RESOLVED) | 1 × `groupBy(status)` | `sumGroupCounts` + `countByField` |
| Selecciones | 2 × `count` (selectionItem CONFIRMED, selection CANCELLED) | 2 × `count` | Sin cambios (modelos diferentes) |
| Compañías | 1 × `count` | 1 × `count` | Sin cambios |
| **Total** | **21** | **9** | **-57%** |

### 26.3 Helper functions

Funciones a nivel de módulo (no exportadas) para extraer conteos de resultados de `groupBy`:

- `countFromGroup(group)`: Extrae `_count` de un resultado groupBy, manejando tanto `_count: number` como `_count: { _all: number }`.
- `sumGroupCounts(groups)`: Suma todos los conteos de un array de resultados groupBy.
- `countByField(groups, field, values)`: Suma conteos de grupos que coinciden con uno o más valores de un campo (ej: status = 'ACTIVE').

### 26.4 Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `backend/src/dashboard/dashboard.service.ts` | Reemplazadas 21 queries individuales de `count()` por 9 queries: 4 × `groupBy` + 2 × `count` + 1 × `aggregate` + 2 × `count`. Eliminada la destructuración de 21 variables. Agregadas 3 helper functions. |

### 26.5 Comportamiento preservado

- Forma de la respuesta del dashboard: **idéntica** (mismos keys, mismos tipos).
- Cache de dashboard: sin cambios (misma key, mismo TTL 30s).
- Company scoping (COMPANY_VIEWER): sin cambios (mismos filtros where).
- Filtros soft-delete: sin cambios.
- Manejo de estados faltantes: `countByField` retorna 0 si ningún grupo coincide con el status consultado (ej: 0 campañas DRAFT → retorna 0, no undefined).
- El `Promise.all` original se mantiene — las 9 queries se ejecutan concurrentemente.

### 26.6 Verificación

| Verificación | Resultado |
|---|---|
| Backend `npm test` (10 suites, 122 tests) | ✅ |
| Backend `npm run build` | ✅ |
| Frontend `npm run build` | ✅ |
| TypeScript strict (`npx tsc --noEmit`) | ✅ |
| Dashboard response shape preservado | ✅ (verificación por código — mismos keys y tipos en el objeto result) |

---

## 27. Sesión 22 de julio — Employee Excel Export + Authorization Scoping

### 27.1 Overview

Se implementaron dos capacidades de exportación Excel:

1. **Employee export** — Nuevo endpoint `GET /admin/employees/export-xlsx` que permite exportar empleados a un archivo `.xlsx` con 13 columnas.
2. **Authorization scoping** — El endpoint usa `@Roles('SUPER_ADMIN', 'COMPANY_VIEWER')` con company scoping basado en el modelo de autorización existente.

### 27.2 Employee Export — Detalles del endpoint

| Método | Path | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/admin/employees/export-xlsx` | `SUPER_ADMIN`, `COMPANY_VIEWER` | Exporta empleados a Excel (.xlsx) |

**Query params aceptados:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `search` | string | Búsqueda textual (nombre, documento, email, teléfono, ciudad, dirección) |
| `campaignId` | number | Filtro por campaña |
| `status` | string | PENDING, IN_PROGRESS, CONFIRMED |

**Admin NO está autorizado.** El rol ADMIN no tiene company scoping definido en los servicios existentes. Incluirlo permitiría exportar empleados de todas las compañías sin restricción.

### 27.3 Comportamiento de estado por defecto

Cuando no se provee `status`, se exportan **PENDING + IN_PROGRESS + CONFIRMED**. BLOCKED no se incluye por defecto. Si se envía `status=BLOCKED` u otro valor no aprobado, el backend retorna HTTP 400.

| Valor de status | Comportamiento |
|-----------------|----------------|
| (omitido) | Exporta PENDING, IN_PROGRESS, CONFIRMED |
| `PENDING` | Exporta solo Pendiente |
| `IN_PROGRESS` | Exporta solo En progreso |
| `CONFIRMED` | Exporta solo Confirmado |
| `BLOCKED` | HTTP 400 — No permitido |
| Otro | HTTP 400 — No permitido |

### 27.4 Columnas del Excel (13)

| # | Columna | Origen |
|---|---------|--------|
| 1 | Empresa | `employee.campaign.company.name` |
| 2 | Campaña | `employee.campaign.name` |
| 3 | Slug de campaña | `employee.campaign.slug` |
| 4 | Documento | `employee.documentId` (como texto, preserva ceros a la izquierda) |
| 5 | Nombre completo | `employee.fullName` |
| 6 | Correo electrónico | `employee.email` |
| 7 | Teléfono | `employee.phone` |
| 8 | Dirección de entrega | `employee.shippingAddress` |
| 9 | Ciudad | `employee.shippingCity` |
| 10 | Estado | Traducido: PENDING→Pendiente, IN_PROGRESS→En progreso, CONFIRMED→Confirmado |
| 11 | Cantidad de beneficiarios | `employee._count.beneficiaries` |
| 12 | Fecha de creación | `employee.createdAt` (formato Colombia) |
| 13 | Fecha de última actualización | `employee.updatedAt` (formato Colombia) |

**No se incluyen:** ID interno, campos OTP, deletedAt, createdById, updatedById, información JWT, relaciones internas, campos de seguridad.

**Celdas nulas:** Los campos opcionales (email, phone, shippingAddress, shippingCity) aparecen como celdas en blanco cuando son null.

### 27.5 Company scoping

| Rol | Alcance |
|-----|---------|
| `SUPER_ADMIN` | Exporta todos los empleados elegibles (sin restricción de compañía) |
| `COMPANY_VIEWER` | Exporta solo empleados de campañas cuya `companyId` coincide con `authenticatedUser.companyId` |

- `COMPANY_VIEWER` sin `companyId` → `ForbiddenException`
- `COMPANY_VIEWER` no puede exportar campañas de otra compañía aunque manipule el query param `campaignId`
- `COMPANY_VIEWER` puede filtrar a una campaña dentro de su compañía
- El scope se aplica server-side; no se acepta `companyId` del frontend como parámetro de autorización

### 27.6 Consulta Prisma

Una sola consulta `prisma.employee.findMany()` con:
- `select`: solo campos requeridos + `campaign: { company: { name }, name, slug }` + `_count: { beneficiaries: true }`
- `where`: `deletedAt: null`, `campaign.deletedAt: null`, status filter, search OR, campaignId filter, company scope
- `orderBy`: `company.name ASC → campaign.name ASC → fullName ASC → documentId ASC`
- Sin `skip`/`take` (exporta todos los registros coincidentes, no solo la página actual)
- Sin N+1 (una sola query Prisma)

### 27.7 Protección contra inyección de fórmulas

Toda cadena controlada por el usuario escrita en el Excel se sanitiza. Las celdas que comienzan con `=`, `+`, `-`, `@` se prefijan con `'`. No se sanitizan fechas ni conteos numéricos innecesariamente.

Campos sanitizados: empresa, campaña, slug, documento, nombre, email, teléfono, dirección, ciudad.

### 27.8 Estilo del workbook

- Cabecera azul oscuro (`#1E3A5F`) con texto blanco en negrita
- Fila de cabecera congelada (`ySplit: 1`)
- AutoFiltro en todas las columnas
- Creador del workbook: `GiftApp`
- Nombre de la hoja: `Empleados`

### 27.9 Frontend — Employees.jsx

- Botón "Exportar empleados" en `admin-topbar`, visible para todos los roles autenticados (incluyendo COMPANY_VIEWER)
- Respeta los filtros existentes (búsqueda, campaña, estado)
- No envía `page`/`pageSize`
- Deshabilitado durante la descarga (previene doble clic)
- Nombre de archivo: `empleados_YYYY-MM-DD.xlsx`
- Toast de error controlado en caso de fallo
- Revoca `URL.createObjectURL` después de la descarga
- Nunca envía el token en el query string de la URL
- **UX guard:** Si el filtro de estado está en "Bloqueado", muestra un toast informativo sin llamar al backend
- La selección del filtro de estado se preserva tras la exportación

### 27.10 Frontend — giftAppService.js y backendApiService.js

- `giftAppDownloadEmployeesExcel(params)` → delega a `downloadEmployeesExcel()` del backend
- `downloadEmployeesExcel(query)` → `apiClient.downloadBlob('/admin/employees/export-xlsx', query)`
- Solo disponible en modo backend (`VITE_USE_BACKEND=true`)

### 27.11 Selection export — Verificación de compatibilidad

El export existente de selecciones **no fue modificado**. Se verificó mediante tests que:

- 3 hojas preservadas: "Resumen Envíos", "Detalle Selecciones", "Datos Faltantes"
- Headers sin cambios (13/12/7 columnas)
- Company scoping aplicado para COMPANY_VIEWER
- Sin paginación aplicada (sin skip/take)
- Filtro CONFIRMED preservado
- Filtros de campaña y fechas preservados
- SUPER_ADMIN sin restricción de compañía
- Protección cross-company para COMPANY_VIEWER

### 27.12 Performance timing

Nueva operación registrada: `admin.export.employees`

- Usa el interceptor `PerformanceTimingInterceptor` existente sin modificar su arquitectura
- Metadata: `duration`, `success`, `statusCode`, `fileSizeBytes` (si está disponible como Buffer)
- **No se loguean:** filtros, nombres, documentos, emails, valores exportados

### 27.13 Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `backend/src/employees/employees.service.ts` | +import ExcelJS, EmployeeStatus, helpers (`sanitizeExcelCell`, `translateEmployeeStatus`, `formatDateCO`, `styleHeader`), +método `exportXlsx()` |
| `backend/src/employees/employees.admin.controller.ts` | +import `Res`, `Response`, `todayString()`, +endpoint `GET export-xlsx` con `@Roles('SUPER_ADMIN','COMPANY_VIEWER')` |
| `backend/src/common/interceptors/performance-timing.interceptor.ts` | +`'admin.export.employees'` en la verificación de `fileSizeBytes` |
| `frontend/src/api/backendApiService.js` | +`downloadEmployeesExcel(query)` |
| `frontend/src/api/giftAppService.js` | +`giftAppDownloadEmployeesExcel(params)` |
| `frontend/src/pages/admin/Employees.jsx` | +import `giftAppDownloadEmployeesExcel`, +estado `exporting`, +`handleExport()` con UX guard para BLOCKED, +botón "Exportar empleados" en `admin-topbar` |

### 27.14 Archivos creados (tests)

| Archivo | Descripción |
|---------|-------------|
| `backend/src/employees/employees-export.spec.ts` | 42 tests: default statuses (BLOCKED excluido, inválido→400), filtros (campaña, búsqueda, combinados), no paginación (sin skip/take, exporta 100+ registros), orden determinístico, estructura de query Prisma (select, _count, campaña+empresa), scoping COMPANY_VIEWER (companyId, sin companyId→Forbidden, SUPER_ADMIN sin scope, ADMIN sin scope, cross-company), estructura del workbook (nombre de hoja, 13 columnas en español, traducción de estado, mapeo de datos, ceros a la izquierda en documento, celdas vacías para null, sin ID interno, sin campos OTP), protección de inyección de fórmulas (= + - @), estilo de cabecera (frozen, bold, autoFilter) |
| `backend/src/common/guards/roles-guard-employees-export.spec.ts` | 12 tests: SUPER_ADMIN permitido, COMPANY_VIEWER permitido, ADMIN denegado, anónimo denegado, usuario null/undefined denegado, lista de empleados existente preservada (3 roles), sin roles especificados |
| `backend/src/selections/selections-export-compatibility.spec.ts` | 10 tests: 3 hojas preservadas, headers sin cambios (13/12/7 columnas), scoping COMPANY_VIEWER aplicado, SUPER_ADMIN sin scope, COMPANY_VIEWER sin companyId rechazado, sin paginación (sin skip/take), filtro por campaña, filtro por fechas, protección cross-company, buffer válido |

### 27.15 Tests totales

| Métrica | Antes | Después |
|---------|-------|---------|
| Test suites | 10 | **13** |
| Test cases | 122 | **186** |

### 27.16 Verificación

| Verificación | Resultado |
|--------------|-----------|
| Backend `npm run build` | ✅ |
| Backend `npm test` (13 suites, 186 tests) | ✅ |
| Backend `npm run test:cov` | ✅ |
| Frontend `npm run build` | ✅ |
| SUPER_ADMIN exporta todos los estados elegibles | ✅ |
| SUPER_ADMIN exporta cada estado individualmente | ✅ |
| COMPANY_VIEWER exporta solo su compañía | ✅ |
| Cross-company campaign manipulation → 0 resultados | ✅ |
| Employee workbook abre sin errores | ✅ |
| Selection workbook sin cambios | ✅ |
| Export contiene todos los registros filtrados, no solo página actual | ✅ |
| Filtros de empleado preservados tras exportación | ✅ |
| Sin errores de consola | ✅ |
| Token nunca en URL query string | ✅ |
| BLOCKED en filtro → toast UX sin llamada al backend | ✅ |

### 27.17 Áreas protegidas confirmadas como no modificadas

- Stock logic, StockMovement
- Selection confirmation transaction
- Public employee selection flow
- Employee status transitions
- OTP behavior, Resend integration
- JWT payloads, JWT expiration, authentication architecture
- Existing company scoping semantics
- Roles/role names (ADMIN excluido del nuevo endpoint, no modificado)
- Prisma schema, migrations
- Excel employee/beneficiary import contract
- Logistics-selection export workbook structure
- Existing selection export behavior for SUPER_ADMIN
- Pagination response contracts
- Route paths except new `GET /admin/employees/export-xlsx`
- Dashboard, gift images, campaign logos, Supabase Storage
- Health endpoints
- Timing and benchmark infrastructure
- Frontend visual design
- localStorageService

### 27.18 No se agregó

- Nuevos roles
- Nuevas tablas de permisos
- Relaciones campaign-user
- Redis, queues, workers, background jobs
- Servicios externos de spreadsheet
- Infraestructura nueva
- Raw SQL
- Paquetes adicionales

---

## 28. Sesión 23 de julio — Admin User Deletion (COMPANY_VIEWER)

Se implementó la eliminación segura de cuentas de administrador visor (COMPANY_VIEWER) por parte de un SUPER_ADMIN.

### 28.1 Endpoint

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| DELETE | `/api/admin/users/:id` | `SUPER_ADMIN` (JWT + RolesGuard) | Elimina permanentemente un COMPANY_VIEWER |

Controller hereda `@UseGuards(JwtAuthGuard, RolesGuard)` y `@Roles('SUPER_ADMIN')` de la clase.

**Response (HTTP 200):**
```json
{ "success": true, "message": "Usuario eliminado correctamente." }
```

### 28.2 Reglas de autorización (backend)

Reglas aplicadas en `admin-users.service.ts` → `remove(targetUserId, authenticatedUserId)`:

| # | Regla | Excepción |
|---|---|---|
| 1 | `targetUserId === authenticatedUserId` | `ForbiddenException`: "No puedes eliminar tu propio usuario." |
| 2 | Target no existe | `NotFoundException`: "Usuario no encontrado." |
| 3 | Atomic `deleteMany` con filtro `{ id, role: { name: 'COMPANY_VIEWER' } }` | `ForbiddenException`: "Solo se pueden eliminar usuarios con rol COMPANY_VIEWER." |

La regla #3 es atómica — protege contra race conditions donde el rol cambia entre la verificación y la eliminación. Si `count !== 1`, se rechaza. Esto rechaza SUPER_ADMIN, ADMIN y cualquier otro rol.

### 28.3 Integridad de datos — Hard delete

La eliminación es física (`DELETE` SQL). Todas las FK references a `AdminUser` usan `ON DELETE SET NULL` (verificado en migración `20260611015500_init_postgres`):

| Tabla.Column | ON DELETE |
|---|---|
| Campaign.createdById / updatedById | SET NULL |
| Employee.createdById / updatedById | SET NULL |
| Beneficiary.createdById / updatedById | SET NULL |
| Gift.createdById / updatedById | SET NULL |
| SupportRequest.resolvedById | SET NULL |
| SupportRequestHistory.changedById | SET NULL |
| Selection.cancelledById | SET NULL |
| StockMovement.createdById | SET NULL |

- No `ON DELETE CASCADE` en ninguna FK de AdminUser
- No `ON DELETE RESTRICT` en ninguna FK de AdminUser
- Empresas, campañas, empleados, beneficiarios, regalos, selecciones, stock movements y solicitudes de soporte **no son eliminados**
- Registros históricos preservados (los campos `createdBy`/`updatedBy`/etc. se vuelven NULL)

### 28.4 Autenticación después de la eliminación

- **Viewer eliminado no puede hacer login:** La fila `AdminUser` ya no existe → `POST /api/auth/login` falla con 401.
- **JWT existente del viewer eliminado es rechazado:** `JwtStrategy.validate()` ejecuta `findUnique({ where: { id: payload.sub } })` → retorna `null` → `UnauthorizedException`.
- **SUPER_ADMIN que eliminó permanece autenticado:** Su propia cuenta no fue tocada.
- No se añadieron token blacklists, caches ni refresh tokens.

### 28.5 Frontend

**Visibilidad del botón "Eliminar":**
```js
isSuperAdmin && u.role?.name === 'COMPANY_VIEWER' && u.id !== session?.id
```
- Oculto para targets SUPER_ADMIN
- Oculto para targets ADMIN
- Oculto para el usuario actual (self)
- Oculto para cualquier otro rol

**ConfirmDialog:**
- Título: "Eliminar Usuario Visor"
- Mensaje: "¿Eliminar este usuario visor? El usuario perderá el acceso administrativo. Esta acción no eliminará la empresa, campañas, empleados, beneficiarios, regalos ni selecciones relacionadas."
- Botones: "Cancelar" / "Eliminar usuario" (danger)
- No usa `window.confirm()`

**Comportamiento post-eliminación:**
- Éxito: remueve la fila del estado local (`setUsers`), cierra el diálogo, muestra toast "Usuario eliminado correctamente."
- Fallo: preserva la fila visible, muestra toast de error, restaura estado de loading
- No recarga el navegador, no redirige, no cambia de ruta

### 28.6 Tests (16 tests)

`backend/src/admin-users/admin-users-remove.spec.ts`:

| # | Test |
|---|---|
| 1 | SUPER_ADMIN deletes COMPANY_VIEWER |
| 2 | SUPER_ADMIN cannot delete SUPER_ADMIN |
| 3 | SUPER_ADMIN cannot delete ADMIN |
| 4 | SUPER_ADMIN cannot delete themselves |
| 5 | Missing target returns 404 |
| 6 | Target role read from database |
| 7 | Role-change race protected (deleteMany count=0) |
| 8 | Only one AdminUser delete call |
| 9 | Related entities not touched |
| 10 | No cascade delete |
| 11 | Prisma failure does not return false success |
| 12 | COMPANY_VIEWER rejected by route guard |
| 13 | Unauthenticated rejected by route guard |
| 14 | Deleted viewer findUnique returns null |
| 15 | Deleted viewer JWT rejected |
| 16 | Deleting SUPER_ADMIN stays logged in |

### 28.7 Verificación de build

| Build | Resultado |
|---|---|
| Backend (`npm run build`) | ✅ 0 errores |
| Frontend (`npm run build`) | ✅ 0 errores |
| Backend tests (`npm test`) | ✅ 202/202 (14 suites, 0 fallos) |

### 28.8 Áreas protegidas confirmadas como no modificadas

- Stock logic (updateMany guard)
- Selection confirmation transaction
- Public flow behavior
- Excel import/export contract
- Company scoping
- Roles/permissions (solo se añadió delete endpoint, no se modificaron guards existentes)
- Prisma schema y migraciones (sin cambios)
- Route paths existentes (solo se añadió DELETE handler)
- UI design system
- localStorageService
- Supabase Storage
- Email OTP / Resend
- JWT payloads, expiration, strategy
- Health endpoints
- Timing infrastructure

---

## 29. Sesión 23 de julio — Excel Import Validation Hardening (Regla Atómica)

Se implementó validación completa del archivo Excel **antes de cualquier escritura a la base de datos**, con recolección de todos los issues y la regla atómica: **si existe al menos un error bloqueante, no se importa ningún registro**.

### 29.1 Regla atómica (no negociable)

> Si existe al menos un error bloqueante, no se importa ningún registro.

| Escenario | Resultado |
|---|---|
| 1 error bloqueante | 0 employees created, 0 updated, 0 beneficiaries created, 0 beneficiaries updated, 0 records deleted |
| 100 errores bloqueantes | 0 database writes |

### 29.2 Arquitectura de validación — capa pura

**Archivo nuevo:** `backend/src/imports/import-validation.ts`

Capa de validación 100% pura (sin I/O, sin DB, sin ExcelJS). Todas las funciones son cubribles por tests unitarios rápidos.

**Tipos y códigos estables:**

```typescript
interface ImportIssue {
  row: number;          // número de fila visible en Excel (header=1, primera data=2)
  column: string;       // key lógico de columna
  columnLabel: string;  // etiqueta en español
  value: string | null; // valor recibido (normalizado a texto)
  severity: 'ERROR' | 'WARNING';
  code: string;         // código estable machine-readable
  message: string;      // mensaje claro en español
  relatedRow?: number;  // para duplicados/conflictos: primera fila relacionada
}
```

Códigos estables:

| Código | Descripción |
|--------|-------------|
| `MISSING_REQUIRED_VALUE` | Campo obligatorio vacío |
| `MISSING_REQUIRED_HEADER` | Columna obligatoria faltante en el header |
| `INVALID_EMAIL` | Formato de correo inválido |
| `VALUE_TOO_LONG` | Valor excede el límite de VarChar |
| `INVALID_PHONE_FORMAT` | Teléfono con caracteres no permitidos |
| `PHONE_LENGTH_OUT_OF_RANGE` | Teléfono supera 30 caracteres |
| `INVALID_DOCUMENT_FORMAT` | Documento contiene caracteres no numéricos |
| `DOCUMENT_LENGTH_OUT_OF_RANGE` | Documento no tiene entre 6 y 10 dígitos |
| `INVALID_BENEFICIARY_AGE` | Edad del beneficiario fuera de rango [0-13] |
| `INVALID_BENEFICIARY_GENDER` | Género del beneficiario inválido |
| `CAMPAIGN_NOT_FOUND` | El slug de campaña no existe o fue eliminado |
| `CAMPAIGN_STATUS_NOT_OPEN` | La campaña no admite cargas (no DRAFT/ACTIVE) |
| `DUPLICATE_BENEFICIARY_IN_FILE` | Beneficiario exacto duplicado dentro del archivo |
| `CONFLICTING_EMPLOYEE_DATA` | Mismo empleado con datos conflictivos en filas distintas |

### 29.3 Validaciones implementadas

#### Estructura del workbook y hojas
- Archivo debe ser `.xlsx`
- Workbook debe poder leerse (no corrupto)
- Debe contener al menos una hoja
- Header row (fila 1) debe contener las 10 columnas esperadas

#### Headers
- Las 10 columnas obligatorias deben estar presentes: `campaignSlug`, `employeeDocumentId`, `employeeFullName`, `employeeEmail`, `employeePhone`, `shippingAddress`, `shippingCity`, `beneficiaryFullName`, `beneficiaryAge`, `beneficiaryGender`
- Cada header faltante genera un `MISSING_REQUIRED_HEADER` en fila 1

#### Validación por fila y columna (sin parar en el primer error)
Cada fila se valida **completamente** — no se detiene en el primer fallo. Todos los issues se recogen para reporte conjunto.

| Campo | Reglas | Códigos |
|-------|--------|---------|
| `campaignSlug` | Obligatorio, máx 200 chars | `MISSING_REQUIRED_VALUE`, `VALUE_TOO_LONG` |
| `employeeDocumentId` | Obligatorio, solo dígitos, 6-10 dígitos, preserva ceros a la izquierda, máx 50 chars (VarChar técnico) | `MISSING_REQUIRED_VALUE`, `INVALID_DOCUMENT_FORMAT`, `DOCUMENT_LENGTH_OUT_OF_RANGE`, `VALUE_TOO_LONG` |
| `employeeFullName` | Obligatorio, máx 180 chars | `MISSING_REQUIRED_VALUE`, `VALUE_TOO_LONG` |
| `employeeEmail` | Opcional (per audit). Trim, lowercase, máx 180, regex `local@domain.tld` (no RFC estricto), no whitespace interno | `INVALID_EMAIL`, `VALUE_TOO_LONG` |
| `employeePhone` | Opcional (per audit). Trim, máx 30 chars, allow dígitos/espaces/+/guiones/paréntesis, reject letras | `INVALID_PHONE_FORMAT`, `PHONE_LENGTH_OUT_OF_RANGE` |
| `shippingAddress` | Opcional, máx 255 chars | `VALUE_TOO_LONG` |
| `shippingCity` | Opcional, máx 100 chars | `VALUE_TOO_LONG` |
| `beneficiaryFullName` | Obligatorio, máx 180 chars | `MISSING_REQUIRED_VALUE`, `VALUE_TOO_LONG` |
| `beneficiaryAge` | Obligatorio, entero [0-13] | `MISSING_REQUIRED_VALUE`, `INVALID_BENEFICIARY_AGE` |
| `beneficiaryGender` | Obligatorio, male/female (o masculino/femenino/m/f) | `MISSING_REQUIRED_VALUE`, `INVALID_BENEFICIARY_GENDER` |

#### Validación cross-row (dentro del archivo)

**Duplicate beneficiary detection (DUPLICATE_BENEFICIARY_IN_FILE):**
- Key de empleado: `normalizeSlug(campaignSlug)::documentId`
- Key de beneficiario: `employeeKey::normalizeName(beneficiaryFullName)::age::gender`
- La primera ocurrencia con una key dada es la fila canónica (sin error)
- Ocurrencias posteriores reciben `ERROR` con `relatedRow = primera fila`
- **No** se consideran duplicados: mismo beneficiario bajo diferentes empleados; mismo empleado con diferentes beneficiarios
- **No** se usa `skipDuplicates` como sustituto de validación

**Conflicting employee data (CONFLICTING_EMPLOYEE_DATA):**
- Mismo `employeeKey` en múltiples filas con datos de empleado conflictivos (nombre, email, teléfono, dirección, ciudad) → ERROR bloqueante
- `relatedRow = primera fila donde se vio la identidad del empleado`
- Mismo empleado con info idéntica + diferentes beneficiarios → válido (no conflict)

#### Campaign existence + status (DB read, nunca write)
- Todos los slugs se buscan en una sola `prisma.campaign.findMany`
- Slug no encontrado → `CAMPAIGN_NOT_FOUND` (bloqueante)
- Status no es `DRAFT` ni `ACTIVE` → `CAMPAIGN_STATUS_NOT_OPEN` (bloqueante)

### 29.4 Regla atómica — implementación

**Archivo modificado:** `backend/src/imports/imports.service.ts`

Flujo del método `importEmployeesBeneficiaries`:

```
1. Parse workbook + sheet + headers + raw rows
2. validateHeaders() → emite MISSING_REQUIRED_HEADER si faltan columnas
3. Por cada fila: validar TODOS los campos (no parar en el primero)
4. detectCrossRowIssues() → duplicados de beneficiario + conflictos de empleado
5. Campaign existence + status (1 findMany, nunca write)
6. ★ REGLA ATÓMICA: si hay algún ERROR → return { canImport: false, all counts: 0 }
   — NO se llama prisma.$transaction
   — NO se llama createMany / update / create
7. Si no hay errores: happy path preservado (batch processing intacto)
   — CONFIRMED employees → warning non-blocking + skip
   — Existing beneficiaries → warning non-blocking + skip
```

**ImportResult extendido (backward-compatible):**

```typescript
interface ImportResult {
  canImport: boolean;           // false cuando hay errores bloqueantes
  totalRows: number;
  employeesCreated: number;
  employeesUpdated: number;
  beneficiariesCreated: number;
  beneficiariesUpdated: number; // siempre 0 en el importer actual
  skippedRows: number;
  errors: ImportIssue[];        // ERROR-severity (backward-compat: row+message)
  warnings: ImportWarning[];    // WARNING-severity (legacy shape: row+message)
  issues: ImportIssue[];        // ALL issues en rich shape (errors + warnings)
  errorCount: number;           // para performance timing metadata
  warningCount: number;
}
```

### 29.5 Auditoría de reglas de teléfono

**Hallazgo:** NO existe una regla funcional de conteo de dígitos de teléfono en el proyecto:
- `create-employee.dto.ts`: solo `@MaxLength(30)` + `@IsString`
- `employees.service.ts`: solo `dto.phone?.trim()`
- No hay `validatePhone` / `minDigits` / `maxDigits` en ningún archivo del backend o frontend

**Decisión:** Per la instrucción aprobada, NO se inventó una regla de conteo de dígitos. `PHONE_LENGTH_OUT_OF_RANGE` solo aplica el límite aprobado de 30 caracteres. La verificación de character-set (dígitos, espacios, +, guiones, paréntesis) es la validación primaria de teléfono.

### 29.6 Authorization scope

El endpoint permanece `@Roles('SUPER_ADMIN')`-only (sin cambio de permisos, respeta golden rules #4/#5). SUPER_ADMIN tiene scope global, por lo que "authorization scope" = validación de existencia + status de campaña únicamente.

### 29.7 Fix collateral — PerformanceTimingInterceptor

**Archivo:** `backend/src/common/interceptors/performance-timing.interceptor.ts`

**Bug latente corregido:** El allowlist del import operaba con keys inexistentes (`rowCount`, `createdEmployees`, `skippedCount`) en vez de las keys reales de `ImportResult` (`totalRows`, `employeesCreated`, `skippedRows`). Resultado: los eventos de timing del import nunca emitían metadata.

Cambiado a las keys canónicas: `totalRows`, `employeesCreated`, `employeesUpdated`, `beneficiariesCreated`, `skippedRows`, `errorCount`. Spec actualizado.

### 29.8 Frontend — UI de reporte de issues

**Archivo:** `frontend/src/pages/admin/Employees.jsx`

Modal de importación ahora muestra:
- **`canImport === false`:** banner "Importación bloqueada" rojo con conteo de errores y mensaje "No se importó ningún registro (0 empleados y 0 beneficiarios afectados). Corrige el archivo y vuelve a intentarlo."
- **Lista de issues (rich shape):** cada issue muestra `Fila N (relacionada con fila M) · Columna · "valor" · [CODE]` + mensaje en español
- **`canImport === true`:** "Importación completada exitosamente" + tabla de conteos
- **Warnings:** se preservan con shape legacy (row + message)

### 29.9 Tests (41 tests nuevos)

#### `imports-validation.spec.ts` (33 tests)

Cubre los 25 escenarios requeridos + tests adicionales:

| # | Escenario |
|---|-----------|
| 1 | Exact beneficiary duplicate → blocking error |
| 2 | Duplicate en filas no consecutivas detectado |
| 3 | Mismo empleado con diferentes beneficiarios → válido |
| 4 | Mismo beneficiario bajo diferentes empleados → no duplicado |
| 5 | Normalización captura case + espacios (ANA vs Ana) |
| 5b | 3 ocurrencias cada una referencia la primera |
| 6 | Email válido aceptado |
| 7 | Email uppercase normalizado a lowercase |
| 8 | Email requerido faltante rechazado |
| 8b | Email opcional vacío aceptado (audit behavior) |
| 9 | `david@` rechazado (INVALID_EMAIL) |
| 10 | Email con espacios internos rechazado |
| 11 | Email > 180 chars rechazado (VALUE_TOO_LONG) |
| 12 | Teléfono opcional vacío aceptado |
| 13 | Teléfono numérico plano aceptado |
| 14 | `+57 300 123 4567` aceptado |
| 15 | Teléfono con espacios/guiones/paréntesis aceptado |
| 16 | Teléfono con letras rechazado (INVALID_PHONE_FORMAT) |
| 17 | Teléfono > 30 chars rechazado (PHONE_LENGTH_OUT_OF_RANGE) |
| 18 | Documento de 6 dígitos aceptado |
| 19 | Documento de 10 dígitos aceptado |
| 20 | Documento de 5 dígitos rechazado (length) |
| 21 | Documento de 11 dígitos rechazado (length) |
| 22 | Documento alfanumérico rechazado (format, no length) |
| 23 | `001234` permanece 6 dígitos, aceptado |
| 23b | Ceros a la izquierda preservados en valor reportado |
| 25 | Múltiples errores en misma fila todos retornados |
| extra | Conflicting employee data es bloqueante con relatedRow |
| extra | Mismo empleado info idéntica + diferentes beneficiarios → no conflict |
| extra | validateHeaders flaggea cada header faltante |
| extra | validateHeaders pasa con todos los headers |
| extra | normalizeGender acepta m/masculino/f/femenino |
| extra | checkBeneficiaryAge rechaza out-of-range y non-integer |

#### `imports-atomic.spec.ts` (8 tests)

Construye `.xlsx` reales en memoria con ExcelJS:

| # | Test |
|---|------|
| A | 1 error bloqueante → 0 writes (`$transaction` nunca llamado) |
| B | 100 errores bloqueantes → 0 writes |
| C | (placeholder) |
| D | Duplicate beneficiary in file → blocking, 0 writes, relatedRow correcto |
| E | Conflicting employee data → blocking, 0 writes, relatedRow correcto |
| F | Missing required header → blocking, 0 writes |
| G | Happy path sin errores → proceeds a writes (createMany llamado) |
| H | Campaign CLOSED → blocking (CAMPAIGN_STATUS_NOT_OPEN), 0 writes |
| I | Campaign unknown slug → blocking (CAMPAIGN_NOT_FOUND), 0 writes |

### 29.10 Archivos modificados/creados

| Archivo | Cambio |
|---------|--------|
| `backend/src/imports/import-validation.ts` | **NUEVO** — Capa de validación pura: tipos (`ImportIssue`, `IssueSeverity`), códigos estables (`CODE`), labels (`COLUMN_LABELS`), constantes (límites VarChar, reglas de negocio), validadores puros (`checkEmail`, `checkPhone`, `checkDocument`, `checkBeneficiaryAge`, `checkBeneficiaryGender`, `checkRequired`, `checkMaxLength`), `validateHeaders`, `buildEmployeeKey`, `buildBeneficiaryKey`, `buildEmployeeInfoTuple`, `detectCrossRowIssues`, `hasBlockingErrors`, `normalizeName`, `normalizeSlug`, `normalizeGender`, `digitsOnly` |
| `backend/src/imports/imports.service.ts` | **REFACTORIZADO** — Validación completa pre-write (no para en primer error), regla atómica (ERROR → 0 writes), `ImportResult` extendido (`canImport`, `issues`, `errorCount`, `warningCount`, `beneficiariesUpdated`), campaign existence/status ahora bloqueante, cross-row detection (duplicates + conflicts), eliminada segunda `campaign.findMany` redundante, batch processing preservado en happy path |
| `backend/src/common/interceptors/performance-timing.interceptor.ts` | **FIX** — Allowlist de import keys corregido: `rowCount`→`totalRows`, `createdEmployees`→`employeesCreated`, `skippedCount`→`skippedRows`; añadido `employeesUpdated` |
| `backend/src/common/interceptors/performance-timing.interceptor.spec.ts` | **ACTUALIZADO** — Tests de import metadata con keys canónicas |
| `backend/src/imports/imports-validation.spec.ts` | **NUEVO** — 33 tests de validadores puros |
| `backend/src/imports/imports-atomic.spec.ts` | **NUEVO** — 8 tests de regla atómica con .xlsx reales |
| `frontend/src/pages/admin/Employees.jsx` | **MODIFICADO** — UI de reporte de issues: banner "Importación bloqueada", lista rich (fila/relatedRow/columna/valor/código/mensaje), `canImport` handling |

### 29.11 Verificación

| Verificación | Resultado |
|---|---|
| Backend `npm run build` | ✅ 0 errores |
| Backend `npm test` (16 suites, 243 tests) | ✅ (antes: 14 suites, 202 tests; +2 suites, +41 tests) |
| Frontend `npm run build` | ✅ 0 errores |
| `src/imports` suites (2 suites, 41 tests) | ✅ |
| PerformanceTimingInterceptor specs | ✅ (keys canónicas) |

### 29.12 Áreas protegidas confirmadas como no modificadas

- Stock logic (updateMany guard)
- Selection confirmation transaction
- Public flow behavior
- Company scoping
- Roles/permissions (`@Roles('SUPER_ADMIN')` sin cambio)
- Prisma schema y migraciones (sin cambios)
- Route paths existentes
- UI design system (estilos del modal preservados, solo nuevo contenido)
- localStorageService
- Supabase Storage
- Email OTP / Resend
- JWT payloads, expiration, strategy
- Health endpoints
- Benchmark infrastructure
- Batch processing logic (preservado en happy path)
- LOGIC OF skipDuplicates inside transactions (no change to createMany calls when no validation errors)
- Idempotent re-upload behavior (CONFIRMED employees → non-blocking warning + skip)
- Excel export contract (employees + selections exports)

### 29.13 No se agregó

- Nuevas tablas, columnas, migraciones
- Nuevos roles o permisos
- Redis, queues, workers, background jobs
- Raw SQL
- Paquetes adicionales (ExcelJS ya estaba en el proyecto)
- Cambios al schema de Prisma
- Reglas inventadas de conteo de dígitos de teléfono (auditadas y documentadas)

---

## 30. Sesión 4 de agosto de 2026 — Campaign Banner en Create Mode (Sesión 30)

El banner de campaña ahora está disponible tanto al **crear** como al **editar** una campaña, con persistencia completa del banner y su decoración en un solo flujo continuo (crear campaña → seleccionar banner → configurar capas → vista previa → guardar).

### 30.1 Diagnóstico previo (verificado en runtime y DB live)

| Hallazgo | Detalle |
|----------|---------|
| Columnas `bannerImageUrl` / `bannerDecoration` existían en la DB live pero **no había migración** (se agregaron ad-hoc con `scripts/set-banner-by-id.js`) | Migración creada e idempotente |
| `create()`/`update()` de CampaignsService **omitían** los campos banner ("omitted until DB migration is applied") | Ahora los persisten |
| `findAll()`/`findOne()` **no seleccionaban** banner fields → el formulario de edición no recibía banner/decoración | Agregados al `select` |
| `giftAppCreateCampaign`/`giftAppUpdateCampaign` **descartaban** `bannerImageUrl`/`bannerDecoration` del payload | Whitelist ampliada |
| `Campaigns.jsx` solo renderizaba controles de banner con `{editing && ...}` | Controles en ambos modos |
| `uploadBanner` tragaba errores de persistencia (schema mismatch) y retornaba la URL igual | Limpieza compensatoria + rethrow |
| Fallback P2022 en `update()` retiraba campos banner en caso de error real | Eliminado |
| Bucket Supabase `campaign-logos` **no existía** (solo `gift-images`) → todo upload de banner fallaba con 500 "Bucket not found" | Bucket creado (public) via service role |
| `bannerDecoration` de campaña 7 (script) tenía decoración `null` → la persistencia de decoración **nunca funcionó** en ningún modo | Corregido |

### 30.2 Backend

**Archivo:** `backend/src/campaigns/campaigns.service.ts`

- `create()`: persiste `bannerImageUrl` (trimmed) y `bannerDecoration` (objeto) cuando vienen en el DTO (spread condicional).
- `update()`: `if (dto.bannerImageUrl !== undefined) data.bannerImageUrl = ...` y `if (dto.bannerDecoration !== undefined) data.bannerDecoration = dto.bannerDecoration;` — permite limpiar la decoración con `null`.
- `findAll()` / `findOne()`: `bannerImageUrl: true, bannerDecoration: true` añadidos al `select`.
- **Fallback P2022 eliminado** de `update()`: ya no se reintenta la actualización sin campos banner (no se ocultan errores de schema; la DB está migrada).
- `uploadBanner()`: si la subida a Supabase funciona pero el update de DB falla → `storage.deleteFile(storagePath, 'campaign-logos')` (best-effort) + **rethrow del error original**. Nunca se retorna una URL de banner sin persistencia en DB. El estado previo de la campaña queda intacto.

**DTOs:** sin cambios (`create-campaign.dto.ts` ya tenía `bannerImageUrl` y `bannerDecoration`).

**Migración nueva:** `backend/prisma/migrations/20260804000000_add_campaign_banner_fields/migration.sql`
```sql
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "bannerImageUrl" VARCHAR(500);
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "bannerDecoration" JSONB;
```
Idempotente — segura contra DBs donde las columnas ya existían ad-hoc. `prisma migrate deploy` aplicado y verificado: "Database schema is up to date!".

**Tests:** `backend/src/campaigns/campaigns-banner.spec.ts` (11 tests):
- create persiste banner fields / omite cuando no vienen
- update persiste / limpia con null / no toca cuando se omite / **no reintenta sin banner fields en error P2022** (fallback eliminado)
- findAll/findOne seleccionan banner fields
- uploadBanner: éxito persiste URL; fallo de DB → deleteFile + rethrow + un solo update; fallo de upload → sin tocar DB

### 30.3 Frontend

**`frontend/src/api/giftAppService.js`**
- `giftAppCreateCampaign`: payload incluye `bannerImageUrl`/`bannerDecoration` cuando `!== undefined` (para archivo local NO se envía `bannerImageUrl`; solo se sube por el endpoint de upload después del create).
- `giftAppUpdateCampaign`: mismo patrón condicional.

**`frontend/src/pages/admin/Campaigns.jsx`**
- Estado canónico único: `bannerDecoration` (objeto `{ layers: [] }`) — ya no se serializa/parsea JSON string.
- Controles de banner (input de archivo + `BannerEditor`) renderizados en **Create y Edit** (se eliminó el guard `{editing && ...}`).
- Vista previa en vivo: `bannerPreviewUrl` (blob URL del archivo local, `URL.createObjectURL`, revocado en cleanup) o `editing.bannerImageUrl` persistida. El preview nunca se persiste.
- Validación cliente del banner: PNG/JPEG/JPG/WebP + máx 5MB (paridad con el backend).
- `handleSave`: `payload = { ...form, bannerDecoration }` en create/update (una sola request para decoración, se eliminó el round-trip extra de `JSON.parse`); sube logo y banner tras el create; `clearCache('campaign_' + slug)` tras los uploads (invalida la cache pública); cierra el modal y permanece en la página de Campañas.
- `closeModal()` resetea bannerFile/preview.

**`frontend/src/components/BannerEditor.jsx`**
- Refactorizado a **componente controlado**: la decoración viene del padre (`decoration` prop) y todos los cambios salen por `onChange`. Se eliminaron los dos `useEffect` de sincronización que, combinados con StrictMode (double-mount en dev), podían provocar "Maximum update depth exceeded" con HMR.
- Comportamiento visual idéntico (capas, preview, editor de capa, botones + Texto/+ Imagen/Eliminar).

### 30.4 Verificación (manual, browser)

| Flujo | Resultado |
|-------|-----------|
| Create: banner controls visibles | ✅ |
| Create: selección de imagen local + preview blob en editor | ✅ |
| Create: capa de texto (texto, color, tamaño 48px) + capa overlay (URL, ancho 25%) con preview completo | ✅ |
| Crear → DB: `bannerDecoration` con ambas capas + `bannerImageUrl` de Supabase | ✅ |
| Modal se cierra, toast "Campaña creada.", permanece en Campañas | ✅ |
| Página pública `/campaign/claro-banner-test-2`: banner + texto + overlay renderizados | ✅ |
| Edit: banner persistido + capas precargadas en el editor | ✅ |
| Update → DB: decoración re-persistida | ✅ |
| Cache pública invalidada tras upload de banner | ✅ (navegación inmediata mostró banner) |
| Consola sin errores (loop eliminado) | ✅ |

Datos de prueba creados (campañas "Banner Test Creacion" id=9 y "Banner Test 2" id=10, company Claro) fueron **soft-deleted** vía API y sus objetos de Storage `company-9/campaign-{9,10}/banner-*.png` fueron eliminados del bucket.

### 30.5 Builds y tests

| Verificación | Resultado |
|--------------|-----------|
| `npx prisma validate` | ✅ |
| `npx prisma migrate status` | ✅ up to date |
| `npx prisma generate` | ✅ |
| `npx prisma migrate deploy` | ✅ aplicada 1 migración |
| Backend `npm run build` | ✅ |
| Backend `npm test` (17 suites, 254 tests) | ✅ |
| Frontend `npm run build` | ✅ |

### 30.6 Áreas protegidas confirmadas como no modificadas

- Stock logic (updateMany guard), selection confirmation transaction
- Flujo público de autenticación (documentId + JWT público, OTP/Resend)
- Company scoping (COMPANY_VIEWER) y roles/permisos
- Schema Prisma (sin cambios — solo se creó la migración pendiente)
- Rutas existentes, Excel import/export, health/version, timing infrastructure
- Supabase Storage strategy (bucket `campaign-logos`, path `company-{id}/campaign-{id}/banner-{uuid}.{ext}` sin cambios)
- `localStorageService.js` (modo demo)

### 30.7 Nota operativa (entorno)

- El bucket Supabase `campaign-logos` fue creado (public) con la service role key durante la sesión: era el requisito faltante para que `POST /admin/campaigns/:id/banner` funcionara (antes: 500 "Bucket not found"). Está documentado como DEP-05 (hardcoded en código).

---

## 31. Sesión 20 de agosto de 2026 — Bulk Gift Import (Excel + ZIP) con compensación all-or-nothing

Importación masiva de regalos para SUPER_ADMIN: `Crear regalo` + `Importar regalos` en `Gifts.jsx`. Flujo de 2 pasos (validar → confirmar) stateless: el frontend conserva ambos archivos y "Confirmar importación" re-envía el mismo Excel+ZIP; el backend re-valida TODO el paquete antes de escribir (regla atómica). Se preserva la creación manual y la gestión de imágenes existentes.

### 31.1 Endpoints (nuevos)
| Método | Path | Rol | Descripción |
|---|---|---|---|
| POST | `/api/admin/gift-import/validate` | SUPER_ADMIN | Valida el paquete completo. **0 writes, 0 uploads**. |
| POST | `/api/admin/gift-import/commit` | SUPER_ADMIN | Re-valida y, si no hay errores bloqueantes, importa con **compensación all-or-nothing**. |
| GET | `/api/admin/gift-import/template` | SUPER_ADMIN | Descarga `plantilla_regalos.xlsx` (hojas Regalos + Instrucciones). |

### 31.2 Contrato Excel (headers canónicos en español, fila 1)
`CarpetaImagenes` (alias legacy `Imagenes`, si ambas → `DUPLICATE_HEADER`), `Campaña`, `Nombre`, `Referencia`, `DescripciónCorta`, `DescripciónTécnica`, `Medidas`, `Cantidad` (obligatorio, entero ≥0; vacío = bloqueante, nunca default 0), `EdadMinima`, `EdadMaxima` (obligatorios 0-13), `Género` (all/todos, male/masculino, female/femenino), `Estado` (ACTIVE/Activo, INACTIVE/Inactivo; vacío → ACTIVE). Opcionales vacíos → `null` real (nunca `"null"`). Una fila = un regalo. Referencia normalizada trim+mayúsculas (paridad con create manual); ceros a la izquierda preservados.

### 31.3 Contrato ZIP + seguridad (limitado, primera versión)
- Límites: ZIP ≤50 MB, Excel ≤5 MB (multer ceiling global = 50 MB + validación por campo), ≤50 regalos, ≤150 imágenes, ≤3 imágenes/regalo, ≤2 MB/imagen, uncompressed total ≤200 MB, ≤300 entradas, concurrency de subida = 3.
- Seguridad (todo en memoria, jszip 3.10.1 como dependencia directa): path traversal/absoluta/drive/backslash, entradas cifradas (el propio `loadAsync` rechaza), zip bomb (ratio + tamaño por entrada), `DUPLICATE_IMAGE_FOLDER_CASE_INSENSITIVE`, magic bytes JPEG/PNG/WebP, revisión de CRC32.
- Carpeta = carpeta top-level cuyo nombre se compara trim + case-insensitive (los ceros a la izquierda son significativos: `0010` !== `10`). Imágenes = hijos directos; subcarpeta anidada → `NESTED_FOLDER_IN_IMAGE_FOLDER` (bloqueante). Archivo no-imagen en carpeta referenciada → `UNSUPPORTED_FILE_IN_IMAGE_FOLDER` (bloqueante). Metadata de SO (`.DS_Store`, `Thumbs.db`, `__MACOSX`, `._*`) → warning `OS_METADATA_IGNORED`. Archivos en la raíz del ZIP → warning no bloqueante. Carpeta sin fila que la referencie → warning `ZIP_UNREFERENCED_FOLDER`.
- Los nombres de entrada del ZIP **nunca** se usan como storage paths (se generan `campaign-{id}/gift-{id}/{uuid}.{ext}`, sin cambios en bucket/path scheme).

### 31.4 Compensación all-or-nothing (NO es atomicidad transaccional PG↔Supabase)
Se registran: cada `Gift` creado, cada storage path subido y los `GiftImage` creados. Ante cualquier fallo en commit: se esperan las subidas en curso (`runWithConcurrencyCollect` con pool acotado corre TODO hasta el final y recolecta fallos por ítem — sin abortar en el primer error), se eliminan todos los storage objects del intento, después los `GiftImage` y los `Gift` creados (`deleteMany` por ids del intento; cascade cubre filas sobrantes). La limpieza continúa aunque un delete falle (cada fallo se loguea) y el error original se preserva. Datos pre-existentes nunca se tocan.

### 31.5 Archivos nuevos (backend)
- `src/gift-imports/gift-import-validation.ts` — capa pura de validación (headers, filas, stock/edades/género/estado, duplicados referencia intra-archivo, códigos estables `GIFT_CODE`, límites `LIMITS`).
- `src/gift-imports/gift-import-zip.ts` — parseo ZIP seguro con jszip (inventario de carpetas, security checks, `sniffImageType` afuera en validation).
- `src/gift-imports/gift-import.service.ts` — `validatePackage` / `commitImport` / `buildTemplate` + `compensate`.
- `src/gift-imports/gift-import.admin.controller.ts` — `validate`/`commit`/`template`; `FileFieldsInterceptor` + `GIFT_IMPORT_FILE_FILTER` (rechaza campos extra), `extractFiles` (cardinalidad exacta 1+1), `@TrackPerformance('admin.gift-import.validate'|'admin.gift-import.commit')`.
- `src/gift-imports/gift-import.module.ts` — importa `GiftsModule` y reutiliza su `SupabaseStorageService` exportado (sin instancia duplicada).
- Specs: `gift-import-validation.spec.ts`, `gift-import-zip.spec.ts`, `gift-import-atomic.spec.ts` (regla atómica + compensación), `gift-import-admin.controller.spec.ts` (cardinalidad + fileFilter), `gift-manual-unchanged.spec.ts` (regresión de creación manual).
- `scripts/benchmark-gift-import.ts` + script `benchmark:gift-import` — benchmark manual 10/25/50 regalos (30/75/150 imágenes) contra DB+Storage reales; crea campaña temporal y limpia todo (NO ejecutar en CI).

### 31.6 Archivos modificados
- `backend/package.json` — `jszip@^3.10.1` como dependencia directa + script `benchmark:gift-import`.
- `src/gifts/gifts.module.ts` — exporta `SupabaseStorageService`.
- `src/app.module.ts` — registra `GiftImportsModule`.
- `src/common/interceptors/performance-timing.interceptor.ts` (+spec) — allowlist para las 2 operaciones nuevas (validate: totalRows/errorCount/warningCount; commit: +giftsCreated/imagesUploaded).
- Frontend: `src/api/backendApiService.js` (+3 funciones), `src/api/giftAppService.js` (+3), `src/pages/admin/Gifts.jsx` (botones `Crear regalo`/`Importar regalos`, modal de 3 fases upload→review→result, descarga de plantilla).

### 31.7 Config
- No hay variables de entorno nuevas (reutiliza `SUPABASE_STORAGE_BUCKET=gift-images`).
- Los límites se centralizan en `LIMITS` dentro de `gift-import-validation.ts`.

### 31.8 Verificación
- Backend: 22 suites / 323 tests ✅ · `npm run build` ✅ · `npx tsc --noEmit` ✅
- Frontend: `npm run build` ✅
- Áreas protegidas sin tocar: stock/confirmación, flujo público, OTP, scoping, roles, schema Prisma y migraciones, rutas existentes, exports existentes, `gifts.service.ts`/controller existentes, bucket/path de storage, UI pública.
