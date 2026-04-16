import { useAuth } from "@/hooks/useAuth";
import { useCrypto } from "@/hooks/useCrypto";
import { Navigate, useLocation } from "react-router-dom";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { isUnlocked } = useCrypto();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // User is authenticated but vault is locked (page refresh, inactivity timeout, etc.)
  // Pass the original path so Login can redirect back after unlock
  if (!isUnlocked) return <Navigate to="/login" state={{ vaultLocked: true, from: location.pathname }} replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
