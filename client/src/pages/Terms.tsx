import { Link } from "wouter";
import { LineChart, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    body: `By accessing or using TradeAI Terminal ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service. These terms apply to all visitors, users, and others who access or use the Service.`,
  },
  {
    title: "2. Description of Service",
    body: `TradeAI Terminal is an AI-powered trading intelligence platform that provides market analysis, signal generation, trade journaling, risk management tools, and educational content. The Service is intended for informational and educational purposes only and does not constitute financial advice.`,
  },
  {
    title: "3. Not Financial Advice",
    body: `All content provided by TradeAI Terminal, including AI-generated signals, analysis, strategy recommendations, and market commentary, is for informational and educational purposes only. It does not constitute financial, investment, trading, or any other advice. You should consult a licensed financial advisor before making any investment decisions. Trading forex, stocks, crypto, and other financial instruments carries substantial risk of loss and is not suitable for all investors.`,
  },
  {
    title: "4. Risk Disclaimer",
    body: `Trading financial instruments involves significant risk. Past performance displayed in the application is not indicative of future results. You may lose some or all of your invested capital. You should never trade with money you cannot afford to lose. TradeAI Terminal is not responsible for any financial losses incurred while using the Service.`,
  },
  {
    title: "5. API Keys and Third-Party Services",
    body: `The Service allows you to connect third-party AI providers (OpenAI, Anthropic, Google, etc.) and broker APIs using your own credentials. You are solely responsible for the security of your API keys and credentials. TradeAI Terminal stores these credentials encrypted but cannot guarantee their absolute security. Usage of third-party APIs is subject to the terms of those respective providers, and associated costs are your responsibility.`,
  },
  {
    title: "6. Account Responsibilities",
    body: `You are responsible for maintaining the confidentiality of your account credentials. You agree not to share your account with others and to notify us immediately of any unauthorized use. You are responsible for all activity that occurs under your account. Accounts found to be engaged in fraudulent, abusive, or illegal activity may be suspended or terminated without notice.`,
  },
  {
    title: "7. Beta Service",
    body: `TradeAI Terminal is currently in beta. The Service is provided "as is" without warranties of any kind. Features may change, be removed, or be unavailable at any time. Beta access is currently free of charge; pricing will be introduced upon official launch with advance notice provided to existing users.`,
  },
  {
    title: "8. Intellectual Property",
    body: `The Service and its original content, features, and functionality are and will remain the exclusive property of TradeAI Terminal and its licensors. Our trademarks and trade dress may not be used in connection with any product or service without prior written consent.`,
  },
  {
    title: "9. Limitation of Liability",
    body: `To the maximum extent permitted by law, TradeAI Terminal shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation loss of profits, data, goodwill, or other intangible losses, resulting from your use of or inability to use the Service.`,
  },
  {
    title: "10. Changes to Terms",
    body: `We reserve the right to modify these terms at any time. We will provide notice of significant changes. Your continued use of the Service after changes become effective constitutes acceptance of the revised terms.`,
  },
  {
    title: "11. Governing Law",
    body: `These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law provisions. Any disputes arising under these terms shall be resolved through binding arbitration.`,
  },
  {
    title: "12. Contact",
    body: `For questions about these Terms of Service, please contact us through the application's support channels or reach out to the admin via the platform.`,
  },
];

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#070710] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5 bg-[#070710]/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/landing">
            <div className="flex items-center gap-2.5 cursor-pointer">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                <LineChart className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-sm">TradeAI <span className="text-cyan-400">Terminal</span></span>
            </div>
          </Link>
          <Link href="/landing">
            <Button variant="ghost" size="sm" className="gap-2 text-white/50 hover:text-white text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="mb-12">
          <p className="text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-3">Legal</p>
          <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
          <p className="text-white/40 text-sm">Last updated: March 25, 2026</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-8">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="text-lg font-bold text-white mb-3">{s.title}</h2>
              <p className="text-white/50 leading-relaxed text-sm">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 flex flex-col sm:flex-row gap-4 items-center justify-between text-sm text-white/30">
          <Link href="/privacy" className="hover:text-white/60 transition-colors">View Privacy Policy →</Link>
          <Link href="/landing">
            <Button variant="outline" size="sm" className="border-white/10 text-white/50 hover:text-white text-xs">
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
