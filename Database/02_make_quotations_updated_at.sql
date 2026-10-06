-- =====================================================================
-- 02_make_quotations_updated_at.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf).
--
-- lto_make_quotations.updated_at has never changed after insert -- not
-- even when Quotation.jsx sets pdf_url right after saving -- so there is
-- no trigger maintaining it. That made it impossible to tell whether a
-- quotation's enquiry_reference_no was edited after the fact (e.g. by hand
-- in the Supabase dashboard). From here on every UPDATE stamps it.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.lto_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS lto_trg_make_quotations_updated_at ON public.lto_make_quotations;
CREATE TRIGGER lto_trg_make_quotations_updated_at
  BEFORE UPDATE ON public.lto_make_quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.lto_set_updated_at();
