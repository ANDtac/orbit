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

export interface JobTask {
  id: number;
  sequence: number;
  task_type: string;
  status: string;
  device_id?: number;
  target_type?: string;
  target_id?: number;
  progress_total?: number;
  progress_completed?: number;
  started_at?: string;
  finished_at?: string;
}

export interface JobEvent {
  id: number;
  event_type: string;
  message?: string;
  occurred_at: string;
}

export interface Job {
  id: number;
  uuid: string;
  job_type: string;
  status: string;
  queue?: string;
  priority?: number;
  parameters?: Record<string, unknown>;
  timestamps: {
    created_at?: string;
    updated_at?: string;
    scheduled_for?: string;
    started_at?: string;
    finished_at?: string;
    last_heartbeat_at?: string;
  };
  tasks: JobTask[];
  events: JobEvent[];
}

export interface CompliancePolicy {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  scope?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface RequestLogEntry {
  id: number;
  created_at: string;
  correlation_id: string;
  method: string;
  path: string;
  status_code: number;
  latency_ms: number;
  user_id?: number;
}

export interface ErrorLogEntry {
  id: number;
  created_at: string;
  correlation_id: string;
  level: string;
  message: string;
  user_id?: number;
}
