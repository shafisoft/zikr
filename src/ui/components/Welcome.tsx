/**
 * Welcome Component (V2)
 * Onboarding screen for first-time users
 * Story 27: Welcome Screen
 * Noor design: Bismillah greeting, pattern hero, mihrab-arch icon frame
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MaterialIcon from './MaterialIcon';
import PatternBackdrop from './decor/PatternBackdrop';
import OrnamentDivider from './decor/OrnamentDivider';
import { useI18n } from '../../core/i18n';

interface WelcomeSlide {
  titleKey: string;
  descriptionKey: string;
  icon: string;
  color: string;
}

const WELCOME_SLIDES: WelcomeSlide[] = [
  {
    titleKey: 'welcome.s1Title',
    descriptionKey: 'welcome.s1Desc',
    icon: 'spa',
    color: 'text-tertiary',
  },
  {
    titleKey: 'welcome.s2Title',
    descriptionKey: 'welcome.s2Desc',
    icon: 'touch_app',
    color: 'text-primary',
  },
  {
    titleKey: 'welcome.s3Title',
    descriptionKey: 'welcome.s3Desc',
    icon: 'trending_up',
    color: 'text-tertiary',
  },
  {
    titleKey: 'welcome.s4Title',
    descriptionKey: 'welcome.s4Desc',
    icon: 'cloud_off',
    color: 'text-primary',
  },
];

const Welcome: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  // Check if user has already seen welcome
  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
    if (hasSeenWelcome) {
      navigate('/');
    }
  }, [navigate]);

  const handleNext = () => {
    if (currentSlide < WELCOME_SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      handleGetStarted();
    }
  };

  const handleSkip = () => {
    handleGetStarted();
  };

  const handleGetStarted = () => {
    setIsExiting(true);

    // Mark welcome as seen
    localStorage.setItem('hasSeenWelcome', 'true');

    // Navigate after animation
    setTimeout(() => {
      // If zikrs exist, go to home, otherwise stay (will show empty state)
      navigate('/');
    }, 300);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  if (isExiting) {
    return (
      <div className="min-h-screen bg-surface text-on-surface antialiased flex items-center justify-center fade-out">
        <MaterialIcon icon="spa" className="text-6xl text-primary animate-pulse" />
      </div>
    );
  }

  const slide = WELCOME_SLIDES[currentSlide];

  return (
    <div className="min-h-screen bg-surface text-on-surface antialiased flex flex-col relative overflow-hidden">
      {/* Pattern backdrop across the upper half */}
      <PatternBackdrop className="absolute top-0 left-0 right-0 h-[55%]" />

      {/* Skip Button */}
      <button
        onClick={handleSkip}
        className="absolute top-6 right-6 z-20 text-on-surface-variant hover:text-on-surface transition-colors font-label-md text-label-md px-4 py-2"
      >
        {t('welcome.skip')}
      </button>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12 max-w-md mx-auto relative z-10">
        {/* Bismillah */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <p className="font-display-arabic text-[28px] leading-10 text-tertiary" lang="ar" dir="rtl">
            بِسْمِ ٱللَّٰهِ
          </p>
          <OrnamentDivider className="w-40" />
        </div>

        {/* Mihrab arch icon frame */}
        <div className="mb-12 flex items-end justify-center">
          <div
            key={currentSlide}
            className={`w-36 h-44 rounded-t-full rounded-b-2xl border border-tertiary-container/40 bg-surface-container-low shadow-card flex items-center justify-center ${isExiting ? 'scale-out' : 'scale-in'}`}
          >
            <MaterialIcon icon={slide.icon} filled className={`text-6xl ${slide.color}`} />
          </div>
        </div>

        {/* Text Content */}
        <div className="text-center mb-12">
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary mb-4">
            {t(slide.titleKey)}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
            {t(slide.descriptionKey)}
          </p>
        </div>

        {/* Progress Dots */}
        <div className="flex items-center gap-2 mb-12">
          {WELCOME_SLIDES.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              aria-label={`Go to slide ${index + 1}`}
              className={`h-2 rounded-full transition-all ${
                index === currentSlide
                  ? 'bg-tertiary-container w-8'
                  : 'bg-surface-container-highest w-2'
              }`}
            />
          ))}
        </div>

        {/* Action Button */}
        <button
          onClick={handleNext}
          className="w-full max-w-[280px] h-touch-target-min bg-primary-container text-on-primary rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
        >
          {currentSlide < WELCOME_SLIDES.length - 1 ? (
            <>
              {t('welcome.next')}
              <MaterialIcon icon="arrow_forward" className="text-[20px]" />
            </>
          ) : (
            <>
              {t('welcome.getStarted')}
              <MaterialIcon icon="check_circle" className="text-[20px]" />
            </>
          )}
        </button>
      </main>

      {/* Version Info */}
      <footer className="text-center py-6 relative z-10">
        <p className="font-caption text-caption text-on-surface-variant">
          Zikr • Version {process.env.PACKAGE_VERSION || '1.0.0'}
        </p>
      </footer>

      <style>{`
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes scaleOut {
          from {
            opacity: 1;
            transform: scale(1);
          }
          to {
            opacity: 0;
            transform: scale(1.2);
          }
        }

        @keyframes fadeOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }

        .scale-in {
          animation: scaleIn 0.5s ease-out;
        }

        .scale-out {
          animation: scaleOut 0.3s ease-in forwards;
        }

        .fade-out {
          animation: fadeOut 0.3s ease-in forwards;
        }
      `}</style>
    </div>
  );
};

export default Welcome;
