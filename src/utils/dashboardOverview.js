// One request for the whole dashboard: lto_dashboard_overview
// (Database/33_dashboard_overview_rpc.sql) returns the metric cards, funnel,
// lead sources, monthly trend, pending tasks and recent activity together.
import { useState, useEffect, useContext } from "react"
import { AuthContext } from "../App"
import supabase from "./supabase"

export const ALL_TIME_START = "2000-01-01" // the dashboard's "All time" range
const DEFAULT_MONTHS_BACK = 6
const MAX_MONTHS = 24 // guard against a pathologically wide custom range

const pad = (n) => String(n).padStart(2, "0")
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const iso = (d) => d.toISOString().slice(0, 10)

// Current/previous windows for the metric cards: honours an explicit
// start/end if the caller passed one, otherwise "this calendar month" vs
// "last calendar month" so the "from last month" wording stays true.
export function getComparisonWindows(startDate, endDate) {
  if (startDate || endDate) {
    const end = endDate ? new Date(endDate) : new Date()
    const start = startDate ? new Date(startDate) : new Date(end.getFullYear(), end.getMonth(), 1)
    const spanMs = end.getTime() - start.getTime()
    const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000)
    const prevStart = new Date(prevEnd.getTime() - spanMs)
    return {
      current: { start: startDate || iso(start), end: endDate || iso(end) },
      previous: { start: iso(prevStart), end: iso(prevEnd) },
      usesCustomRange: true,
    }
  }

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  return {
    current: { start: iso(thisMonthStart), end: null },
    previous: { start: iso(lastMonthStart), end: iso(lastMonthEnd) },
    usesCustomRange: false,
  }
}

// Months shown on the Overview trend: [first month, month after the last).
function getTrendWindow(startDate, endDate) {
  const rangeEnd = endDate ? new Date(endDate) : new Date()
  const rangeStart = startDate
    ? new Date(startDate)
    : new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() - (DEFAULT_MONTHS_BACK - 1), 1)
  const first = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
  const endExclusive = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() + 1, 1)
  const earliest = new Date(endExclusive.getFullYear(), endExclusive.getMonth() - MAX_MONTHS, 1)
  return { start: ymd(first < earliest ? earliest : first), endExclusive: ymd(endExclusive) }
}

// Short-lived cache so coming back to the dashboard within a minute shows the
// numbers straight away instead of re-running every count. Keyed by the exact
// request, so a different user / SC filter / date range never sees another's data.
const CACHE_TTL_MS = 60 * 1000
const overviewCache = new Map()

export async function fetchDashboardOverview({ scNames, startDate, endDate }) {
  const { current, previous, usesCustomRange } = getComparisonWindows(startDate, endDate)
  const trend = getTrendWindow(startDate, endDate)
  const { data, error } = await supabase.rpc("lto_dashboard_overview", {
    p_sc: scNames ?? null,
    p_cur_start: current.start,
    p_cur_end: current.end,
    p_prev_start: previous.start,
    p_prev_end: previous.end,
    p_chart_start: startDate || null,
    p_chart_end: endDate || null,
    p_trend_start: trend.start,
    p_trend_end: trend.endExclusive,
  })
  if (error) throw error
  return { ...data, usesCustomRange, allTime: startDate === ALL_TIME_START && !endDate }
}

// Loads the overview once for the whole dashboard (same scoping the separate
// widgets used: admins see everyone or one SC, other users their own names).
export function useDashboardOverview({ scNameFilter = "all", startDate, endDate } = {}) {
  const { currentUser = null, isAdmin = () => false, getUsernamesToFilter = () => [] } = useContext(AuthContext) || {}

  let scNames = null
  if (isAdmin()) {
    if (scNameFilter !== "all") scNames = [scNameFilter]
  } else if (currentUser?.username) {
    scNames = getUsernamesToFilter()
  }
  const scKey = JSON.stringify(scNames)
  const cacheKey = JSON.stringify([scKey, startDate, endDate])

  const [state, setState] = useState(() => {
    const hit = overviewCache.get(cacheKey)
    return hit && Date.now() - hit.at < CACHE_TTL_MS
      ? { data: hit.data, isLoading: false, error: null }
      : { data: null, isLoading: true, error: null }
  })

  useEffect(() => {
    let cancelled = false
    const hit = overviewCache.get(cacheKey)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setState({ data: hit.data, isLoading: false, error: null })
      return undefined
    }
    setState((s) => ({ ...s, isLoading: true, error: null }))
    fetchDashboardOverview({ scNames: JSON.parse(scKey), startDate, endDate })
      .then((data) => {
        overviewCache.set(cacheKey, { at: Date.now(), data })
        if (!cancelled) setState({ data, isLoading: false, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        console.error("Error fetching dashboard overview:", err)
        setState({ data: null, isLoading: false, error: err.message || "Failed to load the dashboard." })
      })
    return () => { cancelled = true }
  }, [cacheKey, scKey, startDate, endDate])

  return state
}
