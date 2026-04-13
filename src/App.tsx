import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { CryptoProvider } from "@/hooks/useCrypto";
import { BusinessProvider } from "@/hooks/useBusiness";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedApp = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <BusinessProvider>
      <AppLayout>{children}</AppLayout>
    </BusinessProvider>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CryptoProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/" element={<ProtectedApp><Dashboard /></ProtectedApp>} />
            <Route path="/accounts" element={<ProtectedApp><Accounts /></ProtectedApp>} />
            <Route path="/transactions" element={<ProtectedApp><Transactions /></ProtectedApp>} />
            <Route path="/categories" element={<ProtectedApp><Categories /></ProtectedApp>} />
            <Route path="/analytics" element={<ProtectedApp><Analytics /></ProtectedApp>} />
            <Route path="/reports" element={<ProtectedApp><Reports /></ProtectedApp>} />
            <Route path="/accounts/:id" element={<ProtectedApp><AccountDetail /></ProtectedApp>} />
            <Route path="/settings" element={<ProtectedApp><Settings /></ProtectedApp>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </CryptoProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
