import { lazy, Suspense, useState } from "react"
import DashboardMetrics from "../../components/dashboard/DashboardMetrics"
import LoadingSpinner from "../../components/LoadingSpinner"
import PendingTasks from "../../components/dashboard/PendingTasks"
import RecentActivities from "../../components/dashboard/RecentActivities"
import { useDashboardOverview } from "../../utils/dashboardOverview"

// recharts is large; load it after the metric cards so they appear first.
const DashboardCharts = lazy(() => import("../../components/dashboard/DashboardCharts"))

const pad = (n) => String(n).padStart(2, "0")
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Quick ranges. "This month" is the default (no dates sent). Each returns [start, end].
const PRESETS = [
  { id: "this", label: "This month", range: () => ["", ""] },
  {
    id: "last",
    label: "Last month",
    range: () => {
      const n = new Date()
      return [ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)), ymd(new Date(n.getFullYear(), n.getMonth(), 0))]
    },
  },
  {
    id: "30",
    label: "Last 30 days",
    range: () => {
      const n = new Date()
      return [ymd(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 29)), ymd(n)]
    },
  },
  { id: "all", label: "All time", range: () => ["2000-01-01", ""] },
]

function Dashboard() {
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const rangeInvalid = Boolean(startDate && endDate && endDate < startDate)
  // An invalid range (end before start) is not sent; the dashboard keeps the default month.
  const { data: overview, isLoading, error } = useDashboardOverview({
    startDate: rangeInvalid ? undefined : startDate || undefined,
    endDate: rangeInvalid ? undefined : endDate || undefined,
  })
  // One request feeds every widget below.
  const shared = { overview, isLoading, error }

  const activePreset = PRESETS.find((p) => {
    const [s, e] = p.range()
    return s === startDate && e === endDate
  })?.id

  const rangeHint = rangeInvalid
    ? "End date is before the start date, so the default range is shown."
    : "Cards and charts follow this range; the Pending cards always show what is open now."

  const dateFilter = (
    <div className="flex flex-wrap items-center gap-2" title={rangeHint}>
      <div className="inline-flex h-8 overflow-hidden rounded-md border border-input bg-card" role="group" aria-label="Quick range">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={activePreset === p.id}
            onClick={() => { const [s, e] = p.range(); setStartDate(s); setEndDate(e) }}
            className={`px-2.5 text-xs font-medium transition-colors ${
              activePreset === p.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <input
        id="dash-from"
        type="date"
        aria-label="From date"
        value={startDate}
        max={endDate || undefined}
        onChange={(e) => setStartDate(e.target.value)}
        className="h-8 w-[8.5rem] rounded-md border border-input bg-card px-2 text-xs focus:border-primary focus:outline-none"
      />
      <span className="text-xs text-muted-foreground" aria-hidden="true">to</span>
      <input
        id="dash-to"
        type="date"
        aria-label="To date"
        value={endDate}
        min={startDate || undefined}
        onChange={(e) => setEndDate(e.target.value)}
        className="h-8 w-[8.5rem] rounded-md border border-input bg-card px-2 text-xs focus:border-primary focus:outline-none"
      />
      {rangeInvalid && <p role="alert" className="basis-full text-right text-xs text-destructive">{rangeHint}</p>}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <DashboardMetrics {...shared} toolbar={dateFilter} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="flex flex-col gap-3 xl:col-span-2">
          <section className="rounded-lg border bg-card p-4 shadow-sm" aria-labelledby="sales-analytics">
            <Suspense fallback={<LoadingSpinner message="Loading chart data..." minHeight="300px" />}>
              <DashboardCharts {...shared} />
            </Suspense>
          </section>
          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <RecentActivities {...shared} />
          </section>
        </div>
        <section className="rounded-lg border bg-card p-4 shadow-sm xl:self-start">
          <PendingTasks {...shared} />
        </section>
      </div>
    </div>
  )
}

export default Dashboard
