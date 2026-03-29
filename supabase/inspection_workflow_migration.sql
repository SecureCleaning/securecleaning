-- Secure Cleaning - inspection / dispatch workflow extension

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS inspection_status TEXT DEFAULT 'pending';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS inspection_scheduled_for TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS inspection_completed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dispatch_notes TEXT;
