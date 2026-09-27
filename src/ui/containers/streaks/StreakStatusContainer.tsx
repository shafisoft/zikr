/**
 * StreakStatusContainer — the ONE place that derives the overall streak's
 * number, framing, and repair prompt (R3 "Gentle restarts",
 * docs/solution-design.md §16.5). Hosted by Home (badge + prompt) and
 * Progress (badge only), so the rule and framing can never diverge
 * (AC3.4.1). Routine streaks (R2) will reuse the same pure derivation via
 * `streakStatus(hasDay, today)` (AC3.4.2).
 *
 * Render decision lives here, not in the pages: nothing renders when there
 * is no history (AC3.1.3); `fresh-break` is admitted so a broken streak
 * shows the fresh-start line (AC3.3.1). Prompt visibility is the pure
 * `gracePromptVisible` rule — at most once per return day, persisted via
 * the `gracePrompt` settings KV, self-resolving when yesterday gains a
 * session (derivation only, AC3.2.2).
 */

import React, { useCallback, useMemo } from 'react';
import StreakBadge from '../../components/grace/StreakBadge';
import GracePrompt from '../../components/grace/GracePrompt';
import { useSessionStore } from '../../../core/stores/sessionStore';
import { useSettingsStore } from '../../../core/stores/settingsStore';
import { useI18n } from '../../../core/i18n';
import { formatDate, getToday } from '../../../core/utils/dateUtils';
import { gracePromptVisible, streakStatusOf } from '../../../core/utils/overallStreak';

/** Shape of the `gracePrompt` settings KV row (§3.2). */
export interface GracePromptSetting {
  /** Return day (YYYY-MM-DD) the prompt was last dismissed/logged on. */
  dismissedFor: string;
}

interface StreakStatusContainerProps {
  /** Home hosts badge + prompt; Progress hosts badge only (§16.5). */
  showPrompt?: boolean;
  /**
   * Hide everything when there is no streak history (AC3.1.3, default).
   * Progress's always-visible stat card passes false to keep its current
   * "0" display for brand-new users.
   */
  hideWhenEmpty?: boolean;
  /** Bubbled to the page, which deep-links to Progress's backdated entry. */
  onLogYesterday?: () => void;
}

const StreakStatusContainer: React.FC<StreakStatusContainerProps> = ({
  showPrompt: showPromptProp = true,
  hideWhenEmpty = true,
  onLogYesterday,
}) => {
  const { t } = useI18n();

  const sessions = useSessionStore(state => state.sessions);
  const graceFramingEnabled = useSettingsStore(
    state => state.settings.graceFramingEnabled as boolean | undefined
  );
  const gracePrompt = useSettingsStore(
    state => state.settings.gracePrompt as GracePromptSetting | undefined
  );

  const todayStr = useMemo(() => formatDate(getToday()), []);
  const status = useMemo(
    () => streakStatusOf(sessions.map(s => s.date)),
    [sessions]
  );

  // Ambient grace framing by default (v1 ships no Settings gate — the
  // pilot's `graceFramingEnabled` row stays honored when present).
  const framingEnabled = graceFramingEnabled ?? true;

  const promptVisible =
    showPromptProp &&
    gracePromptVisible({
      mode: status.mode,
      framingEnabled,
      dismissedFor: gracePrompt?.dismissedFor,
      today: todayStr,
    });

  const persistDismissal = useCallback(() => {
    void useSettingsStore
      .getState()
      .saveSetting('gracePrompt', { dismissedFor: todayStr } satisfies GracePromptSetting);
  }, [todayStr]);

  const handleDismiss = useCallback(() => persistDismissal(), [persistDismissal]);

  // Logging counts as "seen" too: the offer was taken, so the prompt never
  // re-appears later the same return day (AC3.2.2). If the entry isn't
  // saved, the grace state itself still is — until yesterday resolves.
  const handleLog = useCallback(() => {
    persistDismissal();
    onLogYesterday?.();
  }, [persistDismissal, onLogYesterday]);

  // No history at all → nothing changes (AC3.1.3). A real break (value 0
  // with history behind it) comes through as `fresh-break` and renders.
  if (status.mode === 'normal' && status.value === 0 && hideWhenEmpty) {
    return null;
  }

  return (
    <div className="relative flex flex-col items-center gap-3">
      <StreakBadge value={status.value} mode={status.mode} framingEnabled={framingEnabled} />
      {promptVisible && (
        <GracePrompt
          resumeLine={t('grace.resumeLine')}
          onLog={handleLog}
          onDismiss={handleDismiss}
        />
      )}
    </div>
  );
};

export default StreakStatusContainer;
