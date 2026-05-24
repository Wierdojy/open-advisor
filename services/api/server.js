const http = require('node:http');
const { URL } = require('node:url');
const { store, derive, analytics, chatAnalysis } = require('../../packages/domain');
const { ingestSignal } = require('./signal-service');

const port = process.env.OPEN_ADVISOR_API_PORT || process.env.PORT || 3001;
const sseClients = new Set();

function send(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function badRequest(res, message, details) {
  return send(res, 400, { error: message, details: details || null });
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
        error.statusCode = 400;
        reject(error);
      }
    });
  });
}

function notFound(res, pathname) {
  return send(res, 404, { error: 'Not found', path: pathname });
}

function sendSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function realtimePayload(state, meta = {}) {
  const bootstrap = sendBootstrapPayload(state);
  return {
    type: meta.type || 'bootstrap',
    meta,
    inbox: bootstrap.inbox,
    digest: bootstrap.digest,
    calendar: bootstrap.calendar,
    auditTrail: bootstrap.auditTrail,
    deliveryQueue: (state.deliveryQueue || []).slice(0, 20)
  };
}

function broadcast(state, meta = {}) {
  if (!sseClients.size) return;
  const payload = realtimePayload(state, meta);
  for (const client of sseClients) {
    sendSse(client, meta.event || 'update', payload);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function addDays(iso, days) {
  const date = new Date(iso || Date.now());
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function removeById(collection, id) {
  const index = collection.findIndex((item) => item.id === id);
  if (index === -1) return false;
  collection.splice(index, 1);
  return true;
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

function findTheme(state, id) {
  return state.themes.find((theme) => theme.id === id);
}

function logAudit(state, action, entityType, entityId, summary) {
  state.auditLog.unshift({
    id: store.makeId('audit'),
    action,
    entityType,
    entityId,
    summary,
    createdAt: nowIso()
  });
}

function createHolding(state, body) {
  const asset = ensureAsset(state, body);
  const holding = {
    id: store.makeId('holding'),
    assetId: asset.id,
    quantity: Number(body.quantity || 0),
    costBasis: body.costBasis != null && body.costBasis !== '' ? Number(body.costBasis) : null,
    sourceType: body.sourceType || 'manual'
  };
  state.holdings.push(holding);
  logAudit(state, 'holding_created', 'holding', holding.id, `Added holding for ${asset.symbol || asset.name}.`);
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
  logAudit(state, 'watchlist_created', 'watchlist', watchlist.id, `Created watchlist ${watchlist.name}.`);
  return watchlist;
}

function createTheme(state, body) {
  const theme = {
    id: store.makeId('theme'),
    title: body.title || 'Untitled Theme',
    status: body.status || 'active',
    summary: body.summary || '',
    hypothesis: body.hypothesis || body.rationale || '',
    monitoringPlan: body.monitoringPlan || body.notes || '',
    assetIds: []
  };

  for (const item of body.assets || []) {
    const asset = ensureAsset(state, item);
    if (!theme.assetIds.includes(asset.id)) theme.assetIds.push(asset.id);
  }

  state.themes.push(theme);
  logAudit(state, 'theme_created', 'theme', theme.id, `Created theme ${theme.title}.`);
  return theme;
}

function ensureResearchPolicy(state) {
  state.user = state.user || { id: store.makeId('user'), name: 'Open Advisor', timezone: 'UTC', digestCadence: 'daily', researchPolicy: {} };
  state.user.researchPolicy = state.user.researchPolicy || {};
  state.user.researchPolicy.inboxBeliefs = state.user.researchPolicy.inboxBeliefs || [];
  return state.user.researchPolicy;
}

function createInboxBelief(state, body) {
  const theme = createTheme(state, {
    title: body.title,
    summary: body.summary,
    hypothesis: body.hypothesis,
    monitoringPlan: body.monitoringPlan,
    assets: body.assets || []
  });

  const researchPolicy = ensureResearchPolicy(state);
  const profile = {
    id: store.makeId('belief_profile'),
    themeId: theme.id,
    stance: body.stance || 'balanced',
    conviction: body.conviction || 'medium',
    timeHorizon: body.timeHorizon || '3-12 months',
    actionBias: body.actionBias || 'monitor',
    preferredEvidence: Array.isArray(body.preferredEvidence) ? body.preferredEvidence : [],
    disconfirmSignals: body.disconfirmSignals || ''
  };
  researchPolicy.inboxBeliefs.unshift(profile);
  logAudit(state, 'belief_profile_created', 'belief_profile', profile.id, `Created inbox belief profile for ${theme.title}.`);
  return { theme, profile };
}

function createInboxItem(state, body) {
  const inboxItem = {
    id: store.makeId('inbox'),
    eventId: body.eventId,
    state: body.state || 'new',
    priority: body.priority || 'normal',
    reason: body.reason || '',
    nextStep: body.nextStep || '',
    createdAt: body.createdAt || nowIso(),
    deliveryKind: body.deliveryKind || 'in_app'
  };
  state.inboxItems.unshift(inboxItem);
  return inboxItem;
}

function createReminder(state, body) {
  const reminder = {
    id: store.makeId('reminder'),
    title: body.title || 'Untitled Reminder',
    state: body.state || 'open',
    dueAt: body.dueAt || body.scheduledFor || nowIso(),
    relatedType: body.relatedType || 'event',
    relatedId: body.relatedId || body.eventId || null,
    note: body.note || body.message || ''
  };
  state.reminders.push(reminder);
  logAudit(state, 'reminder_created', 'reminder', reminder.id, `Created reminder ${reminder.title}.`);
  return reminder;
}

function upsertSourceAdapter(state, body) {
  state.sourceAdapters = state.sourceAdapters || [];
  const adapterId = body.id || body.sourceAdapterId || null;
  let adapter = state.sourceAdapters.find((item) => item.id === adapterId || (body.name && item.name === body.name));

  if (!adapter) {
    adapter = {
      id: adapterId || store.makeId('adapter'),
      name: body.name || 'Unnamed adapter',
      tier: body.tier || 'tier_3',
      status: body.status || 'healthy',
      lastSyncedAt: body.lastSyncedAt || nowIso(),
      coverage: body.coverage || 'custom'
    };
    state.sourceAdapters.unshift(adapter);
    logAudit(state, 'source_adapter_created', 'source_adapter', adapter.id, `Created source adapter ${adapter.name}.`);
    return { adapter, created: true };
  }

  adapter.name = body.name || adapter.name;
  adapter.tier = body.tier || adapter.tier || 'tier_3';
  adapter.status = body.status || adapter.status || 'healthy';
  adapter.lastSyncedAt = body.lastSyncedAt || nowIso();
  adapter.coverage = body.coverage || adapter.coverage || 'custom';
  if (body.notes != null) adapter.notes = body.notes;
  logAudit(state, 'source_adapter_updated', 'source_adapter', adapter.id, `Updated source adapter ${adapter.name}.`);
  return { adapter, created: false };
}

function markDelivery(state, deliveryId, body) {
  const delivery = (state.deliveryQueue || []).find((item) => item.id === deliveryId);
  if (!delivery) return null;
  delivery.status = body.status || 'delivered';
  delivery.deliveredAt = body.deliveredAt || nowIso();
  if (body.channel) delivery.channel = body.channel;
  if (body.reason) delivery.reason = body.reason;
  logAudit(state, 'delivery_updated', 'delivery', delivery.id, `Marked delivery ${delivery.status}.`);
  return delivery;
}

function validateSignalPayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('Payload must be a JSON object.');
  if (!body?.title) errors.push('title is required.');
  if (!body?.eventType && !body?.type) errors.push('eventType is required.');
  if (!body?.assetId && !body?.symbol && !body?.name) errors.push('One of assetId, symbol, or name is required.');
  return errors;
}

function validateSourceAdapterPayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('Payload must be a JSON object.');
  if (!body?.id && !body?.name) errors.push('id or name is required.');
  return errors;
}

function validateChatAnalysisPayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('Payload must be a JSON object.');
  if (!body?.message && !body?.question) errors.push('message or question is required.');
  return errors;
}

function validateInboxBeliefPayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('Payload must be a JSON object.');
  if (!body?.title) errors.push('title is required.');
  return errors;
}

function currentState() {
  return store.loadState();
}

function createCanonicalEvent(state, body) {
  const asset = body.assetId || body.symbol || body.name ? ensureAsset(state, body) : null;
  const themeId = body.themeId || body.thesisId || null;
  const event = {
    id: store.makeId('event'),
    eventType: body.eventType || body.type || 'custom',
    title: body.title || 'Untitled Event',
    factualSummary: body.factualSummary || body.whyItMatters || '',
    recordedAt: body.recordedAt || nowIso(),
    scheduledFor: body.scheduledFor || body.recordedAt || nowIso(),
    assetId: asset ? asset.id : body.assetId || null,
    themeId: themeId,
    sourceAdapterId: body.sourceAdapterId || null,
    sourceLabel: body.sourceLabel || 'Manual entry',
    sourceTier: body.sourceTier || 'tier_2',
    importance: body.importance || 'normal',
    truthStatus: body.truthStatus || 'confirmed'
  };

  state.canonicalEvents.push(event);
  createInboxItem(state, {
    eventId: event.id,
    priority: body.priority || (event.importance === 'critical' ? 'critical' : event.importance === 'high' ? 'high' : 'normal'),
    reason: body.reason || body.whyItMatters || event.factualSummary,
    nextStep: body.nextStep || 'Decide whether this needs research or a follow-up reminder.'
  });

  if (body.createReminder) {
    createReminder(state, {
      title: body.reminderTitle || `Review: ${event.title}`,
      dueAt: body.reminderDueAt || event.scheduledFor,
      relatedType: 'event',
      relatedId: event.id,
      note: body.reminderNote || body.alertMessage || body.whyItMatters || event.factualSummary
    });
  }

  logAudit(state, 'event_created', 'event', event.id, `Recorded canonical event ${event.title}.`);
  return event;
}

function createNote(state, body) {
  const note = {
    id: store.makeId('note'),
    targetType: body.targetType || 'theme',
    targetId: body.targetId || null,
    body: body.body || '',
    createdAt: nowIso()
  };
  state.notes.unshift(note);
  logAudit(state, 'note_created', 'note', note.id, `Added note on ${note.targetType}.`);
  return note;
}

function buildResearchSummary(state, body, event, theme) {
  if (body.summary) return body.summary;
  if (event && theme) {
    return `${event.title} matters to ${theme.title} because it may confirm or challenge the tracked thesis through a fresh externally sourced signal.`;
  }
  if (event) {
    return `${event.title} has been queued for enrichment. Deterministic facts are stored now; narrative synthesis can be attached later.`;
  }
  if (theme) {
    return `${theme.title} has a new research pass queued. This stub records the question, freshness window, and source discipline without calling an LLM yet.`;
  }
  return 'Research job recorded without live AI enrichment. Connect a provider later to replace this placeholder synthesis.';
}

function createResearchJob(state, body) {
  const relatedEventId = body.relatedEventId || body.eventId || null;
  const event = relatedEventId ? state.canonicalEvents.find((item) => item.id === relatedEventId) : null;
  const theme = body.targetType === 'theme' && body.targetId ? findTheme(state, body.targetId) : event?.themeId ? findTheme(state, event.themeId) : null;
  const createdAt = nowIso();

  const job = {
    id: store.makeId('research_job'),
    status: body.status || 'completed',
    mode: body.mode || (body.triggerType === 'user_request' ? 'full_research_mode' : 'fast_enrichment_only'),
    triggerType: body.triggerType || 'user_request',
    targetType: body.targetType || (theme ? 'theme' : event?.assetId ? 'asset' : 'custom'),
    targetId: body.targetId || theme?.id || event?.assetId || null,
    relatedEventId,
    question: body.question || 'Untitled research question',
    createdAt,
    completedAt: createdAt
  };
  state.researchJobs.unshift(job);

  const report = {
    id: store.makeId('research_report'),
    jobId: job.id,
    relatedEventId,
    title: body.reportTitle || body.question || 'Research report',
    summary: buildResearchSummary(state, body, event, theme),
    nextCheck: body.nextCheck || (event ? `Revisit after ${event.title}.` : 'Review once a fresh source or event arrives.'),
    confidence: body.confidence != null ? Number(body.confidence) : 0.42,
    freshnessAt: createdAt,
    expiresAt: body.expiresAt || addDays(createdAt, body.triggerType === 'urgent_alert' ? 1 : 3),
    inferenceProvider: body.inferenceProvider || 'unconnected_stub',
    createdAt
  };
  state.researchReports.unshift(report);

  const source = {
    id: store.makeId('research_source'),
    reportId: report.id,
    title: body.sourceTitle || event?.sourceLabel || 'No citation captured yet',
    url: body.sourceUrl || null,
    publisher: body.publisher || event?.sourceLabel || 'Unspecified',
    tier: body.sourceTier || event?.sourceTier || 'tier_3',
    publishedAt: body.sourcePublishedAt || event?.recordedAt || createdAt
  };
  state.researchSources.unshift(source);

  const claim = {
    id: store.makeId('research_claim'),
    reportId: report.id,
    claim: body.claim || report.summary,
    confidence: report.confidence,
    supportedBySourceIds: [source.id]
  };
  state.researchClaims.unshift(claim);

  if (relatedEventId) {
    state.eventEnrichments.unshift({
      id: store.makeId('enrichment'),
      eventId: relatedEventId,
      reportId: report.id,
      summary: report.summary,
      confidence: report.confidence,
      freshnessAt: report.freshnessAt,
      expiresAt: report.expiresAt
    });
  }

  logAudit(state, 'research_job_created', 'research_job', job.id, `Queued research job: ${job.question}`);
  return job;
}

function cleanupForDeletedResource(state, type, id) {
  if (type === 'theme') {
    state.canonicalEvents = state.canonicalEvents.map((event) => (event.themeId === id ? { ...event, themeId: null } : event));
    state.researchJobs = state.researchJobs.filter((job) => !(job.targetType === 'theme' && job.targetId === id));
  }

  if (type === 'event') {
    state.inboxItems = state.inboxItems.filter((item) => item.eventId !== id);
    state.reminders = state.reminders.filter((item) => !(item.relatedType === 'event' && item.relatedId === id));
    const reportIds = state.eventEnrichments.filter((item) => item.eventId === id).map((item) => item.reportId);
    state.eventEnrichments = state.eventEnrichments.filter((item) => item.eventId !== id);
    state.researchReports = state.researchReports.filter((report) => !reportIds.includes(report.id));
    state.researchSources = state.researchSources.filter((source) => !reportIds.includes(source.reportId));
    state.researchClaims = state.researchClaims.filter((claim) => !reportIds.includes(claim.reportId));
    state.researchJobs = state.researchJobs.filter((job) => job.relatedEventId !== id);
  }

  if (type === 'research_job') {
    const reportIds = state.researchReports.filter((report) => report.jobId === id).map((report) => report.id);
    state.researchReports = state.researchReports.filter((report) => report.jobId !== id);
    state.researchSources = state.researchSources.filter((source) => !reportIds.includes(source.reportId));
    state.researchClaims = state.researchClaims.filter((claim) => !reportIds.includes(claim.reportId));
    state.eventEnrichments = state.eventEnrichments.filter((item) => !reportIds.includes(item.reportId));
  }

  if (type === 'research_report') {
    state.researchSources = state.researchSources.filter((source) => source.reportId !== id);
    state.researchClaims = state.researchClaims.filter((claim) => claim.reportId !== id);
    state.eventEnrichments = state.eventEnrichments.filter((item) => item.reportId !== id);
  }

  state.notes = state.notes.filter((note) => !(note.targetType === type && note.targetId === id));
}

function bootstrapResponse(state) {
  return sendBootstrapPayload(state);
}

function sendBootstrapPayload(state) {
  return derive.buildBootstrap(state);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    if (pathname === '/health') return send(res, 200, { ok: true, service: 'open-advisor-api' });
    if (pathname === '/health/deep') return send(res, 200, { ...store.getHealth(), service: 'open-advisor-api', sseClients: sseClients.size });
    if (pathname === '/v1/bootstrap' && req.method === 'GET') return send(res, 200, sendBootstrapPayload(currentState()));
    if ((pathname === '/v1/stream' || pathname === '/v1/events/stream') && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write('retry: 2000\n\n');
      sseClients.add(res);
      sendSse(res, 'connected', { ok: true, connectedAt: nowIso() });
      sendSse(res, 'bootstrap', realtimePayload(currentState(), { type: 'bootstrap' }));
      const keepAlive = setInterval(() => {
        res.write(': keepalive\n\n');
      }, 15000);
      req.on('close', () => {
        clearInterval(keepAlive);
        sseClients.delete(res);
      });
      return;
    }
    if (pathname === '/v1/digest/today' && req.method === 'GET') return send(res, 200, derive.buildDigest(currentState()));
    if ((pathname === '/v1/inbox' || pathname === '/v1/inbox-items') && req.method === 'GET') return send(res, 200, derive.buildInbox(currentState()));
    if (pathname === '/v1/inbox-feed' && req.method === 'GET') return send(res, 200, analytics.buildInboxFeed(sendBootstrapPayload(currentState()), Object.fromEntries(url.searchParams.entries())));
    if ((pathname === '/v1/calendar' || pathname === '/v1/events' || pathname === '/v1/canonical-events' || pathname === '/v1/catalysts') && req.method === 'GET') return send(res, 200, derive.buildCalendar(currentState()));
    if ((pathname === '/v1/audit-log' || pathname === '/v1/audit') && req.method === 'GET') return send(res, 200, derive.buildAuditTrail(currentState()));
    if ((pathname === '/v1/source-health') && req.method === 'GET') return send(res, 200, derive.buildSourceHealth(currentState()));
    if ((pathname === '/v1/daily-report' || pathname === '/v1/daily-report/today') && req.method === 'GET') return send(res, 200, derive.buildDailyReport(currentState()));
    if ((pathname === '/v1/delivery-queue') && req.method === 'GET') return send(res, 200, currentState().deliveryQueue || []);
    if ((pathname === '/v1/notes') && req.method === 'GET') return send(res, 200, currentState().notes);
    if ((pathname === '/v1/research-reports') && req.method === 'GET') return send(res, 200, currentState().researchReports);
    if ((pathname === '/v1/research-jobs' || pathname === '/v1/research-runs') && req.method === 'GET') return send(res, 200, derive.buildResearchWorkspace(currentState()));
    if ((pathname === '/v1/inbox-beliefs') && req.method === 'GET') return send(res, 200, derive.buildBeliefProfiles(currentState()));
    if (pathname === '/v1/portfolio/analytics' && req.method === 'GET') return send(res, 200, analytics.buildPortfolioAnalytics(currentState(), url.searchParams.get('benchmark') || 'nasdaq-100'));
    if (pathname === '/v1/chat/analysis' && req.method === 'POST') {
      const body = await parseBody(req);
      const errors = validateChatAnalysisPayload(body);
      if (errors.length) return badRequest(res, 'Invalid chat analysis payload', errors);
      return send(res, 200, chatAnalysis.buildChatAnalysis(currentState(), body));
    }

    if (pathname === '/v1/reset' && req.method === 'POST') return send(res, 200, sendBootstrapPayload(store.resetState()));

    if (pathname === '/v1/source-adapters') {
      if (req.method === 'GET') return send(res, 200, store.loadState().sourceAdapters || []);
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const errors = validateSourceAdapterPayload(body);
        if (errors.length) return badRequest(res, 'Invalid source adapter payload', errors);
        let result;
        const state = store.update((draft) => {
          result = upsertSourceAdapter(draft, body);
          return draft;
        });
        broadcast(state, { event: 'source_health_update', type: result.created ? 'source_adapter_created' : 'source_adapter_updated', sourceAdapterId: result.adapter.id });
        return send(res, result.created ? 201 : 200, { ok: true, adapter: result.adapter, bootstrap: sendBootstrapPayload(state) });
      }
    }

    const sourceAdapterMatch = pathname.match(/^\/v1\/source-adapters\/([^/]+)$/);
    if (sourceAdapterMatch && req.method === 'GET') {
      const sourceAdapter = (store.loadState().sourceAdapters || []).find((item) => item.id === sourceAdapterMatch[1]);
      if (!sourceAdapter) return send(res, 404, { error: 'Source adapter not found', id: sourceAdapterMatch[1] });
      return send(res, 200, sourceAdapter);
    }

    if (pathname === '/v1/holdings') {
      if (req.method === 'GET') return send(res, 200, store.loadState().holdings);
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createHolding(draft, body);
          return draft;
        });
        broadcast(state, { event: 'portfolio_update', type: 'holding_created' });
        return send(res, 201, sendBootstrapPayload(state));
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
        broadcast(state, { event: 'portfolio_update', type: 'watchlist_created' });
        return send(res, 201, sendBootstrapPayload(state));
      }
    }

    if (pathname === '/v1/themes' || pathname === '/v1/theses') {
      if (req.method === 'GET') return send(res, 200, store.loadState().themes);
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createTheme(draft, body);
          return draft;
        });
        broadcast(state, { event: 'thesis_update', type: 'theme_created' });
        return send(res, 201, sendBootstrapPayload(state));
      }
    }

    if (pathname === '/v1/inbox-beliefs' && req.method === 'POST') {
      const body = await parseBody(req);
      const errors = validateInboxBeliefPayload(body);
      if (errors.length) return badRequest(res, 'Invalid inbox belief payload', errors);
      let created;
      const state = store.update((draft) => {
        created = createInboxBelief(draft, body);
        return draft;
      });
      broadcast(state, { event: 'thesis_update', type: 'belief_profile_created', beliefProfileId: created.profile.id, themeId: created.theme.id });
      return send(res, 201, {
        ok: true,
        theme: created.theme,
        beliefProfile: created.profile,
        bootstrap: sendBootstrapPayload(state)
      });
    }

    if (pathname === '/v1/signals/ingest' || pathname === '/v1/market-signals/ingest') {
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const errors = validateSignalPayload(body);
        if (errors.length) return badRequest(res, 'Invalid signal payload', errors);
        let ingestionResult;
        const state = store.update((draft) => {
          ingestionResult = ingestSignal(draft, body, {
            nowIso,
            makeId: store.makeId,
            ensureAsset
          });
          logAudit(
            draft,
            ingestionResult.mode === 'merged' ? 'signal_merged' : 'signal_ingested',
            'event',
            ingestionResult.event.id,
            `${ingestionResult.mode === 'merged' ? 'Updated' : 'Created'} realtime signal ${ingestionResult.event.title}.`
          );
          if (ingestionResult.reminderCreated && ingestionResult.reminder) {
            logAudit(draft, 'reminder_created', 'reminder', ingestionResult.reminder.id, `Created reminder ${ingestionResult.reminder.title}.`);
          }
          return draft;
        });
        broadcast(state, {
          event: 'inbox_update',
          type: ingestionResult.mode === 'merged' ? 'signal_updated' : 'signal_ingested',
          eventId: ingestionResult.event.id,
          inboxItemId: ingestionResult.inboxItem.id,
          priority: ingestionResult.priority,
          suggestionType: ingestionResult.suggestionType
        });
        return send(res, ingestionResult.mode === 'merged' ? 200 : 201, {
          ok: true,
          ...ingestionResult,
          bootstrap: sendBootstrapPayload(state)
        });
      }
    }

    if (pathname === '/v1/signals/ingest/batch' || pathname === '/v1/market-signals/ingest/batch') {
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const items = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : [];
        if (!items.length) return badRequest(res, 'Batch payload must include at least one signal item.');
        const invalid = items.map((item, index) => ({ index, errors: validateSignalPayload(item) })).filter((item) => item.errors.length);
        if (invalid.length) return badRequest(res, 'Invalid batch signal payload', invalid);
        const results = [];
        const state = store.update((draft) => {
          for (const item of items) {
            const result = ingestSignal(draft, item, {
              nowIso,
              makeId: store.makeId,
              ensureAsset
            });
            results.push(result);
            logAudit(
              draft,
              result.mode === 'merged' ? 'signal_merged' : 'signal_ingested',
              'event',
              result.event.id,
              `${result.mode === 'merged' ? 'Updated' : 'Created'} realtime signal ${result.event.title}.`
            );
            if (result.reminderCreated && result.reminder) {
              logAudit(draft, 'reminder_created', 'reminder', result.reminder.id, `Created reminder ${result.reminder.title}.`);
            }
          }
          return draft;
        });
        broadcast(state, {
          event: 'inbox_batch_update',
          type: 'signal_batch_ingested',
          count: results.length,
          created: results.filter((item) => item.mode === 'created').length,
          merged: results.filter((item) => item.mode === 'merged').length
        });
        return send(res, 201, {
          ok: true,
          count: results.length,
          created: results.filter((item) => item.mode === 'created').length,
          merged: results.filter((item) => item.mode === 'merged').length,
          results,
          bootstrap: sendBootstrapPayload(state)
        });
      }
    }

    if (pathname === '/v1/canonical-events' || pathname === '/v1/events' || pathname === '/v1/catalysts') {
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createCanonicalEvent(draft, body);
          return draft;
        });
        broadcast(state, { event: 'inbox_update', type: 'event_created' });
        return send(res, 201, sendBootstrapPayload(state));
      }
    }

    const eventByIdMatch = pathname.match(/^\/v1\/(events|canonical-events|catalysts)\/([^/]+)$/);
    if (eventByIdMatch && req.method === 'GET') {
      const eventId = eventByIdMatch[2];
      const event = derive.buildCalendar(store.loadState()).find((item) => item.id === eventId);
      if (!event) return send(res, 404, { error: 'Event not found', id: eventId });
      return send(res, 200, event);
    }

    if (pathname === '/v1/reminders' || pathname === '/v1/alerts') {
      if (req.method === 'GET') return send(res, 200, store.loadState().reminders);
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createReminder(draft, body);
          return draft;
        });
        broadcast(state, { event: 'reminder_update', type: 'reminder_created' });
        return send(res, 201, sendBootstrapPayload(state));
      }
    }

    if (pathname === '/v1/notes' && req.method === 'POST') {
      const body = await parseBody(req);
      const state = store.update((draft) => {
        createNote(draft, body);
        return draft;
      });
      broadcast(state, { event: 'note_update', type: 'note_created' });
      return send(res, 201, sendBootstrapPayload(state));
    }

    if (pathname === '/v1/research-jobs' || pathname === '/v1/research-runs') {
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createResearchJob(draft, body);
          return draft;
        });
        broadcast(state, { event: 'research_update', type: 'research_job_created' });
        return send(res, 201, sendBootstrapPayload(state));
      }
    }

    const resourceDeleteMatch = pathname.match(/^\/v1\/(holdings|watchlists|themes|theses|canonical-events|events|catalysts|reminders|alerts|research-jobs|research-runs|research-reports|notes)\/([^/]+)$/);
    if (resourceDeleteMatch && req.method === 'DELETE') {
      const [, resource, resourceId] = resourceDeleteMatch;
      const keyMap = {
        holdings: 'holdings',
        watchlists: 'watchlists',
        themes: 'themes',
        theses: 'themes',
        'canonical-events': 'canonicalEvents',
        events: 'canonicalEvents',
        catalysts: 'canonicalEvents',
        reminders: 'reminders',
        alerts: 'reminders',
        'research-jobs': 'researchJobs',
        'research-runs': 'researchJobs',
        'research-reports': 'researchReports',
        notes: 'notes'
      };
      const singularMap = {
        holdings: 'holding',
        watchlists: 'watchlist',
        themes: 'theme',
        theses: 'theme',
        'canonical-events': 'event',
        events: 'event',
        catalysts: 'event',
        reminders: 'reminder',
        alerts: 'reminder',
        'research-jobs': 'research_job',
        'research-runs': 'research_job',
        'research-reports': 'research_report',
        notes: 'note'
      };

      const state = store.update((draft) => {
        removeById(draft[keyMap[resource]], resourceId);
        cleanupForDeletedResource(draft, singularMap[resource], resourceId);
        logAudit(draft, 'resource_deleted', singularMap[resource], resourceId, `Deleted ${singularMap[resource]} ${resourceId}.`);
        return draft;
      });
      broadcast(state, { event: 'resource_deleted', type: singularMap[resource], resourceId });
      return send(res, 200, sendBootstrapPayload(state));
    }

    const inboxStateMatch = pathname.match(/^\/v1\/inbox-items\/([^/]+)\/(seen|archive)$/);
    if (inboxStateMatch && req.method === 'POST') {
      const [, inboxId, action] = inboxStateMatch;
      const state = store.update((draft) => {
        const item = draft.inboxItems.find((entry) => entry.id === inboxId);
        if (item) item.state = action === 'seen' ? 'seen' : 'archived';
        logAudit(draft, 'inbox_state_changed', 'inbox_item', inboxId, `Inbox item marked ${action}.`);
        return draft;
      });
      broadcast(state, { event: 'inbox_update', type: `inbox_${action}`, inboxItemId: inboxId });
      return send(res, 200, sendBootstrapPayload(state));
    }

    const inboxItemMatch = pathname.match(/^\/v1\/inbox-items\/([^/]+)$/);
    if (inboxItemMatch && req.method === 'GET') {
      const inboxItem = derive.buildInbox(store.loadState()).find((item) => item.id === inboxItemMatch[1]);
      if (!inboxItem) return send(res, 404, { error: 'Inbox item not found', id: inboxItemMatch[1] });
      return send(res, 200, inboxItem);
    }

    const deliveryStateMatch = pathname.match(/^\/v1\/delivery-queue\/([^/]+)\/(delivered|failed|cancelled)$/);
    if (deliveryStateMatch && req.method === 'POST') {
      const [, deliveryId, status] = deliveryStateMatch;
      const body = await parseBody(req);
      let delivery;
      const state = store.update((draft) => {
        delivery = markDelivery(draft, deliveryId, { ...body, status });
        return draft;
      });
      if (!delivery) return send(res, 404, { error: 'Delivery not found', id: deliveryId });
      broadcast(state, { event: 'delivery_update', type: `delivery_${status}`, deliveryId, status });
      return send(res, 200, { ok: true, delivery, bootstrap: sendBootstrapPayload(state) });
    }

    const reminderDoneMatch = pathname.match(/^\/v1\/reminders\/([^/]+)\/done$/);
    if (reminderDoneMatch && req.method === 'POST') {
      const reminderId = reminderDoneMatch[1];
      const state = store.update((draft) => {
        const reminder = draft.reminders.find((item) => item.id === reminderId);
        if (reminder) reminder.state = 'done';
        logAudit(draft, 'reminder_completed', 'reminder', reminderId, `Reminder marked done.`);
        return draft;
      });
      broadcast(state, { event: 'reminder_update', type: 'reminder_done', reminderId });
      return send(res, 200, sendBootstrapPayload(state));
    }

    const reminderByIdMatch = pathname.match(/^\/v1\/(reminders|alerts)\/([^/]+)$/);
    if (reminderByIdMatch && req.method === 'GET') {
      const reminderId = reminderByIdMatch[2];
      const reminder = (store.loadState().reminders || []).find((item) => item.id === reminderId);
      if (!reminder) return send(res, 404, { error: 'Reminder not found', id: reminderId });
      return send(res, 200, reminder);
    }

    const reminderSnoozeMatch = pathname.match(/^\/v1\/reminders\/([^/]+)\/snooze$/);
    if (reminderSnoozeMatch && req.method === 'POST') {
      const reminderId = reminderSnoozeMatch[1];
      const body = await parseBody(req);
      const state = store.update((draft) => {
        const reminder = draft.reminders.find((item) => item.id === reminderId);
        if (reminder) {
          reminder.state = 'snoozed';
          reminder.dueAt = body.dueAt || addDays(nowIso(), 1);
        }
        logAudit(draft, 'reminder_snoozed', 'reminder', reminderId, `Reminder snoozed.`);
        return draft;
      });
      broadcast(state, { event: 'reminder_update', type: 'reminder_snoozed', reminderId });
      return send(res, 200, sendBootstrapPayload(state));
    }

    const legacyAlertSeenMatch = pathname.match(/^\/v1\/alerts\/([^/]+)\/seen$/);
    if (legacyAlertSeenMatch && req.method === 'POST') {
      const reminderId = legacyAlertSeenMatch[1];
      const state = store.update((draft) => {
        const reminder = draft.reminders.find((item) => item.id === reminderId);
        if (reminder) reminder.state = 'done';
        logAudit(draft, 'legacy_alert_seen', 'reminder', reminderId, `Legacy alert endpoint marked reminder done.`);
        return draft;
      });
      broadcast(state, { event: 'reminder_update', type: 'legacy_alert_seen', reminderId });
      return send(res, 200, sendBootstrapPayload(state));
    }

    const legacyAlertSnoozeMatch = pathname.match(/^\/v1\/alerts\/([^/]+)\/snooze$/);
    if (legacyAlertSnoozeMatch && req.method === 'POST') {
      const reminderId = legacyAlertSnoozeMatch[1];
      const body = await parseBody(req);
      const state = store.update((draft) => {
        const reminder = draft.reminders.find((item) => item.id === reminderId);
        if (reminder) {
          reminder.state = 'snoozed';
          reminder.dueAt = body.snoozedUntil || addDays(nowIso(), 1);
        }
        logAudit(draft, 'legacy_alert_snoozed', 'reminder', reminderId, `Legacy alert endpoint snoozed reminder.`);
        return draft;
      });
      broadcast(state, { event: 'reminder_update', type: 'legacy_alert_snoozed', reminderId });
      return send(res, 200, sendBootstrapPayload(state));
    }

    return notFound(res, pathname);
  } catch (error) {
    return send(res, error.statusCode || 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Open Advisor API listening on http://localhost:${port}`);
});
