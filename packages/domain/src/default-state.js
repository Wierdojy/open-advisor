module.exports = {
  user: {
    id: 'user_keiferleaf',
    name: 'Keiferleaf',
    timezone: 'America/Los_Angeles'
  },
  assets: [
    { id: 'asset_nvda', symbol: 'NVDA', name: 'NVIDIA', assetType: 'equity' },
    { id: 'asset_vrt', symbol: 'VRT', name: 'Vertiv', assetType: 'equity' },
    { id: 'asset_btc', symbol: 'BTC', name: 'Bitcoin', assetType: 'crypto' },
    { id: 'asset_xlu', symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund', assetType: 'etf' }
  ],
  holdings: [
    { id: 'holding_1', assetId: 'asset_nvda', quantity: 25, sourceType: 'broker_sync', costBasis: 822.15 },
    { id: 'holding_2', assetId: 'asset_btc', quantity: 0.8, sourceType: 'manual', costBasis: 61250 }
  ],
  watchlists: [
    {
      id: 'watchlist_1',
      name: 'AI Infrastructure',
      description: 'Power, cooling, and second-order AI infra beneficiaries',
      itemAssetIds: ['asset_vrt', 'asset_xlu']
    }
  ],
  theses: [
    {
      id: 'thesis_1',
      title: 'AI power infrastructure',
      status: 'active',
      summary: 'Power, cooling, and grid beneficiaries of AI datacenter buildout.',
      rationale: 'AI compute demand appears durable enough to create second-order infrastructure winners.',
      assetIds: ['asset_nvda', 'asset_vrt', 'asset_xlu'],
      notes: 'Watch utility capex, cooling vendors, and grid spend as confirmation signals.'
    }
  ],
  catalysts: [
    {
      id: 'catalyst_1',
      type: 'earnings',
      title: 'NVDA earnings tomorrow',
      scheduledFor: '2026-05-21T20:00:00Z',
      assetId: 'asset_nvda',
      thesisId: 'thesis_1',
      whyItMatters: 'Linked to your current holding and AI power infrastructure thesis.',
      confidence: 0.94,
      sourceLabel: 'Company IR calendar'
    },
    {
      id: 'catalyst_2',
      type: 'news',
      title: 'Utility capex guidance revised upward',
      scheduledFor: '2026-05-20T14:00:00Z',
      assetId: 'asset_xlu',
      thesisId: 'thesis_1',
      whyItMatters: 'Supports second-order infrastructure spend tied to AI datacenter demand.',
      confidence: 0.72,
      sourceLabel: 'Sector news monitor'
    }
  ],
  alerts: [
    {
      id: 'alert_1',
      title: 'Review NVDA before earnings',
      state: 'pending',
      scheduledFor: '2026-05-21T13:00:00Z',
      catalystId: 'catalyst_1',
      assetId: 'asset_nvda',
      thesisId: 'thesis_1',
      message: 'Check expectations, your thesis, and whether you want a post-earnings follow-up.'
    }
  ],
  researchRuns: [
    {
      id: 'research_1',
      scope: 'thesis',
      targetId: 'thesis_1',
      question: 'What changed in the AI power infrastructure thesis over the last 7 days?',
      status: 'completed',
      summary: 'Power, cooling, and utility capex remain the main second-order beneficiaries to watch.',
      body: 'Signals remain most supportive in datacenter power demand, cooling infrastructure, and utility capex commentary. Risks remain valuation compression and delayed enterprise build cycles.',
      createdAt: '2026-05-20T09:00:00Z'
    }
  ],
  notes: [
    {
      id: 'note_1',
      targetType: 'thesis',
      targetId: 'thesis_1',
      body: 'Need better public-market mapping for power equipment and utility exposure.',
      createdAt: '2026-05-20T09:05:00Z'
    }
  ]
};
