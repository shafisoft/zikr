/**
 * UI Components & Pages — public surface.
 * Pages/consumers may import from here or directly from module files.
 */

// Components
export { MaterialIcon } from './components/MaterialIcon';
export { CounterCircle } from './components/CounterCircle';

// Navigation
export { TopAppBar } from './components/navigation/TopAppBar';
export { BottomNav } from './components/navigation/BottomNav';
export { AppLayout } from './components/layout/AppLayout';
export { getNavItems } from './components/navigation/navItems';

// Cards
export { GlassCard } from './components/cards/GlassCard';
export { ZikrCard } from './components/cards/ZikrCard';

// Decorative
export { PatternBackdrop } from './components/decor/PatternBackdrop';
export { OrnamentDivider } from './components/decor/OrnamentDivider';

// Progress
export { CircularProgress } from './components/progress/CircularProgress';
export { WeeklyChart } from './components/progress/WeeklyChart';

// Forms
export { ToggleSwitch } from './components/forms/ToggleSwitch';
export { InputField } from './components/forms/InputField';

// Pages
export { default as Counter } from './pages/Counter';
export { default as Home } from './pages/Home';
export { default as Goals } from './pages/Goals';
export { default as Progress } from './pages/Progress';
export { default as Settings } from './pages/Settings';
export { default as Welcome } from './components/Welcome';

// Hooks
export { default as useRipple } from './hooks/useRipple';
export { default as useHaptic } from './hooks/useHaptic';

// Types
export * from './types/components';
