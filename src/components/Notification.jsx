function Notification({ message, type = "info" }) {
  const bgColor = {
    success: "bg-success/10 border-success text-success",
    error: "bg-destructive/10 border-destructive text-destructive",
    info: "bg-info/10 border-info text-info",
    warning: "bg-warning/10 border-warning text-warning-foreground",
    loading: "bg-info/10 border-info text-info",
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div className={`p-4 rounded-md border-l-4 shadow-md flex items-center gap-3 ${bgColor[type]}`}>
        {type === "loading" && (
          <svg
            className="animate-spin h-4 w-4 flex-shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        )}
        <span>{message}</span>
      </div>
    </div>
  )
}

export default Notification
