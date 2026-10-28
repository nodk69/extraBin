import { apiClient } from '../../../lib/api-client/client';
import { LoginPayload, RegisterPayload, UserResponse, PasswordResetConfirmPayload, SupabaseAuthPayload, UpdateProfilePayload } from '../types/auth';

export const authApi = {
  async supabaseSignUp(payload: RegisterPayload): Promise<void> {
    await apiClient.post('/auth/supabase-signup', payload);
  },

  async syncSupabase(payload: SupabaseAuthPayload): Promise<UserResponse> {
    const response = await apiClient.post<UserResponse>('/auth/supabase-sync', payload);
    return response.data;
  },

  async register(payload: RegisterPayload): Promise<UserResponse> {
    const response = await apiClient.post<UserResponse>('/auth/register', payload);
    return response.data;
  },

  async login(payload: LoginPayload): Promise<UserResponse> {
    const response = await apiClient.post<UserResponse>('/auth/login', payload);
    return response.data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  async getCurrentUser(): Promise<UserResponse> {
    const response = await apiClient.get<UserResponse>('/auth/me');
    return response.data;
  },

  async updateProfile(payload: UpdateProfilePayload): Promise<UserResponse> {
    const response = await apiClient.put<UserResponse>('/auth/me/profile', payload);
    return response.data;
  },

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>('/auth/password-reset/request', { email });
    return response.data;
  },

  async confirmPasswordReset(payload: PasswordResetConfirmPayload): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>('/auth/password-reset/confirm', payload);
    return response.data;
  },
};
