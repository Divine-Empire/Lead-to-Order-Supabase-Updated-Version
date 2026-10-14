import { useState, useEffect } from "react"
import supabase from "../../utils/supabase"
import LoadingSpinner from "../LoadingSpinner"

const ACTIVITY_LIMIT = 6
// Pull a few more than ACTIVITY_LIMIT from each source table so that after
// merging and sorting by real time, the most recent N across all four
// sources are actually represented (not just "the 6 newest leads").
const PER_SOURCE_LIMIT = 8

function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  return new Date(isoString).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function getBadgeColor(type) {
  switch (type) {
    case "Lead":
      return "bg-info/10 text-info"
    case "Follow-up":
      return "bg-warning/15 text-warning-foreground"
    case "Quotation":
      return "bg-primary/10 text-primary"
    case "Order":
      return "bg-success/15 text-success"
    default:
      return "bg-slate-100 text-slate-800"
  }
}

function RecentActivities() {
  const [activities, setActivities] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const [leadsRes, followUpsRes, quotationsRes, ordersRes] = await Promise.all([
          supabase
            .from("lto_leads")
            .select("id, lead_no, company_name, sc_name, created_at")
            .order("created_at", { ascending: false })
            .limit(PER_SOURCE_LIMIT),
          supabase
            .from("lto_call_tracker_for_leads")
            .select("id, lead_id, sc_name, created_at")
            .order("created_at", { ascending: false })
            .limit(PER_SOURCE_LIMIT),
          supabase
            .from("lto_make_quotations")
            .select("id, quotation_no, enquiry_reference_no, prepared_by, created_at")
            .order("created_at", { ascending: false })
            .limit(PER_SOURCE_LIMIT),
          supabase
            .from("lto_enquiry_tracker")
            .select("id, enquiry_id, approved_by, created_at")
            .eq("is_order_received_status", "yes")
            .order("created_at", { ascending: false })
            .limit(PER_SOURCE_LIMIT),
        ])

        const firstError = leadsRes.error || followUpsRes.error || quotationsRes.error || ordersRes.error
        if (firstError) throw firstError

        // Follow-ups and order rows only carry a foreign key -- a second,
        // narrow lookup fills in the company name each needs to display.
        const leadIds = [...new Set((followUpsRes.data || []).map((r) => r.lead_id).filter(Boolean))]
        const enquiryIds = [...new Set((ordersRes.data || []).map((r) => r.enquiry_id).filter(Boolean))]

        const [leadLookupRes, enquiryLookupRes] = await Promise.all([
          leadIds.length > 0
            ? supabase.from("lto_leads").select("id, lead_no, company_name").in("id", leadIds)
            : Promise.resolve({ data: [] }),
          enquiryIds.length > 0
            ? supabase.from("lto_enquiries").select("id, enquiry_no, company_name").in("id", enquiryIds)
            : Promise.resolve({ data: [] }),
        ])
        const leadById = new Map((leadLookupRes.data || []).map((l) => [l.id, l]))
        const enquiryById = new Map((enquiryLookupRes.data || []).map((e) => [e.id, e]))

        const merged = [
          ...(leadsRes.data || []).map((row) => ({
            key: `lead-${row.id}`,
            user: row.sc_name || "—",
            action: "Created a new lead",
            type: "Lead",
            detail: `${row.company_name || "Unknown company"} (${row.lead_no || "—"})`,
            created_at: row.created_at,
          })),
          ...(followUpsRes.data || []).map((row) => {
            const lead = leadById.get(row.lead_id)
            return {
              key: `followup-${row.id}`,
              user: row.sc_name || "—",
              action: "Logged a follow-up call",
              type: "Follow-up",
              detail: `${lead?.company_name || "Unknown company"} (${lead?.lead_no || "—"})`,
              created_at: row.created_at,
            }
          }),
          ...(quotationsRes.data || []).map((row) => ({
            key: `quotation-${row.id}`,
            user: row.prepared_by || "—",
            action: "Sent a quotation",
            type: "Quotation",
            detail: `${row.quotation_no} for ${row.enquiry_reference_no || "—"}`,
            created_at: row.created_at,
          })),
          ...(ordersRes.data || []).map((row) => {
            const enquiry = enquiryById.get(row.enquiry_id)
            return {
              key: `order-${row.id}`,
              user: row.approved_by || "—",
              action: "Received an order",
              type: "Order",
              detail: `${enquiry?.company_name || "Unknown company"} (${enquiry?.enquiry_no || "—"})`,
              created_at: row.created_at,
            }
          }),
        ]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, ACTIVITY_LIMIT)

        if (!cancelled) setActivities(merged)
      } catch (err) {
        if (cancelled) return
        console.error("Error fetching recent activities:", err)
        setError(err.message || "Failed to load recent activity.")
        setActivities([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [])

  return (
    <div>
      <h3 className="text-xl font-bold mb-4">Recent Activities</h3>

      {isLoading ? (
        <LoadingSpinner message="Loading recent activity..." minHeight="200px" />
      ) : error ? (
        <div role="alert" className="flex flex-col items-center justify-center gap-1 py-8 text-center">
          <p className="text-sm font-medium text-destructive">Unable to load recent activity</p>
          <p className="text-xs text-muted-foreground">{error} -- try refreshing the page.</p>
        </div>
      ) : activities.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No recent activity yet.</p>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.key} className="flex items-start gap-4 pb-4 border-b border-slate-200 last:border-0">
              <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-medium">
                {activity.user.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{activity.user}</p>
                  <span className="text-xs text-slate-500">{timeAgo(activity.created_at)}</span>
                </div>
                <p className="text-sm text-slate-600">{activity.action}</p>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getBadgeColor(activity.type)}`}
                  >
                    {activity.type}
                  </span>
                  <span className="text-xs text-slate-500">{activity.detail}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default RecentActivities
