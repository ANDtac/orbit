import type {
  AppEventEntry,
  AuditLogEntry,
  AutomationStep,
  CredentialProfile,
  Device,
  Job,
  OperationTemplate,
  Platform,
} from "@/lib/types";

export function mockDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 1,
    name: "edge-1",
    fqdn: "edge-1.local",
    mgmt_ipv4: "10.0.0.10",
    mgmt_port: 22,
    platform_id: 10,
    credential_profile_id: 100,
    inventory_group_id: 50,
    product_model_id: 25,
    os_name: "iosxe",
    os_version: "17.9.1",
    serial_number: "SERIAL-001",
    model_number: "C9500",
    notes: "Core edge switch",
    is_active: true,
    created_at: "2026-03-31T12:00:00Z",
    updated_at: "2026-03-31T12:00:00Z",
    ...overrides,
  };
}

export function mockPlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    id: 10,
    slug: "cisco_xe",
    display_name: "Cisco XE",
    vendor_hint: "cisco",
    napalm_driver: "ios",
    netmiko_type: "cisco_xe",
    device_count: 1,
    ...overrides,
  };
}

export function mockCredentialProfile(
  overrides: Partial<CredentialProfile> = {},
): CredentialProfile {
  return {
    id: 100,
    name: "Default SSH",
    auth_type: "username_password",
    username: "admin",
    secret_ref: "vault://orbit/default-ssh",
    device_count: 1,
    ...overrides,
  };
}

export function mockJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 99,
    uuid: "job-99",
    job_type: "password_change.batch",
    status: "queued",
    queue: "default",
    priority: 5,
    progress: { total: 1, completed: 0 },
    timestamps: {},
    tasks: [],
    events: [],
    ...overrides,
  };
}

export function mockAuditLogEntry(
  overrides: Partial<AuditLogEntry> = {},
): AuditLogEntry {
  return {
    id: 1,
    uuid: "audit-1",
    occurred_at: "2026-03-31T12:00:00Z",
    actor_id: 1,
    actor_type: "user",
    actor_display_name: "owner",
    action: "platform.create",
    target_type: "platform",
    target_id: 10,
    target_uuid: "platform-10",
    target_repr: "Cisco XE",
    request_id: "req-1",
    ip_address: "10.0.0.10",
    user_agent: "vitest",
    job_id: null,
    payload: { slug: "cisco_xe" },
    message: "created platform",
    ...overrides,
  };
}

export function mockOperationTemplate(
  overrides: Partial<OperationTemplate> = {},
): OperationTemplate {
  return {
    id: 1,
    platform_id: 10,
    name: "Show Version",
    op_type: "show",
    template: "show version",
    variables: {
      hostname: { type: "string", required: true, label: "Hostname" },
    },
    outputs: {
      status: { type: "string" },
    },
    is_mutating: false,
    is_active: true,
    ...overrides,
  };
}

export function mockAutomationStep(
  overrides: Partial<AutomationStep> = {},
): AutomationStep {
  return {
    sequence: 1,
    action_id: 1,
    variable_bindings: {},
    on_failure: "stop",
    ...overrides,
  };
}

export function mockAppEventEntry(
  overrides: Partial<AppEventEntry> = {},
): AppEventEntry {
  return {
    id: 1,
    created_at: "2026-03-31T12:00:00Z",
    level: "INFO",
    event: "password_change.completed",
    message: "Password change batch completed",
    extra: { total: 4, succeeded: 4, failed: 0, requested_by: "owner" },
    ...overrides,
  };
}
