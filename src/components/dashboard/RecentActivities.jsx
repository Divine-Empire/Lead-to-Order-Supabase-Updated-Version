function RecentActivities() {
  return (
    <div>
      <h3 className="text-xl font-bold mb-4">Recent Activities</h3>

      <div className="space-y-4">
        {activities.map((activity, index) => (
          <div key={index} className="flex items-start gap-4 pb-4 border-b border-slate-200 last:border-0">
            <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-medium">
              {activity.user.charAt(0)}
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{activity.user}</p>
                <span className="text-xs text-slate-500">{activity.time}</span>
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
    </div>
  )
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

const activities = [
  {
    user: "John Doe",
    action: "Created a new lead",
    type: "Lead",
    detail: "ABC Corp",
    time: "10 min ago",
  },
  {
    user: "Jane Smith",
    action: "Completed follow-up call",
    type: "Follow-up",
    detail: "XYZ Industries",
    time: "1 hour ago",
  },
  {
    user: "Mike Johnson",
    action: "Sent quotation",
    type: "Quotation",
    detail: "Q-005 to PQR Ltd",
    time: "3 hours ago",
  },
  {
    user: "Sarah Williams",
    action: "Received order confirmation",
    type: "Order",
    detail: "Order #1234 from ABC Corp",
    time: "Yesterday",
  },
  {
    user: "David Brown",
    action: "Updated lead information",
    type: "Lead",
    detail: "LMN Enterprises",
    time: "Yesterday",
  },
]

export default RecentActivities
