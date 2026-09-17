/**
 * Weekly Chart Component
 * Soft rounded bar chart for weekly progress display
 */

import React from 'react';
import { WeeklyChartProps } from '../../types/components';

export const WeeklyChart: React.FC<WeeklyChartProps> = ({
  data,
  max = 100,
}) => {
  // Calculate max value from data if not provided
  const chartMax = max || Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex justify-between items-end h-32 px-2 gap-2">
      {data.map((point, index) => {
        const height = (point.value / chartMax) * 100;
        const isToday = point.isToday;

        return (
          <div key={index} className="flex flex-col items-center gap-2 flex-1 h-full">
            {/* Bar lives in a definite-height wrapper: a percentage height
                resolves to 0 against an auto-height parent. */}
            <div className="flex-1 w-full min-h-0 flex items-end justify-center">
              <div
                className={`
                  w-8 rounded-full transition-all duration-500
                  ${isToday
                    ? 'bg-tertiary-container'
                    : point.value > 0
                      ? 'bg-primary-container/70'
                      : 'bg-surface-container-highest'
                  }
                `}
                style={{
                  height: `${Math.max(height, 8)}%`, // Min height for visibility
                  opacity: isToday ? 1 : point.value > 0 ? 0.55 + (point.value / chartMax) * 0.45 : 0.6,
                }}
              />
            </div>

            {/* Day label */}
            <span
              className={`
                font-caption text-caption
                ${isToday ? 'text-tertiary font-bold' : 'text-on-surface-variant'}
              `}
            >
              {point.day}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default WeeklyChart;
