/**
 * The configured zikrSyncService singleton the app uses.
 * Separate module to avoid import cycles (same pattern as sharedRoom).
 */

import { createZikrSyncBackend } from './backendFactory';
import { createZikrSyncService } from './service';

export const zikrSyncService = createZikrSyncService(createZikrSyncBackend());
export default zikrSyncService;
