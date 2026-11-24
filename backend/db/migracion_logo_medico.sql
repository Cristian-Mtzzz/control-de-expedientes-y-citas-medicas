-- Agrega almacenamiento de logos para las cuentas médicas existentes.
-- Ejecutar una vez desde SQL Developer como dueño del esquema CONSULTORIO.
-- No elimina ni modifica datos existentes.
DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM user_tab_columns
   WHERE table_name = 'USUARIOS'
     AND column_name = 'LOGO_DATA';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE usuarios ADD (logo_data CLOB)';
  END IF;
END;
/
