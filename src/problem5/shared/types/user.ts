export interface User {
  id: string;
  name: string;
  email: string;
  department: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  name: string;
  email: string;
  department: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  department?: string;
}
