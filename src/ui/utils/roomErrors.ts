/**
 * Shared-room error presentation — lives in ui because it produces
 * localized strings; the store only ever holds error CODES.
 */

import { SharedRoomError } from '../../core/stores/sharedRoomStore';
import { translate, detectLanguage, Lang } from '../../core/i18n';
import { useSettingsStore } from '../../core/stores/settingsStore';

function currentLang(): Lang {
  const l = useSettingsStore.getState().settings.language;
  return l === 'bn' || l === 'en' ? l : detectLanguage();
}

/** Translate a thrown SharedRoomError (or unknown error) for display. */
export function sharedRoomErrorMessage(err: unknown): string {
  const code = err instanceof SharedRoomError ? err.code : 'unknown';
  return translate(currentLang(), `errors.${code}`);
}
