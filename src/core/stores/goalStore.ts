import { create } from 'zustand';
import { db } from '../db/db';
import { Goal, Session } from '../db/types';
import { createRetryableSubscription } from '../services/errorRecovery';
import * as goalService from '../services/goalService';
import type { Progress } from '../services/goalService';

interface GoalState {
  goals: Goal[];
  loading: boolean;
  error: string | null;
  initialize: () => () => void;
  // Write actions — the only way UI mutates goals. State refresh flows back
  // through the liveQuery subscription.
  addGoal: (goal: Omit<Goal, 'id'>) => Promise<number>;
  updateGoal: (id: number, patch: Partial<Goal>) => Promise<number>;
  setGoalStatus: (id: number, status: Goal['status']) => Promise<void>;
  deleteGoal: (id: number) => Promise<void>;
  // Pure read helpers, re-exposed so UI never imports the service directly.
  getGoalZikrIds: (goal: Goal) => number[];
  calculateProgress: (goal: Goal, sessions: Session[]) => Progress;
}

export const useGoalStore = create<GoalState>((set) => ({
  goals: [],
  loading: true,
  error: null,

  initialize: () => {
    const unsubscribe = createRetryableSubscription(
      () => db.goals.toArray(),
      (goals) => set({ goals, loading: false, error: null }),
      (_error) => set({
        error: 'Failed to load goals. Please check browser storage permissions.',
        loading: false
      })
    );

    return unsubscribe;
  },

  addGoal: (goal) => goalService.add(goal),

  updateGoal: (id, patch) => goalService.update(id, patch),

  setGoalStatus: (id, status) => goalService.updateStatus(id, status),

  deleteGoal: (id) => goalService.deleteGoal(id),

  getGoalZikrIds: (goal) => goalService.getGoalZikrIds(goal),

  calculateProgress: (goal, sessions) => goalService.calculateProgress(goal, sessions) as Progress,
}));
