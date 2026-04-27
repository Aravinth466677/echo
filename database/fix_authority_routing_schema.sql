-- Canonical authority-routing schema fix
-- Makes authority assignments/logs use authorities.id consistently

ALTER TABLE complaint_routing_logs
ADD COLUMN IF NOT EXISTS routed_to_authority_id INTEGER REFERENCES authorities(id);

CREATE INDEX IF NOT EXISTS idx_routing_logs_authority_id
ON complaint_routing_logs(routed_to_authority_id);

-- Backfill complaint assignments where the old assigned_to id already matches an authority id.
UPDATE complaints c
SET assigned_authority_id = c.assigned_to
WHERE c.assigned_authority_id IS NULL
  AND c.assigned_to IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM authorities a
    WHERE a.id = c.assigned_to
  );

UPDATE complaints c
SET escalated_authority_id = c.escalated_to
WHERE c.escalated_authority_id IS NULL
  AND c.escalated_to IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM authorities a
    WHERE a.id = c.escalated_to
  );

-- Backfill routing logs from matching authority ids / emails / names when possible.
UPDATE complaint_routing_logs crl
SET routed_to_authority_id = crl.routed_to_user_id
WHERE crl.routed_to_authority_id IS NULL
  AND crl.routed_to_user_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM authorities a
    WHERE a.id = crl.routed_to_user_id
  );

UPDATE complaint_routing_logs crl
SET routed_to_authority_id = a.id
FROM authorities a
WHERE crl.routed_to_authority_id IS NULL
  AND crl.authority_email IS NOT NULL
  AND LOWER(a.email) = LOWER(crl.authority_email);

UPDATE complaint_routing_logs crl
SET routed_to_authority_id = a.id
FROM authorities a
WHERE crl.routed_to_authority_id IS NULL
  AND crl.authority_name IS NOT NULL
  AND a.full_name = crl.authority_name;
