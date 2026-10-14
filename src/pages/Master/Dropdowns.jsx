import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../../App";
import useConfirmDialog from "../../components/useConfirmDialog";
import supabase from "../../utils/supabase";
import { PlusIcon, PencilIcon, TrashIcon } from "../../components/Icons";
import MasterDialog from "../../components/MasterDialog";

const Dropdowns = () => {
  const { showNotification = () => {} } = useContext(AuthContext) || {};
  const { askConfirm, confirmDialog } = useConfirmDialog();
  const [data, setData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [formData, setFormData] = useState({ category: "", value: "" });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Chunked to avoid PostgREST's silent 1000-row cap on unpaginated selects.
      let dropdownData = [];
      let from = 0;
      const step = 1000;
      let fetchMore = true;

      while (fetchMore) {
        const { data, error } = await supabase
          .from("lto_dropdown")
          .select("*")
          .order("created_at", { ascending: true })
          .range(from, from + step - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          dropdownData = dropdownData.concat(data);
          from += step;
          if (data.length < step) fetchMore = false;
        } else {
          fetchMore = false;
        }
      }

      setData(dropdownData);
      const uniqueCategories = [...new Set((dropdownData || []).map((item) => item.category))];
      setCategories(uniqueCategories);
    } catch (error) {
      console.error("Error fetching dropdowns:", error);
      showNotification("Error fetching data", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (editData = null) => {
    if (editData) {
      setIsEditing(true);
      setCurrentId(editData.id);
      setFormData({ category: editData.category, value: editData.value });
    } else {
      setIsEditing(false);
      setCurrentId(null);
      setFormData({ category: categories[0] || "", value: "" });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData({ category: "", value: "" });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (!formData.category || !formData.value) {
        showNotification("Please provide both Category and Value.", "error");
        return;
      }
      if (isEditing && !currentId) {
        showNotification("Cannot save: this value has no id. Please refresh and try again.", "error");
        return;
      }

      if (isEditing) {
        const { data: existing, error: checkError } = await supabase
          .from("lto_dropdown")
          .select("id")
          .eq("id", currentId)
          .maybeSingle();
        if (checkError) throw checkError;
        if (!existing) {
          throw new Error("This value no longer exists in the database (it may have been deleted). Please refresh.");
        }

        const { data, error } = await supabase
          .from("lto_dropdown")
          .update({ value: formData.value })
          .eq("id", currentId)
          .select()
          .single();
        if (error) throw error;
        if (!data) throw new Error("Update did not affect any row.");
      } else {
        const { data, error } = await supabase
          .from("lto_dropdown")
          .insert([{ category: formData.category, value: formData.value }])
          .select()
          .single();
        if (error) throw error;
        if (!data) throw new Error("Insert did not return the new row.");
      }

      handleCloseModal();
      fetchData();
    } catch (error) {
      console.error("Error saving data:", error);
      showNotification("Error saving data: " + error.message, "error");
    }
  };

  const handleDelete = async (id) => {
    if (!id) {
      showNotification("Cannot delete: this value has no id.", "error");
      return;
    }
    askConfirm({ title: "Delete value?", message: "Are you sure you want to delete this value?", confirmText: "Delete" }, async () => {
      try {
        const { data, error } = await supabase.from("lto_dropdown").delete().eq("id", id).select().maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("This value was already removed (no matching id found).");
        fetchData();
      } catch (error) {
        console.error("Error deleting data:", error);
        showNotification("Error deleting data: " + (error.message || error), "error");
      }
    });
  };

  const groupedData = categories.reduce((acc, cat) => {
    acc[cat] = data.filter((item) => item.category === cat);
    return acc;
  }, {});

  const maxRows = Math.max(0, ...categories.map((cat) => groupedData[cat].length));

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground" role="status">
        Loading dropdowns...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Dropdown Master</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Manage values for various dropdown categories</p>
        </div>
        <button
          type="button"
          onClick={() => handleOpenModal()}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          Add Value
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="min-w-full border-separate border-spacing-0" aria-label="Dropdown values by category">
          <thead className="sticky top-0 z-10 bg-secondary">
            <tr>
              {categories.map((cat, idx) => (
                <th
                  key={idx}
                  scope="col"
                  className="min-w-[200px] border-b border-r bg-secondary px-4 py-2.5 text-left text-xs font-semibold capitalize text-brand-800 last:border-r-0"
                >
                  {cat.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-card">
            {Array.from({ length: maxRows }).map((_, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-secondary/60 transition-colors">
                {categories.map((cat, colIndex) => {
                  const item = groupedData[cat][rowIndex];
                  return (
                    <td key={colIndex} className="border-b border-r px-4 py-2 align-top text-sm text-foreground last:border-r-0">
                      {item ? (
                        <div className="group flex items-center justify-between gap-2">
                          <span>{item.value}</span>
                          <div className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => handleOpenModal(item)}
                              aria-label={`Edit ${item.value}`}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-info transition-colors hover:bg-accent"
                            >
                              <PencilIcon className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
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
                <td colSpan={categories.length || 1} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  No data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <MasterDialog title={isEditing ? "Edit Value" : "Add New Value"} onClose={handleCloseModal}>
          <form onSubmit={handleSave} className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="dropdown-category" className="block text-sm font-medium text-foreground">Category</label>
              <select
                id="dropdown-category"
                required
                disabled={isEditing}
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none disabled:bg-secondary disabled:text-muted-foreground"
              >
                <option value="" disabled>Select a category</option>
                {categories.map((cat, idx) => (
                  <option key={idx} value={cat}>{cat.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dropdown-value" className="block text-sm font-medium text-foreground">Value</label>
              <input
                id="dropdown-value"
                type="text"
                required
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                placeholder="Enter dropdown value"
              />
            </div>
            <div className="flex justify-end gap-3 border-t pt-4">
              <button type="button" onClick={handleCloseModal} className="h-9 px-4 rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent">
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

export default Dropdowns;
