-- =====================================================================
-- 16_bank_details_enable_rls.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses.
--
-- lto_bank_details holds one static row (company bank details printed on
-- quotations). The app only ever READS it (Quotation / Quotation Beta
-- bank-details.jsx, anon key). Enable RLS and allow SELECT only, so the
-- table can no longer be modified through the public API.
-- Writes remain possible from the Supabase dashboard / service role.
-- =====================================================================

ALTER TABLE public.lto_bank_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_details_select" ON public.lto_bank_details;
CREATE POLICY "bank_details_select" ON public.lto_bank_details
  FOR SELECT TO anon, authenticated USING (true);
