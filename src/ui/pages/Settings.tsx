/**
 * Settings Screen (V2)
 * Settings page with dark mode, haptics, data management, and about sections.
 * Zikr content management lives in the Zikr Library (/library).
 */

import React, { useState, useEffect } from 'react';
import ToggleSwitch from '../components/forms/ToggleSwitch';
import MaterialIcon from '../components/MaterialIcon';
import OrnamentDivider from '../components/decor/OrnamentDivider';
import { useSettingsStore } from '../../core/stores/settingsStore';
import { useSharedRoomStore } from '../../core/stores/sharedRoomStore';
import { useI18n, LANGUAGES, applyDocumentLanguage } from '../../core/i18n';
import useShare, { ShareOutcome } from '../hooks/useShare';
import AppLayout from '../components/layout/AppLayout';

const Settings: React.FC = () => {
  const { lang, t } = useI18n();

  // Store integrations
  const settings = useSettingsStore(state => state.settings);
  const loading = useSettingsStore(state => state.loading);
  const loadSettings = useSettingsStore(state => state.loadSettings);
  const saveSetting = useSettingsStore(state => state.saveSetting);
  const exportData = useSettingsStore(state => state.exportData);
  const importData = useSettingsStore(state => state.importData);
  const clearAllData = useSettingsStore(state => state.clearAllData);

  // Local state
  const [darkMode, setDarkMode] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [countToGoals, setCountToGoals] = useState(true);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const sharedRoomStore = useSharedRoomStore();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Update local state when settings change
  useEffect(() => {
    // Reflect the effective theme: explicit setting, else system preference
    setDarkMode(
      settings.darkMode ?? window.matchMedia('(prefers-color-scheme: dark)').matches
    );
    setHapticsEnabled(settings.hapticsEnabled ?? true);
    setCountToGoals(settings.countToGoalsAndGroups ?? true);
  }, [settings]);

  const handleDarkModeToggle = async (value: boolean) => {
    setDarkMode(value);
    await saveSetting('darkMode', value);

    // Apply dark mode to document
    if (value) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleHapticsToggle = async (value: boolean) => {
    setHapticsEnabled(value);
    await saveSetting('hapticsEnabled', value);
  };

  const handleCountToGoalsToggle = async (value: boolean) => {
    setCountToGoals(value);
    await saveSetting('countToGoalsAndGroups', value);
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      await exportData();
    } catch (error) {
      console.error('Failed to export data:', error);
      alert(t('settings.exportFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const confirmed = confirm(t('settings.importConfirm'));

      if (!confirmed) return;

      setIsImporting(true);
      try {
        await importData(file);
        alert(t('settings.importSuccess'));
        window.location.reload();
      } catch (error) {
        console.error('Failed to import data:', error);
        alert(t('settings.importFailed'));
      } finally {
        setIsImporting(false);
      }
    };
    input.click();
  };

  const handleClearAllData = async () => {
    const confirmed1 = confirm(t('settings.clearConfirm1'));
    if (!confirmed1) return;

    const confirmed2 = confirm(t('settings.clearConfirm2'));
    if (!confirmed2) return;

    try {
      await clearAllData();
      alert(t('settings.cleared'));
      window.location.reload();
    } catch (error) {
      console.error('Failed to clear data:', error);
      alert(t('settings.clearFailed'));
    }
  };

  // Get app version
  const appVersion = process.env.PACKAGE_VERSION || '1.0.0';
  const { share } = useShare();
  const [shareOutcome, setShareOutcome] = useState<ShareOutcome | null>(null);
  const appUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-surface text-on-surface antialiased flex items-center justify-center">
        <div className="text-on-surface-variant">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout
      topBar={{ title: t('settings.heading'), back: true }}
      contentClassName="px-container-padding-mobile pt-8 pb-16 gap-8"
    >
        {/* Preferences Section */}
        <section>
          <h2 className="font-label-md text-label-md text-on-surface-variant mb-4 px-2">
            {t('settings.preferences')}
          </h2>
          <div className="flex flex-col gap-2">
            {/* Dark Mode Toggle */}
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-surface-container-high p-2 rounded-lg">
                  <MaterialIcon icon="dark_mode" className="text-primary text-[20px]" />
                </div>
                <div>
                  <p className="font-body-md text-body-md text-on-surface">{t('settings.darkMode')}</p>
                  <p className="font-caption text-caption text-on-surface-variant">
                    {t('settings.darkModeDesc')}
                  </p>
                </div>
              </div>
              <ToggleSwitch checked={darkMode} onChange={handleDarkModeToggle} />
            </div>

            {/* Haptics Toggle */}
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-surface-container-high p-2 rounded-lg">
                  <MaterialIcon icon="vibration" className="text-primary text-[20px]" />
                </div>
                <div>
                  <p className="font-body-md text-body-md text-on-surface">{t('settings.haptics')}</p>
                  <p className="font-caption text-caption text-on-surface-variant">
                    {t('settings.hapticsDesc')}
                  </p>
                </div>
              </div>
              <ToggleSwitch checked={hapticsEnabled} onChange={handleHapticsToggle} />
            </div>

            {/* Count towards goals & groups */}
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-surface-container-high p-2 rounded-lg">
                  <MaterialIcon icon="track_changes" className="text-primary text-[20px]" />
                </div>
                <div>
                  <p className="font-body-md text-body-md text-on-surface">{t('settings.countGoals')}</p>
                  <p className="font-caption text-caption text-on-surface-variant">
                    {t('settings.countGoalsDesc')}
                  </p>
                </div>
              </div>
              <ToggleSwitch checked={countToGoals} onChange={handleCountToGoalsToggle} />
            </div>
          </div>
        </section>

        {/* Language */}
        <section>
          <h2 className="font-label-md text-label-md text-on-surface-variant mb-4 px-2">
            {t('settings.language')}
          </h2>
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-surface-container-high p-2 rounded-lg">
                <MaterialIcon icon="translate" className="text-primary text-[20px]" />
              </div>
              <div>
                <p className="font-body-md text-body-md text-on-surface">{t('settings.language')}</p>
                <p className="font-caption text-caption text-on-surface-variant">{t('settings.languageDesc')}</p>
              </div>
            </div>
            <div className="flex gap-2 bg-surface-container-lowest p-1 rounded-xl">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => { saveSetting('language', l.code); applyDocumentLanguage(l.code); }}
                  className={`px-3 py-2 rounded-lg font-label-md text-label-md transition-all ${
                    lang === l.code ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant hover:bg-surface-variant/50'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Shared Goals Section */}
        <section>
          <h2 className="font-label-md text-label-md text-on-surface-variant mb-4 px-2">
            {t('settings.sharedGoals')}
          </h2>
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4 min-w-0">
                <div className="bg-surface-container-high p-2 rounded-lg shrink-0">
                  <MaterialIcon icon="person" className="text-primary text-[20px]" />
                </div>
                <div className="min-w-0">
                  <p className="font-body-md text-body-md text-on-surface">{t('settings.roomName')}</p>
                  <p className="font-caption text-caption text-on-surface-variant truncate">
                    {sharedRoomStore.identity?.displayName || t('settings.nameNotSet')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setNameDraft(sharedRoomStore.identity?.displayName || '');
                  setNameEditing(true);
                }}
                className="text-primary p-2 hover:bg-primary-container/20 rounded-lg transition-colors shrink-0"
                aria-label="Edit display name"
              >
                <MaterialIcon icon="edit" className="text-[20px]" />
              </button>
            </div>

            {nameEditing && (
              <div className="mt-4 flex flex-col gap-3">
                <input
                  type="text"
                  value={nameDraft}
                  maxLength={24}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder={t('settings.namePlaceholder')}
                  className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 h-12 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setNameEditing(false)}
                    className="flex-1 h-11 rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/50 transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={async () => {
                      const name = nameDraft.trim();
                      if (!name) return;
                      await sharedRoomStore.updateDisplayName(name);
                      setNameEditing(false);
                    }}
                    className="flex-1 h-11 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md hover:opacity-90 transition-opacity"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </div>
            )}

            <p className="font-caption text-caption text-on-surface-variant mt-3">
              {t('settings.sharedGoalsDesc')}
            </p>
          </div>
        </section>

        {/* Data Management Section */}
        <section>
          <h2 className="font-label-md text-label-md text-on-surface-variant mb-4 px-2">
            {t('settings.dataManagement')}
          </h2>
          <div className="flex flex-col gap-2">
            {/* Export Data */}
            <button
              onClick={handleExportData}
              disabled={isExporting}
              className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex items-center justify-between active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <div className="flex items-center gap-4 text-left">
                <div className="bg-surface-container-high p-2 rounded-lg">
                  <MaterialIcon icon="download" className="text-primary text-[20px]" />
                </div>
                <div>
                  <p className="font-body-md text-body-md text-on-surface">{t('settings.export')}</p>
                  <p className="font-caption text-caption text-on-surface-variant">
                    {t('settings.exportDesc')}
                  </p>
                </div>
              </div>
              <MaterialIcon icon="chevron_right" className="text-on-surface-variant" />
            </button>

            {/* Import Data */}
            <button
              onClick={handleImportData}
              disabled={isImporting}
              className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex items-center justify-between active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <div className="flex items-center gap-4 text-left">
                <div className="bg-surface-container-high p-2 rounded-lg">
                  <MaterialIcon icon="upload" className="text-primary text-[20px]" />
                </div>
                <div>
                  <p className="font-body-md text-body-md text-on-surface">{t('settings.import')}</p>
                  <p className="font-caption text-caption text-on-surface-variant">
                    {t('settings.importDesc')}
                  </p>
                </div>
              </div>
              <MaterialIcon icon="chevron_right" className="text-on-surface-variant" />
            </button>

            {/* Clear All Data */}
            <button
              onClick={handleClearAllData}
              className="bg-error/5 rounded-xl border border-error/20 p-4 flex items-center justify-between active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center gap-4 text-left">
                <div className="bg-error/10 p-2 rounded-lg">
                  <MaterialIcon icon="delete_forever" className="text-error text-[20px]" />
                </div>
                <div>
                  <p className="font-body-md text-body-md text-error">{t('settings.clearAll')}</p>
                  <p className="font-caption text-caption text-error/70">
                    {t('settings.clearAllDesc')}
                  </p>
                </div>
              </div>
              <MaterialIcon icon="chevron_right" className="text-error" />
            </button>
          </div>
        </section>

        {/* About Section */}
        <section>
          <h2 className="font-label-md text-label-md text-on-surface-variant mb-4 px-2">
            {t('settings.about')}
          </h2>
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-14 rounded-t-full rounded-b-lg bg-primary-container flex items-center justify-center">
                <span className="font-display-arabic text-[26px] leading-9 text-tertiary-fixed" lang="ar" aria-hidden="true">ذِكْر</span>
              </div>
              <div>
                <p className="font-headline-md text-headline-md text-primary">Zikr</p>
                <p className="font-caption text-caption text-on-surface-variant">
                  Version {appVersion}
                </p>
              </div>
            </div>

            <OrnamentDivider className="mb-4" />

            <div className="space-y-3 text-body-md text-on-surface-variant">
              <p>{t('settings.aboutBody')}</p>
              <p className="text-sm">
                {t('settings.featuresBody')}
              </p>
            </div>

            <button
              onClick={() =>
                share({
                  title: 'Zikr',
                  text: t('settings.shareAppText'),
                  url: appUrl,
                })
                  .then(outcome => {
                    setShareOutcome(outcome);
                    setTimeout(() => setShareOutcome(null), 2000);
                  })
                  .catch(() => {
                    // Neither share sheet nor clipboard available/allowed.
                    setShareOutcome('failed');
                    setTimeout(() => setShareOutcome(null), 3000);
                  })
              }
              className="mt-4 w-full h-touch-target-min rounded-xl bg-primary-container text-on-primary font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 active-scale-95 transition-all"
            >
              <MaterialIcon icon="share" className="text-[18px]" />
              {t('settings.shareApp')}
            </button>
            {shareOutcome === 'copied' && (
              <p className="font-caption text-caption text-tertiary mt-2 text-center">
                {t('room.copied')}
              </p>
            )}
            {shareOutcome === 'failed' && (
              <p className="font-caption text-caption text-error mt-2 text-center">
                {t('createRoom.copyFailed')}
              </p>
            )}
          </div>
        </section>

        {/* Platform Info */}
        <section className="text-center flex flex-col gap-3">
          <OrnamentDivider className="w-40 mx-auto" />
          <p className="font-caption text-caption text-on-surface-variant">
            {t('settings.builtFor')}
          </p>
          <p className="font-caption text-caption text-on-surface-variant">
            © 2024 Zikr
          </p>
        </section>
    </AppLayout>
  );
};

export default Settings;
