import { memo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChartTab {
  id: string;
  symbol: string;
  label: string;
}

const ChartTabsContent = memo(function ChartTabsContent({
  tabs,
  activeTab,
  onSelectTab,
  onAddTab,
  onCloseTab,
}: {
  tabs: ChartTab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onAddTab: () => void;
  onCloseTab: (id: string) => void;
}) {
  return (
    <div className="h-12 border-b border-border flex items-center bg-card/50 px-4 gap-2 will-change-contents">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded text-sm cursor-pointer transition-colors duration-150 group",
            activeTab === tab.id ? "bg-muted" : "hover:bg-muted/50"
          )}
          onClick={() => onSelectTab(tab.id)}
        >
          <span className={cn(
            "font-mono font-semibold",
            activeTab === tab.id ? "text-primary" : "text-muted-foreground"
          )}>
            {tab.symbol}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity duration-100"
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}
      
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 ml-auto text-muted-foreground hover:text-foreground transition-colors duration-150"
        onClick={onAddTab}
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
});

export function ChartTabs({
  tabs,
  activeTab,
  onSelectTab,
  onAddTab,
  onCloseTab,
}: {
  tabs: ChartTab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onAddTab: () => void;
  onCloseTab: (id: string) => void;
}) {
  return (
    <ChartTabsContent
      tabs={tabs}
      activeTab={activeTab}
      onSelectTab={onSelectTab}
      onAddTab={onAddTab}
      onCloseTab={onCloseTab}
    />
  );
}