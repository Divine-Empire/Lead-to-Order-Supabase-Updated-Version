-- =====================================================================
-- 32_enquiry_lead_details_to_otp_orders.sql
--
-- otp_orders is created/refreshed by otp_sync_order_from_tracker() only when
-- an Order-Received tracker row is inserted or one of its order columns
-- changes. Company / address / GST edits are made on the parent
-- lto_enquiries / lto_leads row (Enquiry Tracker > History/Pending > Edit,
-- or Client Master's propagation trigger, see 31_*), which never touches the
-- tracker row -- so a company's orders kept the old values.
--
-- This copies those parent-row changes onto the record's otp_orders rows
-- (matched by source_kind + source_ref = enquiry_no / lead_no). Only the
-- columns that actually changed are written.
--
--   lto_enquiries: company_name, shipping_address, gst_number, location (billing)
--   lto_leads:     company_name, address (shipping), gst_number, location (billing)
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.otp_sync_orders_from_enquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.otp_orders o
     SET company_name     = CASE WHEN OLD.company_name     IS DISTINCT FROM NEW.company_name     THEN NEW.company_name     ELSE o.company_name END,
         shipping_address = CASE WHEN OLD.shipping_address IS DISTINCT FROM NEW.shipping_address THEN NEW.shipping_address ELSE o.shipping_address END,
         gst_number       = CASE WHEN OLD.gst_number       IS DISTINCT FROM NEW.gst_number       THEN NEW.gst_number       ELSE o.gst_number END,
         billing_address  = CASE WHEN OLD.location         IS DISTINCT FROM NEW.location         THEN NEW.location         ELSE o.billing_address END
   WHERE o.source_kind = 'enquiry'
     AND o.source_ref = NEW.enquiry_no;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.otp_sync_orders_from_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.otp_orders o
     SET company_name     = CASE WHEN OLD.company_name IS DISTINCT FROM NEW.company_name THEN NEW.company_name ELSE o.company_name END,
         shipping_address = CASE WHEN OLD.address      IS DISTINCT FROM NEW.address      THEN NEW.address      ELSE o.shipping_address END,
         gst_number       = CASE WHEN OLD.gst_number   IS DISTINCT FROM NEW.gst_number   THEN NEW.gst_number   ELSE o.gst_number END,
         billing_address  = CASE WHEN OLD.location     IS DISTINCT FROM NEW.location     THEN NEW.location     ELSE o.billing_address END
   WHERE o.source_kind = 'lead'
     AND o.source_ref = NEW.lead_no;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS otp_trg_enquiry_details_to_orders ON public.lto_enquiries;
CREATE TRIGGER otp_trg_enquiry_details_to_orders
AFTER UPDATE OF company_name, shipping_address, gst_number, location ON public.lto_enquiries
FOR EACH ROW
WHEN (
  OLD.company_name IS DISTINCT FROM NEW.company_name
  OR OLD.shipping_address IS DISTINCT FROM NEW.shipping_address
  OR OLD.gst_number IS DISTINCT FROM NEW.gst_number
  OR OLD.location IS DISTINCT FROM NEW.location
)
EXECUTE FUNCTION public.otp_sync_orders_from_enquiry();

DROP TRIGGER IF EXISTS otp_trg_lead_details_to_orders ON public.lto_leads;
CREATE TRIGGER otp_trg_lead_details_to_orders
AFTER UPDATE OF company_name, address, gst_number, location ON public.lto_leads
FOR EACH ROW
WHEN (
  OLD.company_name IS DISTINCT FROM NEW.company_name
  OR OLD.address IS DISTINCT FROM NEW.address
  OR OLD.gst_number IS DISTINCT FROM NEW.gst_number
  OR OLD.location IS DISTINCT FROM NEW.location
)
EXECUTE FUNCTION public.otp_sync_orders_from_lead();

COMMIT;
