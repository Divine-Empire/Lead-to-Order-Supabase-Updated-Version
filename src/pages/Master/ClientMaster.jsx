import { useState, useEffect, useRef, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, RefreshCw, SlidersHorizontal } from "lucide-react";
import ColumnSelector from "../../components/ColumnSelector";
import StatusTabs from "../../components/StatusTabs";
import { FilterSearch, filterControlClass } from "../../components/FilterBar";
import DataTable from "../../components/DataTable";
import supabase from "../../utils/supabase";
import ModalForm from "../../components/ModalForm";
import { TABLES, COLUMNS } from "../../constants/dbSchema";
import { AuthContext } from "../../App";
import useConfirmDialog from "../../components/useConfirmDialog";
import { getStateCodeFromName } from "../../utils/gstStateCodes";

// Read-only view (Database/04_client_master_open_work_view.sql) adding
// has_open_work on top of every lto_client_master column -- used for every
// SELECT below. Every write still targets TABLES.CLIENT_MASTER (the real
// table) directly; views aren't writable here.
const CLIENT_MASTER_READ_VIEW = "lto_client_master_with_status";

function ClientMaster() {
  const authContext = useContext(AuthContext) || {};
  const { showNotification = () => {} } = authContext;
  const { askConfirm, confirmAsync, confirmDialog } = useConfirmDialog();
  const {
    isAdmin = () => false,
    getUsernamesToFilter = () => [],
  } = authContext;

  const [searchQuery, setSearchQuery] = useState("");
  const [clientData, setClientData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [currentClient, setCurrentClient] = useState(null);

  // Column Visibility State
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const columnToggleRef = useRef(null);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [activeTab, setActiveTab] = useState("converted"); // "converted" | "unconverted" | "new"

  // "More Filters" popover -- Relevance / Already In Tracker / Status used to
  // each sit in the toolbar as their own <select>, which is what made the
  // row cluttered and caused the longer labels to truncate. Grouped here the
  // same way the Columns toggle already works (ref + click-outside), so it's
  // one more control in the row instead of three.
  const [showFiltersPopover, setShowFiltersPopover] = useState(false);
  const filtersPopoverRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (columnToggleRef.current && !columnToggleRef.current.contains(event.target)) {
        setShowColumnToggle(false);
      }
      if (filtersPopoverRef.current && !filtersPopoverRef.current.contains(event.target)) {
        setShowFiltersPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [formData, setFormData] = useState({
    companyName: "",
    clientName: "",
    clientMobileNumber: "",
    state: "",
    billingAddress: "",
    gstNumber: "",
    companyGroupName: "",
    scName: "",
    crmName: "",
    stateCode: "",
    creditDays: "",
    creditLimit: "",
    salesType: ""
  });

  // Filter States -- Company/State dropdowns were removed; the search box
  // already matches company_name and state (see applyCommonFilters' .or()),
  // so they were a second way to do the same thing.
  // "all" | "none" (NULL/blank) | "order_received" |
  // "open" (Call-Tracker/Enquiry Tracker/Make Quotation/.. -- still active) |
  // "safe" (none OR order_received -- clear to start a fresh lead/enquiry)
  const [trackerStatusFilter, setTrackerStatusFilter] = useState("all");
  // "all" | "new" (converted, no follow-up lead/enquiry since) | "followed"
  const [newStatusFilter, setNewStatusFilter] = useState("all");
  const moreFiltersActiveCount = [trackerStatusFilter, newStatusFilter].filter((v) => v !== "all").length;

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalResults, setTotalResults] = useState(0);
  const [convertedCount, setConvertedCount] = useState(0);
  const [unconvertedCount, setUnconvertedCount] = useState(0);
  const [newCount, setNewCount] = useState(0);

  // Debounce search input so we don't fire a query per keystroke
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  const fetchIdRef = useRef(0);

  // Applies the search/company/state/relevance filters shared by the main
  // page query and the tab-count queries.
  const applyCommonFilters = (query) => {
    let q = query;
    if (debouncedSearch) {
      const term = `%${debouncedSearch}%`;
      q = q.or(
        `company_name.ilike.${term},client_code.ilike.${term},client_name.ilike.${term},client_mobile_number.ilike.${term},gst_number.ilike.${term},state.ilike.${term},company_group_name.ilike.${term},sc_name.ilike.${term},crm_name.ilike.${term}`
      );
    }
    // already_in_tracker is free text ("Order Received (En-X)", "Call-
    // Tracker (LD-X)", ...) written by several different stages -- bucket
    // it by prefix rather than adding a parallel enum column.
    if (trackerStatusFilter === "none") {
      q = q.or("already_in_tracker.is.null,already_in_tracker.eq.");
    } else if (trackerStatusFilter === "order_received") {
      q = q.ilike("already_in_tracker", "Order Received%");
    } else if (trackerStatusFilter === "safe") {
      q = q.or("already_in_tracker.is.null,already_in_tracker.eq.,already_in_tracker.ilike.Order Received%");
    } else if (trackerStatusFilter === "open") {
      q = q
        .not("already_in_tracker", "is", null)
        .neq("already_in_tracker", "")
        .not("already_in_tracker", "ilike", "Order Received%")
        .not("already_in_tracker", "ilike", "Order Lost%");
    }
    if (newStatusFilter === "new") q = q.eq("is_newly_converted", true);
    if (newStatusFilter === "followed") q = q.eq("is_newly_converted", false);
    // Role-based access: non-admin (USER) accounts only ever see clients
    // assigned to their own SC name (plus any delegated alternate access).
    if (!isAdmin()) {
      q = q.in("sc_name", getUsernamesToFilter());
    }
    return q;
  };

  // "new" and "unconverted" both start from "no client_code" and then split
  // on has_open_work (computed by the lto_client_master_with_status view --
  // see Database/04_client_master_open_work_view.sql): Unconverted is still
  // actively being worked (an open lead/enquiry exists), New has nothing
  // open right now and is safe to re-contact without colliding with active
  // work.
  const applyTabFilter = (query, tab) => {
    if (tab === "converted") {
      return query.not("client_code", "is", null).neq("client_code", "");
    }
    const noCode = query.or("client_code.is.null,client_code.eq.");
    return tab === "unconverted"
      ? noCode.eq("has_open_work", true)
      : noCode.eq("has_open_work", false);
  };

  const fetchClients = async () => {
    fetchIdRef.current += 1;
    const currentFetchId = fetchIdRef.current;

    setIsLoading(true);
    try {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase.from(CLIENT_MASTER_READ_VIEW).select("*", { count: "exact" });
      query = applyCommonFilters(query);
      query = applyTabFilter(query, activeTab);
      query = query.order("company_name", { ascending: true }).range(from, to);

      const { data, error, count } = await query;
      if (currentFetchId !== fetchIdRef.current) return; // a newer fetch superseded this one
      if (error) throw error;

      const formatted = (data || []).map((c, i) => {
        const trackerStatus = c.already_in_tracker && c.already_in_tracker.trim() ? c.already_in_tracker.trim() : "-";
        return {
          id: from + i + 1,
          uuid: c.uuid,
          companyName: c.company_name || "",
          clientCode: c.client_code || "",
          clientName: c.client_name || "",
          clientMobileNumber: c.client_mobile_number || "",
          state: c.state || "",
          billingAddress: c.billing_address || "",
          gstNumber: c.gst_number || "",
          companyGroupName: c.company_group_name || "",
          scName: c.sc_name || "",
          crmName: c.crm_name || "",
          stateCode: c.state_code || "",
          creditDays: c.credit_days ?? "",
          creditLimit: c.credit_limit ?? "",
          salesType: c.sales_type || "",
          trackerStatus,
          isNewlyConverted: !!c.is_newly_converted
        };
      });

      setClientData(formatted);
      setTotalResults(count || 0);
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const fetchTabCounts = async () => {
    try {
      const baseQuery = () => applyCommonFilters(supabase.from(CLIENT_MASTER_READ_VIEW).select("uuid", { count: "exact", head: true }));
      const [convertedRes, unconvertedRes, newRes] = await Promise.all([
        applyTabFilter(baseQuery(), "converted"),
        applyTabFilter(baseQuery(), "unconverted"),
        applyTabFilter(baseQuery(), "new"),
      ]);
      setConvertedCount(convertedRes.count || 0);
      setUnconvertedCount(unconvertedRes.count || 0);
      setNewCount(newRes.count || 0);
    } catch (error) {
      console.error("Error fetching tab counts:", error);
    }
  };

  useEffect(() => {
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage, activeTab, debouncedSearch, trackerStatusFilter, newStatusFilter]);

  useEffect(() => {
    fetchTabCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, trackerStatusFilter, newStatusFilter]);

  const handleOpenModal = (mode, client = null) => {
    if (!isAdmin()) return; // USER role cannot add/edit clients
    setModalMode(mode);
    setCurrentClient(client);
    if (client && mode === "edit") {
      setFormData({
        companyName: client.companyName || "",
        clientName: client.clientName || "",
        clientMobileNumber: client.clientMobileNumber || "",
        state: client.state || "",
        billingAddress: client.billingAddress || "",
        gstNumber: client.gstNumber || "",
        companyGroupName: client.companyGroupName || "",
        scName: client.scName || "",
        crmName: client.crmName || "",
        stateCode: client.stateCode || "",
        creditDays: client.creditDays !== "" ? String(client.creditDays) : "",
        creditLimit: client.creditLimit !== "" ? String(client.creditLimit) : "",
        salesType: client.salesType || ""
      });
    } else {
      setFormData({
        companyName: "",
        clientName: "",
        clientMobileNumber: "",
        state: "",
        billingAddress: "",
        gstNumber: "",
        companyGroupName: "",
        scName: "",
        crmName: "",
        stateCode: "",
        creditDays: "",
        creditLimit: "",
        salesType: ""
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentClient(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isAdmin()) return; // USER role cannot add/edit clients

    if (modalMode === "edit" && !currentClient?.uuid) {
      showNotification("Cannot save: this client has no uuid. Please refresh and try again.", "error");
      return;
    }

    // Changing an existing client's group is a data-classification fix
    // (e.g. merging a misspelled/duplicate group into the real one), not by
    // itself a decision to reassign who manages the account -- the SC/CRM
    // already recorded reflects who actually did the work (and any order
    // already converted keeps their own copy of it regardless). So this
    // never updates silently: it's offered as an explicit, opt-in choice
    // each time, and declining leaves SC/CRM untouched. client_code is
    // never touched here either -- it may already be printed on real
    // documents, so renumbering it is a separate, deliberate action, not an
    // automatic side effect of a group edit.
    let scNameToSave = formData.scName || null;
    let crmNameToSave = formData.crmName || null;
    const newGroup = (formData.companyGroupName || "").trim();
    const previousGroup = (currentClient?.companyGroupName || "").trim();
    if (modalMode === "edit" && newGroup && newGroup.toLowerCase() !== previousGroup.toLowerCase()) {
      try {
        const { data: groupSiblings } = await supabase
          .from(TABLES.CLIENT_MASTER)
          .select("sc_name, crm_name")
          .ilike("company_group_name", newGroup)
          .neq("uuid", currentClient.uuid)
          .not("sc_name", "is", null)
          .order("updated_at", { ascending: false })
          .limit(1);
        const sibling = groupSiblings && groupSiblings[0];
        if (sibling?.sc_name && (sibling.sc_name !== scNameToSave || sibling.crm_name !== crmNameToSave)) {
          const applyToo = await confirmAsync({
            title: "Apply group's SC/CRM?",
            confirmText: "Apply SC/CRM",
            destructive: false,
            message:
            `Group "${newGroup}" is currently handled by SC: ${sibling.sc_name}` +
            (sibling.crm_name ? `, CRM: ${sibling.crm_name}` : "") +
            `.\n\nApply the same SC/CRM to this client too? (Client Code will NOT change.)\n\n` +
            `Click Cancel to keep this client's current SC/CRM.`,
          });
          if (applyToo) {
            scNameToSave = sibling.sc_name;
            crmNameToSave = sibling.crm_name || null;
          }
        }
      } catch (groupCheckErr) {
        console.error("Error checking group's existing SC/CRM:", groupCheckErr);
      }
    }

    setIsLoading(true);
    const supabaseData = {
      company_name: formData.companyName,
      client_name: formData.clientName || null,
      client_mobile_number: formData.clientMobileNumber || null,
      state: formData.state || null,
      billing_address: formData.billingAddress || null,
      gst_number: formData.gstNumber || null,
      company_group_name: formData.companyGroupName || null,
      sc_name: scNameToSave,
      crm_name: crmNameToSave,
      // Admin's typed value always wins if present; otherwise derive it
      // from State so this table can't end up with one set and not the
      // other (that mismatch is what leaves the Quotation revision
      // loader's Consignee State/State Code blank -- see gstStateCodes.js).
      state_code: formData.stateCode || getStateCodeFromName(formData.state) || null,
      credit_days: formData.creditDays !== "" && formData.creditDays !== null ? parseInt(formData.creditDays, 10) : null,
      credit_limit: formData.creditLimit !== "" && formData.creditLimit !== null ? parseFloat(formData.creditLimit) : null,
      sales_type: formData.salesType || null,
      updated_at: new Date().toISOString()
    };

    try {
      if (modalMode === "add") {
        const { data, error } = await supabase.from(TABLES.CLIENT_MASTER).insert([supabaseData]).select().single();
        if (error) throw error;
        if (!data) throw new Error("Insert did not return the new client row.");
      } else {
        const { data: existing, error: checkError } = await supabase
          .from(TABLES.CLIENT_MASTER)
          .select("uuid")
          .eq("uuid", currentClient.uuid)
          .maybeSingle();
        if (checkError) throw checkError;
        if (!existing) {
          throw new Error("This client no longer exists in the database (it may have been deleted). Please refresh.");
        }

        const { data, error } = await supabase
          .from(TABLES.CLIENT_MASTER)
          .update(supabaseData)
          .eq("uuid", currentClient.uuid)
          .select()
          .single();
        if (error) throw error;
        if (!data) throw new Error("Update did not affect any row.");
      }

      await fetchClients();
      handleCloseModal();
    } catch (err) {
      console.error("Error saving client:", err);
      showNotification("Failed to save client: " + (err.message || err), "error");
      setIsLoading(false);
    }
  };

  const handleDelete = async (client) => {
    if (!isAdmin()) return; // USER role cannot delete clients
    if (!client?.uuid) {
      showNotification("Cannot delete: this client has no uuid.", "error");
      return;
    }
    askConfirm({ title: "Delete client?", message: `Are you sure you want to delete ${client.companyName}?`, confirmText: "Delete" }, async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from(TABLES.CLIENT_MASTER)
          .delete()
          .eq("uuid", client.uuid)
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("This client was already removed (no matching uuid found).");
        await fetchClients();
      } catch (err) {
        console.error("Error deleting client:", err);
        showNotification("Failed to delete client: " + (err.message || err), "error");
        setIsLoading(false);
      }
    });
  };
  
  const allHeaders = [
    { key: "actions", label: "Actions" },
    { key: "action2", label: "Action 2" },
    { key: "companyName", label: "Company Name" },
    { key: "clientCode", label: "Client Code" },
    { key: "salesType", label: "Sales Type" },
    { key: "trackerStatus", label: "Already In Tracker" },
    { key: "newStatus", label: "Status" },
    { key: "clientName", label: "Client Name" },
    { key: "clientMobileNumber", label: "Mobile Number" },
    { key: "companyGroupName", label: "Company Group" },
    { key: "scName", label: "SC Name" },
    { key: "crmName", label: "CRM Name" },
    { key: "state", label: "State" },
    { key: "stateCode", label: "State Code" },
    { key: "gstNumber", label: "GST Number" },
    { key: "billingAddress", label: "Billing Address" },
    { key: "creditDays", label: "Credit Days" },
    { key: "creditLimit", label: "Credit Limit" }
  ];

  const visibleHeaders = allHeaders.filter(col => {
    if (hiddenColumns.includes(col.key)) return false;
    // USER role: view-only Client Master, no Actions (edit/delete) column
    if (!isAdmin() && col.key === "actions") return false;
    return true;
  });
  const headers = visibleHeaders.map(col => col.label);

  const renderRow = (row, index) => {
    const urlParams = new URLSearchParams({
      companyName: row.companyName || "",
      phoneNumber: row.clientMobileNumber || "",
      personName: row.clientName || "",
      state: row.state || "",
      groupName: row.companyGroupName || "",
      gstNumber: row.gstNumber || "",
      billingAddress: row.billingAddress || "",
      scName: row.scName || "",
      crmName: row.crmName || ""
    }).toString();

    const columnCells = {
      actions: (
        <td key="actions" className="px-4 py-3 whitespace-nowrap text-sm text-center">
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={() => handleOpenModal("edit", row)} className="flex h-8 w-8 items-center justify-center rounded-md transition-colors text-info hover:bg-accent" aria-label={`Edit ${row.companyName}`} title="Edit">
              <Pencil size={16} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => handleDelete(row)} className="flex h-8 w-8 items-center justify-center rounded-md transition-colors text-destructive hover:bg-destructive/10" aria-label={`Delete ${row.companyName}`} title="Delete">
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </td>
      ),
      action2: (
        <td key="action2" className="px-4 py-3 whitespace-nowrap text-sm text-center">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/leads?${urlParams}`)}
              className="inline-flex h-7 items-center rounded-md border border-primary/30 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Lead
            </button>
            <button
              type="button"
              onClick={() => navigate(`/enquiry-tracker?action=new-enquiry&${urlParams}`)}
              className="inline-flex h-7 items-center rounded-md border border-input bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              Enquiry
            </button>
          </div>
        </td>
      ),
      companyName: (
        <td key="companyName" className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-center">{row.companyName}</td>
      ),
      clientCode: (
        <td key="clientCode" className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-primary text-center">
          {row.clientCode ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded border border-primary/20 bg-primary/5 text-primary text-xs font-semibold">
              {row.clientCode}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>
      ),
      salesType: (
        <td key="salesType" className="px-4 py-3 whitespace-nowrap text-sm text-center">
          {row.salesType ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-primary/5 text-primary border border-primary/20">
              {row.salesType}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>
      ),
      trackerStatus: (
        <td key="trackerStatus" className="px-4 py-3 whitespace-nowrap text-sm text-center">
          {row.trackerStatus && row.trackerStatus !== "-" ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded border border-warning/30 bg-warning/5 text-warning-foreground text-xs font-medium ">
              {row.trackerStatus}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>
      ),
      newStatus: (
        <td key="newStatus" className="px-4 py-3 whitespace-nowrap text-sm text-center">
          {row.isNewlyConverted ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-medium">
              New - No Follow-up Yet
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>
      ),
      clientName: (
        <td key="clientName" className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">{row.clientName || "-"}</td>
      ),
      clientMobileNumber: (
        <td key="clientMobileNumber" className="px-4 py-3 whitespace-nowrap text-sm text-primary font-medium text-center">{row.clientMobileNumber || "-"}</td>
      ),
      companyGroupName: (
        <td key="companyGroupName" className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">{row.companyGroupName || "-"}</td>
      ),
      scName: (
        <td key="scName" className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">
          {row.scName ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/5 text-primary">
              {row.scName}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>
      ),
      crmName: (
        <td key="crmName" className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">{row.crmName || "-"}</td>
      ),
      state: (
        <td key="state" className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">{row.state || "-"}</td>
      ),
      stateCode: (
        <td key="stateCode" className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">{row.stateCode || "-"}</td>
      ),
      gstNumber: (
        <td key="gstNumber" className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">{row.gstNumber || "-"}</td>
      ),
      billingAddress: (
        <td key="billingAddress" className="px-4 py-3 text-sm text-gray-600 min-w-[200px] truncate max-w-xs text-center" title={row.billingAddress}>{row.billingAddress || "-"}</td>
      ),
      creditDays: (
        <td key="creditDays" className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">{row.creditDays !== "" ? row.creditDays : "-"}</td>
      ),
      creditLimit: (
        <td key="creditLimit" className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">{row.creditLimit !== "" ? row.creditLimit : "-"}</td>
      )
    };

    return (
      <tr key={row.uuid || index}>
        {visibleHeaders.map(col => columnCells[col.key])}
      </tr>
    );
  };

  const renderCard = (item, index) => {
    return (
      <div key={item.uuid || index} className="bg-card p-4 rounded-lg border">
        <div className="flex justify-between items-start mb-2">
          <div className="flex flex-col">
            <span className="font-semibold text-gray-800">{item.companyName}</span>
            {item.clientCode && (
              <span className="text-xs font-semibold text-primary mt-0.5">
                Code: {item.clientCode}
              </span>
            )}
            {item.trackerStatus && item.trackerStatus !== "-" && (
              <span className="inline-flex items-center w-fit mt-1 px-2 py-0.5 rounded border border-warning/30 bg-warning/5 text-warning-foreground text-[10px] font-medium">
                {item.trackerStatus}
              </span>
            )}
            {item.isNewlyConverted && (
              <span className="inline-flex items-center w-fit mt-1 px-2 py-0.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-[10px] font-medium">
                New - No Follow-up Yet
              </span>
            )}
            {item.salesType && (
              <span className="inline-flex items-center w-fit mt-1 px-2 py-0.5 rounded bg-primary/5 text-primary border border-primary/20 text-[10px] font-medium">
                {item.salesType}
              </span>
            )}
          </div>
          <span className="text-xs font-medium text-primary">{item.clientMobileNumber}</span>
        </div>
        <div className="text-sm text-gray-600 mb-1">
          <span className="font-medium text-gray-800">Client Name:</span> {item.clientName || "-"}
        </div>
        <div className="text-sm text-gray-600 mb-1">
          <span className="font-medium text-gray-800">SC Name:</span> {item.scName || "-"}
        </div>
        <div className="text-sm text-gray-600 mb-1">
          <span className="font-medium text-gray-800">CRM Name:</span> {item.crmName || "-"}
        </div>
        <div className="text-sm text-gray-600 mb-4">
          <span className="font-medium text-gray-800">GST:</span> {item.gstNumber || "-"}
        </div>
        <div className="flex justify-end gap-2 mt-2 pt-2 border-t">
          <button type="button" onClick={() => handleOpenModal("edit", item)} className="flex h-8 w-8 items-center justify-center rounded-md transition-colors text-info hover:bg-accent" aria-label={`Edit ${item.companyName}`}><Pencil size={16} aria-hidden="true" /></button>
          <button type="button" onClick={() => handleDelete(item)} className="flex h-8 w-8 items-center justify-center rounded-md transition-colors text-destructive hover:bg-destructive/10" aria-label={`Delete ${item.companyName}`}><Trash2 size={16} aria-hidden="true" /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 gap-3">
        {/* Top Tab Switcher & Controls Section */}
        <div className="flex flex-col gap-3 shrink-0">
          <StatusTabs
            variant="underline"
            label="Client lists"
            activeTab={activeTab}
            onChange={(id) => { setActiveTab(id); setCurrentPage(1); }}
            tabs={[
              { id: "converted", label: "Converted Clients", count: convertedCount },
              { id: "unconverted", label: "Unconverted Clients", count: unconvertedCount },
              { id: "new", label: "Lost Clients", count: newCount },
            ]}
          />

          <div className="flex flex-wrap items-center gap-2 shrink-0 w-full">
            {/* Search Bar -- also matches company_name/state/GST/SC/CRM/etc
                (see applyCommonFilters), so there's no separate Company/State
                dropdown duplicating it. */}
            <FilterSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by company, state, GST, SC, CRM..."
              className="max-w-[360px]"
            />

            {/* Relevance / Already In Tracker / Status, grouped into one popover */}
            <div className="relative shrink-0" ref={filtersPopoverRef}>
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={showFiltersPopover}
                onClick={() => setShowFiltersPopover(prev => !prev)}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                <span>Filters</span>
                {moreFiltersActiveCount > 0 && (
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                    {moreFiltersActiveCount}
                  </span>
                )}
              </button>

              {showFiltersPopover && (
                <div
                  role="group"
                  aria-label="More filters"
                  onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setShowFiltersPopover(false); } }}
                  className="absolute left-0 top-full z-50 mt-1 w-72 space-y-4 rounded-md border bg-popover p-4 shadow-lg"
                >
                  <div>
                    <label htmlFor="client-filter-tracker" className="block text-xs font-medium text-muted-foreground mb-1.5">Already In Tracker</label>
                    <select
                      id="client-filter-tracker"
                      value={trackerStatusFilter}
                      onChange={(e) => { setTrackerStatusFilter(e.target.value); setCurrentPage(1); }}
                      className={filterControlClass}
                    >
                      <option value="all">All</option>
                      <option value="safe">Safe to re-engage (none / order received)</option>
                      <option value="none">No tracker yet</option>
                      <option value="order_received">Order received</option>
                      <option value="open">Still open / in progress</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="client-filter-status" className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
                    <select
                      id="client-filter-status"
                      value={newStatusFilter}
                      onChange={(e) => { setNewStatusFilter(e.target.value); setCurrentPage(1); }}
                      className={filterControlClass}
                    >
                      <option value="all">All</option>
                      <option value="new">New - no follow-up yet</option>
                      <option value="followed">Followed up</option>
                    </select>
                  </div>

                  {moreFiltersActiveCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setTrackerStatusFilter("all")
                        setNewStatusFilter("all")
                        setCurrentPage(1)
                      }}
                      className="h-8 w-full rounded-md border border-destructive/30 text-center text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      Reset these filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {(moreFiltersActiveCount > 0 || searchQuery) && (
                <button
                  type="button"
                  className="h-9 px-3 text-sm font-medium text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-md transition-colors shrink-0"
                  onClick={() => {
                    setTrackerStatusFilter("all")
                    setNewStatusFilter("all")
                    setSearchQuery("")
                    setCurrentPage(1)
                  }}
                >
                  Clear Filters
                </button>
              )}
              <button
                type="button"
                onClick={fetchClients}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Refresh clients"
                title="Refresh"
              >
                <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
              </button>

              {/* Column visibility */}
              <div ref={columnToggleRef}>
                <ColumnSelector
                  idPrefix="client-col"
                  options={allHeaders.filter(col => isAdmin() || col.key !== "actions")}
                  visible={Object.fromEntries(allHeaders.map((col) => [col.key, !hiddenColumns.includes(col.key)]))}
                  onToggle={(key) =>
                    setHiddenColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
                  }
                  onSelectAll={() =>
                    setHiddenColumns(hiddenColumns.length === 0 ? allHeaders.map((col) => col.key) : [])
                  }
                  open={showColumnToggle}
                  onOpenChange={setShowColumnToggle}
                />
              </div>

              {isAdmin() && (
                <button
                  type="button"
                  onClick={() => handleOpenModal("add")}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus size={16} aria-hidden="true" />
                  Add Client
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Table Area */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <DataTable
            ariaLabel="Clients"
            emptyTitle="No clients found"
            emptyDescription="Try a different tab, search or filter."
            headers={headers}
            data={clientData}
            renderRow={renderRow}
            renderCard={renderCard}
            minWidth="1600px"
            currentPage={currentPage}
            totalPages={Math.ceil(totalResults / itemsPerPage) || 1}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
            totalResults={totalResults}
            itemsPerPageOptions={[10, 20, 50]}
          />
        </div>

        <ModalForm
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          title={modalMode === "add" ? "Add Client" : "Edit Client"}
          onSubmit={handleSubmit}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="client-field-1" className="block text-sm font-medium text-foreground">Company Name *</label>
              <input id="client-field-1" required value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-2">
              <label htmlFor="client-field-2" className="block text-sm font-medium text-foreground">Client Name</label>
              <input id="client-field-2" value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-2">
              <label htmlFor="client-field-3" className="block text-sm font-medium text-foreground">Client Mobile Number</label>
              <input id="client-field-3" value={formData.clientMobileNumber} onChange={e => setFormData({...formData, clientMobileNumber: e.target.value})} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-2">
              <label htmlFor="client-field-4" className="block text-sm font-medium text-foreground">Company Group Name</label>
              <input id="client-field-4" value={formData.companyGroupName} onChange={e => setFormData({...formData, companyGroupName: e.target.value})} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-2">
              <label htmlFor="client-field-5" className="block text-sm font-medium text-foreground">SC Name</label>
              <input id="client-field-5" value={formData.scName} onChange={e => setFormData({...formData, scName: e.target.value})} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-2">
              <label htmlFor="client-field-6" className="block text-sm font-medium text-foreground">CRM Name</label>
              <input id="client-field-6" value={formData.crmName} onChange={e => setFormData({...formData, crmName: e.target.value})} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-2">
              <label htmlFor="client-field-7" className="block text-sm font-medium text-foreground">State</label>
              <input id="client-field-7" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-2">
              <label htmlFor="client-field-8" className="block text-sm font-medium text-foreground">State Code</label>
              <input id="client-field-8" value={formData.stateCode} onChange={e => setFormData({...formData, stateCode: e.target.value})} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-2">
              <label htmlFor="client-field-9" className="block text-sm font-medium text-foreground">GST Number</label>
              <input id="client-field-9" value={formData.gstNumber} onChange={e => setFormData({...formData, gstNumber: e.target.value})} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-2">
              <label htmlFor="client-field-10" className="block text-sm font-medium text-foreground">Credit Days</label>
              <input id="client-field-10" type="number" value={formData.creditDays} onChange={e => setFormData({...formData, creditDays: e.target.value})} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-2">
              <label htmlFor="client-field-11" className="block text-sm font-medium text-foreground">Credit Limit</label>
              <input id="client-field-11" type="number" step="0.01" value={formData.creditLimit} onChange={e => setFormData({...formData, creditLimit: e.target.value})} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-2">
              <label htmlFor="client-field-12" className="block text-sm font-medium text-foreground">Sales Type</label>
              <select id="client-field-12" value={formData.salesType} onChange={e => setFormData({...formData, salesType: e.target.value})} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none">
                <option value="">Select Sales Type</option>
                <option value="NBD">NBD</option>
                <option value="NBD_CRR">NBD_CRR</option>
                <option value="CRR">CRR</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="client-field-13" className="block text-sm font-medium text-foreground">Billing Address</label>
              <textarea id="client-field-13" value={formData.billingAddress} onChange={e => setFormData({...formData, billingAddress: e.target.value})} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none" rows="2" />
            </div>
          </div>
        </ModalForm>
      {confirmDialog}
    </div>
  );
}

export default ClientMaster;
