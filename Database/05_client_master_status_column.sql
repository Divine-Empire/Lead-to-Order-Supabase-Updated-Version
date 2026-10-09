-- =====================================================================
-- 05_client_master_status_column.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf).
--
-- Adds a STORED client_status column on lto_client_master so Client
-- Master's 3-way split doesn't need the lto_client_master_with_status
-- view's live LATERAL joins on every page load. Semantics match that view
-- exactly (Database/04_client_master_open_work_view.sql):
--   converted   -- client_code IS NOT NULL
--   unconverted -- no client_code, but a genuinely OPEN lead/enquiry exists
--   lost        -- no client_code, and nothing currently open
--
-- Kept in sync by triggers on every table that can change "open work" for
-- a company, not just on order-convert/order-lost -- a lead/enquiry can
-- also stop being open by being followed up and closed without an
-- explicit Order Lost stage, which must also flip unconverted -> lost.
-- Triggers fire on:
--   lto_client_master       (client_code set/cleared, company_name change)
--   lto_enquiries            (insert, company_name/planned_at change, delete)
--   lto_enquiry_tracker      (is_order_received_status set)
--   lto_leads                (insert, company_name change, delete)
--   lto_call_tracker_for_leads     (planned_at set)
--   lto_enquiry_tracker_for_leads  (is_order_received_status set)
-- =====================================================================

ALTER TABLE public.lto_client_master
  ADD COLUMN IF NOT EXISTS client_status text NOT NULL DEFAULT 'unconverted'
  CHECK (client_status IN ('converted', 'unconverted', 'lost'));

CREATE INDEX IF NOT EXISTS idx_lto_client_master_client_status
  ON public.lto_client_master (client_status);

-- ---------------------------------------------------------------------
-- Core recompute function -- call with a company_name any time something
-- that could affect that company's open-work state changes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lto_recompute_client_status(p_company_name text)
RETURNS void AS $$
DECLARE
  v_has_open boolean;
BEGIN
  IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
    RETURN;
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM public.lto_enquiries e
      WHERE lower(e.company_name) = lower(p_company_name)
        AND e.planned_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.lto_enquiry_tracker t
           WHERE t.enquiry_id = e.id
             AND t.is_order_received_status IN ('yes', 'no')
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.lto_leads l
      JOIN public.lto_call_tracker_for_leads ct
        ON ct.lead_id = l.id AND ct.planned_at IS NOT NULL
      WHERE lower(l.company_name) = lower(p_company_name)
        AND NOT EXISTS (
          SELECT 1 FROM public.lto_enquiry_tracker_for_leads t2
           WHERE t2.lead_id = l.id
             AND t2.is_order_received_status IN ('yes', 'no')
        )
    )
  INTO v_has_open;

  UPDATE public.lto_client_master cm
  SET client_status = CASE
      WHEN cm.client_code IS NOT NULL AND btrim(cm.client_code) <> '' THEN 'converted'
      WHEN v_has_open THEN 'unconverted'
      ELSE 'lost'
    END
  WHERE lower(cm.company_name) = lower(p_company_name)
    AND cm.client_status IS DISTINCT FROM (CASE
      WHEN cm.client_code IS NOT NULL AND btrim(cm.client_code) <> '' THEN 'converted'
      WHEN v_has_open THEN 'unconverted'
      ELSE 'lost'
    END);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- lto_client_master itself -- client_code assigned/cleared, or renamed.
-- Column-scoped (OF client_code, company_name) so the UPDATE the function
-- above issues (which only ever touches client_status) can't re-fire this
-- same trigger.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lto_trg_client_master_status()
RETURNS trigger AS $$
BEGIN
  PERFORM public.lto_recompute_client_status(NEW.company_name);
  IF TG_OP = 'UPDATE' AND NEW.company_name IS DISTINCT FROM OLD.company_name THEN
    PERFORM public.lto_recompute_client_status(OLD.company_name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_master_status ON public.lto_client_master;
CREATE TRIGGER trg_client_master_status
AFTER INSERT OR UPDATE OF client_code, company_name ON public.lto_client_master
FOR EACH ROW EXECUTE FUNCTION public.lto_trg_client_master_status();

-- ---------------------------------------------------------------------
-- lto_enquiries
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lto_trg_enquiries_status()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.lto_recompute_client_status(OLD.company_name);
    RETURN OLD;
  END IF;
  PERFORM public.lto_recompute_client_status(NEW.company_name);
  IF TG_OP = 'UPDATE' AND NEW.company_name IS DISTINCT FROM OLD.company_name THEN
    PERFORM public.lto_recompute_client_status(OLD.company_name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enquiries_status ON public.lto_enquiries;
CREATE TRIGGER trg_enquiries_status
AFTER INSERT OR UPDATE OF company_name, planned_at OR DELETE ON public.lto_enquiries
FOR EACH ROW EXECUTE FUNCTION public.lto_trg_enquiries_status();

-- ---------------------------------------------------------------------
-- lto_enquiry_tracker -- needs the parent enquiry's company_name
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lto_trg_enquiry_tracker_status()
RETURNS trigger AS $$
DECLARE
  v_company text;
BEGIN
  SELECT company_name INTO v_company FROM public.lto_enquiries
   WHERE id = COALESCE(NEW.enquiry_id, OLD.enquiry_id);
  PERFORM public.lto_recompute_client_status(v_company);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enquiry_tracker_status ON public.lto_enquiry_tracker;
CREATE TRIGGER trg_enquiry_tracker_status
AFTER INSERT OR UPDATE OF is_order_received_status OR DELETE ON public.lto_enquiry_tracker
FOR EACH ROW EXECUTE FUNCTION public.lto_trg_enquiry_tracker_status();

-- ---------------------------------------------------------------------
-- lto_leads
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lto_trg_leads_status()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.lto_recompute_client_status(OLD.company_name);
    RETURN OLD;
  END IF;
  PERFORM public.lto_recompute_client_status(NEW.company_name);
  IF TG_OP = 'UPDATE' AND NEW.company_name IS DISTINCT FROM OLD.company_name THEN
    PERFORM public.lto_recompute_client_status(OLD.company_name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_status ON public.lto_leads;
CREATE TRIGGER trg_leads_status
AFTER INSERT OR UPDATE OF company_name OR DELETE ON public.lto_leads
FOR EACH ROW EXECUTE FUNCTION public.lto_trg_leads_status();

-- ---------------------------------------------------------------------
-- lto_call_tracker_for_leads -- needs the parent lead's company_name
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lto_trg_call_tracker_leads_status()
RETURNS trigger AS $$
DECLARE
  v_company text;
BEGIN
  SELECT company_name INTO v_company FROM public.lto_leads
   WHERE id = COALESCE(NEW.lead_id, OLD.lead_id);
  PERFORM public.lto_recompute_client_status(v_company);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_call_tracker_leads_status ON public.lto_call_tracker_for_leads;
CREATE TRIGGER trg_call_tracker_leads_status
AFTER INSERT OR UPDATE OF planned_at OR DELETE ON public.lto_call_tracker_for_leads
FOR EACH ROW EXECUTE FUNCTION public.lto_trg_call_tracker_leads_status();

-- ---------------------------------------------------------------------
-- lto_enquiry_tracker_for_leads -- needs the parent lead's company_name
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lto_trg_enquiry_tracker_leads_status()
RETURNS trigger AS $$
DECLARE
  v_company text;
BEGIN
  SELECT company_name INTO v_company FROM public.lto_leads
   WHERE id = COALESCE(NEW.lead_id, OLD.lead_id);
  PERFORM public.lto_recompute_client_status(v_company);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enquiry_tracker_leads_status ON public.lto_enquiry_tracker_for_leads;
CREATE TRIGGER trg_enquiry_tracker_leads_status
AFTER INSERT OR UPDATE OF is_order_received_status OR DELETE ON public.lto_enquiry_tracker_for_leads
FOR EACH ROW EXECUTE FUNCTION public.lto_trg_enquiry_tracker_leads_status();

-- ---------------------------------------------------------------------
-- One-time backfill for all existing rows (fast bulk query, same logic
-- as the view -- does NOT go through the per-company function above).
-- ---------------------------------------------------------------------
WITH computed AS (
  SELECT cm.uuid,
    CASE
      WHEN cm.client_code IS NOT NULL AND btrim(cm.client_code) <> '' THEN 'converted'
      WHEN (oe.has_open IS NOT NULL OR ol.has_open IS NOT NULL) THEN 'unconverted'
      ELSE 'lost'
    END AS status
  FROM public.lto_client_master cm
  LEFT JOIN LATERAL (
    SELECT true AS has_open
    FROM public.lto_enquiries e
    WHERE lower(e.company_name) = lower(cm.company_name)
      AND e.planned_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.lto_enquiry_tracker t
         WHERE t.enquiry_id = e.id
           AND t.is_order_received_status IN ('yes', 'no')
      )
    LIMIT 1
  ) oe ON true
  LEFT JOIN LATERAL (
    SELECT true AS has_open
    FROM public.lto_leads l
    JOIN public.lto_call_tracker_for_leads ct
      ON ct.lead_id = l.id AND ct.planned_at IS NOT NULL
    WHERE lower(l.company_name) = lower(cm.company_name)
      AND NOT EXISTS (
        SELECT 1 FROM public.lto_enquiry_tracker_for_leads t2
         WHERE t2.lead_id = l.id
           AND t2.is_order_received_status IN ('yes', 'no')
      )
    LIMIT 1
  ) ol ON true
)
UPDATE public.lto_client_master cm
SET client_status = computed.status
FROM computed
WHERE computed.uuid = cm.uuid
  AND cm.client_status IS DISTINCT FROM computed.status;
