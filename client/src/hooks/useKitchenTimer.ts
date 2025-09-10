import { useState, useEffect, useRef } from 'react';

export interface TimerData {
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isOverdue: boolean;
  expectedTime?: number; // prepTimeMinutes from menu item
  status: 'on-time' | 'warning' | 'overdue';
  progressPercentage: number;
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
      status: 'on-time',
      progressPercentage: 0,
    };
  }

  const elapsedMs = currentTime.getTime() - new Date(startTime).getTime();
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  // Calculate status and progress based on expected time
  let timerStatus: 'on-time' | 'warning' | 'overdue' = 'on-time';
  let progressPercentage = 0;
  let isOverdue = false;

  if (expectedMinutes) {
    const expectedSeconds = expectedMinutes * 60;
    progressPercentage = Math.min((totalSeconds / expectedSeconds) * 100, 100);
    
    if (totalSeconds > expectedSeconds) {
      isOverdue = true;
      timerStatus = 'overdue';
    } else if (totalSeconds > expectedSeconds * 0.8) {
      timerStatus = 'warning';
    } else {
      timerStatus = 'on-time';
    }
  }

  return {
    minutes,
    seconds,
    totalSeconds,
    isOverdue,
    expectedTime: expectedMinutes,
    status: timerStatus,
    progressPercentage,
  };
}

// Hook for managing dual timers (waiting + preparation)
export function useDualKitchenTimer(
  orderCreatedAt?: Date,
  startedAt?: Date,
  completedAt?: Date,
  expectedPrepTimeMinutes?: number,
  status?: string
) {
  // Waiting timer (from order creation to start of preparation)
  const waitingTimer = useKitchenTimer(
    status === 'new' && orderCreatedAt ? orderCreatedAt : undefined,
    undefined
  );

  // Preparation timer (from start to completion)  
  const preparationTimer = useKitchenTimer(
    (status === 'preparing' || status === 'ready') && startedAt ? startedAt : undefined,
    expectedPrepTimeMinutes
  );

  return {
    waitingTimer,
    preparationTimer,
    currentTimer: status === 'new' ? waitingTimer : preparationTimer,
    isWaiting: status === 'new',
    isPreparing: status === 'preparing' || status === 'ready',
  };
}

export function formatTimer(timer: TimerData): string {
  const paddedMinutes = timer.minutes.toString().padStart(2, '0');
  const paddedSeconds = timer.seconds.toString().padStart(2, '0');
  return `${paddedMinutes}:${paddedSeconds}`;
}