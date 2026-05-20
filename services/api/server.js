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
    if (pathname === '/v1/bootstrap' && req.method === 'GET') return send(res, 200, sendBootstrapPayload(store.loadState()));
    if (pathname === '/v1/digest/today' && req.method === 'GET') return send(res, 200, derive.buildDigest(store.loadState()));
    if ((pathname === '/v1/inbox' || pathname === '/v1/inbox-items') && req.method === 'GET') return send(res, 200, derive.buildInbox(store.loadState()));
    if ((pathname === '/v1/calendar' || pathname === '/v1/events' || pathname === '/v1/canonical-events' || pathname === '/v1/catalysts') && req.method === 'GET') return send(res, 200, derive.buildCalendar(store.loadState()));
    if ((pathname === '/v1/audit-log' || pathname === '/v1/audit') && req.method === 'GET') return send(res, 200, derive.buildAuditTrail(store.loadState()));
    if ((pathname === '/v1/notes') && req.method === 'GET') return send(res, 200, store.loadState().notes);
    if ((pathname === '/v1/research-reports') && req.method === 'GET') return send(res, 200, store.loadState().researchReports);
    if ((pathname === '/v1/research-jobs' || pathname === '/v1/research-runs') && req.method === 'GET') return send(res, 200, derive.buildResearchWorkspace(store.loadState()));

    if (pathname === '/v1/reset' && req.method === 'POST') return send(res, 200, sendBootstrapPayload(store.resetState()));

    if (pathname === '/v1/holdings') {
      if (req.method === 'GET') return send(res, 200, store.loadState().holdings);
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createHolding(draft, body);
          return draft;
        });
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
        return send(res, 201, sendBootstrapPayload(state));
      }
    }

    if (pathname === '/v1/canonical-events' || pathname === '/v1/events' || pathname === '/v1/catalysts') {
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createCanonicalEvent(draft, body);
          return draft;
        });
        return send(res, 201, sendBootstrapPayload(state));
      }
    }

    if (pathname === '/v1/reminders' || pathname === '/v1/alerts') {
      if (req.method === 'GET') return send(res, 200, store.loadState().reminders);
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createReminder(draft, body);
          return draft;
        });
        return send(res, 201, sendBootstrapPayload(state));
      }
    }

    if (pathname === '/v1/notes' && req.method === 'POST') {
      const body = await parseBody(req);
      const state = store.update((draft) => {
        createNote(draft, body);
        return draft;
      });
      return send(res, 201, sendBootstrapPayload(state));
    }

    if (pathname === '/v1/research-jobs' || pathname === '/v1/research-runs') {
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const state = store.update((draft) => {
          createResearchJob(draft, body);
          return draft;
        });
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
      return send(res, 200, sendBootstrapPayload(state));
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
      return send(res, 200, sendBootstrapPayload(state));
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
      return send(res, 200, sendBootstrapPayload(state));
    }

    return notFound(res, pathname);
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Open Advisor API listening on http://localhost:${port}`);
});
