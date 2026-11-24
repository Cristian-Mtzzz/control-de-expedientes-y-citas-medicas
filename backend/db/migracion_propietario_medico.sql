-- Migración no destructiva a dos roles y pacientes con propietario obligatorio.
--
-- Ejecutar UNA vez desde SQL Developer como el dueño del esquema CONSULTORIO.
-- Hacer un respaldo antes. No ejecutar db:init: ese comando elimina los datos.
--
-- Los pacientes sin médico se asignan automáticamente solo cuando todas sus
-- citas históricas apuntan a un único médico. Los casos ambiguos quedan para
-- asignación manual; el bloque de validación detiene la migración antes de
-- cambiar roles o eliminar cuentas.

UPDATE pacientes p
   SET medico_id = (
     SELECT MIN(c.medico_id)
       FROM citas c
      WHERE c.paciente_id = p.id
      HAVING COUNT(DISTINCT c.medico_id) = 1
   )
 WHERE p.medico_id IS NULL
   AND (SELECT COUNT(DISTINCT c.medico_id)
          FROM citas c
         WHERE c.paciente_id = p.id) = 1;

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pacientes WHERE medico_id IS NULL;
  IF v_count > 0 THEN
    RAISE_APPLICATION_ERROR(
      -20001,
      'Hay pacientes sin médico propietario. Asígnalos manualmente y vuelve a ejecutar la migración.'
    );
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM pacientes p
    JOIN usuarios u ON u.id = p.medico_id
   WHERE u.rol <> 'medico' OR u.activo <> 1;
  IF v_count > 0 THEN
    RAISE_APPLICATION_ERROR(
      -20004,
      'Hay pacientes asignados a cuentas que no son médicos activos. Reasígnalos antes de migrar.'
    );
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM usuarios u
   WHERE u.rol = 'recepcion'
     AND (
       EXISTS (SELECT 1 FROM pacientes p WHERE p.medico_id = u.id)
       OR EXISTS (SELECT 1 FROM citas c WHERE c.medico_id = u.id)
       OR EXISTS (SELECT 1 FROM seguimientos s WHERE s.medico_id = u.id)
       OR EXISTS (SELECT 1 FROM notas n WHERE n.medico_id = u.id)
     );
  IF v_count > 0 THEN
    RAISE_APPLICATION_ERROR(
      -20002,
      'Una cuenta de recepción tiene registros clínicos asociados. Reasígnalos a un médico antes de migrar.'
    );
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM usuarios
   WHERE rol NOT IN ('admin', 'medico', 'recepcion');
  IF v_count > 0 THEN
    RAISE_APPLICATION_ERROR(
      -20003,
      'Hay roles no reconocidos en USUARIOS. Revísalos antes de migrar.'
    );
  END IF;
END;
/

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM user_tab_columns
   WHERE table_name = 'CITAS' AND column_name = 'CREADO_POR_NOMBRE';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE citas ADD creado_por_nombre VARCHAR2(120)';
  END IF;
END;
/

-- Conserva el nombre histórico de recepción antes de retirar esas cuentas.
UPDATE citas c
   SET creado_por_nombre = (
     SELECT u.nombre FROM usuarios u WHERE u.id = c.creado_por
   )
 WHERE EXISTS (
   SELECT 1 FROM usuarios u
    WHERE u.id = c.creado_por AND u.rol = 'recepcion'
 );

UPDATE citas
   SET creado_por = NULL
 WHERE creado_por IN (SELECT id FROM usuarios WHERE rol = 'recepcion');

DELETE FROM usuarios WHERE rol = 'recepcion';

DECLARE
  v_count NUMBER;
  v_nullable VARCHAR2(1);
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM user_constraints
   WHERE table_name = 'USUARIOS'
     AND constraint_name = 'USUARIOS_ROL_CK';
  IF v_count > 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_ck';
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM user_constraints
   WHERE table_name = 'USUARIOS'
     AND constraint_name = 'USUARIOS_ROL_CK';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE
      'ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_ck CHECK (rol IN (''admin'',''medico''))';
  END IF;

  SELECT nullable INTO v_nullable
    FROM user_tab_columns
   WHERE table_name = 'PACIENTES' AND column_name = 'MEDICO_ID';
  IF v_nullable = 'Y' THEN
    EXECUTE IMMEDIATE 'ALTER TABLE pacientes MODIFY medico_id NOT NULL';
  END IF;
END;
/

COMMIT;
