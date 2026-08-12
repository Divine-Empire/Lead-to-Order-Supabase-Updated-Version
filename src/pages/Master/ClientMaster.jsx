import { useState, useEffect, useRef, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Pencil, Trash2, RefreshCw, Eye } from "lucide-react";
import DataTable from "../../components/DataTable";
import SearchableDropdown from "../../components/SearchableDropdown";
import supabase from "../../utils/supabase";
import ModalForm from "../../components/ModalForm";
import { TABLES, COLUMNS } from "../../constants/dbSchema";
import { AuthContext } from "../../App";

function ClientMaster() {
  const authContext = useContext(AuthContext) || {};
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
  const [activeTab, setActiveTab] = useState("converted"); // Converted vs Unconverted tab

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (columnToggleRef.current && !columnToggleRef.current.contains(event.target)) {
        setShowColumnToggle(false);
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

  // Filter States
  const [companyFilter, setCompanyFilter] = useState([]);
  const [stateFilter, setStateFilter] = useState([]);
  const [relevanceFilter, setRelevanceFilter] = useState("all");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalResults, setTotalResults] = useState(0);
  const [convertedCount, setConvertedCount] = useState(0);
  const [unconvertedCount, setUnconvertedCount] = useState(0);

  // Lightweight option lists for the filter dropdowns (fetched separately from
  // the paginated table data, since that no longer holds the full dataset)
  const [companyOptions, setCompanyOptions] = useState([]);
  const [stateOptions, setStateOptions] = useState([]);

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
    if (companyFilter.length > 0) q = q.in("company_name", companyFilter);
    if (stateFilter.length > 0) q = q.in("state", stateFilter);
    if (relevanceFilter === "relevant") q = q.eq("isRelevant", true);
    if (relevanceFilter === "not_relevant") q = q.eq("isRelevant", false);
    // Role-based access: non-admin (USER) accounts only ever see clients
    // assigned to their own SC name (plus any delegated alternate access).
    if (!isAdmin()) {
      q = q.in("sc_name", getUsernamesToFilter());
    }
    return q;
  };

  const applyTabFilter = (query, tab) =>
    tab === "converted"
      ? query.not("client_code", "is", null).neq("client_code", "")
      : query.or("client_code.is.null,client_code.eq.");

  const fetchClients = async () => {
    fetchIdRef.current += 1;
    const currentFetchId = fetchIdRef.current;

    setIsLoading(true);
    try {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase.from(TABLES.CLIENT_MASTER).select("*", { count: "exact" });
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
          isRelevant: c.isRelevant !== false,
          trackerStatus
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
      const convertedQuery = applyTabFilter(
        applyCommonFilters(supabase.from(TABLES.CLIENT_MASTER).select("uuid", { count: "exact", head: true })),
        "converted"
      );
      const unconvertedQuery = applyTabFilter(
        applyCommonFilters(supabase.from(TABLES.CLIENT_MASTER).select("uuid", { count: "exact", head: true })),
        "unconverted"
      );
      const [convertedRes, unconvertedRes] = await Promise.all([convertedQuery, unconvertedQuery]);
      setConvertedCount(convertedRes.count || 0);
      setUnconvertedCount(unconvertedRes.count || 0);
    } catch (error) {
      console.error("Error fetching tab counts:", error);
    }
  };

  // Fetches the full distinct list of company names / states just for the
  // filter dropdown options (only 2 lightweight columns, chunked past the
  // 1000-row PostgREST cap) -- independent of the paginated table data.
  const fetchFilterOptions = async () => {
    try {
      const companiesSet = new Set();
      const statesSet = new Set();
      let from = 0;
      const step = 1000;
      let fetchMore = true;

      while (fetchMore) {
        let optionsQuery = supabase
          .from(TABLES.CLIENT_MASTER)
          .select("company_name, state")
          .range(from, from + step - 1);
        if (!isAdmin()) {
          optionsQuery = optionsQuery.in("sc_name", getUsernamesToFilter());
        }
        const { data, error } = await optionsQuery;
        if (error) throw error;

        (data || []).forEach((row) => {
          if (row.company_name) companiesSet.add(row.company_name);
          if (row.state) statesSet.add(row.state);
        });

        if (!data || data.length < step) fetchMore = false;
        else from += step;
      }

      setCompanyOptions(Array.from(companiesSet).sort());
      setStateOptions(Array.from(statesSet).sort());
    } catch (error) {
      console.error("Error fetching filter options:", error);
    }
  };

  useEffect(() => {
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage, activeTab, debouncedSearch, companyFilter, stateFilter, relevanceFilter]);

  useEffect(() => {
    fetchTabCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, companyFilter, stateFilter, relevanceFilter]);

  useEffect(() => {
    fetchFilterOptions();
  }, []);

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
      alert("Cannot save: this client has no uuid. Please refresh and try again.");
      return;
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
      sc_name: formData.scName || null,
      crm_name: formData.crmName || null,
      state_code: formData.stateCode || null,
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
      alert("Failed to save client: " + (err.message || err));
      setIsLoading(false);
    }
  };

  const handleDelete = async (client) => {
    if (!isAdmin()) return; // USER role cannot delete clients
    if (!client?.uuid) {
      alert("Cannot delete: this client has no uuid.");
      return;
    }
    if (window.confirm(`Are you sure you want to delete ${client.companyName}?`)) {
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
        alert("Failed to delete client: " + (err.message || err));
        setIsLoading(false);
      }
    }
  };
  
  const allHeaders = [
    { key: "actions", label: "Actions" },
    { key: "action2", label: "Action 2" },
    { key: "companyName", label: "Company Name" },
    { key: "clientCode", label: "Client Code" },
    { key: "salesType", label: "Sales Type" },
    { key: "relevance", label: "Relevance" },
    { key: "trackerStatus", label: "Already In Tracker" },
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
        <td key="actions" className="px-6 py-4 whitespace-nowrap text-sm text-center">
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => handleOpenModal("edit", row)} className="text-info hover:text-info transition-colors" title="Edit">
              <Pencil size={16} />
            </button>
            <button onClick={() => handleDelete(row)} className="text-destructive hover:text-destructive transition-colors" title="Delete">
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      ),
      action2: (
        <td key="action2" className="px-6 py-4 whitespace-nowrap text-sm text-center">
          <div className="flex items-center justify-center gap-2">
            <button 
              onClick={() => navigate(`/leads?${urlParams}`)}
              className="px-3 py-1 bg-info/10 text-info hover:bg-info/20 rounded-md text-xs font-medium transition-colors"
            >
              Lead
            </button>
            <button 
              onClick={() => navigate(`/enquiry-tracker?action=new-enquiry&${urlParams}`)}
              className="px-3 py-1 bg-success/10 text-success hover:bg-success/20 rounded-md text-xs font-medium transition-colors"
            >
              Enquiry
            </button>
          </div>
        </td>
      ),
      companyName: (
        <td key="companyName" className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-center">{row.companyName}</td>
      ),
      clientCode: (
        <td key="clientCode" className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-primary text-center">
          {row.clientCode ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded border border-primary/20 bg-primary/5 text-primary text-xs font-semibold">
              {row.clientCode}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>
      ),
      relevance: (
        <td key="relevance" className="px-6 py-4 whitespace-nowrap text-sm text-center">
          {row.isRelevant ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
              Relevant
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
              Not Relevant
            </span>
          )}
        </td>
      ),
      salesType: (
        <td key="salesType" className="px-6 py-4 whitespace-nowrap text-sm text-center">
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
        <td key="trackerStatus" className="px-6 py-4 whitespace-nowrap text-sm text-center">
          {row.trackerStatus && row.trackerStatus !== "-" ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded border border-warning/30 bg-warning/5 text-warning-foreground text-xs font-medium shadow-sm">
              {row.trackerStatus}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>
      ),
      clientName: (
        <td key="clientName" className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center">{row.clientName || "-"}</td>
      ),
      clientMobileNumber: (
        <td key="clientMobileNumber" className="px-6 py-4 whitespace-nowrap text-sm text-primary font-medium text-center">{row.clientMobileNumber || "-"}</td>
      ),
      companyGroupName: (
        <td key="companyGroupName" className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center">{row.companyGroupName || "-"}</td>
      ),
      scName: (
        <td key="scName" className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center">
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
        <td key="crmName" className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center">{row.crmName || "-"}</td>
      ),
      state: (
        <td key="state" className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center">{row.state || "-"}</td>
      ),
      stateCode: (
        <td key="stateCode" className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center">{row.stateCode || "-"}</td>
      ),
      gstNumber: (
        <td key="gstNumber" className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center">{row.gstNumber || "-"}</td>
      ),
      billingAddress: (
        <td key="billingAddress" className="px-6 py-4 text-sm text-gray-600 min-w-[200px] truncate max-w-xs text-center" title={row.billingAddress}>{row.billingAddress || "-"}</td>
      ),
      creditDays: (
        <td key="creditDays" className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center">{row.creditDays !== "" ? row.creditDays : "-"}</td>
      ),
      creditLimit: (
        <td key="creditLimit" className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center">{row.creditLimit !== "" ? row.creditLimit : "-"}</td>
      )
    };

    return (
      <tr key={row.uuid || index} className="hover:bg-primary/30 transition-colors border-b border-gray-100 last:border-0">
        {visibleHeaders.map(col => columnCells[col.key])}
      </tr>
    );
  };

  const renderCard = (item, index) => {
    return (
      <div key={item.uuid || index} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
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
        <div className="flex justify-end gap-4 mt-2 pt-2 border-t border-gray-100">
          <button onClick={() => handleOpenModal("edit", item)} className="text-info" title="Edit"><Pencil size={16} /></button>
          <button onClick={() => handleDelete(item)} className="text-destructive" title="Delete"><Trash2 size={16} /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
        
        {/* Top Tab Switcher & Controls Section */}
        <div className="flex flex-col gap-3 mb-3 bg-white shrink-0 p-1">
          {/* Tabs */}
          <div className="flex items-center gap-2 border-b border-gray-200 pb-2 px-1">
            <button
              onClick={() => { setActiveTab("converted"); setCurrentPage(1); }}
              className={`px-4 py-2 font-medium text-sm rounded-t-lg border-b-2 transition-all flex items-center gap-2 ${
                activeTab === "converted"
                  ? "border-primary text-primary bg-primary/50 font-bold"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              Converted Clients
              <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === "converted" ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-600"}`}>
                {convertedCount}
              </span>
            </button>
            <button
              onClick={() => { setActiveTab("unconverted"); setCurrentPage(1); }}
              className={`px-4 py-2 font-medium text-sm rounded-t-lg border-b-2 transition-all flex items-center gap-2 ${
                activeTab === "unconverted"
                  ? "border-warning/40 text-warning-foreground bg-warning/50 font-bold"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              Unconverted Clients
              <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === "unconverted" ? "bg-warning/15 text-warning-foreground" : "bg-gray-100 text-gray-600"}`}>
                {unconvertedCount}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 pb-1 w-full">
            
            {/* Title / Label */}
            <div className="text-lg font-bold text-gray-800 shrink-0 mr-2 border-r border-gray-200 pr-4">
              {activeTab === "converted" ? "Converted Clients" : "Unconverted Clients"}
            </div>

            {/* Search Bar */}
            <div className="relative flex-1 min-w-[150px] max-w-[200px]">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-primary block pl-10 h-9"
              />
            </div>

            {/* Dropdown Filters */}
            <div className="flex-1 min-w-[120px] max-w-[200px] z-[60]">
              <SearchableDropdown
                isMulti={true}
                value={companyFilter}
                onChange={(val) => { setCompanyFilter(val); setCurrentPage(1); }}
                options={companyOptions.map(c => ({ value: c, label: c, count: 1 }))}
                placeholder="All Companies"
                height="h-9"
                rounded="rounded-md"
                className="dropdown-container"
              />
            </div>

            <div className="flex-1 min-w-[120px] max-w-[200px] z-[40]">
              <SearchableDropdown
                isMulti={true}
                value={stateFilter}
                onChange={(val) => { setStateFilter(val); setCurrentPage(1); }}
                options={stateOptions.map(s => ({ value: s, label: s, count: 1 }))}
                placeholder="All States"
                height="h-9"
                rounded="rounded-md"
                className="dropdown-container"
              />
            </div>

            <div className="flex-1 min-w-[120px] max-w-[200px] z-[30]">
              <select
                value={relevanceFilter}
                onChange={(e) => { setRelevanceFilter(e.target.value); setCurrentPage(1); }}
                className="w-full h-9 px-3 bg-white border border-gray-300 text-gray-900 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Relevance</option>
                <option value="relevant">Relevant Only</option>
                <option value="not_relevant">Not Relevant Only</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {((companyFilter.length > 0) || (stateFilter.length > 0) || relevanceFilter !== "all" || searchQuery) && (
                <button
                  className="px-3 h-9 text-sm text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-md transition-colors shrink-0"
                  onClick={() => {
                    setCompanyFilter([])
                    setStateFilter([])
                    setRelevanceFilter("all")
                    setSearchQuery("")
                    setCurrentPage(1)
                  }}
                >
                  Clear Filters
                </button>
              )}
              <button onClick={fetchClients} className="px-3 h-9 bg-white border border-gray-300 rounded-md shadow-sm text-gray-600 hover:bg-gray-50 hover:text-primary transition-colors" title="Refresh">
                <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
              </button>

              {/* Column Visibility Toggle Button & Popover */}
              <div className="relative" ref={columnToggleRef}>
                <button
                  type="button"
                  onClick={() => setShowColumnToggle(prev => !prev)}
                  className="px-3 h-9 bg-white border border-gray-300 rounded-md shadow-sm text-gray-700 hover:bg-gray-50 font-medium text-sm transition-colors flex items-center gap-2"
                  title="Toggle Column Visibility"
                >
                  <Eye size={16} />
                  <span>Columns</span>
                </button>

                {showColumnToggle && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-2 max-h-80 overflow-y-auto">
                    <div className="text-xs font-bold text-gray-500 uppercase px-2 py-1 border-b border-gray-100 flex justify-between items-center mb-1">
                      <span>Visible Columns</span>
                      <button 
                        onClick={() => setHiddenColumns([])}
                        className="text-[11px] text-primary hover:underline capitalize font-normal"
                      >
                        Show All
                      </button>
                    </div>
                    {allHeaders.filter(col => isAdmin() || col.key !== "actions").map(col => (
                      <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded text-xs font-medium text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!hiddenColumns.includes(col.key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setHiddenColumns(hiddenColumns.filter(k => k !== col.key));
                            } else {
                              setHiddenColumns([...hiddenColumns, col.key]);
                            }
                          }}
                          className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {isAdmin() && (
                <button onClick={() => handleOpenModal("add")} className="px-3 h-9 bg-primary hover:opacity-90 text-white rounded-md shadow-sm transition-colors flex items-center gap-2">
                  <Plus size={16} />
                  <span className="font-medium text-sm">Add Client</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Table Area */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <DataTable
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
              <label className="block text-sm font-medium text-gray-700">Company Name *</label>
              <input required value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Client Name</label>
              <input value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Client Mobile Number</label>
              <input value={formData.clientMobileNumber} onChange={e => setFormData({...formData, clientMobileNumber: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Company Group Name</label>
              <input value={formData.companyGroupName} onChange={e => setFormData({...formData, companyGroupName: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">SC Name</label>
              <input value={formData.scName} onChange={e => setFormData({...formData, scName: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">CRM Name</label>
              <input value={formData.crmName} onChange={e => setFormData({...formData, crmName: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">State</label>
              <input value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">State Code</label>
              <input value={formData.stateCode} onChange={e => setFormData({...formData, stateCode: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">GST Number</label>
              <input value={formData.gstNumber} onChange={e => setFormData({...formData, gstNumber: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Credit Days</label>
              <input type="number" value={formData.creditDays} onChange={e => setFormData({...formData, creditDays: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Credit Limit</label>
              <input type="number" step="0.01" value={formData.creditLimit} onChange={e => setFormData({...formData, creditLimit: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Sales Type</label>
              <select value={formData.salesType} onChange={e => setFormData({...formData, salesType: e.target.value})} className="w-full px-3 py-2 border rounded-md bg-white">
                <option value="">Select Sales Type</option>
                <option value="NBD">NBD</option>
                <option value="NBD_CRR">NBD_CRR</option>
                <option value="CRR">CRR</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Billing Address</label>
              <textarea value={formData.billingAddress} onChange={e => setFormData({...formData, billingAddress: e.target.value})} className="w-full px-3 py-2 border rounded-md" rows="2" />
            </div>
          </div>
        </ModalForm>
    </div>
  );
}

export default ClientMaster;
