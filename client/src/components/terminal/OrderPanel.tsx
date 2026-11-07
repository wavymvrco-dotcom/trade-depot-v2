import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { ChevronDown, ChevronUp } from "lucide-react";

export function OrderPanel() {
  const [lotSize, setLotSize] = useState([0.1]);

  return (
    <div className="h-full flex flex-col p-4 space-y-4">
      <div className="space-y-1">
        <h2 className="font-bold text-lg">Order Execution</h2>
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span>Balance: <span className="text-foreground font-mono">$10,450.20</span></span>
          <span>Equity: <span className="text-foreground font-mono">$10,432.50</span></span>
        </div>
      </div>

      <Tabs defaultValue="market" className="w-full">
        <TabsList className="w-full grid grid-cols-2 bg-muted/50">
          <TabsTrigger value="market">Market</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
        </TabsList>
        
        <TabsContent value="market" className="space-y-4 mt-4">
          <div className="space-y-3">
            <Label className="text-xs uppercase text-muted-foreground">Volume (Lots)</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setLotSize([Math.max(0.01, lotSize[0] - 0.01)])}>
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Input 
                type="number" 
                value={lotSize[0].toFixed(2)} 
                className="h-8 font-mono text-center bg-background" 
                onChange={() => {}} 
              />
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setLotSize([lotSize[0] + 0.01])}>
                <ChevronUp className="h-4 w-4" />
              </Button>
            </div>
            <Slider 
              value={lotSize} 
              min={0.01} 
              max={5.0} 
              step={0.01} 
              onValueChange={setLotSize}
              className="py-2" 
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Stop Loss</Label>
              <Input className="h-8 font-mono bg-background" placeholder="0.00000" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Take Profit</Label>
              <Input className="h-8 font-mono bg-background" placeholder="0.00000" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button className="bg-destructive hover:bg-destructive/90 text-destructive-foreground h-12 flex flex-col items-center justify-center gap-0">
              <span className="font-bold text-sm">SELL</span>
              <span className="text-xs font-mono opacity-80">1.08410</span>
            </Button>
            <Button className="bg-pos hover:bg-pos text-on-strong h-12 flex flex-col items-center justify-center gap-0">
              <span className="font-bold text-sm">BUY</span>
              <span className="text-xs font-mono opacity-80">1.08520</span>
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-auto border-t border-border pt-4">
        <h3 className="text-xs font-semibold mb-2 text-muted-foreground">One-Click Trading</h3>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-muted/30 p-2 rounded border border-border border-dashed text-center">
             <span className="text-xs text-muted-foreground">AI Auto-Trading</span>
             <div className="text-pos font-bold text-sm">ACTIVE</div>
          </div>
        </div>
      </div>
    </div>
  );
}