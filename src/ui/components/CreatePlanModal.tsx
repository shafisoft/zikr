/**
 * Create Plan Modal — the group owner starts a new plan inside an
 * existing group. Same fields as the first plan at group creation
 * (GroupPlanBuilder); the group keeps its code and members.
 */

import React, { useEffect, useState } from 'react';
import MaterialIcon from './MaterialIcon';
import OrnamentDivider from './decor/OrnamentDivider';
import GroupPlanBuilder, {
  emptyGroupPlanDraft,
  groupPlanToInput,
  validateGroupPlanDraft,
  GroupPlanDraft,
} from './GroupPlanBuilder';
import { useSharedRoomStore } from '../../core/stores/sharedRoomStore';
import { sharedRoomErrorMessage } from '../utils/roomErrors';
import { useI18n } from '../../core/i18n';

interface CreatePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  /** Called after the plan is created. */
  onCreated?: () => void;
}

const CreatePlanModal: React.FC<CreatePlanModalProps> = ({ isOpen, onClose, roomCode, onCreated }) => {
  const { t } = useI18n();
  const createPlan = useSharedRoomStore(state => state.createPlan);

  const [draft, setDraft] = useState<GroupPlanDraft>(emptyGroupPlanDraft());
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(emptyGroupPlanDraft());
      setLocalError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setLocalError(null);
    const draftError = validateGroupPlanDraft(draft);
    if (draftError) {
      setLocalError(t(draftError));
      return;
    }

    setSubmitting(true);
    try {
      await createPlan(roomCode, groupPlanToInput(draft));
      onCreated?.();
      onClose();
    } catch (err) {
      setLocalError(sharedRoomErrorMessage(err));
    } finally {
      setSubmitting(false);
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
          <h2 className="font-headline-lg text-headline-lg text-primary">{t('plan.newTitle')}</h2>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
            aria-label="Close"
          >
            <MaterialIcon icon="close" className="text-[24px]" />
          </button>
        </div>
        <p className="font-caption text-caption text-on-surface-variant mb-4">
          {t('plan.newSub')}
        </p>
        <OrnamentDivider className="mb-6" />

        <div className="flex flex-col gap-6">
          <GroupPlanBuilder draft={draft} onChange={setDraft} />

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
            <MaterialIcon icon="add_circle" className="text-[20px]" />
            {submitting ? t('plan.creating') : t('plan.create')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePlanModal;
