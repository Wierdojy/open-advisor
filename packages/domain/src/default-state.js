module.exports = {
  user: {
    id: 'user_keiferleaf',
    name: 'Keiferleaf',
    timezone: 'America/Los_Angeles',
    digestCadence: 'daily',
    researchPolicy: {
      urgent: 'fast_enrichment_only',
      digest: 'deeper_research_allowed',
      userQuestions: 'full_research_mode',
      dailyReportSchedule: '08:00 PT',
      inboxBeliefs: [
        {
          id: 'belief_profile_1',
          themeId: 'theme_1',
          stance: 'bullish',
          conviction: 'high',
          timeHorizon: '6-18 months',
          actionBias: 'buy_quality_on_weakness',
          preferredEvidence: ['earnings', 'capex', 'datacenter_demand'],
          disconfirmSignals: 'Cooling order slowdown, utility capex cuts, or hyperscaler pullbacks.'
        }
      ]
    }
  },
  sourceAdapters: [
    {
      id: 'adapter_sec',
      name: 'SEC Filings',
      tier: 'tier_1',
      status: 'healthy',
      lastSyncedAt: '2026-05-20T12:15:00Z',
      coverage: 'filings'
    },
    {
      id: 'adapter_exchange',
      name: 'Exchange Calendars',
      tier: 'tier_1',
      status: 'healthy',
      lastSyncedAt: '2026-05-20T12:05:00Z',
      coverage: 'earnings_and_listings'
    },
    {
      id: 'adapter_sector_news',
      name: 'Sector News Monitor',
      tier: 'tier_2',
      status: 'healthy',
      lastSyncedAt: '2026-05-20T13:58:00Z',
      coverage: 'reputable_news'
    }
  ],
  assets: [
    { id: 'asset_nvda', symbol: 'NVDA', name: 'NVIDIA', assetType: 'equity' },
    { id: 'asset_vrt', symbol: 'VRT', name: 'Vertiv', assetType: 'equity' },
    { id: 'asset_btc', symbol: 'BTC', name: 'Bitcoin', assetType: 'crypto' },
    { id: 'asset_xlu', symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund', assetType: 'etf' },
    { id: 'asset_avgo', symbol: 'AVGO', name: 'Broadcom', assetType: 'equity' }
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
  themes: [
    {
      id: 'theme_1',
      title: 'AI power infrastructure',
      status: 'active',
      summary: 'Power, cooling, and grid beneficiaries of AI datacenter buildout.',
      hypothesis: 'AI compute demand remains durable enough to create second-order infrastructure winners.',
      monitoringPlan: 'Watch utility capex, cooling vendors, and grid spend as confirmation signals.',
      assetIds: ['asset_nvda', 'asset_vrt', 'asset_xlu']
    }
  ],
  canonicalEvents: [
    {
      id: 'event_1',
      eventType: 'earnings',
      title: 'NVDA earnings tomorrow',
      factualSummary: 'NVIDIA reports earnings on the next market session close.',
      recordedAt: '2026-05-20T12:30:00Z',
      scheduledFor: '2026-05-21T20:00:00Z',
      assetId: 'asset_nvda',
      themeId: 'theme_1',
      sourceAdapterId: 'adapter_exchange',
      sourceLabel: 'Company IR calendar',
      sourceTier: 'tier_1',
      importance: 'critical',
      truthStatus: 'confirmed'
    },
    {
      id: 'event_2',
      eventType: 'news',
      title: 'Utility capex guidance revised upward',
      factualSummary: 'A utility operator revised forward capex guidance upward with datacenter demand named as a supporting factor.',
      recordedAt: '2026-05-20T14:00:00Z',
      scheduledFor: '2026-05-20T14:00:00Z',
      assetId: 'asset_xlu',
      themeId: 'theme_1',
      sourceAdapterId: 'adapter_sector_news',
      sourceLabel: 'Sector news monitor',
      sourceTier: 'tier_2',
      importance: 'high',
      truthStatus: 'confirmed',
      marketContext: {
        changePercent: 2.8,
        direction: 'up'
      }
    },
    {
      id: 'event_3',
      eventType: 'market_change',
      title: 'VRT extends breakout after cooling order commentary',
      factualSummary: 'Vertiv moved higher after commentary pointed to resilient cooling demand tied to AI datacenter buildouts.',
      recordedAt: '2026-05-20T15:20:00Z',
      scheduledFor: '2026-05-20T15:20:00Z',
      assetId: 'asset_vrt',
      themeId: 'theme_1',
      sourceAdapterId: 'adapter_sector_news',
      sourceLabel: 'Live market feed',
      sourceTier: 'tier_1',
      importance: 'high',
      truthStatus: 'developing',
      marketContext: {
        changePercent: 5.6,
        price: 97.34,
        direction: 'up'
      }
    },
    {
      id: 'event_4',
      eventType: 'news',
      title: 'Semiconductor basket leadership broadens beyond mega-cap AI names',
      factualSummary: 'A cluster of AI-adjacent semiconductor suppliers outperformed as investors rotated into second-derivative beneficiaries.',
      recordedAt: '2026-05-20T16:10:00Z',
      scheduledFor: '2026-05-20T16:10:00Z',
      assetId: 'asset_avgo',
      themeId: 'theme_1',
      sourceAdapterId: 'adapter_sector_news',
      sourceLabel: 'News basket monitor',
      sourceTier: 'tier_2',
      importance: 'normal',
      truthStatus: 'confirmed'
    }
  ],
  inboxItems: [
    {
      id: 'inbox_1',
      eventId: 'event_1',
      state: 'new',
      priority: 'critical',
      reason: 'You hold NVDA and it anchors your AI infrastructure theme.',
      nextStep: 'Review expectations and set a post-earnings follow-up.',
      createdAt: '2026-05-20T12:31:00Z',
      deliveryKind: 'in_app'
    },
    {
      id: 'inbox_2',
      eventId: 'event_2',
      state: 'new',
      priority: 'high',
      reason: 'Supports second-order infrastructure spend tied to AI datacenter demand.',
      nextStep: 'Check whether the capex signal broadens beyond one operator.',
      createdAt: '2026-05-20T14:02:00Z',
      deliveryKind: 'in_app'
    },
    {
      id: 'inbox_3',
      eventId: 'event_3',
      state: 'new',
      priority: 'high',
      score: 62,
      reason: 'The move reinforces your AI infrastructure belief and touches a watchlist name.',
      nextStep: 'Decide whether this confirms durable cooling demand or just momentum chasing.',
      createdAt: '2026-05-20T15:21:00Z',
      deliveryKind: 'in_app',
      suggestionType: 'thesis_check'
    },
    {
      id: 'inbox_4',
      eventId: 'event_4',
      state: 'new',
      priority: 'normal',
      score: 35,
      reason: 'Useful context for the daily report because leadership is broadening beyond a single AI winner.',
      nextStep: 'Roll into the daily report unless another confirming signal hits the same theme.',
      createdAt: '2026-05-20T16:12:00Z',
      deliveryKind: 'in_app',
      suggestionType: 'monitor'
    }
  ],
  reminders: [
    {
      id: 'reminder_1',
      title: 'Review NVDA before earnings',
      state: 'open',
      dueAt: '2026-05-21T13:00:00Z',
      relatedType: 'event',
      relatedId: 'event_1',
      note: 'Check expectations, your thesis, and whether you want a post-earnings follow-up.'
    }
  ],
  digests: [
    {
      id: 'digest_2026_05_20',
      date: '2026-05-20',
      title: 'Today matters because two tracked signals crossed your threshold.',
      itemIds: ['inbox_1', 'inbox_2'],
      summary: 'NVDA earnings and a utility capex update are the two highest-signal items in your tracked graph today.',
      createdAt: '2026-05-20T15:00:00Z'
    }
  ],
  deliveryQueue: [
    {
      id: 'delivery_1',
      targetType: 'digest',
      targetId: 'digest_2026_05_20',
      channel: 'in_app',
      status: 'delivered',
      deliveredAt: '2026-05-20T15:00:10Z'
    }
  ],
  researchJobs: [
    {
      id: 'research_job_1',
      status: 'completed',
      mode: 'full_research_mode',
      triggerType: 'digest',
      targetType: 'theme',
      targetId: 'theme_1',
      relatedEventId: 'event_2',
      question: 'What changed in the AI power infrastructure theme over the last 7 days?',
      createdAt: '2026-05-20T15:02:00Z',
      completedAt: '2026-05-20T15:03:00Z'
    }
  ],
  researchReports: [
    {
      id: 'research_report_1',
      jobId: 'research_job_1',
      relatedEventId: 'event_2',
      title: 'AI power infrastructure weekly check',
      summary: 'Power, cooling, and utility capex remain the main second-order beneficiaries to watch.',
      nextCheck: 'Revisit after NVDA earnings and the next utility capex commentary.',
      confidence: 0.67,
      freshnessAt: '2026-05-20T15:03:00Z',
      expiresAt: '2026-05-23T15:03:00Z',
      inferenceProvider: 'unconnected_stub',
      createdAt: '2026-05-20T15:03:00Z'
    }
  ],
  researchSources: [
    {
      id: 'research_source_1',
      reportId: 'research_report_1',
      title: 'Sector news monitor event',
      url: null,
      publisher: 'Sector news monitor',
      tier: 'tier_2',
      publishedAt: '2026-05-20T14:00:00Z'
    },
    {
      id: 'research_source_2',
      reportId: 'research_report_1',
      title: 'NVIDIA investor relations calendar',
      url: null,
      publisher: 'Company IR calendar',
      tier: 'tier_1',
      publishedAt: '2026-05-20T12:30:00Z'
    }
  ],
  researchClaims: [
    {
      id: 'research_claim_1',
      reportId: 'research_report_1',
      claim: 'Utility capex commentary is still one of the cleanest confirmation signals for the theme.',
      confidence: 0.67,
      supportedBySourceIds: ['research_source_1']
    }
  ],
  eventEnrichments: [
    {
      id: 'enrichment_1',
      eventId: 'event_2',
      reportId: 'research_report_1',
      summary: 'The event matters because it reinforces demand spillover from AI datacenter buildout into utilities and grid spend.',
      confidence: 0.67,
      freshnessAt: '2026-05-20T15:03:00Z',
      expiresAt: '2026-05-23T15:03:00Z'
    }
  ],
  notes: [
    {
      id: 'note_1',
      targetType: 'theme',
      targetId: 'theme_1',
      body: 'Need better public-market mapping for power equipment and utility exposure.',
      createdAt: '2026-05-20T15:10:00Z'
    }
  ],
  auditLog: [
    {
      id: 'audit_1',
      action: 'seed_loaded',
      entityType: 'system',
      entityId: 'default_state',
      summary: 'Loaded deterministic core seed state.',
      createdAt: '2026-05-20T15:00:00Z'
    }
  ]
};
