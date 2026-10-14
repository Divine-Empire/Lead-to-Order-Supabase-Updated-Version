import { Link, useLocation } from "react-router-dom"
import { HomeIcon, UsersIcon, PhoneCallIcon, BarChartIcon, FileTextIcon, ShieldIcon, LogoutIcon, DatabaseIcon, SettingsIcon } from "./Icons"
import { useContext, useState, useEffect } from "react"
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

    const isActive = (item) => (item.href === "/" ? location.pathname === "/" : location.pathname.startsWith(item.match || item.href))
    const countFor = (href) =>
        href === "/call-tracker" ? counts.callTracker : href === "/enquiry-tracker" ? counts.enquiryTracker : null

    // Grouped navigation. Visibility rules are unchanged: Report is for everyone
    // (admins see system-wide data, others their own SC's), Settings is admin-only.
    const groups = [
        { name: "Overview", items: [{ href: "/", label: "Dashboard", icon: HomeIcon }] },
        {
            name: "Sales pipeline",
            items: [
                { href: "/leads", label: "Leads", icon: UsersIcon },
                { href: "/call-tracker", label: "Call Tracker", icon: PhoneCallIcon },
                { href: "/enquiry-tracker", label: "Enquiry Tracker", icon: BarChartIcon },
                { href: "/quotation", label: "Quotation", icon: FileTextIcon },
            ],
        },
        { name: "Insights", items: [{ href: "/report", label: "Report", icon: ShieldIcon }] },
        { name: "Data", items: [{ href: "/master/client", match: "/master", label: "Master Data", icon: DatabaseIcon }] },
    ]
    if (isAdmin && isAdmin()) {
        groups.push({ name: "Admin", items: [{ href: "/setting", label: "Settings", icon: SettingsIcon }] })
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
                className={`fixed inset-y-0 left-0 z-50 flex w-56 shrink-0 transform flex-col border-r bg-card transition-transform duration-300 ease-in-out md:static md:inset-auto md:translate-x-0 2xl:w-60 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
            >
                <div className="flex h-14 shrink-0 items-center border-b px-4">
                    <Link to="/" className="flex items-center gap-3" onClick={() => setMobileMenuOpen(false)}>
                        <img src="/divine-logo.svg" alt="Divine" className="h-8 w-auto shrink-0" />
                        <div className="leading-tight">
                            <p className="text-sm font-semibold">Divine</p>
                            <p className="text-xs text-muted-foreground">Lead to Order</p>
                        </div>
                    </Link>
                </div>

                <nav aria-label="Main" className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
                    {groups.map((group) => (
                        <div key={group.name} className="flex flex-col gap-0.5">
                            <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{group.name}</p>
                            {group.items.map((item) => {
                                const active = isActive(item)
                                const Icon = item.icon
                                const count = countFor(item.href)
                                return (
                                    <Link
                                        key={item.href}
                                        to={item.href}
                                        onClick={() => setMobileMenuOpen(false)}
                                        aria-current={active ? "page" : undefined}
                                        className={`relative flex h-9 items-center justify-between rounded-md px-3 text-sm transition-colors ${
                                            active
                                                ? "bg-accent font-medium text-foreground before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full before:bg-brand-lime"
                                                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                        }`}
                                    >
                                        <span className="flex min-w-0 items-center gap-3">
                                            <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
                                            <span className="truncate">{item.label}</span>
                                        </span>
                                        {count !== null && (
                                            <span className="ml-2 shrink-0 rounded bg-primary/10 px-1.5 text-xs font-semibold tabular-nums text-brand-700">
                                                {count}
                                            </span>
                                        )}
                                    </Link>
                                )
                            })}
                        </div>
                    ))}
                </nav>

                <div className="shrink-0 border-t p-2">
                    <button
                        onClick={logout}
                        className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                        <LogoutIcon className="h-4 w-4 shrink-0" />
                        <span>Log out</span>
                    </button>
                </div>
            </aside>
        </>
    )
}

export default Sidebar
