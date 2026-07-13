# Business case and red-team record

## Selected engine

A paid Apify Store Actor that sells verified, evidence-rich local-business leads to agencies and automation buyers. The unit of value is not a raw business record; it is a business with a repeated, objective failure on a public revenue call-to-action.

## Why this path survived red teaming

- **No unsolicited acquisition:** marketplace and agent discovery replace cold outreach.
- **No independent billing stack:** Apify meters events, charges users, hosts output, and calculates creator profit.
- **No fixed platform expense required:** Apify has a free plan and provides monthly usage credit.
- **Margin control:** a paid dataset item is emitted only after useful evidence exists. Compute is direct HTTP, not browser automation.
- **Fast proof:** revenue, paid users, profit, run success, and acquisition funnel are visible in Actor Analytics immediately after usage.
- **Low owner involvement:** the only irreducible steps are account ownership, KYC, payout setup, and publishing.
- **Agent-compatible distribution:** pay-per-event Actors with limited permissions can become discoverable to agentic buyers automatically.

## Rejected path

An earlier self-hosted monitor would have sent evidence emails to discovered businesses. It was rejected after checking the mail provider's current policy: Resend explicitly prohibits unsolicited messages, cold outreach, and scraped contacts. Shipping it would have created account-termination and deliverability risk.

## Economics

Recommended price: $0.20 per verified dataset item.

Apify documents creator profit as:

`profit = (0.8 × event revenue) − platform costs`

The Actor performs one bounded discovery query per market, then a homepage request and at most five critical-link requests per candidate. Only verified failures create paid dataset items. Start with platform usage passed through to users, then remove the pass-through only after analytics show sufficient margin.

Apify's negative-profit isolation sets an individual PPE Actor's monthly profit to zero when its price does not cover platform usage, rather than reducing payouts from other Actors.

## Proof gates

Within 30 days, success is one or more of:

1. first paid-user run;
2. first positive Actor profit;
3. repeat paid user;
4. at least 10 paid result events from non-owner accounts.

Leading indicators: store impressions, Actor starts, successful runs, dataset items, cost per 1,000 results, and free-to-paid conversion.

## Automatic decision rules

- If zero verified items in 300 inspected sites, add categories/metros or reduce the CTA vocabulary only after reviewing false negatives.
- If verified-result rate exceeds 20%, manually inspect a sample before scaling; this may indicate a systemic block misclassified as failure.
- If run success falls below 95%, reduce concurrency or remove an unstable discovery market.
- If compute exceeds 20% of event revenue, increase result price or enable usage pass-through.
- If paid starts occur but result count is zero, improve preview data and market/category presets rather than charging for empty output.
- If store impressions are low, improve title/keywords/screenshots before changing the product.

## Abuse and false-positive controls

- No authentication, CAPTCHA bypass, form submission, login, or intrusive probing.
- No guessed email addresses.
- 401/403/429 and timeouts are excluded.
- All confirmation checks must match exactly.
- Maximum 10 markets, 1,000 sites, 20 concurrent checks, and 10 critical links per site.
- Public source attribution is embedded in every record.
- Direct URL users can inspect only public HTTP(S) pages.
