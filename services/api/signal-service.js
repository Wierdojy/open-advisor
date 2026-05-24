function nowIso() {
  return new Date().toISOString();
}

function addDays(iso, days) {
  const date = new Date(iso || Date.now());
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 %._:-]/g, '');
}

function summarizeMagnitude(changePercent) {
  const abs = Math.abs(Number(changePercent || 0));
  if (abs >= 8) return 'sharp';
  if (abs >= 4) return 'meaningful';
  if (abs >= 2) return 'notable';
  if (abs > 0) return 'modest';
  return null;
}

function buildFingerprint(input, asset) {
  if (input.dedupeKey) return normalizeText(input.dedupeKey);
  const symbol = normalizeText(input.symbol || asset?.symbol || input.assetId || 'unknown');
  const eventType = normalizeText(input.eventType || input.type || 'custom');
  const title = normalizeText(input.title || 'untitled event');
  const sourceLabel = normalizeText(input.sourceLabel || 'manual');
  return [symbol, eventType, title, sourceLabel].filter(Boolean).join('::');
}

function priorityRank(priority) {
  return { critical: 4, high: 3, normal: 2, low: 1 }[priority] || 0;
}

function computeRelationships(state, assetId, explicitThemeId) {
  const holdingMatches = (state.holdings || []).filter((holding) => holding.assetId === assetId);
  const watchlistMatches = (state.watchlists || []).filter((watchlist) => (watchlist.itemAssetIds || []).includes(assetId));
  const themeMatches = (state.themes || []).filter((theme) => theme.id === explicitThemeId || (theme.assetIds || []).includes(assetId));

  return {
    holdingMatches,
    watchlistMatches,
    themeMatches,
    isHeld: holdingMatches.length > 0,
    isWatched: watchlistMatches.length > 0,
    isThematic: themeMatches.length > 0
  };
}

function computeScore(input, relationships) {
  const sourceWeight = { tier_1: 20, tier_2: 14, tier_3: 8, tier_4: 3 }[input.sourceTier || 'tier_3'] || 0;
  const importanceWeight = { critical: 35, high: 24, normal: 14, low: 6 }[input.importance || 'normal'] || 0;
  const eventTypeWeight = {
    earnings: 12,
    filing: 12,
    listing: 8,
    macro: 8,
    market_change: 10,
    price_move: 10,
    news: 5,
    thesis_update: 7,
    custom: 4
  }[input.eventType || input.type || 'custom'] || 4;

  const changePercent = Number(input.changePercent || input.marketChangePercent || 0);
  const absChange = Math.abs(changePercent);
  const magnitudeWeight = absChange >= 8 ? 18 : absChange >= 4 ? 10 : absChange >= 2 ? 5 : absChange > 0 ? 2 : 0;
  const relationshipWeight =
    (relationships.isHeld ? 22 : 0) +
    (relationships.isWatched ? 10 : 0) +
    Math.min(18, relationships.themeMatches.length * 8);

  return sourceWeight + importanceWeight + eventTypeWeight + magnitudeWeight + relationshipWeight;
}

function scoreToPriority(score, input) {
  if (input.priority) return input.priority;
  if (score >= 70) return 'critical';
  if (score >= 48) return 'high';
  if (score >= 28) return 'normal';
  return 'low';
}

function buildReason(input, asset, relationships) {
  const parts = [];
  const symbol = asset?.symbol || asset?.name || 'This asset';
  const changePercent = Number(input.changePercent || input.marketChangePercent || 0);
  const magnitude = summarizeMagnitude(changePercent);

  if (relationships.isHeld) parts.push(`You hold ${symbol}.`);
  if (relationships.isWatched) parts.push(`${symbol} is on an active watchlist.`);
  if (relationships.themeMatches.length > 0) {
    const titles = relationships.themeMatches.slice(0, 2).map((theme) => theme.title).join(' and ');
    parts.push(`It maps to ${titles}.`);
  }
  if (changePercent) {
    const direction = changePercent > 0 ? 'up' : 'down';
    parts.push(`${symbol} moved ${direction} ${Math.abs(changePercent).toFixed(1)}%${magnitude ? ` on a ${magnitude} move` : ''}.`);
  }
  if (input.whyItMatters) parts.push(input.whyItMatters);
  if (!parts.length && input.factualSummary) parts.push(input.factualSummary);

  return parts.join(' ').trim() || 'A tracked signal changed and may require review.';
}

function buildNextStep(input, priority, relationships) {
  if (input.nextStep) return input.nextStep;
  const eventType = input.eventType || input.type || 'custom';

  if (eventType === 'earnings') return 'Review expectations before the event and queue a post-event check.';
  if (eventType === 'filing') return 'Read the new filing delta and decide whether it changes your thesis.';
  if (eventType === 'market_change' || eventType === 'price_move') {
    if (priority === 'critical' || priority === 'high') {
      return relationships.themeMatches.length > 0
        ? 'Check whether this move confirms or breaks the linked thesis, then decide if follow-up research is needed.'
        : 'Review the move, confirm the trigger, and decide whether to schedule a follow-up.';
    }
    return 'Monitor whether the move persists or broadens before taking action.';
  }
  if (relationships.themeMatches.length > 0) return 'Decide whether this signal confirms, weakens, or changes the linked thesis.';
  return 'Decide whether this needs research, a reminder, or no action.';
}

function buildSuggestionType(priority, relationships, input) {
  if (input.suggestionType) return input.suggestionType;
  if (priority === 'critical') return 'investigate_now';
  if (priority === 'high' && relationships.isHeld) return 'position_check';
  if (relationships.themeMatches.length > 0) return 'thesis_check';
  return 'monitor';
}

function findExistingEvent(state, fingerprint, assetId, eventType) {
  const candidates = (state.canonicalEvents || []).filter((event) => {
    const existingFingerprint = event.realtimeMeta?.fingerprint || event.eventFingerprint || null;
    if (existingFingerprint && existingFingerprint === fingerprint) return true;
    return event.assetId === assetId && event.eventType === eventType;
  });

  if (!candidates.length) return null;
  return candidates.sort((a, b) => new Date(b.recordedAt || 0) - new Date(a.recordedAt || 0))[0];
}

function findInboxByEventId(state, eventId) {
  return (state.inboxItems || []).find((item) => item.eventId === eventId) || null;
}

function upsertDelivery(state, payload, helpers) {
  const delivery = {
    id: helpers.makeId('delivery'),
    targetType: payload.targetType || 'inbox_item',
    targetId: payload.targetId,
    channel: payload.channel || 'in_app',
    status: payload.status || 'queued',
    queuedAt: payload.queuedAt || helpers.nowIso(),
    deliveredAt: payload.deliveredAt || null,
    reason: payload.reason || 'signal_ingested',
    priority: payload.priority || 'normal'
  };
  state.deliveryQueue = state.deliveryQueue || [];
  state.deliveryQueue.unshift(delivery);
  return delivery;
}

function maybeCreateReminder(state, event, inboxItem, input, helpers) {
  if (input.createReminder === false) return null;
  if (!['critical', 'high'].includes(inboxItem.priority)) return null;
  const existing = (state.reminders || []).find((item) => item.relatedType === 'event' && item.relatedId === event.id && item.state !== 'done');
  if (existing) return { reminder: existing, created: false };

  const reminder = {
    id: helpers.makeId('reminder'),
    title: input.reminderTitle || `Follow up: ${event.title}`,
    state: 'open',
    dueAt: input.reminderDueAt || event.scheduledFor || addDays(helpers.nowIso(), 1),
    relatedType: 'event',
    relatedId: event.id,
    note: inboxItem.nextStep
  };
  state.reminders = state.reminders || [];
  state.reminders.push(reminder);
  return { reminder, created: true };
}

function ingestSignal(state, input, helpers) {
  const asset = input.assetId || input.symbol || input.name ? helpers.ensureAsset(state, input) : null;
  const relationships = computeRelationships(state, asset?.id || input.assetId || null, input.themeId || input.thesisId || null);
  const score = Number(input.score != null ? input.score : computeScore(input, relationships));
  const priority = scoreToPriority(score, input);
  const suggestionType = buildSuggestionType(priority, relationships, input);
  const fingerprint = buildFingerprint(input, asset);
  const themeId = input.themeId || input.thesisId || relationships.themeMatches[0]?.id || null;
  const reason = buildReason(input, asset, relationships);
  const nextStep = buildNextStep(input, priority, relationships);
  const eventType = input.eventType || input.type || 'custom';
  const timestamp = input.recordedAt || input.occurredAt || helpers.nowIso();
  const scheduledFor = input.scheduledFor || input.recordedAt || input.occurredAt || timestamp;
  const existingEvent = findExistingEvent(state, fingerprint, asset?.id || input.assetId || null, eventType);

  let event;
  let inboxItem;
  let mode = 'created';

  if (existingEvent) {
    mode = 'merged';
    existingEvent.title = input.title || existingEvent.title;
    existingEvent.factualSummary = input.factualSummary || input.summary || existingEvent.factualSummary;
    existingEvent.recordedAt = timestamp;
    existingEvent.scheduledFor = scheduledFor;
    existingEvent.themeId = themeId || existingEvent.themeId || null;
    existingEvent.sourceAdapterId = input.sourceAdapterId || existingEvent.sourceAdapterId || null;
    existingEvent.sourceLabel = input.sourceLabel || existingEvent.sourceLabel || 'Manual entry';
    existingEvent.sourceTier = input.sourceTier || existingEvent.sourceTier || 'tier_3';
    existingEvent.importance = input.importance || existingEvent.importance || priority;
    existingEvent.truthStatus = input.truthStatus || existingEvent.truthStatus || 'confirmed';
    existingEvent.marketContext = {
      ...(existingEvent.marketContext || {}),
      changePercent: input.changePercent ?? existingEvent.marketContext?.changePercent ?? null,
      price: input.price ?? existingEvent.marketContext?.price ?? null,
      direction: input.direction || existingEvent.marketContext?.direction || null,
      detectedAt: timestamp,
      volumeDeltaPercent: input.volumeDeltaPercent ?? existingEvent.marketContext?.volumeDeltaPercent ?? null
    };
    existingEvent.realtimeMeta = {
      ...(existingEvent.realtimeMeta || {}),
      fingerprint,
      score,
      suggestionType,
      matchedThemeIds: relationships.themeMatches.map((theme) => theme.id),
      matchedWatchlistNames: relationships.watchlistMatches.map((watchlist) => watchlist.name),
      matchedHoldingIds: relationships.holdingMatches.map((holding) => holding.id),
      updateCount: Number(existingEvent.realtimeMeta?.updateCount || 0) + 1,
      lastSeenAt: helpers.nowIso()
    };
    event = existingEvent;
    inboxItem = findInboxByEventId(state, event.id);
    if (inboxItem) {
      inboxItem.state = 'new';
      inboxItem.priority = priority;
      inboxItem.score = score;
      inboxItem.reason = reason;
      inboxItem.nextStep = nextStep;
      inboxItem.updatedAt = helpers.nowIso();
      inboxItem.suggestionType = suggestionType;
      inboxItem.dedupeKey = fingerprint;
      inboxItem.deliveryKind = input.deliveryKind || inboxItem.deliveryKind || 'in_app';
      inboxItem.explanation = {
        matchedThemes: relationships.themeMatches.map((theme) => theme.title),
        matchedWatchlists: relationships.watchlistMatches.map((watchlist) => watchlist.name),
        isHeld: relationships.isHeld,
        sourceTier: input.sourceTier || event.sourceTier || 'tier_3'
      };
    }
  } else {
    event = {
      id: helpers.makeId('event'),
      eventType,
      title: input.title || 'Untitled Event',
      factualSummary: input.factualSummary || input.summary || '',
      recordedAt: timestamp,
      scheduledFor,
      assetId: asset ? asset.id : input.assetId || null,
      themeId,
      sourceAdapterId: input.sourceAdapterId || null,
      sourceLabel: input.sourceLabel || 'Manual entry',
      sourceTier: input.sourceTier || 'tier_3',
      importance: input.importance || priority,
      truthStatus: input.truthStatus || 'confirmed',
      marketContext: {
        changePercent: input.changePercent ?? input.marketChangePercent ?? null,
        price: input.price ?? null,
        direction: input.direction || null,
        detectedAt: timestamp,
        volumeDeltaPercent: input.volumeDeltaPercent ?? null
      },
      realtimeMeta: {
        fingerprint,
        score,
        suggestionType,
        matchedThemeIds: relationships.themeMatches.map((theme) => theme.id),
        matchedWatchlistNames: relationships.watchlistMatches.map((watchlist) => watchlist.name),
        matchedHoldingIds: relationships.holdingMatches.map((holding) => holding.id),
        updateCount: 1,
        lastSeenAt: helpers.nowIso()
      }
    };
    state.canonicalEvents = state.canonicalEvents || [];
    state.canonicalEvents.unshift(event);

    inboxItem = {
      id: helpers.makeId('inbox'),
      eventId: event.id,
      state: 'new',
      priority,
      score,
      reason,
      nextStep,
      createdAt: helpers.nowIso(),
      updatedAt: helpers.nowIso(),
      deliveryKind: input.deliveryKind || 'in_app',
      suggestionType,
      dedupeKey: fingerprint,
      explanation: {
        matchedThemes: relationships.themeMatches.map((theme) => theme.title),
        matchedWatchlists: relationships.watchlistMatches.map((watchlist) => watchlist.name),
        isHeld: relationships.isHeld,
        sourceTier: input.sourceTier || 'tier_3'
      }
    };
    state.inboxItems = state.inboxItems || [];
    state.inboxItems.unshift(inboxItem);
  }

  const reminderResult = maybeCreateReminder(state, event, inboxItem, input, helpers);
  const delivery = upsertDelivery(state, {
    targetId: inboxItem.id,
    channel: inboxItem.deliveryKind,
    status: 'queued',
    reason: mode === 'merged' ? 'signal_updated' : 'signal_ingested',
    priority: inboxItem.priority
  }, helpers);

  return {
    mode,
    event,
    inboxItem,
    reminder: reminderResult ? reminderResult.reminder : null,
    reminderCreated: reminderResult ? reminderResult.created : false,
    delivery,
    score,
    priority,
    suggestionType,
    relationships: {
      holdingIds: relationships.holdingMatches.map((item) => item.id),
      watchlistIds: relationships.watchlistMatches.map((item) => item.id),
      themeIds: relationships.themeMatches.map((item) => item.id)
    }
  };
}

module.exports = {
  ingestSignal
};
