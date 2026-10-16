import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../../App";
import useConfirmDialog from "../../components/useConfirmDialog";
import { Plus, Pencil, Trash2, RefreshCw, UserCheck, ShieldCheck, Layers, MapPin, CheckSquare, Square, Users, Repeat } from "lucide-react";
import supabase from "../../utils/supabase";
import PaginationBar from "../../components/PaginationBar";
import MasterDialog from "../../components/MasterDialog";
import StatusTabs from "../../components/StatusTabs";
import { FilterSearch } from "../../components/FilterBar";

export default function CREMgmt() {
  const { showNotification = () => {} } = useContext(AuthContext) || {};
  const { confirmAsync, confirmDialog } = useConfirmDialog();
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
      showNotification("Please select at least one CRM Representative.", "error");
      return;
    }

    if (!formData.selectedKeys || formData.selectedKeys.length === 0) {
      showNotification(`Please select at least one ${formData.category === "Group" ? "Group" : "State"} option.`, "error");
      return;
    }

    if (formData.category === "StateNOB" && (!formData.selectedNobKeys || formData.selectedNobKeys.length === 0)) {
      showNotification("Please select at least one NOB option for State-NOB Tier.", "error");
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
            const updateExisting = await confirmAsync({
              title: "Rule already exists",
              message: `A rule for Group(s) "${sortedGroups}" already exists. Do you want to update it?`,
              confirmText: "Update",
              destructive: false,
            });
            if (updateExisting) {
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
            const updateExisting = await confirmAsync({
              title: "Rule already exists",
              message: `A rule for State(s) "${sortedStates}" + NOB(s) "${sortedNobs}" already exists. Do you want to update it?`,
              confirmText: "Update",
              destructive: false,
            });
            if (updateExisting) {
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
      showNotification("Error saving CRM rule: " + err.message, "error");
      console.error(err);
    }
  };

  const handleDelete = async (row) => {
    const isGroup = (row.tier || "").toUpperCase() === "GROUP";
    const label = isGroup
      ? `Group(s) "${(row.group_name || []).join(", ")}"`
      : `State(s) "${(row.state_keys || []).join(", ")}" + NOB(s) "${(row.nob_keys || []).join(", ")}"`;
    if (!row?.uuid) {
      showNotification("Cannot delete: this rule has no uuid.", "error");
      return;
    }
    const confirmed = await confirmAsync({
      title: "Delete rule?",
      message: `Are you sure you want to delete the CRM distribution rule for ${label}?`,
      confirmText: "Delete",
    });
    if (!confirmed) return;
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
      showNotification("Error deleting record: " + (err.message || err), "error");
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
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-accent text-brand-800 border border-primary/20">
          <Layers aria-hidden="true" className="w-3.5 h-3.5" />
          Group Tier (Priority 1)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-info/10 text-info border border-info/20">
        <MapPin aria-hidden="true" className="w-3.5 h-3.5" />
        State-NOB Tier (Priority 2)
      </span>
    );
  };

  const stateListWithAny = ["Any", ...stateOptions];
  const nobListWithAny = ["Any", ...nobOptions];

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <UserCheck aria-hidden="true" className="h-4 w-4 text-primary" />
              CRM Distribution Master
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Configure automatic CRM/CRE assignment rules with round-robin rotation upon order conversion.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                fetchData();
                fetchOptions();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Refresh CRM rules"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleOpenModal("add")}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add CRM Rule
            </button>
          </div>
        </div>

        {/* Tab Filter Navigation */}
        <StatusTabs
          variant="underline"
          label="Rule tiers"
          activeTab={activeFilter}
          onChange={(id) => { setActiveFilter(id); setCurrentPage(1); }}
          tabs={[
            { id: "ALL", label: "All Rules", count: tabCounts.ALL || 0 },
            { id: "Group", label: "Group Tier (Priority 1)", count: tabCounts.Group || 0 },
            { id: "StateNOB", label: "State-NOB Tier (Priority 2)", count: tabCounts.StateNOB || 0 },
          ]}
        />

        {/* Search Bar & Instructions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <FilterSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search rules, states, NOB, or CRM names..."
            className="max-w-md"
          />
          <p className="flex max-w-lg items-start gap-1.5 rounded-md border border-primary/20 bg-accent px-3 py-2 text-xs font-medium text-brand-800">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Hierarchy Priority: Group Tier (Priority 1) &rarr; State-NOB Tier (Priority 2)</span>
          </p>
        </div>

        {/* Table */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left border-collapse" aria-label="CRM distribution rules">
            <thead className="sticky top-0 z-10 bg-secondary">
              <tr className="bg-secondary border-b text-xs font-semibold text-brand-800">
                <th scope="col" className="py-2.5 px-4">Tier</th>
                <th scope="col" className="py-2.5 px-4">Rule Condition</th>
                <th scope="col" className="py-2.5 px-4">Assigned CRM Representatives</th>
                <th scope="col" className="py-2.5 px-4">Last Assigned (Round-Robin)</th>
                <th scope="col" className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {loading ? (
                <tr>
                  <td colSpan="5" className="text-center py-10 text-muted-foreground">
                    Loading rules...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-muted-foreground">
                    No CRM distribution rules found. Click "Add CRM Rule" to configure one.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const crmDisplayList = Array.isArray(row.crm_names) ? row.crm_names : [];
                  const isGroup = (row.tier || "").toUpperCase() === "GROUP";

                  return (
                    <tr key={row.uuid} className="hover:bg-secondary/60 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getCategoryBadge(row)}
                      </td>
                      <td className="py-3 px-4 font-medium text-foreground">
                        {isGroup ? (
                          <div>
                            <span className="font-bold text-primary">Group(s): </span>
                            <span className="text-foreground font-semibold">
                              {Array.isArray(row.group_name) && row.group_name.length > 0
                                ? row.group_name.join(", ")
                                : "—"}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <div>
                              <span className="font-bold text-info">State(s): </span>
                              <span className="text-foreground font-semibold">
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
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {crmDisplayList.length === 0 ? (
                            <span className="text-muted-foreground italic">—</span>
                          ) : (
                            crmDisplayList.map((cName, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-accent text-brand-800 border border-primary/20"
                              >
                                {cName}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {row.last_assigned_crm ? (
                          <div className="flex items-center gap-1.5">
                            <Repeat aria-hidden="true" className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="font-semibold text-foreground">{row.last_assigned_crm}</span>
                            {row.last_assigned_ref && (
                              <span className="text-xs font-mono bg-secondary text-muted-foreground px-1.5 py-0.5 rounded border">
                                ({row.last_assigned_ref})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic text-xs">Not assigned yet</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenModal("edit", row)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-info transition-colors hover:bg-accent"
                            aria-label="Edit CRM mapping"
                            title="Edit CRM mapping"
                          >
                            <Pencil aria-hidden="true" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(row)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
                            aria-label="Delete rule"
                            title="Delete rule"
                          >
                            <Trash2 aria-hidden="true" className="w-4 h-4" />
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

      {/* Add / Edit Rule Modal */}
      {isModalOpen && (
        <MasterDialog
          title={modalMode === "add" ? "Add CRM Distribution Rules" : "Edit CRM Distribution Rule"}
          onClose={handleCloseModal}
          maxWidth="max-w-3xl"
        >
            <form onSubmit={handleSubmit} className="p-4 space-y-5">
              {/* Category Tier Selector */}
              <div className="space-y-1.5 pb-4 border-b">
                <label htmlFor="crm-tier" className="block text-sm font-medium text-foreground">
                  Hierarchy Category Tier <span className="text-destructive">*</span>
                </label>
                <select
                  id="crm-tier"
                  value={formData.category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                  required
                >
                  <option value="Group">Group Tier (Priority 1)</option>
                  <option value="StateNOB">State-NOB Tier (Priority 2)</option>
                </select>
              </div>

              {/* Multi-CRM Representatives Selection */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-sm font-semibold text-foreground">
                    CRM Representatives to Assign <span className="text-destructive">*</span> (Round-Robin)
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, selectedCrms: [...crmOptions] }))}
                      className="h-7 rounded-md border border-primary/30 px-2 text-xs font-medium text-primary transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, selectedCrms: [] }))}
                      className="h-7 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {crmOptions.length === 0 ? (
                  <div className="text-center py-6 bg-secondary/50 rounded-lg border border-dashed text-muted-foreground text-sm italic">
                    No CRM options found in dropdown table.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-secondary/50 rounded-lg border max-h-40 overflow-y-auto">
                    {crmOptions.map((crm) => {
                      const checked = (formData.selectedCrms || []).includes(crm);
                      return (
                        <button
                          key={crm}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          onClick={() => handleCrmToggle(crm)}
                          className={`w-full text-left flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                            checked
                              ? "bg-card text-foreground border-primary/40 font-semibold"
                              : "bg-transparent text-muted-foreground border-transparent hover:bg-card"
                          }`}
                        >
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                          ) : (
                            <Square className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                          )}
                          <span className="truncate">{crm}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Dynamic Rule Conditions */}
              {formData.category === "Group" ? (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-sm font-semibold text-foreground">
                      Select Group Options <span className="text-destructive">*</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, selectedKeys: [...groupOptions] }))}
                        className="h-7 rounded-md border border-primary/30 px-2 text-xs font-medium text-primary transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, selectedKeys: [] }))}
                        className="h-7 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {groupOptions.length === 0 ? (
                    <div className="text-center py-6 bg-secondary/50 rounded-lg border border-dashed text-muted-foreground text-sm italic">
                      No groups found in client master.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-4 bg-secondary/50 rounded-lg border max-h-52 overflow-y-auto">
                      {groupOptions.map((gOpt) => {
                        const checked = (formData.selectedKeys || []).includes(gOpt);
                        return (
                          <button
                            key={gOpt}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => handleKeyToggle(gOpt)}
                            className={`w-full text-left flex items-center gap-2 p-2.5 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                              checked
                                ? "bg-card text-foreground border-primary/40 font-semibold"
                                : "bg-transparent text-muted-foreground border-transparent hover:bg-card"
                            }`}
                          >
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                            ) : (
                              <Square className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                            )}
                            <span className="truncate">{gOpt}</span>
                          </button>
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
                      <p className="text-sm font-semibold text-foreground">
                        1. Select State Options <span className="text-destructive">*</span>
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, selectedKeys: [...stateListWithAny] }))}
                          className="h-7 rounded-md border border-primary/30 px-2 text-xs font-medium text-primary transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, selectedKeys: [] }))}
                          className="h-7 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-secondary/50 rounded-lg border max-h-40 overflow-y-auto">
                      {stateListWithAny.map((sOpt) => {
                        const checked = (formData.selectedKeys || []).includes(sOpt);
                        return (
                          <button
                            key={sOpt}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => handleKeyToggle(sOpt)}
                            className={`w-full text-left flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                              checked
                                ? "bg-card text-foreground border-primary/40 font-semibold"
                                : "bg-transparent text-muted-foreground border-transparent hover:bg-card"
                            }`}
                          >
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                            ) : (
                              <Square className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                            )}
                            <span className="truncate">{sOpt}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* NOB Section */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold text-foreground">
                        2. Select NOB Options <span className="text-destructive">*</span> (Multiple NOBs allowed)
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, selectedNobKeys: [...nobListWithAny] }))}
                          className="h-7 rounded-md border border-primary/30 px-2 text-xs font-medium text-primary transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, selectedNobKeys: [] }))}
                          className="h-7 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-secondary/50 rounded-lg border max-h-40 overflow-y-auto">
                      {nobListWithAny.map((nOpt) => {
                        const checked = (formData.selectedNobKeys || []).includes(nOpt);
                        return (
                          <button
                            key={nOpt}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => handleNobKeyToggle(nOpt)}
                            className={`w-full text-left flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                              checked
                                ? "bg-card text-foreground border-primary/40 font-semibold"
                                : "bg-transparent text-muted-foreground border-transparent hover:bg-card"
                            }`}
                          >
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                            ) : (
                              <Square className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                            )}
                            <span className="truncate">{nOpt}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

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
        </MasterDialog>
      )}
      {confirmDialog}
    </div>
  );
}
