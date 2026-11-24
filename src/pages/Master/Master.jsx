import React, { useEffect, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AuthContext } from "../../App";
import PermissionDenied from "../../components/PermissionDenied";
import { PAGES } from "../../constants/pageAccess";

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
  const { canAccess = () => false } = authContext;

  // Resolve current tab (default to 'client' or alias 'tat')
  const currentTab = !substage ? "client" : substage === "tat" ? "tat-config" : substage;

  useEffect(() => {
    // Proactively redirect to default substage if root /master is visited directly
    if (!substage && canAccess("master:client")) {
      navigate("/master/client", { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [substage, navigate]);

  // Page access is per sub-master ("master:<tab>", see constants/pageAccess.js).
  const firstAllowed = PAGES.find((p) => p.key.startsWith("master:") && canAccess(p.key));

  useEffect(() => {
    // Typed URL for a sub-master the user has no access to: move to the first one they do have.
    if (substage && !canAccess(`master:${currentTab}`) && firstAllowed) {
      navigate(firstAllowed.href, { replace: true });
    }
    // Bare /master: land on the first allowed sub-master instead of Client Master.
    if (!substage && firstAllowed && firstAllowed.key !== "master:client") {
      navigate(firstAllowed.href, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab, substage]);

  const renderActiveComponent = () => {
    // Never render a sub-master the user has no access to.
    if (!canAccess(`master:${currentTab}`)) {
      return <PermissionDenied homeHref={firstAllowed?.href} homeLabel={firstAllowed?.label} />;
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
