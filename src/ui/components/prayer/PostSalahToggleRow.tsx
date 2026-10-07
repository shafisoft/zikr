/**
 * PostSalahToggleRow — the postSalahEnabled kill-switch row (AC1.1.5):
 * hides the after-prayer card without deleting the saved location.
 * Default OFF (simple-default principle). Presentational — the house
 * ToggleSwitch with the Settings-page label-wrapped row pattern.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import ToggleSwitch from '../forms/ToggleSwitch';
import { useI18n } from '../../../core/i18n';

interface PostSalahToggleRowProps {
  enabled: boolean;
  onToggle: (v: boolean) => void;
}

const PostSalahToggleRow: React.FC<PostSalahToggleRowProps> = ({
  enabled,
  onToggle,
}) => {
  const { t } = useI18n();

  return (
    <label
      htmlFor="settings-post-salah-toggle"
      className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex items-center justify-between cursor-pointer select-none active-scale-98 transition-transform"
    >
      <div className="flex items-center gap-4">
        <div className="bg-surface-container-high p-2 rounded-lg">
          <MaterialIcon icon="auto_awesome_motion" className="text-primary text-[20px]" />
        </div>
        <div>
          <p className="font-body-md text-body-md text-on-surface">
            {t('settings.postSalahToggle')}
          </p>
          <p className="font-caption text-caption text-on-surface-variant">
            {t('settings.postSalahToggleDesc')}
          </p>
        </div>
      </div>
      <ToggleSwitch
        inputId="settings-post-salah-toggle"
        checked={enabled}
        onChange={onToggle}
      />
    </label>
  );
};

export default PostSalahToggleRow;
