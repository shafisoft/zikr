/**
 * Join Room Modal — enter a room code + display name to join a shared goal.
 * Also used (embedded) by the /join/:code deep-link page.
 * Noor design system.
 */

import React, { useEffect, useState } from 'react';
import MaterialIcon from './MaterialIcon';
import InputField from './forms/InputField';
import OrnamentDivider from './decor/OrnamentDivider';
import { useSharedRoomStore } from '../../core/stores/sharedRoomStore';
import { sharedRoomErrorMessage } from '../utils/roomErrors';
import { SharedRoom } from '../../core/db/types';
import { normalizeRoomCode } from '../../core/utils/sharedRoomUtils';
import { useI18n } from '../../core/i18n';

interface JoinRoomModalProps {
  isOpen: boolean;
  initialCode?: string;
  onClose: () => void;
  onJoined: (room: SharedRoom) => void;
}

const JoinRoomModal: React.FC<JoinRoomModalProps> = ({ isOpen, initialCode = '', onClose, onJoined }) => {
  const { t } = useI18n();
  const { identity, joinRoom, updateDisplayName } = useSharedRoomStore();

  const [code, setCode] = useState(initialCode);
  const [displayName, setDisplayName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCode(initialCode);
      setDisplayName(useSharedRoomStore.getState().identity?.displayName || '');
      setLocalError(null);
      setJoining(false);
    }
  }, [isOpen, initialCode]);

  if (!isOpen) return null;

  const handleJoin = async () => {
    setLocalError(null);

    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      setLocalError(t('joinModal.codeRequired'));
      return;
    }
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
      const room = await joinRoom(normalized);
      onJoined(room);
    } catch (err) {
      setLocalError(sharedRoomErrorMessage(err));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-headline-lg text-headline-lg text-primary">{t('joinModal.title')}</h2>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
            aria-label="Close"
          >
            <MaterialIcon icon="close" className="text-[24px]" />
          </button>
        </div>
        <p className="font-caption text-caption text-on-surface-variant mb-4">
          {t('joinModal.sub')}
        </p>
        <OrnamentDivider className="mb-6" />

        <div className="flex flex-col gap-6">
          <InputField
            label={t('joinModal.code')}
            placeholder={t('joinModal.codePlaceholder')}
            value={code}
            onChange={(v) => setCode(String(v).toUpperCase())}
            icon="vpn_key"
            required
          />

          <InputField
            label={t('joinModal.yourName')}
            placeholder={t('joinModal.namePlaceholder')}
            value={displayName}
            onChange={(v) => setDisplayName(String(v))}
            icon="person"
            required
          />

          <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex items-start gap-3">
            <MaterialIcon icon="lock" className="text-tertiary text-[20px] mt-0.5" />
            <p className="font-caption text-caption text-on-surface-variant">
              {t('joinModal.privacyNote')}
            </p>
          </div>

          {localError && (
            <p className="font-caption text-caption text-error" role="alert">
              {localError}
            </p>
          )}

          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full h-touch-target-min bg-primary-container text-on-primary rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 active-scale-98 transition-all disabled:opacity-50"
          >
            <MaterialIcon icon="group_add" className="text-[20px]" />
            {joining ? t('joinModal.joining') : t('joinModal.join')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JoinRoomModal;
