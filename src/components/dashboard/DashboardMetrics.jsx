// DashboardMetrics.jsx - Optimized to fetch only counts instead of full data

import { useState, useEffect, useContext } from "react"
import { UsersIcon, PhoneCallIcon, FileTextIcon, ShoppingCartIcon, TrendingUpIcon, TrendingDownIcon, AlertCircleIcon, MinusIcon } from "../Icons"
import { AuthContext } from "../../App" // Import AuthContext
import supabase from "../../utils/supabase" // Import your Supabase client

const getEndDateWithTime = (date) => (date ? `${date}T23:59:59` : null)

// One count query per metric, parameterised by date window -- reused for
// both the current and the previous period so the period-over-period %
// change on each card comes from real data instead of a hardcoded literal.
// All 6 are still cheap `head: true` count-only queries (no rows fetched),
// so doubling them for the comparison period doesn't meaningfully add cost.
async function fetchCounts({ start, end, isAdmin, scNameFilter, currentUser, getUsernamesToFilter }) {
  const applyScFilter = (query, column) => {
    if (isAdmin()) {
      if (scNameFilter !== "all") return query.eq(column, scNameFilter)
      return query
    }
    if (currentUser?.username) {
      return query.in(column, getUsernamesToFilter())
    }
    return query
  }
  const applyDateFilter = (query) => {
    let q = query
    if (start) q = q.gte("created_at", start)
    if (end) q = q.lte("created_at", getEndDateWithTime(end))
    return q
  }
  const [
    { count: totalLeads, error: leadsErr },
    // "Pending" is NOT "has a planned_at" -- planned_at is set on virtually
    // every row at creation time (it's the next/first call date, not an
    // open/closed flag), which is why this used to equal totalLeads exactly.
    // call_tracker_pending_view already encodes the real definition (no
    // tracker row yet, or latest tracker row not resolved to yes/not-interested).
    { count: pendingFollowups, error: pendingErr },
    // lto_enquiry_tracker/_for_leads are history logs (multiple rows per
    // enquiry per stage transition), so a raw row count of
    // "quotation_number is not null" massively overcounts -- these views
    // (Database/07_dashboard_quotation_order_distinct_views.sql) are already
    // deduped to one row per enquiry/lead (latest tracker row), covering both
    // direct-enquiry and leads-origin quotations/orders.
    { count: quotationsSent, error: quotErr },
    { count: ordersReceived, error: ordersErr },
    { count: totalEnquiry, error: totalEnqErr },
    // Same planned_at-is-a-no-op bug as pendingFollowups -- enquiry_pending_view
    // (scoped to source_type='enquiry' to match totalEnquiry's lto_enquiries-only
    // scope) encodes the real "order not yet resolved" definition.
    { count: pendingEnquiry, error: pendingEnqErr },
  ] = await Promise.all([
    applyDateFilter(applyScFilter(supabase.from("lto_leads").select("*", { count: "exact", head: true }), "sc_name")),
    applyDateFilter(applyScFilter(supabase.from("call_tracker_pending_view").select("*", { count: "exact", head: true }), "assigned_to")),
    applyDateFilter(supabase.from("lto_quotations_sent_view").select("*", { count: "exact", head: true })),
    applyDateFilter(supabase.from("lto_orders_received_view").select("*", { count: "exact", head: true })),
    applyDateFilter(applyScFilter(supabase.from("lto_enquiries").select("*", { count: "exact", head: true }), "sales_coordinator_name")),
    applyDateFilter(applyScFilter(supabase.from("enquiry_pending_view").select("*", { count: "exact", head: true }).eq("source_type", "enquiry"), "assigned_to")),
  ])

  const firstError = leadsErr || pendingErr || quotErr || ordersErr || totalEnqErr || pendingEnqErr
  if (firstError) throw firstError

  return {
    totalLeads: totalLeads || 0,
    pendingFollowups: pendingFollowups || 0,
    quotationsSent: quotationsSent || 0,
    ordersReceived: ordersReceived || 0,
    totalEnquiry: totalEnquiry || 0,
    pendingEnquiry: pendingEnquiry || 0,
  }
}

// Current/previous windows: honours an explicit start/end if the caller
// passed one, otherwise defaults to "this calendar month" vs "last calendar
// month" so the "from last month" wording on each card stays literally true.
function getComparisonWindows(startDate, endDate) {
  if (startDate || endDate) {
    const end = endDate ? new Date(endDate) : new Date()
    const start = startDate ? new Date(startDate) : new Date(end.getFullYear(), end.getMonth(), 1)
    const spanMs = end.getTime() - start.getTime()
    const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000)
    const prevStart = new Date(prevEnd.getTime() - spanMs)
    const iso = (d) => d.toISOString().slice(0, 10)
    return {
      current: { start: startDate || iso(start), end: endDate || iso(end) },
      previous: { start: iso(prevStart), end: iso(prevEnd) },
      usesCustomRange: true,
    }
  }

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const iso = (d) => d.toISOString().slice(0, 10)
  return {
    current: { start: iso(thisMonthStart), end: null },
    previous: { start: iso(lastMonthStart), end: iso(lastMonthEnd) },
    usesCustomRange: false,
  }
}

// null => "New" (no prior-period baseline to compare against)
function pctChange(curr, prev) {
  if (prev === 0) return curr === 0 ? { pct: 0, trend: "flat" } : { pct: null, trend: "up" }
  const diff = Math.round(((curr - prev) / prev) * 100)
  if (diff === 0) return { pct: 0, trend: "flat" }
  return { pct: diff, trend: diff > 0 ? "up" : "down" }
}

function DashboardMetrics({ scNameFilter = "all", startDate, endDate }) {
  const authContext = useContext(AuthContext) || {}
  const {
    currentUser = null,
    isAdmin = () => false,
    getUsernamesToFilter = () => []
  } = authContext
  const [metrics, setMetrics] = useState(null)
  const [changes, setChanges] = useState({})
  const [periodLabel, setPeriodLabel] = useState("from last month")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const { current, previous, usesCustomRange } = getComparisonWindows(startDate, endDate)
        const ctx = { isAdmin, scNameFilter, currentUser, getUsernamesToFilter }

        const [currentCounts, previousCounts] = await Promise.all([
          fetchCounts({ ...current, ...ctx }),
          fetchCounts({ ...previous, ...ctx }),
        ])

        if (cancelled) return

        setMetrics(currentCounts)
        setChanges(
          Object.fromEntries(
            Object.keys(currentCounts).map((key) => [key, pctChange(currentCounts[key], previousCounts[key])])
          )
        )
        setPeriodLabel(usesCustomRange ? "vs previous period" : "from last month")
      } catch (err) {
        if (cancelled) return
        console.error("Error fetching metrics:", err)
        setError(err.message || "Failed to load dashboard metrics.")
        setMetrics(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [currentUser, isAdmin, scNameFilter, startDate, endDate])

  const shown = (v) => (isLoading || !metrics ? null : v)

  return (
    <div className="space-y-4">
      {isAdmin() && (
        <span className="inline-flex items-center rounded border border-success/25 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
          Admin view: showing all data
        </span>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircleIcon className="h-4 w-4 shrink-0" />
          <span>Unable to load dashboard metrics ({error}). Showing no data until this resolves -- try refreshing.</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total Leads" value={shown(metrics?.totalLeads?.toString())} {...changes.totalLeads} periodLabel={periodLabel} tone="brand" icon={<UsersIcon className="h-5 w-5" />} />
        <MetricCard title="Pending Follow-ups" value={shown(metrics?.pendingFollowups?.toString())} {...changes.pendingFollowups} periodLabel={periodLabel} tone="warning" icon={<PhoneCallIcon className="h-5 w-5" />} />
        <MetricCard title="Quotations Sent" value={shown(metrics?.quotationsSent?.toString())} {...changes.quotationsSent} periodLabel={periodLabel} tone="info" icon={<FileTextIcon className="h-5 w-5" />} />
        <MetricCard title="Orders Received" value={shown(metrics?.ordersReceived?.toString())} {...changes.ordersReceived} periodLabel={periodLabel} tone="lime" icon={<ShoppingCartIcon className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total Enquiry" value={shown(metrics?.totalEnquiry?.toString())} {...changes.totalEnquiry} periodLabel={periodLabel} tone="brand" icon={<UsersIcon className="h-5 w-5" />} />
        <MetricCard title="Pending Enquiry" value={shown(metrics?.pendingEnquiry?.toString())} {...changes.pendingEnquiry} periodLabel={periodLabel} tone="warning" icon={<AlertCircleIcon className="h-5 w-5" />} />
      </div>
    </div>
  )
}

// Flat tile: coloured edge + icon chip. Lime is a surface tint only (its icon uses the dark success shade).
const TONES = {
  brand: { chip: "bg-brand-100 text-brand-700", bar: "bg-primary" },
  info: { chip: "bg-info/10 text-info", bar: "bg-info" },
  warning: { chip: "bg-warning/15 text-warning-foreground", bar: "bg-warning" },
  lime: { chip: "bg-brand-lime/20 text-success", bar: "bg-brand-lime" },
}

function MetricCard({ title, value, pct, trend, periodLabel, tone = "brand", icon }) {
  const t = TONES[tone] || TONES.brand
  return (
    <div className="relative overflow-hidden rounded-lg border bg-card p-4 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${t.bar}`} aria-hidden="true" />
      <div className="ml-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          {value === null || value === undefined ? (
            <div className="mt-1 h-8 w-16 animate-pulse rounded bg-secondary" role="status" aria-label="Loading" />
          ) : (
            <p className="mt-1 text-2xl font-semibold leading-8 tabular-nums text-foreground">{value}</p>
          )}
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${t.chip}`}>{icon}</span>
      </div>
      {value !== null && value !== undefined && (
        <p
          className={`ml-1 mt-3 flex items-center gap-1 text-sm ${
            trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {trend === "up" ? (
            <TrendingUpIcon className="h-4 w-4" />
          ) : trend === "down" ? (
            <TrendingDownIcon className="h-4 w-4" />
          ) : (
            <MinusIcon className="h-4 w-4" />
          )}
          {pct === null ? "New" : `${pct > 0 ? "+" : ""}${pct}%`} {periodLabel}
        </p>
      )}
    </div>
  )
}

export default DashboardMetrics
