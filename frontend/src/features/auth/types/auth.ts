export interface UserResponse {
  id: number;
  username: string;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  avatarUrl?: string | null;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  usernameOrEmail: string;
  password: string;
}

export interface PasswordResetConfirmPayload {
  token: string;
  newPassword: string;
}

export interface SupabaseAuthPayload {
  accessToken: string;
  email: string;
  username?: string;
}
