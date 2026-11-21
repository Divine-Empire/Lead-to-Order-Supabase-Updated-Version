"use client"

import { useState, useMemo } from "react"
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

// The monthly buckets, funnel and lead sources arrive ready-made from the
// dashboard's lto_dashboard_overview request; this only labels and colours them.
const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "2-digit" })
}

function DashboardCharts({ overview, isLoading, error }) {
  const [activeTab, setActiveTab] = useState("overview")

  const leadData = useMemo(
    () => (overview?.trend || []).map((row) => ({ ...row, month: monthLabel(row.month) })),
    [overview]
  )
  const conversionData = useMemo(() => {
    const f = overview?.funnel || {}
    return [
      { name: "Leads", value: f.leads || 0, color: FUNNEL[0] },
      { name: "Enquiries", value: f.enquiries || 0, color: FUNNEL[1] },
      { name: "Quotations", value: f.quotations || 0, color: FUNNEL[2] },
      { name: "Orders", value: f.orders || 0, color: FUNNEL[3] },
    ]
  }, [overview])
  const sourceData = useMemo(
    () => (overview?.sources || []).map((row, index) => ({ ...row, color: CATEGORICAL[index] || OTHER_COLOR })),
    [overview]
  )

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
