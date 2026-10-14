/**
 * Feedback backend factory.
 *
 *   - VITE_SHARED_ROOMS_BACKEND=mock  → MockFeedbackBackend (no network)
 *   - otherwise                        → SupabaseFeedbackBackend
 *
 * Shares the env flag with shared rooms and zikr sync: all three features
 * talk to the same Supabase project, so one switch controls the backend.
 */

import type { FeedbackBackend } from './contract';
import { SupabaseFeedbackBackend } from './supabaseBackend';
import { MockFeedbackBackend } from './mockBackend';

export function createFeedbackBackend(): FeedbackBackend {
  const mode = import.meta.env.VITE_SHARED_ROOMS_BACKEND;
  if (mode === 'mock') {
    return new MockFeedbackBackend();
  }
  return new SupabaseFeedbackBackend();
}
