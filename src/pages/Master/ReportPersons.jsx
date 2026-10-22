import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../../App";
import useConfirmDialog from "../../components/useConfirmDialog";
import supabase from "../../utils/supabase";
import { PlusIcon, PencilIcon, TrashIcon } from "../../components/Icons";
import MasterDialog from "../../components/MasterDialog";

// Reuses the existing `lto_dropdown` table (category/value pairs) rather
// than a dedicated table -- see the Report Persons master page notes.
// Each of these report tabs gets its own category; a person who should show
// up on both tabs gets one row per category (same value, different
// category), so a name can be added/removed per tab independently. (The FOS
// Report tab has no category here -- its people come from field_sales_form
// visits in the selected range.)
const TAB_TYPES = [
  { key: "report_person_calling", label: "Calling Data (Person)" },
  { key: "report_person_sc_pipeline", label: "SC Pipeline" },
];
const TAB_KEYS = TAB_TYPES.map((t) => t.key);

// Chunked fetch to dodge PostgREST's silent 1000-row cap, same pattern used
// by Dropdowns.jsx -- overkill for the handful of rows this page expects,
// but keeps the page correct if the list ever grows.
async function fetchAllReportPersonRows() {
  let rows = [];
  let from = 0;
  const step = 1000;
  let fetchMore = true;
  while (fetchMore) {
    const { data, error } = await supabase
      .from("lto_dropdown")
      .select("id, category, value, created_at")
      .in("category", TAB_KEYS)
      .order("value", { ascending: true })
      .range(from, from + step - 1);
    if (error) throw error;
    if (data && data.length > 0) {
      rows = rows.concat(data);
      from += step;
      if (data.length < step) fetchMore = false;
    } else {
      fetchMore = false;
    }
  }
  return rows;
}

const ReportPersons = () => {
  const { showNotification = () => {} } = useContext(AuthContext) || {};
  const { askConfirm, confirmDialog } = useConfirmDialog();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTabKeys, setNewTabKeys] = useState(new Set(TAB_KEYS)); // default: every tab, per the common "same name everywhere" case
  const [isSaving, setIsSaving] = useState(false);

  // Edit modal state -- edits a single (category, value) row, same
  // single-row-at-a-time convention as Dropdowns.jsx.
  const [editingRow, setEditingRow] = useState(null); // { id, category, value } | null
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await fetchAllReportPersonRows();
      setRows(data);
    } catch (error) {
      console.error("Error fetching report persons:", error);
      showNotification("Error fetching data: " + (error.message || error), "error");
    } finally {
      setLoading(false);
    }
  };

  const rowsByCategory = TAB_TYPES.reduce((acc, t) => {
    acc[t.key] = rows.filter((r) => r.category === t.key);
    return acc;
  }, {});
  const maxRows = Math.max(0, ...TAB_TYPES.map((t) => rowsByCategory[t.key].length));

  const openAddModal = () => {
    setNewName("");
    setNewTabKeys(new Set(TAB_KEYS));
    setIsAddOpen(true);
  };
  const closeAddModal = () => {
    setIsAddOpen(false);
    setNewName("");
  };
  const toggleNewTabKey = (key) => {
    setNewTabKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      showNotification("Please enter a name.", "error");
      return;
    }
    if (newTabKeys.size === 0) {
      showNotification("Select at least one tab to add this person to.", "error");
      return;
    }

    setIsSaving(true);
    try {
      // Skip any (category, value) pair that already exists -- lto_dropdown
      // has no unique constraint on that pair, so inserting blindly could
      // create duplicate rows for the same person on the same tab.
      const existing = new Set(rows.map((r) => `${r.category}::${r.value.trim().toLowerCase()}`));
      const toInsert = [...newTabKeys]
        .filter((key) => !existing.has(`${key}::${name.toLowerCase()}`))
        .map((key) => ({ category: key, value: name }));

      if (toInsert.length === 0) {
        showNotification("This name already exists on every selected tab.", "error");
        setIsSaving(false);
        return;
      }

      const { error } = await supabase.from("lto_dropdown").insert(toInsert);
      if (error) throw error;

      closeAddModal();
      fetchData();
    } catch (error) {
      console.error("Error adding report person:", error);
      showNotification("Error adding person: " + (error.message || error), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const openEditModal = (row) => {
    setEditingRow(row);
    setEditValue(row.value);
  };
  const closeEditModal = () => {
    setEditingRow(null);
    setEditValue("");
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editingRow) return;
    const value = editValue.trim();
    if (!value) {
      showNotification("Please enter a name.", "error");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("lto_dropdown")
        .update({ value })
        .eq("id", editingRow.id)
        .select()
        .single();
      if (error) throw error;
      if (!data) throw new Error("Update did not affect any row (it may have been deleted). Please refresh.");
      closeEditModal();
      fetchData();
    } catch (error) {
      console.error("Error updating report person:", error);
      showNotification("Error updating person: " + (error.message || error), "error");
    }
  };

  const handleDelete = async (row) => {
    const tabLabel = TAB_TYPES.find((t) => t.key === row.category)?.label || row.category;
    askConfirm({ title: "Remove person?", message: `Remove "${row.value}" from ${tabLabel}?`, confirmText: "Remove" }, async () => {
      try {
        const { data, error } = await supabase.from("lto_dropdown").delete().eq("id", row.id).select().maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("This entry was already removed.");
        fetchData();
      } catch (error) {
        console.error("Error deleting report person:", error);
        showNotification("Error deleting person: " + (error.message || error), "error");
      }
    });
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground" role="status">
        Loading report persons...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Report Persons</h2>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            Controls exactly who shows up as a row/column on the Reports page -- Calling Data and SC Pipeline each only show the people added here.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          Add Person
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card" role="region" aria-label="Report persons" tabIndex={0}>
        <table className="min-w-full border-separate border-spacing-0" aria-label="Report persons by tab">
          <thead className="sticky top-0 z-10 bg-secondary">
            <tr>
              {TAB_TYPES.map((t) => (
                <th
                  key={t.key}
                  scope="col"
                  className="min-w-[220px] border-b border-r bg-secondary px-4 py-2.5 text-left text-xs font-semibold text-brand-800 last:border-r-0"
                >
                  {t.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-card">
            {Array.from({ length: maxRows }).map((_, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-secondary/60 transition-colors">
                {TAB_TYPES.map((t) => {
                  const item = rowsByCategory[t.key][rowIndex];
                  return (
                    <td key={t.key} className="border-b border-r px-4 py-2 align-top text-sm text-foreground last:border-r-0">
                      {item ? (
                        <div className="group flex items-center justify-between gap-2">
                          <span>{item.value}</span>
                          <div className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              aria-label={`Edit ${item.value}`}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-info transition-colors hover:bg-accent"
                            >
                              <PencilIcon className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              aria-label={`Delete ${item.value}`}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
                            >
                              <TrashIcon className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground" aria-label="empty">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {maxRows === 0 && (
              <tr>
                <td colSpan={TAB_TYPES.length} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  No report persons yet -- click "Add Person" to add one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAddOpen && (
        <MasterDialog title="Add Person" onClose={closeAddModal}>
          <form onSubmit={handleAdd} className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="rp-name" className="block text-sm font-medium text-foreground">Name</label>
              <input
                id="rp-name"
                type="text"
                required
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                placeholder="e.g. PRANAV VINAYAKRAO BHOGAWAR"
              />
            </div>
            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-foreground">Show on</legend>
              <div className="space-y-2">
                {TAB_TYPES.map((t) => (
                  <label key={t.key} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={newTabKeys.has(t.key)}
                      onChange={() => toggleNewTabKey(t.key)}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-3 border-t pt-4">
              <button type="button" onClick={closeAddModal} className="h-9 px-4 rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </MasterDialog>
      )}

      {editingRow && (
        <MasterDialog
          title={`Edit Person -- ${TAB_TYPES.find((t) => t.key === editingRow.category)?.label}`}
          onClose={closeEditModal}
        >
          <form onSubmit={handleEditSave} className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="rp-edit-name" className="block text-sm font-medium text-foreground">Name</label>
              <input
                id="rp-edit-name"
                type="text"
                required
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This only renames this entry on {TAB_TYPES.find((t) => t.key === editingRow.category)?.label}. If this person also appears on other tabs, edit those rows separately.
            </p>
            <div className="flex justify-end gap-3 border-t pt-4">
              <button type="button" onClick={closeEditModal} className="h-9 px-4 rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent">
                Cancel
              </button>
              <button type="submit" className="h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                Save
              </button>
            </div>
          </form>
        </MasterDialog>
      )}
      {confirmDialog}
    </div>
  );
};

export default ReportPersons;
