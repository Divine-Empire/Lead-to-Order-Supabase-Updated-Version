import { useState, useEffect } from "react";
import ModalForm from "./ModalForm";
import SearchableDropdown from "./SearchableDropdown";
import {
  CLIENT_TYPES, toInputDate, fetchFieldPersonNames, fetchNobOptions, fetchAssignment, fetchAssignmentById, saveAssignment, updateAssignment,
} from "../utils/fosAssigned";
import { notifyFieldAssignment } from "../utils/fieldAssignmentWhatsapp";

// Admin: assign an open enquiry / lead to field person(s) for a visit.
// `record` is the Enquiry Tracker pending row (sourceType, id, leadNo, companyName, ...).
// With no record (blank form) the assignment is "manual": no Enquiry / Lead No.
// `record.assignmentId` opens that saved assignment for editing.

const fieldClass = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none";
const labelClass = "block text-sm font-medium text-foreground";

const fromRecord = (r) => ({
  assignedTo: [],
  companyName: r.companyName || "",
  personName: r.person_name || r.salespersonName || "",
  contactNumber: r.phoneNumber || r.phoneNo || "",
  address: r.shippingAddress || r.billingAddress || "",
  nob: "",
  projectValue: "",
  meetingFrom: "",
  meetingTo: "",
  clientType: "",
  status: "Open",
});

export default function AssignFieldPersonModal({ isOpen, onClose, record, assignedBy, showNotification, onSaved }) {
  const [form, setForm] = useState(() => fromRecord(record || {}));
  const [existingId, setExistingId] = useState(null);
  const [original, setOriginal] = useState(null); // meeting + people as saved, to decide whether to WhatsApp
  const [people, setPeople] = useState([]);
  const [nobOptions, setNobOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const recordId = record?.dbId || record?.id || null;
  const sourceType = ["enquiry", "lead", "manual"].includes(record?.sourceType) ? record.sourceType : recordId ? "lead" : "manual";
  const assignmentId = record?.assignmentId || null;

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setIsLoading(true);
    setExistingId(null);
    setOriginal(null);
    setForm(fromRecord(record || {}));
    Promise.all([
      fetchFieldPersonNames().catch((e) => { console.error("Field persons:", e); return []; }),
      fetchNobOptions().catch((e) => { console.error("NOB list:", e); return []; }),
      assignmentId
        ? fetchAssignmentById(assignmentId).catch((e) => { console.error("Assignment load:", e); return null; })
        : recordId ? fetchAssignment(sourceType, recordId).catch((e) => { console.error("Assignment load:", e); return null; }) : null,
    ]).then(([names, nobs, existing]) => {
      if (cancelled) return;
      setPeople(names);
      setNobOptions(nobs);
      if (existing) {
        setExistingId(existing.id);
        setOriginal({ meetingFrom: toInputDate(existing.meeting_at), meetingTo: toInputDate(existing.meeting_to || existing.meeting_at), assignedTo: existing.assigned_to || [] });
        setForm({
          assignedTo: existing.assigned_to || [],
          companyName: existing.company_name || "",
          personName: existing.person_name || "",
          contactNumber: existing.contact_number || "",
          address: existing.address || "",
          nob: existing.nob || "",
          projectValue: existing.project_value ?? "",
          meetingFrom: toInputDate(existing.meeting_at),
          meetingTo: toInputDate(existing.meeting_to || existing.meeting_at),
          clientType: existing.client_type || "",
          status: existing.status || "Open",
        });
      }
    }).finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, recordId, sourceType, assignmentId]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const withCurrent = (list, value) => (value && !list.includes(value) ? [value, ...list] : list);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sourceType !== "manual" && !recordId) { showNotification?.("This record cannot be assigned (no id).", "error"); return; }
    if (form.assignedTo.length === 0) { showNotification?.("Select at least one person in Assign To.", "error"); return; }
    if (!form.companyName.trim()) { showNotification?.("Company Name is required.", "error"); return; }
    if (!form.meetingFrom || !form.meetingTo) { showNotification?.("Select the meeting From and To dates.", "error"); return; }
    if (form.meetingTo < form.meetingFrom) { showNotification?.("The To date cannot be before the From date.", "error"); return; }
    if (!form.clientType) { showNotification?.("Select the Client Type.", "error"); return; }
    setIsSaving(true);
    try {
      const payload = {
        source_type: sourceType,
        record_id: recordId,
        display_no: record?.leadNo || record?.enquiryNo || null,
        assigned_to: form.assignedTo,
        company_name: form.companyName.trim(),
        person_name: form.personName.trim() || null,
        contact_number: form.contactNumber.trim() || null,
        address: form.address.trim() || null,
        nob: form.nob || null,
        project_value: form.projectValue === "" ? null : Number(form.projectValue),
        meeting_at: `${form.meetingFrom}T00:00:00`,
        meeting_to: form.meetingTo,
        client_type: form.clientType,
        assigned_by: assignedBy || null,
        status: form.status || "Open",
      };
      const saved = existingId ? await updateAssignment(existingId, payload) : await saveAssignment(payload);
      showNotification?.(existingId ? "Assignment updated" : "Assigned to field person", "success");
      // WhatsApp the field person(s): everyone on a new assignment or a changed meeting time,
      // only the newly added people when just the person list grew. Never blocks the save.
      let waEvent = null;
      if (!existingId) waEvent = "new";
      else if (original && (original.meetingFrom !== form.meetingFrom || original.meetingTo !== form.meetingTo)) waEvent = "changed";
      else if (original && form.assignedTo.some((p) => !original.assignedTo.includes(p))) waEvent = "new";
      if (waEvent && (existingId || saved?.id)) {
        const wa = await notifyFieldAssignment(saved?.id || existingId, waEvent);
        if (wa.success && wa.failed?.length === 0) showNotification?.(`WhatsApp sent to ${wa.sent} person${wa.sent === 1 ? "" : "s"}`, "success");
        else if (wa.success && wa.skipped) { /* nobody new to message */ }
        else showNotification?.(`Assignment saved, but WhatsApp failed: ${wa.error || wa.failed?.[0]?.error || "unknown error"}`, "warning");
      }
      onSaved?.();
      onClose();
    } catch (err) {
      console.error("Assign failed:", err);
      showNotification?.("Could not assign: " + (err.message || err), "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalForm
      isOpen={isOpen}
      onClose={onClose}
      title={`${existingId ? "Update Assignment" : "Assign to Field Person"}${record?.leadNo ? ` - ${record.leadNo}` : ""}`}
      onSubmit={handleSubmit}
      submitText={isSaving ? "Saving..." : existingId ? "Update" : "Assign"}
      submitDisabled={isSaving || isLoading}
      maxWidth="max-w-2xl"
      maxHeight="85vh"
    >
      {existingId && <p className="text-xs text-muted-foreground">{sourceType === "manual" ? "This assignment already exists." : `This ${sourceType} is already assigned.`} Saving updates that assignment.</p>}
      <div className="space-y-1">
        <span className={labelClass}>Assign To</span>
        <SearchableDropdown
          isMulti
          options={withCurrent(people, "").concat(form.assignedTo.filter((p) => !people.includes(p))).map((p) => ({ value: p, label: p }))}
          value={form.assignedTo}
          onChange={(v) => set({ assignedTo: v })}
          placeholder="Select person(s)"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="afp-company" className={labelClass}>Company Name</label>
          <input id="afp-company" className={fieldClass} value={form.companyName} onChange={(e) => set({ companyName: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor="afp-person" className={labelClass}>Person Name</label>
          <input id="afp-person" className={fieldClass} value={form.personName} onChange={(e) => set({ personName: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor="afp-contact" className={labelClass}>Contact Number</label>
          <input id="afp-contact" className={fieldClass} value={form.contactNumber} onChange={(e) => set({ contactNumber: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor="afp-nob" className={labelClass}>NOB</label>
          <select id="afp-nob" className={fieldClass} value={form.nob} onChange={(e) => set({ nob: e.target.value })}>
            <option value="">Select NOB</option>
            {withCurrent(nobOptions, form.nob).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="afp-address" className={labelClass}>Address</label>
        <textarea id="afp-address" rows={2} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none" value={form.address} onChange={(e) => set({ address: e.target.value })} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="afp-value" className={labelClass}>Project Value</label>
          <input id="afp-value" type="number" min="0" step="any" className={fieldClass} value={form.projectValue} onChange={(e) => set({ projectValue: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor="afp-type" className={labelClass}>Client Type</label>
          <select id="afp-type" className={fieldClass} value={form.clientType} onChange={(e) => set({ clientType: e.target.value })}>
            <option value="">Select</option>
            {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="afp-from" className={labelClass}>Meeting From (Date)</label>
          <input
            id="afp-from"
            type="date"
            className={fieldClass}
            value={form.meetingFrom}
            max={form.meetingTo || undefined}
            onChange={(e) => set({ meetingFrom: e.target.value, meetingTo: form.meetingTo && form.meetingTo >= e.target.value ? form.meetingTo : e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="afp-to" className={labelClass}>Meeting To (Date)</label>
          <input id="afp-to" type="date" className={fieldClass} value={form.meetingTo} min={form.meetingFrom || undefined} onChange={(e) => set({ meetingTo: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="afp-status" className={labelClass}>Status</label>
        <select id="afp-status" className={fieldClass} value={form.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="Open">Open</option>
          <option value="Closed">Closed</option>
        </select>
      </div>
    </ModalForm>
  );
}
