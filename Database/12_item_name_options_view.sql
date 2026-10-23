-- =====================================================================
-- 12_item_name_options_view.sql   (OPTIONAL but recommended)
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf) -- Supabase Dashboard > SQL Editor.
--
-- Enquiry Tracker > "Item" filter dropdown: the list of item names that are
-- actually used on enquiries/leads (~1,700 distinct). The lto_items master
-- is NOT a substitute -- ~580 used names (renamed/one-off items) aren't in it.
--
-- Without this view the app still works: it falls back to downloading
-- item_name from lto_enquiry_items + lto_lead_items (~26k rows) and
-- de-duplicating in the browser. This view just turns that into a ~1.7k-row
-- read. The filtering itself needs NO database change (it runs on the
-- existing item_qty column of enquiry_pending_view / enquiry_history_view).
--
-- Names are returned exactly as stored (not trimmed) so the filter's
-- "<name> : " match lines up with item_qty character for character.
-- =====================================================================

CREATE OR REPLACE VIEW public.lto_item_name_options AS
SELECT DISTINCT s.item_name
FROM (
    SELECT item_name FROM public.lto_enquiry_items
    UNION
    SELECT item_name FROM public.lto_lead_items
) s
WHERE s.item_name IS NOT NULL
  AND btrim(s.item_name) <> '';

GRANT SELECT ON public.lto_item_name_options TO anon, authenticated;
