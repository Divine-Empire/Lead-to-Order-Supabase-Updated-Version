-- =====================================================================
-- 20_drop_quotation_items_description.sql
--
-- DO NOT RUN until the release that reads/writes technical_specs is LIVE in
-- production and approved by the owner (the old build still uses
-- `description`). Safe afterwards: no view/function depends on the column.
-- =====================================================================

UPDATE public.lto_make_quotation_items
   SET technical_specs = description
 WHERE technical_specs IS NULL AND description IS NOT NULL;

DROP TRIGGER IF EXISTS trg_qitems_mirror_description ON public.lto_make_quotation_items;
DROP FUNCTION IF EXISTS public.lto_qitems_mirror_description();
ALTER TABLE public.lto_make_quotation_items DROP COLUMN IF EXISTS description;
