"use client"

import { useEffect, useState } from "react"
import supabase from "../../utils/supabase"

// public.lto_bank_details holds exactly one static row -- the company's
// bank details never vary per quotation, so this is the single source of
// truth for these fields. They're read-only here (not user-editable) and
// pushed into quotationData (via handleInputChange) purely so the preview
// and PDF generator, which also read quotationData.accountNo/bankName/etc,
// stay in sync.
const BankDetails = ({ quotationData, handleInputChange, imageform }) => {
  const [bankDetails, setBankDetails] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchBankDetails = async () => {
      try {
        const { data, error } = await supabase
          .from("lto_bank_details")
          .select("*")
          .limit(1)
          .maybeSingle()

        if (error) throw error
        setBankDetails(data || null)
      } catch (err) {
        console.error("Error fetching bank details:", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchBankDetails()
  }, [])

  // Re-apply the static values into quotationData whenever they're fetched,
  // and again whenever a different saved quotation gets loaded (detected via
  // quotationNo changing) -- so switching quotations can never leave stale
  // account/bank values behind from that quotation's own saved record.
  useEffect(() => {
    if (!bankDetails) return
    handleInputChange("accountNo", bankDetails.account_no || "")
    handleInputChange("bankName", bankDetails.bank_name || "")
    handleInputChange("bankAddress", bankDetails.bank_address || "")
    handleInputChange("ifscCode", bankDetails.ifsc_code || "")
    handleInputChange("email", bankDetails.email || "")
    handleInputChange("website", bankDetails.website || "")
    handleInputChange("pan", bankDetails.pan || "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankDetails, quotationData.quotationNo])

  const fields = {
    accountNo: bankDetails?.account_no || "",
    bankName: bankDetails?.bank_name || "",
    bankAddress: bankDetails?.bank_address || "",
    ifscCode: bankDetails?.ifsc_code || "",
    email: bankDetails?.email || "",
    website: bankDetails?.website || "",
    pan: bankDetails?.pan || "",
  }

  const readOnlyClass =
    "w-full p-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700 cursor-not-allowed"

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <h3 className="text-2xl font-medium mb-6 text-center">Bank Details</h3>
      <h2 className="text-lg text-primary font-medium mb-4 text-center">DIVINE EMPIRE INDIA PVT LTD.</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="flex items-center justify-center p-6 rounded-lg border border-gray-200">
          <img
            src={imageform || "/placeholder.svg?height=200&width=300"}
            alt="ManiQuip Logo"
            className="max-h-100 w-auto object-contain"
          />
        </div>

        <div className="md:hidden w-full border-t border-gray-200 my-4"></div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          {isLoading ? (
            <p className="text-sm text-gray-500 text-center">Loading bank details...</p>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Account No.</label>
                <input type="text" value={fields.accountNo} readOnly className={readOnlyClass} />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Bank Name</label>
                <input type="text" value={fields.bankName} readOnly className={readOnlyClass} />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Bank Address</label>
                <input type="text" value={fields.bankAddress} readOnly className={readOnlyClass} />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">IFSC Code</label>
                <input type="text" value={fields.ifscCode} readOnly className={readOnlyClass} />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input type="text" value={fields.email} readOnly className={readOnlyClass} />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Website</label>
                <input type="text" value={fields.website} readOnly className={readOnlyClass} />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">PAN</label>
                <input type="text" value={fields.pan} readOnly className={readOnlyClass} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BankDetails
