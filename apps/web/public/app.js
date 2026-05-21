const apiBase = `${window.location.protocol}//${window.location.hostname}:3001`;
const navItems = [
  { id: 'home', label: 'Home', title: 'Today’s brief', subtitle: 'A calm summary of what changed, what matters soon, and what deserves closer review.' },
  { id: 'watchlists', label: 'Watchlists', title: 'Holdings & watchlists', subtitle: 'Organize what you own, what you track, and the assets surrounding your current focus.' },
  { id: 'discover', label: 'Discover', title: 'Theme discovery', subtitle: 'Explore beliefs, themes, and connected instruments with clear relevance and context.' },
  { id: 'reminders', label: 'Reminders', title: 'Reminders & catalysts', subtitle: 'Keep upcoming events, follow-ups, and review prompts attached to your process.' },
  { id: 'research', label: 'Research', title: 'Research detail', subtitle: 'Separate source facts, AI synthesis, why it matters, and next checks in a trustworthy workspace.' }
];
const demoStorageKey = 'openAdvisorDemoState';
let state = null;
let currentView = 'home';
let isDemoMode = false;

const nav = document.getElementById('nav');
const mobileNav = document.getElementById('mobile-nav');
const digestSummary = document.getElementById('digest-summary');
const workspaceTitle = document.getElementById('workspace-title');
const workspaceSubtitle = document.getElementById('workspace-subtitle');

function el(id) {
  return document.getElementById(id);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function renderNav() {
  const html = navItems
    .map(
      (item) => `
      <button class="nav-item ${currentView === item.id ? 'active' : ''}" data-view="${item.id}">
        ${item.label}
      </button>`
    )
    .join('');

  nav.innerHTML = html;
  mobileNav.innerHTML = navItems
    .map(
      (item) => `
      <button class="mobile-nav__item ${currentView === item.id ? 'active' : ''}" data-view="${item.id}">
        ${item.label}
      </button>`
    )
    .join('');

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
}

function setView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach((section) => section.classList.remove('active-view'));
  el(`view-${view}`).classList.add('active-view');
  const meta = navItems.find((item) => item.id === view);
  workspaceTitle.textContent = meta.title;
  workspaceSubtitle.textContent = meta.subtitle + (isDemoMode ? ' Demo mode is active on Pages.' : '');
  renderNav();
}

function card(title, content) {
  return `<div class="card"><div class="section-title">${title}</div>${content}</div>`;
}

function list(items, renderItem, empty = 'No items yet.') {
  if (!items.length) return `<div class="empty">${empty}</div>`;
  return `<ul class="list">${items.map((item) => `<li class="list-item">${renderItem(item)}</li>`).join('')}</ul>`;
}

function assetById(id) {
  return state.assets.find((asset) => asset.id === id);
}

function thesisById(id) {
  return state.theses.find((thesis) => thesis.id === id);
}

function notesFor(targetType, targetId) {
  return state.notes.filter((note) => note.targetType === targetType && note.targetId === targetId);
}

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function sortByDate(items, key) {
  return [...items].sort((a, b) => new Date(a[key] || 0) - new Date(b[key] || 0));
}

function badgeClass(type) {
  if (type === 'earnings' || type === 'filing') return 'warn';
  if (type === 'news' || type === 'thesis_update') return 'good';
  return '';
}

function deriveState(base) {
  const next = clone(base);
  const assetMap = new Map(next.assets.map((asset) => [asset.id, asset]));
  const pendingAlerts = sortByDate(next.alerts.filter((item) => item.state === 'pending'), 'scheduledFor').slice(0, 5);
  const mattersSoon = sortByDate(next.catalysts, 'scheduledFor').slice(0, 5).map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    whyItMatters: item.whyItMatters,
    confidence: item.confidence,
    asset: item.assetId ? assetMap.get(item.assetId) : null,
    thesis: item.thesisId ? thesisById(item.thesisId) : null,
    scheduledFor: item.scheduledFor,
    sourceLabel: item.sourceLabel || 'System'
  }));
  const liveNews = next.catalysts
    .filter((item) => item.type === 'news' || item.type === 'thesis_update')
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.title,
      whyItMatters: item.whyItMatters,
      sourceLabel: item.sourceLabel || 'System'
    }));

  next.calendar = sortByDate(next.catalysts, 'scheduledFor').map((item) => ({
    ...item,
    asset: item.assetId ? assetMap.get(item.assetId) : null,
    thesis: item.thesisId ? next.theses.find((thesis) => thesis.id === item.thesisId) : null
  }));

  next.digest = {
    date: new Date().toISOString().slice(0, 10),
    summary: `${mattersSoon.length} catalysts and ${pendingAlerts.length} pending alerts across ${next.theses.filter((item) => item.status === 'active').length} active theses.`,
    mattersSoon,
    liveNews,
    pendingAlerts,
    researchSuggestions: next.theses.slice(0, 3).map((thesis) => ({
      thesisId: thesis.id,
      prompt: `What changed in the ${thesis.title} thesis over the last 7 days?`
    }))
  };

  return next;
}

function saveDemoState(nextState) {
  localStorage.setItem(demoStorageKey, JSON.stringify(nextState));
}

function loadStoredDemoState() {
  const raw = localStorage.getItem(demoStorageKey);
  return raw ? JSON.parse(raw) : null;
}

function demoEnsureAsset(draft, input) {
  if (input.assetId) {
    const existing = draft.assets.find((item) => item.id === input.assetId);
    if (existing) return existing;
  }
  if (input.symbol) {
    const existing = draft.assets.find((item) => item.symbol && item.symbol.toLowerCase() === String(input.symbol).toLowerCase());
    if (existing) return existing;
  }
  const asset = {
    id: makeId('asset'),
    symbol: input.symbol || null,
    name: input.name || input.symbol || 'Unnamed Asset',
    assetType: input.assetType || 'equity'
  };
  draft.assets.push(asset);
  return asset;
}

function deleteById(items, id) {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) items.splice(index, 1);
}

async function loadBootstrap() {
  try {
    const res = await fetch(`${apiBase}/v1/bootstrap`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    isDemoMode = false;
    return await res.json();
  } catch (error) {
    isDemoMode = true;
    const stored = loadStoredDemoState();
    if (stored) return deriveState(stored);
    const fallback = await fetch('./demo-bootstrap.json');
    if (!fallback.ok) throw error;
    const data = await fallback.json();
    saveDemoState(data);
    return data;
  }
}

function mutateDemo(path, body = {}, method = 'POST') {
  const draft = clone(state);

  if (path === '/v1/reset') {
    localStorage.removeItem(demoStorageKey);
    return loadBootstrap();
  }

  if (path === '/v1/holdings' && method === 'POST') {
    const asset = demoEnsureAsset(draft, body);
    draft.holdings.push({ id: makeId('holding'), assetId: asset.id, quantity: Number(body.quantity || 0), costBasis: body.costBasis ? Number(body.costBasis) : null, sourceType: body.sourceType || 'manual' });
  } else if (path.startsWith('/v1/holdings/') && method === 'DELETE') {
    deleteById(draft.holdings, path.split('/').pop());
  } else if (path === '/v1/watchlists' && method === 'POST') {
    const watchlist = { id: makeId('watchlist'), name: body.name || 'Untitled Watchlist', description: body.description || '', itemAssetIds: [] };
    for (const item of body.items || []) {
      const asset = demoEnsureAsset(draft, item);
      watchlist.itemAssetIds.push(asset.id);
    }
    draft.watchlists.push(watchlist);
  } else if (path.startsWith('/v1/watchlists/') && method === 'DELETE') {
    deleteById(draft.watchlists, path.split('/').pop());
  } else if (path === '/v1/theses' && method === 'POST') {
    const thesis = { id: makeId('thesis'), title: body.title || 'Untitled Thesis', status: body.status || 'active', summary: body.summary || '', rationale: body.rationale || '', notes: body.notes || '', assetIds: [] };
    for (const item of body.assets || []) {
      const asset = demoEnsureAsset(draft, item);
      thesis.assetIds.push(asset.id);
    }
    draft.theses.push(thesis);
  } else if (path.startsWith('/v1/theses/') && method === 'DELETE') {
    const id = path.split('/').pop();
    deleteById(draft.theses, id);
    draft.catalysts = draft.catalysts.filter((item) => item.thesisId !== id);
    draft.alerts = draft.alerts.filter((item) => item.thesisId !== id);
    draft.researchRuns = draft.researchRuns.filter((item) => item.targetId !== id);
    draft.notes = draft.notes.filter((item) => !(item.targetType === 'thesis' && item.targetId === id));
  } else if (path === '/v1/catalysts' && method === 'POST') {
    const asset = body.assetId || body.symbol || body.name ? demoEnsureAsset(draft, body) : null;
    const catalyst = { id: makeId('catalyst'), type: body.type || 'custom', title: body.title || 'Untitled Catalyst', scheduledFor: body.scheduledFor || new Date().toISOString(), assetId: asset ? asset.id : null, thesisId: body.thesisId || null, whyItMatters: body.whyItMatters || '', confidence: body.confidence != null ? Number(body.confidence) : 0.5, sourceLabel: body.sourceLabel || 'User' };
    draft.catalysts.push(catalyst);
    if (body.createAlert) {
      draft.alerts.push({ id: makeId('alert'), title: body.alertTitle || `Review: ${catalyst.title}`, state: 'pending', scheduledFor: body.alertScheduledFor || catalyst.scheduledFor, catalystId: catalyst.id, assetId: catalyst.assetId, thesisId: catalyst.thesisId, message: body.alertMessage || catalyst.whyItMatters });
    }
  } else if (path.startsWith('/v1/catalysts/') && method === 'DELETE') {
    const id = path.split('/').pop();
    deleteById(draft.catalysts, id);
    draft.alerts = draft.alerts.filter((item) => item.catalystId !== id);
    draft.notes = draft.notes.filter((item) => !(item.targetType === 'catalyst' && item.targetId === id));
  } else if (path === '/v1/alerts' && method === 'POST') {
    draft.alerts.push({ id: makeId('alert'), title: body.title || 'Untitled Alert', state: body.state || 'pending', scheduledFor: body.scheduledFor || new Date().toISOString(), catalystId: body.catalystId || null, assetId: body.assetId || null, thesisId: body.thesisId || null, message: body.message || '' });
  } else if (path.match(/^\/v1\/alerts\/[^/]+\/seen$/) && method === 'POST') {
    const id = path.split('/')[3];
    const alert = draft.alerts.find((item) => item.id === id);
    if (alert) alert.state = 'seen';
  } else if (path.match(/^\/v1\/alerts\/[^/]+\/snooze$/) && method === 'POST') {
    const id = path.split('/')[3];
    const alert = draft.alerts.find((item) => item.id === id);
    if (alert) {
      alert.state = 'snoozed';
      alert.snoozedUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    }
  } else if (path.startsWith('/v1/alerts/') && method === 'DELETE') {
    deleteById(draft.alerts, path.split('/').pop());
  } else if (path === '/v1/research-runs' && method === 'POST') {
    draft.researchRuns.unshift({ id: makeId('research'), scope: body.scope || 'custom', targetId: body.targetId || null, question: body.question || 'Untitled research question', status: 'completed', summary: body.summary || 'Demo research sweep created in-browser.', body: body.body || `This demo sweep focused on: ${body.question || 'custom research question'}.`, createdAt: new Date().toISOString() });
  } else if (path.startsWith('/v1/research-runs/') && method === 'DELETE') {
    const id = path.split('/').pop();
    deleteById(draft.researchRuns, id);
    draft.notes = draft.notes.filter((item) => !(item.targetType === 'research_run' && item.targetId === id));
  } else if (path === '/v1/notes' && method === 'POST') {
    draft.notes.unshift({ id: makeId('note'), targetType: body.targetType || 'thesis', targetId: body.targetId || null, body: body.body || '', createdAt: new Date().toISOString() });
  } else if (path.startsWith('/v1/notes/') && method === 'DELETE') {
    deleteById(draft.notes, path.split('/').pop());
  }

  const derived = deriveState(draft);
  saveDemoState(derived);
  return Promise.resolve(derived);
}

async function post(path, body) {
  if (isDemoMode) return mutateDemo(path, body, 'POST');
  return fetch(`${apiBase}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then((res) => res.json());
}

async function del(path) {
  if (isDemoMode) return mutateDemo(path, {}, 'DELETE');
  return fetch(`${apiBase}${path}`, { method: 'DELETE' }).then((res) => res.json());
}

async function refreshState() {
  state = await loadBootstrap();
  digestSummary.textContent = state.digest.summary + (isDemoMode ? ' Demo mode.' : '');
  el('stat-holdings').textContent = state.holdings.length;
  el('stat-theses').textContent = state.theses.filter((item) => item.status === 'active').length;
  el('stat-catalysts').textContent = state.calendar.length;
  el('stat-alerts').textContent = state.alerts.filter((item) => item.state === 'pending').length;
  renderAll();
}

function noteListHtml(targetType, targetId) {
  const notes = notesFor(targetType, targetId);
  return list(notes, (note) => `
    <div class="item-sub">${note.body}</div>
    <div class="meta-row">${new Date(note.createdAt).toLocaleString()}</div>
    <div class="action-row"><button class="secondary small delete-note" data-id="${note.id}">Delete note</button></div>
  `, 'No notes yet.');
}

function renderHome() {
  const urgent = state.digest.mattersSoon.filter((item) => item.type === 'earnings' || item.type === 'filing');
  const followUps = state.digest.pendingAlerts || [];
  const quiet = state.digest.liveNews || [];

  el('view-home').innerHTML = `
    <div class="grid two-up">
      ${card('Today’s critical developments', list(urgent, (item) => `
        <div class="item-row">
          <div>
            <div class="item-title">${item.title}</div>
            <div class="item-sub">${item.asset?.symbol || 'Theme-linked'} · ${new Date(item.scheduledFor).toLocaleString()}</div>
          </div>
          <span class="badge ${badgeClass(item.type)}">${item.type}</span>
        </div>
        <div class="detail-panel">
          <h4>Why this matters</h4>
          <div class="detail-copy">${item.whyItMatters}</div>
          <div class="facts-grid">
            <span class="chip">Confidence ${Math.round((item.confidence || 0) * 100)}%</span>
            <span class="chip warn">Source ${item.sourceLabel || 'System'}</span>
          </div>
        </div>
      `, 'No urgent developments.'))}
      ${card('Digest preview', `
        <div class="memo-block">
          <h4>Morning brief</h4>
          <div class="detail-copy">${state.digest.summary}</div>
        </div>
        ${list(state.digest.mattersSoon.slice(0, 3), (item) => `
          <div class="item-title">${item.title}</div>
          <div class="item-sub">${item.whyItMatters}</div>
        `, 'No brief items yet.')}
      `)}
    </div>
    <div class="grid two-up">
      ${card('Follow-ups I asked not to miss', list(followUps, (item) => `
        <div class="item-row">
          <div>
            <div class="item-title">${item.title}</div>
            <div class="item-sub">${item.message || 'Review requested'}</div>
          </div>
          <span class="badge alert">${item.state}</span>
        </div>
        <div class="action-row">
          <button class="small mark-seen" data-alert-id="${item.id}">Reviewed</button>
          <button class="secondary small snooze-alert" data-alert-id="${item.id}">Snooze</button>
        </div>
      `, 'No follow-ups pending.'))}
      ${card('Quiet but important', list(quiet, (item) => `
        <div class="item-title">${item.title}</div>
        <div class="item-sub">${item.whyItMatters}</div>
        <div class="meta-row">Source ${item.sourceLabel || 'System'}</div>
      `, 'No quiet-but-important items yet.'))}
    </div>
    <div class="grid two-up">
      ${card('Needs review this week', list(state.calendar.slice(0, 4), (item) => `
        <div class="item-row">
          <span class="item-title">${item.title}</span>
          <span class="badge ${badgeClass(item.type)}">${item.type}</span>
        </div>
        <div class="item-sub">${item.thesis?.title || item.asset?.symbol || 'Unlinked'} · ${new Date(item.scheduledFor).toLocaleString()}</div>
      `, 'No review items.'))}
      ${card('Theme-related discoveries', list(state.theses.slice(0, 3), (item) => `
        <div class="item-title">${item.title}</div>
        <div class="item-sub">${item.summary}</div>
        <div class="action-row"><button class="small quick-research" data-thesis-id="${item.id}" data-question="What changed in the ${item.title} thesis over the last 7 days?">Research this</button></div>
      `, 'No discovery themes yet.'))}
    </div>
  `;
}

function renderWatchlists() {
  const holdings = list(state.holdings, (holding) => {
    const asset = assetById(holding.assetId);
    const linkedTheses = state.theses.filter((thesis) => (thesis.assetIds || []).includes(holding.assetId));
    return `
      <div class="item-row">
        <div>
          <div class="item-title">${asset.symbol}</div>
          <div class="item-sub">${asset.name} · Owned · Qty ${holding.quantity}${holding.costBasis ? ` · Cost basis ${holding.costBasis}` : ''}</div>
        </div>
        <span class="badge good">Owned</span>
      </div>
      <div class="facts-grid">
        ${linkedTheses.map((thesis) => `<span class="chip">${thesis.title}</span>`).join('') || '<span class="chip">No linked thesis</span>'}
      </div>
      <div class="action-row"><button class="secondary small delete-holding" data-id="${holding.id}">Delete</button></div>
    `;
  }, 'No holdings yet.');

  const watchlists = list(state.watchlists, (watchlist) => `
    <div class="item-row">
      <div>
        <div class="item-title">${watchlist.name}</div>
        <div class="item-sub">${watchlist.description || 'No description'} </div>
      </div>
      <span class="badge">Tracked</span>
    </div>
    <div class="facts-grid">
      ${(watchlist.itemAssetIds || []).map((id) => `<span class="chip warn">${assetById(id)?.symbol || '—'}</span>`).join('') || '<span class="chip">No items</span>'}
    </div>
    <div class="action-row"><button class="secondary small delete-watchlist" data-id="${watchlist.id}">Delete</button></div>
  `, 'No watchlists yet.');

  el('view-watchlists').innerHTML = `
    <div class="grid two-up">
      ${card('Owned positions', holdings)}
      ${card('Tracked watchlists', watchlists)}
    </div>
    <div class="grid two-up">
      ${card('Add holding', `<form id="holding-form" class="form-grid">
        <input name="symbol" placeholder="Symbol (e.g. TSM)" required />
        <input name="name" placeholder="Name" />
        <input name="quantity" placeholder="Quantity" type="number" step="any" required />
        <input name="costBasis" placeholder="Cost basis" type="number" step="any" />
        <button type="submit">Add holding</button>
      </form>`)}
      ${card('Create watchlist', `<form id="watchlist-form" class="form-grid">
        <input name="name" placeholder="Watchlist name" required />
        <input name="description" placeholder="Description" />
        <input name="symbols" placeholder="Symbols comma-separated" />
        <button type="submit">Create watchlist</button>
      </form>`)}
    </div>
  `;
}

function renderDiscover() {
  const theses = list(state.theses, (thesis) => `
    <div class="item-row">
      <div>
        <div class="item-title">${thesis.title}</div>
        <div class="item-sub">${thesis.summary}</div>
      </div>
      <span class="badge ${thesis.status === 'active' ? 'good' : ''}">${thesis.status}</span>
    </div>
    <div class="memo-block">
      <h4>Why this matters</h4>
      <div class="detail-copy">${thesis.rationale || 'Add thesis rationale.'}</div>
    </div>
    <div class="facts-grid">
      ${(thesis.assetIds || []).map((id) => `<span class="chip">${assetById(id)?.symbol || '—'}</span>`).join('') || '<span class="chip">No linked assets</span>'}
    </div>
    <div class="nested-card">
      <div class="mini-title">User notes</div>
      ${noteListHtml('thesis', thesis.id)}
      <form class="form-grid note-form" data-target-type="thesis" data-target-id="${thesis.id}">
        <textarea name="body" placeholder="Add a thesis note"></textarea>
        <button type="submit">Save note</button>
      </form>
    </div>
    <div class="action-row">
      <button class="small quick-research" data-thesis-id="${thesis.id}" data-question="What changed in the ${thesis.title} thesis over the last 7 days?">Run research</button>
      <button class="secondary small delete-thesis" data-id="${thesis.id}">Delete thesis</button>
    </div>
  `, 'No theses yet.');

  const discoveryExamples = `
    <div class="memo-block">
      <h4>Example discovery prompt</h4>
      <div class="detail-copy">AI power infrastructure → NVDA, VRT, XLU, cooling names, utility capex, relevant ETF exposure, and adjacent filings or launches.</div>
    </div>
    <div class="facts-grid">
      <span class="chip">Equities</span>
      <span class="chip warn">ETFs</span>
      <span class="chip good">Listings / IPOs</span>
    </div>
  `;

  el('view-discover').innerHTML = `
    <div class="grid two-up">
      ${card('Tracked themes & beliefs', theses)}
      ${card('Theme discovery workspace', `${discoveryExamples}<form id="thesis-form" class="form-grid">
        <input name="title" placeholder="Thesis title" required />
        <textarea name="summary" placeholder="Summary"></textarea>
        <textarea name="rationale" placeholder="Why this thesis matters"></textarea>
        <textarea name="notes" placeholder="Working notes"></textarea>
        <input name="symbols" placeholder="Linked symbols comma-separated" />
        <button type="submit">Create thesis</button>
      </form>`)}
    </div>
  `;
}

function renderReminders() {
  const alerts = list(state.alerts, (item) => `
    <div class="item-row">
      <div>
        <div class="item-title">${item.title}</div>
        <div class="item-sub">${item.message || 'Review reminder'} · ${new Date(item.scheduledFor).toLocaleString()}</div>
      </div>
      <span class="badge ${item.state === 'pending' ? 'alert' : ''}">${item.state}</span>
    </div>
    <div class="action-row">
      <button class="small mark-seen" data-alert-id="${item.id}">Mark reviewed</button>
      <button class="secondary small snooze-alert" data-alert-id="${item.id}">Snooze</button>
      <button class="secondary small delete-alert" data-id="${item.id}">Delete</button>
    </div>
  `, 'No reminders yet.');

  const catalysts = list(state.calendar, (item) => `
    <div class="item-row">
      <div>
        <div class="item-title">${item.title}</div>
        <div class="item-sub">${new Date(item.scheduledFor).toLocaleString()} · ${item.thesis?.title || item.asset?.symbol || 'Unlinked'}</div>
      </div>
      <span class="badge ${badgeClass(item.type)}">${item.type}</span>
    </div>
    <div class="detail-panel">
      <h4>What to check next</h4>
      <div class="detail-copy">${item.whyItMatters}</div>
      <div class="facts-grid">
        <span class="chip">Confidence ${Math.round((item.confidence || 0) * 100)}%</span>
        <span class="chip warn">Source ${item.sourceLabel || 'System'}</span>
      </div>
    </div>
    <div class="action-row">
      <button class="secondary small create-alert-from-catalyst" data-catalyst-id="${item.id}" data-title="Review: ${item.title}">Create follow-up</button>
      <button class="secondary small delete-catalyst" data-id="${item.id}">Delete</button>
    </div>
    <div class="nested-card">
      <div class="mini-title">Notes</div>
      ${noteListHtml('catalyst', item.id)}
      <form class="form-grid note-form" data-target-type="catalyst" data-target-id="${item.id}">
        <textarea name="body" placeholder="Add a catalyst note"></textarea>
        <button type="submit">Save note</button>
      </form>
    </div>
  `, 'No catalysts yet.');

  el('view-reminders').innerHTML = `
    <div class="grid two-up">
      ${card('Reminders & follow-ups', alerts)}
      ${card('Catalyst calendar', catalysts)}
    </div>
    <div class="grid one-up">
      ${card('Create reminder-linked catalyst', `<form id="catalyst-form" class="form-grid">
        <input name="title" placeholder="Catalyst title" required />
        <input name="symbol" placeholder="Symbol" />
        <select name="thesisId"><option value="">No linked thesis</option>${state.theses.map((thesis) => `<option value="${thesis.id}">${thesis.title}</option>`).join('')}</select>
        <select name="type">
          <option value="earnings">earnings</option>
          <option value="filing">filing</option>
          <option value="news">news</option>
          <option value="macro">macro</option>
          <option value="thesis_update">thesis_update</option>
          <option value="custom">custom</option>
        </select>
        <input name="scheduledFor" type="datetime-local" required />
        <textarea name="whyItMatters" placeholder="Why it matters"></textarea>
        <input name="sourceLabel" placeholder="Source label" />
        <label class="checkbox-row"><input type="checkbox" name="createAlert" /> Create reminder at the same time</label>
        <textarea name="alertMessage" placeholder="Reminder message (optional)"></textarea>
        <button type="submit">Add catalyst</button>
      </form>`)}
    </div>
  `;
}

function renderResearch() {
  const runs = list(state.researchRuns, (run) => {
    const thesis = thesisById(run.targetId);
    return `
      <div class="item-row">
        <div>
          <div class="item-title">${run.question}</div>
          <div class="item-sub">${thesis ? thesis.title : run.scope} · ${run.summary}</div>
        </div>
        <span class="badge good">${run.status}</span>
      </div>
      <div class="grid two-up">
        <div class="memo-block">
          <h4>Confirmed facts</h4>
          <div class="detail-copy">Source-linked catalyst and watchlist context should live here. For now, this demo uses persisted local data and research notes.</div>
        </div>
        <div class="memo-block">
          <h4>AI synthesis / context</h4>
          <div class="detail-copy">${run.body || 'No synthesis yet.'}</div>
        </div>
      </div>
      <div class="grid two-up">
        <div class="detail-panel">
          <h4>Why this matters</h4>
          <div class="detail-copy">Tie the research result back to the current thesis, upcoming catalysts, and owned or tracked assets.</div>
        </div>
        <div class="detail-panel">
          <h4>What to check next</h4>
          <div class="detail-copy">Look for confirm/disconfirm signals, valuation implications, and whether a reminder or follow-up catalyst should be created.</div>
        </div>
      </div>
      <div class="nested-card">
        <div class="mini-title">User notes</div>
        ${noteListHtml('research_run', run.id)}
        <form class="form-grid note-form" data-target-type="research_run" data-target-id="${run.id}">
          <textarea name="body" placeholder="Add a research note"></textarea>
          <button type="submit">Save note</button>
        </form>
      </div>
      <div class="action-row">
        <button class="secondary small delete-research" data-id="${run.id}">Delete run</button>
      </div>
    `;
  }, 'No research runs yet.');

  el('view-research').innerHTML = `
    <div class="grid one-up">
      ${card('Research detail', runs)}
      ${card('Run targeted sweep', `<form id="research-form" class="form-grid">
        <select name="scope">
          <option value="thesis">thesis</option>
          <option value="asset">asset</option>
          <option value="custom">custom</option>
        </select>
        <select name="targetId"><option value="">No linked thesis</option>${state.theses.map((thesis) => `<option value="${thesis.id}">${thesis.title}</option>`).join('')}</select>
        <textarea name="question" placeholder="What changed in this thesis over the last 7 days?" required></textarea>
        <textarea name="summary" placeholder="Short answer / summary"></textarea>
        <textarea name="body" placeholder="Longer research output"></textarea>
        <button type="submit">Create research run</button>
      </form>`)}
    </div>
  `;
}

function renderAll() {
  renderNav();
  renderHome();
  renderWatchlists();
  renderDiscover();
  renderReminders();
  renderResearch();
  bindActions();
  setView(currentView);
}

function parseSymbols(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((symbol) => ({ symbol, name: symbol, assetType: 'equity' }));
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
  const resetButton = el('reset-data');
  if (resetButton) {
    resetButton.onclick = async () => {
      await post('/v1/reset');
      await refreshState();
    };
  }

  document.querySelectorAll('.hero-actions [data-view], .workspace-quick-actions [data-view]').forEach((button) => {
    button.onclick = () => setView(button.dataset.view);
  });

  document.querySelectorAll('.mark-seen').forEach((button) => {
    button.onclick = async () => {
      await post(`/v1/alerts/${button.dataset.alertId}/seen`);
      await refreshState();
    };
  });

  document.querySelectorAll('.snooze-alert').forEach((button) => {
    button.onclick = async () => {
      await post(`/v1/alerts/${button.dataset.alertId}/snooze`, {});
      await refreshState();
    };
  });

  document.querySelectorAll('.quick-research').forEach((button) => {
    button.onclick = async () => {
      await post('/v1/research-runs', {
        scope: 'thesis',
        targetId: button.dataset.thesisId,
        question: button.dataset.question,
        summary: 'Quick sweep created from digest suggestion.',
        body: 'This is a lightweight placeholder for an integrated research pipeline. Replace with live provider output next.'
      });
      currentView = 'research';
      await refreshState();
    };
  });

  document.querySelectorAll('.create-alert-from-catalyst').forEach((button) => {
    button.onclick = async () => {
      const catalyst = state.catalysts.find((item) => item.id === button.dataset.catalystId);
      await post('/v1/alerts', {
        title: button.dataset.title,
        scheduledFor: catalyst?.scheduledFor,
        catalystId: catalyst?.id,
        assetId: catalyst?.assetId,
        thesisId: catalyst?.thesisId,
        message: catalyst?.whyItMatters
      });
      await refreshState();
    };
  });

  document.querySelectorAll('.note-form').forEach((form) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const body = Object.fromEntries(data.entries());
      await post('/v1/notes', { targetType: form.dataset.targetType, targetId: form.dataset.targetId, body: body.body });
      form.reset();
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

  const thesisForm = el('thesis-form');
  if (thesisForm) {
    thesisForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(thesisForm);
      const body = Object.fromEntries(form.entries());
      body.assets = parseSymbols(body.symbols);
      await post('/v1/theses', body);
      thesisForm.reset();
      await refreshState();
    };
  }

  const catalystForm = el('catalyst-form');
  if (catalystForm) {
    catalystForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(catalystForm);
      const body = Object.fromEntries(form.entries());
      if (body.scheduledFor) body.scheduledFor = new Date(body.scheduledFor).toISOString();
      body.createAlert = body.createAlert === 'on';
      await post('/v1/catalysts', body);
      catalystForm.reset();
      await refreshState();
    };
  }

  const researchForm = el('research-form');
  if (researchForm) {
    researchForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(researchForm);
      await post('/v1/research-runs', Object.fromEntries(form.entries()));
      researchForm.reset();
      await refreshState();
    };
  }

  bindDelete('.delete-holding', (id) => `/v1/holdings/${id}`);
  bindDelete('.delete-watchlist', (id) => `/v1/watchlists/${id}`);
  bindDelete('.delete-thesis', (id) => `/v1/theses/${id}`);
  bindDelete('.delete-catalyst', (id) => `/v1/catalysts/${id}`);
  bindDelete('.delete-alert', (id) => `/v1/alerts/${id}`);
  bindDelete('.delete-research', (id) => `/v1/research-runs/${id}`);
  bindDelete('.delete-note', (id) => `/v1/notes/${id}`);
}

refreshState().catch((error) => {
  digestSummary.textContent = `Failed to load app data: ${error.message}`;
});
