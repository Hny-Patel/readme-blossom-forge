import { useAuth } from "@/hooks/useAuth";
import { useCrypto } from "@/hooks/useCrypto";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { isUnlocked } = useCrypto();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // User is authenticated but vault is locked (page refresh, inactivity timeout, etc.)
  // Must re-enter password to derive DEK
  if (!isUnlocked) return <Navigate to="/login" state={{ vaultLocked: true }} replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
