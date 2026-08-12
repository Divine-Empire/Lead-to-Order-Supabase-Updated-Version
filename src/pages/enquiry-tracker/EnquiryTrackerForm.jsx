"use client"

import { useState, useContext, useEffect } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { AuthContext } from "../../App"
import MakeQuotationForm from "../../components/enquiry-tracker/MakeQuotationFrom"
import QuotationValidationForm from "../../components/enquiry-tracker/QuotationValidationForm"
import OrderExpectedForm from "../../components/enquiry-tracker/OrderExpectedForm"
import OrderStatusForm from "../../components/enquiry-tracker/OrderStatusFrom"
import supabase from "../../utils/supabase"
import { generateAndAssignClientCode } from "../Master/ClientCodeGen"

function NewEnquiryTracker() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const leadId = searchParams.get("leadId")
  const { showNotification } = useContext(AuthContext)
  const [customerFeedbackOptions, setCustomerFeedbackOptions] = useState([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentStage, setCurrentStage] = useState("")
  const [formData, setFormData] = useState({
    enquiryNo: leadId || "",
    enquiryStatus: "",
    customerFeedback: "",
  })

  const location = useLocation();
  const { activeTab } = location.state || {}; // fallback to {} if undefined





  const [enquiryStatusOptions, setEnquiryStatusOptions] = useState([])

  // State for MakeQuotationForm data
  const [quotationData, setQuotationData] = useState({
    companyName: "",
    sendQuotationNo: "",
    quotationSharedBy: "",
    quotationNumber: "",
    valueWithoutTax: "",
    valueWithTax: "",
    remarks: "",
    quotationFile: null,
    quotationFileUrl: "",
  })

  // State for QuotationValidationForm data
  const [validationData, setValidationData] = useState({
    validationQuotationNumber: "",
    validatorName: "",
    sendStatus: "",
    validationRemark: "",
    faqVideo: "no",
    productVideo: "no",
    offerVideo: "no",
    productCatalog: "no",
    productImage: "no",
  })

  // State for OrderExpectedForm data
  const [orderExpectedData, setOrderExpectedData] = useState({
    nextCallDate: "",
    nextCallTime: "",
    followupStatus: "",
  })

  // State for OrderStatusForm data
  const [orderStatusData, setOrderStatusData] = useState({
    orderStatusQuotationNumber: "",
    orderStatus: "",
    acceptanceVia: "",
    paymentMode: "",
    paymentTerms: "",
    transportMode: "",
    creditDays: "",
    creditLimit: "",
    conveyedForRegistration: "",
    warranty: "",
    orderVideo: "",
    acceptanceFile: null,
    orderRemark: "",
    apologyVideo: null,
    reasonStatus: "",
    reasonRemark: "",
    quotationItems: [], // Items fetched from Make_Quotation table
  })

  // Fetch dropdown options from DROPDOWN sheet column G
  useEffect(() => {
    const fetchDropdownOptions = async () => {
      try {
        // Fetch from normalized dropdown table using category/value schema
        const [
          { data: statusData, error: statusError },
          { data: feedbackData, error: feedbackError },
        ] = await Promise.all([
          supabase.from("lto_dropdown").select("value").eq("category", "enquiry_status"),
          supabase.from("lto_dropdown").select("value").eq("category", "what_did_customer_say"),
        ]);

        if (statusError) throw statusError;
        if (feedbackError) throw feedbackError;

        const toValues = (arr) =>
          [...new Set((arr || []).map(r => r.value).filter(v => v && v.trim() !== ""))];

        setEnquiryStatusOptions(toValues(statusData));
        setCustomerFeedbackOptions(toValues(feedbackData));

      } catch (error) {
        console.error("Error fetching dropdown options:", error);
        setEnquiryStatusOptions(["hot", "warm", "cold"]);
        setCustomerFeedbackOptions(["Feedback 1", "Feedback 2", "Feedback 3"]);
      }
    };

    fetchDropdownOptions();
  }, [])


  // Function to generate the next order number via Supabase RPC (Option B)
  const generateNextOrderNumber = async () => {
    try {
      // Option B: Generate order number directly via Supabase Postgres RPC function
      const { data, error } = await supabase.rpc('lto_get_next_order_number');
      if (error) throw error;
      if (data && typeof data === 'string' && data.trim() !== '') {
        return data.trim();
      }
      throw new Error('RPC returned empty or invalid value');
    } catch (error) {
      console.error("Error generating order number via RPC, falling back to local query:", error);
      // Safe fallback if RPC function is not created yet or fails
      try {
        const [trackerEnqRes, trackerLeadsRes] = await Promise.all([
          supabase.from("lto_enquiry_tracker").select('order_no').not('order_no', 'is', null).order('created_at', { ascending: false }).limit(500),
          supabase.from("lto_enquiry_tracker_for_leads").select('order_no').not('order_no', 'is', null).order('created_at', { ascending: false }).limit(500)
        ]);

        const allNumbers = [
          ...(trackerEnqRes.data || []).map(item => item.order_no),
          ...(trackerLeadsRes.data || []).map(item => item.order_no)
        ];

        const orderNumbers = allNumbers
          .map(orderNo => {
            const match = String(orderNo || '').match(/DO-(\d+)/i);
            return match ? parseInt(match[1], 10) : 0;
          })
          .filter(num => !isNaN(num) && num > 0);

        const maxOrderNumber = orderNumbers.length > 0 ? Math.max(...orderNumbers) : 0;
        return `DO-${String(maxOrderNumber + 1).padStart(3, "0")}`;
      } catch {
        const timestamp = Date.now().toString().slice(-4);
        return `DO-${timestamp}`;
      }
    }
  };

 
  // Update form data when leadId changes
  useEffect(() => {
    if (leadId) {
      setFormData(prevData => ({
        ...prevData,
        enquiryNo: leadId
      }))
    }
  }, [leadId])

 
  // something the user has already typed/selected.
  useEffect(() => {
    const prefillFromLatestLog = async () => {
      if (!formData.enquiryNo) return;

      const isLead = formData.enquiryNo.toUpperCase().startsWith("LD-");

      try {
        let latestLog = null;

        if (isLead) {
          const { data: leadRow } = await supabase
            .from("lto_leads")
            .select("id")
            .eq("lead_no", formData.enquiryNo)
            .maybeSingle();

          if (leadRow?.id) {
            const { data } = await supabase
              .from("lto_enquiry_tracker_for_leads")
              .select("enquiry_status, what_did_customer_say")
              .eq("lead_id", leadRow.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            latestLog = data;
          }
        } else {
          const { data: enqRow } = await supabase
            .from("lto_enquiries")
            .select("id")
            .eq("enquiry_no", formData.enquiryNo)
            .maybeSingle();

          if (enqRow?.id) {
            const { data } = await supabase
              .from("lto_enquiry_tracker")
              .select("enquiry_status, what_did_customer_say, customer_feedback")
              .eq("enquiry_id", enqRow.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            latestLog = data;
          }
        }

        if (!latestLog) return;

        const lastFeedback = latestLog.what_did_customer_say || latestLog.customer_feedback || "";
        const lastStatus = (latestLog.enquiry_status || "").toLowerCase();

        setFormData((prev) => ({
          ...prev,
          enquiryStatus: prev.enquiryStatus || lastStatus,
          customerFeedback: prev.customerFeedback || lastFeedback,
        }));
      } catch (err) {
        console.error("Error prefilling from latest tracker log:", err);
      }
    };

    prefillFromLatestLog();
  }, [formData.enquiryNo])

  const handleInputChange = (e) => {
    const { id, value } = e.target
    setFormData(prevData => ({
      ...prevData,
      [id]: value
    }))
  }

  // Handler for quotation form data updates
  const handleQuotationChange = async (field, value) => {
    if (field === "quotationFile" && value) {
      // If it's a file upload, handle the upload first
      try {
        setIsSubmitting(true);
        const fileUrl = await uploadFileToSupabase(value, "make_quotation");

        setQuotationData(prev => ({
          ...prev,
          quotationFile: value,
          quotationFileUrl: fileUrl
        }));
      } catch (error) {
        console.error("Error uploading file:", error);
        showNotification("Error uploading file: " + error.message, "error");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // For other fields, update normally
      setQuotationData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  }



  // Handler for validation form data updates
  const handleValidationChange = (field, value) => {
    setValidationData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Handler for order expected form data updates
  const handleOrderExpectedChange = (field, value) => {
    setOrderExpectedData(prev => ({
      ...prev,
      [field]: value
    }))
  }


  // Function to upload file to Supabase storage
  const uploadFileToSupabase = async (file, bucketName) => {
    try {
      // Generate a unique file name to avoid conflicts
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;

      // Upload the file to Supabase storage
      const { error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file);

      if (error) {
        throw error;
      }

      // Get the public URL of the uploaded file
      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error("Error uploading to Supabase storage:", error);
      throw error;
    }
  };

  const handleOrderStatusChange = async (field, value) => {


    if (field === "orderStatus" && value === "yes") {
      // Pre-generate order number for display
      const orderNumber = await generateNextOrderNumber();
      setOrderStatusData(prev => ({
        ...prev,
        generatedOrderNumber: orderNumber
      }));
    }

    // Handle file upload for acceptance file
    if (field === "acceptanceFile" && value) {
      try {
        setIsSubmitting(true);
        const fileUrl = await uploadFileToSupabase(value, "acceptance_file_upload");

        setOrderStatusData(prev => ({
          ...prev,
          acceptanceFile: fileUrl // Store the URL directly in acceptanceFile
        }));
      } catch (error) {
        console.error("Error uploading acceptance file:", error);
        showNotification("Error uploading acceptance file: " + error.message, "error");
      } finally {
        setIsSubmitting(false);
      }
    } else if (field === "apologyVideo" && value) {
      try {
        setIsSubmitting(true);
        const fileUrl = await uploadFileToSupabase(value, "order_lost_apology");

        setOrderStatusData(prev => ({
          ...prev,
          apologyVideo: fileUrl // Store the URL directly in apologyVideo
        }));
      } catch (error) {
        console.error("Error uploading apology video:", error);
        showNotification("Error uploading apology video: " + error.message, "error");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // For other fields, update normally
      setOrderStatusData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  }


  const updateLeadToOrderTable = async (enquiryNo, allFormData, currentStage, orderStatusData = {}) => {
    try {
      // ✅ Base fields
      let updateData = {
        "LD-Lead-No": enquiryNo,
        Enquiry_Status: allFormData.enquiryStatus,
        What_Did_Customer_Say: allFormData.customerFeedback,
        Current_Stage: currentStage,
        Leads_Tracking_Status: (currentStage === "order-status" && (orderStatusData.orderStatus?.toLowerCase() === "yes" || orderStatusData.orderStatus?.toLowerCase() === "no")) ? "Completed" : "Pending",
      };

      // ✅ Add Order Number if status is "yes"
      if (currentStage === "order-status" && orderStatusData.orderStatus?.toLowerCase() === "yes") {
        // Generate order number if not already in orderStatusData
        let orderNumber = orderStatusData.generatedOrderNumber;
        if (!orderNumber) {
          orderNumber = await generateNextOrderNumber();
        }

        updateData.Order_No = orderNumber;

        if (orderStatusData.resolvedHandlePerson) {
          updateData.handle_person = orderStatusData.resolvedHandlePerson;
        }

        const companyName = allFormData.companyName || allFormData.Company_Name || allFormData.company_name || orderStatusData.companyName;
        if (companyName) {
          await generateAndAssignClientCode(companyName);
        }
      }

      switch (currentStage) {
        case "Make Quotation":
        case "make-quotation":
          Object.assign(updateData, {
            "Send_Quotation_No.": allFormData.sendQuotationNo,
            Quotation_Shared_By: allFormData.quotationSharedBy,
            Quotation_Number: allFormData.quotationNumber,
            Quotation_Value_Without_Tax: allFormData.valueWithoutTax,
            Quotation_Value_With_Tax: allFormData.valueWithTax,
            Quotation_Upload: allFormData.quotationFileUrl,
            Quotation_Remarks: allFormData.remarks,
          });
          break;
      }
      return true;
    } catch (error) {
      console.error("Exception in updateLeadToOrderTable:", error);
      return false;
    }
  };


  const triggerWebhookManually = async (enquiryNo, tableName) => {
    try {
      const colName = tableName === 'lto_leads' ? 'lead_no' : (tableName === 'lto_enquiries' ? 'enquiry_no' : 'id');
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq(colName, enquiryNo)
        .maybeSingle();

      if (error || !data) {
        console.error("Error fetching updated record:", error);
        return false;
      }

      // Simulate a webhook call
      const webhookUrl = "";

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          table: tableName,
          type: 'UPDATE',
          record: data,
          old_record: {} // You might want to store old record for comparison
        })
      });

      const result = await response.json();
      return result.success;

    } catch (error) {
      console.error("Error triggering webhook:", error);
      return false;
    }
  };


  const updateEnquiryToOrderTable = async (enquiryNo, allFormData, currentStage) => {
    try {
      if (currentStage === "order-status" && allFormData.orderStatus?.toLowerCase() === "yes") {
        const companyName = allFormData.companyName || allFormData.Company_Name || allFormData.company_name || orderStatusData?.companyName;
        if (companyName) {
          await generateAndAssignClientCode(companyName);
        }
      }
      return true;
    } catch (error) {
      console.error("Exception in updateEnquiryToOrderTable:", error);
      return false;
    }
  };


  const validateNumericFields = (data) => {
    const numericFields = [
      'valueWithoutTax', 'valueWithTax', 'paymentTerms',
      'creditDays'
    ];

    for (const field of numericFields) {
      if (data[field] !== null && data[field] !== undefined && data[field] !== "") {
        const numValue = Number(data[field]);
        if (isNaN(numValue)) {
          return `Invalid numeric value for ${field}: ${data[field]}`;
        }
      }
    }
    return null;
  };

  // Use it in your handleSubmit function
  const validationError = validateNumericFields({
    ...quotationData,
    ...orderStatusData
  });

  if (validationError) {
    showNotification(validationError, "error");
    setIsSubmitting(false);
    return;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const isMakeQuotationStage = currentStage === "make-quotation" || currentStage === "Make Quotation";
    const isOrderExpectedStage = currentStage === "order-expected" || currentStage === "Order Expected";
    const isOrderStatusStage = currentStage === "order-status" || currentStage === "Order Status";
    try {

      let orderNumber = "";
      if (isOrderStatusStage && orderStatusData.orderStatus === "yes") {
        orderNumber = await generateNextOrderNumber();
      }

      if (isOrderStatusStage &&
        orderStatusData.orderStatus === "yes" &&
        orderStatusData.acceptanceFile &&
        typeof orderStatusData.acceptanceFile !== "string") {
        showNotification("Uploading acceptance file...", "info");
        const fileUrl = await uploadFileToSupabase(orderStatusData.acceptanceFile, "acceptance_file_upload");

        setOrderStatusData(prev => ({
          ...prev,
          acceptanceFile: fileUrl
        }));

        showNotification("Acceptance file uploaded successfully", "success");
      }

      // Handle apology video upload if needed
      if (isOrderStatusStage &&
        orderStatusData.orderStatus === "no" &&
        orderStatusData.apologyVideo &&
        typeof orderStatusData.apologyVideo !== "string") {
        showNotification("Uploading apology video...", "info");
        const fileUrl = await uploadFileToSupabase(orderStatusData.apologyVideo, "order_lost_apology");

        setOrderStatusData(prev => ({
          ...prev,
          apologyVideo: fileUrl
        }));

        showNotification("Apology video uploaded successfully", "success");
      }


      if (isMakeQuotationStage && quotationData.quotationFile && !quotationData.quotationFileUrl) {
        showNotification("Uploading quotation file...", "info");
        const fileUrl = await uploadFileToSupabase(quotationData.quotationFile, "quotation_image");

        // Update the quotation data with the file URL
        setQuotationData(prev => ({
          ...prev,
          quotationFileUrl: fileUrl
        }));

        showNotification("Quotation file uploaded successfully", "success");
      }


      // Prepare the tracking payload for refactored snake_case tables
      const trackerPayload = {
        enquiry_status: formData.enquiryStatus || "Active",
        what_did_customer_say: formData.customerFeedback || "",
        current_stage: currentStage,
      };

      if (isMakeQuotationStage) {
        Object.assign(trackerPayload, {
          send_quotation_no: quotationData.sendQuotationNo || null,
          quotation_shared_by: quotationData.quotationSharedBy || null,
          quotation_number: quotationData.quotationNumber || null,
          quotation_value_without_tax: quotationData.valueWithoutTax ? Number(quotationData.valueWithoutTax) : null,
          quotation_value_with_tax: quotationData.valueWithTax ? Number(quotationData.valueWithTax) : null,
          quotation_remarks: quotationData.remarks || null,
          quotation_upload: quotationData.quotationFileUrl || null,
        });
      } else if (isOrderExpectedStage) {
        Object.assign(trackerPayload, {
          next_call_date: orderExpectedData.nextCallDate || null,
          next_call_time: orderExpectedData.nextCallTime || null,
        });
      } else if (isOrderStatusStage) {
        Object.assign(trackerPayload, {
          quotation_number: orderStatusData.orderStatusQuotationNumber || null,
          is_order_received_status: orderStatusData.orderStatus || null,
        });

        if (orderStatusData.orderStatus === "yes") {
          Object.assign(trackerPayload, {
            acceptance_via: orderStatusData.acceptanceVia || null,
            payment_mode: orderStatusData.paymentMode || null,
            destination: orderStatusData.destination || null,
            po_number: orderStatusData.poNumber || null,
            payment_terms_days: orderStatusData.paymentTerms ? String(orderStatusData.paymentTerms) : null,
            transport_mode: orderStatusData.transportMode || null,
            warranty: orderStatusData.warranty || orderStatusData.orderVideo || null,
            acceptance_file_upload: typeof orderStatusData.acceptanceFile === "string" ? orderStatusData.acceptanceFile : null,
            remark: orderStatusData.orderRemark || null,
            order_no: orderNumber || null,
          });
        } else if (orderStatusData.orderStatus === "no") {
          Object.assign(trackerPayload, {
            order_lost_apology_video: typeof orderStatusData.apologyVideo === "string" ? orderStatusData.apologyVideo : null,
            if_no_reason_status: orderStatusData.reasonStatus || null,
            if_no_reason_remark: orderStatusData.reasonRemark || null,
          });
        }
      }


      // --- START: Client Master Sync & Round-Robin Logic ---
      let resolvedHandlePerson = "";
      const isOrderYes = orderStatusData.orderStatus && orderStatusData.orderStatus.toLowerCase() === "yes";


      if (isOrderStatusStage && isOrderYes) {
        try {
          let leadData = null;
          let enqData = null;

          if (formData.enquiryNo && formData.enquiryNo.toUpperCase().startsWith("LD-")) {
            const { data: ld } = await supabase
              .from("lto_leads")
              .select("sc_name, company_name, person_name, phone_number, email_address, location, state, address, gst_number, company_group_name, nob, crm_name, sales_type, lead_source")
              .eq("lead_no", formData.enquiryNo)
              .maybeSingle();
            leadData = ld;
          } else {
            const { data: ed } = await supabase
              .from("lto_enquiries")
              .select("company_name, sales_coordinator_name, sales_person_name, phone_number, email, location, enquiry_for_state, shipping_address, gst_number, crm_name, sales_type, lead_source, nob")
              .eq("enquiry_no", formData.enquiryNo)
              .maybeSingle();
            enqData = ed;
          }

          resolvedHandlePerson = leadData?.sc_name || leadData?.handle_person || enqData?.sales_coordinator_name || "";

          // Insert / Update client_master
          const clientName = leadData?.person_name || leadData?.salesperson_name || enqData?.sales_person_name || enqData?.sales_coordinator_name || enqData?.scName || "";
          const compName = (leadData?.company_name || enqData?.company_name || enqData?.companyName || formData.companyName || "").trim();

          // Only sync if company name is present
          if (compName) {
            const { data: clientMatches } = await supabase
              .from("lto_client_master")
              .select("uuid, company_name, crm_name, company_group_name, sales_type, sc_name, state")
              .ilike("company_name", compName)
              .limit(1);
            const existingClient = clientMatches && clientMatches.length > 0 ? clientMatches[0] : null;

            // Sales Type Upgrade & Dynamic SC Reassignment upon Order Conversion
            let currentSalesType = (existingClient?.sales_type || leadData?.sales_type || enqData?.sales_type || "").trim();
            let targetSalesType = currentSalesType.toUpperCase() === "NBD" ? "NBD_CRR" : currentSalesType;
            const targetGroup = (existingClient?.company_group_name || leadData?.company_group_name || enqData?.company_group_name || "").trim();

            let assignedScFromGroup = false;
            if (targetGroup) {
              try {
                const { data: groupClients } = await supabase
                  .from("lto_client_master")
                  .select("sc_name")
                  .ilike("company_group_name", targetGroup)
                  .not("sc_name", "is", null)
                  .not("sc_name", "eq", "")
                  .order("updated_at", { ascending: false })
                  .limit(1);

                if (groupClients && groupClients.length > 0 && groupClients[0].sc_name) {
                  resolvedHandlePerson = groupClients[0].sc_name;
                  assignedScFromGroup = true;
                }
              } catch (groupErr) {
                console.error("Error fetching group SC during order conversion:", groupErr);
              }
            }

            if (!assignedScFromGroup) {
              try {
                const { data: activeRules } = await supabase
                  .from("lto_sc_distribution")
                  .select("*")
                  .order("sequence_order", { ascending: true })
                  .order("created_at", { ascending: true });

                if (activeRules && activeRules.length > 0) {
                  const currentNob = (leadData?.nob || enqData?.nob || "").trim().toUpperCase();
                  const currentSource = (leadData?.lead_source || enqData?.lead_source || "").trim().toUpperCase();
                  const currentType = targetSalesType.toUpperCase();

                  const matchedRules = activeRules.filter((rule) => {
                    const types = (rule.sales_types || []).map((t) => t.toUpperCase());
                    const sources = (rule.lead_sources || []).map((s) => s.toUpperCase());
                    const nobs = (rule.nobs || []).map((n) => n.toUpperCase());

                    const typeMatch = types.length === 0 || types.includes(currentType);
                    const sourceMatch = sources.length === 0 || sources.includes("ALL SOURCES") || sources.includes(currentSource);
                    const nobMatch = nobs.length === 0 || nobs.some((n) => {
                      if (n === "ALL NOBS") return true;
                      if (n === "ALL NOBS (EXCEPT RESELLER)") return currentNob !== "RESELLER";
                      return n === currentNob;
                    });

                    return typeMatch && sourceMatch && nobMatch;
                  });

                  if (matchedRules.length > 0) {
                    const candidate = matchedRules.find((r) => r.is_next_in_line) || matchedRules[0];
                    if (candidate && candidate.sc_name) {
                      resolvedHandlePerson = candidate.sc_name;
                    }

                    if (matchedRules.length > 1 && candidate?.id) {
                      const currentIndex = matchedRules.findIndex((item) => item.id === candidate.id);
                      const nextIndex = (currentIndex + 1) % matchedRules.length;
                      const nextItem = matchedRules[nextIndex];

                      if (candidate.id !== nextItem.id) {
                        await supabase.from("lto_sc_distribution").update({ is_next_in_line: false }).eq("id", candidate.id);
                      }
                      await supabase.from("lto_sc_distribution").update({ is_next_in_line: true, updated_at: new Date().toISOString() }).eq("id", nextItem.id);
                    }
                  }
                }
              } catch (scErr) {
                console.error("Error evaluating SC conversion reassignment:", scErr);
              }
            }

            // CRM Distribution Algorithm (Priority 1: Group -> Priority 2: State-NOB combined with Round-Robin)
            let assignedCrmName = (existingClient?.crm_name || leadData?.crm_name || enqData?.crm_name || "").trim();

            // Evaluate rules whenever CRM Name is currently blank/null (even for existing unconverted client_master records)
            if (!assignedCrmName) {
              const targetState = (existingClient?.state || leadData?.state || enqData?.enquiry_for_state || enqData?.enquiryState || "").trim();
              const targetNob = (leadData?.nob || enqData?.nob || "").trim();

              try {
                const { data: crmRules, error: rulesErr } = await supabase
                  .from("lto_crm_distribution")
                  .select("*");

                if (!rulesErr && crmRules && crmRules.length > 0) {
                  const groupRules = crmRules.filter((r) =>
                    (r.tier || "").trim().toLowerCase() === "group"
                  );
                  const stateNobRules = crmRules.filter((r) =>
                    (r.tier || "").trim().toLowerCase() !== "group"
                  );

                  let matchedRule = null;

                  // Priority 1: Group Tier
                  if (targetGroup) {
                    matchedRule = groupRules.find((r) => {
                      const gList = Array.isArray(r.group_name)
                        ? r.group_name.map((g) => String(g).trim().toLowerCase())
                        : [];
                      return gList.includes(targetGroup.toLowerCase());
                    });
                  }

                  // Priority 2: State-NOB Tier
                  if (!matchedRule) {
                    const candidates = [];
                    stateNobRules.forEach((r) => {
                      const stateList = Array.isArray(r.state_keys)
                        ? r.state_keys.map((s) => String(s).trim().toLowerCase())
                        : [];
                      const nobList = Array.isArray(r.nob_keys)
                        ? r.nob_keys.map((n) => String(n).trim().toLowerCase())
                        : [];

                      const stateMatches =
                        stateList.length === 0 ||
                        stateList.includes("any") ||
                        (targetState && stateList.includes(targetState.toLowerCase()));

                      const nobMatches =
                        nobList.length === 0 ||
                        nobList.includes("any") ||
                        (targetNob && nobList.includes(targetNob.toLowerCase()));

                      if (stateMatches && nobMatches) {
                        let score = 0;
                        if (stateList.length > 0 && !stateList.includes("any") && targetState && stateList.includes(targetState.toLowerCase())) score += 2;
                        if (nobList.length > 0 && !nobList.includes("any") && targetNob && nobList.includes(targetNob.toLowerCase())) score += 1;
                        candidates.push({ rule: r, score });
                      }
                    });

                    if (candidates.length > 0) {
                      candidates.sort((a, b) => b.score - a.score);
                      matchedRule = candidates[0].rule;
                    }
                  }

                  if (matchedRule) {
                    // Extract CRM names list
                    const crmList = Array.isArray(matchedRule.crm_names)
                      ? matchedRule.crm_names.map((c) => String(c).trim()).filter(Boolean)
                      : [];

                    if (crmList.length > 0) {
                      let nextCrm = crmList[0];
                      const lastCrm = matchedRule.last_assigned_crm;
                      if (lastCrm && crmList.includes(lastCrm)) {
                        const lastIdx = crmList.indexOf(lastCrm);
                        nextCrm = crmList[(lastIdx + 1) % crmList.length];
                      }
                      assignedCrmName = nextCrm;

                      // Update round-robin tracking on the matched rule
                      try {
                        await supabase
                          .from("lto_crm_distribution")
                          .update({
                            last_assigned_crm: nextCrm,
                            last_assigned_ref: formData.enquiryNo || null,
                            updated_at: new Date().toISOString(),
                          })
                          .eq("uuid", matchedRule.uuid);
                      } catch (rrErr) {
                        console.error("Error updating round-robin tracking:", rrErr);
                      }
                    }
                  }
                }
              } catch (crmErr) {
                console.error("Error evaluating CRM distribution rules:", crmErr);
              }
            }

            const clientPayload = {
              company_name: compName,
              client_name: clientName,
              sc_name: resolvedHandlePerson,
              sales_type: targetSalesType || null,
              crm_name: assignedCrmName || null,
              client_mobile_number: leadData?.phone_number || enqData?.phone_number || enqData?.phoneNumber || "",
              state: leadData?.state || enqData?.enquiry_for_state || enqData?.enquiryState || "",
              billing_address: leadData?.address || enqData?.shipping_address || enqData?.shippingAddress || "",
              gst_number: leadData?.gst_number || enqData?.gst_number || enqData?.gstNumber || "",
              already_in_tracker: `Order Received (${formData.enquiryNo})`
            };

            let cmError = null;
            if (existingClient) {
              const { error: err } = await supabase
                .from("lto_client_master")
                .update(clientPayload)
                .eq("uuid", existingClient.uuid);
              cmError = err;
            } else {
              const { error: err } = await supabase
                .from("lto_client_master")
                .insert([clientPayload]);
              cmError = err;
            }

            if (cmError) {
              console.error("Error syncing client_master:", cmError);
            }

            // Sync assigned crm_name back to the parent lead or enquiry record
            if (assignedCrmName) {
              if (formData.enquiryNo && formData.enquiryNo.toUpperCase().startsWith("LD-")) {
                await supabase
                  .from("lto_leads")
                  .update({ crm_name: assignedCrmName })
                  .eq("lead_no", formData.enquiryNo);
              } else if (formData.enquiryNo) {
                await supabase
                  .from("lto_enquiries")
                  .update({ crm_name: assignedCrmName })
                  .eq("enquiry_no", formData.enquiryNo);
              }
            }

            // Immediately trigger client code generation (CXXX format) upon Order confirmation!
            await generateAndAssignClientCode(compName);
          } else {
            console.warn("Client Master sync skipped: No company name found");
          }

          orderStatusData.resolvedHandlePerson = resolvedHandlePerson;

        } catch (err) {
          console.error("Error creating client record:", err);
        }
      }
      // --- END: Client Master Sync ---

      // Clean up empty, null, or undefined values from trackerPayload
      Object.keys(trackerPayload).forEach((key) => {
        if (trackerPayload[key] === undefined || trackerPayload[key] === null || trackerPayload[key] === "") {
          delete trackerPayload[key];
        }
      });

      const isEnquiryTableRecord = (formData.enquiryNo && formData.enquiryNo.toUpperCase().startsWith("EN-")) || activeTab === "directEnquiry";

      if (isEnquiryTableRecord) {
        // Fetch enquiry UUID from enquiries table using enquiry_no
        const { data: enqData } = await supabase
          .from("lto_enquiries")
          .select("id")
          .eq("enquiry_no", formData.enquiryNo)
          .maybeSingle();

        if (enqData?.id) {
          const { error: trackerErr } = await supabase
            .from("lto_enquiry_tracker")
            .insert([{ ...trackerPayload, enquiry_id: enqData.id }]);

          if (trackerErr) {
            console.error("Error inserting into enquiry_tracker:", trackerErr.message);
            showNotification("Error saving tracking data: " + trackerErr.message, "error");
            setIsSubmitting(false);
            return;
          }
        } else {
          console.warn("Could not find UUID in enquiries table for:", formData.enquiryNo);
        }

        const updateSuccess = await updateEnquiryToOrderTable(
          formData.enquiryNo,
          {
            ...formData,
            ...quotationData,
            ...orderExpectedData,
            ...orderStatusData,
            generatedOrderNumber: orderNumber // Ensure the number is passed for sync
          },
          currentStage
        );

        if (updateSuccess) {
          showNotification("Call tracker updated successfully and enquiry record updated", "success");
          await new Promise(resolve => setTimeout(resolve, 1000));
          const webhookSuccess = await triggerWebhookManually(formData.enquiryNo, "lto_enquiries");
          if (webhookSuccess) {
            showNotification("Data synced to Google Sheets", "success");
          } else {
            showNotification("Database updated but Google Sheets sync may be delayed", "warning");
          }
        } else {
          showNotification("Call tracker updated but enquiry record could not be updated", "warning");
        }
      } else {
        // Fetch lead UUID from leads table using lead_no
        const { data: leadData } = await supabase
          .from("lto_leads")
          .select("id")
          .eq("lead_no", formData.enquiryNo)
          .maybeSingle();

        if (leadData?.id) {
          const { error: trackerErr } = await supabase
            .from("lto_enquiry_tracker_for_leads")
            .insert([{ ...trackerPayload, lead_id: leadData.id }]);

          if (trackerErr) {
            console.error("Error inserting into enquiry_tracker_for_leads:", trackerErr.message);
            showNotification("Error saving lead tracking data: " + trackerErr.message, "error");
            setIsSubmitting(false);
            return;
          }
        } else {
          console.warn("Could not find UUID in leads table for:", formData.enquiryNo);
        }

        const updateSuccess = await updateLeadToOrderTable(
          formData.enquiryNo,
          {
            ...formData,
            ...quotationData,
            ...orderExpectedData,
            ...orderStatusData
          },
          currentStage,
          orderStatusData
        );

        if (updateSuccess) {
          showNotification("Call tracker updated successfully and lead record updated", "success");
          await new Promise(resolve => setTimeout(resolve, 1000));
          const webhookSuccess = await triggerWebhookManually(formData.enquiryNo, "lto_leads");
          if (webhookSuccess) {
            showNotification("Data synced to Google Sheets", "success");
          } else {
            showNotification("Database updated but Google Sheets sync may be delayed", "warning");
          }
        } else {
          showNotification("Call tracker updated but lead record could not be updated", "warning");
        }
      }

      const targetComp = formData.companyName || formData.Company_Name || formData.company_name;
      if (targetComp) {
        try {
          let displayStage = currentStage;
          if (currentStage === "order-status" || currentStage === "Order Status") {
            if (orderStatusData.orderStatus?.toLowerCase() === "yes") {
              displayStage = "Order Received";
            } else if (orderStatusData.orderStatus?.toLowerCase() === "no") {
              displayStage = "Order Lost";
            } else {
              displayStage = "Order Status";
            }
          } else if (currentStage === "make-quotation" || currentStage === "Make Quotation") {
            displayStage = "Make Quotation";
          } else if (currentStage === "order-expected" || currentStage === "Order Expected") {
            displayStage = "Follow-up";
          } else {
            displayStage = "Enquiry Tracker";
          }

          await supabase
            .from("lto_client_master")
            .update({
              already_in_tracker: `${displayStage} (${formData.enquiryNo})`,
              updated_at: new Date().toISOString()
            })
            .ilike("company_name", targetComp.trim());
        } catch (cmErr) {
          console.error("Failed to update already_in_tracker in client_master:", cmErr);
        }
      }

      navigate("/enquiry-tracker");
    } catch (err) {
      console.error("Unexpected error:", err);
      showNotification("Error saving data: " + err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="container mx-auto py-1 px-2">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="px-3 py-2 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Enquiry Tracker</h2>
          <p className="text-[11px] text-slate-500">
            Track the progress of the enquiry
            {formData.enquiryNo && <span className="font-medium text-primary"> for Enquiry #{formData.enquiryNo}</span>}
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-2 space-y-3">
            <div className="space-y-2">
              <label htmlFor="enquiryNo" className="block text-sm font-medium text-gray-700">
                Enquiry No.
               <span className="text-destructive">*</span></label>
              <input
                id="enquiryNo"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="En-01"
                value={formData.enquiryNo}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="enquiryStatus" className="block text-sm font-medium text-gray-700">
                Enquiry Status
               <span className="text-destructive">*</span></label>
              <select
                id="enquiryStatus"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={formData.enquiryStatus}
                onChange={handleInputChange}
                required
              >
                <option value="">Select status</option>
                {enquiryStatusOptions.map((option, index) => (
                  <option key={index} value={option.toLowerCase()}>{option}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="customerFeedback" className="block text-sm font-medium text-gray-700">
                What Did Customer Say
               <span className="text-destructive">*</span></label>
              <input
                list="customer-feedback-options"
                id="customerFeedback"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Select or type customer feedback"
                value={formData.customerFeedback}
                onChange={handleInputChange}
                required
              />
              <datalist id="customer-feedback-options">
                {customerFeedbackOptions.map((feedback, index) => (
                  <option key={index} value={feedback} />
                ))}
              </datalist>
            </div>


            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Current Stage</label>
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="make-quotation"
                    name="currentStage"
                    value="make-quotation"
                    checked={currentStage === "make-quotation"}
                    onChange={async (e) => {
                      setCurrentStage(e.target.value)
                    }}
                    className="h-4 w-4 text-primary focus:ring-primary"
                  />
                  <label htmlFor="make-quotation" className="text-sm text-gray-700">
                    Make Quotation
                  </label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="order-expected"
                    name="currentStage"
                    value="order-expected"
                    checked={currentStage === "order-expected"}
                    onChange={async (e) => {
                      setCurrentStage(e.target.value)
                    }}
                    className="h-4 w-4 text-primary focus:ring-primary"
                  />
                  <label htmlFor="order-expected" className="text-sm text-gray-700">
                    Order Expected
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="order-status"
                    name="currentStage"
                    value="order-status"
                    checked={currentStage === "order-status"}
                    onChange={(e) => {
                      const stage = e.target.value;
                      setCurrentStage(stage);

                      // Use useEffect to handle the side effect instead
                    }}
                    className="h-4 w-4 text-primary focus:ring-primary"
                  />
                  <label htmlFor="order-status" className="text-sm text-gray-700">
                    Order Status
                  </label>
                </div>
              </div>
            </div>

            {currentStage === "make-quotation" && (
              <MakeQuotationForm
                enquiryNo={formData.enquiryNo}
                formData={quotationData}
                onFieldChange={handleQuotationChange}
              />
            )}
            {currentStage === "quotation-validation" && (
              <QuotationValidationForm
                enquiryNo={formData.enquiryNo}
                formData={validationData}
                onFieldChange={handleValidationChange}
              />
            )}
            {currentStage === "order-expected" && (
              <OrderExpectedForm
                enquiryNo={formData.enquiryNo}
                formData={orderExpectedData}
                onFieldChange={handleOrderExpectedChange}
              />
            )}
            {currentStage === "order-status" && (
              <OrderStatusForm
                enquiryNo={formData.enquiryNo}
                formData={orderStatusData}
                onFieldChange={handleOrderStatusChange}
                activeTab={activeTab}
              />
            )}
          </div>
          <div className="p-6 border-t flex justify-between">
            <button
              type="button"
              onClick={() => navigate(-1)}
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

export default NewEnquiryTracker