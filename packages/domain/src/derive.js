function sortByDate(items, key) {
  return [...items].sort((a, b) => new Date(a[key] || 0) - new Date(b[key] || 0));
}

function sortByDateDesc(items, key) {
  return [...items].sort((a, b) => new Date(b[key] || 0) - new Date(a[key] || 0));
}

function getMap(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function priorityRank(priority) {
  return { critical: 0, high: 1, normal: 2, low: 3 }[priority] ?? 4;
}

function decorateEvent(state, event) {
  const assetMap = getMap(state.assets);
  const themeMap = getMap(state.themes || []);
  const adapterMap = getMap(state.sourceAdapters || []);
  const reportMap = getMap(state.researchReports || []);
  const enrichment = (state.eventEnrichments || [])
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

function buildPortfolioSummary(state) {
  const trackedAssetIds = unique([
    ...state.holdings.map((holding) => holding.assetId),
    ...state.watchlists.flatMap((watchlist) => watchlist.itemAssetIds || []),
    ...state.themes.flatMap((theme) => theme.assetIds || [])
  ]);

  const estimatedBasis = state.holdings.reduce((total, holding) => {
    const basis = holding.costBasis != null ? Number(holding.costBasis) : 0;
    const quantity = holding.quantity != null ? Number(holding.quantity) : 0;
    return total + basis * quantity;
  }, 0);

  return {
    holdingsCount: state.holdings.length,
    watchlistsCount: state.watchlists.length,
    activeThemesCount: state.themes.filter((theme) => theme.status === 'active').length,
    trackedAssetsCount: trackedAssetIds.length,
    canonicalEventsCount: state.canonicalEvents.length,
    openRemindersCount: state.reminders.filter((reminder) => reminder.state === 'open').length,
    estimatedCostBasis: estimatedBasis
  };
}

function buildInbox(state) {
  const decoratedEvents = new Map(state.canonicalEvents.map((event) => [event.id, decorateEvent(state, event)]));

  return [...state.inboxItems]
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

function buildDigest(state) {
  const inbox = buildInbox(state).filter((item) => item.state !== 'archived');
  const topItems = inbox.slice(0, 5);
  const openReminders = sortByDate(state.reminders.filter((item) => item.state === 'open'), 'dueAt').slice(0, 5);
  const reportMap = getMap(state.researchReports || []);
  const recentResearch = sortByDateDesc(state.researchJobs || [], 'createdAt')
    .slice(0, 3)
    .map((job) => ({
      ...job,
      report: (state.researchReports || []).find((report) => report.jobId === job.id) || null
    }));

  const summary = `${topItems.length} inbox items, ${openReminders.length} open reminders, and ${recentResearch.length} recent research passes across ${state.themes.filter((theme) => theme.status === 'active').length} active themes.`;

  return {
    date: new Date().toISOString().slice(0, 10),
    title: 'What happened, why it matters, and what to check next.',
    summary,
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
    researchSuggestions: state.themes
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
    })),
    reportMap
  };
}

function buildCalendar(state) {
  return sortByDate(state.canonicalEvents, 'scheduledFor').map((event) => decorateEvent(state, event));
}

function buildResearchWorkspace(state) {
  const sourcesByReportId = new Map();
  for (const source of state.researchSources || []) {
    const list = sourcesByReportId.get(source.reportId) || [];
    list.push(source);
    sourcesByReportId.set(source.reportId, list);
  }

  const claimsByReportId = new Map();
  for (const claim of state.researchClaims || []) {
    const list = claimsByReportId.get(claim.reportId) || [];
    list.push(claim);
    claimsByReportId.set(claim.reportId, list);
  }

  return sortByDateDesc(state.researchJobs || [], 'createdAt').map((job) => {
    const report = (state.researchReports || []).find((item) => item.jobId === job.id) || null;
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

function buildSourceHealth(state) {
  return sortByDateDesc(state.sourceAdapters || [], 'lastSyncedAt');
}

function buildAuditTrail(state) {
  return sortByDateDesc(state.auditLog || [], 'createdAt').slice(0, 20);
}

function buildBootstrap(state) {
  return {
    ...state,
    theses: state.themes,
    alerts: state.reminders,
    catalysts: state.canonicalEvents,
    researchRuns: state.researchReports,
    portfolioSummary: buildPortfolioSummary(state),
    inbox: buildInbox(state),
    digest: buildDigest(state),
    calendar: buildCalendar(state),
    researchWorkspace: buildResearchWorkspace(state),
    sourceHealth: buildSourceHealth(state),
    auditTrail: buildAuditTrail(state)
  };
}

module.exports = {
  buildDigest,
  buildCalendar,
  buildBootstrap,
  buildInbox,
  buildPortfolioSummary,
  buildResearchWorkspace,
  buildSourceHealth,
  buildAuditTrail
};
