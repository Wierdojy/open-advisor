const { buildPortfolioAnalytics } = require('./analytics');

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function makeSource(id, title, url, publisher, publishedAt, snippet) {
  return {
    id,
    title,
    url,
    publisher,
    published_at: publishedAt,
    accessed_at: new Date().toISOString().slice(0, 10),
    snippet
  };
}

function buildFollowUps(question, analytics, topSector) {
  const benchmarkLabel = analytics.benchmark.label;
  return [
    `Show this against the ${benchmarkLabel} over a different timeframe.`,
    `What are the suggested rebalancing steps for ${topSector || 'my largest sector'}?`,
    'Which position contributes most to portfolio beta right now?',
    'What assumptions would change this recommendation?',
    `Turn the main risk into a reminder or research follow-up.`
  ];
}

function buildActionSuggestion(analytics, activeWeight, topSector) {
  const techDelta = analytics.comparison.activeTechExposure;
  const direction = techDelta > 0 ? 'reduce' : 'increase';
  const amount = Math.max(2, Math.min(6, Math.round(Math.abs(techDelta) / 2) || 3));
  const action = topSector === 'Information Technology'
    ? `${direction === 'reduce' ? 'Trim' : 'Add'} diversified technology exposure by roughly ${amount}-${amount + 2}% of portfolio weight.`
    : `Rebalance roughly ${amount}-${amount + 2}% toward the benchmark sector mix, starting with ${topSector || 'your largest active weight'}.`;

  return {
    type: 'action_suggestion',
    id: 'act_rebalance',
    title: 'Possible rebalance path',
    action,
    rationale: `Current active exposure versus ${analytics.benchmark.label} is ${round(activeWeight, 1)} percentage points in ${topSector || 'the leading sector'}.`,
    impact: {
      expected_benefit: 'Closer benchmark tracking with a more balanced risk profile.',
      principal_risk: 'Reduced upside if the currently overweight segment continues to lead.'
    },
    suitability: 'needs_user_confirmation',
    assumptions: [
      'No tax constraints were provided.',
      'No account-level trading restrictions were provided.',
      'The benchmark is an acceptable reference for this portfolio.'
    ],
    missing_inputs: ['tax_lot_preferences', 'liquidity_constraints'],
    citation_ids: ['src_holdings', 'src_benchmark']
  };
}

function buildChatAnalysis(state, input = {}) {
  const question = String(input.message || input.question || 'Analyze my portfolio').trim();
  const benchmark = input.benchmark || 'nasdaq-100';
  const analytics = buildPortfolioAnalytics(state, benchmark);
  const topSector = analytics.sectorBreakdown[0]?.sector || null;
  const topSectorActiveWeight = analytics.sectorBreakdown[0]?.activeWeight || 0;
  const hasTechQuestion = /tech|nasdaq|benchmark|rebalance|performance|beta|diversification/i.test(question);

  const sources = [
    makeSource('src_holdings', 'Current portfolio holdings snapshot', null, 'Open Advisor', new Date().toISOString().slice(0, 10), 'Derived from the active holdings and current pricing model in the workspace.'),
    makeSource('src_benchmark', `${analytics.benchmark.label} benchmark comparison`, null, 'Open Advisor Analytics', new Date().toISOString().slice(0, 10), `Benchmark comparison uses ${analytics.benchmark.label} as the reference set.`),
    makeSource('src_sector', 'Sector exposure breakdown', null, 'Open Advisor Analytics', new Date().toISOString().slice(0, 10), 'Sector weights are computed from current positions and modeled market values.')
  ];

  const cards = [
    {
      type: 'analysis',
      id: 'analysis_main',
      title: 'What stands out',
      bullets: [
        analytics.summary.topLine,
        `Portfolio beta is ${analytics.metrics.portfolioBeta} and diversification score is ${analytics.metrics.diversificationScore}/100.`,
        `${topSector || 'The leading sector'} is the largest sector tilt relative to ${analytics.benchmark.label}.`
      ],
      citation_ids: ['src_holdings', 'src_sector']
    },
    {
      type: 'benchmark_comparison',
      id: 'benchmark_main',
      subject: 'Current portfolio',
      benchmark: analytics.benchmark.label,
      metrics: [
        {
          label: 'Technology exposure',
          subject_value: `${analytics.comparison.techExposure}%`,
          benchmark_value: `${analytics.comparison.benchmarkTechExposure}%`,
          delta: `${analytics.comparison.activeTechExposure > 0 ? '+' : ''}${analytics.comparison.activeTechExposure}%`,
          direction: analytics.comparison.activeTechExposure >= 0 ? 'overweight' : 'underweight'
        },
        {
          label: 'Portfolio beta',
          subject_value: String(analytics.metrics.portfolioBeta),
          benchmark_value: '1.00',
          delta: `${analytics.metrics.portfolioBeta >= 1 ? '+' : ''}${round(analytics.metrics.portfolioBeta - 1, 2)}`,
          direction: analytics.metrics.portfolioBeta >= 1 ? 'higher_risk' : 'lower_risk'
        },
        {
          label: 'Diversification score',
          subject_value: `${analytics.metrics.diversificationScore}/100`,
          benchmark_value: '80/100',
          delta: `${analytics.metrics.diversificationScore - 80 >= 0 ? '+' : ''}${analytics.metrics.diversificationScore - 80}`,
          direction: analytics.metrics.diversificationScore >= 80 ? 'better_diversified' : 'less_diversified'
        }
      ],
      takeaway: analytics.summary.topLine,
      methodology_note: 'Weights are based on modeled current market value per position and benchmark-relative sector heuristics.',
      citation_ids: ['src_benchmark', 'src_sector']
    },
    {
      type: 'risk_flag',
      id: 'risk_top_sector',
      severity: Math.abs(topSectorActiveWeight) >= 10 ? 'high' : 'medium',
      title: `${topSector || 'Primary sector'} concentration is the main active risk`,
      description: `${topSector || 'This sector'} is ${round(topSectorActiveWeight, 1)} percentage points away from the benchmark mix.`,
      citation_ids: ['src_sector']
    },
    buildActionSuggestion(analytics, topSectorActiveWeight, topSector)
  ];

  if (hasTechQuestion && analytics.currentPositions[0]) {
    cards.splice(2, 0, {
      type: 'position_detail',
      id: 'position_top',
      title: `${analytics.currentPositions[0].symbol || analytics.currentPositions[0].name} is the largest position contributor`,
      metrics: [
        { label: 'Weight', value: `${analytics.currentPositions[0].weight}%` },
        { label: '1D move', value: `${analytics.currentPositions[0].changePct1d > 0 ? '+' : ''}${analytics.currentPositions[0].changePct1d}%` },
        { label: 'Beta', value: String(analytics.currentPositions[0].beta) }
      ],
      citation_ids: ['src_holdings']
    });
  }

  return {
    answer: {
      headline: analytics.summary.topLine,
      summary: `${analytics.currentPositions.length} positions are active, with portfolio beta ${analytics.metrics.portfolioBeta} and diversification score ${analytics.metrics.diversificationScore}/100.`,
      tone: 'informative'
    },
    cards,
    confidence: {
      score: 0.78,
      label: 'medium_high',
      reason: 'Current holdings and benchmark comparison were available, but taxes, constraints, and real execution costs were not provided.',
      missing_inputs: ['tax_constraints', 'account_restrictions', 'execution_preferences']
    },
    follow_ups: buildFollowUps(question, analytics, topSector),
    sources,
    disclaimer: {
      type: 'not_investment_advice',
      text: 'Illustrative analysis only; suitability depends on objectives, taxes, liquidity, and account restrictions.'
    },
    meta: {
      benchmark: analytics.benchmark.id,
      generated_at: new Date().toISOString()
    }
  };
}

module.exports = {
  buildChatAnalysis
};
