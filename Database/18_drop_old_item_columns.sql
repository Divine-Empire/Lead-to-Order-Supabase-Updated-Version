-- =====================================================================
-- 18_drop_old_item_columns.sql
--
-- DO NOT RUN until the release that reads lto_item_specs (17_item_specs.sql
-- + the new Items / Series Quotation / Quotation code) is LIVE in production
-- and the owner has approved it. The old deployed build still reads these
-- columns.
--
-- Re-syncs the 'basic' spec rows once more (in case items were edited by the
-- old build after 17 ran), then drops the old columns.
-- =====================================================================

INSERT INTO public.lto_item_specs (item_uuid, type, rate, reseller_rate, technical_specs, updated_at, updated_by)
SELECT i.uuid, 'basic', i.rate, i.reseller_rate, NULLIF(btrim(i.description), ''), i.updated_at, i.user_who_updated
FROM public.lto_items i
ON CONFLICT (item_uuid, type) DO NOTHING;

ALTER TABLE public.lto_items
  DROP COLUMN IF EXISTS item_category,
  DROP COLUMN IF EXISTS rate,
  DROP COLUMN IF EXISTS reseller_rate,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS warranty,
  DROP COLUMN IF EXISTS user_who_updated;
