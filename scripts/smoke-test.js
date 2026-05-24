const assert = require('node:assert/strict');
const { store, derive } = require('../packages/domain');

store.resetState();
const state = store.loadState();
const bootstrap = derive.buildBootstrap(state);

assert.ok(Array.isArray(state.holdings) && state.holdings.length > 0, 'holdings seed missing');
assert.ok(Array.isArray(state.themes) && state.themes.length > 0, 'themes seed missing');
assert.ok(Array.isArray(state.canonicalEvents) && state.canonicalEvents.length > 0, 'canonical events seed missing');
assert.ok(Array.isArray(state.inboxItems) && state.inboxItems.length > 0, 'inbox seed missing');
assert.ok(bootstrap.digest && Array.isArray(bootstrap.digest.topItems), 'digest derivation missing');
assert.ok(Array.isArray(bootstrap.calendar) && bootstrap.calendar.length > 0, 'calendar derivation missing');
assert.ok(Array.isArray(bootstrap.researchWorkspace) && bootstrap.researchWorkspace.length > 0, 'research derivation missing');
assert.ok(Array.isArray(bootstrap.beliefProfiles) && bootstrap.beliefProfiles.length > 0, 'belief profile derivation missing');
assert.ok(bootstrap.dailyReport && Array.isArray(bootstrap.dailyReport.trendingStocks), 'daily report derivation missing');

console.log('Open Advisor smoke test passed');
