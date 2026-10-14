/**
 * Feedback Form Modal — the presentational feedback form (Settings).
 *
 * Category chips, message, optional reply email. Owns only its draft
 * state and inline field validation; submission state, server error
 * codes, and success come in as props from FeedbackSettingsContainer
 * (which owns the store). Submitting pops the shared Turnstile card on
 * top — the modal just disables its buttons while in flight.
 */

import React, { useEffect, useState } from 'react';
import MaterialIcon from './MaterialIcon';
import OrnamentDivider from './decor/OrnamentDivider';
import { useI18n } from '../../core/i18n';
import { feedbackErrorKey } from '../utils/feedbackErrors';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX,
} from '../../core/stores/feedbackStore';
import type { FeedbackCategory, FeedbackErrorCode } from '../../core/stores/feedbackStore';

export interface FeedbackDraft {
  category: FeedbackCategory;
  message: string;
  email: string;
}

interface FeedbackFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  submitting: boolean;
  /** Store-held error code from the last submit attempt (null = none). */
  error: FeedbackErrorCode | null;
  /** Success phase — renders the thank-you card instead of the form. */
  success: boolean;
  onSubmit: (draft: FeedbackDraft) => void;
}

const FeedbackFormModal: React.FC<FeedbackFormModalProps> = ({
  isOpen,
  onClose,
  submitting,
  error,
  success,
  onSubmit,
}) => {
  const { t } = useI18n();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCategory('bug');
      setMessage('');
      setEmail('');
      setLocalError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!message.trim()) {
      setLocalError(t('feedback.required'));
      return;
    }
    setLocalError(null);
    onSubmit({ category, message, email });
  };

  const displayError = localError ?? (error ? t(feedbackErrorKey(error)) : null);
  const charsLeft = FEEDBACK_MESSAGE_MAX - message.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={submitting ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('feedback.title')}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {success ? (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-20 rounded-t-full rounded-b-xl bg-primary-container flex items-center justify-center mb-4">
              <MaterialIcon icon="check_circle" className="text-on-primary text-[32px]" />
            </div>
            <h2 className="font-headline-md text-headline-md text-primary mb-1">
              {t('feedback.successTitle')}
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-5">
              {t('feedback.successBody')}
            </p>
            <button
              onClick={onClose}
              className="w-full h-touch-target-min rounded-xl bg-primary-container text-on-primary font-label-md text-label-md hover:opacity-90 transition-opacity"
            >
              {t('common.done')}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-headline-lg text-headline-lg text-primary">
                {t('feedback.title')}
              </h2>
              <button
                onClick={onClose}
                disabled={submitting}
                className="text-on-surface-variant hover:text-on-surface transition-colors p-1 disabled:opacity-40"
                aria-label={t('common.close')}
              >
                <MaterialIcon icon="close" className="text-[24px]" />
              </button>
            </div>
            <OrnamentDivider className="mb-5" />

            <div className="flex flex-col gap-5">
              {/* Category chips */}
              <div>
                <p className="font-caption text-caption text-on-surface-variant mb-2">
                  {t('feedback.category')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`px-3 py-2 rounded-lg font-label-md text-label-md border transition-all active-scale-95 ${
                        category === c
                          ? 'bg-primary-container text-on-primary border-primary-container'
                          : 'border-outline-variant/40 text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      {t(`feedback.category.${c}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <label
                  htmlFor="feedback-message"
                  className="font-caption text-caption text-on-surface-variant mb-2 block"
                >
                  {t('feedback.message')}
                </label>
                <textarea
                  id="feedback-message"
                  value={message}
                  maxLength={FEEDBACK_MESSAGE_MAX}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('feedback.messagePlaceholder')}
                  rows={5}
                  autoFocus
                  className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors resize-none"
                />
                {charsLeft <= 100 && (
                  <p className="font-caption text-caption text-on-surface-variant mt-1 text-right">
                    {t('feedback.charactersLeft', { count: charsLeft })}
                  </p>
                )}
              </div>

              {/* Optional reply email */}
              <div>
                <label
                  htmlFor="feedback-email"
                  className="font-caption text-caption text-on-surface-variant mb-2 block"
                >
                  {t('feedback.email')}
                </label>
                <input
                  id="feedback-email"
                  type="email"
                  value={email}
                  maxLength={120}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 h-12 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                />
                <p className="font-caption text-caption text-on-surface-variant mt-1">
                  {t('feedback.emailHint')}
                </p>
              </div>

              {displayError && (
                <p className="font-caption text-caption text-error" role="alert">
                  {displayError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 h-touch-target-min rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/50 transition-colors disabled:opacity-40"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !message.trim()}
                  className="flex-1 h-touch-target-min rounded-xl bg-primary-container text-on-primary font-label-md text-label-md hover:opacity-90 active-scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
                      {t('feedback.submitting')}
                    </>
                  ) : (
                    t('feedback.submit')
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FeedbackFormModal;
