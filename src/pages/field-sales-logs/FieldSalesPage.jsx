import { useState, useContext } from "react";
import { CalendarDays } from "lucide-react";
import StatusTabs from "../../components/StatusTabs";
import { AuthContext } from "../../App";
import { namesForUser } from "../../utils/fosAssigned";
import FieldSalesLogs from "./field_sales_logs";
import AssignedEnquiries from "./AssignedEnquiries";
import FieldVisitCalendarModal from "./FieldVisitCalendarModal";

// Field Sales Logs stage: the visit logs, the enquiries assigned to field
// persons, and the visit calendar.
const TABS = [
  { id: "logs", label: "Logs" },
  { id: "assigned", label: "Assigned Enquiries" },
];

export default function FieldSalesPage() {
  const { isAdmin = () => false, currentUser = null } = useContext(AuthContext) || {};
  const admin = isAdmin();
  const [tab, setTab] = useState("logs");
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Tabs go first and Calendar last in each tab's own toolbar row, so everything shares one line.
  const tabs = <StatusTabs tabs={TABS} activeTab={tab} onChange={setTab} label="Field sales views" />;
  const calendarButton = (
    <button
      type="button"
      onClick={() => setCalendarOpen(true)}
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
    >
      <CalendarDays size={16} aria-hidden="true" />
      Calendar
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      {tab === "logs" ? (
        <FieldSalesLogs leading={tabs} trailing={calendarButton} />
      ) : (
        <AssignedEnquiries leading={tabs} trailing={calendarButton} />
      )}

      <FieldVisitCalendarModal
        isOpen={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        names={namesForUser(admin, currentUser)}
        admin={admin}
      />
    </div>
  );
}
