import { useState, useEffect, useRef, useContext, useCallback, useMemo } from "react";
import { RefreshCw, Plus } from "lucide-react";
import { FilterSearch, filterControlClass } from "../../components/FilterBar";
import LoadingSpinner from "../../components/LoadingSpinner";
import supabase from "../../utils/supabase";
import { AuthContext } from "../../App";
import {
  DAY_NAMES, weekInfo, weeksOfFy, shortDate, currentWeekStart, previousWeekStart, currentFyStartYear, fyLabelOf,
  fetchPlans, fetchPlanPeople,
} from "../../utils/fosPlan";
import PlanFormModal from "./PlanFormModal";

// Weekly Plan: a Field Sales Person's Mon-Sat visit plan. Each day shows the
// selected ("current") week with the week before it right underneath, so the two
// can be compared at a glance. Users see their own plan; admins see everyone's;
// a HOD also sees the people listed in Settings > FOS Enquiries alternate access
// (view only). Data: Database/36_fos_weekly_plans.sql.

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toUpperCase();

const TYPE_STYLE = {
  Existing: "bg-info/10 text-info",
  "MDO / Important Projects": "bg-warning/15 text-warning-foreground",
  "Self Identified": "bg-success/15 text-success",
  Referral: "bg-primary/10 text-primary",
};

function MeetingCard({ m }) {
  return (
    <li className="rounded-md border bg-card px-2 py-1.5">
      <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_STYLE[m.meeting_type] || "bg-secondary text-foreground"}`}>{m.meeting_type}</span>
      <p className="mt-0.5 text-sm font-medium text-foreground break-words">{m.client_name || "-"}</p>
      {(m.nob_nop || m.visit_objective) && (
        <p className="text-xs text-muted-foreground">{[m.nob_nop, m.visit_objective].filter(Boolean).join(" | ")}</p>
      )}
    </li>
  );
}

// One week's slot inside a day: label, location and that day's meetings.
function DaySlot({ title, date, plan, search, tone }) {
  const location = plan?.days.find((d) => d.plan_date === date)?.location;
  const meetings = (plan?.meetings || [])
    .filter((m) => m.plan_date === date)
    .filter((m) => !search || (m.client_name || "").toLowerCase().includes(search));
  return (
    <div className={`rounded-md border p-2 ${tone === "current" ? "bg-card" : "bg-secondary/40"}`}>
      <p className="flex items-center justify-between text-xs">
        <span className={`font-semibold ${tone === "current" ? "text-primary" : "text-muted-foreground"}`}>{title}</span>
        <span className="tabular-nums text-muted-foreground">{shortDate(date)}</span>
      </p>
      <p className="mt-1 min-h-[1.25rem] text-sm text-foreground">{location || <span className="text-muted-foreground">-</span>}</p>
      {meetings.length > 0 ? (
        <ul className="mt-1.5 space-y-1.5">{meetings.map((m, i) => <MeetingCard key={i} m={m} />)}</ul>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">{plan ? "No meetings" : "No plan"}</p>
      )}
    </div>
  );
}

function PersonBlock({ person, current, previous, curInfo, prevInfo, search }) {
  const meetingCount = (p) => (p ? p.meetings.length : 0);
  return (
    <section className="rounded-lg border bg-card p-3 shadow-sm" aria-label={`Plan of ${person}`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{person}</h3>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-primary">{curInfo.label}</span>: {current ? `${meetingCount(current)} meetings` : "no plan yet"}
          {" | "}
          {prevInfo.label}: {previous ? `${meetingCount(previous)} meetings` : "no plan"}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {DAY_NAMES.map((name, i) => (
          <div key={name} className="space-y-1.5">
            <h4 className="text-xs font-semibold text-foreground">{name}</h4>
            <DaySlot title="Current" date={curInfo.days[i]} plan={current} search={search} tone="current" />
            <DaySlot title="Previous" date={prevInfo.days[i]} plan={previous} search={search} tone="previous" />
          </div>
        ))}
      </div>
    </section>
  );
}

function FosWeeklyPlan() {
  const { showNotification, currentUser, isAdmin } = useContext(AuthContext) || {};
  const admin = Boolean(isAdmin && isAdmin());
  const ownName = norm(currentUser?.fullName);

  const thisWeek = currentWeekStart();
  const [fyStart, setFyStart] = useState(currentFyStartYear());
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [person, setPerson] = useState(""); // "" = everyone allowed
  const [searchQuery, setSearchQuery] = useState("");
  const [allowedNames, setAllowedNames] = useState(undefined); // non-admin: own name + HOD extras
  const [adminPeople, setAdminPeople] = useState([]);
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const fetchIdRef = useRef(0);

  // Non-admin: whose plans can be viewed = own name + the Settings list (read fresh).
  useEffect(() => {
    let cancelled = false;
    if (admin) {
      setAllowedNames(null);
      fetchPlanPeople().then((n) => { if (!cancelled) setAdminPeople(n); }).catch(() => {});
      return undefined;
    }
    (async () => {
      let extra = [];
      try {
        const { data, error } = await supabase.from("login").select("fos_alternate_access").eq("username", currentUser?.username || "").maybeSingle();
        if (error) throw error;
        extra = data?.fos_alternate_access || [];
      } catch (err) {
        console.error("Could not load alternate access:", err);
      }
      if (!cancelled) setAllowedNames([...new Set([ownName, ...extra.map(norm)].filter(Boolean))]);
    })();
    return () => { cancelled = true; };
  }, [admin, currentUser?.username, ownName]);

  const previousWeek = previousWeekStart(weekStart);
  const curInfo = useMemo(() => weekInfo(weekStart), [weekStart]);
  const prevInfo = useMemo(() => weekInfo(previousWeek), [previousWeek]);

  const fetchData = useCallback(async () => {
    if (allowedNames === undefined) return;
    fetchIdRef.current += 1;
    const id = fetchIdRef.current;
    setIsLoading(true);
    try {
      const names = person ? [person] : allowedNames; // null = everyone (admin)
      const data = await fetchPlans(names, [weekStart, previousWeek]);
      if (id !== fetchIdRef.current) return;
      setPlans(data);
    } catch (err) {
      if (id !== fetchIdRef.current) return;
      console.error("Error fetching weekly plans:", err);
      showNotification?.("Failed to fetch plans: " + err.message, "error");
    } finally {
      if (id === fetchIdRef.current) setIsLoading(false);
    }
  }, [allowedNames, person, weekStart, previousWeek, showNotification]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fyOptions = useMemo(() => {
    const now = currentFyStartYear();
    return [now, now - 1, now - 2];
  }, []);
  const weekOptions = useMemo(() => weeksOfFy(fyStart), [fyStart]);

  const changeFy = (year) => {
    setFyStart(year);
    const weeks = weeksOfFy(year);
    // keep the current week when it is in that year, otherwise its last (past) or first (future) week
    setWeekStart(weeks.includes(thisWeek) ? thisWeek : weeks[weeks.length - 1] < thisWeek ? weeks[weeks.length - 1] : weeks[0]);
  };

  const people = admin ? adminPeople : (allowedNames || []);
  const search = searchQuery.trim().toLowerCase();

  // One block per person: admin = people who have a plan in either week; others = every allowed person (own name always).
  const blocks = useMemo(() => {
    const byPerson = new Map();
    plans.forEach((p) => {
      const key = norm(p.fos_name);
      if (!byPerson.has(key)) byPerson.set(key, { person: p.fos_name, current: null, previous: null });
      byPerson.get(key)[p.week_start === weekStart ? "current" : "previous"] = p;
    });
    if (!admin && allowedNames && !person) {
      // own block is always shown, so the user can see "no plan yet"
      if (ownName && !byPerson.has(ownName)) byPerson.set(ownName, { person: ownName, current: null, previous: null });
    } else if (!admin && person && !byPerson.has(person)) {
      byPerson.set(person, { person, current: null, previous: null });
    }
    let list = [...byPerson.values()].sort((a, b) => norm(a.person).localeCompare(norm(b.person)));
    if (!admin) list = list.sort((a, b) => (norm(b.person) === ownName) - (norm(a.person) === ownName));
    if (search) {
      list = list.filter((b) => [b.current, b.previous].some((p) => p && p.meetings.some((m) => (m.client_name || "").toLowerCase().includes(search))));
    }
    return list;
  }, [plans, weekStart, admin, allowedNames, person, ownName, search]);

  const canPickPerson = people.length > 1 || admin;
  const hasFilters = Boolean(searchQuery || person);
  // A user plans from this week on; admins may fix earlier weeks too.
  const modalWeek = admin || weekStart >= thisWeek ? weekStart : thisWeek;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 gap-3">
      <div className="flex flex-wrap items-center gap-2 shrink-0 w-full">
        <h2 className="mr-2 text-base font-semibold text-foreground shrink-0">Weekly Plan</h2>

        <select aria-label="Financial year" value={fyStart} onChange={(e) => changeFy(Number(e.target.value))} className={`${filterControlClass} !w-auto min-w-[120px]`}>
          {fyOptions.map((y) => <option key={y} value={y}>FY {fyLabelOf(y)}</option>)}
        </select>

        <select aria-label="Week" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className={`${filterControlClass} !w-auto min-w-[220px]`}>
          {weekOptions.map((w) => (
            <option key={w} value={w}>{weekInfo(w).label}{w === thisWeek ? " - this week" : ""}</option>
          ))}
        </select>

        {canPickPerson && (
          <select aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)} className={`${filterControlClass} !w-auto min-w-[180px] max-w-[240px]`}>
            <option value="">{admin ? "All people" : "Me and my team"}</option>
            {people.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}

        <FilterSearch value={searchQuery} onChange={setSearchQuery} placeholder="Client name..." className="max-w-[260px]" />

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {hasFilters && (
            <button
              type="button"
              className="h-9 px-3 text-sm font-medium text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-md transition-colors shrink-0"
              onClick={() => { setSearchQuery(""); setPerson(""); }}
            >
              Clear Filter
            </button>
          )}
          <button
            type="button"
            onClick={fetchData}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Refresh plans"
            title="Refresh"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus size={16} aria-hidden="true" />
            Add / Edit Plan
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && plans.length === 0 ? (
          <LoadingSpinner message="Loading plans..." minHeight="200px" />
        ) : blocks.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">No plans found</p>
            <p className="text-xs text-muted-foreground">
              {search ? "No client matches this search in these two weeks." : `Nobody has a plan for ${curInfo.label} or ${prevInfo.label} yet.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3 pb-3">
            {blocks.map((b) => (
              <PersonBlock key={norm(b.person)} person={b.person} current={b.current} previous={b.previous} curInfo={curInfo} prevInfo={prevInfo} search={search} />
            ))}
          </div>
        )}
      </div>

      <PlanFormModal
        key={modalOpen ? "open" : "closed"}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => fetchData()}
        admin={admin}
        ownName={ownName}
        userLabel={currentUser?.fullName || currentUser?.username}
        initialWeek={modalWeek}
        initialPerson={person}
        showNotification={showNotification}
      />
    </div>
  );
}

export default FosWeeklyPlan;
