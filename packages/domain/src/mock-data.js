const user = {
  id: 'user_keiferleaf',
  name: 'Keiferleaf',
  timezone: 'America/Los_Angeles'
};

const assets = [
  { id: 'asset_nvda', symbol: 'NVDA', name: 'NVIDIA', assetType: 'equity' },
  { id: 'asset_vrt', symbol: 'VRT', name: 'Vertiv', assetType: 'equity' },
  { id: 'asset_btc', symbol: 'BTC', name: 'Bitcoin', assetType: 'crypto' },
  { id: 'asset_xlu', symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund', assetType: 'etf' }
];

const holdings = [
  { id: 'holding_1', assetId: 'asset_nvda', quantity: 25, sourceType: 'broker_sync' },
  { id: 'holding_2', assetId: 'asset_btc', quantity: 0.8, sourceType: 'manual' }
];

const watchlists = [
  {
    id: 'watchlist_1',
    name: 'AI Infrastructure',
    itemAssetIds: ['asset_vrt', 'asset_xlu']
  }
];

const theses = [
  {
    id: 'thesis_1',
    title: 'AI power infrastructure',
    status: 'active',
    summary: 'Power, cooling, and grid beneficiaries of AI datacenter buildout.',
    assetIds: ['asset_nvda', 'asset_vrt', 'asset_xlu']
  }
];

const catalysts = [
  {
    id: 'catalyst_1',
    type: 'earnings',
    title: 'NVDA earnings tomorrow',
    scheduledFor: '2026-05-21T20:00:00Z',
    assetId: 'asset_nvda',
    thesisId: 'thesis_1',
    whyItMatters: 'Linked to your current holding and AI power infrastructure thesis.'
  },
  {
    id: 'catalyst_2',
    type: 'news',
    title: 'Utility capex guidance revised upward',
    scheduledFor: '2026-05-20T14:00:00Z',
    assetId: 'asset_xlu',
    thesisId: 'thesis_1',
    whyItMatters: 'Supports second-order infrastructure spend tied to AI datacenter demand.'
  }
];

const alerts = [
  {
    id: 'alert_1',
    title: 'Review NVDA before earnings',
    state: 'pending',
    scheduledFor: '2026-05-21T13:00:00Z',
    catalystId: 'catalyst_1'
  }
];

const digest = {
  date: '2026-05-20',
  summary: '2 catalysts deserve attention, including NVDA earnings and an infrastructure-relevant utility update.',
  mattersSoon: [
    {
      type: 'catalyst',
      title: 'NVDA earnings tomorrow',
      whyItMatters: 'You hold NVDA and it anchors your AI power infrastructure thesis.'
    }
  ],
  liveNews: [
    {
      title: 'Utility capex guidance revised upward',
      whyItMatters: 'Potential read-through for AI datacenter power demand and supporting infrastructure.'
    }
  ],
  researchSuggestions: [
    {
      prompt: 'What changed in the AI power infrastructure thesis over the last 7 days?'
    }
  ]
};

const researchRuns = [
  {
    id: 'research_1',
    scope: 'thesis',
    targetId: 'thesis_1',
    question: 'What changed in the AI power infrastructure thesis over the last 7 days?',
    status: 'completed',
    summary: 'Power, cooling, and utility capex remain the main second-order beneficiaries to watch.'
  }
];

module.exports = {
  user,
  assets,
  holdings,
  watchlists,
  theses,
  catalysts,
  alerts,
  digest,
  researchRuns
};
