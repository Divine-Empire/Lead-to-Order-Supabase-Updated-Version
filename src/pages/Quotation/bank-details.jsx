"use client"

const BankDetails = ({ quotationData, handleInputChange, imageform }) => {
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
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Account No.</label>
              <input
                type="text"
                value={quotationData.accountNo}
                onChange={(e) => handleInputChange("accountNo", e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Bank Name</label>
              <input
                type="text"
                value={quotationData.bankName}
                onChange={(e) => handleInputChange("bankName", e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Bank Address</label>
              <input
                type="text"
                value={quotationData.bankAddress}
                onChange={(e) => handleInputChange("bankAddress", e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">IFSC Code</label>
              <input
                type="text"
                value={quotationData.ifscCode}
                onChange={(e) => handleInputChange("ifscCode", e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="text"
                value={quotationData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Website</label>
              <input
                type="text"
                value={quotationData.website}
                onChange={(e) => handleInputChange("website", e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">PAN</label>
              <input
                type="text"
                value={quotationData.pan}
                onChange={(e) => handleInputChange("pan", e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md ring-primary focus:border-primary"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BankDetails
