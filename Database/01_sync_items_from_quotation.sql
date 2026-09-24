-- =====================================================================
-- 01_sync_items_from_quotation.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf), same database OTP_Supabase's
-- otp_sync_order_from_tracker() trigger lives in.
--
-- Whenever a tracker row's quotation_number is set/changed (Make Quotation
-- stage submit, or a later switch via the Enquiry Tracker History edit
-- modal), replace the parent enquiry/lead's item list
-- (lto_enquiry_items/lto_lead_items) with that quotation's own items
-- (lto_make_quotation_items, excluding Freight/Packaging lines).
--
-- Why: lto_enquiry_items/lto_lead_items already have their own Database
-- Webhooks straight to the Google Sheet (enquiry_to_order2/
-- lto_mis_enquiry_items on lto_enquiry_items; lead-to_order_2/
-- lto_mis_lead_items on lto_lead_items) -- confirmed live, no webhook
-- exists on lto_make_quotation_items/lto_make_quotations at all. Since the
-- Apps Script behind those webhooks can't be edited from here, the only
-- way to get the Sheet to reflect a quotation's actual items/Total Qty is
-- to make lto_enquiry_items/lto_lead_items themselves hold that data --
-- which also then flows into otp_orders normally (belt-and-braces
-- alongside OTP_Supabase/Database/47_order_items_from_matched_quotation.sql,
-- which already reads the matched quotation's items directly).
--
-- This intentionally overwrites the enquiry/lead's original item list --
-- confirmed acceptable: those were only ever a rough overview, the real
-- item list lives in the quotation from here on.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.lto_sync_items_from_quotation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ref           text;
  v_quotation_no  text;
  v_has_items     boolean;
BEGIN
  IF NEW.quotation_number IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.quotation_number IS NOT DISTINCT FROM NEW.quotation_number THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'lto_enquiry_tracker' THEN
    SELECT e.enquiry_no INTO v_ref FROM public.lto_enquiries e WHERE e.id = NEW.enquiry_id;
  ELSIF TG_TABLE_NAME = 'lto_enquiry_tracker_for_leads' THEN
    SELECT l.lead_no INTO v_ref FROM public.lto_leads l WHERE l.id = NEW.lead_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_ref IS NULL THEN
    RETURN NEW;
  END IF;

  -- Same quotation-match rule as otp_sync_order_from_tracker (OTP_Supabase
  -- Database/44_/47_): the specific quotation this tracker row points at.
  SELECT q.quotation_no INTO v_quotation_no
    FROM public.lto_make_quotations q
   WHERE q.enquiry_reference_no IS NOT NULL
     AND upper(trim(q.enquiry_reference_no)) = upper(trim(v_ref))
     AND upper(trim(q.quotation_no)) = upper(trim(NEW.quotation_number))
   ORDER BY q.created_at DESC
   LIMIT 1;

  IF v_quotation_no IS NULL THEN
    RETURN NEW; -- no matching quotation found -- leave existing items untouched
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.lto_make_quotation_items qi
     WHERE qi.quotation_no = v_quotation_no
       AND upper(trim(qi.item_name)) NOT IN ('FREIGHT', 'PACKAGING AND FORWARDING')
  ) INTO v_has_items;

  IF NOT v_has_items THEN
    RETURN NEW; -- quotation has no real items -- don't wipe existing ones for nothing
  END IF;

  IF TG_TABLE_NAME = 'lto_enquiry_tracker' THEN
    DELETE FROM public.lto_enquiry_items WHERE enquiry_id = NEW.enquiry_id;

    INSERT INTO public.lto_enquiry_items (enquiry_id, item_name, quantity)
    SELECT NEW.enquiry_id, qi.item_name, qi.quantity::integer
      FROM public.lto_make_quotation_items qi
     WHERE qi.quotation_no = v_quotation_no
       AND upper(trim(qi.item_name)) NOT IN ('FREIGHT', 'PACKAGING AND FORWARDING');
  ELSE
    DELETE FROM public.lto_lead_items WHERE lead_id = NEW.lead_id;

    INSERT INTO public.lto_lead_items (lead_id, item_name, quantity)
    SELECT NEW.lead_id, qi.item_name, qi.quantity::integer
      FROM public.lto_make_quotation_items qi
     WHERE qi.quotation_no = v_quotation_no
       AND upper(trim(qi.item_name)) NOT IN ('FREIGHT', 'PACKAGING AND FORWARDING');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS lto_trg_sync_items_from_quotation ON public.lto_enquiry_tracker;
CREATE TRIGGER lto_trg_sync_items_from_quotation
  AFTER INSERT OR UPDATE ON public.lto_enquiry_tracker
  FOR EACH ROW
  WHEN (NEW.quotation_number IS NOT NULL)
  EXECUTE FUNCTION public.lto_sync_items_from_quotation();

DROP TRIGGER IF EXISTS lto_trg_sync_items_from_quotation ON public.lto_enquiry_tracker_for_leads;
CREATE TRIGGER lto_trg_sync_items_from_quotation
  AFTER INSERT OR UPDATE ON public.lto_enquiry_tracker_for_leads
  FOR EACH ROW
  WHEN (NEW.quotation_number IS NOT NULL)
  EXECUTE FUNCTION public.lto_sync_items_from_quotation();
