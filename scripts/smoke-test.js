const assert = require('node:assert/strict');
const { store, derive } = require('../packages/domain');

store.resetState();
const state = store.loadState();
const bootstrap = derive.buildBootstrap(state);

assert.ok(Array.isArray(state.holdings) && state.holdings.length > 0, 'holdings seed missing');
assert.ok(Array.isArray(state.theses) && state.theses.length > 0, 'theses seed missing');
assert.ok(Array.isArray(state.catalysts) && state.catalysts.length > 0, 'catalysts seed missing');
assert.ok(bootstrap.digest && Array.isArray(bootstrap.digest.mattersSoon), 'digest derivation missing');
assert.ok(Array.isArray(bootstrap.calendar) && bootstrap.calendar.length > 0, 'calendar derivation missing');

console.log('Open Advisor smoke test passed');
