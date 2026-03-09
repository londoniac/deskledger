// HMRC-compliant expense categories — shared between server and client
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
  { id: "capital", label: "Capital / Seed Money" },
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
