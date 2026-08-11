function Notification({ message, type = "info" }) {
  const bgColor = {
    success: "bg-success/10 border-success text-success",
    error: "bg-destructive/10 border-destructive text-destructive",
    info: "bg-info/10 border-info text-info",
    warning: "bg-warning/10 border-warning text-warning-foreground",
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div className={`p-4 rounded-md border-l-4 shadow-md ${bgColor[type]}`}>{message}</div>
    </div>
  )
}

export default Notification
