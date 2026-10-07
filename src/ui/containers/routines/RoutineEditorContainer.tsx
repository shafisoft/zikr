/**
 * RoutineEditorContainer — create/edit one routine (§16.3). The only
 * data-touching tier of the editor: it subscribes to the zikr library
 * (picker options + default counts) and the routine store (existing routine
 * when editing; the max-5 check), derives the gentle bounds warning, and
 * invokes the store's createCustom/updateItems. Render decisions beyond
 * the form stay on the page (which opens this dialog from its flow state).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import RoutineEditorModal from '../../components/routines/RoutineEditorModal';
import RoutineEditorForm, { RoutineDraftItem } from '../../components/routines/RoutineEditorForm';
import { showAlert } from '../../components/ConfirmDialog';
import { useRoutineStore } from '../../../core/stores/routineStore';
import { useZikrStore } from '../../../core/stores/zikrStore';
import { useI18n } from '../../../core/i18n';
import { getZikrDisplayInfoFromZikr } from '../../utils/zikrMapping';
import { MAX_ROUTINE_ITEMS, routineDraftIssue } from '../../../core/utils/routineUtils';
import type { Routine, Zikr } from '../../../core/db/types';

interface RoutineEditorContainerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Present → edit that routine's items (and a custom routine's title). */
  editing?: Routine | null;
}

const RoutineEditorContainer: React.FC<RoutineEditorContainerProps> = ({
  isOpen,
  onClose,
  editing,
}) => {
  const { lang, t } = useI18n();
  const zikrs = useZikrStore(state => state.zikrs);
  const routines = useRoutineStore(state => state.routines);
  const createCustom = useRoutineStore(state => state.createCustom);
  const updateItems = useRoutineStore(state => state.updateItems);

  const [items, setItems] = useState<RoutineDraftItem[]>([]);
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Fresh draft each time the dialog opens (create or edit).
  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setItems(
        editing.items.map(item => {
          const zikr = zikrs.find(z => z.id === item.zikrId);
          return {
            zikrId: item.zikrId,
            name: item.name,
            arabicText: zikr?.arabicText,
            target: item.target,
          };
        })
      );
      setTitle(editing.title ?? '');
    } else {
      setItems([]);
      setTitle('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editing]);

  const livePickerOptions = useMemo(
    () => zikrs.filter(z => z.id != null && !z.deletedAt),
    [zikrs]
  );

  // Gentle bounds (§5.1): a warning prop, never a hard error in the form.
  // Creation only — the max-5 check does not apply while editing.
  const warning = useMemo(() => {
    const issue = routineDraftIssue({
      itemCount: items.length,
      routineCount: editing ? 0 : routines.length,
    });
    if (issue === 'too-many-routines') return t('routine.editor.maxRoutines');
    if (issue === 'empty' && !editing) return t('routine.editor.empty');
    if (items.length >= MAX_ROUTINE_ITEMS) return t('routine.editor.maxItems');
    return null;
  }, [items.length, routines.length, editing, t]);

  const handleAddZikr = useCallback(
    (zikr: Zikr) => {
      if (zikr.id == null || items.length >= MAX_ROUTINE_ITEMS) return;
      // Per-item default: catalog defaultTarget (33 for custom zikrs —
      // the existing convention, AC2.2.1).
      const target = getZikrDisplayInfoFromZikr(zikr, lang).defaultTarget || 33;
      setItems(prev => [
        ...prev,
        { zikrId: zikr.id!, name: zikr.name, arabicText: zikr.arabicText, target },
      ]);
    },
    [items.length, lang]
  );

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    const issue = routineDraftIssue({
      itemCount: items.length,
      routineCount: editing ? 0 : routines.length,
    });
    if (issue === 'empty') {
      await showAlert({ message: t('routine.editor.empty'), icon: 'info' });
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        await updateItems(
          editing.id,
          items.map(item => ({ zikrId: item.zikrId, target: item.target })),
          editing.source === 'custom' ? title : undefined
        );
      } else {
        await createCustom({ title, items: items.map(i => ({ zikrId: i.zikrId, target: i.target })) });
      }
      onClose();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const message =
        code === 'ROUTINE_MAX_ROUTINES'
          ? t('routine.editor.maxRoutines')
          : code === 'ROUTINE_MAX_ITEMS'
            ? t('routine.editor.maxItems')
            : t('routine.editor.failed');
      await showAlert({ message, icon: 'error' });
    } finally {
      setIsSaving(false);
    }
  }, [editing, isSaving, items, routines.length, createCustom, updateItems, onClose, t, title]);

  const titleText =
    editing?.source === 'preset'
      ? t(`routine.preset.${editing.presetKey ?? 'morning'}`)
      : editing
        ? t('routine.editor.editTitle')
        : t('routine.editor.createTitle');

  return (
    <RoutineEditorModal isOpen={isOpen} onClose={onClose} title={titleText}>
      <RoutineEditorForm
        items={items}
        warning={warning}
        pickerOptions={livePickerOptions}
        onTitleChange={setTitle}
        onAddZikr={handleAddZikr}
        onRemoveItem={(index) => setItems(prev => prev.filter((_, i) => i !== index))}
        onMoveItem={(index, dir) =>
          setItems(prev => {
            const next = [...prev];
            const target = dir === 'up' ? index - 1 : index + 1;
            if (target < 0 || target >= next.length) return prev;
            [next[index], next[target]] = [next[target], next[index]];
            return next;
          })
        }
        onCountChange={(index, count) =>
          setItems(prev =>
            prev.map((item, i) => (i === index ? { ...item, target: count } : item))
          )
        }
        onSave={() => void handleSave()}
        onCancel={onClose}
        saveLabel={editing ? t('common.save') : t('routine.editor.create')}
        showNameField={editing?.source !== 'preset'}
      />
    </RoutineEditorModal>
  );
};

export default RoutineEditorContainer;
