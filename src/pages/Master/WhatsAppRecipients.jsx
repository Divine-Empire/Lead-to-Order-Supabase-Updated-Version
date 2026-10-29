import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../../App";
import useConfirmDialog from "../../components/useConfirmDialog";
import supabase from "../../utils/supabase";
import { PlusIcon, PencilIcon, TrashIcon } from "../../components/Icons";
import MasterDialog from "../../components/MasterDialog";

// People who get the "Reference Name changed" WhatsApp message when a
// quotation revision is saved (see the send-quotation-reference-changed
// Edge Function). Inactive rows are kept but skipped when sending.
const EMPTY_FORM = { name: "", phone: "" };
const inputClass = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none";

const WhatsAppRecipients = () => {
  const { showNotification = () => {} } = useContext(AuthContext) || {};
  const { askConfirm, confirmDialog } = useConfirmDialog();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // null = closed, { id: null } = adding, { id } = editing
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("lto_whatsapp_recipients")
        .select("id, name, phone, is_active")
        .order("name", { ascending: true });
      if (error) throw error;
      setRows(data || []);
    } catch (error) {
      console.error("Error fetching WhatsApp recipients:", error);
      showNotification("Error fetching data: " + (error.message || error), "error");
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setDialog({ id: null });
  };
  const openEdit = (row) => {
    setForm({ name: row.name, phone: row.phone });
    setDialog({ id: row.id });
  };
  const closeDialog = () => setDialog(null);

  const handleSave = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    // Accept "+91 70242 25225" style input; store the last 10 digits.
    const digits = form.phone.replace(/\D/g, "");
    const phone = digits.length > 10 && digits.startsWith("91") ? digits.slice(2) : digits;
    if (!name) {
      showNotification("Please enter a name.", "error");
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      showNotification("Enter a 10-digit mobile number (without country code).", "error");
      return;
    }

    setIsSaving(true);
    try {
      const query = dialog.id
        ? supabase.from("lto_whatsapp_recipients").update({ name, phone }).eq("id", dialog.id).select().maybeSingle()
        : supabase.from("lto_whatsapp_recipients").insert({ name, phone }).select().maybeSingle();
      const { data, error } = await query;
      if (error) {
        if (error.code === "23505") throw new Error("This number is already in the list.");
        throw error;
      }
      if (!data) throw new Error("Nothing was saved (the entry may have been deleted). Please refresh.");
      closeDialog();
      fetchData();
    } catch (error) {
      console.error("Error saving WhatsApp recipient:", error);
      showNotification("Error saving recipient: " + (error.message || error), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (row) => {
    try {
      const { data, error } = await supabase
        .from("lto_whatsapp_recipients")
        .update({ is_active: !row.is_active })
        .eq("id", row.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This entry no longer exists. Please refresh.");
      fetchData();
    } catch (error) {
      console.error("Error updating WhatsApp recipient:", error);
      showNotification("Error updating recipient: " + (error.message || error), "error");
    }
  };

  const handleDelete = (row) => {
    askConfirm({ title: "Remove recipient?", message: `Remove "${row.name}" (${row.phone})?`, confirmText: "Remove" }, async () => {
      try {
        const { data, error } = await supabase.from("lto_whatsapp_recipients").delete().eq("id", row.id).select().maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("This entry was already removed.");
        fetchData();
      } catch (error) {
        console.error("Error deleting WhatsApp recipient:", error);
        showNotification("Error deleting recipient: " + (error.message || error), "error");
      }
    });
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground" role="status">
        Loading WhatsApp recipients...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">WhatsApp Recipients</h2>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            Everyone marked Active gets a WhatsApp message when a quotation revision is saved with a changed Reference Name.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          Add Recipient
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card" role="region" aria-label="WhatsApp recipients" tabIndex={0}>
        <table className="min-w-full border-separate border-spacing-0" aria-label="WhatsApp recipients">
          <thead className="sticky top-0 z-10 bg-secondary">
            <tr>
              {["Name", "Mobile Number", "Active", "Actions"].map((h) => (
                <th key={h} scope="col" className="border-b bg-secondary px-4 py-2.5 text-left text-xs font-semibold text-brand-800">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-card">
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-secondary/60">
                <td className="border-b px-4 py-2 text-sm text-foreground">{row.name}</td>
                <td className="border-b px-4 py-2 text-sm text-foreground">+91 {row.phone}</td>
                <td className="border-b px-4 py-2 text-sm">
                  <label className="inline-flex items-center gap-2 text-foreground">
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={() => toggleActive(row)}
                      className="h-4 w-4 rounded border-input accent-primary"
                      aria-label={`${row.name} active`}
                    />
                    {row.is_active ? "Active" : "Paused"}
                  </label>
                </td>
                <td className="border-b px-4 py-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      aria-label={`Edit ${row.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-info transition-colors hover:bg-accent"
                    >
                      <PencilIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(row)}
                      aria-label={`Delete ${row.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <TrashIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  No recipients yet -- click &quot;Add Recipient&quot; to add one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {dialog && (
        <MasterDialog title={dialog.id ? "Edit Recipient" : "Add Recipient"} onClose={closeDialog}>
          <form onSubmit={handleSave} className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="wr-name" className="block text-sm font-medium text-foreground">Name</label>
              <input
                id="wr-name"
                type="text"
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Neeraj"
              />
              <p className="text-xs text-muted-foreground">Used in the greeting: &quot;Hi Neeraj Sir,&quot;</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="wr-phone" className="block text-sm font-medium text-foreground">Mobile Number</label>
              <input
                id="wr-phone"
                type="tel"
                inputMode="numeric"
                required
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className={inputClass}
                placeholder="10-digit number, e.g. 7024225225"
              />
            </div>
            <div className="flex justify-end gap-3 border-t pt-4">
              <button type="button" onClick={closeDialog} className="h-9 px-4 rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </MasterDialog>
      )}
      {confirmDialog}
    </div>
  );
};

export default WhatsAppRecipients;
