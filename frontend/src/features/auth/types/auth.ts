export interface UserResponse {
  id: number;
  username: string;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  xUrl?: string | null;
}

export interface UpdateProfilePayload {
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  xUrl?: string | null;
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
