-- =====================================================================
-- 38_assigned_field_person_manual.sql
--
-- Allow an assignment that is not tied to an enquiry / lead (admin adds it
-- from the blank "Assign to Field Person" form): source_type 'manual' with
-- no record_id and no Enquiry / Lead No. Enquiry / lead assignments still
-- need their record_id (one row each, as before).
-- =====================================================================
BEGIN;
ALTER TABLE public.lto_assigned_to_field_person ALTER COLUMN record_id DROP NOT NULL;
ALTER TABLE public.lto_assigned_to_field_person DROP CONSTRAINT IF EXISTS lto_assigned_to_field_person_source_type_check;
ALTER TABLE public.lto_assigned_to_field_person
  ADD CONSTRAINT lto_assigned_to_field_person_source_type_check CHECK (source_type IN ('lead', 'enquiry', 'manual'));
ALTER TABLE public.lto_assigned_to_field_person DROP CONSTRAINT IF EXISTS lto_assigned_to_field_person_record_needed;
ALTER TABLE public.lto_assigned_to_field_person
  ADD CONSTRAINT lto_assigned_to_field_person_record_needed CHECK (source_type = 'manual' OR record_id IS NOT NULL);
COMMIT;
