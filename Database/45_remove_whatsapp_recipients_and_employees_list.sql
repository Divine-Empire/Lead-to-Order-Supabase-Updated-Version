-- =====================================================================
-- 45_remove_whatsapp_recipients_and_employees_list.sql
--
-- RUN ONLY AFTER (1) the new frontend is deployed (Settings no longer reads the
-- "employees" dropdown, Master Data has no WhatsApp Recipients page) and
-- (2) the two live alerts were tested through the rules-based functions.
--
--   * WhatsApp recipients are now Settings > user > "Send this user messages for",
--     stored in lto_notification_rules -- so lto_whatsapp_recipients is dropped.
--   * Full Name is typed in Settings, so the lto_dropdown "employees" list is deleted.
--   * The retired page key is removed from every user's page_access.
-- =====================================================================
BEGIN;

DROP TABLE IF EXISTS public.lto_whatsapp_recipients;

DELETE FROM public.lto_dropdown WHERE category = 'employees';

UPDATE public.login
   SET page_access = array_remove(page_access, 'master:whatsapp-recipients')
 WHERE 'master:whatsapp-recipients' = ANY (page_access);

COMMIT;
