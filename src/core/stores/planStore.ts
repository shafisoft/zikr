/**
 * Plan Store (Zustand) — the user-owned (personal) plan list.
 * Group plans are mirrored by the sharedRoom store into the same Dexie
 * tables; this store's liveQuery filters by the ('user', 'me') owner join.
 */

import { create } from 'zustand';
import { Plan, PlanStatus, Session } from '../db/types';
import { createRetryableSubscription } from '../services/errorRecovery';
import * as planService from '../services/planService';
import type { PlanProgress } from '../services/planService';

export type { PlanProgress };

interface PlanState {
  plans: Plan[];
  loading: boolean;
  error: string | null;
  initialize: () => () => void;
  // Write actions — the only way UI mutates personal plans. State refresh
  // flows back through the liveQuery subscription.
  addPlan: (plan: Omit<Plan, 'id'>) => Promise<string>;
  updatePlan: (id: string, patch: Partial<Plan>) => Promise<number>;
  setPlanStatus: (id: string, status: PlanStatus) => Promise<void>;
  deletePlan: (id: string) => Promise<void>;
  // Pure read helpers, re-exposed so UI never imports the service directly.
  getPlanZikrIds: (plan: Plan) => number[];
  computePlanProgress: (plan: Plan, sessions: Session[]) => PlanProgress;
}

export const usePlanStore = create<PlanState>((set) => ({
  plans: [],
  loading: true,
  error: null,

  initialize: () => {
    const unsubscribe = createRetryableSubscription(
      () => planService.getUserPlans(),
      (plans) => set({ plans, loading: false, error: null }),
      (_error) => set({
        // Error CODE, not localized copy — the component translates it.
        error: 'load-failed',
        loading: false
      })
    );

    return unsubscribe;
  },

  addPlan: (plan) => planService.add(plan),

  updatePlan: (id, patch) => planService.update(id, patch),

  setPlanStatus: (id, status) => planService.updateStatus(id, status),

  deletePlan: (id) => planService.deletePlan(id),

  getPlanZikrIds: (plan) => planService.getPlanZikrIds(plan),

  computePlanProgress: (plan, sessions) => planService.computePlanProgress(plan, sessions) as PlanProgress,
}));
