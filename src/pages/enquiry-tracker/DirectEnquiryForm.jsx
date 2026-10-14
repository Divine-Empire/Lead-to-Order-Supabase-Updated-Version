"use client"

import { useState, useEffect, useContext } from "react"
import { AuthContext } from "../../App"
import useConfirmDialog from "../../components/useConfirmDialog"
import useDialogBehavior from "../../components/useDialogBehavior"
import supabase from "../../utils/supabase"
import { TABLES, COLUMNS } from "../../constants/dbSchema"
import { resolveScAndCreForNewCompany } from "../../utils/scAssignment"

const CallTrackerForm = ({ onClose = () => window.history.back(), initialData = null }) => {
  const { showNotification = () => {} } = useContext(AuthContext) || {}
  const { confirmAsync, confirmDialog } = useConfirmDialog()
  const dialogRef = useDialogBehavior(() => {
    try {
      onClose()
    } catch (error) {
      console.error("Error closing form:", error)
    }
  }, { autoFocus: false })
  const [leadSources, setLeadSources] = useState([])
  const [enquiryStates, setEnquiryStates] = useState([])
  const [nobOptions, setNobOptions] = useState([])
  const [salesTypes, setSalesTypes] = useState([])
  const [enquiryApproachOptions, setEnquiryApproachOptions] = useState([])
  const [productCategories, setProductCategories] = useState([])
  const [companyOptions, setCompanyOptions] = useState([])
  const [companyDetailsMap, setCompanyDetailsMap] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [receiverOptions, setReceiverOptions] = useState([])
  const [assignToProjectOptions, setAssignToProjectOptions] = useState([])
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
  const [filteredCompanies, setFilteredCompanies] = useState([])
  const [groupOptions, setGroupOptions] = useState([])
  const [clientMasterRecords, setClientMasterRecords] = useState([])

  // Prefill forwarded from Client Master's "Enquiry" action button (via
  // EnquiryTracker.jsx's `newEnquiryPrefill`) -- only present when this form
  // was opened from there, otherwise every field starts blank as before.
  const [newCallTrackerData, setNewCallTrackerData] = useState({
    enquiryNo: "",
    leadSource: "",
    scName: initialData?.scName || "",
    crmName: initialData?.crmName || "",
    companyName: initialData?.companyName || "",
    groupName: initialData?.groupName || "",
    stateCode: "",
    phoneNumber: initialData?.phoneNumber || "",
    salesPersonName: initialData?.salesPersonName || "",
    location: initialData?.location || "",
    emailAddress: "",
    shippingAddress: "",
    enquiryReceiverName: "",
    enquiryAssignToProject: "",
    gstNumber: initialData?.gstNumber || "",
    isCompanyAutoFilled: !!initialData
  })

  const [enquiryFormData, setEnquiryFormData] = useState({
    enquiryDate: "",
    enquiryState: initialData?.enquiryState || "",
    nob: "",
    salesType: "",
    enquiryApproach: "",
  })

  const [items, setItems] = useState([{ id: "1", name: "", quantity: "" }])


  // Filter companies based on search input and selected group
  useEffect(() => {
    let matchingCompanies = companyOptions;
    if (newCallTrackerData.groupName) {
      matchingCompanies = clientMasterRecords
        .filter(c => c.company_group_name && c.company_group_name.trim().toLowerCase() === newCallTrackerData.groupName.trim().toLowerCase())
        .map(c => c.company_name)
        .filter(Boolean);
      matchingCompanies = [...new Set(matchingCompanies)].sort();
    }
    if (newCallTrackerData.companyName) {
      const filtered = matchingCompanies.filter(company =>
        company.toLowerCase().includes(newCallTrackerData.companyName.toLowerCase())
      );
      setFilteredCompanies(filtered);
    } else {
      setFilteredCompanies(matchingCompanies);
    }
  }, [newCallTrackerData.companyName, newCallTrackerData.groupName, companyOptions, clientMasterRecords]);

  useEffect(() => {
    fetchDropdownData()
    fetchCompanyData()
    generateEnquiryNumber()
  }, [])

  /** Returns the next enquiry number for display only (the DB trigger assigns the real one).
   *  Handles both 'EN-' (DB trigger format) and 'En-' (legacy frontend format).
   */
  const generateFreshEnquiryNo = async () => {
    const { data, error } = await supabase
      .from(TABLES.ENQUIRY_TO_ORDER)
      .select("enquiry_no")
      .not("enquiry_no", "is", null);

    if (error) {
      console.error("Error fetching enquiry numbers:", error);
      return "EN-0001";
    }

    let maxNumber = 0;
    (data || []).forEach(item => {
      if (item.enquiry_no) {
        // Handle both 'EN-' and 'En-' prefixes, any digit length
        const match = item.enquiry_no.match(/^[Ee][Nn]-0*(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNumber) maxNumber = num;
        }
      }
    });

    return `EN-${(maxNumber + 1).toString().padStart(4, '0')}`;
  };

  const generateEnquiryNumber = async () => {
    try {
      const formattedEnquiryNo = await generateFreshEnquiryNo();
      setNewCallTrackerData(prev => ({ ...prev, enquiryNo: formattedEnquiryNo }));
    } catch (err) {
      console.error("Exception generating enquiry number:", err);
      setNewCallTrackerData(prev => ({ ...prev, enquiryNo: "EN-0001" }));
    }
  };

  const fetchDropdownData = async () => {
    // Helper: fetch all values for a given category from the normalized dropdown table
    const fetchCategory = (category) =>
      supabase.from(TABLES.DROPDOWN).select("value").eq("category", category);

    // Fetch items from public.items table (handling more than 1000 items)
    const fetchItems = async () => {
      let allItems = [];
      let from = 0;
      const step = 1000;
      let fetchMore = true;

      while (fetchMore) {
        const { data, error } = await supabase
          .from("lto_items")
          .select("item_name")
          .range(from, from + step - 1);

        if (error) return { data: null, error };
        
        if (data && data.length > 0) {
          allItems = [...allItems, ...data];
          from += step;
          if (data.length < step) fetchMore = false;
        } else {
          fetchMore = false;
        }
      }
      return { data: allItems, error: null };
    };

    try {
      const [
        { data: leadSourcesData, error: leadSourcesError },
        { data: statesData, error: statesError },
        { data: nobData, error: nobError },
        { data: salesTypeData, error: salesTypeError },
        { data: approachData, error: approachError },
        { data: receiversData, error: receiversError },
        { data: assignToData, error: assignToError },
        { data: itemsData, error: itemsError }
      ] = await Promise.all([
        fetchCategory("lead_source"),
        fetchCategory("state"),
        fetchCategory("nob"),
        fetchCategory("sales_type"),
        fetchCategory("enquiry_approach"),
        fetchCategory("lead_receiver_name"),
        fetchCategory("lead_assign_to"),
        fetchItems()
      ]);

      const errors = [
        leadSourcesError, statesError, nobError,
        salesTypeError, approachError, receiversError, assignToError, itemsError
      ].filter(Boolean);

      if (errors.length > 0) {
        throw new Error("Failed to fetch some dropdown data");
      }

      const toValues = (arr) => (arr || []).map(item => item.value).filter(Boolean);
      const toItemValues = (arr) => [...new Set((arr || []).map(item => item.item_name).filter(Boolean))].sort();

      setLeadSources([...new Set(toValues(leadSourcesData))]);
      setEnquiryStates([...new Set(toValues(statesData))]);
      setNobOptions([...new Set(toValues(nobData))]);
      setSalesTypes([...new Set(toValues(salesTypeData))]);
      setEnquiryApproachOptions([...new Set(toValues(approachData))]);
      setReceiverOptions([...new Set(toValues(receiversData))]);
      setAssignToProjectOptions([...new Set(toValues(assignToData))]);
      setProductCategories(toItemValues(itemsData));

    } catch (error) {
      console.error("Error fetching dropdown values:", error);
      setLeadSources(["Website", "Justdial", "Sulekha", "Indiamart", "Referral", "Other"]);
      setCompanyOptions([]);
      setEnquiryStates(["Maharashtra", "Gujarat", "Karnataka", "Tamil Nadu", "Delhi"]);
      setNobOptions(["NOB 1", "NOB 2", "NOB 3"]);
      setSalesTypes(["NBD", "CRR", "NBD_CRR"]);
      setEnquiryApproachOptions(["Approach 1", "Approach 2", "Approach 3"]);
      setReceiverOptions(["Receiver 1", "Receiver 2", "Receiver 3"]);
      setAssignToProjectOptions(["Project 1", "Project 2", "Project 3"]);
    }
  }

  // Function to fetch company data
  const fetchCompanyData = async () => {
    try {
      let allData = [];
      let from = 0;
      const step = 1000;
      let fetchMore = true;

      while (fetchMore) {
        const { data, error } = await supabase
          .from("lto_client_master")
          .select("*")
          .range(from, from + step - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += step;
          if (data.length < step) fetchMore = false;
        } else {
          fetchMore = false;
        }
      }

      const relevantRecords = allData.filter((c) => c.isRelevant !== false);
      
      if (relevantRecords && relevantRecords.length > 0) {
        const companies = [];
        const detailsMap = {};
        const groups = [];

        relevantRecords.forEach(company => {
          if (company.company_group_name) {
            groups.push(company.company_group_name.trim());
          }
          if (company.company_name) {
            companies.push(company.company_name);

            detailsMap[company.company_name] = {
              phoneNumber: company.client_mobile_number || "",
              salesPersonName: company.client_name || "",
              location: company.billing_address || "",
              gstNumber: company.gst_number || "",
              enquiryState: company.state || "",
              stateCode: company.state_code || "",
              scName: company.sc_name || "",
              crmName: company.crm_name || "",
              salesType: company.sales_type || "",
              groupName: company.company_group_name || ""
            };
          }
        });

        const uniqueCompanies = [...new Set(companies)].sort();
        const uniqueGroups = [...new Set(groups)].filter(Boolean).sort();
        setCompanyOptions(uniqueCompanies);
        setFilteredCompanies(uniqueCompanies);
        setCompanyDetailsMap(detailsMap);
        setGroupOptions(uniqueGroups);
        setClientMasterRecords(relevantRecords);
      }
    } catch (error) {
      console.error("Error fetching company data:", error);
      setCompanyOptions([]);
      setFilteredCompanies([]);
      setCompanyDetailsMap({});
      setGroupOptions([]);
      setClientMasterRecords([]);
    }
  };

  // Handle company name change and auto-fill other fields
  const handleCompanyChange = (companyName) => {
    const companyDetails = companyDetailsMap[companyName] || {};
    setNewCallTrackerData(prev => ({
      ...prev,
      companyName: companyName,
      phoneNumber: companyDetails.phoneNumber || prev.phoneNumber,
      salesPersonName: companyDetails.salesPersonName || prev.salesPersonName,
      location: companyDetails.location || prev.location,
      gstNumber: companyDetails.gstNumber || prev.gstNumber,
      stateCode: companyDetails.stateCode || prev.stateCode,
      // SC/CRM are never user-typed in this form (no input for either) --
      // they only ever come from whichever company is currently selected.
      // Falling back to `prev.scName`/`prev.crmName` here would leak the
      // PREVIOUSLY selected company's SC/CRM onto this one when the newly
      // picked company has none of its own yet, instead of leaving it blank
      // for handleSubmit's round-robin fallback to fill in correctly.
      scName: companyDetails.scName || "",
      crmName: companyDetails.crmName || "",
      groupName: companyDetails.groupName || prev.groupName,
      isCompanyAutoFilled: true
    }));

    setEnquiryFormData(prev => ({
      ...prev,
      enquiryState: companyDetails.enquiryState || prev.enquiryState,
      salesType: companyDetails.salesType || prev.salesType
    }));

    setShowCompanyDropdown(false);
  }

  // Function to handle adding a new item
  const addItem = () => {
    if (items.length < 300) {
      const newId = (items.length + 1).toString()
      setItems([...items, { id: newId, name: "", quantity: "" }])
    }
  }

  // Function to handle removing an item
  const removeItem = (id) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id))
    }
  }

  // Function to update an item
  const updateItem = (id, field, value) => {
    setItems(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  const formatDateToISO = (dateValue) => {
    if (!dateValue) return "";

    try {
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
      return dateValue;
    } catch (error) {
      console.error("Error formatting date:", error);
      return dateValue;
    }
  }

  // Function to handle form submission
  const handleSubmit = async () => {
    if (!newCallTrackerData.groupName || !newCallTrackerData.groupName.trim()) {
      showNotification("Group Name is mandatory.", "error");
      return;
    }
    if (!newCallTrackerData.stateCode || !newCallTrackerData.stateCode.trim()) {
      showNotification("State Code is mandatory.", "error");
      return;
    }
    // Validate that all items have a name and quantity
    for (const item of items) {
      if (!item.name || !item.name.trim()) {
        showNotification("Item Name is mandatory for all items.", "error");
        return;
      }
      if (!item.quantity || !item.quantity.toString().trim()) {
        showNotification("Quantity is mandatory for all items.", "error");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Same customer request logged twice by different receivers (e.g.
      // En-9454 / En-9463) leaves one copy with no quotation. Warn, don't
      // block -- a client can legitimately send a new requirement.
      // ponytail: matches on company name + last 7 days only; doesn't check
      // whether the earlier enquiry is still open in the tracker.
      const companyName = (newCallTrackerData.companyName || "").trim();
      if (companyName) {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recent, error: recentErr } = await supabase
          .from("lto_enquiries")
          .select("enquiry_no, created_at, enquiry_receiver_name, lto_enquiry_items(item_name, quantity)")
          .ilike("company_name", companyName)
          .gte("created_at", since)
          .order("created_at", { ascending: false });

        if (recentErr) {
          console.warn("Duplicate-enquiry check failed, continuing:", recentErr);
        } else if (recent && recent.length > 0) {
          const lines = recent.map((e) => {
            const items = (e.lto_enquiry_items || [])
              .map((i) => `${i.item_name} x${i.quantity}`)
              .join(", ");
            const when = new Date(e.created_at).toLocaleString("en-IN");
            return `• ${e.enquiry_no} (${when}, by ${e.enquiry_receiver_name || "-"}): ${items || "no items"}`;
          });
          const proceed = await confirmAsync({
            title: "Possible duplicate enquiry",
            confirmText: "Create anyway",
            destructive: false,
            message:
            `"${companyName}" already has ${recent.length} enquir${recent.length === 1 ? "y" : "ies"} in the last 7 days:\n\n` +
            `${lines.join("\n")}\n\n` +
            `If this is the same requirement, cancel and continue on the existing enquiry instead.\n\n` +
            `Create a new enquiry anyway?`,
          });
          if (!proceed) return;
        }
      }

      // Fetch TAT config for stage_name = "Enquiry Tracker for Enquiries"
      let tatDurationMinutes = 60;

      try {
        const { data: tatData } = await supabase
          .from("lto_tat_config")
          .select("tat_duration")
          .eq("stage_name", "Enquiry Tracker for Enquiries")
          .maybeSingle();

        if (tatData && tatData.tat_duration !== null && tatData.tat_duration !== undefined) {
          tatDurationMinutes = Number(tatData.tat_duration) || 60;
        }
      } catch (err) {
        console.warn("Could not fetch TAT config for Enquiry Tracker for Enquiries, defaulting to 1 hour:", err);
      }

      const createdAtDate = new Date();
      const plannedAtTime = new Date(createdAtDate.getTime() + tatDurationMinutes * 60 * 1000);

      // Check existing client in client_master
      let existingClient = null;
      if (newCallTrackerData.companyName) {
        try {
          const { data: clientRes } = await supabase
            .from("lto_client_master")
            .select("uuid, client_code, sc_name, crm_name, company_group_name, state, state_code")
            .ilike("company_name", newCallTrackerData.companyName.trim())
            .maybeSingle();
          existingClient = clientRes;
        } catch (err) {
          console.warn("Could not fetch client from client_master:", err);
        }
      }

      // 1. Auto-assign SC Name (and, for group companies, CRE) via the same
      // shared rule Leads.jsx uses (src/utils/scAssignment.js): existing
      // client's own values win first; otherwise a brand-new/still-missing
      // company gets SC+CRE copied from the group's last-created company,
      // or falls back to the sc_distribution round-robin for SC only (CRE
      // stays null -- only assigned later, at order conversion).
      let assignedScName = existingClient?.sc_name || newCallTrackerData.scName || null;
      let assignedCrmName = existingClient?.crm_name || newCallTrackerData.crmName || null;

      if (!assignedScName) {
        const resolved = await resolveScAndCreForNewCompany({
          groupName: newCallTrackerData.groupName,
          salesType: enquiryFormData.salesType,
          leadSource: newCallTrackerData.leadSource,
          nob: enquiryFormData.nob,
        });
        assignedScName = resolved.scName || assignedScName;
        if (!assignedCrmName) {
          assignedCrmName = resolved.crmName;
        }
      }

      const baseRowData = {
        created_at: createdAtDate.toISOString(),
        planned_at: plannedAtTime.toISOString(),
        enquiry_status: "New",
        lead_source: newCallTrackerData.leadSource,
        sales_coordinator_name: assignedScName,
        crm_name: assignedCrmName,
        company_name: newCallTrackerData.companyName,
        phone_number: newCallTrackerData.phoneNumber,
        sales_person_name: newCallTrackerData.salesPersonName,
        location: newCallTrackerData.location,
        email: newCallTrackerData.emailAddress,
        shipping_address: newCallTrackerData.shippingAddress,
        enquiry_receiver_name: newCallTrackerData.enquiryReceiverName,
        enquiry_assign_to_person: newCallTrackerData.enquiryAssignToProject,
        gst_number: newCallTrackerData.gstNumber,
        enquiry_date: enquiryFormData.enquiryDate ? formatDateToISO(enquiryFormData.enquiryDate) : null,
        enquiry_for_state: enquiryFormData.enquiryState,
        nob: enquiryFormData.nob,
        sales_type: enquiryFormData.salesType,
        enquiry_approach: enquiryFormData.enquiryApproach,
      };

      // 1. Insert header into enquiries table.
      //    Do NOT send enquiry_no — the DB trigger (lto_set_enquiry_no) assigns it
      //    atomically using MAX() to avoid duplicate-key races.
      const { data: insertedEnquiry, error: enquiryError } = await supabase
        .from("lto_enquiries")
        .insert([baseRowData])
        .select()
        .single();

      if (enquiryError) {
        console.error("Error inserting enquiry:", enquiryError.message);
        showNotification("Error saving enquiry: " + enquiryError.message, "error");
        return;
      }

      // Sync the displayed enquiry number with what the DB actually assigned
      if (insertedEnquiry?.enquiry_no) {
        setNewCallTrackerData(prev => ({ ...prev, enquiryNo: insertedEnquiry.enquiry_no }));
      }

      const newEnquiryId = insertedEnquiry.id;
      const assignedEnquiryNo = insertedEnquiry.enquiry_no;

      // 2. Insert items into enquiry_items table
      const itemRows = items.map(item => ({
        enquiry_id: newEnquiryId,
        item_name: item.name,
        quantity: parseInt(item.quantity, 10) || 1,
      }));

      const { error: itemsError } = await supabase
        .from("lto_enquiry_items")
        .insert(itemRows);

      if (itemsError) {
        console.error("Error inserting enquiry items:", itemsError.message);
      }

      if (newCallTrackerData.companyName) {
        try {
          if (!existingClient) {
            await supabase.from("lto_client_master").insert([{
              company_name: newCallTrackerData.companyName.trim(),
              company_group_name: newCallTrackerData.groupName || null,
              state: enquiryFormData.enquiryState || null,
              state_code: newCallTrackerData.stateCode || null,
              client_name: newCallTrackerData.salesPersonName || null,
              client_mobile_number: newCallTrackerData.phoneNumber || null,
              billing_address: newCallTrackerData.location || null,
              gst_number: newCallTrackerData.gstNumber || null,
              sc_name: assignedScName || null,
              crm_name: assignedCrmName || null,
              sales_type: enquiryFormData.salesType || null,
              isRelevant: true,
              already_in_tracker: `Enquiry Tracker (${assignedEnquiryNo || 'New'})`
            }]);
          } else {
            const updatePayload = {
              already_in_tracker: `Enquiry Tracker (${assignedEnquiryNo || 'New'})`,
              // A new enquiry just came in for this company -- it's been
              // re-engaged, so it no longer counts as "converted but never
              // followed up" regardless of what this new enquiry's own
              // outcome ends up being.
              is_newly_converted: false,
              updated_at: new Date().toISOString(),
              state: enquiryFormData.enquiryState || existingClient.state || null,
              state_code: newCallTrackerData.stateCode || existingClient.state_code || null
            };
            if (newCallTrackerData.groupName && !existingClient.company_group_name) {
              updatePayload.company_group_name = newCallTrackerData.groupName;
            }
            if (!existingClient.sc_name && assignedScName) {
              updatePayload.sc_name = assignedScName;
            }
            if (!existingClient.crm_name && assignedCrmName) {
              updatePayload.crm_name = assignedCrmName;
            }
            await supabase
              .from("lto_client_master")
              .update(updatePayload)
              .eq("uuid", existingClient.uuid);
          }
        } catch (cmErr) {
          console.error("Error updating client_master tracking status:", cmErr);
        }
      }

      showNotification(`Call tracker updated successfully. Enquiry No: ${assignedEnquiryNo || 'Generated'}`, "success");
      onClose(true);
    } catch (err) {
      console.error("Unexpected error:", err);
      showNotification("Error saving data: " + err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="direct-enquiry-title"
        className="bg-card rounded-lg shadow-lg border max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-4 border-b">
          <div className="flex justify-between items-center">
            <h2 id="direct-enquiry-title" className="text-base font-semibold text-foreground">Direct Enquiry</h2>
            <button
              type="button"
              onClick={() => {
                try {
                  onClose();
                } catch (error) {
                  console.error("Error closing form:", error);
                  const modal = document.querySelector('.fixed.inset-0');
                  if (modal) {
                    modal.style.display = 'none';
                  }
                }
              }}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="leadSource" className="block text-sm font-medium text-foreground">
                Enquiry Source
               <span className="text-destructive">*</span></label>
              <select
                id="leadSource"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                value={newCallTrackerData.leadSource}
                onChange={(e) => setNewCallTrackerData(prev => ({ ...prev, leadSource: e.target.value }))}
                required
              >
                <option value="">Select source</option>
                {leadSources.map((source, index) => (
                  <option key={index} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </div>

            {/* Group Name dropdown */}
            <div className="space-y-2">
              <label htmlFor="groupName" className="block text-sm font-medium text-foreground">
                Group Name
               <span className="text-destructive">*</span></label>
              <select
                id="groupName"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                value={newCallTrackerData.groupName || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewCallTrackerData(prev => ({ ...prev, groupName: val, companyName: "" }));
                }}
                required
              >
                <option value="">Select Group Name</option>
                {groupOptions.map((group, index) => (
                  <option key={index} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>

            {/* Searchable Company Name dropdown */}
            <div className="space-y-2 relative">
              <label htmlFor="companyName" className="block text-sm font-medium text-foreground">
                Company Name
               <span className="text-destructive">*</span></label>
              <div className="relative">
                <input
                  type="text"
                  id="companyName"
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                  value={newCallTrackerData.companyName}
                  onChange={(e) => {
                    setNewCallTrackerData(prev => ({
                      ...prev,
                      companyName: e.target.value,
                      isCompanyAutoFilled: false
                    }));
                    setShowCompanyDropdown(true);
                  }}
                  onFocus={() => setShowCompanyDropdown(true)}
                  placeholder="Type to search companies"
                  required
                />
                {showCompanyDropdown && filteredCompanies.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-input rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredCompanies.map((company, index) => (
                      <div
                        key={index}
                        className="px-4 py-2 text-sm cursor-pointer hover:bg-accent"
                        onClick={() => handleCompanyChange(company)}
                      >
                        {company}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="phoneNumber" className="block text-sm font-medium text-foreground">
                Phone Number
               <span className="text-destructive">*</span></label>
              <input
                id="phoneNumber"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                placeholder="Enter phone number"
                value={newCallTrackerData.phoneNumber}
                onChange={(e) => setNewCallTrackerData(prev => ({ ...prev, phoneNumber: e.target.value, isCompanyAutoFilled: false }))}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="salesPersonName" className="block text-sm font-medium text-foreground">
                Person Name
               <span className="text-destructive">*</span></label>
              <input
                id="salesPersonName"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                placeholder="Enter person name"
                value={newCallTrackerData.salesPersonName}
                onChange={(e) => setNewCallTrackerData(prev => ({ ...prev, salesPersonName: e.target.value, isCompanyAutoFilled: false }))}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="location" className="block text-sm font-medium text-foreground">
                Billing Address
               <span className="text-destructive">*</span></label>
              <input
                id="location"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                placeholder="Enter billing address"
                value={newCallTrackerData.location}
                onChange={(e) => setNewCallTrackerData(prev => ({ ...prev, location: e.target.value, isCompanyAutoFilled: false }))}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="emailAddress" className="block text-sm font-medium text-foreground">
                Email Address
              </label>
              <input
                id="emailAddress"
                type="email"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                placeholder="Enter email address"
                value={newCallTrackerData.emailAddress}
                onChange={(e) => setNewCallTrackerData(prev => ({ ...prev, emailAddress: e.target.value, isCompanyAutoFilled: false }))}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="shippingAddress" className="block text-sm font-medium text-foreground">
                Shipping Address
               <span className="text-destructive">*</span></label>
              <input
                id="shippingAddress"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                placeholder="Enter shipping address"
                value={newCallTrackerData.shippingAddress}
                onChange={(e) => setNewCallTrackerData(prev => ({
                  ...prev,
                  shippingAddress: e.target.value,
                  isCompanyAutoFilled: false
                }))}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="enquiryReceiverName" className="block text-sm font-medium text-foreground">
                Enquiry Receiver Name
               <span className="text-destructive">*</span></label>
              <select
                id="enquiryReceiverName"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                value={newCallTrackerData.enquiryReceiverName}
                onChange={(e) => setNewCallTrackerData(prev => ({
                  ...prev,
                  enquiryReceiverName: e.target.value,
                  isCompanyAutoFilled: false
                }))}
                required
              >
                <option value="">Select receiver</option>
                {receiverOptions.map((receiver, index) => (
                  <option key={index} value={receiver}>
                    {receiver}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="enquiryAssignToProject" className="block text-sm font-medium text-foreground">
                Enquiry Assign to Person
               <span className="text-destructive">*</span></label>
              <select
                id="enquiryAssignToProject"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                value={newCallTrackerData.enquiryAssignToProject}
                onChange={(e) => setNewCallTrackerData(prev => ({
                  ...prev,
                  enquiryAssignToProject: e.target.value,
                  isCompanyAutoFilled: false
                }))}
                required
              >
                <option value="">Select person</option>
                {assignToProjectOptions.map((project, index) => (
                  <option key={index} value={project}>
                    {project}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="gstNumber" className="block text-sm font-medium text-foreground">
                GST Number
               <span className="text-destructive">*</span></label>
              <input
                id="gstNumber"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                placeholder="Enter GST number"
                value={newCallTrackerData.gstNumber}
                onChange={(e) => setNewCallTrackerData(prev => ({
                  ...prev,
                  gstNumber: e.target.value,
                  isCompanyAutoFilled: false
                }))}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="stateCode" className="block text-sm font-medium text-foreground">
                State Code
               <span className="text-destructive">*</span></label>
              <input
                id="stateCode"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                placeholder="Enter State Code"
                value={newCallTrackerData.stateCode}
                onChange={(e) => setNewCallTrackerData(prev => ({
                  ...prev,
                  stateCode: e.target.value,
                  isCompanyAutoFilled: false
                }))}
                required
              />
            </div>

          </div>

          {/* Enquiry Details section */}
          <div className="space-y-6 border p-4 rounded-md mt-4">
            <h3 className="text-base font-semibold text-foreground">Enquiry Details</h3>
            <hr className="" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="enquiryDate" className="block text-sm font-medium text-foreground">
                  Enquiry Received Date
                 <span className="text-destructive">*</span></label>
                <input
                  id="enquiryDate"
                  type="date"
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                  value={enquiryFormData.enquiryDate}
                  onChange={(e) => setEnquiryFormData({ ...enquiryFormData, enquiryDate: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="enquiryState" className="block text-sm font-medium text-foreground">
                  Enquiry for State
                 <span className="text-destructive">*</span></label>
                <select
                  id="enquiryState"
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                  value={enquiryFormData.enquiryState}
                  onChange={(e) => setEnquiryFormData({ ...enquiryFormData, enquiryState: e.target.value })}
                  required
                >
                  <option value="">Select state</option>
                  {enquiryStates.map((state, index) => (
                    <option key={index} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="nob" className="block text-sm font-medium text-foreground">
                  NOB
                 <span className="text-destructive">*</span></label>
                <select
                  id="nob"
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                  value={enquiryFormData.nob}
                  onChange={(e) => setEnquiryFormData({ ...enquiryFormData, nob: e.target.value })}
                  required
                >
                  <option value="">Select NOB</option>
                  {nobOptions.map((nob, index) => (
                    <option key={index} value={nob}>
                      {nob}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="salesType" className="block text-sm font-medium text-foreground">
                  Enquiry Type
                 <span className="text-destructive">*</span></label>
                <select
                  id="salesType"
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                  value={enquiryFormData.salesType}
                  onChange={(e) => setEnquiryFormData({ ...enquiryFormData, salesType: e.target.value })}
                  required
                >
                  <option value="">Select type</option>
                  {salesTypes.map((type, index) => (
                    <option key={index} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="enquiryApproach" className="block text-sm font-medium text-foreground">
                  Enquiry Approach
                 <span className="text-destructive">*</span></label>
                <select
                  id="enquiryApproach"
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                  value={enquiryFormData.enquiryApproach}
                  onChange={(e) => setEnquiryFormData({ ...enquiryFormData, enquiryApproach: e.target.value })}
                  required
                >
                  <option value="">Select approach</option>
                  {enquiryApproachOptions.map((approach, index) => (
                    <option key={index} value={approach}>
                      {approach}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">Items</h4>
                <button
                  type="button"
                  onClick={addItem}
                  disabled={items.length >= 300}
                  className={`px-3 py-1 text-xs border border-warning/30 text-warning-foreground hover:bg-warning/5 rounded-md ${items.length >= 300 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  + Add Item {items.length >= 300 ? '(Max reached)' : ''}
                </button>
              </div>

              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-5 space-y-2">
                    <label htmlFor={`itemName-${item.id}`} className="block text-sm font-medium text-foreground">
                      Item Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      list={`item-options-${item.id}`}
                      id={`itemName-${item.id}`}
                      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                      value={item.name}
                      onChange={(e) => updateItem(item.id, "name", e.target.value)}
                      required
                    />
                    <datalist id={`item-options-${item.id}`}>
                      {productCategories.map((category, index) => (
                        <option key={index} value={category} />
                      ))}
                    </datalist>
                  </div>

                  <div className="md:col-span-5 space-y-2">
                    <label htmlFor={`quantity-${item.id}`} className="block text-sm font-medium text-foreground">
                      Quantity <span className="text-destructive">*</span>
                    </label>
                    <input
                      id={`quantity-${item.id}`}
                      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                      placeholder="Enter quantity"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={items.length === 1}
                      aria-label={`Remove item ${items.indexOf(item) + 1}`}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>

        <div className="p-4 border-t flex justify-between">
          <button
            type="button"
            onClick={() => {
              try {
                onClose();
              } catch (error) {
                console.error("Error closing form:", error);
                const modal = document.querySelector('.fixed.inset-0');
                if (modal) {
                  modal.style.display = 'none';
                }
              }
            }}
            className="h-9 px-4 rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>
      {confirmDialog}
    </div>
  )
}

export default CallTrackerForm
