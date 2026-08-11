import { useState, useEffect } from "react"
import supabase from "../../utils/supabase";

function OrderExpectedForm({ formData, onFieldChange }) {
  const [followupStatusOptions, setFollowupStatusOptions] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  
  // Fetch dropdown options from DROPDOWN sheet column 81
  useEffect(() => {
    const fetchFollowupStatusOptions = async () => {
      try {
        setIsLoading(true);
        // Fetch from normalized dropdown table using category/value schema
        const { data, error } = await supabase
          .from("lto_dropdown")
          .select("value")
          .eq("category", "followup_status");

        if (error) throw error;

        setFollowupStatusOptions((data || []).map(row => row.value).filter(Boolean));
      } catch (error) {
        console.error("Error fetching followup status options:", error);
        setFollowupStatusOptions(["Pending", "In Progress", "Completed", "Cancelled"]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFollowupStatusOptions();
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    onFieldChange(name, value)
  }

  return (
    <div className="space-y-4 border p-4 rounded-md">
      <h3 className="text-lg font-medium">Order Expected</h3>
      <hr className="border-gray-200 mb-4" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label htmlFor="followupStatus" className="block text-sm font-medium text-gray-700">
            Followup Status
           <span className="text-destructive">*</span></label>
          <select
            id="followupStatus"
            name="followupStatus"
            value={formData.followupStatus || ""}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            required
            disabled={isLoading}
          >
            <option value="">
              {isLoading ? "Loading..." : "Select followup status"}
            </option>
            {followupStatusOptions.map((option, index) => (
              <option key={index} value={option}>{option}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="nextCallDate" className="block text-sm font-medium text-gray-700">
            Next Call Date
           <span className="text-destructive">*</span></label>
          <input
            id="nextCallDate"
            name="nextCallDate"
            type="date"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            value={formData.nextCallDate || ""}
            onChange={handleChange}
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="nextCallTime" className="block text-sm font-medium text-gray-700">
            Next Call Time
           <span className="text-destructive">*</span></label>
          <input
            id="nextCallTime"
            name="nextCallTime"
            type="time"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            value={formData.nextCallTime || ""}
            onChange={handleChange}
            required
          />
        </div>
      </div>
    </div>
  )
}

export default OrderExpectedForm