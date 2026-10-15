# 🚀 MAGUM Creator Studio - Backend API

Backend profesional desarrollado en **Node.js**, **Express**, **PostgreSQL** y autenticación segura con **JWT** y **bcrypt**, optimizado para despliegue en **Railway**.

---

## 📁 Estructura del Backend

```text
backend/
├── server.js               # Entrada principal del servidor Express & CORS
├── package.json            # Dependencias y scripts de ejecución
├── .env.example            # Plantilla de variables de entorno
├── .env                    # Configuración activa local
├── railway.json            # Configuración para despliegue en Railway
└── src/
    ├── config/
    │   └── db.js           # Pool PostgreSQL & migración automática de tablas (Seed)
    ├── middleware/
    │   └── auth.js         # Verificación JWT y control de roles (Admin / Cliente / Equipo)
    └── routes/
        ├── auth.routes.js     # Login (Super Admin, Clientes y Profesionales) y /me
        ├── accounts.routes.js # CRUD de Cuentas para el Super Admin
        ├── crm.routes.js      # CRUD de Contactos, acciones masivas y difusiones
        ├── team.routes.js     # Profesionales del equipo con acceso a la plataforma
        ├── billing.routes.js  # CRM de Facturación y cálculo de cobros
        └── settings.routes.js # Ajustes de marca y plataforma
```

---

## 🛠️ Ejecución Local

1. Abre la terminal en la carpeta `backend`:
   ```bash
   cd backend
   npm install
   ```

2. Inicia el servidor en modo desarrollo:
   ```bash
   npm start
   # o con recarga automática:
   npm run dev
   ```

3. El servidor iniciará en:
   ```text
   http://localhost:5000
   ```
   - Healthcheck: `http://localhost:5000/api/health`

---

## 🚂 Despliegue en Railway (Paso a Paso)

1. Ingresa a [railway.app](https://railway.app) y crea un **New Project**.
2. **Añade la Base de Datos:**
   - Haz clic en `+ New` -> `Database` -> `Add PostgreSQL`.
3. **Despliega el Backend:**
   - Haz clic en `+ New` -> `GitHub Repo` -> Selecciona tu repositorio `Magum creator Studio`.
   - En la pestaña **Settings** del servicio en Railway:
     - **Root Directory:** `/backend`
     - **Start Command:** `npm start`
4. **Conecta las Variables de Entorno:**
   - En la pestaña **Variables** del servicio de Node, agrega:
     - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}` *(Railway la auto-completa)*
     - `JWT_SECRET`: `tu_clave_secreta_super_segura_2026`
     - `ADMIN_USERNAME`: `McSAdmin`
     - `ADMIN_PASSWORD`: `MagumAdmin#2030`
     - `NODE_ENV`: `production`
5. **Listo:** Al iniciar, el backend ejecutará `initDatabase()` de forma automática, creando todas las tablas en PostgreSQL e insertando los datos iniciales de prueba.

---

## 🔐 Credenciales Iniciales

- **Super Administrador:**
  - Usuario: `McSAdmin`
  - Contraseña: `MagumAdmin#2030`
- **Cliente Demo:**
  - Correo: `cliente@automotor.com`
  - Contraseña: `Auto2026*`
- **Profesional Demo:**
  - Correo: `mateo@automotor.com`
  - Contraseña: `Mateo2026*`
