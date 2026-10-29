import { useState, useCallback } from "react";
import useDialogBehavior from "./useDialogBehavior";
import OpenRecordsTable from "./OpenRecordsTable";

// Warning shown when a new lead / enquiry is created for a company that
// already has open ones (Enquiry Tracker > Pending). Used by Leads.jsx and
// DirectEnquiryForm.jsx:
//
//   const { askDuplicate, duplicateDialog } = useDuplicateOpenRecordsDialog();
//   const proceed = await askDuplicate({ companyName, records });  // true = "Create anyway"
//   ...
//   return (<>{...}{duplicateDialog}</>);
//
// `records` comes from fetchOpenRecordsForCompany (src/utils/openRecordsCheck.js).

export function DuplicateOpenRecordsDialog({ companyName, records, onCancel, onConfirm }) {
  const dialogRef = useDialogBehavior(onCancel, { autoFocus: false });
  const count = records.length;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dup-open-title"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border bg-card shadow-lg"
      >
        <div className="border-b px-4 py-3">
          <h2 id="dup-open-title" className="text-base font-semibold text-foreground">Open records already exist for this company</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            &quot;{companyName}&quot; already has {count} open {count === 1 ? "lead / enquiry" : "leads / enquiries"} in Enquiry Tracker Pending.
            If this is the same requirement, cancel and continue on the existing one instead.
          </p>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <OpenRecordsTable records={records} />
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="h-9 rounded-md border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Create anyway
          </button>
        </div>
      </div>
    </div>
  );
}

export default function useDuplicateOpenRecordsDialog() {
  const [pending, setPending] = useState(null);

  const askDuplicate = useCallback(
    ({ companyName, records }) => new Promise((resolve) => setPending({ companyName, records, resolve })),
    []
  );

  const finish = (answer) => {
    pending?.resolve(answer);
    setPending(null);
  };

  const duplicateDialog = pending ? (
    <DuplicateOpenRecordsDialog
      companyName={pending.companyName}
      records={pending.records}
      onCancel={() => finish(false)}
      onConfirm={() => finish(true)}
    />
  ) : null;

  return { askDuplicate, duplicateDialog };
}
