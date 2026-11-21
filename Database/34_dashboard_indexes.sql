-- =====================================================================
-- 34_dashboard_indexes.sql
--
-- Indexes for the dashboard's lto_dashboard_overview() (33_*): date-window
-- counts, monthly trend, "newest N" lists, and the DISTINCT ON (enquiry_id)
-- inside lto_quotations_sent_view / lto_orders_received_view. None of these
-- columns had an index. Partial indexes on the tracker keep them small (only
-- the quotation / order rows are indexed).
-- =====================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_lto_leads_created_at            ON public.lto_leads (created_at);
CREATE INDEX IF NOT EXISTS idx_lto_leads_sc_created            ON public.lto_leads (sc_name, created_at);
CREATE INDEX IF NOT EXISTS idx_lto_enquiries_created_at        ON public.lto_enquiries (created_at);
CREATE INDEX IF NOT EXISTS idx_lto_enquiries_sc_created        ON public.lto_enquiries (sales_coordinator_name, created_at);

-- Order rows (is_order_received_status = 'yes')
CREATE INDEX IF NOT EXISTS idx_tracker_orders_created          ON public.lto_enquiry_tracker (created_at)
  WHERE is_order_received_status = 'yes';
CREATE INDEX IF NOT EXISTS idx_tracker_orders_enquiry_latest   ON public.lto_enquiry_tracker (enquiry_id, created_at DESC)
  WHERE is_order_received_status = 'yes';

-- Quotation rows (quotation_number filled in)
CREATE INDEX IF NOT EXISTS idx_tracker_quotes_created          ON public.lto_enquiry_tracker (created_at)
  WHERE quotation_number IS NOT NULL AND quotation_number <> '';
CREATE INDEX IF NOT EXISTS idx_tracker_quotes_enquiry_latest   ON public.lto_enquiry_tracker (enquiry_id, created_at DESC)
  WHERE quotation_number IS NOT NULL AND quotation_number <> '';

-- Newest-first lists
CREATE INDEX IF NOT EXISTS idx_call_tracker_leads_created_desc ON public.lto_call_tracker_for_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_make_quotations_created_desc    ON public.lto_make_quotations (created_at DESC);

COMMIT;

ANALYZE public.lto_leads;
ANALYZE public.lto_enquiries;
ANALYZE public.lto_enquiry_tracker;
ANALYZE public.lto_call_tracker_for_leads;
ANALYZE public.lto_make_quotations;
