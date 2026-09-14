/**
 * Create Room Modal — multi-step shared-goal creation.
 * Step 1 "details": name, title, zikr, target, time window.
 * Step 2 "share": room code + copy-link actions.
 * Noor design system.
 */

import React, { useEffect, useMemo, useState } from 'react';
import MaterialIcon from './MaterialIcon';
import InputField from './forms/InputField';
import OrnamentDivider from './decor/OrnamentDivider';
import { useSharedRoomStore } from '../../core/stores/sharedRoomStore';
import { sharedRoomErrorMessage } from '../utils/roomErrors';
import { SharedRoom } from '../../core/db/types';
import { getPredefinedZikrNames, getZikrDisplayInfo } from '../utils/zikrMapping';
import { windowPreset } from '../../core/utils/sharedRoomUtils';
import { useI18n } from '../../core/i18n';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the created room when the user taps "Go to room". */
  onCreated: (room: SharedRoom) => void;
}

type PresetKey = 'today' | 'week' | 'custom';

const dateToInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ isOpen, onClose, onCreated }) => {
  const { lang, t } = useI18n();
  const { identity, createRoom, updateDisplayName } = useSharedRoomStore();

  const [step, setStep] = useState<'details' | 'share'>('details');
  const [displayName, setDisplayName] = useState('');
  const [title, setTitle] = useState('');
  const [zikrChoice, setZikrChoice] = useState<string>('SubhanAllah');
  const [customZikr, setCustomZikr] = useState('');
  const [target, setTarget] = useState<string>('1000');
  const [preset, setPreset] = useState<PresetKey>('week');
  const [startDate, setStartDate] = useState(dateToInput(new Date()));
  const [endDate, setEndDate] = useState(dateToInput(new Date(Date.now() + 7 * 86400_000)));
  const [created, setCreated] = useState<SharedRoom | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const zikrOptions = useMemo(() => getPredefinedZikrNames(), []);

  useEffect(() => {
    if (isOpen) {
      setStep('details');
      setDisplayName(useSharedRoomStore.getState().identity?.displayName || '');
      setTitle('');
      setZikrChoice('SubhanAllah');
      setCustomZikr('');
      setTarget('1000');
      setPreset('week');
      setStartDate(dateToInput(new Date()));
      setEndDate(dateToInput(new Date(Date.now() + 7 * 86400_000)));
      setCreated(null);
      setLocalError(null);
      setCopied(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const zikrName = zikrChoice === '__custom__' ? customZikr.trim() : zikrChoice;
  const zikrArabic = zikrChoice === '__custom__' ? '' : getZikrDisplayInfo(zikrChoice, lang).arabicText;

  const computeWindow = (): { startsAt: Date; endsAt: Date } => {
    if (preset !== 'custom') return windowPreset(preset);
    const startsAt = new Date(`${startDate}T00:00:00`);
    const endsAt = new Date(`${endDate}T23:59:59.999`);
    return { startsAt, endsAt };
  };

  const handleCreate = async () => {
    setLocalError(null);

    const name = displayName.trim();
    if (!name) {
      setLocalError(t('createRoom.nameRequired'));
      return;
    }
    if (!zikrName) {
      setLocalError(t('createRoom.chooseZikr'));
      return;
    }
    const targetNum = parseInt(target, 10);
    if (isNaN(targetNum) || targetNum < 1 || targetNum > 100000000) {
      setLocalError(t('createRoom.invalidTarget'));
      return;
    }
    const { startsAt, endsAt } = computeWindow();
    if (endsAt.getTime() <= Date.now()) {
      setLocalError(t('createRoom.endInFuture'));
      return;
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      setLocalError(t('createRoom.endAfterStart'));
      return;
    }

    setSubmitting(true);
    try {
      if (name !== identity?.displayName) {
        await updateDisplayName(name);
      }
      const room = await createRoom({
        title: title.trim() || `${zikrName} together`,
        zikrName,
        zikrArabic: zikrArabic || undefined,
        target: targetNum,
        startsAt,
        endsAt,
        windowType: preset,
      });
      setCreated(room);
      setStep('share');
    } catch (err) {
      setLocalError(sharedRoomErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const shareLink = created
    ? `${window.location.origin}${import.meta.env.BASE_URL}join/${created.code}`
    : '';

  const copy = async (kind: 'code' | 'link', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setLocalError(t('createRoom.copyFailed'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'details' && (
          <>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-headline-lg text-headline-lg text-primary">{t('createRoom.title')}</h2>
              <button
                onClick={onClose}
                className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
                aria-label="Close"
              >
                <MaterialIcon icon="close" className="text-[24px]" />
              </button>
            </div>
            <p className="font-caption text-caption text-on-surface-variant mb-4">
              {t('createRoom.sub')}
            </p>
            <OrnamentDivider className="mb-6" />

            <div className="flex flex-col gap-6">
              <InputField
                label={t('createRoom.yourName')}
                placeholder={t('createRoom.namePlaceholder')}
                value={displayName}
                onChange={(v) => setDisplayName(String(v))}
                icon="person"
                required
              />

              <InputField
                label={t('createRoom.goalTitle')}
                placeholder={t('createRoom.titlePlaceholder')}
                value={title}
                onChange={(v) => setTitle(String(v))}
                icon="flag"
              />

              {/* What will be read */}
              <div className="flex flex-col gap-2">
                <span className="font-caption text-caption text-on-surface-variant">
                  {t('createRoom.whatToRead')}
                </span>
                <div className="flex flex-wrap gap-2">
                  {zikrOptions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setZikrChoice(name)}
                      className={`px-3 py-2 rounded-full font-caption text-caption border transition-all ${
                        zikrChoice === name
                          ? 'bg-primary-container text-on-primary border-transparent'
                          : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setZikrChoice('__custom__')}
                    className={`px-3 py-2 rounded-full font-caption text-caption border transition-all ${
                      zikrChoice === '__custom__'
                        ? 'bg-primary-container text-on-primary border-transparent'
                        : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
                      }`}
                  >
                    {t('createRoom.custom')}
                  </button>
                </div>
                {zikrChoice === '__custom__' && (
                  <input
                    type="text"
                    value={customZikr}
                    onChange={(e) => setCustomZikr(e.target.value)}
                    placeholder={t('createRoom.customPlaceholder')}
                    maxLength={80}
                    className="mt-1 w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 h-touch-target-min font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  />
                )}
              </div>

              <InputField
                label={t('createRoom.target')}
                type="number"
                placeholder={t('createRoom.targetPlaceholder')}
                value={target}
                onChange={(v) => setTarget(String(v))}
                icon="track_changes"
                required
              />

              {/* Time window */}
              <div className="flex flex-col gap-2">
                <span className="font-caption text-caption text-on-surface-variant">
                  {t('createRoom.timeWindow')}
                </span>
                <div className="flex gap-2 bg-surface-container-low p-1 rounded-xl">
                  {(['today', 'week', 'custom'] as PresetKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPreset(key)}
                      className={`flex-1 py-2.5 px-3 rounded-lg font-caption text-caption transition-all ${
                        preset === key
                          ? 'bg-surface text-on-surface shadow-sm'
                          : 'text-on-surface-variant hover:bg-surface-variant/50'
                      }`}
                    >
                      {key === 'today' ? t('createRoom.today') : key === 'week' ? t('createRoom.week') : t('createRoom.customWindow')}
                    </button>
                  ))}
                </div>
                {preset === 'custom' && (
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <InputField
                      label={t('createRoom.starts')}
                      type="date"
                      value={startDate}
                      onChange={(v) => setStartDate(String(v))}
                    />
                    <InputField
                      label={t('createRoom.ends')}
                      type="date"
                      value={endDate}
                      onChange={(v) => setEndDate(String(v))}
                    />
                  </div>
                )}
              </div>

              {localError && (
                <p className="font-caption text-caption text-error" role="alert">
                  {localError}
                </p>
              )}

              <button
                onClick={handleCreate}
                disabled={submitting}
                className="w-full h-touch-target-min bg-primary-container text-on-primary rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 active-scale-98 transition-all disabled:opacity-50"
              >
                <MaterialIcon icon="groups" className="text-[20px]" />
                {submitting ? t('createRoom.creating') : t('createRoom.create')}
              </button>
            </div>
          </>
        )}

        {step === 'share' && created && (
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-20 rounded-t-full rounded-b-xl border border-tertiary-container/40 bg-surface-container-low flex items-center justify-center mb-4">
              <MaterialIcon icon="groups" filled className="text-4xl text-tertiary" />
            </div>
            <h2 className="font-headline-lg text-headline-lg text-primary mb-1">{t('createRoom.created')}</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-4">
              {t('createRoom.shareSub')}
            </p>

            <div className="w-full bg-surface-container-low rounded-xl border border-tertiary-container/30 p-6 mb-3">
              <p className="font-label-md text-label-md text-[32px] tracking-[0.3em] text-primary tabular-nums">
                {created.code}
              </p>
            </div>

            <div className="flex gap-3 w-full mb-6">
              <button
                onClick={() => copy('code', created.code)}
                className="flex-1 h-touch-target-min rounded-xl border border-outline-variant/40 font-label-md text-label-md text-primary flex items-center justify-center gap-2 hover:bg-surface-variant/40 transition-colors"
              >
                <MaterialIcon icon="content_copy" className="text-[20px]" />
                {copied === 'code' ? t('room.copied') : t('createRoom.copyCode')}
              </button>
              <button
                onClick={() => copy('link', shareLink)}
                className="flex-1 h-touch-target-min rounded-xl border border-outline-variant/40 font-label-md text-label-md text-primary flex items-center justify-center gap-2 hover:bg-surface-variant/40 transition-colors"
              >
                <MaterialIcon icon="link" className="text-[20px]" />
                {copied === 'link' ? t('room.copied') : t('createRoom.copyLink')}
              </button>
            </div>

            {localError && (
              <p className="font-caption text-caption text-error mb-4" role="alert">
                {localError}
              </p>
            )}

            <button
              onClick={() => onCreated(created)}
              className="w-full h-touch-target-min bg-primary-container text-on-primary rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 active-scale-98 transition-all"
            >
              {t('createRoom.openRoom')}
              <MaterialIcon icon="arrow_forward" className="text-[20px]" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateRoomModal;
