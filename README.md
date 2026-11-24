# Consultorio medico

Aplicación web para administrar pacientes, citas médicas, atención clínica y
seguimientos en un consultorio con varios médicos.

- **Frontend:** React, React Router y Vite.
- **Backend:** Node.js y Express.
- **Base de datos:** Oracle Database.

## Requisitos

- Node.js 20 o posterior.
- Oracle Database instalado, o Docker para ejecutar Oracle 23ai Free.

## Cómo ejecutar

### 1. Iniciar Oracle

Si ya tienes Oracle instalado, asegúrate de que el servicio de base de datos y el
listener estén activos.

Si vas a usar Docker, desde la raíz del proyecto ejecuta:

```bash
docker compose up -d
```

La primera inicialización puede tardar varios minutos. Puedes revisar el estado con:

```bash
docker compose logs -f db
```

### 2. Instalar dependencias y configurar el servidor

Desde la raíz del proyecto:

```bash
npm install
```

Crea `backend/.env` a partir de `backend/.env.example` y configura la conexión a Oracle:

```powershell
Copy-Item backend\.env.example backend\.env
```

### 3. Crear las tablas

En la primera instalación, ejecuta:

```bash
npm run db:init
```

Este comando crea las tablas y carga datos de ejemplo. **Elimina y vuelve a crear
las tablas del esquema**, por lo que no debe ejecutarse en una base que ya tenga
datos que quieras conservar.

### 4. Iniciar la aplicación

Desde la raíz del proyecto:

```bash
npm run dev
```

Abre <http://localhost:5173>. El backend queda disponible en
<http://localhost:4000>.

## Estructura del proyecto

```text
citas_M/
├── backend/
│   ├── api.http
│   ├── db/
│   │   ├── schema.sql
│   │   ├── init.js
│   │   ├── crear_admin.js
│   │   └── migraciones SQL
│   └── src/
│       ├── index.js
│       ├── db.js
│       ├── auth.js
│       └── routes/
│           ├── auth.js
│           ├── citas.js
│           ├── pacientes.js
│           ├── seguimientos.js
│           └── usuarios.js
├── frontend/
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       ├── auth.jsx
│       ├── styles.css
│       ├── components/
│       └── pages/
├── docker-compose.yml
└── package.json
```
