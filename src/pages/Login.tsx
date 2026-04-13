import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCrypto, VaultError } from "@/hooks/useCrypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, Lock, Mail, KeyRound, ArrowLeft, AlertTriangle } from "lucide-react";

type LoginView = 'login' | 'recovery' | 'new-recovery-key' | 'forgot-password';

const Login = () => {
  const navigate = useNavigate();
  const { unlockVault, unlockVaultWithRecovery, createVaultKey } = useCrypto();

  const [view, setView] = useState<LoginView>('login');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [loading, setLoading] = useState(false);

  // When self-healing creates a new vault key, show the new recovery key
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);
  const [newKeyCopied, setNewKeyCopied] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotWarning, setForgotWarning] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    try {
      await unlockVault(password, data.user.id);
      navigate("/");
    } catch (vaultError) {
      if (vaultError instanceof VaultError && vaultError.code === 'NO_KEY_ROW') {
        // No vault key exists — create one now (user is authenticated, so RLS will pass)
        try {
          const generatedRecoveryKey = await createVaultKey(password, data.user.id);
          setNewRecoveryKey(generatedRecoveryKey);
          setView('new-recovery-key');
        } catch (createError) {
          await supabase.auth.signOut();
          toast.error("Could not set up your vault. Please try signing up again.");
        }
      } else {
        await supabase.auth.signOut();
        toast.error("Vault decryption failed — wrong password?");
      }
    }

    setLoading(false);
  };

  const handleRecoveryLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryKey.trim()) return;
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    try {
      await unlockVaultWithRecovery(recoveryKey.trim(), data.user.id);
      navigate("/");
    } catch (vaultError) {
      await supabase.auth.signOut();
      if (vaultError instanceof VaultError && vaultError.code === 'NO_RECOVERY_KEY') {
        toast.error("No recovery key was stored for this account.");
      } else {
        toast.error("Invalid recovery key. Please double-check and try again.");
      }
    }

    setLoading(false);
  };

  // Shown after self-heal creates a new vault key — user must save new recovery key
  if (view === 'new-recovery-key' && newRecoveryKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg glass-card p-8 space-y-6 animate-fade-in">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-amber-500/10 mb-4">
              <Shield className="w-7 h-7 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold">New Recovery Key Generated</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Your vault key was missing and has been recreated. Save this new recovery key — it won't be shown again.
            </p>
          </div>

          <div className="bg-muted/50 border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-2 font-mono uppercase tracking-widest">Recovery Key</p>
            <p className="font-mono text-sm break-all leading-relaxed select-all">{newRecoveryKey}</p>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await navigator.clipboard.writeText(newRecoveryKey);
              setNewKeyCopied(true);
              toast.success("Copied!");
            }}
          >
            {newKeyCopied ? "Copied!" : "Copy to Clipboard"}
          </Button>

          <Button className="w-full" onClick={() => navigate("/")}>
            Continue to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // Forgot password view
  if (view === 'forgot-password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 mb-4 glow-primary">
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gradient">VaultLedger</h1>
          </div>

          <div className="glass-card p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Reset Password</h2>
            </div>

            {!forgotWarning ? (
              <>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-2 text-sm text-amber-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Warning:</strong> Resetting your password will permanently lock your vault data unless you have your Recovery Key. Your encrypted data cannot be recovered without it.
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">Do you have your Recovery Key saved?</p>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setForgotWarning(true)}>
                    Yes, send reset email
                  </Button>
                  <Button variant="ghost" className="flex-1" onClick={() => setView('login')}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : forgotSent ? (
              <div className="text-center space-y-3 py-4">
                <p className="text-chart-credit font-medium">Reset email sent!</p>
                <p className="text-sm text-muted-foreground">Check your email for the reset link. After resetting, use your Recovery Key to restore vault access.</p>
                <Button variant="outline" className="w-full" onClick={() => setView('login')}>Back to Login</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={loading || !email}
                  onClick={async () => {
                    setLoading(true);
                    const { error } = await supabase.auth.resetPasswordForEmail(email, {
                      redirectTo: `${window.location.origin}/login`,
                    });
                    if (error) toast.error(error.message);
                    else setForgotSent(true);
                    setLoading(false);
                  }}
                >
                  {loading ? "Sending..." : "Send Reset Email"}
                </Button>
              </div>
            )}

            <button onClick={() => setView('login')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3 h-3" /> Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Recovery key view
  if (view === 'recovery') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 mb-4 glow-primary">
              <KeyRound className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gradient">VaultLedger</h1>
            <p className="text-muted-foreground mt-1">Recover with your key</p>
          </div>

          <div className="glass-card p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Use Recovery Key</h2>
              <p className="text-sm text-muted-foreground">Enter your email, password, and the recovery key you saved during signup.</p>
            </div>

            <form onSubmit={handleRecoveryLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rec-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="rec-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rec-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="rec-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recovery-key">Recovery Key</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="recovery-key"
                    placeholder="Paste your 64-character recovery key"
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                    className="pl-10 font-mono text-xs"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Unlocking vault..." : "Unlock with Recovery Key"}
              </Button>
            </form>

            <button
              onClick={() => setView('login')}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3 h-3" /> Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Normal login view
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 mb-4 glow-primary">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gradient">VaultLedger</h1>
          <p className="text-muted-foreground mt-1">Secure Business Ledger</p>
        </div>

        <div className="glass-card p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">
                Don't have an account?{" "}
                <Link to="/signup" className="text-primary hover:underline">Create one</Link>
              </p>
              <button
                type="button"
                onClick={() => setView('recovery')}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <KeyRound className="w-3 h-3" /> Recovery key
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setForgotWarning(false); setForgotSent(false); setView('forgot-password'); }}
              className="text-muted-foreground hover:text-foreground text-xs transition-colors"
            >
              Forgot password?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
