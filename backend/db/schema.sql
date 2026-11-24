--------------------------------------------------------------------------------
-- Consultorio multimédico · Esquema para Oracle Database
--
-- Cómo ejecutarlo:
--   · SQL Developer: abre este archivo con la conexión CONSULTORIO y pulsa
--     "Ejecutar script" (F5). No uses "Ejecutar sentencia" (Ctrl + Enter),
--     porque el archivo tiene varias sentencias y bloques PL/SQL.
--   · Terminal: npm run db:init   (hace esto y además carga datos de ejemplo)
--
-- ¡Atención! Borra las cinco tablas del sistema y las vuelve a crear vacías.
--
-- Está escrito para Oracle 11g XE, que todavía no tiene columnas IDENTITY:
-- los id se generan con una SECUENCIA y un DISPARADOR por tabla.
--------------------------------------------------------------------------------

-- Oracle no tiene "DROP TABLE IF EXISTS": este bloque borra solo lo que exista.
BEGIN
  FOR t IN (SELECT table_name FROM user_tables
             WHERE table_name IN ('NOTAS','SEGUIMIENTOS','CITAS','PACIENTES','USUARIOS')) LOOP
    EXECUTE IMMEDIATE 'DROP TABLE ' || t.table_name || ' CASCADE CONSTRAINTS PURGE';
  END LOOP;
  FOR s IN (SELECT sequence_name FROM user_sequences
             WHERE sequence_name IN ('NOTAS_SEQ','SEGUIMIENTOS_SEQ','CITAS_SEQ','PACIENTES_SEQ','USUARIOS_SEQ')) LOOP
    EXECUTE IMMEDIATE 'DROP SEQUENCE ' || s.sequence_name;
  END LOOP;
END;
/

-- Personal del consultorio: médicos y administración
CREATE TABLE usuarios (
  id             NUMBER(10)    NOT NULL,
  nombre         VARCHAR2(120) NOT NULL,
  email          VARCHAR2(160) NOT NULL,
  password_hash  VARCHAR2(100) NOT NULL,
  rol            VARCHAR2(20)  NOT NULL,
  especialidad   VARCHAR2(80),
  color          VARCHAR2(7)   DEFAULT '#2d6fa8' NOT NULL,
  logo_data      CLOB,
  activo         NUMBER(1)     DEFAULT 1 NOT NULL,
  creado         TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT usuarios_pk       PRIMARY KEY (id),
  CONSTRAINT usuarios_email_uk UNIQUE (email),
  CONSTRAINT usuarios_rol_ck    CHECK (rol IN ('admin','medico')),
  CONSTRAINT usuarios_activo_ck CHECK (activo IN (0,1))
);

CREATE TABLE pacientes (
  id                   NUMBER(10)   NOT NULL,
  nombres              VARCHAR2(80) NOT NULL,
  apellidos            VARCHAR2(80) NOT NULL,
  dni                  VARCHAR2(20),
  fecha_nac            DATE         NOT NULL,
  sexo                 VARCHAR2(1)  NOT NULL,
  telefono             VARCHAR2(20) NOT NULL,
  email                VARCHAR2(160),
  direccion            VARCHAR2(200),
  sangre               VARCHAR2(3),
  alergias             VARCHAR2(200),
  contacto_emergencia  VARCHAR2(160),
  medico_id            NUMBER(10)   NOT NULL,
  creado               TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pacientes_pk     PRIMARY KEY (id),
  CONSTRAINT pacientes_dni_uk UNIQUE (dni),
  CONSTRAINT pacientes_sexo_ck   CHECK (sexo IN ('F','M')),
  CONSTRAINT pacientes_medico_fk FOREIGN KEY (medico_id) REFERENCES usuarios (id)
);

-- La hora se guarda como texto 'HH:MM' porque Oracle no tiene un tipo TIME.
-- hora_min es una columna virtual (no ocupa espacio en disco): la misma hora en
-- minutos desde medianoche, para comparar cruces de horario con una resta.
CREATE TABLE citas (
  id                     NUMBER(10)    NOT NULL,
  paciente_id            NUMBER(10)    NOT NULL,
  medico_id              NUMBER(10)    NOT NULL,
  fecha                  DATE          NOT NULL,
  hora                   VARCHAR2(5)   NOT NULL,
  hora_min               NUMBER(4) GENERATED ALWAYS AS
                           (TO_NUMBER(SUBSTR(hora,1,2)) * 60 + TO_NUMBER(SUBSTR(hora,4,2))) VIRTUAL,
  duracion               NUMBER(3)     DEFAULT 30 NOT NULL,
  tipo                   VARCHAR2(15)  NOT NULL,
  motivo                 VARCHAR2(200) NOT NULL,
  estado                 VARCHAR2(15)  DEFAULT 'programada' NOT NULL,
  origen_seguimiento_id  NUMBER(10),
  creado_por             NUMBER(10),
  creado_por_nombre      VARCHAR2(120),
  creado                 TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT citas_pk PRIMARY KEY (id),
  CONSTRAINT citas_hora_ck     CHECK (REGEXP_LIKE(hora, '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
  CONSTRAINT citas_duracion_ck CHECK (duracion BETWEEN 5 AND 240),
  CONSTRAINT citas_tipo_ck     CHECK (tipo IN ('primera','subsiguiente')),
  CONSTRAINT citas_estado_ck   CHECK (estado IN ('programada','confirmada','atendida','cancelada','no_asistio')),
  CONSTRAINT citas_paciente_fk FOREIGN KEY (paciente_id) REFERENCES pacientes (id),
  CONSTRAINT citas_medico_fk   FOREIGN KEY (medico_id)   REFERENCES usuarios (id),
  CONSTRAINT citas_creador_fk  FOREIGN KEY (creado_por)  REFERENCES usuarios (id)
);

CREATE INDEX citas_medico_fecha_ix ON citas (medico_id, fecha);
CREATE INDEX citas_paciente_ix     ON citas (paciente_id);

-- Un control indicado al atender una cita.
-- Ciclo: pendiente -> agendado -> cumplido (o cerrado, si se cierra sin cita)
CREATE TABLE seguimientos (
  id              NUMBER(10)    NOT NULL,
  paciente_id     NUMBER(10)    NOT NULL,
  medico_id       NUMBER(10)    NOT NULL,
  cita_origen_id  NUMBER(10),
  fecha_objetivo  DATE          NOT NULL,
  motivo          VARCHAR2(200) NOT NULL,
  estado          VARCHAR2(15)  DEFAULT 'pendiente' NOT NULL,
  cita_id         NUMBER(10),
  creado          TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT seguimientos_pk PRIMARY KEY (id),
  CONSTRAINT seguimientos_estado_ck   CHECK (estado IN ('pendiente','agendado','cumplido','cerrado')),
  CONSTRAINT seguimientos_paciente_fk FOREIGN KEY (paciente_id)    REFERENCES pacientes (id),
  CONSTRAINT seguimientos_medico_fk   FOREIGN KEY (medico_id)      REFERENCES usuarios (id),
  CONSTRAINT seguimientos_origen_fk   FOREIGN KEY (cita_origen_id) REFERENCES citas (id),
  CONSTRAINT seguimientos_cita_fk     FOREIGN KEY (cita_id)        REFERENCES citas (id)
);

CREATE INDEX seguimientos_medico_estado_ix ON seguimientos (medico_id, estado);

-- Se agrega al final porque citas y seguimientos se apuntan mutuamente
ALTER TABLE citas ADD CONSTRAINT citas_origen_seguimiento_fk
  FOREIGN KEY (origen_seguimiento_id) REFERENCES seguimientos (id);

-- Nota clínica: una por cita atendida
CREATE TABLE notas (
  id            NUMBER(10)    NOT NULL,
  cita_id       NUMBER(10)    NOT NULL,
  paciente_id   NUMBER(10)    NOT NULL,
  medico_id     NUMBER(10)    NOT NULL,
  fecha         DATE          NOT NULL,
  motivo        VARCHAR2(200),
  examen        CLOB,
  diagnostico   VARCHAR2(250) NOT NULL,
  tratamiento   CLOB,
  indicaciones  CLOB,
  creado        TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT notas_pk      PRIMARY KEY (id),
  CONSTRAINT notas_cita_uk UNIQUE (cita_id),
  CONSTRAINT notas_cita_fk     FOREIGN KEY (cita_id)     REFERENCES citas (id),
  CONSTRAINT notas_paciente_fk FOREIGN KEY (paciente_id) REFERENCES pacientes (id),
  CONSTRAINT notas_medico_fk   FOREIGN KEY (medico_id)   REFERENCES usuarios (id)
);

CREATE INDEX notas_paciente_ix ON notas (paciente_id);

--------------------------------------------------------------------------------
-- Generación de id: una secuencia y un disparador por tabla.
-- El disparador solo actúa cuando el INSERT no trae id, así que también se
-- pueden insertar filas con un id elegido a mano.
--------------------------------------------------------------------------------

CREATE SEQUENCE usuarios_seq     START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE pacientes_seq    START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE citas_seq        START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE seguimientos_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE notas_seq        START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

CREATE OR REPLACE TRIGGER usuarios_bi
  BEFORE INSERT ON usuarios FOR EACH ROW WHEN (new.id IS NULL)
BEGIN
  :new.id := usuarios_seq.NEXTVAL;
END;
/

CREATE OR REPLACE TRIGGER pacientes_bi
  BEFORE INSERT ON pacientes FOR EACH ROW WHEN (new.id IS NULL)
BEGIN
  :new.id := pacientes_seq.NEXTVAL;
END;
/

CREATE OR REPLACE TRIGGER citas_bi
  BEFORE INSERT ON citas FOR EACH ROW WHEN (new.id IS NULL)
BEGIN
  :new.id := citas_seq.NEXTVAL;
END;
/

CREATE OR REPLACE TRIGGER seguimientos_bi
  BEFORE INSERT ON seguimientos FOR EACH ROW WHEN (new.id IS NULL)
BEGIN
  :new.id := seguimientos_seq.NEXTVAL;
END;
/

CREATE OR REPLACE TRIGGER notas_bi
  BEFORE INSERT ON notas FOR EACH ROW WHEN (new.id IS NULL)
BEGIN
  :new.id := notas_seq.NEXTVAL;
END;
/
