// DashboardMetrics.jsx - the six metric cards. The numbers come from the
// dashboard's single lto_dashboard_overview request (see utils/dashboardOverview.js).

import { useContext } from "react"
import { UsersIcon, PhoneCallIcon, FileTextIcon, ShoppingCartIcon, TrendingUpIcon, TrendingDownIcon, AlertCircleIcon, MinusIcon } from "../Icons"
import { AuthContext } from "../../App" // Import AuthContext

// null => "New" (no prior-period baseline to compare against)
function pctChange(curr, prev) {
  if (prev === 0) return curr === 0 ? { pct: 0, trend: "flat" } : { pct: null, trend: "up" }
  const diff = Math.round(((curr - prev) / prev) * 100)
  if (diff === 0) return { pct: 0, trend: "flat" }
  return { pct: diff, trend: diff > 0 ? "up" : "down" }
}

const PENDING_KEYS = ["pendingFollowups", "pendingEnquiry"]

function DashboardMetrics({ overview, isLoading, error, toolbar }) {
  const { isAdmin = () => false } = useContext(AuthContext) || {}
  const metrics = overview?.metrics?.current || null
  const previous = overview?.metrics?.previous || {}
  const periodLabel = overview?.usesCustomRange ? "vs previous period" : "from last month"
  // Pending cards are open-right-now snapshots, so they have no previous period.
  const changes = metrics
    ? Object.fromEntries(
        Object.keys(metrics).map((key) => [
          key,
          PENDING_KEYS.includes(key) ? { caption: "Open right now" } : pctChange(metrics[key], previous[key] || 0),
        ])
      )
    : {}

  const shown = (v) => (isLoading || !metrics ? null : v)

  return (
    <div className="space-y-4">
      {/* Admin badge on the left, the page's date filter (toolbar) on the right */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isAdmin() ? (
          <span className="inline-flex items-center rounded border border-success/25 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
            Admin view: showing all data
          </span>
        ) : (
          <span />
        )}
        {toolbar}
      </div>

      {error && !isLoading && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircleIcon className="h-4 w-4 shrink-0" />
          <span>Unable to load dashboard metrics ({error}). Showing no data until this resolves -- try refreshing.</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard title="Total Leads" value={shown(metrics?.totalLeads?.toString())} {...changes.totalLeads} periodLabel={periodLabel} tone="brand" icon={<UsersIcon className="h-4 w-4" />} />
        <MetricCard title="Total Enquiry" value={shown(metrics?.totalEnquiry?.toString())} {...changes.totalEnquiry} periodLabel={periodLabel} tone="brand" icon={<UsersIcon className="h-4 w-4" />} />
        <MetricCard title="Quotations Sent" value={shown(metrics?.quotationsSent?.toString())} {...changes.quotationsSent} periodLabel={periodLabel} tone="info" icon={<FileTextIcon className="h-4 w-4" />} />
        <MetricCard title="Orders Received" value={shown(metrics?.ordersReceived?.toString())} {...changes.ordersReceived} periodLabel={periodLabel} tone="lime" icon={<ShoppingCartIcon className="h-4 w-4" />} />
        <MetricCard title="Pending Follow-ups" value={shown(metrics?.pendingFollowups?.toString())} {...changes.pendingFollowups} periodLabel={periodLabel} tone="warning" icon={<PhoneCallIcon className="h-4 w-4" />} />
        <MetricCard title="Pending Enquiry" value={shown(metrics?.pendingEnquiry?.toString())} {...changes.pendingEnquiry} periodLabel={periodLabel} tone="warning" icon={<AlertCircleIcon className="h-4 w-4" />} />
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

function MetricCard({ title, value, pct, trend, periodLabel, caption, tone = "brand", icon }) {
  const t = TONES[tone] || TONES.brand
  const loaded = value !== null && value !== undefined
  return (
    <div className="relative overflow-hidden rounded-lg border bg-card px-3 py-2.5 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${t.bar}`} aria-hidden="true" />
      <div className="ml-1 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">{title}</p>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${t.chip}`}>{icon}</span>
      </div>
      {loaded ? (
        <p className="ml-1 mt-0.5 text-xl font-semibold leading-7 tabular-nums text-foreground">{value}</p>
      ) : (
        <div className="ml-1 mt-1 h-6 w-14 animate-pulse rounded bg-secondary" role="status" aria-label="Loading" />
      )}
      {loaded && caption && (
        <p className="ml-1 mt-1 truncate text-xs text-muted-foreground">{caption}</p>
      )}
      {loaded && !caption && (
        <p
          className={`ml-1 mt-1 flex items-center gap-1 truncate text-xs ${
            trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {trend === "up" ? (
            <TrendingUpIcon className="h-3.5 w-3.5 shrink-0" />
          ) : trend === "down" ? (
            <TrendingDownIcon className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <MinusIcon className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{pct === null ? "New" : `${pct > 0 ? "+" : ""}${pct}%`} {periodLabel}</span>
        </p>
      )}
    </div>
  )
}

export default DashboardMetrics
