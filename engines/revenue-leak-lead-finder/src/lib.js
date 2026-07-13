import * as cheerio from 'cheerio';

export const LOCATION_PRESETS = Object.freeze({
  'austin-tx': { label: 'Austin, Texas', bbox: '30.098,-97.938,30.516,-97.561' },
  'tampa-fl': { label: 'Tampa, Florida', bbox: '27.821,-82.620,28.171,-82.252' },
  'charlotte-nc': { label: 'Charlotte, North Carolina', bbox: '35.047,-81.058,35.409,-80.620' },
  'denver-co': { label: 'Denver, Colorado', bbox: '39.570,-105.109,39.914,-104.600' },
  'phoenix-az': { label: 'Phoenix, Arizona', bbox: '33.290,-112.324,33.708,-111.792' },
  'nashville-tn': { label: 'Nashville, Tennessee', bbox: '35.967,-87.054,36.405,-86.515' },
  'miami-fl': { label: 'Miami, Florida', bbox: '25.709,-80.319,25.855,-80.118' },
  'orlando-fl': { label: 'Orlando, Florida', bbox: '28.347,-81.507,28.686,-81.227' },
  'dallas-tx': { label: 'Dallas, Texas', bbox: '32.617,-97.038,33.023,-96.463' },
  'atlanta-ga': { label: 'Atlanta, Georgia', bbox: '33.570,-84.576,33.930,-84.214' },
  'las-vegas-nv': { label: 'Las Vegas, Nevada', bbox: '36.000,-115.325,36.325,-114.980' },
  'san-diego-ca': { label: 'San Diego, California', bbox: '32.534,-117.282,33.115,-116.905' }
});

export const CATEGORY_TAGS = Object.freeze({
  dentist: [['amenity', 'dentist']],
  veterinary: [['amenity', 'veterinary']],
  beauty: [['shop', 'beauty'], ['leisure', 'spa']],
  hairdresser: [['shop', 'hairdresser']],
  physiotherapist: [['healthcare', 'physiotherapist']],
  chiropractor: [['healthcare', 'chiropractor']],
  lawyer: [['office', 'lawyer']],
  real_estate: [['office', 'estate_agent']],
  restaurant: [['amenity', 'restaurant']],
  hotel: [['tourism', 'hotel']],
  car_repair: [['shop', 'car_repair']],
  clinic: [['amenity', 'clinic'], ['healthcare', 'clinic']]
});

const CTA_PATTERN = /\b(book|booking|appointment|appointments|schedule|scheduling|reserve|reservation|contact|consultation|quote|request|order|table|tour|visit|inquiry|enquiry)\b/i;
const CONTACT_PATTERN = /\b(contact|about|team|staff)\b/i;
const BLOCKED_OR_AMBIGUOUS = new Set([401, 402, 403, 407, 408, 409, 423, 425, 426, 428, 429, 451]);

export function normalizeInput(input = {}) {
  return {
    locations: Array.isArray(input.locations) && input.locations.length ? input.locations : ['austin-tx', 'tampa-fl'],
    categories: Array.isArray(input.categories) && input.categories.length ? input.categories : ['dentist', 'veterinary', 'beauty', 'physiotherapist'],
    customBboxes: Array.isArray(input.customBboxes) ? input.customBboxes : [],
    startUrls: Array.isArray(input.startUrls) ? input.startUrls : [],
    maxCandidates: clamp(input.maxCandidates, 120, 1, 1000),
    maxResults: clamp(input.maxResults, 25, 1, 250),
    maxConcurrency: clamp(input.maxConcurrency, 6, 1, 20),
    confirmationChecks: clamp(input.confirmationChecks, 2, 2, 3),
    confirmationDelayMs: clamp(input.confirmationDelayMs, 1800, 500, 10000),
    onlyWithPublicContact: Boolean(input.onlyWithPublicContact),
    maxCriticalLinksPerSite: clamp(input.maxCriticalLinksPerSite, 5, 1, 10)
  };
}

function clamp(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function resolveMarkets(locations, customBboxes = []) {
  const markets = [];
  for (const key of locations) {
    if (LOCATION_PRESETS[key]) markets.push({ key, ...LOCATION_PRESETS[key] });
  }
  for (const custom of customBboxes) {
    if (custom?.label && validBbox(custom.bbox)) markets.push({ key: `custom-${markets.length}`, label: String(custom.label).slice(0, 80), bbox: custom.bbox });
  }
  return dedupeBy(markets, (item) => item.bbox);
}

export function validBbox(value) {
  const parts = String(value || '').split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return false;
  const [south, west, north, east] = parts;
  return south >= -90 && north <= 90 && west >= -180 && east <= 180 && south < north && west < east;
}

export function buildOverpassQuery(bbox, categories) {
  if (!validBbox(bbox)) throw new Error(`Invalid bounding box: ${bbox}`);
  const clauses = [];
  for (const category of categories) {
    for (const [key, value] of CATEGORY_TAGS[category] || []) {
      for (const websiteKey of ['website', 'contact:website']) {
        clauses.push(`nwr["${escapeOverpass(key)}"="${escapeOverpass(value)}"]["${websiteKey}"](${bbox});`);
      }
    }
  }
  if (!clauses.length) throw new Error('No supported categories selected');
  return `[out:json][timeout:25];(${clauses.join('')});out tags center 500;`;
}

function escapeOverpass(value) {
  return String(value).replace(/["\\]/g, '');
}

export function candidatesFromOverpass(payload, market, categories) {
  const output = [];
  for (const element of payload?.elements || []) {
    const tags = element.tags || {};
    const website = normalizeHttpUrl(tags.website || tags['contact:website']);
    if (!website) continue;
    output.push({
      businessName: String(tags.name || tags.operator || hostnameLabel(website)).slice(0, 180),
      category: detectCategory(tags, categories),
      market: market.label,
      website,
      publicEmail: normalizeEmail(tags.email || tags['contact:email']),
      publicPhone: normalizePhone(tags.phone || tags['contact:phone']),
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      sourceLicense: '© OpenStreetMap contributors, ODbL 1.0',
      sourceRef: `${element.type}/${element.id}`
    });
  }
  return dedupeBy(output, (item) => canonicalWebsite(item.website));
}

function detectCategory(tags, selected) {
  for (const category of selected) {
    for (const [key, value] of CATEGORY_TAGS[category] || []) {
      if (tags[key] === value) return category;
    }
  }
  return 'other';
}

export function directCandidates(startUrls = []) {
  const output = [];
  for (const source of startUrls) {
    const raw = typeof source === 'string' ? source : source?.url;
    const website = normalizeHttpUrl(raw);
    if (!website) continue;
    output.push({
      businessName: hostnameLabel(website),
      category: 'direct_input',
      market: 'Direct input',
      website,
      publicEmail: null,
      publicPhone: null,
      sourceUrl: null,
      sourceLicense: 'User-supplied URL'
    });
  }
  return dedupeBy(output, (item) => canonicalWebsite(item.website));
}

export function extractSiteData(html, baseUrl) {
  const $ = cheerio.load(html || '');
  const criticalLinks = [];
  const contactLinks = [];
  let publicEmail = null;
  let publicPhone = null;

  $('a[href]').each((_index, element) => {
    const href = String($(element).attr('href') || '').trim();
    const text = normalizeText($(element).text() || $(element).attr('aria-label') || $(element).attr('title') || '');
    if (/^mailto:/i.test(href) && !publicEmail) publicEmail = normalizeEmail(href.replace(/^mailto:/i, '').split('?')[0]);
    if (/^tel:/i.test(href) && !publicPhone) publicPhone = normalizePhone(href.replace(/^tel:/i, ''));
    const url = resolvePublicUrl(href, baseUrl);
    if (!url) return;
    const signal = `${text} ${url}`;
    if (CTA_PATTERN.test(signal)) criticalLinks.push({ url, text: text || 'Revenue call-to-action', source: 'link' });
    if (CONTACT_PATTERN.test(signal) && sameSite(baseUrl, url)) contactLinks.push({ url, text });
  });

  $('form[action]').each((_index, element) => {
    const action = resolvePublicUrl($(element).attr('action'), baseUrl);
    const text = normalizeText($(element).text());
    if (action && CTA_PATTERN.test(`${text} ${action}`)) criticalLinks.push({ url: action, text: text.slice(0, 100) || 'Revenue form', source: 'form' });
  });

  return {
    title: normalizeText($('title').first().text()).slice(0, 180),
    criticalLinks: dedupeBy(criticalLinks, (item) => canonicalUrl(item.url)),
    contactLinks: dedupeBy(contactLinks, (item) => canonicalUrl(item.url)),
    publicEmail,
    publicPhone
  };
}

export async function inspectCandidate(candidate, options, fetcher = fetch, sleepFn = sleep) {
  const home = await fetchPage(candidate.website, fetcher);
  const homepageIssue = classifyFailure(candidate.website, 'Website homepage', home);
  if (homepageIssue) {
    const verified = await confirmIssue({ url: candidate.website, text: 'Website homepage' }, homepageIssue, options, fetcher, sleepFn);
    if (verified) return buildResult(candidate, verified, options.confirmationChecks);
    return null;
  }
  if (!home.ok || !home.isHtml) return null;

  const site = extractSiteData(home.body, home.finalUrl || candidate.website);
  candidate.businessName = improveBusinessName(candidate.businessName, site.title, candidate.website);
  candidate.publicEmail ||= site.publicEmail;
  candidate.publicPhone ||= site.publicPhone;

  if (!candidate.publicEmail && options.onlyWithPublicContact) {
    const contact = site.contactLinks.slice(0, 1)[0];
    if (contact) {
      const page = await fetchPage(contact.url, fetcher);
      if (page.ok && page.isHtml) {
        const contactData = extractSiteData(page.body, page.finalUrl || contact.url);
        candidate.publicEmail ||= contactData.publicEmail;
        candidate.publicPhone ||= contactData.publicPhone;
      }
    }
  }

  if (options.onlyWithPublicContact && !candidate.publicEmail && !candidate.publicPhone) return null;

  for (const link of site.criticalLinks.slice(0, options.maxCriticalLinksPerSite)) {
    const first = await checkUrl(link.url, fetcher);
    const issue = classifyFailure(link.url, link.text, first);
    if (!issue) continue;
    const verified = await confirmIssue(link, issue, options, fetcher, sleepFn);
    if (verified) {
      await enrichPublicContact(candidate, site.contactLinks, fetcher);
      return buildResult(candidate, verified, options.confirmationChecks);
    }
  }
  return null;
}

async function enrichPublicContact(candidate, contactLinks, fetcher) {
  if (candidate.publicEmail && candidate.publicPhone) return;
  const contact = contactLinks.slice(0, 1)[0];
  if (!contact) return;
  const page = await fetchPage(contact.url, fetcher);
  if (!page.ok || !page.isHtml) return;
  const contactData = extractSiteData(page.body, page.finalUrl || contact.url);
  candidate.publicEmail ||= contactData.publicEmail;
  candidate.publicPhone ||= contactData.publicPhone;
}

async function confirmIssue(link, firstIssue, options, fetcher, sleepFn) {
  const checks = [firstIssue];
  for (let index = 1; index < options.confirmationChecks; index += 1) {
    await sleepFn(options.confirmationDelayMs);
    const next = classifyFailure(link.url, link.text, await checkUrl(link.url, fetcher));
    if (!next || fingerprint(next) !== fingerprint(firstIssue)) return null;
    checks.push(next);
  }
  return { ...firstIssue, checks };
}

function fingerprint(issue) {
  return `${issue.issueType}|${issue.statusCode ?? 'none'}|${canonicalUrl(issue.failedUrl)}`;
}

export function classifyFailure(url, callToAction, result) {
  if (result.ok) return null;
  if (BLOCKED_OR_AMBIGUOUS.has(result.statusCode)) return null;
  if (result.statusCode === 404 || result.statusCode === 410) {
    return {
      issueType: 'broken_revenue_link',
      failedUrl: url,
      callToAction,
      statusCode: result.statusCode,
      evidence: `“${callToAction}” returned HTTP ${result.statusCode}`
    };
  }
  if (result.statusCode >= 500 && result.statusCode <= 599) {
    return {
      issueType: 'server_error',
      failedUrl: url,
      callToAction,
      statusCode: result.statusCode,
      evidence: `“${callToAction}” returned HTTP ${result.statusCode}`
    };
  }
  if (result.statusCode === 0 && /ENOTFOUND|EAI_AGAIN|certificate|SSL|TLS|ERR_TLS|ECONNREFUSED|DNS/i.test(result.error || '')) {
    return {
      issueType: 'unreachable_or_tls_failure',
      failedUrl: url,
      callToAction,
      statusCode: null,
      evidence: `“${callToAction}” was unreachable: ${sanitizeError(result.error)}`
    };
  }
  return null;
}

function buildResult(candidate, issue, confirmationCount) {
  return {
    businessName: candidate.businessName,
    category: candidate.category,
    market: candidate.market,
    website: candidate.website,
    publicEmail: candidate.publicEmail || null,
    publicPhone: candidate.publicPhone || null,
    issueType: issue.issueType,
    failedUrl: issue.failedUrl,
    callToAction: issue.callToAction,
    statusCode: issue.statusCode,
    evidence: `${issue.evidence}; matched on ${confirmationCount} checks`,
    confidence: 'high',
    confirmationCount,
    checkedAt: new Date().toISOString(),
    sourceUrl: candidate.sourceUrl || null,
    sourceLicense: candidate.sourceLicense
  };
}

export async function fetchPage(url, fetcher = fetch, timeoutMs = 15000) {
  const result = await request(url, fetcher, timeoutMs);
  if (!result.ok) return result;
  const contentType = result.headers?.get?.('content-type') || '';
  const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType);
  let body = '';
  if (isHtml) body = (await result.response.text()).slice(0, 800000);
  return { ...result, isHtml, body };
}

export async function checkUrl(url, fetcher = fetch, timeoutMs = 12000) {
  return request(url, fetcher, timeoutMs);
}

async function request(url, fetcher, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'RevenueLeakLeadFinder/1.0 (+https://apify.com; low-volume public availability checks)',
        accept: 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5'
      }
    });
    return {
      ok: response.ok,
      statusCode: response.status,
      finalUrl: response.url || url,
      headers: response.headers,
      response,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      finalUrl: url,
      headers: new Headers(),
      response: null,
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.code || error?.cause?.code || error?.message || error)
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOverpass(market, categories, fetcher = fetch, endpoint = 'https://overpass-api.de/api/interpreter') {
  const query = buildOverpassQuery(market.bbox, categories);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'user-agent': 'RevenueLeakLeadFinder/1.0 (+https://apify.com; bounded OpenStreetMap query)'
      },
      body: new URLSearchParams({ data: query }).toString()
    });
    if (!response.ok) throw new Error(`Overpass returned HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function mapLimit(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export function dedupeCandidates(candidates) {
  return dedupeBy(candidates, (item) => canonicalWebsite(item.website));
}

function improveBusinessName(current, title, website) {
  if (!title) return current;
  const cleaned = title.split(/[|–—•]/)[0].trim();
  if (cleaned.length >= 3 && cleaned.length <= 100 && !/^home$/i.test(cleaned)) return cleaned;
  return current || hostnameLabel(website);
}

function resolvePublicUrl(href, baseUrl) {
  if (!href || /^(mailto:|tel:|javascript:|data:|#)/i.test(String(href).trim())) return null;
  try {
    const url = new URL(href, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeHttpUrl(value) {
  if (!value) return null;
  try {
    let raw = String(value).trim();
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeEmail(value) {
  if (!value) return null;
  const email = decodeURIComponent(String(value).trim().toLowerCase());
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return null;
  if (/^(noreply|no-reply|donotreply)@/i.test(email)) return null;
  return email.slice(0, 254);
}

function normalizePhone(value) {
  if (!value) return null;
  const phone = String(value).replace(/\s+/g, ' ').trim();
  return phone.length >= 7 && phone.length <= 40 ? phone : null;
}

function canonicalWebsite(value) {
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return String(value).toLowerCase();
  }
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(value);
  }
}

function hostnameLabel(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '').split('.')[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return 'Direct website';
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sameSite(a, b) {
  try {
    const first = new URL(a).hostname.replace(/^www\./, '');
    const second = new URL(b).hostname.replace(/^www\./, '');
    return first === second || first.endsWith(`.${second}`) || second.endsWith(`.${first}`);
  } catch {
    return false;
  }
}

function sanitizeError(value) {
  return String(value || 'connection failure').replace(/[\r\n]+/g, ' ').slice(0, 180);
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
