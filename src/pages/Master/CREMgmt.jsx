import React, { useState, useEffect } from "react";
import { Search, Plus, Pencil, Trash2, RefreshCw, UserCheck, ShieldCheck, Layers, MapPin, CheckSquare, Square, Users, Repeat } from "lucide-react";
import supabase from "../../utils/supabase";

export default function CREMgmt() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL"); // 'ALL' | 'Group' | 'StateNOB'

  // Dropdown option sources from database
  const [groupOptions, setGroupOptions] = useState([]);
  const [stateOptions, setStateOptions] = useState([]);
  const [nobOptions, setNobOptions] = useState([]);
  const [crmOptions, setCrmOptions] = useState([]);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add"); // 'add' | 'edit'
  const [currentItem, setCurrentItem] = useState(null);
  const [formData, setFormData] = useState({
    category: "Group", // "Group" | "StateNOB"
    selectedCrms: [],
    selectedKeys: [], // For Group: group names. For StateNOB: state names
    selectedNobKeys: [], // For StateNOB: multiple NOB names
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalResults, setTotalResults] = useState(0);
  const [tabCounts, setTabCounts] = useState({ ALL: 0, Group: 0, StateNOB: 0 });

  useEffect(() => {
    fetchData();
    fetchOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage, activeFilter]);

  const fetchTabCounts = async () => {
    try {
      const [allRes, groupRes, stateNobRes] = await Promise.all([
        supabase.from("lto_crm_distribution").select("uuid", { count: "exact", head: true }),
        supabase.from("lto_crm_distribution").select("uuid", { count: "exact", head: true }).ilike("tier", "Group"),
        supabase.from("lto_crm_distribution").select("uuid", { count: "exact", head: true }).not("tier", "ilike", "Group"),
      ]);
      setTabCounts({ ALL: allRes.count || 0, Group: groupRes.count || 0, StateNOB: stateNobRes.count || 0 });
    } catch (err) {
      console.error("Error fetching CRM tab counts:", err);
    }
  };

  useEffect(() => {
    fetchTabCounts();
  }, [data]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase.from("lto_crm_distribution").select("*", { count: "exact" });
      if (activeFilter === "Group") {
        query = query.ilike("tier", "Group");
      } else if (activeFilter === "StateNOB") {
        query = query.not("tier", "ilike", "Group");
      }
      query = query
        .order("tier", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, to);

      const { data: records, error, count } = await query;

      if (error) {
        console.error("Error fetching CRM distribution rules:", error);
        setData([]);
      } else {
        setData(records || []);
        setTotalResults(count || 0);
      }
    } catch (err) {
      console.error("Exception fetching crm_distribution:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      // 1. Fetch group names from client_master
      const { data: clients, error: clientErr } = await supabase
        .from("lto_client_master")
        .select("company_group_name");

      if (!clientErr && clients) {
        const uniqueGroups = [...new Set(
          clients.map((c) => c.company_group_name).filter((g) => g && g.trim() !== "")
        )].sort();
        setGroupOptions(uniqueGroups);
      }

      // 2. Fetch state, nob, and crm_name from dropdown table
      const fetchDropdownCat = (category) =>
        supabase.from("lto_dropdown").select("value").eq("category", category);

      const [
        { data: states },
        { data: nobs },
        { data: crms }
      ] = await Promise.all([
        fetchDropdownCat("state"),
        fetchDropdownCat("nob"),
        fetchDropdownCat("crm_name")
      ]);

      const cleanOptions = (arr) =>
        [...new Set((arr || []).map((r) => r.value).filter((v) => v && v.trim() !== ""))].sort();

      setStateOptions(cleanOptions(states));
      setNobOptions(cleanOptions(nobs));
      setCrmOptions(cleanOptions(crms));
    } catch (err) {
      console.error("Error fetching dynamic options for CRM Management:", err);
    }
  };

  const handleOpenModal = (mode, item = null) => {
    setModalMode(mode);
    setCurrentItem(item);
    if (item && mode === "edit") {
      const isGroup = (item.tier || "").toUpperCase() === "GROUP";
      const crmArray = Array.isArray(item.crm_names) ? item.crm_names : [];
      const groupArray = Array.isArray(item.group_name) ? item.group_name : [];
      const stateArray = Array.isArray(item.state_keys) ? item.state_keys : [];
      const nobArray = Array.isArray(item.nob_keys) ? item.nob_keys : [];

      setFormData({
        category: isGroup ? "Group" : "StateNOB",
        selectedCrms: crmArray,
        selectedKeys: isGroup ? groupArray : (stateArray.length > 0 ? stateArray : ["Any"]),
        selectedNobKeys: isGroup ? [] : (nobArray.length > 0 ? nobArray : ["Any"]),
      });
    } else {
      setFormData({
        category: "Group",
        selectedCrms: crmOptions.length > 0 ? [crmOptions[0]] : [],
        selectedKeys: [],
        selectedNobKeys: [],
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentItem(null);
  };

  const handleCategoryChange = (newCat) => {
    setFormData((prev) => ({
      ...prev,
      category: newCat,
      selectedKeys: [],
      selectedNobKeys: [],
    }));
  };

  const handleCrmToggle = (crm) => {
    setFormData((prev) => {
      const current = prev.selectedCrms || [];
      const exists = current.includes(crm);
      const next = exists ? current.filter((c) => c !== crm) : [...current, crm];
      return { ...prev, selectedCrms: next };
    });
  };

  const handleKeyToggle = (keyVal) => {
    setFormData((prev) => {
      const current = prev.selectedKeys || [];
      const exists = current.includes(keyVal);
      const next = exists ? current.filter((k) => k !== keyVal) : [...current, keyVal];
      return { ...prev, selectedKeys: next };
    });
  };

  const handleNobKeyToggle = (nobVal) => {
    setFormData((prev) => {
      const current = prev.selectedNobKeys || [];
      const exists = current.includes(nobVal);
      const next = exists ? current.filter((k) => k !== nobVal) : [...current, nobVal];
      return { ...prev, selectedNobKeys: next };
    });
  };

  const executeRuleUpsert = async (payloadData, isEdit = false, existingItem = null) => {
    const targetId = existingItem ? existingItem.uuid : null;

    if (isEdit) {
      if (!targetId) {
        throw new Error("Cannot save: this rule has no uuid. Please refresh and try again.");
      }
      const { data: existing, error: checkError } = await supabase
        .from("lto_crm_distribution")
        .select("uuid")
        .eq("uuid", targetId)
        .maybeSingle();
      if (checkError) throw new Error(`Database Error: ${checkError.message}`);
      if (!existing) {
        throw new Error("This rule no longer exists in the database (it may have been deleted). Please refresh.");
      }
    }

    const res = isEdit
      ? await supabase.from("lto_crm_distribution").update(payloadData).eq("uuid", targetId).select().single()
      : await supabase.from("lto_crm_distribution").insert([{ ...payloadData, created_at: new Date().toISOString() }]).select().single();

    if (res.error) {
      throw new Error(`Database Error: ${res.error.message || "Failed to save rule."}`);
    }
    if (!res.data) {
      throw new Error(isEdit ? "Update did not affect any row." : "Insert did not return the new row.");
    }
    return res;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.selectedCrms || formData.selectedCrms.length === 0) {
      alert("Please select at least one CRM Representative.");
      return;
    }

    if (!formData.selectedKeys || formData.selectedKeys.length === 0) {
      alert(`Please select at least one ${formData.category === "Group" ? "Group" : "State"} option.`);
      return;
    }

    if (formData.category === "StateNOB" && (!formData.selectedNobKeys || formData.selectedNobKeys.length === 0)) {
      alert("Please select at least one NOB option for State-NOB Tier.");
      return;
    }

    try {
      if (modalMode === "add") {
        if (formData.category === "Group") {
          const sortedGroups = [...formData.selectedKeys].sort().join(", ");
          const existing = data.find((r) => {
            if ((r.tier || "").toUpperCase() !== "GROUP") return false;
            const rGroups = Array.isArray(r.group_name) ? [...r.group_name].sort().join(", ") : "";
            return rGroups.toLowerCase() === sortedGroups.toLowerCase();
          });

          const payload = {
            tier: "Group",
            group_name: formData.selectedKeys,
            state_keys: [],
            nob_keys: [],
            crm_names: formData.selectedCrms,
            updated_at: new Date().toISOString(),
          };

          if (existing) {
            if (window.confirm(`A rule for Group(s) "${sortedGroups}" already exists. Do you want to update it?`)) {
              await executeRuleUpsert(payload, true, existing);
            }
          } else {
            await executeRuleUpsert(payload, false);
          }
        } else {
          // StateNOB tier
          const sortedStates = [...formData.selectedKeys].sort().join(", ");
          const sortedNobs = [...formData.selectedNobKeys].sort().join(", ");

          const existing = data.find((r) => {
            if ((r.tier || "").toUpperCase() === "GROUP") return false;
            const rStates = Array.isArray(r.state_keys) ? [...r.state_keys].sort().join(", ") : "";
            const rNobs = Array.isArray(r.nob_keys) ? [...r.nob_keys].sort().join(", ") : "";
            return rStates.toLowerCase() === sortedStates.toLowerCase() && rNobs.toLowerCase() === sortedNobs.toLowerCase();
          });

          const payload = {
            tier: "StateNOB",
            group_name: [],
            state_keys: formData.selectedKeys,
            nob_keys: formData.selectedNobKeys,
            crm_names: formData.selectedCrms,
            updated_at: new Date().toISOString(),
          };

          if (existing) {
            if (window.confirm(`A rule for State(s) "${sortedStates}" + NOB(s) "${sortedNobs}" already exists. Do you want to update it?`)) {
              await executeRuleUpsert(payload, true, existing);
            }
          } else {
            await executeRuleUpsert(payload, false);
          }
        }
      } else {
        // Edit mode
        const payload = {
          tier: formData.category,
          group_name: formData.category === "Group" ? formData.selectedKeys : [],
          state_keys: formData.category === "StateNOB" ? formData.selectedKeys : [],
          nob_keys: formData.category === "StateNOB" ? formData.selectedNobKeys : [],
          crm_names: formData.selectedCrms,
          updated_at: new Date().toISOString(),
        };

        await executeRuleUpsert(payload, true, currentItem);
      }

      handleCloseModal();
      fetchData();
    } catch (err) {
      alert("Error saving CRM rule: " + err.message);
      console.error(err);
    }
  };

  const handleDelete = async (row) => {
    const isGroup = (row.tier || "").toUpperCase() === "GROUP";
    const label = isGroup
      ? `Group(s) "${(row.group_name || []).join(", ")}"`
      : `State(s) "${(row.state_keys || []).join(", ")}" + NOB(s) "${(row.nob_keys || []).join(", ")}"`;
    if (!row?.uuid) {
      alert("Cannot delete: this rule has no uuid.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete the CRM distribution rule for ${label}?`)) return;
    try {
      const targetId = row.uuid;
      const { data, error } = await supabase
        .from("lto_crm_distribution")
        .delete()
        .eq("uuid", targetId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This rule was already removed (no matching uuid found).");
      fetchData();
    } catch (err) {
      alert("Error deleting record: " + (err.message || err));
    }
  };

  // Tier filtering happens server-side above (via activeFilter in fetchData).
  // Search stays client-side, scoped to whatever's on the current page: the
  // fields searched are array columns (group_name/state_keys/nob_keys/crm_names)
  // needing per-element substring matching, which PostgREST can't express as
  // a single filter without a custom RPC -- not worth it for a rules table
  // this small (a handful of CRM assignment rules, not customer-volume data).
  const filteredRows = data.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (Array.isArray(item.group_name) && item.group_name.some((g) => g.toLowerCase().includes(q))) ||
      (Array.isArray(item.state_keys) && item.state_keys.some((s) => s.toLowerCase().includes(q))) ||
      (Array.isArray(item.nob_keys) && item.nob_keys.some((n) => n.toLowerCase().includes(q))) ||
      (Array.isArray(item.crm_names) && item.crm_names.some((c) => c.toLowerCase().includes(q)))
    );
  });
  const totalPages = Math.ceil(totalResults / itemsPerPage) || 1;

  const getCategoryBadge = (row) => {
    const norm = (row.tier || "").toUpperCase();
    if (norm === "GROUP") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          <Layers className="w-3.5 h-3.5" />
          Group Tier (Priority 1)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-info/10 text-info border border-info/20">
        <MapPin className="w-3.5 h-3.5" />
        State-NOB Tier (Priority 2)
      </span>
    );
  };

  const stateListWithAny = ["Any", ...stateOptions];
  const nobListWithAny = ["Any", ...nobOptions];

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <UserCheck className="w-7 h-7 text-primary" />
              CRM Distribution Master
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Configure automatic CRM/CRE assignment rules with round-robin rotation upon order conversion.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                fetchData();
                fetchOptions();
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
              Add CRM Rule
            </button>
          </div>
        </div>

        {/* Tab Filter Navigation */}
        <div className="flex items-center space-x-4 border-b border-gray-200 overflow-x-auto">
          {[
            { id: "ALL", label: "All Rules" },
            { id: "Group", label: "Group Tier (Priority 1)" },
            { id: "StateNOB", label: "State-NOB Tier (Priority 2)" },
          ].map((tab) => {
            const count = tabCounts[tab.id] || 0;
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveFilter(tab.id); setCurrentPage(1); }}
                className={`flex items-center gap-2 py-3 px-6 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors duration-150 ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <span>{tab.label}</span>
                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 font-bold">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Bar & Instructions */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search rules, states, NOB, or CRM names..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
          <div className="text-xs text-gray-500 max-w-lg">
            <span className="flex items-center gap-1.5 font-medium text-primary bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/20">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
              Hierarchy Priority: Group Tier (Priority 1) &rarr; State-NOB Tier (Priority 2)
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <th className="py-3.5 px-6">Tier</th>
                <th className="py-3.5 px-6">Rule Condition</th>
                <th className="py-3.5 px-6">Assigned CRM Representatives</th>
                <th className="py-3.5 px-6">Last Assigned (Round-Robin)</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="5" className="text-center py-10 text-gray-400">
                    Loading rules...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-gray-500">
                    No CRM distribution rules found. Click "Add CRM Rule" to configure one.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const crmDisplayList = Array.isArray(row.crm_names) ? row.crm_names : [];
                  const isGroup = (row.tier || "").toUpperCase() === "GROUP";

                  return (
                    <tr key={row.uuid} className="hover:bg-gray-50/70 transition duration-150">
                      <td className="py-4 px-6 whitespace-nowrap">
                        {getCategoryBadge(row)}
                      </td>
                      <td className="py-4 px-6 font-medium text-gray-900">
                        {isGroup ? (
                          <div>
                            <span className="font-bold text-primary">Group(s): </span>
                            <span className="text-gray-800 font-semibold">
                              {Array.isArray(row.group_name) && row.group_name.length > 0
                                ? row.group_name.join(", ")
                                : "—"}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <div>
                              <span className="font-bold text-info">State(s): </span>
                              <span className="text-gray-800 font-semibold">
                                {Array.isArray(row.state_keys) && row.state_keys.length > 0
                                  ? row.state_keys.join(", ")
                                  : "Any"}
                              </span>
                            </div>
                            <div>
                              <span className="font-bold text-warning-foreground text-xs">NOB(s): </span>
                              <span className="text-warning-foreground font-semibold text-xs">
                                {Array.isArray(row.nob_keys) && row.nob_keys.length > 0
                                  ? row.nob_keys.join(", ")
                                  : "Any"}
                              </span>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-wrap gap-1.5">
                          {crmDisplayList.length === 0 ? (
                            <span className="text-gray-400 italic">—</span>
                          ) : (
                            crmDisplayList.map((cName, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-primary/5 text-primary border border-primary/20"
                              >
                                {cName}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-gray-600">
                        {row.last_assigned_crm ? (
                          <div className="flex items-center gap-1.5">
                            <Repeat className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="font-semibold text-gray-800">{row.last_assigned_crm}</span>
                            {row.last_assigned_ref && (
                              <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                                ({row.last_assigned_ref})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-xs">Not assigned yet</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenModal("edit", row)}
                            className="p-1.5 text-gray-500 hover:text-primary hover:bg-primary/5 rounded-lg transition duration-150"
                            title="Edit CRM mapping"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(row)}
                            className="p-1.5 text-gray-500 hover:text-destructive hover:bg-destructive/10 rounded-lg transition duration-150"
                            title="Delete rule"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
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

      {/* Add / Edit Rule Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                {modalMode === "add" ? "Add CRM Distribution Rules" : "Edit CRM Distribution Rule"}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 font-bold text-xl"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Category Tier Selector */}
              <div className="space-y-1.5 pb-4 border-b border-gray-100">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Hierarchy Category Tier <span className="text-destructive">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-sm font-bold text-gray-800"
                  required
                >
                  <option value="Group">Group Tier (Priority 1)</option>
                  <option value="StateNOB">State-NOB Tier (Priority 2)</option>
                </select>
              </div>

              {/* Multi-CRM Representatives Selection */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-primary">
                    CRM Representatives to Assign <span className="text-destructive">*</span> (Round-Robin)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, selectedCrms: [...crmOptions] }))}
                      className="px-2 py-0.5 text-xs font-semibold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded transition"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, selectedCrms: [] }))}
                      className="px-2 py-0.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {crmOptions.length === 0 ? (
                  <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed text-gray-400 text-sm italic">
                    No CRM options found in dropdown table.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-primary/40 rounded-xl border border-primary/20 max-h-40 overflow-y-auto">
                    {crmOptions.map((crm) => {
                      const checked = (formData.selectedCrms || []).includes(crm);
                      return (
                        <label
                          key={crm}
                          onClick={() => handleCrmToggle(crm)}
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs font-semibold transition-all select-none ${
                            checked
                              ? "bg-white text-primary border-primary/30 shadow-xs font-bold"
                              : "bg-transparent text-gray-600 border-transparent hover:bg-white/60"
                          }`}
                        >
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-300 shrink-0" />
                          )}
                          <span className="truncate">{crm}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Dynamic Rule Conditions */}
              {formData.category === "Group" ? (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <label className="block text-xs font-bold uppercase tracking-wider text-primary">
                      Select Group Options <span className="text-destructive">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, selectedKeys: [...groupOptions] }))}
                        className="px-2 py-0.5 text-xs font-semibold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded transition"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, selectedKeys: [] }))}
                        className="px-2 py-0.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {groupOptions.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed text-gray-400 text-sm italic">
                      No groups found in client master.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-4 bg-primary/40 rounded-xl border border-primary/20 max-h-52 overflow-y-auto">
                      {groupOptions.map((gOpt) => {
                        const checked = (formData.selectedKeys || []).includes(gOpt);
                        return (
                          <label
                            key={gOpt}
                            onClick={() => handleKeyToggle(gOpt)}
                            className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer border text-xs font-semibold transition-all select-none ${
                              checked
                                ? "bg-white text-primary border-primary/30 shadow-xs font-bold"
                                : "bg-transparent text-gray-600 border-transparent hover:bg-white/60"
                            }`}
                          >
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-300 shrink-0" />
                            )}
                            <span className="truncate">{gOpt}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* StateNOB Tier: Two Checkbox Sections */
                <div className="space-y-4">
                  {/* State Section */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-info">
                        1. Select State Options <span className="text-destructive">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, selectedKeys: [...stateListWithAny] }))}
                          className="px-2 py-0.5 text-xs font-semibold text-info bg-info/10 hover:bg-info/10 border border-info/20 rounded transition"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, selectedKeys: [] }))}
                          className="px-2 py-0.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-info/40 rounded-xl border border-info/20 max-h-40 overflow-y-auto">
                      {stateListWithAny.map((sOpt) => {
                        const checked = (formData.selectedKeys || []).includes(sOpt);
                        return (
                          <label
                            key={sOpt}
                            onClick={() => handleKeyToggle(sOpt)}
                            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs font-semibold transition-all select-none ${
                              checked
                                ? "bg-white text-info border-info/40 shadow-xs font-bold"
                                : "bg-transparent text-gray-600 border-transparent hover:bg-white/60"
                            }`}
                          >
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-info shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-300 shrink-0" />
                            )}
                            <span className="truncate">{sOpt}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* NOB Section */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-warning-foreground">
                        2. Select NOB Options <span className="text-destructive">*</span> (Multiple NOBs allowed)
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, selectedNobKeys: [...nobListWithAny] }))}
                          className="px-2 py-0.5 text-xs font-semibold text-warning-foreground bg-warning/5 hover:bg-warning/15 border border-warning/30 rounded transition"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, selectedNobKeys: [] }))}
                          className="px-2 py-0.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-warning/40 rounded-xl border border-warning/30 max-h-40 overflow-y-auto">
                      {nobListWithAny.map((nOpt) => {
                        const checked = (formData.selectedNobKeys || []).includes(nOpt);
                        return (
                          <label
                            key={nOpt}
                            onClick={() => handleNobKeyToggle(nOpt)}
                            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs font-semibold transition-all select-none ${
                              checked
                                ? "bg-white text-warning-foreground border-warning/30 shadow-xs font-bold"
                                : "bg-transparent text-gray-600 border-transparent hover:bg-white/60"
                            }`}
                          >
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-warning-foreground shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-300 shrink-0" />
                            )}
                            <span className="truncate">{nOpt}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

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
                  disabled={
                    formData.selectedCrms.length === 0 ||
                    formData.selectedKeys.length === 0 ||
                    (formData.category === "StateNOB" && formData.selectedNobKeys.length === 0)
                  }
                >
                  {modalMode === "add"
                    ? `Save Rule(s)`
                    : "Update Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
