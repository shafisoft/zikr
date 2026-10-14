/**
 * Feedback settings section — the Settings page's feedback entry point.
 *
 * Owns the modal phase (closed / form / success) and the only store
 * touch: submitFeedback plus the returned error code. The modal itself
 * is presentational (FeedbackFormModal), per the page → container →
 * component split. App version, locale, and user agent are attached
 * here so the server row carries enough context to act on.
 */

import React, { useState } from 'react';
import MaterialIcon from '../../components/MaterialIcon';
import FeedbackFormModal from '../../components/FeedbackFormModal';
import type { FeedbackDraft } from '../../components/FeedbackFormModal';
import { useFeedbackStore } from '../../../core/stores/feedbackStore';
import { useI18n } from '../../../core/i18n';

const FeedbackSettingsContainer: React.FC = () => {
  const { t, lang } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const submitting = useFeedbackStore(state => state.submitting);
  const error = useFeedbackStore(state => state.lastError);
  const submitFeedback = useFeedbackStore(state => state.submitFeedback);

  const handleOpen = () => {
    setSuccess(false);
    setIsOpen(true);
  };

  const handleClose = () => {
    // The Turnstile card may own the interaction while submitting —
    // don't yank the form out from under it.
    if (!submitting) setIsOpen(false);
  };

  const handleSubmit = async (draft: FeedbackDraft) => {
    const ok = await submitFeedback({
      category: draft.category,
      message: draft.message,
      email: draft.email || undefined,
      appVersion: process.env.PACKAGE_VERSION,
      locale: lang,
      userAgent: navigator.userAgent,
    });
    if (ok) setSuccess(true);
  };

  return (
    <section>
      <h2 className="font-label-md text-label-md text-on-surface-variant mb-4 px-2">
        {t('feedback.sectionTitle')}
      </h2>
      <button
        onClick={handleOpen}
        className="w-full bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex items-center justify-between active:scale-[0.98] transition-transform text-left"
      >
        <div className="flex items-center gap-4">
          <div className="bg-surface-container-high p-2 rounded-lg">
            <MaterialIcon icon="feedback" className="text-primary text-[20px]" />
          </div>
          <div>
            <p className="font-body-md text-body-md text-on-surface">{t('feedback.open')}</p>
            <p className="font-caption text-caption text-on-surface-variant">
              {t('feedback.openDesc')}
            </p>
          </div>
        </div>
        <MaterialIcon icon="chevron_right" className="text-on-surface-variant" />
      </button>

      <FeedbackFormModal
        isOpen={isOpen}
        onClose={handleClose}
        submitting={submitting}
        error={error}
        success={success}
        onSubmit={handleSubmit}
      />
    </section>
  );
};

export default FeedbackSettingsContainer;
