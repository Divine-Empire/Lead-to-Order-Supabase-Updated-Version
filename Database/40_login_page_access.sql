-- =====================================================================
-- 40_login_page_access.sql
--
-- Page-wise access (RBAC): login.page_access = the page keys a user may open
-- (see src/constants/pageAccess.js). Admins ignore it (full access).
-- NULL = account without an explicit list -> the app uses the same default a
-- non-admin always had, so nothing changes for existing users.
--
-- Existing non-admin users are given that default explicitly so it shows as
-- ticked boxes in Settings > Edit User.
-- =====================================================================
BEGIN;

ALTER TABLE public.login ADD COLUMN IF NOT EXISTS page_access text[];

UPDATE public.login
   SET page_access = ARRAY['dashboard','leads','call-tracker','enquiry-tracker','quotation','series-quotation',
                           'fos-enquiries','weekly-plan','field-sales-logs','report','master:client']
 WHERE usertype <> 'admin' AND page_access IS NULL;

COMMIT;
