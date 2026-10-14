import React, { useState, useEffect, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Building2, Users, UserCheck, Layers, MapPin, Package, Clock, Database, UserCog } from "lucide-react";
import supabase from "../../utils/supabase";
import { AuthContext } from "../../App";

// Sub-master Components
import ClientMaster from "./ClientMaster";
import ScDistributionMaster from "./ScDistributionMaster";
import CREMgmt from "./CREMgmt";
import Dropdowns from "./Dropdowns";
import Consignors from "./Consignors";
import Items from "./Items";
import TatConfig from "./tatConfig";
import ReportPersons from "./ReportPersons";

const masterNavItems = [
  {
    id: "client",
    label: "Client Master",
    icon: Building2,
    table: "lto_client_master",
    description: "Manage client details and assigned managers"
  },
  {
    id: "sc-distribution",
    label: "SC Distribution",
    icon: Users,
    table: "lto_sc_distribution",
    description: "Configure sales coordinator round-robin pools"
  },
  {
    id: "crm-distribution",
    label: "CRM Distribution",
    icon: UserCheck,
    table: "lto_crm_distribution",
    description: "Set CRM assignment rules by Group, State or NOB"
  },
  {
    id: "dropdowns",
    label: "Dropdowns",
    icon: Layers,
    table: "lto_dropdown",
    description: "Manage lead sources, NOBs, and drop down lists"
  },
  {
    id: "consignors",
    label: "Consignor Details",
    icon: MapPin,
    table: "lto_consignor_details",
    description: "Manage shipping consignors and billing entities"
  },
  {
    id: "items",
    label: "Items",
    icon: Package,
    table: "lto_items",
    description: "Product database and pricing"
  },
  {
    id: "tat-config",
    label: "TAT Configuration",
    icon: Clock,
    table: "lto_tat_config",
    description: "Turnaround time SLAs and alerts setup"
  },
  {
    id: "report-persons",
    label: "Report Persons",
    icon: UserCog,
    // Shares lto_dropdown with "Dropdowns" above (category = report_person_*),
    // so this count reflects the whole dropdown table, not just report
    // persons -- a minor cosmetic imprecision, not worth a separate table for.
    table: "lto_dropdown",
    description: "Manage who appears on the Calling Data, SC Pipeline, and FOS report tabs"
  },
];

export default function Master() {
  const { substage } = useParams();
  const navigate = useNavigate();
  const [counts, setCounts] = useState({});
  const authContext = useContext(AuthContext) || {};
  const { isAdmin = () => false } = authContext;

  // Non-admin (USER role) users may only access the Client Master sub-stage;
  // every other master-data sub-stage (SC Distribution, CRM Distribution,
  // Dropdowns, Consignor Details, Items, TAT Configuration) is admin-only.
  const visibleNavItems = isAdmin()
    ? masterNavItems
    : masterNavItems.filter((item) => item.id === "client");

  // Resolve current tab (default to 'client' or alias 'tat')
  const currentTab = !substage ? "client" : substage === "tat" ? "tat-config" : substage;

  useEffect(() => {
    // Proactively redirect to default substage if root /master is visited directly
    if (!substage) {
      navigate("/master/client", { replace: true });
    }
  }, [substage, navigate]);

  useEffect(() => {
    // Non-admins are restricted to Client Master -- bounce any direct/typed
    // URL to another sub-stage back to the one they're allowed to see.
    if (!isAdmin() && currentTab !== "client") {
      navigate("/master/client", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab, isAdmin]);

  useEffect(() => {
    const fetchCounts = async () => {
      const fetchTableCount = async (tableName) => {
        try {
          const { count, error } = await supabase
            .from(tableName)
            .select("*", { count: "exact", head: true });
          if (!error && count !== null) {
            return count;
          }
          return 0;
        } catch {
          return 0;
        }
      };

      const results = await Promise.all(
        visibleNavItems.map(async (item) => ({
          id: item.id,
          count: await fetchTableCount(item.table),
        }))
      );

      const newCounts = {};
      results.forEach((r) => {
        newCounts[r.id] = r.count;
      });
      setCounts(newCounts);
    };

    fetchCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab]);

  const renderActiveComponent = () => {
    // Belt-and-suspenders: even if a non-admin somehow reaches this point
    // with a non-client tab (e.g. before the redirect effect above runs),
    // never render an admin-only sub-master for them.
    if (!isAdmin() && currentTab !== "client") {
      return <ClientMaster />;
    }

    switch (currentTab) {
      case "client":
        return <ClientMaster />;
      case "sc-distribution":
        return <ScDistributionMaster />;
      case "crm-distribution":
        return <CREMgmt />;
      case "dropdowns":
        return <Dropdowns />;
      case "consignors":
        return <Consignors />;
      case "items":
        return <Items />;
      case "tat":
      case "tat-config":
        return <TatConfig />;
      case "report-persons":
        return <ReportPersons />;
      default:
        return <ClientMaster />;
    }
  };

  return (
    <div className="flex flex-col md:flex-row flex-1 h-full min-h-0 gap-3 md:gap-4">
      {/* Master Data sub-navigation: horizontal strip on mobile, vertical list from md up */}
      <nav
        aria-label="Master data"
        className="shrink-0 rounded-lg border bg-card p-1.5 md:w-52 md:overflow-y-auto"
      >
        <h2 className="hidden items-center gap-1.5 px-2 pb-1.5 pt-1 text-xs font-semibold text-muted-foreground md:flex">
          <Database className="h-3.5 w-3.5" aria-hidden="true" />
          Master Data
        </h2>

        <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id || (currentTab === "tat-config" && item.id === "tat-config" && substage === "tat");
            const count = counts[item.id];

            return (
              <li key={item.id} className="shrink-0 md:shrink">
                <button
                  type="button"
                  onClick={() => navigate(`/master/${item.id}`)}
                  aria-current={isActive ? "page" : undefined}
                  title={item.description}
                  className={`relative flex h-9 w-full items-center justify-between gap-2 rounded-md px-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-accent font-medium text-brand-800"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 hidden w-0.5 rounded-full bg-brand-lime md:block" aria-hidden="true" />
                  )}
                  <span className="flex items-center gap-2 truncate">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {count !== undefined && (
                    <span className="rounded bg-secondary px-1.5 text-xs font-medium tabular-nums text-foreground">
                      {count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Active sub-master. Table masters fill this pane (h-full); long forms scroll inside it. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        {renderActiveComponent()}
      </div>
    </div>
  );
}
