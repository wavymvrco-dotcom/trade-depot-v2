// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Lab hub (§9.11): Blueprint · Arena · Report · Shadow · Licenses.

import { HubTabs } from "@/components/layout/HubTabs";
import { BlueprintTab } from "@/components/lab/BlueprintTab";
import { ArenaTab } from "@/components/lab/ArenaTab";
import { ReportTab } from "@/components/lab/ReportTab";
import { ShadowTab } from "@/components/lab/ShadowTab";
import { LicensesTab } from "@/components/lab/LicensesTab";

export default function Lab() {
  return (
    <HubTabs
      title="Lab"
      tabs={[
        { id: "blueprint", label: "Blueprint", render: () => <BlueprintTab /> },
        { id: "arena", label: "Arena", render: () => <ArenaTab /> },
        { id: "report", label: "Report", render: () => <ReportTab /> },
        { id: "shadow", label: "Shadow", render: () => <ShadowTab /> },
        { id: "licenses", label: "Licenses", render: () => <LicensesTab /> },
      ]}
      footer={
        <p className="shrink-0 border-t border-border px-4 md:px-6 py-1.5 sm:py-2 text-[11px] sm:text-xs text-muted-foreground m-0">
          <span className="sm:hidden">Early access · Simulated until Live · Not financial advice.</span>
          <span className="hidden sm:inline">Early access. Lab results are simulated until a strategy is Live. Past and simulated performance does not guarantee future results. Not financial advice — you decide whether to go Live.</span>
        </p>
      }
    />
  );
}
