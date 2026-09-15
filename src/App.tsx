import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { useZikrStore } from './core/stores/zikrStore';
import { useSessionStore } from './core/stores/sessionStore';
import { usePlanStore } from './core/stores/planStore';
import { useSettingsStore } from './core/stores/settingsStore';
import { db } from './core/db/db';
import { seedZikrs } from './core/db/seed';
import { sharedRoomService } from './core/services/sharedRoom';
import { applyDocumentLanguage, detectLanguage } from './core/i18n';
import { UpdateBanner } from './ui/components/UpdateBanner';
import { useEffect, useState } from 'react';

// Noor UI (V2)
import WelcomeV2 from './ui/components/Welcome';
import HomeV2 from './ui/pages/Home';
import CounterV2 from './ui/pages/Counter';
import PlansV2 from './ui/pages/Plans';
import ProgressV2 from './ui/pages/Progress';
import SettingsV2 from './ui/pages/Settings';
import LibraryV2 from './ui/pages/Library';
import GroupV2 from './ui/pages/Group';
import RoomV2 from './ui/pages/Room';
import JoinV2 from './ui/pages/Join';

// Gate the dashboard on onboarding completion. The flag must be read inside a
// component (keyed by location) so navigation after Welcome sees the fresh value.
function HomeGate() {
  const location = useLocation();
  const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
  return hasSeenWelcome ? (
    <HomeV2 key={location.key} />
  ) : (
    <Navigate to="/welcome" replace />
  );
}

function App() {
  const [storesInitialized, setStoresInitialized] = useState(false);

  useEffect(() => {
    // Seed predefined zikrs on first launch
    seedZikrs(db).catch(err => {
      console.error('Failed to seed zikrs:', err);
    });

    const zikrUnsubscribe = useZikrStore.getState().initialize();
    const sessionUnsubscribe = useSessionStore.getState().initialize();
    const planUnsubscribe = usePlanStore.getState().initialize();

    // Initialize dark mode — wait for persisted settings first, otherwise a
    // fresh boot races the async load and falls back to the system theme.
    const initializeDarkMode = () => {
      const settingsStore = useSettingsStore.getState();
      const darkModeSetting = settingsStore.getSetting('darkMode');
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = darkModeSetting ?? systemPrefersDark;

      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    useSettingsStore
      .getState()
      .loadSettings()
      .then(() => {
        initializeDarkMode();
        // Keep <html lang> aligned with the selected app language.
        const l = useSettingsStore.getState().getSetting('language');
        applyDocumentLanguage(l === 'bn' ? 'bn' : l === 'en' ? 'en' : detectLanguage());
      })
      .catch(() => {
        initializeDarkMode();
      });

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemPrefChange = (e: MediaQueryListEvent) => {
      const settingsStore = useSettingsStore.getState();
      const darkModeSetting = settingsStore.getSetting('darkMode');
      // Only apply system preference if user hasn't set explicit preference
      if (darkModeSetting === null) {
        if (e.matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };

    mediaQuery.addEventListener('change', handleSystemPrefChange);

    setStoresInitialized(true);

    // Usage metrics: best-effort device heartbeat + session open event.
    // Never blocks startup and silently no-ops when unconfigured/offline.
    void sharedRoomService.trackAppOpen();

    return () => {
      zikrUnsubscribe();
      sessionUnsubscribe();
      planUnsubscribe();
      mediaQuery.removeEventListener('change', handleSystemPrefChange);
    };
  }, []);

  if (!storesInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-on-surface-variant">Loading...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <UpdateBanner />
      {/* BASE_URL keeps routing working under a non-root deploy base
          (GitHub Pages project sites serve from /<repo>/). */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        {/* Centered phone-width column on desktop; full-bleed on mobile */}
        <div className="min-h-screen bg-surface flex justify-center">
          <div className="w-full max-w-md min-h-screen md:border-x md:border-outline-variant/20">
            <Routes>
              <Route path="/" element={<HomeGate />} />
              <Route path="/welcome" element={<WelcomeV2 />} />
              <Route path="/home" element={<HomeV2 />} />
              <Route path="/counter" element={<CounterV2 />} />
              <Route path="/plans" element={<PlansV2 />} />
              <Route path="/goals" element={<Navigate to="/plans" replace />} />
              <Route path="/progress" element={<ProgressV2 />} />
              <Route path="/settings" element={<SettingsV2 />} />
              <Route path="/library" element={<LibraryV2 />} />
              <Route path="/group" element={<GroupV2 />} />
              <Route path="/group/:code" element={<RoomV2 />} />
              <Route path="/join/:code" element={<JoinV2 />} />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
