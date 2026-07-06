// ---- Devices ----------------------------------------------------------------

export interface Device {
    id: number;
    name: string;
    fqdn?: string;
    mgmt_ipv4?: string;
    mgmt_port?: number;
    platform_id?: number;
    product_model_id?: number;
    inventory_group_id?: number;
    credential_profile_id?: number;
    serial_number?: string;
    model_number?: string;
    os_name?: string;
    os_version?: string;
    facts?: Record<string, unknown>;
    nornir_data?: Record<string, unknown>;
    ansible_host?: string;
    ansible_vars?: Record<string, unknown>;
    notes?: string;
    is_active?: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface DeviceCreateInput {
    name: string;
    fqdn?: string;
    mgmt_ipv4?: string;
    mgmt_port?: number;
    platform_id?: number;
    product_model_id?: number;
    inventory_group_id?: number;
    credential_profile_id?: number;
    serial_number?: string;
    model_number?: string;
    os_name?: string;
    os_version?: string;
    facts?: Record<string, unknown>;
    notes?: string;
    is_active?: boolean;
}

export type DeviceUpdateInput = Partial<DeviceCreateInput>;

// ---- Cursor Pagination ------------------------------------------------------

export interface CursorPage {
    cursor: string;
    size: number;
    next?: string | null;
    prev?: string | null;
    total: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    page: CursorPage;
}

// ---- Platforms & Credential Profiles ----------------------------------------

export interface Platform {
    id: number;
    slug: string;
    display_name: string;
    vendor_hint?: string;
    napalm_driver?: string;
    netmiko_type?: string;
    ansible_network_os?: string;
    handler_entrypoint?: string;
    notes?: string;
    device_count?: number;
    is_active?: boolean;
}

export interface CredentialProfile {
    id: number;
    name: string;
    description?: string;
    auth_type?: string;
    username?: string;
    secret_ref?: string;
    device_count?: number;
    is_active?: boolean;
}

// ---- Inventory Groups & Tags ------------------------------------------------

export interface InventoryGroup {
    id: number;
    name: string;
    slug: string;
    is_dynamic?: boolean;
    cached_device_count?: number;
}

export interface DeviceTag {
    id: number;
    slug: string;
    name: string;
    description?: string;
    color?: string;
}

export interface DeviceTagAssignment {
    id: number;
    device_id: number;
    tag_id: number;
    tag?: DeviceTag;
}

// ---- Auth -------------------------------------------------------------------

export interface LoginRequest {
    username: string;
    password: string;
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

// ---- Jobs -------------------------------------------------------------------

export type JobStatus = "pending" | "queued" | "running" | "succeeded" | "finished" | "failed" | "cancelled";
export type JobTaskStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface JobTask {
    id: number;
    sequence: number;
    task_type: string;
    status: JobTaskStatus;
    device_id?: number;
    target_type?: string;
    target_id?: number;
    progress_total?: number;
    progress_completed?: number;
    started_at?: string;
    finished_at?: string;
    result?: Record<string, unknown>;
    error?: Record<string, unknown>;
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
    status: JobStatus;
    queue?: string;
    priority?: number;
    owner_id?: number | null;
    run_as_internal?: boolean;
    parameters?: Record<string, unknown>;
    progress?: {
        total?: number;
        completed?: number;
    };
    result?: Record<string, unknown>;
    error?: Record<string, unknown>;
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

export interface PasswordChangeResult {
    device_id: number;
    ok: boolean;
    changed: boolean;
    output?: string | null;
    error?: string | null;
    phase?: string;
    platform?: string | null;
    host?: string | null;
}

export interface DeviceHealthBreakdown {
    scope: string;
    identifier?: string;
    name?: string;
    total: number;
    statuses: Record<string, number>;
}

export interface DeviceHealthSummary {
    generated_at: string;
    overall: {
        total: number;
        statuses: Record<string, number>;
    };
    by_platform: DeviceHealthBreakdown[];
    by_group: DeviceHealthBreakdown[];
}

// ---- Operations -------------------------------------------------------------

export interface OperationTemplate {
    id: number;
    platform_id: number;
    name: string;
    description?: string;
    op_type: string;
    template: string;
    variables?: VariablesSchema;
    outputs?: VariablesSchema;
    is_mutating?: boolean;
    is_active?: boolean;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

// ---- Schema-driven forms ----------------------------------------------------

export type SchemaFieldType = "string" | "number" | "boolean" | "enum";

/** A single field descriptor within a template's `variables`/`outputs` schema. */
export interface SchemaField {
    type: SchemaFieldType;
    label?: string;
    help?: string;
    required?: boolean;
    default?: unknown;
    enum?: string[];
    pattern?: string;
}

/** Map of field name → descriptor. Drives the dynamic `SchemaForm` renderer. */
export type VariablesSchema = Record<string, SchemaField>;

// ---- Automations ------------------------------------------------------------

export type AutomationVisibility = "private" | "shared" | "role";
export type AutomationOnFailure = "stop" | "continue";

export interface AutomationTarget {
    device_ids?: number[];
}

// ---- Automation steps -------------------------------------------------------

/**
 * A typed reference to a prior step's declared output field.
 * Resolved at runtime by the worker to the actual output value.
 */
export interface StepBindingRef {
    __ref__: true;
    /** 1-based sequence number of the step whose output is being referenced. */
    step: number;
    /** Field name in that step's action's `outputs` schema. */
    output: string;
}

/** A step input value: either a literal or a reference to a prior step's output. */
export type StepValue = StepBindingRef | string | number | boolean | null | undefined;

/** One step in a linear automation sequence. */
export interface AutomationStep {
    id?: number;
    /** 1-based position in the sequence. Auto-assigned from array index on save. */
    sequence: number;
    action_id: number;
    /** Input field values keyed by variable field name. Values may be literals or StepBindingRef refs. */
    variable_bindings: Record<string, StepValue>;
    on_failure: AutomationOnFailure;
}

export interface Automation {
    id: number;
    name: string;
    description?: string;
    /** Present for single-action automations; may be absent for pure sequence automations. */
    action_id?: number;
    variable_values?: Record<string, unknown>;
    /** Present when this automation is a linear multi-step sequence. */
    steps?: AutomationStep[];
    target: AutomationTarget;
    visibility: AutomationVisibility;
    on_failure: AutomationOnFailure;
    created_at?: string;
    updated_at?: string;
}

/** Synchronous single-device dry-run result returned by `POST /automations/:id/test`. */
export interface AutomationDryRunResult {
    ok: boolean;
    device_id?: number;
    host?: string;
    latency_ms?: number;
    fields?: Record<string, unknown>;
    field_errors?: Record<string, string>;
    diff?: string;
    error?: string;
}

export interface DeviceConfigSnapshot {
    id: number;
    device_id: number;
    captured_at: string;
    source?: string;
    config_text: string;
    config_hash?: string;
    config_format?: string;
    metadata?: Record<string, unknown>;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

// ---- Schedules --------------------------------------------------------------

export type SchedulePreset =
    | "every_5m"
    | "every_15m"
    | "every_30m"
    | "hourly"
    | "daily"
    | "weekly";

export type ScheduleTargetType = "automation" | "monitor";

export interface Schedule {
    id: number;
    name?: string;
    target_type: ScheduleTargetType;
    target_id: number;
    cron_expr: string;
    preset?: SchedulePreset;
    next_run?: string;
    last_run?: string;
    last_job_id?: number;
    enabled: boolean;
    timezone: string;
    created_at?: string;
    updated_at?: string;
}

export interface ScheduleCreateInput {
    name?: string;
    target_type: ScheduleTargetType;
    target_id: number;
    preset: SchedulePreset;
    timezone: string;
    enabled: boolean;
}

export type ScheduleUpdateInput = Partial<Omit<ScheduleCreateInput, "target_type" | "target_id">>;

// ---- Compliance -------------------------------------------------------------

export interface CompliancePolicy {
    id: number;
    name: string;
    description?: string;
    is_active: boolean;
    scope?: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
}

export interface ComplianceRule {
    id: number;
    policy_id: number;
    name: string;
    description?: string;
    severity: "low" | "medium" | "high" | "critical";
    rule_type: string;
    expression: string;
    params?: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
}

export type ComplianceResultStatus = "pass" | "fail" | "skip" | "error";

export interface ComplianceResult {
    id: number;
    device_id: number;
    policy_id: number;
    rule_id?: number | null;
    evaluated_at?: string;
    status: ComplianceResultStatus;
    details?: Record<string, unknown>;
    snapshot_id?: number | null;
}

// ---- Lifecycle --------------------------------------------------------------

export interface HardwareLifecycle {
    id: number;
    product_model_id: number;
    end_of_sale_date?: string;
    end_of_software_maintenance_date?: string;
    end_of_security_fixes_date?: string;
    last_day_of_support_date?: string;
    source_url?: string;
    notes?: string;
}

export interface SoftwareLifecycle {
    id: number;
    platform_id?: number | null;
    os_name: string;
    match_operator: "eq" | "prefix" | "regex";
    match_value: string;
    end_of_software_maintenance_date?: string;
    end_of_security_fixes_date?: string;
    last_day_of_support_date?: string;
    end_of_sale_date?: string;
    source_url?: string;
    notes?: string;
}

// ---- Monitors ---------------------------------------------------------------

export type MonitorStatus = "passing" | "failing" | "unknown";
export type MonitorComparator = "gt" | "lt" | "gte" | "lte" | "eq" | "ne";
export type MonitorVisibility = "private" | "shared" | "role";
export type MonitorResultStatus = "passing" | "failing" | "error";

export interface MonitorTarget {
    device_ids: number[];
}

export interface Monitor {
    id: number;
    name: string;
    description?: string;
    action_id: number;
    /** Denormalised display name — populated by the backend when listing. */
    action_name?: string;
    target: MonitorTarget;
    metric: string;
    comparator: MonitorComparator;
    threshold: number | null;
    status: MonitorStatus;
    visibility: MonitorVisibility;
    last_run?: string;
    created_at?: string;
    updated_at?: string;
}

export interface MonitorResult {
    id: number;
    monitor_id: number;
    device_id: number;
    observed_at: string;
    value: number | null;
    status: MonitorResultStatus;
    payload?: Record<string, unknown>;
}

// ---- Dashboards -------------------------------------------------------------

export type DashboardVisibility = "private" | "shared";
export type PanelVizType = "stat" | "timechart" | "statusgrid" | "table";

export interface PanelPosition {
    col: number;
    row: number;
    w: number;
    h: number;
}

export interface DashboardPanel {
    id: number;
    dashboard_id: number;
    monitor_id: number;
    title?: string;
    viz_type: PanelVizType;
    position: PanelPosition;
    config?: Record<string, unknown>;
}

export interface Dashboard {
    id: number;
    name: string;
    description?: string;
    visibility: DashboardVisibility;
    layout?: Record<string, unknown>;
    panels: DashboardPanel[];
    is_pinned: boolean;
    owner_id?: number;
    created_at?: string;
    updated_at?: string;
}

export interface DashboardCreateInput {
    name: string;
    description?: string;
    visibility: DashboardVisibility;
}

export type DashboardUpdateInput = Partial<DashboardCreateInput>;

export interface PanelCreateInput {
    monitor_id: number;
    title?: string;
    viz_type: PanelVizType;
    position?: PanelPosition;
    config?: Record<string, unknown>;
}

export type PanelUpdateInput = Partial<PanelCreateInput>;

// ---- Logs -------------------------------------------------------------------

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

export interface AppEventEntry {
    id: number;
    created_at: string;
    level: string;
    event: string;
    message?: string | null;
    extra?: Record<string, unknown>;
}

export interface AuditLogEntry {
    id: number;
    uuid: string;
    occurred_at: string;
    actor_id?: number | null;
    actor_type?: string | null;
    actor_display_name?: string | null;
    action: string;
    target_type: string;
    target_id?: number | null;
    target_uuid?: string | null;
    target_repr?: string | null;
    request_id?: string | null;
    ip_address?: string | null;
    user_agent?: string | null;
    job_id?: number | null;
    payload?: Record<string, unknown>;
    message?: string | null;
}
