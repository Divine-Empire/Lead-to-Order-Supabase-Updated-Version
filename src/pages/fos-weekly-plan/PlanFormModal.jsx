import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import ModalForm from "../../components/ModalForm";
import GroupCombobox from "../../components/GroupCombobox";
import {
  MEETING_TYPES, DAY_NAMES, weekInfo, shortDate, currentWeekStart, addDays,
  fetchPlans, savePlan, fetchClientList, fetchDropdownValues, fetchPlanPersonOptions,
} from "../../utils/fosPlan";

// Add / edit one person's plan for one week: a Location per day and any number
// of meetings per day (category, client, NOB/NOP, visit objective).

const fieldClass = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none";
const emptyMeeting = () => ({ type: "Existing", client: "", nob: "", objective: "" });
const emptyWeek = () => Array.from({ length: 6 }, () => ({ location: "", meetings: [] }));

// Weeks the form offers: a user can plan this week and the next four; an admin
// can also fix the last four weeks.
const weekChoices = (admin) => {
  const now = currentWeekStart();
  const from = admin ? -4 : 0;
  return Array.from({ length: from * -1 + 5 + (admin ? 4 : 0) }, (_, i) => addDays(now, (from + i) * 7));
};

export default function PlanFormModal({ isOpen, onClose, onSaved, admin, ownName, userLabel, initialWeek, initialPerson, showNotification }) {
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [person, setPerson] = useState(admin ? initialPerson || "" : ownName);
  const [days, setDays] = useState(emptyWeek);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [existing, setExisting] = useState(false);
  const [clients, setClients] = useState([]);
  const [nobOptions, setNobOptions] = useState([]);
  const [objectiveOptions, setObjectiveOptions] = useState([]);
  const [personOptions, setPersonOptions] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    fetchClientList().then(setClients).catch((e) => console.error("Client list:", e));
    fetchDropdownValues("fos_nature_of_business").then(setNobOptions).catch((e) => console.error("NOB list:", e));
    fetchDropdownValues("fos_visit_objective").then(setObjectiveOptions).catch((e) => console.error("Objective list:", e));
    if (admin) fetchPlanPersonOptions().then(setPersonOptions).catch((e) => console.error("Person list:", e));
  }, [isOpen, admin]);

  // Load the saved plan for this person + week so the form edits it.
  useEffect(() => {
    if (!isOpen || !person || !weekStart) return undefined;
    let cancelled = false;
    setIsLoading(true);
    fetchPlans([person], [weekStart])
      .then((plans) => {
        if (cancelled) return;
        const plan = plans[0];
        const info = weekInfo(weekStart);
        const next = emptyWeek();
        if (plan) {
          info.days.forEach((date, i) => {
            next[i].location = plan.days.find((d) => d.plan_date === date)?.location || "";
            next[i].meetings = plan.meetings
              .filter((m) => m.plan_date === date)
              .map((m) => ({ type: m.meeting_type, client: m.client_name || "", nob: m.nob_nop || "", objective: m.visit_objective || "" }));
          });
        }
        setDays(next);
        setExisting(Boolean(plan));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Plan load failed:", err);
        showNotification?.("Could not load the plan: " + (err.message || err), "error");
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, person, weekStart, showNotification]);

  const clientNames = useMemo(() => [...new Set(clients.map((c) => c.name))], [clients]);
  const clientIdByName = useMemo(() => new Map(clients.map((c) => [c.name.toLowerCase(), c.uuid])), [clients]);
  const info = weekInfo(weekStart);
  const weeks = useMemo(() => weekChoices(admin), [admin]);
  const withCurrent = (list, value) => (value && !list.includes(value) ? [value, ...list] : list);

  const setDay = (i, patch) => setDays((prev) => prev.map((d, n) => (n === i ? { ...d, ...patch } : d)));
  const setMeeting = (i, j, patch) =>
    setDays((prev) => prev.map((d, n) => (n === i ? { ...d, meetings: d.meetings.map((m, k) => (k === j ? { ...m, ...patch } : m)) } : d)));
  const addMeeting = (i) => setDay(i, { meetings: [...days[i].meetings, emptyMeeting()] });
  const removeMeeting = (i, j) => setDay(i, { meetings: days[i].meetings.filter((_, k) => k !== j) });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!person) {
      showNotification?.("Select the person this plan is for.", "error");
      return;
    }
    const meetings = [];
    for (let i = 0; i < days.length; i += 1) {
      for (const m of days[i].meetings) {
        const client = m.client.trim();
        const blank = !client && !m.nob && !m.objective;
        if (blank) continue; // an untouched row is dropped
        if (!client) {
          showNotification?.(`${DAY_NAMES[i]}: add the Client Name for each meeting (or remove the row).`, "error");
          return;
        }
        meetings.push({
          plan_date: info.days[i],
          meeting_type: m.type,
          client_name: client,
          client_id: clientIdByName.get(client.toLowerCase()) || null,
          nob_nop: m.nob || null,
          visit_objective: m.objective || null,
        });
      }
    }
    const dayRows = days.map((d, i) => ({ plan_date: info.days[i], location: d.location.trim() })).filter((d) => d.location);
    if (meetings.length === 0 && dayRows.length === 0) {
      showNotification?.("Add a location or at least one meeting before saving.", "error");
      return;
    }
    setIsSaving(true);
    try {
      await savePlan({ person, weekStart, days: dayRows, meetings, user: userLabel });
      showNotification?.(existing ? "Plan updated" : "Plan saved", "success");
      onSaved?.({ person, weekStart });
      onClose();
    } catch (err) {
      console.error("Plan save failed:", err);
      showNotification?.("Could not save the plan: " + (err.message || err), "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalForm
      isOpen={isOpen}
      onClose={onClose}
      title={existing ? "Edit Weekly Plan" : "Add Weekly Plan"}
      onSubmit={handleSubmit}
      submitText={isSaving ? "Saving..." : "Save Plan"}
      submitDisabled={isSaving || isLoading}
      maxWidth="max-w-4xl"
      maxHeight="85vh"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="plan-week" className="block text-sm font-medium text-foreground">Week</label>
          <select id="plan-week" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className={fieldClass}>
            {weeks.map((w) => (
              <option key={w} value={w}>{weekInfo(w).label} - FY {weekInfo(w).fyLabel}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="plan-person" className="block text-sm font-medium text-foreground">Field Sales Person</label>
          {admin ? (
            <select id="plan-person" value={person} onChange={(e) => setPerson(e.target.value)} className={fieldClass}>
              <option value="">Select person</option>
              {withCurrent(personOptions, person).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            <input id="plan-person" type="text" value={ownName} readOnly className={`${fieldClass} bg-secondary text-muted-foreground`} />
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {isLoading ? "Loading saved plan..." : existing ? "A plan already exists for this week. Saving replaces it with what is below." : "No plan saved for this week yet."}
      </p>

      <div className="space-y-3">
        {info.days.map((date, i) => (
          <section key={date} className="rounded-lg border bg-secondary/30 p-3" aria-label={`${DAY_NAMES[i]} ${shortDate(date)}`}>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h3 className="w-24 text-sm font-semibold text-foreground">{DAY_NAMES[i]}, {shortDate(date)}</h3>
              <div className="min-w-[200px] flex-1">
                <label htmlFor={`plan-loc-${i}`} className="sr-only">Location for {DAY_NAMES[i]}</label>
                <input
                  id={`plan-loc-${i}`}
                  type="text"
                  value={days[i].location}
                  onChange={(e) => setDay(i, { location: e.target.value })}
                  placeholder="Location (city / area)"
                  className={fieldClass}
                />
              </div>
            </div>

            {days[i].meetings.map((m, j) => (
              <div key={j} className="mb-2 grid grid-cols-1 items-end gap-2 rounded-md border bg-card p-2 sm:grid-cols-2 lg:grid-cols-[150px_1.4fr_1fr_1fr_auto]">
                <div>
                  <label className="mb-0.5 block text-xs text-muted-foreground" htmlFor={`plan-type-${i}-${j}`}>Category</label>
                  <select id={`plan-type-${i}-${j}`} value={m.type} onChange={(e) => setMeeting(i, j, { type: e.target.value })} className={fieldClass}>
                    {MEETING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-muted-foreground" htmlFor={`plan-client-${i}-${j}`}>Client Name</label>
                  <GroupCombobox
                    id={`plan-client-${i}-${j}`}
                    value={m.client}
                    options={clientNames}
                    onChange={(v) => setMeeting(i, j, { client: v })}
                    placeholder="Search client or type a new one"
                    createLabel="Use new client"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-muted-foreground" htmlFor={`plan-nob-${i}-${j}`}>NOB/NOP</label>
                  <select id={`plan-nob-${i}-${j}`} value={m.nob} onChange={(e) => setMeeting(i, j, { nob: e.target.value })} className={fieldClass}>
                    <option value="">Select</option>
                    {withCurrent(nobOptions, m.nob).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-muted-foreground" htmlFor={`plan-obj-${i}-${j}`}>Visit Objective</label>
                  <select id={`plan-obj-${i}-${j}`} value={m.objective} onChange={(e) => setMeeting(i, j, { objective: e.target.value })} className={fieldClass}>
                    <option value="">Select</option>
                    {withCurrent(objectiveOptions, m.objective).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeMeeting(i, j)}
                  aria-label={`Remove meeting ${j + 1} on ${DAY_NAMES[i]}`}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => addMeeting(i)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Plus size={14} aria-hidden="true" />
              Add meeting
            </button>
          </section>
        ))}
      </div>
    </ModalForm>
  );
}
