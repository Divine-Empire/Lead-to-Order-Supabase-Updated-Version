import { Link, useLocation } from "react-router-dom"
import { HomeIcon, UsersIcon, PhoneCallIcon, BarChartIcon, FileTextIcon, ShieldIcon, LogoutIcon, DatabaseIcon, SettingsIcon } from "./Icons"
import { useContext, useState, useEffect } from "react"
import { ChevronsLeft, ChevronsRight } from "lucide-react"
import { AuthContext } from "../App"
import supabase from "../utils/supabase"
import { fetchClosedIdSet, countOpenRows } from "../utils/pendingStatus"

function Sidebar({ mobileMenuOpen, setMobileMenuOpen }) {
    const location = useLocation()
    const authContext = useContext(AuthContext) || {}
    const { isAdmin = () => false, logout = () => {}, getUsernamesToFilter = () => [] } = authContext
    const [counts, setCounts] = useState({
        callTracker: null,
        enquiryTracker: null,
        clientMaster: null,
        itemsMaster: null
    })


    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const safeFetch = async (queryPromise) => {
                    try {
                        const res = await queryPromise;
                        return res || { count: 0 };
                    } catch {
                        return { count: 0 };
                    }
                };

                // Role-based access: non-admin (USER) accounts only ever count
                // rows belonging to their own assigned SC (+ delegated alternate
                // access); admins see the true system-wide counts.
                const usernamesToFilter = isAdmin() ? null : getUsernamesToFilter();

                // Call Tracker Pending count
                let callCount = 0;
                try {
                    // Group 1: leads where planned_at is not null and id not in call_tracker_for_leads
                    let allTrackerData = [];
                    let fetchMore = true;
                    let currentFrom = 0;

                    while (fetchMore) {
                        let trackerQuery = supabase
                            .from("lto_call_tracker_for_leads")
                            .select("lead_id, enquiry_received_status, created_at, sc_name")
                            .order("created_at", { ascending: false });
                        if (usernamesToFilter) trackerQuery = trackerQuery.in("sc_name", usernamesToFilter);
                        const { data, error } = await trackerQuery.range(currentFrom, currentFrom + 999);

                        if (error) break;
                        if (data && data.length > 0) {
                            allTrackerData = [...allTrackerData, ...data];
                            currentFrom += 1000;
                            if (data.length < 1000) fetchMore = false;
                        } else {
                            fetchMore = false;
                        }
                    }

                    const latestTrackerPerLead = new Map();
                    allTrackerData.forEach(row => {
                        if (row.lead_id && !latestTrackerPerLead.has(row.lead_id)) {
                            latestTrackerPerLead.set(row.lead_id, row);
                        }
                    });

                    const existingLeadIds = Array.from(latestTrackerPerLead.keys());

                    let group1Query = supabase
                        .from("lto_leads")
                        .select("id")
                        .not("planned_at", "is", null);
                    if (usernamesToFilter) group1Query = group1Query.in("sc_name", usernamesToFilter);

                    const { data: g1Leads } = await group1Query;
                    const existingIdsSet = new Set(existingLeadIds);
                    const g1Count = (g1Leads || []).filter(lead => !existingIdsSet.has(lead.id)).length;

                    // Group 2 count: latest records where status != 'yes'
                    const group2Count = Array.from(latestTrackerPerLead.values()).filter(row => 
                        !row.enquiry_received_status || row.enquiry_received_status.toLowerCase() !== 'yes'
                    ).length;

                    callCount = g1Count + group2Count;
                } catch (e) {
                    console.error("Error fetching call tracker count:", e);
                }

                // Enquiry Tracker Pending count -- "pending" means no tracker
                // row has ever recorded a completed order status (yes/no),
                // matching the Enquiry Tracker page's Pending tab definition.
                // Paginates in chunks of 500 instead of a single unpaginated
                // fetch (which PostgREST silently caps at 1000 rows).
                let enquiryCount = 0;
                try {
                    const [closedLeadIds, closedEnquiryIds] = await Promise.all([
                        fetchClosedIdSet("lto_enquiry_tracker_for_leads", "lead_id"),
                        fetchClosedIdSet("lto_enquiry_tracker", "enquiry_id"),
                    ]);

                    const [pendingLeadsCount, pendingDirectCount] = await Promise.all([
                        countOpenRows("lto_call_tracker_for_leads", "lead_id", closedLeadIds, true, usernamesToFilter),
                        countOpenRows("lto_enquiries", "id", closedEnquiryIds, false, usernamesToFilter),
                    ]);

                    enquiryCount = pendingLeadsCount + pendingDirectCount;
                } catch (e) {
                    console.error("Error fetching enquiry tracker count:", e);
                }

                let clientTotalQuery = supabase.from("lto_client_master").select("*", { count: "exact", head: true });
                let clientNotRelevantQuery = supabase.from("lto_client_master").select("*", { count: "exact", head: true }).eq("isRelevant", false);
                if (usernamesToFilter) {
                    clientTotalQuery = clientTotalQuery.in("sc_name", usernamesToFilter);
                    clientNotRelevantQuery = clientNotRelevantQuery.in("sc_name", usernamesToFilter);
                }

                const [
                    clientTotalRes,
                    clientNotRelevantRes,
                    itemsRes
                ] = await Promise.all([
                    // Client Master total clients count
                    safeFetch(clientTotalQuery),

                    // Client Master non-relevant clients count
                    safeFetch(clientNotRelevantQuery),

                    // Items total count (master data -- not SC-scoped)
                    safeFetch(supabase.from("lto_items").select("*", { count: "exact", head: true }))
                ]);

                const relevantClientCount = Math.max(0, (clientTotalRes?.count || 0) - (clientNotRelevantRes?.count || 0));
                const itemsCount = itemsRes?.count || 0;

                setCounts({
                    callTracker: callCount,
                    enquiryTracker: enquiryCount,
                    clientMaster: relevantClientCount,
                    itemsMaster: itemsCount
                });
            } catch (err) {
                console.error("Error fetching sidebar counts:", err);
            }
        };

        fetchCounts();
    }, [location.pathname]);

    // Esc closes the mobile drawer
    useEffect(() => {
        if (!mobileMenuOpen) return undefined
        const onKey = (e) => { if (e.key === "Escape") setMobileMenuOpen(false) }
        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [mobileMenuOpen, setMobileMenuOpen])

    const isMasterRoute = location.pathname.startsWith("/master");
    const [masterExpanded, setMasterExpanded] = useState(() => isMasterRoute);

    // Desktop-only icon-rail mode (md and up). Remembered per browser; the
    // mobile drawer is always full width.
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem("sidebarCollapsed") === "1" } catch { return false }
    });
    const toggleCollapsed = () => {
        setCollapsed((prev) => {
            const next = !prev;
            try { localStorage.setItem("sidebarCollapsed", next ? "1" : "0") } catch { /* storage unavailable */ }
            return next;
        });
    };
    const hideWhenCollapsed = collapsed ? "md:hidden" : "";
    const centerWhenCollapsed = collapsed ? "md:justify-center md:px-0" : "";

    useEffect(() => {
        if (location.pathname.startsWith("/master")) {
            setMasterExpanded(true);
        }
    }, [location.pathname]);

    const MASTER_SUB_STAGES = [
        { href: "/master/client", label: "Client Master", id: "client" },
        { href: "/master/sc-distribution", label: "SC Distribution", id: "sc-distribution", adminOnly: true },
        { href: "/master/crm-distribution", label: "CRM Distribution", id: "crm-distribution", adminOnly: true },
        { href: "/master/dropdowns", label: "Dropdowns", id: "dropdowns", adminOnly: true },
        { href: "/master/consignors", label: "Consignor Details", id: "consignors", adminOnly: true },
        { href: "/master/items", label: "Items", id: "items", adminOnly: true },
        { href: "/master/tat-config", label: "TAT Configuration", id: "tat-config", adminOnly: true },
        { href: "/master/report-persons", label: "Report Persons", id: "report-persons", adminOnly: true },
    ];

    const visibleMasterSubStages = MASTER_SUB_STAGES.filter(
        (sub) => !sub.adminOnly || (isAdmin && isAdmin())
    );

    const isActive = (item) => (item.href === "/" ? location.pathname === "/" : location.pathname.startsWith(item.match || item.href))
    const countFor = (href) =>
        href === "/call-tracker" ? counts.callTracker : href === "/enquiry-tracker" ? counts.enquiryTracker : null

    // Flat stage-wise navigation. Visibility rules: Report is for everyone,
    // Settings is admin-only, Master Data sub-stages are restricted to Client Master for User role.
    const navItems = [
        { href: "/", label: "Dashboard", icon: HomeIcon },
        { href: "/leads", label: "Leads", icon: UsersIcon },
        { href: "/call-tracker", label: "Call Tracker", icon: PhoneCallIcon },
        { href: "/enquiry-tracker", label: "Enquiry Tracker", icon: BarChartIcon },
        { href: "/quotation", label: "Quotation", icon: FileTextIcon },
        { href: "/report", label: "Report", icon: ShieldIcon },
        { isMaster: true, label: "Master Data", icon: DatabaseIcon },
    ];
    if (isAdmin && isAdmin()) {
        navItems.push({ href: "/setting", label: "Settings", icon: SettingsIcon });
    }

    return (
        <>
            {/* Mobile Sidebar Overlay */}
            {mobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-hidden="true"
                />
            )}

            <aside
                aria-label="Sidebar"
                className={`fixed inset-y-0 left-0 z-50 flex w-56 shrink-0 transform flex-col border-r bg-card transition-[transform,width] duration-300 ease-in-out md:static md:inset-auto md:translate-x-0 ${collapsed ? "md:w-14 2xl:w-14" : "2xl:w-60"} ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
            >
                <div className={`flex h-14 shrink-0 items-center border-b px-4 ${centerWhenCollapsed}`}>
                    <Link to="/" className="flex items-center gap-3" onClick={() => setMobileMenuOpen(false)}>
                        <img src="/divine-logo.svg" alt="Divine" className="h-8 w-auto shrink-0" />
                        <div className={`leading-tight ${hideWhenCollapsed}`}>
                            <p className="text-sm font-semibold">Divine</p>
                            <p className="text-xs text-muted-foreground">Lead to Order</p>
                        </div>
                    </Link>
                </div>

                <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
                    {navItems.map((item) => {
                        if (item.isMaster) {
                            const isMasterActive = location.pathname.startsWith("/master");
                            const Icon = item.icon;
                            return (
                                <div key="master-data-collapsible" className="flex flex-col">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            // The rail has no room for sub-items: expand it first.
                                            if (collapsed) { toggleCollapsed(); setMasterExpanded(true); return; }
                                            setMasterExpanded((prev) => !prev);
                                        }}
                                        title={collapsed ? item.label : undefined}
                                        aria-expanded={masterExpanded}
                                        className={`relative flex h-9 w-full items-center justify-between rounded-md px-3 text-sm transition-colors ${centerWhenCollapsed} ${
                                            isMasterActive
                                                ? "bg-accent font-medium text-foreground before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full before:bg-brand-lime"
                                                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                        }`}
                                    >
                                        <span className="flex min-w-0 items-center gap-3">
                                            <Icon className={`h-4 w-4 shrink-0 ${isMasterActive ? "text-primary" : ""}`} />
                                            <span className={`truncate ${hideWhenCollapsed}`}>{item.label}</span>
                                        </span>
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${masterExpanded ? "rotate-180" : ""} ${hideWhenCollapsed}`}
                                            aria-hidden="true"
                                        >
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                        </svg>
                                    </button>

                                    {masterExpanded && !collapsed && (
                                        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
                                            {visibleMasterSubStages.map((sub) => {
                                                const isSubActive = location.pathname === sub.href || 
                                                    (sub.id === "tat-config" && location.pathname === "/master/tat");
                                                const subCount = sub.id === "client" ? counts.clientMaster : sub.id === "items" ? counts.itemsMaster : null;
                                                return (
                                                    <Link
                                                        key={sub.href}
                                                        to={sub.href}
                                                        onClick={() => setMobileMenuOpen(false)}
                                                        aria-current={isSubActive ? "page" : undefined}
                                                        className={`relative flex h-8 items-center justify-between rounded-md px-2.5 text-xs transition-colors ${
                                                            isSubActive
                                                                ? "bg-accent font-medium text-brand-800"
                                                                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-2 truncate">
                                                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isSubActive ? "bg-brand-lime" : "bg-muted-foreground/40"}`} />
                                                            <span className="truncate">{sub.label}</span>
                                                        </span>
                                                        {subCount !== null && (
                                                            <span className="ml-1.5 shrink-0 rounded bg-primary/10 px-1.5 text-[10px] font-semibold tabular-nums text-brand-700">
                                                                {subCount}
                                                            </span>
                                                        )}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        const active = isActive(item);
                        const Icon = item.icon;
                        const count = countFor(item.href);
                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                onClick={() => setMobileMenuOpen(false)}
                                aria-current={active ? "page" : undefined}
                                title={collapsed ? item.label : undefined}
                                className={`relative flex h-9 items-center justify-between rounded-md px-3 text-sm transition-colors ${centerWhenCollapsed} ${
                                    active
                                        ? "bg-accent font-medium text-foreground before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full before:bg-brand-lime"
                                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                }`}
                            >
                                <span className="flex min-w-0 items-center gap-3">
                                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
                                    <span className={`truncate ${hideWhenCollapsed}`}>{item.label}</span>
                                </span>
                                {count !== null && (
                                    <span className={`ml-2 shrink-0 rounded bg-primary/10 px-1.5 text-xs font-semibold tabular-nums text-brand-700 ${hideWhenCollapsed}`}>
                                        {count}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="shrink-0 border-t p-2">
                    <button
                        type="button"
                        onClick={toggleCollapsed}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        aria-expanded={!collapsed}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        className={`hidden h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground md:flex ${centerWhenCollapsed}`}
                    >
                        {collapsed ? <ChevronsRight className="h-4 w-4 shrink-0" /> : <ChevronsLeft className="h-4 w-4 shrink-0" />}
                        <span className={hideWhenCollapsed}>Collapse</span>
                    </button>
                    <button
                        onClick={logout}
                        title={collapsed ? "Log out" : undefined}
                        className={`flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive ${centerWhenCollapsed}`}
                    >
                        <LogoutIcon className="h-4 w-4 shrink-0" />
                        <span className={hideWhenCollapsed}>Log out</span>
                    </button>
                </div>
            </aside>
        </>
    )
}

export default Sidebar
