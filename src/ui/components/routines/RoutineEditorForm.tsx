/**
 * RoutineEditorForm — the create/edit routine form (§16.3). Presentational:
 * the draft (title + ordered items with per-item counts) and the library
 * picker options arrive via props; every change bubbles up as a callback.
 * Bounds surface as a gentle warning, never a hard error (§5.1).
 */

import React, { useMemo, useState } from 'react';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../../core/i18n';
import RoutineItemEditorRow from './RoutineItemEditorRow';
import { Zikr } from '../../../core/db/types';

/** One draft item as the form sees it (positional — duplicates allowed). */
export interface RoutineDraftItem {
  zikrId: number;
  name: string;
  arabicText?: string;
  target: number;
}

interface RoutineEditorFormProps {
  items: RoutineDraftItem[];
  warning?: string | null;
  /** Live library options for the picker (container-derived). */
  pickerOptions: Zikr[];
  onTitleChange: (title: string) => void;
  onAddZikr: (zikr: Zikr) => void;
  onRemoveItem: (index: number) => void;
  onMoveItem: (index: number, dir: 'up' | 'down') => void;
  onCountChange: (index: number, count: number) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
  /** Hide the name field (preset-derived edits keep their i18n title). */
  showNameField?: boolean;
}

const RoutineEditorForm: React.FC<RoutineEditorFormProps> = ({
  items,
  warning,
  pickerOptions,
  onTitleChange,
  onAddZikr,
  onRemoveItem,
  onMoveItem,
  onCountChange,
  onSave,
  onCancel,
  saveLabel,
  showNameField = true,
}) => {
  const { lang, t } = useI18n();
  const [pickerId, setPickerId] = useState('');
  const [titleText, setTitleText] = useState('');

  const options = useMemo(
    () =>
      pickerOptions.map(z => ({
        zikr: z,
        label: lang === 'bn' && z.nameBn ? `${z.nameBn} (${z.name})` : z.name,
      })),
    [pickerOptions, lang]
  );

  const handleAdd = () => {
    const picked = options.find(o => String(o.zikr.id) === pickerId)?.zikr;
    if (!picked) return;
    onAddZikr(picked);
    setPickerId('');
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="flex flex-col gap-4"
    >
      {showNameField && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="routine-title" className="font-label-md text-label-md text-on-surface">
            {t('routine.editor.nameLabel')}
          </label>
          <input
            id="routine-title"
            type="text"
            maxLength={60}
            placeholder={t('routine.editor.namePlaceholder')}
            onChange={(e) => {
              setTitleText(e.target.value);
              onTitleChange(e.target.value);
            }}
            value={titleText}
            className="h-12 px-4 rounded-xl bg-surface border border-outline-variant/40 text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-tertiary"
          />
        </div>
      )}

      {/* Library picker — ordered rows are added from the user's own zikrs */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="routine-picker" className="font-label-md text-label-md text-on-surface">
          {t('routine.editor.pickZikr')}
        </label>
        <div className="flex gap-2">
          <select
            id="routine-picker"
            value={pickerId}
            onChange={(e) => setPickerId(e.target.value)}
            className="flex-1 min-w-0 h-12 px-3 rounded-xl bg-surface border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:border-tertiary"
          >
            <option value="">{t('routine.editor.pickPlaceholder')}</option>
            {options.map(({ zikr, label }) => (
              <option key={zikr.id} value={String(zikr.id)}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!pickerId}
            className="h-12 px-4 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md disabled:opacity-40 hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <MaterialIcon icon="add" className="text-[20px]" />
          </button>
        </div>
      </div>

      {/* Ordered item rows */}
      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((item, index) => (
            <RoutineItemEditorRow
              key={`${item.zikrId}-${index}`}
              name={item.name}
              arabicText={item.arabicText}
              count={item.target}
              canMoveUp={index > 0}
              canMoveDown={index < items.length - 1}
              onCountChange={(count) => onCountChange(index, count)}
              onRemove={() => onRemoveItem(index)}
              onMove={(dir) => onMoveItem(index, dir)}
            />
          ))}
        </div>
      )}

      {warning && (
        <p role="note" className="font-caption text-caption text-on-surface-variant">
          {warning}
        </p>
      )}

      <div className="flex gap-3 mt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-touch-target-min rounded-xl border border-outline-variant/40 text-on-surface font-label-md text-label-md hover:bg-surface-variant/40 active:scale-[0.98] transition-all"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          className="flex-1 h-touch-target-min rounded-xl bg-primary-container text-on-primary font-label-md text-label-md hover:opacity-90 active:scale-[0.98] transition-all"
        >
          {saveLabel}
        </button>
      </div>
    </form>
  );
};

export default RoutineEditorForm;
