const http = require('node:http');
const { URL } = require('node:url');
const { store, derive } = require('../../packages/domain');

const port = process.env.PORT || 3001;

function send(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function notFound(res, pathname) {
  return send(res, 404, { error: 'Not found', path: pathname });
}

function findAssetBySymbol(state, symbol) {
  if (!symbol) return null;
  return state.assets.find((asset) => asset.symbol && asset.symbol.toLowerCase() === String(symbol).toLowerCase());
}

function ensureAsset(state, input) {
  if (input.assetId) {
    const existing = state.assets.find((asset) => asset.id === input.assetId);
    if (existing) return existing;
  }

  const bySymbol = findAssetBySymbol(state, input.symbol);
  if (bySymbol) return bySymbol;

  const asset = {
    id: store.makeId('asset'),
    symbol: input.symbol || null,
    name: input.name || input.symbol || 'Unnamed Asset',
    assetType: input.assetType || 'equity'
  };
  state.assets.push(asset);
  return asset;
}

function createHolding(state, body) {
  const asset = ensureAsset(state, body);
  const holding = {
    id: store.makeId('holding'),
    assetId: asset.id,
    quantity: Number(body.quantity || 0),
    costBasis: body.costBasis != null ? Number(body.costBasis) : null,
    sourceType: body.sourceType || 'manual'
  };
  state.holdings.push(holding);
  return holding;
}

function createWatchlist(state, body) {
  const watchlist = {
    id: store.makeId('watchlist'),
    name: body.name || 'Untitled Watchlist',
    description: body.description || '',
    itemAssetIds: []
  };

  for (const item of body.items || []) {
    const asset = ensureAsset(state, item);
    if (!watchlist.itemAssetIds.includes(asset.id)) watchlist.itemAssetIds.push(asset.id);
  }

  state.watchlists.push(watchlist);
  return watchlist;
}

function createThesis(state, body) {
  const thesis = {
    id: store.makeId('thesis'),
    title: body.title || 'Untitled Thesis',
    status: body.status || 'active',
    summary: body.summary || '',
    rationale: body.rationale || '',
    notes: body.notes || '',
    assetIds: []
  };

  for (const item of body.assets || []) {
    const asset = ensureAsset(state, item);
    if (!thesis.assetIds.includes(asset.id)) thesis.assetIds.push(asset.id);
  }

  state.theses.push(thesis);
  return thesis;
}

function createCatalyst(state, body) {
  const asset = body.assetId || body.symbol || body.name ? ensureAsset(state, body) : null;
  const catalyst = {
    id: store.makeId('catalyst'),
    type: body.type || 'custom',
    title: body.title || 'Untitled Catalyst',
    scheduledFor: body.scheduledFor || new Date().toISOString(),
    assetId: asset ? asset.id : body.assetId || null,
    thesisId: body.thesisId || null,
    whyItMatters: body.whyItMatters || '',
    confidence: body.confidence != null ? Number(body.confidence) : 0.5,
    sourceLabel: body.sourceLabel || 'User'
  };
  state.catalysts.push(catalyst);

  if (body.createAlert) {
    createAlert(state, {
      title: body.alertTitle || `Review: ${catalyst.title}`,
      scheduledFor: body.alertScheduledFor || catalyst.scheduledFor,
      catalystId: catalyst.id,
      assetId: catalyst.assetId,
      thesisId: catalyst.thesisId,
      message: body.alertMessage || catalyst.whyItMatters
    });
  }

  return catalyst;
}

function createAlert(state, body) {
  const alert = {
    id: store.makeId('alert'),
    title: body.title || 'Untitled Alert',
    state: body.state || 'pending',
    scheduledFor: body.scheduledFor || new Date().toISOString(),
    catalystId: body.catalystId || null,
    assetId: body.assetId || null,
    thesisId: body.thesisId || null,
    message: body.message || ''
  };
  state.alerts.push(alert);
  return alert;
}

function createResearchRun(state, body) {
  const researchRun = {
    id: store.makeId('research'),
    scope: body.scope || 'custom',
    targetId: body.targetId || null,
    question: body.question || 'Untitled research question',
    status: 'completed',
    summary: body.summary || 'Research sweep created. Add a real provider next to replace this placeholder output.',
    body: body.body || `This sweep focused on: ${body.question || 'custom research question'}.`,
    createdAt: new Date().toISOString()
  };
  state.researchRuns.unshift(researchRun);
  return researchRun;
}

function createNote(state, body) {
  const note = {
    id: store.makeId('note'),
    targetType: body.targetType || 'thesis',
    targetId: body.targetId || null,
    body: body.body || '',
    createdAt: new Date().toISOString()
  };
  state.notes.unshift(note);
  return note;
}

function removeById(collection, id) {
  const index = collection.findIndex((item) => item.id === id);
  if (index === -1) return false;
  collection.splice(index, 1);
  return true;
}

function cleanupForDeletedResource(state, type, id) {
  if (type === 'thesis') {
    state.catalysts = state.catalysts.filter((item) => item.thesisId !== id);
    state.alerts = state.alerts.filter((item) => item.thesisId !== id);
    state.researchRuns = state.researchRuns.filter((item) => item.targetId !== id);
  }
  if (type === 'catalyst') {
    state.alerts = state.alerts.filter((item) => item.catalystId !== id);
  }
  state.notes = state.notes.filter((note) => !(note.targetType === type && note.targetId === id));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    if (pathname === '/health') return send(res, 200, { ok: true, service: 'open-advisor-api' });
    if (pathname === '/v1/bootstrap' && req.method === 'GET') return send(res, 200, derive.buildBootstrap(store.loadState()));
    if (pathname === '/v1/digest/today' && req.method === 'GET') return send(res, 200, derive.buildDigest(store.loadState()));
    if (pathname === '/v1/calendar' && req.method === 'GET') return send(res, 200, derive.buildCalendar(store.loadState()));
    if (pathname === '/v1/notes' && req.method === 'GET') return send(res, 200, store.loadState().notes);

    if (pathname === '/v1/reset' && req.method === 'POST') return send(res, 200, derive.buildBootstrap(store.resetState()));

    if (pathname === '/v1/holdings') {
      if (req.method === 'GET') return send(res, 200, store.loadState().holdings);
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createHolding(draft, body);
          return draft;
        });
        return send(res, 201, derive.buildBootstrap(state));
      }
    }

    if (pathname === '/v1/watchlists') {
      if (req.method === 'GET') return send(res, 200, store.loadState().watchlists);
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createWatchlist(draft, body);
          return draft;
        });
        return send(res, 201, derive.buildBootstrap(state));
      }
    }

    if (pathname === '/v1/theses') {
      if (req.method === 'GET') return send(res, 200, store.loadState().theses);
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createThesis(draft, body);
          return draft;
        });
        return send(res, 201, derive.buildBootstrap(state));
      }
    }

    if (pathname === '/v1/catalysts') {
      if (req.method === 'GET') return send(res, 200, derive.buildCalendar(store.loadState()));
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createCatalyst(draft, body);
          return draft;
        });
        return send(res, 201, derive.buildBootstrap(state));
      }
    }

    if (pathname === '/v1/alerts') {
      if (req.method === 'GET') return send(res, 200, store.loadState().alerts);
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createAlert(draft, body);
          return draft;
        });
        return send(res, 201, derive.buildBootstrap(state));
      }
    }

    if (pathname === '/v1/research-runs') {
      if (req.method === 'GET') return send(res, 200, store.loadState().researchRuns);
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createResearchRun(draft, body);
          return draft;
        });
        return send(res, 201, derive.buildBootstrap(state));
      }
    }

    if (pathname === '/v1/notes' && req.method === 'POST') {
      const body = await parseBody(req);
      const state = store.update((draft) => {
        createNote(draft, body);
        return draft;
      });
      return send(res, 201, derive.buildBootstrap(state));
    }

    const resourceDeleteMatch = pathname.match(/^\/v1\/(holdings|watchlists|theses|catalysts|alerts|research-runs|notes)\/([^/]+)$/);
    if (resourceDeleteMatch && req.method === 'DELETE') {
      const [, resource, resourceId] = resourceDeleteMatch;
      const keyMap = {
        holdings: 'holdings',
        watchlists: 'watchlists',
        theses: 'theses',
        catalysts: 'catalysts',
        alerts: 'alerts',
        'research-runs': 'researchRuns',
        notes: 'notes'
      };
      const state = store.update((draft) => {
        const key = keyMap[resource];
        removeById(draft[key], resourceId);
        const singularMap = {
          holdings: 'holding',
          watchlists: 'watchlist',
          theses: 'thesis',
          catalysts: 'catalyst',
          alerts: 'alert',
          'research-runs': 'research_run',
          notes: 'note'
        };
        cleanupForDeletedResource(draft, singularMap[resource], resourceId);
        return draft;
      });
      return send(res, 200, derive.buildBootstrap(state));
    }

    const alertSeenMatch = pathname.match(/^\/v1\/alerts\/([^/]+)\/seen$/);
    if (alertSeenMatch && req.method === 'POST') {
      const alertId = alertSeenMatch[1];
      const state = store.update((draft) => {
        const alert = draft.alerts.find((item) => item.id === alertId);
        if (alert) alert.state = 'seen';
        return draft;
      });
      return send(res, 200, derive.buildBootstrap(state));
    }

    const alertSnoozeMatch = pathname.match(/^\/v1\/alerts\/([^/]+)\/snooze$/);
    if (alertSnoozeMatch && req.method === 'POST') {
      const alertId = alertSnoozeMatch[1];
      const body = await parseBody(req);
      const state = store.update((draft) => {
        const alert = draft.alerts.find((item) => item.id === alertId);
        if (alert) {
          alert.state = 'snoozed';
          alert.snoozedUntil = body.snoozedUntil || new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        }
        return draft;
      });
      return send(res, 200, derive.buildBootstrap(state));
    }

    return notFound(res, pathname);
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Open Advisor API listening on http://localhost:${port}`);
});
