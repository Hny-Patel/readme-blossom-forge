import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { useCrypto } from "@/hooks/useCrypto";
import { decryptField } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Download, FileText, FilterX, Search } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  accountId: string;
  categoryId: string;
  type: string;
  paymentMethod: string;
}

const Reports = () => {
  const { activeBusiness } = useBusiness();
  const { dek, isUnlocked } = useCrypto();
  
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [filters, setFilters] = useState<ReportFilters>({
    dateFrom: "",
    dateTo: "",
    accountId: "all",
    categoryId: "all",
    type: "all",
    paymentMethod: "all",
  });

  const [summary, setSummary] = useState({
    credit: 0,
    debit: 0,
    net: 0,
    count: 0
  });

  useEffect(() => {
    if (!activeBusiness) return;
    const fetchSelects = async () => {
      const [accRes, catRes] = await Promise.all([
        supabase.from("accounts").select("id, name").eq("business_id", activeBusiness.id).order("name"),
        supabase.from("categories").select("id, name").order("name"),
      ]);
      if (accRes.data) setAccounts(accRes.data);
      if (catRes.data) setCategories(catRes.data);
    };
    fetchSelects();
  }, [activeBusiness]);

  const fetchReports = async () => {
    if (!activeBusiness || !isUnlocked || !dek) return;
    setLoading(true);

    let query = supabase
      .from("transactions")
      .select("*, accounts(name), categories(name, color)")
      .eq("business_id", activeBusiness.id)
      .order("transaction_date", { ascending: false });

    if (filters.dateFrom) query = query.gte("transaction_date", filters.dateFrom);
    if (filters.dateTo) query = query.lte("transaction_date", filters.dateTo);
    if (filters.type !== "all") query = query.eq("type", filters.type);
    if (filters.accountId !== "all") query = query.eq("account_id", filters.accountId);
    if (filters.categoryId !== "all") query = query.eq("category_id", filters.categoryId);
    if (filters.paymentMethod !== "all") query = query.eq("payment_method", filters.paymentMethod);

    const { data } = await query;
    const txs = data || [];

    let totalCredit = 0;
    let totalDebit = 0;

    const decryptedTxs = await Promise.all(
      txs.map(async (row) => {
        let amount = Number(row.amount);
        if (row.amount_enc && row.amount_iv && dek) {
          try { amount = parseFloat(await decryptField(row.amount_enc, row.amount_iv, dek)); } catch { /* fallback */ }
        }
        let notes = row.notes as string | null;
        if (row.notes_enc && row.notes_iv && dek) {
          try { notes = await decryptField(row.notes_enc, row.notes_iv, dek); } catch { /* fallback */ }
        }
        
        if (row.type === "credit") totalCredit += amount;
        else totalDebit += amount;

        return { ...row, amount, notes };
      })
    );

    setTransactions(decryptedTxs);
    setSummary({
      credit: totalCredit,
      debit: totalDebit,
      net: totalCredit - totalDebit,
      count: decryptedTxs.length
    });
    setLoading(false);
  };

  const handleApplyFilters = () => {
    fetchReports();
  };

  const handleResetFilters = () => {
    setFilters({
      dateFrom: "",
      dateTo: "",
      accountId: "all",
      categoryId: "all",
      type: "all",
      paymentMethod: "all",
    });
    // Let the next render handle this or just call manually
    // Will just set state, user clicks Apply again, or we call fetchReports() here but state updates async
  };
  
  // Also fetch automatically when they first load
  useEffect(() => {
    fetchReports();
  }, [activeBusiness, dek, isUnlocked]);

  const exportCSV = () => {
    const headers = ['Date','Party','Type','Payment','Category','Amount','Notes'];
    const csv = [headers, ...transactions.map(r => [
      format(new Date(r.transaction_date), "yyyy-MM-dd"), 
      r.accounts?.name || '', 
      r.type,
      r.payment_method || '', 
      r.categories?.name || '',
      r.amount.toFixed(2), 
      (r.notes || '').replace(/,/g, ' ') // protect CSV
    ])].map(r => r.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vaultledger-report-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const businessName = activeBusiness?.name || 'VaultLedger';
    
    doc.setFontSize(16);
    doc.text(`${businessName} — Transaction Report`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 14, 22);
    
    if (filters.dateFrom || filters.dateTo) {
      doc.text(`Period: ${filters.dateFrom || 'Start'} to ${filters.dateTo || 'End'}`, 14, 28);
    }

    autoTable(doc, {
      head: [['Date', 'Party', 'Type', 'Payment', 'Category', 'Amount', 'Notes']],
      body: transactions.map(r => [
        format(new Date(r.transaction_date), "dd MMM yyyy"),
        r.accounts?.name || '—',
        r.type.toUpperCase(),
        r.payment_method?.toUpperCase() || '—',
        r.categories?.name || '—',
        `Rs ${r.amount.toFixed(2)}`,
        r.notes || ''
      ]),
      startY: 35,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 40;
    doc.text(`Total Credit: Rs ${summary.credit.toFixed(2)}`, 14, finalY + 10);
    doc.text(`Total Debit: Rs ${summary.debit.toFixed(2)}`, 14, finalY + 16);
    doc.text(`Net Balance: Rs ${summary.net.toFixed(2)}`, 14, finalY + 22);

    doc.save(`vaultledger-report-${Date.now()}.pdf`);
  };

  if (!isUnlocked) {
    return (
      <div className="p-8 text-center text-muted-foreground animate-fade-in">
        <h2 className="text-xl font-semibold mb-2">Vault is locked</h2>
        <p>Please log in again to generate reports.</p>
      </div>
    );
  }

  if (!activeBusiness) {
    return <div className="p-8 text-center text-muted-foreground">Select a business first.</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reports</h1>
      </div>

      <div className="glass-card p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Input 
            type="date" 
            value={filters.dateFrom} 
            onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
            placeholder="From Date"
          />
          <Input 
            type="date" 
            value={filters.dateTo} 
            onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
            placeholder="To Date"
          />
          <Select value={filters.accountId} onValueChange={(v) => setFilters({...filters, accountId: v})}>
            <SelectTrigger><SelectValue placeholder="All Accounts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.categoryId} onValueChange={(v) => setFilters({...filters, categoryId: v})}>
            <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.type} onValueChange={(v) => setFilters({...filters, type: v})}>
            <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="credit">Credit (In)</SelectItem>
              <SelectItem value="debit">Debit (Out)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.paymentMethod} onValueChange={(v) => setFilters({...filters, paymentMethod: v})}>
            <SelectTrigger><SelectValue placeholder="All Payments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank">Bank</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleApplyFilters} className="bg-primary text-primary-foreground"><Search className="w-4 h-4 mr-2" /> Apply Filters</Button>
          <Button onClick={handleResetFilters} variant="outline"><FilterX className="w-4 h-4 mr-2" /> Reset</Button>
        </div>
      </div>

      <div className="glass-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="font-semibold">{summary.count} transactions found</span>
          <span className="text-chart-credit">Total Credit: ₹{summary.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          <span className="text-chart-debit">Total Debit: ₹{summary.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          <span className={`font-bold ${summary.net >= 0 ? "text-chart-credit" : "text-chart-debit"}`}>
            Net: ₹{Math.abs(summary.net).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button onClick={exportCSV} variant="outline" className="flex-1 md:flex-none">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button onClick={exportPDF} variant="outline" className="flex-1 md:flex-none">
            <FileText className="w-4 h-4 mr-2" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-md border text-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading reports...</div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No transactions match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Date</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(t.transaction_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>{t.accounts?.name || "—"}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-semibold ${t.type === 'credit' ? 'bg-chart-credit/10 text-chart-credit' : 'bg-chart-debit/10 text-chart-debit'}`}>
                        {t.type}
                      </span>
                    </TableCell>
                    <TableCell className="uppercase">{t.payment_method || "—"}</TableCell>
                    <TableCell>
                      {t.categories?.name ? (
                        <span style={{ color: t.categories.color || undefined }}>{t.categories.name}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-medium ${t.type === 'credit' ? 'text-chart-credit' : 'text-chart-debit'}`}>
                      {t.type === 'credit' ? '+' : '-'}₹{t.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={t.notes || ""}>
                      {t.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
