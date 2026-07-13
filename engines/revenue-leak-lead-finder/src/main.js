import { Actor, log } from 'apify';
import {
  candidatesFromOverpass,
  dedupeCandidates,
  directCandidates,
  fetchOverpass,
  inspectCandidate,
  mapLimit,
  normalizeInput,
  resolveMarkets
} from './lib.js';

await Actor.main(async () => {
  const input = normalizeInput((await Actor.getInput()) || {});
  const markets = resolveMarkets(input.locations, input.customBboxes);
  const summary = {
    startedAt: new Date().toISOString(),
    marketsRequested: markets.length,
    categories: input.categories,
    discoveredCandidates: 0,
    uniqueCandidates: 0,
    inspectedCandidates: 0,
    verifiedResults: 0,
    discoveryErrors: [],
    stoppedBecause: null,
    sourceAttribution: '© OpenStreetMap contributors, ODbL 1.0'
  };

  await Actor.setStatusMessage(`Discovering businesses in ${markets.length} market(s)`);
  const discovered = [];

  for (const market of markets) {
    if (discovered.length >= input.maxCandidates) break;
    try {
      const payload = await fetchOverpass(market, input.categories);
      const candidates = candidatesFromOverpass(payload, market, input.categories);
      discovered.push(...candidates);
      log.info(`Discovered ${candidates.length} website candidates in ${market.label}`);
    } catch (error) {
      const message = `${market.label}: ${String(error?.message || error)}`;
      summary.discoveryErrors.push(message);
      log.warning('Discovery market skipped', { market: market.label, error: message });
    }
  }

  const supplied = directCandidates(input.startUrls);
  summary.discoveredCandidates = discovered.length + supplied.length;

  // Explicit buyer-supplied URLs take priority over discovered candidates.
  const candidates = dedupeCandidates([...supplied, ...discovered]).slice(0, input.maxCandidates);
  summary.uniqueCandidates = candidates.length;
  if (!candidates.length) {
    summary.stoppedBecause = 'No candidate websites were discovered. Try another market/category or direct URLs.';
    summary.finishedAt = new Date().toISOString();
    await Actor.setValue('OUTPUT', summary);
    await Actor.setStatusMessage('Finished: no candidate websites found');
    return;
  }

  let stop = false;
  let inspected = 0;
  let verified = 0;
  const chunks = chunk(candidates, input.maxConcurrency);

  for (const batch of chunks) {
    if (stop) break;
    const results = await mapLimit(batch, input.maxConcurrency, async (candidate) => {
      if (stop) return null;
      try {
        const result = await inspectCandidate(candidate, input);
        inspected += 1;
        if (inspected % 10 === 0) {
          await Actor.setStatusMessage(`Inspected ${inspected}/${candidates.length}; verified ${verified}`);
        }
        return result;
      } catch (error) {
        inspected += 1;
        log.debug('Candidate inspection skipped', { website: candidate.website, error: String(error?.message || error) });
        return null;
      }
    });

    for (const result of results) {
      if (!result || stop) continue;
      await Actor.pushData(result);
      verified += 1;
      if (verified >= input.maxResults) {
        stop = true;
        summary.stoppedBecause = `Reached maxResults=${input.maxResults}`;
      }
    }
  }

  summary.inspectedCandidates = inspected;
  summary.verifiedResults = verified;
  summary.finishedAt = new Date().toISOString();
  if (!summary.stoppedBecause) summary.stoppedBecause = 'Candidate queue completed';
  await Actor.setValue('OUTPUT', summary);
  await Actor.setStatusMessage(`Finished: ${verified} verified lead(s) from ${inspected} inspected website(s)`);
});

function chunk(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}
