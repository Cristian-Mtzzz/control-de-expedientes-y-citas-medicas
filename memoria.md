# Memoria del proyecto

Este archivo es la guía de contexto para futuras modificaciones. **Antes de cambiar
código, consúltalo** para entender el propósito, las reglas de negocio y las decisiones
técnicas existentes. Después de un cambio importante, actualiza las secciones afectadas
y el historial breve del final.

No es un registro automático de cada línea editada: conserva las decisiones y razones
que ayudan a evitar regresiones. No anotes aquí contraseñas, tokens, datos de pacientes
ni valores privados del archivo `backend/.env`.

## Qué es el sistema

Aplicación web para un consultorio con varios médicos. Permite administrar pacientes,
organizar citas, registrar la atención y dar seguimiento a controles clínicos.

- Cliente: React 18, React Router y Vite en `frontend/`.
- Servidor: Node.js con módulos ES, Express y `node-oracledb` en `backend/`.
- Base de datos: Oracle (el esquema está pensado para ser compatible con Oracle 11g XE).
- Zona horaria prevista: `America/Tegucigalpa`.
- Perfiles de acceso: administrador (`admin`) y médico (`medico`).

## Cómo iniciar y validar

Desde la raíz del proyecto:

- `npm install`: instala dependencias de los workspaces.
- `npm run dev`: inicia API y aplicación web en paralelo.
- `npm run build`: compila el frontend.

Direcciones de desarrollo: Vite en `http://localhost:5173`, API en
`http://localhost:4000`. Vite reenvía `/api` al servidor Express.

El backend lee su configuración desde `backend/.env`. Oracle debe estar instalado y
activo, o se puede levantar la instancia de desarrollo con `docker-compose.yml`.
Consulta `README.md` y `backend/.env.example` para configurar Oracle y el cliente
Oracle en Windows.

> **Cuidado con la base:** `npm run db:init` recrea las tablas y carga datos de ejemplo;
> puede borrar los datos existentes. No lo ejecutes para una actualización normal ni
> para comprobar un cambio en una base con datos reales. Para cambios de esquema sobre
> una base existente, crea una migración no destructiva, documenta cómo aplicarla y
> recomienda respaldo previo.

## Estructura y responsabilidad de los módulos

### Frontend (`frontend/src/`)

- `App.jsx`: rutas protegidas y páginas según sesión y rol.
- `auth.jsx`: estado de sesión; restaura el usuario mediante `/api/auth/me`.
- `api.js`: cliente HTTP común, agrega el token JWT y presenta errores del servidor.
- `components/Layout.jsx`: navegación, usuario activo, avisos y marco común.
- `components/Modal.jsx`: componentes de diálogo y confirmación compartidos.
- `components/PacienteForm.jsx`: alta y edición de pacientes.
- `components/CitaForm.jsx`: nueva cita, reagendado y citas vinculadas a seguimientos.
- `components/AtenderForm.jsx`: captura de la atención clínica.
- `pages/Agenda.jsx`: agenda diaria, estados de las citas y acceso a la atención.
- `pages/Pacientes.jsx`: directorio filtrable.
- `pages/Ficha.jsx`: expediente, citas, seguimientos y notas.
- `pages/Seguimiento.jsx`: controles pendientes, agendados y cerrados.
- `pages/Usuarios.jsx`: administración de cuentas, solo para el administrador.
- `styles.css`: estilos globales y responsivos; paleta verde clínica, superficies
  claras y una barra lateral verde oscura.

### Backend (`backend/src/`)

- `index.js`: inicializa el pool Oracle, monta rutas, configura middleware y errores.
- `db.js`: única capa que conoce detalles de Oracle; adapta parámetros, fechas, CLOB,
  resultados y transacciones.
- `auth.js`: JWT, usuario autenticado vigente, permisos por rol, errores HTTP y
  envoltura de rutas asíncronas.
- `routes/auth.js`: inicio de sesión y consulta del usuario actual.
- `routes/usuarios.js`: cuentas, médicos activos y logos; operaciones administrativas
  requieren el rol adecuado.
- `routes/pacientes.js`: directorio, búsqueda de pacientes para citas, expedientes y
  altas/ediciones.
- `routes/citas.js`: disponibilidad, reservas, estados, atención y notas.
- `routes/seguimientos.js`: consulta y cierre de controles.

### Base de datos (`backend/db/`)

- `schema.sql`: tablas, restricciones, índices, secuencias y triggers. Es destructivo
  si se ejecuta completo en un esquema que ya contiene datos.
- `init.js`: ejecuta la inicialización y carga datos de demostración.
- `crear_admin.js`: crea o restablece la cuenta de administración.
- `migracion_propietario_medico.sql` y `migracion_logo_medico.sql`: cambios dirigidos
  a bases existentes; leer y respaldar antes de aplicarlos.

## Reglas de negocio que hay que preservar

1. **El médico propietario es la frontera de acceso.** `pacientes.medico_id` determina
   quién puede ver y atender el expediente. Tener una cita histórica con un paciente
   no concede acceso a su expediente.
2. **El médico trabaja con sus propios pacientes.** El servidor vuelve a validar el
   acceso y la propiedad; ocultar un botón o filtrar resultados en el cliente no basta.
3. **El administrador tiene acceso global**, puede asignar y transferir pacientes y
   crear/editar usuarios. Una cita debe corresponder al médico propietario actual del
   paciente; si se necesita otro médico, primero se transfiere el paciente.
4. **Las notas clínicas son solo para médicos.** No incluirlas en respuestas generales
   ni ampliar su acceso por cambios en el frontend.
5. **No se permiten cruces de horario para un médico.** La reserva bloquea la fila del
   médico en una transacción antes de comprobar disponibilidad, para reducir conflictos
   entre reservas concurrentes.
6. **Atender una cita es atómico.** Nota, cierre de cita, seguimiento opcional y cita
   subsiguiente se procesan juntos; un fallo no debe dejar guardada solo una parte.
7. **Ciclo del seguimiento:** `pendiente → agendado → cumplido`, o `cerrado`. Si se
   cancela la cita subsiguiente o el paciente no asiste, el seguimiento vuelve a
   `pendiente`.
8. Las validaciones importantes y permisos deben implementarse en el servidor, no
   confiar en los valores enviados por el cliente.
9. Desactivar un usuario cambia solo su estado de acceso. No borra ni reasigna sus
   pacientes, citas, seguimientos, notas, contraseña ni logo. El inicio de sesión exige
   `activo = 1`, y cada petición autenticada vuelve a comprobar que la cuenta siga activa;
   al reactivarla, sus registros y acceso vuelven a estar disponibles.

## Decisiones técnicas importantes

- Las rutas usan parámetros `$1`, `$2`, etc. La capa `db.js` los convierte a binds de
  Oracle (`:p1`, `:p2`, etc.). Mantén consultas parametrizadas: no interpolar datos del
  usuario en el SQL.
- `db.js` convierte fechas Oracle al formato `YYYY-MM-DD`, que consume el frontend;
  mantener esa conversión centralizada.
- Oracle 11g no tiene `IDENTITY` ni un tipo `TIME` apropiado para la hora de cita. Los
  IDs los generan secuencias y triggers; `citas.hora` es `HH:MM` y `hora_min` es una
  columna virtual para detectar cruces.
- Los booleanos de Oracle se representan como `NUMBER(1)` (`0`/`1`).
- Textos clínicos largos se almacenan en `CLOB`. Usa los tipos/helpers de `db.js`.
- Los errores de ruta usan `HttpError` cuando corresponde y llegan al manejador central
  de `index.js`; no ocultar fallos con respuestas que parezcan exitosas.
- Hay bases existentes en distintas versiones de Oracle. Evita asumir que toda columna
  opcional ya existe; revisa el soporte de compatibilidad antes de depender de ella.

## Flujo de cita y búsqueda actual

El formulario compartido `CitaForm` se abre desde Agenda, la ficha del paciente y
Seguimiento. Puede crear una cita nueva, reagendar o preseleccionar un paciente y/o
seguimiento.

- Al crear una cita desde Agenda, **se elige un médico y luego se busca un paciente
  existente por número de identidad**; no se crea un paciente desde ese formulario.
- La búsqueda comienza tras escribir al menos cuatro dígitos, espera 300 ms después de
  teclear y devuelve como máximo 20 resultados. Esto evita cargar el directorio completo
  en cada cita.
- `GET /api/pacientes/buscar-cita` devuelve solo los campos necesarios para el selector.
  El servidor filtra por identidad y por el médico propietario seleccionado. Para un
  usuario médico, ignora otros propietarios y limita los resultados a sus pacientes.
- La selección directa por ID se usa cuando se abre el formulario desde un paciente,
  reagendado o seguimiento; también debe comprobar en servidor que el paciente pertenece
  al médico previsto.
- La creación de pacientes permanece en el directorio de pacientes. Si un paciente no
  existe, se registra allí y después se agenda su cita.
- Los seguimientos pendientes asociados se sugieren y, al reservar la cita, se actualiza
  su estado en la misma transacción.

No conviertas esta búsqueda en una carga masiva ni permitas que el cliente determine por
sí solo qué pacientes puede ver un médico.

## Guía para futuras modificaciones

Antes de editar:

1. Leer esta memoria y luego revisar el código actual; el código es la fuente de verdad
   si una sección de esta guía quedó desactualizada.
2. Identificar qué roles, pantallas, endpoints, consultas SQL y flujos existentes pueden
   verse afectados.
3. Buscar patrones ya existentes y reutilizar el cliente `api`, helpers de `db.js`,
   `HttpError`, componentes compartidos y estilos del proyecto.
4. Si el cambio afecta datos existentes, preferir una migración no destructiva y
   explicar cómo aplicarla. Nunca modificar datos de producción como parte de una prueba.
5. Validar con el comando más pequeño adecuado. Para el frontend, ejecutar
   `npm run build`; para backend, comprobar sintaxis y, cuando se pueda, el flujo afectado
   con datos de desarrollo.
6. Actualizar esta memoria si cambian arquitectura, reglas, flujos o comandos. Registrar
   aquí el propósito y la razón, no credenciales ni datos clínicos.

## Cambios recientes reflejados en esta memoria

- Se probaron dos rediseños visuales (azul "tinta de receta" y "libro de citas" con
  serif y membrete superior) y se descartaron a pedido del usuario; se restauró el
  estilo verde original. Sobre ese estilo solo se hicieron retoques: se quitaron
  etiquetas en mayúsculas y rótulos sobre títulos (`nav-caption`, `page-kicker`,
  "Bienvenido"), el gráfico de órbitas del login y el círculo decorativo de la tarjeta
  de controles; las horas y números dejaron de usar fuente monoespaciada; los textos
  de 9–10 px subieron a 10.5–12 px. Al hacer cambios visuales, preferir ajustes
  pequeños que respeten este diseño en lugar de rediseños completos.

- En la base Oracle local faltaba `USUARIOS.LOGO_DATA`. Se aplicó la migración
  aditiva e idempotente `backend/db/migracion_logo_medico.sql`, que agrega la columna
  CLOB sin borrar ni modificar los demás datos.
- Se probó el flujo de logos en la API con cuentas temporales: el administrador guardó
  dos PNG distintos en dos médicos; Oracle conservó ambos y `/auth/login` y
  `/auth/me` devolvieron el logo correspondiente a cada cuenta. Las cuentas temporales
  se eliminaron al finalizar. En la consulta posterior no quedaron cuentas temporales;
  las cuentas actuales de la base aún no tienen logos asignados.
- Se quitó el bloqueo que impedía desactivar o cambiar el rol de un médico con pacientes
  asignados. La edición de usuario solo actualiza la cuenta; los expedientes y su historial
  permanecen asociados y se conservan al desactivar/reactivar.
- Se probó en Oracle con cuentas y un paciente temporales: desactivar el médico revocó
  el inicio de sesión y los tokens activos sin cambiar ni borrar sus datos; reactivarlo
  permitió iniciar sesión y volver a consultar el mismo paciente. Los datos temporales se
  eliminaron después de la prueba.
- Se quitó de la barra lateral la tarjeta decorativa “Atención coordinada”; la navegación
  y el bloque de sesión del usuario permanecen. El bloque de sesión conserva
  `margin-top: auto` para permanecer anclado al final de la barra lateral.
- El selector de “Nueva cita” dejó de cargar todos los pacientes y ahora busca por
  identidad con debounce y límite de resultados.
- Se confirmó que solo deben aparecer pacientes existentes del médico seleccionado; se
  retiró del formulario de citas el acceso a registrar uno nuevo. El alta se hace desde
  la sección Pacientes.
