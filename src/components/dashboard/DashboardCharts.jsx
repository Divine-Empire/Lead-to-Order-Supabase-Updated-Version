"use client"

import { useState, useEffect, useContext } from "react"
import { AuthContext } from "../../App" // Import AuthContext
import supabase from "../../utils/supabase" // Import your Supabase client
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import StatusTabs from "../StatusTabs"
import LoadingSpinner from "../LoadingSpinner"

// Chart colours. Categorical hues are used in fixed order (never cycled); the set was validated
// for colour-blind separation and 3:1 contrast on white. Beyond six series everything folds
// into a neutral grey. The funnel is ordinal, so it uses one hue (brand blue) dark -> light.
const CATEGORICAL = ["#2274B8", "#E8702A", "#6C5CC9", "#6A9E0A", "#D6578C", "#B07D00"]
const OTHER_COLOR = "#8A9BB0"
const FUNNEL = ["#174D7C", "#2274B8", "#4F97D6", "#8FBDE8"]
const INK = "#172030"
const INK_MUTED = "#4B5A6E"
const GRID = "#DBE3EC"

const tooltipProps = {
  contentStyle: { borderRadius: 8, border: "1px solid " + GRID, fontSize: 12, color: INK },
  cursor: { fill: "rgba(34, 116, 184, 0.08)" },
}
const legendFormatter = (value) => <span style={{ color: INK, fontSize: 12 }}>{value}</span>

// Percentage labels stay in ink (a light slice colour would make the text unreadable)
const renderPercentLabel = ({ cx, cy, midAngle, outerRadius, percent }) => {
  const RAD = Math.PI / 180
  const r = outerRadius + 14
  const x = cx + r * Math.cos(-midAngle * RAD)
  const y = cy + r * Math.sin(-midAngle * RAD)
  return (
    <text x={x} y={y} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={12} fill={INK}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

// Months back shown on the Overview trend chart when no explicit date range
// is given. Kept at the module scope since the bucket-building helpers below
// don't need component re-creation.
const DEFAULT_MONTHS_BACK = 6
const MAX_MONTHS = 24 // guard against a pathologically wide custom range

// Builds one empty {key, label, leads, enquiries, orders} bucket per
// calendar month from `start` to `end` inclusive (both Date objects,
// normalised to the 1st of their month).
function buildMonthBuckets(start, end) {
  const buckets = []
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cursor <= last && buckets.length < MAX_MONTHS) {
    buckets.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
      month: cursor.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      leads: 0,
      enquiries: 0,
      orders: 0,
    })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return buckets
}

function monthKeyOf(dateStr) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${d.getMonth()}`
}

// Fetches every row's `created_at` (and `select` extras) in [startIso, endIso)
// for `table`, applying `extraFilters`, paginated past PostgREST's 1000-row
// cap -- same pattern used elsewhere in this codebase (e.g. Leads.jsx's
// client_master fetch) for exactly the same reason.
async function fetchAllForMonthRange(table, { select = "created_at", startIso, endIsoExclusive, extraFilters }) {
  let all = []
  let from = 0
  const step = 1000
  for (;;) {
    let q = supabase.from(table).select(select).gte("created_at", startIso).lt("created_at", endIsoExclusive)
    if (extraFilters) q = extraFilters(q)
    const { data, error } = await q.range(from, from + step - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < step) break
    from += step
  }
  return all
}

function DashboardCharts({ scNameFilter = "all", startDate, endDate }) {
  const authContext = useContext(AuthContext) || {}
  const {
    currentUser = null,
    isAdmin = () => false,
    getUsernamesToFilter = () => []
  } = authContext
  const [activeTab, setActiveTab] = useState("overview")
  const [leadData, setLeadData] = useState([])
  const [conversionData, setConversionData] = useState([])
  const [sourceData, setSourceData] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)

        // Fetch counts for conversion funnel
        let totalLeads = 0
        let totalEnquiries = 0
        let totalQuotations = 0
        let totalOrders = 0

        // --- 1. LEADS COUNT ---
        let leadsCountQuery = supabase
          .from('lto_leads')
          .select('*', { count: 'exact', head: true })

        // Apply SC Name Filter
        if (isAdmin()) {
          if (scNameFilter !== "all") {
            leadsCountQuery = leadsCountQuery.eq('sc_name', scNameFilter)
          }
        } else if (currentUser?.username) {
          // Standard user filter
          const usernamesToFilter = getUsernamesToFilter()
          leadsCountQuery = leadsCountQuery.in('sc_name', usernamesToFilter)
        }

        // Apply Date Filter
        // Helper to adjust end date to cover the full day
        const getEndDateWithTime = (date) => {
          if (!date) return null
          return `${date}T23:59:59`
        }

        if (startDate) {
          leadsCountQuery = leadsCountQuery.gte('created_at', startDate)
        }
        if (endDate) {
          leadsCountQuery = leadsCountQuery.lte('created_at', getEndDateWithTime(endDate))
        }

        const { count: leadsCount, error: leadsCountError } = await leadsCountQuery

        if (!leadsCountError) {
          totalLeads = leadsCount || 0
        }

        // --- 2. ENQUIRIES COUNT ---
        let enquiryCountQuery = supabase
          .from('lto_enquiries')
          .select('*', { count: 'exact', head: true })

        if (isAdmin()) {
          if (scNameFilter !== "all") {
            enquiryCountQuery = enquiryCountQuery.eq('sales_coordinator_name', scNameFilter)
          }
        } else if (currentUser?.username) {
          const usernamesToFilter = getUsernamesToFilter()
          enquiryCountQuery = enquiryCountQuery.in('sales_coordinator_name', usernamesToFilter)
        }

        if (startDate) {
          enquiryCountQuery = enquiryCountQuery.gte('created_at', startDate)
        }
        if (endDate) {
          enquiryCountQuery = enquiryCountQuery.lte('created_at', getEndDateWithTime(endDate))
        }

        const { count: enquiriesCount, error: enquiriesCountError } = await enquiryCountQuery
        if (!enquiriesCountError) {
          totalEnquiries = enquiriesCount || 0
        }

        // --- 3. QUOTATIONS COUNT ---
        // (rows with quotation_number not null) -- enquiry_tracker has no SC
        // name column of its own (it's only linked to enquiries via enquiry_id),
        // so this count isn't filterable by SC.
        let quotationsCountQuery = supabase
          .from('lto_enquiry_tracker')
          .select('*', { count: 'exact', head: true })
          .not('quotation_number', 'is', null)
          .neq('quotation_number', '')

        if (startDate) {
          quotationsCountQuery = quotationsCountQuery.gte('created_at', startDate)
        }
        if (endDate) {
          quotationsCountQuery = quotationsCountQuery.lte('created_at', getEndDateWithTime(endDate))
        }

        const { count: quotationsCount, error: quotationsCountError } = await quotationsCountQuery

        if (!quotationsCountError) {
          totalQuotations = quotationsCount || 0
        }

        // --- 4. ORDERS COUNT ---
        // (where is_order_received_status = "yes")
        let ordersCountQuery = supabase
          .from('lto_enquiry_tracker')
          .select('*', { count: 'exact', head: true })
          .eq('is_order_received_status', 'yes')

        if (startDate) {
          ordersCountQuery = ordersCountQuery.gte('created_at', startDate)
        }
        if (endDate) {
          ordersCountQuery = ordersCountQuery.lte('created_at', getEndDateWithTime(endDate))
        }

        const { count: ordersCount, error: ordersCountError } = await ordersCountQuery

        if (!ordersCountError) {
          totalOrders = ordersCount || 0
        }

        // Create conversion data
        const newConversionData = [
          { name: "Leads", value: totalLeads, color: FUNNEL[0] },
          { name: "Enquiries", value: totalEnquiries, color: FUNNEL[1] },
          { name: "Quotations", value: totalQuotations, color: FUNNEL[2] },
          { name: "Orders", value: totalOrders, color: FUNNEL[3] }
        ]

        setConversionData(newConversionData)

        // --- LEADS SOURCES ---
        let leadSourcesQuery = supabase
          .from('lto_leads')
          .select('lead_source')

        if (isAdmin()) {
          if (scNameFilter !== "all") {
            leadSourcesQuery = leadSourcesQuery.eq('sc_name', scNameFilter)
          }
        } else if (currentUser?.username) {
          const usernamesToFilter = getUsernamesToFilter()
          leadSourcesQuery = leadSourcesQuery.in('sc_name', usernamesToFilter)
        }

        if (startDate) {
          leadSourcesQuery = leadSourcesQuery.gte('created_at', startDate)
        }
        if (endDate) {
          leadSourcesQuery = leadSourcesQuery.lte('created_at', getEndDateWithTime(endDate))
        }

        const { data: leadSourcesData, error: leadSourcesError } = await leadSourcesQuery

        if (!leadSourcesError && leadSourcesData) {
          // Count leads by source
          const sourceCounter = {}

          leadSourcesData.forEach(row => {
            if (row.lead_source) {
              const source = row.lead_source
              sourceCounter[source] = (sourceCounter[source] || 0) + 1
            }
          })

          // Convert to array format for the chart
          const sourceNames = Object.keys(sourceCounter)
          const newSourceData = sourceNames.map((name, index) => ({
            name,
            value: sourceCounter[name],
            color: CATEGORICAL[index] || OTHER_COLOR
          }))

          // Sort by value (descending)
          newSourceData.sort((a, b) => b.value - a.value)

          if (newSourceData.length > 0) {
            setSourceData(newSourceData)
          } else {
            // If filter yields no results, maybe empty? or keep previous/empty
            setSourceData([])
          }
        }

        // --- OVERVIEW TREND (real monthly buckets, not a single-month stub) ---
        // One lightweight `created_at`-only fetch per table across the whole
        // window, bucketed client-side by month -- 3 queries total no matter
        // how many months are shown, instead of one query per month.
        const rangeEnd = endDate ? new Date(endDate) : new Date()
        const rangeStart = startDate
          ? new Date(startDate)
          : new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() - (DEFAULT_MONTHS_BACK - 1), 1)
        const buckets = buildMonthBuckets(rangeStart, rangeEnd)
        const bucketByKey = new Map(buckets.map((b) => [b.key, b]))
        const startIso = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1).toISOString()
        const endIsoExclusive = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() + 1, 1).toISOString()

        const [monthlyLeads, monthlyEnquiries, monthlyOrders] = await Promise.all([
          fetchAllForMonthRange("lto_leads", {
            startIso, endIsoExclusive,
            extraFilters: (q) => {
              if (isAdmin()) return scNameFilter !== "all" ? q.eq("sc_name", scNameFilter) : q
              if (currentUser?.username) return q.in("sc_name", getUsernamesToFilter())
              return q
            },
          }),
          fetchAllForMonthRange("lto_enquiries", {
            startIso, endIsoExclusive,
            extraFilters: (q) => {
              if (isAdmin()) return scNameFilter !== "all" ? q.eq("sales_coordinator_name", scNameFilter) : q
              if (currentUser?.username) return q.in("sales_coordinator_name", getUsernamesToFilter())
              return q
            },
          }),
          fetchAllForMonthRange("lto_enquiry_tracker", {
            startIso, endIsoExclusive,
            extraFilters: (q) => q.eq("is_order_received_status", "yes"),
          }),
        ])

        monthlyLeads.forEach((row) => {
          const b = bucketByKey.get(monthKeyOf(row.created_at))
          if (b) b.leads += 1
        })
        monthlyEnquiries.forEach((row) => {
          const b = bucketByKey.get(monthKeyOf(row.created_at))
          if (b) b.enquiries += 1
        })
        monthlyOrders.forEach((row) => {
          const b = bucketByKey.get(monthKeyOf(row.created_at))
          if (b) b.orders += 1
        })

        setLeadData(buckets)

      } catch (error) {
        console.error("Error fetching chart data:", error)
        setError(error.message || "Failed to load chart data.")
        setLeadData([])
        setConversionData([])
        setSourceData([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [currentUser, isAdmin, scNameFilter, startDate, endDate]) // Add dependencies

  return (
    <div>
      <div className="mb-4 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <h2 id="sales-analytics" className="text-base font-semibold text-foreground">Sales analytics: lead to order</h2>
        <StatusTabs
          label="Chart views"
          activeTab={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "conversion", label: "Conversion" },
            { id: "sources", label: "Enquiry Sources" },
          ]}
        />
      </div>

      {isLoading ? (
        <LoadingSpinner message="Loading chart data..." minHeight="350px" />
      ) : error ? (
        <div role="alert" className="flex h-[350px] flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium text-destructive">Unable to load chart data</p>
          <p className="text-xs text-muted-foreground">{error} -- try refreshing the page.</p>
        </div>
      ) : (
        <div className="h-[350px]">
          {activeTab === "overview" && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leadData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} barGap={4}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: INK_MUTED, fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: INK_MUTED, fontSize: 12 }} allowDecimals={false} />
                <Tooltip {...tooltipProps} />
                <Legend formatter={legendFormatter} />
                <Bar dataKey="leads" name="Leads" fill={CATEGORICAL[0]} radius={[4, 4, 0, 0]} maxBarSize={48} />
                <Bar dataKey="enquiries" name="Enquiries" fill={CATEGORICAL[1]} radius={[4, 4, 0, 0]} maxBarSize={48} />
                <Bar dataKey="orders" name="Orders" fill={CATEGORICAL[2]} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeTab === "conversion" && (
            <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex h-full w-full items-center justify-center">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={conversionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      dataKey="value"
                      stroke="#FFFFFF"
                      strokeWidth={2}
                      label={renderPercentLabel}
                    >
                      {conversionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} role="img" aria-label={`${entry.name}: ${entry.value}`} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipProps} />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" formatter={legendFormatter} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex max-h-[350px] flex-col justify-center overflow-y-auto">
                <h3 className="mb-4 text-sm font-semibold text-foreground">Conversion funnel</h3>
                <div className="space-y-4">
                  {conversionData.map((item, index) => (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-foreground">{item.name}</span>
                        <span className="tabular-nums text-foreground">{item.value}</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-secondary">
                        <div
                          className="h-2.5 rounded-full"
                          style={{
                            width: `${(item.value / (conversionData[0].value || 1)) * 100}%`,
                            backgroundColor: item.color,
                          }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "sources" && (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  dataKey="value"
                  stroke="#FFFFFF"
                  strokeWidth={2}
                  label={renderPercentLabel}
                >
                  {sourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} role="img" aria-label={`${entry.name}: ${entry.value}`} />
                  ))}
                </Pie>
                <Tooltip {...tooltipProps} formatter={(value, name) => [value, name]} />
                <Legend formatter={legendFormatter} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  )
}

export default DashboardCharts
