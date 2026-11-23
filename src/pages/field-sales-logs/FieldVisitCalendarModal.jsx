import { useState, useEffect, useMemo, useId } from "react";
import { ChevronLeft, ChevronRight, X, MapPin, Loader2 } from "lucide-react";
import useDialogBehavior from "../../components/useDialogBehavior";
import { listAssigned } from "../../utils/fosAssigned";
import { formatMeeting } from "./AssignedEnquiries";

// Field visit calendar: assigned meetings by date, with company and address.
// Admin sees every person (filterable); a field person sees only their own.

const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const COLORS = [
  "border-emerald-200 bg-emerald-50 text-emerald-800",
  "border-indigo-200 bg-indigo-50 text-indigo-800",
  "border-amber-200 bg-amber-50 text-amber-800",
  "border-rose-200 bg-rose-50 text-rose-800",
  "border-sky-200 bg-sky-50 text-sky-800",
  "border-violet-200 bg-violet-50 text-violet-800",
  "border-cyan-200 bg-cyan-50 text-cyan-800",
  "border-orange-200 bg-orange-50 text-orange-800",
];
const colorOf = (name) => {
  let h = 0;
  for (const ch of String(name || "")) h = ch.charCodeAt(0) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
};

const timeOf = (v) => {
  const m = String(v || "").match(/[T ](\d{2}):(\d{2})/);
  if (!m) return "";
  const h = Number(m[1]);
  return `${pad(h % 12 || 12)}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
};

export default function FieldVisitCalendarModal({ isOpen, onClose, names, admin }) {
  const dialogRef = useDialogBehavior(onClose);
  const titleId = useId();
  const today = new Date();
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [person, setPerson] = useState("");
  const [selected, setSelected] = useState(ymd(today.getFullYear(), today.getMonth(), today.getDate()));
  const namesKey = JSON.stringify(names);

  // 6-week Monday-first grid for the month.
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const lead = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(view.y, view.m, 1 - lead + i);
      return { key: ymd(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: d.getMonth() === view.m };
    });
  }, [view]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setIsLoading(true);
    setError("");
    listAssigned({ names: JSON.parse(namesKey), from: cells[0].key, to: cells[41].key, limit: 1000, offset: 0 })
      .then((res) => { if (!cancelled) setItems(res.rows); })
      .catch((e) => { if (!cancelled) { console.error("Calendar load failed:", e); setError(e.message || String(e)); setItems([]); } })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, namesKey, cells]);

  const people = useMemo(() => [...new Set(items.flatMap((i) => i.assigned_to || []))].sort((a, b) => a.localeCompare(b)), [items]);
  const byDay = useMemo(() => {
    const map = new Map();
    items
      .filter((i) => !person || (i.assigned_to || []).includes(person))
      .forEach((i) => {
        const k = String(i.meeting_at).slice(0, 10);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(i);
      });
    map.forEach((list) => list.sort((a, b) => String(a.meeting_at).localeCompare(String(b.meeting_at))));
    return map;
  }, [items, person]);

  const move = (delta) => setView((v) => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const goToday = () => { setView({ y: today.getFullYear(), m: today.getMonth() }); setSelected(ymd(today.getFullYear(), today.getMonth(), today.getDate())); };
  const todayKey = ymd(today.getFullYear(), today.getMonth(), today.getDate());
  const dayItems = byDay.get(selected) || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 lg:left-56 2xl:left-60">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border bg-card shadow-lg">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <h2 id={titleId} className="mr-2 text-base font-semibold text-foreground">Field Visit Calendar</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => move(-1)} aria-label="Previous month" className="flex h-8 w-8 items-center justify-center rounded-md border border-input hover:bg-accent"><ChevronLeft size={16} aria-hidden="true" /></button>
            <span className="min-w-[8.5rem] text-center text-sm font-medium">{MONTHS[view.m]} {view.y}</span>
            <button type="button" onClick={() => move(1)} aria-label="Next month" className="flex h-8 w-8 items-center justify-center rounded-md border border-input hover:bg-accent"><ChevronRight size={16} aria-hidden="true" /></button>
            <button type="button" onClick={goToday} className="ml-1 h-8 rounded-md border border-input px-2.5 text-xs font-medium hover:bg-accent">Today</button>
          </div>
          {admin && (
            <select aria-label="Filter by person" value={person} onChange={(e) => setPerson(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-sm">
              <option value="">All persons</option>
              {people.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {isLoading && <Loader2 size={16} className="animate-spin text-muted-foreground" aria-label="Loading" />}
          <button type="button" onClick={onClose} aria-label="Close calendar" className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X size={18} aria-hidden="true" /></button>
        </div>

        {error && <p role="alert" className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">Could not load the calendar: {error}</p>}

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_320px] lg:overflow-hidden">
          <div className="min-w-0 p-3 lg:overflow-y-auto">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
              {DOW.map((d) => <div key={d} className="bg-secondary px-1 py-1.5 text-center text-xs font-semibold text-brand-800">{d}</div>)}
              {cells.map((c) => {
                const list = byDay.get(c.key) || [];
                const isSel = c.key === selected;
                return (
                  <button
                    type="button"
                    key={c.key}
                    onClick={() => setSelected(c.key)}
                    aria-label={`${c.key}, ${list.length} meeting${list.length === 1 ? "" : "s"}`}
                    aria-pressed={isSel}
                    className={`flex min-h-[84px] flex-col items-stretch gap-0.5 bg-card p-1 text-left align-top transition-colors hover:bg-accent/40 ${c.inMonth ? "" : "opacity-45"} ${isSel ? "ring-2 ring-inset ring-primary" : ""}`}
                  >
                    <span className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs ${c.key === todayKey ? "bg-primary font-semibold text-primary-foreground" : "text-foreground"}`}>{c.day}</span>
                    {list.slice(0, 2).map((i) => (
                      <span key={i.id} className={`truncate rounded border px-1 py-0.5 text-[11px] leading-tight ${colorOf((i.assigned_to || [])[0])}`}>
                        {timeOf(i.meeting_at)} {i.company_name}
                      </span>
                    ))}
                    {list.length > 2 && <span className="px-1 text-[11px] font-medium text-muted-foreground">+{list.length - 2} more</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="border-t p-3 lg:overflow-y-auto lg:border-l lg:border-t-0" aria-label="Meetings on the selected day">
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              {selected.split("-").reverse().join("/")} <span className="font-normal text-muted-foreground">({dayItems.length} meeting{dayItems.length === 1 ? "" : "s"})</span>
            </h3>
            {dayItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No meetings on this day.</p>
            ) : (
              <ul className="space-y-2">
                {dayItems.map((i) => (
                  <li key={i.id} className={`rounded-md border p-2.5 text-sm ${colorOf((i.assigned_to || [])[0])}`}>
                    <p className="font-semibold">{timeOf(i.meeting_at)} - {i.company_name}</p>
                    <p className="text-xs opacity-80">{i.display_no}{i.client_type ? ` | ${i.client_type}` : ""}{i.person_name ? ` | ${i.person_name}` : ""}</p>
                    {i.address && <p className="mt-1 flex items-start gap-1 text-xs"><MapPin size={12} className="mt-0.5 shrink-0" aria-hidden="true" /><span className="break-words">{i.address}</span></p>}
                    <p className="mt-1 text-xs"><span className="opacity-70">Assigned to:</span> {(i.assigned_to || []).join(", ")}</p>
                    <span className="sr-only">{formatMeeting(i.meeting_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
