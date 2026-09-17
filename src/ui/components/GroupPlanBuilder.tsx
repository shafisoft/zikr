/**
 * GroupPlanBuilder — shared form fields for creating a GROUP plan
 * (used by CreateRoomModal for the group's first plan and by
 * CreatePlanModal for later plans).
 *
 * Zikrs are picked from the predefined catalog or entered as custom text
 * (members' local libraries differ, so plans bind zikrs by name).
 * Group plans are always PER-ZIKR: each zikr gets its own target, so the
 * room's progress rows and contribution attribution stay unambiguous.
 * (The backend still accepts combined plans — personal plans use them and
 * any legacy group plan keeps rendering — the creation UI just no longer
 * offers the mode.)
 */

import React, { useMemo, useState } from 'react';
import MaterialIcon from './MaterialIcon';
import InputField from './forms/InputField';
import { getPredefinedZikrNames, getZikrDisplayInfo } from '../utils/zikrMapping';
import { windowPreset } from '../../core/utils/sharedRoomUtils';
import type { CreatePlanInput } from '../../core/services/sharedRoom';
import { useI18n } from '../../core/i18n';

export type PlanPreset = 'today' | 'week' | 'custom';

export interface GroupPlanDraft {
  title: string;
  zikrs: Array<{ name: string; arabic?: string; target?: number }>;
  period: 'daily' | 'weekly' | 'monthly' | 'one-time';
  preset: PlanPreset;
  startDate: string;
  endDate: string;
}

export function emptyGroupPlanDraft(): GroupPlanDraft {
  return {
    title: '',
    zikrs: [],
    period: 'one-time',
    preset: 'week',
    startDate: '',
    endDate: '',
  };
}

export function groupPlanWindow(draft: GroupPlanDraft): { startsAt: Date; endsAt: Date } | null {
  if (draft.period !== 'one-time') return null;
  if (draft.preset !== 'custom') return windowPreset(draft.preset);
  if (!draft.startDate || !draft.endDate) return null;
  return {
    startsAt: new Date(`${draft.startDate}T00:00:00`),
    endsAt: new Date(`${draft.endDate}T23:59:59.999`),
  };
}

interface GroupPlanBuilderProps {
  draft: GroupPlanDraft;
  onChange: (draft: GroupPlanDraft) => void;
  /** Omit the optional plan title field (e.g. when the modal is already long). */
  hideTitle?: boolean;
}

const GroupPlanBuilder: React.FC<GroupPlanBuilderProps> = ({ draft, onChange, hideTitle }) => {
  const { lang, t } = useI18n();
  const [customZikr, setCustomZikr] = useState('');
  const catalog = useMemo(() => getPredefinedZikrNames(), []);

  const selected = (name: string) => draft.zikrs.some(z => z.name === name);

  const toggleZikr = (name: string, arabic?: string) => {
    if (selected(name)) {
      onChange({ ...draft, zikrs: draft.zikrs.filter(z => z.name !== name) });
    } else if (draft.zikrs.length < 5) {
      onChange({ ...draft, zikrs: [...draft.zikrs, { name, arabic }] });
    }
  };

  const addCustomZikr = () => {
    const name = customZikr.trim();
    if (!name || selected(name) || draft.zikrs.length >= 5) return;
    onChange({ ...draft, zikrs: [...draft.zikrs, { name }] });
    setCustomZikr('');
  };

  const setZikrTarget = (name: string, value: string) => {
    onChange({
      ...draft,
      zikrs: draft.zikrs.map(z =>
        z.name === name ? { ...z, target: value === '' ? undefined : parseInt(value, 10) } : z
      ),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Plan title */}
      {!hideTitle && (
        <InputField
          label={t('plan.planTitle')}
          placeholder={t('plan.planTitlePlaceholder')}
          value={draft.title}
          onChange={(v) => onChange({ ...draft, title: String(v) })}
          icon="flag"
        />
      )}

      {/* What will be read — catalog chips + custom entry (1..5) */}
      <div className="flex flex-col gap-2">
        <span className="font-caption text-caption text-on-surface-variant">
          {t('createRoom.whatToRead')} ({draft.zikrs.length}/5)
        </span>
        <div className="flex flex-wrap gap-2">
          {catalog.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggleZikr(name, getZikrDisplayInfo(name, lang).arabicText)}
              className={`px-3 py-2 rounded-full font-caption text-caption border transition-all ${
                selected(name)
                  ? 'bg-primary-container text-on-primary border-transparent'
                  : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        {/* Selected custom zikrs as removable chips */}
        {draft.zikrs
          .filter(z => !catalog.includes(z.name))
          .map(z => (
            <button
              key={z.name}
              type="button"
              onClick={() => toggleZikr(z.name)}
              className="inline-flex items-center gap-1 self-start px-3 py-2 rounded-full font-caption text-caption bg-primary-container text-on-primary border-transparent"
            >
              {z.name}
              <MaterialIcon icon="close" className="text-[14px]" />
            </button>
          ))}
        <div className="flex gap-2">
          <input
            type="text"
            value={customZikr}
            onChange={(e) => setCustomZikr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomZikr();
              }
            }}
            placeholder={t('createRoom.customPlaceholder')}
            maxLength={80}
            className="flex-1 bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 h-touch-target-min font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
          <button
            type="button"
            onClick={addCustomZikr}
            disabled={!customZikr.trim() || draft.zikrs.length >= 5}
            className="px-4 h-touch-target-min rounded-xl border border-outline-variant/40 font-label-md text-label-md text-primary disabled:opacity-40"
          >
            <MaterialIcon icon="add" className="text-[20px]" />
          </button>
        </div>
      </div>

      {/* Targets — group plans are per-zikr: every zikr needs its own */}
      <div className="flex flex-col gap-2">
        <span className="font-caption text-caption text-on-surface-variant">
          {t('plan.perZikrTargets')}
        </span>
        {draft.zikrs.length === 0 && (
          <span className="font-caption text-caption text-on-surface-variant/60">
            {t('createRoom.chooseZikrHint')}
          </span>
        )}
        {draft.zikrs.map(z => (
          <div key={z.name} className="flex items-center gap-3">
            <span className="flex-1 min-w-0 truncate font-body-md text-body-md text-on-surface">
              {z.name}
            </span>
            <input
              type="number"
              value={z.target ?? ''}
              onChange={(e) => setZikrTarget(z.name, e.target.value)}
              min={1}
              max={100000000}
              placeholder="e.g., 1000"
              className="w-32 bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-3 h-touch-target-min font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>
        ))}
      </div>

      {/* Period */}
      <div className="flex flex-col gap-2">
        <span className="font-caption text-caption text-on-surface-variant">
          {t('plan.period')}
        </span>
        <div className="flex gap-2 bg-surface-container-low p-1 rounded-xl">
          {(['daily', 'weekly', 'monthly', 'one-time'] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => onChange({ ...draft, period })}
              className={`flex-1 py-2.5 px-2 rounded-lg font-caption text-caption transition-all ${
                draft.period === period
                  ? 'bg-surface text-on-surface shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-variant/50'
              }`}
            >
              {period === 'daily'
                ? t('plan.periodDaily')
                : period === 'weekly'
                  ? t('plan.periodWeekly')
                  : period === 'monthly'
                    ? t('plan.periodMonthly')
                    : t('plan.periodOneTime')}
            </button>
          ))}
        </div>

        {/* One-time window presets */}
        {draft.period === 'one-time' && (
          <>
            <div className="flex gap-2 bg-surface-container-low p-1 rounded-xl">
              {(['today', 'week', 'custom'] as PlanPreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChange({ ...draft, preset })}
                  className={`flex-1 py-2.5 px-3 rounded-lg font-caption text-caption transition-all ${
                    draft.preset === preset
                      ? 'bg-surface text-on-surface shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-variant/50'
                  }`}
                >
                  {preset === 'today'
                    ? t('createRoom.today')
                    : preset === 'week'
                      ? t('createRoom.week')
                      : t('createRoom.customWindow')}
                </button>
              ))}
            </div>
            {draft.preset === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label={t('createRoom.starts')}
                  type="date"
                  value={draft.startDate}
                  onChange={(v) => onChange({ ...draft, startDate: String(v) })}
                />
                <InputField
                  label={t('createRoom.ends')}
                  type="date"
                  value={draft.endDate}
                  onChange={(v) => onChange({ ...draft, endDate: String(v) })}
                />
              </div>
            )}
          </>
        )}
        {draft.period !== 'one-time' && (
          <p className="font-caption text-caption text-on-surface-variant/80">
            {t('plan.recurringHint')}
          </p>
        )}
      </div>
    </div>
  );
};

/** Validate a draft; returns an i18n key (error) or null when valid. */
export function validateGroupPlanDraft(draft: GroupPlanDraft): string | null {
  if (draft.zikrs.length === 0) return 'createRoom.chooseZikr';
  const invalid = draft.zikrs.some(z => {
    const num = z.target;
    return num == null || isNaN(num) || num < 1 || num > 100000000;
  });
  if (invalid) return 'createRoom.invalidTarget';
  if (draft.period === 'one-time') {
    const win = groupPlanWindow(draft);
    if (!win) return 'createRoom.endInFuture';
    if (win.endsAt.getTime() <= Date.now()) return 'createRoom.endInFuture';
    if (win.endsAt.getTime() <= win.startsAt.getTime()) return 'createRoom.endAfterStart';
  }
  return null;
}

/** Draft → CreatePlanInput for the backend. */
export function groupPlanToInput(draft: GroupPlanDraft): CreatePlanInput {
  const win = groupPlanWindow(draft);
  return {
    title: draft.title.trim() || undefined,
    mode: 'per-zikr',
    period: draft.period,
    timeZone: draft.period === 'one-time' ? undefined : deviceTimeZone(),
    zikrs: draft.zikrs.map(z => ({
      name: z.name,
      arabic: z.arabic || undefined,
      target: z.target,
    })),
    startsAt: win?.startsAt,
    endsAt: win?.endsAt,
  };
}

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export default GroupPlanBuilder;
