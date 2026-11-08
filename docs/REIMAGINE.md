# Re-imagine Zikr — "The Rhythm" proposal

Status: proposal v1 (2026-11-08). Companion: interactive concept mockup (in-chat visualization).
Scope: product direction only — no schema/protocol changes required.

## North star

The app is currently **feature islands**: a stacked Home (post-salah card, greeting,
ritual-now, tracker, goal arch, goal rows, routines, quick-start rail), plus separate
Plans / Group / Progress pages. Muslim practice is not islands — it is a **rhythm
anchored to five daily prayers**. The re-imagination makes the prayer clock the app's
spine, and makes counting feel **physical** again.

## Navigation: before → after

```
Bottom nav today                Re-imagined
┌──────────────┐                ┌──────────────┐
│ Home         │                │ Today        │  prayer-rail day (absorbs the Home stack)
│ Plans   (tab)│   ─────────►   │ Tasbeeh (tab)│  the counter — core differentiator, 1 tap away
│ Group   (tab)│                │ Circle  (tab)│  groups (when backend configured)
│ Progress(tab)│                │ Progress     │  mihrab + insights
└──────────────┘                └──────────────┘
Plans page      → progress chips on Today; managed from the More sheet
Library / Routines manage / Settings → one "More" sheet (top-right actions)
```

Rationale: counting is the core differentiator but lives behind navigation today;
Plans is a management surface, not a daily surface.

## The five big moves

### 1. Today — the prayer-rail day
One vertical timeline anchored on Fajr → Isha replaces the stacked islands:
- Completed anchor: gold check + what was done ("after-Fajr set ✓ 33·33·34").
- Current anchor: highlighted, with the post-salah offer card attached (this is
  `PostSalahCardContainer` / `RitualNowContainer` recomposed into rail slots).
- Upcoming anchors: quiet, with times.
- One **unified ring** on top: today's total dhikr across all sources, with a pace note
  ("ahead of your usual") — replaces the plan-percent arch as the hero.
- Plan chips ("Qur'an plan 62%") ride under the ring; routine slots appear on the rail.

### 2. Tasbeeh — make digital feel physical
> **Decision (phase 2 shipped):** zen mode + the Tasbeeh tab landed. The bead
> strand was prototyped and **declined** — the gold-ring board stays exactly
> as it was (the user reviewed the strand live and chose the ring).

- **Bead strand**: a circular misbaha of N beads that fill as you count; the divider
  bead is gold. Haptic per bead, stronger haptic on the divider. *(declined)*
- **Meaning line**: the dhikr's translation/meaning sits behind a toggle under the
  count (catalog already carries it — nothing new to source-verify).
- **Zen mode**: one tap hides the reference so the board and count stand alone.
  *(shipped)*
- Counter becomes a **tab** (still deep-linkable — `counterUrl` flows unchanged).
  *(shipped)*

### 3. Progress — the mihrab
- Streak rendered inside a **mihrab arch**: an inner gold glow that grows with the
  streak; the "never miss twice" grace shown as a **shield** (never as red guilt).
- 30-day dot strip (done / grace / miss / today), weekly bars, lifetime total in gold foil.
- Two quiet insights from pure utils: best hour of day, most-practiced dhikr.
- Hijri-aware month strip in a later phase.

### 4. Circle — the communal mosaic
- Group progress as a **khatam-star mosaic**: each member's contribution fills tiles of
  one shared pattern; the complete pattern IS the collective target.
- Members stay anonymous (matches the backend's anonymous contributions) — avatars are
  star glyphs, counts only.
- Per-zikr plan rows below (creation stays per-zikr only, per the server contract).
- Ended plans stay visible as history rows.

### 5. Plans → chips, Library/routines → More sheet
- Plans dissolve into Today as chips + a "manage" entry. No tab, no page for daily use.
- More sheet: My Library, Manage routines, Manage plans, Shared-library sync,
  Backup & export, Settings.

## UX principles

1. **Prayer time is the app's clock.**
2. **One thumb, one intent** — every screen has exactly one primary action.
3. **The device disappears during dhikr** (zen).
4. **Motivate by rhythm, not guilt** — no red misses; silent moves; shields.
5. **Management is a sheet, practice is a screen.**

## Noor 2.0 UI direction (same tokens, new motion)

- **Breath**: the ring scales 1.00→1.02 over a 4s cycle; `prefers-reduced-motion` off switch.
- **Bead texture** on the counter; gold **foil** on milestones (40-day streak, 100k lifetime).
- The **mihrab arch** becomes the recurring frame for anything progress-shaped.
- Dark theme reads as "Isha": deeper green-black, dimmer gold — already close; lean in.
- Arabic stays first-class: `lang="ar" dir="rtl"`, Amiri, larger Arabic on dhikr surfaces.

## Build phases (no db bumps required)

| Phase | Ship | Where it lands |
|---|---|---|
| 1 | Today rail + unified ring + plan chips | recompose `Home` containers (`postSalah/`, `routines/` become rail slots) |
| 2 | Zen mode + Tasbeeh tab (bead strand declined — gold ring stays) | `ui/components/counter` presentation |
| 3 | Progress mihrab, dots, insights | `containers/streaks` + pure utils in `core/utils/metrics` |
| 4 | Circle mosaic | render-only over the existing `sharedRoomStore` mirror |
| 5 | Hijri strip, Ramadan mode, 3-tap onboarding | later; onboarding touches only settings store |

Every phase obeys the layer rules: pages → containers → components; stores own writes;
derived metrics via `useMemo` utils; services/db untouched except where a phase says so.

## Not changing

Data model (db v7), sync protocol, manual-first ethos, offline-first, $0 cost,
content integrity gating, the counter's round/checkpoint mechanics.
