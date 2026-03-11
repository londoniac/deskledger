// PayPal API integration — ported from Electron to server-side

// Fetch historical exchange rates from frankfurter.app (ECB data, HMRC-accepted)
// Returns a map: "YYYY-MM-DD|USD" → rate (e.g. 0.79 means 1 USD = 0.79 GBP)
async function fetchExchangeRates(dateCurrencyPairs) {
  const rateMap = {};
  if (dateCurrencyPairs.length === 0) return rateMap;

  // Group by currency to minimize API calls
  const byCurrency = {};
  dateCurrencyPairs.forEach(({ date, currency }) => {
    if (!byCurrency[currency]) byCurrency[currency] = new Set();
    byCurrency[currency].add(date);
  });

  for (const [currency, dates] of Object.entries(byCurrency)) {
    // Fetch each date individually (frankfurter doesn't support bulk historical)
    for (const date of dates) {
      try {
        const res = await fetch(`https://api.frankfurter.app/${date}?from=${currency}&to=GBP`);
        if (res.ok) {
          const data = await res.json();
          const rate = data.rates?.GBP;
          if (rate) {
            rateMap[`${date}|${currency}`] = rate;
          }
        }
      } catch (e) {
        console.log(`[PayPal] Failed to fetch ${currency}/GBP rate for ${date}:`, e.message);
      }
    }
  }

  return rateMap;
}

const KNOWN_CODES = {
  T0303: "transfer_in",
  T0300: "transfer_in",
  T1503: "author_payout",
  T0700: "fee",
  T1106: "refund",
  T1201: "refund",
};

// Codes to skip (internal bookkeeping and duplicates of real transactions)
const SKIP_CODES = new Set(["T0001", "T0003", "T0200", "T0400", "T0600", "T1107"]);

async function getAccessToken(clientId, clientSecret, sandbox = false) {
  const host = sandbox ? "api-m.sandbox.paypal.com" : "api-m.paypal.com";
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`https://${host}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function fetchTransactions(accessToken, startDate, endDate, sandbox = false) {
  const host = sandbox ? "api-m.sandbox.paypal.com" : "api-m.paypal.com";
  const transactions = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      fields: "all",
      page_size: "100",
      page: String(page),
    });

    const res = await fetch(`https://${host}/v1/reporting/transactions?${params}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PayPal API error (${res.status}): ${text}`);
    }

    const data = await res.json();
    const details = data.transaction_details || [];
    transactions.push(...details);
    totalPages = data.total_pages || 1;
    page++;
  }

  return transactions;
}

function mapTransaction(ppTxn) {
  const info = ppTxn.transaction_info || {};
  const payer = ppTxn.payer_info || {};
  const amount = parseFloat(info.transaction_amount?.value || "0");
  const currency = info.transaction_amount?.currency_code || "USD";
  const feeAmount = parseFloat(info.fee_amount?.value || "0");
  const feeCurrency = info.fee_amount?.currency_code || currency;
  const date = info.transaction_initiation_date || "";
  const eventCode = info.transaction_event_code || "";

  // Format date as YYYY-MM-DD for postgres
  let formattedDate = "";
  if (date) {
    const d = new Date(date);
    formattedDate = d.toISOString().split("T")[0];
  }

  const feeGbp = feeCurrency === "GBP" ? Math.abs(feeAmount) : 0;
  const description = info.transaction_subject || payer.payer_name?.alternate_full_name || eventCode || "PayPal transaction";
  const exchangeRate = info.exchange_rate ? parseFloat(info.exchange_rate) : null;

  // Calculate GBP amount
  let gbpAmount = null;
  if (currency === "GBP") {
    gbpAmount = Math.abs(amount);
  } else if (exchangeRate) {
    gbpAmount = Math.round((Math.abs(amount) / exchangeRate) * 100) / 100;
  }

  // Determine type from event code
  const type = KNOWN_CODES[eventCode] || "other";

  return {
    paypal_id: info.transaction_id,
    date: formattedDate,
    description,
    amount: Math.abs(amount),
    currency,
    gbp_amount: gbpAmount,
    type,
    author_name: payer.payer_name?.alternate_full_name || "",
    event_code: eventCode,
    fee_amount: feeGbp,
    notes: [
      currency !== "GBP" ? `Original: ${currency} ${info.transaction_amount?.value}` : "",
      feeAmount ? `Fee: ${feeCurrency} ${feeAmount}` : "",
      exchangeRate ? `Rate: ${exchangeRate}` : "",
    ].filter(Boolean).join(" | "),
    _skip: SKIP_CODES.has(eventCode),
    _currency: currency,
  };
}

// Remove USD/GBP duplicate pairs (PayPal creates two entries per cross-currency payment)
function deduplicateCurrencyPairs(transactions) {
  const byDate = {};
  transactions.forEach((t) => {
    if (t.type !== "author_payout") return;
    if (!byDate[t.date]) byDate[t.date] = [];
    byDate[t.date].push(t);
  });

  const toRemove = new Set();
  Object.values(byDate).forEach((group) => {
    const hasGbp = group.some((t) => t._currency === "GBP");
    const hasNonGbp = group.some((t) => t._currency !== "GBP");
    if (hasGbp && hasNonGbp) {
      group.forEach((t) => {
        if (t._currency !== "GBP") toRemove.add(t.paypal_id);
      });
    }
  });

  return {
    filtered: transactions.filter((t) => !toRemove.has(t.paypal_id)),
    currencyDupes: toRemove.size,
  };
}

// Remove notification duplicates — PayPal fires both T1503 (mass payment) and a
// companion notification event (e.g. "You have a payout from Vox9!") for the same money.
// Match by same date + same gbp_amount where one is author_payout and one is "other".
function deduplicateNotificationPairs(transactions) {
  // Build a set of (date, gbp_amount) keys from author_payout entries
  const payoutKeys = new Set();
  transactions.forEach((t) => {
    if (t.type === "author_payout") {
      payoutKeys.add(`${t.date}|${t.gbp_amount}`);
    }
  });

  let notifDupes = 0;
  const filtered = transactions.filter((t) => {
    if (t.type === "other" && payoutKeys.has(`${t.date}|${t.gbp_amount}`)) {
      notifDupes++;
      return false;
    }
    return true;
  });

  return { filtered, notifDupes };
}

export async function syncTransactions(clientId, clientSecret, startDate, endDate, sandbox = false) {
  const token = await getAccessToken(clientId, clientSecret, sandbox);

  // PayPal limits to 31 days per request — chunk automatically
  const start = new Date(startDate);
  const end = new Date(endDate);
  const MS_PER_DAY = 86400000;
  const MAX_DAYS = 31;
  const allRaw = [];

  let chunkStart = start;
  while (chunkStart < end) {
    let chunkEnd = new Date(chunkStart.getTime() + MAX_DAYS * MS_PER_DAY);
    if (chunkEnd > end) chunkEnd = end;
    const raw = await fetchTransactions(token, chunkStart.toISOString(), chunkEnd.toISOString(), sandbox);
    allRaw.push(...raw);
    chunkStart = chunkEnd;
  }

  // Map and filter
  const mapped = allRaw.map(mapTransaction);
  const kept = mapped.filter((t) => !t._skip);
  const skipped = mapped.length - kept.length;

  // Deduplicate currency pairs
  const { filtered: afterCurrency, currencyDupes } = deduplicateCurrencyPairs(kept);

  // Deduplicate notification pairs (e.g. "You have a payout from Vox9!" companion events)
  const { filtered, notifDupes } = deduplicateNotificationPairs(afterCurrency);

  // Fetch exchange rates for non-GBP transactions missing gbp_amount
  const needRates = filtered
    .filter((t) => t.gbp_amount == null && t._currency !== "GBP")
    .map((t) => ({ date: t.date, currency: t._currency }));

  let ratesApplied = 0;
  if (needRates.length > 0) {
    const rateMap = await fetchExchangeRates(needRates);
    filtered.forEach((t) => {
      if (t.gbp_amount == null && t._currency !== "GBP") {
        const rate = rateMap[`${t.date}|${t._currency}`];
        if (rate) {
          t.gbp_amount = Math.round(t.amount * rate * 100) / 100;
          t.notes = [t.notes, `ECB rate: ${rate}`].filter(Boolean).join(" | ");
          ratesApplied++;
        }
      }
    });
  }

  // Clean up internal fields
  const clean = filtered.map(({ _skip, _currency, ...t }) => t);

  return { transactions: clean, totalRaw: allRaw.length, skipped, currencyDupes, notifDupes, ratesApplied };
}

export async function testConnection(clientId, clientSecret, sandbox = false) {
  await getAccessToken(clientId, clientSecret, sandbox);
  return true;
}
