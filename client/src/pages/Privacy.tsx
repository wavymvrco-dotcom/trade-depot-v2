import { Link } from "wouter";
import { LineChart, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  {
    title: "1. Information We Collect",
    body: `We collect information you provide directly: username, optional email address, and any API keys or broker credentials you choose to connect. We also collect usage data such as trading activity, positions, signals generated, and app preferences. We do not collect payment card information directly — payment processing is handled by Stripe.`,
  },
  {
    title: "2. How We Use Your Information",
    body: `We use the information we collect to provide, maintain, and improve the Service; to personalize your experience (AI signals, news filtering, strategy recommendations); to send you notifications you have opted into; to detect and prevent fraud and abuse; and to communicate with you about the Service.`,
  },
  {
    title: "3. API Keys and Credentials",
    body: `API keys and broker credentials you provide are stored encrypted in our database and are used solely to make requests to the respective third-party services on your behalf. We do not sell, share, or otherwise disclose these credentials to any third party beyond the services you explicitly connect. You may delete your credentials at any time from the Settings page.`,
  },
  {
    title: "4. Data Storage and Security",
    body: `Your data is stored on secure servers. We implement industry-standard security measures including encrypted transmission (HTTPS), encrypted storage of sensitive fields, and access controls. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.`,
  },
  {
    title: "5. Cookies and Local Storage",
    body: `We use session cookies to maintain your authenticated state. We use browser localStorage for user preferences such as onboarding status, theme preferences, and install prompt dismissal. We do not use tracking cookies or advertising cookies.`,
  },
  {
    title: "6. Third-Party Services",
    body: `Trade Depot integrates with third-party services including AI providers (OpenAI, Anthropic, Google, Groq, Perplexity), market data providers (Twelve Data, Polygon), broker APIs (OANDA, MT5), and payment processing (Stripe). When you use these integrations, data is shared with those services according to their respective privacy policies. We encourage you to review those policies.`,
  },
  {
    title: "7. Data Retention",
    body: `We retain your account data for as long as your account is active. Trade history, journal entries, and signal data are retained to provide the AI coaching and analytics features. You may request deletion of your account and associated data by contacting us through the application.`,
  },
  {
    title: "8. Your Rights",
    body: `Depending on your location, you may have rights to access, correct, or delete your personal data. You may also have the right to object to processing, request portability of your data, or withdraw consent. To exercise these rights, contact us through the platform. We will respond within 30 days.`,
  },
  {
    title: "9. Children's Privacy",
    body: `Trade Depot is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from minors. If you believe a minor has provided us with personal information, please contact us immediately.`,
  },
  {
    title: "10. Push Notifications",
    body: `If you opt into push notifications, we store your push subscription endpoint to send you trade alerts and digest messages. You can revoke this permission at any time in your browser settings or through the Settings page in the application.`,
  },
  {
    title: "11. Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. We will notify you of significant changes via an in-app notification or email if provided. Your continued use of the Service after changes take effect constitutes acceptance of the updated policy.`,
  },
  {
    title: "12. Contact Us",
    body: `If you have questions or concerns about this Privacy Policy or our data practices, please contact us through the admin panel or support channels within the application.`,
  },
];

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b border-foreground/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/landing">
            <div className="flex items-center gap-2.5 cursor-pointer">
              <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center">
                <LineChart className="w-4 h-4 text-foreground" />
              </div>
              <span className="font-display font-semibold text-base">Trade Depot</span>
            </div>
          </Link>
          <Link href="/landing">
            <Button variant="ghost" size="sm" className="gap-2 text-foreground/50 hover:text-foreground text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="mb-12">
          <p className="text-xs font-semibold text-info uppercase tracking-widest mb-3">Legal</p>
          <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
          <p className="text-foreground/40 text-sm">Last updated: March 25, 2026</p>
        </div>

        <div className="space-y-8">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="text-lg font-bold text-foreground mb-3">{s.title}</h2>
              <p className="text-foreground/50 leading-relaxed text-sm">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-foreground/5 flex flex-col sm:flex-row gap-4 items-center justify-between text-sm text-foreground/30">
          <Link href="/terms" className="hover:text-foreground/60 transition-colors">View Terms of Service →</Link>
          <Link href="/landing">
            <Button variant="outline" size="sm" className="border-foreground/10 text-foreground/50 hover:text-foreground text-xs">
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
