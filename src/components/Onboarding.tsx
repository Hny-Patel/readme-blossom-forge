import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Shield, Users, ArrowLeftRight, BarChart2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "vaultledger_onboarded";

const steps = [
  {
    icon: Shield,
    iconColor: "text-primary",
    title: "Your finances, end-to-end encrypted",
    desc: "Every amount, name, and note you enter is encrypted using AES-256 before being stored. Not even the server can read your data. Only you can — with your password.",
    extra: null,
  },
  {
    icon: Users,
    iconColor: "text-primary",
    title: "Accounts are your customers & suppliers",
    desc: "An Account represents a person or business you deal with. Create a customer account for people who owe you money, or a supplier account for people you owe money to. Go to Accounts → Add Account to get started.",
    extra: "account-mockup",
  },
  {
    icon: ArrowLeftRight,
    iconColor: "text-primary",
    title: "Credit = money coming in. Debit = money going out.",
    desc: "When a customer pays you → Credit. When you pay a supplier → Debit. Every transaction is linked to an account and supports Cash, Bank, or UPI payment methods.",
    extra: "tx-mockup",
  },
  {
    icon: BarChart2,
    iconColor: "text-primary",
    title: "See where your money goes",
    desc: "The Analytics page shows your cash flow, running balance, and expense breakdown by category. The Reports page lets you filter by date, account, or category and export to PDF or Excel.",
    extra: null,
  },
  {
    icon: CheckCircle2,
    iconColor: "text-chart-credit",
    title: "A few tips before you start",
    desc: "",
    extra: "tips",
  },
];

const stepLabels = [
  "Welcome to VaultLedger 🔐",
  "Start by creating Accounts 👤",
  "Record Transactions 💸",
  "Track with Analytics & Reports 📊",
  "You're all set! 🚀",
];

export default function Onboarding() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (user && !localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, [user]);

  const complete = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  };

  const goTo = (next: number) => {
    setFading(true);
    setTimeout(() => {
      setStep(next);
      setFading(false);
    }, 180);
  };

  if (!visible) return null;

  const current = steps[step];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-card max-w-lg w-full mx-auto p-8 rounded-2xl relative">
        {/* Skip button */}
        <button
          onClick={complete}
          className="absolute top-4 right-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip
        </button>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step label */}
        <p className="text-center text-xs text-muted-foreground mb-4 font-medium uppercase tracking-wider">
          {stepLabels[step]}
        </p>

        {/* Content — fades between steps */}
        <div
          style={{ opacity: fading ? 0 : 1, transition: "opacity 0.18s ease" }}
          className="space-y-5"
        >
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className={`w-7 h-7 ${current.iconColor}`} />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-xl font-semibold text-center">{current.title}</h2>

          {/* Description */}
          {current.desc && (
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              {current.desc}
            </p>
          )}

          {/* Extras */}
          {current.extra === "account-mockup" && (
            <div className="bg-muted/40 border border-border rounded-lg p-3 text-sm font-mono flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">Ramesh Traders</p>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-chart-credit/10 text-chart-credit">
                  customer
                </span>
              </div>
              <span className="text-chart-credit font-bold">+₹25,000</span>
            </div>
          )}

          {current.extra === "tx-mockup" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-chart-credit/10 border border-chart-credit/20 rounded-lg p-3 text-xs font-mono space-y-1">
                <p className="text-chart-credit font-bold">CREDIT ↙</p>
                <p className="text-foreground font-semibold">+₹10,000</p>
                <p className="text-muted-foreground">Ramesh Traders</p>
                <p className="text-muted-foreground">CASH</p>
              </div>
              <div className="bg-chart-debit/10 border border-chart-debit/20 rounded-lg p-3 text-xs font-mono space-y-1">
                <p className="text-chart-debit font-bold">DEBIT ↗</p>
                <p className="text-foreground font-semibold">-₹5,000</p>
                <p className="text-muted-foreground">Suresh Suppliers</p>
                <p className="text-muted-foreground">UPI</p>
              </div>
            </div>
          )}

          {current.extra === "tips" && (
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span>•</span>
                <span>
                  Save your <span className="text-foreground font-medium">Recovery Key</span> — it's the only way to restore your vault if you forget your password. Find it was shown during signup.
                </span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>
                  The green <span className="text-chart-credit">🔒</span> dot in the sidebar means your vault is active and encrypted.
                </span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>
                  Go to <span className="text-foreground font-medium">Settings → Export All Data</span> anytime to download a backup.
                </span>
              </li>
            </ul>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-8">
          {step < steps.length - 1 ? (
            <Button className="w-full" onClick={() => goTo(step + 1)}>
              Next →
            </Button>
          ) : (
            <Button className="w-full" onClick={complete}>
              Start Using VaultLedger ✓
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
