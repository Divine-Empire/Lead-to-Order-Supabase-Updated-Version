"use client";

import { useState, useEffect, useContext, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AuthContext } from "../../App";
import supabase from "../../utils/supabase";
import * as XLSX from "xlsx";
import { resolveScAndCreForNewCompany } from "../../utils/scAssignment";
import { getStateCodeFromName } from "../../utils/gstStateCodes";

// Generate next sequential lead numbers for bulk import
const generateNextImportLeadNumbers = async (count) => {
  try {
    const { data, error } = await supabase
      .from("lto_leads")
      .select("lead_no")
      .not("lead_no", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);

    let startNum = 1;
    if (!error && data && data.length > 0) {
      let maxNum = 0;
      data.forEach((row) => {
        const lastLeadNumber = row.lead_no;
        if (lastLeadNumber && lastLeadNumber.startsWith("LD-")) {
          const match = lastLeadNumber.match(/LD-(\d+)/);
          if (match) {
            const num = Number.parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      });
      if (maxNum > 0) startNum = maxNum + 1;
    }

    const numbers = [];
    for (let i = 0; i < count; i++) {
      numbers.push(`LD-${String(startNum + i).padStart(3, "0")}`);
    }
    return numbers;
  } catch (e) {
    console.error(e);
    const numbers = [];
    for (let i = 0; i < count; i++) {
      numbers.push(`LD-IMPORT-${Date.now()}-${i}`);
    }
    return numbers;
  }
};

// ─── Excel Import Modal ───────────────────────────────────────────────────────
function ExcelImportModal({ onClose, onSaved }) {
  const [step, setStep] = useState("groupName"); // "groupName" | "preview"
  const [groupName, setGroupName] = useState("");
  const [groupNameError, setGroupNameError] = useState("");
  const [importedRows, setImportedRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const fileInputRef = useRef(null);
  const authContext = useContext(AuthContext) || {};
  const { showNotification = () => {} } = authContext;

  // Column mapping: Excel header → internal key
  const COLUMN_MAP_RAW = {
    "Lead Receiver Name": "receiverName",
    "Lead Source*": "source",
    "Lead Source": "source",
    "SC Name": "scName",
    "Company Name": "companyName",
    "Person Name": "personName",
    "Person Number": "phoneNumber",
    Location: "location",
    "Email Address": "email",
    State: "state",
    Address: "address",
    "Person 1 Name": "person1Name",
    "Person 1 Designation": "person1Designation",
    "Person 1 Phone": "person1Phone",
    "Person 2 Name": "person2Name",
    "Person 2 Designation": "person2Designation",
    "Person 2 Phone": "person2Phone",
    "Person 3 Name": "person3Name",
    "Person 3 Designation": "person3Designation",
    "Person 3 Phone": "person3Phone",
    "Nature of Business(NOB)": "nob",
    "Nature of Business (NOB)": "nob",
    NOB: "nob",
    "Sales Type": "salesType",
    "Handle Person": "handlePerson",
    "Handle Person*": "handlePerson",
    "GST Number": "gstNumber",
    "GST No": "gstNumber",
    "Additional Notes": "additionalNotes",
    "Additional Note": "additionalNotes",
  };

  const normalizeCol = (str) =>
    String(str).toLowerCase().replace(/\*/g, "").replace(/\s+/g, " ").trim();

  const COLUMN_MAP = Object.fromEntries(
    Object.entries(COLUMN_MAP_RAW).map(([k, v]) => [normalizeCol(k), v])
  );

  const DISPLAY_COLUMNS = [
    { key: "receiverName", label: "Lead Receiver Name" },
    { key: "source", label: "Lead Source*" },
    { key: "scName", label: "SC Name" },
    { key: "companyName", label: "Company Name" },
    { key: "personName", label: "Person Name" },
    { key: "phoneNumber", label: "Person Number" },
    { key: "location", label: "Location" },
    { key: "email", label: "Email Address" },
    { key: "state", label: "State" },
    { key: "address", label: "Address" },
    { key: "person1Name", label: "Person 1 Name" },
    { key: "person1Designation", label: "Person 1 Designation" },
    { key: "person1Phone", label: "Person 1 Phone" },
    { key: "person2Name", label: "Person 2 Name" },
    { key: "person2Designation", label: "Person 2 Designation" },
    { key: "person2Phone", label: "Person 2 Phone" },
    { key: "person3Name", label: "Person 3 Name" },
    { key: "person3Designation", label: "Person 3 Designation" },
    { key: "person3Phone", label: "Person 3 Phone" },
    { key: "nob", label: "Nature of Business(NOB)" },
    { key: "salesType", label: "Sales Type" },
    { key: "gstNumber", label: "GST Number" },
    { key: "additionalNotes", label: "Additional Notes" },
    { key: "groupName", label: "Group Name" },
  ];

  const handleGroupNameNext = () => {
    if (!groupName.trim()) {
      setGroupNameError("Group Name is required");
      return;
    }
    setGroupNameError("");
    setStep("preview");
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        const mapped = rawRows.map((row) => {
          const obj = { groupName: groupName.trim() };
          Object.keys(row).forEach((rawHeader) => {
            const normHeader = normalizeCol(rawHeader);
            if (COLUMN_MAP[normHeader] !== undefined) {
              const internalKey = COLUMN_MAP[normHeader];
              if (!obj[internalKey]) {
                obj[internalKey] =
                  row[rawHeader] !== undefined && row[rawHeader] !== null
                    ? String(row[rawHeader]).trim()
                    : "";
              }
            }
          });
          return obj;
        });

        setImportedRows(mapped);
      } catch (err) {
        console.error("Excel parse error:", err);
        setSaveError("Failed to parse Excel file. Please check the format.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSave = async () => {
    if (importedRows.length === 0) {
      setSaveError("No data to save. Please upload an Excel file first.");
      return;
    }
    setIsSaving(true);
    setSaveError("");
    try {
      // Fetch TAT for Stage='Call-Tracker for Leads' (defaults to 1 hr if null/missing)
      let tatDurationMinutes = 60;
      try {
        const { data: tatData } = await supabase
          .from("lto_tat_config")
          .select("tat_duration")
          .eq("stage_name", "Call-Tracker for Leads")
          .maybeSingle();

        if (tatData && tatData.tat_duration !== null && tatData.tat_duration !== undefined) {
          tatDurationMinutes = Number(tatData.tat_duration) || 60;
        }
      } catch (tatErr) {
        console.error("Error fetching TAT config for bulk import:", tatErr);
      }

      const tatOffsetMs = tatDurationMinutes * 60000;
      const leadNumbers = await generateNextImportLeadNumbers(importedRows.length);

      const rowsToInsert = importedRows.map((row, idx) => {
        const createdAtDate = new Date();
        const plannedAtDate = new Date(createdAtDate.getTime() + tatOffsetMs);

        return {
          created_at: createdAtDate.toISOString(),
          planned_at: plannedAtDate.toISOString(),
          lead_no: leadNumbers[idx],
          lead_receiver_name: row.receiverName || "",
          lead_source: row.source || "",
          company_name: row.companyName || "",
          phone_number: row.phoneNumber || "",
          person_name: row.personName || "",
          sc_name: row.scName || row.handlePerson || "",
          location: row.location || "",
          email_address: row.email || "",
          state: row.state || "",
          address: row.address || "",
          nob: row.nob || "",
          gst_number: row.gstNumber || "",
          sales_type: row.salesType || "",
          additional_notes: row.additionalNotes || "",
          customer_registration_form: "",
          credit_access: "",
          credit_days: null,
          credit_limit: null,
          company_group_name: groupName || row.groupName || "",
        };
      });

      const { error } = await supabase.from("lto_leads").insert(rowsToInsert);
      if (error) throw error;

      showNotification(`${importedRows.length} lead(s) imported successfully!`, "success");
      onSaved(groupName);
      onClose();
    } catch (err) {
      console.error(err);
      setSaveError("An error occurred: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 bg-white rounded-2xl shadow-2xl w-full mx-4"
        style={{
          maxWidth: step === "preview" ? "95vw" : "480px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-success to-emerald-700 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Import Leads from Excel</h3>
                {step === "preview" && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Group: <span className="font-semibold text-success">{groupName}</span>
                  </p>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-0 px-6 py-3 bg-gray-50 border-b border-gray-100">
          <div className={`flex items-center gap-2 text-xs font-medium ${step === "groupName" ? "text-success" : "text-gray-400"}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === "groupName" ? "bg-success text-white" : "bg-success/10 text-success"}`}>1</span>
            Group Name
          </div>
          <div className="w-8 h-px bg-gray-200 mx-2" />
          <div className={`flex items-center gap-2 text-xs font-medium ${step === "preview" ? "text-success" : "text-gray-400"}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === "preview" ? "bg-success text-white" : "bg-gray-200 text-gray-500"}`}>2</span>
            Preview & Save
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-[180px]">
          {step === "groupName" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">Group Name *</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-success/20 focus:border-success transition-all placeholder-gray-400 text-sm font-medium"
                  placeholder="e.g. Indiamart Group 1"
                />
                {groupNameError && <p className="text-xs font-medium text-destructive">{groupNameError}</p>}
              </div>
              <p className="text-xs text-gray-500 leading-relaxed bg-warning/5 border border-warning/20 p-3 rounded-xl">
                ⚠️ Every imported row will be associated with this Group Name.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer transition-colors shadow-sm"
                  >
                    Select File
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <span className="text-xs text-gray-500 truncate max-w-[200px]" title={fileName}>
                    {fileName || "No file chosen"}
                  </span>
                </div>
              </div>

              {importedRows.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden shadow-inner bg-gray-50/50">
                  <div className="overflow-x-auto max-h-[300px]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-100/80 text-gray-600 font-semibold border-b border-gray-200">
                          <th className="px-3 py-2 text-gray-400 font-bold w-10">#</th>
                          {DISPLAY_COLUMNS.map((col) => (
                            <th key={col.key} className="px-3 py-2 font-bold whitespace-nowrap">
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importedRows.map((row, idx) => (
                          <tr
                            key={idx}
                            className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"} hover:bg-success/10 transition-colors`}
                          >
                            <td className="px-3 py-2 text-gray-400 font-medium">{idx + 1}</td>
                            {DISPLAY_COLUMNS.map((col) => (
                              <td
                                key={col.key}
                                className={`px-3 py-2 whitespace-nowrap max-w-[140px] truncate ${col.key === "groupName" ? "text-success font-semibold bg-success/10" : "text-gray-700"}`}
                                title={row[col.key] || ""}
                              >
                                {row[col.key] || <span className="text-gray-300">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {saveError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">
                  {saveError}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-100 hover:border-gray-400 transition-colors"
          >
            Cancel
          </button>
          {step === "groupName" ? (
            <button
              onClick={handleGroupNameNext}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-success to-emerald-700 hover:opacity-90 rounded-xl transition-all shadow-md hover:shadow-lg"
            >
              Next →
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep("groupName")}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-100 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || importedRows.length === 0}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-success to-emerald-700 hover:opacity-90 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? "Saving..." : `Save ${importedRows.length > 0 ? `(${importedRows.length})` : ""} Leads`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Leads Component ─────────────────────────────────────────────────────
function Leads() {
  const [searchParams] = useSearchParams();
  const initialCompanyName = searchParams.get("companyName") || "";
  const initialPhoneNumber = searchParams.get("phoneNumber") || "";
  const initialPersonName = searchParams.get("personName") || "";
  const initialLocation = searchParams.get("location") || "";
  const initialEmail = searchParams.get("email") || "";
  const initialState = searchParams.get("state") || "";
  const initialGroupName = searchParams.get("groupName") || "";
  const initialGst = searchParams.get("gstNumber") || "";
  const initialAddress = searchParams.get("billingAddress") || "";
  const initialScName = searchParams.get("scName") || "";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [formData, setFormData] = useState({
    receiverName: "",
    source: "",
    companyName: initialCompanyName,
    phoneNumber: initialPhoneNumber,
    salespersonName: initialPersonName,
    location: initialLocation,
    email: initialEmail,
    contactPersons: [{ name: initialPersonName, designation: "", number: initialPhoneNumber }],
    state: initialState,
    address: initialAddress,
    nob: "",
    salesType: "",
    gst: initialGst,
    notes: "",
    scName: initialScName,
    groupName: initialGroupName,
    customerRegistrationForm: "",
    creditAccess: "",
    creditDays: "",
    creditLimit: "",
  });

  const [receiverNames, setReceiverNames] = useState([]);
  const [leadSources, setLeadSources] = useState([]);

  // Client Master records state & Dropdown refs
  const [clientMasterRecords, setClientMasterRecords] = useState([]);
  
  const [searchGroupName, setSearchGroupName] = useState(initialGroupName);
  const [showGroupNameDropdown, setShowGroupNameDropdown] = useState(false);
  const groupDropdownRef = useRef(null);

  const [searchCompanyName, setSearchCompanyName] = useState(initialCompanyName);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const companyDropdownRef = useRef(null);

  const [nextLeadNumber, setNextLeadNumber] = useState("");
  const [creditDaysOptions, setCreditDaysOptions] = useState([]);
  const [, setCreditLimitOptions] = useState([]);
  const formAuthContext = useContext(AuthContext) || {};
  const { showNotification = () => {} } = formAuthContext;
  const [designationOptions, setDesignationOptions] = useState([]);
  const [nobOptions, setNobOptions] = useState([]);
  const [stateOptions, setStateOptions] = useState([]);
  const [salesTypeOptions, setSalesTypeOptions] = useState([]);

  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoadingData(true);
      try {
        await fetchDropdownData();
        await fetchClientMasterData();
        await generateNextLeadNumber();
      } catch (error) {
        console.error("Error during initial data fetch:", error);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchInitialData();
  }, []);

  // Click outside handlers for Dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(event.target)) {
        setShowGroupNameDropdown(false);
      }
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target)) {
        setShowCompanyDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // SC (and, for group companies, CRE) assignment for a brand-new company
  // used to be computed here via a useEffect writing to React state, gated
  // on Sales Type + NOB + company name all being filled + clientMasterRecords
  // already loaded -- if that hadn't resolved by submit time, the new
  // company/lead silently got no SC assigned, with no visible error. Now
  // computed atomically inside handleSubmit via resolveScAndCreForNewCompany
  // (src/utils/scAssignment.js), right before the lto_client_master insert
  // that actually needs the value -- see handleSubmit.

  const fetchDropdownData = async () => {
    // Helper: fetch all values for a given category from the normalized dropdown table
    const fetchCategory = (category) =>
      supabase.from("lto_dropdown").select("value").eq("category", category);

    try {
      const [
        { data: receiversData },
        { data: sourcesData },
        { data: statesData },
        { data: creditDaysData },
        { data: creditLimitsData },
        { data: designationsData },
        { data: nobsData },
        { data: salesTypesData },
      ] = await Promise.all([
        fetchCategory("lead_receiver_name"),
        fetchCategory("lead_source"),
        fetchCategory("state"),
        fetchCategory("credit_days"),
        fetchCategory("credit_limit"),
        fetchCategory("designation"),
        fetchCategory("nob"),
        fetchCategory("sales_type"),
      ]);

      const toValues = (arr) =>
        (arr || []).map(r => r.value).filter(v => v && v.trim() !== "").sort();

      setReceiverNames(toValues(receiversData));
      setLeadSources(toValues(sourcesData));
      setStateOptions(toValues(statesData));
      setCreditDaysOptions(toValues(creditDaysData));
      setCreditLimitOptions(toValues(creditLimitsData));
      setDesignationOptions(toValues(designationsData));
      setNobOptions(toValues(nobsData));
      setSalesTypeOptions(toValues(salesTypesData));

    } catch (error) {
      console.error("Error fetching dropdown values:", error);
      setReceiverNames(["John Smith", "Sarah Johnson", "Michael Brown"]);
      setLeadSources(["Indiamart", "Justdial", "Social Media", "Website", "Referral", "Other"]);
      setStateOptions(["Maharashtra", "Delhi", "Gujarat", "Karnataka", "Tamil Nadu"]);
      setDesignationOptions(["Manager", "Director", "Proprietor"]);
      setNobOptions(["Manufacturing", "Trading", "Service", "Retail"]);
    }
  };

  const fetchClientMasterData = async () => {
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
      setClientMasterRecords(relevantRecords);
    } catch (error) {
      console.error("Error fetching client_master records:", error);
    }
  };

  const generateNextLeadNumber = async () => {
    try {
      const { data, error } = await supabase
        .from("lto_leads")
        .select("lead_no")
        .not("lead_no", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error || !data || data.length === 0) {
        setNextLeadNumber("LD-001");
        return;
      }

      let maxNum = 0;
      data.forEach((row) => {
        const lastLeadNumber = row.lead_no;
        if (lastLeadNumber && lastLeadNumber.startsWith("LD-")) {
          const match = lastLeadNumber.match(/LD-(\d+)/);
          if (match) {
            const num = Number.parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      });

      if (maxNum > 0) {
        setNextLeadNumber(`LD-${String(maxNum + 1).padStart(3, "0")}`);
      } else {
        setNextLeadNumber("LD-001");
      }
    } catch (error) {
      console.error("Error fetching next lead number:", error);
      setNextLeadNumber("LD-001");
    }
  };

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [id]: value,
    }));
  };

  // Group Names extracted from client_master (where isRelevant = true).
  // Memoized -- these don't depend on the search text at all, so without
  // this they were re-derived from the full clientMasterRecords array on
  // every render, including every keystroke in the group/company search
  // boxes below (which only need to re-filter the already-deduped list).
  const availableGroupNames = useMemo(
    () =>
      Array.from(
        new Set(
          clientMasterRecords
            .map((c) => c.company_group_name)
            .filter(Boolean)
            .map((g) => g.trim())
        )
      ).sort(),
    [clientMasterRecords]
  );

  const filteredGroupNames = availableGroupNames.filter((name) =>
    name.toLowerCase().includes(searchGroupName.toLowerCase())
  );

  // Companies matching selected group from client_master (or all relevant companies if no group selected)
  const availableCompanyRecords = useMemo(
    () =>
      formData.groupName
        ? clientMasterRecords.filter(
            (c) =>
              c.company_group_name &&
              c.company_group_name.toLowerCase().trim() === formData.groupName.toLowerCase().trim()
          )
        : clientMasterRecords,
    [clientMasterRecords, formData.groupName]
  );

  const availableCompanyNames = useMemo(
    () =>
      Array.from(
        new Set(
          availableCompanyRecords
            .map((c) => c.company_name)
            .filter(Boolean)
            .map((cn) => cn.trim())
        )
      ).sort(),
    [availableCompanyRecords]
  );

  const filteredCompanyNames = availableCompanyNames.filter((name) =>
    name.toLowerCase().includes(searchCompanyName.toLowerCase())
  );

  const handleSelectGroup = (groupName) => {
    setFormData((prev) => ({ ...prev, groupName, companyName: "" }));
    setSearchGroupName(groupName);
    setSearchCompanyName("");
    setShowGroupNameDropdown(false);
  };

  const handleSelectCompany = (compName) => {
    setSearchCompanyName(compName);
    setShowCompanyDropdown(false);

    // Auto populate details from client_master if available
    const matchedRecord = availableCompanyRecords.find(
      (c) => (c.company_name || "").toLowerCase().trim() === compName.toLowerCase().trim()
    );

    setFormData((prev) => ({
      ...prev,
      companyName: compName,
      groupName: matchedRecord?.company_group_name || prev.groupName,
      salespersonName: matchedRecord?.client_name || prev.salespersonName,
      phoneNumber: matchedRecord?.client_mobile_number || prev.phoneNumber,
      state: matchedRecord?.state || prev.state,
      address: matchedRecord?.billing_address || prev.address,
      gst: matchedRecord?.gst_number || prev.gst,
      scName: matchedRecord?.sc_name || prev.scName,
      creditDays: matchedRecord?.credit_days ? String(matchedRecord.credit_days) : prev.creditDays,
      creditLimit: matchedRecord?.credit_limit ? String(matchedRecord.credit_limit) : prev.creditLimit,
    }));

    if (matchedRecord?.company_group_name) {
      setSearchGroupName(matchedRecord.company_group_name);
    }
  };

  const handleContactPersonChange = (index, field, value) => {
    const updatedContactPersons = [...formData.contactPersons];
    updatedContactPersons[index] = {
      ...updatedContactPersons[index],
      [field]: value,
    };
    setFormData({
      ...formData,
      contactPersons: updatedContactPersons,
    });
  };

  const addContactPerson = () => {
    if (formData.contactPersons.length < 3) {
      setFormData({
        ...formData,
        contactPersons: [...formData.contactPersons, { name: "", designation: "", number: "" }],
      });
    }
  };

  const removeContactPerson = (index) => {
    const updatedContactPersons = [...formData.contactPersons];
    updatedContactPersons.splice(index, 1);
    setFormData({
      ...formData,
      contactPersons: updatedContactPersons,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.groupName || !formData.groupName.trim()) {
      alert("Group Name is required.");
      return;
    }
    setIsSubmitting(true);

    try {
      // 1. Check if company exists in client_master. If it's brand new,
      //    resolve SC (and, for group companies, CRE) BEFORE inserting, so
      //    the assignment lands in the SAME atomic insert -- see
      //    src/utils/scAssignment.js for the group-copy vs round-robin rule.
      let assignedScName = formData.scName ? formData.scName.trim() : null;
      let assignedCrmName = null;
      const compNameTrimmed = (formData.companyName || "").trim();
      if (compNameTrimmed) {
        const { data: existingClient, error: clientCheckErr } = await supabase
          .from("lto_client_master")
          .select("uuid, company_name")
          .ilike("company_name", compNameTrimmed)
          .maybeSingle();

        if (!clientCheckErr && !existingClient) {
          const resolved = await resolveScAndCreForNewCompany({
            groupName: formData.groupName,
            salesType: formData.salesType,
            leadSource: formData.source,
            nob: formData.nob,
          });
          assignedScName = resolved.scName || assignedScName;
          assignedCrmName = resolved.crmName;

          // Insert new row into client_master
          const newClientPayload = {
            company_name: compNameTrimmed,
            company_group_name: formData.groupName ? formData.groupName.trim() : null,
            client_name: formData.salespersonName ? formData.salespersonName.trim() : null,
            client_mobile_number: formData.phoneNumber ? formData.phoneNumber.trim() : null,
            state: formData.state ? formData.state.trim() : null,
            state_code: getStateCodeFromName(formData.state),
            billing_address: formData.address ? formData.address.trim() : null,
            gst_number: formData.gst ? formData.gst.trim() : null,
            sc_name: assignedScName,
            crm_name: assignedCrmName,
            credit_days: formData.creditDays ? parseInt(formData.creditDays, 10) : null,
            credit_limit: formData.creditLimit ? parseFloat(formData.creditLimit) : null,
            sales_type: formData.salesType ? formData.salesType.trim() : null,
            "isRelevant": true
          };

          const { error: cmInsertErr } = await supabase
            .from("lto_client_master")
            .insert([newClientPayload]);

          if (cmInsertErr) {
            console.error("Error inserting into client_master:", cmInsertErr);
          }
        }
      }

      // Fetch TAT for Stage='Call-Tracker for Leads' (defaults to 1 hr if null/missing)
      let tatDurationMinutes = 60;
      try {
        const { data: tatData } = await supabase
          .from("lto_tat_config")
          .select("tat_duration")
          .eq("stage_name", "Call-Tracker for Leads")
          .maybeSingle();

        if (tatData && tatData.tat_duration !== null && tatData.tat_duration !== undefined) {
          tatDurationMinutes = Number(tatData.tat_duration) || 60;
        }
      } catch (tatErr) {
        console.error("Error fetching TAT config:", tatErr);
      }

      const createdAtDate = new Date();
      const plannedAtDate = new Date(
        createdAtDate.getTime() + (tatDurationMinutes * 60000)
      );

      // 2. Fetch freshest lead number right before insert to prevent duplicate key error
      const freshNumbers = await generateNextImportLeadNumbers(1);
      const authoritiveLeadNo = freshNumbers && freshNumbers.length > 0 ? freshNumbers[0] : nextLeadNumber;

      const leadData = {
        created_at: createdAtDate.toISOString(),
        planned_at: plannedAtDate.toISOString(),
        lead_no: authoritiveLeadNo,
        lead_receiver_name: formData.receiverName || "",
        lead_source: formData.source || "",
        company_name: formData.companyName || "",
        phone_number: formData.phoneNumber || "",
        person_name: formData.salespersonName || "",
        sc_name: assignedScName || "",
        location: formData.location || "",
        email_address: formData.email || "",
        state: formData.state || "",
        address: formData.address || "",
        nob: formData.nob || "",
        gst_number: formData.gst || "",
        sales_type: formData.salesType || "",
        additional_notes: formData.notes || "",
        customer_registration_form: formData.customerRegistrationForm || "",
        credit_access: formData.creditAccess || "",
        credit_days: formData.creditDays ? parseInt(formData.creditDays, 10) : null,
        credit_limit: formData.creditLimit ? parseFloat(formData.creditLimit) : null,
        company_group_name: formData.groupName || "",
      };

      const { data: insertedLead, error } = await supabase
        .from("lto_leads")
        .insert([leadData])
        .select("id")
        .single();
      if (error) throw error;

      // Contact persons were being collected in the form but never actually
      // persisted -- lto_lead_contacts had no insert path at all. Only
      // rows with a name filled in are worth saving.
      const contactRows = (formData.contactPersons || [])
        .filter((person) => person.name && person.name.trim())
        .map((person) => ({
          lead_id: insertedLead.id,
          person_name: person.name.trim(),
          designation: person.designation ? person.designation.trim() : null,
          phone_number: person.number ? person.number.trim() : null,
        }));

      if (contactRows.length > 0) {
        const { error: contactsError } = await supabase
          .from("lto_lead_contacts")
          .insert(contactRows);

        if (contactsError) {
          console.error("Error inserting lead contacts:", contactsError);
        }
      }

      if (compNameTrimmed) {
        await supabase
          .from("lto_client_master")
          .update({ already_in_tracker: `Call-Tracker (${authoritiveLeadNo})` })
          .ilike("company_name", compNameTrimmed);
      }

      // SC/CRE round-robin rotation for brand-new companies already happened
      // atomically in step 1, inside resolveScAndCreForNewCompany -- no
      // separate post-hoc rotation step needed here anymore.

      showNotification(`Lead created successfully! Lead No: ${authoritiveLeadNo}`, "success");
      alert(`Lead created successfully!\nLead No: ${authoritiveLeadNo}`);
      setFormData({
        receiverName: "",
        source: "",
        companyName: "",
        phoneNumber: "",
        salespersonName: "",
        location: "",
        email: "",
        contactPersons: [{ name: "", designation: "", number: "" }],
        state: "",
        address: "",
        customerRegistrationForm: "",
        creditAccess: "",
        creditDays: "",
        creditLimit: "",
        nob: "",
        salesType: "",
        gst: "",
        notes: "",
        scName: "",
        groupName: "",
      });
      setSearchGroupName("");
      setSearchCompanyName("");

      await fetchClientMasterData();
      await generateNextLeadNumber();
    } catch (error) {
      console.error("Error submitting lead:", error);
      showNotification("Error creating lead: " + error.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-slate-600 animate-pulse">Loading dropdowns and form data...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-1 px-2">
      {showImportModal && (
        <ExcelImportModal
          onClose={() => setShowImportModal(false)}
          onSaved={(gName) => {
            if (gName) {
              setFormData((prev) => ({ ...prev, groupName: gName }));
              setSearchGroupName(gName);
            }
          }}
        />
      )}

      <div className="max-w-5xl mx-auto bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-800">New Lead</h2>
            <p className="text-[11px] text-slate-500">Fill in the lead information below</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                const wb = XLSX.utils.book_new();
                const HEADERS = [
                  "Lead Receiver Name",
                  "Lead Source*",
                  "SC Name",
                  "Company Name",
                  "Person Name",
                  "Person Number",
                  "Location",
                  "Email Address",
                  "State",
                  "Address",
                  "Person 1 Name",
                  "Person 1 Designation",
                  "Person 1 Phone",
                  "Person 2 Name",
                  "Person 2 Designation",
                  "Person 2 Phone",
                  "Person 3 Name",
                  "Person 3 Designation",
                  "Person 3 Phone",
                  "Nature of Business(NOB)",
                  "Sales Type",
                  "GST Number",
                  "Additional Notes",
                ];
                const ws = XLSX.utils.aoa_to_sheet([HEADERS]);
                ws["!cols"] = HEADERS.map(() => ({ wch: 24 }));
                XLSX.utils.book_append_sheet(wb, ws, "Lead Import Template");
                XLSX.writeFile(wb, "Lead_Import_Template.xlsx");
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-success bg-white border border-success/40 hover:bg-success/5 rounded-md transition-all shadow-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Template
            </button>
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-white bg-gradient-to-r from-success to-emerald-700 hover:opacity-90 rounded-md shadow-xs transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              Import Excel
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-2 space-y-2.5">
            
            {/* Row 1: 2 Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="receiverName" className="block text-xs font-semibold text-gray-700">
                  Lead Receiver Name <span className="text-destructive">*</span>
                </label>
                <select
                  id="receiverName"
                  value={formData.receiverName}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                  required
                >
                  <option value="">Select receiver</option>
                  {receiverNames.map((name, index) => (
                    <option key={index} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="source" className="block text-xs font-semibold text-gray-700">
                  Lead Source <span className="text-destructive">*</span>
                </label>
                <select
                  id="source"
                  value={formData.source}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
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
            </div>

            {/* Row 2: Group Name, Company Name, Person Number */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Group Name (Input search dropdown - select from client_master existing relevant groups) */}
              <div className="space-y-1 relative" ref={groupDropdownRef}>
                <label htmlFor="groupName" className="block text-xs font-semibold text-gray-700">
                  Group Name <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="groupName"
                    value={searchGroupName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchGroupName(val);
                      if (!val) {
                        setFormData((prev) => ({ ...prev, groupName: "" }));
                      }
                      setShowGroupNameDropdown(true);
                    }}
                    onFocus={() => setShowGroupNameDropdown(true)}
                    onBlur={() => {
                      setTimeout(() => {
                        if (searchGroupName !== formData.groupName) {
                          setSearchGroupName(formData.groupName || "");
                        }
                      }, 200);
                    }}
                    className="w-full px-3 py-1.5 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                    placeholder="Search or select Group"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {showGroupNameDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                    {filteredGroupNames.length > 0 ? (
                      filteredGroupNames.map((name, index) => (
                        <div
                          key={index}
                          className={`px-3 py-2 cursor-pointer hover:bg-primary/5 text-sm transition-colors border-b border-gray-50 last:border-0 ${
                            formData.groupName === name ? 'bg-primary/5 text-primary font-medium' : 'text-gray-700'
                          }`}
                          onMouseDown={(e) => { e.preventDefault(); handleSelectGroup(name); }}
                        >
                          {name}
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-gray-400 italic">No matching relevant group found</div>
                    )}
                  </div>
                )}
              </div>

              {/* Company Name (Options matching selected group, allow entering new company) */}
              <div className="space-y-1 relative" ref={companyDropdownRef}>
                <label htmlFor="companyName" className="block text-xs font-semibold text-gray-700">
                  Company Name <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="companyName"
                    value={searchCompanyName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchCompanyName(val);
                      setFormData((prev) => ({ ...prev, companyName: val }));
                      setShowCompanyDropdown(true);
                    }}
                    onFocus={() => setShowCompanyDropdown(true)}
                    className="w-full px-3 py-1.5 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                    placeholder="Enter or select Company Name"
                    required
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {showCompanyDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                    {filteredCompanyNames.length > 0 ? (
                      filteredCompanyNames.map((company, index) => (
                        <div
                          key={index}
                          className={`px-3 py-2 cursor-pointer hover:bg-primary/5 text-sm transition-colors border-b border-gray-50 last:border-0 ${
                            formData.companyName === company ? 'bg-primary/5 text-primary font-medium' : 'text-gray-700'
                          }`}
                          onMouseDown={(e) => { e.preventDefault(); handleSelectCompany(company); }}
                        >
                          {company}
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-warning-foreground font-medium bg-warning/5">
                        No company found for group. Type new company to add.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="phoneNumber" className="block text-xs font-semibold text-gray-700">
                  Person Number <span className="text-destructive">*</span>
                </label>
                <input
                  id="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                  placeholder="Enter phone number"
                  required
                />
              </div>

            </div>

            {/* Row 3: 3 Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label htmlFor="salespersonName" className="block text-xs font-semibold text-gray-700">
                  Person Name <span className="text-destructive">*</span>
                </label>
                <input
                  id="salespersonName"
                  value={formData.salespersonName}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                  placeholder="Enter person name"
                  required
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="location" className="block text-xs font-semibold text-gray-700">
                  Location
                </label>
                <input
                  id="location"
                  value={formData.location}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                  placeholder="Enter location"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="email" className="block text-xs font-semibold text-gray-700">
                  Email Address <span className="text-xs text-gray-400">(Optional)</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                  placeholder="Enter email address"
                />
              </div>
            </div>

            {/* Row 4: 3 Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label htmlFor="state" className="block text-xs font-semibold text-gray-700">
                  State
                </label>
                <select
                  id="state"
                  value={formData.state}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                >
                  <option value="">Select state</option>
                  {stateOptions.map((state, index) => (
                    <option key={index} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="gst" className="block text-xs font-semibold text-gray-700">
                  GST Number
                </label>
                <input
                  id="gst"
                  value={formData.gst}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                  placeholder="GST number"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="salesType" className="block text-xs font-semibold text-gray-700">
                  Sales Type <span className="text-destructive">*</span>
                </label>
                <select
                  id="salesType"
                  value={formData.salesType}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                  required
                >
                  <option value="">Select sales type</option>
                  {salesTypeOptions.map((option, index) => (
                    <option key={index} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 5: 3 Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label htmlFor="nob" className="block text-xs font-semibold text-gray-700">
                  Nature of Business (NOB) <span className="text-destructive">*</span>
                </label>
                <select
                  id="nob"
                  value={formData.nob}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                  required
                >
                  <option value="">Select nature of business</option>
                  {nobOptions.map((option, index) => (
                    <option key={index} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="creditDays" className="block text-xs font-semibold text-gray-700">
                  Credit Days
                </label>
                <select
                  id="creditDays"
                  value={formData.creditDays}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                >
                  <option value="">Select credit days</option>
                  {creditDaysOptions.map((option, index) => (
                    <option key={index} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="creditLimit" className="block text-xs font-semibold text-gray-700">
                  Credit Limit
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  id="creditLimit"
                  value={formData.creditLimit}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d+$/.test(val)) {
                      handleChange({ target: { id: "creditLimit", value: val } });
                    }
                  }}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-sm"
                  placeholder="Enter whole number"
                />
              </div>
            </div>

            {/* Row 6: Address & Additional Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="address" className="block text-xs font-semibold text-gray-700">
                  Address
                </label>
                <textarea
                  id="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white resize-none text-sm"
                  placeholder="Enter complete address"
                  rows="2"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="notes" className="block text-xs font-semibold text-gray-700">
                  Additional Notes
                </label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white resize-none text-sm"
                  placeholder="Enter any additional information"
                  rows="2"
                />
              </div>
            </div>

            {/* Contact Person Details Section */}
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                <h3 className="text-sm font-semibold text-slate-800">Contact Person Details</h3>
                {formData.contactPersons.length < 3 && (
                  <button
                    type="button"
                    onClick={addContactPerson}
                    className="px-2.5 py-1 bg-primary text-white rounded-md text-xs font-semibold hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                  >
                    Add Person
                  </button>
                )}
              </div>

              {formData.contactPersons.map((person, index) => (
                <div key={index} className="border border-slate-100 rounded-lg p-3 bg-slate-50/50">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-semibold text-slate-700">Person {index + 1}</h4>
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => removeContactPerson(index)}
                        className="text-destructive hover:text-destructive text-xs font-semibold"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-gray-500">Name</label>
                      <input
                        value={person.name}
                        onChange={(e) => handleContactPersonChange(index, "name", e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                        placeholder="Contact name"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-gray-500">Designation</label>
                      <select
                        value={person.designation}
                        onChange={(e) => handleContactPersonChange(index, "designation", e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                      >
                        <option value="">Select designation</option>
                        {designationOptions.map((designation, idx) => (
                          <option key={idx} value={designation}>
                            {designation}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-gray-500">Phone Number</label>
                      <input
                        value={person.number}
                        onChange={(e) => handleContactPersonChange(index, "number", e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                        placeholder="Contact number"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
          <div className="p-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 brand-gradient hover:opacity-90 text-white font-bold text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all shadow hover:shadow-md"
            >
              {isSubmitting ? "Saving..." : "Save Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Leads;
