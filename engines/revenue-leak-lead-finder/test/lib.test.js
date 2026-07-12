import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOverpassQuery,
  candidatesFromOverpass,
  classifyFailure,
  directCandidates,
  extractSiteData,
  inspectCandidate,
  normalizeInput,
  resolveMarkets,
  validBbox
} from '../src/lib.js';

test('normalizes bounded defaults', () => {
  const input = normalizeInput({ maxCandidates: 5000, maxConcurrency: 0, confirmationChecks: 1 });
  assert.equal(input.maxCandidates, 1000);
  assert.equal(input.maxConcurrency, 1);
  assert.equal(input.confirmationChecks, 2);
});

test('validates and resolves market bounding boxes', () => {
  assert.equal(validBbox('30,-98,31,-97'), true);
  assert.equal(validBbox('31,-98,30,-97'), false);
  const markets = resolveMarkets(['austin-tx'], [{ label: 'Test', bbox: '40,-74,41,-73' }]);
  assert.equal(markets.length, 2);
  assert.equal(markets[0].label, 'Austin, Texas');
});

test('builds a bounded Overpass query for selected categories', () => {
  const query = buildOverpassQuery('30,-98,31,-97', ['dentist', 'lawyer']);
  assert.match(query, /timeout:25/);
  assert.match(query, /amenity.*dentist/);
  assert.match(query, /office.*lawyer/);
  assert.match(query, /out tags center 500/);
});

test('converts and deduplicates OSM businesses without guessing contacts', () => {
  const payload = { elements: [
    { type: 'node', id: 1, tags: { name: 'Clinic A', amenity: 'dentist', website: 'clinic.example', email: 'INFO@CLINIC.EXAMPLE' } },
    { type: 'way', id: 2, tags: { name: 'Clinic A duplicate', amenity: 'dentist', website: 'https://clinic.example/' } }
  ] };
  const result = candidatesFromOverpass(payload, { label: 'Austin' }, ['dentist']);
  assert.equal(result.length, 1);
  assert.equal(result[0].publicEmail, 'info@clinic.example');
  assert.equal(result[0].sourceUrl, 'https://www.openstreetmap.org/node/1');
});

test('extracts explicit CTA, mailto, phone, and form action', () => {
  const data = extractSiteData(`
    <title>Example Dental | Austin</title>
    <a href="mailto:hello@example.com">Email</a>
    <a href="tel:+1 555 123 4567">Call</a>
    <a href="/book">Book appointment</a>
    <form action="/request"><button>Request a consultation</button></form>
  `, 'https://example.com');
  assert.equal(data.publicEmail, 'hello@example.com');
  assert.equal(data.publicPhone, '+1 555 123 4567');
  assert.deepEqual(data.criticalLinks.map((x) => x.url), ['https://example.com/book', 'https://example.com/request']);
});

test('does not call ambiguous bot blocks a defect', () => {
  assert.equal(classifyFailure('https://x.example/book', 'Book', { ok: false, statusCode: 403 }), null);
  assert.equal(classifyFailure('https://x.example/book', 'Book', { ok: false, statusCode: 429 }), null);
  assert.equal(classifyFailure('https://x.example/book', 'Book', { ok: false, statusCode: 0, error: 'timeout' }), null);
});

test('classifies objective failures only', () => {
  assert.equal(classifyFailure('https://x.example/book', 'Book', { ok: false, statusCode: 404 }).issueType, 'broken_revenue_link');
  assert.equal(classifyFailure('https://x.example/book', 'Book', { ok: false, statusCode: 503 }).issueType, 'server_error');
  assert.equal(classifyFailure('https://x.example/book', 'Book', { ok: false, statusCode: 0, error: 'ENOTFOUND' }).issueType, 'unreachable_or_tls_failure');
});

test('requires matching independent checks before emitting a paid result', async () => {
  let bookChecks = 0;
  const fakeFetch = async (url) => {
    if (url === 'https://clinic.example/') {
      return new Response('<title>Clinic A</title><a href="/book">Book appointment</a>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (url === 'https://clinic.example/book') {
      bookChecks += 1;
      return new Response('missing', { status: 404 });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const candidate = directCandidates([{ url: 'https://clinic.example/' }])[0];
  const result = await inspectCandidate(candidate, normalizeInput({ confirmationChecks: 2, confirmationDelayMs: 500 }), fakeFetch, async () => {});
  assert.equal(result.issueType, 'broken_revenue_link');
  assert.equal(result.confirmationCount, 2);
  assert.equal(bookChecks, 2);
});

test('suppresses a transient or changing result', async () => {
  let bookChecks = 0;
  const fakeFetch = async (url) => {
    if (url === 'https://clinic.example/') {
      return new Response('<a href="/book">Book appointment</a>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    bookChecks += 1;
    return new Response(bookChecks === 1 ? 'missing' : 'ok', { status: bookChecks === 1 ? 404 : 200 });
  };
  const candidate = directCandidates([{ url: 'https://clinic.example/' }])[0];
  const result = await inspectCandidate(candidate, normalizeInput({ confirmationChecks: 2, confirmationDelayMs: 500 }), fakeFetch, async () => {});
  assert.equal(result, null);
});

test('enriches a verified result only from an explicitly published contact page', async () => {
  const fakeFetch = async (url) => {
    if (url === 'https://clinic.example/') {
      return new Response('<title>Clinic A</title><a href="/book">Book appointment</a><a href="/contact">Contact</a>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (url === 'https://clinic.example/book') return new Response('missing', { status: 404 });
    if (url === 'https://clinic.example/contact') {
      return new Response('<a href="mailto:office@clinic.example">Email</a><a href="tel:+15551234567">Call</a>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const candidate = directCandidates([{ url: 'https://clinic.example/' }])[0];
  const result = await inspectCandidate(candidate, normalizeInput({ confirmationChecks: 2, confirmationDelayMs: 500 }), fakeFetch, async () => {});
  assert.equal(result.publicEmail, 'office@clinic.example');
  assert.equal(result.publicPhone, '+15551234567');
});
