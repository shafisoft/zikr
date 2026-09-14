/**
 * Shared Room Store (Zustand)
 * State for the Group tab: identity, joined rooms, the currently open room,
 * my local contribution history, and sync status.
 */

import { create } from 'zustand';
import {
  SharedIdentity,
  SharedMember,
  SharedRoom,
  SharedSubmission,
} from '../db/types';
import { isValidDelta, normalizeRoomCode } from '../utils/sharedRoomUtils';
import sharedRoomService, {
  ensureSharedRoomSync,
  setActiveRoom,
  SharedRoomError,
} from '../services/sharedRoom';
import { useSettingsStore } from './settingsStore';
import { translate, detectLanguage, Lang } from '../i18n';

interface SharedRoomState {
  initialized: boolean;
  configured: boolean;
  identity: SharedIdentity | null;
  rooms: SharedRoom[];
  currentRoom: SharedRoom | null;
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
  submit: (delta: number) => Promise<void>;
  createRoom: (input: {
    title: string;
    zikrName: string;
    zikrArabic?: string;
    target: number;
    startsAt: Date;
    endsAt: Date;
    windowType?: string;
  }) => Promise<SharedRoom>;
  joinRoom: (code: string) => Promise<SharedRoom>;
  leaveRoom: (code: string) => Promise<void>;
  closeRoom: (code: string) => Promise<void>;
  removeMember: (code: string, userId: string) => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  track: (name: string, properties?: Record<string, unknown>) => Promise<void>;
  flush: () => Promise<void>;
  clearError: () => void;
}

function currentLang(): Lang {
  const l = useSettingsStore.getState().settings.language;
  return l === 'bn' || l === 'en' ? l : detectLanguage();
}

/**
 * Store errors hold a SharedRoomErrorCode (or 'unknown'); the UI renders
 * them via the `errors.*` i18n keys so they follow the active language.
 */
function errorCode(err: unknown): string {
  return err instanceof SharedRoomError ? err.code : 'unknown';
}

function errorToMessage(err: unknown): string {
  return translate(currentLang(), `errors.${errorCode(err)}`);
}

/** Shared with UI components so modals can render the same messages. */
export function sharedRoomErrorMessage(err: unknown): string {
  return errorToMessage(err);
}

export const useSharedRoomStore = create<SharedRoomState>((set, get) => ({
  initialized: false,
  configured: true,
  identity: null,
  rooms: [],
  currentRoom: null,
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
      set({ initialized: true, rooms: [] });
      return;
    }

    ensureSharedRoomSync();

    try {
      const identity = await sharedRoomService.ensureIdentity(get().identity?.displayName);
      const rooms = await sharedRoomService.listRooms();
      set({ initialized: true, identity, rooms });
      // Deliver anything queued from previous sessions.
      await get().flush();
    } catch (err) {
      // Store the raw code — the UI translates it (errorToMessage would
      // double-translate here and render a literal "errors." prefix).
      set({ initialized: true, error: errorCode(err) });
    }
  },

  async refresh() {
    const rooms = await sharedRoomService.listRooms();
    set({ rooms });
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

      const { room, members, isMember } = await sharedRoomService.fetchRoomState(normalized);
      const rooms = get().rooms;
      set({
        currentRoom: room,
        currentMembers: members,
        isMember,
        rooms: rooms.some(r => r.code === room.code)
          ? rooms.map(r => (r.code === room.code ? room : r))
          : [...rooms, room],
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
    set({ currentRoom: null, currentMembers: [], isMember: false, mySubmissions: [] });
  },

  async refreshCurrentRoom() {
    const code = get().currentRoom?.code;
    if (!code) return;
    try {
      const { room, members, isMember } = await sharedRoomService.fetchRoomState(code);
      const rooms = get().rooms;
      set({
        currentRoom: room,
        currentMembers: members,
        isMember,
        rooms: rooms.some(r => r.code === room.code)
          ? rooms.map(r => (r.code === room.code ? room : r))
          : [...rooms, room],
        mySubmissions: await sharedRoomService.getMySubmissions(code),
      });
    } catch (err) {
      set({ error: errorCode(err) });
    }
  },

  async submit(delta) {
    const room = get().currentRoom;
    if (!room) return;
    if (!isValidDelta(delta)) {
      set({ error: 'invalid-delta' });
      return;
    }
    set({ syncing: true, error: null });
    try {
      await sharedRoomService.submitContribution(room.code, delta);
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
        if (room) set({ currentRoom: room });
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
      set({ rooms: [...get().rooms, room] });
      return room;
    } catch (err) {
      set({ error: errorCode(err) });
      throw err;
    } finally {
      set({ loading: false });
    }
  },

  async joinRoom(code) {
    const identity = get().identity;
    if (!identity) throw new Error('Not initialized');
    set({ loading: true, error: null });
    try {
      const room = await sharedRoomService.joinRoom(code, identity);
      const rooms = get().rooms;
      set({
        rooms: rooms.some(r => r.code === room.code)
          ? rooms.map(r => (r.code === room.code ? room : r))
          : [...rooms, room],
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
        currentRoom: get().currentRoom?.code === code ? null : get().currentRoom,
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
