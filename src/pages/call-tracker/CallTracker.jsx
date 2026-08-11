"use client";

import { useState, useEffect, useContext, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { SearchIcon, ArrowRightIcon, EyeIcon } from "../../components/Icons";
import { AuthContext } from "../../App";
import supabase from "../../utils/supabase";
import SearchableDropdown from "../../components/SearchableDropdown";
import DataTable from "../../components/DataTable";
import CallTrackerFilter from "../../components/call-tracker/CallTrackerFilter";
import NewCallTracker from "./CallTrackerForm";
import { formatDateToDDMMYYYY } from "../../utils/formatDate";
import {
  usePendingCallTracker,
  useHistoryCallTracker,
  fetchCallTrackerFilterTypeCounts,
  fetchCallTrackerHistoryDateCounts,
  fetchCallTrackerDateFilterCounts,
  fetchCallTrackerScNameOptions,
  fetchPendingFilterOptionsSource,
} from "./queries";

function CallTracker() {
  const authContext = useContext(AuthContext) || {};
  const {
    currentUser = null,
    isAdmin = () => false,
    getUsernamesToFilter = () => []
  } = authContext;
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  // Lightweight source for CallTrackerFilter's Company/Person/Phone dropdown
  // options -- separate from the true paginated pendingFollowUps below, since
  // those options need to span every pending row, not just the current page.
  const [pendingOptionsSource, setPendingOptionsSource] = useState([]);
  const [activeTab, setActiveTabState] = useState(() => {
    return localStorage.getItem("callTrackerActiveTab") || "pending";
  });
  const setActiveTab = (tabOrFn) => {
    setActiveTabState((prev) => {
      const nextTab = typeof tabOrFn === "function" ? tabOrFn(prev) : tabOrFn;
      if (typeof nextTab === "string") {
        localStorage.setItem("callTrackerActiveTab", nextTab);
      }
      return nextTab;
    });
  };
  const [pendingFollowUps, setPendingFollowUps] = useState([]);
  const [historyFollowUps, setHistoryFollowUps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState([]);
  const [personFilter, setPersonFilter] = useState([]);
  const [phoneFilter, setPhoneFilter] = useState([]);
  const [scNameFilter,] = useState([]);
  const [startDate,] = useState("");
  const [endDate,] = useState("");
  const [, setUniqueScNames] = useState({
    pending: [],
    history: [],
  });
  const [, setFilterTypeCounts] = useState({ all: 0, first: 0, multi: 0 });
  const [dateFilterCounts, setDateFilterCounts] = useState({ today: 0, overdue: 0, upcoming: 0 });

  const [editingRowId, setEditingRowId] = useState(null);
  const [editedData, setEditedData] = useState({});

  const [, setHistoryCounts] = useState({ today: 0, older: 0 });
  const [, setFilteredCount] = useState(0);

  const [visibleColumns, setVisibleColumns] = useState({
    actions: false, // Hidden by default for history as per request
    edit: true,
    timestamp: true,
    callingCount: true,
    enquiryCallingCount: true, // New column
    noOfFollowUps: true, // Output column for total records in leads_tracker
    lastFollowUpStatus: true,
    leadNo: true,
    companyName: true,
    personName: true,
    phoneNumber: true,
    enquiryStatus: true,
    receivedDate: true,
    state: true,
    projectName: true,
    salesType: true,
    productDate: true,
    projectValue: true,
    item1: true,
    qty1: true,
    item2: true,
    qty2: true,
    item3: true,
    qty3: true,
    item4: true,
    qty4: true,
    item5: true,
    qty5: true,
    nextAction: true,
    callDate: true,
    callTime: true,
    itemQty: true,
  });
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);

  // Modal states for Call Now and Details
  const [selectedDetailsRow, setSelectedDetailsRow] = useState(null);
  const [selectedCallNowRow, setSelectedCallNowRow] = useState(null);

  // Pending column visibility (checked = visible by default)
  const [pendingVisibleColumns, setPendingVisibleColumns] = useState({
    actions: true,
    edit: true,
    leadId: true,
    companyName: true,
    personName: true,
    phoneNumber: true,
    leadSource: true,
    location: true,
    customerSay: true,
    enquiryStatus: true,
    lastFollowUpDate: true,
    noOfFollowUps: true,
    lastFollowUpStatus: true,
    assignedTo: true,
    nextAction: true,
    nextCallDate: true,
    handlePerson: true,
    email: true,
    state: false,
    address: false,
    personName1: false,
    designation1: false,
    phoneNumber1: false,
    personName2: false,
    designation2: false,
    phoneNumber2: false,
    personName3: false,
    designation3: false,
    phoneNumber3: false,
    natureOfBusiness: false,
    gst: false,
    customerRegForm: false,
    creditAccess: false,
    creditDays: false,
    creditLimit: false,
    additionalNotes: false,
    groupName: false,
    details: true,
  });
  const [showPendingColumnDropdown, setShowPendingColumnDropdown] = useState(false);

  const pendingColumnOptions = [
    { key: "actions", label: "Actions" },
    { key: "edit", label: "Edit" },
    { key: "leadId", label: "Lead No." },
    { key: "companyName", label: "Company Name" },
    { key: "personName", label: "Person Name" },
    { key: "phoneNumber", label: "Phone No." },
    { key: "leadSource", label: "Enquiry Source" },
    { key: "location", label: "Location" },
    { key: "customerSay", label: "Customer Say" },
    { key: "enquiryStatus", label: "Enquiry Status" },
    { key: "handlePerson", label: "Handle Person" },
    { key: "email", label: "Email Address" },
    { key: "lastFollowUpDate", label: "Last Follow Up Date" },
    { key: "noOfFollowUps", label: "No. of FollowUps" },
    { key: "lastFollowUpStatus", label: "Last FollowUp Status" },
    { key: "assignedTo", label: "Assigned To" },
    { key: "nextAction", label: "Next Action" },
    { key: "nextCallDate", label: "Next Call Date" },
    { key: "state", label: "State" },
    { key: "address", label: "Address" },
    { key: "personName1", label: "Person Name 1" },
    { key: "designation1", label: "Designation 1" },
    { key: "phoneNumber1", label: "Phone Number 1" },
    { key: "personName2", label: "Person Name 2" },
    { key: "designation2", label: "Designation 2" },
    { key: "phoneNumber2", label: "Phone Number 2" },
    { key: "personName3", label: "Person Name 3" },
    { key: "designation3", label: "Designation 3" },
    { key: "phoneNumber3", label: "Phone Number 3" },
    { key: "natureOfBusiness", label: "Nature of Business" },
    { key: "gst", label: "GST Number" },
    { key: "customerRegForm", label: "Customer Registration Form" },
    { key: "creditAccess", label: "Credit Access" },
    { key: "creditDays", label: "Credit Days" },
    { key: "creditLimit", label: "Credit Limit" },
    { key: "additionalNotes", label: "Additional Notes" },
    { key: "groupName", label: "Group Name" },
    { key: "details", label: "Details" },
  ];

  // Helper functions
  const determinePriority = (source) => {
    if (!source) return "Low";
    const sourceLower = source.toLowerCase();
    if (sourceLower.includes("indiamart")) return "High";
    if (sourceLower.includes("website")) return "Medium";
    return "Low";
  };

  const formatNextCallTime = (timeValue) => {
    if (!timeValue) return "";

    try {
      if (typeof timeValue === "string" && timeValue.startsWith("Date(")) {
        const timeString = timeValue.substring(5, timeValue.length - 1);
        const [, , , hours, minutes] = timeString
          .split(",")
          .map((part) => Number.parseInt(part.trim()));

        const formattedHours = hours % 12 || 12;
        const period = hours >= 12 ? "PM" : "AM";
        const formattedMinutes = minutes.toString().padStart(2, "0");

        return `${formattedHours}:${formattedMinutes} ${period}`;
      }

      if (
        typeof timeValue === "string" &&
        /^\d{2}:\d{2}:\d{2}$/.test(timeValue)
      ) {
        const [hours, minutes] = timeValue.split(":").map(Number);
        const formattedHours = hours % 12 || 12;
        const period = hours >= 12 ? "PM" : "AM";
        const formattedMinutes = minutes.toString().padStart(2, "0");

        return `${formattedHours}:${formattedMinutes} ${period}`;
      }

      return timeValue;
    } catch (error) {
      console.error("Error formatting time:", error);
      return timeValue;
    }
  };

  // Uses imported formatDateToDDMMYYYY from src/utils/formatDate

  const formatItemQty = (itemQtyString) => {
    if (!itemQtyString) return "";

    try {
      const items = JSON.parse(itemQtyString);
      return items
        .filter((item) => item.name && item.quantity && item.quantity !== "0")
        .map((item) => `${item.name} : ${item.quantity}`)
        .join(", ");
    } catch (error) {
      console.error("Error parsing item quantity:", error);
      return itemQtyString;
    }
  };

  const handleEditClick = (followUp, index) => {
    setEditingRowId(index);
    setEditedData({ ...followUp, id: followUp.id });
  };


  const convertDateToYYYYMMDD = (dateStr) => {
    if (!dateStr) return null;

    try {
      // If already in YYYY-MM-DD format, return as is
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
      }

      // Convert DD/MM/YYYY to YYYY-MM-DD
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split("/");
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }

      return dateStr;
    } catch (error) {
      console.error("Error converting date:", error);
      return dateStr;
    }
  };

  const convertTimeTo24Hour = (timeStr) => {
    if (!timeStr) return null;

    try {
      // If already in HH:MM:SS format, return as is
      if (/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
        return timeStr;
      }

      // Convert "2:30 PM" to "14:30:00"
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (match) {
        let hours = parseInt(match[1]);
        const minutes = match[2];
        const period = match[3].toUpperCase();

        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;

        return `${hours.toString().padStart(2, "0")}:${minutes}:00`;
      }

      return timeStr;
    } catch (error) {
      console.error("Error converting time:", error);
      return timeStr;
    }
  };

  const handleSaveClick = async () => {
    try {
      if (activeTab === "pending") {
        const pendingUpdateData = {
          planned_at: editedData.timestamp ? new Date(convertDateToYYYYMMDD(editedData.timestamp)).toISOString() : undefined,
          company_name: editedData.companyName,
          person_name: editedData.personName,
          phone_number: editedData.phoneNumber,
          lead_source: editedData.leadSource,
          lead_receiver_name: editedData.receiverName,
          sales_type: editedData.enquiryType,
          location: editedData.location,
          additional_notes: editedData.customerSay || editedData.Additional_Notes,
          sc_name: editedData.handlePerson || editedData.assignedTo,
          email_address: editedData.Email_Address,
          state: editedData.State,
          address: editedData.Address,
          nob: editedData.NOB,
          gst_number: editedData.GST_Number,
          customer_registration_form: editedData.Customer_Registration_Form,
          credit_access: editedData.Credit_Access,
          credit_days: editedData.Credit_Days ? Number(editedData.Credit_Days) : undefined,
          credit_limit: editedData.Credit_Limit ? Number(editedData.Credit_Limit) : undefined,
        };

        // Remove undefined/null values
        Object.keys(pendingUpdateData).forEach((key) => {
          if (pendingUpdateData[key] === undefined || pendingUpdateData[key] === null) {
            delete pendingUpdateData[key];
          }
        });

        const { error } = await supabase
          .from("lto_leads")
          .update(pendingUpdateData)
          .eq("id", editedData.id);

        if (error) throw error;

        alert("Updated successfully!");
        fetchFollowUpData(currentPage, false, searchTerm);
        setEditingRowId(null);
        setEditedData({});
        return;
      }

      // Logic for History tab (update call_tracker_for_leads)
      // Note: company_name is NOT a column on lto_call_tracker_for_leads --
      // it lives on lto_leads and is edited via the Pending tab branch above.
      const updateData = {
        what_did_customer_say: editedData.customerSay,
        enquiry_received_status: editedData.enquiryStatus || editedData.status,
        enquiry_received_date: convertDateToYYYYMMDD(editedData.enquiryReceivedDate),
        enquiry_for_state: editedData.enquiryState,
        project_name: editedData.projectName,
        enquiry_type: editedData.salesType,
        project_approximate_value: editedData.projectApproxValue ? Number(editedData.projectApproxValue) : null,
        next_action: editedData.nextAction,
        next_call_date: convertDateToYYYYMMDD(editedData.nextCallDate),
        next_call_time: convertTimeTo24Hour(editedData.nextCallTime),
        sc_name: editedData.handlePerson || editedData.assignedTo,
      };

      // Remove undefined/null values
      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined || updateData[key] === null) {
          delete updateData[key];
        }
      });

      const { error: trackerError } = await supabase
        .from("lto_call_tracker_for_leads")
        .update(updateData)
        .eq("id", editedData.id);

      if (trackerError) {
        throw new Error(`call_tracker_for_leads update failed: ${trackerError.message}`);
      }

      alert("Updated successfully!");
      fetchFollowUpData(currentPage, false, searchTerm);
      setEditingRowId(null);
      setEditedData({});
    } catch (error) {
      console.error("Error updating:", error);
      alert(`Error updating: ${error.message}`);
    }
  };

  const handleCancelClick = () => {
    setEditingRowId(null);
    setEditedData({});
  };

  const handleFieldChange = (field, value) => {
    setEditedData((prev) => ({ ...prev, [field]: value }));
  };

  // ─── Server-side paginated + filtered data ─────────────────────────────
  // Replaces the old fetchFollowUpData (which loaded the ENTIRE matching set
  // for both tabs on every fetch, then paginated client-side). Every filter
  // is now a real WHERE clause against call_tracker_pending_view /
  // call_tracker_history_view, and .range() does true page-N addressing.
  const usernamesToFilter = isAdmin() ? [] : getUsernamesToFilter();

  // Debounce the search box so the DB query itself only fires once typing
  // pauses, not once per keystroke.
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const pendingQuery = usePendingCallTracker({
    page: currentPage,
    itemsPerPage,
    searchTerm: debouncedSearchTerm,
    scNameFilter,
    personFilter,
    phoneFilter,
    dateFilter,
    isAdmin: isAdmin(),
    usernamesToFilter,
    enabled: activeTab === "pending",
  });

  const historyQuery = useHistoryCallTracker({
    page: currentPage,
    itemsPerPage,
    searchTerm: debouncedSearchTerm,
    scNameFilter,
    companyFilter,
    filterType,
    dateFilter,
    startDate,
    endDate,
    isAdmin: isAdmin(),
    usernamesToFilter,
    enabled: activeTab === "history",
  });

  const mapPendingRow = (row) => ({
    timestamp: row.created_at ? formatDateToDDMMYYYY(row.created_at) : "",
    id: row.record_id,
    leadId: row.display_no || "",
    companyName: row.company_name || "",
    personName: row.person_name || "",
    phoneNumber: row.phone_number || "",
    leadSource: row.lead_source || "",
    receiverName: row.receiver_name || "",
    enquiryType: row.sales_type || "",
    location: row.location || "",
    customerSay: row.customer_say || "",
    enquiryStatus: row.enquiry_status || "",
    createdAt: row.created_at || "",
    nextCallDate: row.next_call_date ? formatDateToDDMMYYYY(row.next_call_date) : "",
    nextAction: row.next_action || "",
    priority: determinePriority(row.lead_source || ""),
    assignedTo: row.assigned_to || "",
    handlePerson: row.assigned_to || "",
    Email_Address: row.email_address || "",
    State: row.state || "",
    Address: row.address || "",
    NOB: row.nob || "",
    GST_Number: row.gst_number || "",
    Customer_Registration_Form: row.customer_registration_form || "",
    Credit_Access: row.credit_access || "",
    Credit_Days: row.credit_days || "",
    Credit_Limit: row.credit_limit || "",
    Additional_Notes: row.additional_notes || "",
    noOfFollowUps: row.no_of_follow_ups || 0,
    lastFollowUpStatus: row.last_follow_up_status || "",
    lastFollowUpDate: row.last_follow_up_date ? formatDateToDDMMYYYY(row.last_follow_up_date) : "",
    // Pending tab never did expensive lookups for these -- kept as-is.
    callingCount: "-",
    enquiryCallingCount: "-",
    companyCount: "-",
  });

  const mapHistoryRow = (row) => ({
    id: row.id,
    leadId: row.lead_no || "",
    leadNo: row.lead_no || "",
    companyName: row.company_name || "",
    personName: row.person_name || "",
    phoneNumber: row.phone_number || "",
    handlePerson: row.handle_person || "",
    customerSay: row.customer_say || "",
    status: row.status || "",
    enquiryStatus: row.status || "",
    enquiryReceivedStatus: row.status || "",
    enquiryReceivedDate: row.enquiry_received_date ? formatDateToDDMMYYYY(row.enquiry_received_date) : "",
    enquiryState: row.enquiry_state || "",
    projectName: row.project_name || "",
    salesType: row.sales_type || "",
    projectApproxValue: row.project_approximate_value || "",
    nextAction: row.next_action || "",
    nextCallDate: row.next_call_date ? formatDateToDDMMYYYY(row.next_call_date) : "",
    nextCallTime: row.next_call_time ? formatNextCallTime(row.next_call_time) : "",
    assignedTo: row.assigned_to || "",
    timestamp: row.created_at ? formatDateToDDMMYYYY(row.created_at) : "",
    delay: row.delay || "",
    plannedAt: row.planned_at ? formatDateToDDMMYYYY(row.planned_at) : "",
    companyCount: row.company_count || 0,
    callingCount: row.calling_count || 0,
    enquiryCallingCount: row.enquiry_calling_count || 0,
    noOfFollowUps: row.no_of_follow_ups || 0,
    lastFollowUpStatus: row.last_follow_up_status || "",
  });

  useEffect(() => {
    if (activeTab !== "pending" || !pendingQuery.data) return;
    setPendingFollowUps(pendingQuery.data.rows.map(mapPendingRow));
  }, [activeTab, pendingQuery.data]);

  useEffect(() => {
    if (activeTab !== "history" || !historyQuery.data) return;
    setHistoryFollowUps(historyQuery.data.rows.map(mapHistoryRow));
    setFilteredCount(historyQuery.data.totalCount);
  }, [activeTab, historyQuery.data]);

  useEffect(() => {
    setIsLoading(activeTab === "pending" ? pendingQuery.isLoading : historyQuery.isLoading);
  }, [activeTab, pendingQuery.isLoading, historyQuery.isLoading]);

  // Thin invalidate shim, kept under the old name/call-signature so the
  // existing save-handler / modal-close call sites don't need to change --
  // TanStack Query refetches automatically once its cache is invalidated.
  const fetchFollowUpData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["callTracker"] });
  }, [queryClient]);

  // Filter-dropdown option lists (SC name, company/person/phone) and the
  // tab/filter-type/date badge counts -- lightweight count-only or
  // narrow-column queries, independent of whatever's on the current page.
  useEffect(() => {
    fetchCallTrackerScNameOptions().then(setUniqueScNames);
  }, [pendingQuery.data, historyQuery.data]);

  useEffect(() => {
    fetchPendingFilterOptionsSource().then(setPendingOptionsSource);
  }, [pendingQuery.data]);

  useEffect(() => {
    fetchCallTrackerFilterTypeCounts({
      activeTab,
      scNameFilter,
      companyFilter,
      isAdmin: isAdmin(),
      usernamesToFilter,
    }).then(setFilterTypeCounts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, scNameFilter, companyFilter, currentUser]);

  useEffect(() => {
    if (activeTab !== "history") return;
    fetchCallTrackerHistoryDateCounts({ scNameFilter, isAdmin: isAdmin(), usernamesToFilter }).then(setHistoryCounts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, scNameFilter, currentUser]);

  useEffect(() => {
    if (activeTab !== "pending") return;
    fetchCallTrackerDateFilterCounts({
      searchTerm: debouncedSearchTerm,
      scNameFilter,
      isAdmin: isAdmin(),
      usernamesToFilter,
    }).then(setDateFilterCounts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, debouncedSearchTerm, scNameFilter, currentUser]);

  // Reset to page 1 whenever any filter (including the debounced search
  // term, once it settles) changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, dateFilter, companyFilter, personFilter, phoneFilter, scNameFilter, filterType, currentUser, debouncedSearchTerm]);

  const handleColumnToggle = (columnKey) => {
    setVisibleColumns((prev) => ({
      ...prev,
      [columnKey]: !prev[columnKey],
    }));
  };

  const handleSelectAll = () => {
    const allSelected = Object.values(visibleColumns).every(Boolean);
    const newState = Object.fromEntries(
      Object.keys(visibleColumns).map((key) => [key, !allSelected])
    );
    setVisibleColumns(newState);
  };

  const columnOptions = [
    { key: "actions", label: "Actions" },
    { key: "edit", label: "Edit" },
    { key: "timestamp", label: "Timestamp" },
    { key: "callingCount", label: "Calling Count" },
    { key: "enquiryCallingCount", label: "Enquiry Calling Count" }, // New column
    { key: "noOfFollowUps", label: "No. of FollowUps" }, // New column
    { key: "lastFollowUpStatus", label: "Last FollowUp Status" },
    { key: "leadNo", label: "Lead No." },
    { key: "companyName", label: "Company Name" },
    { key: "personName", label: "Person Name" },
    { key: "phoneNumber", label: "Phone Number" },
    { key: "customerSay", label: "Customer Say" },
    { key: "status", label: "Status" },
    { key: "enquiryStatus", label: "Enquiry Status" },
    { key: "receivedDate", label: "Received Date" },
    { key: "state", label: "State" },
    { key: "projectName", label: "Project Name" },
    { key: "salesType", label: "Sales Type" },
    { key: "productDate", label: "Product Date" },
    { key: "projectValue", label: "Project Value" },
    { key: "item1", label: "Item 1" },
    { key: "qty1", label: "Qty 1" },
    { key: "item2", label: "Item 2" },
    { key: "qty2", label: "Qty 2" },
    { key: "item3", label: "Item 3" },
    { key: "qty3", label: "Qty 3" },
    { key: "item4", label: "Item 4" },
    { key: "qty4", label: "Qty 4" },
    { key: "item5", label: "Item 5" },
    { key: "qty5", label: "Qty 5" },
    { key: "nextAction", label: "Next Action" },
    { key: "callDate", label: "Call Date" },
    { key: "callTime", label: "Call Time" },
    { key: "itemQty", label: "Item/Qty" },
  ];


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showColumnDropdown && !event.target.closest(".relative")) {
        setShowColumnDropdown(false);
      }
      if (showPendingColumnDropdown && !event.target.closest(".relative")) {
        setShowPendingColumnDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showColumnDropdown, showPendingColumnDropdown]);

  // Cell rendering helpers for Pending tab
  const renderPendingCell = (followUp, columnKey, index) => {
    switch (columnKey) {
      case "actions":
        return (
          <td key="actions" className="sticky left-0 z-10 bg-white px-3 sm:px-4 py-3 sm:py-4 text-sm font-medium border-r border-gray-200">
            <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2">
              <button
                onClick={() => setSelectedCallNowRow(followUp)}
                className="w-full sm:w-auto px-2 sm:px-3 py-1 text-xs border border-primary/30 text-primary hover:bg-primary/5 rounded-md transition-colors whitespace-nowrap"
              >
                Call Now <ArrowRightIcon className="ml-1 h-3 w-3 inline" />
              </button>
            </div>
          </td>
        );
      case "details":
        return (
          <td key="details" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap text-center">
            <button
              onClick={() => setSelectedDetailsRow(followUp)}
              title="View Details"
              className="p-1.5 text-primary hover:text-primary hover:bg-primary/5 rounded-full transition-colors inline-flex items-center justify-center"
            >
              <EyeIcon className="h-4 w-4" />
            </button>
          </td>
        );
      case "edit":
        return (
          <td key="edit" className="px-3 sm:px-4 py-3 sm:py-4 text-sm font-medium border-r border-gray-200">
            {editingRowId === index ? (
              <div className="flex space-x-2">
                <button
                  onClick={() => handleSaveClick(index)}
                  className="px-2 py-1 text-xs bg-success text-white rounded hover:bg-success"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelClick}
                  className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleEditClick(followUp, index)}
                className="px-3 py-1 text-xs border border-info/30 text-info hover:bg-info/10 rounded"
              >
                Edit
              </button>
            )}
          </td>
        );
      case "timestamp":
        return (
          <td key="timestamp" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="date"
                value={convertDateToYYYYMMDD(editedData.timestamp) || ""}
                onChange={(e) => handleFieldChange("timestamp", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.timestamp
            )}
          </td>
        );
      case "leadId":
        return (
          <td key="leadId" className="px-3 sm:px-4 py-3 sm:py-4 text-sm font-semibold text-gray-900 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.leadId || ""}
                onChange={(e) => handleFieldChange("leadId", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.leadId
            )}
          </td>
        );
      case "enquiryType":
        return (
          <td key="enquiryType" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {followUp.enquiryType}
          </td>
        );
      case "leadSource":
        return (
          <td key="leadSource" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.leadSource || ""}
                onChange={(e) => handleFieldChange("leadSource", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${followUp.priority === "High"
                  ? "bg-destructive/10 text-destructive"
                  : followUp.priority === "Medium"
                    ? "bg-primary/10 text-primary"
                    : "bg-slate-100 text-slate-800"
                  }`}
              >
                {followUp.leadSource}
              </span>
            )}
          </td>
        );
      case "companyName":
        return (
          <td key="companyName" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-900 font-semibold">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.companyName || ""}
                onChange={(e) => handleFieldChange("companyName", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              <div className="max-w-[200px] whitespace-normal break-words">{followUp.companyName}</div>
            )}
          </td>
        );
      case "personName":
        return (
          <td key="personName" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.personName || ""}
                onChange={(e) => handleFieldChange("personName", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              <div className="max-w-[150px] whitespace-normal break-words">{followUp.personName}</div>
            )}
          </td>
        );
      case "handlePerson":
        return (
          <td key="handlePerson" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.handlePerson || ""}
                onChange={(e) => handleFieldChange("handlePerson", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.handlePerson || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "phoneNumber":
        return (
          <td key="phoneNumber" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.phoneNumber || ""}
                onChange={(e) => handleFieldChange("phoneNumber", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.phoneNumber
            )}
          </td>
        );
      case "lastFollowUpDate":
        return (
          <td key="lastFollowUpDate" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {followUp.lastFollowUpDate || <span className="text-gray-300">—</span>}
          </td>
        );
      case "nextCallDate":
        return (
          <td key="nextCallDate" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="date"
                value={convertDateToYYYYMMDD(editedData.nextCallDate) || ""}
                onChange={(e) => handleFieldChange("nextCallDate", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.nextCallDate || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "customerSay":
        return (
          <td key="customerSay" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500">
            {editingRowId === index ? (
              <textarea
                value={editedData.customerSay || ""}
                onChange={(e) => handleFieldChange("customerSay", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                rows="2"
              />
            ) : (
              <div className="max-w-[200px] whitespace-normal break-words">{followUp.customerSay}</div>
            )}
          </td>
        );
      case "noOfFollowUps":
        return (
          <td key="noOfFollowUps" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {followUp.noOfFollowUps > 0 ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                {followUp.noOfFollowUps}
              </span>
            ) : (
              "-"
            )}
          </td>
        );
      case "address":
        return (
          <td key="address" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Address || ""}
                onChange={(e) => handleFieldChange("Address", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Address || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "receiverName":
        return (
          <td key="receiverName" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {followUp.receiverName || <span className="text-gray-300">—</span>}
          </td>
        );
      case "assignedTo":
        return (
          <td key="assignedTo" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.assignedTo || ""}
                onChange={(e) => handleFieldChange("assignedTo", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.assignedTo
            )}
          </td>
        );
      case "lastFollowUpStatus":
        return (
          <td key="lastFollowUpStatus" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {followUp.lastFollowUpStatus || <span className="text-gray-300">—</span>}
          </td>
        );
      case "nextAction":
        return (
          <td key="nextAction" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.nextAction || ""}
                onChange={(e) => handleFieldChange("nextAction", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              <div className="max-w-[150px] whitespace-normal break-words">{followUp.nextAction}</div>
            )}
          </td>
        );
      case "location":
        return (
          <td key="location" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.location || ""}
                onChange={(e) => handleFieldChange("location", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              <div className="max-w-[150px] whitespace-normal break-words">{followUp.location}</div>
            )}
          </td>
        );
      case "enquiryStatus":
        return (
          <td key="enquiryStatus" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.enquiryStatus || ""}
                onChange={(e) => handleFieldChange("enquiryStatus", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.enquiryStatus || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "email":
        return (
          <td key="email" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Email_Address || ""}
                onChange={(e) => handleFieldChange("Email_Address", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Email_Address || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "state":
        return (
          <td key="state" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.State || ""}
                onChange={(e) => handleFieldChange("State", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.State || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "personName1":
        return (
          <td key="personName1" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Person_name_1 || ""}
                onChange={(e) => handleFieldChange("Person_name_1", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Person_name_1 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "designation1":
        return (
          <td key="designation1" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Designation_1 || ""}
                onChange={(e) => handleFieldChange("Designation_1", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Designation_1 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "phoneNumber1":
        return (
          <td key="phoneNumber1" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Phone_Number_1 || ""}
                onChange={(e) => handleFieldChange("Phone_Number_1", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Phone_Number_1 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "personName2":
        return (
          <td key="personName2" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Person_Name_2 || ""}
                onChange={(e) => handleFieldChange("Person_Name_2", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Person_Name_2 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "designation2":
        return (
          <td key="designation2" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Designation_2 || ""}
                onChange={(e) => handleFieldChange("Designation_2", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Designation_2 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "phoneNumber2":
        return (
          <td key="phoneNumber2" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Phone_Number_2 || ""}
                onChange={(e) => handleFieldChange("Phone_Number_2", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Phone_Number_2 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "personName3":
        return (
          <td key="personName3" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Person_Name_3 || ""}
                onChange={(e) => handleFieldChange("Person_Name_3", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Person_Name_3 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "designation3":
        return (
          <td key="designation3" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Designation_3 || ""}
                onChange={(e) => handleFieldChange("Designation_3", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Designation_3 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "phoneNumber3":
        return (
          <td key="phoneNumber3" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Phone_Number_3 || ""}
                onChange={(e) => handleFieldChange("Phone_Number_3", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Phone_Number_3 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "natureOfBusiness":
        return (
          <td key="natureOfBusiness" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.NOB || ""}
                onChange={(e) => handleFieldChange("NOB", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.NOB || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "gst":
        return (
          <td key="gst" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.GST_Number || ""}
                onChange={(e) => handleFieldChange("GST_Number", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.GST_Number || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "additionalNotes":
        return (
          <td key="additionalNotes" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Additional_Notes || ""}
                onChange={(e) => handleFieldChange("Additional_Notes", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              <div className="max-w-[200px] whitespace-normal break-words">{followUp.Additional_Notes}</div>
            )}
          </td>
        );
      case "groupName":
        return (
          <td key="groupName" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {followUp.groupName || <span className="text-gray-300">—</span>}
          </td>
        );
      case "customerRegForm":
        return (
          <td key="customerRegForm" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Customer_Registration_Form || ""}
                onChange={(e) => handleFieldChange("Customer_Registration_Form", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Customer_Registration_Form || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "creditAccess":
        return (
          <td key="creditAccess" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Credit_Access || ""}
                onChange={(e) => handleFieldChange("Credit_Access", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Credit_Access || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "creditDays":
        return (
          <td key="creditDays" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Credit_Days || ""}
                onChange={(e) => handleFieldChange("Credit_Days", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Credit_Days || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "creditLimit":
        return (
          <td key="creditLimit" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.Credit_Limit || ""}
                onChange={(e) => handleFieldChange("Credit_Limit", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.Credit_Limit || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      default:
        return null;
    }
  };

  // Cell rendering helpers for History tab
  const renderHistoryCell = (followUp, columnKey, index) => {
    switch (columnKey) {
      case "leadNo":
        return (
          <td key="leadNo" className="px-3 sm:px-4 py-3 sm:py-4 text-sm font-semibold text-gray-900 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.leadNo || ""}
                onChange={(e) => handleFieldChange("leadNo", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.leadNo
            )}
          </td>
        );
      case "companyName":
        return (
          <td key="companyName" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-900 font-semibold">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.companyName || ""}
                onChange={(e) => handleFieldChange("companyName", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              <div className="max-w-[200px] whitespace-normal break-words">
                {followUp.companyName}
                {followUp.companyCount > 1 && (
                  <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/5 text-primary border border-primary/30">
                    {followUp.companyCount}
                  </span>
                )}
              </div>
            )}
          </td>
        );
      case "personName":
        return (
          <td key="personName" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500">
            <div className="max-w-[150px] whitespace-normal break-words">{followUp.personName || <span className="text-gray-300">—</span>}</div>
          </td>
        );
      case "handlePerson":
        return (
          <td key="handlePerson" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.handlePerson || ""}
                onChange={(e) => handleFieldChange("handlePerson", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.handlePerson || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "phoneNumber":
        return (
          <td key="phoneNumber" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {followUp.phoneNumber || <span className="text-gray-300">—</span>}
          </td>
        );
      case "nextCallDate":
        return (
          <td key="nextCallDate" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="date"
                value={convertDateToYYYYMMDD(editedData.nextCallDate) || ""}
                onChange={(e) => handleFieldChange("nextCallDate", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.nextCallDate || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "customerSay":
        return (
          <td key="customerSay" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500">
            {editingRowId === index ? (
              <textarea
                value={editedData.customerSay || ""}
                onChange={(e) => handleFieldChange("customerSay", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                rows="2"
              />
            ) : (
              <div className="max-w-[200px] whitespace-normal break-words">{followUp.customerSay}</div>
            )}
          </td>
        );
      case "noOfFollowUps":
        return (
          <td key="noOfFollowUps" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {followUp.noOfFollowUps > 0 ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary">
                {followUp.noOfFollowUps}
              </span>
            ) : (
              "-"
            )}
          </td>
        );
      case "nextAction":
        return (
          <td key="nextAction" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.nextAction || ""}
                onChange={(e) => handleFieldChange("nextAction", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              <div className="max-w-[150px] sm:max-w-[200px] whitespace-normal break-words">{followUp.nextAction}</div>
            )}
          </td>
        );
      case "timestamp":
        return (
          <td key="timestamp" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {followUp.timestamp}
          </td>
        );
      case "callingCount":
        return (
          <td key="callingCount" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {followUp.companyCount}
          </td>
        );
      case "enquiryCallingCount":
        return (
          <td key="enquiryCallingCount" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {followUp.enquiryCallingCount}
          </td>
        );
      case "lastFollowUpStatus":
        return (
          <td key="lastFollowUpStatus" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {followUp.lastFollowUpStatus || <span className="text-gray-300">—</span>}
          </td>
        );
      case "enquiryStatus":
        return (
          <td key="enquiryStatus" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.enquiryStatus || ""}
                onChange={(e) => handleFieldChange("enquiryStatus", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.enquiryStatus || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "receivedDate":
        return (
          <td key="receivedDate" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="date"
                value={convertDateToYYYYMMDD(editedData.enquiryReceivedDate) || ""}
                onChange={(e) => handleFieldChange("enquiryReceivedDate", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.enquiryReceivedDate || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "state":
        return (
          <td key="state" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.enquiryState || ""}
                onChange={(e) => handleFieldChange("enquiryState", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.enquiryState || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "projectName":
        return (
          <td key="projectName" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.projectName || ""}
                onChange={(e) => handleFieldChange("projectName", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              <div className="max-w-[150px] whitespace-normal break-words">{followUp.projectName}</div>
            )}
          </td>
        );
      case "salesType":
        return (
          <td key="salesType" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.salesType || ""}
                onChange={(e) => handleFieldChange("salesType", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.salesType || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "productDate":
        return (
          <td key="productDate" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {followUp.requiredProductDate || <span className="text-gray-300">—</span>}
          </td>
        );
      case "projectValue":
        return (
          <td key="projectValue" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input
                type="text"
                value={editedData.projectApproxValue || ""}
                onChange={(e) => handleFieldChange("projectApproxValue", e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            ) : (
              followUp.projectApproxValue || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "item1":
        return (
          <td key="item1" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input type="text" value={editedData.itemName1 || ""} onChange={(e) => handleFieldChange("itemName1", e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm w-full bg-white" />
            ) : (
              followUp.itemName1 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "qty1":
        return (
          <td key="qty1" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input type="text" value={editedData.quantity1 || ""} onChange={(e) => handleFieldChange("quantity1", e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm w-full bg-white" />
            ) : (
              followUp.quantity1 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "item2":
        return (
          <td key="item2" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input type="text" value={editedData.itemName2 || ""} onChange={(e) => handleFieldChange("itemName2", e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm w-full bg-white" />
            ) : (
              followUp.itemName2 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "qty2":
        return (
          <td key="qty2" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input type="text" value={editedData.quantity2 || ""} onChange={(e) => handleFieldChange("quantity2", e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm w-full bg-white" />
            ) : (
              followUp.quantity2 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "item3":
        return (
          <td key="item3" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input type="text" value={editedData.itemName3 || ""} onChange={(e) => handleFieldChange("itemName3", e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm w-full bg-white" />
            ) : (
              followUp.itemName3 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "qty3":
        return (
          <td key="qty3" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input type="text" value={editedData.quantity3 || ""} onChange={(e) => handleFieldChange("quantity3", e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm w-full bg-white" />
            ) : (
              followUp.quantity3 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "item4":
        return (
          <td key="item4" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input type="text" value={editedData.itemName4 || ""} onChange={(e) => handleFieldChange("itemName4", e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm w-full bg-white" />
            ) : (
              followUp.itemName4 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "qty4":
        return (
          <td key="qty4" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input type="text" value={editedData.quantity4 || ""} onChange={(e) => handleFieldChange("quantity4", e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm w-full bg-white" />
            ) : (
              followUp.quantity4 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "item5":
        return (
          <td key="item5" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input type="text" value={editedData.itemName5 || ""} onChange={(e) => handleFieldChange("itemName5", e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm w-full bg-white" />
            ) : (
              followUp.itemName5 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "qty5":
        return (
          <td key="qty5" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input type="text" value={editedData.quantity5 || ""} onChange={(e) => handleFieldChange("quantity5", e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm w-full bg-white" />
            ) : (
              followUp.quantity5 || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "callDate":
        return (
          <td key="callDate" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input type="date" value={convertDateToYYYYMMDD(editedData.nextCallDate) || ""} onChange={(e) => handleFieldChange("nextCallDate", e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm w-full bg-white" />
            ) : (
              followUp.nextCallDate || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "callTime":
        return (
          <td key="callTime" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input type="text" value={editedData.nextCallTime || ""} onChange={(e) => handleFieldChange("nextCallTime", e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm w-full bg-white" />
            ) : (
              followUp.nextCallTime || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "itemQty":
        return (
          <td key="itemQty" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
            {editingRowId === index ? (
              <input type="text" value={editedData.itemQty || ""} onChange={(e) => handleFieldChange("itemQty", e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm w-full bg-white" />
            ) : (
              formatItemQty(followUp.itemQty) || <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case "actions":
        return (
          <td key="actions" className="px-3 sm:px-4 py-3 sm:py-4 text-sm text-gray-500 whitespace-nowrap">
          </td>
        );
      case "edit":
        return (
          <td key="edit" className="px-3 sm:px-4 py-3 sm:py-4 text-sm font-medium border-l border-gray-200">
            {editingRowId === index ? (
              <div className="flex space-x-2">
                <button
                  onClick={() => handleSaveClick(index)}
                  className="px-2 py-1 text-xs bg-success text-white rounded hover:bg-success"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelClick}
                  className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleEditClick(followUp, index)}
                className="px-3 py-1 text-xs border border-info/30 text-info hover:bg-info/10 rounded"
              >
                Edit
              </button>
            )}
          </td>
        );
      default:
        return null;
    }
  };

  // Row mapping helpers for DataTable
  const renderPendingRow = (followUp, index) => {
    return (
      <tr key={`${followUp.leadId}-${index}`} className="hover:bg-slate-50 transition-colors">
        {pendingColumnOptions.map(opt => {
          if (!pendingVisibleColumns[opt.key]) return null;
          return renderPendingCell(followUp, opt.key, index);
        })}
      </tr>
    );
  };

  const renderHistoryRow = (followUp, index) => {
    return (
      <tr key={`${followUp.id || index}-${index}`} className="hover:bg-slate-50 transition-colors">
        {columnOptions.map(opt => {
          if (!visibleColumns[opt.key]) return null;
          return renderHistoryCell(followUp, opt.key, index);
        })}
      </tr>
    );
  };

  // Card rendering helpers for Mobile DataTable
  const renderPendingCard = (followUp, index) => {
    return (
      <div
        key={`${followUp.leadId}-${index}`}
        className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden flex flex-col w-full text-left"
      >
        {/* Header Section */}
        <div className="bg-primary/5 p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-gray-900 text-lg">
              {followUp.leadId}
            </h3>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${followUp.priority === "High"
                ? "bg-destructive/10 text-destructive"
                : followUp.priority === "Medium"
                  ? "bg-primary/10 text-primary"
                  : "bg-slate-100 text-slate-700"
                }`}
            >
              {followUp.leadSource}
            </span>
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <svg
              className="w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              ></path>
            </svg>
            <span>{followUp.personName}</span>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-4 space-y-3 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Company</p>
              <p className="text-sm font-medium text-gray-900 truncate">
                {followUp.companyName}
              </p>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Phone</p>
              <p className="text-sm font-medium text-gray-900">
                {followUp.phoneNumber}
              </p>
            </div>
          </div>

          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Call Date</p>
            <p className="text-sm font-medium text-gray-900">
              {followUp.timestamp}
            </p>
          </div>

          {followUp.customerSay && (
            <div className="bg-info/10 p-3 rounded-lg border border-info/30">
              <p className="text-xs text-info font-medium mb-1 flex items-center">
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  ></path>
                </svg>
                Customer Said
              </p>
              <p className="text-sm text-gray-800 italic">
                "{followUp.customerSay}"
              </p>
            </div>
          )}

          {isAdmin() && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Assigned To</p>
              <p className="text-sm font-medium text-gray-950">
                {followUp.assignedTo}
              </p>
            </div>
          )}

          {followUp.itemQty && (
            <div className="bg-primary/5 p-3 rounded-lg border border-primary/10">
              <p className="text-xs text-primary font-medium mb-1">
                Items
              </p>
              <p className="text-sm font-medium text-gray-900">
                {formatItemQty(followUp.itemQty)}
              </p>
            </div>
          )}
        </div>

        {/* Action Section */}
        <div className="px-4 pb-4">
          <Link
            state={followUp.assignedTo}
            to={`/call-tracker/form?leadId=${followUp.leadId}&leadNo=${followUp.leadId}`}
            className="w-full flex items-center justify-center px-4 py-2.5 brand-gradient text-white rounded-lg shadow hover:opacity-90 transition-all duration-200 font-semibold"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              ></path>
            </svg>
            Call Now
          </Link>
        </div>
      </div>
    );
  };

  const renderHistoryCard = (followUp, index) => {
    return (
      <div
        key={index}
        className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden flex flex-col w-full text-left"
      >
        {/* Header Section */}
        <div className="bg-gradient-to-r from-gray-50 to-slate-50 p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-gray-900 text-lg">
              {followUp.leadNo}
            </h3>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${followUp.status === "Completed"
                ? "bg-success/10 text-success"
                : followUp.status === "Pending"
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive"
                }`}
            >
              {followUp.status}
            </span>
          </div>
          {followUp.timestamp && (
            <div className="flex items-center text-sm text-gray-600">
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                ></path>
              </svg>
              <span>{followUp.timestamp}</span>
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="p-4 space-y-3 flex-1">
          {followUp.customerSay && (
            <div className="bg-info/10 p-3 rounded-lg border border-info/30">
              <p className="text-xs text-info font-medium mb-1 flex items-center">
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  ></path>
                </svg>
                Customer Said
              </p>
              <p className="text-sm text-gray-800 italic">
                "{followUp.customerSay}"
              </p>
            </div>
          )}

          {followUp.enquiryStatus && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Enquiry Status</p>
              <p className="text-sm font-medium text-gray-900">
                {followUp.enquiryStatus}
              </p>
            </div>
          )}

          {followUp.nextCallDate && (
            <div className="bg-success/10 p-3 rounded-lg border border-success/20">
              <p className="text-xs text-success font-medium mb-1 flex items-center">
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  ></path>
                </svg>
                Next Follow-up
              </p>
              <p className="text-sm font-medium text-gray-900">
                {followUp.nextCallDate}{" "}
                {followUp.nextCallTime && `at ${followUp.nextCallTime}`}
              </p>
            </div>
          )}

          {followUp.itemQty && (
            <div className="bg-primary/5 p-3 rounded-lg border border-primary/10">
              <p className="text-xs text-primary font-medium mb-1">
                Items
              </p>
              <p className="text-sm font-medium text-gray-900">
                {formatItemQty(followUp.itemQty)}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Pagination ─────────────────────────────────────────────────────────
  // totalResults/totalPages now come straight from whichever query is active
  // -- the server already returned exactly one page's worth of rows in
  // pendingFollowUps/historyFollowUps, so no client-side slice is needed.
  const activeQuery = activeTab === "pending" ? pendingQuery : historyQuery;
  const totalResults = activeQuery.data?.totalCount || 0;
  const totalPages = Math.max(1, Math.ceil(totalResults / itemsPerPage));

  // ─── Header builder ───────────────────────────────────────────────────────
  const getHeaders = () => {
    if (activeTab === "pending") {
      const base = [
        { label: "Actions", className: "sticky left-0 bg-gray-50 z-30 shadow-[1px_0_0_0_#e5e7eb] border-r border-gray-200" },
      ];
      pendingColumnOptions.forEach((opt) => {
        if (opt.key !== "actions" && pendingVisibleColumns[opt.key]) base.push(opt.label);
      });
      return base;
    }
    return columnOptions.filter((opt) => visibleColumns[opt.key]).map((opt) => opt.label);
  };

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 w-full p-1 md:p-1.5">
      <CallTrackerFilter
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        companyFilter={companyFilter}
        setCompanyFilter={setCompanyFilter}
        personFilter={personFilter}
        setPersonFilter={setPersonFilter}
        phoneFilter={phoneFilter}
        setPhoneFilter={setPhoneFilter}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        dateFilterCounts={dateFilterCounts}
        filterType={filterType}
        setFilterType={setFilterType}
        showColumnDropdown={showColumnDropdown}
        setShowColumnDropdown={setShowColumnDropdown}
        visibleColumns={visibleColumns}
        handleSelectAll={handleSelectAll}
        handleColumnToggle={handleColumnToggle}
        columnOptions={columnOptions}
        visibleColumnsPending={pendingVisibleColumns}
        handleSelectAllPending={() => {
          const all = Object.values(pendingVisibleColumns).every(Boolean);
          setPendingVisibleColumns(Object.fromEntries(Object.keys(pendingVisibleColumns).map(k => [k, !all])));
        }}
        handleColumnTogglePending={(key) => setPendingVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))}
        columnOptionsPending={pendingColumnOptions}
        pendingFollowUps={pendingOptionsSource}
      />

      <div className="flex-1 flex flex-col min-h-0 mt-1">
        {isLoading ? (
          <div className="p-8 text-center flex-1 flex flex-col justify-center items-center bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary/30 mb-4"></div>
            <p className="text-slate-500">Loading follow-up data...</p>
          </div>
        ) : (
          <DataTable
            headers={getHeaders()}
            data={activeTab === "pending" ? pendingFollowUps : historyFollowUps}
            renderRow={activeTab === "pending" ? renderPendingRow : renderHistoryRow}
            renderCard={activeTab === "pending" ? renderPendingCard : renderHistoryCard}
            currentPage={currentPage}
            totalPages={totalPages}
            itemsPerPage={itemsPerPage}
            itemsPerPageOptions={[10, 20, 50]}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(val) => { setItemsPerPage(val); setCurrentPage(1); }}
            totalResults={totalResults}
          />
        )}
      </div>

      {/* Details Modal */}
      {selectedDetailsRow && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-100">
            <div className="brand-gradient px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Lead Details</h3>
                <p className="text-primary/10 text-xs">{selectedDetailsRow.leadId}</p>
              </div>
              <button
                onClick={() => setSelectedDetailsRow(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-sm">
              <div className="grid grid-cols-2 gap-4 pb-3 border-b border-gray-100">
                <div>
                  <span className="text-xs font-semibold text-gray-400 block uppercase">Company Name</span>
                  <span className="font-semibold text-gray-900">{selectedDetailsRow.companyName || "—"}</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-400 block uppercase">Person Name</span>
                  <span className="font-medium text-gray-800">{selectedDetailsRow.personName || "—"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-3 border-b border-gray-100">
                <div>
                  <span className="text-xs font-semibold text-gray-400 block uppercase">Phone Number</span>
                  <span className="font-medium text-gray-800">{selectedDetailsRow.phoneNumber || "—"}</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-400 block uppercase">Total Follow-ups</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                    {selectedDetailsRow.noOfFollowUps || 0}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-3 border-b border-gray-100">
                <div>
                  <span className="text-xs font-semibold text-gray-400 block uppercase">Last Call Date</span>
                  <span className="font-medium text-gray-800">{formatDateToDDMMYYYY(selectedDetailsRow.lastFollowUpDate || selectedDetailsRow.timestamp) || "—"}</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-400 block uppercase">Last Follow-up Status</span>
                  <span className="font-medium text-gray-800">{selectedDetailsRow.lastFollowUpStatus || selectedDetailsRow.enquiryStatus || "—"}</span>
                </div>
              </div>

              <div className="pb-3 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-400 block uppercase mb-1">What We Talked About (Customer Say)</span>
                <p className="text-gray-700 bg-gray-50 p-3 rounded-lg text-xs leading-relaxed border border-gray-100">
                  {selectedDetailsRow.customerSay || "No previous notes available."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-400 block font-medium">Assigned To</span>
                  <span className="text-gray-700">{selectedDetailsRow.assignedTo || "—"}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">Handle Person</span>
                  <span className="text-gray-700">{selectedDetailsRow.handlePerson || "—"}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">Next Action</span>
                  <span className="text-gray-700">{selectedDetailsRow.nextAction || "—"}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">Next Call Date</span>
                  <span className="text-gray-700">{formatDateToDDMMYYYY(selectedDetailsRow.nextCallDate) || "—"}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedDetailsRow(null)}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium text-xs rounded-md transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Now Form Modal */}
      {selectedCallNowRow && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="relative bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8">
            <button
              onClick={() => setSelectedCallNowRow(null)}
              className="absolute top-3 right-3 z-10 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              title="Close"
            >
              ✕
            </button>
            <NewCallTracker
              initialLeadId={selectedCallNowRow.leadId}
              initialLeadNo={selectedCallNowRow.leadId}
              isModal={true}
              onClose={(refreshed) => {
                setSelectedCallNowRow(null);
                if (refreshed) {
                  fetchFollowUpData(currentPage, false, searchTerm);
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default CallTracker;
