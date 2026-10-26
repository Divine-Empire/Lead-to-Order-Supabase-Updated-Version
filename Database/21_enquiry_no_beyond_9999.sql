-- =====================================================================
-- 21_enquiry_no_beyond_9999.sql
--
-- MUST BE RUN AGAINST THE SAME PRODUCTION DATABASE this app uses.
--
-- Enquiry creation stopped at En-9999: lto_set_enquiry_no built the number
-- with LPAD((max + 1)::text, 4, '0'), and LPAD TRUNCATES to 4 characters,
-- so max 9999 -> 10000 -> '1000' -> En-1000, which already exists and
-- violates enquiries_enquiry_no_key.
--
-- Numbers below 10000 keep the 4-digit zero padding (En-0007 ... En-9999);
-- from 10000 on the number is written in full (En-10000, En-10001, ...).
-- The max lookup already parses any number of digits.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.lto_set_enquiry_no()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$DECLARE
  v_max_num INT;
  v_next_num INT;
BEGIN
  IF NEW.enquiry_no IS NULL OR NEW.enquiry_no = '' THEN
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
