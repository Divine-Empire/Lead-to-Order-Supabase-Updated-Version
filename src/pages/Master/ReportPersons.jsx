import React, { useState, useEffect } from "react";
import supabase from "../../utils/supabase";
import { PlusIcon, PencilIcon, TrashIcon } from "../../components/Icons";

// Reuses the existing `lto_dropdown` table (category/value pairs) rather
// than a dedicated table -- see the Report Persons master page notes.
// Each of the 3 report tabs gets its own category; a person who should show
// up on all three tabs gets one row per category (same value, different
// category), so a name can be added/removed per tab independently.
const TAB_TYPES = [
  { key: "report_person_calling", label: "Calling Data (Person)" },
  { key: "report_person_sc_pipeline", label: "SC Pipeline" },
  { key: "report_person_fos", label: "FOS Report" },
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
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTabKeys, setNewTabKeys] = useState(new Set(TAB_KEYS)); // default: all 3, per the common "same name everywhere" case
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
      alert("Error fetching data: " + (error.message || error));
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
      alert("Please enter a name.");
      return;
    }
    if (newTabKeys.size === 0) {
      alert("Select at least one tab to add this person to.");
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
        alert("This name already exists on every selected tab.");
        setIsSaving(false);
        return;
      }

      const { error } = await supabase.from("lto_dropdown").insert(toInsert);
      if (error) throw error;

      closeAddModal();
      fetchData();
    } catch (error) {
      console.error("Error adding report person:", error);
      alert("Error adding person: " + (error.message || error));
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
      alert("Please enter a name.");
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
      alert("Error updating person: " + (error.message || error));
    }
  };

  const handleDelete = async (row) => {
    const tabLabel = TAB_TYPES.find((t) => t.key === row.category)?.label || row.category;
    if (!window.confirm(`Remove "${row.value}" from ${tabLabel}?`)) return;
    try {
      const { data, error } = await supabase.from("lto_dropdown").delete().eq("id", row.id).select().maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This entry was already removed.");
      fetchData();
    } catch (error) {
      console.error("Error deleting report person:", error);
      alert("Error deleting person: " + (error.message || error));
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading report persons...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <div className="flex-none bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Report Persons</h1>
              <p className="mt-1 text-sm text-slate-500">
                Controls exactly who shows up as a row/column on the Reports page -- Calling Data, SC Pipeline, and FOS Report each only show the people added here.
              </p>
            </div>
            <button
              onClick={openAddModal}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary hover:opacity-90"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Person
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 max-w-[100vw]">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {TAB_TYPES.map((t) => (
                  <th key={t.key} className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider border-r border-slate-200 last:border-0 min-w-[220px]">
                    {t.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {Array.from({ length: maxRows }).map((_, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-slate-50/50 transition-colors">
                  {TAB_TYPES.map((t) => {
                    const item = rowsByCategory[t.key][rowIndex];
                    return (
                      <td key={t.key} className="px-6 py-4 text-sm text-slate-700 border-r border-slate-200 last:border-0 align-top">
                        {item ? (
                          <div className="flex items-center justify-between group">
                            <span>{item.value}</span>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                              <button onClick={() => openEditModal(item)} className="text-primary hover:text-primary p-1 rounded-full hover:bg-primary/5">
                                <PencilIcon className="h-4 w-4" />
                              </button>
                              <button onClick={() => handleDelete(item)} className="text-destructive hover:text-destructive p-1 rounded-full hover:bg-destructive/10">
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {maxRows === 0 && (
                <tr>
                  <td colSpan={TAB_TYPES.length} className="px-6 py-8 text-center text-sm text-slate-500">
                    No report persons yet -- click "Add Person" to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Add Person</h3>
              <button onClick={closeAddModal} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                  placeholder="e.g. PRANAV VINAYAKRAO BHOGAWAR"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Show on</label>
                <div className="space-y-2">
                  {TAB_TYPES.map((t) => (
                    <label key={t.key} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={newTabKeys.has(t.key)}
                        onChange={() => toggleNewTabKey(t.key)}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={closeAddModal} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-primary border border-transparent rounded-md shadow-sm hover:opacity-90 disabled:opacity-50">
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">
                Edit Person -- {TAB_TYPES.find((t) => t.key === editingRow.category)?.label}
              </h3>
              <button onClick={closeEditModal} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <form onSubmit={handleEditSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                />
              </div>
              <p className="text-xs text-slate-400">
                This only renames this entry on {TAB_TYPES.find((t) => t.key === editingRow.category)?.label}. If this person also appears on other tabs, edit those rows separately.
              </p>
              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={closeEditModal} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-primary border border-transparent rounded-md shadow-sm hover:opacity-90">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportPersons;
