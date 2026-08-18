import React, { useState, useEffect, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Building2, Users, UserCheck, Layers, MapPin, Package, Clock, Database, ChevronRight, UserCog } from "lucide-react";
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
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-3.5rem)] bg-slate-50/50">
      {/* Master Data Vertical Sub-Sidebar */}
      <div className="w-full md:w-48 lg:w-52 bg-white border-b md:border-b-0 md:border-r border-slate-200 p-1 shrink-0 shadow-sm z-10">
        <div className="mb-1.5 px-2 py-1">
          <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-primary" />
            Master Data
          </h2>
        </div>

        <nav className="space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id || (currentTab === "tat-config" && item.id === "tat-config" && substage === "tat");
            const count = counts[item.id];

            return (
              <button
                key={item.id}
                onClick={() => navigate(`/master/${item.id}`)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 group ${
                  isActive
                    ? "bg-gradient-to-r from-primary/5 to-primary/10 text-primary font-bold border border-primary/75 shadow-sm"
                    : "text-slate-600 hover:bg-primary/5 hover:text-primary border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2 truncate pr-1">
                  <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? "text-primary" : "text-slate-400 group-hover:text-primary"
                  }`} />
                  <span className="truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {count !== undefined ? (
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-colors ${
                      isActive
                        ? "bg-primary text-white shadow-sm"
                        : "text-slate-600 bg-slate-100 group-hover:bg-primary/10 group-hover:text-primary"
                    }`}>
                      {count}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-300 animate-pulse">...</span>
                  )}
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${
                    isActive ? "text-primary translate-x-0.5" : "text-slate-300 group-hover:text-primary"
                  }`} />
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Right Area Renders Sub-Master Component */}
      <div className="flex-1 min-w-0 overflow-x-hidden">
        <div className="w-full">
          {renderActiveComponent()}
        </div>
      </div>
    </div>
  );
}
