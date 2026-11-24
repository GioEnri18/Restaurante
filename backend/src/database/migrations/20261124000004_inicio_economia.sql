UPDATE roles
SET vista_inicial = '/economia', updated_at = CURRENT_TIMESTAMP
WHERE codigo = 'AUDITOR' AND vista_inicial = '/auditoria';
