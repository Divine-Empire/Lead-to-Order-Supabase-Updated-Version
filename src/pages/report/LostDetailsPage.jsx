"use client";

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { fetchLostDetails, isLostStatus, parseMoney } from "./lostDetailsData";

function Spinner({ className = "h-4 w-4" }) {
    return (
        <svg aria-hidden="true" className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    );
}

const formatCurrency = (v) => (v || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

// Drill-down page for the Report page's Lost Details tab -- reached by
// clicking an SC's row in the Leads or Enquiries summary card. Scoped via
// query params rather than a route param so the back button returns exactly
// to the Report tab the user came from, and so the same component can be
// deep-linked/bookmarked for a specific SC + source combination.
function LostDetailsPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const source = searchParams.get("source") === "enquiry" ? "enquiry" : "lead";
    const scName = searchParams.get("sc") || "";
    const startDate = searchParams.get("start") || "";
    const endDate = searchParams.get("end") || "";

    const [rows, setRows] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setIsLoading(true);
            setError(null);
            try {
                const startDateISO = startDate ? `${startDate}T00:00:00` : undefined;
                const endDateISO = endDate ? `${endDate}T23:59:59` : undefined;
                const all = await fetchLostDetails({ source, startDateISO, endDateISO });
                if (cancelled) return;
                const lost = all.filter((r) => r.scName === scName && isLostStatus(r.orderReceivedStatus));
                lost.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                setRows(lost);
            } catch (err) {
                console.error("Error fetching Lost Details drill-down:", err);
                if (!cancelled) setError(err?.message || "Failed to load Lost Details.");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }
        if (scName) load();
        else {
            setIsLoading(false);
            setRows([]);
        }
        return () => { cancelled = true; };
    }, [source, scName, startDate, endDate]);

    const totalLostValue = useMemo(
        () => rows.reduce((sum, r) => sum + parseMoney(r.quotationValueWithoutTax), 0),
        [rows]
    );

    const handleExport = () => {
        const sheetRows = rows.map((r) => ({
            [source === "lead" ? "Lead Number" : "Enquiry Number"]: r.number,
            "Company Name": r.companyName,
            "Quotation Number": r.quotationNumber || "",
            "Quotation Value (Without Tax)": r.quotationValueWithoutTax != null ? parseMoney(r.quotationValueWithoutTax) : "",
            "Quotation Value (With Tax)": r.quotationValueWithTax != null ? parseMoney(r.quotationValueWithTax) : "",
            "Lost Reason": r.lostReason || "",
        }));
        const ws = XLSX.utils.json_to_sheet(sheetRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Lost Details");
        const safeScName = scName.replace(/[^a-z0-9]+/gi, "_");
        XLSX.writeFile(wb, `Lost_Details_${source}_${safeScName}.xlsx`);
    };

    return (
        <div className="flex flex-col">
            <div className="mx-auto w-full max-w-[1600px]">
                <button
                    type="button"
                    onClick={() => navigate("/report")}
                    className="mb-4 text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
                >
                    ← Back to Report
                </button>

                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
                    <div>
                        <h1 className="text-lg font-semibold text-foreground">
                            Lost Details — {scName || "Unknown SC"} ({source === "lead" ? "Leads" : "Enquiries"})
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            {rows.length} lost {source === "lead" ? "lead(s)" : "enquiry(ies)"} · Total Quotation Value (without tax): {formatCurrency(totalLostValue)}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={isLoading || rows.length === 0}
                        className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Export to Excel
                    </button>
                </div>

                {error && (
                    <div className="mb-5 px-4 py-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive" role="alert">
                        Couldn't load Lost Details: {error}
                    </div>
                )}

                <div className="bg-card rounded-lg border overflow-hidden">
                    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Lost details table, scrollable">
                        <table className="min-w-full divide-y">
                            <thead className="bg-secondary">
                                <tr>
                                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-brand-800">{source === "lead" ? "Lead Number" : "Enquiry Number"}</th>
                                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-brand-800">Company Name</th>
                                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-brand-800">Quotation Number</th>
                                    <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Quotation Value (Without Tax)</th>
                                    <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Quotation Value (With Tax)</th>
                                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-brand-800">Lost Reason</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {isLoading ? (
                                    <tr><td colSpan="6" className="px-4 py-8 text-center text-sm text-primary"><span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" /> Loading...</span></td></tr>
                                ) : rows.length === 0 ? (
                                    <tr><td colSpan="6" className="px-4 py-6 text-center text-sm text-muted-foreground">No lost records to show</td></tr>
                                ) : (
                                    rows.map((row) => (
                                        <tr key={row.id} className="hover:bg-secondary/60">
                                            <td className="px-4 py-2.5 whitespace-nowrap text-sm font-medium text-foreground">{row.number}</td>
                                            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-foreground">{row.companyName}</td>
                                            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-foreground">
                                                {row.quotationUpload ? (
                                                    <a href={row.quotationUpload} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                                        {row.quotationNumber || "View"}
                                                    </a>
                                                ) : (row.quotationNumber || "--")}
                                            </td>
                                            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-foreground">{row.quotationValueWithoutTax != null ? formatCurrency(parseMoney(row.quotationValueWithoutTax)) : "--"}</td>
                                            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-foreground">{row.quotationValueWithTax != null ? formatCurrency(parseMoney(row.quotationValueWithTax)) : "--"}</td>
                                            <td className="px-4 py-2.5 text-sm text-foreground max-w-xs truncate" title={row.lostReason || ""}>{row.lostReason || "--"}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LostDetailsPage;
