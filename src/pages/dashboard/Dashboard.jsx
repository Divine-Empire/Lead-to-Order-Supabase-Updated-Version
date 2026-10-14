import DashboardMetrics from "../../components/dashboard/DashboardMetrics"
import DashboardCharts from "../../components/dashboard/DashboardCharts"
import PendingTasks from "../../components/dashboard/PendingTasks"
import RecentActivities from "../../components/dashboard/RecentActivities"

function Dashboard() {
  return (
    <div className="flex flex-col gap-4">
      <DashboardMetrics />

      <section className="rounded-lg border bg-card p-5 shadow-sm" aria-labelledby="sales-analytics">
        <DashboardCharts />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <PendingTasks />
        </section>
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <RecentActivities />
        </section>
      </div>
    </div>
  )
}

export default Dashboard
