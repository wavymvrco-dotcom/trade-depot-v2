import { Switch, Route, Redirect, useLocation } from "wouter";
import { Suspense, lazy, useEffect, useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";
import Auth from "@/pages/Auth";
import Landing from "@/pages/Landing";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
const Pricing = lazy(() => import("@/pages/Pricing"));

const Onboarding    = lazy(() => import("@/pages/Onboarding"));
const Analysis      = lazy(() => import("@/pages/Analysis"));
const Settings      = lazy(() => import("@/pages/Settings"));
const Strategy      = lazy(() => import("@/pages/Strategy"));
const Alerts        = lazy(() => import("@/pages/Alerts"));
const Marketplace   = lazy(() => import("@/pages/Marketplace"));
const PublicProfile = lazy(() => import("@/pages/PublicProfile"));
const AppHealth     = lazy(() => import("@/pages/AppHealth"));
const Admin         = lazy(() => import("@/pages/Admin"));
const Trade         = lazy(() => import("@/pages/Trade"));
const Tdci          = lazy(() => import("@/pages/Tdci"));
const Terminal      = lazy(() => import("@/pages/Terminal"));
const Lab           = lazy(() => import("@/pages/Lab"));
const Performance   = lazy(() => import("@/pages/Performance"));
const LearnHub      = lazy(() => import("@/pages/LearnHub"));

const Loader = () => (
  <div className="w-full h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

function PublicRoutes() {
  const [location] = useLocation();
  if (location === "/landing" || location === "/") return null; // handled by Router
  if (location === "/terms") return <Terms />;
  if (location === "/privacy") return <Privacy />;
  if (location === "/forgot-password") return <ForgotPassword />;
  if (location.startsWith("/reset-password")) return <ResetPassword />;
  if (location.startsWith("/verify-email")) return <VerifyEmail />;
  if (location === "/auth") return <Auth />;
  return null;
}

function Router() {
  const [location, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  // Always-public paths (never require auth)
  const alwaysPublic = ["/landing", "/terms", "/privacy", "/forgot-password", "/reset-password", "/verify-email", "/auth"];
  const isPublic = alwaysPublic.some(p => location === p || location.startsWith(p + "?") || location.startsWith(p + "/"));

  // Hooks must run on every render, so the public-route early return comes after them
  useEffect(() => {
    if (isPublic) return;
    if (loading || !user) { setOnboardingChecked(false); return; }
    const localDone = localStorage.getItem("tradeai_onboarded") === "true";
    if (localDone) { setOnboardingDone(true); setOnboardingChecked(true); return; }
    fetch("/api/settings/onboarding-status", { credentials: "include" })
      .then(r => r.json())
      .then(d => { setOnboardingDone(d.completed === true); setOnboardingChecked(true); })
      .catch(() => { setOnboardingDone(false); setOnboardingChecked(true); });
  }, [user, loading, isPublic]);

  useEffect(() => {
    if (isPublic || loading || !user || !onboardingChecked) return;
    if (!onboardingDone && location !== "/onboarding") setLocation("/onboarding");
    else if (onboardingDone && location === "/onboarding") setLocation("/");
  }, [user, loading, onboardingChecked, onboardingDone, location, isPublic]);

  if (isPublic) return <PublicRoutes />;
  if (loading || (user && !onboardingChecked)) return <Loader />;

  // Unauthenticated users get the landing page at root or any app route
  if (!user) return <Landing />;

  return (
    <Switch>
      <Route path="/onboarding"><Suspense fallback={<Loader />}><Onboarding onComplete={() => { setOnboardingDone(true); queryClient.invalidateQueries(); }} /></Suspense></Route>
      {/* The five hubs */}
      <Route path="/"><Suspense fallback={<Loader />}><Terminal /></Suspense></Route>
      <Route path="/lab"><Suspense fallback={<Loader />}><Lab /></Suspense></Route>
      <Route path="/performance"><Suspense fallback={<Loader />}><Performance /></Suspense></Route>
      <Route path="/learn"><Suspense fallback={<Loader />}><LearnHub /></Suspense></Route>
      {/* Old URLs now live inside a hub */}
      <Route path="/analytics"><Redirect to="/performance?tab=analytics" replace /></Route>
      <Route path="/journal"><Redirect to="/performance?tab=journal" replace /></Route>
      <Route path="/ai"><Redirect to="/learn?tab=advisor" replace /></Route>
      <Route path="/news"><Redirect to="/?panel=news" replace /></Route>
      <Route path="/calendar"><Redirect to="/?panel=calendar" replace /></Route>
      {/* Still reachable from a hub (Terminal, Lab) until Phase 1 replaces them */}
      <Route path="/analysis"><Suspense fallback={<Loader />}><Analysis /></Suspense></Route>
      <Route path="/strategy"><Suspense fallback={<Loader />}><Strategy /></Suspense></Route>
      <Route path="/alerts"><Suspense fallback={<Loader />}><Alerts /></Suspense></Route>
      <Route path="/settings"><Suspense fallback={<Loader />}><Settings /></Suspense></Route>
      <Route path="/marketplace"><Suspense fallback={<Loader />}><Marketplace /></Suspense></Route>
      <Route path="/profile/:username"><Suspense fallback={<Loader />}><PublicProfile /></Suspense></Route>
      <Route path="/health"><Suspense fallback={<Loader />}><AppHealth /></Suspense></Route>
      <Route path="/admin"><Suspense fallback={<Loader />}><Admin /></Suspense></Route>
      <Route path="/pricing"><Suspense fallback={<Loader />}><Pricing /></Suspense></Route>
      <Route path="/trade"><Suspense fallback={<Loader />}><Trade /></Suspense></Route>
      <Route path="/tdci"><Suspense fallback={<Loader />}><Tdci /></Suspense></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <ErrorBoundary fallbackLabel="Application error — please refresh">
            <Router />
          </ErrorBoundary>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
