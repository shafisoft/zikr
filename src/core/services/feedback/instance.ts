/**
 * The configured feedbackService singleton the app uses.
 * Separate module to avoid import cycles (same pattern as sharedRoom).
 */

import { createFeedbackBackend } from './backendFactory';
import { createFeedbackService } from './service';

export const feedbackService = createFeedbackService(createFeedbackBackend());
export default feedbackService;
