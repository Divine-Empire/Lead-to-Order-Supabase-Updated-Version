import { useState } from "react";
import { Eye } from "lucide-react";
import ModalView from "./ModalView";

// The open leads / enquiries of a company as a table (Date, Enquiry No.,
// Reference Person, Item List, Last Follow-Up Date). Shared by the "Create
// anyway" confirmation (DuplicateOpenRecordsDialog) and the Duplicate Enquiry
// Logs stage. `records` has the shape of fetchOpenRecordsForCompany
// (src/utils/openRecordsCheck.js) -- also what a log's open_records stores.

const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" });
export const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : dateFmt.format(d);
};

const ITEM_SOURCE_LABEL = {
  quotation: (r) => `Items from quotation ${r.quotationNo}`,
  enquiry: () => "No quotation yet - items from the enquiry",
  lead: () => "No quotation yet - items from the lead",
  none: () => "",
};

export default function OpenRecordsTable({ records }) {
  const [itemsFor, setItemsFor] = useState(null);

  return (
    <>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-secondary">
          <tr>
            {["Date", "Enquiry No.", "Reference Person", "Item List", "Last Follow-Up Date"].map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap border-b px-3 py-2 text-left text-xs font-semibold text-brand-800">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {records.map((r, idx) => (
            <tr key={r.key || idx}>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDate(r.createdAt)}</td>
              <td className="whitespace-nowrap px-3 py-2 font-medium">{r.number || "-"}</td>
              <td className="px-3 py-2">{r.referencePerson || "-"}</td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => setItemsFor(r)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  <Eye size={14} aria-hidden="true" />
                  View{(r.items || []).length ? ` (${r.items.length})` : ""}
                </button>
              </td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                {formatDate(r.lastFollowUpAt)}
                {r.lastFollowUpSource === "planned" && <span className="ml-1 text-xs text-muted-foreground">(planned)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ModalView
        isOpen={Boolean(itemsFor)}
        onClose={() => setItemsFor(null)}
        title={itemsFor ? `Item List - ${itemsFor.number}` : ""}
        maxWidth="max-w-xl"
        zIndex="z-[1010]"
      >
        {itemsFor && (
          (itemsFor.items || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No items found for this record.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{(ITEM_SOURCE_LABEL[itemsFor.itemsSource] || ITEM_SOURCE_LABEL.none)(itemsFor)}</p>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-secondary">
                    <tr>
                      <th scope="col" className="border-b px-3 py-2 text-center text-xs font-semibold text-brand-800">#</th>
                      <th scope="col" className="border-b px-3 py-2 text-left text-xs font-semibold text-brand-800">Item</th>
                      <th scope="col" className="border-b px-3 py-2 text-right text-xs font-semibold text-brand-800">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {itemsFor.items.map((i, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2 break-words">{i.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{i.quantity}{i.unit ? ` ${i.unit}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </ModalView>
    </>
  );
}
