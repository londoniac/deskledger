// CSV parsing — ported from desktop app

export function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => (obj[h.trim().toLowerCase()] = (values[i] || "").trim()));
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += line[i];
    }
  }
  result.push(current);
  return result;
}

export function normalizeTransactions(rows, source = "bank") {
  return rows.map((row, idx) => {
    const keys = Object.keys(row);
    let date = "", description = "", amount = 0, type = "", sourceId = "";

    // Try common CSV column names
    date = row.date || row.transaction_date || row["created"] || "";
    description = row.description || row.name || row.memo || row.narrative || "";

    // Handle amount: single column or debit/credit split
    const amountStr = row.amount || row.money || row.value || "";
    const debit = row.debit || row["money out"] || row["amount out"] || "";
    const credit = row.credit || row["money in"] || row["amount in"] || "";

    if (amountStr) {
      const val = parseFloat(amountStr.replace(/[£$,]/g, "")) || 0;
      amount = Math.abs(val);
      type = val >= 0 ? "income" : "expense";
    } else if (debit || credit) {
      const d = parseFloat((debit || "0").replace(/[£$,]/g, "")) || 0;
      const c = parseFloat((credit || "0").replace(/[£$,]/g, "")) || 0;
      if (c > 0) {
        amount = c;
        type = "income";
      } else {
        amount = d || 0;
        type = "expense";
      }
    }

    // Source ID for deduplication
    sourceId = row.id || row.transaction_id || row["transaction id"] || "";

    // Normalise date to YYYY-MM-DD for PostgreSQL
    let normDate = date;
    if (date.match(/^\d{2}\/\d{2}\/\d{4}/)) {
      // DD/MM/YYYY → YYYY-MM-DD
      const [d, m, y] = date.split("/");
      normDate = `${y}-${m}-${d}`;
    } else if (date.match(/^\d{4}-\d{2}-\d{2}/)) {
      // Already YYYY-MM-DD — strip time if present
      normDate = date.split("T")[0];
    }

    // Generate stable ID for deduplication
    const stableId = `${source}-${normDate}-${description.slice(0, 40)}-${amount.toFixed(2)}-${idx}`;

    // Detect transactions that should be excluded
    let excluded = false;
    let excludeReason = null;
    const descLower = description.toLowerCase();

    // Seed capital / director's loan
    if (type === "income" && (descLower.includes("seed") || descLower.includes("capital") || descLower.includes("lon in as co"))) {
      excluded = true;
      excludeReason = "capital_injection";
    }
    // PayPal verification deposit
    if (type === "income" && amount <= 0.05 && (descLower.includes("paypal") || descLower.includes("verification"))) {
      excluded = true;
      excludeReason = "verification_deposit";
    }
    // Inter-account transfers (Monzo→PayPal)
    if (type === "expense" && descLower.includes("paypal") && !descLower.includes("failed") && !descLower.includes("author")) {
      excluded = true;
      excludeReason = "inter_account_transfer";
    }
    // Failed payments
    if (descLower.includes("failed") && !descLower.includes("reversal")) {
      excluded = true;
      excludeReason = "failed_payment";
    }
    // Reversals
    if (descLower.includes("reversal") || descLower.includes("relates to a previous")) {
      excluded = true;
      excludeReason = "reversal";
    }

    return {
      id: stableId,
      date: normDate,
      description,
      amount,
      type,
      source,
      category: "",
      vatRate: 0,
      vatAmount: 0,
      notes: "",
      reconciled: false,
      excluded,
      excludeReason,
      monzoId: source === "bank" && sourceId ? sourceId : undefined,
    };
  }).filter((t) => t.amount > 0 && t.description);
}

export function autoCategory(desc, accountType = "business") {
  const d = desc.toLowerCase();

  if (accountType === "personal") {
    // Personal finance keywords
    if (d.includes("tesco") || d.includes("sainsbury") || d.includes("asda") || d.includes("aldi") || d.includes("lidl") || d.includes("waitrose") || d.includes("morrisons") || d.includes("co-op")) return "groceries";
    if (d.includes("netflix") || d.includes("spotify") || d.includes("disney") || d.includes("amazon prime") || d.includes("apple")) return "subscriptions_personal";
    if (d.includes("uber") || d.includes("bolt") || d.includes("tfl") || d.includes("trainline") || d.includes("fuel") || d.includes("petrol") || d.includes("bp") || d.includes("shell")) return "transport";
    if (d.includes("nandos") || d.includes("mcdonalds") || d.includes("deliveroo") || d.includes("just eat") || d.includes("uber eats")) return "dining";
    if (d.includes("gym") || d.includes("fitness") || d.includes("david lloyd") || d.includes("puregym")) return "health";
    if (d.includes("primark") || d.includes("zara") || d.includes("asos") || d.includes("next") || d.includes("h&m")) return "shopping";
    if (d.includes("council tax") || d.includes("water") || d.includes("electric") || d.includes("gas") || d.includes("british gas") || d.includes("octopus") || d.includes("thames")) return "utilities_personal";
    if (d.includes("rent") || d.includes("mortgage") || d.includes("nationwide") || d.includes("halifax")) return "rent";
    return "";
  }

  // Business keywords (default)
  if (d.includes("amazon") || d.includes("office") || d.includes("staples")) return "office";
  if (d.includes("train") || d.includes("uber") || d.includes("fuel") || d.includes("parking") || d.includes("taxi") || d.includes("tfl")) return "travel";
  if (d.includes("salary") || d.includes("payroll") || d.includes("wages")) return "staff";
  if (d.includes("accountant") || d.includes("solicitor") || d.includes("legal") || d.includes("lawyer")) return "professional";
  if (d.includes("google ads") || d.includes("facebook") || d.includes("marketing") || d.includes("advert") || d.includes("reddit")) return "marketing";
  if (d.includes("subscription") || d.includes("software") || d.includes("saas") || d.includes("github") || d.includes("slack") || d.includes("notion") || d.includes("adobe")) return "subscriptions";
  if (d.includes("insurance")) return "insurance";
  if (d.includes("electric") || d.includes("water") || d.includes("gas") || d.includes("phone") || d.includes("broadband") || d.includes("mobile") || d.includes("internet")) return "utilities";
  if (d.includes("laptop") || d.includes("computer") || d.includes("hardware") || d.includes("monitor")) return "equipment";
  if (d.includes("bank charge") || d.includes("fee") || d.includes("interest charge") || d.includes("overdraft")) return "bank";
  if (d.includes("course") || d.includes("training") || d.includes("conference") || d.includes("workshop")) return "training";
  if (d.includes("paypal")) return "transfer";
  return "";
}
