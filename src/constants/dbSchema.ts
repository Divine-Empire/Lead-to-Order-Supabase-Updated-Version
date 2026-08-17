/**
 * Centralized Supabase Database Schema & Column Mapping Registry
 * Updated to reflect the normalized schema structure.
 */

export const TABLES = {
  // New Normalized Tables
  LEADS: 'lto_leads',
  LEAD_CONTACTS: 'lto_lead_contacts',
  LEAD_ITEMS: 'lto_lead_items',
  CALL_TRACKER_LEADS: 'lto_call_tracker_for_leads',
  ENQUIRY_TRACKER_LEADS: 'lto_enquiry_tracker_for_leads',

  ENQUIRIES: 'lto_enquiries',
  ENQUIRY_ITEMS: 'lto_enquiry_items',
  ENQUIRY_TRACKER: 'lto_enquiry_tracker',

  MAKE_QUOTATIONS: 'lto_make_quotations',
  CONSIGNOR_DETAILS: 'lto_consignor_details',
  TAT_CONFIG: 'lto_tat_config',

  CLIENT_MASTER: 'lto_client_master',
  SC_MANAGEMENT: 'SC_management',
  SC_DISTRIBUTION: 'lto_sc_distribution',
  CRM_DISTRIBUTION: 'lto_crm_distribution',
  DROPDOWN: 'lto_dropdown',
  ITEMS: 'lto_items',
  LOGIN: 'login',

  // Legacy Alias (For Backward Compatibility)
  LEADS_TO_ORDER: 'lto_leads',
  ENQUIRY_TO_ORDER: 'lto_enquiries',
  LEADS_TRACKER: 'lto_call_tracker_for_leads',
  MAKE_QUOTATION: 'lto_make_quotations',
} as const;

export const COLUMNS = {
  [TABLES.LEADS]: {
    ID: 'id',
    LEAD_NO: 'lead_no',
    RECEIVER_NAME: 'lead_receiver_name',
    SOURCE: 'lead_source',
    COMPANY_NAME: 'company_name',
    PHONE_NUMBER: 'phone_number',
    SALESPERSON_NAME: 'salesperson_name',
    LOCATION: 'location',
    EMAIL: 'email_address',
    STATE: 'state',
    ADDRESS: 'address',
    NOB: 'nob',
    GST_NUMBER: 'gst_number',
    CUSTOMER_REGISTRATION_FORM: 'customer_registration_form',
    CREDIT_ACCESS: 'credit_access',
    CREDIT_DAYS: 'credit_days',
    CREDIT_LIMIT: 'credit_limit',
    ADDITIONAL_NOTES: 'additional_notes',
    SALES_TYPE: 'sales_type',
    HANDLE_PERSON: 'sc_name',
    PERSON_NAME: 'person_name',
    SC_NAME: 'sc_name',
    CRM_NAME: 'crm_name',
    COMPANY_GROUP_NAME: 'company_group_name',
    APPROVED_BY: 'approved_by',
    LEAD_STATUS: 'lead_status',
    CREATED_AT: 'created_at',
    PLANNED_AT: 'planned_at',
  },

  [TABLES.ENQUIRIES]: {
    ID: 'id',
    ENQUIRY_NO: 'enquiry_no',
    ENQUIRY_DATE: 'enquiry_date',
    LEAD_SOURCE: 'lead_source',
    COMPANY_NAME: 'company_name',
    PHONE_NUMBER: 'phone_number',
    EMAIL: 'email',
    LOCATION: 'location',
    SHIPPING_ADDRESS: 'shipping_address',
    GST_NUMBER: 'gst_number',
    ENQUIRY_RECEIVER_NAME: 'enquiry_receiver_name',
    ENQUIRY_ASSIGN_TO_PERSON: 'enquiry_assign_to_person',
    SALES_PERSON_NAME: 'sales_person_name',
    SALES_COORDINATOR_NAME: 'sales_coordinator_name',
    CRM_NAME: 'crm_name',
    ENQUIRY_FOR_STATE: 'enquiry_for_state',
    NOB: 'nob',
    SALES_TYPE: 'sales_type',
    ENQUIRY_APPROACH: 'enquiry_approach',
    ENQUIRY_STATUS: 'enquiry_status',
    APPROVED_BY: 'approved_by',
    CREATED_AT: 'created_at',
    PLANNED_AT: 'planned_at',
  },

  [TABLES.MAKE_QUOTATIONS]: {
    ID: 'id',
    QUOTATION_NO: 'quotation_no',
    QUOTATION_DATE: 'quotation_date',
    PREPARED_BY: 'prepared_by',
    CONSIGNOR_ID: 'consignor_id',
    CONSIGNEE_CLIENT_ID: 'consignee_client_id',
    SHIP_TO_ADDRESS: 'ship_to_address',
    CONSIGNEE_CONTACT_NAME: 'consignee_contact_name',
    CONSIGNEE_CONTACT_NO: 'consignee_contact_no',
    VALIDITY: 'validity',
    PAYMENT_TERMS: 'payment_terms',
    DELIVERY: 'delivery',
    FREIGHT: 'freight',
    INSURANCE: 'insurance',
    TAXES: 'taxes',
    NOTES: 'notes',
    ACCOUNT_NO: 'account_no',
    BANK_NAME: 'bank_name',
    BANK_ADDRESS: 'bank_address',
    IFSC_CODE: 'ifsc_code',
    ITEMS: 'items',
    SPECIAL_OFFER: 'special_offer',
    PDF_URL: 'pdf_url',
    GRAND_TOTAL: 'grand_total',
    CREATED_AT: 'created_at',
    UPDATED_AT: 'updated_at',
  },

  [TABLES.CLIENT_MASTER]: {
    UUID: 'uuid',
    CREATED_AT: 'created_at',
    COMPANY_NAME: 'company_name',
    CLIENT_NAME: 'client_name',
    CLIENT_MOBILE_NUMBER: 'client_mobile_number',
    STATE: 'state',
    BILLING_ADDRESS: 'billing_address',
    GST_NUMBER: 'gst_number',
    COMPANY_GROUP_NAME: 'company_group_name',
    SC_NAME: 'sc_name',
    CRM_NAME: 'crm_name',
    STATE_CODE: 'state_code',
    CREDIT_DAYS: 'credit_days',
    CREDIT_LIMIT: 'credit_limit',
    UPDATED_AT: 'updated_at',
    CLIENT_CODE: 'client_code',
    IS_RELEVANT: 'isRelevant',
    SALES_TYPE: 'sales_type',
  },

  [TABLES.SC_DISTRIBUTION]: {
    ID: 'id',
    SC_NAME: 'sc_name',
    RULE_GROUP: 'rule_group',
    SALES_TYPES: 'sales_types',
    LEAD_SOURCES: 'lead_sources',
    NOBS: 'nobs',
    IS_ACTIVE: 'is_active',
    IS_NEXT_IN_LINE: 'is_next_in_line',
    SEQUENCE_ORDER: 'sequence_order',
    CREATED_AT: 'created_at',
    UPDATED_AT: 'updated_at',
  },
} as const;

/**
 * Helper mapper: Converts DB row from `leads` to frontend object
 */
export function mapLeadRowFromDB(row: Record<string, any>) {
  if (!row) return null;
  return {
    id: row.id,
    timestamp: row.created_at,
    leadNumber: row.lead_no || row['LD-Lead-No'],
    receiverName: row.lead_receiver_name || row['Lead_Receiver_Name'],
    source: row.lead_source || row['Lead_Source'],
    companyName: row.company_name || row['Company_Name'],
    phoneNumber: row.phone_number || row['Phone_Number'],
    salespersonName: row.salesperson_name || row['Salesperson_Name'],
    location: row.location || row['Location'],
    email: row.email_address || row['Email_Address'],
    state: row.state || row['State'],
    address: row.address || row['Address'],
    nob: row.nob || row['NOB'],
    gstNumber: row.gst_number || row['GST_Number'],
    additionalNotes: row.additional_notes || row['Additional_Notes'],
    status: row.lead_status || row['Status'] || 'New Lead',
    salesType: row.sales_type || row['Sales_Type'],
    handlePerson: row.handle_person,
    approvedBy: row.approved_by,
    plannedAt: row.planned_at,
    contacts: row.lead_contacts || [],
    items: row.lead_items || [],
  };
}

/**
 * Helper mapper: Converts frontend Lead object to `leads` DB row
 */
export function mapLeadToDBRow(lead: Record<string, any>) {
  return {
    lead_no: lead.leadNumber,
    lead_receiver_name: lead.receiverName || '',
    lead_source: lead.source || '',
    company_name: lead.companyName || '',
    phone_number: lead.phoneNumber || '',
    salesperson_name: lead.salespersonName || '',
    location: lead.location || '',
    email_address: lead.email || '',
    state: lead.state || '',
    address: lead.address || '',
    nob: lead.nob || '',
    gst_number: lead.gstNumber || '',
    additional_notes: lead.additionalNotes || '',
    lead_status: lead.status || 'New Lead',
    sales_type: lead.salesType || '',
    handle_person: lead.handlePerson || '',
    approved_by: lead.approvedBy || '',
  };
}
