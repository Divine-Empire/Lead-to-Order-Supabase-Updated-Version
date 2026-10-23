-- =====================================================================
-- 14_seed_report_person_fos.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf) -- Supabase Dashboard > SQL Editor.
--
-- Reports > FOS Report: the list of responsible persons is now STATIC,
-- curated in lto_dropdown (category 'report_person_fos', managed on
-- Master > Report Persons) -- same mechanism as 'report_person_calling' and
-- 'report_person_sc_pipeline'. Seeds the initial list.
--
-- Idempotent: (category, value) is UNIQUE, so re-running changes nothing.
-- =====================================================================

INSERT INTO public.lto_dropdown (category, value)
VALUES
    ('report_person_fos', 'RANJAN KUMAR PRUSTY'),
    ('report_person_fos', 'SAMBIT MAHAPATRA'),
    ('report_person_fos', 'AMAN JHA'),
    ('report_person_fos', 'KANDUKURI SRIKANTH'),
    ('report_person_fos', 'ARNAB BORDOLOI'),
    ('report_person_fos', 'PRAKHAR SHARMA'),
    ('report_person_fos', 'KANCHAN AKHILESH')
ON CONFLICT (category, value) DO NOTHING;
