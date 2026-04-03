export interface ScoreEvent {
  id: string;
  userId: string;
  taskId: string;
  points: number;
  bonus: number;
  penalty: number;
  totalAwarded: number;
  createdAt: Date;
}

export interface ProductivityScore {
  id: string;
  userId: string;
  totalScore: number;
  tasksCompleted: number;
  updatedAt: Date;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userEmail: string;
  userDepartment: string;
  totalScore: number;
  tasksCompleted: number;
}
