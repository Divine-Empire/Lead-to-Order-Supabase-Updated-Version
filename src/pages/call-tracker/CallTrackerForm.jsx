"use client"

import { useState, useContext, useEffect } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { AuthContext } from "../../App"
import supabase from "../../utils/supabase"

function NewCallTracker({ initialLeadId, initialLeadNo, isModal = false, onClose }) {
  const navigate = useNavigate()
  const location = useLocation();
  const [searchParams] = useSearchParams()
  const activeLeadId = initialLeadId || searchParams.get("leadId")
  const activeLeadNo = initialLeadNo || searchParams.get("leadNo")
  const { showNotification } = useContext(AuthContext)
  const [customerFeedbackOptions, setCustomerFeedbackOptions] = useState([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [enquiryStatus, setEnquiryStatus] = useState("")
  const [items, setItems] = useState([{ id: "1", name: "", quantity: "" }])
  const [formData, setFormData] = useState({
    leadNo: "",
    nextAction: "",
    nextCallDate: "",
    nextCallTime: "",
    customerFeedback: "",
    otherRemarks: "",
    enquiryApproach: "",
  })

  const [leadStatus, setLeadStatus] = useState("")

  // Form fields states
  const [leadSource, setLeadSource] = useState("")
  const [scName, setScName] = useState(typeof location.state === "string" ? location.state : (location.state?.sc_name || location.state?.scName || ""))
  const [companyName, setCompanyName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [salesPersonName, setSalesPersonName] = useState("")
  const [billingLocation, setBillingLocation] = useState("")
  const [emailAddress, setEmailAddress] = useState("")
  const [shippingAddress, setShippingAddress] = useState("")
  const [enquiryReceiverName, setEnquiryReceiverName] = useState("")
  const [enquiryAssignToProject, setEnquiryAssignToProject] = useState("")
  const [gstNumber, setGstNumber] = useState("")
  const [enquiryDate, setEnquiryDate] = useState(() => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    return `${year}-${month}-${day}`;
  })
  const [enquiryState, setEnquiryState] = useState("")
  const [projectName, setProjectName] = useState("")
  const [salesType, setSalesType] = useState("")
  const [enquiryApproach, setEnquiryApproach] = useState("OUTGOING")
  const [, setLeadsTrackingStatus] = useState("Pending")

  // New state for dropdown options
  const [enquiryStates, setEnquiryStates] = useState([])
  const [salesTypes, setSalesTypes] = useState([])
  const [productCategories, setProductCategories] = useState([])
  const [nobOptions, setNobOptions] = useState([])
  const [enquiryApproachOptions, setEnquiryApproachOptions] = useState([])
  const [leadSources, setLeadSources] = useState([])
  const [receiverOptions, setReceiverOptions] = useState([])
  const [assignToProjectOptions, setAssignToProjectOptions] = useState([])
  const [companyOptions, setCompanyOptions] = useState([])
  const [companyDetailsMap, setCompanyDetailsMap] = useState({})

  // Function to fetch dropdown data from Supabase (normalized category/value schema)
  const fetchDropdownData = async () => {
    // Helper: fetch all values for a given category
    const fetchCategory = (category) =>
      supabase.from('lto_dropdown').select('value').eq('category', category);

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
        { data: statesData },
        { data: salesTypesData },
        { data: itemsData },
        { data: nobData },
        { data: approachData },
        { data: feedbackData },
        { data: sourcesData },
        { data: receiversData },
        { data: scData },
      ] = await Promise.all([
        fetchCategory('state'),
        fetchCategory('sales_type'),
        fetchItems(),
        fetchCategory('nob'),
        fetchCategory('enquiry_approach'),
        fetchCategory('what_did_customer_say'),
        fetchCategory('lead_source'),
        fetchCategory('lead_receiver_name'),
        fetchCategory('lead_assign_to'),
      ]);

      const toValues = (arr) => [...new Set((arr || []).map(i => i.value).filter(Boolean))].sort();
      const toItemValues = (arr) => [...new Set((arr || []).map(i => i.item_name).filter(Boolean))].sort();

      setEnquiryStates(toValues(statesData))
      setSalesTypes(toValues(salesTypesData))
      setProductCategories(toItemValues(itemsData))
      setNobOptions(toValues(nobData))
      const approachValues = toValues(approachData).length > 0 ? toValues(approachData) : ['INCOMING', 'OUTGOING'];
      setEnquiryApproachOptions(approachValues)
      const outgoingMatch = approachValues.find(opt => opt && opt.toUpperCase() === 'OUTGOING') || 'OUTGOING';
      setEnquiryApproach(prev => (!prev || prev.toUpperCase() === 'OUTGOING') ? outgoingMatch : prev);
      setCustomerFeedbackOptions(toValues(feedbackData))
      setLeadSources(toValues(sourcesData))
      setReceiverOptions(toValues(receiversData))
      setAssignToProjectOptions(toValues(scData))

    } catch (error) {
      console.error('Error fetching dropdown values:', error)
      setEnquiryStates(['Maharashtra', 'Gujarat', 'Karnataka', 'Tamil Nadu', 'Delhi'])
      setSalesTypes(['NBD', 'CRR', 'NBD_CRR'])
      setProductCategories(['Product 1', 'Product 2', 'Product 3'])
      setNobOptions(['NOB 1', 'NOB 2', 'NOB 3'])
      setEnquiryApproachOptions(['INCOMING', 'OUTGOING'])
      setCustomerFeedbackOptions(['Feedback 1', 'Feedback 2', 'Feedback 3'])
      setLeadSources(['Indiamart', 'Justdial', 'Social Media', 'Website', 'Referral', 'Other'])
      setReceiverOptions(['Receiver 1', 'Receiver 2'])
      setAssignToProjectOptions(['Person 1', 'Person 2'])
    }
  }

  // Fetch company options and details
  const fetchCompanyData = async () => {
    try {
      let data = [];
      let from = 0;
      const step = 1000;
      let fetchMore = true;

      while (fetchMore) {
        const { data: pageData, error } = await supabase
          .from("lto_client_master")
          .select("company_name, client_name, client_mobile_number, state, billing_address, gst_number")
          .not("company_name", "is", null)
          .range(from, from + step - 1);

        if (error) throw error;

        if (pageData && pageData.length > 0) {
          data = [...data, ...pageData];
          from += step;
          if (pageData.length < step) fetchMore = false;
        } else {
          fetchMore = false;
        }
      }

      if (data && data.length > 0) {
        const companies = []
        const detailsMap = {}

        data.forEach((row) => {
          if (row.company_name) {
            companies.push(row.company_name)
            detailsMap[row.company_name] = {
              salesPerson: row.client_name || "",
              phoneNumber: row.client_mobile_number || "",
              billingAddress: row.billing_address || "",
              gstNumber: row.gst_number || "",
            }
          }
        })

        setCompanyOptions([...new Set(companies)].sort())
        setCompanyDetailsMap(detailsMap)
      }
    } catch (error) {
      console.error("Error fetching company data:", error)
    }
  }

  const handleCompanyChange = (companyNameValue) => {
    setCompanyName(companyNameValue)
    if (companyNameValue && companyDetailsMap[companyNameValue]) {
      const details = companyDetailsMap[companyNameValue]
      setPhoneNumber(details.phoneNumber || "")
      setSalesPersonName(details.salesPerson || "")
      setBillingLocation(details.billingAddress || "")
      setGstNumber(details.gstNumber || "")
    }
  }

  const handleSourceChange = (sourceValue) => {
    setLeadSource(sourceValue)
  }

  useEffect(() => {
    fetchDropdownData()
    fetchCompanyData()

    if (activeLeadNo) {
      setFormData((prevData) => ({
        ...prevData,
        leadNo: activeLeadNo,
      }))
    }
  }, [activeLeadNo])

  // Prefill lead details
  useEffect(() => {
    const loadLeadDetails = async () => {
      if (activeLeadNo) {
        try {
          const { data, error } = await supabase
            .from("lto_leads")
            .select("*")
            .eq("lead_no", activeLeadNo)
            .maybeSingle()

          if (error) throw error
          if (data) {
            const compName = data.Company_Name || data.company_name || "";
            setLeadSource(data.Lead_Source || data.lead_source || "")
            setScName(data.sc_name || data.SC_Name || data.handle_person || data.salesperson_name || "")
            setCompanyName(compName)
            setPhoneNumber(data.Phone_Number || data.phone_number || "")
            setSalesPersonName(data.person_name || data.Person_Name || data.client_name || data.Salesperson_Name || data.salesperson_name || "")

            let billingAddr = data.Location || data.location || "";
            if (compName) {
              const { data: cm } = await supabase
                .from("lto_client_master")
                .select("billing_address")
                .ilike("company_name", compName.trim())
                .maybeSingle();
              if (cm && cm.billing_address) {
                billingAddr = cm.billing_address;
              }
            }
            setBillingLocation(billingAddr)
            setEmailAddress(data.Email_Address || data.email_address || "")
            setShippingAddress("")
            setEnquiryReceiverName(data.Lead_Receiver_Name || data.lead_receiver_name || "")
            setGstNumber(data.GST_Number || data.gst_number || "")
            setEnquiryState(data.State || data.state || "")
            setProjectName(data.NOB || data.nob || "")
            setSalesType(data.Sales_Type || data.sales_type || "")
            setEnquiryApproach(data.Enquiry_Approach || data.enquiry_approach || "OUTGOING")
            setLeadsTrackingStatus(data.Leads_Tracking_Status || data.lead_status || "Pending")
            setLeadStatus(data.Status || data.lead_status || "")

            // Prefill items
            const loadedItems = []
            for (let i = 1; i <= 5; i++) {
              const name = data[`Item_Name${i}`]
              const quantity = data[`Quantity${i}`]
              if (name) {
                loadedItems.push({
                  id: i.toString(),
                  name: name,
                  quantity: quantity || ""
                })
              }
            }
            if (data["Item/qty"]) {
              try {
                const remaining = JSON.parse(data["Item/qty"])
                remaining.forEach((item) => {
                  loadedItems.push({
                    id: (loadedItems.length + 1).toString(),
                    name: item.name || "",
                    quantity: item.quantity || ""
                  })
                })
              } catch (e) {
                console.error("Error parsing Item/qty JSON:", e)
              }
            }
            if (loadedItems.length > 0) {
              setItems(loadedItems)
            } else {
              setItems([{ id: "1", name: "", quantity: "" }])
            }
          }
        } catch (error) {
          console.error("Error loading lead details:", error)
        }
      }
    }
    loadLeadDetails()
  }, [activeLeadNo])


  const handleChange = (e) => {
    const { id, value } = e.target
    setFormData((prevData) => ({
      ...prevData,
      [id]: value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // 1. Fetch the UUID of the lead using lead_no
      const { data: leadRecord, error: leadErr } = await supabase
        .from('lto_leads')
        .select('id')
        .eq('lead_no', formData.leadNo)
        .single();

      if (leadErr || !leadRecord) {
        throw new Error(`Could not find lead with lead_no: ${formData.leadNo}`);
      }

      // 2. Prepare data for call_tracker_for_leads (valid schema.txt columns only)
      const insertData = {
        created_at: new Date().toISOString(),
        lead_id: leadRecord.id,
        what_did_customer_say: formData.customerFeedback || null,
        other_remarks: formData.customerFeedback === "Other" ? formData.otherRemarks : null,
        sc_name: scName || null,
        enquiry_received_status: enquiryStatus === "yes" ? "yes" :
          enquiryStatus === "expected" ? "expected" :
            enquiryStatus === "not-interested" ? "not-interested" : (enquiryStatus || null),
      };

      // Handle different scenarios based on enquiry status
      if (enquiryStatus === "expected") {
        insertData.next_action = formData.nextAction || null;
        insertData.next_call_date = formData.nextCallDate ? new Date(formData.nextCallDate).toISOString().split("T")[0] : null;
        insertData.next_call_time = formData.nextCallTime || null;
      } else if (enquiryStatus === "yes") {
        insertData.enquiry_received_date = enquiryDate ? new Date(enquiryDate).toISOString().split('T')[0] : null;
        insertData.enquiry_for_state = enquiryState || null;
        insertData.project_name = projectName || null;
        insertData.enquiry_type = salesType || null;
        insertData.enquiry_approach = enquiryApproach || null;
        insertData.enquiry_assign_to_person = enquiryAssignToProject || null;

        // Calculate planned_at using tat_config for stage 'Enquiry Tracker for Leads'
        try {
          const { data: tatConfig } = await supabase
            .from("lto_tat_config")
            .select("tat_duration")
            .eq("stage_name", "Enquiry Tracker for Leads")
            .maybeSingle();

          let tatDurationMinutes = 60;
          if (tatConfig && tatConfig.tat_duration !== null && tatConfig.tat_duration !== undefined) {
            tatDurationMinutes = Number(tatConfig.tat_duration) || 60;
          }

          const now = new Date();
          const plannedAt = new Date(now.getTime() + (tatDurationMinutes * 60 * 1000));
          insertData.planned_at = plannedAt.toISOString();
        } catch (tatErr) {
          console.error("Error calculating planned_at for Enquiry Tracker:", tatErr);
          const now = new Date();
          insertData.planned_at = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
        }
      }

      // Insert data into Supabase call_tracker_for_leads table
      const { error: insertError } = await supabase
        .from('lto_call_tracker_for_leads')
        .insert([insertData])
        .select();

      if (insertError) {
        throw insertError;
      }

      // The Items section above was being collected in the `items` state
      // but never actually persisted -- lto_lead_items had no insert path
      // at all. Only rows with a name filled in are worth saving.
      const itemRows = items
        .filter((item) => item.name && item.name.trim())
        .map((item) => ({
          lead_id: leadRecord.id,
          item_name: item.name.trim(),
          quantity: Number(item.quantity) || 1,
        }));

      if (itemRows.length > 0) {
        const { error: itemsError } = await supabase
          .from('lto_lead_items')
          .insert(itemRows);

        if (itemsError) {
          console.error("Error inserting lead items:", itemsError);
        }
      }

      // 3. Prepare update data for leads table
      const updateData = {
        lead_source: leadSource || null,
        person_name: salesPersonName || null,
        sc_name: scName || salesPersonName || null,
        company_name: companyName || null,
        phone_number: phoneNumber || null,
        location: billingLocation || null,
        email_address: emailAddress || null,
        address: shippingAddress || null,
        lead_receiver_name: enquiryReceiverName || null,
        gst_number: gstNumber || null,
        additional_notes: formData.customerFeedback || null,
        lead_status: enquiryStatus === "yes" ? "Enquiry Received" : (leadStatus || "In Followup"),
      };

      if (enquiryStatus === "expected" && formData.nextCallDate) {
        updateData.planned_at = new Date(formData.nextCallDate).toISOString();
      }

      // 4. Update the leads table with new data
      const { error: updateError } = await supabase
        .from('lto_leads')
        .update(updateData)
        .eq('lead_no', formData.leadNo);

      if (updateError) {
        console.error("Error updating leads table:", updateError);
      }

      if (companyName) {
        try {
          let stageLabel = `Call-Tracker (${formData.leadNo})`;
          if (enquiryStatus === "yes") {
            stageLabel = `Enquiry Tracker (${formData.leadNo})`;
          } else if (leadStatus === "Not Relevant" || enquiryStatus === "no") {
            stageLabel = null;
          }

          const updatePayload = { updated_at: new Date().toISOString() };
          if (stageLabel !== undefined) updatePayload.already_in_tracker = stageLabel;
          if (leadStatus === "Not Relevant") updatePayload.isRelevant = false;

          const { error: cmErr } = await supabase
            .from("lto_client_master")
            .update(updatePayload)
            .ilike("company_name", companyName.trim());
          if (cmErr) {
            console.error("Error updating client_master tracking status:", cmErr);
          }
        } catch (err) {
          console.error("Failed to update company tracking status:", err);
        }
      }

      if (updateError) {
        console.error("Error updating leads_to_order:", updateError)
        showNotification("Follow-up recorded successfully, but there was an issue updating the order table", "warning")
      } else {
        showNotification("Follow-up recorded successfully", "success")
      }

      if (isModal) {
        if (onClose) onClose(true)
      } else {
        navigate("/call-tracker")
      }

    } catch (error) {
      console.error("Error submitting form:", error)
      showNotification("Error submitting form: " + error.message, "error")
    } finally {
      setIsSubmitting(false)
    }
  }

  const addItem = () => {
    // Define maximum number of items allowed
    const MAX_ITEMS = 300

    // Only add a new item if we haven't reached the maximum
    if (items.length < MAX_ITEMS) {
      const newId = (items.length + 1).toString()
      setItems([...items, { id: newId, name: "", quantity: "" }])
    }
  }

  const removeItem = (id) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id))
    }
  }

  const updateItem = (id, field, value) => {
    setItems(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  return (
    <div className="container mx-auto max-w-4xl py-2">
      <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Lead Follow-Up</h2>
          <p className="text-[11px] text-slate-500">
            Record details of the follow-up call
            {activeLeadId && <span className="font-medium text-warning-foreground"> for Lead #{activeLeadId}</span>}
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-2 space-y-3">
            <div className="space-y-2">
              <label htmlFor="enquiryNo" className="block text-sm font-medium text-gray-700">
                Lead No.
                <span className="text-destructive">*</span></label>
              <input
                id="enquiryNo"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="LD-001"
                value={formData.leadNo}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="customerFeedback" className="block text-sm font-medium text-gray-700">
                What did the customer say ? <span className="text-destructive">*</span></label>
              <select
                id="customerFeedback"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={formData.customerFeedback || ""}
                onChange={handleChange}
                required
              >
                <option value="">Select customer feedback</option>
                {customerFeedbackOptions.map((feedback, index) => (
                  <option key={index} value={feedback}>
                    {feedback}
                  </option>
                ))}
              </select>
            </div>

            {formData.customerFeedback === "Other" && (
              <div className="space-y-2">
                <label htmlFor="otherRemarks" className="block text-sm font-medium text-gray-700">
                  Other Remarks
                  <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  id="otherRemarks"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter remarks for Other"
                  value={formData.otherRemarks || ""}
                  onChange={handleChange}
                  required
                />
              </div>
            )}

            {salesType === "NBD" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Lead Status <span className="text-destructive">*</span>
                </label>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="hot"
                      name="leadStatus"
                      value="hot"
                      checked={leadStatus === "Relevant"}
                      onChange={() => setLeadStatus("Relevant")}
                      className="h-4 w-4 text-destructive focus:ring-destructive"
                      required={salesType === "NBD"}
                    />
                    <label htmlFor="hot" className="text-sm text-gray-700">
                      Relevant
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="warm"
                      name="leadStatus"
                      value="warm"
                      checked={leadStatus === "Not Relevant"}
                      onChange={() => setLeadStatus("Not Relevant")}
                      className="h-4 w-4 text-warning-foreground focus:ring-primary"
                      required={salesType === "NBD"}
                    />
                    <label htmlFor="warm" className="text-sm text-gray-700">
                      Not Relevant
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Enquiry Received Status <span className="text-destructive">*</span></label>
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="yes"
                    name="enquiryStatus"
                    value="yes"
                    checked={enquiryStatus === "yes"}
                    onChange={() => setEnquiryStatus("yes")}
                    className="h-4 w-4 text-warning-foreground focus:ring-primary"
                  />
                  <label htmlFor="yes" className="text-sm text-gray-700">
                    Yes
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="expected"
                    name="enquiryStatus"
                    value="expected"
                    checked={enquiryStatus === "expected"}
                    onChange={() => setEnquiryStatus("expected")}
                    className="h-4 w-4 text-warning-foreground focus:ring-primary"
                  />
                  <label htmlFor="expected" className="text-sm text-gray-700">
                    Expected
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="not-interested"
                    name="enquiryStatus"
                    value="not-interested"
                    checked={enquiryStatus === "not-interested"}
                    onChange={() => setEnquiryStatus("not-interested")}
                    className="h-4 w-4 text-warning-foreground focus:ring-primary"
                  />
                  <label htmlFor="not-interested" className="text-sm text-gray-700">
                    Not Interested
                  </label>
                </div>
              </div>
            </div>

            {enquiryStatus === "expected" && (
              <div className="space-y-4 border p-4 rounded-md">
                <div className="space-y-2">
                  <label htmlFor="nextAction" className="block text-sm font-medium text-gray-700">
                    Next Action
                    <span className="text-destructive">*</span></label>
                  <input
                    id="nextAction"
                    value={formData.nextAction || ""}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter next action"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="nextCallDate" className="block text-sm font-medium text-gray-700">
                      Next Call Date
                      <span className="text-destructive">*</span></label>
                    <input
                      id="nextCallDate"
                      type="date"
                      value={formData.nextCallDate || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="nextCallTime" className="block text-sm font-medium text-gray-700">
                      Next Call Time
                      <span className="text-destructive">*</span></label>
                    <input
                      id="nextCallTime"
                      type="time"
                      value={formData.nextCallTime || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {enquiryStatus === "yes" && (
              <div className="space-y-6 border p-4 rounded-md">
                <h3 className="text-lg font-medium">Enquiry Details</h3>
                <hr className="border-gray-200" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="leadSource" className="block text-sm font-medium text-gray-700">
                      Enquiry Source
                      <span className="text-destructive">*</span></label>
                    <select
                      id="leadSource"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                      value={leadSource}
                      onChange={(e) => handleSourceChange(e.target.value)}
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

                  <div className="space-y-2">
                    <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">
                      Company Name
                      <span className="text-destructive">*</span></label>
                    <input
                      list="companyOptions"
                      id="companyName"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      value={companyName}
                      onChange={(e) => handleCompanyChange(e.target.value)}
                      required
                    />
                    <datalist id="companyOptions">
                      {companyOptions.map((company, index) => (
                        <option key={index} value={company} />
                      ))}
                    </datalist>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">
                      Phone Number
                      <span className="text-destructive">*</span></label>
                    <input
                      id="phoneNumber"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter phone number"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="salesPersonName" className="block text-sm font-medium text-gray-700">
                      Person Name
                      <span className="text-destructive">*</span></label>
                    <input
                      id="salesPersonName"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter person name"
                      value={salesPersonName}
                      onChange={(e) => setSalesPersonName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                      Billing Address
                      <span className="text-destructive">*</span></label>
                    <input
                      id="location"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter billing address"
                      value={billingLocation}
                      onChange={(e) => setBillingLocation(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="emailAddress" className="block text-sm font-medium text-gray-700">
                      Email Address
                    </label>
                    <input
                      id="emailAddress"
                      type="email"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter email address"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="shippingAddress" className="block text-sm font-medium text-gray-700">
                      Shipping Address
                      <span className="text-destructive">*</span></label>
                    <input
                      id="shippingAddress"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter shipping address"
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="enquiryReceiverName" className="block text-sm font-medium text-gray-700">
                      Enquiry Receiver Name
                      <span className="text-destructive">*</span></label>
                    <select
                      id="enquiryReceiverName"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                      value={enquiryReceiverName}
                      onChange={(e) => setEnquiryReceiverName(e.target.value)}
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
                    <label htmlFor="enquiryAssignToProject" className="block text-sm font-medium text-gray-700">
                      Enquiry Assign to Person
                      <span className="text-destructive">*</span></label>
                    <select
                      id="enquiryAssignToProject"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                      value={enquiryAssignToProject}
                      onChange={(e) => setEnquiryAssignToProject(e.target.value)}
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
                    <label htmlFor="gstNumber" className="block text-sm font-medium text-gray-700">
                      GST Number
                      <span className="text-destructive">*</span></label>
                    <input
                      id="gstNumber"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter GST number"
                      value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="enquiryDate" className="block text-sm font-medium text-gray-700">
                      Enquiry Received Date
                      <span className="text-destructive">*</span></label>
                    <input
                      id="enquiryDate"
                      type="date"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      value={enquiryDate}
                      onChange={(e) => setEnquiryDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="enquiryState" className="block text-sm font-medium text-gray-700">
                      Enquiry for State
                      <span className="text-destructive">*</span></label>
                    <select
                      id="enquiryState"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      value={enquiryState}
                      onChange={(e) => setEnquiryState(e.target.value)}
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
                    <label htmlFor="projectName" className="block text-sm font-medium text-gray-700">
                      NOB
                      <span className="text-destructive">*</span></label>
                    <select
                      id="projectName"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
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
                    <label htmlFor="salesType" className="block text-sm font-medium text-gray-700">
                      Enquiry Type
                      <span className="text-destructive">*</span></label>
                    <select
                      id="salesType"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      value={salesType}
                      onChange={(e) => setSalesType(e.target.value)}
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
                    <label htmlFor="enquiryApproach" className="block text-sm font-medium text-gray-700">
                      Enquiry Approach
                      <span className="text-destructive">*</span></label>
                    <select
                      id="enquiryApproach"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      value={enquiryApproach}
                      onChange={(e) => setEnquiryApproach(e.target.value)}
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
                    <h4 className="font-medium">Items</h4>
                    <button
                      type="button"
                      onClick={addItem}
                      className="px-3 py-1 text-xs border border-warning/30 text-warning-foreground hover:bg-warning/5 rounded-md"
                      disabled={items.length >= 300}
                    >
                      + Add Item ({items.length}/300)
                    </button>
                  </div>

                  {items.map((item, index) => (
                    <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                      <div className="md:col-span-6 space-y-2">
                        <label htmlFor={`itemName-${item.id}`} className="block text-sm font-medium text-gray-700">
                          Item Name {index + 1}
                          <span className="text-destructive">*</span>
                        </label>
                        <div>
                          <input
                            list={`item-options-${item.id}`}
                            id={`itemName-${item.id}`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                            value={item.name}
                            onChange={(e) => updateItem(item.id, "name", e.target.value)}
                            required
                            placeholder="Select or type item name"
                          />
                          <datalist id={`item-options-${item.id}`}>
                            {productCategories.map((category, idx) => (
                              <option key={idx} value={category} />
                            ))}
                          </datalist>
                        </div>
                      </div>

                      <div className="md:col-span-5 space-y-2">
                        <label htmlFor={`quantity-${item.id}`} className="block text-sm font-medium text-gray-700">
                          Quantity
                          <span className="text-destructive">*</span>
                        </label>
                        <input
                          id={`quantity-${item.id}`}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Enter quantity"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                          required
                        />
                      </div>

                      <div className="md:col-span-1 flex items-center pb-2">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          disabled={items.length === 1}
                          className="p-2 text-slate-500 hover:text-slate-700 disabled:opacity-50"
                        >
                          <svg
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
            )}
          </div>
          <div className="p-6 border-t flex justify-between">
            <button
              type="button"
              onClick={() => {
                if (isModal) {
                  if (onClose) onClose(false)
                } else {
                  navigate(-1)
                }
              }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 brand-gradient hover:opacity-90 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              {isSubmitting ? "Saving..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NewCallTracker
