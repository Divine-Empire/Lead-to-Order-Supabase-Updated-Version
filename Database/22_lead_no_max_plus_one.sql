-- =====================================================================
-- 22_lead_no_max_plus_one.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses.
--
-- lto_set_lead_no (used only when a lead is inserted WITHOUT a lead_no)
-- numbered from COUNT(*) + 1. With gaps in the sequence (2,462 leads, max
-- LD-3212) that gives LD-2463, which already exists -> duplicate key.
-- It now uses MAX(number) + 1, like lto_set_enquiry_no.
--
-- Both generators:
--   * number below 10000: 4-digit zero padding (LD-0007 ... LD-9999)
--   * 10000 and up: written in full (LD-10000, ...), no upper cap
--   * a transaction-level advisory lock so two simultaneous inserts can't
--     read the same max and collide.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.lto_set_lead_no()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$DECLARE
  v_max_num INT;
  v_next_num INT;
BEGIN
  IF NEW.lead_no IS NULL OR NEW.lead_no = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('lto_set_lead_no'));
    SELECT COALESCE(
      MAX(
        CASE
          WHEN lead_no ~* '^LD-[0-9]+$'
          THEN SUBSTR(lead_no, 4)::integer
          ELSE 0
        END
      ), 0
    )
    INTO v_max_num
    FROM public.lto_leads;

    v_next_num := v_max_num + 1;
    NEW.lead_no := 'LD-' ||
      CASE WHEN v_next_num < 10000 THEN LPAD(v_next_num::TEXT, 4, '0') ELSE v_next_num::TEXT END;
  END IF;
  RETURN NEW;
END;$function$;

CREATE OR REPLACE FUNCTION public.lto_set_enquiry_no()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$DECLARE
  v_max_num INT;
  v_next_num INT;
BEGIN
  IF NEW.enquiry_no IS NULL OR NEW.enquiry_no = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('lto_set_enquiry_no'));
    SELECT COALESCE(
      MAX(
        CASE
          WHEN enquiry_no ~* '^En-[0-9]+$'
          THEN SUBSTR(enquiry_no, 4)::integer
          ELSE 0
        END
      ), 0
    )
    INTO v_max_num
    FROM public.lto_enquiries;

    v_next_num := v_max_num + 1;
    NEW.enquiry_no := 'En-' ||
      CASE WHEN v_next_num < 10000 THEN LPAD(v_next_num::TEXT, 4, '0') ELSE v_next_num::TEXT END;
  END IF;
  RETURN NEW;
END;$function$;
