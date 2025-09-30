import apiClient from "@/lib/apiClient";
import type { LoginRequest, LoginResponse } from "@/lib/types";

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>("/auth/login", payload);
  return data;
}
