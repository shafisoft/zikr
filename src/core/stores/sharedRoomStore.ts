/**
 * Shared Room Store (Zustand)
 * State for the Group tab: identity, joined groups, the currently open
 * group with its plans, my local contribution history, and sync status.
 */

import { create } from 'zustand';
import { db } from '../db/db';
import {
  Plan,
  SharedIdentity,
  SharedMember,
  SharedRoom,
  SharedSubmission,
} from '../db/types';
import { isValidDelta, normalizeRoomCode } from '../utils/sharedRoomUtils';
import { createRetryableSubscription } from '../services/errorRecovery';
import sharedRoomService, {
  ensureSharedRoomSync,
  setActiveRoom,
  SharedRoomError,
} from '../services/sharedRoom';
import type { CreatePlanInput } from '../services/sharedRoom';

/**
 * Dexie is the group-plan mirror's source of truth — server fetches persist
 * into it and counter propagation writes into it — so the store subscribes
 * to it instead of holding a hand-merged copy that goes stale between
 * syncs. Started once with init(); never torn down (app-lifetime).
 */
let plansSubscription: (() => void) | null = null;


interface SharedRoomState {
  initialized: boolean;
  configured: boolean;
  identity: SharedIdentity | null;
  rooms: SharedRoom[];
  /** All mirrored (group) plans — Room/Group pages slice per roomCode. */
  plans: Plan[];
  currentRoom: SharedRoom | null;
  currentPlans: Plan[];
  currentMembers: SharedMember[];
  isMember: boolean;
  mySubmissions: SharedSubmission[];
  syncing: boolean;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  /** Synchronous backend-availability check (nav visibility, pre-init). */
  isBackendConfigured: () => boolean;
  /** Deliver queued contributions now, then refresh rooms. */
  flushOutbox: () => Promise<void>;
  refresh: () => Promise<void>;
  openRoom: (code: string) => Promise<void>;
  closeCurrentRoom: () => void;
  refreshCurrentRoom: () => Promise<void>;
  submit: (delta: number, planId: string, zikrName: string) => Promise<void>;
  createRoom: (input: {
    title: string;
    initialPlan: CreatePlanInput;
    windowType?: string;
  }) => Promise<SharedRoom>;
  /** Owner adds another plan to the current room. */
  createPlan: (code: string, input: CreatePlanInput) => Promise<void>;
  /** Owner retires a plan early. */
  endPlan: (code: string, planId: string) => Promise<void>;
  joinRoom: (code: string) => Promise<SharedRoom>;
  leaveRoom: (code: string) => Promise<void>;
  closeRoom: (code: string) => Promise<void>;
  removeMember: (code: string, userId: string) => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  track: (name: string, properties?: Record<string, unknown>) => Promise<void>;
  flush: () => Promise<void>;
  clearError: () => void;
}

/**
 * Store errors hold a SharedRoomErrorCode (or 'unknown'); the UI renders
 * them via the `errors.*` i18n keys so they follow the active language.
 * Localized-string rendering lives in ui/utils/roomErrors.ts.
 */
function errorCode(err: unknown): string {
  return err instanceof SharedRoomError ? err.code : 'unknown';
}

/** Re-exported so the UI can instanceof-check without importing services. */
export { SharedRoomError };

export const useSharedRoomStore = create<SharedRoomState>((set, get) => ({
  initialized: false,
  configured: true,
  identity: null,
  rooms: [],
  plans: [],
  currentRoom: null,
  currentPlans: [],
  currentMembers: [],
  isMember: false,
  mySubmissions: [],
  syncing: false,
  loading: false,
  error: null,

  isBackendConfigured() {
    return sharedRoomService.isConfigured();
  },

  async flushOutbox() {
    await sharedRoomService.flushOutbox();
  },

  async init() {
    const configured = sharedRoomService.isConfigured();
    set({ configured });
    if (!configured) {
      set({ initialized: true, rooms: [], plans: [] });
      return;
    }

    ensureSharedRoomSync();

    // Keep the mirrored plans reactive: any write into Dexie (a server
    // fetch, a counter round propagating) re-emits here.
    if (!plansSubscription) {
      plansSubscription = createRetryableSubscription(
        () => db.plans.filter(p => p.roomCode != null).toArray(),
        (plans) => set({ plans }),
        () => {}
      );
    }

    try {
      const identity = await sharedRoomService.ensureIdentity(get().identity?.displayName);
      const [rooms, plans] = await Promise.all([
        sharedRoomService.listRooms(),
        sharedRoomService.listSharedPlans(),
      ]);
      set({ initialized: true, identity, rooms, plans });
      // Deliver anything queued from previous sessions.
      await get().flush();
    } catch (err) {
      // Store the raw code — the UI translates it (errorToMessage would
      // double-translate here and render a literal "errors." prefix).
      set({ initialized: true, error: errorCode(err) });
    }
  },

  async refresh() {
    const [rooms, plans] = await Promise.all([
      sharedRoomService.listRooms(),
      sharedRoomService.listSharedPlans(),
    ]);
    set({ rooms, plans });
  },

  async openRoom(code) {
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      set({ error: 'invalid-input' });
      return;
    }
    set({ loading: true, error: null });
    setActiveRoom(normalized);
    try {
      // Show the cache instantly (deep links may have nothing cached).
      const cached = await sharedRoomService.getRoom(normalized);
      if (cached) set({ currentRoom: cached });
      const cachedPlans = await sharedRoomService.getRoomPlans(normalized);
      if (cachedPlans.length > 0) set({ currentPlans: cachedPlans });

      const { room, plans, members, isMember } =
        await sharedRoomService.fetchRoomState(normalized);
      const rooms = get().rooms;
      set({
        currentRoom: room,
        currentPlans: plans,
        currentMembers: members,
        isMember,
        rooms: rooms.some(r => r.code === room.code)
          ? rooms.map(r => (r.code === room.code ? room : r))
          : [...rooms, room],
        plans: mergePlans(get().plans, plans),
        mySubmissions: await sharedRoomService.getMySubmissions(normalized),
      });
      void sharedRoomService.track('room_opened');
    } catch (err) {
      set({ error: errorCode(err) });
    } finally {
      set({ loading: false });
    }
  },

  closeCurrentRoom() {
    setActiveRoom(null);
    set({ currentRoom: null, currentPlans: [], currentMembers: [], isMember: false, mySubmissions: [] });
  },

  async refreshCurrentRoom() {
    const code = get().currentRoom?.code;
    if (!code) return;
    try {
      const { room, plans, members, isMember } = await sharedRoomService.fetchRoomState(code);
      const rooms = get().rooms;
      set({
        currentRoom: room,
        currentPlans: plans,
        currentMembers: members,
        isMember,
        rooms: rooms.some(r => r.code === room.code)
          ? rooms.map(r => (r.code === room.code ? room : r))
          : [...rooms, room],
        plans: mergePlans(get().plans, plans),
        mySubmissions: await sharedRoomService.getMySubmissions(code),
      });
    } catch (err) {
      set({ error: errorCode(err) });
    }
  },

  async submit(delta, planId, zikrName) {
    const room = get().currentRoom;
    if (!room) return;
    if (!isValidDelta(delta)) {
      set({ error: 'invalid-delta' });
      return;
    }
    set({ syncing: true, error: null });
    try {
      await sharedRoomService.submitContribution(room.code, planId, zikrName, delta);
      set({ mySubmissions: await sharedRoomService.getMySubmissions(room.code) });
      // Deliver immediately when online; the poll covers the offline case.
      await get().flush();
    } catch (err) {
      set({ error: errorCode(err) });
    } finally {
      set({ syncing: false });
    }
  },

  async flush() {
    set({ syncing: true });
    try {
      await sharedRoomService.flushOutbox();
      const code = get().currentRoom?.code;
      if (code) {
        const room = await sharedRoomService.getRoom(code);
        const plans = await sharedRoomService.getRoomPlans(code);
        if (room) set({ currentRoom: room });
        if (plans.length > 0) set({ currentPlans: plans });
        set({ mySubmissions: await sharedRoomService.getMySubmissions(code) });
      }
      await get().refresh();
    } finally {
      set({ syncing: false });
    }
  },

  async createRoom(input) {
    const identity = get().identity;
    if (!identity) throw new Error('Not initialized');
    set({ loading: true, error: null });
    try {
      const room = await sharedRoomService.createRoom(input, identity);
      const plans = await sharedRoomService.getRoomPlans(room.code);
      set({ rooms: [...get().rooms, room], plans: mergePlans(get().plans, plans) });
      return room;
    } catch (err) {
      set({ error: errorCode(err) });
      throw err;
    } finally {
      set({ loading: false });
    }
  },

  async createPlan(code, input) {
    set({ loading: true, error: null });
    try {
      const plans = await sharedRoomService.createPlan(code, input);
      set({ currentPlans: plans, plans: mergePlans(get().plans, plans) });
    } catch (err) {
      set({ error: errorCode(err) });
      throw err;
    } finally {
      set({ loading: false });
    }
  },

  async endPlan(code, planId) {
    try {
      await sharedRoomService.endPlan(code, planId);
      await get().refreshCurrentRoom();
    } catch (err) {
      set({ error: errorCode(err) });
    }
  },

  async joinRoom(code) {
    const identity = get().identity;
    if (!identity) throw new Error('Not initialized');
    set({ loading: true, error: null });
    try {
      const room = await sharedRoomService.joinRoom(code, identity);
      const rooms = get().rooms;
      const plans = await sharedRoomService.getRoomPlans(room.code);
      set({
        rooms: rooms.some(r => r.code === room.code)
          ? rooms.map(r => (r.code === room.code ? room : r))
          : [...rooms, room],
        plans: mergePlans(get().plans, plans),
      });
      return room;
    } catch (err) {
      set({ error: errorCode(err) });
      throw err;
    } finally {
      set({ loading: false });
    }
  },

  async leaveRoom(code) {
    try {
      await sharedRoomService.leaveRoom(code);
      set({
        rooms: get().rooms.filter(r => r.code !== code),
        plans: get().plans.filter(p => p.roomCode !== code),
        currentRoom: get().currentRoom?.code === code ? null : get().currentRoom,
        currentPlans: get().currentRoom?.code === code ? [] : get().currentPlans,
      });
    } catch (err) {
      set({ error: errorCode(err) });
    }
  },

  async closeRoom(code) {
    try {
      await sharedRoomService.closeRoom(code);
      await get().refresh();
      if (get().currentRoom?.code === code) {
        await get().refreshCurrentRoom();
      }
    } catch (err) {
      set({ error: errorCode(err) });
    }
  },

  async removeMember(code, userId) {
    try {
      await sharedRoomService.removeMember(code, userId);
      await get().refreshCurrentRoom();
    } catch (err) {
      set({ error: errorCode(err) });
    }
  },

  async updateDisplayName(name) {
    try {
      const identity = await sharedRoomService.ensureIdentity(name);
      set({ identity });
    } catch (err) {
      set({ error: errorCode(err) });
    }
  },

  async track(name, properties) {
    // Best-effort by contract — never blocks or throws into the UI.
    await sharedRoomService.track(name, properties);
  },

  clearError() {
    set({ error: null });
  },
}));

/** Replace in place (by id), append new ones. */
function mergePlans(current: Plan[], incoming: Plan[]): Plan[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((p) => [p.id, p]));
  for (const p of incoming) byId.set(p.id, p);
  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
