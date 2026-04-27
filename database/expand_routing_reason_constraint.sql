ALTER TABLE complaint_routing_logs
DROP CONSTRAINT IF EXISTS complaint_routing_logs_routing_reason_check;

ALTER TABLE complaint_routing_logs
ADD CONSTRAINT complaint_routing_logs_routing_reason_check
CHECK (
  routing_reason IN (
    'NORMAL',
    'HIGH_PRIORITY_ESCALATION',
    'MEDIUM_PRIORITY_ESCALATION',
    'NO_JURISDICTION',
    'NO_JURISDICTION_AUTHORITY',
    'JURISDICTION_FALLBACK',
    'NO_DEPARTMENT_AUTHORITY',
    'SUPER_ADMIN_FALLBACK',
    'RE_ROUTING'
  )
);
