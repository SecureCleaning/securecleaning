-- Add Working with Children's Check tracking to cleaner records.

ALTER TABLE cleaners
  ADD COLUMN IF NOT EXISTS working_with_children_check BOOLEAN NOT NULL DEFAULT FALSE;
