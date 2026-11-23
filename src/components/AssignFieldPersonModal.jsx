import { useState, useEffect } from "react";
import ModalForm from "./ModalForm";
import SearchableDropdown from "./SearchableDropdown";
import {
  CLIENT_TYPES, toInputDateTime, fetchFieldPersonNames, fetchNobOptions, fetchAssignment, saveAssignment,
} from "../utils/fosAssigned";

// Admin: assign an open enquiry / lead to field person(s) for a visit.
// `record` is the Enquiry Tracker pending row (sourceType, id, leadNo, companyName, ...).

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
  meetingAt: "",
  clientType: "",
  status: "Open",
});

export default function AssignFieldPersonModal({ isOpen, onClose, record, assignedBy, showNotification, onSaved }) {
  const [form, setForm] = useState(() => fromRecord(record || {}));
  const [existingId, setExistingId] = useState(null);
  const [people, setPeople] = useState([]);
  const [nobOptions, setNobOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const sourceType = record?.sourceType === "enquiry" ? "enquiry" : "lead";
  const recordId = record?.dbId || record?.id;

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setIsLoading(true);
    setExistingId(null);
    setForm(fromRecord(record || {}));
    Promise.all([
      fetchFieldPersonNames().catch((e) => { console.error("Field persons:", e); return []; }),
      fetchNobOptions().catch((e) => { console.error("NOB list:", e); return []; }),
      recordId ? fetchAssignment(sourceType, recordId).catch((e) => { console.error("Assignment load:", e); return null; }) : null,
    ]).then(([names, nobs, existing]) => {
      if (cancelled) return;
      setPeople(names);
      setNobOptions(nobs);
      if (existing) {
        setExistingId(existing.id);
        setForm({
          assignedTo: existing.assigned_to || [],
          companyName: existing.company_name || "",
          personName: existing.person_name || "",
          contactNumber: existing.contact_number || "",
          address: existing.address || "",
          nob: existing.nob || "",
          projectValue: existing.project_value ?? "",
          meetingAt: toInputDateTime(existing.meeting_at),
          clientType: existing.client_type || "",
          status: existing.status || "Open",
        });
      }
    }).finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, recordId, sourceType]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const withCurrent = (list, value) => (value && !list.includes(value) ? [value, ...list] : list);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!recordId) { showNotification?.("This record cannot be assigned (no id).", "error"); return; }
    if (form.assignedTo.length === 0) { showNotification?.("Select at least one person in Assign To.", "error"); return; }
    if (!form.companyName.trim()) { showNotification?.("Company Name is required.", "error"); return; }
    if (!form.meetingAt) { showNotification?.("Select the Meeting Date and Time.", "error"); return; }
    if (!form.clientType) { showNotification?.("Select the Client Type.", "error"); return; }
    setIsSaving(true);
    try {
      await saveAssignment({
        source_type: sourceType,
        record_id: recordId,
        display_no: record.leadNo || record.enquiryNo || null,
        assigned_to: form.assignedTo,
        company_name: form.companyName.trim(),
        person_name: form.personName.trim() || null,
        contact_number: form.contactNumber.trim() || null,
        address: form.address.trim() || null,
        nob: form.nob || null,
        project_value: form.projectValue === "" ? null : Number(form.projectValue),
        meeting_at: form.meetingAt,
        client_type: form.clientType,
        assigned_by: assignedBy || null,
        status: form.status || "Open",
      });
      showNotification?.(existingId ? "Assignment updated" : "Assigned to field person", "success");
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
      {existingId && <p className="text-xs text-muted-foreground">This {sourceType} is already assigned. Saving updates that assignment.</p>}
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="afp-value" className={labelClass}>Project Value</label>
          <input id="afp-value" type="number" min="0" step="any" className={fieldClass} value={form.projectValue} onChange={(e) => set({ projectValue: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor="afp-meeting" className={labelClass}>Meeting Date and Time</label>
          <input id="afp-meeting" type="datetime-local" className={fieldClass} value={form.meetingAt} onChange={(e) => set({ meetingAt: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor="afp-type" className={labelClass}>Client Type</label>
          <select id="afp-type" className={fieldClass} value={form.clientType} onChange={(e) => set({ clientType: e.target.value })}>
            <option value="">Select</option>
            {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
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
