/**
 * PostSalahCard — the one ambient R1 surface (§16.2): the active
 * after-salah moment, or the quiet completed state once the set is done
 * for this occurrence (AC1.2.3). Presentational only — the prayer label
 * and title line arrive localized, taps bubble up as callbacks.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import PatternBackdrop from '../decor/PatternBackdrop';
import { useI18n } from '../../../core/i18n';

interface PostSalahCardProps {
  /** Localized prayer name (e.g. "Maghrib" / "মাগরিব"). */
  prayerLabel: string;
  /** The full situational title line, composed by the container. */
  titleLine: string;
  /** The body line (fresh offer copy or the mid-period ask). */
  bodyLine: string;
  /** Set already complete for this occurrence → the quiet state (AC1.2.3). */
  done: boolean;
  onStart: () => void;
}

const PostSalahCard: React.FC<PostSalahCardProps> = ({
  prayerLabel,
  titleLine,
  bodyLine,
  done,
  onStart,
}) => {
  const { t } = useI18n();

  return (
    <section
      className="relative w-full overflow-hidden rounded-2xl border border-tertiary-container/40 bg-surface-container-low shadow-card"
      aria-live="polite"
    >
      <PatternBackdrop className="absolute inset-0" variant="green" />
      <div className="relative flex flex-col items-center text-center gap-3 px-6 py-6">
        <MaterialIcon
          icon={done ? 'task_alt' : 'auto_awesome'}
          filled={done}
          className="text-3xl text-tertiary"
        />
        <h2 className="font-headline-md text-headline-md text-primary">
          {titleLine}
        </h2>
        <span className="sr-only">{prayerLabel}</span>
        {done ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('postSalah.card.doneLine')}
          </p>
        ) : (
          <>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {bodyLine}
            </p>
            <button
              type="button"
              onClick={onStart}
              className="mt-1 h-touch-target-min w-full max-w-xs bg-primary-container text-on-primary rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
              aria-label={t('postSalah.card.start')}
            >
              <MaterialIcon icon="play_arrow" className="text-[20px]" />
              {t('postSalah.card.start')}
            </button>
          </>
        )}
      </div>
    </section>
  );
};

export default PostSalahCard;
