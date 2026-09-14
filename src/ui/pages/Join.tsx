/**
 * Join Deep-Link Page (/join/:code) — entry point from a shared invite link.
 * Shows the code, asks for a name, joins, and opens the room.
 * Noor design system.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MaterialIcon from '../components/MaterialIcon';
import PatternBackdrop from '../components/decor/PatternBackdrop';
import OrnamentDivider from '../components/decor/OrnamentDivider';
import InputField from '../components/forms/InputField';
import { useSharedRoomStore } from '../../core/stores/sharedRoomStore';
import { sharedRoomErrorMessage } from '../utils/roomErrors';
import { normalizeRoomCode } from '../../core/utils/sharedRoomUtils';
import { useI18n } from '../../core/i18n';

const Join: React.FC = () => {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { identity, configured, joinRoom, updateDisplayName } = useSharedRoomStore();

  const normalized = normalizeRoomCode(code);
  const [displayName, setDisplayName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    setDisplayName(useSharedRoomStore.getState().identity?.displayName || '');
  }, []);

  const handleJoin = async () => {
    setLocalError(null);
    const name = displayName.trim();
    if (!name) {
      setLocalError(t('joinModal.nameRequired'));
      return;
    }
    setJoining(true);
    try {
      if (name !== identity?.displayName) {
        await updateDisplayName(name);
      }
      const room = await joinRoom(normalized || code);
      navigate(`/group/${room.code}`, { replace: true });
    } catch (err) {
      setLocalError(sharedRoomErrorMessage(err));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface antialiased flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <PatternBackdrop className="absolute top-0 left-0 right-0 h-[45%]" />

      <main className="w-full max-w-md relative z-10 flex flex-col items-center">
        <p className="font-display-arabic text-[28px] leading-10 text-tertiary mb-2" lang="ar" dir="rtl">
          أَهْلًا بِكُمْ
        </p>
        <OrnamentDivider className="w-40 mb-8" />

        <div className="w-full bg-surface-container-low rounded-2xl border border-tertiary-container/30 shadow-card p-6 flex flex-col items-center">
          <div className="w-16 h-20 rounded-t-full rounded-b-xl border border-tertiary-container/40 bg-surface-container-lowest flex items-center justify-center mb-4">
            <MaterialIcon icon="group_add" filled className="text-4xl text-tertiary" />
          </div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary mb-1">
            {t('join.invited')}
          </h1>
          <p className="font-caption text-caption text-on-surface-variant mb-6">
            {t('join.sub')}
          </p>

          <div className="w-full bg-surface-container-lowest rounded-xl border border-outline-variant/30 py-4 text-center mb-6">
            <span className="font-label-md text-label-md text-[26px] tracking-[0.3em] text-primary tabular-nums">
              {normalized || code || '??????'}
            </span>
          </div>

          {!normalized && (
            <p className="font-caption text-caption text-error mb-4" role="alert">
              {t('join.invalidLink')}
            </p>
          )}

          <div className="w-full flex flex-col gap-4">
            <InputField
              label={t('join.yourName')}
              placeholder="e.g., Ahmed"
              value={displayName}
              onChange={(v) => setDisplayName(String(v))}
              icon="person"
              required
            />

            {localError && (
              <p className="font-caption text-caption text-error" role="alert">
                {localError}
              </p>
            )}

            <button
              onClick={handleJoin}
              disabled={joining || !normalized || !configured}
              className="w-full h-touch-target-min bg-primary-container text-on-primary rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 active-scale-98 transition-all disabled:opacity-50"
            >
              <MaterialIcon icon="group_add" className="text-[20px]" />
              {joining ? t('joinModal.joining') : t('joinModal.join')}
            </button>

            <button
              onClick={() => navigate('/group')}
              className="h-12 rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/50 transition-colors"
            >
              {t('join.goToGroup')}
            </button>
          </div>
        </div>

        <p className="font-caption text-caption text-on-surface-variant mt-6 flex items-center gap-1.5">
          <MaterialIcon icon="lock" className="text-[14px]" />
          {t('join.privacyNote')}
        </p>
      </main>
    </div>
  );
};

export default Join;
