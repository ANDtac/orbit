export interface Device {
  id: string;
  hostname: string;
  platform: string;
  status: "online" | "offline" | "maintenance";
  site?: string;
  lastSeen: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
}

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_expires_in?: number;
  user: UserProfile;
}
