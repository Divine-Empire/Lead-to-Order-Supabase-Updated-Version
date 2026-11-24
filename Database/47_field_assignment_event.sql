-- =====================================================================
-- 47_field_assignment_event.sql
--
-- "Enquiry Assigned to Field Person" as a WhatsApp event. It shows in Settings > user >
-- "WhatsApp events". A field person is messaged about an assignment only when this event is
-- ticked for them there; the number comes from their user record (login.whatsapp_number).
-- The send-field-assignment-whatsapp function does the sending and keeps its per-assignment
-- audit (wa_status / wa_results on lto_assigned_to_field_person).
-- wa_params lists the template's {{1}}..{{9}} for reference.
-- =====================================================================
BEGIN;

INSERT INTO public.lto_notification_events
  (event_key, label, description, channels, wa_template, wa_params, condition_fields)
VALUES
  ('field_assignment',
   'Enquiry Assigned to Field Person',
   'An enquiry or lead was assigned to this user for a field visit.',
   ARRAY['whatsapp'],
   'lto_enquiry_assignment_to_field_person',
   ARRAY['assigned_by', 'person', 'company_name', 'person_name', 'contact_number', 'address', 'nob', 'project_value', 'visit_dates'],
   ARRAY[]::text[])
ON CONFLICT (event_key) DO NOTHING;

COMMIT;
