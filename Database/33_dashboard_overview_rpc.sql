-- =====================================================================
-- 33_dashboard_overview_rpc.sql
--
-- One call for the whole Lead-To-Order dashboard. Before this the page sent
-- ~25 requests (metric cards x2 periods, funnel counts, lead sources, three
-- monthly row downloads, pending tasks, recent activities), several of which
-- downloaded rows only to count them in the browser.
--
--   lto_dashboard_overview(
--     p_sc           text[]  SC / assignee names to restrict to (NULL = everyone)
--     p_cur_start/p_cur_end      metric-card window            (dates, NULL = open)
--     p_prev_start/p_prev_end    comparison window for the %-change on the cards
--     p_chart_start/p_chart_end  window for the funnel and lead-source charts
--     p_trend_start/p_trend_end  month trend: first month .. end (exclusive)
--   ) RETURNS jsonb {
--     metrics:   { current: {...}, previous: {...} },
--     funnel:    { leads, enquiries, quotations, orders },
--     sources:   [ { name, value } ... ]   (largest first),
--     trend:     [ { month: 'YYYY-MM', leads, enquiries, orders } ... ],
--     pending:   { followUps, quotations, orderStatus },
--     recent:    { leads, followUps, quotations, orders }
--   }
--
-- Same rules the separate queries used (so the numbers match what the page
-- showed), except that nothing is capped at PostgREST's 1000 rows any more.
-- SECURITY INVOKER: the caller's own table permissions apply.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.lto_dashboard_overview(
  p_sc          text[],
  p_cur_start   date,
  p_cur_end     date,
  p_prev_start  date,
  p_prev_end    date,
  p_chart_start date,
  p_chart_end   date,
  p_trend_start date,
  p_trend_end   date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_lead_cur  bigint; v_lead_prev  bigint;
  v_enq_cur   bigint; v_enq_prev   bigint;
  v_quot_cur  bigint; v_quot_prev  bigint;
  v_ord_cur   bigint; v_ord_prev   bigint;
  v_pend_fu   bigint; v_pend_enq   bigint;
  v_funnel    jsonb;
  v_sources   jsonb;
  v_trend     jsonb;
  v_pending   jsonb;
  v_recent    jsonb;
BEGIN
  -- ---- metric cards --------------------------------------------------
  SELECT count(*) FILTER (WHERE (p_cur_start  IS NULL OR created_at >= p_cur_start)  AND (p_cur_end  IS NULL OR created_at < p_cur_end  + 1)),
         count(*) FILTER (WHERE (p_prev_start IS NULL OR created_at >= p_prev_start) AND (p_prev_end IS NULL OR created_at < p_prev_end + 1))
    INTO v_lead_cur, v_lead_prev
    FROM lto_leads
   WHERE p_sc IS NULL OR sc_name = ANY (p_sc);

  SELECT count(*) FILTER (WHERE (p_cur_start  IS NULL OR created_at >= p_cur_start)  AND (p_cur_end  IS NULL OR created_at < p_cur_end  + 1)),
         count(*) FILTER (WHERE (p_prev_start IS NULL OR created_at >= p_prev_start) AND (p_prev_end IS NULL OR created_at < p_prev_end + 1))
    INTO v_enq_cur, v_enq_prev
    FROM lto_enquiries
   WHERE p_sc IS NULL OR sales_coordinator_name = ANY (p_sc);

  -- These two views de-duplicate the whole tracker tables; reading each once
  -- for both windows halves that work.
  SELECT count(*) FILTER (WHERE (p_cur_start  IS NULL OR created_at >= p_cur_start)  AND (p_cur_end  IS NULL OR created_at < p_cur_end  + 1)),
         count(*) FILTER (WHERE (p_prev_start IS NULL OR created_at >= p_prev_start) AND (p_prev_end IS NULL OR created_at < p_prev_end + 1))
    INTO v_quot_cur, v_quot_prev
    FROM lto_quotations_sent_view;

  SELECT count(*) FILTER (WHERE (p_cur_start  IS NULL OR created_at >= p_cur_start)  AND (p_cur_end  IS NULL OR created_at < p_cur_end  + 1)),
         count(*) FILTER (WHERE (p_prev_start IS NULL OR created_at >= p_prev_start) AND (p_prev_end IS NULL OR created_at < p_prev_end + 1))
    INTO v_ord_cur, v_ord_prev
    FROM lto_orders_received_view;

  -- "Pending" = open right now, so no date window.
  SELECT count(*) INTO v_pend_fu
    FROM call_tracker_pending_view
   WHERE p_sc IS NULL OR assigned_to = ANY (p_sc);

  SELECT count(*) INTO v_pend_enq
    FROM enquiry_pending_view
   WHERE source_type = 'enquiry' AND (p_sc IS NULL OR assigned_to = ANY (p_sc));

  -- ---- funnel (chart window) ----------------------------------------
  SELECT jsonb_build_object(
    'leads', (SELECT count(*) FROM lto_leads
               WHERE (p_sc IS NULL OR sc_name = ANY (p_sc))
                 AND (p_chart_start IS NULL OR created_at >= p_chart_start)
                 AND (p_chart_end   IS NULL OR created_at <  p_chart_end + 1)),
    'enquiries', (SELECT count(*) FROM lto_enquiries
                   WHERE (p_sc IS NULL OR sales_coordinator_name = ANY (p_sc))
                     AND (p_chart_start IS NULL OR created_at >= p_chart_start)
                     AND (p_chart_end   IS NULL OR created_at <  p_chart_end + 1)),
    -- One per enquiry / lead (the same de-duplicated views as the metric cards),
    -- so the funnel agrees with Quotations Sent / Orders Received.
    'quotations', (SELECT count(*) FROM lto_quotations_sent_view
                    WHERE (p_chart_start IS NULL OR created_at >= p_chart_start)
                      AND (p_chart_end   IS NULL OR created_at <  p_chart_end + 1)),
    'orders', (SELECT count(*) FROM lto_orders_received_view
                WHERE (p_chart_start IS NULL OR created_at >= p_chart_start)
                  AND (p_chart_end   IS NULL OR created_at <  p_chart_end + 1))
  ) INTO v_funnel;

  -- ---- lead sources (chart window) ----------------------------------
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', lead_source, 'value', n) ORDER BY n DESC, lead_source), '[]'::jsonb)
    INTO v_sources
    FROM (
      SELECT lead_source, count(*) AS n
        FROM lto_leads
       WHERE lead_source IS NOT NULL AND lead_source <> ''
         AND (p_sc IS NULL OR sc_name = ANY (p_sc))
         AND (p_chart_start IS NULL OR created_at >= p_chart_start)
         AND (p_chart_end   IS NULL OR created_at <  p_chart_end + 1)
       GROUP BY lead_source
    ) s;

  -- ---- monthly trend -------------------------------------------------
  SELECT COALESCE(jsonb_agg(jsonb_build_object('month', to_char(m.month, 'YYYY-MM'), 'leads', l.n, 'enquiries', e.n, 'orders', o.n) ORDER BY m.month), '[]'::jsonb)
    INTO v_trend
    FROM generate_series(date_trunc('month', p_trend_start)::date, (p_trend_end - 1), interval '1 month') AS m(month)
    CROSS JOIN LATERAL (
      SELECT count(*) AS n FROM lto_leads
       WHERE created_at >= m.month AND created_at < m.month + interval '1 month'
         AND (p_sc IS NULL OR sc_name = ANY (p_sc))
    ) l
    CROSS JOIN LATERAL (
      SELECT count(*) AS n FROM lto_enquiries
       WHERE created_at >= m.month AND created_at < m.month + interval '1 month'
         AND (p_sc IS NULL OR sales_coordinator_name = ANY (p_sc))
    ) e
    CROSS JOIN LATERAL (
      SELECT count(*) AS n FROM lto_enquiry_tracker
       WHERE created_at >= m.month AND created_at < m.month + interval '1 month'
         AND is_order_received_status = 'yes'
    ) o;

  -- ---- pending tasks (3 each) ---------------------------------------
  SELECT jsonb_build_object(
    'followUps', COALESCE((
      SELECT jsonb_agg(to_jsonb(f)) FROM (
        SELECT record_id, display_no, company_name, next_call_date
          FROM call_tracker_pending_view
         ORDER BY next_call_date ASC NULLS FIRST
         LIMIT 3
      ) f), '[]'::jsonb),
    'quotations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', q.id, 'enquiry_id', q.enquiry_id, 'created_at', q.created_at,
                                          'quotation_number', q.quotation_number,
                                          'enquiry', jsonb_build_object('enquiry_no', q.enquiry_no, 'company_name', q.company_name)))
        FROM (
          SELECT t.id, t.enquiry_id, t.created_at, t.quotation_number, e.enquiry_no, e.company_name
            FROM lto_enquiry_tracker t
            LEFT JOIN lto_enquiries e ON e.id = t.enquiry_id
           WHERE t.current_stage IN ('make-quotation', 'Make Quotation')
             AND (t.quotation_number IS NULL OR t.quotation_number = '')
           ORDER BY t.created_at DESC
           LIMIT 3
        ) q), '[]'::jsonb),
    'orderStatus', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', q.id, 'enquiry_id', q.enquiry_id, 'created_at', q.created_at,
                                          'enquiry', jsonb_build_object('enquiry_no', q.enquiry_no, 'company_name', q.company_name)))
        FROM (
          SELECT t.id, t.enquiry_id, t.created_at, e.enquiry_no, e.company_name
            FROM lto_enquiry_tracker t
            LEFT JOIN lto_enquiries e ON e.id = t.enquiry_id
           WHERE t.current_stage IN ('order-status', 'Order Status', 'order-expected', 'Order Expected')
             AND t.is_order_received_status IS NULL
           ORDER BY t.created_at DESC
           LIMIT 3
        ) q), '[]'::jsonb)
  ) INTO v_pending;

  -- ---- recent activities (8 newest per source; the page merges them) -
  SELECT jsonb_build_object(
    'leads', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM (
        SELECT id, lead_no, company_name, sc_name, created_at FROM lto_leads ORDER BY created_at DESC LIMIT 8
      ) r), '[]'::jsonb),
    'followUps', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'lead_id', r.lead_id, 'sc_name', r.sc_name, 'created_at', r.created_at,
                                          'lead', jsonb_build_object('lead_no', r.lead_no, 'company_name', r.company_name)))
        FROM (
          SELECT c.id, c.lead_id, c.sc_name, c.created_at, l.lead_no, l.company_name
            FROM lto_call_tracker_for_leads c
            LEFT JOIN lto_leads l ON l.id = c.lead_id
           ORDER BY c.created_at DESC LIMIT 8
        ) r), '[]'::jsonb),
    'quotations', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM (
        SELECT id, quotation_no, enquiry_reference_no, prepared_by, created_at FROM lto_make_quotations ORDER BY created_at DESC LIMIT 8
      ) r), '[]'::jsonb),
    'orders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'enquiry_id', r.enquiry_id, 'approved_by', r.approved_by, 'created_at', r.created_at,
                                          'enquiry', jsonb_build_object('enquiry_no', r.enquiry_no, 'company_name', r.company_name)))
        FROM (
          SELECT t.id, t.enquiry_id, t.approved_by, t.created_at, e.enquiry_no, e.company_name
            FROM lto_enquiry_tracker t
            LEFT JOIN lto_enquiries e ON e.id = t.enquiry_id
           WHERE t.is_order_received_status = 'yes'
           ORDER BY t.created_at DESC LIMIT 8
        ) r), '[]'::jsonb)
  ) INTO v_recent;

  RETURN jsonb_build_object(
    'metrics', jsonb_build_object(
      'current', jsonb_build_object(
        'totalLeads', v_lead_cur, 'pendingFollowups', v_pend_fu, 'quotationsSent', v_quot_cur,
        'ordersReceived', v_ord_cur, 'totalEnquiry', v_enq_cur, 'pendingEnquiry', v_pend_enq),
      'previous', jsonb_build_object(
        'totalLeads', v_lead_prev, 'quotationsSent', v_quot_prev,
        'ordersReceived', v_ord_prev, 'totalEnquiry', v_enq_prev)
    ),
    'funnel', v_funnel,
    'sources', v_sources,
    'trend', v_trend,
    'pending', v_pending,
    'recent', v_recent
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lto_dashboard_overview(text[], date, date, date, date, date, date, date, date) TO anon, authenticated;

COMMIT;
