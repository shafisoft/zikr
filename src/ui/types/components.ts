/**
 * V2 Component Types
 * TypeScript definitions for the new UI components
 */

// Navigation
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  active?: boolean;
}

// Cards
export interface ZikrCardProps {
  id: number;
  name: string;
  /** Arabic script of the zikr, rendered in the Amiri calligraphy face */
  arabicName?: string;
  translation: string;
  targetCount: number;
  icon: string;
  onStart: (id: number) => void;
  completed?: boolean;
}

export interface GoalCardProps {
  id: number;
  name: string;
  description: string;
  targetCount: number;
  period: 'daily' | 'weekly' | 'monthly' | 'custom';
  schedule?: string;
  active: boolean;
  onToggle: (id: number) => void;
  onEdit?: (id: number) => void;
}

// Progress
export interface CircularProgressProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  className?: string;
  children?: React.ReactNode;
}

export interface WeeklyDataPoint {
  day: string;
  value: number;
  isToday?: boolean;
}

export interface WeeklyChartProps {
  data: WeeklyDataPoint[];
  max?: number;
}

// Forms
export interface InputFieldProps {
  label?: string;
  placeholder?: string;
  value: string | number;
  onChange: (value: string | number) => void;
  type?: 'text' | 'number' | 'date' | 'time';
  icon?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  /** Stable input id so a wrapping <label htmlFor> can toggle the whole row. */
  inputId?: string;
}

// Feedback
export interface RippleProps {
  x: number;
  y: number;
  size: number;
  onComplete?: () => void;
}

export interface HapticPattern {
  type: 'light' | 'medium' | 'heavy' | 'success' | 'warning';
}

// Screen types
export interface ScreenProps {
  className?: string;
}

export interface HeaderAction {
  icon: string;
  onClick: () => void;
  ariaLabel: string;
}

export interface HeaderProps {
  title?: string;
  /** Show the app icon + name at the left (main screens). */
  brand?: boolean;
  showBack?: boolean;
  showClose?: boolean;
  onBack?: () => void;
  onClose?: () => void;
  action?: HeaderAction;
  /** Multiple top-right actions (e.g. haptics toggle + settings gear). */
  actions?: HeaderAction[];
}

// Counter screen specific
export interface CounterScreenProps {
  zikr: {
    id: number;
    name: string;
    arabicText: string;
    translation: string;
    targetCount: number;
  };
  currentCount: number;
  onIncrement: () => void;
  onReset: () => void;
  onComplete: () => void;
  hapticsEnabled: boolean;
  onToggleHaptics: () => void;
}

// Home screen specific
export interface HomeScreenProps {
  streak: number;
  dailyGoalProgress: number;
  quickStartZikrs: ZikrCardProps[];
}

// Progress screen specific
export interface StatsCardProps {
  type: 'streak' | 'total' | 'today' | 'week';
  value: string | number;
  label: string;
  icon: string;
}
