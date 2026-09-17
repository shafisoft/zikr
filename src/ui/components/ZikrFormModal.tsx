/**
 * ZikrFormModal Component (V2)
 * Modal for creating and editing zikrs
 */

import React, { useState, useEffect } from 'react';
import MaterialIcon from './MaterialIcon';
import { showAlert } from './ConfirmDialog';
import { ToggleSwitch } from './forms/ToggleSwitch';
import { Zikr } from '../../core/db/types';
import { useZikrStore } from '../../core/stores/zikrStore';
import { getZikrDisplayInfo, getPredefinedZikrNames } from '../utils/zikrMapping';
import { useI18n } from '../../core/i18n';

interface ZikrFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional post-save hook. Stores update themselves via liveQuery. */
  onSave?: () => void;
  editZikr?: Zikr | null;
}

interface FormErrors {
  name?: string;
  translation?: string;
}

const PREDEFINED_ZIKR_OPTIONS = getPredefinedZikrNames();

const ZikrFormModal: React.FC<ZikrFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editZikr,
}) => {
  const { lang, t } = useI18n();
  const addZikr = useZikrStore(state => state.addZikr);
  const updateZikr = useZikrStore(state => state.updateZikr);
  const [isCustom, setIsCustom] = useState(!editZikr || editZikr.custom);
  const [selectedPredefined, setSelectedPredefined] = useState('');
  const [customName, setCustomName] = useState('');
  const [customTranslation, setCustomTranslation] = useState('');
  const [customArabic, setCustomArabic] = useState('');
  const [shareWithOthers, setShareWithOthers] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when modal opens or editZikr changes
  useEffect(() => {
    if (isOpen) {
      if (editZikr) {
        setIsCustom(editZikr.custom);
        setShareWithOthers(false);
        if (editZikr.custom) {
          setCustomName(editZikr.name);
          setCustomTranslation(editZikr.translation ?? '');
          setCustomArabic(editZikr.arabicText ?? '');
        } else {
          setSelectedPredefined(editZikr.name);
        }
      } else {
        setIsCustom(false);
        setSelectedPredefined('');
        setCustomName('');
        setCustomTranslation('');
        setCustomArabic('');
        setShareWithOthers(false);
      }
      setErrors({});
    }
  }, [isOpen, editZikr, lang]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, isSaving]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (isCustom) {
      if (!customName.trim()) {
        newErrors.name = t('zikrForm.nameRequired');
      } else if (customName.length > 50) {
        newErrors.name = t('zikrForm.nameTooLong');
      }
      // No character-class restriction: the name is free text shown as-is
      // (Bangla/Arabic script, digits, punctuation are all legitimate).

      if (!customTranslation.trim()) {
        newErrors.translation = t('zikrForm.translationRequired');
      } else if (customTranslation.length > 100) {
        newErrors.translation = t('zikrForm.translationTooLong');
      }
    } else {
      if (!selectedPredefined) {
        newErrors.name = t('zikrForm.select');
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSaving(true);

    try {
      const zikrName = isCustom ? customName.trim() : selectedPredefined;
      // Persist the user-entered Arabic text and meaning for custom zikrs so
      // they survive reloads (predefined zikrs resolve these via zikrMapping).
      const customFields = isCustom
        ? {
            arabicText: customArabic.trim() || undefined,
            translation: customTranslation.trim() || undefined,
          }
        : {};

      if (editZikr) {
        // Update existing zikr
        await updateZikr(editZikr.id!, {
          name: zikrName,
          custom: isCustom,
          ...customFields,
        });
      } else {
        // Create new zikr — the store fans the "share with others" toggle
        // out to the shared library (best-effort, retried in background).
        await addZikr({
          name: zikrName,
          custom: isCustom,
          createdAt: new Date(),
          ...customFields,
          shareWithOthers: isCustom && shareWithOthers,
        });
      }

      // Close modal and refresh
      onSave?.();
      onClose();
    } catch (error) {
      if (error instanceof Error && error.message === 'DUPLICATE_ZIKR') {
        // Surface as a field error so the user can adjust without losing input
        setErrors({ name: t('zikrForm.duplicateName') });
      } else {
        console.error('Failed to save zikr:', error);
        await showAlert({ message: t('zikrForm.saveFailed'), icon: 'error_outline' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline-lg text-headline-lg text-primary">
            {editZikr ? t('zikrForm.editTitle') : t('zikrForm.createTitle')}
          </h2>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
            aria-label="Close"
          >
            <MaterialIcon icon="close" className="text-[24px]" />
          </button>
        </div>

        {/* Warning for predefined zikrs */}
        {editZikr && !editZikr.custom && (
          <div className="bg-error/10 border border-error/20 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <MaterialIcon icon="info" className="text-error text-[20px] mt-0.5" />
              <div>
                <p className="font-body-md text-body-md text-error font-medium mb-1">
                  {t('zikrForm.predefinedWarningTitle')}
                </p>
                <p className="font-caption text-caption text-error/80">
                  {t('zikrForm.predefinedWarningBody')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Zikr Type Toggle */}
          {!editZikr && (
            <div className="flex gap-2 bg-surface-container-low p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setIsCustom(false)}
                className={`flex-1 py-3 px-4 rounded-lg font-label-md text-label-md transition-all ${
                  !isCustom
                    ? 'bg-surface text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-variant/50'
                }`}
              >
                {t('zikrForm.predefined')}
              </button>
              <button
                type="button"
                onClick={() => setIsCustom(true)}
                className={`flex-1 py-3 px-4 rounded-lg font-label-md text-label-md transition-all ${
                  isCustom
                    ? 'bg-surface text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-variant/50'
                }`}
              >
                {t('zikrForm.custom')}
              </button>
            </div>
          )}

          {/* Predefined Zikr Selection */}
          {!isCustom && (
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-2">
                {t('zikrForm.selectLabel')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PREDEFINED_ZIKR_OPTIONS.map((name) => {
                  const displayInfo = getZikrDisplayInfo(name, lang);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSelectedPredefined(name)}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        selectedPredefined === name
                          ? 'border-primary bg-primary-container/20'
                          : 'border-outline-variant/30 hover:border-outline-variant'
                      }`}
                    >
                      <p className="font-display-arabic text-display-arabic text-primary text-sm mb-1">
                        {displayInfo.arabicText}
                      </p>
                      <p className="font-label-md text-label-md text-on-surface">
                        {name}
                      </p>
                      <p className="font-caption text-caption text-on-surface-variant">
                        {displayInfo.defaultTarget}x
                      </p>
                    </button>
                  );
                })}
              </div>
              {errors.name && (
                <p className="font-caption text-caption text-error mt-2">{errors.name}</p>
              )}
            </div>
          )}

          {/* Custom Zikr Form */}
          {isCustom && (
            <>
              {/* Zikr Name */}
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-2">
                  {t('zikrForm.name')} *
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={t('zikrForm.namePlaceholder')}
                  maxLength={50}
                  className={`w-full bg-surface-container-low border ${
                    errors.name ? 'border-error' : 'border-outline-variant/50'
                  } rounded-xl px-4 h-touch-target-min font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors`}
                  disabled={isSaving}
                />
                {errors.name && (
                  <p className="font-caption text-caption text-error mt-2">{errors.name}</p>
                )}
              </div>

              {/* Arabic Text (Optional) */}
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-2">
                  {t('zikrForm.arabicLabel')}
                </label>
                <input
                  type="text"
                  value={customArabic}
                  onChange={(e) => setCustomArabic(e.target.value)}
                  placeholder={t('zikrForm.arabicPlaceholder')}
                  className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 h-touch-target-min font-display-arabic text-display-arabic text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors text-right dir=rtl"
                  disabled={isSaving}
                />
                <p className="font-caption text-caption text-on-surface-variant mt-2">
                  {t('zikrForm.arabicHint')}
                </p>
              </div>

              {/* Translation */}
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-2">
                  {t('zikrForm.translation')} *
                </label>
                <input
                  type="text"
                  value={customTranslation}
                  onChange={(e) => setCustomTranslation(e.target.value)}
                  placeholder={t('zikrForm.translationPlaceholder')}
                  maxLength={100}
                  className={`w-full bg-surface-container-low border ${
                    errors.translation ? 'border-error' : 'border-outline-variant/50'
                  } rounded-xl px-4 h-touch-target-min font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors`}
                  disabled={isSaving}
                />
                {errors.translation && (
                  <p className="font-caption text-caption text-error mt-2">{errors.translation}</p>
                )}
              </div>

              {/* Share with others (creation only — edits are never synced) */}
              {!editZikr && (
                <div className="bg-surface-container-low rounded-xl p-4 flex flex-col gap-2">
                  <ToggleSwitch
                    checked={shareWithOthers}
                    onChange={setShareWithOthers}
                    label={t('zikrForm.shareLabel')}
                    disabled={isSaving}
                  />
                  {shareWithOthers && (
                    <p className="font-caption text-caption text-on-surface-variant">
                      {t('zikrForm.shareHint')}
                    </p>
                  )}
                </div>
              )}

              {/* Target Count Info */}
              <div className="bg-surface-container-low rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <MaterialIcon icon="info" className="text-primary text-[20px]" />
                  <div>
                    <p className="font-body-md text-body-md text-on-surface">
                      {t('zikrForm.targetInfoTitle')}
                    </p>
                    <p className="font-caption text-caption text-on-surface-variant">
                      {t('zikrForm.targetInfoBody')}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-touch-target-min rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/50 transition-colors"
              disabled={isSaving}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 h-touch-target-min rounded-xl font-label-md text-label-md bg-primary-container text-on-primary hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              disabled={isSaving}
            >
              <MaterialIcon icon={editZikr ? 'save' : 'add_circle'} className="text-[18px]" />
              {isSaving ? t('progress.saving') : editZikr ? t('zikrForm.saveChanges') : t('zikrForm.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ZikrFormModal;
