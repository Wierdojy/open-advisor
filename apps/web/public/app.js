const localApiHosts = new Set(['localhost', '127.0.0.1', '::1']);
const apiBase = localApiHosts.has(window.location.hostname)
  ? `${window.location.protocol}//${window.location.hostname}:3001`
  : null;
const viewMeta = {
  overview: { code: '00', label: 'Overview' },
  portfolio: { code: '01', label: 'Portfolio' },
  themes: { code: '02', label: 'Themes' },
  events: { code: '03', label: 'Events' },
  research: { code: '04', label: 'Research' }
};
const views = Object.keys(viewMeta);

let state = null;
let currentView = 'overview';
let isDemoMode = false;
const demoStorageKey = 'openAdvisorPagesState';

function demoBootstrapUrl() {
  const buildVersion = window.OPEN_ADVISOR_BUILD;
  return buildVersion ? `./demo-bootstrap.json?v=${buildVersion}` : './demo-bootstrap.json';
}

function el(id) {
  return document.getElementById(id);
}

function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value) {
  if (!value) return 'No timestamp';
  return new Date(value).toLocaleString();
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function notesFor(targetType, targetId) {
  return (state.notes || []).filter((note) => note.targetType === targetType && note.targetId === targetId);
}

function notesMarkup(targetType, targetId, placeholder) {
  const notes = notesFor(targetType, targetId);
  return `
    <div class="detail-block">
      <div class="panel-label">Notes</div>
      ${
        notes.length
          ? `<div class="split-list">${notes
              .map(
                (note) => `
                  <article class="list-item">
                    <div class="list-row">
                      <strong class="list-title">Working note</strong>
                      <button class="button button-ghost small delete-note" data-id="${note.id}">Delete</button>
                    </div>
                    <div class="item-text">${note.body}</div>
                    <div class="meta">${formatDate(note.createdAt)}</div>
                  </article>
                `
              )
              .join('')}</div>`
          : `<div class="empty-state">No notes attached yet.</div>`
      }
      <form class="form-grid note-form" data-target-type="${targetType}" data-target-id="${targetId}">
        <textarea class="textarea" name="body" placeholder="${placeholder}"></textarea>
        <div class="form-actions">
          <button class="button small" type="submit">Save note</button>
        </div>
      </form>
    </div>
  `;
}

function renderNav() {
  el('nav').innerHTML = views
    .map((view) => {
      const meta = viewMeta[view];
      return `
        <button class="nav-item ${currentView === view ? 'active' : ''}" data-view="${view}">
          <span class="nav-code">${meta.code}</span>
          <span class="nav-label">${meta.label}</span>
        </button>
      `;
    })
    .join('');

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.onclick = () => setView(button.dataset.view);
  });
}

function setView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach((section) => section.classList.remove('active-view'));
  el(`view-${view}`).classList.add('active-view');
  renderNav();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function addDays(value, days) {
  const date = new Date(value || Date.now());
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function sortByDate(items, key) {
  return [...items].sort((a, b) => new Date(a[key] || 0) - new Date(b[key] || 0));
}

function sortByDateDesc(items, key) {
  return [...items].sort((a, b) => new Date(b[key] || 0) - new Date(a[key] || 0));
}

function getMap(items) {
  return new Map((items || []).map((item) => [item.id, item]));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function priorityRank(priority) {
  return { critical: 0, high: 1, normal: 2, low: 3 }[priority] ?? 4;
}

function decorateEvent(baseState, event) {
  const assetMap = getMap(baseState.assets || []);
  const themeMap = getMap(baseState.themes || []);
  const adapterMap = getMap(baseState.sourceAdapters || []);
  const reportMap = getMap(baseState.researchReports || []);
  const enrichment = (baseState.eventEnrichments || [])
    .filter((item) => item.eventId === event.id)
    .sort((a, b) => new Date(b.freshnessAt || 0) - new Date(a.freshnessAt || 0))[0];

  return {
    ...event,
    asset: event.assetId ? assetMap.get(event.assetId) || null : null,
    theme: event.themeId ? themeMap.get(event.themeId) || null : null,
    sourceAdapter: event.sourceAdapterId ? adapterMap.get(event.sourceAdapterId) || null : null,
    enrichment: enrichment
      ? {
          ...enrichment,
          report: enrichment.reportId ? reportMap.get(enrichment.reportId) || null : null
        }
      : null
  };
}

function buildPortfolioSummary(baseState) {
  const trackedAssetIds = unique([
    ...(baseState.holdings || []).map((holding) => holding.assetId),
    ...(baseState.watchlists || []).flatMap((watchlist) => watchlist.itemAssetIds || []),
    ...(baseState.themes || []).flatMap((theme) => theme.assetIds || [])
  ]);

  const estimatedBasis = (baseState.holdings || []).reduce((total, holding) => {
    const basis = holding.costBasis != null ? Number(holding.costBasis) : 0;
    const quantity = holding.quantity != null ? Number(holding.quantity) : 0;
    return total + basis * quantity;
  }, 0);

  return {
    holdingsCount: (baseState.holdings || []).length,
    watchlistsCount: (baseState.watchlists || []).length,
    activeThemesCount: (baseState.themes || []).filter((theme) => theme.status === 'active').length,
    trackedAssetsCount: trackedAssetIds.length,
    canonicalEventsCount: (baseState.canonicalEvents || []).length,
    openRemindersCount: (baseState.reminders || []).filter((reminder) => reminder.state === 'open').length,
    estimatedCostBasis: estimatedBasis
  };
}

function buildInbox(baseState) {
  const decoratedEvents = new Map((baseState.canonicalEvents || []).map((event) => [event.id, decorateEvent(baseState, event)]));

  return [...(baseState.inboxItems || [])]
    .map((item) => ({
      ...item,
      event: decoratedEvents.get(item.eventId) || null
    }))
    .sort((a, b) => {
      const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
}

function buildDigest(baseState) {
  const inbox = buildInbox(baseState).filter((item) => item.state !== 'archived');
  const topItems = inbox.slice(0, 5);
  const openReminders = sortByDate((baseState.reminders || []).filter((item) => item.state === 'open'), 'dueAt').slice(0, 5);
  const recentResearch = sortByDateDesc(baseState.researchJobs || [], 'createdAt')
    .slice(0, 3)
    .map((job) => ({
      ...job,
      report: (baseState.researchReports || []).find((report) => report.jobId === job.id) || null
    }));

  return {
    date: new Date().toISOString().slice(0, 10),
    title: 'What happened, why it matters, and what to check next.',
    summary: `${topItems.length} inbox items, ${openReminders.length} open reminders, and ${recentResearch.length} recent research passes across ${(baseState.themes || []).filter((theme) => theme.status === 'active').length} active themes.`,
    topItems: topItems.map((item) => ({
      id: item.id,
      priority: item.priority,
      title: item.event?.title || 'Untitled event',
      factualSummary: item.event?.factualSummary || '',
      whyItMatters: item.event?.enrichment?.summary || item.reason,
      sourceTier: item.event?.sourceTier || 'tier_4',
      confidence: item.event?.enrichment?.confidence ?? null,
      freshnessAt: item.event?.enrichment?.freshnessAt || item.event?.recordedAt || null,
      nextStep: item.nextStep,
      relatedAsset: item.event?.asset || null,
      relatedTheme: item.event?.theme || null
    })),
    openReminders,
    researchSuggestions: (baseState.themes || [])
      .filter((theme) => theme.status === 'active')
      .slice(0, 3)
      .map((theme) => ({
        themeId: theme.id,
        prompt: `Research ${theme.title} for new confirming or disconfirming signals.`
      })),
    recentResearch: recentResearch.map((job) => ({
      id: job.id,
      question: job.question,
      status: job.status,
      reportSummary: job.report ? job.report.summary : null
    }))
  };
}

function buildCalendar(baseState) {
  return sortByDate(baseState.canonicalEvents || [], 'scheduledFor').map((event) => decorateEvent(baseState, event));
}

function buildResearchWorkspace(baseState) {
  const sourcesByReportId = new Map();
  for (const source of baseState.researchSources || []) {
    const list = sourcesByReportId.get(source.reportId) || [];
    list.push(source);
    sourcesByReportId.set(source.reportId, list);
  }

  const claimsByReportId = new Map();
  for (const claim of baseState.researchClaims || []) {
    const list = claimsByReportId.get(claim.reportId) || [];
    list.push(claim);
    claimsByReportId.set(claim.reportId, list);
  }

  return sortByDateDesc(baseState.researchJobs || [], 'createdAt').map((job) => {
    const report = (baseState.researchReports || []).find((item) => item.jobId === job.id) || null;
    return {
      ...job,
      report: report
        ? {
            ...report,
            sources: sourcesByReportId.get(report.id) || [],
            claims: claimsByReportId.get(report.id) || []
          }
        : null
    };
  });
}

function buildSourceHealth(baseState) {
  return sortByDateDesc(baseState.sourceAdapters || [], 'lastSyncedAt');
}

function buildAuditTrail(baseState) {
  return sortByDateDesc(baseState.auditLog || [], 'createdAt').slice(0, 20);
}

function deriveClientState(baseState) {
  const next = clone(baseState);
  next.theses = next.themes;
  next.alerts = next.reminders;
  next.catalysts = next.canonicalEvents;
  next.researchRuns = next.researchReports;
  next.portfolioSummary = buildPortfolioSummary(next);
  next.inbox = buildInbox(next);
  next.digest = buildDigest(next);
  next.calendar = buildCalendar(next);
  next.researchWorkspace = buildResearchWorkspace(next);
  next.sourceHealth = buildSourceHealth(next);
  next.auditTrail = buildAuditTrail(next);
  return next;
}

function loadStoredDemoState() {
  const raw = localStorage.getItem(demoStorageKey);
  return raw ? JSON.parse(raw) : null;
}

function saveDemoState(nextState) {
  localStorage.setItem(demoStorageKey, JSON.stringify(nextState));
}

function logAudit(rawState, action, entityType, entityId, summary) {
  rawState.auditLog = rawState.auditLog || [];
  rawState.auditLog.unshift({
    id: makeId('audit'),
    action,
    entityType,
    entityId,
    summary,
    createdAt: nowIso()
  });
}

function removeById(collection, id) {
  const index = collection.findIndex((item) => item.id === id);
  if (index >= 0) collection.splice(index, 1);
}

function ensureDemoAsset(rawState, input) {
  if (input.assetId) {
    const existing = (rawState.assets || []).find((asset) => asset.id === input.assetId);
    if (existing) return existing;
  }
  if (input.symbol) {
    const existing = (rawState.assets || []).find((asset) => asset.symbol && asset.symbol.toLowerCase() === String(input.symbol).toLowerCase());
    if (existing) return existing;
  }
  const asset = {
    id: makeId('asset'),
    symbol: input.symbol || null,
    name: input.name || input.symbol || 'Unnamed Asset',
    assetType: input.assetType || 'equity'
  };
  rawState.assets.push(asset);
  return asset;
}

function createDemoResearch(rawState, body) {
  const createdAt = nowIso();
  const job = {
    id: makeId('research_job'),
    status: 'completed',
    mode: body.mode || (body.triggerType === 'urgent_alert' ? 'fast_enrichment_only' : 'full_research_mode'),
    triggerType: body.triggerType || 'user_request',
    targetType: body.targetType || 'custom',
    targetId: body.targetId || null,
    relatedEventId: body.relatedEventId || null,
    question: body.question || 'Untitled research question',
    createdAt,
    completedAt: createdAt
  };
  rawState.researchJobs.unshift(job);

  const report = {
    id: makeId('research_report'),
    jobId: job.id,
    relatedEventId: body.relatedEventId || null,
    title: body.reportTitle || body.question || 'Research report',
    summary: body.summary || `This is a placeholder enrichment for: ${body.question || 'custom research question'}.`,
    nextCheck: body.nextCheck || 'Review once a fresh source or event arrives.',
    confidence: body.confidence != null ? Number(body.confidence) : 0.42,
    freshnessAt: createdAt,
    expiresAt: addDays(createdAt, 3),
    inferenceProvider: 'demo_stub',
    createdAt
  };
  rawState.researchReports.unshift(report);

  const source = {
    id: makeId('research_source'),
    reportId: report.id,
    title: body.sourceTitle || 'Demo source',
    url: body.sourceUrl || null,
    publisher: body.publisher || 'Demo source',
    tier: body.sourceTier || 'tier_3',
    publishedAt: createdAt
  };
  rawState.researchSources.unshift(source);

  rawState.researchClaims.unshift({
    id: makeId('research_claim'),
    reportId: report.id,
    claim: body.claim || report.summary,
    confidence: report.confidence,
    supportedBySourceIds: [source.id]
  });

  if (body.relatedEventId) {
    rawState.eventEnrichments.unshift({
      id: makeId('enrichment'),
      eventId: body.relatedEventId,
      reportId: report.id,
      summary: report.summary,
      confidence: report.confidence,
      freshnessAt: report.freshnessAt,
      expiresAt: report.expiresAt
    });
  }

  logAudit(rawState, 'research_job_created', 'research_job', job.id, `Queued research job: ${job.question}`);
}

function cleanupDemoResource(rawState, resource, id) {
  if (resource === 'themes') {
    rawState.canonicalEvents = rawState.canonicalEvents.map((event) => (event.themeId === id ? { ...event, themeId: null } : event));
    rawState.inboxItems = rawState.inboxItems.filter((item) => item.event?.themeId !== id);
  }
  if (resource === 'events') {
    rawState.inboxItems = rawState.inboxItems.filter((item) => item.eventId !== id);
    rawState.reminders = rawState.reminders.filter((reminder) => !(reminder.relatedType === 'event' && reminder.relatedId === id));
    const reportIds = rawState.eventEnrichments.filter((entry) => entry.eventId === id).map((entry) => entry.reportId);
    rawState.eventEnrichments = rawState.eventEnrichments.filter((entry) => entry.eventId !== id);
    rawState.researchReports = rawState.researchReports.filter((report) => !reportIds.includes(report.id));
    rawState.researchSources = rawState.researchSources.filter((source) => !reportIds.includes(source.reportId));
    rawState.researchClaims = rawState.researchClaims.filter((claim) => !reportIds.includes(claim.reportId));
    rawState.researchJobs = rawState.researchJobs.filter((job) => job.relatedEventId !== id);
  }
  if (resource === 'research-jobs') {
    const reportIds = rawState.researchReports.filter((report) => report.jobId === id).map((report) => report.id);
    rawState.researchReports = rawState.researchReports.filter((report) => report.jobId !== id);
    rawState.researchSources = rawState.researchSources.filter((source) => !reportIds.includes(source.reportId));
    rawState.researchClaims = rawState.researchClaims.filter((claim) => !reportIds.includes(claim.reportId));
    rawState.eventEnrichments = rawState.eventEnrichments.filter((entry) => !reportIds.includes(entry.reportId));
  }
}

async function demoMutate(path, body = {}, method = 'POST') {
  let rawState = clone(loadStoredDemoState() || state);

  if (path === '/v1/reset') {
    localStorage.removeItem(demoStorageKey);
    const response = await fetch(demoBootstrapUrl());
    rawState = await response.json();
    saveDemoState(rawState);
    return deriveClientState(rawState);
  }

  if (path === '/v1/holdings' && method === 'POST') {
    const asset = ensureDemoAsset(rawState, body);
    const holding = {
      id: makeId('holding'),
      assetId: asset.id,
      quantity: Number(body.quantity || 0),
      costBasis: body.costBasis != null && body.costBasis !== '' ? Number(body.costBasis) : null,
      sourceType: body.sourceType || 'manual'
    };
    rawState.holdings.push(holding);
    logAudit(rawState, 'holding_created', 'holding', holding.id, `Added holding for ${asset.symbol || asset.name}.`);
  } else if (path === '/v1/watchlists' && method === 'POST') {
    const watchlist = {
      id: makeId('watchlist'),
      name: body.name || 'Untitled Watchlist',
      description: body.description || '',
      itemAssetIds: []
    };
    for (const item of body.items || []) {
      const asset = ensureDemoAsset(rawState, item);
      if (!watchlist.itemAssetIds.includes(asset.id)) watchlist.itemAssetIds.push(asset.id);
    }
    rawState.watchlists.push(watchlist);
    logAudit(rawState, 'watchlist_created', 'watchlist', watchlist.id, `Created watchlist ${watchlist.name}.`);
  } else if ((path === '/v1/themes' || path === '/v1/theses') && method === 'POST') {
    const theme = {
      id: makeId('theme'),
      title: body.title || 'Untitled Theme',
      status: body.status || 'active',
      summary: body.summary || '',
      hypothesis: body.hypothesis || body.rationale || '',
      monitoringPlan: body.monitoringPlan || body.notes || '',
      assetIds: []
    };
    for (const item of body.assets || []) {
      const asset = ensureDemoAsset(rawState, item);
      if (!theme.assetIds.includes(asset.id)) theme.assetIds.push(asset.id);
    }
    rawState.themes.push(theme);
    logAudit(rawState, 'theme_created', 'theme', theme.id, `Created theme ${theme.title}.`);
  } else if ((path === '/v1/events' || path === '/v1/canonical-events' || path === '/v1/catalysts') && method === 'POST') {
    const asset = body.assetId || body.symbol || body.name ? ensureDemoAsset(rawState, body) : null;
    const event = {
      id: makeId('event'),
      eventType: body.eventType || body.type || 'custom',
      title: body.title || 'Untitled Event',
      factualSummary: body.factualSummary || body.reason || '',
      recordedAt: body.recordedAt || nowIso(),
      scheduledFor: body.scheduledFor || nowIso(),
      assetId: asset ? asset.id : body.assetId || null,
      themeId: body.themeId || body.thesisId || null,
      sourceAdapterId: body.sourceAdapterId || null,
      sourceLabel: body.sourceLabel || 'Manual entry',
      sourceTier: body.sourceTier || 'tier_2',
      importance: body.importance || 'normal',
      truthStatus: body.truthStatus || 'confirmed'
    };
    rawState.canonicalEvents.push(event);
    rawState.inboxItems.unshift({
      id: makeId('inbox'),
      eventId: event.id,
      state: 'new',
      priority: body.priority || (event.importance === 'critical' ? 'critical' : event.importance === 'high' ? 'high' : 'normal'),
      reason: body.reason || event.factualSummary,
      nextStep: body.nextStep || 'Decide whether this needs research or a reminder.',
      createdAt: nowIso(),
      deliveryKind: 'in_app'
    });
    logAudit(rawState, 'event_created', 'event', event.id, `Recorded canonical event ${event.title}.`);
  } else if ((path === '/v1/reminders' || path === '/v1/alerts') && method === 'POST') {
    const reminder = {
      id: makeId('reminder'),
      title: body.title || 'Untitled Reminder',
      state: body.state || 'open',
      dueAt: body.dueAt || body.scheduledFor || nowIso(),
      relatedType: body.relatedType || 'event',
      relatedId: body.relatedId || body.eventId || null,
      note: body.note || body.message || ''
    };
    rawState.reminders.push(reminder);
    logAudit(rawState, 'reminder_created', 'reminder', reminder.id, `Created reminder ${reminder.title}.`);
  } else if ((path === '/v1/research-jobs' || path === '/v1/research-runs') && method === 'POST') {
    createDemoResearch(rawState, body);
  } else if (path === '/v1/notes' && method === 'POST') {
    const note = {
      id: makeId('note'),
      targetType: body.targetType || 'theme',
      targetId: body.targetId || null,
      body: body.body || '',
      createdAt: nowIso()
    };
    rawState.notes.unshift(note);
    logAudit(rawState, 'note_created', 'note', note.id, `Added note on ${note.targetType}.`);
  } else if (path.match(/^\/v1\/inbox-items\/[^/]+\/seen$/) && method === 'POST') {
    const id = path.split('/')[3];
    const item = rawState.inboxItems.find((entry) => entry.id === id);
    if (item) item.state = 'seen';
  } else if (path.match(/^\/v1\/inbox-items\/[^/]+\/archive$/) && method === 'POST') {
    const id = path.split('/')[3];
    const item = rawState.inboxItems.find((entry) => entry.id === id);
    if (item) item.state = 'archived';
  } else if (path.match(/^\/v1\/reminders\/[^/]+\/done$/) && method === 'POST') {
    const id = path.split('/')[3];
    const reminder = rawState.reminders.find((entry) => entry.id === id);
    if (reminder) reminder.state = 'done';
  } else if (path.match(/^\/v1\/reminders\/[^/]+\/snooze$/) && method === 'POST') {
    const id = path.split('/')[3];
    const reminder = rawState.reminders.find((entry) => entry.id === id);
    if (reminder) {
      reminder.state = 'snoozed';
      reminder.dueAt = body.dueAt || addDays(nowIso(), 1);
    }
  } else if (path.match(/^\/v1\/alerts\/[^/]+\/seen$/) && method === 'POST') {
    const id = path.split('/')[3];
    const reminder = rawState.reminders.find((entry) => entry.id === id);
    if (reminder) reminder.state = 'done';
  } else if (path.match(/^\/v1\/alerts\/[^/]+\/snooze$/) && method === 'POST') {
    const id = path.split('/')[3];
    const reminder = rawState.reminders.find((entry) => entry.id === id);
    if (reminder) {
      reminder.state = 'snoozed';
      reminder.dueAt = body.snoozedUntil || addDays(nowIso(), 1);
    }
  } else if (method === 'DELETE') {
    const match = path.match(/^\/v1\/(holdings|watchlists|themes|events|canonical-events|catalysts|reminders|alerts|research-jobs|research-runs|notes)\/([^/]+)$/);
    if (match) {
      const [, resource, id] = match;
      const keyMap = {
        holdings: 'holdings',
        watchlists: 'watchlists',
        themes: 'themes',
        events: 'canonicalEvents',
        'canonical-events': 'canonicalEvents',
        catalysts: 'canonicalEvents',
        reminders: 'reminders',
        alerts: 'reminders',
        'research-jobs': 'researchJobs',
        'research-runs': 'researchJobs',
        notes: 'notes'
      };
      removeById(rawState[keyMap[resource]], id);
      cleanupDemoResource(rawState, resource, id);
      logAudit(rawState, 'resource_deleted', resource, id, `Deleted ${resource} ${id}.`);
    }
  }

  saveDemoState(rawState);
  return deriveClientState(rawState);
}

async function jsonFetch(path, options = {}) {
  if (!apiBase) {
    throw new Error('Local API unavailable');
  }
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${apiBase}${path}`, { ...options, signal: controller.signal });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }
    return payload;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function post(path, body) {
  if (isDemoMode) return demoMutate(path, body, 'POST');
  return jsonFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
}

async function del(path) {
  if (isDemoMode) return demoMutate(path, {}, 'DELETE');
  return jsonFetch(path, { method: 'DELETE' });
}

function assetById(id) {
  return (state.assets || []).find((asset) => asset.id === id);
}

function themeById(id) {
  return (state.themes || []).find((theme) => theme.id === id);
}

function eventById(id) {
  return (state.canonicalEvents || []).find((item) => item.id === id);
}

function parseSymbols(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((symbol) => ({ symbol, name: symbol, assetType: 'equity' }));
}

function priorityClass(priority) {
  return `priority-${priority || 'normal'}`;
}

function overviewCards() {
  return state.inbox
    .map((item) => {
      const event = item.event || {};
      const report = event.enrichment?.report;
      return `
        <article class="list-item">
          <div class="list-row">
            <div>
              <div class="list-title">${event.title || 'Untitled event'}</div>
              <div class="meta">${titleCase(item.state)} · ${formatDate(item.createdAt)}</div>
            </div>
            <span class="badge ${priorityClass(item.priority)}">${titleCase(item.priority)}</span>
          </div>
          <div class="item-stack">
            <div class="item-text">${event.factualSummary || 'No deterministic fact recorded.'}</div>
            <div class="detail-copy"><strong>Why it matters:</strong> ${event.enrichment?.summary || item.reason || 'No synthesis recorded yet.'}</div>
            <div class="detail-copy"><strong>Sources:</strong> ${titleCase(event.sourceTier)} · ${event.sourceLabel || 'Unspecified'}</div>
            <div class="detail-copy"><strong>Next:</strong> ${item.nextStep || 'No follow-up suggested yet.'}</div>
            ${report ? `<div class="detail-copy"><strong>Freshness:</strong> ${formatDate(report.freshnessAt)} · Confidence ${Math.round(report.confidence * 100)}%</div>` : ''}
          </div>
          <div class="inline-actions">
            <button class="button button-secondary small inbox-seen" data-id="${item.id}">Seen</button>
            <button class="button button-ghost small inbox-archive" data-id="${item.id}">Archive</button>
            <button class="button small launch-research" data-event-id="${event.id}">Research</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderOverview() {
  const remindersHtml = state.reminders.length
    ? state.reminders
        .map(
          (reminder) => `
            <article class="list-item">
              <div class="list-row">
                <div>
                  <div class="list-title">${reminder.title}</div>
                  <div class="meta">${titleCase(reminder.state)} · due ${formatDate(reminder.dueAt)}</div>
                </div>
                <span class="badge">${titleCase(reminder.relatedType)}</span>
              </div>
              <div class="item-text">${reminder.note || 'No reminder note.'}</div>
              <div class="inline-actions">
                <button class="button button-secondary small reminder-done" data-id="${reminder.id}">Done</button>
                <button class="button button-ghost small reminder-snooze" data-id="${reminder.id}">Snooze</button>
              </div>
            </article>
          `
        )
        .join('')
    : `<div class="empty-state">No reminders yet.</div>`;

  const sourceHealthHtml = state.sourceHealth.length
    ? state.sourceHealth
        .map(
          (adapter) => `
            <div class="source-row">
              <div>
                <strong>${adapter.name}</strong>
                <div class="meta">${titleCase(adapter.tier)} · ${titleCase(adapter.coverage)}</div>
              </div>
              <div class="meta">${titleCase(adapter.status)} · ${formatDate(adapter.lastSyncedAt)}</div>
            </div>
          `
        )
        .join('')
    : `<div class="empty-state">No source adapters configured.</div>`;

  const auditHtml = state.auditTrail.length
    ? state.auditTrail
        .map(
          (entry) => `
            <div class="audit-row">
              <div>
                <strong>${titleCase(entry.action)}</strong>
                <div class="meta">${entry.entityType} · ${entry.entityId}</div>
              </div>
              <div class="meta">${formatDate(entry.createdAt)}</div>
            </div>
          `
        )
        .join('')
    : `<div class="empty-state">No audit activity yet.</div>`;

  el('view-overview').innerHTML = `
    <div class="view-grid">
      <section class="panel span-7">
        <div class="panel-header">
          <div>
            <div class="panel-label">Today</div>
            <h2 class="panel-title">${state.digest.title}</h2>
            <p class="panel-copy">${state.digest.summary}</p>
          </div>
        </div>
        <div class="list">${overviewCards() || '<div class="empty-state">No inbox items yet.</div>'}</div>
      </section>

      <section class="panel span-5">
        <div class="panel-header">
          <div>
            <div class="panel-label">Follow-up</div>
            <h2 class="panel-title">Reminders</h2>
          </div>
        </div>
        <div class="list">${remindersHtml}</div>
      </section>

      <section class="panel span-6">
        <div class="panel-header">
          <div>
            <div class="panel-label">Trust stack</div>
            <h2 class="panel-title">Source health</h2>
          </div>
        </div>
        ${sourceHealthHtml}
      </section>

      <section class="panel span-6">
        <div class="panel-header">
          <div>
            <div class="panel-label">Audit</div>
            <h2 class="panel-title">Recent decisions</h2>
          </div>
        </div>
        ${auditHtml}
      </section>
    </div>
  `;
}

function renderPortfolio() {
  const holdingsHtml = state.holdings.length
    ? state.holdings
        .map((holding) => {
          const asset = assetById(holding.assetId) || {};
          return `
            <article class="list-item">
              <div class="list-row">
                <div>
                  <div class="list-title">${asset.symbol || 'Unknown'} · ${asset.name || 'Unnamed asset'}</div>
                  <div class="meta">${titleCase(asset.assetType)} · ${titleCase(holding.sourceType)}</div>
                </div>
                <button class="button button-ghost small delete-holding" data-id="${holding.id}">Delete</button>
              </div>
              <div class="meta-grid">
                <div class="meta-card">
                  <div class="meta">Quantity</div>
                  <div class="value">${holding.quantity}</div>
                </div>
                <div class="meta-card">
                  <div class="meta">Cost basis</div>
                  <div class="value">${holding.costBasis != null ? formatCurrency(holding.costBasis) : 'None'}</div>
                </div>
              </div>
            </article>
          `;
        })
        .join('')
    : `<div class="empty-state">No holdings in the deterministic core yet.</div>`;

  const watchlistsHtml = state.watchlists.length
    ? state.watchlists
        .map(
          (watchlist) => `
            <article class="list-item">
              <div class="list-row">
                <div>
                  <div class="list-title">${watchlist.name}</div>
                  <div class="meta">${(watchlist.itemAssetIds || []).length} tracked names</div>
                </div>
                <button class="button button-ghost small delete-watchlist" data-id="${watchlist.id}">Delete</button>
              </div>
              <div class="item-text">${watchlist.description || 'No description.'}</div>
              <div class="detail-copy">${(watchlist.itemAssetIds || []).map((id) => assetById(id)?.symbol).filter(Boolean).join(', ') || 'No symbols yet.'}</div>
            </article>
          `
        )
        .join('')
    : `<div class="empty-state">No watchlists yet.</div>`;

  el('view-portfolio').innerHTML = `
    <div class="view-grid">
      <section class="panel span-7">
        <div class="panel-header">
          <div>
            <div class="panel-label">System of record</div>
            <h2 class="panel-title">Portfolio state</h2>
          </div>
        </div>
        <div class="meta-grid">
          <div class="meta-card">
            <div class="meta">Estimated cost basis</div>
            <div class="value">${formatCurrency(state.portfolioSummary.estimatedCostBasis)}</div>
          </div>
          <div class="meta-card">
            <div class="meta">Tracked assets</div>
            <div class="value">${state.portfolioSummary.trackedAssetsCount}</div>
          </div>
        </div>
        <div class="list">${holdingsHtml}</div>
      </section>

      <section class="panel span-5">
        <div class="panel-header">
          <div>
            <div class="panel-label">Curated context</div>
            <h2 class="panel-title">Watchlists</h2>
          </div>
        </div>
        <div class="list">${watchlistsHtml}</div>
      </section>

      <section class="form-card span-6">
        <div class="panel-header">
          <div>
            <div class="panel-label">Add exposure</div>
            <h2 class="panel-title">New holding</h2>
          </div>
        </div>
        <form id="holding-form" class="form-grid">
          <input class="field" name="symbol" placeholder="Symbol" required />
          <input class="field" name="name" placeholder="Asset name" />
          <input class="field" name="quantity" placeholder="Quantity" type="number" step="any" required />
          <input class="field" name="costBasis" placeholder="Per-unit cost basis" type="number" step="any" />
          <div class="form-actions">
            <button class="button" type="submit">Add holding</button>
          </div>
        </form>
      </section>

      <section class="form-card span-6">
        <div class="panel-header">
          <div>
            <div class="panel-label">Track adjacent names</div>
            <h2 class="panel-title">New watchlist</h2>
          </div>
        </div>
        <form id="watchlist-form" class="form-grid">
          <input class="field" name="name" placeholder="Watchlist name" required />
          <input class="field" name="description" placeholder="Description" />
          <input class="field" name="symbols" placeholder="Comma-separated symbols" />
          <div class="form-actions">
            <button class="button" type="submit">Create watchlist</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderThemes() {
  const themesHtml = state.themes.length
    ? state.themes
        .map(
          (theme) => `
            <article class="panel span-12">
              <div class="panel-header">
                <div>
                  <div class="panel-label">Theme</div>
                  <h2 class="panel-title">${theme.title}</h2>
                  <p class="panel-copy">${theme.summary || 'No summary yet.'}</p>
                </div>
                <div class="inline-actions">
                  <span class="badge">${titleCase(theme.status)}</span>
                  <button class="button button-ghost small delete-theme" data-id="${theme.id}">Delete</button>
                </div>
              </div>
              <div class="meta-grid">
                <div class="meta-card">
                  <div class="meta">Hypothesis</div>
                  <div class="value">${theme.hypothesis || 'None recorded.'}</div>
                </div>
                <div class="meta-card">
                  <div class="meta">Monitoring plan</div>
                  <div class="value">${theme.monitoringPlan || 'No plan yet.'}</div>
                </div>
                <div class="meta-card">
                  <div class="meta">Linked assets</div>
                  <div class="value">${(theme.assetIds || []).map((id) => assetById(id)?.symbol).filter(Boolean).join(', ') || 'No linked assets.'}</div>
                </div>
              </div>
              <div class="inline-actions">
                <button class="button small theme-research" data-id="${theme.id}" data-title="${theme.title}">Research theme</button>
              </div>
              ${notesMarkup('theme', theme.id, 'Add a working note for this theme')}
            </article>
          `
        )
        .join('')
    : `<div class="empty-state">No themes defined yet.</div>`;

  el('view-themes').innerHTML = `
    <div class="view-grid">
      <section class="span-7">
        <div class="view-grid">${themesHtml}</div>
      </section>

      <section class="form-card span-5">
        <div class="panel-header">
          <div>
            <div class="panel-label">Belief capture</div>
            <h2 class="panel-title">Create theme</h2>
          </div>
        </div>
        <form id="theme-form" class="form-grid">
          <input class="field" name="title" placeholder="Theme title" required />
          <textarea class="textarea" name="summary" placeholder="Short summary"></textarea>
          <textarea class="textarea" name="hypothesis" placeholder="Why you think this matters"></textarea>
          <textarea class="textarea" name="monitoringPlan" placeholder="What would confirm or challenge it"></textarea>
          <input class="field" name="symbols" placeholder="Linked symbols comma-separated" />
          <div class="form-actions">
            <button class="button" type="submit">Create theme</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderEvents() {
  const eventsHtml = state.calendar.length
    ? state.calendar
        .map(
          (event) => `
            <article class="list-item">
              <div class="list-row">
                <div>
                  <div class="list-title">${event.title}</div>
                  <div class="meta">${titleCase(event.eventType)} · ${formatDate(event.scheduledFor)}</div>
                </div>
                <div class="inline-actions">
                  <span class="badge ${priorityClass(event.importance)}">${titleCase(event.importance)}</span>
                  <button class="button button-ghost small delete-event" data-id="${event.id}">Delete</button>
                </div>
              </div>
              <div class="item-text"><strong>What happened:</strong> ${event.factualSummary || 'No event summary.'}</div>
              <div class="detail-copy"><strong>Truth source:</strong> ${titleCase(event.sourceTier)} · ${event.sourceLabel || 'Unspecified'}</div>
              <div class="detail-copy"><strong>Linked context:</strong> ${event.asset?.symbol || 'No asset'} · ${event.theme?.title || 'No theme'}</div>
              <div class="detail-copy"><strong>AI layer:</strong> ${event.enrichment?.summary || 'No enrichment attached yet.'}</div>
              <div class="inline-actions">
                <button class="button button-secondary small create-reminder-from-event" data-id="${event.id}" data-title="${event.title}">Reminder</button>
                <button class="button small launch-research" data-event-id="${event.id}">Research</button>
              </div>
              ${notesMarkup('event', event.id, 'Add a note about this event')}
            </article>
          `
        )
        .join('')
    : `<div class="empty-state">No canonical events recorded yet.</div>`;

  const remindersHtml = state.reminders.length
    ? state.reminders
        .map(
          (reminder) => `
            <article class="list-item">
              <div class="list-row">
                <div>
                  <div class="list-title">${reminder.title}</div>
                  <div class="meta">${titleCase(reminder.state)} · ${formatDate(reminder.dueAt)}</div>
                </div>
                <button class="button button-ghost small delete-reminder" data-id="${reminder.id}">Delete</button>
              </div>
              <div class="item-text">${reminder.note || 'No note attached.'}</div>
            </article>
          `
        )
        .join('')
    : `<div class="empty-state">No reminders created yet.</div>`;

  el('view-events').innerHTML = `
    <div class="view-grid">
      <section class="panel span-7">
        <div class="panel-header">
          <div>
            <div class="panel-label">Deterministic truth</div>
            <h2 class="panel-title">Canonical events</h2>
          </div>
        </div>
        <div class="list">${eventsHtml}</div>
      </section>

      <section class="panel span-5">
        <div class="panel-header">
          <div>
            <div class="panel-label">Delivery</div>
            <h2 class="panel-title">Reminders</h2>
          </div>
        </div>
        <div class="list">${remindersHtml}</div>
      </section>

      <section class="form-card span-6">
        <div class="panel-header">
          <div>
            <div class="panel-label">Record fact</div>
            <h2 class="panel-title">New event</h2>
          </div>
        </div>
        <form id="event-form" class="form-grid">
          <input class="field" name="title" placeholder="Event title" required />
          <select class="select" name="eventType">
            <option value="earnings">earnings</option>
            <option value="filing">filing</option>
            <option value="news">news</option>
            <option value="macro">macro</option>
            <option value="theme_update">theme_update</option>
            <option value="custom">custom</option>
          </select>
          <input class="field" name="symbol" placeholder="Linked symbol" />
          <select class="select" name="themeId">
            <option value="">No linked theme</option>
            ${state.themes.map((theme) => `<option value="${theme.id}">${theme.title}</option>`).join('')}
          </select>
          <textarea class="textarea" name="factualSummary" placeholder="Deterministic fact only"></textarea>
          <textarea class="textarea" name="reason" placeholder="Why it matters before AI enrichment"></textarea>
          <input class="field" type="datetime-local" name="scheduledFor" required />
          <input class="field" name="sourceLabel" placeholder="Source label" />
          <select class="select" name="sourceTier">
            <option value="tier_1">tier_1</option>
            <option value="tier_2">tier_2</option>
            <option value="tier_3">tier_3</option>
          </select>
          <select class="select" name="importance">
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="normal">normal</option>
          </select>
          <div class="form-actions">
            <button class="button" type="submit">Record event</button>
          </div>
        </form>
      </section>

      <section class="form-card span-6">
        <div class="panel-header">
          <div>
            <div class="panel-label">Create follow-up</div>
            <h2 class="panel-title">New reminder</h2>
          </div>
        </div>
        <form id="reminder-form" class="form-grid">
          <input class="field" name="title" placeholder="Reminder title" required />
          <select class="select" name="relatedId">
            <option value="">No linked event</option>
            ${state.calendar.map((event) => `<option value="${event.id}">${event.title}</option>`).join('')}
          </select>
          <input class="field" type="datetime-local" name="dueAt" required />
          <textarea class="textarea" name="note" placeholder="What should be checked next"></textarea>
          <div class="form-actions">
            <button class="button" type="submit">Create reminder</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderResearch() {
  const jobsHtml = state.researchWorkspace.length
    ? state.researchWorkspace
        .map((job) => {
          const report = job.report;
          return `
            <article class="panel span-12">
              <div class="panel-header">
                <div>
                  <div class="panel-label">${titleCase(job.triggerType)} · ${titleCase(job.mode)}</div>
                  <h2 class="panel-title">${job.question}</h2>
                  <p class="panel-copy">${report?.summary || 'No report attached yet.'}</p>
                </div>
                <div class="inline-actions">
                  <span class="badge">${titleCase(job.status)}</span>
                  <button class="button button-ghost small delete-research-job" data-id="${job.id}">Delete</button>
                </div>
              </div>
              <div class="meta-grid">
                <div class="meta-card">
                  <div class="meta">Target</div>
                  <div class="value">${titleCase(job.targetType)} · ${themeById(job.targetId)?.title || assetById(job.targetId)?.symbol || job.targetId || 'Custom'}</div>
                </div>
                <div class="meta-card">
                  <div class="meta">Freshness</div>
                  <div class="value">${report ? formatDate(report.freshnessAt) : 'Not available'}</div>
                </div>
                <div class="meta-card">
                  <div class="meta">Confidence</div>
                  <div class="value">${report ? `${Math.round(report.confidence * 100)}%` : 'Not available'}</div>
                </div>
                <div class="meta-card">
                  <div class="meta">Next check</div>
                  <div class="value">${report?.nextCheck || 'No next check recorded.'}</div>
                </div>
              </div>
              ${
                report
                  ? `
                    <div class="detail-block">
                      <div class="panel-label">Citations</div>
                      ${
                        report.sources.length
                          ? report.sources
                              .map(
                                (source) => `
                                  <div class="source-row">
                                    <div>
                                      <strong>${source.title}</strong>
                                      <div class="meta">${titleCase(source.tier)} · ${source.publisher || 'Unknown publisher'}</div>
                                    </div>
                                    <div class="meta">${formatDate(source.publishedAt)}</div>
                                  </div>
                                `
                              )
                              .join('')
                          : '<div class="empty-state">No citations captured yet.</div>'
                      }
                    </div>
                    <div class="detail-block">
                      <div class="panel-label">Claims</div>
                      ${
                        report.claims.length
                          ? report.claims
                              .map(
                                (claim) => `
                                  <div class="source-row">
                                    <div>
                                      <strong>${claim.claim}</strong>
                                      <div class="meta">Confidence ${Math.round(claim.confidence * 100)}%</div>
                                    </div>
                                  </div>
                                `
                              )
                              .join('')
                          : '<div class="empty-state">No claims captured yet.</div>'
                      }
                    </div>
                  `
                  : ''
              }
              ${report ? notesMarkup('research_report', report.id, 'Attach a review note to this report') : ''}
            </article>
          `;
        })
        .join('')
    : `<div class="empty-state">No research jobs queued yet.</div>`;

  el('view-research').innerHTML = `
    <div class="view-grid">
      <section class="span-7">
        <div class="view-grid">${jobsHtml}</div>
      </section>

      <section class="form-card span-5">
        <div class="panel-header">
          <div>
            <div class="panel-label">Research orchestration</div>
            <h2 class="panel-title">Create research job</h2>
          </div>
        </div>
        <form id="research-form" class="form-grid">
          <select class="select" name="triggerType">
            <option value="user_request">user_request</option>
            <option value="digest">digest</option>
            <option value="urgent_alert">urgent_alert</option>
          </select>
          <select class="select" name="targetType">
            <option value="theme">theme</option>
            <option value="asset">asset</option>
            <option value="custom">custom</option>
          </select>
          <select class="select" name="targetId">
            <option value="">No linked target</option>
            ${state.themes.map((theme) => `<option value="${theme.id}">${theme.title}</option>`).join('')}
            ${state.assets.map((asset) => `<option value="${asset.id}">${asset.symbol}</option>`).join('')}
          </select>
          <select class="select" name="relatedEventId">
            <option value="">No linked event</option>
            ${state.calendar.map((event) => `<option value="${event.id}">${event.title}</option>`).join('')}
          </select>
          <textarea class="textarea" name="question" placeholder="What should the research layer investigate?" required></textarea>
          <textarea class="textarea" name="summary" placeholder="Optional placeholder summary"></textarea>
          <textarea class="textarea" name="claim" placeholder="Optional core claim"></textarea>
          <div class="form-actions">
            <button class="button" type="submit">Queue research</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderAll() {
  el('workspace-title').textContent = `${state.user.name}'s market operating system`;
  el('digest-summary').textContent = state.digest.summary;
  el('status-label').textContent = isDemoMode ? 'Demo mode' : 'API connected';
  el('metric-assets').textContent = state.portfolioSummary.trackedAssetsCount;
  el('metric-reminders').textContent = state.portfolioSummary.openRemindersCount;
  el('metric-inbox').textContent = state.inbox.filter((item) => item.state !== 'archived').length;
  el('metric-research').textContent = state.researchReports.length;

  renderNav();
  renderOverview();
  renderPortfolio();
  renderThemes();
  renderEvents();
  renderResearch();
  bindActions();
  setView(currentView);
}

async function refreshState() {
  try {
    state = await jsonFetch('/v1/bootstrap');
    isDemoMode = false;
  } catch (error) {
    const stored = loadStoredDemoState();
    if (stored) {
      state = deriveClientState(stored);
      isDemoMode = true;
      renderAll();
      return;
    }
    const response = await fetch(demoBootstrapUrl());
    if (!response.ok) throw error;
    const rawDemoState = await response.json();
    saveDemoState(rawDemoState);
    state = deriveClientState(rawDemoState);
    isDemoMode = true;
  }
  renderAll();
}

function bindDelete(selector, pathBuilder) {
  document.querySelectorAll(selector).forEach((button) => {
    button.onclick = async () => {
      await del(pathBuilder(button.dataset.id));
      await refreshState();
    };
  });
}

function bindActions() {
  el('reset-data').onclick = async () => {
    await post('/v1/reset');
    await refreshState();
  };

  document.querySelectorAll('.inbox-seen').forEach((button) => {
    button.onclick = async () => {
      await post(`/v1/inbox-items/${button.dataset.id}/seen`);
      await refreshState();
    };
  });

  document.querySelectorAll('.inbox-archive').forEach((button) => {
    button.onclick = async () => {
      await post(`/v1/inbox-items/${button.dataset.id}/archive`);
      await refreshState();
    };
  });

  document.querySelectorAll('.reminder-done').forEach((button) => {
    button.onclick = async () => {
      await post(`/v1/reminders/${button.dataset.id}/done`);
      await refreshState();
    };
  });

  document.querySelectorAll('.reminder-snooze').forEach((button) => {
    button.onclick = async () => {
      await post(`/v1/reminders/${button.dataset.id}/snooze`, {});
      await refreshState();
    };
  });

  document.querySelectorAll('.create-reminder-from-event').forEach((button) => {
    button.onclick = async () => {
      const event = eventById(button.dataset.id);
      await post('/v1/reminders', {
        title: `Review: ${button.dataset.title}`,
        dueAt: event?.scheduledFor,
        relatedType: 'event',
        relatedId: event?.id,
        note: event?.factualSummary
      });
      await refreshState();
    };
  });

  document.querySelectorAll('.launch-research').forEach((button) => {
    button.onclick = async () => {
      const event = eventById(button.dataset.eventId);
      await post('/v1/research-jobs', {
        triggerType: 'user_request',
        targetType: event?.themeId ? 'theme' : event?.assetId ? 'asset' : 'custom',
        targetId: event?.themeId || event?.assetId || null,
        relatedEventId: event?.id,
        question: `Why does ${event?.title || 'this event'} matter?`
      });
      currentView = 'research';
      await refreshState();
    };
  });

  document.querySelectorAll('.theme-research').forEach((button) => {
    button.onclick = async () => {
      await post('/v1/research-jobs', {
        triggerType: 'user_request',
        targetType: 'theme',
        targetId: button.dataset.id,
        question: `Research ${button.dataset.title} for confirming and disconfirming signals.`
      });
      currentView = 'research';
      await refreshState();
    };
  });

  document.querySelectorAll('.note-form').forEach((form) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      await post('/v1/notes', {
        targetType: form.dataset.targetType,
        targetId: form.dataset.targetId,
        body: formData.get('body')
      });
      await refreshState();
    };
  });

  const holdingForm = el('holding-form');
  if (holdingForm) {
    holdingForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(holdingForm);
      await post('/v1/holdings', Object.fromEntries(form.entries()));
      holdingForm.reset();
      await refreshState();
    };
  }

  const watchlistForm = el('watchlist-form');
  if (watchlistForm) {
    watchlistForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(watchlistForm);
      const body = Object.fromEntries(form.entries());
      body.items = parseSymbols(body.symbols);
      await post('/v1/watchlists', body);
      watchlistForm.reset();
      await refreshState();
    };
  }

  const themeForm = el('theme-form');
  if (themeForm) {
    themeForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(themeForm);
      const body = Object.fromEntries(form.entries());
      body.assets = parseSymbols(body.symbols);
      await post('/v1/themes', body);
      themeForm.reset();
      await refreshState();
    };
  }

  const eventForm = el('event-form');
  if (eventForm) {
    eventForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(eventForm);
      const body = Object.fromEntries(form.entries());
      body.scheduledFor = new Date(body.scheduledFor).toISOString();
      await post('/v1/events', body);
      eventForm.reset();
      await refreshState();
    };
  }

  const reminderForm = el('reminder-form');
  if (reminderForm) {
    reminderForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(reminderForm);
      const body = Object.fromEntries(form.entries());
      body.relatedType = 'event';
      body.dueAt = new Date(body.dueAt).toISOString();
      await post('/v1/reminders', body);
      reminderForm.reset();
      await refreshState();
    };
  }

  const researchForm = el('research-form');
  if (researchForm) {
    researchForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(researchForm);
      await post('/v1/research-jobs', Object.fromEntries(form.entries()));
      researchForm.reset();
      await refreshState();
    };
  }

  bindDelete('.delete-holding', (id) => `/v1/holdings/${id}`);
  bindDelete('.delete-watchlist', (id) => `/v1/watchlists/${id}`);
  bindDelete('.delete-theme', (id) => `/v1/themes/${id}`);
  bindDelete('.delete-event', (id) => `/v1/events/${id}`);
  bindDelete('.delete-reminder', (id) => `/v1/reminders/${id}`);
  bindDelete('.delete-research-job', (id) => `/v1/research-jobs/${id}`);
  bindDelete('.delete-note', (id) => `/v1/notes/${id}`);
}

refreshState().catch((error) => {
  el('status-label').textContent = 'API unavailable';
  el('digest-summary').textContent = `Failed to load product state: ${error.message}`;
});
