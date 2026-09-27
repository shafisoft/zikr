/**
 * RoutineEditorModal — the dialog shell hosting the routine editor
 * (§16.3, the ZikrFormModal idiom). Holds no data itself: the shell opens
 * and closes; the form inside carries the draft and the callbacks.
 */

import React, { useEffect } from 'react';
import MaterialIcon from '../MaterialIcon';

interface RoutineEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const RoutineEditorModal: React.FC<RoutineEditorModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
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
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline-lg text-headline-lg text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
            aria-label="Close"
          >
            <MaterialIcon icon="close" className="text-[24px]" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default RoutineEditorModal;
