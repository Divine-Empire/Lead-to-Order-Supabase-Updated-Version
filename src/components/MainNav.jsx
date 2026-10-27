import { MenuIcon } from "./Icons"
import { useContext } from "react"
import { AuthContext } from "../App"
import { useLocation } from "react-router-dom"

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U"
}

function MainNav({ setMobileMenuOpen }) {
  const authContext = useContext(AuthContext) || {}
  const { currentUser = null, userType = null, isAdmin = () => false } = authContext
  const location = useLocation()

  const getPageHeader = () => {
    const path = location.pathname
    if (path === "/") return {
      title: "Leads To Order System",
      description: "Monitor your sales pipeline and track conversions in real-time"
    }
    if (path.startsWith("/leads")) return {
      title: "Lead Management",
      description: "Enter the details of the new lead"
    }
    if (path.startsWith("/call-tracker")) return {
      title: "Call Tracker",
      description: "Track and manage all your follow-up calls"
    }
    if (path.startsWith("/enquiry-tracker")) return {
      title: "Enquiry Tracker",
      description: "Track the progress of enquiries through the sales pipeline"
    }
    if (path.startsWith("/quotation")) return {
      title: "Quotation",
      description: "Create and manage quotations for your leads"
    }
    if (path.startsWith("/series-quotation")) return {
      title: "Series Quotation",
      description: "Create Lite Plus and Ultra Tough series quotations"
    }
    if (path.startsWith("/field-sales-logs")) return {
      title: "Field Sales Logs",
      description: "Browse field sales visit logs and export them"
    }
    if (path.startsWith("/report")) return {
      title: "Reports",
      description: "View sales performance reports and charts"
    }
    if (path.startsWith("/master")) return {
      title: "Master Data",
      description: "Centralized master records, distribution rules, and catalog management"
    }
    if (path.startsWith("/setting")) return {
      title: "Settings",
      description: "System settings and database management"
    }
    return { title: "", description: "" }
  }

  const { title, description } = getPageHeader()
  const showAdminView = (location.pathname.startsWith("/call-tracker") || location.pathname.startsWith("/enquiry-tracker")) && isAdmin && isAdmin()
  const displayName = currentUser?.username || "User"

  return (
    <header className="sticky top-0 z-40 flex min-h-14 w-full items-center justify-between gap-3 border-b border-brand-200 bg-card px-4 py-2 shadow-[inset_0_2px_0_0_hsl(var(--brand-lime))] md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
        >
          <MenuIcon className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          {title && <h1 className="truncate text-lg font-semibold leading-6 tracking-tight text-foreground">{title}</h1>}
          <div className="flex items-center gap-2">
            {description && <p className="hidden truncate text-sm text-muted-foreground md:block">{description}</p>}
            {showAdminView && (
              <span className="inline-flex shrink-0 items-center rounded border border-success/25 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                Admin view: showing all data
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          aria-hidden="true"
        >
          {initials(displayName)}
        </span>
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-medium text-foreground">{displayName}</p>
          {userType && <p className="text-xs capitalize text-muted-foreground">{userType}</p>}
        </div>
      </div>
    </header>
  )
}

export default MainNav
