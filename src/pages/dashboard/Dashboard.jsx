import DashboardMetrics from "../../components/dashboard/DashboardMetrics"
import DashboardCharts from "../../components/dashboard/DashboardCharts"
import PendingTasks from "../../components/dashboard/PendingTasks"
import RecentActivities from "../../components/dashboard/RecentActivities"

function Dashboard() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="container mx-auto py-8 px-4">

        <div className="grid grid-cols-1 gap-6">
          <DashboardMetrics />

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="p-6">
              <DashboardCharts />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
