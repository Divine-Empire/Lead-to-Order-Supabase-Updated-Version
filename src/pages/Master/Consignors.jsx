import React, { useState, useEffect } from "react";
import supabase from "../../utils/supabase";
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
      alert("Error fetching data");
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
      alert("Cannot save: this record has no id. Please refresh and try again.");
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
      alert("Error saving data: " + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!id) {
      alert("Cannot delete: this record has no id.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    try {
      const table = activeTab === "consignor" ? "lto_consignor_details" : "lto_dropdown";
      const idColumn = activeTab === "consignor" ? "uuid" : "id";
      const { data, error } = await supabase.from(table).delete().eq(idColumn, id).select().maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This record was already removed (no matching row found).");
      fetchData();
    } catch (error) {
      console.error("Error deleting data:", error);
      alert("Error deleting data: " + (error.message || error));
    }
  };

  const filteredData = data;
  const totalPages = Math.ceil(totalResults / itemsPerPage) || 1;

  if (loading && !hasLoadedOnce) {
    return <div className="p-8 text-center text-slate-500">Loading Consignor Details...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <div className="flex-none bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Consignors Master</h1>
              <p className="mt-1 text-sm text-slate-500">Manage consignors and reference details</p>
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary hover:opacity-90"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              {activeTab === "consignor" ? "Add Consignor" : "Add Reference"}
            </button>
          </div>
          <div className="mt-4 flex space-x-4 border-b border-slate-200">
            <button
              className={`pb-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "consignor" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
              onClick={() => { setActiveTab("consignor"); setCurrentPage(1); }}
            >
              Consignors
            </button>
            <button
              className={`pb-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "references" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
              onClick={() => { setActiveTab("references"); setCurrentPage(1); }}
            >
              References
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto max-w-full">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {activeTab === "consignor" ? (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">State</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">State Code</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Address</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">GSTIN</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">MSME No</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">PAN No</th>
                  </>
                ) : (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Reference Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Contact Number</th>
                  </>
                )}
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredData.map((item) => (
                <tr key={item.uuid} className="hover:bg-slate-50 transition-colors">
                  {activeTab === "consignor" ? (
                    <>
                      <td className="px-6 py-4 text-sm text-slate-700">{item.state || "—"}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">{item.state_code || "—"}</td>
                      <td className="px-6 py-4 text-sm text-slate-700 max-w-xs truncate" title={item.address}>{item.address || "—"}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">{item.gstin || "—"}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">{item.msme_num || "—"}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">{item.pan_num || "—"}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4 text-sm text-slate-700 font-medium text-slate-900">{item.reference_name || "—"}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">{item.contact_num || "—"}</td>
                    </>
                  )}
                  <td className="px-6 py-4 text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button onClick={() => handleOpenModal(item)} className="text-primary hover:text-primary p-1.5 rounded-md hover:bg-primary/5 transition-colors">
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(item.uuid)} className="text-destructive hover:text-destructive p-1.5 rounded-md hover:bg-destructive/10 transition-colors">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={activeTab === "consignor" ? 7 : 3} className="px-6 py-8 text-center text-sm text-slate-500">
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pager */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 px-1">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Rows per page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="ml-2">{totalResults} total</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 border border-slate-300 rounded-md bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Prev
            </button>
            <span className="text-slate-600">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 border border-slate-300 rounded-md bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">
                {isEditing ? "Edit" : "Add"} {activeTab === "consignor" ? "Consignor" : "Reference"}
              </h3>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {activeTab === "consignor" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                    <input
                      type="text"
                      required
                      value={formData.state || ""}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">State Code</label>
                    <input
                      type="text"
                      value={formData.state_code || ""}
                      onChange={(e) => setFormData({ ...formData, state_code: e.target.value })}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                    <textarea
                      rows={2}
                      value={formData.address || ""}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">GSTIN</label>
                    <input
                      type="text"
                      value={formData.gstin || ""}
                      onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">MSME No</label>
                    <input
                      type="text"
                      value={formData.msme_num || ""}
                      onChange={(e) => setFormData({ ...formData, msme_num: e.target.value })}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">PAN No</label>
                    <input
                      type="text"
                      value={formData.pan_num || ""}
                      onChange={(e) => setFormData({ ...formData, pan_num: e.target.value })}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Reference Name</label>
                    <input
                      type="text"
                      required
                      value={formData.reference_name || ""}
                      onChange={(e) => setFormData({ ...formData, reference_name: e.target.value })}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Contact Number</label>
                    <input
                      type="number"
                      value={formData.contact_num || ""}
                      onChange={(e) => setFormData({ ...formData, contact_num: e.target.value })}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                    />
                  </div>
                </div>
              )}
              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={handleCloseModal} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50">
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

export default Consignors;
