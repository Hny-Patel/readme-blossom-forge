import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { CryptoProvider } from "@/hooks/useCrypto";
import { BusinessProvider } from "@/hooks/useBusiness";
import { AdminProvider } from "@/hooks/useAdmin";
import { SubscriptionProvider } from "@/hooks/useSubscription";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import AppLayout from "@/components/AppLayout";
import AdminLayout from "@/components/AdminLayout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Transactions from "./pages/Transactions";
import Categories from "./pages/Categories";
import Settings from "./pages/Settings";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import AccountDetail from "./pages/AccountDetail";
import Cashbook from "./pages/Cashbook";
import Expenses from "./pages/Expenses";
import NotFound from "./pages/NotFound";
import Onboarding from "@/components/Onboarding";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminPlans from "./pages/admin/AdminPlans";
import AdminSubscriptions from "./pages/admin/AdminSubscriptions";
import AdminPayments from "./pages/admin/AdminPayments";
import AdminCoupons from "./pages/admin/AdminCoupons";
import AdminRestrictions from "./pages/admin/AdminRestrictions";

const queryClient = new QueryClient();

const ProtectedApp = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <BusinessProvider>
      <SubscriptionProvider>
        <AppLayout>{children}</AppLayout>
      </SubscriptionProvider>
    </BusinessProvider>
  </ProtectedRoute>
);

const AdminApp = ({ children }: { children: React.ReactNode }) => (
  <AdminRoute>
    <AdminLayout>{children}</AdminLayout>
  </AdminRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CryptoProvider>
            <AdminProvider>
              <Onboarding />
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                {/* User app routes */}
                <Route path="/" element={<ProtectedApp><Dashboard /></ProtectedApp>} />
                <Route path="/accounts" element={<ProtectedApp><Accounts /></ProtectedApp>} />
                <Route path="/accounts/:id" element={<ProtectedApp><AccountDetail /></ProtectedApp>} />
                <Route path="/transactions" element={<ProtectedApp><Transactions /></ProtectedApp>} />
                <Route path="/categories" element={<ProtectedApp><Categories /></ProtectedApp>} />
                <Route path="/analytics" element={<ProtectedApp><Analytics /></ProtectedApp>} />
                <Route path="/reports" element={<ProtectedApp><Reports /></ProtectedApp>} />
                <Route path="/expenses" element={<ProtectedApp><Expenses /></ProtectedApp>} />
                <Route path="/cashbook" element={<ProtectedApp><Cashbook /></ProtectedApp>} />
                <Route path="/settings" element={<ProtectedApp><Settings /></ProtectedApp>} />
                {/* Admin routes */}
                <Route path="/admin" element={<AdminApp><AdminDashboard /></AdminApp>} />
                <Route path="/admin/users" element={<AdminApp><AdminUsers /></AdminApp>} />
                <Route path="/admin/plans" element={<AdminApp><AdminPlans /></AdminApp>} />
                <Route path="/admin/subscriptions" element={<AdminApp><AdminSubscriptions /></AdminApp>} />
                <Route path="/admin/payments" element={<AdminApp><AdminPayments /></AdminApp>} />
                <Route path="/admin/coupons" element={<AdminApp><AdminCoupons /></AdminApp>} />
                <Route path="/admin/restrictions" element={<AdminApp><AdminRestrictions /></AdminApp>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AdminProvider>
          </CryptoProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
