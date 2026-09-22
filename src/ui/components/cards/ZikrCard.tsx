/**
 * Zikr Card Component
 * Quick start card for zikr: arch-niche icon, Arabic calligraphy name,
 * target badge, and start button.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { ZikrCardProps } from '../../types/components';
import useRipple from '../../hooks/useRipple';
import useHaptic from '../../hooks/useHaptic';
import { useSettingsStore } from '../../../core/stores/settingsStore';
import { useI18n } from '../../../core/i18n';

export const ZikrCard: React.FC<ZikrCardProps> = ({
  id,
  name,
  arabicName,
  translation,
  targetCount,
  icon,
  onStart,
  completed = false,
}) => {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const { t } = useI18n();
  const { createRipple } = useRipple(buttonRef);
  const hapticsEnabled = useSettingsStore(state => state.settings.hapticsEnabled ?? true);
  const { trigger: haptic } = useHaptic(hapticsEnabled);

  const handleStart = () => {
    haptic('medium');
    onStart(id);
  };

  // pointerdown only: touch + emulated mousedown double-fired the ripple.
  const handleInteraction = (e: React.PointerEvent<HTMLButtonElement>) => {
    createRipple(e);
  };

  const ariaLabel = `Start ${name} practice, ${translation}, target ${targetCount}`;

  return (
    <div className="snap-center shrink-0 w-[75vw] max-w-[280px] bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-5 flex flex-col gap-4 shadow-card relative overflow-hidden">
      {/* Decorative quarter-circle gold wash */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-tertiary-fixed/20 rounded-bl-full -mr-4 -mt-4 pointer-events-none"
        aria-hidden="true"
      />

      {/* Header: arch-niche icon and target badge */}
      <div className="flex justify-between items-start z-10">
        <div
          className="w-12 h-14 rounded-t-full rounded-b-lg bg-surface-container-high flex items-center justify-center pt-2 text-primary"
          aria-hidden="true"
        >
          <MaterialIcon icon={icon} className="text-2xl" />
        </div>
        <span className="font-label-md text-label-md text-tertiary bg-tertiary-container/10 border border-tertiary-container/30 px-2 py-0.5 rounded-full text-sm tabular-nums">
          {targetCount}x
        </span>
      </div>

      {/* Zikr info — grows so the Start button anchors to the card bottom.
          Long text is clamped with ellipsis so every card stays compact. */}
      <div className="flex flex-col gap-2 z-10 mt-2 flex-1 min-w-0">
        <h4 className="font-headline-md text-headline-md text-primary text-xl line-clamp-1">
          {name}
        </h4>
        {arabicName && (
          <p
            className="font-display-arabic text-[22px] leading-8 text-tertiary line-clamp-2"
            lang="ar"
            dir="rtl"
          >
            {arabicName}
          </p>
        )}
        <p className="font-caption text-caption text-on-surface-variant line-clamp-2">
          {translation}
        </p>
      </div>

      {/* Completed-today chip: status lives here, the CTA stays "Start" —
          counting past the target is normal practice. */}
      {completed && (
        <span
          className="relative z-10 self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-full
            bg-tertiary-container/15 border border-tertiary-container/30 text-tertiary
            font-caption text-caption"
        >
          <MaterialIcon icon="check_circle" filled className="text-[14px]" />
          {t('card.doneToday')}
        </span>
      )}

      {/* Start button */}
      <button
        ref={buttonRef}
        onPointerDown={handleInteraction}
        onClick={handleStart}
        aria-label={ariaLabel}
        className={`
          mt-2 w-full min-h-[56px] rounded-xl
          font-label-md text-label-md
          flex items-center justify-center gap-2
          active-scale-95 transition-transform
          bg-primary-container text-on-primary
        `}
      >
        <MaterialIcon icon="play_arrow" className="text-[20px]" />
        {t('common.start')}
      </button>
    </div>
  );
};

export default ZikrCard;
