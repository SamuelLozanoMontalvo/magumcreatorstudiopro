# 🚀 MAGUM Creator Studio - Backend API

Backend profesional desarrollado en **Node.js**, **Express**, **PostgreSQL** y autenticación robusta con **JWT** y **bcrypt**, optimizado para despliegue en **Railway**.

---

## 📁 Estructura del Backend

```text
backend/
├── server.js               # Entrada principal, cabeceras de seguridad, CORS y rate limiting
├── package.json            # Dependencias y scripts de ejecución
├── .env.example            # Plantilla de variables de entorno
├── railway.json            # Configuración para despliegue en Railway
├── tests/                  # Suite de pruebas automatizadas
└── src/
    ├── config/
    │   └── db.js           # Pool PostgreSQL, migraciones de esquema y soporte UUID
    ├── middleware/
    │   └── auth.js         # Verificación estricta de JWT, control de roles y validación de suspensiones
    └── routes/
        ├── auth.routes.js     # Login unificado con Bcrypt y /me
        ├── accounts.routes.js # CRUD de Cuentas, protección de administradores y soft delete
        ├── crm.routes.js      # CRUD de Contactos, importación transaccional y deduplicación
        ├── team.routes.js     # Profesionales del equipo con control de acceso por titular
        ├── billing.routes.js  # Facturación, planes prepago y métricas MRR
        └── settings.routes.js # Ajustes de marca y plataforma protegidos
```

---

## 🛠️ Ejecución Local

1. Abre la terminal en la carpeta `backend`:
   ```bash
   cd backend
   npm install
   ```

2. Configura tu archivo `.env` basado en `.env.example`.

3. Inicia el servidor:
   ```bash
   npm start
   # o con recarga automática:
   npm run dev
   ```

4. Healthcheck: `http://localhost:5000/api/health`

---

## 🚂 Despliegue en Railway

1. Crea un proyecto en [railway.app](https://railway.app) con **PostgreSQL**.
2. Conecta el repositorio de GitHub.
3. Define las variables de entorno en Railway:
   - `DATABASE_URL`: URL de conexión provista por PostgreSQL en Railway.
   - `JWT_SECRET`: Clave secreta criptográfica de alta entropía.
   - `INITIAL_ADMIN_PASSWORD`: Contraseña asignada al Super Administrador inicial.
   - `NODE_ENV`: `production`
   - `ALLOWED_ORIGINS`: Dominios autorizados para CORS separados por coma.
