# Revenue Leak Lead Finder

Find local businesses with a **verified broken booking, appointment, reservation, consultation, quote, order, or contact path**. The Actor discovers public business websites, checks explicit revenue calls-to-action, repeats the same failed check, and emits one high-confidence lead per business.

## Why this output is different

A generic local-business list says who exists. This Actor adds an objective reason to contact them now:

- the exact failed revenue URL;
- visible call-to-action text;
- matching HTTP evidence from 2–3 checks;
- public email and phone when explicitly published;
- source and timestamp;
- no guessed emails and no 401/403/429/timeouts mislabeled as defects.

Use cases include website agencies, local SEO firms, conversion-rate optimization teams, managed service providers, reputation agencies, and internal multi-location QA.

## Input

Choose metro areas and business categories, set a maximum candidate count, and run. You can also provide custom bounding boxes or direct websites.

Default categories prioritize appointment-driven businesses: dentists, veterinarians, beauty businesses, and physiotherapists.

## Output example

```json
{
  "businessName": "Example Dental",
  "category": "dentist",
  "market": "Austin, Texas",
  "website": "https://example-dental.com/",
  "publicEmail": "office@example-dental.com",
  "publicPhone": "+1 555 123 4567",
  "issueType": "broken_revenue_link",
  "failedUrl": "https://example-dental.com/book",
  "callToAction": "Book appointment",
  "statusCode": 404,
  "evidence": "“Book appointment” returned HTTP 404; matched on 2 checks",
  "confidence": "high",
  "confirmationCount": 2,
  "checkedAt": "2026-07-12T12:00:00.000Z",
  "sourceUrl": "https://www.openstreetmap.org/node/123",
  "sourceLicense": "© OpenStreetMap contributors, ODbL 1.0"
}
```

## Quality rules

The Actor emits no item when:

- a page returns 401, 403, 429, or another ambiguous access-control response;
- a request merely times out;
- repeated checks disagree;
- no explicit revenue call-to-action exists;
- the result exceeds the configured limits.

It makes low-volume public GET requests and does not log in, bypass controls, submit forms, or modify target sites.

## Pricing recommendation for the owner

Publish with **pay per event** and use the synthetic `apify-default-dataset-item` event at **$0.20 per verified result**. Keep the synthetic `apify-actor-start` event at its low default price. During initial calibration, pass platform usage costs to the user; turn that off after actual cost-per-result data confirms margin.

At $0.20 per result, 100 paid results produce $20 gross event revenue. Under Apify's documented 80% creator share, that is $16 before platform costs. The implementation uses direct HTTP requests at 128–512 MB rather than a browser, keeping compute cost low.

## Responsible use

Public contact data is provided exactly as published and is never guessed. Users are responsible for their outreach, privacy, advertising, anti-spam, consumer-protection, and data-license obligations. OpenStreetMap-derived records require attribution under ODbL.

## Local development

```bash
npm install
npm test
npm start
```

Local input can be placed in `storage/key_value_stores/default/INPUT.json`.
