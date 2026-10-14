import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { ArrowRightIcon, ClockIcon } from "../Icons"
import LoadingSpinner from "../LoadingSpinner"
import supabase from "../../utils/supabase"

const TASKS_PER_SECTION = 3

function dueLabel(dateStr) {
  if (!dateStr) return "No date set"
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dateStr)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Tomorrow"
  return `In ${diffDays} days`
}

function TaskCard({ tone, badge, title, subtitle, due, to, cta }) {
  const TONES = {
    warning: { card: "bg-warning/5 border-warning/20", badge: "bg-warning/15 text-warning-foreground", due: "text-warning-foreground", btn: "border-warning/30 text-warning-foreground hover:bg-warning/10 focus:ring-warning" },
    primary: { card: "bg-primary/5 border-primary/20", badge: "bg-primary/10 text-primary", due: "text-primary", btn: "border-primary/30 text-primary hover:bg-primary/5 focus:ring-primary" },
    success: { card: "bg-success/5 border-success/20", badge: "bg-success/15 text-success", due: "text-success", btn: "border-success/30 text-success hover:bg-success/5 focus:ring-success" },
  }
  const t = TONES[tone] || TONES.warning
  return (
    <div className={`${t.card} border rounded-lg p-4`}>
      <div className="flex justify-between items-start">
        <div>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${t.badge} mb-2`}>
            {badge}
          </span>
          <h4 className="font-medium">{title}</h4>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className={`flex items-center ${t.due} text-sm shrink-0`}>
          <ClockIcon className="h-4 w-4 mr-1" />
          {due}
        </div>
      </div>
      <div className="mt-3">
        <Link to={to}>
          <button className={`w-full px-4 py-2 text-sm font-medium rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${t.btn}`}>
            {cta} <ArrowRightIcon className="ml-2 h-3 w-3 inline" />
          </button>
        </Link>
      </div>
    </div>
  )
}

function PendingTasks() {
  const [followUps, setFollowUps] = useState([])
  const [quotationsNeeded, setQuotationsNeeded] = useState([])
  const [orderStatusNeeded, setOrderStatusNeeded] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        // Follow-ups due: reuses the same view Call Tracker's Pending tab is
        // built on, so "due" here means exactly what it means there.
        const followUpsPromise = supabase
          .from("call_tracker_pending_view")
          .select("record_id, display_no, company_name, next_call_date")
          .order("next_call_date", { ascending: true, nullsFirst: true })
          .limit(TASKS_PER_SECTION)

        // Quotation needed: latest tracker row sitting at the "Make
        // Quotation" stage with no quotation number logged against it yet.
        const quotationsPromise = supabase
          .from("lto_enquiry_tracker")
          .select("id, enquiry_id, created_at, quotation_number")
          .in("current_stage", ["make-quotation", "Make Quotation"])
          .or("quotation_number.is.null,quotation_number.eq.")
          .order("created_at", { ascending: false })
          .limit(TASKS_PER_SECTION)

        // Order status needed: latest tracker row at the order stage still
        // awaiting a yes/no decision.
        const orderStatusPromise = supabase
          .from("lto_enquiry_tracker")
          .select("id, enquiry_id, created_at")
          .in("current_stage", ["order-status", "Order Status", "order-expected", "Order Expected"])
          .is("is_order_received_status", null)
          .order("created_at", { ascending: false })
          .limit(TASKS_PER_SECTION)

        const [followUpsRes, quotationsRes, orderStatusRes] = await Promise.all([
          followUpsPromise, quotationsPromise, orderStatusPromise,
        ])
        const firstError = followUpsRes.error || quotationsRes.error || orderStatusRes.error
        if (firstError) throw firstError

        // Both quotation/order-status rows only carry enquiry_id -- fill in
        // the enquiry_no/company_name they need to display via one lookup.
        const enquiryIds = [
          ...new Set([
            ...(quotationsRes.data || []).map((r) => r.enquiry_id),
            ...(orderStatusRes.data || []).map((r) => r.enquiry_id),
          ].filter(Boolean)),
        ]
        const { data: enquiryLookup, error: enqErr } = enquiryIds.length > 0
          ? await supabase.from("lto_enquiries").select("id, enquiry_no, company_name").in("id", enquiryIds)
          : { data: [] }
        if (enqErr) throw enqErr
        const enquiryById = new Map((enquiryLookup || []).map((e) => [e.id, e]))

        if (cancelled) return
        setFollowUps(followUpsRes.data || [])
        setQuotationsNeeded(
          (quotationsRes.data || []).map((row) => ({ ...row, enquiry: enquiryById.get(row.enquiry_id) }))
        )
        setOrderStatusNeeded(
          (orderStatusRes.data || []).map((row) => ({ ...row, enquiry: enquiryById.get(row.enquiry_id) }))
        )
      } catch (err) {
        if (cancelled) return
        console.error("Error fetching pending tasks:", err)
        setError(err.message || "Failed to load pending tasks.")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [])

  const hasAnyTask = followUps.length > 0 || quotationsNeeded.length > 0 || orderStatusNeeded.length > 0

  return (
    <div>
      <h3 className="text-xl font-bold mb-4">Pending Tasks</h3>

      {isLoading ? (
        <LoadingSpinner message="Loading pending tasks..." minHeight="200px" />
      ) : error ? (
        <div role="alert" className="flex flex-col items-center justify-center gap-1 py-8 text-center">
          <p className="text-sm font-medium text-destructive">Unable to load pending tasks</p>
          <p className="text-xs text-muted-foreground">{error} -- try refreshing the page.</p>
        </div>
      ) : !hasAnyTask ? (
        <p className="py-8 text-center text-sm text-slate-500">Nothing pending right now.</p>
      ) : (
        <div className="space-y-4">
          {followUps.map((row) => (
            <TaskCard
              key={`followup-${row.record_id}`}
              tone="warning"
              badge="Follow-up"
              title={row.company_name || "Unknown company"}
              subtitle={`Lead No: ${row.display_no || "—"}`}
              due={dueLabel(row.next_call_date)}
              to={`/call-tracker/form?leadId=${row.display_no}&leadNo=${row.display_no}`}
              cta="Call Now"
            />
          ))}

          {quotationsNeeded.map((row) => (
            <TaskCard
              key={`quotation-${row.id}`}
              tone="primary"
              badge="Quotation"
              title={row.enquiry?.company_name || "Unknown company"}
              subtitle={`Enquiry No: ${row.enquiry?.enquiry_no || "—"}`}
              due={dueLabel(row.created_at)}
              to={`/enquiry-tracker/form?leadId=${row.enquiry?.enquiry_no || ""}`}
              cta="Create Quotation"
            />
          ))}

          {orderStatusNeeded.map((row) => (
            <TaskCard
              key={`order-${row.id}`}
              tone="success"
              badge="Order Status"
              title={row.enquiry?.company_name || "Unknown company"}
              subtitle={`Enquiry No: ${row.enquiry?.enquiry_no || "—"}`}
              due={dueLabel(row.created_at)}
              to={`/enquiry-tracker/form?leadId=${row.enquiry?.enquiry_no || ""}`}
              cta="Update Status"
            />
          ))}
        </div>
      )}

      <div className="mt-4 text-center">
        <Link to="/enquiry-tracker">
          <button className="text-slate-500 hover:text-slate-700 text-sm font-medium">View all pending tasks</button>
        </Link>
      </div>
    </div>
  )
}

export default PendingTasks
