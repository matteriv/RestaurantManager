import { useState, useEffect, useRef } from 'react';

export interface TimerData {
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isOverdue: boolean;
  expectedTime?: number; // prepTimeMinutes from menu item
}

export function useKitchenTimer(startTime?: Date, expectedMinutes?: number): TimerData {
  const [currentTime, setCurrentTime] = useState(new Date());
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  if (!startTime) {
    return {
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
      isOverdue: false,
      expectedTime: expectedMinutes,
    };
  }

  const elapsedMs = currentTime.getTime() - new Date(startTime).getTime();
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const isOverdue = expectedMinutes ? totalSeconds > (expectedMinutes * 60) : false;

  return {
    minutes,
    seconds,
    totalSeconds,
    isOverdue,
    expectedTime: expectedMinutes,
  };
}

export function formatTimer(timer: TimerData): string {
  const paddedMinutes = timer.minutes.toString().padStart(2, '0');
  const paddedSeconds = timer.seconds.toString().padStart(2, '0');
  return `${paddedMinutes}:${paddedSeconds}`;
}