function hashCode(value) {
  return String(value || 'asset').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

const assetProfiles = {
  NVDA: { sector: 'Information Technology', benchmarkWeight: 7.2, beta: 1.74, diversificationImpact: 22 },
  AAPL: { sector: 'Information Technology', benchmarkWeight: 8.8, beta: 1.12, diversificationImpact: 16 },
  MSFT: { sector: 'Information Technology', benchmarkWeight: 8.1, beta: 0.98, diversificationImpact: 16 },
  GOOGL: { sector: 'Communication Services', benchmarkWeight: 4.9, beta: 1.06, diversificationImpact: 14 },
  META: { sector: 'Communication Services', benchmarkWeight: 5.1, beta: 1.29, diversificationImpact: 14 },
  AMZN: { sector: 'Consumer Discretionary', benchmarkWeight: 5.4, beta: 1.21, diversificationImpact: 15 },
  TSLA: { sector: 'Consumer Discretionary', benchmarkWeight: 3.4, beta: 1.92, diversificationImpact: 12 },
  BTC: { sector: 'Digital Assets', benchmarkWeight: 0, beta: 1.85, diversificationImpact: 8 },
  VOO: { sector: 'Broad Market', benchmarkWeight: 0, beta: 1.0, diversificationImpact: 20 },
  XLU: { sector: 'Utilities', benchmarkWeight: 0.7, beta: 0.61, diversificationImpact: 18 },
  VRT: { sector: 'Industrials', benchmarkWeight: 0.2, beta: 1.38, diversificationImpact: 12 },
  TSM: { sector: 'Information Technology', benchmarkWeight: 0, beta: 1.19, diversificationImpact: 14 }
};

function profileForAsset(asset) {
  const symbol = asset?.symbol || '';
  return assetProfiles[symbol] || {
    sector: asset?.assetType === 'crypto' ? 'Digital Assets' : 'Other',
    benchmarkWeight: 0,
    beta: round(0.85 + ((hashCode(symbol || asset?.name) % 90) / 100), 2),
    diversificationImpact: 12
  };
}

function performanceForAsset(asset, index = 0) {
  const seed = hashCode(asset?.symbol || asset?.name || index);
  const delta = ((seed % 180) - 90) / 10;
  const change = round(delta, 1);
  const positive = change >= 0;
  const points = Array.from({ length: 14 }, (_, pointIndex) => {
    const wave = Math.sin((seed + pointIndex * 13) / 11) * 18;
    const slope = positive ? pointIndex * 1.6 : (13 - pointIndex) * 1.6;
    return round(Math.max(8, Math.min(92, 52 + wave + (positive ? slope : -slope))), 2);
  });
  const price = round((seed % 320) + 24 + ((seed % 100) / 100), 2);
  return { change, positive, price, points };
}

function monthLabel(index) {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index] || `M${index + 1}`;
}

function buildPerformanceSeries(baseValue, seed, length = 12) {
  const start = Number(baseValue || 100000);
  const points = [];
  let current = start * 0.88;
  for (let index = 0; index < length; index += 1) {
    const wave = Math.sin((seed + index * 7) / 9) * 0.022;
    const drift = 0.012 + ((seed % 5) * 0.0015);
    current = current * (1 + drift + wave);
    points.push({
      label: monthLabel(index),
      value: round(current, 2)
    });
  }
  return points;
}

function buildPortfolioAnalytics(state, benchmark = 'nasdaq-100') {
  const holdings = (state.holdings || []).map((holding, index) => {
    const asset = (state.assets || []).find((item) => item.id === holding.assetId) || { id: holding.assetId, name: 'Unknown asset', symbol: null };
    const performance = performanceForAsset(asset, index);
    const marketValue = round(Number(holding.quantity || 0) * Number(performance.price || 0), 2);
    return {
      holding,
      asset,
      performance,
      marketValue,
      profile: profileForAsset(asset)
    };
  });

  const totalValue = round(holdings.reduce((sum, item) => sum + item.marketValue, 0), 2);
  const totalCostBasis = round(holdings.reduce((sum, item) => sum + (Number(item.holding.quantity || 0) * Number(item.holding.costBasis || 0)), 0), 2);
  const weighted = holdings.map((item) => ({
    ...item,
    weight: totalValue > 0 ? item.marketValue / totalValue : 0
  }));

  const sectorMap = new Map();
  for (const item of weighted) {
    const existing = sectorMap.get(item.profile.sector) || { sector: item.profile.sector, weight: 0, monthPerformance: 0, benchmarkWeight: 0 };
    existing.weight += item.weight;
    existing.monthPerformance += item.weight * (item.performance.change || 0);
    existing.benchmarkWeight += item.profile.benchmarkWeight || 0;
    sectorMap.set(item.profile.sector, existing);
  }

  const sectorBreakdown = [...sectorMap.values()]
    .map((item) => ({
      sector: item.sector,
      weight: round(item.weight * 100, 1),
      benchmarkWeight: round(item.benchmarkWeight, 1),
      activeWeight: round((item.weight * 100) - item.benchmarkWeight, 1),
      performance1m: round(item.monthPerformance, 1)
    }))
    .sort((a, b) => b.weight - a.weight);

  const benchmarkTechExposure = benchmark.toLowerCase().includes('nasdaq') ? 58.1 : 42.4;
  const techExposure = round(
    sectorBreakdown
      .filter((item) => item.sector === 'Information Technology')
      .reduce((sum, item) => sum + item.weight, 0),
    1
  );

  const portfolioBeta = round(weighted.reduce((sum, item) => sum + (item.weight * item.profile.beta), 0), 2);
  const concentrationPenalty = Math.min(40, Math.max(0, (sectorBreakdown[0]?.weight || 0) - 25));
  const sectorDiversityBonus = Math.min(30, sectorBreakdown.length * 6);
  const diversificationScore = Math.max(30, Math.min(96, Math.round(55 + sectorDiversityBonus - concentrationPenalty + (weighted.length * 1.5))));

  const performanceSeries = buildPerformanceSeries(totalValue || 100000, hashCode(weighted.map((item) => item.asset.symbol).join('|') || 'portfolio'));
  const latest = performanceSeries[performanceSeries.length - 1]?.value || totalValue;
  const first = performanceSeries[0]?.value || latest;
  const ytdGain = round(latest - first, 2);
  const ytdReturnPct = first ? round((ytdGain / first) * 100, 2) : 0;
  const dailyChangePct = round(weighted.reduce((sum, item) => sum + (item.weight * item.performance.change), 0), 2);

  const watchlistAssetIds = [...new Set((state.watchlists || []).flatMap((watchlist) => watchlist.itemAssetIds || []))];
  const heldIds = new Set(weighted.map((item) => item.asset.id));
  const watchlistMovers = watchlistAssetIds
    .filter((id) => !heldIds.has(id))
    .map((id, index) => {
      const asset = (state.assets || []).find((item) => item.id === id) || { id, name: 'Unknown asset', symbol: null };
      const performance = performanceForAsset(asset, index + 100);
      return {
        assetId: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        sector: profileForAsset(asset).sector,
        price: performance.price,
        changePct1d: performance.change,
        sparkline: performance.points
      };
    })
    .sort((a, b) => Math.abs(b.changePct1d) - Math.abs(a.changePct1d));

  const currentPositions = weighted
    .map((item) => ({
      assetId: item.asset.id,
      symbol: item.asset.symbol,
      name: item.asset.name,
      sector: item.profile.sector,
      quantity: item.holding.quantity,
      costBasis: item.holding.costBasis,
      marketValue: item.marketValue,
      weight: round(item.weight * 100, 1),
      price: item.performance.price,
      changePct1d: item.performance.change,
      beta: item.profile.beta,
      sparkline: item.performance.points
    }))
    .sort((a, b) => b.weight - a.weight);

  return {
    benchmark: {
      id: benchmark,
      label: benchmark.toLowerCase().includes('nasdaq') ? 'NASDAQ-100' : benchmark,
      techExposure: benchmarkTechExposure
    },
    summary: {
      portfolioValue: totalValue,
      costBasis: totalCostBasis,
      ytdGain,
      ytdReturnPct,
      dailyChangePct,
      topLine: `Tech exposure is ${techExposure}% versus ${benchmarkTechExposure}% for the benchmark.`
    },
    comparison: {
      techExposure,
      benchmarkTechExposure,
      activeTechExposure: round(techExposure - benchmarkTechExposure, 1),
      portfolioBeta,
      diversificationScore
    },
    metrics: {
      portfolioBeta,
      diversificationScore,
      holdingsCount: currentPositions.length,
      watchlistCount: (state.watchlists || []).length
    },
    sectorBreakdown,
    currentPositions,
    watchlistMovers,
    performanceSeries
  };
}

function classifyInboxCategory(item) {
  const title = String(item?.event?.title || '').toLowerCase();
  const source = String(item?.event?.sourceLabel || '').toLowerCase();
  const eventType = String(item?.event?.eventType || '').toLowerCase();
  if (source.includes('security') || title.includes('security') || title.includes('verification') || title.includes('api connection')) return 'security';
  if (source.includes('compliance') || title.includes('policy') || title.includes('terms') || title.includes('compliance')) return 'compliance';
  if (eventType === 'market_change' || eventType === 'earnings' || eventType === 'filing' || eventType === 'macro') return 'alerts';
  if (eventType === 'news') return 'insights';
  return 'updates';
}

function buildInboxFeed(state, options = {}) {
  const query = String(options.q || '').trim().toLowerCase();
  const filter = String(options.filter || 'all').toLowerCase();
  const category = String(options.category || '').toLowerCase();
  const stateFilter = String(options.state || 'active').toLowerCase();
  const limit = Math.max(1, Math.min(100, Number(options.limit || 20)));
  const cursor = options.cursor ? new Date(String(options.cursor)).getTime() : null;

  const inbox = (state.inbox || state.inboxItems || []).map((item) => {
    const resolved = item.event ? item : {
      ...item,
      event: (state.canonicalEvents || []).find((event) => event.id === item.eventId) || null
    };
    const resolvedCategory = classifyInboxCategory(resolved);
    const haystack = [
      resolved.event?.title,
      resolved.event?.factualSummary,
      resolved.reason,
      resolved.event?.sourceLabel,
      resolvedCategory,
      resolved.event?.asset?.symbol,
      resolved.event?.asset?.name
    ].filter(Boolean).join(' ').toLowerCase();
    return {
      ...resolved,
      category: resolvedCategory,
      unread: resolved.state === 'new',
      source: resolved.event?.sourceLabel || resolved.event?.sourceAdapter?.name || 'System',
      preview: resolved.event?.factualSummary || resolved.reason || '',
      timestamp: resolved.updatedAt || resolved.createdAt || resolved.event?.recordedAt || null,
      searchText: haystack
    };
  });

  let filtered = inbox.filter((item) => {
    if (stateFilter === 'active' && item.state === 'archived') return false;
    if (stateFilter === 'unread' && !item.unread) return false;
    if (filter === 'unread' && !item.unread) return false;
    if (filter !== 'all' && filter !== 'unread' && filter !== item.category) return false;
    if (category && item.category !== category) return false;
    if (query && !item.searchText.includes(query)) return false;
    if (cursor && new Date(item.timestamp || 0).getTime() >= cursor) return false;
    return true;
  });

  filtered = filtered.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  const page = filtered.slice(0, limit);
  const nextCursor = filtered.length > limit ? page[page.length - 1]?.timestamp || null : null;

  const facets = {
    all: inbox.filter((item) => item.state !== 'archived').length,
    unread: inbox.filter((item) => item.unread && item.state !== 'archived').length,
    alerts: inbox.filter((item) => item.category === 'alerts' && item.state !== 'archived').length,
    insights: inbox.filter((item) => item.category === 'insights' && item.state !== 'archived').length,
    security: inbox.filter((item) => item.category === 'security' && item.state !== 'archived').length,
    compliance: inbox.filter((item) => item.category === 'compliance' && item.state !== 'archived').length,
    updates: inbox.filter((item) => item.category === 'updates' && item.state !== 'archived').length
  };

  return {
    items: page.map((item) => ({
      id: item.id,
      eventId: item.eventId,
      source: item.source,
      title: item.event?.title || 'Untitled item',
      preview: item.preview,
      category: item.category,
      unread: item.unread,
      priority: item.priority,
      timestamp: item.timestamp,
      state: item.state,
      reason: item.reason,
      nextStep: item.nextStep,
      asset: item.event?.asset || null,
      theme: item.event?.theme || null
    })),
    pageInfo: {
      limit,
      nextCursor,
      hasMore: Boolean(nextCursor)
    },
    facets
  };
}

module.exports = {
  performanceForAsset,
  buildPortfolioAnalytics,
  buildInboxFeed,
  classifyInboxCategory
};
