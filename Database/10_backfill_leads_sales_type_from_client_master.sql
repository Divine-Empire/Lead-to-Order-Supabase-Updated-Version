-- =====================================================================
-- 10_backfill_leads_sales_type_from_client_master.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses
-- (nfwtbrmqvsejwwvraanf).
--
-- One-time data fix: of 1185 lto_leads rows with sales_type = '' (all
-- bulk-import-origin, confirmed earlier in this investigation), backfill
-- whichever ones can be resolved from their company's lto_client_master
-- row (case-insensitive, trimmed company_name match), canonicalizing to
-- the 3 real dropdown values (CRR/NBD/NBD_CRR) the same way
-- normalizeSalesTypeValue (Leads.jsx) / normalizeCategory (Report.jsx) do.
--
-- This does NOT touch lto_client_master -- it already has a value for every
-- row this script writes to lto_leads from (that's the whole point).
-- Leads whose company has no client_master row, or whose client_master row
-- ALSO has a blank sales_type, are left as-is (nothing to backfill from)
-- and are reported by the SELECT at the bottom.
-- =====================================================================

UPDATE lto_leads l
SET sales_type = (
  CASE upper(regexp_replace(trim(cm.sales_type), '[\s-]+', '_', 'g'))
    WHEN 'CRR' THEN 'CRR'
    WHEN 'NBD' THEN 'NBD'
    WHEN 'NBD_CRR' THEN 'NBD_CRR'
    ELSE NULL
  END
)
FROM lto_client_master cm
WHERE lower(trim(cm.company_name)) = lower(trim(l.company_name))
  AND l.sales_type = ''
  AND cm.sales_type IS NOT NULL
  AND trim(cm.sales_type) <> ''
  AND upper(regexp_replace(trim(cm.sales_type), '[\s-]+', '_', 'g')) IN ('CRR', 'NBD', 'NBD_CRR');

-- Still-pending leads (no backfillable client_master match) -- reported
-- back after running.
SELECT l.id, l.lead_no, l.company_name, l.created_at
FROM lto_leads l
WHERE l.sales_type = ''
ORDER BY l.created_at DESC;
