/**
 * Shared top-right actions for main screens: Zikr Library + Settings.
 * The gear stays for preferences; content management (zikrs) lives in
 * the library so Settings keeps to real settings.
 */

import { useNavigate } from 'react-router-dom';
import { HeaderAction } from '../../types/components';
import { useI18n } from '../../../core/i18n';

export const useNavActions = (): HeaderAction[] => {
  const navigate = useNavigate();
  const { t } = useI18n();

  return [
    {
      icon: 'library_books',
      onClick: () => navigate('/library'),
      ariaLabel: t('common.library'),
    },
    {
      icon: 'settings',
      onClick: () => navigate('/settings'),
      ariaLabel: t('common.settings'),
    },
  ];
};
