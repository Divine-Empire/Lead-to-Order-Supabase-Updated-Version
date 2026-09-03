"use client";

import { useState, useEffect, useContext, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  PlusIcon,
  SearchIcon,
  ArrowRightIcon,
  BuildingIcon,
  EyeIcon,
} from "../../components/Icons";
import { useQueryClient } from "@tanstack/react-query";
import { AuthContext } from "../../App";
import DirectEnquiryForm from "./DirectEnquiryForm";
import supabase from "../../utils/supabase";
import { isUrlReachable, regenerateQuotationPdf } from "../../utils/regenerateQuotationPdf";
import { syncClientOnOrderConversion } from "../../utils/orderConversionClientSync";
import { generateNextOrderNumber as generateNextOrderNumberShared } from "../../utils/orderNumberGenerator";
import DataTable from "../../components/DataTable";
import EnquiryTrackerFilter from "../../components/enquiry-tracker/EnquiryTrackerFilter";
import { usePendingEnquiries, useHistoryEnquiries, CURRENT_STAGE_OPTIONS } from "./queries";

const columnsConfig = [
  { key: "timestamp", label: "Timestamp" },
  { key: "leadId", label: "Lead No." },
  { key: "leadSource", label: "Enquiry Source" },
  { key: "companyName", label: "Company Name" },
  { key: "phoneNumber", label: "Phone Number" },
  { key: "salespersonName", label: "Person Name" },
  { key: "nextCallDate", label: "Next Follow-Up Date" },
  { key: "currentStage", label: "Current Stage" },
  { key: "callingDate", label: "Calling Date" },
  { key: "itemQty", label: "Item-Details" },
  { key: "totalQty", label: "Total Qty" },
  { key: "shippingAddress", label: "Shipping Address" },
  { key: "enquiryReceiverName", label: "Enquiry Receiver Name" },
  { key: "enquiryAssignToProject", label: "Enquiry Assign to Person" },
  { key: "gstNumber", label: "GST Number" },
  { key: "enquiryDate", label: "Enquiry Date" },
  { key: "enquiryState", label: "Enquiry for State" },
  { key: "projectName", label: "Project Name" },
  { key: "salesType", label: "Sales Type" },
  { key: "enquiryApproach", label: "Enquiry Approach" },
  { key: "enquiryStatus", label: "Enquiry Status" },
  { key: "customerFeedback", label: "Customer Feedback" },
  { key: "sendQuotationNo", label: "Send Quotation No." },
  { key: "quotationSharedBy", label: "Quotation Shared By" },
  { key: "quotationNumber", label: "Quotation Number" },
  { key: "valueWithoutTax", label: "Quotation Value Without Tax" },
  { key: "valueWithTax", label: "Quotation Value With Tax" },
  { key: "quotationUpload", label: "Quotation Copy" },
  { key: "quotationRemarks", label: "Quotation Remarks" },
  { key: "validatorName", label: "Quotation Validator Name" },
  { key: "sendStatus", label: "Quotation Send Status" },
  { key: "validationRemark", label: "Quotation Validation Remark" },
  { key: "faqVideo", label: "Send FAQ Video" },
  { key: "productVideo", label: "Send Product Video" },
  { key: "offerVideo", label: "Send Offer Video" },
  { key: "productCatalog", label: "Send Product Catalog" },
  { key: "productImage", label: "Send Product Image" },
  { key: "nextCallTime", label: "Next Follow Uptime" },
  { key: "orderStatus", label: "Order Received Status" },
  { key: "reasonStatus", label: "If No Reason Status" },
  { key: "reasonRemark", label: "If No Reason Remark" },
  { key: "transportMode", label: "Transport Mode" },
  { key: "conveyedForRegistration", label: "Conveyed For Registration Form" },
  { key: "orderNo", label: "Order No" },
  { key: "destination", label: "Destination" },
  { key: "poNumber", label: "PO Number" },
  { key: "acceptanceVia", label: "Acceptance Via" },
  { key: "acceptanceFile", label: "Acceptance File" },
];

// Pending tab default: exactly [timestamp, lead number, enquiry source,
// company name, phone number, quotation value without tax, quotation copy,
// next follow-up date, customer feedback, current stage] visible; every
// other column (including salespersonName/nextCallTime, on by default
// before) starts hidden -- still toggleable per-user via the column
// dropdown, this only changes what a first-time/reset view shows.
const defaultVisibility = {
  timestamp: true,
  leadId: true,
  leadSource: true,
  companyName: true,
  phoneNumber: true,
  salespersonName: false,
  customerFeedback: true,
  nextCallDate: true,
  nextCallTime: false,
  currentStage: true,
  callingDate: false,
  itemQty: false,
  totalQty: false,
  shippingAddress: false,
  enquiryReceiverName: false,
  enquiryAssignToProject: false,
  gstNumber: false,
  enquiryDate: false,
  enquiryState: false,
  projectName: false,
  salesType: false,
  enquiryApproach: false,
  enquiryStatus: false,
  sendQuotationNo: false,
  quotationSharedBy: false,
  quotationNumber: false,
  valueWithoutTax: true,
  valueWithTax: false,
  quotationUpload: true,
  quotationRemarks: false,
  validatorName: false,
  sendStatus: false,
  validationRemark: false,
  faqVideo: false,
  productVideo: false,
  offerVideo: false,
  productCatalog: false,
  productImage: false,
  orderStatus: false,
  reasonStatus: false,
  reasonRemark: false,
  transportMode: false,
  conveyedForRegistration: false,
  orderNo: false,
  destination: false,
  poNumber: false,
  acceptanceVia: false,
  acceptanceFile: false,
};

const historyColumnsConfig = [
  { key: "timestamp", label: "Timestamp" },
  { key: "leadId", label: "Lead No." },
  { key: "companyName", label: "Company Name" },
  { key: "currentStage", label: "Current Stage" },
  { key: "callingDate", label: "Calling Date" },
  { key: "quotationNumber", label: "Quotation Number" },
  { key: "valueWithTax", label: "Quotation Value With Tax" },
  { key: "valueWithoutTax", label: "Quotation Value Without Tax" },
  { key: "quotationUpload", label: "Quotation Copy" },
  { key: "acceptanceVia", label: "Acceptance Via" },
  { key: "acceptanceFile", label: "Acceptance File" },
  ...columnsConfig.filter(opt => ![
    "timestamp", "leadId", "companyName", "currentStage", "callingDate", 
    "quotationNumber", "valueWithTax", "valueWithoutTax", "quotationUpload",
    "acceptanceVia", "acceptanceFile"
  ].includes(opt.key))
];

const historyDefaultVisibility = {
  ...Object.keys(defaultVisibility).reduce((acc, key) => { acc[key] = false; return acc; }, {}),
  timestamp: true,
  leadId: true,
  companyName: true,
  currentStage: true,
  callingDate: true,
  quotationNumber: true,
  valueWithTax: true,
  valueWithoutTax: true,
  quotationUpload: true,
  acceptanceVia: true,
  acceptanceFile: true,
};

const TRACKER_CHUNK_SIZE = 500;

async function executePromisesInBatches(promiseFns, batchSize = 5) {
  const results = [];
  for (let i = 0; i < promiseFns.length; i += batchSize) {
    const batch = promiseFns.slice(i, i + batchSize).map(fn => fn());
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }
  return results;
}

async function fetchAllRows(baseQueryFn) {
  // First get exact count
  const countQuery = baseQueryFn(true);
  const { count, error: countError } = await countQuery;
  
  if (countError || count === null || count === 0) {
    return [];
  }

  const promises = [];
  for (let from = 0; from < count; from += TRACKER_CHUNK_SIZE) {
    promises.push(() => baseQueryFn(false).range(from, from + TRACKER_CHUNK_SIZE - 1));
  }

  const results = await executePromisesInBatches(promises, 5);
  let allData = [];
  for (const { data, error } of results) {
    if (error) {
      console.error("Error in fetchAllRows:", error.message);
      continue;
    }
    if (data) {
      allData = [...allData, ...data];
    }
  }
  return allData;
}


function EnquiryTracker() {
  const authContext = useContext(AuthContext) || {};
  const {
    currentUser = null,
    isAdmin = () => false,
    getUsernamesToFilter = () => [],
    getLeadSourcesToFilter = () => [],
    showNotification = () => {},
    dismissNotification = () => {}
  } = authContext;
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTabState] = useState(() => {
    return localStorage.getItem("enquiryTrackerActiveTab") || "pending";
  });
  const setActiveTab = (tabOrFn) => {
    setActiveTabState((prev) => {
      const nextTab = typeof tabOrFn === "function" ? tabOrFn(prev) : tabOrFn;
      if (typeof nextTab === "string") {
        localStorage.setItem("enquiryTrackerActiveTab", nextTab);
      }
      return nextTab;
    });
  };
  const [isLoading, setIsLoading] = useState(true);
  const [pendingData, setPendingData] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [directEnquiryData, setDirectEnquiryData] = useState([]);
  const [showNewCallTrackerForm, setShowNewCallTrackerForm] = useState(false);
  const [newEnquiryPrefill, setNewEnquiryPrefill] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [selectedTracker, setSelectedTracker] = useState(null);
  const [callingDaysFilter, setCallingDaysFilter] = useState([]);
  // Value filter over "Quotation Value Without Tax": "" (all) | "gte100000" | "lt100000"
  const [valueFilter, setValueFilter] = useState("");
  const [currentStageFilter, setCurrentStageFilter] = useState([]);
  const [scNameFilter] = useState("all");
  const [, setUniqueScNames] = useState({
    pending: [],
    directEnquiry: [],
    history: []
  });


  const [, setHasMorePending] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(200);
  const [, setHasMoreHistory] = useState(true);
  const [, setHasMoreDirectEnquiry] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  const [orderStatuses, setOrderStatuses] = useState({});
  const [orderRemarks, setOrderRemarks] = useState({});

  const [orderDates, setOrderDates] = useState({});
  const [, setShowSerialDropdown] = useState(false);
  const [tenDaysData, setTenDaysData] = useState([]);
  const [selectedOrders] = useState([]);

  // Dropdown visibility states
  const [, setShowCallingDaysDropdown] = useState(false);
  const [, setShowEnquiryNoDropdown] = useState(false);
  const [, setShowCurrentStageDropdown] =
    useState(false);

  const [editingRowId, setEditingRowId] = useState(null);
  const [editedData, setEditedData] = useState({});

  // Tracks which quotation's "View File" link is mid-regeneration (keyed by
  // quotation number) so only that one link shows a loading state -- see
  // handleQuotationFileClick / regenerateQuotationPdf.js.
  const [regeneratingQuotationNo, setRegeneratingQuotationNo] = useState(null);

  const [, setCallingDaysCounts] = useState({
    pendingToday: 0,
    pendingOverdue: 0,
    pendingUpcoming: 0,
    directToday: 0,
    directOverdue: 0,
    directUpcoming: 0,
    historyToday: 0,
    historyOlder: 0,
  });

  const [visibleColumns, setVisibleColumns] = useState(historyDefaultVisibility);
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);

  // Pending tab column visibility state
  const [visiblePendingColumns, setVisiblePendingColumns] = useState(defaultVisibility);
  const [, setShowPendingColumnDropdown] = useState(false);

  const [, setShowDirectEnquiryColumnDropdown] = useState(false);

  // Item-Details modal: shows the item_name/quantity lines for one specific
  // enquiry or lead, fetched from lto_enquiry_items or lto_lead_items on
  // demand (rather than the old, permanently-stale flat item_name1-10
  // columns that used to be embedded directly in every row).
  const [itemDetailsModal, setItemDetailsModal] = useState({
    open: false,
    loading: false,
    title: "",
    items: [],
  });

  const openItemDetailsModal = async (tracker) => {
    const displayId = String(
      tracker.leadNo || tracker.lead_no || tracker.enquiryNo || tracker.enquiry_no || tracker.leadId || ""
    ).toUpperCase();
    const isLead = displayId.startsWith("LD-");
    const recordId = tracker.id || tracker.dbId;

    setItemDetailsModal({ open: true, loading: true, title: displayId, items: [] });

    if (!recordId) {
      setItemDetailsModal((prev) => ({ ...prev, loading: false }));
      return;
    }

    try {
      const table = isLead ? "lto_lead_items" : "lto_enquiry_items";
      const column = isLead ? "lead_id" : "enquiry_id";
      const { data, error } = await supabase
        .from(table)
        .select("item_name, quantity")
        .eq(column, recordId);

      if (error) throw error;
      setItemDetailsModal((prev) => ({ ...prev, items: data || [], loading: false }));
    } catch (err) {
      console.error("Error fetching item details:", err);
      setItemDetailsModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const closeItemDetailsModal = () => {
    setItemDetailsModal({ open: false, loading: false, title: "", items: [] });
  };

  // Handles clicking "View File" on a Quotation Copy link. Most links still
  // work -- checked first, opened immediately, no extra latency. Only when
  // the stored URL is actually dead (the file's original Storage bucket/
  // project no longer exists) does this regenerate the PDF from the
  // quotation's still-intact DB data and heal the link for next time.
  const handleQuotationFileClick = async (e, url, quotationNo) => {
    e.preventDefault();

    if (quotationNo && regeneratingQuotationNo === quotationNo) return; // already in flight

    if (await isUrlReachable(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    if (!quotationNo) {
      showNotification("This file is unavailable and no quotation number is on record to regenerate it.", "error");
      return;
    }

    setRegeneratingQuotationNo(quotationNo);
    showNotification("Quotation file was unavailable — regenerating it now...", "loading", 0);

    const result = await regenerateQuotationPdf(quotationNo);
    setRegeneratingQuotationNo(null);

    if (!result) {
      showNotification("Could not regenerate this quotation's PDF — its data may be missing.", "error");
      return;
    }

    window.open(result.blobUrl, "_blank", "noopener,noreferrer");
    showNotification(
      result.newUrl ? "Quotation regenerated and link fixed for next time." : "Quotation regenerated, but saving the fixed link failed — it will retry next time this is opened.",
      result.newUrl ? "success" : "warning"
    );
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "new-enquiry") {
      // Prefill data forwarded from Client Master's "Enquiry" action button
      // (see ClientMaster.jsx's `urlParams`) -- only set fields that are
      // actually present so DirectEnquiryForm's own defaults still apply
      // to anything not passed.
      const prefill = {};
      const paramToField = {
        companyName: "companyName",
        phoneNumber: "phoneNumber",
        personName: "salesPersonName",
        groupName: "groupName",
        gstNumber: "gstNumber",
        billingAddress: "location",
        scName: "scName",
        state: "enquiryState",
      };
      Object.entries(paramToField).forEach(([param, field]) => {
        const val = params.get(param);
        if (val) prefill[field] = val;
      });
      setNewEnquiryPrefill(prefill);
      setShowNewCallTrackerForm(true);
    }
  }, []);



  const handleEditClick = (tracker, index) => {
    setEditingRowId(index);
    setEditedData({
      ...tracker,
      id: tracker.id,
    });
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

  // See src/utils/orderNumberGenerator.js -- this used to have its own
  // locally-duplicated fallback (a non-atomic MAX(order_no)+1 over a
  // stale, limited snapshot) that produced out-of-sequence/colliding
  // order numbers whenever the RPC call failed for any transient reason.
  // Removed in favor of retrying the real atomic sequence and throwing if
  // that keeps failing, same as EnquiryTrackerForm.jsx.
  const generateNextOrderNumber = () => generateNextOrderNumberShared(supabase);

const handleSaveClick = async () => {
  try {
    // Handle Pending tab - update leads_to_order table
    if (activeTab === "pending") {
      // Validate that we have a valid ID
      if (!editedData.id && !editedData.dbId) {
        alert("Error: No valid ID found for this record. Please refresh the page and try again.");
        console.error("Missing ID in editedData:", editedData);
        return;
      }

      const updateId = editedData.id || editedData.dbId;
      console.log("Updating record with ID:", updateId);

      const isEnquiryRecord = editedData.tableSource === "enquiry_to_order" || (editedData.leadNo && editedData.leadNo.toUpperCase().startsWith("EN-"));

      if (isEnquiryRecord) {
        // Parse items if available -- these belong in the normalized
        // lto_enquiry_items table, not on lto_enquiries/lto_enquiry_tracker.
        const items = editedData.quotationItems || [];

        // Fields that live on the lto_enquiries master row.
        const directEnquiryUpdateData = {
          enquiry_no: editedData.lead_no || editedData.leadNo,
          lead_source: editedData.Lead_Source || editedData.leadSource,
          company_name: editedData.Company_Name || editedData.companyName,
          phone_number: editedData.Phone_Number || editedData.phoneNo,
          sales_person_name: editedData.salesperson_Name || editedData.salespersonName,
          enquiry_receiver_name: editedData.Lead_Receiver_Name || editedData.leadReceiverName,
          sales_coordinator_name: editedData.sc_name || editedData.assignedTo,
          enquiry_for_state: editedData.Enquiry_for_State || editedData.enquiryForState,
          sales_type: editedData.Enquiry_Type || editedData.enquiryType,
          enquiry_approach: editedData.Enquiry_Approach || editedData.enquiryApproach,
        };

        Object.keys(directEnquiryUpdateData).forEach((key) => {
          if (directEnquiryUpdateData[key] === undefined || directEnquiryUpdateData[key] === null) {
            delete directEnquiryUpdateData[key];
          }
        });

        const { error } = await supabase
          .from("lto_enquiries")
          .update(directEnquiryUpdateData)
          .eq("id", updateId)
          .select();

        if (error) {
          console.error("Pending direct enquiry update error:", error);
          alert(`Error updating record: ${error.message}`);
          throw error;
        }

        // Fields that represent a stage/history change belong on
        // lto_enquiry_tracker as a new log row, not on lto_enquiries.
        const trackerInsertData = {
          enquiry_id: updateId,
          current_stage: editedData.Current_Stage || editedData.currentStage,
          what_did_customer_say: editedData.What_Did_The_Customer_Say || editedData.customerSay,
          calling_days: editedData.Calling_Days || editedData.callingDate,
          next_call_date: convertDateToYYYYMMDD(editedData.Next_Call_Date_Field || editedData.nextCallDate),
          next_call_time: convertTimeTo24Hour(editedData.Next_Call_Time || editedData.nextCallTime),
        };

        if (editedData.orderStatus?.toLowerCase() === "yes") {
          Object.assign(trackerInsertData, {
            is_order_received_status: editedData.orderStatus,
            order_no: editedData.Order_No || editedData.order_no || await generateNextOrderNumber(),
            acceptance_via: editedData.acceptanceVia,
            payment_mode: editedData.paymentMode,
            destination: editedData.destination,
            po_number: editedData.poNumber,
            payment_terms_days: editedData.paymentTerms,
            transport_mode: editedData.transportMode,
            conveyed_for_registration_form: editedData.conveyedForRegistration === "yes",
            acceptance_file_upload: editedData.acceptanceFile,
            remark: editedData.orderRemark,
          });
        }

        Object.keys(trackerInsertData).forEach((key) => {
          if (trackerInsertData[key] === undefined || trackerInsertData[key] === null || trackerInsertData[key] === "") {
            delete trackerInsertData[key];
          }
        });

        // Only worth logging a tracker row if there's more than just the enquiry_id.
        if (Object.keys(trackerInsertData).length > 1) {
          const { error: trackerError } = await supabase
            .from("lto_enquiry_tracker")
            .insert([trackerInsertData]);

          if (trackerError) {
            console.error("Pending direct enquiry tracker insert error:", trackerError);
            alert(`Enquiry updated, but stage/history details could not be saved: ${trackerError.message}`);
          }
        }

        if (items.length > 0) {
          const { error: deleteItemsError } = await supabase
            .from("lto_enquiry_items")
            .delete()
            .eq("enquiry_id", updateId);

          if (deleteItemsError) {
            console.error("Error clearing existing enquiry items:", deleteItemsError);
          }

          const itemRows = items
            .filter((item) => item.name)
            .map((item) => ({
              enquiry_id: updateId,
              item_name: item.name,
              quantity: Number(item.qty) || 0,
            }));

          if (itemRows.length > 0) {
            const { error: itemsError } = await supabase.from("lto_enquiry_items").insert(itemRows);
            if (itemsError) {
              console.error("Error saving enquiry items:", itemsError);
              alert(`Enquiry updated, but items could not be saved: ${itemsError.message}`);
            }
          }
        }

        // SC/CRE client_master sync -- this inline-edit path used to flip
        // is_order_received_status to "yes" without ever running this,
        // unlike the main Order Status form. Awaited (not fire-and-forget
        // like the sheet sync below) since it's core assignment data, not
        // an external nice-to-have.
        if (editedData.orderStatus?.toLowerCase() === "yes") {
          await syncClientOnOrderConversion(editedData.enquiry_no || directEnquiryUpdateData.enquiry_no);
        }

        // Non-blocking -- the previous `alert("Updated successfully!")`
        // here was a synchronous, thread-freezing native dialog that sat
        // right in between the (already slow, several sequential DB calls)
        // syncClientOnOrderConversion above and the refetch below, which is
        // what actually made this path feel laggy/janky, not the refetch
        // itself.
        showNotification("Updated successfully!", "success");

        fetchPendingData();
        // The converted row just left enquiry_pending_view for
        // enquiry_history_view (is_order_received_status flipped) -- without
        // this, the History tab kept showing stale data until some other
        // action happened to invalidate it.
        if (editedData.orderStatus?.toLowerCase() === "yes") {
          fetchHistoryData();
        }
        setEditingRowId(null);
        setEditedData({});
        return;
      }

      // Parse items if available for leads
      const leadItems = editedData.quotationItems || [];

      const leadItemUpdates = {};
      if (leadItems.length > 0) {
        for (let i = 0; i < 5; i++) {
          const itemNum = i + 1;
          if (i < leadItems.length) {
            leadItemUpdates[`Item_Name${itemNum}`] = leadItems[i].name || "";
            leadItemUpdates[`Quantity${itemNum}`] = String(leadItems[i].qty || 0);
          } else {
            leadItemUpdates[`Item_Name${itemNum}`] = null;
            leadItemUpdates[`Quantity${itemNum}`] = null;
          }
        }
      }
      
      const pendingUpdateData = {
        lead_no: editedData.lead_no || editedData.leadNo,
        lead_receiver_name: editedData.Lead_Receiver_Name || editedData.leadReceiverName,
        lead_source: editedData.Lead_Source || editedData.leadSource,
        phone_number: editedData.Phone_Number || editedData.phoneNo,
        person_name: editedData.salesperson_Name || editedData.salespersonName || editedData.sc_name,
        company_name: editedData.Company_Name || editedData.companyName,
        state: editedData.Enquiry_for_State || editedData.enquiryForState,
        sales_type: editedData.Enquiry_Type || editedData.enquiryType
      };

      // Remove undefined/null values
      Object.keys(pendingUpdateData).forEach((key) => {
        if (pendingUpdateData[key] === undefined || pendingUpdateData[key] === null) {
          delete pendingUpdateData[key];
        }
      });

      console.log("Pending Update Data:", pendingUpdateData);
      console.log("Updating record with ID:", updateId);

      const { data: updatedData, error } = await supabase
        .from("lto_leads")
        .update(pendingUpdateData)
        .eq("id", updateId)
        .select();

      if (error) {
        console.error("Pending update error:", error);
        alert(`Error updating record: ${error.message}`);
        throw error;
      }

      console.log("Successfully updated record:", updatedData);
      alert("Updated successfully!");
      fetchPendingData(currentPage, searchTerm, getDateFiltersFromCallingDays());
      setEditingRowId(null);
      setEditedData({});
      return;
    }

    // Handle Direct Enquiry tab - update enquiry_to_order table
    if (activeTab === "directEnquiry") {
      // Validate that we have a valid ID
      if (!editedData.id && !editedData.dbId) {
        alert("Error: No valid ID found for this record. Please refresh the page and try again.");
        console.error("Missing ID in editedData:", editedData);
        return;
      }

      const updateId = editedData.id || editedData.dbId;
      console.log("Updating Direct Enquiry record with ID:", updateId);

      const directEnquiryUpdateData = {
        enquiry_no: editedData.enquiry_no,
        lead_source: editedData.lead_source,
        company_name: editedData.company_name,
        phone_number: editedData.phone_number,
        sales_person_name: editedData.salesperson_name,
        location: editedData.location,
        email: editedData.email,
        shipping_address: editedData.shipping_address,
        enquiry_receiver_name: editedData.enquiry_receiver_name,
        enquiry_assign_to_person: editedData.enquiry_assign_to_person,
        gst_number: editedData.gst_number,
        enquiry_date: editedData.enquiry_date,
        enquiry_for_state: editedData.enquiry_for_state,
        project_name: editedData.project_name,
        sales_type: editedData.sales_type,
        enquiry_approach: editedData.enquiry_approach,
        enquiry_status: editedData.enquiry_status,
        customer_feedback: editedData.customer_feedback,
        current_stage: editedData.current_stage,
        next_call_date: convertDateToYYYYMMDD(editedData.next_call_date),
        next_call_time: convertTimeTo24Hour(editedData.next_call_time),
        sales_coordinator_name: editedData.sc_name,
        calling_days: editedData.calling_days,
      };

      // Remove undefined/null values
      Object.keys(directEnquiryUpdateData).forEach((key) => {
        if (directEnquiryUpdateData[key] === undefined || directEnquiryUpdateData[key] === null) {
          delete directEnquiryUpdateData[key];
        }
      });

      console.log("Direct Enquiry Update Data:", directEnquiryUpdateData);
      console.log("Updating record with ID:", updateId);

      const { data: updatedData, error } = await supabase
          .from("lto_enquiries")
          .update(directEnquiryUpdateData)
          .eq("id", updateId)
          .select();

      if (error) {
        console.error("Direct Enquiry update error:", error);
        alert(`Error updating record: ${error.message}`);
        throw error;
      }

      console.log("Successfully updated Direct Enquiry record:", updatedData);
      alert("Updated successfully!");
      fetchDirectEnquiryData(currentPage, searchTerm, getDateFiltersFromCallingDays());
      setEditingRowId(null);
      setEditedData({});
      return;
    }

    // Handle History tab - existing logic for enquiry_tracker / enquiry_tracker_for_leads
    const parseNumericField = (val) => {
      if (val === "" || val === undefined || val === null) return null;
      const num = parseFloat(val);
      return isNaN(num) ? null : num;
    };

    const updateData = {
      enquiry_status: editedData.enquiryStatus,
      what_did_customer_say: editedData.customerFeedback,
      current_stage: editedData.currentStage,
      send_quotation_no: editedData.sendQuotationNo,
      quotation_shared_by: editedData.quotationSharedBy,
      quotation_number: editedData.quotationNumber,
      quotation_value_without_tax: parseNumericField(editedData.valueWithoutTax),
      quotation_value_with_tax: parseNumericField(editedData.valueWithTax),
      quotation_upload: editedData.quotationUpload,
      quotation_remarks: editedData.quotationRemarks,
      quotation_validator_name: editedData.validatorName,
      quotation_send_status: editedData.sendStatus,
      quotation_validation_remark: editedData.validationRemark,
      send_faq_video: editedData.faqVideo === "Yes" || editedData.faqVideo === true || editedData.faqVideo === "yes",
      send_product_video: editedData.productVideo === "Yes" || editedData.productVideo === true || editedData.productVideo === "yes",
      send_offer_video: editedData.offerVideo === "Yes" || editedData.offerVideo === true || editedData.offerVideo === "yes",
      send_product_catalog: editedData.productCatalog === "Yes" || editedData.productCatalog === true || editedData.productCatalog === "yes",
      send_product_image: editedData.productImage === "Yes" || editedData.productImage === true || editedData.productImage === "yes",
      next_call_date: convertDateToYYYYMMDD(editedData.nextCallDate),
      next_call_time: convertTimeTo24Hour(editedData.nextCallTime),
      is_order_received_status: editedData.orderStatus,
      acceptance_via: editedData.acceptanceVia,
      payment_mode: editedData.paymentMode,
      payment_terms_days: parseNumericField(editedData.paymentTerms),
      transport_mode: editedData.transportMode,
      conveyed_for_registration_form: editedData.registrationFrom === "Yes" || editedData.registrationFrom === true || editedData.registrationFrom === "yes",
      acceptance_file_upload: editedData.acceptanceFile,
      remark: editedData.orderRemark,
      order_lost_apology_video: editedData.apologyVideo,
      if_no_reason_status: editedData.reasonStatus,
      if_no_reason_remark: editedData.reasonRemark,
    };

    // Remove undefined/null values
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined || updateData[key] === null) {
        delete updateData[key];
      }
    });

    // Get the record identifier
    const identifier = editedData.enquiryNo;
    
    if (!identifier) {
      throw new Error("Record identifier is required");
    }

    // Check if it's a lead number (LD-*) or enquiry number (EN-*)
    const isLeadNumber = identifier.toUpperCase().startsWith('LD-');

    // Update tracking table
    const tableName = isLeadNumber ? "lto_enquiry_tracker_for_leads" : "lto_enquiry_tracker";
    const { error } = await supabase
      .from(tableName)
      .update(updateData)
      .eq("id", editedData.id);

    if (error) {
      alert(`Error updating ${tableName}: ${error.message}`);
      console.error(`Error updating ${tableName}:`, error);
      return;
    }

    // SC/CRE client_master sync -- this inline-edit path used to flip
    // is_order_received_status to "yes" without ever running this, unlike
    // the main Order Status form. Awaited since it's core assignment data,
    // not an external nice-to-have like the sheet sync below.
    if (editedData.orderStatus?.toLowerCase() === "yes") {
      await syncClientOnOrderConversion(identifier);
    }

    alert("Updated successfully!");

    // Refresh data
    fetchHistoryData(1, searchTerm, false, getDateFiltersFromCallingDays());
    setEditingRowId(null);
    setEditedData({});
  } catch (error) {
    console.error("Error updating:", error);
    alert(`Error updating: ${error.message}`);
  }
};

  const handleFieldChange = (field, value) => {
    setEditedData((prev) => ({ ...prev, [field]: value }));
  };

  // Helper function to determine priority based on status
  const determinePriority = (status) => {
    if (!status) return "Low";

    const statusLower = status.toLowerCase();
    if (statusLower === "hot") return "High";
    if (statusLower === "warm") return "Medium";
    return "Low";
  };

  // Helper function to format date to DD/MM/YYYY
  const formatDateToDDMMYYYY = (dateValue) => {
    if (!dateValue) return "";

    try {
      if (typeof dateValue === "string" && dateValue.startsWith("Date(")) {
        const dateString = dateValue.substring(5, dateValue.length - 1);
        const [year, month, day] = dateString
          .split(",")
          .map((part) => Number.parseInt(part.trim()));
        return `${day.toString().padStart(2, "0")}/${(month + 1)
          .toString()
          .padStart(2, "0")}/${year}`;
      }

      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return `${date.getDate().toString().padStart(2, "0")}/${(
          date.getMonth() + 1
        )
          .toString()
          .padStart(2, "0")}/${date.getFullYear()}`;
      }

      return dateValue;
    } catch (error) {
      console.error("Error formatting date:", error);
      return dateValue;
    }
  };

  // Helper function to format time to 12-hour format with AM/PM
  const formatTimeTo12Hour = (timeValue) => {
    if (!timeValue) return "";

    try {
      if (typeof timeValue === "string" && timeValue.startsWith("Date(")) {
        const dateString = timeValue.substring(5, timeValue.length - 1);
        const parts = dateString.split(",");

        if (parts.length >= 5) {
          const hour = Number.parseInt(parts[3].trim());
          const minute = Number.parseInt(parts[4].trim());
          const period = hour >= 12 ? "PM" : "AM";
          const displayHour = hour % 12 || 12;
          return `${displayHour}:${minute
            .toString()
            .padStart(2, "0")} ${period}`;
        }
      }

      if (typeof timeValue === "string" && timeValue.includes(":")) {
        const [hour, minute] = timeValue
          .split(":")
          .map((part) => Number.parseInt(part));
        const period = hour >= 12 ? "PM" : "AM";
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
      }

      return timeValue;
    } catch (error) {
      console.error("Error formatting time:", error);
      return timeValue;
    }
  };

  // Robust helper to parse various date strings (DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY)
  const parseDateHelper = (dateStr) => {
    if (!dateStr) return null;
    try {
      const cleanStr = String(dateStr).trim();
      if (cleanStr.includes("-") || cleanStr.includes("/")) {
        const separator = cleanStr.includes("-") ? "-" : "/";
        const parts = cleanStr.split(separator);
        if (parts[0].length === 4) {
          return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else if (parts[2] && parts[2].length === 4) {
          return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        }
      }
      const d = new Date(cleanStr);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  // Helper function to check if a date is today
  const isToday = (dateStr) => {
    const date = parseDateHelper(dateStr);
    if (!date || isNaN(date.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date.getTime() === today.getTime();
  };

  // Helper function to check if a date is overdue
  const isOverdue = (dateStr) => {
    const date = parseDateHelper(dateStr);
    if (!date || isNaN(date.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date < today;
  };

  // Helper function to check if a date is upcoming
  const isUpcoming = (dateStr) => {
    const date = parseDateHelper(dateStr);
    if (!date || isNaN(date.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date > today;
  };

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

  const columnOptions = activeTab === "history" ? historyColumnsConfig : columnsConfig;
  const pendingColumnOptions = columnsConfig;

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".dropdown-container")) {
        setShowCallingDaysDropdown(false);
        setShowEnquiryNoDropdown(false);
        setShowCurrentStageDropdown(false);
        setShowColumnDropdown(false);
        setShowSerialDropdown(false);
        setShowPendingColumnDropdown(false);
        setShowDirectEnquiryColumnDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const fetchTenDaysData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        "https://script.google.com/macros/s/AKfycbyzW8-RldYx917QpAfO4kY-T8_ntg__T0sbr7Yup2ZTVb1FC5H1g6TYuJgAU6wTquVM/exec?sheet=ORDER-DISPATCH&action=fetch"
      );

      const text = await response.text();

      let result;
      try {
        result = JSON.parse(text);
      } catch {
        console.error("Response is not JSON:", text);
        setTenDaysData([]);
        setIsLoading(false);
        return;
      }

      if (result.success && result.data) {
        const headers = result.data[0];
        const rows = result.data.slice(4);

        // Find column indices
        const awIndex = headers.findIndex(
          (h) =>
            h &&
            typeof h === "string" &&
            h.toLowerCase().includes("delivery status")
        );
        const cfIndex = headers.findIndex(
          (h) =>
            h &&
            typeof h === "string" &&
            h.toLowerCase().includes("revised order date")
        );
        const cgIndex = headers.findIndex(
          (h) =>
            h &&
            typeof h === "string" &&
            h.toLowerCase().includes("revised order status")
        );
        const chIndex = headers.findIndex(
          (h) =>
            h &&
            typeof h === "string" &&
            h.toLowerCase().includes("revised order date2")
        ); // New column for Date
        const ciIndex = headers.findIndex(
          (h) =>
            h &&
            typeof h === "string" &&
            h.toLowerCase().includes("sales coordinator")
        );
        const cjIndex = headers.findIndex(
          (h) =>
            h &&
            typeof h === "string" &&
            h.toLowerCase().includes("revised order remark")
        ); // New column for Remarks

        // Use fallback indices if specific column names not found
        const awCol = awIndex >= 0 ? awIndex : 48;
        const cfCol = cfIndex >= 0 ? cfIndex : 83;
        const cgCol = cgIndex >= 0 ? cgIndex : 84;
        const chCol = chIndex >= 0 ? chIndex : 85; // Date column - adjust this number if needed
        const ciCol = ciIndex >= 0 ? ciIndex : 86;
        const cjCol = cjIndex >= 0 ? cjIndex : 87; // Remarks column - adjust this number if needed

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tenDaysOrders = [];

        rows.forEach((row, index) => {
          try {
            const awValue = row[awCol];
            const cfValue = row[cfCol];
            const cgValue = row[cgCol]; // Status
            const chValue = row[chCol]; // Remarks (CH column)
            const ciValue = row[ciCol]; // Sales Coordinator
            const cjValue = row[cjCol]; // Date (CJ column)
            // Debug logging

            const statusStr = String(cgValue || "")
              .toLowerCase()
              .trim();

            const isUserRow =
              isAdmin() ||
              (currentUser?.fullName &&
                ciValue &&
                ciValue.toString().trim() === currentUser.fullName.trim());
            // Debug for DO-6 specifically - check if it exists at all

            // Check if order is not dispatched/completed
            const awValueLower = awValue
              ? awValue.toString().toLowerCase().trim()
              : "";
            const isNotDispatched =
              !awValueLower ||
              (!awValueLower.includes("dispatched") &&
                !awValueLower.includes("delivered") &&
                !awValueLower.includes("completed") &&
                !awValueLower.includes("done"));

            // Only include orders that are not done

            const includeByStatus =
              !statusStr ||
              statusStr === "" ||
              statusStr === "null" ||
              statusStr === "undefined" ||
              statusStr !== "done";
            if (isUserRow && isNotDispatched && includeByStatus && cfValue) {
              let cfDate = null;
              if (cfValue) {
                if (cfValue instanceof Date) {
                  cfDate = new Date(cfValue);
                } else if (typeof cfValue === "string") {
                  let parsed = new Date(cfValue);
                  if (isNaN(parsed.getTime())) {
                    const m = cfValue.match(
                      /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/
                    );
                    if (m) {
                      const day = parseInt(m[1], 10);
                      const month = parseInt(m[2], 10) - 1;
                      const year =
                        parseInt(m[3], 10) + (m[3].length === 2 ? 2000 : 0);
                      parsed = new Date(year, month, day);
                    }
                  }
                  if (isNaN(parsed.getTime())) {
                    const serialDate = parseFloat(cfValue);
                    if (!isNaN(serialDate)) {
                      parsed = new Date((serialDate - 25569) * 86400 * 1000);
                    }
                  }
                  if (!isNaN(parsed.getTime())) {
                    cfDate = parsed;
                  }
                } else if (typeof cfValue === "number") {
                  const parsed = new Date((cfValue - 25569) * 86400 * 1000);
                  if (!isNaN(parsed.getTime())) {
                    cfDate = parsed;
                  }
                }
              }

              const order = {
                id: index + 2,
                timestamp: row[0] || "",
                orderNo: row[1] || "",
                quotationNo: row[2] || "",
                companyName: row[3] || "",
                contactPersonName: row[4] || "",
                contactNumber: row[5] || "",
                billingAddress: row[6] || "",
                shippingAddress: row[7] || "",
                paymentMode: row[8] || "",
                paymentTerms: row[9] || "",
                referenceName: row[10] || "",
                email: row[11] || "",
                transportMode: row[32] || "",
                destination: row[33] || "",
                itemQty: row[34] || "",
                poNumber: row[35] || "",
                totalOrderQty: row[40] || "",
                amountTotal: row[41] || "",
                dispatchStatus: row[48] || "",
                salesCoordinator: ciValue || "",
                existingStatus:
                  statusStr &&
                  statusStr !== "null" &&
                  statusStr !== "undefined" &&
                  statusStr !== ""
                    ? statusStr
                    : "pending",
                existingDate: (() => {
                  if (!cjValue) return "";
                  try {
                    let date;

                    // Handle different date formats
                    if (cjValue instanceof Date) {
                      date = new Date(cjValue);
                    } else if (typeof cjValue === "string") {
                      // Try parsing as string
                      date = new Date(cjValue);

                      // If invalid, try DD/MM/YYYY format
                      if (isNaN(date.getTime())) {
                        const match = cjValue.match(
                          /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/
                        );
                        if (match) {
                          const day = parseInt(match[1], 10);
                          const month = parseInt(match[2], 10) - 1; // Month is 0-indexed
                          const year =
                            parseInt(match[3], 10) +
                            (match[3].length === 2 ? 2000 : 0);
                          date = new Date(year, month, day);
                        }
                      }
                    } else if (typeof cjValue === "number") {
                      // Handle Excel serial date
                      date = new Date((cjValue - 25569) * 86400 * 1000);
                    }

                    if (date && !isNaN(date.getTime())) {
                      // Format as YYYY-MM-DD in local timezone to avoid timezone issues
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(
                        2,
                        "0"
                      );
                      const day = String(date.getDate()).padStart(2, "0");
                      return `${year}-${month}-${day}`;
                    }

                    return "";
                  } catch (e) {
                    console.error("Error parsing date:", cjValue, e);
                    return "";
                  }
                })(),
                existingRemarks: chValue || "",
              };

              if (cfDate && !isNaN(cfDate.getTime())) {
                const normalizedCfDate = new Date(cfDate);
                normalizedCfDate.setHours(0, 0, 0, 0);
                const normalizedToday = new Date(today);
                normalizedToday.setHours(0, 0, 0, 0);
                const diffTime =
                  normalizedToday.getTime() - normalizedCfDate.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays >= 0) {
                  order.cfDate = cfDate.toLocaleDateString();
                  order.daysAgo = diffDays;
                  order.status = diffDays <= 10 ? "within 10 days" : "overdue";
                } else {
                  order.cfDate = cfDate.toLocaleDateString();
                  order.daysAgo = diffDays;
                  order.status = "pending"; // Future date
                }
              } else {
                order.cfDate = "";
                order.daysAgo = "";
                order.status = "pending";
              }

              tenDaysOrders.push(order);
            }
          } catch (error) {
            console.error("Error processing row:", error, row);
          }
        });

        setTenDaysData(tenDaysOrders);

        // Initialize state with existing values
        const initialStatuses = {};
        const initialDates = {};
        const initialRemarks = {};

        tenDaysOrders.forEach((order) => {
          initialStatuses[order.orderNo] = order.existingStatus;
          initialDates[order.orderNo] = order.existingDate;
          initialRemarks[order.orderNo] = order.existingRemarks;
        });

        setOrderStatuses(initialStatuses);
        setOrderDates(initialDates);
        setOrderRemarks(initialRemarks);
      } else {
        console.error("Error fetching 10 days data:", result.error);
        setTenDaysData([]);
      }
    } catch (error) {
      console.error("Error fetching 10 days data:", error);
      setTenDaysData([]);
    }
    setIsLoading(false);
  };

  // Also update your useEffect to properly handle the 10 days tab
  useEffect(() => {
    if (isSearching) {
      return;
    }

    const fetchData = async () => {
      // Get date filters from callingDaysFilter
      const dateFilters = getDateFiltersFromCallingDays();

      switch (activeTab) {
        case "pending":
          await fetchPendingData(
            currentPage,
            searchTerm,
            dateFilters
          );
          break;
        case "history":
          await fetchHistoryData(
            currentPage,
            searchTerm,
            dateFilters
          );
          break;
        case "directEnquiry":
          await fetchDirectEnquiryData(
            currentPage,
            searchTerm,
            dateFilters
          );
          break;
        case "tenDays":
          await fetchTenDaysData(); // This was missing!
          break;
      }
    };

    fetchData();
  }, [
    activeTab,
    currentPage,
    callingDaysFilter,
    scNameFilter,
    itemsPerPage,
  ]);

  // ─── TanStack Query: Pending/History data ──────────────────────────────────
  // Both tabs now query enquiry_pending_view / enquiry_history_view (Postgres
  // views that pre-compute open/closed status via a join -- see
  // DB/create_enquiry_tracker_views.sql). Real .range()-based pagination and
  // every filter is a WHERE clause evaluated against the whole dataset, not
  // a client-side re-scan of whatever happened to already be loaded.
  const queryClient = useQueryClient();
  const usernamesToFilter = isAdmin() ? [] : getUsernamesToFilter();
  // Non-empty only for a lead-source-restricted account -- takes priority
  // over usernamesToFilter inside applySharedFilters (queries.js).
  const leadSourceRestriction = isAdmin() ? [] : getLeadSourcesToFilter();

  const pendingQuery = usePendingEnquiries({
    page: currentPage,
    itemsPerPage,
    searchTerm,
    currentStageFilter,
    valueFilter,
    callingDaysFilter,
    scNameFilter,
    isAdmin: isAdmin(),
    usernamesToFilter,
    leadSourceRestriction,
    enabled: activeTab === "pending",
  });

  const historyQuery = useHistoryEnquiries({
    page: currentPage,
    itemsPerPage,
    searchTerm,
    currentStageFilter,
    valueFilter,
    callingDaysFilter,
    scNameFilter,
    isAdmin: isAdmin(),
    usernamesToFilter,
    leadSourceRestriction,
    enabled: activeTab === "history",
  });

  const mapPendingRow = (row) => {
    const isEnquiry = row.source_type === "enquiry";
    return {
      // Spread the raw view row first so ANY column the view exposes (even
      // ones not explicitly listed below) still reaches renderRowCells via
      // its own snake_case key -- the generic camelCase->snake_case fallback
      // in renderRowCells picks those up automatically. Everything below
      // this line is either a rename (camelCase key the columns config
      // actually reads) or a formatted/derived value.
      ...row,
      id: row.record_id,
      dbId: row.record_id,
      leadIdVal: !isEnquiry ? row.record_id : undefined,
      enquiryIdVal: isEnquiry ? row.record_id : undefined,
      tableSource: isEnquiry ? "enquiries" : "call_tracker_for_leads",
      sourceType: row.source_type,
      // Creation time, matching the list's sort order (queries.js orders
      // this same view by created_at desc) -- previously showed
      // last_activity_at (latest tracker update) instead, which didn't
      // match "Timestamp" as a label nor the sort the user sees it in.
      timestamp: formatDateToDDMMYYYY(row.created_at) || "",
      leadId: row.display_no || "",
      leadNo: row.display_no || "",
      lead_no: row.display_no || "",
      enquiryNo: row.display_no || "",
      companyName: row.company_name || "",
      phoneNumber: row.phone_number || "",
      phoneNo: row.phone_number || "",
      salespersonName: row.person_name || row.sales_person_name || row.assigned_to || "",
      leadSource: row.lead_source || "",
      currentStage: row.current_stage || "",
      callingDate: formatDateToDDMMYYYY(row.last_activity_at) || "",
      customerFeedback: row.customer_feedback || "",
      customerSay: row.customer_feedback || "",
      nextCallDate: row.next_call_date ? formatDateToDDMMYYYY(row.next_call_date) : "",
      nextCallTime: row.next_call_time || "",
      enquiryStatus: row.enquiry_status || "",
      assignedTo: row.assigned_to || "",
      sc_name: row.assigned_to || "",
      plannedAt: row.planned_at ? formatDateToDDMMYYYY(row.planned_at) : "",
      itemQty: row.item_qty || "",
      priority: determinePriority(row.lead_source || ""),
      // Columns that only ever get populated once the record reaches that
      // stage (make-quotation / quotation-validation / order-expected /
      // order-status) -- previously dropped entirely because this object
      // was built from a fixed literal instead of carrying the full row.
      totalQty: row.total_qty || "",
      shippingAddress: row.shipping_address || "",
      enquiryReceiverName: row.enquiry_receiver_name || "",
      enquiryAssignToProject: row.enquiry_assign_to_person || "",
      gstNumber: row.gst_number || "",
      enquiryDate: row.enquiry_date ? formatDateToDDMMYYYY(row.enquiry_date) : "",
      enquiryState: row.enquiry_for_state || "",
      projectName: row.project_name || "",
      salesType: row.sales_type || "",
      enquiryApproach: row.enquiry_approach || "",
      sendQuotationNo: row.send_quotation_no || "",
      quotationSharedBy: row.quotation_shared_by || "",
      quotationNumber: row.quotation_number || "",
      valueWithoutTax: row.quotation_value_without_tax ?? "",
      valueWithTax: row.quotation_value_with_tax ?? "",
      quotationUpload: row.quotation_upload || "",
      quotationRemarks: row.quotation_remarks || "",
      validatorName: row.quotation_validator_name || "",
      sendStatus: row.quotation_send_status || "",
      validationRemark: row.quotation_validation_remark || "",
      faqVideo: row.send_faq_video ?? "",
      productVideo: row.send_product_video ?? "",
      offerVideo: row.send_offer_video ?? "",
      productCatalog: row.send_product_catalog ?? "",
      productImage: row.send_product_image ?? "",
      orderStatus: row.is_order_received_status || "",
      reasonStatus: row.if_no_reason_status || "",
      reasonRemark: row.if_no_reason_remark || "",
      transportMode: row.transport_mode || "",
      conveyedForRegistration: row.conveyed_for_registration_form ?? "",
      orderNo: row.order_no || "",
      destination: row.destination || "",
      poNumber: row.po_number || "",
      acceptanceVia: row.acceptance_via || "",
      acceptanceFile: row.acceptance_file_upload || "",
    };
  };

  const mapHistoryRow = (row) => ({
    // Same rationale as mapPendingRow: carry the full view row through first
    // so every column the view exposes reaches renderRowCells, then rename/
    // format the specific ones the columns config actually reads by key.
    ...row,
    id: row.record_id,
    uuid: row.record_id,
    sourceType: row.source_type,
    Timestamp: formatDateToDDMMYYYY(row.created_at) || "",
    timestamp: formatDateToDDMMYYYY(row.created_at) || "",
    enquiryNo: row.display_no || "",
    leadNo: row.display_no || "",
    lead_no: row.display_no || "",
    companyName: row.company_name || "",
    Company_Name: row.company_name || "",
    phoneNumber: row.phone_number || "",
    phoneNo: row.phone_number || "",
    leadSource: row.lead_source || "",
    currentStage: row.current_stage || "",
    callingDate: row.calling_days || formatDateToDDMMYYYY(row.created_at) || "",
    totalQty: row.total_qty || "",
    shippingAddress: row.shipping_address || "",
    enquiryReceiverName: row.enquiry_receiver_name || "",
    enquiryAssignToProject: row.enquiry_assign_to_person || "",
    gstNumber: row.gst_number || "",
    enquiryDate: row.enquiry_date ? formatDateToDDMMYYYY(row.enquiry_date) : "",
    enquiryState: row.enquiry_for_state || "",
    projectName: row.project_name || "",
    salesType: row.sales_type || "",
    enquiryApproach: row.enquiry_approach || "",
    sendQuotationNo: row.send_quotation_no || "",
    quotationSharedBy: row.quotation_shared_by || "",
    quotationNumber: row.quotation_number || "",
    valueWithTax: row.quotation_value_with_tax ?? "",
    valueWithoutTax: row.quotation_value_without_tax ?? "",
    quotationUpload: row.quotation_upload || "",
    quotationRemarks: row.quotation_remarks || "",
    validatorName: row.quotation_validator_name || "",
    sendStatus: row.quotation_send_status || "",
    validationRemark: row.quotation_validation_remark || "",
    faqVideo: row.send_faq_video ?? "",
    productVideo: row.send_product_video ?? "",
    offerVideo: row.send_offer_video ?? "",
    productCatalog: row.send_product_catalog ?? "",
    productImage: row.send_product_image ?? "",
    // "Order Received Status" is written as `is_order_received_status`
    // (see handleSaveClick's updateData) -- `order_status` isn't a real
    // column, so this was always blank.
    orderStatus: row.is_order_received_status || "",
    reasonStatus: row.if_no_reason_status || "",
    reasonRemark: row.if_no_reason_remark || "",
    order_no: row.order_no || "",
    orderNo: row.order_no || "",
    poNumber: row.po_number || "",
    po_number: row.po_number || "",
    destination: row.destination || "",
    paymentMode: row.payment_mode || "",
    transportMode: row.transport_mode || "",
    nextCallDate: row.next_call_date ? formatDateToDDMMYYYY(row.next_call_date) : "",
    nextCallTime: row.next_call_time ? formatTimeTo12Hour(row.next_call_time) : "",
    customerFeedback: row.customer_feedback || "",
    enquiryStatus: row.enquiry_status || "",
    acceptanceVia: row.acceptance_via || "",
    acceptanceFile: row.acceptance_file_upload || "",
    sc_name: row.assigned_to || "",
    // "Person Name" should be the enquiry's contact person, not the SC --
    // fall back to assigned_to only if no contact-person field is present.
    salespersonName: row.person_name || row.sales_person_name || row.assigned_to || "",
    calling_days: row.calling_days || "",
    itemQty: row.item_qty || "",
    priority: determinePriority(row.enquiry_status || ""),
  });

  useEffect(() => {
    setIsLoading(pendingQuery.isLoading);
    if (pendingQuery.data) {
      setPendingData(pendingQuery.data.rows.map(mapPendingRow));
      setHasMorePending(currentPage * itemsPerPage < pendingQuery.data.totalCount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuery.data, pendingQuery.isLoading]);

  useEffect(() => {
    setIsLoading(historyQuery.isLoading);
    if (historyQuery.data) {
      setHistoryData(historyQuery.data.rows.map(mapHistoryRow));
      setHasMoreHistory(currentPage * itemsPerPage < historyQuery.data.totalCount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyQuery.data, historyQuery.isLoading]);

  // Legacy call sites throughout this file call these after a save/filter
  // change expecting a refetch; the query key already reacts to state
  // changes automatically, so these just force a refresh as a safety net.
  const fetchPendingData = () => {
    queryClient.invalidateQueries({ queryKey: ["enquiryTracker", "pending"] });
  };

  const fetchHistoryData = () => {
    queryClient.invalidateQueries({ queryKey: ["enquiryTracker", "history"] });
  };

  const fetchDirectEnquiryData = async (
    _page = 1,
    searchTerm = "",
    dateFilters = {}
  ) => {
    setIsLoading(true);

    const buildQuery = () => {
      let query = supabase
        .from("lto_enquiries")
        .select("*", { count: "exact" })
        .not("planned_at", "is", null)
        .order("created_at", { ascending: true });

    // Add date filtering for direct enquiry data
    if (dateFilters.today) {
      const today = new Date().toISOString().split("T")[0];
      query = query
        .gte("next_call_date", today)
        .lt(
          "next_call_date",
          new Date(Date.now() + 86400000).toISOString().split("T")[0]
        );
    } else if (dateFilters.overdue) {
      const today = new Date().toISOString().split("T")[0];
      query = query.lt("next_call_date", today);
    } else if (dateFilters.upcoming) {
      const today = new Date().toISOString().split("T")[0];
      query = query.gt("next_call_date", today);
    }

    if (searchTerm) {
      query = query.or(
        `enquiry_no.ilike.%${searchTerm}%,company_name.ilike.%${searchTerm}%,sales_person_name.ilike.%${searchTerm}%`
      );
    }

    if (!isAdmin()) {
      const leadSourceRestriction = getLeadSourcesToFilter();
      if (leadSourceRestriction && leadSourceRestriction.length > 0) {
        // Lead-source-restricted account: every record from that source,
        // regardless of assignee -- replaces the name-based filter below.
        query = query.in("lead_source", leadSourceRestriction);
      } else if (currentUser && currentUser.username) {
        const usernamesToFilter = getUsernamesToFilter();
        query = query.in("sales_coordinator_name", usernamesToFilter);
      }
    }

    // Apply SC name filter for admin
    if (isAdmin() && scNameFilter !== "all") {
      query = query.eq("sales_coordinator_name", scNameFilter);
    }

      return query;
    };

    try {
      const data = await fetchAllRows(buildQuery);
      
      // ✅ Transform data first
      const transformedData = data.map((item, index) => ({
        id: item.id, // Use actual database ID
        dbId: item.id, // Store database ID separately for clarity
        serialNo: index + 1,
        timestamp: formatDateToDDMMYYYY(item.timestamp) || "",
        enquiry_no: item.enquiry_no || "",
        lead_receiver_name: item.enquiry_receiver_name || "",
        lead_source: item.lead_source || "",
        phone_number: item.phone_number || "",
        salesperson_name: item.sales_person_name || "",
        company_name: item.company_name || "",
        current_stage: item.current_stage || "",
        calling_days: item.calling_days || "",
        priority: determinePriority(item.lead_source || ""),
        sc_name: item.sales_coordinator_name || "",
        nextCallDate: item.next_call_date || "",
        // New columns added
        location: item.location || "",
        email: item.email || "",
        shipping_address: item.shipping_address || "",
        enquiry_receiver_name: item.enquiry_receiver_name || "",
        enquiry_assign_to_person: item.enquiry_assign_to_person || "",
        gst_number: item.gst_number || "",
        enquiry_date: item.enquiry_date || "",
        enquiry_for_state: item.enquiry_for_state || "",
        project_name: item.project_name || "",
        sales_type: item.sales_type || "",
        enquiry_approach: item.enquiry_approach || "",
        // Additional requested columns
        enquiry_status: item.enquiry_status || "",
        customer_feedback: item.customer_feedback || "",
        send_quotation_no: item.send_quotation_no || "",
        quotation_shared_by: item.quotation_shared_by || "",
        quotation_number: item.quotation_number || "",
        quotation_value_without_tax: item.quotation_value_without_tax || "",
        quotation_value_with_tax: item.quotation_value_with_tax || "",
        quotation_upload: item.quotation_upload || "",
        quotation_remarks: item.quotation_remarks || "",
        quotation_validator_name: item.quotation_validator_name || "",
        quotation_send_status: item.quotation_send_status || "",
        quotation_validation_remark: item.quotation_validation_remark || "",
        send_faq_video: item.send_faq_video || false,
        send_product_video: item.send_product_video || false,
        send_offer_video: item.send_offer_video || false,
        send_product_catalog: item.send_product_catalog || false,
        send_product_image: item.send_product_image || false,
        next_call_time: formatTimeTo12Hour(item.next_call_time) || "",
        is_order_received_status: item.is_order_received_status || "",
        if_no_reason_status: item.if_no_reason_status || "",
        if_no_reason_remark: item.if_no_reason_remark || "",
        transport_mode: item.transport_mode || "",
        conveyed_for_registration_form: item.conveyed_for_registration_form || false,
        sales_coordinator_name: item.sales_coordinator_name || "",
        order_no: item.order_no || "",
        amount_with_gst: item.amount_with_gst || "",
        total_qty: item.total_qty || "",
        destination: item.destination || "",
        po_number: item.po_number || "",
      }));

      // ✅ Sort by numeric part of enquiry_no (e.g., "En-1" -> 1, "En-10" -> 10)
      const sortedData = transformedData.sort((a, b) => {
        const numA =
          parseInt((a.enquiry_no || "").replace(/^En-/i, ""), 10) || 0;
        const numB =
          parseInt((b.enquiry_no || "").replace(/^En-/i, ""), 10) || 0;
        return numA - numB;
      });

      setDirectEnquiryData(sortedData);

      // Check if there's more data
      setHasMoreDirectEnquiry(false); // We fetched all data

      setIsLoading(false);
      return sortedData;
    } catch (err) {
      console.error("Error fetching direct enquiry data:", err);
      setIsLoading(false);
      return [];
    }
  };

  // 4. Create a function to convert callingDaysFilter to dateFilters object
  const getDateFiltersFromCallingDays = () => {
    const dateFilters = {};

    if (callingDaysFilter.includes("today")) {
      dateFilters.today = true;
    }

    if (callingDaysFilter.includes("overdue")) {
      dateFilters.overdue = true;
    }

    if (callingDaysFilter.includes("upcoming")) {
      dateFilters.upcoming = true;
    }

    if (callingDaysFilter.includes("older")) {
      dateFilters.older = true;
    }

    return dateFilters;
  };

  // Handle search with debounce
  // 6. Update the search useEffect to handle date filters
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchTerm.trim() !== "") {
        setIsSearching(true);
        // Reset pagination and fetch with search term
        setCurrentPage(1);

        // Reset hasMore flags for search
        setHasMorePending(true);
        setHasMoreHistory(true);
        setHasMoreDirectEnquiry(true);

        // Get date filters from callingDaysFilter
        const dateFilters = getDateFiltersFromCallingDays();

        const performSearch = async () => {
          switch (activeTab) {
            case "pending":
              await fetchPendingData(1, searchTerm, dateFilters);
              break;
            case "history":
              await fetchHistoryData(1, searchTerm, dateFilters);
              break;
            case "directEnquiry":
              await fetchDirectEnquiryData(1, searchTerm, dateFilters);
              break;
          }
          setIsSearching(false);
        };

        performSearch();
      } else if (isSearching) {
        // Clear search and reset to normal pagination
        // Otherwise just reset pagination
        setCurrentPage(1);

        // Reset hasMore flags
        setHasMorePending(true);
        setHasMoreHistory(true);
        setHasMoreDirectEnquiry(true);

        // Get date filters from callingDaysFilter
        const dateFilters = getDateFiltersFromCallingDays();

        const resetData = async () => {
          switch (activeTab) {
            case "pending":
              await fetchPendingData(1, "", dateFilters);
              break;
            case "history":
              await fetchHistoryData(1, "", dateFilters);
              break;
            case "directEnquiry":
              await fetchDirectEnquiryData(1, "", dateFilters);
              break;
          }
        };

        resetData();
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(handler);
  }, [searchTerm, activeTab, callingDaysFilter, scNameFilter]);

  // Handle checkbox selection - populate form fields with existing data
  useEffect(() => {
    selectedOrders.forEach((orderNo) => {
      const order = tenDaysData.find((o) => o.orderNo === orderNo);
      if (order) {
        // Only set if not already set (to avoid overwriting user changes)
        if (!orderStatuses[orderNo]) {
          setOrderStatuses((prev) => ({
            ...prev,
            [orderNo]: order.existingStatus || "pending",
          }));
        }
        if (!orderDates[orderNo]) {
          setOrderDates((prev) => ({
            ...prev,
            [orderNo]: order.existingDate || "",
          }));
        }
        if (!orderRemarks[orderNo]) {
          setOrderRemarks((prev) => ({
            ...prev,
            [orderNo]: order.existingRemarks || "",
          }));
        }
      }
    });
  }, [selectedOrders, tenDaysData]);

  const LoadingIndicator = () => {
    if (!isLoading) return null;

    return (
      <div className="flex justify-center items-center py-4 bg-gray-50">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 rounded-full border-b-2 border-primary/30 animate-spin"></div>
          <span className="text-sm text-gray-600">Loading more data...</span>
        </div>
      </div>
    );
  };


  // Reset pagination whenever the tab, search, or any filter changes. Data
  // itself is no longer cleared here -- pendingData/historyData are kept in
  // sync with their respective TanStack Query results (see the sync
  // effects above), which already manage loading/empty state correctly
  // per tab. Clearing them here raced against that sync (the query could
  // resolve and populate data, then this effect would wipe it back to []
  // on the same mount), causing the Pending tab to flash data and then go
  // blank.
  //
  // This used to be split across 3 separate effects with overlapping
  // dependency sets (one for activeTab alone, one guarded on
  // callingDaysFilter/valueFilter/currentStageFilter being non-empty, and
  // a third, unconditional one for the full combined dep set below) --
  // consolidated into one, which also fixes the guarded one's asymmetry
  // (it never reset the page when a filter was cleared back to empty,
  // even though the third effect's unconditional reset already covered
  // that case on the same deps anyway).
  useEffect(() => {
    setCurrentPage(1);
    setHasMorePending(true);
    setHasMoreHistory(true);
    setHasMoreDirectEnquiry(true);
  }, [activeTab, searchTerm, callingDaysFilter, valueFilter, currentStageFilter]);

  const fetchCallingDaysCounts = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];

      const currentUser = JSON.parse(localStorage.getItem("currentUser"));
      const role = localStorage.getItem("userType");
      // Helper function to conditionally apply user filter
      const withRoleFilter = (table) => {
        const query = supabase
          .from(table)
          .select("*", { count: "exact", head: true });
        if (role === "user" && currentUser?.username && (table === "lto_enquiries" || table === "lto_client_master")) {
          const usernamesToFilter = getUsernamesToFilter();
          return query.in("sales_coordinator_name", usernamesToFilter);
        } else if (role === "user" && currentUser?.username && table === "lto_leads") {
          const usernamesToFilter = getUsernamesToFilter();
          return query.in("sc_name", usernamesToFilter);
        }
        return query;
      };

      // Leads
      const { count: pendingToday } = await withRoleFilter("lto_enquiry_tracker_for_leads")
        .is("is_order_received_status", null)
        .eq("next_call_date", today);

      const { count: pendingOverdue } = await withRoleFilter("lto_enquiry_tracker_for_leads")
        .is("is_order_received_status", null)
        .lt("next_call_date", today);

      const { count: pendingUpcoming } = await withRoleFilter("lto_enquiry_tracker_for_leads")
        .is("is_order_received_status", null)
        .gt("next_call_date", today);

      // Direct Enquiries
      const { count: directToday } = await withRoleFilter("lto_enquiry_tracker")
        .is("is_order_received_status", null)
        .eq("next_call_date", today);

      const { count: directOverdue } = await withRoleFilter("lto_enquiry_tracker")
        .is("is_order_received_status", null)
        .lt("next_call_date", today);

      const { count: directUpcoming } = await withRoleFilter("lto_enquiry_tracker")
        .is("is_order_received_status", null)
        .gt("next_call_date", today);

      // History
      const { count: historyToday } = await withRoleFilter("lto_enquiry_tracker")
        .not("is_order_received_status", "is", null)
        .eq("next_call_date", today);

      const { count: historyOlder } = await withRoleFilter(
        "lto_enquiry_tracker"
      ).not("is_order_received_status", "is", null).lt("next_call_date", today);

      setCallingDaysCounts({
        pendingToday: pendingToday || 0,
        pendingOverdue: pendingOverdue || 0,
        pendingUpcoming: pendingUpcoming || 0,
        directToday: directToday || 0,
        directOverdue: directOverdue || 0,
        directUpcoming: directUpcoming || 0,
        historyToday: historyToday || 0,
        historyOlder: historyOlder || 0,
      });
    } catch (error) {
      console.error("Error fetching calling days counts:", error);
    }
  };

  useEffect(() => {
    fetchCallingDaysCounts();
  }, []);

  // Memoized -- this iterates the full data array for the active tab
  // (potentially hundreds of rows) and previously re-ran on every render,
  // including every keystroke of the unrelated searchTerm input.
  const filterCounts = useMemo(() => {
    const counts = {
      today: 0,
      overdue: 0,
      upcoming: 0,
      older: 0,
    };

    if (activeTab === "pending") {
      pendingData.forEach((tracker) => {
        const nextCallDate1 =
          tracker.nextCallDate || tracker.nextCallDate1 || tracker.Calling_Days || tracker.calling_days || tracker.plannedAt || "";
        if (isToday(nextCallDate1)) counts.today++;
        else if (isOverdue(nextCallDate1)) counts.overdue++;
        else if (isUpcoming(nextCallDate1)) counts.upcoming++;
      });
    } else if (activeTab === "directEnquiry") {
      directEnquiryData.forEach((tracker) => {
        const nextCallDate = tracker.nextCallDate || tracker.nextCallDate1 || tracker.calling_days || tracker.Calling_Days || tracker.plannedAt || "";
        if (isToday(nextCallDate)) counts.today++;
        else if (isOverdue(nextCallDate)) counts.overdue++;
        else if (isUpcoming(nextCallDate)) counts.upcoming++;
      });
    } else if (activeTab === "history") {
      // History matches on Timestamp (created_at), not Next-Call Date --
      // same field the "Timestamp" column itself renders (see mapHistoryRow).
      historyData.forEach((tracker) => {
        const timestamp = tracker.created_at || "";
        if (isToday(timestamp)) counts.today++;
        else if (timestamp && parseDateHelper(timestamp)) counts.older++;
      });
    }

    return counts;
  }, [activeTab, pendingData, directEnquiryData, historyData]);

  // Mobile Card View Component for CallTracker
  const MobileCardView = ({ data, type, onView }) => {
    if (type === "pending") {
      return (
        <div className="space-y-4 md:hidden">
          {data.map((tracker, index) => (
            <div
              key={index}
              className="overflow-hidden bg-white rounded-xl border border-gray-100 shadow-lg"
            >
              {/* Header Section */}
              <div className="p-4 bg-primary/5 border-b border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold text-gray-900">
                    {tracker.lead_no}
                  </h3>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                      tracker.priority === "High"
                        ? "bg-destructive/10 text-destructive"
                        : tracker.priority === "Medium"
                        ? "bg-warning/15 text-warning-foreground"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {tracker.Lead_Source}
                  </span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <svg
                    className="mr-1 w-4 h-4"
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
                  <span>{tracker.Lead_Receiver_Name}</span>
                </div>
              </div>

              {/* Content Section */}
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="mb-1 text-xs text-gray-500">Company</p>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {tracker.Company_Name}
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="mb-1 text-xs text-gray-500">Phone</p>
                    <p className="text-sm font-medium text-gray-900">
                      {tracker.Phone_Number}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="mb-1 text-xs text-gray-500">Salesperson</p>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {tracker.salesperson_Name}
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="mb-1 text-xs text-gray-500">Call Date</p>
                    <p className="text-sm font-medium text-gray-900">
                      {tracker.Timestamp}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="mb-1 text-xs text-gray-500">Current Stage</p>
                  <p className="text-sm font-medium text-gray-900">
                    {tracker.Current_Stage}
                  </p>
                </div>

                <div className="p-3 bg-warning/5 rounded-lg border border-warning/20">
                  <p className="mb-1 text-xs font-medium text-warning-foreground">
                    Items
                  </p>
                  <button
                    type="button"
                    onClick={() => openItemDetailsModal(tracker)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/20 text-primary text-xs font-medium hover:bg-primary/5 transition-colors"
                  >
                    <EyeIcon className="h-3.5 w-3.5" />
                    View Items
                  </button>
                </div>
              </div>

              {/* Action Section */}
              <div className="px-4 pb-4">
                <Link
                  state={{ activeTab: "pending", sc_name: tracker.sc_name }}
                  to={`/enquiry-tracker/form?leadId=${tracker.lead_no}`}
                  className="flex justify-center items-center px-4 py-3 w-full text-white brand-gradient rounded-lg shadow-md transition-all duration-200 hover:opacity-90"
                >
                  <ArrowRightIcon className="mr-2 w-5 h-5" />
                  Process Now
                </Link>
              </div>
            </div>
          ))}
        </div>
      );
    } else if (type === "directEnquiry") {
      return (
        <div className="space-y-4 md:hidden">
          {data.map((tracker, index) => (
            <div
              key={index}
              className="overflow-hidden bg-white rounded-xl border border-gray-100 shadow-lg"
            >
              {/* Header Section */}
              <div className="p-4 bg-primary/5 border-b border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold text-gray-900">
                    {tracker.enquiry_no}
                  </h3>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                      tracker.priority === "High"
                        ? "bg-destructive/10 text-destructive"
                        : tracker.priority === "Medium"
                        ? "bg-warning/15 text-warning-foreground"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {tracker.lead_source}
                  </span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <svg
                    className="mr-1 w-4 h-4"
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
                  <span>{tracker.lead_receiver_name}</span>
                </div>
              </div>

              {/* Content Section */}
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="mb-1 text-xs text-gray-500">Company</p>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {tracker.company_name}
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="mb-1 text-xs text-gray-500">Call Date</p>
                    <p className="text-sm font-medium text-gray-900">
                      {tracker.timestamp}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="mb-1 text-xs text-gray-500">Current Stage</p>
                  <p className="text-sm font-medium text-gray-900">
                    {tracker.current_stage}
                  </p>
                </div>

                <div className="p-3 bg-warning/5 rounded-lg border border-warning/20">
                  <p className="mb-1 text-xs font-medium text-warning-foreground">
                    Items
                  </p>
                  <button
                    type="button"
                    onClick={() => openItemDetailsModal(tracker)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/20 text-primary text-xs font-medium hover:bg-primary/5 transition-colors"
                  >
                    <EyeIcon className="h-3.5 w-3.5" />
                    View Items
                  </button>
                </div>
              </div>

              {/* Action Section */}
              <div className="flex px-4 pb-4 space-x-2">
                <Link
                  state={{
                    activeTab: "directEnquiry",
                    sc_name: tracker.sc_name,
                  }}
                  to={`/enquiry-tracker/form?leadId=${tracker.enquiry_no}`}
                  className="flex flex-1 justify-center items-center px-4 py-3 text-white brand-gradient rounded-lg shadow-md transition-all duration-200 hover:opacity-90"
                >
                  <ArrowRightIcon className="mr-2 w-5 h-5" />
                  Process
                </Link>
                <button
                  onClick={() => onView(tracker)}
                  className="flex-1 px-4 py-3 text-gray-700 rounded-lg border border-gray-300 transition-all duration-200 hover:bg-gray-50"
                >
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      );
    } else {
      // History tab mobile view
      return (
        <div className="space-y-4 md:hidden">
          {data.map((tracker, index) => (
            <div
              key={index}
              className="overflow-hidden bg-white rounded-xl border border-gray-100 shadow-lg"
            >
              {/* Header Section */}
              <div className="p-4 bg-primary/5 border-b border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold text-gray-900">
                    {tracker.enquiryNo}
                  </h3>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                      tracker.priority === "High"
                        ? "bg-destructive/10 text-destructive"
                        : tracker.priority === "Medium"
                        ? "bg-warning/15 text-warning-foreground"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {tracker.enquiryStatus}
                  </span>
                </div>
                {tracker.Timestamp && (
                  <div className="flex items-center text-sm text-gray-600">
                    <svg
                      className="mr-1 w-4 h-4"
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
                    <span>{tracker.Timestamp}</span>
                  </div>
                )}
              </div>

              {/* Content Section */}
              <div className="p-4 space-y-3">
                {tracker.customerFeedback && (
                  <div className="p-3 bg-info/10 rounded-lg border border-info/30">
                    <p className="flex items-center mb-1 text-xs font-medium text-info">
                      <svg
                        className="mr-1 w-4 h-4"
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
                    <p className="text-sm italic text-gray-800">
                      "{tracker.customerFeedback}"
                    </p>
                  </div>
                )}

                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="mb-1 text-xs text-gray-500">Current Stage</p>
                  <p className="text-sm font-medium text-gray-900">
                    {tracker.currentStage}
                  </p>
                </div>

                {tracker.nextCallDate && (
                  <div className="p-3 bg-success/10 rounded-lg border border-success/20">
                    <p className="flex items-center mb-1 text-xs font-medium text-success">
                      <svg
                        className="mr-1 w-4 h-4"
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
                      {tracker.nextCallDate}{" "}
                      {tracker.nextCallTime && `at ${tracker.nextCallTime}`}
                    </p>
                  </div>
                )}

                {tracker.orderStatus && (
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/30">
                    <p className="mb-1 text-xs font-medium text-primary">
                      Order Status
                    </p>
                    <p className="text-sm font-medium text-gray-900">
                      {tracker.orderStatus}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    }
  };

  // ─── Merge directEnquiry into pending and Deduplicate ─────────────────────────
  const allPendingRaw = [
    ...(pendingData || []),
    ...(directEnquiryData || [])
  ];
  
  const pendingMap = new Map();
  allPendingRaw.forEach(item => {
    const id = item.lead_no || item.leadNo || item.enquiry_no || item.dbId || item.id;
    const isLead = item.tableSource === 'leads_to_order' || item.tableSource === 'leads' || String(id || '').toUpperCase().startsWith('LD-');
    if (id && !pendingMap.has(id)) {
      pendingMap.set(id, {
        ...item,
        enquiryType: isLead ? 'Lead' : 'Direct Enquiry'
      });
    } else if (!id) {
      // Fallback for items without a clear ID
      pendingMap.set(Math.random(), {
        ...item,
        enquiryType: isLead ? 'Lead' : 'Direct Enquiry'
      });
    }
  });
  
  const mergedPending = Array.from(pendingMap.values());

  // ─── Filtered data (client-side search + filter) ──────────────────────────
  const applyFilters = (list, tab) => list.filter(tracker => {
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      if (!Object.values(tracker).some(v => v && v.toString().toLowerCase().includes(t))) return false;
    }
    if (valueFilter) {
      const rawValue = tracker.valueWithoutTax;
      const numericValue = rawValue !== "" && rawValue !== null && rawValue !== undefined ? parseFloat(rawValue) : NaN;
      if (isNaN(numericValue)) return false;
      if (valueFilter === "gte100000" && numericValue < 100000) return false;
      if (valueFilter === "lt100000" && numericValue >= 100000) return false;
    }
    if (currentStageFilter.length > 0) {
      if (!currentStageFilter.includes(tracker.currentStage || "")) return false;
    }
    if (callingDaysFilter.length > 0) {
      if (tab === "history") {
        // History matches on Timestamp (created_at), not Next-Call Date --
        // same field the "Timestamp" column itself renders.
        const dateVal = tracker.created_at || "";
        const ok = callingDaysFilter.some(f => {
          if (f === "today") return isToday(dateVal);
          if (f === "older") return !isToday(dateVal) && !!parseDateHelper(dateVal);
          return false;
        });
        if (!ok) return false;
      } else {
        const dateVal = tracker.nextCallDate || tracker.nextCallDate1 || tracker.Calling_Days || tracker.calling_days || tracker.callingDate || tracker.plannedAt || "";
        const ok = callingDaysFilter.some(f => {
          if (f === "today") return isToday(dateVal);
          if (f === "overdue") return isOverdue(dateVal);
          if (f === "upcoming") return isUpcoming(dateVal);
          return false;
        });
        if (!ok) return false;
      }
    }
    return true;
  });

  const filteredPending = applyFilters(mergedPending, "pending");
  const filteredHistory = applyFilters(historyData || [], "history");

  // ─── Pagination ───────────────────────────────────────────────────────────
  // The page-reset-on-change effect now lives earlier in this file, merged
  // with the hasMore* flag resets that used to be split across 2 other
  // effects on overlapping deps -- see the comment there.

  // itemsPerPage is covered by the canonical fetch-on-change effect above
  // (its deps now include itemsPerPage) -- this used to be a second,
  // separate effect doing the same fetchPendingData/fetchHistoryData/
  // fetchDirectEnquiryData calls on every currentPage change too, so any
  // page change fired two overlapping invalidations for one logical event.

  const rawCurrentData = activeTab === "pending" ? filteredPending : filteredHistory;
  const currentData = [...rawCurrentData].sort((a, b) => {
    const valA = String(a.enquiryNo || a.enquiry_no || a.leadNo || a.lead_no || "").trim();
    const valB = String(b.enquiryNo || b.enquiry_no || b.leadNo || b.lead_no || "").trim();
    const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
    return activeTab === "history" ? -cmp : cmp;
  });

  const totalResults = currentData.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / itemsPerPage));
  const paginatedData = currentData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);




  // ─── Column visibility for pending (using visiblePendingColumns) ──────────
  const handleSelectAllPending = () => {
    const all = Object.values(visiblePendingColumns).every(Boolean);
    setVisiblePendingColumns(Object.fromEntries(Object.keys(visiblePendingColumns).map(k => [k, !all])));
  };
  const handleColumnTogglePending = (key) => {
    setVisiblePendingColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ─── Row render helpers ───────────────────────────────────────────────────
  const renderRowCells = (tracker, visibleState, isEditing = false, config = columnsConfig) => {
    return config.map(opt => {
      if (!visibleState[opt.key]) return null;
      if (opt.key === "salespersonName" && !isAdmin()) return null;

      const val = tracker[opt.key] ??
        tracker[opt.key.replace(/([A-Z])/g, '_$1').toLowerCase()] ??
        (opt.key.startsWith("itemQty") && opt.key.length === 8 ? (tracker[`quantity${opt.key.slice(-1)}`] || tracker[`Quantity${opt.key.slice(-1)}`]) : null) ??
        (opt.key === "leadId" ? (tracker.leadNo || tracker.lead_no || tracker.enquiryNo || tracker.enquiry_no || tracker.leadId) : null) ??
        (opt.key === "phoneNumber" ? (tracker.phoneNo || tracker.Phone_Number || tracker.phoneNumber) : null) ??
        (opt.key === "companyName" ? (tracker.Company_Name || tracker.company_name || tracker.companyName) : null) ??
        (opt.key === "salespersonName" ? (tracker.salespersonName || tracker.salesperson_Name || tracker.personName || tracker.person_name || tracker.sales_co_ordinator_name || tracker.sales_coordinator || tracker.sc_name) : null) ??
        (opt.key === "customerFeedback" ? (tracker.customerSay || tracker.What_Did_The_Customer_say || tracker.customerFeedback) : null) ??
        (opt.key === "nextCallDate" ? (tracker.nextCallDate || tracker.nextCallDate1 || tracker.Calling_Days || tracker.plannedAt) : null) ??
        (opt.key === "nextCallTime" ? (tracker.nextCallTime1 || tracker.nextCallTime) : null) ??
        (opt.key === "leadSource" ? (tracker.Lead_Source || tracker.lead_source || tracker.leadSource) : null) ??
        (opt.key === "currentStage" ? (tracker.Current_Stage || tracker.current_stage || tracker.currentStage) : null) ??
        "—";

      let cellContent = val !== undefined && val !== null ? String(val) : "—";

      if (isEditing && opt.key === "currentStage") {
        const currentVal = editedData.Current_Stage || editedData.currentStage || val || "";
        cellContent = (
          <select
            value={currentVal}
            onChange={(e) => {
              handleFieldChange("Current_Stage", e.target.value);
              handleFieldChange("currentStage", e.target.value);
            }}
            className="p-1 border border-slate-300 rounded text-xs font-medium bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Select Stage</option>
            <option value="make-quotation">make-quotation</option>
            <option value="quotation-validation">quotation-validation</option>
            <option value="order-expected">order-expected</option>
            <option value="order-status">order-status</option>
          </select>
        );
      } else if (opt.key === "companyName") {
        cellContent = (
          <div className="flex items-center">
            <BuildingIcon className="h-4 w-4 mr-2 text-slate-400 shrink-0" />
            <span className="truncate">{val || "—"}</span>
          </div>
        );
      } else if (opt.key === "leadSource" || opt.key === "enquiryStatus") {
        cellContent = val && val !== "—" ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
            {val}
          </span>
        ) : "—";
      } else if (opt.key === "shippingAddress") {
        cellContent = (
          <div className="max-w-[200px] truncate" title={val}>
            {val || "—"}
          </div>
        );
      } else if (opt.key === "itemQty") {
        cellContent = (
          <button
            type="button"
            onClick={() => openItemDetailsModal(tracker)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/20 text-primary text-xs font-medium hover:bg-primary/5 transition-colors"
            title="View item details"
          >
            <EyeIcon className="h-3.5 w-3.5" />
            View Items
          </button>
        );
      } else if (opt.key === "quotationUpload") {
        // Unlike Acceptance File/Apology Video (plain links to user-uploaded
        // originals with nothing to fall back on), a quotation PDF can be
        // rebuilt from its still-intact DB data if the stored link is dead
        // -- see handleQuotationFileClick / regenerateQuotationPdf.js.
        const isRegenerating = regeneratingQuotationNo === tracker.quotationNumber;
        cellContent = val && val !== "—" ? (
          <a
            href={val}
            onClick={(e) => handleQuotationFileClick(e, val, tracker.quotationNumber)}
            className={`text-info hover:underline ${isRegenerating ? "opacity-50 cursor-wait" : ""}`}
            aria-disabled={isRegenerating}
          >
            {isRegenerating ? "Generating..." : "View File"}
          </a>
        ) : "—";
      } else if (opt.key === "acceptanceFile" || opt.key === "apologyVideo") {
        cellContent = val && val !== "—" ? (
          <a href={val} target="_blank" rel="noopener noreferrer" className="text-info hover:underline">
            {opt.key === "apologyVideo" ? "View Video" : "View File"}
          </a>
        ) : "—";
      } else if (opt.key === "customerFeedback" || opt.key === "quotationRemarks" || opt.key === "validationRemark" || opt.key === "reasonRemark") {
        cellContent = (
          <div className="max-w-[200px] truncate" title={val}>
            {val || "—"}
          </div>
        );
      }

      return (
        <td key={opt.key} className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap">
          {cellContent}
        </td>
      );
    });
  };

  const renderPendingRow = (tracker, index) => (
    <tr key={tracker.id || index} className="hover:bg-slate-50 transition-colors group">
      <td className="px-3 py-3 whitespace-nowrap text-sm font-medium sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[1px_0_0_0_#e5e7eb] border-r border-gray-200">
        <div className="flex gap-2">
          <Link
            to={`/enquiry-tracker/form?leadId=${tracker.leadNo || tracker.lead_no || tracker.leadId || tracker.enquiryNo || tracker.enquiry_no}`}
            state={{ activeTab: "pending", sc_name: tracker.sc_name }}
          >
            <button className="px-2 py-1 text-xs border border-primary/20 text-primary hover:bg-primary/5 rounded-md">
              Process <ArrowRightIcon className="ml-1 h-3 w-3 inline" />
            </button>
          </Link>
          {editingRowId === index ? (
            <div className="flex gap-1">
              <button onClick={() => handleSaveClick(index)} className="px-2 py-1 text-xs bg-success text-white rounded hover:bg-success">Save</button>
              <button onClick={() => setEditingRowId(null)} className="px-2 py-1 text-xs bg-gray-400 text-white rounded hover:bg-gray-500">Cancel</button>
            </div>
          ) : (
            <button onClick={() => handleEditClick(tracker, index)} className="px-2 py-1 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-md">Edit</button>
          )}
        </div>
      </td>
      {renderRowCells(tracker, visiblePendingColumns, editingRowId === index)}
    </tr>
  );

  const renderHistoryRow = (tracker, index) => (
    <tr key={tracker.id || index} className="hover:bg-slate-50 transition-colors">
      <td className="px-3 py-3 whitespace-nowrap text-sm font-medium">
        <button onClick={() => { setSelectedTracker(tracker); setShowPopup(true); }} className="px-3 py-1 text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md">
          View
        </button>
      </td>
      {renderRowCells(tracker, visibleColumns, false, historyColumnsConfig)}
    </tr>
  );

  const renderPendingCard = (tracker, index) => (
    <div key={tracker.id || index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <span className="text-xs font-semibold text-gray-500">{tracker.timestamp}</span>
          <h3 className="font-bold text-gray-900 mt-1">{tracker.companyName}</h3>
          <p className="text-xs text-info font-medium">{tracker.leadNo || tracker.lead_no}</p>
        </div>
        <div className="text-right">
          <span className="block text-xs text-gray-400">Person</span>
          <span className="text-sm font-medium">{tracker.salespersonName}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
        <div><span className="block text-xs text-gray-400">Phone</span><p className="font-medium">{tracker.phoneNo}</p></div>
        <div><span className="block text-xs text-gray-400">Stage</span><p className="text-primary font-medium">{tracker.currentStage || "Pending"}</p></div>
      </div>
      <div className="pt-2 border-t border-gray-100 flex justify-end">
        <Link
          to={`/enquiry-tracker/form?leadId=${tracker.leadNo || tracker.lead_no}`}
          state={{ activeTab: "pending", sc_name: tracker.sc_name }}
          className="w-full"
        >
          <button className="flex items-center justify-center w-full px-3 py-2 text-sm border border-primary/20 text-primary hover:bg-primary/5 rounded-md font-medium">
            Process <ArrowRightIcon className="ml-1 h-3 w-3" />
          </button>
        </Link>
      </div>
    </div>
  );

  const renderHistoryCard = (tracker, index) => (
    <div key={tracker.id || index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <span className="text-xs font-semibold text-gray-500">{tracker.timestamp}</span>
          <h3 className="font-bold text-gray-900">{tracker.companyName}</h3>
          <p className="text-xs text-info font-medium">{tracker.enquiryNo}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
        <div><span className="block text-xs text-gray-400">Stage</span><p className="text-primary font-medium">{tracker.currentStage}</p></div>
        <div><span className="block text-xs text-gray-400">Status</span><p>{tracker.enquiryStatus}</p></div>
      </div>
      <div className="pt-2 border-t border-gray-100">
        <button onClick={() => { setSelectedTracker(tracker); setShowPopup(true); }} className="w-full flex items-center justify-center px-3 py-2 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md font-medium">
          View
        </button>
      </div>
    </div>
  );

  // ─── Headers ─────────────────────────────────────────────────────────────
  const getHeaders = () => {
    if (activeTab === "pending") {
      const baseHeaders = [
        { label: "Actions", className: "sticky left-0 bg-gray-50 z-30 shadow-[1px_0_0_0_#e5e7eb] border-r border-gray-200" }
      ];
      columnsConfig.forEach(opt => {
        if (visiblePendingColumns[opt.key]) {
          if (opt.key === "salespersonName") {
            if (isAdmin()) baseHeaders.push(opt.label);
          } else {
            baseHeaders.push(opt.label);
          }
        }
      });
      return baseHeaders;
    }

    const historyHeaders = [
      "Actions",
      ...historyColumnsConfig
        .filter(opt => visibleColumns[opt.key])
        .filter(opt => opt.key !== "salespersonName" || isAdmin())
        .map(opt => opt.label)
    ];
    return historyHeaders;
  };

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 w-full p-1 md:p-1.5">
      <EnquiryTrackerFilter
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        callingDaysFilter={callingDaysFilter}
        setCallingDaysFilter={setCallingDaysFilter}
        valueFilter={valueFilter}
        setValueFilter={setValueFilter}
        currentStageFilter={currentStageFilter}
        setCurrentStageFilter={setCurrentStageFilter}
        filterCounts={filterCounts}
        showColumnDropdown={showColumnDropdown}
        setShowColumnDropdown={setShowColumnDropdown}
        visibleColumns={visibleColumns}
        handleSelectAll={handleSelectAll}
        handleColumnToggle={handleColumnToggle}
        columnOptions={columnOptions}
        visiblePendingColumns={visiblePendingColumns}
        handleSelectAllPending={handleSelectAllPending}
        handleColumnTogglePending={handleColumnTogglePending}
        pendingColumnOptions={pendingColumnOptions}
        setShowNewCallTrackerForm={setShowNewCallTrackerForm}
        pendingCallTrackers={mergedPending}
        historyCallTrackers={historyData}
        currentStageOptions={CURRENT_STAGE_OPTIONS}
      />

      <div className="flex-1 flex flex-col min-h-0 mt-1">
        {isLoading ? (
          <div className="p-8 text-center flex-1 flex flex-col justify-center items-center bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-slate-500">Loading Enquiry tracker data...</p>
          </div>
        ) : (
          <DataTable
            headers={getHeaders()}
            data={paginatedData}
            renderRow={activeTab === "pending" ? renderPendingRow : renderHistoryRow}
            renderCard={activeTab === "pending" ? renderPendingCard : renderHistoryCard}
            currentPage={currentPage}
            totalPages={totalPages}
            itemsPerPage={itemsPerPage}
            itemsPerPageOptions={[100, 200, 500]}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(val) => { setItemsPerPage(val); setCurrentPage(1); }}
            totalResults={totalResults}
            minWidth="min-w-[1200px]"
          />
        )}
      </div>

      {/* New Enquiry Form Modal */}
      {showNewCallTrackerForm && (
        <DirectEnquiryForm
          initialData={newEnquiryPrefill}
          onClose={(shouldRefresh) => {
            setShowNewCallTrackerForm(false);
            setNewEnquiryPrefill(null);
            if (shouldRefresh) {
              const dateFilters = getDateFiltersFromCallingDays();
              fetchPendingData(1, searchTerm, false, dateFilters);
              fetchDirectEnquiryData(1, searchTerm, false, dateFilters);
            }
          }}
        />
      )}

      {/* Item-Details Modal */}
      {itemDetailsModal.open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeItemDetailsModal}></div>
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
            <div className="border-b p-4 flex justify-between items-center shrink-0">
              <h3 className="text-base font-bold text-gray-900">
                Item Details {itemDetailsModal.title ? `— ${itemDetailsModal.title}` : ""}
              </h3>
              <button
                onClick={closeItemDetailsModal}
                className="text-gray-400 hover:text-gray-600 font-bold text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {itemDetailsModal.loading ? (
                <div className="text-center py-8 text-gray-400 text-sm">Loading items...</div>
              ) : itemDetailsModal.items.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No items found for this record.</div>
              ) : (
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      <th className="py-2 pr-3">Item Name</th>
                      <th className="py-2 text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {itemDetailsModal.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="py-2 pr-3 text-gray-800">{it.item_name || "—"}</td>
                        <td className="py-2 text-right text-gray-800">{it.quantity ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Popup Modal */}
      {showPopup && selectedTracker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPopup(false)}></div>
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">
                {activeTab === "pending" ? `Enquiry Details: ${selectedTracker?.leadNo || selectedTracker?.lead_no}` : `Enquiry History: ${selectedTracker?.enquiryNo}`}
              </h3>
              <button onClick={() => setShowPopup(false)} className="text-gray-500 hover:text-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {columnOptions.filter(o => visibleColumns[o.key]).map(o => (
                  <div key={o.key} className="space-y-1">
                    <p className="text-sm font-medium text-gray-500">{o.label}</p>
                    <p className="text-base">{selectedTracker[o.key] ?? "—"}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t p-4 flex justify-end gap-3">
              <button onClick={() => setShowPopup(false)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Close</button>
              {activeTab === "pending" && (
                <Link
                  to={`/enquiry-tracker/form?leadId=${selectedTracker?.leadNo || selectedTracker?.lead_no}`}
                  state={{ activeTab: "pending", sc_name: selectedTracker?.sc_name }}
                >
                  <button className="px-4 py-2 brand-gradient text-white font-medium rounded-md">
                    Process <ArrowRightIcon className="ml-1 h-4 w-4 inline" />
                  </button>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EnquiryTracker;
