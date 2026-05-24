const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const defaultState = require('./default-state');

const dataDir = path.join(__dirname, '..', '..', '..', 'data');
const dataFile = path.join(dataDir, 'app-state.sqlite');
const legacyJsonFile = path.join(dataDir, 'app-state.json');

let db;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function getDb() {
  if (db) return db;
  ensureDataDir();
  db = new DatabaseSync(dataFile);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  initSchema(db);
  ensureSeeded(db);
  return db;
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_user (
      id TEXT PRIMARY KEY,
      name TEXT,
      timezone TEXT,
      digest_cadence TEXT,
      research_policy_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS source_adapters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tier TEXT,
      status TEXT,
      last_synced_at TEXT,
      coverage TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      symbol TEXT,
      name TEXT NOT NULL,
      asset_type TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS holdings (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      cost_basis REAL,
      source_type TEXT,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watchlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS watchlist_items (
      id TEXT PRIMARY KEY,
      watchlist_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT,
      summary TEXT,
      hypothesis TEXT,
      monitoring_plan TEXT
    );

    CREATE TABLE IF NOT EXISTS theme_asset_links (
      id TEXT PRIMARY KEY,
      theme_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS canonical_events (
      id TEXT PRIMARY KEY,
      event_type TEXT,
      title TEXT NOT NULL,
      factual_summary TEXT,
      recorded_at TEXT,
      scheduled_for TEXT,
      asset_id TEXT,
      theme_id TEXT,
      source_adapter_id TEXT,
      source_label TEXT,
      source_tier TEXT,
      importance TEXT,
      truth_status TEXT,
      market_context_json TEXT NOT NULL DEFAULT '{}',
      realtime_meta_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
      FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE SET NULL,
      FOREIGN KEY (source_adapter_id) REFERENCES source_adapters(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inbox_items (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      state TEXT,
      priority TEXT,
      score REAL,
      reason TEXT,
      next_step TEXT,
      created_at TEXT,
      updated_at TEXT,
      delivery_kind TEXT,
      suggestion_type TEXT,
      dedupe_key TEXT,
      explanation_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (event_id) REFERENCES canonical_events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      state TEXT,
      due_at TEXT,
      related_type TEXT,
      related_id TEXT,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS digests (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      item_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS delivery_queue (
      id TEXT PRIMARY KEY,
      target_type TEXT,
      target_id TEXT,
      channel TEXT,
      status TEXT,
      queued_at TEXT,
      delivered_at TEXT,
      reason TEXT,
      priority TEXT
    );

    CREATE TABLE IF NOT EXISTS research_jobs (
      id TEXT PRIMARY KEY,
      status TEXT,
      mode TEXT,
      trigger_type TEXT,
      target_type TEXT,
      target_id TEXT,
      related_event_id TEXT,
      question TEXT,
      created_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (related_event_id) REFERENCES canonical_events(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS research_reports (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      related_event_id TEXT,
      title TEXT,
      summary TEXT,
      next_check TEXT,
      confidence REAL,
      freshness_at TEXT,
      expires_at TEXT,
      inference_provider TEXT,
      created_at TEXT,
      FOREIGN KEY (job_id) REFERENCES research_jobs(id) ON DELETE CASCADE,
      FOREIGN KEY (related_event_id) REFERENCES canonical_events(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS research_sources (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      title TEXT,
      url TEXT,
      publisher TEXT,
      tier TEXT,
      published_at TEXT,
      FOREIGN KEY (report_id) REFERENCES research_reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS research_claims (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      claim TEXT,
      confidence REAL,
      supported_by_source_ids_json TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (report_id) REFERENCES research_reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS event_enrichments (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      report_id TEXT NOT NULL,
      summary TEXT,
      confidence REAL,
      freshness_at TEXT,
      expires_at TEXT,
      FOREIGN KEY (event_id) REFERENCES canonical_events(id) ON DELETE CASCADE,
      FOREIGN KEY (report_id) REFERENCES research_reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      target_type TEXT,
      target_id TEXT,
      body TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT,
      entity_type TEXT,
      entity_id TEXT,
      summary TEXT,
      created_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);
    CREATE INDEX IF NOT EXISTS idx_holdings_asset_id ON holdings(asset_id);
    CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist_id ON watchlist_items(watchlist_id);
    CREATE INDEX IF NOT EXISTS idx_theme_asset_links_theme_id ON theme_asset_links(theme_id);
    CREATE INDEX IF NOT EXISTS idx_canonical_events_recorded_at ON canonical_events(recorded_at);
    CREATE INDEX IF NOT EXISTS idx_inbox_items_created_at ON inbox_items(created_at);
    CREATE INDEX IF NOT EXISTS idx_delivery_queue_status ON delivery_queue(status);
    CREATE INDEX IF NOT EXISTS idx_research_jobs_created_at ON research_jobs(created_at);
    CREATE INDEX IF NOT EXISTS idx_notes_target ON notes(target_type, target_id);
  `);
}

function ensureSeeded(database) {
  const row = database.prepare('SELECT COUNT(*) AS count FROM assets').get();
  if (Number(row.count) > 0) return;

  let seed = defaultState;
  if (fs.existsSync(legacyJsonFile)) {
    try {
      seed = JSON.parse(fs.readFileSync(legacyJsonFile, 'utf8'));
    } catch {
      seed = defaultState;
    }
  }
  persistState(database, clone(seed));
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function clearAll(database) {
  database.exec(`
    DELETE FROM audit_log;
    DELETE FROM notes;
    DELETE FROM event_enrichments;
    DELETE FROM research_claims;
    DELETE FROM research_sources;
    DELETE FROM research_reports;
    DELETE FROM research_jobs;
    DELETE FROM delivery_queue;
    DELETE FROM digests;
    DELETE FROM reminders;
    DELETE FROM inbox_items;
    DELETE FROM canonical_events;
    DELETE FROM theme_asset_links;
    DELETE FROM themes;
    DELETE FROM watchlist_items;
    DELETE FROM watchlists;
    DELETE FROM holdings;
    DELETE FROM assets;
    DELETE FROM source_adapters;
    DELETE FROM app_user;
  `);
}

function persistState(database, state) {
  database.exec('BEGIN');
  try {
    clearAll(database);

    const insertUser = database.prepare(`INSERT INTO app_user (id, name, timezone, digest_cadence, research_policy_json) VALUES (?, ?, ?, ?, ?)`);
    if (state.user) {
      insertUser.run(
        state.user.id,
        state.user.name || null,
        state.user.timezone || 'UTC',
        state.user.digestCadence || null,
        JSON.stringify(state.user.researchPolicy || {})
      );
    }

    const insertSourceAdapter = database.prepare(`INSERT INTO source_adapters (id, name, tier, status, last_synced_at, coverage, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const adapter of state.sourceAdapters || []) {
      insertSourceAdapter.run(adapter.id, adapter.name, adapter.tier || null, adapter.status || null, adapter.lastSyncedAt || null, adapter.coverage || null, adapter.notes || null);
    }

    const insertAsset = database.prepare(`INSERT INTO assets (id, symbol, name, asset_type, metadata_json) VALUES (?, ?, ?, ?, ?)`);
    for (const asset of state.assets || []) {
      insertAsset.run(asset.id, asset.symbol || null, asset.name, asset.assetType || null, JSON.stringify(asset.metadata || {}));
    }

    const insertHolding = database.prepare(`INSERT INTO holdings (id, asset_id, quantity, cost_basis, source_type) VALUES (?, ?, ?, ?, ?)`);
    for (const holding of state.holdings || []) {
      insertHolding.run(holding.id, holding.assetId, Number(holding.quantity || 0), holding.costBasis != null ? Number(holding.costBasis) : null, holding.sourceType || null);
    }

    const insertWatchlist = database.prepare(`INSERT INTO watchlists (id, name, description) VALUES (?, ?, ?)`);
    const insertWatchlistItem = database.prepare(`INSERT INTO watchlist_items (id, watchlist_id, asset_id) VALUES (?, ?, ?)`);
    for (const watchlist of state.watchlists || []) {
      insertWatchlist.run(watchlist.id, watchlist.name, watchlist.description || null);
      for (const assetId of watchlist.itemAssetIds || []) {
        insertWatchlistItem.run(makeId('watchlist_item'), watchlist.id, assetId);
      }
    }

    const insertTheme = database.prepare(`INSERT INTO themes (id, title, status, summary, hypothesis, monitoring_plan) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertThemeAssetLink = database.prepare(`INSERT INTO theme_asset_links (id, theme_id, asset_id) VALUES (?, ?, ?)`);
    for (const theme of state.themes || []) {
      insertTheme.run(theme.id, theme.title, theme.status || null, theme.summary || null, theme.hypothesis || null, theme.monitoringPlan || null);
      for (const assetId of theme.assetIds || []) {
        insertThemeAssetLink.run(makeId('theme_asset_link'), theme.id, assetId);
      }
    }

    const insertEvent = database.prepare(`
      INSERT INTO canonical_events (
        id, event_type, title, factual_summary, recorded_at, scheduled_for, asset_id, theme_id, source_adapter_id,
        source_label, source_tier, importance, truth_status, market_context_json, realtime_meta_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const event of state.canonicalEvents || []) {
      insertEvent.run(
        event.id,
        event.eventType || null,
        event.title,
        event.factualSummary || null,
        event.recordedAt || null,
        event.scheduledFor || null,
        event.assetId || null,
        event.themeId || null,
        event.sourceAdapterId || null,
        event.sourceLabel || null,
        event.sourceTier || null,
        event.importance || null,
        event.truthStatus || null,
        JSON.stringify(event.marketContext || {}),
        JSON.stringify(event.realtimeMeta || {})
      );
    }

    const insertInbox = database.prepare(`
      INSERT INTO inbox_items (
        id, event_id, state, priority, score, reason, next_step, created_at, updated_at, delivery_kind,
        suggestion_type, dedupe_key, explanation_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of state.inboxItems || []) {
      insertInbox.run(
        item.id,
        item.eventId,
        item.state || null,
        item.priority || null,
        item.score != null ? Number(item.score) : null,
        item.reason || null,
        item.nextStep || null,
        item.createdAt || null,
        item.updatedAt || null,
        item.deliveryKind || null,
        item.suggestionType || null,
        item.dedupeKey || null,
        JSON.stringify(item.explanation || {})
      );
    }

    const insertReminder = database.prepare(`INSERT INTO reminders (id, title, state, due_at, related_type, related_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const reminder of state.reminders || []) {
      insertReminder.run(reminder.id, reminder.title, reminder.state || null, reminder.dueAt || null, reminder.relatedType || null, reminder.relatedId || null, reminder.note || null);
    }

    const insertDigest = database.prepare(`INSERT INTO digests (id, date, title, summary, item_ids_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const digest of state.digests || []) {
      insertDigest.run(digest.id, digest.date || null, digest.title || null, digest.summary || null, JSON.stringify(digest.itemIds || []), digest.createdAt || null);
    }

    const insertDelivery = database.prepare(`INSERT INTO delivery_queue (id, target_type, target_id, channel, status, queued_at, delivered_at, reason, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const delivery of state.deliveryQueue || []) {
      insertDelivery.run(delivery.id, delivery.targetType || null, delivery.targetId || null, delivery.channel || null, delivery.status || null, delivery.queuedAt || null, delivery.deliveredAt || null, delivery.reason || null, delivery.priority || null);
    }

    const insertResearchJob = database.prepare(`INSERT INTO research_jobs (id, status, mode, trigger_type, target_type, target_id, related_event_id, question, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const job of state.researchJobs || []) {
      insertResearchJob.run(job.id, job.status || null, job.mode || null, job.triggerType || null, job.targetType || null, job.targetId || null, job.relatedEventId || null, job.question || null, job.createdAt || null, job.completedAt || null);
    }

    const insertResearchReport = database.prepare(`INSERT INTO research_reports (id, job_id, related_event_id, title, summary, next_check, confidence, freshness_at, expires_at, inference_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const report of state.researchReports || []) {
      insertResearchReport.run(report.id, report.jobId, report.relatedEventId || null, report.title || null, report.summary || null, report.nextCheck || null, report.confidence != null ? Number(report.confidence) : null, report.freshnessAt || null, report.expiresAt || null, report.inferenceProvider || null, report.createdAt || null);
    }

    const insertResearchSource = database.prepare(`INSERT INTO research_sources (id, report_id, title, url, publisher, tier, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const source of state.researchSources || []) {
      insertResearchSource.run(source.id, source.reportId, source.title || null, source.url || null, source.publisher || null, source.tier || null, source.publishedAt || null);
    }

    const insertResearchClaim = database.prepare(`INSERT INTO research_claims (id, report_id, claim, confidence, supported_by_source_ids_json) VALUES (?, ?, ?, ?, ?)`);
    for (const claim of state.researchClaims || []) {
      insertResearchClaim.run(claim.id, claim.reportId, claim.claim || null, claim.confidence != null ? Number(claim.confidence) : null, JSON.stringify(claim.supportedBySourceIds || []));
    }

    const insertEventEnrichment = database.prepare(`INSERT INTO event_enrichments (id, event_id, report_id, summary, confidence, freshness_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const enrichment of state.eventEnrichments || []) {
      insertEventEnrichment.run(enrichment.id, enrichment.eventId, enrichment.reportId, enrichment.summary || null, enrichment.confidence != null ? Number(enrichment.confidence) : null, enrichment.freshnessAt || null, enrichment.expiresAt || null);
    }

    const insertNote = database.prepare(`INSERT INTO notes (id, target_type, target_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const note of state.notes || []) {
      insertNote.run(note.id, note.targetType || null, note.targetId || null, note.body || null, note.createdAt || null, note.updatedAt || note.createdAt || null);
    }

    const insertAudit = database.prepare(`INSERT INTO audit_log (id, action, entity_type, entity_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const entry of state.auditLog || []) {
      insertAudit.run(entry.id, entry.action || null, entry.entityType || null, entry.entityId || null, entry.summary || null, entry.createdAt || null);
    }

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function loadState() {
  const database = getDb();

  const userRow = database.prepare('SELECT * FROM app_user LIMIT 1').get();
  const watchlistItems = database.prepare('SELECT * FROM watchlist_items').all();
  const themeAssetLinks = database.prepare('SELECT * FROM theme_asset_links').all();

  return {
    user: userRow
      ? {
          id: userRow.id,
          name: userRow.name,
          timezone: userRow.timezone,
          digestCadence: userRow.digest_cadence,
          researchPolicy: parseJson(userRow.research_policy_json, {})
        }
      : null,
    sourceAdapters: database.prepare('SELECT * FROM source_adapters ORDER BY rowid DESC').all().map((row) => ({
      id: row.id,
      name: row.name,
      tier: row.tier,
      status: row.status,
      lastSyncedAt: row.last_synced_at,
      coverage: row.coverage,
      notes: row.notes || undefined
    })),
    assets: database.prepare('SELECT * FROM assets ORDER BY rowid').all().map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      assetType: row.asset_type,
      metadata: parseJson(row.metadata_json, {})
    })),
    holdings: database.prepare('SELECT * FROM holdings ORDER BY rowid').all().map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      quantity: row.quantity,
      costBasis: row.cost_basis,
      sourceType: row.source_type
    })),
    watchlists: database.prepare('SELECT * FROM watchlists ORDER BY rowid').all().map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      itemAssetIds: watchlistItems.filter((item) => item.watchlist_id === row.id).map((item) => item.asset_id)
    })),
    themes: database.prepare('SELECT * FROM themes ORDER BY rowid').all().map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      summary: row.summary || '',
      hypothesis: row.hypothesis || '',
      monitoringPlan: row.monitoring_plan || '',
      assetIds: themeAssetLinks.filter((item) => item.theme_id === row.id).map((item) => item.asset_id)
    })),
    canonicalEvents: database.prepare('SELECT * FROM canonical_events ORDER BY recorded_at DESC, rowid DESC').all().map((row) => ({
      id: row.id,
      eventType: row.event_type,
      title: row.title,
      factualSummary: row.factual_summary || '',
      recordedAt: row.recorded_at,
      scheduledFor: row.scheduled_for,
      assetId: row.asset_id,
      themeId: row.theme_id,
      sourceAdapterId: row.source_adapter_id,
      sourceLabel: row.source_label,
      sourceTier: row.source_tier,
      importance: row.importance,
      truthStatus: row.truth_status,
      marketContext: parseJson(row.market_context_json, {}),
      realtimeMeta: parseJson(row.realtime_meta_json, {})
    })),
    inboxItems: database.prepare('SELECT * FROM inbox_items ORDER BY created_at DESC, rowid DESC').all().map((row) => ({
      id: row.id,
      eventId: row.event_id,
      state: row.state,
      priority: row.priority,
      score: row.score,
      reason: row.reason || '',
      nextStep: row.next_step || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deliveryKind: row.delivery_kind,
      suggestionType: row.suggestion_type,
      dedupeKey: row.dedupe_key,
      explanation: parseJson(row.explanation_json, {})
    })),
    reminders: database.prepare('SELECT * FROM reminders ORDER BY due_at ASC, rowid DESC').all().map((row) => ({
      id: row.id,
      title: row.title,
      state: row.state,
      dueAt: row.due_at,
      relatedType: row.related_type,
      relatedId: row.related_id,
      note: row.note || ''
    })),
    digests: database.prepare('SELECT * FROM digests ORDER BY created_at DESC, rowid DESC').all().map((row) => ({
      id: row.id,
      date: row.date,
      title: row.title,
      itemIds: parseJson(row.item_ids_json, []),
      summary: row.summary || '',
      createdAt: row.created_at
    })),
    deliveryQueue: database.prepare('SELECT * FROM delivery_queue ORDER BY rowid DESC').all().map((row) => ({
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      channel: row.channel,
      status: row.status,
      queuedAt: row.queued_at,
      deliveredAt: row.delivered_at,
      reason: row.reason,
      priority: row.priority
    })),
    researchJobs: database.prepare('SELECT * FROM research_jobs ORDER BY created_at DESC, rowid DESC').all().map((row) => ({
      id: row.id,
      status: row.status,
      mode: row.mode,
      triggerType: row.trigger_type,
      targetType: row.target_type,
      targetId: row.target_id,
      relatedEventId: row.related_event_id,
      question: row.question,
      createdAt: row.created_at,
      completedAt: row.completed_at
    })),
    researchReports: database.prepare('SELECT * FROM research_reports ORDER BY created_at DESC, rowid DESC').all().map((row) => ({
      id: row.id,
      jobId: row.job_id,
      relatedEventId: row.related_event_id,
      title: row.title,
      summary: row.summary,
      nextCheck: row.next_check,
      confidence: row.confidence,
      freshnessAt: row.freshness_at,
      expiresAt: row.expires_at,
      inferenceProvider: row.inference_provider,
      createdAt: row.created_at
    })),
    researchSources: database.prepare('SELECT * FROM research_sources ORDER BY rowid DESC').all().map((row) => ({
      id: row.id,
      reportId: row.report_id,
      title: row.title,
      url: row.url,
      publisher: row.publisher,
      tier: row.tier,
      publishedAt: row.published_at
    })),
    researchClaims: database.prepare('SELECT * FROM research_claims ORDER BY rowid DESC').all().map((row) => ({
      id: row.id,
      reportId: row.report_id,
      claim: row.claim,
      confidence: row.confidence,
      supportedBySourceIds: parseJson(row.supported_by_source_ids_json, [])
    })),
    eventEnrichments: database.prepare('SELECT * FROM event_enrichments ORDER BY freshness_at DESC, rowid DESC').all().map((row) => ({
      id: row.id,
      eventId: row.event_id,
      reportId: row.report_id,
      summary: row.summary,
      confidence: row.confidence,
      freshnessAt: row.freshness_at,
      expiresAt: row.expires_at
    })),
    notes: database.prepare('SELECT * FROM notes ORDER BY created_at DESC, rowid DESC').all().map((row) => ({
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    auditLog: database.prepare('SELECT * FROM audit_log ORDER BY created_at DESC, rowid DESC').all().map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      summary: row.summary,
      createdAt: row.created_at
    }))
  };
}

function saveState(state) {
  const database = getDb();
  persistState(database, clone(state));
  return loadState();
}

function resetState() {
  const database = getDb();
  persistState(database, clone(defaultState));
  return loadState();
}

function update(mutator) {
  const current = loadState();
  const next = mutator(clone(current)) || current;
  saveState(next);
  return loadState();
}

function makeId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

function getHealth() {
  const database = getDb();
  const assets = database.prepare('SELECT COUNT(*) AS count FROM assets').get();
  const inbox = database.prepare('SELECT COUNT(*) AS count FROM inbox_items').get();
  return {
    ok: true,
    backend: 'sqlite',
    path: dataFile,
    counts: {
      assets: Number(assets.count || 0),
      inboxItems: Number(inbox.count || 0)
    }
  };
}

module.exports = {
  dataFile,
  legacyJsonFile,
  loadState,
  saveState,
  resetState,
  update,
  makeId,
  clone,
  closeDB,
  getHealth
};
