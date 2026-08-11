import React, { useState, useEffect } from "react";
import { Search, Plus, Pencil, Trash2, RefreshCw, Users, ShieldCheck, ArrowRight, CheckSquare, Square } from "lucide-react";
import supabase from "../../utils/supabase";

export default function ScDistributionMaster() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Dropdown options from database & defaults
  const [scOptions, setScOptions] = useState([]);
  const [salesTypeOptions, setSalesTypeOptions] = useState([]);
  const [sourceOptions, setSourceOptions] = useState([]);
  const [nobOptions, setNobOptions] = useState([]);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add"); // 'add' | 'edit'
  const [currentItem, setCurrentItem] = useState(null);
  const [formData, setFormData] = useState({
    sc_name: "",
    is_next_in_line: false,
    sequence_order: 1,
    sales_types: ["NBD"],
    lead_sources: ["ALL SOURCES"],
    nobs: ["ALL NOBS (EXCEPT RESELLER)"],
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalResults, setTotalResults] = useState(0);

  // Debounce search input so we don't fire a query per keystroke
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    fetchData();
    fetchDropdownOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage, debouncedSearch]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase.from("lto_sc_distribution").select("*", { count: "exact" });
      // Note: search is scoped to sc_name only (server-side) -- the old
      // client-side search also matched inside the sales_types/nobs arrays,
      // but partial-text search across array columns doesn't map cleanly to
      // a single PostgREST filter, so that part of the match was dropped.
      if (debouncedSearch) {
        query = query.ilike("sc_name", `%${debouncedSearch}%`);
      }
      query = query
        .order("sequence_order", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, to);

      const { data: records, error, count } = await query;

      if (error) {
        console.error("Error fetching SC distribution rules:", error);
        setData([]);
      } else {
        setTotalResults(count || 0);
        const res = records || [];
        if (res.length > 0) {
          const scNamesList = [...new Set(res.map((r) => r.sc_name).filter(Boolean))];
          const lastLeadMap = {};
          if (scNamesList.length > 0) {
            try {
              const { data: leadsBySc } = await supabase
                .from("lto_leads")
                .select("lead_no, sc_name, created_at")
                .in("sc_name", scNamesList)
                .order("created_at", { ascending: false });

              for (const lead of (leadsBySc || [])) {
                if (lead.sc_name && !lastLeadMap[lead.sc_name] && lead.lead_no) {
                  lastLeadMap[lead.sc_name] = lead.lead_no;
                }
              }
            } catch (err) {
              console.error("Error fetching last assigned lead numbers:", err);
            }
          }
          const rowsWithLastLead = res.map((row) => ({
            ...row,
            last_assigned_lead: lastLeadMap[row.sc_name] || "—",
            sales_types: Array.isArray(row.sales_types) ? row.sales_types : [],
            lead_sources: Array.isArray(row.lead_sources) ? row.lead_sources : [],
            nobs: Array.isArray(row.nobs) ? row.nobs : [],
          }));
          setData(rowsWithLastLead);
        } else {
          setData([]);
        }
      }
    } catch (err) {
      console.error("Exception fetching sc_distribution:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdownOptions = async () => {
    const fetchCat = (category) =>
      supabase.from("lto_dropdown").select("value").eq("category", category);

    try {
      const [
        { data: scs },
        { data: stypes },
        { data: lsources },
        { data: nobsList },
      ] = await Promise.all([
        fetchCat("sc_name"),
        fetchCat("sales_type"),
        fetchCat("lead_source"),
        fetchCat("nob"),
      ]);

      const clean = (arr) =>
        [...new Set((arr || []).map((r) => r.value).filter((v) => v && v.trim() !== ""))].sort();

      setScOptions(clean(scs));

      // Always ensure NBD, NBD_CRR, and CRR exist per specification
      const combinedTypes = [...new Set(["NBD", "NBD_CRR", "CRR", ...clean(stypes)])].sort();
      setSalesTypeOptions(combinedTypes);

      const combinedSources = ["ALL SOURCES", ...clean(lsources)];
      setSourceOptions(combinedSources);

      const combinedNobs = [
        "ALL NOBS (EXCEPT RESELLER)",
        "ALL NOBS",
        ...clean(nobsList).filter((n) => n.toUpperCase() !== "ALL NOBS (EXCEPT RESELLER)" && n.toUpperCase() !== "ALL NOBS")
      ];
      setNobOptions(combinedNobs);
    } catch (err) {
      console.error("Error fetching dropdown options:", err);
    }
  };

  const handleOpenModal = (mode, item = null) => {
    setModalMode(mode);
    setCurrentItem(item);
    if (item && mode === "edit") {
      setFormData({
        sc_name: item.sc_name || "",
        is_next_in_line: item.is_next_in_line ?? false,
        sequence_order: item.sequence_order || 1,
        sales_types: Array.isArray(item.sales_types) ? [...item.sales_types] : [],
        lead_sources: Array.isArray(item.lead_sources) ? [...item.lead_sources] : [],
        nobs: Array.isArray(item.nobs) ? [...item.nobs] : [],
      });
    } else {
      const nextSeq = totalResults + 1;
      setFormData({
        sc_name: scOptions[0] || "",
        is_next_in_line: totalResults === 0,
        sequence_order: nextSeq,
        sales_types: ["NBD"],
        lead_sources: ["ALL SOURCES"],
        nobs: ["ALL NOBS (EXCEPT RESELLER)"],
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentItem(null);
  };

  const handleCheckboxToggle = (field, option) => {
    setFormData((prev) => {
      const currentList = prev[field] || [];
      const exists = currentList.includes(option);
      let nextList = exists ? currentList.filter((item) => item !== option) : [...currentList, option];

      // Handle mutually exclusive or overriding shortcuts
      if (field === "nobs") {
        if (option === "ALL NOBS" && !exists) {
          nextList = ["ALL NOBS"];
        } else if (option === "ALL NOBS (EXCEPT RESELLER)" && !exists) {
          nextList = ["ALL NOBS (EXCEPT RESELLER)"];
        } else if (!exists && (option !== "ALL NOBS" && option !== "ALL NOBS (EXCEPT RESELLER)")) {
          nextList = nextList.filter((x) => x !== "ALL NOBS" && x !== "ALL NOBS (EXCEPT RESELLER)");
        }
      }
      if (field === "lead_sources") {
        if (option === "ALL SOURCES" && !exists) {
          nextList = ["ALL SOURCES"];
        } else if (!exists && option !== "ALL SOURCES") {
          nextList = nextList.filter((x) => x !== "ALL SOURCES");
        }
      }

      return { ...prev, [field]: nextList };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.sc_name.trim()) {
      alert("Please select or enter an SC Name.");
      return;
    }

    try {
      const payload = {
        sc_name: formData.sc_name.trim(),
        is_next_in_line: formData.is_next_in_line,
        sequence_order: Number(formData.sequence_order) || 1,
        sales_types: formData.sales_types,
        lead_sources: formData.lead_sources,
        nobs: formData.nobs,
        updated_at: new Date().toISOString()
      };

      if (modalMode === "add") {
        const { data, error } = await supabase.from("lto_sc_distribution").insert([{
          ...payload,
          created_at: new Date().toISOString()
        }]).select().single();
        if (error) throw error;
        if (!data) throw new Error("Insert did not return the new row.");
      } else {
        if (!currentItem?.id) {
          throw new Error("Cannot save: this rule has no id. Please refresh and try again.");
        }
        const { data: existing, error: checkError } = await supabase
          .from("lto_sc_distribution")
          .select("id")
          .eq("id", currentItem.id)
          .maybeSingle();
        if (checkError) throw checkError;
        if (!existing) {
          throw new Error("This rule no longer exists in the database (it may have been deleted). Please refresh.");
        }

        const { data, error } = await supabase
          .from("lto_sc_distribution")
          .update(payload)
          .eq("id", currentItem.id)
          .select()
          .single();
        if (error) throw error;
        if (!data) throw new Error("Update did not affect any row.");
      }

      handleCloseModal();
      fetchData();
    } catch (err) {
      alert("Error saving SC distribution rule: " + err.message);
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!id) {
      alert("Cannot delete: this rule has no id.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this SC distribution rule?")) return;
    try {
      const { data, error } = await supabase.from("lto_sc_distribution").delete().eq("id", id).select().maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This rule was already removed (no matching id found).");
      fetchData();
    } catch (err) {
      alert("Error deleting record: " + (err.message || err));
    }
  };

  const handleToggleNextInLine = async (row) => {
    if (!row?.id) {
      alert("Cannot update: this rule has no id.");
      return;
    }
    try {
      const newVal = !row.is_next_in_line;
      const { data, error } = await supabase
        .from("lto_sc_distribution")
        .update({ is_next_in_line: newVal, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This rule no longer exists (no matching id found).");
      fetchData();
    } catch (err) {
      alert("Error updating Next in Line status: " + (err.message || err));
    }
  };

  const filteredRows = data;
  const totalPages = Math.ceil(totalResults / itemsPerPage) || 1;

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Users className="w-7 h-7 text-primary" />
              SC Distribution Master
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Configure dynamic SC assignments based on multi-select checkboxes for Sales Type, Lead Source, and NOB.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                fetchData();
                fetchDropdownOptions();
              }}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition duration-150"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin text-primary" : ""}`} />
            </button>
            <button
              onClick={() => handleOpenModal("add")}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:opacity-90 text-white font-medium rounded-lg shadow-sm transition duration-150"
            >
              <Plus className="w-5 h-5" />
              Add SC Rule
            </button>
          </div>
        </div>

        {/* Search & Instructions */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by SC name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
          <div className="text-xs text-gray-600 max-w-xl">
            <span className="flex items-center gap-1.5 font-medium text-primary bg-primary/5 px-3 py-2 rounded-lg border border-primary/20">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
              Rules are evaluated dynamically. Upon Order conversion (NBD &rarr; NBD_CRR), the system matches candidates with NBD_CRR and the company's NOB without hardcoded restrictions.
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <th className="py-3.5 px-4">Seq</th>
                <th className="py-3.5 px-6">SC Name</th>
                <th className="py-3.5 px-5">Sales Types</th>
                <th className="py-3.5 px-5">Lead Sources</th>
                <th className="py-3.5 px-5">NOB Rules</th>
                <th className="py-3.5 px-5">Last Lead No.</th>
                <th className="py-3.5 px-5 text-center">Next Turn</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="8" className="text-center py-10 text-gray-400">
                    Loading SC distribution rules...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-gray-500">
                    No SC distribution rules configured. Click "Add SC Rule" to create your pool.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr key={row.id} className="hover:bg-gray-50/70 transition duration-150">
                    <td className="py-4 px-4 font-medium text-gray-500">
                      #{row.sequence_order || index + 1}
                    </td>
                    <td className="py-4 px-6 font-bold text-gray-900 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                          {row.sc_name?.slice(0, 2)?.toUpperCase()}
                        </span>
                        {row.sc_name}
                      </div>
                    </td>
                    <td className="py-4 px-5 max-w-[200px]">
                      <div className="flex flex-wrap gap-1">
                        {(row.sales_types || []).map((t) => (
                          <span key={t} className="px-2 py-0.5 text-xs font-bold bg-primary/5 text-primary border border-primary/20 rounded-md">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-5 max-w-[200px]">
                      <div className="flex flex-wrap gap-1">
                        {(row.lead_sources || []).map((s) => (
                          <span key={s} className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-md">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-5 max-w-[240px]">
                      <div className="flex flex-wrap gap-1">
                        {(row.nobs || []).map((n) => {
                          const isSpecial = n.includes("EXCEPT") || n === "ALL NOBS";
                          return (
                            <span key={n} className={`px-2 py-0.5 text-xs font-bold border rounded-md ${
                              isSpecial ? "bg-warning/5 text-warning-foreground border-warning/30" : "bg-success/5 text-success border-success/20"
                            }`}>
                              {n}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-4 px-5 font-medium whitespace-nowrap">
                      {row.last_assigned_lead && row.last_assigned_lead !== "—" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/5 border border-primary/20 text-primary text-xs font-semibold shadow-sm">
                          {row.last_assigned_lead}
                        </span>
                      ) : (
                        <span className="text-gray-400 font-normal">—</span>
                      )}
                    </td>
                    <td className="py-4 px-5 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleToggleNextInLine(row)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                          row.is_next_in_line
                            ? "bg-primary/10 text-primary border border-primary/30 shadow-sm"
                            : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                        }`}
                        title="Click to toggle Next in Line turn for this rule"
                      >
                        {row.is_next_in_line ? (
                          <>
                            <ArrowRight className="w-3.5 h-3.5 text-primary animate-pulse" /> Next Turn
                          </>
                        ) : (
                          "Set Next"
                        )}
                      </button>
                    </td>
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal("edit", row)}
                          className="p-1.5 text-gray-500 hover:text-primary hover:bg-primary/5 rounded-lg transition duration-150"
                          title="Edit rule"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="p-1.5 text-gray-500 hover:text-destructive hover:bg-destructive/10 rounded-lg transition duration-150"
                          title="Delete rule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pager */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Rows per page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
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
              className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Prev
            </button>
            <span className="text-gray-600">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                {modalMode === "add" ? "Add SC Distribution Rule" : "Edit SC Distribution Rule"}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 font-bold text-xl"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Top Details (SC Name, Sequence, Next in Line) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-gray-100 items-end">
                <div className="md:col-span-1 space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    SC Name <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={formData.sc_name}
                    onChange={(e) => setFormData({ ...formData, sc_name: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-sm font-semibold text-gray-900"
                    required
                  >
                    <option value="" disabled>Select SC Representative...</option>
                    {scOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Sequence Order
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.sequence_order}
                    onChange={(e) => setFormData({ ...formData, sequence_order: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>

                <div className="pb-1.5">
                  <label className="flex items-center gap-2.5 p-2 rounded-lg bg-primary/75 border border-primary/20 cursor-pointer hover:bg-primary/60 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.is_next_in_line}
                      onChange={(e) => setFormData({ ...formData, is_next_in_line: e.target.checked })}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <span className="text-sm font-bold text-primary">Next Turn in Round-Robin</span>
                  </label>
                </div>
              </div>

              {/* Checkbox Section: Sales Types */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-primary uppercase tracking-wider">
                    1. Sales Types Checkboxes (NBD / NBD_CRR / CRR)
                  </label>
                  <span className="text-xs text-gray-400">Select all sales types this SC handles</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-primary/50 p-3 rounded-xl border border-primary/20">
                  {salesTypeOptions.map((opt) => {
                    const checked = (formData.sales_types || []).includes(opt);
                    return (
                      <label
                        key={opt}
                        onClick={() => handleCheckboxToggle("sales_types", opt)}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs font-bold transition-all ${
                          checked
                            ? "bg-white text-primary border-primary/30 shadow-sm"
                            : "bg-transparent text-gray-600 border-transparent hover:bg-white/50"
                        }`}
                      >
                        {checked ? <CheckSquare className="w-4 h-4 text-primary shrink-0" /> : <Square className="w-4 h-4 text-gray-300 shrink-0" />}
                        <span className="truncate">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Checkbox Section: NOB */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-warning-foreground uppercase tracking-wider">
                    2. NOB Rules Checkboxes
                  </label>
                  <span className="text-xs text-gray-400">Use shortcut option to cover non-Reseller leads</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-warning/50 p-3 rounded-xl border border-warning/30 max-h-48 overflow-y-auto">
                  {nobOptions.map((opt) => {
                    const checked = (formData.nobs || []).includes(opt);
                    const isShortcut = opt.includes("EXCEPT") || opt === "ALL NOBS";
                    return (
                      <label
                        key={opt}
                        onClick={() => handleCheckboxToggle("nobs", opt)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                          checked
                            ? isShortcut ? "bg-warning/15 text-warning-foreground border-warning/40 shadow-sm" : "bg-white text-gray-900 border-warning/30 shadow-sm"
                            : "bg-transparent text-gray-600 border-transparent hover:bg-white/60"
                        }`}
                      >
                        {checked ? <CheckSquare className="w-4 h-4 text-warning-foreground shrink-0" /> : <Square className="w-4 h-4 text-gray-300 shrink-0" />}
                        <span className={isShortcut ? "font-bold text-warning-foreground" : ""}>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Checkbox Section: Lead Sources */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    3. Lead Sources Checkboxes
                  </label>
                  <span className="text-xs text-gray-400">Select sources or check "ALL SOURCES"</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200 max-h-40 overflow-y-auto">
                  {sourceOptions.map((opt) => {
                    const checked = (formData.lead_sources || []).includes(opt);
                    return (
                      <label
                        key={opt}
                        onClick={() => handleCheckboxToggle("lead_sources", opt)}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs font-medium transition-all ${
                          checked
                            ? "bg-white text-gray-900 border-gray-300 shadow-sm font-bold"
                            : "bg-transparent text-gray-500 border-transparent hover:bg-white/50"
                        }`}
                      >
                        {checked ? <CheckSquare className="w-4 h-4 text-gray-800 shrink-0" /> : <Square className="w-4 h-4 text-gray-300 shrink-0" />}
                        <span className="truncate">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 shrink-0">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition duration-150"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-primary hover:opacity-90 rounded-lg shadow-sm transition duration-150"
                  disabled={formData.sales_types.length === 0 || formData.nobs.length === 0}
                >
                  {modalMode === "add" ? "Save SC Rule" : "Update SC Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
