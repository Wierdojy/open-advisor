const localApiHosts = new Set(['localhost', '127.0.0.1', '::1']);
const apiBase = localApiHosts.has(window.location.hostname)
  ? `${window.location.protocol}//${window.location.hostname}:3001`
  : null;

const viewMeta = {
  dashboard: { label: 'Dashboard', icon: 'dashboard', accent: 'violet', kicker: 'Portfolio atelier' },
  inbox: { label: 'Inbox', icon: 'inbox', accent: 'cyan', kicker: 'Signal curation' },
  research: { label: 'Research', icon: 'query_stats', accent: 'amber', kicker: 'Context and discovery' },
  chat: { label: 'Chat', icon: 'forum', accent: 'rose', kicker: 'Advisor dialogue' }
};
const views = Object.keys(viewMeta);

let state = null;
let currentView = 'dashboard';
let isDemoMode = false;
const demoStorageKey = 'openAdvisorPagesState';
const uiStorageKey = 'openAdvisorUiState';
let uiState = null;
let chatTypingTimer = null;
let revealObserver = null;

function demoBootstrapUrl() {
  const buildVersion = window.OPEN_ADVISOR_BUILD;
  return buildVersion ? `./demo-bootstrap.json?v=${buildVersion}` : './demo-bootstrap.json';
}

function el(id) {
  return document.getElementById(id);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function createParticles(count, prefix = 'particle') {
  return Array.from({ length: count }, (_, index) => {
    const x = ((index * 17) % 100) + 2;
    const y = ((index * 23) % 100) + 4;
    const delay = (index * 0.6).toFixed(2);
    const duration = (7 + (index % 5) * 1.4).toFixed(2);
    return `<span class="${prefix}" style="--x:${x}%;--y:${y}%;--delay:${delay}s;--duration:${duration}s"></span>`;
  }).join('');
}

function getMap(items) {
  return new Map((items || []).map((item) => [item.id, item]));
}

function priorityRank(priority) {
  return { critical: 0, high: 1, normal: 2, low: 3 }[priority] ?? 4;
}

function priorityClass(priority) {
  return `priority-${priority || 'normal'}`;
}

function parseSymbols(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean)
    .map((symbol) => ({ symbol, name: symbol, assetType: 'equity' }));
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

function loadUiState() {
  const raw = localStorage.getItem(uiStorageKey);
  const base = raw ? JSON.parse(raw) : {};
  const threads = Array.isArray(base.chat?.threads) && base.chat.threads.length
    ? base.chat.threads
    : [{
        id: 'thread_main',
        title: 'Market overview',
        messages: [{
          id: makeId('msg'),
          role: 'assistant',
          body: 'I can help connect your holdings, watchlist, and beliefs into actionable monitoring. Ask about a stock, thesis, or catalyst.',
          createdAt: nowIso()
        }]
      }];

  return {
    settings: {
      displayName: base.settings?.displayName || 'Open Advisor',
      notifications: base.settings?.notifications ?? true,
      priceAlerts: base.settings?.priceAlerts ?? true,
      ipoAlerts: base.settings?.ipoAlerts ?? true,
      compactMode: base.settings?.compactMode ?? false
    },
    inboxTag: base.inboxTag || 'all',
    researchQuery: base.researchQuery || '',
    chat: {
      threads,
      activeThreadId: base.chat?.activeThreadId || threads[0].id,
      isTyping: false
    }
  };
}

function saveUiState() {
  localStorage.setItem(uiStorageKey, JSON.stringify(uiState));
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
    trackedAssetsCount: trackedAssetIds.length,
    openRemindersCount: (baseState.reminders || []).filter((reminder) => reminder.state === 'open').length,
    estimatedCostBasis: estimatedBasis
  };
}

function deriveClientState(baseState) {
  const next = clone(baseState);
  next.theses = next.themes;
  next.alerts = next.reminders;
  next.catalysts = next.canonicalEvents;
  next.researchRuns = next.researchReports;
  next.portfolioSummary = buildPortfolioSummary(next);
  next.inbox = buildInbox(next);
  next.researchWorkspace = buildResearchWorkspace(next);
  return next;
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
    rawState.holdings.push({
      id: makeId('holding'),
      assetId: asset.id,
      quantity: Number(body.quantity || 0),
      costBasis: body.costBasis != null && body.costBasis !== '' ? Number(body.costBasis) : null,
      sourceType: body.sourceType || 'manual'
    });
  } else if (path === '/v1/watchlists' && method === 'POST') {
    const watchlist = {
      id: makeId('watchlist'),
      name: body.name || 'Watchlist',
      description: body.description || '',
      itemAssetIds: []
    };
    for (const item of body.items || []) {
      const asset = ensureDemoAsset(rawState, item);
      if (!watchlist.itemAssetIds.includes(asset.id)) watchlist.itemAssetIds.push(asset.id);
    }
    rawState.watchlists.push(watchlist);
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
  } else if ((path === '/v1/research-jobs' || path === '/v1/research-runs') && method === 'POST') {
    createDemoResearch(rawState, body);
  } else if (path === '/v1/notes' && method === 'POST') {
    rawState.notes.unshift({
      id: makeId('note'),
      targetType: body.targetType || 'theme',
      targetId: body.targetId || null,
      body: body.body || '',
      createdAt: nowIso()
    });
  } else if (path.match(/^\/v1\/inbox-items\/[^/]+\/seen$/) && method === 'POST') {
    const id = path.split('/')[3];
    const item = rawState.inboxItems.find((entry) => entry.id === id);
    if (item) item.state = 'seen';
  } else if (path.match(/^\/v1\/inbox-items\/[^/]+\/archive$/) && method === 'POST') {
    const id = path.split('/')[3];
    const item = rawState.inboxItems.find((entry) => entry.id === id);
    if (item) item.state = 'archived';
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
    }
  }

  saveDemoState(rawState);
  return deriveClientState(rawState);
}

async function jsonFetch(path, options = {}) {
  if (!apiBase) throw new Error('Local API unavailable');
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${apiBase}${path}`, { ...options, signal: controller.signal });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
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

function hashCode(value) {
  return String(value || 'asset').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function performanceForAsset(asset, index = 0) {
  const seed = hashCode(asset?.symbol || asset?.name || index);
  const delta = ((seed % 180) - 90) / 10;
  const change = Number(delta.toFixed(1));
  const positive = change >= 0;
  const points = Array.from({ length: 14 }, (_, pointIndex) => {
    const wave = Math.sin((seed + pointIndex * 13) / 11) * 18;
    const slope = positive ? pointIndex * 1.6 : (13 - pointIndex) * 1.6;
    return Math.max(8, Math.min(92, 52 + wave + (positive ? slope : -slope)));
  });
  return {
    change,
    positive,
    price: (seed % 320) + 24,
    points
  };
}

function sparklineSvg(points, positive) {
  const coords = points.map((point, index) => `${index * 12},${100 - point}`).join(' ');
  return `
    <svg class="sparkline" viewBox="0 0 156 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${coords}" fill="none" stroke="${positive ? '#1b8f4d' : '#c63b3b'}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
  `;
}

function stockCardMarkup(asset, performance, status, controls = '') {
  return `
    <article class="stock-card ${performance.positive ? 'stock-up' : 'stock-down'}">
      <div class="list-row align-center">
        <div>
          <div class="list-title">${asset.symbol || asset.name || 'Asset'}</div>
          <div class="meta">${asset.name || 'Unnamed asset'} · ${status}</div>
        </div>
        <div class="trend-pill ${performance.positive ? 'positive' : 'negative'}">${performance.positive ? '+' : ''}${performance.change}%</div>
      </div>
      <div class="stock-price-row">
        <div class="price-stack">
          <div class="price-value">${formatCurrency(performance.price)}</div>
          <div class="meta">1D performance</div>
        </div>
        ${sparklineSvg(performance.points, performance.positive)}
      </div>
      ${controls ? `<div class="inline-actions">${controls}</div>` : ''}
    </article>
  `;
}

function getDashboardData() {
  const holdings = (state.holdings || []).map((holding, index) => ({
    holding,
    asset: assetById(holding.assetId) || { name: 'Unknown asset' },
    performance: performanceForAsset(assetById(holding.assetId), index)
  }));
  const ownedIds = new Set(holdings.map((item) => item.asset.id));
  const watchlistIds = unique((state.watchlists || []).flatMap((watchlist) => watchlist.itemAssetIds || [])).filter((id) => !ownedIds.has(id));
  const watchlistAssets = watchlistIds.map((id, index) => ({
    asset: assetById(id) || { name: 'Unknown asset' },
    performance: performanceForAsset(assetById(id), index + 100)
  }));
  return { holdings, watchlistAssets };
}

function getIdentityTags() {
  return unique((state.themes || []).map((theme) => theme.title));
}

function tagsForInboxItem(item) {
  const tags = [];
  if (item.event?.theme?.title) tags.push(item.event.theme.title);
  const assetThemes = (state.themes || []).filter((theme) => (theme.assetIds || []).includes(item.event?.assetId));
  assetThemes.forEach((theme) => tags.push(theme.title));
  return unique(tags);
}

function getResearchResults(query) {
  const normalized = String(query || '').trim().toLowerCase();
  const { holdings, watchlistAssets } = getDashboardData();
  const assets = [...holdings.map((item) => item.asset), ...watchlistAssets.map((item) => item.asset)];
  const directMatch = assets.find((asset) => [asset.symbol, asset.name].filter(Boolean).some((value) => value.toLowerCase().includes(normalized)));
  const reportMatch = (state.researchWorkspace || []).find((job) => (job.question || '').toLowerCase().includes(normalized));
  const themeMatch = (state.themes || []).find((theme) => [theme.title, theme.summary, theme.hypothesis].filter(Boolean).some((value) => value.toLowerCase().includes(normalized)));

  const fallback = directMatch || (themeMatch?.assetIds?.[0] ? assetById(themeMatch.assetIds[0]) : assets[0]);
  if (!fallback) return null;
  const performance = performanceForAsset(fallback, 7);

  const bullets = [
    directMatch ? `${directMatch.symbol || directMatch.name} is already tracked in your workspace.` : null,
    themeMatch ? `Linked belief: ${themeMatch.title}.` : null,
    reportMatch?.report?.summary || null,
    `Simulated market pulse: ${performance.positive ? 'buyers are in control' : 'selling pressure is elevated'} over the last session.`
  ].filter(Boolean);

  const results = [
    {
      type: 'Data',
      title: `${fallback.symbol || fallback.name} snapshot`,
      body: `Price ${formatCurrency(performance.price)} · ${performance.positive ? '+' : ''}${performance.change}% · ${themeMatch ? 'belief-linked' : 'general coverage'}`
    },
    {
      type: 'Graph',
      title: 'Price performance',
      body: sparklineSvg(performance.points, performance.positive),
      rich: true
    },
    {
      type: 'Web',
      title: reportMatch?.report?.title || `${fallback.symbol || fallback.name} market context`,
      body: reportMatch?.report?.summary || `Search results would blend live filings, trustworthy news, and identity-linked themes for ${fallback.symbol || fallback.name}.`
    }
  ];

  return { asset: fallback, performance, bullets, results };
}

function getActiveThread() {
  return uiState.chat.threads.find((thread) => thread.id === uiState.chat.activeThreadId) || uiState.chat.threads[0];
}

function renderHeroArt(view) {
  const meta = viewMeta[view] || viewMeta.dashboard;
  return `
    <div class="hero-art hero-art--${meta.accent}" aria-hidden="true">
      <div class="hero-art__halo hero-art__halo--one"></div>
      <div class="hero-art__halo hero-art__halo--two"></div>
      <div class="hero-art__grid"></div>
      <div class="hero-art__orb hero-art__orb--main"></div>
      <div class="hero-art__orb hero-art__orb--small"></div>
      <svg class="hero-art__lines" viewBox="0 0 240 180" fill="none" preserveAspectRatio="none">
        <path d="M8 132C44 150 83 84 122 92C157 99 168 136 205 136C217 136 227 133 232 128" />
        <path d="M20 44C52 31 78 61 111 61C151 61 170 24 213 28" />
      </svg>
      <div class="hero-art__ring hero-art__ring--one"></div>
      <div class="hero-art__ring hero-art__ring--two"></div>
      <div class="hero-art__particles">${createParticles(10, 'hero-particle')}</div>
    </div>
  `;
}

function renderNav() {
  el('nav').innerHTML = views
    .map((view) => {
      const meta = viewMeta[view];
      return `
        <button class="nav-item ${currentView === view ? 'active' : ''}" data-view="${view}" aria-label="${meta.label}">
          <span class="material-symbols-outlined nav-icon" aria-hidden="true">${meta.icon}</span>
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
  const applyView = () => {
    currentView = view;
    document.body.dataset.view = view;
    document.querySelectorAll('.view').forEach((section) => section.classList.remove('active-view'));
    el(`view-${view}`).classList.add('active-view');
    renderNav();
    armRevealAnimations();
  };

  if (document.startViewTransition) {
    document.startViewTransition(applyView);
  } else {
    applyView();
  }
}

function renderViewHeader(view, title, copy) {
  const meta = viewMeta[view] || viewMeta.dashboard;
  return `
    <section class="stitch-page-title stitch-page-title--${meta.accent}">
      <div class="stitch-page-title__copy-block">
        <div class="eyebrow">${meta.kicker}</div>
        <h2 class="stitch-page-title__heading">${title}</h2>
        <p class="stitch-page-title__copy">${copy}</p>
      </div>
      ${renderHeroArt(view)}
    </section>
  `;
}

function renderDashboard() {
  const { holdings, watchlistAssets } = getDashboardData();
  const portfolioHtml = holdings.length
    ? holdings.map(({ holding, asset, performance }) => stockCardMarkup(
        asset,
        performance,
        'Owned',
        `<button class="button button-ghost small move-to-watchlist" data-holding-id="${holding.id}">Move to watchlist</button>
         <button class="button button-ghost small delete-holding" data-id="${holding.id}">Remove</button>`
      )).join('')
    : '<div class="empty-state">No owned positions yet.</div>';

  const watchlistHtml = watchlistAssets.length
    ? watchlistAssets.map(({ asset, performance }) => stockCardMarkup(
        asset,
        performance,
        'Watching',
        `<button class="button small move-to-portfolio" data-asset-id="${asset.id}">Move to portfolio</button>
         <button class="button button-ghost small remove-from-watchlist" data-asset-id="${asset.id}">Remove</button>`
      )).join('')
    : '<div class="empty-state">No watchlist names yet.</div>';

  el('view-dashboard').innerHTML = `
    ${renderViewHeader(
      'dashboard',
      'Dashboard',
      'Portfolio first, watchlist right below it. Keep owned names, future entries, and quick capture in one calm workspace.'
    )}
    <div class="view-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-label">Portfolio</div>
            <h2 class="panel-title">Owned positions</h2>
          </div>
        </div>
        <div class="list stock-list">${portfolioHtml}</div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-label">Watchlist</div>
            <h2 class="panel-title">Potential entries</h2>
          </div>
        </div>
        <div class="list stock-list">${watchlistHtml}</div>
      </section>

      <section class="form-card">
        <div class="panel-header">
          <div>
            <div class="panel-label">Add stock</div>
            <h2 class="panel-title">Quick capture</h2>
          </div>
        </div>
        <form id="quick-add-form" class="form-grid two-up">
          <input class="field" name="symbol" placeholder="Symbol" required />
          <select class="select" name="destination">
            <option value="portfolio">Portfolio</option>
            <option value="watchlist">Watchlist</option>
          </select>
          <input class="field" name="name" placeholder="Company name" />
          <input class="field" name="quantity" type="number" step="any" placeholder="Quantity if owned" />
          <input class="field" name="costBasis" type="number" step="any" placeholder="Cost basis if owned" />
          <div class="form-actions">
            <button class="button" type="submit">Add stock</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderInbox() {
  const tags = getIdentityTags();
  const filterTag = uiState.inboxTag;
  const items = state.inbox.filter((item) => item.state !== 'archived').filter((item) => filterTag === 'all' || tagsForInboxItem(item).includes(filterTag));

  el('view-inbox').innerHTML = `
    ${renderViewHeader(
      'inbox',
      'Inbox',
      'Identity-linked market coverage, organized around what you already own, track, and believe.'
    )}
    <div class="view-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-label">Identity system</div>
            <h2 class="panel-title">Beliefs and themes</h2>
            <p class="panel-copy">These beliefs shape what gets surfaced and how incoming articles are labeled.</p>
          </div>
        </div>
        <div class="chip-row">
          <button class="chip ${filterTag === 'all' ? 'active' : ''}" data-inbox-tag="all">All</button>
          ${tags.map((tag) => `<button class="chip ${filterTag === tag ? 'active' : ''}" data-inbox-tag="${tag}">${tag}</button>`).join('')}
        </div>
        <div class="list belief-list">
          ${(state.themes || []).map((theme) => `
            <article class="belief-card">
              <div class="list-row">
                <div>
                  <div class="list-title">${theme.title}</div>
                  <div class="meta">${titleCase(theme.status)} belief</div>
                </div>
                <span class="badge">${(theme.assetIds || []).length} assets</span>
              </div>
              <div class="item-text">${theme.summary || theme.hypothesis || 'No summary yet.'}</div>
            </article>
          `).join('') || '<div class="empty-state">No beliefs yet.</div>'}
        </div>
        <form id="belief-form" class="form-grid">
          <input class="field" name="title" placeholder="Belief or theme" required />
          <textarea class="textarea" name="summary" placeholder="What do you believe and why?"></textarea>
          <input class="field" name="symbols" placeholder="Linked symbols comma-separated" />
          <div class="form-actions">
            <button class="button" type="submit">Add belief</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-label">Curated articles</div>
            <h2 class="panel-title">Real-time article feed</h2>
          </div>
        </div>
        <div class="list">
          ${items.map((item) => {
            const event = item.event || {};
            const beliefTags = tagsForInboxItem(item);
            return `
              <article class="list-item">
                <div class="list-row">
                  <div>
                    <div class="list-title">${event.title || 'Untitled article'}</div>
                    <div class="meta">${formatDate(item.createdAt)} · ${titleCase(item.priority)}</div>
                  </div>
                  <span class="badge ${priorityClass(item.priority)}">${titleCase(item.priority)}</span>
                </div>
                <div class="item-stack">
                  <div class="item-text">${event.factualSummary || item.reason || 'No summary recorded yet.'}</div>
                  <div class="detail-copy">${event.enrichment?.summary || 'No AI summary attached yet.'}</div>
                  <div class="chip-row compact">
                    ${beliefTags.length ? beliefTags.map((tag) => `<span class="chip static">${tag}</span>`).join('') : '<span class="meta">No belief tags</span>'}
                  </div>
                </div>
                <div class="inline-actions">
                  <button class="button button-secondary small inbox-seen" data-id="${item.id}">Seen</button>
                  <button class="button button-ghost small inbox-archive" data-id="${item.id}">Archive</button>
                </div>
              </article>
            `;
          }).join('') || '<div class="empty-state">No articles match this filter yet.</div>'}
        </div>
      </section>
    </div>
  `;
}

function renderResearch() {
  const query = uiState.researchQuery || '';
  const result = getResearchResults(query || (state.assets?.[0]?.symbol || ''));

  el('view-research').innerHTML = `
    ${renderViewHeader(
      'research',
      'Research',
      'Search stocks, pull context, and inspect graphs without losing the thread of your portfolio or thesis work.'
    )}
    <div class="view-grid">
      <section class="form-card">
        <div class="panel-header">
          <div>
            <div class="panel-label">Search</div>
            <h2 class="panel-title">Stock research</h2>
          </div>
        </div>
        <form id="research-search-form" class="form-grid">
          <input class="field" name="query" value="${query}" placeholder="Search symbol, company, or belief" />
          <div class="form-actions split-actions">
            <button class="button" type="submit">Search</button>
            <button id="queue-research-from-search" class="button button-ghost" type="button">Save as research run</button>
          </div>
        </form>
      </section>

      ${result ? `
        <section class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-label">Results</div>
              <h2 class="panel-title">${result.asset.symbol || result.asset.name}</h2>
            </div>
            <span class="trend-pill ${result.performance.positive ? 'positive' : 'negative'}">${result.performance.positive ? '+' : ''}${result.performance.change}%</span>
          </div>
          <div class="meta-grid three-up">
            ${result.results.map((entry) => `
              <article class="meta-card research-result-card">
                <div class="panel-label">${entry.type}</div>
                <div class="value">${entry.title}</div>
                <div class="detail-copy ${entry.rich ? 'rich-copy' : ''}">${entry.body}</div>
              </article>
            `).join('')}
          </div>
          <div class="detail-block">
            <div class="panel-label">Key takeaways</div>
            <div class="list compact-list">
              ${result.bullets.map((bullet) => `<div class="bullet-row">• ${bullet}</div>`).join('')}
            </div>
          </div>
        </section>
      ` : '<div class="empty-state">No research results yet.</div>'}

      <section class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-label">Saved research</div>
            <h2 class="panel-title">Recent runs</h2>
          </div>
        </div>
        <div class="list">
          ${(state.researchWorkspace || []).slice(0, 5).map((job) => `
            <article class="list-item">
              <div class="list-row">
                <div>
                  <div class="list-title">${job.question}</div>
                  <div class="meta">${formatDate(job.createdAt)} · ${titleCase(job.status)}</div>
                </div>
                <button class="button button-ghost small delete-research-job" data-id="${job.id}">Delete</button>
              </div>
              <div class="item-text">${job.report?.summary || 'No report summary yet.'}</div>
            </article>
          `).join('') || '<div class="empty-state">No research runs saved yet.</div>'}
        </div>
      </section>
    </div>
  `;
}

function renderChat() {
  const activeThread = getActiveThread();
  const identityTags = getIdentityTags();

  el('view-chat').innerHTML = `
    ${renderViewHeader(
      'chat',
      'Chat',
      'Separate portfolio questions, thesis work, and follow-ups into focused conversations with the advisor.'
    )}
    <div class="view-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-label">Threads</div>
            <h2 class="panel-title">Conversation list</h2>
          </div>
          <button id="new-chat" class="button small" type="button">New chat</button>
        </div>
        <div class="list compact-list">
          ${uiState.chat.threads.map((thread) => `
            <button class="thread-card ${thread.id === activeThread.id ? 'active' : ''}" data-thread-id="${thread.id}">
              <span class="list-title">${thread.title}</span>
              <span class="meta">${thread.messages.length} messages</span>
            </button>
          `).join('')}
        </div>
      </section>

      <section class="panel chat-panel">
        <div class="panel-header">
          <div>
            <div class="panel-label">AI expert</div>
            <h2 class="panel-title">${activeThread.title}</h2>
          </div>
        </div>
        <div class="chat-identity-row">
          ${identityTags.map((tag) => `<span class="chip static">${tag}</span>`).join('') || '<span class="meta">No belief context yet.</span>'}
        </div>
        <div class="particle-stage ${uiState.chat.isTyping ? 'typing' : ''}">
          <div class="particle-core"></div>
          <div class="orbit orbit-a"></div>
          <div class="orbit orbit-b"></div>
          <div class="orbit orbit-c"></div>
          <div class="particle-dust">${createParticles(12)}</div>
        </div>
        <div class="chat-log">
          ${activeThread.messages.map((message) => `
            <article class="chat-bubble ${message.role}">
              <div class="meta">${message.role === 'assistant' ? 'Advisor AI' : 'You'}</div>
              <div>${message.body}</div>
            </article>
          `).join('')}
          ${uiState.chat.isTyping ? '<article class="chat-bubble assistant typing-bubble"><div class="meta">Advisor AI</div><div>Thinking through your portfolio and beliefs…</div></article>' : ''}
        </div>
        <form id="chat-form" class="form-grid">
          <textarea class="textarea" name="message" placeholder="Ask about a holding, thesis, catalyst, or listing."></textarea>
          <div class="form-actions">
            <button class="button" type="submit">Send</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderAll() {
  el('workspace-title').textContent = uiState.settings.displayName || 'Open Advisor';
  el('status-label').textContent = isDemoMode ? 'Demo mode' : 'API connected';
  el('status-meta').textContent = uiState.settings.notifications ? 'Live market copilot' : 'Notifications muted';
  document.body.dataset.view = currentView;

  renderNav();
  renderDashboard();
  renderInbox();
  renderResearch();
  renderChat();
  bindActions();
  setView(currentView);
}

function armRevealAnimations() {
  if (revealObserver) revealObserver.disconnect();
  document.documentElement.classList.add('reveal-enabled');

  const items = Array.from(document.querySelectorAll('.active-view .panel, .active-view .form-card, .active-view .detail-block, .active-view .list-item, .active-view .empty-state, .active-view .meta-card, .active-view .belief-card, .active-view .stock-card, .active-view .thread-card, .active-view .chat-bubble, .active-view .particle-stage, .active-view .stitch-page-title'));

  items.forEach((node, index) => {
    node.classList.add('reveal-item');
    node.style.setProperty('--reveal-delay', `${Math.min(index * 45, 240)}ms`);
  });

  if (!('IntersectionObserver' in window)) {
    items.forEach((node) => node.classList.add('is-visible'));
    return;
  }

  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  items.forEach((node) => revealObserver.observe(node));
}

function syncScrollMotion() {
  document.documentElement.style.setProperty('--scroll-y', `${window.scrollY || 0}`);
}

window.addEventListener('scroll', syncScrollMotion, { passive: true });
syncScrollMotion();

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

function ensurePrimaryWatchlist(rawState) {
  rawState.watchlists = rawState.watchlists || [];
  if (!rawState.watchlists.length) {
    rawState.watchlists.push({ id: makeId('watchlist'), name: 'Main Watchlist', description: '', itemAssetIds: [] });
  }
  return rawState.watchlists[0];
}

async function mutateDemoState(mutator) {
  const rawState = clone(loadStoredDemoState() || state);
  mutator(rawState);
  saveDemoState(rawState);
  state = deriveClientState(rawState);
  renderAll();
}

function simulateAdvisorReply(message) {
  const activeThread = getActiveThread();
  const beliefContext = getIdentityTags().slice(0, 3).join(', ') || 'your current beliefs';
  const matchedAsset = (state.assets || []).find((asset) => [asset.symbol, asset.name].filter(Boolean).some((value) => message.toLowerCase().includes(value.toLowerCase())));
  const opening = matchedAsset
    ? `${matchedAsset.symbol || matchedAsset.name} is the clearest match in your workspace.`
    : 'I would frame this through your tracked positions, watchlist, and catalysts first.';
  const reply = `${opening} Based on ${beliefContext}, I’d watch price action, upcoming catalysts, and whether the latest articles confirm or challenge the thesis before you act. I can turn this into a reminder or research run next.`;

  window.clearTimeout(chatTypingTimer);
  uiState.chat.isTyping = true;
  saveUiState();
  renderAll();

  chatTypingTimer = window.setTimeout(() => {
    activeThread.messages.push({
      id: makeId('msg'),
      role: 'assistant',
      body: reply,
      createdAt: nowIso()
    });
    uiState.chat.isTyping = false;
    saveUiState();
    renderAll();
  }, 1200);
}

function bindActions() {
  document.querySelectorAll('.delete-holding').forEach((button) => {
    button.onclick = async () => {
      await del(`/v1/holdings/${button.dataset.id}`);
      await refreshState();
    };
  });

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

  document.querySelectorAll('[data-inbox-tag]').forEach((button) => {
    button.onclick = () => {
      uiState.inboxTag = button.dataset.inboxTag;
      saveUiState();
      renderAll();
    };
  });

  document.querySelectorAll('.delete-research-job').forEach((button) => {
    button.onclick = async () => {
      await del(`/v1/research-jobs/${button.dataset.id}`);
      await refreshState();
    };
  });

  document.querySelectorAll('.thread-card').forEach((button) => {
    button.onclick = () => {
      uiState.chat.activeThreadId = button.dataset.threadId;
      saveUiState();
      renderAll();
    };
  });

  document.querySelectorAll('.move-to-watchlist').forEach((button) => {
    button.onclick = async () => {
      if (!isDemoMode) return;
      await mutateDemoState((rawState) => {
        const holding = rawState.holdings.find((entry) => entry.id === button.dataset.holdingId);
        if (!holding) return;
        const watchlist = ensurePrimaryWatchlist(rawState);
        if (!watchlist.itemAssetIds.includes(holding.assetId)) watchlist.itemAssetIds.push(holding.assetId);
        rawState.holdings = rawState.holdings.filter((entry) => entry.id !== holding.id);
      });
    };
  });

  document.querySelectorAll('.move-to-portfolio').forEach((button) => {
    button.onclick = async () => {
      if (!isDemoMode) return;
      await mutateDemoState((rawState) => {
        const watchlist = ensurePrimaryWatchlist(rawState);
        const assetId = button.dataset.assetId;
        if (!rawState.holdings.some((entry) => entry.assetId === assetId)) {
          rawState.holdings.push({
            id: makeId('holding'),
            assetId,
            quantity: 1,
            costBasis: null,
            sourceType: 'watchlist_promoted'
          });
        }
        watchlist.itemAssetIds = watchlist.itemAssetIds.filter((id) => id !== assetId);
      });
    };
  });

  document.querySelectorAll('.remove-from-watchlist').forEach((button) => {
    button.onclick = async () => {
      if (!isDemoMode) return;
      await mutateDemoState((rawState) => {
        rawState.watchlists = (rawState.watchlists || []).map((watchlist) => ({
          ...watchlist,
          itemAssetIds: (watchlist.itemAssetIds || []).filter((id) => id !== button.dataset.assetId)
        }));
      });
    };
  });

  const quickAddForm = el('quick-add-form');
  if (quickAddForm) {
    quickAddForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(quickAddForm);
      const body = Object.fromEntries(form.entries());
      if (body.destination === 'portfolio') {
        await post('/v1/holdings', body);
      } else if (isDemoMode) {
        await mutateDemoState((rawState) => {
          const asset = ensureDemoAsset(rawState, body);
          const watchlist = ensurePrimaryWatchlist(rawState);
          if (!watchlist.itemAssetIds.includes(asset.id)) watchlist.itemAssetIds.push(asset.id);
        });
        quickAddForm.reset();
        return;
      }
      quickAddForm.reset();
      await refreshState();
    };
  }

  const beliefForm = el('belief-form');
  if (beliefForm) {
    beliefForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(beliefForm);
      const body = Object.fromEntries(form.entries());
      body.assets = parseSymbols(body.symbols);
      await post('/v1/themes', body);
      beliefForm.reset();
      await refreshState();
    };
  }

  const researchSearchForm = el('research-search-form');
  if (researchSearchForm) {
    researchSearchForm.onsubmit = (event) => {
      event.preventDefault();
      const form = new FormData(researchSearchForm);
      uiState.researchQuery = String(form.get('query') || '');
      saveUiState();
      renderAll();
    };
  }

  const queueResearchButton = el('queue-research-from-search');
  if (queueResearchButton) {
    queueResearchButton.onclick = async () => {
      const query = uiState.researchQuery || state.assets?.[0]?.symbol || 'Market research';
      await post('/v1/research-jobs', {
        triggerType: 'user_request',
        targetType: 'custom',
        question: `Research ${query}`,
        summary: `Saved from the research surface for ${query}.`
      });
      await refreshState();
    };
  }

  const chatForm = el('chat-form');
  if (chatForm) {
    chatForm.onsubmit = (event) => {
      event.preventDefault();
      const form = new FormData(chatForm);
      const body = String(form.get('message') || '').trim();
      if (!body) return;
      const activeThread = getActiveThread();
      activeThread.messages.push({ id: makeId('msg'), role: 'user', body, createdAt: nowIso() });
      activeThread.title = activeThread.messages.length <= 2 ? body.slice(0, 28) : activeThread.title;
      saveUiState();
      chatForm.reset();
      renderAll();
      simulateAdvisorReply(body);
    };
  }

  const newChatButton = el('new-chat');
  if (newChatButton) {
    newChatButton.onclick = () => {
      const thread = {
        id: makeId('thread'),
        title: 'New chat',
        messages: [{ id: makeId('msg'), role: 'assistant', body: 'New conversation ready. Ask about a holding, belief, or catalyst.', createdAt: nowIso() }]
      };
      uiState.chat.threads.unshift(thread);
      uiState.chat.activeThreadId = thread.id;
      saveUiState();
      renderAll();
    };
  }

  el('open-settings').onclick = () => openSettings(true);
  el('close-settings').onclick = () => openSettings(false);
  el('settings-modal').querySelectorAll('[data-close-settings]').forEach((node) => {
    node.onclick = () => openSettings(false);
  });

  const settingsForm = el('settings-form');
  if (settingsForm) {
    settingsForm.displayName.value = uiState.settings.displayName;
    settingsForm.notifications.checked = uiState.settings.notifications;
    settingsForm.priceAlerts.checked = uiState.settings.priceAlerts;
    settingsForm.ipoAlerts.checked = uiState.settings.ipoAlerts;
    settingsForm.compactMode.checked = uiState.settings.compactMode;
    settingsForm.onsubmit = (event) => {
      event.preventDefault();
      const form = new FormData(settingsForm);
      uiState.settings = {
        displayName: String(form.get('displayName') || 'Open Advisor'),
        notifications: form.get('notifications') === 'on',
        priceAlerts: form.get('priceAlerts') === 'on',
        ipoAlerts: form.get('ipoAlerts') === 'on',
        compactMode: form.get('compactMode') === 'on'
      };
      saveUiState();
      openSettings(false);
      renderAll();
    };
  }

  el('reset-data').onclick = async () => {
    uiState = loadUiState();
    await post('/v1/reset');
    await refreshState();
    openSettings(false);
  };
}

function openSettings(open) {
  const modal = el('settings-modal');
  modal.classList.toggle('hidden', !open);
  modal.setAttribute('aria-hidden', open ? 'false' : 'true');
}

uiState = loadUiState();
refreshState().catch((error) => {
  el('status-label').textContent = 'API unavailable';
  el('view-dashboard').innerHTML = `<section class="stitch-page-title"><div class="eyebrow">Load failure</div><h2 class="stitch-page-title__heading">Open Advisor could not initialize.</h2><p class="stitch-page-title__copy">${error.message}</p></section>`;
});
