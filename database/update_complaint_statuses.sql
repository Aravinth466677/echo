-- Migration: Expand complaints.status allowed values for hierarchy workflow
-- Run this after schema.sql / existing migrations.

ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_status_check;

ALTER TABLE complaints
ADD CONSTRAINT complaints_status_check
CHECK (
  status IN (
    'submitted',
    'assigned',
    'in_progress',
    'resolved',
    'escalated',
    'aggregated',
    'rejected'
  )
);
