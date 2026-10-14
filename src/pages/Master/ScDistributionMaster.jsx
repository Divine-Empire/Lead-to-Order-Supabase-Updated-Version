import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../../App";
import useConfirmDialog from "../../components/useConfirmDialog";
import { Plus, Pencil, Trash2, RefreshCw, Users, ShieldCheck, ArrowRight, CheckSquare, Square } from "lucide-react";
import supabase from "../../utils/supabase";
import PaginationBar from "../../components/PaginationBar";
import MasterDialog from "../../components/MasterDialog";
import { FilterSearch } from "../../components/FilterBar";

export default function ScDistributionMaster() {
  const { showNotification = () => {} } = useContext(AuthContext) || {};
  const { askConfirm, confirmDialog } = useConfirmDialog();
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
      showNotification("Please select or enter an SC Name.", "error");
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
      showNotification("Error saving SC distribution rule: " + err.message, "error");
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!id) {
      showNotification("Cannot delete: this rule has no id.", "error");
      return;
    }
    askConfirm({ title: "Delete rule?", message: "Are you sure you want to delete this SC distribution rule?", confirmText: "Delete" }, async () => {
      try {
        const { data, error } = await supabase.from("lto_sc_distribution").delete().eq("id", id).select().maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("This rule was already removed (no matching id found).");
        fetchData();
      } catch (err) {
        showNotification("Error deleting record: " + (err.message || err), "error");
      }
    });
  };

  const handleToggleNextInLine = async (row) => {
    if (!row?.id) {
      showNotification("Cannot update: this rule has no id.", "error");
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
      showNotification("Error updating Next in Line status: " + (err.message || err), "error");
    }
  };

  const filteredRows = data;
  const totalPages = Math.ceil(totalResults / itemsPerPage) || 1;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Users className="h-4 w-4 text-primary" aria-hidden="true" />
              SC Distribution Master
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Configure dynamic SC assignments based on multi-select checkboxes for Sales Type, Lead Source, and NOB.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                fetchData();
                fetchDropdownOptions();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Refresh SC rules"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleOpenModal("add")}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add SC Rule
            </button>
          </div>
        </div>

        {/* Search & Instructions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <FilterSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by SC name..."
            className="max-w-md"
          />
          <p className="flex max-w-xl items-start gap-1.5 rounded-md border border-primary/20 bg-accent px-3 py-2 text-xs font-medium text-brand-800">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>Rules are evaluated dynamically. Upon Order conversion (NBD &rarr; NBD_CRR), the system matches candidates with NBD_CRR and the company's NOB without hardcoded restrictions.</span>
          </p>
        </div>

        {/* Table */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left border-collapse" aria-label="SC distribution rules">
            <thead className="sticky top-0 z-10 bg-secondary">
              <tr className="bg-secondary border-b text-xs font-semibold text-brand-800">
                <th scope="col" className="py-2.5 px-4">Seq</th>
                <th scope="col" className="py-2.5 px-4">SC Name</th>
                <th scope="col" className="py-2.5 px-4">Sales Types</th>
                <th scope="col" className="py-2.5 px-4">Lead Sources</th>
                <th scope="col" className="py-2.5 px-4">NOB Rules</th>
                <th scope="col" className="py-2.5 px-4">Last Lead No.</th>
                <th scope="col" className="py-2.5 px-4 text-center">Next Turn</th>
                <th scope="col" className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {loading ? (
                <tr>
                  <td colSpan="8" className="text-center py-10 text-muted-foreground">
                    Loading SC distribution rules...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-muted-foreground">
                    No SC distribution rules configured. Click "Add SC Rule" to create your pool.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr key={row.id} className="hover:bg-secondary/60 transition-colors">
                    <td className="py-3 px-4 font-medium text-muted-foreground">
                      #{row.sequence_order || index + 1}
                    </td>
                    <td className="py-3 px-4 font-semibold text-foreground whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-accent text-brand-800 font-semibold flex items-center justify-center text-xs" aria-hidden="true">
                          {row.sc_name?.slice(0, 2)?.toUpperCase()}
                        </span>
                        {row.sc_name}
                      </div>
                    </td>
                    <td className="py-3 px-4 max-w-[200px]">
                      <div className="flex flex-wrap gap-1">
                        {(row.sales_types || []).map((t) => (
                          <span key={t} className="px-2 py-0.5 text-xs font-semibold bg-accent text-brand-800 border border-primary/20 rounded-md">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 max-w-[200px]">
                      <div className="flex flex-wrap gap-1">
                        {(row.lead_sources || []).map((s) => (
                          <span key={s} className="px-2 py-0.5 text-xs font-medium bg-secondary text-foreground border rounded-md">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 max-w-[240px]">
                      <div className="flex flex-wrap gap-1">
                        {(row.nobs || []).map((n) => {
                          const isSpecial = n.includes("EXCEPT") || n === "ALL NOBS";
                          return (
                            <span key={n} className={`px-2 py-0.5 text-xs font-semibold border rounded-md ${
                              isSpecial ? "bg-warning/15 text-foreground border-warning/40" : "bg-secondary text-foreground"
                            }`}>
                              {n}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium whitespace-nowrap">
                      {row.last_assigned_lead && row.last_assigned_lead !== "—" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent border border-primary/20 text-brand-800 text-xs font-semibold">
                          {row.last_assigned_lead}
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-normal">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        aria-pressed={!!row.is_next_in_line}
                        onClick={() => handleToggleNextInLine(row)}
                        className={`inline-flex h-7 items-center gap-1.5 px-3 rounded-full text-xs font-semibold transition-colors ${
                          row.is_next_in_line
                            ? "bg-accent text-brand-800 border border-primary/30"
                            : "bg-card text-muted-foreground border hover:bg-accent"
                        }`}
                        title="Click to toggle Next in Line turn for this rule"
                      >
                        {row.is_next_in_line ? (
                          <>
                            <ArrowRight className="w-3.5 h-3.5 text-primary" aria-hidden="true" /> Next Turn
                          </>
                        ) : (
                          "Set Next"
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenModal("edit", row)}
                          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors text-info hover:bg-accent"
                          aria-label={`Edit rule for ${row.sc_name}`}
                          title="Edit rule"
                        >
                          <Pencil className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors text-destructive hover:bg-destructive/10"
                          aria-label={`Delete rule for ${row.sc_name}`}
                          title="Delete rule"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <MasterDialog
          title={modalMode === "add" ? "Add SC Distribution Rule" : "Edit SC Distribution Rule"}
          onClose={handleCloseModal}
          maxWidth="max-w-3xl"
        >
            <form onSubmit={handleSubmit} className="p-4 space-y-5">
              {/* Top Details (SC Name, Sequence, Next in Line) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b items-end">
                <div className="md:col-span-1 space-y-1.5">
                  <label htmlFor="sc-field-1" className="block text-sm font-medium text-foreground">
                    SC Name <span className="text-destructive">*</span>
                  </label>
                  <select
                    id="sc-field-1"
                    value={formData.sc_name}
                    onChange={(e) => setFormData({ ...formData, sc_name: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
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
                  <label htmlFor="sc-field-2" className="block text-sm font-medium text-foreground">
                    Sequence Order
                  </label>
                  <input
                    id="sc-field-2"
                    type="number"
                    min="1"
                    value={formData.sequence_order}
                    onChange={(e) => setFormData({ ...formData, sequence_order: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="pb-1.5">
                  <label className="flex items-center gap-2.5 p-2 rounded-lg bg-accent border border-primary/20 cursor-pointer hover:bg-accent/80 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.is_next_in_line}
                      onChange={(e) => setFormData({ ...formData, is_next_in_line: e.target.checked })}
                      className="w-4 h-4 rounded accent-primary"
                    />
                    <span className="text-sm font-semibold text-brand-800">Next Turn in Round-Robin</span>
                  </label>
                </div>
              </div>

              {/* Checkbox Section: Sales Types */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-foreground">
                    1. Sales Types Checkboxes (NBD / NBD_CRR / CRR)
                  </p>
                  <span className="text-xs text-muted-foreground">Select all sales types this SC handles</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-secondary/50 p-3 rounded-lg border">
                  {salesTypeOptions.map((opt) => {
                    const checked = (formData.sales_types || []).includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => handleCheckboxToggle("sales_types", opt)}
                        className={`w-full text-left flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs font-bold transition-all ${
                          checked
                            ? "bg-card text-foreground border-primary/40 font-semibold"
                            : "bg-transparent text-muted-foreground border-transparent hover:bg-card"
                        }`}
                      >
                        {checked ? <CheckSquare className="w-4 h-4 text-primary shrink-0" aria-hidden="true" /> : <Square className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />}
                        <span className="truncate">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Checkbox Section: NOB */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-foreground">
                    2. NOB Rules Checkboxes
                  </p>
                  <span className="text-xs text-muted-foreground">Use shortcut option to cover non-Reseller leads</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-secondary/50 p-3 rounded-lg border max-h-48 overflow-y-auto">
                  {nobOptions.map((opt) => {
                    const checked = (formData.nobs || []).includes(opt);
                    const isShortcut = opt.includes("EXCEPT") || opt === "ALL NOBS";
                    return (
                      <button
                        key={opt}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => handleCheckboxToggle("nobs", opt)}
                        className={`w-full text-left flex items-center gap-2 p-2.5 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                          checked
                            ? isShortcut ? "bg-warning/15 text-foreground border-warning/40 font-semibold" : "bg-card text-foreground border-primary/40 font-semibold"
                            : "bg-transparent text-muted-foreground border-transparent hover:bg-card"
                        }`}
                      >
                        {checked ? <CheckSquare className="w-4 h-4 text-primary shrink-0" aria-hidden="true" /> : <Square className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />}
                        <span className={isShortcut ? "font-bold text-warning-foreground" : ""}>{opt}</span>
                      </button>
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
                  <span className="text-xs text-muted-foreground">Select sources or check "ALL SOURCES"</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-secondary/50 p-3 rounded-lg border max-h-40 overflow-y-auto">
                  {sourceOptions.map((opt) => {
                    const checked = (formData.lead_sources || []).includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => handleCheckboxToggle("lead_sources", opt)}
                        className={`w-full text-left flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs font-medium transition-all ${
                          checked
                            ? "bg-card text-foreground border-primary/40 font-semibold"
                            : "bg-transparent text-muted-foreground border-transparent hover:bg-card"
                        }`}
                      >
                        {checked ? <CheckSquare className="w-4 h-4 text-primary shrink-0" aria-hidden="true" /> : <Square className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />}
                        <span className="truncate">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t shrink-0">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="h-9 px-4 rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={formData.sales_types.length === 0 || formData.nobs.length === 0}
                >
                  {modalMode === "add" ? "Save SC Rule" : "Update SC Rule"}
                </button>
              </div>
            </form>
        </MasterDialog>
      )}
      {confirmDialog}
    </div>
  );
}
