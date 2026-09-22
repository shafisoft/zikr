/**
 * SessionHistory Component (V2)
 * Displays grouped session history with edit/delete capabilities
 */

import React, { useEffect, useMemo, useState } from 'react';
import MaterialIcon from './MaterialIcon';
import { showAlert, showConfirm } from './ConfirmDialog';
import { useSessionHistoryStore } from '../../core/stores/sessionHistoryStore';
import { useZikrStore } from '../../core/stores/zikrStore';
import { useSessionStore } from '../../core/stores/sessionStore';
import { formatDate } from '../../core/utils/dateUtils';
import { groupSessionsByDate } from '../../core/utils/historyGrouping';
import { Session } from '../../core/db/types';
import { useI18n, localeTag } from '../../core/i18n';

const EDIT_WINDOW_DAYS = 3;

interface SessionHistoryProps {
  onRefresh?: () => void;
}

const SessionHistory: React.FC<SessionHistoryProps> = ({ onRefresh }) => {
  const { lang, t } = useI18n();
  const { loading, error, sessions, loadSessions } = useSessionHistoryStore();
  const zikrs = useZikrStore(state => state.zikrs);

  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editCount, setEditCount] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // Component-owned UI state — a new session re-derives the buckets but
  // never resets which groups the user expanded ('today' starts open).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ today: true });

  // Derived bucketing — pure util over the store's sessions (no store round-trip).
  const groupedByDate = useMemo(() => groupSessionsByDate(sessions), [sessions]);

  const isExpanded = (groupKey: string) => expanded[groupKey] ?? groupKey === 'today';
  const toggleGroup = (groupKey: string) =>
    setExpanded(e => ({ ...e, [groupKey]: !isExpanded(groupKey) }));

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const canEditSession = (session: Session): boolean => {
    const now = new Date();
    const editableUntil = new Date(session.editableUntil || session.timestamp);
    return now <= editableUntil;
  };

  const handleEdit = async (session: Session) => {
    if (!canEditSession(session)) {
      await showAlert({ message: t('history.notEditable'), icon: 'lock' });
      return;
    }
    setEditingSession(session);
    setEditCount(session.count.toString());
  };

  const handleSaveEdit = async () => {
    if (!editingSession) return;

    const newCount = parseInt(editCount, 10);
    if (isNaN(newCount) || newCount < 1 || newCount > 10000) {
      await showAlert({ message: t('progress.validCount') });
      return;
    }

    setIsSaving(true);

    try {
      await useSessionStore.getState().updateSession(editingSession.id!, {
        count: newCount,
        updatedAt: new Date(),
      });

      setEditingSession(null);
      setEditCount('');
      loadSessions(); // Refresh the list
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to update session:', error);
      await showAlert({ message: t('history.updateFailed'), icon: 'error_outline' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingSession(null);
    setEditCount('');
  };

  const handleDelete = async (session: Session) => {
    if (!canEditSession(session)) {
      await showAlert({ message: t('history.notEditable'), icon: 'lock' });
      return;
    }

    const zikr = zikrs.find(z => z.id === session.zikrId);
    const zikrName = zikr?.name || t('history.unknownZikr');

    const confirmed = await showConfirm({
      message: t('history.deleteConfirm', {
        zikr: zikrName,
        count: session.count,
        date: formatDate(session.date),
      }),
      danger: true,
      confirmLabel: t('common.delete'),
    });

    if (!confirmed) return;

    setIsSaving(true);

    try {
      await useSessionStore.getState().deleteSession(session.id!);
      loadSessions(); // Refresh the list
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to delete session:', error);
      await showAlert({ message: t('history.deleteFailed'), icon: 'error_outline' });
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString(localeTag(lang), {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getSourceIcon = (source?: string): string => {
    switch (source) {
      case 'app': return 'touch_app';
      case 'manual': return 'edit_document';
      default: return 'smartphone';
    }
  };

  const getSourceLabel = (source?: string): string => {
    switch (source) {
      case 'app': return t('history.app');
      case 'manual': return t('history.manual');
      default: return t('history.physical');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-on-surface-variant">{t('history.loading')}</div>
      </div>
    );
  }

  // Distinguish "nothing recorded yet" from "we could not read your data" —
  // showing the empty state here would read as if practice data was lost.
  if (error) {
    return (
      <div className="text-center py-12">
        <MaterialIcon icon="cloud_off" className="text-6xl text-surface-variant mb-4 mx-auto" />
        <h3 className="font-headline-md text-headline-md text-primary mb-2">
          {t('history.loadFailedTitle')}
        </h3>
        <p className="font-body-md text-body-md text-on-surface-variant mb-4">
          {error === 'load-failed' ? t('history.loadFailed') : null}
        </p>
        <button
          onClick={() => loadSessions()}
          className="h-touch-target-min px-6 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md flex items-center gap-2 mx-auto hover:opacity-90 active-scale-95 transition-all"
        >
          <MaterialIcon icon="refresh" className="text-[18px]" />
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12">
        <MaterialIcon icon="history" className="text-6xl text-surface-variant mb-4 mx-auto" />
        <h3 className="font-headline-md text-headline-md text-primary mb-2">
          {t('history.title')}
        </h3>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {t('history.noSessionsHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(groupedByDate).map(([groupKey, group]) => {
        if (group.sessions.length === 0) return null;

        return (
          <div key={groupKey} className="bg-surface rounded-xl border border-outline-variant/20 overflow-hidden">
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(groupKey)}
              className="w-full px-4 py-3 flex items-center justify-between bg-surface-container-low hover:bg-surface-container transition-colors"
            >
              <div className="flex items-center gap-3">
                <MaterialIcon
                  icon={isExpanded(groupKey) ? 'expand_more' : 'chevron_right'}
                  className="text-on-surface-variant"
                />
                <span className="font-label-md text-label-md text-on-surface">
                  {t(group.title)}
                </span>
                <span className="font-caption text-caption text-on-surface-variant bg-surface-variant/30 px-2 py-0.5 rounded-full">
                  {group.count}
                </span>
              </div>
            </button>

            {/* Sessions List */}
            {isExpanded(groupKey) && (
              <div className="divide-y divide-outline-variant/10">
                {group.sessions.map((session) => {
                  const zikr = zikrs.find(z => z.id === session.zikrId);
                  const zikrName = zikr?.name || t('history.unknownZikr');
                  const editable = canEditSession(session);

                  const isEditing = editingSession?.id === session.id;

                  return (
                    <div
                      key={session.id}
                      className="px-4 py-3 hover:bg-surface-container-low/50 transition-colors"
                    >
                      {isEditing ? (
                        /* Edit Mode */
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <p className="font-body-sm text-body-sm text-on-surface-variant mb-1">
                              {zikrName}
                            </p>
                            <input
                              type="number"
                              value={editCount}
                              onChange={(e) => setEditCount(e.target.value)}
                              min={1}
                              max={10000}
                              className="bg-surface border border-outline-variant/50 rounded-lg px-3 py-2 w-24 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                              autoFocus
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleSaveEdit}
                              disabled={isSaving}
                              className="text-primary p-2 hover:bg-primary-container/20 rounded-lg transition-colors disabled:opacity-50"
                              aria-label="Save"
                            >
                              <MaterialIcon icon="check" className="text-[20px]" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={isSaving}
                              className="text-on-surface-variant p-2 hover:bg-surface-variant/50 rounded-lg transition-colors disabled:opacity-50"
                              aria-label="Cancel"
                            >
                              <MaterialIcon icon="close" className="text-[20px]" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* View Mode */
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            {/* Zikr Info */}
                            <div className="flex-1 min-w-0">
                              <p className="font-body-md text-body-md text-on-surface truncate">
                                {zikrName}
                              </p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="font-label-md text-label-md text-primary font-semibold">
                                  {session.count}x
                                </span>
                                <div className="flex items-center gap-1 text-on-surface-variant">
                                  <MaterialIcon icon={getSourceIcon(session.source)} className="text-[14px]" />
                                  <span className="font-caption text-caption">
                                    {getSourceLabel(session.source)}
                                  </span>
                                </div>
                                <span className="font-caption text-caption text-on-surface-variant">
                                  {formatTime(session.timestamp)}
                                </span>
                              </div>
                            </div>

                            {/* Actions */}
                            {editable && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleEdit(session)}
                                  className="text-primary p-2 hover:bg-primary-container/20 rounded-lg transition-colors"
                                  aria-label={`Edit ${zikrName} session`}
                                >
                                  <MaterialIcon icon="edit" className="text-[18px]" />
                                </button>
                                <button
                                  onClick={() => handleDelete(session)}
                                  className="text-error p-2 hover:bg-error/10 rounded-lg transition-colors"
                                  aria-label={`Delete ${zikrName} session`}
                                >
                                  <MaterialIcon icon="delete" className="text-[18px]" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Info text */}
      <p className="font-caption text-caption text-on-surface-variant text-center">
        {t('history.editWindowNote', { days: EDIT_WINDOW_DAYS })}
      </p>
    </div>
  );
};

export default SessionHistory;
