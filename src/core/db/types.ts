// Database: zikr-db
// Stores: zikrs, sessions, goals, streaks, settings, sessionFormState, zikrLastCount,
//         sharedRooms, sharedSubmissions, syncOutbox, identity

export interface Zikr {
  id?: number;
  name: string;
  custom: boolean;
  createdAt: Date;
  deletedAt?: Date;
  /** Arabic script — user-entered for custom zikrs, seeded for predefined. */
  arabicText?: string;
  /** Meaning — user-entered for custom zikrs, seeded for predefined. */
  translation?: string;
  /** Predefined zikrs: Bangla name/meaning (seeded from the catalog). */
  nameBn?: string;
  translationBn?: string;
  /** Predefined zikrs: sunnah default count and Quick Start rail flag. */
  defaultTarget?: number;
  isQuickStarter?: boolean;
  /** Server uuid of this zikr in the shared library (pulled or pushed). */
  remoteId?: string;
  /** When this device pushed this zikr to the shared library (awaiting verification). */
  sharedAt?: Date;
  /** When this zikr was last pulled from the shared library. */
  pulledAt?: Date;
}

export interface Session {
  id?: number;
  zikrId: number;
  count: number;
  source: 'app' | 'manual' | 'physical';
  timestamp: Date;
  date: Date;
  editableUntil: Date;     // NEW (v2): timestamp + 3 days
  createdAt: Date;         // NEW (v2): Session creation timestamp
  updatedAt: Date;         // NEW (v2): Last edit timestamp
  /** Saved while "count towards goals & groups" was on (default true). */
  countsToGoals?: boolean;
}

export interface Goal {
  id?: number;
  /** Zikrs this goal covers (v4+). Multi-zikr goals track combined counts. */
  zikrIds: number[];
  /** Optional user-set goal name; falls back to the covered zikrs' names. */
  name?: string;
  target: number;
  period: 'daily' | 'weekly' | 'monthly' | 'custom';
  startDate?: Date;
  endDate?: Date;
  status: 'active' | 'completed' | 'paused';
  createdAt: Date;
  completedAt?: Date;
}

export interface Streak {
  zikrId: number;
  currentStreak: number;
  longestStreak: number;
  lastProcessedDate: Date;
}

export interface Setting {
  key: string;
  value: any;
}

// NEW (v2): Session input for create operations
export interface SessionInput {
  zikrId: number;
  count: number;
  timestamp: Date;
}

// NEW (v2): Session update for edit operations
export interface SessionUpdate {
  zikrId?: number;
  count?: number;
  timestamp?: Date;
  updatedAt: Date;
}

// NEW (v2): Session row for form state management
export interface SessionRow {
  zikrId: string;                   // String for form binding (converted to number on save)
  count: number;
  timestamp: Date;
  valid: boolean;                   // Validation state
  errors: Record<string, string>;   // Field-level errors
}

// NEW (v2): Bulk save result
export interface BulkResult {
  success: number;                  // Successfully saved sessions
  failed: number;                   // Failed sessions
  errors: Array<{                  // Error details for failed sessions
    index: number;
    session: SessionInput;
    error: string;
  }>;
  stateId?: number;                 // State ID for interrupted saves
  completed: boolean;               // Save completion status
}

// NEW (v2): Progressive save state management
export interface SessionFormState {
  id?: number;                      // Auto-increment primary key
  sessions: SessionInput[];         // Array of sessions to save
  currentIndex: number;             // Current chunk position
  createdAt: Date;                  // State creation timestamp
  totalSessions: number;            // Total sessions to save
}

// NEW (v2): Smart defaults - last count per zikr
export interface ZikrLastCount {
  zikrId: number;                   // Zikr ID (primary key)
  count: number;                    // Last used count for this zikr
  updatedAt: Date;                  // Last update timestamp
}

// ============================================================
// NEW (v3): Shared goals (rooms)
// Privacy model: the backend stores only the goal definition, the
// combined total, and names-only membership. `sharedSubmissions`
// below is the member's private history and NEVER leaves the device.
// See docs/SharedGoals-Design.md
// ============================================================

export interface SharedRoom {
  code: string;                     // 6-char room code (local primary key)
  id: string;                       // server uuid
  title: string;
  zikrName: string;
  zikrArabic?: string | null;
  target: number;
  total: number;                    // combined contribution (authoritative from server)
  startsAt: Date;
  endsAt: Date;
  ownerId: string;
  status: 'active' | 'closed';
  joinedAt: Date;                   // when I created/joined (local)
  /** Device identity that joined — lets the app silently rejoin after an identity reset. */
  joinedWithUserId?: string;
  fetchedAt: Date;                  // last successful server sync
}

export interface SharedMember {
  name: string;
  joinedAt: Date;
  /** Server auth uid — needed for owner removal; carries no contribution data. */
  userId?: string;
}

export type SharedSubmissionSyncState = 'pending' | 'synced' | 'failed';

export interface SharedSubmission {
  id?: number;
  roomCode: string;
  delta: number;
  submittedAt: Date;                // when the user made it
  eventId: string;                  // UUID sent to the server (idempotency)
  syncState: SharedSubmissionSyncState; // pending → synced, or failed (window ended etc.)
  note?: string;                    // why a submission failed, for local display
}

export interface SyncOutboxItem {
  id?: number;
  eventId: string;                  // matches the SharedSubmission event
  roomCode: string;
  delta: number;
  attempts: number;
  nextAttemptAt: Date;
  createdAt: Date;
}

export interface SharedIdentity {
  userId: string;                   // Supabase anonymous auth uid (primary key)
  displayName: string;
  /** Server-generated 12-char device token — the usage-metrics key. */
  token?: string;
  createdAt: Date;
}

// ============================================================
// NEW (v5): Zikr library sync — share custom zikrs to the shared
// library (admin-verified) and pull verified ones back.
// ============================================================

/** Pending "share with others" push; delivered by the outbox flusher. */
export interface ZikrShareOutboxItem {
  id?: number;
  zikrId: number;                   // local Zikr this share refers to
  name: string;
  arabicText?: string;
  translation?: string;
  attempts: number;
  nextAttemptAt: Date;
  createdAt: Date;
}
