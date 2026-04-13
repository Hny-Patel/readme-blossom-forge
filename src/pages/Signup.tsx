import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, Lock, Mail, Building2, Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import { deriveKEK, generateDEK, wrapDEK, toBase64 } from "@/lib/crypto";

const Signup = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);

  // Recovery key modal state
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (!data.user) {
      toast.error("Signup failed — no user returned");
      setLoading(false);
      return;
    }

    try {
      // 1. Generate primary KEK + DEK
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const kek = await deriveKEK(password, salt);
      const dek = await generateDEK();
      const wrappedDEK = await wrapDEK(dek, kek, iv);

      // 2. Generate recovery key and wrap DEK with it separately
      const recoveryBytes = crypto.getRandomValues(new Uint8Array(32));
      const recoveryHex = Array.from(recoveryBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const recSalt = crypto.getRandomValues(new Uint8Array(16));
      const recIv = crypto.getRandomValues(new Uint8Array(12));
      const recKek = await deriveKEK(recoveryHex, recSalt);
      const recWrapped = await wrapDEK(dek, recKek, recIv);

      // 3. Save to user_keys
      const { error: keyError } = await supabase.from("user_keys").insert({
        user_id: data.user.id,
        encrypted_dek: toBase64(wrappedDEK),
        dek_iv: toBase64(iv),
        pbkdf2_salt: toBase64(salt),
        recovery_encrypted_dek: JSON.stringify({
          ciphertext: toBase64(recWrapped),
          iv: toBase64(recIv),
          salt: toBase64(recSalt),
        }),
      });

      if (keyError) {
        // This can happen if email confirmation is required and the session isn't active yet.
        // The key will be created on first login instead.
        console.warn("user_keys insert failed (will retry on login):", keyError.message);
      }

      // 4. Create the first business
      const { error: bizError } = await supabase.from("businesses").insert({
        user_id: data.user.id,
        name: businessName,
        type: "other",
      });
      if (bizError) {
        console.error("Failed to create business:", bizError);
      }

      // 5. Show recovery key modal
      setRecoveryKey(recoveryHex);
    } catch (cryptoError) {
      console.error("Encryption setup failed:", cryptoError);
      toast.error("Failed to set up vault encryption. Please try again.");
    }

    setLoading(false);
  };

  const handleCopyRecoveryKey = async () => {
    if (!recoveryKey) return;
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    toast.success("Recovery key copied!");
  };

  const handleProceed = () => {
    toast.success("Account created! Check your email to confirm.");
    navigate("/login");
  };

  // Recovery key modal overlay
  if (recoveryKey) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
        <div className="w-full max-w-lg glass-card p-8 space-y-6 animate-fade-in">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-amber-500/10 mb-4">
              <Shield className="w-7 h-7 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold">Save Your Recovery Key</h2>
            <p className="text-sm text-muted-foreground mt-2">
              This is the <strong>only way</strong> to recover your vault if you forget your password.
              It will <strong>never be shown again</strong>.
            </p>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 flex gap-2 text-sm text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Store this somewhere safe — a password manager, printed paper, or encrypted notes.</span>
          </div>

          <div className="bg-muted/50 border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-2 font-mono uppercase tracking-widest">
              Recovery Key
            </p>
            <p className="font-mono text-sm break-all leading-relaxed select-all">
              {recoveryKey}
            </p>
          </div>

          <Button variant="outline" className="w-full" onClick={handleCopyRecoveryKey}>
            <Copy className="w-4 h-4 mr-2" />
            {copied ? "Copied!" : "Copy to Clipboard"}
          </Button>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border"
            />
            <span className="text-sm text-muted-foreground">
              I have saved my recovery key. I understand it cannot be recovered if lost.
            </span>
          </label>

          <Button className="w-full" disabled={!confirmed} onClick={handleProceed}>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Continue to Login
          </Button>
        </div>
      </div>
    );
  }

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
            <h2 className="text-lg font-semibold">Create your account</h2>
            <p className="text-sm text-muted-foreground">Start managing your finances securely</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="businessName"
                  placeholder="My Business"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

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
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
