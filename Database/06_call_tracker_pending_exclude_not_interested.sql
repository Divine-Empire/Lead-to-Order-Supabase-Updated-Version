-- =====================================================================
-- 06_call_tracker_pending_exclude_not_interested.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf).
--
-- Bug: selecting "Not Interested" in CallTrackerForm.jsx writes
-- enquiry_received_status = 'not-interested' on the new
-- lto_call_tracker_for_leads row, same as every other non-"yes" outcome.
-- call_tracker_pending_view's "existing" branch only ever excluded
-- 'yes' (treating it as the one and only closed/resolved state), so a
-- "Not Interested" lead stayed in Pending forever -- worse, since
-- CallTrackerForm never sets next_call_date/planned_at for that outcome,
-- the lead's next_call_date is NULL, which doesn't match Today/Overdue/
-- Upcoming (NULL comparisons are never true in SQL), so it silently
-- vanished from every date filter while still counting toward "Pending"
-- overall -- stuck with no way to see or act on it again.
--
-- Fix: treat 'not-interested' as a second closed/terminal state, exactly
-- like 'yes'. It still shows up in History (call_tracker_history_view is
-- unchanged -- it already lists every tracker row), where the frontend
-- now offers a "Lost" filter for it (see CallTrackerFilter.jsx /
-- queries.js's useHistoryCallTracker).
-- =====================================================================

CREATE OR REPLACE VIEW public.call_tracker_pending_view AS
 SELECT 'new'::text AS pending_group,
    l.id AS record_id,
    l.lead_no AS display_no,
    l.company_name,
    l.phone_number,
    l.person_name,
    l.lead_source,
    l.lead_receiver_name AS receiver_name,
    l.sales_type,
    l.location,
    l.additional_notes AS customer_say,
    l.lead_status AS enquiry_status,
    l.sc_name AS assigned_to,
    l.email_address,
    l.state,
    l.address,
    l.nob,
    l.gst_number,
    l.customer_registration_form,
    l.credit_access,
    l.credit_days,
    l.credit_limit,
    l.additional_notes,
    l.planned_at,
    l.planned_at::date AS next_call_date,
    NULL::text AS next_action,
    l.created_at,
    0::bigint AS no_of_follow_ups,
    NULL::text AS last_follow_up_status,
    NULL::timestamp without time zone AS last_follow_up_date,
    (((((((((((((COALESCE(l.company_name, ''::text) || ' '::text) || COALESCE(l.lead_no, ''::text)) || ' '::text) || COALESCE(l.person_name, ''::text)) || ' '::text) || COALESCE(l.sc_name, ''::text)) || ' '::text) || COALESCE(l.phone_number, ''::character varying)::text) || ' '::text) || COALESCE(l.lead_source, ''::text)) || ' '::text) || COALESCE(l.location, ''::text)) || ' '::text) || COALESCE(l.additional_notes, ''::text) AS search_text
   FROM lto_leads l
  WHERE l.planned_at IS NOT NULL AND NOT (EXISTS ( SELECT 1
           FROM lto_call_tracker_for_leads ct
          WHERE ct.lead_id = l.id))
UNION ALL
 SELECT 'existing'::text AS pending_group,
    COALESCE(pl.id, lt.lead_id) AS record_id,
    COALESCE(pl.lead_no, lt.lead_id::text) AS display_no,
    pl.company_name,
    pl.phone_number,
    pl.person_name,
    pl.lead_source,
    pl.lead_receiver_name AS receiver_name,
    COALESCE(lt.enquiry_type, pl.sales_type) AS sales_type,
    pl.location,
    COALESCE(lt.what_did_customer_say, pl.additional_notes) AS customer_say,
    COALESCE(lt.enquiry_received_status, pl.lead_status) AS enquiry_status,
    COALESCE(lt.sc_name, pl.sc_name) AS assigned_to,
    pl.email_address,
    COALESCE(lt.enquiry_for_state, pl.state) AS state,
    pl.address,
    COALESCE(lt.project_name, pl.nob) AS nob,
    pl.gst_number,
    pl.customer_registration_form,
    pl.credit_access,
    pl.credit_days,
    pl.credit_limit,
    COALESCE(lt.other_remarks, pl.additional_notes) AS additional_notes,
    pl.planned_at,
    lt.next_call_date,
    lt.next_action,
    lt.created_at,
    ( SELECT count(*) AS count
           FROM lto_call_tracker_for_leads t2
          WHERE t2.lead_id = lt.lead_id) AS no_of_follow_ups,
    lt.enquiry_received_status AS last_follow_up_status,
    lt.created_at AS last_follow_up_date,
    (((((((((COALESCE(lt.what_did_customer_say, ''::text) || ' '::text) || COALESCE(lt.sc_name, ''::text)) || ' '::text) || COALESCE(lt.enquiry_received_status, ''::text)) || ' '::text) || COALESCE(pl.company_name, ''::text)) || ' '::text) || COALESCE(pl.lead_no, ''::text)) || ' '::text) || COALESCE(pl.phone_number, ''::character varying)::text AS search_text
   FROM ( SELECT DISTINCT ON (lto_call_tracker_for_leads.lead_id) lto_call_tracker_for_leads.id,
            lto_call_tracker_for_leads.lead_id,
            lto_call_tracker_for_leads.what_did_customer_say,
            lto_call_tracker_for_leads.enquiry_received_status,
            lto_call_tracker_for_leads.enquiry_received_date,
            lto_call_tracker_for_leads.enquiry_for_state,
            lto_call_tracker_for_leads.project_name,
            lto_call_tracker_for_leads.enquiry_type,
            lto_call_tracker_for_leads.enquiry_approach,
            lto_call_tracker_for_leads.next_action,
            lto_call_tracker_for_leads.next_call_date,
            lto_call_tracker_for_leads.next_call_time,
            lto_call_tracker_for_leads.sc_name,
            lto_call_tracker_for_leads.calling_days,
            lto_call_tracker_for_leads.project_approximate_value,
            lto_call_tracker_for_leads.other_remarks,
            lto_call_tracker_for_leads.created_at,
            lto_call_tracker_for_leads.delay,
            lto_call_tracker_for_leads.planned_at
           FROM lto_call_tracker_for_leads
          ORDER BY lto_call_tracker_for_leads.lead_id, lto_call_tracker_for_leads.created_at DESC) lt
     LEFT JOIN lto_leads pl ON pl.id = lt.lead_id
  WHERE COALESCE(lower(lt.enquiry_received_status), ''::text) <> ALL (ARRAY['yes'::text, 'not-interested'::text]);

GRANT SELECT ON public.call_tracker_pending_view TO anon, authenticated;
