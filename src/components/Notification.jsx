import { CheckCircle2, AlertCircle, AlertTriangle, Info, Loader2 } from "lucide-react"

// Renders a STACK of toasts, not just one -- each background operation
// (e.g. a Google Sheets sync) gets its own independent entry with its own
// id, so two overlapping syncs no longer stomp each other's "loading"
// state (previously a single global `notification` object, matched for
// dismissal purely by message-string equality, which broke down the moment
// two calls shared the same literal text).
//
// Look: a solid status-coloured card with bold text. The text colour is the
// status's own *-foreground token, so contrast holds for every hue, and the
// icon (not just colour) says what kind of message it is.
const TONES = {
  success: { card: "border-success bg-success text-success-foreground", icon: CheckCircle2, iconClass: "" },
  error: { card: "border-destructive bg-destructive text-destructive-foreground", icon: AlertCircle, iconClass: "" },
  warning: { card: "border-warning bg-warning text-warning-foreground", icon: AlertTriangle, iconClass: "" },
  info: { card: "border-info bg-info text-info-foreground", icon: Info, iconClass: "" },
  loading: { card: "border-info bg-info text-info-foreground", icon: Loader2, iconClass: "animate-spin" },
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
            className={`flex items-center gap-3 rounded-md border p-3 text-sm font-semibold shadow-lg ${tone.card}`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${tone.iconClass}`} aria-hidden="true" />
            <span>{message}</span>
          </div>
        )
      })}
    </div>
  )
}

export default Notification
