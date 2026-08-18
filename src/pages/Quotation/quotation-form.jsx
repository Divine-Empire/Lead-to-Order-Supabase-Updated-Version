"use client";

import { useState, useEffect, useRef } from "react";
import QuotationDetails from "./quotation-details";
import ConsignorDetails from "./consignor-details";
import ConsigneeDetails from "./consignee-details";
import ItemsTable from "./items-table";
import TermsAndConditions from "./terms and conditions";
import BankDetails from "./bank-details";
import NotesSection from "./notes-section";
import SpecialOfferSection from "./special-offer-section";
import { getCompanyPrefix, getNextQuotationNumber } from "./quotation-service";
import { getStateCodeFromName } from "../../utils/gstStateCodes";
import supabase from "../../utils/supabase";

const QuotationForm = ({
  quotationData,
  handleInputChange,
  handleItemChange,
  handleAddItem,
  handleNoteChange,
  addNote,
  removeNote,
  hiddenFields,
  toggleFieldVisibility,
  isRevising,
  existingQuotations,
  selectedQuotation,
  handleSpecialDiscountChange,
  handleQuotationSelect,
  isLoadingQuotation,
  specialDiscount,
  setSpecialDiscount,
  selectedReferences,
  setSelectedReferences,
  imageform,
  addSpecialOffer,
  removeSpecialOffer,
  handleSpecialOfferChange,
  setQuotationData,
  hiddenColumns,
  setHiddenColumns,
  onQuotationSearch,
  onLoadMoreQuotations,
  hasMoreQuotations,
  isFetchingMore,
}) => {
  const [dropdownData, setDropdownData] = useState({});
  const [stateOptions, setStateOptions] = useState(["Select State"]);
  const [companyOptions, setCompanyOptions] = useState(["Select Company"]);
  const [referenceOptions, setReferenceOptions] = useState([
    "Select Reference",
  ]);
  const [preparedByOptions, setPreparedByOptions] = useState([""]);
  const [productCodes, setProductCodes] = useState([]);
  const [productNames, setProductNames] = useState([]);
  const [productData, setProductData] = useState({});
  const [isItemsLoading, setIsItemsLoading] = useState(false);

  // Lead number states
  const [showLeadNoDropdown, setShowLeadNoDropdown] = useState(false);
  // Each option: { value, label, sourceType, recordId, companyName, contactName, contactNo }
  const [leadNoOptions, setLeadNoOptions] = useState([]);
  const [leadNoData, setLeadNoData] = useState({});
  const [leadNob, setLeadNob] = useState("");

  // ─── HARDCODED REFERENCE PHONE NUMBER ────────────────────────────────────────
  // TODO: Replace this value when the actual number is confirmed
  const REFERENCE_PHONE_NO = "";
  // ─────────────────────────────────────────────────────────────────────────────

  // Fetch data from dedicated tables:
  // - consignor_details → state/consignor info
  // - client_master     → consignee companies
  // - items             → product codes, names, rates
  // - dropdown          → prepared_by names + reference (sp) info
  useEffect(() => {
    const fetchDropdownData = async () => {
      // ── 1. Fetch consignor details from consignor_details table ───────────────
      let consignorData = [];
      try {
        const { data, error } = await supabase
          .from("lto_consignor_details")
          .select("state, state_code, data, address, gstin, msme_num, pan_num, reference_name, contact_num");
        if (error) console.error("Error fetching consignor_details:", error);
        else consignorData = data || [];
      } catch (err) {
        console.error("Consignor details fetch exception:", err);
      }

      // ── 2. Fetch consignee companies from client_master table in chunks ────────
      let clientMasterData = [];
      try {
        let from = 0;
        const step = 500;
        let fetchMore = true;

        while (fetchMore) {
          const { data, error } = await supabase
            .from("lto_client_master")
            .select("company_name, billing_address, state, client_name, client_mobile_number, gst_number, state_code")
            .eq("isRelevant", true)
            .range(from, from + step - 1);

          if (error) {
            console.error("Error fetching client_master chunk:", error);
            break;
          }

          if (data && data.length > 0) {
            clientMasterData = [...clientMasterData, ...data];
            from += step;
            if (data.length < step) fetchMore = false;
          } else {
            fetchMore = false;
          }
        }
      } catch (err) {
        console.error("Client master fetch exception:", err);
      }

      // ── 3. Fetch items from items table in chunks (with column fallback) ──────
      let itemsData = [];
      try {
        let from = 0;
        const step = 500;
        let fetchMore = true;

        while (fetchMore) {
          let res = await supabase
            .from("lto_items")
            .select("item_code, item_name, description, rate, reseller_rate, warranty")
            .range(from, from + step - 1);

          // Fallback if reseller_rate or warranty columns don't exist yet in DB
          if (res.error) {
            console.warn("items query with reseller_rate/warranty failed, falling back to basic columns:", res.error.message);
            res = await supabase
              .from("lto_items")
              .select("item_code, item_name, description, rate")
              .range(from, from + step - 1);
          }

          if (res.error) {
            console.error("Error fetching items chunk:", res.error);
            break;
          }

          if (res.data && res.data.length > 0) {
            itemsData = [...itemsData, ...res.data];
            from += step;
            if (res.data.length < step) fetchMore = false;
          } else {
            fetchMore = false;
          }
        }
      } catch (err) {
        console.error("Items fetch exception:", err);
      }

      // ── 4. Fetch prepared_by from dropdown table ──────────────────────────────
      let preparedByData = [];
      try {
        const { data, error } = await supabase
          .from("lto_dropdown")
          .select("value")
          .eq("category", "prepared_by");
        if (error) console.error("Error fetching prepared_by:", error);
        else preparedByData = data || [];
      } catch (err) {
        console.error("Prepared by fetch exception:", err);
      }

      // ── 5. Fetch references from dropdown table ────────────────────────────────
      // References (sales-staff referrer name + phone) used to live mixed into
      // lto_consignor_details, which also holds the 3 real consignor/branch
      // entities -- that conflation is what made consignor_id on a saved
      // quotation resolve to a reference row instead of the actual branch used,
      // breaking revision prefill. References now live here instead, one
      // "Name — Number" string per row (lto_dropdown only has a single value
      // column, so both are packed into it and split back out below).
      let referenceData = [];
      try {
        const { data, error } = await supabase
          .from("lto_dropdown")
          .select("value")
          .eq("category", "reference");
        if (error) console.error("Error fetching references:", error);
        else referenceData = data || [];
      } catch (err) {
        console.error("Reference fetch exception:", err);
      }

      // ── Build state options from consignor_details ──────────────────────────
      const stateOptionsData = ["Select State"];
      const stateDetailsMap = {};

      if (consignorData && consignorData.length > 0) {
        consignorData.forEach((row) => {
          if (row.state && !stateOptionsData.includes(row.state)) {
            stateOptionsData.push(row.state);
            stateDetailsMap[row.state] = {
              bankDetails: (row.data && typeof row.data === "object"
                ? Object.entries(row.data).map(([k, v]) => `${k}: ${v}`).join("\n")
                : row.data) || "",
              consignerAddress: row.address || "",
              stateCode: row.state_code || "",
              gstin: row.gstin || "",
              pan: row.pan_num || "",
              msmeNumber: row.msme_num || "",
            };
          }
        });
      }

      // ── Build company options from client_master ────────────────────────────
      const companyOptionsData = ["Select Company"];
      const companyDetailsMap = {};

      if (clientMasterData && clientMasterData.length > 0) {
        clientMasterData.forEach((row) => {
          if (row.company_name && !companyOptionsData.includes(row.company_name)) {
            companyOptionsData.push(row.company_name);
            companyDetailsMap[row.company_name] = {
              address: row.billing_address || "",
              state: row.state || "",
              contactName: row.client_name || "",
              contactNo: row.client_mobile_number || "",
              gstin: row.gst_number || "",
              stateCode: row.state_code || "",
            };
          }
        });
      }

      // ── Build reference options from dropdown (sp_details) ──────────────────
      const referenceOptionsData = ["Select Reference"];
      const referenceDetailsMap = {};
      const preparedByOptionsData = [""];

      // Build prepared_by options from category/value query
      if (preparedByData && preparedByData.length > 0) {
        preparedByData.forEach((row) => {
          if (row.value && !preparedByOptionsData.includes(row.value)) {
            preparedByOptionsData.push(row.value);
          }
        });
      }

      // Build reference options from lto_dropdown (category="reference"),
      // splitting each "Name — Number" value back into its two parts.
      if (referenceData && referenceData.length > 0) {
        referenceData.forEach((row) => {
          const [name, number] = (row.value || "").split("—").map((s) => s.trim());
          if (name && !referenceOptionsData.includes(name)) {
            referenceOptionsData.push(name);
            referenceDetailsMap[name] = {
              mobile: number || "",
              phone: REFERENCE_PHONE_NO,
            };
          }
        });
      }

      // ── Build product codes/names from items table ──────────────────────────
      const codes = ["Select Code"];
      const names = ["Select Product"];
      const productDataMap = {};

      if (itemsData && itemsData.length > 0) {
        itemsData.forEach((row) => {
          const code = row.item_code;
          const name = row.item_name;
          const description = row.description || "";
          const rate = parseFloat(row.rate) || 0;
          const reseller_rate = parseFloat(row.reseller_rate) || 0;
          const warranty = row.warranty || "";

          if (code && !codes.includes(code)) codes.push(code);
          if (name && !names.includes(name)) names.push(name);

          if (code) {
            productDataMap[code] = { name, description, rate, reseller_rate, warranty };
          }
          if (name) {
            productDataMap[name] = { code, description, rate, reseller_rate, warranty };
          }
        });
      }

      // ── Apply all state updates ─────────────────────────────────────────────
      setStateOptions(stateOptionsData);
      setCompanyOptions(companyOptionsData);
      setReferenceOptions(referenceOptionsData);
      setPreparedByOptions(preparedByOptionsData);
      setProductCodes(codes);
      setProductNames(names);
      setProductData(productDataMap);

      setDropdownData({
        states: stateDetailsMap,
        companies: companyDetailsMap,
        references: referenceDetailsMap,
      });
    };

    fetchDropdownData();
  }, []);

  // `dropdownData.companies` above takes a moment to load (a sequential
  // chain of several table fetches) -- if consigneeName already gets set
  // before that resolves (e.g. the user picks/types a company right away,
  // or Lead No selection auto-fills it), handleCompanyChange in
  // consignee-details.jsx runs against an empty `dropdownData.companies`
  // and explicitly blanks consigneeStateCode/Address/State/etc rather than
  // just leaving them alone, since it can't tell "not loaded yet" apart
  // from "not a known company". Nothing then re-checks once the data
  // arrives. This runs once, right when companies finish loading, and
  // fills in only whatever fields are still blank -- never overwrites
  // anything already correctly set (e.g. by revision loading, or by the
  // user editing it manually in that gap).
  const hasHydratedConsigneeRef = useRef(false);
  useEffect(() => {
    if (hasHydratedConsigneeRef.current) return;
    if (!dropdownData.companies || Object.keys(dropdownData.companies).length === 0) return;
    hasHydratedConsigneeRef.current = true;

    const name = quotationData.consigneeName;
    const companyDetails = name && dropdownData.companies[name];
    if (!companyDetails) return;

    if (!quotationData.consigneeStateCode && companyDetails.stateCode) {
      handleInputChange("consigneeStateCode", companyDetails.stateCode);
    }
    if (!quotationData.consigneeAddress && companyDetails.address) {
      handleInputChange("consigneeAddress", companyDetails.address);
    }
    if (!quotationData.consigneeState && companyDetails.state) {
      handleInputChange("consigneeState", companyDetails.state);
    }
    if (!quotationData.consigneeContactName && companyDetails.contactName) {
      handleInputChange("consigneeContactName", companyDetails.contactName);
    }
    if (!quotationData.consigneeContactNo && companyDetails.contactNo) {
      handleInputChange("consigneeContactNo", companyDetails.contactNo);
    }
    if (!quotationData.consigneeGSTIN && companyDetails.gstin) {
      handleInputChange("consigneeGSTIN", companyDetails.gstin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropdownData.companies]);

  // Lead/Enquiry No. suggestions now come from `enquiry_pending_view` -- the
  // same Postgres view that backs the Enquiry Tracker's "Pending" tab, and
  // which already unifies both lead-sourced and direct-enquiry rows via its
  // `source_type`/`record_id` columns. This avoids ever bulk-loading the
  // (several-thousand-row) leads/enquiries tables into the browser: only the
  // latest 25 pending leads + 25 pending enquiries are fetched up front, and
  // typing in the field re-queries the DB directly (see searchLeadNumbers).
  const PENDING_VIEW_COLUMNS = "display_no, source_type, record_id, company_name, phone_number, person_name";

  const mapPendingRowsToOptions = (rows) =>
    (rows || [])
      .filter((row) => row.display_no)
      .map((row) => ({
        value: row.display_no,
        label: row.company_name ? `${row.display_no} — ${row.company_name}` : row.display_no,
        sourceType: row.source_type,
        recordId: row.record_id,
        companyName: row.company_name || "",
        contactName: row.person_name || "",
        contactNo: row.phone_number || "",
      }));

  // Fetch the latest 25 pending leads + 25 pending enquiries up front.
  useEffect(() => {
    const fetchInitialPendingLeadNos = async () => {
      try {
        const [leadsRes, enquiriesRes] = await Promise.all([
          supabase
            .from("enquiry_pending_view")
            .select(PENDING_VIEW_COLUMNS)
            .eq("source_type", "lead")
            .order("last_activity_at", { ascending: false })
            .limit(25),
          supabase
            .from("enquiry_pending_view")
            .select(PENDING_VIEW_COLUMNS)
            .eq("source_type", "enquiry")
            .order("last_activity_at", { ascending: false })
            .limit(25),
        ]);

        if (leadsRes.error) console.error("Error fetching pending leads:", leadsRes.error);
        if (enquiriesRes.error) console.error("Error fetching pending enquiries:", enquiriesRes.error);

        setLeadNoOptions(mapPendingRowsToOptions([...(leadsRes.data || []), ...(enquiriesRes.data || [])]));
      } catch (error) {
        console.error("Error fetching initial pending lead/enquiry numbers:", error);
      }
    };

    fetchInitialPendingLeadNos();
  }, []);

  // Live search, called (debounced) from ConsigneeDetails as the user types.
  // Restricted to pending records, same as the initial suggestion list.
  const searchLeadNumbers = async (term) => {
    const trimmed = (term || "").trim();
    if (!trimmed) return null; // signal caller to fall back to the initial list

    try {
      const { data, error } = await supabase
        .from("enquiry_pending_view")
        .select(PENDING_VIEW_COLUMNS)
        .ilike("search_text", `%${trimmed.toLowerCase()}%`)
        .order("last_activity_at", { ascending: false })
        .limit(25);

      if (error) {
        console.error("Error searching pending lead/enquiry numbers:", error);
        return [];
      }
      return mapPendingRowsToOptions(data);
    } catch (error) {
      console.error("Error searching pending lead/enquiry numbers:", error);
      return [];
    }
  };

  const handleSpecialDiscountChangeWrapper = (value) => {
    const discount = Number(value) || 0;
    setSpecialDiscount(discount);
    handleSpecialDiscountChange(discount);
  };


  // Function to handle quotation number updates
  const handleQuotationNumberUpdate = (newQuotationNumber) => {
    handleInputChange("quotationNo", newQuotationNumber);
  };

  // Helper function to safely convert value to string
  const safeToString = (value) => {
    if (value === null || value === undefined) return "";
    return String(value);
  };

  // Handle lead number selection and autofill.
  // `meta` is the {sourceType, recordId, ...} of the suggestion the user
  // picked (from the pending-view search) -- we no longer preload every
  // lead/enquiry's full detail, so the full row is fetched on demand here,
  // keyed off meta.recordId, then cached into leadNoData for this session.
  const handleLeadNoSelect = async (selectedLeadNo, meta = null) => {
    if (!selectedLeadNo || selectedLeadNo === "Select Lead No.") {
      return;
    }

    // Already resolved earlier in this session (e.g. selected twice)? Reuse it.
    let leadData = leadNoData[selectedLeadNo];

    if (!leadData) {
      if (!meta || !meta.recordId) return; // nothing to look up

      setIsItemsLoading(true);
      try {
        const isLeadRecord = meta.sourceType === "lead";
        const { data: fullRow, error: rowErr } = await supabase
          .from(isLeadRecord ? "lto_leads" : "lto_enquiries")
          .select("*")
          .eq("id", meta.recordId)
          .maybeSingle();

        if (rowErr || !fullRow) {
          console.error("Error fetching lead/enquiry detail:", rowErr);
          setIsItemsLoading(false);
          return;
        }

        leadData = {
          sheet: isLeadRecord ? "LEADS" : "ENQUIRY",
          companyName: fullRow.company_name || meta.companyName || "",
          address: fullRow.address || fullRow.location || fullRow.shipping_address || "",
          state: fullRow.state || fullRow.enquiry_for_state || "",
          contactName: fullRow.person_name || fullRow.sales_person_name || fullRow.sales_coordinator_name || fullRow.client_name || meta.contactName || "",
          contactNo: fullRow.phone_number || meta.contactNo || "",
          gstin: fullRow.gst_number || "",
          shipTo: fullRow.shipping_address || "",
          rowData: fullRow,
        };
        setLeadNoData((prev) => ({ ...prev, [selectedLeadNo]: leadData }));
      } catch (error) {
        console.error("Error resolving selected lead/enquiry:", error);
        setIsItemsLoading(false);
        return;
      }
    } else {
      setIsItemsLoading(true);
    }

    // Track NOB for pricing logic
    const nob = leadData.rowData?.nob || leadData.rowData?.NOB || leadData.rowData?.nature_of_business || "";
    setLeadNob(nob);

    // Fill consignee details
    const companyName = leadData.companyName;
    handleInputChange("consigneeName", companyName);
    handleInputChange("consigneeAddress", leadData.address);
    handleInputChange("consigneeState", leadData.state);
    handleInputChange("consigneeContactName", leadData.contactName);
    handleInputChange("consigneeContactNo", leadData.contactNo);
    handleInputChange("consigneeGSTIN", leadData.gstin);

    // Lead/enquiry records (lto_leads/lto_enquiries) have no state_code
    // column at all -- only lto_client_master does -- so this derives it
    // from the lead/enquiry's own state name first (keeping GST/address/
    // state/state-code all sourced from the same place, the lead/enquiry
    // itself, rather than mixing in client_master), only falling back to
    // client_master's stored code (keyed by the company name this
    // lead/enquiry belongs to) if that derivation comes up empty.
    const matchedCompany = dropdownData.companies && dropdownData.companies[companyName];
    const resolvedStateCode = getStateCodeFromName(leadData.state) || matchedCompany?.stateCode;
    if (resolvedStateCode) {
      handleInputChange("consigneeStateCode", resolvedStateCode);
    }

    if (leadData.shipTo) {
      handleInputChange("shipTo", leadData.shipTo);
    }


    // Get prefix from Enquiry_Type column and update quotation number
    try {
      let companyPrefix = leadData.rowData.sales_type || leadData.rowData.Enquiry_Type || leadData.rowData.enquiry_type || "";

      // If Enquiry_Type/sales_type is found, use it; otherwise fallback to company-based prefix
      if (companyPrefix) {
        const newQuotationNumber = await getNextQuotationNumber(companyPrefix);
        handleInputChange("quotationNo", newQuotationNumber);
      } else {
        const fallbackPrefix = await getCompanyPrefix(companyName);
        const newQuotationNumber = await getNextQuotationNumber(fallbackPrefix);
        handleInputChange("quotationNo", newQuotationNumber);
      }
    } catch (error) {
      console.error(
        "Error updating quotation number from lead selection:",
        error
      );
    }

    // Fetch items from normalized tables: lto_lead_items (LD- leads) or lto_enquiry_items (enquiries)
    const autoItems = [];
    const row = leadData.rowData || {};

    try {
      const isLeadRecord = leadData.sheet === "LEADS" || selectedLeadNo.toUpperCase().startsWith("LD-");
      const recordId = row.id || null;

      if (recordId) {
        if (isLeadRecord) {
          const { data: leadItems, error: liErr } = await supabase
            .from("lto_lead_items")
            .select("item_name, quantity")
            .eq("lead_id", recordId);

          if (!liErr && leadItems && leadItems.length > 0) {
            leadItems.forEach((li) => {
              if (li.item_name && li.item_name.trim()) {
                autoItems.push({
                  name: li.item_name.trim(),
                  qty: Number(li.quantity) || 1,
                });
              }
            });
          }
        } else {
          const { data: enqItems, error: eiErr } = await supabase
            .from("lto_enquiry_items")
            .select("item_name, quantity")
            .eq("enquiry_id", recordId);

          if (!eiErr && enqItems && enqItems.length > 0) {
            enqItems.forEach((ei) => {
              if (ei.item_name && ei.item_name.trim()) {
                autoItems.push({
                  name: ei.item_name.trim(),
                  qty: Number(ei.quantity) || 1,
                });
              }
            });
          }
        }
      }
    } catch (fetchErr) {
      console.error("Error fetching items from normalized tables:", fetchErr);
    }

    // Preserve any discount/flatDiscount already sitting on the current
    // items (by name, case-insensitive) across this refill -- this fires
    // on every Lead No. selection/blur-commit, INCLUDING while revising an
    // existing quotation whose items were just correctly populated (with
    // real discount/flatDiscount values) by handleQuotationSelect. Without
    // this, re-touching the Lead No. field after that load silently reset
    // every item's discount/flatDiscount back to 0, clobbering what was
    // just loaded -- same class of bug as the Freight-row drop fixed below.
    const existingItemsByName = new Map();
    (quotationData.items || []).forEach((it) => {
      const key = (it.name || "").toLowerCase().trim();
      if (key) existingItemsByName.set(key, it);
    });

    // Helper: map a raw item {name, qty} to a full quotation row with product lookup
    const mapItemToQuotationRow = (item, index, nobVal) => {
      let productInfo = null;
      let productCode = "";
      let productDescription = "";
      let productRate = 0;

      if (productData[item.name]) {
        productInfo = productData[item.name];
      } else {
        const matchingKey = Object.keys(productData).find(
          (key) => key.toLowerCase().trim() === item.name.toLowerCase().trim()
        );
        if (matchingKey) productInfo = productData[matchingKey];
      }

      if (productInfo) {
        productCode = productInfo.code || "";
        const desc = productInfo.description || "";
        const warr = productInfo.warranty || "";
        productDescription = item.name === "Freight" ? "" : (desc + (warr ? (desc ? " " : "") + warr : "")).trim();
        const isReseller = (nobVal || "").toString().toUpperCase() === "RESELLER";
        productRate = isReseller ? (productInfo.reseller_rate || productInfo.rate || 0) : (productInfo.rate || 0);
      }

      const existing = existingItemsByName.get((item.name || "").toLowerCase().trim());
      const discount = existing?.discount || 0;
      const flatDiscount = existing?.flatDiscount || 0;

      return {
        id: index + 1,
        code: productCode,
        name: item.name,
        description: productDescription,
        gst: item.name === "Freight" ? 0 : 18,
        qty: item.qty,
        units: "Nos",
        rate: productRate,
        discount,
        flatDiscount,
        amount: item.qty * productRate,
        isFreight: item.name === "Freight",
      };
    };

    // Update items if found. This is a full replace (matches revision
    // loading's behavior of only ever showing the selected record's own
    // items) -- but autoItems comes from lto_lead_items/lto_enquiry_items,
    // which essentially never contains a literal "Freight" line, so an
    // unconditional replace here silently dropped whatever Freight row
    // was already in quotationData.items (the default one, or one the
    // user had already edited) until the user manually re-added it.
    if (autoItems.length > 0) {
      const newItems = autoItems.map((item, index) => mapItemToQuotationRow(item, index, nob));

      const alreadyHasFreight = newItems.some((item) => item.isFreight || item.name === "Freight");
      if (!alreadyHasFreight) {
        const existingFreightItem = quotationData.items.find(
          (item) => item.isFreight || item.name === "Freight"
        );
        const freightItem = existingFreightItem
          ? { ...existingFreightItem, id: newItems.length + 1 }
          : {
              id: newItems.length + 1,
              code: "",
              name: "Freight",
              description: "",
              gst: 0,
              qty: 1,
              units: "Nos",
              rate: 0,
              discount: 0,
              flatDiscount: 0,
              amount: 0,
              isFreight: true,
            };
        newItems.push(freightItem);
      }

      handleInputChange("items", newItems);
    }

    setIsItemsLoading(false);
  };



  // Function to auto-fill items based on company selection
  const handleAutoFillItems = async (companyName) => {
    if (!companyName || companyName === "Select Company") return;

    setIsItemsLoading(true);

    try {

      let itemsFound = false;
      const autoItems = [];

      // Check leads table first
      const { data: leadsData, error: leadsError } = await supabase
        .from("lto_leads")
        .select("*")
        .eq("company_name", companyName)
        .limit(1);

      if (!leadsError && leadsData && leadsData.length > 0) {
        const row = leadsData[0];

        // Extract items from regular columns
        const itemColumns = [
          { nameCol: "Item_Name1", qtyCol: "Quantity1" },
          { nameCol: "Item_Name2", qtyCol: "Quantity2" },
          { nameCol: "Item_Name3", qtyCol: "Quantity3" },
          { nameCol: "Item_Name4", qtyCol: "Quantity4" },
          { nameCol: "Item_Name5", qtyCol: "Quantity5" },
        ];

        for (const { nameCol, qtyCol } of itemColumns) {
          const itemName = row[nameCol]
            ? safeToString(row[nameCol]).trim()
            : "";
          const itemQty = row[qtyCol] ? safeToString(row[qtyCol]) : "";

          if (itemName !== "" && itemQty !== "") {
            const qty = isNaN(Number(itemQty)) ? 1 : Number(itemQty);
            autoItems.push({
              name: itemName,
              qty: qty,
            });
          }
        }

        // Also check for JSON data
        const itemQtyJson = row["Item/qty"];
        if (itemQtyJson) {
          try {
            const jsonData = JSON.parse(itemQtyJson);
            if (Array.isArray(jsonData)) {
              jsonData.forEach((item) => {
                if (
                  item.name &&
                  item.quantity !== undefined &&
                  item.quantity !== null
                ) {
                  const qty = isNaN(Number(item.quantity))
                    ? 1
                    : Number(item.quantity);
                  autoItems.push({
                    name: item.name,
                    qty: qty,
                  });
                }
              });
            }
          } catch (error) {
            console.error("Error parsing JSON from leads_to_order:", error);
          }
        }

        itemsFound = true;
      }

      // If not found in leads_to_order, try enquiry_to_order
      if (!itemsFound) {
        const { data: enquiryData, error: enquiryError } = await supabase
          .from("lto_enquiries")
          .select("*")
          .eq("company_name", companyName)
          .limit(1);

        if (!enquiryError && enquiryData && enquiryData.length > 0) {
          const row = enquiryData[0];

          // Extract items from columns
          const itemColumns = [
            { nameCol: "item_name1", qtyCol: "quantity1" },
            { nameCol: "item_name2", qtyCol: "quantity2" },
            { nameCol: "item_name3", qtyCol: "quantity3" },
            { nameCol: "item_name4", qtyCol: "quantity4" },
            { nameCol: "item_name5", qtyCol: "quantity5" },
            { nameCol: "item_name6", qtyCol: "quantity6" },
            { nameCol: "item_name7", qtyCol: "quantity7" },
            { nameCol: "item_name8", qtyCol: "quantity8" },
            { nameCol: "item_name9", qtyCol: "quantity9" },
            { nameCol: "item_name10", qtyCol: "quantity10" },
          ];

          for (const { nameCol, qtyCol } of itemColumns) {
            const itemName = row[nameCol]
              ? safeToString(row[nameCol]).trim()
              : "";
            const itemQty = row[qtyCol] ? safeToString(row[qtyCol]) : "";

            if (itemName !== "" && itemQty !== "") {
              const qty = isNaN(Number(itemQty)) ? 1 : Number(itemQty);
              autoItems.push({
                name: itemName,
                qty: qty,
              });
            }
          }

          // Also check for JSON data
          const itemQtyJson = row.item_qty;
          if (itemQtyJson) {
            try {
              const jsonData = JSON.parse(itemQtyJson);
              if (Array.isArray(jsonData)) {
                jsonData.forEach((item) => {
                  if (
                    item.name &&
                    item.quantity !== undefined &&
                    item.quantity !== null
                  ) {
                    const qty = isNaN(Number(item.quantity))
                      ? 1
                      : Number(item.quantity);
                    autoItems.push({
                      name: item.name,
                      qty: qty,
                    });
                  }
                });
              }
            } catch (error) {
              console.error("Error parsing JSON from enquiry_to_order:", error);
            }
          }

          itemsFound = true;
        }
      }

      // If items found, auto-fill the quotation table only if no items exist or only default item exists
      if (itemsFound && autoItems.length > 0) {
        // Check if there are only default/empty items
        const hasOnlyDefaultItems = quotationData.items.length === 1 &&
          (!quotationData.items[0].name || quotationData.items[0].name.trim() === "") &&
          quotationData.items[0].qty === 1;

        if (hasOnlyDefaultItems || quotationData.items.length === 0) {

          // Clear existing items and add new ones
          const newItems = autoItems.map((item, index) => {
            // Look up the product code from productData
            const productInfo = productData[item.name];
            const productCode = productInfo ? productInfo.code : "";
            const productDescription = (item.name === "Freight" || !productInfo) ? "" : (productInfo.description || "");
            const productRate = productInfo ? productInfo.rate : 0;

            return {
              id: index + 1,
              code: productCode,
              name: item.name,
              description: productDescription,
              gst: item.name === "Freight" ? 0 : 18,
              qty: item.qty,
              units: "Nos",
              rate: productRate,
              discount: 0,
              flatDiscount: 0,
              amount: item.qty * productRate,
              isFreight: item.name === "Freight",
            };
          });

          // Update quotation data with new items
          handleInputChange("items", newItems);
        } else {
        }
      } else {
      }
    } catch (error) {
      console.error("Error auto-filling items:", error);
    } finally {
      setIsItemsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <QuotationDetails
            quotationData={quotationData}
            handleInputChange={handleInputChange}
            isRevising={isRevising}
            existingQuotations={existingQuotations}
            selectedQuotation={selectedQuotation}
            handleQuotationSelect={handleQuotationSelect}
            isLoadingQuotation={isLoadingQuotation}
            preparedByOptions={preparedByOptions}
            stateOptions={stateOptions}
            dropdownData={dropdownData}
            onQuotationSearch={onQuotationSearch}
            onLoadMoreQuotations={onLoadMoreQuotations}
            hasMoreQuotations={hasMoreQuotations}
            isFetchingMore={isFetchingMore}
          />

          <ConsignorDetails
            quotationData={quotationData}
            handleInputChange={handleInputChange}
            referenceOptions={referenceOptions}
            selectedReferences={selectedReferences}
            setSelectedReferences={setSelectedReferences}
            dropdownData={dropdownData}
          />
        </div>

        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <ConsigneeDetails
            quotationData={quotationData}
            handleInputChange={handleInputChange}
            companyOptions={companyOptions}
            dropdownData={dropdownData}
            onQuotationNumberUpdate={handleQuotationNumberUpdate}
            onAutoFillItems={handleAutoFillItems}
            showLeadNoDropdown={showLeadNoDropdown}
            setShowLeadNoDropdown={setShowLeadNoDropdown}
            leadNoOptions={leadNoOptions}
            onSearchLeadNo={searchLeadNumbers}
            handleLeadNoSelect={handleLeadNoSelect}
          />
        </div>
      </div>

      <ItemsTable
        quotationData={quotationData}
        handleItemChange={handleItemChange}
        handleAddItem={handleAddItem}
        handleSpecialDiscountChange={handleSpecialDiscountChangeWrapper}
        specialDiscount={specialDiscount}
        setSpecialDiscount={setSpecialDiscount}
        productCodes={productCodes}
        productNames={productNames}
        productData={productData}
        setQuotationData={setQuotationData}
        isLoading={isItemsLoading}
        hiddenColumns={hiddenColumns}
        setHiddenColumns={setHiddenColumns}
        leadNob={leadNob}
      />

      <TermsAndConditions
        quotationData={quotationData}
        handleInputChange={handleInputChange}
        hiddenFields={hiddenFields}
        toggleFieldVisibility={toggleFieldVisibility}
      />

      <SpecialOfferSection
        quotationData={quotationData}
        handleInputChange={handleInputChange}
        addSpecialOffer={addSpecialOffer}
        removeSpecialOffer={removeSpecialOffer}
        handleSpecialOfferChange={handleSpecialOfferChange}
      />

      <NotesSection
        quotationData={quotationData}
        handleNoteChange={handleNoteChange}
        addNote={addNote}
        removeNote={removeNote}
      />

      <BankDetails
        quotationData={quotationData}
        handleInputChange={handleInputChange}
        imageform={imageform}
      />
    </div>
  );
};

export default QuotationForm;
