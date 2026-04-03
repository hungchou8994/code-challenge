import { TaskPriority } from '../types/task.js';

export const PRIORITY_POINTS: Record<TaskPriority, number> = {
  [TaskPriority.LOW]: 5,
  [TaskPriority.MEDIUM]: 10,
  [TaskPriority.HIGH]: 20,
};

export const EARLY_BONUS = 5;
export const LATE_PENALTY = -3;
