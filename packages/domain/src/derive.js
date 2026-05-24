const { performanceForAsset } = require('./analytics');

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

function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function getBeliefProfiles(state) {
  const configured = state.user?.researchPolicy?.inboxBeliefs;
  if (Array.isArray(configured) && configured.length) {
    const themeMap = getMap(state.themes || []);
    return configured.map((profile) => ({
      id: profile.id,
      themeId: profile.themeId || null,
      theme: profile.themeId ? themeMap.get(profile.themeId) || null : null,
      stance: profile.stance || 'balanced',
      conviction: profile.conviction || 'medium',
      timeHorizon: profile.timeHorizon || '3-12 months',
      actionBias: profile.actionBias || 'monitor',
      disconfirmSignals: profile.disconfirmSignals || '',
      preferredEvidence: profile.preferredEvidence || []
    }));
  }

  return (state.themes || []).map((theme) => ({
    id: `belief_${theme.id}`,
    themeId: theme.id,
    theme,
    stance: 'balanced',
    conviction: 'medium',
    timeHorizon: '3-12 months',
    actionBias: 'monitor',
    disconfirmSignals: '',
    preferredEvidence: []
  }));
}

function classifyBeliefAlignment(item, profile) {
  if (!profile) return 'neutral';
  const change = Number(item?.event?.marketContext?.changePercent ?? 0);
  const text = `${item?.event?.title || ''} ${item?.event?.factualSummary || ''}`.toLowerCase();
  const positiveSignal = change > 0 || /beat|raised|upward|surge|jump|rally|backlog|growth/.test(text);
  const negativeSignal = change < 0 || /miss|cut|downward|drop|falls|slump|probe|risk/.test(text);

  if (profile.stance === 'bullish') {
    if (negativeSignal) return 'challenging';
    if (positiveSignal) return 'reinforcing';
  }
  if (profile.stance === 'bearish') {
    if (positiveSignal) return 'challenging';
    if (negativeSignal) return 'reinforcing';
  }
  return 'neutral';
}

function buildSuggestion(item, profile) {
  const alignment = classifyBeliefAlignment(item, profile);
  const baseAsset = item.event?.asset?.symbol || item.event?.asset?.name || 'This asset';
  const beliefName = profile?.theme?.title || 'your active belief set';

  if (item.priority === 'critical' && alignment === 'challenging') {
    return {
      type: 'stress_test',
      label: 'Stress-test thesis',
      summary: `${baseAsset} is moving against ${beliefName}. Re-check the core assumption before this becomes a blind spot.`,
      action: 'Queue deeper research and review position sizing.',
      confidence: 0.82,
      alignment
    };
  }

  if ((item.priority === 'critical' || item.priority === 'high') && alignment === 'reinforcing') {
    return {
      type: 'thesis_confirmation',
      label: 'Confirm thesis',
      summary: `${baseAsset} is reinforcing ${beliefName}. Verify whether this is a one-day move or durable confirmation.`,
      action: 'Save to daily report and monitor for follow-through.',
      confidence: 0.76,
      alignment
    };
  }

  if (item.priority === 'high') {
    return {
      type: 'position_check',
      label: 'Position check',
      summary: `${baseAsset} deserves a manual review because it intersects with a tracked belief or active watchlist.`,
      action: 'Review catalyst context and decide whether to set a follow-up reminder.',
      confidence: 0.68,
      alignment
    };
  }

  return {
    type: 'monitor',
    label: 'Monitor',
    summary: `${baseAsset} should stay in the feed, but it does not yet justify a larger intervention.`,
    action: 'Let it roll into the daily report unless a stronger confirming signal arrives.',
    confidence: 0.58,
    alignment
  };
}

function buildAiSuggestions(state) {
  const inbox = buildInbox(state).filter((item) => item.state !== 'archived').slice(0, 6);
  const beliefProfiles = getBeliefProfiles(state);

  return inbox.map((item) => {
    const matchingProfile = beliefProfiles.find((profile) => profile.themeId && profile.themeId === item.event?.themeId)
      || beliefProfiles.find((profile) => profile.theme?.assetIds?.includes(item.event?.assetId));
    const suggestion = buildSuggestion(item, matchingProfile || null);
    return {
      id: `suggestion_${item.id}`,
      inboxItemId: item.id,
      eventId: item.eventId,
      asset: item.event?.asset || null,
      theme: item.event?.theme || matchingProfile?.theme || null,
      priority: item.priority,
      ...suggestion
    };
  });
}

function buildDailyReport(state) {
  const trackedAssetIds = unique([
    ...(state.holdings || []).map((holding) => holding.assetId),
    ...(state.watchlists || []).flatMap((watchlist) => watchlist.itemAssetIds || [])
  ]);

  const trackedAssets = trackedAssetIds
    .map((assetId) => (state.assets || []).find((asset) => asset.id === assetId))
    .filter(Boolean);

  const trendingStocks = trackedAssets
    .map((asset, index) => {
      const performance = performanceForAsset(asset, index + 1);
      const relatedThemes = (state.themes || []).filter((theme) => (theme.assetIds || []).includes(asset.id));
      const recentEvent = (state.canonicalEvents || []).find((event) => event.assetId === asset.id);
      return {
        assetId: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        price: performance.price,
        changePct1d: performance.change,
        sparkline: performance.points,
        linkedBeliefs: relatedThemes.map((theme) => theme.title),
        rationale: recentEvent?.title || `${asset.symbol || asset.name} is among the biggest modeled movers in the tracked graph today.`
      };
    })
    .sort((a, b) => Math.abs(b.changePct1d) - Math.abs(a.changePct1d))
    .slice(0, 5);

  const newsBasket = buildInbox(state)
    .filter((item) => item.state !== 'archived')
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.event?.title || 'Untitled update',
      summary: item.event?.factualSummary || item.reason || '',
      aiAngle: item.event?.enrichment?.summary || item.nextStep || '',
      source: item.event?.sourceLabel || 'Open Advisor',
      publishedAt: item.event?.recordedAt || item.createdAt || null,
      priority: item.priority,
      asset: item.event?.asset || null,
      theme: item.event?.theme || null
    }));

  const suggestionCount = buildAiSuggestions(state).filter((item) => item.priority === 'critical' || item.priority === 'high').length;
  const cadence = state.user?.researchPolicy?.dailyReportSchedule || '08:00 local time';

  return {
    title: 'Daily market brief',
    generatedAt: new Date().toISOString(),
    cadence,
    summary: `${trendingStocks.length} trending names, ${newsBasket.length} curated articles, and ${suggestionCount} suggestions worth a closer look.`,
    trendingStocks,
    newsBasket
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

function normalizeState(state) {
  return {
    ...state,
    assets: state.assets || [],
    holdings: state.holdings || [],
    watchlists: state.watchlists || [],
    themes: state.themes || state.theses || [],
    reminders: state.reminders || state.alerts || [],
    canonicalEvents: state.canonicalEvents || state.catalysts || [],
    researchReports: state.researchReports || state.researchRuns || [],
    researchJobs: state.researchJobs || [],
    inboxItems: state.inboxItems || [],
    notes: state.notes || [],
    sourceAdapters: state.sourceAdapters || [],
    eventEnrichments: state.eventEnrichments || [],
    researchSources: state.researchSources || [],
    researchClaims: state.researchClaims || [],
    auditLog: state.auditLog || []
  };
}

function buildBootstrap(state) {
  const normalized = normalizeState(state);
  return {
    ...normalized,
    theses: normalized.themes,
    alerts: normalized.reminders,
    catalysts: normalized.canonicalEvents,
    researchRuns: normalized.researchReports,
    portfolioSummary: buildPortfolioSummary(normalized),
    inbox: buildInbox(normalized),
    digest: buildDigest(normalized),
    calendar: buildCalendar(normalized),
    researchWorkspace: buildResearchWorkspace(normalized),
    sourceHealth: buildSourceHealth(normalized),
    auditTrail: buildAuditTrail(normalized),
    beliefProfiles: getBeliefProfiles(normalized),
    aiSuggestions: buildAiSuggestions(normalized),
    dailyReport: buildDailyReport(normalized)
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
  buildAuditTrail,
  buildBeliefProfiles: getBeliefProfiles,
  buildAiSuggestions,
  buildDailyReport,
  titleCase
};
