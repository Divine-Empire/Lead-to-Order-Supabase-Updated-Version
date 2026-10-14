import { CheckCircle2, AlertCircle, AlertTriangle, Info, Loader2 } from "lucide-react"

// Renders a STACK of toasts, not just one -- each background operation
// (e.g. a Google Sheets sync) gets its own independent entry with its own
// id, so two overlapping syncs no longer stomp each other's "loading"
// state (previously a single global `notification` object, matched for
// dismissal purely by message-string equality, which broke down the moment
// two calls shared the same literal text).
//
// Look: neutral card + a coloured left edge and icon. The message text stays
// in the normal foreground colour so contrast never depends on the status hue,
// and the icon (not just colour) says what kind of message it is.
const TONES = {
  success: { edge: "border-l-success", icon: CheckCircle2, iconClass: "text-success" },
  error: { edge: "border-l-destructive", icon: AlertCircle, iconClass: "text-destructive" },
  warning: { edge: "border-l-warning", icon: AlertTriangle, iconClass: "text-warning-foreground" },
  info: { edge: "border-l-info", icon: Info, iconClass: "text-info" },
  loading: { edge: "border-l-info", icon: Loader2, iconClass: "text-info animate-spin" },
}

function Notification({ notifications = [] }) {
  if (!notifications.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-[1100] flex max-w-md flex-col-reverse gap-2">
      {notifications.map(({ id, message, type = "info" }) => {
        const tone = TONES[type] || TONES.info
        const Icon = tone.icon
        return (
          <div
            key={id}
            role={type === "error" ? "alert" : "status"}
            className={`flex items-center gap-3 rounded-md border border-l-4 bg-card p-3 text-sm text-foreground shadow-lg ${tone.edge}`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${tone.iconClass}`} aria-hidden="true" />
            <span>{message}</span>
          </div>
        )
      })}
    </div>
  )
}

export default Notification
