import { Link } from "wouter";
import { motion } from "framer-motion";
import { Check, Sparkles, Zap, Shield, ArrowRight, CreditCard, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

const FEATURES_FREE = [
  "All 5 AI providers (GPT-4o, Claude, Gemini, Groq, Perplexity)",
  "Unlimited AI signal generation",
  "Full risk management suite",
  "AI trade grading (A+ to F)",
  "Real-time news intelligence",
  "Strategy marketplace",
  "Trade journal + P&L heatmap",
  "Economic calendar",
  "Mobile PWA",
  "Push notifications",
  "Price alerts",
  "Backtesting engine",
];

const FEATURES_PRO = [
  "Everything in Free Beta",
  "Priority AI processing queue",
  "Multi-account support",
  "Advanced backtesting parameters",
  "Custom AI prompt templates",
  "Dedicated signal monitoring",
  "White-label option",
  "API access + webhooks",
  "Priority email support",
  "Early access to new features",
  "Team member accounts (up to 5)",
  "Custom strategy analytics",
];

function PlanCard({
  name, price, period, badge, badgeColor, highlight, features, cta, ctaAction, note,
}: {
  name: string; price: string; period: string; badge: string; badgeColor: string;
  highlight: boolean; features: string[]; cta: string; ctaAction: () => void; note?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative rounded-2xl border p-8",
        highlight
          ? "bg-info/10  border-info/30 shadow-xl "
          : "bg-white/[0.02] border-foreground/10"
      )}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <div className="bg-info text-foreground text-[10px] font-black px-4 py-1 rounded-full shadow-lg flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> CURRENT PLAN
          </div>
        </div>
      )}
      <div className={cn("inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border mb-5", badgeColor)}>
        {badge}
      </div>
      <h3 className="text-2xl font-bold text-foreground mb-1">{name}</h3>
      <div className="flex items-end gap-2 mb-6">
        <span className="text-5xl font-black text-foreground">{price}</span>
        <span className="text-foreground/40 pb-1 text-sm">/ {period}</span>
      </div>
      <div className="h-px bg-foreground/5 mb-6" />
      <ul className="space-y-3 mb-8">
        {features.map(f => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <Check className={cn("w-4 h-4 shrink-0 mt-0.5", highlight ? "text-info" : "text-foreground/30")} />
            <span className={highlight ? "text-foreground/80" : "text-foreground/40"}>{f}</span>
          </li>
        ))}
      </ul>
      <Button
        onClick={ctaAction}
        className={cn(
          "w-full font-semibold h-11",
          highlight
            ? "bg-info hover:bg-info text-foreground shadow-lg "
            : "bg-foreground/5 hover:bg-foreground/10 text-foreground border border-foreground/10"
        )}
      >
        {cta}
        {highlight && <ArrowRight className="w-4 h-4 ml-2" />}
      </Button>
      {note && <p className="text-center text-xs text-foreground/25 mt-3">{note}</p>}
    </motion.div>
  );
}

export default function Pricing() {
  const { data: sub } = useQuery<any>({
    queryKey: ["/api/billing/subscription"],
    retry: false,
  });

  const plan = sub?.plan || "free";

  return (
    <div className="min-h-screen bg-background text-foreground px-4 sm:px-6 py-16">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-pos/10 border border-pos/20 rounded-full px-4 py-1.5 mb-6 text-sm text-pos">
            <Sparkles className="w-3.5 h-3.5" />
            Free during beta — no card needed
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 text-foreground">
            Your plan
          </h1>
          <p className="text-foreground/40 text-lg max-w-xl mx-auto">
            Every feature is unlocked during beta. We'll give you 30 days notice before launch pricing begins.
          </p>
        </div>

        {/* Current plan badge */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex items-center gap-3 bg-info/10 border border-info/20 rounded-2xl px-6 py-4">
            <Shield className="w-5 h-5 text-info" />
            <div>
              <div className="text-xs text-info/70 uppercase tracking-widest font-semibold">Active plan</div>
              <div className="font-bold text-foreground text-lg capitalize">{plan} — Free Beta</div>
            </div>
            <div className="flex items-center gap-1.5 ml-4 pl-4 border-l border-foreground/10">
              <div className="w-2 h-2 rounded-full bg-pos animate-pulse" />
              <span className="text-xs text-pos font-medium">Active</span>
            </div>
          </div>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-16">
          <PlanCard
            name="Free Beta"
            price="$0"
            period="forever (during beta)"
            badge="✓ YOUR PLAN"
            badgeColor="bg-pos/20 text-pos border-pos/30"
            highlight={true}
            features={FEATURES_FREE}
            cta="You're on this plan"
            ctaAction={() => {}}
            note="All features included. No credit card required."
          />
          <PlanCard
            name="Pro"
            price="$29"
            period="month (at launch)"
            badge="COMING SOON"
            badgeColor="bg-primary/20 text-primary border-primary/30"
            highlight={false}
            features={FEATURES_PRO}
            cta="Get notified at launch"
            ctaAction={() => window.location.href = "/settings"}
            note="Set your email in Settings to get notified before launch."
          />
        </div>

        {/* Beta promise */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-16">
          {[
            { icon: Clock, title: "30 days notice", desc: "We'll email all beta users before any pricing changes take effect." },
            { icon: CreditCard, title: "No card required", desc: "The beta is completely free. We'll only ask for payment before Pro launches." },
            { icon: Shield, title: "Locked-in rate", desc: "Beta users will receive a discounted rate compared to new signups." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white/[0.02] border border-foreground/5 rounded-xl p-5">
              <Icon className="w-5 h-5 text-info mb-3" />
              <h4 className="font-semibold text-sm mb-1 text-foreground">{title}</h4>
              <p className="text-xs text-foreground/40 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold mb-6 text-center text-foreground">Common questions</h2>
          <div className="space-y-4">
            {[
              {
                q: "When will the free beta end?",
                a: "We haven't set a specific date. When we're ready to launch, we'll announce it at least 30 days in advance and give all beta users time to decide.",
              },
              {
                q: "Will my settings and data carry over?",
                a: "Yes, 100%. Your strategies, trade journal, AI knowledge base, and everything else carries forward seamlessly.",
              },
              {
                q: "Can I use my own AI API keys forever?",
                a: "Yes — your OpenAI, Anthropic, Gemini, Groq, and Perplexity API keys remain yours. You pay those providers directly. We don't mark up AI costs.",
              },
              {
                q: "What payment methods will you accept?",
                a: "We'll accept all major credit and debit cards, and potentially crypto at launch. Powered by Stripe.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="bg-white/[0.02] border border-foreground/5 rounded-xl p-5">
                <h4 className="font-semibold text-sm text-foreground mb-2">{q}</h4>
                <p className="text-sm text-foreground/40 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Back */}
        <div className="text-center mt-12">
          <Link href="/settings">
            <Button variant="outline" className="border-foreground/10 text-foreground/50 hover:text-foreground">
              ← Back to Settings
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
