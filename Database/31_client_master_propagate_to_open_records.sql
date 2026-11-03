-- =====================================================================
-- 31_client_master_propagate_to_open_records.sql
--
-- lto_client_master is the source of truth for a company's details. When
-- one of these columns changes on a master row, copy the change onto that
-- company's OPEN leads and enquiries:
--
--   master.company_name        -> lto_leads/lto_enquiries.company_name
--   master.gst_number          -> .gst_number
--   master.billing_address     -> .location   (Billing Address)
--   master.company_group_name  -> lto_leads.company_group_name
--                                 (lto_enquiries has no group column)
--
-- Only the columns that actually changed are written, so e.g. fixing a GST
-- number never touches an address that was edited on a lead by hand.
--
-- "Open" = no tracker row ever recorded is_order_received_status yes/no --
-- the same rule as 04_client_master_open_work_view.sql. Closed (ordered /
-- lost) records keep the values they were closed with. Existing data is not
-- touched by this migration; it only reacts to future master edits.
--
-- Records are linked to the master by company_name (there is no FK), so the
-- match uses the master row's OLD name (the name before a rename).
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.lto_propagate_client_master_to_open_records()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_name text := lower(btrim(OLD.company_name));
  name_changed boolean := OLD.company_name IS DISTINCT FROM NEW.company_name;
  gst_changed boolean := OLD.gst_number IS DISTINCT FROM NEW.gst_number;
  billing_changed boolean := OLD.billing_address IS DISTINCT FROM NEW.billing_address;
  group_changed boolean := OLD.company_group_name IS DISTINCT FROM NEW.company_group_name;
BEGIN
  IF old_name IS NULL OR old_name = '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.lto_enquiries e
     SET company_name = CASE WHEN name_changed    THEN NEW.company_name    ELSE e.company_name END,
         gst_number   = CASE WHEN gst_changed     THEN NEW.gst_number      ELSE e.gst_number END,
         location     = CASE WHEN billing_changed THEN NEW.billing_address ELSE e.location END
   WHERE lower(btrim(e.company_name)) = old_name
     AND NOT EXISTS (
       SELECT 1 FROM public.lto_enquiry_tracker t
        WHERE t.enquiry_id = e.id AND t.is_order_received_status IN ('yes', 'no')
     );

  UPDATE public.lto_leads l
     SET company_name       = CASE WHEN name_changed    THEN NEW.company_name       ELSE l.company_name END,
         gst_number         = CASE WHEN gst_changed     THEN NEW.gst_number         ELSE l.gst_number END,
         location           = CASE WHEN billing_changed THEN NEW.billing_address    ELSE l.location END,
         company_group_name = CASE WHEN group_changed   THEN NEW.company_group_name ELSE l.company_group_name END
   WHERE lower(btrim(l.company_name)) = old_name
     AND NOT EXISTS (
       SELECT 1 FROM public.lto_enquiry_tracker_for_leads t2
        WHERE t2.lead_id = l.id AND t2.is_order_received_status IN ('yes', 'no')
     );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_master_propagate ON public.lto_client_master;
CREATE TRIGGER trg_client_master_propagate
AFTER UPDATE OF company_name, gst_number, billing_address, company_group_name
ON public.lto_client_master
FOR EACH ROW
WHEN (
  OLD.company_name IS DISTINCT FROM NEW.company_name
  OR OLD.gst_number IS DISTINCT FROM NEW.gst_number
  OR OLD.billing_address IS DISTINCT FROM NEW.billing_address
  OR OLD.company_group_name IS DISTINCT FROM NEW.company_group_name
)
EXECUTE FUNCTION public.lto_propagate_client_master_to_open_records();

COMMIT;
