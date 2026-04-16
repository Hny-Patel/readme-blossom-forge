# VaultLedger

A business ledger built for shop owners and small businesses who want full control over their financial data. Every entry — amounts, names, notes — is encrypted before it leaves your device. The server stores ciphertext; only you hold the key.

---

## What it does

**Accounts** — create customer and supplier accounts to track who owes you and who you owe. Each account shows a running balance calculated from all its transactions. Set an opening balance when creating an account.

**Transactions** — record credits (money coming in) and debits (money going out) against any account. Supports cash, bank transfer, UPI, and cheque payment methods. Add categories, notes, and dates.

**Cashbook** — a chronological view of all money movement across your business. Filter by date range, payment method, or party. Shows opening balance, closing balance, and total in/out for any period.

**Expenses** — track business expenses separately from account transactions. Categorise by type (rent, utilities, salaries, etc.), add notes, and see a monthly breakdown.

**Analytics** — charts showing income vs expense trends, cash flow over time, top customers by volume, and category-wise spending. All calculated from your actual transaction data.

**Reports** — generate filtered reports by date range, account, or category. Export to PDF or Excel.

**Multiple businesses** — run more than one business from a single login. Switch between them from the sidebar. Each business has completely separate accounts, transactions, and data.

---

## Security model

All sensitive fields (amounts, names, contact details, notes) are encrypted client-side using **AES-256-GCM** before being sent to the server. The encryption key never leaves your browser unencrypted.

- Your password derives an encryption key (KEK) via PBKDF2 with a unique random salt
- The KEK wraps the data encryption key (DEK), which is stored encrypted in the database
- A **recovery key** is generated at signup — this is the only way to recover your data if you forget your password
- The vault locks automatically after inactivity and requires your password to reopen

---

## SaaS plans

| Plan | Monthly | Yearly | Businesses | Accounts | Transactions/mo |
|---|---|---|---|---|---|
| Free | ₹0 | ₹0 | 1 | 10 | 50 |
| Starter | ₹299 | ₹2,990 | 2 | 100 | 500 |
| Pro | ₹699 | ₹6,990 | 5 | Unlimited | Unlimited |
| Enterprise | ₹1,499 | ₹14,990 | Unlimited | Unlimited | Unlimited |

Payments processed via Razorpay. Lifetime deals available through the admin panel.

---

## Tech stack

- **Frontend** — React 18, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **Backend** — Supabase (PostgreSQL, Auth, Row Level Security, Edge Functions)
- **Encryption** — Web Crypto API (AES-256-GCM, PBKDF2) — runs entirely in the browser
- **Payments** — Razorpay Orders API

---

## Local development

```bash
# Install dependencies
npm install

# Set up environment variables
# Create a .env file with:
# VITE_SUPABASE_URL=your_supabase_url
# VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
# VITE_RAZORPAY_KEY_ID=your_razorpay_key_id

# Start dev server
npm run dev
```

The app runs at `http://localhost:8080`.

Run the migration files in `supabase/migrations/` through the Supabase SQL Editor in chronological order before using the app.

---

## Project structure

```
src/
  pages/           Route-level pages (Dashboard, Accounts, Transactions, etc.)
  pages/admin/     Admin panel (Users, Plans, Payments, Coupons, Restrictions)
  components/      Shared UI components
  hooks/           Auth, crypto, business, subscription context hooks
  lib/             Crypto utilities, audit logging
supabase/
  functions/       Edge Functions for Razorpay payment processing
  migrations/      SQL migration files in order
```

---

## Admin panel

Accessible at `/admin` for accounts seeded in the `admin_users` table. From here you can:

- View all registered users and their subscription status
- Manually upgrade, downgrade, or extend subscriptions
- Give lifetime deals to specific users
- Record manual payments and generate invoices (INV-0001 format)
- Create and manage discount coupons with usage limits and expiry dates
- Block or suspend user accounts with a reason and optional expiry
- Edit plan pricing and toggle feature access per plan
