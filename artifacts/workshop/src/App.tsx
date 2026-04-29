import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { WorkerLayout } from "@/pages/portal/worker-layout";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

import Dashboard from "@/pages/dashboard";
import Jobs from "@/pages/jobs";
import Settings from "@/pages/settings";
import Analytics from "@/pages/analytics";
import Expenses from "@/pages/expenses";
import Parts from "@/pages/parts";
import Workers from "@/pages/workers";
import WorkerDetail from "@/pages/worker-detail";
import Credentials from "@/pages/credentials";
import Reports from "@/pages/reports";
import LoginPage from "@/pages/login";
import ChangePasswordPage from "@/pages/change-password";

import Attendance from "@/pages/attendance";
import WorkerHome from "@/pages/portal/worker-home";
import WorkerJobs from "@/pages/portal/worker-jobs";
import WorkerProfile from "@/pages/portal/worker-profile";
import WorkerSubmitJob from "@/pages/portal/worker-submit-job";
import WorkerAttendance from "@/pages/portal/worker-attendance";

const queryClient = new QueryClient();

function RedirectTo({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to); }, [to, navigate]);
  return null;
}

function AdminRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/jobs" component={Jobs} />
        <Route path="/workers" component={Workers} />
        <Route path="/workers/:id" component={WorkerDetail} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/parts" component={Parts} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/reports" component={Reports} />
        <Route path="/attendance" component={Attendance} />
        <Route path="/settings" component={Settings} />
        <Route path="/credentials" component={Credentials} />
        <Route path="/portal">{() => <RedirectTo to="/" />}</Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function ManagerRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/">{() => <RedirectTo to="/jobs" />}</Route>
        <Route path="/jobs" component={Jobs} />
        <Route path="/workers" component={Workers} />
        <Route path="/workers/:id" component={WorkerDetail} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/parts" component={Parts} />
        <Route path="/attendance" component={Attendance} />
        <Route path="/portal">{() => <RedirectTo to="/jobs" />}</Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function WorkerRouter() {
  return (
    <WorkerLayout>
      <Switch>
        <Route path="/portal" component={WorkerHome} />
        <Route path="/portal/jobs" component={WorkerJobs} />
        <Route path="/portal/submit-job" component={WorkerSubmitJob} />
        <Route path="/portal/attendance" component={WorkerAttendance} />
        <Route path="/portal/profile" component={WorkerProfile} />
        <Route>{() => <RedirectTo to="/portal" />}</Route>
      </Switch>
    </WorkerLayout>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/change-password" component={ChangePasswordPage} />
        <Route component={LoginPage} />
      </Switch>
    );
  }

  if (user.mustChangePassword) {
    return <ChangePasswordPage />;
  }

  if (user.role === "admin") {
    return <AdminRouter />;
  }

  if (user.role === "manager") {
    return <ManagerRouter />;
  }

  return <WorkerRouter />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
