-- =====================================================================
-- 17_item_specs.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses.
--
-- Item master split:
--   lto_items       -- common details: item_name, item_code, unit,
--                      created_at, updated_at, updated_by
--   lto_item_specs  -- per-item detail rows, linked by item_uuid (FK):
--                      type = 'basic'        (old rate / reseller_rate /
--                                             description -> technical_specs)
--                      type = 'lite_series'  (Series Quotation, Lite Plus)
--                      type = 'ut_series'    (Series Quotation, Ultra Tough)
--
-- NON-DESTRUCTIVE: the old lto_items columns (item_category, rate,
-- reseller_rate, description, warranty, user_who_updated) are NOT dropped
-- here -- that's 18_drop_old_item_columns.sql, to run only after this
-- release is live in production.
-- =====================================================================

ALTER TABLE public.lto_items
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS updated_by text;

CREATE TABLE IF NOT EXISTS public.lto_item_specs (
  uuid            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_uuid       uuid NOT NULL REFERENCES public.lto_items(uuid) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('basic', 'lite_series', 'ut_series')),
  rate            numeric,
  reseller_rate   numeric,
  technical_specs text,
  img             text,
  video           text,
  remarks         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text,
  CONSTRAINT lto_item_specs_item_type_key UNIQUE (item_uuid, type)
);

ALTER TABLE public.lto_item_specs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_anon_authenticated" ON public.lto_item_specs;
CREATE POLICY "allow_all_anon_authenticated" ON public.lto_item_specs
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Backfill one 'basic' row per existing item from the old columns.
INSERT INTO public.lto_item_specs (item_uuid, type, rate, reseller_rate, technical_specs, updated_at, updated_by)
SELECT i.uuid, 'basic', i.rate, i.reseller_rate, NULLIF(btrim(i.description), ''), i.updated_at, i.user_who_updated
FROM public.lto_items i
ON CONFLICT (item_uuid, type) DO NOTHING;

-- ---------------------------------------------------------------------
-- Add Item: one call. Rejects a duplicate item_code (case/space-insensitive)
-- with the existing item's name, so the UI can show it.
-- Raises 'DUPLICATE_CODE:<existing item name>'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lto_add_item(
  p_item_name text, p_item_code text, p_unit text, p_updated_by text
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_existing text;
  v_uuid uuid;
BEGIN
  IF NULLIF(btrim(p_item_code), '') IS NOT NULL THEN
    SELECT item_name INTO v_existing FROM public.lto_items
     WHERE upper(btrim(item_code)) = upper(btrim(p_item_code)) LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'DUPLICATE_CODE:%', v_existing;
    END IF;
  END IF;

  INSERT INTO public.lto_items (item_name, item_code, unit, updated_by)
  VALUES (btrim(p_item_name), NULLIF(btrim(p_item_code), ''), NULLIF(btrim(p_unit), ''), p_updated_by)
  RETURNING uuid INTO v_uuid;
  RETURN v_uuid;
END;
$$;

-- ---------------------------------------------------------------------
-- Item detail page Save: one call, one transaction. Updates lto_items and
-- upserts every spec row passed in p_specs (jsonb array of
-- {type, rate, reseller_rate, technical_specs, img, video, remarks}).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lto_save_item_details(
  p_item_uuid uuid, p_item_name text, p_item_code text, p_unit text,
  p_specs jsonb, p_updated_by text
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_existing text;
BEGIN
  IF NULLIF(btrim(p_item_code), '') IS NOT NULL THEN
    SELECT item_name INTO v_existing FROM public.lto_items
     WHERE upper(btrim(item_code)) = upper(btrim(p_item_code)) AND uuid <> p_item_uuid LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'DUPLICATE_CODE:%', v_existing;
    END IF;
  END IF;

  UPDATE public.lto_items
     SET item_name  = btrim(p_item_name),
         item_code  = NULLIF(btrim(p_item_code), ''),
         unit       = NULLIF(btrim(p_unit), ''),
         updated_at = now(),
         updated_by = p_updated_by
   WHERE uuid = p_item_uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND';
  END IF;

  INSERT INTO public.lto_item_specs AS s
    (item_uuid, type, rate, reseller_rate, technical_specs, img, video, remarks, updated_at, updated_by)
  SELECT p_item_uuid, x.type, x.rate, x.reseller_rate,
         NULLIF(btrim(x.technical_specs), ''), NULLIF(btrim(x.img), ''),
         NULLIF(btrim(x.video), ''), NULLIF(btrim(x.remarks), ''), now(), p_updated_by
  FROM jsonb_to_recordset(COALESCE(p_specs, '[]'::jsonb))
       AS x(type text, rate numeric, reseller_rate numeric, technical_specs text, img text, video text, remarks text)
  ON CONFLICT (item_uuid, type) DO UPDATE
     SET rate            = EXCLUDED.rate,
         reseller_rate   = EXCLUDED.reseller_rate,
         technical_specs = EXCLUDED.technical_specs,
         img             = EXCLUDED.img,
         video           = EXCLUDED.video,
         remarks         = EXCLUDED.remarks,
         updated_at      = now(),
         updated_by      = EXCLUDED.updated_by;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lto_add_item(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lto_save_item_details(uuid, text, text, text, jsonb, text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- Storage: public bucket for item images (videos are URL-only, no upload).
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lto-items-master', 'lto-items-master', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "lto_items_master_select" ON storage.objects;
DROP POLICY IF EXISTS "lto_items_master_insert" ON storage.objects;
DROP POLICY IF EXISTS "lto_items_master_update" ON storage.objects;
DROP POLICY IF EXISTS "lto_items_master_delete" ON storage.objects;
CREATE POLICY "lto_items_master_select" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'lto-items-master');
CREATE POLICY "lto_items_master_insert" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'lto-items-master');
CREATE POLICY "lto_items_master_update" ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'lto-items-master');
CREATE POLICY "lto_items_master_delete" ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'lto-items-master');
