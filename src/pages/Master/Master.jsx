import React, { useEffect, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

export default function Master() {
  const { substage } = useParams();
  const navigate = useNavigate();
  const authContext = useContext(AuthContext) || {};
  const { isAdmin = () => false } = authContext;

  // Resolve current tab (default to 'client' or alias 'tat')
  const currentTab = !substage ? "client" : substage === "tat" ? "tat-config" : substage;

  useEffect(() => {
    // Proactively redirect to default substage if root /master is visited directly
    if (!substage) {
      navigate("/master/client", { replace: true });
    }
  }, [substage, navigate]);

  useEffect(() => {
    // Non-admins (USER role) are restricted to Client Master -- bounce any direct/typed
    // URL to another sub-stage back to the one they're allowed to see.
    if (!isAdmin() && currentTab !== "client") {
      navigate("/master/client", { replace: true });
    }
  }, [currentTab, isAdmin, navigate]);

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
    <div className="flex flex-1 h-full min-h-0 w-full">
      {/* Active sub-master fills the pane; sub-navigation is handled directly in the main sidebar */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        {renderActiveComponent()}
      </div>
    </div>
  );
}
