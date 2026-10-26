"use client"

const QuotationHeader = ({ image, isRevising, toggleRevising }) => {
  return (
    <div className="flex justify-between items-center mb-6">
      <img src={image || "/placeholder.svg?height=80&width=100"} alt="Logo" className="h-20 w-25 mr-3" />
      <h1 className="text-5xl font-bold brand-gradient-text flex items-center">
        DIVINE EMPIRE INDIA PVT. LTD.
        <span className="ml-3 rounded-md border border-[#FCD34D] bg-[#FFFBEB] px-2 py-0.5 align-middle text-xs font-semibold text-[#92400E]">BETA</span>
      </h1>
      <button
        className={`px-4 py-2 rounded-md ${isRevising ? "bg-destructive hover:opacity-90" : "bg-primary hover:opacity-90"} text-white`}
        onClick={toggleRevising}
      >
        {isRevising ? "Cancel Revise" : "Revise"}
      </button>
    </div>
  )
}

export default QuotationHeader
