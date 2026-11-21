import { lazy, Suspense, useState } from "react"
import DashboardMetrics from "../../components/dashboard/DashboardMetrics"
import LoadingSpinner from "../../components/LoadingSpinner"
import PendingTasks from "../../components/dashboard/PendingTasks"
import RecentActivities from "../../components/dashboard/RecentActivities"
import { useDashboardOverview } from "../../utils/dashboardOverview"

// recharts is large; load it after the metric cards so they appear first.
const DashboardCharts = lazy(() => import("../../components/dashboard/DashboardCharts"))

function Dashboard() {
  // One request feeds every widget below.
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const rangeInvalid = Boolean(startDate && endDate && endDate < startDate)
  // An invalid range (end before start) is not sent; the dashboard keeps the default month.
  const { data: overview, isLoading, error } = useDashboardOverview({
    startDate: rangeInvalid ? undefined : startDate || undefined,
    endDate: rangeInvalid ? undefined : endDate || undefined,
  })
  const shared = { overview, isLoading, error }

  const rangeHint = rangeInvalid
    ? "End date is before the start date, so the default range is shown."
    : startDate || endDate
      ? "Cards and charts follow this range; Pending cards always show what is open now."
      : "Showing this month. Pick dates to change the range."

  const dateFilter = (
    <div className="flex flex-wrap items-end gap-3" title={rangeHint}>
      <div>
        <label htmlFor="dash-from" className="mb-1 block text-xs font-medium text-muted-foreground">From</label>
        <input
          id="dash-from"
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={(e) => setStartDate(e.target.value)}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="dash-to" className="mb-1 block text-xs font-medium text-muted-foreground">To</label>
        <input
          id="dash-to"
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => setEndDate(e.target.value)}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>
      {(startDate || endDate) && (
        <button
          type="button"
          onClick={() => { setStartDate(""); setEndDate("") }}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Clear
        </button>
      )}
      {rangeInvalid && <p role="alert" className="basis-full text-right text-xs text-destructive">{rangeHint}</p>}
    </div>
  )


  return (
    <div className="flex flex-col gap-4">
      <DashboardMetrics {...shared} toolbar={dateFilter} />

      <section className="rounded-lg border bg-card p-5 shadow-sm" aria-labelledby="sales-analytics">
        <Suspense fallback={<LoadingSpinner message="Loading chart data..." minHeight="350px" />}>
          <DashboardCharts {...shared} />
        </Suspense>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <PendingTasks {...shared} />
        </section>
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <RecentActivities {...shared} />
        </section>
      </div>
    </div>
  )
}

export default Dashboard
