-- =====================================================================
-- 28_duplicate_enquiry_logs.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf) -- Supabase Dashboard > SQL Editor.
--
-- When a new lead / enquiry is created for a company that already has open
-- ones (Enquiry Tracker Pending) and the user confirms "Create anyway", one
-- row is written here. It drives the header notification bell (for the
-- company's SC and CRM, and for admins) and the "Duplicate Enquiry Logs"
-- stage.
--
--   company_id           FK to lto_client_master.uuid (the company name is
--                        deliberately NOT stored here)
--   sc_name / crm_name   the company's SC / CRM at the time (so a later
--                        reassignment does not move old alerts)
--   open_records         snapshot of what the confirmation dialog listed
--   read_by_sc/crm/admin who has read it; read_by_admin_timestamp is set by a
--                        trigger the moment read_by_admin turns true, and
--                        admin_name is the full name of the admin who did it
--
-- Writes go ONLY through the SECURITY DEFINER functions below (the app talks
-- to the DB with the public anon key, so there is no direct INSERT / UPDATE /
-- DELETE policy). SELECT is open to the app, like its other tables.
-- A pg_cron job deletes logs 15 days after an admin read them; logs no admin
-- has read are never deleted.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lto_duplicate_enquiry_logs (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  company_id                uuid        NOT NULL REFERENCES public.lto_client_master(uuid) ON DELETE CASCADE,
  new_record_type           text        NOT NULL CHECK (new_record_type IN ('lead', 'enquiry')),
  new_record_id             uuid        NOT NULL,
  new_record_no             text,
  created_by                text,
  sc_name                   text,
  crm_name                  text,
  open_records              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  read_by_sc                boolean     NOT NULL DEFAULT false,
  read_by_crm               boolean     NOT NULL DEFAULT false,
  read_by_admin             boolean     NOT NULL DEFAULT false,
  read_by_admin_timestamp   timestamptz,
  admin_name                text,
  CONSTRAINT lto_duplicate_enquiry_logs_record_uniq UNIQUE (new_record_type, new_record_id)
);

CREATE INDEX IF NOT EXISTS idx_dup_logs_created_at ON public.lto_duplicate_enquiry_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dup_logs_company_id ON public.lto_duplicate_enquiry_logs (company_id);
CREATE INDEX IF NOT EXISTS idx_dup_logs_admin_read ON public.lto_duplicate_enquiry_logs (read_by_admin_timestamp)
  WHERE read_by_admin;

-- read_by_admin_timestamp follows read_by_admin: set when it turns true,
-- cleared when it goes back to false.
CREATE OR REPLACE FUNCTION public.lto_dup_logs_admin_read_ts() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.read_by_admin THEN
    IF NOT OLD.read_by_admin OR NEW.read_by_admin_timestamp IS NULL THEN
      NEW.read_by_admin_timestamp := now();
    END IF;
  ELSE
    NEW.read_by_admin_timestamp := NULL;
    NEW.admin_name := NULL;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_dup_logs_admin_read_ts ON public.lto_duplicate_enquiry_logs;
CREATE TRIGGER trg_dup_logs_admin_read_ts
  BEFORE UPDATE ON public.lto_duplicate_enquiry_logs
  FOR EACH ROW EXECUTE FUNCTION public.lto_dup_logs_admin_read_ts();

-- RLS: readable by the app, no direct writes.
ALTER TABLE public.lto_duplicate_enquiry_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow app select on lto_duplicate_enquiry_logs" ON public.lto_duplicate_enquiry_logs;
CREATE POLICY "Allow app select on lto_duplicate_enquiry_logs"
  ON public.lto_duplicate_enquiry_logs FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.lto_duplicate_enquiry_logs FROM anon, authenticated;

-- Writes a log for a newly created lead / enquiry. The company is found by
-- name (case-insensitive; where names repeat in the client master, the row
-- that has an SC and was updated last wins) and its SC / CRM are read here,
-- not trusted from the caller. Returns the log id, or NULL when the company
-- is not in the client master or the record already has a log.
CREATE OR REPLACE FUNCTION public.create_duplicate_enquiry_log(
  p_company_name    text,
  p_new_record_type text,
  p_new_record_id   uuid,
  p_new_record_no   text,
  p_created_by      text,
  p_open_records    jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company public.lto_client_master%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_new_record_type NOT IN ('lead', 'enquiry') THEN
    RAISE EXCEPTION 'p_new_record_type must be lead or enquiry';
  END IF;
  IF p_new_record_id IS NULL THEN
    RAISE EXCEPTION 'p_new_record_id is required';
  END IF;
  IF jsonb_typeof(p_open_records) IS DISTINCT FROM 'array' OR jsonb_array_length(p_open_records) = 0
     OR jsonb_array_length(p_open_records) > 500 OR length(p_open_records::text) > 400000 THEN
    RAISE EXCEPTION 'p_open_records must be a non-empty array (max 500 entries)';
  END IF;

  SELECT * INTO v_company
    FROM public.lto_client_master
   WHERE upper(btrim(company_name)) = upper(btrim(p_company_name))
   ORDER BY (sc_name IS NOT NULL AND btrim(sc_name) <> '') DESC, updated_at DESC NULLS LAST
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.lto_duplicate_enquiry_logs
    (company_id, new_record_type, new_record_id, new_record_no, created_by, sc_name, crm_name, open_records)
  VALUES
    (v_company.uuid, p_new_record_type, p_new_record_id, nullif(btrim(p_new_record_no), ''),
     nullif(btrim(p_created_by), ''), nullif(btrim(v_company.sc_name), ''), nullif(btrim(v_company.crm_name), ''),
     p_open_records)
  ON CONFLICT (new_record_type, new_record_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

-- Marks logs as read for one role. 'admin' also stores who did it; a log an
-- admin already read keeps its first reader / timestamp. Returns how many
-- logs were newly marked.
CREATE OR REPLACE FUNCTION public.mark_duplicate_enquiry_logs_read(
  p_ids        uuid[],
  p_role       text,
  p_admin_name text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;

  IF p_role = 'sc' THEN
    UPDATE public.lto_duplicate_enquiry_logs SET read_by_sc = true
     WHERE id = ANY (p_ids) AND NOT read_by_sc;
  ELSIF p_role = 'crm' THEN
    UPDATE public.lto_duplicate_enquiry_logs SET read_by_crm = true
     WHERE id = ANY (p_ids) AND NOT read_by_crm;
  ELSIF p_role = 'admin' THEN
    IF nullif(btrim(p_admin_name), '') IS NULL THEN
      RAISE EXCEPTION 'p_admin_name is required when p_role is admin';
    END IF;
    UPDATE public.lto_duplicate_enquiry_logs
       SET read_by_admin = true, admin_name = btrim(p_admin_name)
     WHERE id = ANY (p_ids) AND NOT read_by_admin;
  ELSE
    RAISE EXCEPTION 'p_role must be sc, crm or admin';
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;

REVOKE ALL ON FUNCTION public.create_duplicate_enquiry_log(text, text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_duplicate_enquiry_logs_read(uuid[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_duplicate_enquiry_log(text, text, uuid, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_duplicate_enquiry_logs_read(uuid[], text, text) TO anon, authenticated;

-- Daily clean-up at 03:00 IST (21:30 UTC): logs an admin read more than 15
-- days ago. Logs no admin has read are never deleted.
SELECT cron.schedule(
  'delete-old-duplicate-enquiry-logs',
  '30 21 * * *',
  $cron$DELETE FROM public.lto_duplicate_enquiry_logs
         WHERE read_by_admin AND read_by_admin_timestamp < now() - interval '15 days'$cron$
);

COMMIT;
