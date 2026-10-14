import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../../App";
import useConfirmDialog from "../../components/useConfirmDialog";
import supabase from "../../utils/supabase";
import PaginationBar from "../../components/PaginationBar";
import MasterDialog from "../../components/MasterDialog";
import StatusTabs from "../../components/StatusTabs";
import { PlusIcon, PencilIcon, TrashIcon } from "../../components/Icons";

// References used to live mixed into this same table (rows with only
// reference_name/contact_num set, no state/address/gstin) -- that's what let
// a saved quotation's consignor_id resolve to a reference row instead of the
// real branch entity, silently breaking revision prefill of the consignor's
// own state/address/GSTIN. References now live in lto_dropdown
// (category="reference", one "Name — Number" string per row) instead, so
// this table only ever holds the real consignor/branch entities. The old
// reference rows are intentionally left in place here (not deleted) --
// consignor_id has ON DELETE SET NULL, and thousands of already-saved
// quotations still point at them; deleting would silently null out their
// consignor_id. They just aren't shown or added to from this screen anymore.

const Consignors = () => {
  const { showNotification = () => {} } = useContext(AuthContext) || {};
  const { askConfirm, confirmDialog } = useConfirmDialog();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [activeTab, setActiveTab] = useState("consignor"); // 'consignor' or 'references'

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [formData, setFormData] = useState({});

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalResults, setTotalResults] = useState(0);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentPage, itemsPerPage]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      if (activeTab === "consignor") {
        const { data: consignorData, error, count } = await supabase
          .from("lto_consignor_details")
          .select("*", { count: "exact" })
          .range(from, to);
        if (error) throw error;
        setData(consignorData || []);
        setTotalResults(count || 0);
      } else {
        const { data: dropdownData, error, count } = await supabase
          .from("lto_dropdown")
          .select("id, value", { count: "exact" })
          .eq("category", "reference")
          .order("value")
          .range(from, to);
        if (error) throw error;
        // Split each "Name — Number" value back into its two parts for
        // display. `uuid` is aliased to the dropdown row's `id` so the
        // existing render/edit/delete code (keyed on item.uuid) needs no
        // further changes below.
        const rows = (dropdownData || []).map((row) => {
          const [name, number] = (row.value || "").split("—").map((s) => s.trim());
          return { uuid: row.id, reference_name: name || "", contact_num: number || "" };
        });
        setData(rows);
        setTotalResults(count || 0);
      }
    } catch (error) {
      console.error("Error fetching consignors:", error);
      showNotification("Error fetching data", "error");
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  };

  const handleOpenModal = (editData = null) => {
    if (editData) {
      setIsEditing(true);
      setCurrentId(editData.uuid);
      if (activeTab === "consignor") {
        setFormData({
          state: editData.state || "",
          state_code: editData.state_code || "",
          address: editData.address || "",
          gstin: editData.gstin || "",
          msme_num: editData.msme_num || "",
          pan_num: editData.pan_num || "",
        });
      } else {
        setFormData({
          reference_name: editData.reference_name || "",
          contact_num: editData.contact_num || "",
        });
      }
    } else {
      setIsEditing(false);
      setCurrentId(null);
      if (activeTab === "consignor") {
        setFormData({
          state: "",
          state_code: "",
          address: "",
          gstin: "",
          msme_num: "",
          pan_num: "",
        });
      } else {
        setFormData({
          reference_name: "",
          contact_num: "",
        });
      }
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData({});
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isEditing && !currentId) {
      showNotification("Cannot save: this record has no id. Please refresh and try again.", "error");
      return;
    }
    try {
      if (activeTab === "consignor") {
        if (isEditing) {
          const { data: existing, error: checkError } = await supabase
            .from("lto_consignor_details")
            .select("uuid")
            .eq("uuid", currentId)
            .maybeSingle();
          if (checkError) throw checkError;
          if (!existing) {
            throw new Error("This record no longer exists in the database (it may have been deleted). Please refresh.");
          }

          const { data, error } = await supabase
            .from("lto_consignor_details")
            .update(formData)
            .eq("uuid", currentId)
            .select()
            .single();
          if (error) throw error;
          if (!data) throw new Error("Update did not affect any row.");
        } else {
          const { data, error } = await supabase
            .from("lto_consignor_details")
            .insert([formData])
            .select()
            .single();
          if (error) throw error;
          if (!data) throw new Error("Insert did not return the new row.");
        }
      } else {
        // References live in lto_dropdown (category="reference") -- pack
        // name+number into the single "value" column the same way
        // quotation-form.jsx reads them back out.
        const name = (formData.reference_name || "").trim();
        const number = (formData.contact_num || "").toString().trim();
        if (!name) throw new Error("Reference Name is required.");
        const value = `${name} — ${number}`;

        if (isEditing) {
          const { data, error } = await supabase
            .from("lto_dropdown")
            .update({ value })
            .eq("id", currentId)
            .select()
            .single();
          if (error) throw error;
          if (!data) throw new Error("Update did not affect any row.");
        } else {
          const { data, error } = await supabase
            .from("lto_dropdown")
            .insert([{ category: "reference", value }])
            .select()
            .single();
          if (error) throw error;
          if (!data) throw new Error("Insert did not return the new row.");
        }
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
      showNotification("Cannot delete: this record has no id.", "error");
      return;
    }
    askConfirm({ title: "Delete record?", message: "Are you sure you want to delete this record?", confirmText: "Delete" }, async () => {
      try {
        const table = activeTab === "consignor" ? "lto_consignor_details" : "lto_dropdown";
        const idColumn = activeTab === "consignor" ? "uuid" : "id";
        const { data, error } = await supabase.from(table).delete().eq(idColumn, id).select().maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("This record was already removed (no matching row found).");
        fetchData();
      } catch (error) {
        console.error("Error deleting data:", error);
        showNotification("Error deleting data: " + (error.message || error), "error");
      }
    });
  };

  const filteredData = data;
  const totalPages = Math.ceil(totalResults / itemsPerPage) || 1;

  if (loading && !hasLoadedOnce) {
    return <div className="p-8 text-center text-slate-500">Loading Consignor Details...</div>;
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Consignors Master</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Manage consignors and reference details</p>
          </div>
          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            {activeTab === "consignor" ? "Add Consignor" : "Add Reference"}
          </button>
        </div>
        <StatusTabs
          variant="underline"
          label="Consignor lists"
          activeTab={activeTab}
          onChange={(id) => { setActiveTab(id); setCurrentPage(1); }}
          tabs={[
            { id: "consignor", label: "Consignors" },
            { id: "references", label: "References" },
          ]}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full border-separate border-spacing-0" aria-label={activeTab === "consignor" ? "Consignors" : "References"}>
            <thead className="sticky top-0 z-10 bg-secondary">
              <tr>
                {activeTab === "consignor" ? (
                  <>
                    <th scope="col" className="border-b bg-secondary px-4 py-2.5 text-left text-xs font-semibold text-brand-800">State</th>
                    <th scope="col" className="border-b bg-secondary px-4 py-2.5 text-left text-xs font-semibold text-brand-800">State Code</th>
                    <th scope="col" className="border-b bg-secondary px-4 py-2.5 text-left text-xs font-semibold text-brand-800">Address</th>
                    <th scope="col" className="border-b bg-secondary px-4 py-2.5 text-left text-xs font-semibold text-brand-800">GSTIN</th>
                    <th scope="col" className="border-b bg-secondary px-4 py-2.5 text-left text-xs font-semibold text-brand-800">MSME No</th>
                    <th scope="col" className="border-b bg-secondary px-4 py-2.5 text-left text-xs font-semibold text-brand-800">PAN No</th>
                  </>
                ) : (
                  <>
                    <th scope="col" className="border-b bg-secondary px-4 py-2.5 text-left text-xs font-semibold text-brand-800">Reference Name</th>
                    <th scope="col" className="border-b bg-secondary px-4 py-2.5 text-left text-xs font-semibold text-brand-800">Contact Number</th>
                  </>
                )}
                <th scope="col" className="w-24 border-b bg-secondary px-4 py-2.5 text-right text-xs font-semibold text-brand-800">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y">
              {filteredData.map((item) => (
                <tr key={item.uuid} className="hover:bg-secondary/60 transition-colors">
                  {activeTab === "consignor" ? (
                    <>
                      <td className="px-4 py-3 text-sm text-foreground">{item.state || "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{item.state_code || "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate" title={item.address}>{item.address || "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{item.gstin || "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{item.msme_num || "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{item.pan_num || "—"}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{item.reference_name || "—"}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{item.contact_num || "—"}</td>
                    </>
                  )}
                  <td className="px-4 py-3 text-right text-sm font-medium">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => handleOpenModal(item)} aria-label={`Edit ${item.state || item.reference_name || "record"}`} className="flex h-8 w-8 items-center justify-center rounded-md transition-colors text-info hover:bg-accent">
                        <PencilIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => handleDelete(item.uuid)} aria-label={`Delete ${item.state || item.reference_name || "record"}`} className="flex h-8 w-8 items-center justify-center rounded-md transition-colors text-destructive hover:bg-destructive/10">
                        <TrashIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={activeTab === "consignor" ? 7 : 3} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          totalResults={totalResults}
          onPageChange={(p) => setCurrentPage(Math.min(Math.max(1, p), totalPages))}
          onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
        />
      </div>

      {isModalOpen && (
        <MasterDialog
          title={`${isEditing ? "Edit" : "Add"} ${activeTab === "consignor" ? "Consignor" : "Reference"}`}
          onClose={handleCloseModal}
          maxWidth="max-w-lg"
        >
            <form onSubmit={handleSave} className="p-4 space-y-4">
              {activeTab === "consignor" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor="consignor-field-1" className="mb-1 block text-sm font-medium text-foreground">State</label>
                    <input
                      id="consignor-field-1"
                      type="text"
                      required
                      value={formData.state || ""}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor="consignor-field-2" className="mb-1 block text-sm font-medium text-foreground">State Code</label>
                    <input
                      id="consignor-field-2"
                      type="text"
                      value={formData.state_code || ""}
                      onChange={(e) => setFormData({ ...formData, state_code: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="consignor-field-3" className="mb-1 block text-sm font-medium text-foreground">Address</label>
                    <textarea
                      id="consignor-field-3"
                      rows={2}
                      value={formData.address || ""}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor="consignor-field-4" className="mb-1 block text-sm font-medium text-foreground">GSTIN</label>
                    <input
                      id="consignor-field-4"
                      type="text"
                      value={formData.gstin || ""}
                      onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor="consignor-field-5" className="mb-1 block text-sm font-medium text-foreground">MSME No</label>
                    <input
                      id="consignor-field-5"
                      type="text"
                      value={formData.msme_num || ""}
                      onChange={(e) => setFormData({ ...formData, msme_num: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor="consignor-field-6" className="mb-1 block text-sm font-medium text-foreground">PAN No</label>
                    <input
                      id="consignor-field-6"
                      type="text"
                      value={formData.pan_num || ""}
                      onChange={(e) => setFormData({ ...formData, pan_num: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="consignor-field-7" className="mb-1 block text-sm font-medium text-foreground">Reference Name</label>
                    <input
                      id="consignor-field-7"
                      type="text"
                      required
                      value={formData.reference_name || ""}
                      onChange={(e) => setFormData({ ...formData, reference_name: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="consignor-field-8" className="mb-1 block text-sm font-medium text-foreground">Contact Number</label>
                    <input
                      id="consignor-field-8"
                      type="number"
                      value={formData.contact_num || ""}
                      onChange={(e) => setFormData({ ...formData, contact_num: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
              )}
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

export default Consignors;
