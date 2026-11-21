import { useMemo } from "react"
import LoadingSpinner from "../LoadingSpinner"

const ACTIVITY_LIMIT = 6

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

function RecentActivities({ overview, isLoading, error }) {
  // Up to 8 newest rows per source arrive from the overview request; merge by real time.
  const activities = useMemo(() => {
    const recent = overview?.recent
    if (!recent) return []
    return [
      ...(recent.leads || []).map((row) => ({
        key: `lead-${row.id}`,
        user: row.sc_name || "—",
        action: "Created a new lead",
        type: "Lead",
        detail: `${row.company_name || "Unknown company"} (${row.lead_no || "—"})`,
        created_at: row.created_at,
      })),
      ...(recent.followUps || []).map((row) => ({
        key: `followup-${row.id}`,
        user: row.sc_name || "—",
        action: "Logged a follow-up call",
        type: "Follow-up",
        detail: `${row.lead?.company_name || "Unknown company"} (${row.lead?.lead_no || "—"})`,
        created_at: row.created_at,
      })),
      ...(recent.quotations || []).map((row) => ({
        key: `quotation-${row.id}`,
        user: row.prepared_by || "—",
        action: "Sent a quotation",
        type: "Quotation",
        detail: `${row.quotation_no} for ${row.enquiry_reference_no || "—"}`,
        created_at: row.created_at,
      })),
      ...(recent.orders || []).map((row) => ({
        key: `order-${row.id}`,
        user: row.approved_by || "—",
        action: "Received an order",
        type: "Order",
        detail: `${row.enquiry?.company_name || "Unknown company"} (${row.enquiry?.enquiry_no || "—"})`,
        created_at: row.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, ACTIVITY_LIMIT)
  }, [overview])

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
