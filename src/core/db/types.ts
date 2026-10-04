// Database: zikr-db
// Stores: zikrs, sessions, plans, planOwners, streaks, settings, sessionFormState,
//         zikrLastCount, sharedRooms, sharedSubmissions, syncOutbox, identity,
//         routines

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
  /**
   * Guided routine-flow attribution: written by a routine's own counter
   * flow. A routine's day-state counts its own attributed sessions plus
   * unattributed ones (never a sibling routine's) — see sessionCounts-
   * TowardRoutine in routineUtils.ts. Additive, non-indexed (never queried).
   */
  routineId?: string;
  /**
   * The civil part of day the count belongs to (manual entries carry the
   * user's prayer-anchored choice; counter saves derive it from the clock).
   * Scopes unattributed sessions to matching scheduled routines — see
   * sessionCountsTowardRoutine. Absent on legacy rows (pre-scoping).
   */
  dayPart?: DayPart;
  /**
   * Guided post-salah-flow attribution: the prayer whose set this session
   * belongs to, written by the ?postSalah= counter flow. After-salah
   * completion is derived ONLY from these attributed sessions — free
   * counting during a prayer's period never completes a set the user
   * never ran. Additive, non-indexed (never queried). Absent on legacy
   * rows — see attributedCounts in prayerTimes.ts.
   */
  postSalah?: PostSalahPrayer;
}

/** The five prayers of the after-salah set (prayerTimes re-exports this). */
export type PostSalahPrayer = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

/** Civil part of day (scoping parts; noon credits no preset routine). */
export type DayPart = 'morning' | 'noon' | 'evening' | 'night';

/**
 * LEGACY (pre-v6 personal goal). Superseded by Plan below; the Dexie table
 * survives only so historical v1→v2 upgrade code keeps working. Never write.
 */
export interface Goal {
  id?: number;
  zikrIds: number[];
  name?: string;
  target: number;
  period: 'daily' | 'weekly' | 'monthly' | 'custom';
  startDate?: Date;
  endDate?: Date;
  status: 'active' | 'completed' | 'paused';
  createdAt: Date;
  completedAt?: Date;
}

// ============================================================
// NEW (v6): Plans — one entity for personal and group targets.
// A Plan wraps 1..5 zikrs with targets; ownership is a relation
// (planOwners): ('user', 'me') = personal plan on this device,
// ('group', roomCode) = server-mirrored plan inside a group.
// ============================================================

export type PlanMode = 'combined' | 'per-zikr';
export type PlanPeriod = 'daily' | 'weekly' | 'monthly' | 'one-time';
export type PlanStatus = 'active' | 'paused' | 'completed' | 'ended';

export interface PlanZikr {
  /** Catalog name or custom text — the group-wide key (personal plans also bind zikrId). */
  name: string;
  arabic?: string | null;
  /** Local Zikr binding (personal plans). */
  zikrId?: number;
  /** Per-zikr target (mode 'per-zikr' only). */
  target?: number;
  /** Server mirror only: lifetime per-zikr total. */
  total?: number;
  /** Server mirror only: current-period per-zikr total (recurring plans). */
  periodTotal?: number;
}

export interface Plan {
  /** uuid — stable if a plan is later promoted/shared to a group. */
  id: string;
  title?: string;
  mode: PlanMode;
  period: PlanPeriod;
  /** Combined target (mode 'combined' only). */
  target?: number;
  /** 1..5 zikrs; embedded (Dexie document model). */
  zikrs: PlanZikr[];
  /** One-time window (period 'one-time'). */
  startDate?: Date;
  endDate?: Date;
  /** Shared recurring plans: the creator's IANA timezone (all members reset together). */
  timeZone?: string;
  status: PlanStatus;
  createdAt: Date;
  completedAt?: Date;
  endedAt?: Date;

  // ----- Server mirror only (group-owned plans) -----
  /** Convenience denormalization of the ('group', roomCode) owner row. */
  roomCode?: string;
  /** Lifetime combined total (one-time progress; all-time stat for recurring). */
  total?: number;
  /** Combined total within the current period (recurring plans). */
  periodTotal?: number;
  fetchedAt?: Date;
}

/** Ownership relation: who a plan belongs to ('user' → local, 'group' → a room). */
export interface PlanOwner {
  planId: string;
  ownerKind: 'user' | 'group';
  /** 'me' (device user) or a room code. */
  ownerId: string;
}

// ============================================================
// NEW (v7): Routines — a first-class ordered practice (wird).
// Deliberately NO dates and NO deadlines: a routine is done or not
// done each day, derived from `sessions` (solution-design §2.3) —
// there are no completion rows to store. A routine never touches
// plan machinery and never duplicates zikr records: items carry
// zikrId references + a denormalized display name.
// ============================================================

/** One ordered entry of a routine. */
export interface RoutineItem {
  /** Reference to the user's existing Zikr record (AC2.1.3). */
  zikrId: number;
  /**
   * Denormalized at write time — graceful display if the zikr is
   * soft-deleted (§5.2); NOT a binding key.
   */
  name: string;
  /** Per-item count (catalog defaultTarget at preset time). */
  target: number;
}

export type RoutineSource = 'preset' | 'custom';

/** Which civil part of the day a routine belongs to ('any' = all day). */
export type RoutineSchedulePart = 'morning' | 'evening' | 'night' | 'any';

/**
 * Schedule metadata — which part of the day a routine is FOR. Only preset
 * routines carry it (the seeder/creator writes it once); custom routines
 * have none, meaning they are relevant at ANY time. Windows are civil and
 * generous (routineUtils.ROUTINE_WINDOWS); `weekday` binds a routine to a
 * day of the week (0=Sun … 6=Sat, `Date.getDay()`).
 */
export interface RoutineSchedule {
  part: RoutineSchedulePart;
  weekday?: number;
}

export interface Routine {
  /** uuid — the newRoutineId() idiom (planUtils.ts pattern). */
  id: string;
  source: RoutineSource;
  /**
   * For presets only: which liturgical preset — the localized title renders
   * from i18n so bn/en follow the locale (AC2.1.2). Custom routines store a
   * user-entered title.
   */
  presetKey?: 'morning' | 'evening' | 'night' | 'friday';
  /**
   * Preset routines carry their day-part (morning/evening/night) or weekday
   * (friday) so Home can show the routine that matches NOW; custom routines
   * omit it (any time). Non-indexed — never queried, only read per row.
   */
  schedule?: RoutineSchedule;
  title?: string;
  /** Embedded, ordered (Dexie document model, like Plan.zikrs). */
  items: RoutineItem[];
  createdAt: Date;
  /** Soft delete, house style (AGENTS.md). */
  deletedAt?: Date;
}

// ============================================================
// R1 "Post-salah mode" — prayer-time location (settings KV row
// `prayerLocation`; NO schema bump, solution-design §4.2). The
// location never leaves the device (AC1.1.4).
// ============================================================

/** Adhan calculation methods offered in Settings (default Karachi, §4.2). */
export type PrayerCalculationMethod =
  | 'Karachi'
  | 'MuslimWorldLeague'
  | 'Egyptian'
  | 'UmmAlQura'
  | 'MoonsightingCommittee'
  | 'NorthAmerica';

/** Asr shadow length (default Shafi, §4.2). */
export type PrayerMadhab = 'Shafi' | 'Hanafi';

export type PrayerHighLatitudeRule =
  | 'MiddleOfTheNight'
  | 'SeventhOfTheNight'
  | 'TwilightAngle';

/** The one persisted fact of R1 — the saved prayer-time location. */
export interface PrayerLocation {
  lat: number;
  lon: number;
  /** Display label (city name or "lat, lon" for manual/device entries). */
  label: string;
  /** Optional id into the bundled city list (enables bn label rendering). */
  cityId?: string;
  method: PrayerCalculationMethod;
  madhab: PrayerMadhab;
  highLatitudeRule?: PrayerHighLatitudeRule;
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

// NEW (v2): Session update for edit operations
export interface SessionUpdate {
  zikrId?: number;
  count?: number;
  timestamp?: Date;
  /** Scoping part of day (manual-entry edit path). */
  dayPart?: DayPart;
  updatedAt: Date;
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

/**
 * A persistent group (v6+). The room no longer carries a goal: targets live
 * on Plan rows owned by ('group', roomCode) — the group keeps its code,
 * members, and plan history forever; only owner `close_room` retires it.
 */
export interface SharedRoom {
  code: string;                     // 6-char room code (local primary key)
  id: string;                       // server uuid
  title: string;
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
  /** Which group plan the contribution targets (v6+). */
  planId: string;
  /** Which zikr of the plan it counts towards (plans may hold several). */
  zikrName: string;
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
  planId: string;                   // v6+: target plan (was implicit in the room)
  zikrName: string;                 // v6+: target zikr within the plan
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
