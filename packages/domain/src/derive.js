function getAssetMap(state) {
  return new Map(state.assets.map((asset) => [asset.id, asset]));
}

function sortByDate(items, key) {
  return [...items].sort((a, b) => new Date(a[key] || 0) - new Date(b[key] || 0));
}

function buildDigest(state) {
  const assetMap = getAssetMap(state);
  const catalysts = sortByDate(state.catalysts, 'scheduledFor').slice(0, 5);
  const alerts = sortByDate(state.alerts.filter((a) => a.state === 'pending'), 'scheduledFor').slice(0, 5);
  const mattersSoon = catalysts.map((c) => ({
    id: c.id,
    type: c.type,
    title: c.title,
    whyItMatters: c.whyItMatters,
    confidence: c.confidence,
    asset: c.assetId ? assetMap.get(c.assetId) : null,
    scheduledFor: c.scheduledFor
  }));

  const liveNews = state.catalysts
    .filter((c) => c.type === 'news' || c.type === 'thesis_update')
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      title: c.title,
      whyItMatters: c.whyItMatters,
      sourceLabel: c.sourceLabel || 'System'
    }));

  const summary = `${mattersSoon.length} catalysts and ${alerts.length} pending alerts across ${state.theses.filter((t) => t.status === 'active').length} active theses.`;

  return {
    date: new Date().toISOString().slice(0, 10),
    summary,
    mattersSoon,
    liveNews,
    pendingAlerts: alerts,
    researchSuggestions: state.theses.slice(0, 3).map((thesis) => ({
      thesisId: thesis.id,
      prompt: `What changed in the ${thesis.title} thesis over the last 7 days?`
    }))
  };
}

function buildCalendar(state) {
  const assetMap = getAssetMap(state);
  return sortByDate(state.catalysts, 'scheduledFor').map((c) => ({
    ...c,
    asset: c.assetId ? assetMap.get(c.assetId) : null
  }));
}

function buildBootstrap(state) {
  return {
    ...state,
    digest: buildDigest(state),
    calendar: buildCalendar(state)
  };
}

module.exports = {
  buildDigest,
  buildCalendar,
  buildBootstrap
};
