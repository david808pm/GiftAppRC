# GiftApp — HANDOFF Document

> Documento de transferencia para retomar el proyecto en una nueva sesión.
> Última actualización: 6 de julio de 2026.

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
  │   │   │   ├── interceptors/timing.interceptor.ts  # [NUEVO] Medición de rendimiento
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
  │   │   ├── imports/
  │   │   │   ── imports.service.ts # [MODIFICADO] Bulk employee + beneficiary optimization
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
│   │   │   │   ├── Campaigns.jsx              # [MODIFICADO] Fix preview slug duplicado
│   │   │   │   ├── Employees.jsx          # [MODIFICADO] Paginación server-side + UX importación
│   │   │   │   ├── Gifts.jsx
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

---

## 9. Estado Actual de Git

```
Branch: main
Last commit: e2e2520 "Fase1"

Changes not staged (sesiones previas + sesiones 3, 4 y 6 de julio):
   - backend/src/campaigns/campaigns.service.ts                    (fix slug duplicado + otpEnabled en findBySlug)
   - backend/src/imports/imports.service.ts                        (bulk employee + beneficiary optimization)
   - backend/src/prisma/prisma.service.ts                          (sin cambios funcionales)
   - backend/src/public-selection/public-selection.service.ts       (DATA-01: fix StockMovement stale previousStock)
   - backend/src/employees/dto/employee-query.dto.ts               (page + pageSize)
   - backend/src/employees/employees.service.ts                    (paginación + búsqueda ampliada)
   - backend/src/beneficiaries/dto/beneficiary-query.dto.ts        (page + pageSize)
   - backend/src/beneficiaries/beneficiaries.service.ts            (paginación)
   - backend/src/gifts/gifts.service.ts                            (BUG-02: fix age filter + DATA-02: fix restore stock)
   - backend/src/selections/selections.service.ts                 (BUG-05: case-insensitive search)
   - backend/src/public-auth/public-auth.controller.ts             (+2 endpoints OTP)
   - backend/src/public-auth/public-auth.service.ts                (+requestCode, +verifyCode, refactor buildLoginResponse)
   - backend/src/public-auth/public-auth.module.ts                 (+EmailService provider)
   - backend/prisma/schema.prisma                                  (+6 campos OTP en Employee)
   - backend/.env.example                                          (+7 variables OTP/Resend)
   - backend/package.json                                          (+dependencia resend)
   - frontend/src/api/giftAppService.js                            (params opcionales + BUG-06 + CACHE-01/02/03 + funciones OTP)
   - frontend/src/api/apiClient.js                                 (FE-06: err.status = 401)
   - frontend/src/api/backendApiService.js                         (FE-06 + BUG-09 + funciones OTP)
   - frontend/src/pages/admin/AdminLayout.jsx                      (BUG-09: estado error transitorio)
   - frontend/src/pages/admin/AdminUsers.jsx                       (BUG-01: company dropdown fix)
   - frontend/src/pages/admin/Campaigns.jsx                        (fix preview slug + BUG-07)
   - frontend/src/pages/admin/Selections.jsx                       (FE-05: export error toast)
   - frontend/src/pages/admin/Employees.jsx                        (paginación server-side)
   - frontend/src/pages/admin/BeneficiariesAdmin.jsx               (paginación server-side)
   - frontend/src/pages/public/BeneficiarySelection.jsx            (BUG-08 + FE-06)
   - frontend/src/pages/public/Summary.jsx                         (BUG-08 + FE-06)
   - frontend/src/pages/public/AlreadyConfirmed.jsx                (FE-06)
   - frontend/src/pages/public/EmployeeLogin.jsx                   (flujo OTP de 2 pasos)
   - frontend/src/utils/validators.js                              (FE-04: empty age validation)
   - frontend/src/styles/global.css                                (estilos de paginación)

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
   - backend/test-timing.sh
   - backend/uploads/campaign-logos/1781982821926-m3r40d.png
   - frontend/src/utils/simpleCache.js
   - tigo_import_500_empleados.xlsx
   - tigo_import_500_empleados_nuevos_datos.xlsx
```

**IMPORTANTE:** Todos los cambios desde la sesión del 17 de junio NO han sido commiteados. Se deben commitear antes de desplegar a producción.

---

## 10. Problemas Conocidos y Deuda Técnica

### Alto impacto
1. **Pool de conexiones = 10:** El dashboard dispara 21 queries paralelas. Con cache esto se mitiga, pero bajo carga concurrente puede saturarse.
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

### Pendientes de la auditoría (no abordados en esta fase)
- SEC-01: Secrets en git history (`.env.us-west-2-backup` trackeado)
- SEC-02: JWT secrets reutilizados entre proyectos
- SEC-03: CORS `origin: true` + credentials
- SEC-04: Gift image upload sin magic-byte validation + sin Multer limits
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
8. **Consolidar queries del dashboard** con `groupBy` (21 queries → ~8 queries)
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

---

## 15. Contacto y Contexto Adicional

- **Proyecto original:** mimo-regalostestv7/mimo-regalostestv4
- **Versión anterior de referencia:** mimo-regalostestv4 (dentro del mismo directorio)
- **Informe de auditoría:** `Informe_Auditoria_mimo-regalos.docx`
- **Fecha de última sesión:** 6 de julio de 2026
- **Sesiones previas:** 6 fases de optimización de rendimiento + migración a us-east-1 + fix slug duplicado + bulk employee/beneficiary + employees/beneficiaries pagination + auditoría completa + 14 fixes de bugs funcionales/datos/caché/frontend + BUG-09 fix logout + Email OTP público con Resend (request-code, verify-code, anti-enumeración, lockout, rollback)
- **Supabase us-east-1:** Proyecto `uqxvrmcxumqnllaobrlh` en Virginia del Norte
- **Resend:** API key restringida a envío de emails. Cuenta: david808pm@hotmail.com. EMAIL_FROM temporal: `onboarding@resend.dev` (solo envía al dueño de la cuenta). Para producción: verificar dominio en resend.com/domains.
- **Empresas creadas:** Default Company, Nutresa, Coca-Cola, Tigo, EMP, Novaventa, TestCacheCompany (esta última creada durante verificación de CACHE-02)
- **Campañas activas:** `tigo-2026` (Tigo), `emp-navidad` (EMP), `coca-cola-mundial-2026` (Coca-Cola), `novaventa-premios` (Novaventa)

---

## 16. Gift Images — Supabase Storage

Gift image upload has been implemented using Supabase Storage.

### Architecture
- Frontend sends image file to backend using `multipart/form-data`.
- Backend validates file type (`image/jpeg`, `image/png`, `image/webp`) and size (max 2MB).
- Backend uploads file to Supabase Storage bucket `gift-images`.
- Backend stores the public URL in existing `GiftImage.imageUrl`.
- React does not connect directly to Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` is backend-only (never exposed to frontend).

### Storage path
```
campaign-{campaignId}/gift-{giftId}/{uuid}.{ext}
```
Example: `campaign-5/gift-2/4d6f91e3-fab1-4a61-81ea-f4f4029a8877.png`

### Upload behavior
- New uploaded image becomes primary: `isPrimary=true`, `sortOrder=0`.
- Existing images are preserved: `isPrimary=false`, `sortOrder` incremented.
- Existing external URLs continue working (no data loss).

### Endpoint
| Method | Path | Auth |
|--------|------|------|
| POST | `/api/admin/gifts/:id/images` | `SUPER_ADMIN` only |

Field name: `image`. Accepts `multipart/form-data`.

### Frontend
- Admin gift form has file input with preview, file name and size display.
- Admin gift list has thumbnail column.
- Public gift cards, gift modal and summary continue using `gift.imageUrls[0]`.

### Validation results
| Test | Result |
|------|--------|
| SUPER_ADMIN upload works | ✅ |
| Invalid file type rejected (422) | ✅ |
| File >2MB rejected (422) | ✅ |
| COMPANY_VIEWER cannot upload (401) | ✅ |
| Existing external URLs preserved | ✅ |
| Exactly one `isPrimary=true` per gift | ✅ |

### Files modified
| File | Change |
|------|--------|
| `backend/src/common/services/supabase-storage.service.ts` | New — Supabase Storage client |
| `backend/src/gifts/gifts.module.ts` | Added provider |
| `backend/src/gifts/gifts.admin.controller.ts` | Added upload endpoint |
| `backend/src/gifts/gifts.service.ts` | Added `uploadImage()` method |
| `backend/.env` | Added `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` |
| `backend/.env.example` | Added Supabase env placeholders |
| `frontend/src/api/backendApiService.js` | Added `uploadGiftImage()` |
| `frontend/src/api/giftAppService.js` | Added `giftAppUploadGiftImage()` |
| `frontend/src/pages/admin/Gifts.jsx` | File input, preview, thumbnail column |

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
