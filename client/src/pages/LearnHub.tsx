// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Learn hub: lessons, plus the AI Advisor beside them.
import { lazy } from "react";
import { HubTabs } from "@/components/layout/HubTabs";

const Learn = lazy(() => import("./Learn"));
const AIAdvisor = lazy(() => import("./AIAdvisor"));

export default function LearnHub() {
  return (
    <HubTabs title="Learn" tabs={[
      { id: "lessons", label: "Lessons", render: () => <Learn /> },
      { id: "advisor", label: "AI Advisor", render: () => <AIAdvisor /> },
    ]} />
  );
}
