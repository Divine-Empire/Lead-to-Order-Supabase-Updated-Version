-- =====================================================================
-- 15_client_master_manual_add_unconverted.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses.
--
-- A client added manually (Master > Add Client) has no lead/enquiry yet,
-- so has_open_work = false and it used to land in the "Lost" tab.
--
-- New rule for clients without client_code:
--   Unconverted -- open work exists, OR the company has never had any
--                  lead/enquiry at all (fresh manual add)
--   Lost        -- has had lead/enquiry history, but nothing open now
--
-- Adds has_any_work to the view (appended last). Columns are listed explicitly
-- because cm.* would now also pull in client_status and shift column order.
-- =====================================================================

CREATE OR REPLACE VIEW public.lto_client_master_with_status AS
SELECT
  cm.uuid, cm.created_at, cm.company_name, cm.client_name, cm.client_mobile_number, cm.state,
  cm.billing_address, cm.gst_number, cm.company_group_name, cm.sc_name, cm.crm_name, cm.state_code,
  cm.credit_days, cm.credit_limit, cm.updated_at, cm.client_code, cm."isRelevant", cm.sales_type,
  cm.already_in_tracker, cm.is_newly_converted,
  (oe.has_open IS NOT NULL OR ol.has_open IS NOT NULL) AS has_open_work,
  (
    EXISTS (SELECT 1 FROM public.lto_enquiries e2 WHERE lower(e2.company_name) = lower(cm.company_name))
    OR EXISTS (SELECT 1 FROM public.lto_leads l2 WHERE lower(l2.company_name) = lower(cm.company_name))
  ) AS has_any_work
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
) ol ON true;

GRANT SELECT ON public.lto_client_master_with_status TO anon, authenticated;
