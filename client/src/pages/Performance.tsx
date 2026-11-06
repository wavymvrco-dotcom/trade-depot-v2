// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Performance hub: analytics, journal and AI trade reviews in one place.
import { lazy } from "react";
import { HubTabs } from "@/components/layout/HubTabs";

const Analytics = lazy(() => import("./Analytics"));
const Journal = lazy(() => import("./Journal"));
const Reviews = lazy(() => import("./AIAdvisor").then(m => ({ default: m.ReviewsTab })));

export default function Performance() {
  return (
    <HubTabs title="Performance" tabs={[
      { id: "analytics", label: "Analytics", render: () => <Analytics /> },
      { id: "journal", label: "Journal", render: () => <Journal /> },
      { id: "reviews", label: "AI trade reviews", render: () => <div className="flex-1 overflow-y-auto p-4 md:p-6"><Reviews /></div> },
    ]} />
  );
}
