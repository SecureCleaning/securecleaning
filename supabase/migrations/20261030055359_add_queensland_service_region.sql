-- Apply and commit this enum addition before the following Queensland migration.
ALTER TYPE public.city_type ADD VALUE IF NOT EXISTS 'brisbane';
