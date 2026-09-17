/**
 * Zikr Library Screen
 * Manage the zikr list: search, add, edit, and delete. Moved out of
 * Settings so the gear stays focused on real settings.
 */

import React, { useState, useEffect } from 'react';
import AppLayout from '../components/layout/AppLayout';
import MaterialIcon from '../components/MaterialIcon';
import { showAlert, showConfirm } from '../components/ConfirmDialog';
import ZikrFormModal from '../components/ZikrFormModal';
import { Zikr } from '../../core/db/types';
import { useZikrStore } from '../../core/stores/zikrStore';
import { useI18n } from '../../core/i18n';

const SYNC_STATUS_TIMEOUT_MS = 5000;

const Library: React.FC = () => {
  const { t } = useI18n();
  const zikrs = useZikrStore(state => state.zikrs);
  const storeIsSyncing = useZikrStore(state => state.isSyncing);
  const syncLibrary = useZikrStore(state => state.syncLibrary);
  const softDeleteZikr = useZikrStore(state => state.softDeleteZikr);

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editZikr, setEditZikr] = useState<Zikr | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const handleSyncLibrary = async () => {
    if (storeIsSyncing) return;
    setSyncStatus(null);
    const result = await syncLibrary();
    setSyncStatus(
      result === 'error'
        ? { kind: 'error', text: t('library.syncFailed') }
        : { kind: 'ok', text: t('library.syncResult', { added: result.added, updated: result.updated }) }
    );
  };

  // Auto-dismiss the sync result after a few seconds.
  useEffect(() => {
    if (!syncStatus) return;
    const timer = setTimeout(() => setSyncStatus(null), SYNC_STATUS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [syncStatus]);

  const filteredZikrs = zikrs.filter(zikr => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return zikr.name.toLowerCase().includes(query);
  });

  const handleDeleteZikr = async (zikr: Zikr) => {
    const confirmed = await showConfirm({
      message: t('library.deleteConfirm', { name: zikr.name }),
      danger: true,
      confirmLabel: t('common.delete'),
    });
    if (!confirmed) return;

    try {
      await softDeleteZikr(zikr.id!);
      await showAlert({ message: t('library.deleted'), icon: 'check_circle' });
    } catch (error) {
      console.error('Failed to delete zikr:', error);
      await showAlert({ message: t('zikrForm.saveFailed'), icon: 'error_outline' });
    }
  };

  return (
    <AppLayout
      topBar={{
        title: t('library.heading'),
        back: true,
        actions: [
          {
            icon: 'add',
            onClick: () => setIsCreateModalOpen(true),
            ariaLabel: t('library.addNew'),
          },
          {
            icon: 'sync',
            onClick: () => void handleSyncLibrary(),
            ariaLabel: t('library.sync'),
          },
        ],
      }}
      contentClassName="px-container-padding-mobile pt-8 pb-16 gap-6"
    >
      {/* Library sync status */}
      {syncStatus && (
        <div
          className={`rounded-xl border p-3 text-center font-body-md text-body-md ${
            syncStatus.kind === 'ok'
              ? 'bg-primary-container/20 border-primary/30 text-on-surface'
              : 'bg-error/10 border-error/20 text-error'
          }`}
          role="status"
        >
          {storeIsSyncing ? (
            <span className="inline-flex items-center gap-2">
              <MaterialIcon icon="sync" className="text-[18px] animate-spin" />
              {t('library.syncing')}
            </span>
          ) : (
            syncStatus.text
          )}
        </div>
      )}

      {/* Search Input */}
        {zikrs.length > 0 && (
          <div>
            <div className="relative">
              <MaterialIcon
                icon="search"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('library.searchPlaceholder')}
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl pl-12 pr-4 h-touch-target-min font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                  aria-label="Clear search"
                >
                  <MaterialIcon icon="close" className="text-[20px]" />
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="font-caption text-caption text-on-surface-variant mt-2 px-2">
                {filteredZikrs.length === 1 ? t('library.oneFound') : t('library.found', { count: filteredZikrs.length })}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {zikrs.length === 0 ? (
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-8 text-center">
              <MaterialIcon icon="spa" className="text-4xl text-tertiary-container mx-auto mb-3" />
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t('library.empty')}
              </p>
            </div>
          ) : searchQuery && filteredZikrs.length === 0 ? (
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-8 text-center">
              <MaterialIcon icon="search_off" className="text-4xl text-tertiary-container mx-auto mb-3" />
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t('library.notFound', { query: searchQuery })}
              </p>
            </div>
          ) : (
            filteredZikrs.map((zikr) => (
              <div
                key={zikr.id}
                className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-primary-container/20 p-2 rounded-lg">
                    <MaterialIcon icon="spa" filled className="text-primary text-[20px]" />
                  </div>
                  <div>
                    <p className="font-body-md text-body-md text-on-surface">{zikr.name}</p>
                    <p className="font-caption text-caption text-on-surface-variant">
                      {zikr.custom ? t('library.custom') : t('library.predefined')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditZikr(zikr)}
                    className="text-primary p-2 hover:bg-primary-container/20 rounded-lg transition-colors"
                    aria-label={`Edit ${zikr.name}`}
                  >
                    <MaterialIcon icon="edit" className="text-[20px]" />
                  </button>
                  <button
                    onClick={() => handleDeleteZikr(zikr)}
                    className="text-error p-2 hover:bg-error/10 rounded-lg transition-colors"
                    aria-label={`Delete ${zikr.name}`}
                  >
                    <MaterialIcon icon="delete" className="text-[20px]" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      {/* Zikr Form Modals */}
      <ZikrFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
      <ZikrFormModal
        isOpen={editZikr !== null}
        onClose={() => setEditZikr(null)}
        editZikr={editZikr}
      />
    </AppLayout>
  );
};

export default Library;
