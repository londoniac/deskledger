export const EXPENSE_CATEGORIES = [
  { id: "office", label: "Office & Premises", hmrc: "Office costs" },
  { id: "travel", label: "Travel & Transport", hmrc: "Travel and subsistence" },
  { id: "staff", label: "Staff Costs", hmrc: "Employee costs" },
  { id: "professional", label: "Professional Fees", hmrc: "Legal and professional costs" },
  { id: "marketing", label: "Marketing & Advertising", hmrc: "Advertising and entertainment" },
  { id: "subscriptions", label: "Subscriptions & Software", hmrc: "Office costs" },
  { id: "insurance", label: "Insurance", hmrc: "Insurance" },
  { id: "utilities", label: "Utilities & Telecom", hmrc: "Office costs" },
  { id: "equipment", label: "Equipment & Assets", hmrc: "Capital allowances" },
  { id: "materials", label: "Materials & Stock", hmrc: "Cost of goods sold" },
  { id: "bank", label: "Bank & Finance Charges", hmrc: "Interest and bank charges" },
  { id: "training", label: "Training & Development", hmrc: "Training costs" },
  { id: "other", label: "Other Expenses", hmrc: "Other business expenses" },
  { id: "transfer", label: "Inter-account Transfer", hmrc: null },
];

export const INCOME_CATEGORIES = [
  { id: "sales", label: "Sales Revenue" },
  { id: "services", label: "Service Income" },
  { id: "interest", label: "Interest Received" },
  { id: "other_income", label: "Other Income" },
];

export const PERSONAL_EXPENSE_CATEGORIES = [
  { id: "groceries", label: "Groceries & Food" },
  { id: "rent", label: "Rent / Mortgage" },
  { id: "utilities_personal", label: "Bills & Utilities" },
  { id: "transport", label: "Transport & Fuel" },
  { id: "entertainment", label: "Entertainment & Leisure" },
  { id: "dining", label: "Eating Out & Takeaways" },
  { id: "shopping", label: "Shopping & Clothing" },
  { id: "health", label: "Health & Fitness" },
  { id: "subscriptions_personal", label: "Subscriptions" },
  { id: "insurance_personal", label: "Insurance" },
  { id: "debt", label: "Debt Repayment" },
  { id: "savings", label: "Savings & Investments" },
  { id: "childcare", label: "Childcare & Education" },
  { id: "pets", label: "Pets" },
  { id: "gifts", label: "Gifts & Donations" },
  { id: "personal_other", label: "Other" },
  { id: "transfer", label: "Transfer Between Accounts" },
];

export const PERSONAL_INCOME_CATEGORIES = [
  { id: "salary", label: "Salary / Wages" },
  { id: "freelance", label: "Freelance / Side Income" },
  { id: "benefits", label: "Benefits & Credits" },
  { id: "interest_personal", label: "Interest & Dividends" },
  { id: "refunds", label: "Refunds" },
  { id: "gifts_received", label: "Gifts Received" },
  { id: "other_personal_income", label: "Other Income" },
];

export const PALETTE = {
  bg: "#0F1117",
  card: "#1A1D27",
  cardHover: "#22262F",
  border: "#2A2E3A",
  accent: "#4ADE80",
  accentDim: "#22543D",
  danger: "#F87171",
  dangerDim: "#7F1D1D",
  warning: "#FBBF24",
  text: "#E2E8F0",
  textDim: "#94A3B8",
  textMuted: "#64748B",
  income: "#4ADE80",
  expense: "#F87171",
  purple: "#A78BFA",
  blue: "#60A5FA",
  orange: "#FB923C",
  pink: "#F472B6",
  cyan: "#22D3EE",
};

export const PIE_COLORS = [
  PALETTE.accent, PALETTE.blue, PALETTE.purple, PALETTE.orange,
  PALETTE.pink, PALETTE.cyan, PALETTE.warning, PALETTE.danger,
  "#818CF8", "#34D399", "#F9A8D4", "#FCD34D", "#6EE7B7",
];
