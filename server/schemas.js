import { z } from "zod";

// ─── Shared helpers ───
const optStr = z.string().optional().default("");
const optNull = z.string().nullable().optional().default(null);
const isoDate = z.string().min(1, "Date is required");
const posNum = z.coerce.number().positive("Must be a positive number");
const num = z.coerce.number();
const optNum = z.coerce.number().optional().default(0);

// ─── Transactions (batch upsert — array of objects) ───
export const transactionItem = z.object({
  id: z.string().min(1),
  date: isoDate,
  description: z.string().min(1, "Description is required"),
  amount: num,
  type: z.enum(["income", "expense", "transfer", "reimbursement"]),
  category: optStr,
  source: z.string().optional().default("manual"),
  vat_rate: optNum, vatRate: optNum,
  vat_amount: optNum, vatAmount: optNum,
  reconciled: z.boolean().optional().default(false),
  excluded: z.boolean().optional().default(false),
  exclude_reason: optNull, excludeReason: optNull,
  notes: optStr,
  invoice_id: optNull, invoiceId: optNull,
  linked_transaction_id: optNull, linkedTransactionId: optNull,
  monzo_id: optNull, monzoId: optNull,
  local_currency: optNull, localCurrency: optNull,
  local_amount: z.coerce.number().nullable().optional().default(null),
  localAmount: z.coerce.number().nullable().optional().default(null),
  paypal_transaction_id: optNull, paypalTransactionId: optNull,
  updated_at: z.string().optional(),
}).passthrough();

export const transactionBatch = z.array(transactionItem).min(1, "At least one transaction required");

// ─── Dividends ───
export const dividendSchema = z.object({
  id: z.string().optional(),
  date: isoDate,
  amount: posNum,
  shareholder: z.string().min(1, "Shareholder is required"),
  tax_year: z.string().optional(),
  voucher_no: optStr,
  notes: optStr,
}).passthrough();

// ─── Directors' Loan ───
export const dlaSchema = z.object({
  id: z.string().optional(),
  date: isoDate,
  amount: posNum,
  direction: z.enum(["to_director", "to_company"]),
  description: z.string().min(1, "Description is required"),
  category: optStr,
  transaction_id: optNull,
  notes: optStr,
}).passthrough();

// ─── VAT Returns ───
export const vatReturnSchema = z.object({
  id: z.string().optional(),
  period_start: isoDate,
  period_end: isoDate,
  status: z.enum(["draft", "submitted", "filed"]).optional().default("draft"),
  box1_vat_due_sales: optNum,
  box2_vat_due_acquisitions: optNum,
  box3_total_vat_due: optNum,
  box4_vat_reclaimed: optNum,
  box5_net_vat: optNum,
  box6_total_sales: optNum,
  box7_total_purchases: optNum,
  box8_total_supplies: optNum,
  box9_total_acquisitions: optNum,
  notes: optStr,
}).passthrough();

// ─── Fixed Assets ───
export const fixedAssetSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  description: optStr,
  cost: posNum,
  date_acquired: isoDate,
  date_disposed: optNull,
  disposal_proceeds: optNum,
  category: z.string().min(1, "Category is required"),
  depreciation_method: z.enum(["straight_line", "reducing_balance", "aia"]).optional().default("straight_line"),
  useful_life_years: z.coerce.number().optional().default(3),
  annual_rate: z.coerce.number().optional().default(33.33),
  transaction_id: optNull,
  notes: optStr,
}).passthrough();

// ─── Journal Entries ───
export const journalEntrySchema = z.object({
  id: z.string().optional(),
  date: isoDate,
  description: z.string().min(1, "Description is required"),
  debit_account: z.string().min(1, "Debit account is required"),
  credit_account: z.string().min(1, "Credit account is required"),
  amount: posNum,
  type: z.string().optional().default("adjustment"),
  period: optStr,
  notes: optStr,
}).passthrough();

// ─── Invoices ───
export const invoiceSchema = z.object({
  id: z.string().min(1),
  supplier: z.string().min(1, "Supplier is required"),
  file_name: z.string().optional(), fileName: z.string().optional(),
  file_path: optNull,
  file_size: optNum, fileSize: optNum,
  upload_date: z.string().optional(), uploadDate: z.string().optional(),
  invoice_date: optNull, invoiceDate: optNull,
  description: optStr,
  original_currency: z.string().optional().default("GBP"), originalCurrency: z.string().optional(),
  original_amount: optNum, originalAmount: optNum,
  amount_gbp: optNum, amountGBP: optNum,
  category: z.string().optional().default("subscriptions"),
  transaction_id: optNull, transactionId: optNull,
  notes: optStr,
}).passthrough();

// ─── Personal Expenses ───
export const expenseSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  description: z.string().min(1, "Description is required"),
  amount: posNum,
  category: z.string().optional().default("office"),
  supplier: optStr,
  receipt_path: optNull,
  receipt_name: optStr, receiptName: optStr,
  status: z.enum(["pending", "approved", "paid"]).optional().default("pending"),
  invoice_ref: optStr, invoiceRef: optStr,
  notes: optStr,
  original_amount: z.coerce.number().nullable().optional().default(null),
  original_currency: optNull,
}).passthrough();

// ─── Import ───
export const importParseSchema = z.object({
  csv: z.string().min(1, "No CSV data provided"),
  source: z.string().optional().default("bank"),
  fileName: z.string().optional(),
}).passthrough();

export const importConfirmSchema = z.object({
  transactions: z.array(z.object({
    id: z.string(),
    date: z.string(),
    description: z.string(),
    amount: z.coerce.number(),
    type: z.string(),
  }).passthrough()).min(1, "No transactions to import"),
  closingBalance: z.coerce.number().nullable().optional(),
  closingBalanceDate: z.string().nullable().optional(),
}).passthrough();

// ─── Debts ───
export const debtSchema = z.object({
  name: z.string().min(1, "Name is required"),
  balance: z.coerce.number().optional(),
  creditor: optStr,
  interest_rate: z.coerce.number().optional(),
  monthly_payment: z.coerce.number().optional(),
  term_months: z.coerce.number().optional(),
}).passthrough();

export const debtPaymentSchema = z.object({
  amount: posNum,
  date: isoDate,
  notes: optStr,
}).passthrough();

// ─── Budgets ───
export const budgetSchema = z.object({
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().optional(),
  month: z.string().optional(),
}).passthrough();

export const incomeSourceSchema = z.object({
  earner: z.string().min(1, "Earner is required"),
  amount: z.coerce.number().optional(),
}).passthrough();

export const categoryRuleSchema = z.object({
  pattern: z.string().min(1, "Pattern is required"),
  category: z.string().min(1, "Category is required"),
  type: z.string().min(1, "Type is required"),
  priority: z.coerce.number().optional().default(0),
}).passthrough();

export const customCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  sort_order: z.coerce.number().optional(),
}).passthrough();

// ─── PayPal ───
export const paypalCredentialsSchema = z.object({
  client_id: z.string().min(1, "Client ID is required"),
  client_secret: z.string().min(1, "Client secret is required"),
  sandbox: z.boolean().optional().default(false),
}).passthrough();

export const paypalSyncSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
}).passthrough();

// ─── Profile ───
export const profileUpdateSchema = z.object({
  company_name: z.string().optional(),
  company_reg: z.string().optional(),
  tax_ref: z.string().optional(),
  year_start: z.string().optional(),
  year_end: z.string().optional(),
  seed_money: z.coerce.number().optional(),
  tax_rate: z.coerce.number().optional(),
  vat_registered: z.boolean().optional(),
  vat_number: z.string().optional(),
  vat_scheme: z.string().optional(),
  vat_flat_rate: z.coerce.number().optional(),
  vat_registration_date: z.string().optional(),
  vat_quarter_start: z.coerce.number().optional(),
  paypal_sandbox: z.boolean().optional(),
  account_type: z.string().optional(),
  associated_companies: z.coerce.number().optional(),
  brought_forward_losses: z.coerce.number().optional(),
}).passthrough();
