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
];
