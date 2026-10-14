-- =====================================================================
-- 07_dashboard_quotation_order_distinct_views.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf).
--
-- Bug: DashboardMetrics.jsx's "Quotations Sent" / "Orders Received" cards
-- counted raw rows of lto_enquiry_tracker / lto_enquiry_tracker_for_leads.
-- Those tables are history logs -- every stage transition for an enquiry/lead
-- gets its own row (30,225 rows for 9,659 direct enquiries, ~3 rows each),
-- so a plain `.not('quotation_number','is',null)` row count (20,259) wildly
-- overcounts the real number of enquiries/leads that actually got a
-- quotation (9,524 distinct). Same overcount risk for "yes" order rows.
--
-- Fix: two views, each already deduped to the LATEST row per enquiry/lead
-- (DISTINCT ON ... ORDER BY created_at DESC, same pattern as
-- call_tracker_pending_view / enquiry_pending_view), so a plain
-- `count(*)` on the view is correct without the frontend needing to
-- dedupe client-side.
-- =====================================================================

-- Neither tracker table has its own sc_name/sales_coordinator_name column
-- (that lives on the parent lto_enquiries/lto_leads row) -- these views are
-- only ever used for a plain count(*) with a created_at range, so assigned_to
-- scoping is intentionally left out rather than adding a join these counts
-- don't need.
CREATE OR REPLACE VIEW public.lto_quotations_sent_view AS
SELECT 'enquiry'::text AS source_type, latest.enquiry_id AS record_id, latest.created_at
FROM ( SELECT DISTINCT ON (t.enquiry_id) t.enquiry_id, t.created_at
       FROM lto_enquiry_tracker t
       WHERE t.quotation_number IS NOT NULL AND t.quotation_number <> ''
       ORDER BY t.enquiry_id, t.created_at DESC) latest
UNION ALL
SELECT 'lead'::text AS source_type, latest.lead_id AS record_id, latest.created_at
FROM ( SELECT DISTINCT ON (t.lead_id) t.lead_id, t.created_at
       FROM lto_enquiry_tracker_for_leads t
       WHERE t.quotation_number IS NOT NULL AND t.quotation_number <> ''
       ORDER BY t.lead_id, t.created_at DESC) latest;

CREATE OR REPLACE VIEW public.lto_orders_received_view AS
SELECT 'enquiry'::text AS source_type, latest.enquiry_id AS record_id, latest.created_at
FROM ( SELECT DISTINCT ON (t.enquiry_id) t.enquiry_id, t.created_at
       FROM lto_enquiry_tracker t
       WHERE t.is_order_received_status = 'yes'
       ORDER BY t.enquiry_id, t.created_at DESC) latest
UNION ALL
SELECT 'lead'::text AS source_type, latest.lead_id AS record_id, latest.created_at
FROM ( SELECT DISTINCT ON (t.lead_id) t.lead_id, t.created_at
       FROM lto_enquiry_tracker_for_leads t
       WHERE t.is_order_received_status = 'yes'
       ORDER BY t.lead_id, t.created_at DESC) latest;

GRANT SELECT ON public.lto_quotations_sent_view TO anon, authenticated;
GRANT SELECT ON public.lto_orders_received_view TO anon, authenticated;
