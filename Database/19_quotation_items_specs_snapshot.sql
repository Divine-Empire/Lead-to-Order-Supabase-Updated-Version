-- =====================================================================
-- 19_quotation_items_specs_snapshot.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses.
--
-- lto_make_quotation_items stores a snapshot of the item details as they
-- were on the quotation, so a revision shows exactly what was quoted:
--   technical_specs  (replaces `description`)
--   remarks
--   type             'basic' | 'lite_series' | 'ut_series'
-- All other columns (unit, rate, gst_percent, discount, ...) are unchanged.
--
-- NON-DESTRUCTIVE: `description` is kept for now because the currently
-- deployed build still reads/writes it. A trigger mirrors description ->
-- technical_specs on every write, so rows saved by the old build stay
-- correct. 20_drop_quotation_items_description.sql removes `description`
-- (and the trigger) after the new release is live.
-- =====================================================================

ALTER TABLE public.lto_make_quotation_items
  ADD COLUMN IF NOT EXISTS technical_specs text,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'basic';

ALTER TABLE public.lto_make_quotation_items
  DROP CONSTRAINT IF EXISTS lto_make_quotation_items_type_check;
ALTER TABLE public.lto_make_quotation_items
  ADD CONSTRAINT lto_make_quotation_items_type_check
  CHECK (type IN ('basic', 'lite_series', 'ut_series'));

UPDATE public.lto_make_quotation_items
   SET technical_specs = description
 WHERE technical_specs IS NULL AND description IS NOT NULL;

CREATE OR REPLACE FUNCTION public.lto_qitems_mirror_description()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.technical_specs IS NULL AND NEW.description IS NOT NULL THEN
    NEW.technical_specs := NEW.description;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qitems_mirror_description ON public.lto_make_quotation_items;
CREATE TRIGGER trg_qitems_mirror_description
  BEFORE INSERT OR UPDATE ON public.lto_make_quotation_items
  FOR EACH ROW EXECUTE FUNCTION public.lto_qitems_mirror_description();
