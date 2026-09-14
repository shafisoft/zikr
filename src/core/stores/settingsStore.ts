import { create } from 'zustand';
import { db } from '../db/db';
import { exportService } from '../services/exportService';

interface SettingsState {
  settings: Record<string, any>;
  loading: boolean;
  loadSettings: () => Promise<void>;
  saveSetting: (key: string, value: any) => Promise<void>;
  getSetting: (key: string) => any;
  /** One-shot maintenance ops (backup/restore/wipe) — no state to mirror. */
  exportData: () => Promise<void>;
  importData: (file: File) => Promise<void>;
  clearAllData: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  loading: true,

  loadSettings: async () => {
    try {
      const allSettings = await db.settings.toArray();
      const settingsObj = allSettings.reduce((obj, setting) => {
        obj[setting.key] = setting.value;
        return obj;
      }, {} as Record<string, any>);

      set({ settings: settingsObj, loading: false });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ loading: false });
    }
  },

  saveSetting: async (key, value) => {
    try {
      await db.settings.put({ key, value });
      const currentSettings = get().settings;
      set({ settings: { ...currentSettings, [key]: value } });
    } catch (error) {
      console.error('Failed to save setting:', error);
      throw error;
    }
  },

  getSetting: (key) => {
    return get().settings[key];
  },

  exportData: () => exportService.exportData(),

  importData: (file) => exportService.importData(file),

  clearAllData: () => db.delete(),
}));
