-- =====================================================================
-- 13_lead_to_order_sheet_view.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf) -- Supabase Dashboard > SQL Editor.
--
-- lead_to_order_sheet_view: the LEADS counterpart of
-- enquiry_to_order_sheet_view -- same 84 sheet-style columns, same shape,
-- but built from lto_leads + lto_enquiry_tracker_for_leads + lto_lead_items,
-- and holding only CONVERTED leads (a lead whose latest tracker row has
-- is_order_received_status = 'yes').
--
-- How it is built (identical rules to enquiry_to_order_sheet_view):
--   * tracker_agg   one row per lead; each column = the newest NON-NULL value
--                   across all of that lead's tracker rows (stage forms only
--                   write the few columns they collect, so the newest row
--                   alone is mostly blank). The 6 yes/no flags are
--                   bool_or -> 'Yes' / 'No'.
--   * items_agg     first 10 items as Item Name N / Quantity N; the rest as
--                   JSON in "Item/Qty"; plus "Total qty".
--   * filter        lower(last row's is_order_received_status) = 'yes'.
--
-- Differences forced by the leads schema (lto_leads is not lto_enquiries):
--   "Enquiry No."               -> "Lead No."             (lead_no)
--   "Sales Person Name"         -> person_name
--   "Email"                     -> email_address
--   "Shipping Address"          -> address
--   "Enquiry Receiver Name"     -> lead_receiver_name
--   "Sales Cordinator Name"     -> sc_name
--   "Project Name"              -> nob       (same mapping the enquiry view uses)
--   "Enquiry Date" / "Enquiry For State" / "Enquiry Approach" /
--   "Enquiry Assign to Project" -> leads have no such columns; taken from the
--                   lead's call-tracker rows (lto_call_tracker_for_leads):
--                   newest non-null value. "Enquiry For State" falls back to
--                   lto_leads.state. These call-tracker fields are sparse in
--                   practice (e.g. enquiry_approach is almost always empty).
--
-- Access: read-only for the API roles (SELECT only), unlike the older sheet
-- views which grant every privilege to anon/authenticated by default.
-- =====================================================================

CREATE OR REPLACE VIEW public.lead_to_order_sheet_view AS
WITH tracker_agg AS (
    SELECT t.lead_id,
        (array_agg(t.created_at ORDER BY t.created_at DESC))[1] AS latest_created_at,
        (array_agg(t.is_order_received_status ORDER BY t.created_at DESC))[1] AS last_row_order_received_status,
        (array_agg(t.current_stage ORDER BY t.created_at DESC) FILTER (WHERE t.current_stage IS NOT NULL))[1] AS current_stage,
        (array_agg(t.delay ORDER BY t.created_at DESC) FILTER (WHERE t.delay IS NOT NULL))[1] AS delay,
        (array_agg(t.enquiry_status ORDER BY t.created_at DESC) FILTER (WHERE t.enquiry_status IS NOT NULL))[1] AS enquiry_status,
        (array_agg(t.what_did_customer_say ORDER BY t.created_at DESC) FILTER (WHERE t.what_did_customer_say IS NOT NULL))[1] AS what_did_customer_say,
        (array_agg(t.send_quotation_no ORDER BY t.created_at DESC) FILTER (WHERE t.send_quotation_no IS NOT NULL))[1] AS send_quotation_no,
        (array_agg(t.quotation_shared_by ORDER BY t.created_at DESC) FILTER (WHERE t.quotation_shared_by IS NOT NULL))[1] AS quotation_shared_by,
        (array_agg(t.quotation_number ORDER BY t.created_at DESC) FILTER (WHERE t.quotation_number IS NOT NULL))[1] AS quotation_number,
        (array_agg(t.quotation_value_without_tax ORDER BY t.created_at DESC) FILTER (WHERE t.quotation_value_without_tax IS NOT NULL))[1] AS quotation_value_without_tax,
        (array_agg(t.quotation_value_with_tax ORDER BY t.created_at DESC) FILTER (WHERE t.quotation_value_with_tax IS NOT NULL))[1] AS quotation_value_with_tax,
        (array_agg(t.quotation_upload ORDER BY t.created_at DESC) FILTER (WHERE t.quotation_upload IS NOT NULL))[1] AS quotation_upload,
        (array_agg(t.quotation_remarks ORDER BY t.created_at DESC) FILTER (WHERE t.quotation_remarks IS NOT NULL))[1] AS quotation_remarks,
        (array_agg(t.quotation_validator_name ORDER BY t.created_at DESC) FILTER (WHERE t.quotation_validator_name IS NOT NULL))[1] AS quotation_validator_name,
        (array_agg(t.quotation_send_status ORDER BY t.created_at DESC) FILTER (WHERE t.quotation_send_status IS NOT NULL))[1] AS quotation_send_status,
        (array_agg(t.quotation_validation_remark ORDER BY t.created_at DESC) FILTER (WHERE t.quotation_validation_remark IS NOT NULL))[1] AS quotation_validation_remark,
        CASE WHEN bool_or(t.send_faq_video) THEN 'Yes'::text ELSE 'No'::text END AS send_faq_video,
        CASE WHEN bool_or(t.send_product_video) THEN 'Yes'::text ELSE 'No'::text END AS send_product_video,
        CASE WHEN bool_or(t.send_offer_video) THEN 'Yes'::text ELSE 'No'::text END AS send_offer_video,
        CASE WHEN bool_or(t.send_product_catalog) THEN 'Yes'::text ELSE 'No'::text END AS send_product_catalog,
        CASE WHEN bool_or(t.send_product_image) THEN 'Yes'::text ELSE 'No'::text END AS send_product_image,
        CASE WHEN bool_or(t.conveyed_for_registration_form) THEN 'Yes'::text ELSE 'No'::text END AS conveyed_for_registration_form,
        (array_agg(t.next_call_date ORDER BY t.created_at DESC) FILTER (WHERE t.next_call_date IS NOT NULL))[1] AS next_call_date,
        (array_agg(t.next_call_time ORDER BY t.created_at DESC) FILTER (WHERE t.next_call_time IS NOT NULL))[1] AS next_call_time,
        (array_agg(t.calling_days ORDER BY t.created_at DESC) FILTER (WHERE t.calling_days IS NOT NULL))[1] AS calling_days,
        (array_agg(t.is_order_received_status ORDER BY t.created_at DESC) FILTER (WHERE t.is_order_received_status IS NOT NULL))[1] AS is_order_received_status,
        (array_agg(t.acceptance_via ORDER BY t.created_at DESC) FILTER (WHERE t.acceptance_via IS NOT NULL))[1] AS acceptance_via,
        (array_agg(t.payment_mode ORDER BY t.created_at DESC) FILTER (WHERE t.payment_mode IS NOT NULL))[1] AS payment_mode,
        (array_agg(t.payment_terms_days ORDER BY t.created_at DESC) FILTER (WHERE t.payment_terms_days IS NOT NULL))[1] AS payment_terms_days,
        (array_agg(t.warranty ORDER BY t.created_at DESC) FILTER (WHERE t.warranty IS NOT NULL))[1] AS warranty,
        (array_agg(t.acceptance_file_upload ORDER BY t.created_at DESC) FILTER (WHERE t.acceptance_file_upload IS NOT NULL))[1] AS acceptance_file_upload,
        (array_agg(t.remark ORDER BY t.created_at DESC) FILTER (WHERE t.remark IS NOT NULL))[1] AS remark,
        (array_agg(t.order_lost_apology_video ORDER BY t.created_at DESC) FILTER (WHERE t.order_lost_apology_video IS NOT NULL))[1] AS order_lost_apology_video,
        (array_agg(t.if_no_reason_status ORDER BY t.created_at DESC) FILTER (WHERE t.if_no_reason_status IS NOT NULL))[1] AS if_no_reason_status,
        (array_agg(t.if_no_reason_remark ORDER BY t.created_at DESC) FILTER (WHERE t.if_no_reason_remark IS NOT NULL))[1] AS if_no_reason_remark,
        (array_agg(t.transport_mode ORDER BY t.created_at DESC) FILTER (WHERE t.transport_mode IS NOT NULL))[1] AS transport_mode,
        (array_agg(t.order_no ORDER BY t.created_at DESC) FILTER (WHERE t.order_no IS NOT NULL))[1] AS order_no,
        (array_agg(t.amount_with_tax ORDER BY t.created_at DESC) FILTER (WHERE t.amount_with_tax IS NOT NULL))[1] AS amount_with_tax,
        (array_agg(t.destination ORDER BY t.created_at DESC) FILTER (WHERE t.destination IS NOT NULL))[1] AS destination,
        (array_agg(t.po_number ORDER BY t.created_at DESC) FILTER (WHERE t.po_number IS NOT NULL))[1] AS po_number
    FROM public.lto_enquiry_tracker_for_leads t
    GROUP BY t.lead_id
),
items_ranked AS (
    SELECT li.lead_id,
        li.item_name,
        li.quantity,
        row_number() OVER (PARTITION BY li.lead_id ORDER BY li.created_at) AS rn
    FROM public.lto_lead_items li
),
items_agg AS (
    SELECT ir.lead_id,
        max(ir.item_name) FILTER (WHERE ir.rn = 1) AS item_name_1,
        max(ir.quantity) FILTER (WHERE ir.rn = 1) AS quantity_1,
        max(ir.item_name) FILTER (WHERE ir.rn = 2) AS item_name_2,
        max(ir.quantity) FILTER (WHERE ir.rn = 2) AS quantity_2,
        max(ir.item_name) FILTER (WHERE ir.rn = 3) AS item_name_3,
        max(ir.quantity) FILTER (WHERE ir.rn = 3) AS quantity_3,
        max(ir.item_name) FILTER (WHERE ir.rn = 4) AS item_name_4,
        max(ir.quantity) FILTER (WHERE ir.rn = 4) AS quantity_4,
        max(ir.item_name) FILTER (WHERE ir.rn = 5) AS item_name_5,
        max(ir.quantity) FILTER (WHERE ir.rn = 5) AS quantity_5,
        max(ir.item_name) FILTER (WHERE ir.rn = 6) AS item_name_6,
        max(ir.quantity) FILTER (WHERE ir.rn = 6) AS quantity_6,
        max(ir.item_name) FILTER (WHERE ir.rn = 7) AS item_name_7,
        max(ir.quantity) FILTER (WHERE ir.rn = 7) AS quantity_7,
        max(ir.item_name) FILTER (WHERE ir.rn = 8) AS item_name_8,
        max(ir.quantity) FILTER (WHERE ir.rn = 8) AS quantity_8,
        max(ir.item_name) FILTER (WHERE ir.rn = 9) AS item_name_9,
        max(ir.quantity) FILTER (WHERE ir.rn = 9) AS quantity_9,
        max(ir.item_name) FILTER (WHERE ir.rn = 10) AS item_name_10,
        max(ir.quantity) FILTER (WHERE ir.rn = 10) AS quantity_10,
        COALESCE(jsonb_object_agg(ir.item_name, ir.quantity) FILTER (WHERE ir.rn > 10), NULL::jsonb) AS overflow_item_qty,
        sum(ir.quantity) AS total_qty
    FROM items_ranked ir
    GROUP BY ir.lead_id
),
calls_agg AS (
    -- Fields the lead record itself doesn't have; newest non-null from its calls.
    SELECT c.lead_id,
        (array_agg(c.enquiry_received_date ORDER BY c.created_at DESC) FILTER (WHERE c.enquiry_received_date IS NOT NULL))[1] AS enquiry_received_date,
        (array_agg(c.enquiry_for_state ORDER BY c.created_at DESC) FILTER (WHERE c.enquiry_for_state IS NOT NULL))[1] AS enquiry_for_state,
        (array_agg(c.enquiry_approach ORDER BY c.created_at DESC) FILTER (WHERE c.enquiry_approach IS NOT NULL))[1] AS enquiry_approach,
        (array_agg(c.enquiry_assign_to_person ORDER BY c.created_at DESC) FILTER (WHERE c.enquiry_assign_to_person IS NOT NULL))[1] AS enquiry_assign_to_person
    FROM public.lto_call_tracker_for_leads c
    GROUP BY c.lead_id
)
SELECT l.created_at AS "timestamp",
    l.lead_no AS "Lead No.",
    l.lead_source AS "Lead Source",
    l.company_name AS "Company Name",
    l.phone_number AS "Phone Number",
    l.person_name AS "Sales Person Name",
    l.location AS "Location",
    l.email_address AS "Email",
    l.address AS "Shipping Address",
    l.lead_receiver_name AS "Enquiry Receiver Name",
    ca.enquiry_assign_to_person AS "Enquiry Assign to Project",
    l.gst_number AS "GST Number",
    ca.enquiry_received_date::timestamp without time zone AS "Enquiry Date",
    COALESCE(ca.enquiry_for_state, l.state) AS "Enquiry For State",
    l.nob AS "Project Name",
    l.sales_type AS "Sales Type",
    ca.enquiry_approach AS "Enquiry Approach",
    ia.item_name_1 AS "Item Name 1",
    ia.quantity_1 AS "Quantity 1",
    ia.item_name_2 AS "Item Name 2",
    ia.quantity_2 AS "Quantity 2",
    ia.item_name_3 AS "Item Name 3",
    ia.quantity_3 AS "Quantity 3",
    ia.item_name_4 AS "Item Name 4",
    ia.quantity_4 AS "Quantity 4",
    ia.item_name_5 AS "Item Name 5",
    ia.quantity_5 AS "Quantity 5",
    ia.item_name_6 AS "Item Name 6",
    ia.quantity_6 AS "Quantity 6",
    ia.item_name_7 AS "Item Name 7",
    ia.quantity_7 AS "Quantity 7",
    ia.item_name_8 AS "Item Name 8",
    ia.quantity_8 AS "Quantity 8",
    ia.item_name_9 AS "Item Name 9",
    ia.quantity_9 AS "Quantity 9",
    ia.item_name_10 AS "Item Name 10",
    ia.quantity_10 AS "Quantity 10",
    l.planned_at AS "Planned1",
    ta.latest_created_at AS "Actual1",
    ta.delay AS "Delay1",
    ta.enquiry_status AS "Enquiry Status",
    ta.what_did_customer_say AS "What Did Customer Say",
    ta.current_stage AS "Current Stage",
    ta.send_quotation_no AS "Send Quotation No.",
    ta.quotation_shared_by AS "Quotation Shared By",
    ta.quotation_number AS "Quotation Number",
    ta.quotation_value_without_tax AS "Quotation Value Without Tax",
    ta.quotation_value_with_tax AS "Quotation Value With Tax",
    ta.quotation_upload AS "Quotation Upload",
    ta.quotation_remarks AS "Quotation Remarks",
    ta.quotation_validator_name AS "Quotation Validator Name",
    ta.quotation_send_status AS "Quotation Send Status",
    ta.quotation_validation_remark AS "Quotation Validation Remark",
    ta.send_faq_video AS "Send FAQ Video",
    ta.send_product_video AS "Send Product Video",
    ta.send_offer_video AS "Send Offer Video",
    ta.send_product_catalog AS "Send Product Catalog",
    ta.send_product_image AS "Send Product Image",
    ta.next_call_date AS "Next Call Date",
    ta.next_call_time AS "Next Call Time",
    ta.is_order_received_status AS "Is Order Received? Status",
    ta.acceptance_via AS "Acceptance Via",
    ta.payment_mode AS "Payment Mode",
    ta.payment_terms_days AS "Payment Terms (In Days)",
    ta.warranty AS "Offer",
    ta.acceptance_file_upload AS "Acceptance File Upload",
    ta.remark AS "REMARK",
    ta.order_lost_apology_video AS "Order Lost Apology Video",
    ta.if_no_reason_status AS "If No then get relevant reason Status",
    ta.if_no_reason_remark AS "If No then get relevant reason Remark",
    NULL::text AS "CUSTOMER ORDER HOLD REASON CATEGORY",
    NULL::text AS "HOLDING DATE",
    NULL::text AS "HOLD REMARK",
    ta.transport_mode AS "Transport Mode",
    ta.conveyed_for_registration_form AS "CONVEYED FOR REGISTRATION FORM",
    l.sc_name AS "Sales Cordinator Name",
    ta.calling_days AS "Calling Days",
    ta.order_no AS "Order No.",
    ta.amount_with_tax AS "Amount With Gst",
    ia.overflow_item_qty::text AS "Item/Qty",
    COALESCE(ia.total_qty, 0::bigint) AS "Total qty",
    ta.destination AS "Destination",
    ta.po_number AS "Po Number",
    ta.latest_created_at AS "last update"
FROM public.lto_leads l
JOIN tracker_agg ta ON ta.lead_id = l.id
LEFT JOIN items_agg ia ON ia.lead_id = l.id
LEFT JOIN calls_agg ca ON ca.lead_id = l.id
WHERE lower(ta.last_row_order_received_status) = 'yes'::text;

-- Read-only for the API roles (new views otherwise get every privilege by default).
REVOKE ALL ON public.lead_to_order_sheet_view FROM anon, authenticated;
GRANT SELECT ON public.lead_to_order_sheet_view TO anon, authenticated, service_role;
