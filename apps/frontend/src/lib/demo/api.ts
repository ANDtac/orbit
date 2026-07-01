import { isDemoActive } from "@/contexts/DemoContext";
import type {
    DeviceHealthSummary,
    AppEventEntry,
    AuditLogEntry,
    CompliancePolicy,
    ComplianceResult,
    ComplianceRule,
    CredentialProfile,
    Device,
    DeviceConfigSnapshot,
    DeviceCreateInput,
    DeviceTag,
    DeviceUpdateInput,
    ErrorLogEntry,
    HardwareLifecycle,
    InventoryGroup,
    Job,
    OperationTemplate,
    PaginatedResponse,
    PasswordChangeResult,
    Platform,
    RequestLogEntry,
    SoftwareLifecycle,
} from "@/lib/types";

import { getDemoData } from "./generators";

type DevicesQueryOptions = {
    "page[cursor]"?: string;
    "page[size]"?: number;
    sort?: string;
    "filter[name]"?: string;
    "filter[platform_id]"?: number;
    "filter[inventory_group_id]"?: number;
    "filter[is_active]"?: string;
    "filter[os_name]"?: string;
    "filter[os_version]"?: string;
    "filter[mgmt_ipv4]"?: string;
};

type JobsQueryOptions = {
    cursor?: string;
    "page[size]"?: number;
    job_type?: string;
    status?: string;
    queue?: string;
    run_as_internal?: boolean;
};

type OffsetPaginationOptions = {
    page?: number;
    per_page?: number;
};

type EventLogQueryOptions = OffsetPaginationOptions & {
    event?: string;
    level?: string;
};

type ComplianceRulesQueryOptions = OffsetPaginationOptions & {
    policy_id?: number;
    severity?: string;
    rule_type?: string;
    name?: string;
};

type ComplianceResultsQueryOptions = OffsetPaginationOptions & {
    device_id?: number;
    policy_id?: number;
    rule_id?: number;
    status?: string;
};

type OperationTemplateQueryOptions = {
    page?: number;
    per_page?: number;
    sort?: string;
    platform_id?: number;
    op_type?: string;
    name?: string;
};

type SnapshotQueryOptions = {
    page?: number;
    per_page?: number;
    sort?: string;
    device_id?: number;
    source?: string;
    hash?: string;
};

type HardwareLifecycleQueryOptions = OffsetPaginationOptions & {
    product_model_id?: number;
    past?: string;
    due_in_days?: number;
};

type SoftwareLifecycleQueryOptions = OffsetPaginationOptions & {
    os_name?: string;
    platform_id?: number;
    match_operator?: string;
};

type QueueJobResponse = {
    job: Job;
    enqueued: boolean;
};

type QueueProbeInput = {
    device_ids: number[];
    probe_type: string;
    variables?: Record<string, unknown>;
};

type QueueEvaluateResponse = {
    status: string;
    enqueued_at: string;
    job: Job;
};

const DEMO_PLATFORMS: Platform[] = [
    { id: 1, slug: "cisco_ios", display_name: "Cisco IOS", vendor_hint: "cisco", napalm_driver: "ios", netmiko_type: "cisco_ios", device_count: 8 },
    { id: 2, slug: "cisco_nxos", display_name: "Cisco NX-OS", vendor_hint: "cisco", napalm_driver: "nxos", netmiko_type: "cisco_nxos", device_count: 6 },
    { id: 3, slug: "cisco_iosxe", display_name: "Cisco IOS-XE", vendor_hint: "cisco", napalm_driver: "ios", netmiko_type: "cisco_xe", device_count: 9 },
    { id: 4, slug: "juniper_junos", display_name: "Juniper Junos", vendor_hint: "juniper", napalm_driver: "junos", netmiko_type: "juniper_junos", device_count: 4 },
    { id: 5, slug: "arista_eos", display_name: "Arista EOS", vendor_hint: "arista", napalm_driver: "eos", netmiko_type: "arista_eos", device_count: 3 },
];

const DEMO_CREDENTIAL_PROFILES: CredentialProfile[] = [
    { id: 1, name: "Default SSH", auth_type: "username_password", username: "admin", secret_ref: "vault://orbit/default-ssh", device_count: 14, is_active: true },
    { id: 2, name: "API Service Account", auth_type: "api_token", username: "svc-orbit", secret_ref: "vault://orbit/api-service", device_count: 5, is_active: true },
];

const DEMO_INVENTORY_GROUPS: InventoryGroup[] = [
    { id: 1, name: "Core Routers", slug: "core-routers", cached_device_count: 8 },
    { id: 2, name: "Distribution Switches", slug: "dist-switches", cached_device_count: 12 },
    { id: 3, name: "Access Layer", slug: "access-layer", cached_device_count: 10 },
];

const DEMO_DEVICE_TAGS: DeviceTag[] = [
    { id: 1, slug: "production", name: "Production", color: "#3fb950" },
    { id: 2, slug: "staging", name: "Staging", color: "#d29922" },
    { id: 3, slug: "critical", name: "Critical", color: "#f85149" },
];

function parseCursor(cursor?: string): number {
    const value = Number(cursor ?? "0");
    return Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.toLowerCase() : "";
}

function compareValues(left: unknown, right: unknown): number {
    if (left == null && right == null) return 0;
    if (left == null) return -1;
    if (right == null) return 1;

    if (typeof left === "number" && typeof right === "number") {
        return left - right;
    }

    return String(left).localeCompare(String(right), undefined, { sensitivity: "base" });
}

function sortByField<T extends object>(items: T[], sort?: string): T[] {
    if (!sort) return items;

    const [fieldSpec] = sort.split(",");
    const direction = fieldSpec.startsWith("-") ? -1 : 1;
    const field = fieldSpec.replace(/^-/, "");

    return [...items].sort((left, right) => {
        const leftValue = (left as Record<string, unknown>)[field];
        const rightValue = (right as Record<string, unknown>)[field];
        return compareValues(leftValue, rightValue) * direction;
    });
}

function paginateCursor<T>(items: T[], cursor?: string, size = 25): PaginatedResponse<T> {
    const offset = parseCursor(cursor);
    const pageSize = size > 0 ? size : 25;
    const data = items.slice(offset, offset + pageSize);
    const next = offset + pageSize < items.length ? String(offset + pageSize) : null;
    const prev = offset > 0 ? String(Math.max(0, offset - pageSize)) : null;

    return {
        data,
        page: {
            cursor: String(offset),
            size: pageSize,
            next,
            prev,
            total: items.length,
        },
    };
}

function nextId(items: Array<{ id: number }>): number {
    return items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

function nowIso(): string {
    return new Date().toISOString();
}

export function isDemoApiEnabled(): boolean {
    return isDemoActive();
}

export function demoFetchDevices(options?: DevicesQueryOptions): PaginatedResponse<Device> {
    const data = getDemoData();
    let devices = [...data.devices];

    if (options?.["filter[name]"]) {
        const term = normalizeString(options["filter[name]"]);
        devices = devices.filter((device) => normalizeString(device.name).includes(term));
    }

    if (options?.["filter[platform_id]"] != null) {
        devices = devices.filter((device) => device.platform_id === options["filter[platform_id]"]);
    }

    if (options?.["filter[inventory_group_id]"] != null) {
        devices = devices.filter(
            (device) => device.inventory_group_id === options["filter[inventory_group_id]"],
        );
    }

    if (options?.["filter[os_name]"]) {
        const osName = normalizeString(options["filter[os_name]"]);
        devices = devices.filter((device) => normalizeString(device.os_name) === osName);
    }

    if (options?.["filter[os_version]"]) {
        const osVersion = normalizeString(options["filter[os_version]"]);
        devices = devices.filter((device) => normalizeString(device.os_version).includes(osVersion));
    }

    if (options?.["filter[mgmt_ipv4]"]) {
        const mgmtIp = normalizeString(options["filter[mgmt_ipv4]"]);
        devices = devices.filter((device) => normalizeString(device.mgmt_ipv4).includes(mgmtIp));
    }

    if (options?.["filter[is_active]"]) {
        const active = options["filter[is_active]"] === "true";
        devices = devices.filter((device) => Boolean(device.is_active) === active);
    }

    devices = sortByField(devices, options?.sort);
    return paginateCursor(devices, options?.["page[cursor]"], options?.["page[size]"] ?? 25);
}

export function demoFetchDevice(id: number): Device {
    const device = getDemoData().devices.find((item) => item.id === id);
    if (!device) {
        throw new Error(`Demo device ${id} not found`);
    }
    return { ...device };
}

export function demoCreateDevice(input: DeviceCreateInput): Device {
    const data = getDemoData();
    const device: Device = {
        id: nextId(data.devices),
        name: input.name,
        fqdn: input.fqdn,
        mgmt_ipv4: input.mgmt_ipv4,
        mgmt_port: input.mgmt_port ?? 22,
        platform_id: input.platform_id,
        product_model_id: input.product_model_id,
        inventory_group_id: input.inventory_group_id,
        credential_profile_id: input.credential_profile_id,
        serial_number: input.serial_number,
        model_number: input.model_number,
        os_name: input.os_name,
        os_version: input.os_version,
        facts: input.facts,
        notes: input.notes,
        is_active: input.is_active ?? true,
        created_at: nowIso(),
        updated_at: nowIso(),
    };
    data.devices.unshift(device);
    return { ...device };
}

export function demoUpdateDevice(id: number, input: DeviceUpdateInput): Device {
    const data = getDemoData();
    const index = data.devices.findIndex((item) => item.id === id);
    if (index === -1) {
        throw new Error(`Demo device ${id} not found`);
    }

    data.devices[index] = {
        ...data.devices[index],
        ...input,
        updated_at: nowIso(),
    };
    return { ...data.devices[index] };
}

export function demoDeleteDevice(id: number): void {
    const data = getDemoData();
    data.devices = data.devices.filter((item) => item.id !== id);
}

export function demoFetchPlatforms(): Platform[] {
    return DEMO_PLATFORMS.map((item) => ({ ...item }));
}

export function demoCreatePlatform(input: Omit<Platform, "id">): Platform {
    const created: Platform = {
        ...input,
        id: nextId(DEMO_PLATFORMS),
        device_count: input.device_count ?? 0,
    };
    DEMO_PLATFORMS.unshift(created);
    return { ...created };
}

export function demoUpdatePlatform(platformId: number, input: Partial<Omit<Platform, "id">>): Platform {
    const index = DEMO_PLATFORMS.findIndex((item) => item.id === platformId);
    if (index === -1) {
        throw new Error(`Demo platform ${platformId} not found`);
    }
    DEMO_PLATFORMS[index] = {
        ...DEMO_PLATFORMS[index],
        ...input,
    };
    return { ...DEMO_PLATFORMS[index] };
}

export function demoDeletePlatform(platformId: number): void {
    const index = DEMO_PLATFORMS.findIndex((item) => item.id === platformId);
    if (index >= 0) {
        DEMO_PLATFORMS.splice(index, 1);
    }
}

export function demoFetchCredentialProfiles(): CredentialProfile[] {
    return DEMO_CREDENTIAL_PROFILES.map((item) => ({ ...item }));
}

export function demoCreateCredentialProfile(input: Omit<CredentialProfile, "id">): CredentialProfile {
    const created: CredentialProfile = {
        ...input,
        id: nextId(DEMO_CREDENTIAL_PROFILES),
        device_count: input.device_count ?? 0,
    };
    DEMO_CREDENTIAL_PROFILES.unshift(created);
    return { ...created };
}

export function demoUpdateCredentialProfile(
    profileId: number,
    input: Partial<Omit<CredentialProfile, "id">>,
): CredentialProfile {
    const index = DEMO_CREDENTIAL_PROFILES.findIndex((item) => item.id === profileId);
    if (index === -1) {
        throw new Error(`Demo credential profile ${profileId} not found`);
    }
    DEMO_CREDENTIAL_PROFILES[index] = {
        ...DEMO_CREDENTIAL_PROFILES[index],
        ...input,
    };
    return { ...DEMO_CREDENTIAL_PROFILES[index] };
}

export function demoDeleteCredentialProfile(profileId: number): void {
    const index = DEMO_CREDENTIAL_PROFILES.findIndex((item) => item.id === profileId);
    if (index >= 0) {
        DEMO_CREDENTIAL_PROFILES.splice(index, 1);
    }
}

export function demoFetchInventoryGroups(): InventoryGroup[] {
    return DEMO_INVENTORY_GROUPS.map((item) => ({ ...item }));
}

export function demoAssignDevicesToGroup(groupId: number, deviceIds: number[]): void {
    const data = getDemoData();
    data.devices = data.devices.map((device) =>
        deviceIds.includes(device.id) ? { ...device, inventory_group_id: groupId, updated_at: nowIso() } : device,
    );
}

export function demoFetchDeviceTags(): DeviceTag[] {
    return DEMO_DEVICE_TAGS.map((item) => ({ ...item }));
}

export function demoAddTagToDevice(_: number, __: string): void {
    return;
}

export function demoRemoveTagFromDevice(_: number, __: string): void {
    return;
}

export function demoFetchJobs(options?: JobsQueryOptions): { data: Job[]; page: PaginatedResponse<Job>["page"] } {
    const data = getDemoData();
    let jobs = [...data.jobs];

    if (options?.job_type) {
        if (options.job_type.includes("*")) {
            const prefix = options.job_type.split("*", 1)[0].toLowerCase();
            jobs = jobs.filter((job) => job.job_type.toLowerCase().startsWith(prefix));
        } else {
            jobs = jobs.filter((job) => job.job_type === options.job_type);
        }
    }

    if (options?.status) {
        jobs = jobs.filter((job) => job.status === options.status);
    }

    if (options?.queue) {
        jobs = jobs.filter((job) => job.queue === options.queue);
    }

    if (options?.run_as_internal !== undefined) {
        jobs = jobs.filter((job) => Boolean(job.run_as_internal) === options.run_as_internal);
    }

    jobs = sortByField(
        jobs.map((job) => ({
            ...job,
            created_at: job.timestamps.created_at ?? "",
        })),
        "-created_at",
    ) as Job[];

    return paginateCursor(jobs, options?.cursor, options?.["page[size]"] ?? 25);
}

export function demoFetchHealthSummary(): DeviceHealthSummary {
    const devices = getDemoData().devices;
    const statuses = ["healthy", "healthy", "warning", "critical", "unknown"] as const;
    const overall: Record<string, number> = {};
    const byPlatform = new Map<number | undefined, DeviceHealthSummary["by_platform"][number]>();
    const byGroup = new Map<number | undefined, DeviceHealthSummary["by_group"][number]>();

    for (const device of devices) {
        const status = statuses[device.id % statuses.length];
        overall[status] = (overall[status] ?? 0) + 1;

        const platform = DEMO_PLATFORMS.find((item) => item.id === device.platform_id);
        const platformEntry =
            byPlatform.get(device.platform_id) ??
            {
                scope: "platform",
                identifier: String(device.platform_id ?? "none"),
                name: platform?.display_name ?? "Unassigned",
                total: 0,
                statuses: {},
            };
        platformEntry.total += 1;
        platformEntry.statuses[status] = (platformEntry.statuses[status] ?? 0) + 1;
        byPlatform.set(device.platform_id, platformEntry);

        const group = DEMO_INVENTORY_GROUPS.find((item) => item.id === device.inventory_group_id);
        const groupEntry =
            byGroup.get(device.inventory_group_id) ??
            {
                scope: "group",
                identifier: String(device.inventory_group_id ?? "none"),
                name: group?.name ?? "Ungrouped",
                total: 0,
                statuses: {},
            };
        groupEntry.total += 1;
        groupEntry.statuses[status] = (groupEntry.statuses[status] ?? 0) + 1;
        byGroup.set(device.inventory_group_id, groupEntry);
    }

    return {
        generated_at: nowIso(),
        overall: {
            total: devices.length,
            statuses: overall,
        },
        by_platform: Array.from(byPlatform.values()),
        by_group: Array.from(byGroup.values()),
    };
}

export function demoQueuePasswordRotation(reason: string): QueueJobResponse {
    const data = getDemoData();
    const job: Job = {
        id: nextId(data.jobs),
        uuid: crypto.randomUUID(),
        job_type: "password_change",
        status: "queued",
        queue: "default",
        priority: 5,
        parameters: {
            reason,
            source: "demo-mode",
        },
        timestamps: {
            created_at: nowIso(),
        },
        tasks: [],
        events: [],
    };
    data.jobs.unshift(job);
    return { job, enqueued: true };
}

export function demoQueueProbe(input: QueueProbeInput): QueueJobResponse {
    const data = getDemoData();
    const createdAt = nowIso();
    const job: Job = {
        id: nextId(data.jobs),
        uuid: crypto.randomUUID(),
        job_type: "device.probe",
        status: "queued",
        queue: "default",
        priority: 5,
        parameters: {
            device_ids: input.device_ids,
            probe_type: input.probe_type,
            variables: input.variables ?? {},
            source: "demo-mode",
        },
        timestamps: {
            created_at: createdAt,
        },
        tasks: input.device_ids.map((deviceId, index) => ({
            id: index + 1,
            sequence: index,
            task_type: "device.probe.run",
            status: "pending",
            device_id: deviceId,
            progress_total: 1,
            progress_completed: 0,
        })),
        events: [
            {
                id: 1,
                event_type: "queued",
                message: "probe run queued",
                occurred_at: createdAt,
            },
        ],
    };
    data.jobs.unshift(job);
    return { job, enqueued: true };
}

export function demoFetchJob(jobId: number): Job {
    const job = getDemoData().jobs.find((item) => item.id === jobId);
    if (!job) {
        throw new Error(`Demo job ${jobId} not found`);
    }
    return { ...job, tasks: [...job.tasks], events: [...job.events] };
}

export function demoStartPasswordChange(input: {
    device_ids: number[];
    current_password?: string;
    new_password: string;
    enable_secret?: string;
    async?: boolean;
    validate_after?: boolean;
}): { status: string; job: Job } {
    const data = getDemoData();
    const selected = data.devices.filter((device) => input.device_ids.includes(device.id));
    const createdAt = nowIso();
    const results: PasswordChangeResult[] = selected.map((device, index) => ({
        device_id: device.id,
        ok: true,
        changed: true,
        output: `Password changed successfully on ${device.name}.`,
        phase: "completed",
        platform: DEMO_PLATFORMS.find((platform) => platform.id === device.platform_id)?.slug ?? "unknown",
        host: device.mgmt_ipv4 ?? device.fqdn ?? device.name,
    }));

    const job: Job = {
        id: nextId(data.jobs),
        uuid: crypto.randomUUID(),
        job_type: "password_change.batch",
        status: "succeeded",
        queue: "default",
        priority: 5,
        parameters: {
            scope: { device_ids: input.device_ids },
            options: {
                validate_after: input.validate_after ?? true,
            },
        },
        timestamps: {
            created_at: createdAt,
            started_at: createdAt,
            finished_at: createdAt,
        },
        tasks: results.map((result, index) => ({
            id: index + 1,
            sequence: index,
            task_type: "password_change.device",
            status: "succeeded",
            device_id: result.device_id,
            progress_total: 1,
            progress_completed: 1,
            started_at: createdAt,
            finished_at: createdAt,
            result: result as unknown as Record<string, unknown>,
        })),
        events: [
            {
                id: 1,
                event_type: "completed",
                message: "password change completed",
                occurred_at: createdAt,
            },
        ],
    };

    data.jobs.unshift(job);
    return { status: "queued", job };
}

export function demoFetchPolicies(): CompliancePolicy[] {
    return getDemoData().policies.map((item) => ({ ...item }));
}

export function demoFetchComplianceRules(options?: ComplianceRulesQueryOptions): ComplianceRule[] {
    const data = getDemoData();
    let rules = [...data.complianceRules];

    if (options?.policy_id != null) {
        rules = rules.filter((item) => item.policy_id === options.policy_id);
    }
    if (options?.severity) {
        const severity = normalizeString(options.severity);
        rules = rules.filter((item) => normalizeString(item.severity) === severity);
    }
    if (options?.rule_type) {
        const ruleType = normalizeString(options.rule_type);
        rules = rules.filter((item) => normalizeString(item.rule_type) === ruleType);
    }
    if (options?.name) {
        const name = normalizeString(options.name);
        rules = rules.filter((item) => normalizeString(item.name).includes(name));
    }

    return paginateOffset(sortByField(rules, "-updated_at"), options).map((item) => ({ ...item }));
}

export function demoCreateComplianceRule(
    input: Omit<ComplianceRule, "id" | "created_at" | "updated_at">,
): ComplianceRule {
    const data = getDemoData();
    const created: ComplianceRule = {
        ...input,
        id: nextId(data.complianceRules),
        created_at: nowIso(),
        updated_at: nowIso(),
    };
    data.complianceRules.unshift(created);
    return { ...created };
}

export function demoUpdateComplianceRule(
    ruleId: number,
    input: Partial<Omit<ComplianceRule, "id" | "created_at" | "updated_at">>,
): ComplianceRule {
    const data = getDemoData();
    const index = data.complianceRules.findIndex((item) => item.id === ruleId);
    if (index === -1) {
        throw new Error(`Demo compliance rule ${ruleId} not found`);
    }
    data.complianceRules[index] = {
        ...data.complianceRules[index],
        ...input,
        updated_at: nowIso(),
    };
    return { ...data.complianceRules[index] };
}

export function demoDeleteComplianceRule(ruleId: number): void {
    const data = getDemoData();
    data.complianceRules = data.complianceRules.filter((item) => item.id !== ruleId);
    data.complianceResults = data.complianceResults.filter((item) => item.rule_id !== ruleId);
}

export function demoFetchComplianceResults(options?: ComplianceResultsQueryOptions): ComplianceResult[] {
    const data = getDemoData();
    let results = [...data.complianceResults];

    if (options?.device_id != null) {
        results = results.filter((item) => item.device_id === options.device_id);
    }
    if (options?.policy_id != null) {
        results = results.filter((item) => item.policy_id === options.policy_id);
    }
    if (options?.rule_id != null) {
        results = results.filter((item) => item.rule_id === options.rule_id);
    }
    if (options?.status) {
        const status = normalizeString(options.status);
        results = results.filter((item) => normalizeString(item.status) === status);
    }

    return paginateOffset(sortByField(results, "-evaluated_at"), options).map((item) => ({ ...item }));
}

export function demoEvaluateCompliance(input: {
    policy_ids?: number[];
    device_ids?: number[];
    async?: boolean;
}): QueueEvaluateResponse {
    const data = getDemoData();
    const createdAt = nowIso();
    const job: Job = {
        id: nextId(data.jobs),
        uuid: crypto.randomUUID(),
        job_type: "compliance.evaluate",
        status: "queued",
        queue: "default",
        priority: 5,
        parameters: {
            policy_ids: input.policy_ids ?? [],
            device_ids: input.device_ids ?? [],
            mode: input.async === false ? "sync" : "async",
            source: "demo-mode",
        },
        timestamps: {
            created_at: createdAt,
        },
        tasks: (input.policy_ids ?? []).map((policyId, index) => ({
            id: index + 1,
            sequence: index,
            task_type: "compliance.policy",
            status: "pending",
            target_type: "policy",
            target_id: policyId,
        })),
        events: [
            {
                id: 1,
                event_type: "queued",
                message: "compliance evaluation queued",
                occurred_at: createdAt,
            },
        ],
    };

    data.jobs.unshift(job);
    return {
        status: "queued",
        enqueued_at: createdAt,
        job,
    };
}

export function demoFetchOperationTemplates(options?: OperationTemplateQueryOptions): OperationTemplate[] {
    const data = getDemoData();
    let templates = [...data.operationTemplates];

    if (options?.platform_id != null) {
        templates = templates.filter((item) => item.platform_id === options.platform_id);
    }
    if (options?.op_type) {
        const opType = normalizeString(options.op_type);
        templates = templates.filter((item) => normalizeString(item.op_type) === opType);
    }
    if (options?.name) {
        const name = normalizeString(options.name);
        templates = templates.filter((item) => normalizeString(item.name).includes(name));
    }

    templates = sortByField(templates, options?.sort ?? "-updated_at");
    return paginateOffset(templates, options).map((item) => ({ ...item }));
}

export function demoCreateOperationTemplate(
    input: Omit<OperationTemplate, "id" | "created_at" | "updated_at">,
): OperationTemplate {
    const data = getDemoData();
    const created: OperationTemplate = {
        ...input,
        id: nextId(data.operationTemplates),
        created_at: nowIso(),
        updated_at: nowIso(),
    };
    data.operationTemplates.unshift(created);
    return { ...created };
}

export function demoUpdateOperationTemplate(
    templateId: number,
    input: Partial<Omit<OperationTemplate, "id" | "created_at" | "updated_at">>,
): OperationTemplate {
    const data = getDemoData();
    const index = data.operationTemplates.findIndex((item) => item.id === templateId);
    if (index === -1) {
        throw new Error(`Demo operation template ${templateId} not found`);
    }
    data.operationTemplates[index] = {
        ...data.operationTemplates[index],
        ...input,
        updated_at: nowIso(),
    };
    return { ...data.operationTemplates[index] };
}

export function demoDeleteOperationTemplate(templateId: number): void {
    const data = getDemoData();
    data.operationTemplates = data.operationTemplates.filter((item) => item.id !== templateId);
}

export function demoFetchSnapshots(options?: SnapshotQueryOptions): DeviceConfigSnapshot[] {
    const data = getDemoData();
    let snapshots = [...data.snapshots];

    if (options?.device_id != null) {
        snapshots = snapshots.filter((item) => item.device_id === options.device_id);
    }
    if (options?.source) {
        const source = normalizeString(options.source);
        snapshots = snapshots.filter((item) => normalizeString(item.source).includes(source));
    }
    if (options?.hash) {
        const hash = normalizeString(options.hash);
        snapshots = snapshots.filter((item) => normalizeString(item.config_hash).includes(hash));
    }

    snapshots = sortByField(snapshots, options?.sort ?? "-captured_at");
    return paginateOffset(snapshots, options).map((item) => ({ ...item }));
}

export function demoCreatePolicy(
    input: {
        name: string;
        description?: string;
        scope?: Record<string, unknown>;
        is_active?: boolean;
    },
): CompliancePolicy {
    const data = getDemoData();
    const policy: CompliancePolicy = {
        id: nextId(data.policies),
        name: input.name,
        description: input.description,
        scope: input.scope,
        is_active: input.is_active ?? true,
        created_at: nowIso(),
        updated_at: nowIso(),
    };
    data.policies.unshift(policy);
    return { ...policy };
}

export function demoUpdatePolicy(
    policyId: number,
    input: {
        name: string;
        description?: string;
        scope?: Record<string, unknown>;
        is_active?: boolean;
    },
): CompliancePolicy {
    const data = getDemoData();
    const index = data.policies.findIndex((item) => item.id === policyId);
    if (index === -1) {
        throw new Error(`Demo policy ${policyId} not found`);
    }
    data.policies[index] = {
        ...data.policies[index],
        ...input,
        updated_at: nowIso(),
    };
    return { ...data.policies[index] };
}

export function demoDeletePolicy(policyId: number): void {
    const data = getDemoData();
    data.policies = data.policies.filter((item) => item.id !== policyId);
    data.complianceRules = data.complianceRules.filter((item) => item.policy_id !== policyId);
    data.complianceResults = data.complianceResults.filter((item) => item.policy_id !== policyId);
}

export function demoFetchHardwareLifecycle(options?: HardwareLifecycleQueryOptions): HardwareLifecycle[] {
    const data = getDemoData();
    let rows = [...data.hardwareLifecycle];

    if (options?.product_model_id != null) {
        rows = rows.filter((item) => item.product_model_id === options.product_model_id);
    }

    const now = new Date();
    const dueSoon = new Date();
    dueSoon.setDate(dueSoon.getDate() + (options?.due_in_days ?? 0));

    if (options?.past) {
        const field = milestoneField(options.past);
        rows = rows.filter((item) => {
            const value = field ? item[field] : undefined;
            return value ? new Date(value) < now : false;
        });
    } else if (options?.due_in_days) {
        rows = rows.filter((item) =>
            lifecycleDateValues(item).some((value) => {
                const date = value ? new Date(value) : null;
                return date ? date >= now && date <= dueSoon : false;
            }),
        );
    }

    return paginateOffset(sortByField(rows, "last_day_of_support_date"), options).map((item) => ({ ...item }));
}

export function demoCreateHardwareLifecycle(
    input: Omit<HardwareLifecycle, "id">,
): HardwareLifecycle {
    const data = getDemoData();
    const created: HardwareLifecycle = {
        ...input,
        id: nextId(data.hardwareLifecycle),
    };
    data.hardwareLifecycle.unshift(created);
    return { ...created };
}

export function demoUpdateHardwareLifecycle(
    rowId: number,
    input: Partial<Omit<HardwareLifecycle, "id">>,
): HardwareLifecycle {
    const data = getDemoData();
    const index = data.hardwareLifecycle.findIndex((item) => item.id === rowId);
    if (index === -1) {
        throw new Error(`Demo hardware lifecycle ${rowId} not found`);
    }
    data.hardwareLifecycle[index] = {
        ...data.hardwareLifecycle[index],
        ...input,
    };
    return { ...data.hardwareLifecycle[index] };
}

export function demoDeleteHardwareLifecycle(rowId: number): void {
    const data = getDemoData();
    data.hardwareLifecycle = data.hardwareLifecycle.filter((item) => item.id !== rowId);
}

export function demoFetchSoftwareLifecycle(options?: SoftwareLifecycleQueryOptions): SoftwareLifecycle[] {
    const data = getDemoData();
    let rows = [...data.softwareLifecycle];

    if (options?.os_name) {
        const osName = normalizeString(options.os_name);
        rows = rows.filter((item) => normalizeString(item.os_name).includes(osName));
    }
    if (options?.platform_id != null) {
        rows = rows.filter((item) => item.platform_id === options.platform_id);
    }
    if (options?.match_operator) {
        const operator = normalizeString(options.match_operator);
        rows = rows.filter((item) => normalizeString(item.match_operator) === operator);
    }

    return paginateOffset(sortByField(rows, "last_day_of_support_date"), options).map((item) => ({ ...item }));
}

export function demoCreateSoftwareLifecycle(
    input: Omit<SoftwareLifecycle, "id">,
): SoftwareLifecycle {
    const data = getDemoData();
    const created: SoftwareLifecycle = {
        ...input,
        id: nextId(data.softwareLifecycle),
    };
    data.softwareLifecycle.unshift(created);
    return { ...created };
}

export function demoUpdateSoftwareLifecycle(
    rowId: number,
    input: Partial<Omit<SoftwareLifecycle, "id">>,
): SoftwareLifecycle {
    const data = getDemoData();
    const index = data.softwareLifecycle.findIndex((item) => item.id === rowId);
    if (index === -1) {
        throw new Error(`Demo software lifecycle ${rowId} not found`);
    }
    data.softwareLifecycle[index] = {
        ...data.softwareLifecycle[index],
        ...input,
    };
    return { ...data.softwareLifecycle[index] };
}

export function demoDeleteSoftwareLifecycle(rowId: number): void {
    const data = getDemoData();
    data.softwareLifecycle = data.softwareLifecycle.filter((item) => item.id !== rowId);
}

function paginateOffset<T>(items: T[], options?: OffsetPaginationOptions): T[] {
    const page = options?.page ?? 1;
    const perPage = options?.per_page ?? 25;
    const start = Math.max(0, (page - 1) * perPage);
    return items.slice(start, start + perPage);
}

export function demoFetchRequestLogs(options?: OffsetPaginationOptions): RequestLogEntry[] {
    return paginateOffset(getDemoData().requestLogs, options).map((item) => ({ ...item }));
}

export function demoFetchErrorLogs(options?: OffsetPaginationOptions): ErrorLogEntry[] {
    return paginateOffset(getDemoData().errorLogs, options).map((item) => ({ ...item }));
}

export function demoFetchAppEvents(options?: EventLogQueryOptions): AppEventEntry[] {
    let events = [...getDemoData().appEvents];

    if (options?.event) {
        const event = normalizeString(options.event);
        events = events.filter((item) => normalizeString(item.event) === event);
    }
    if (options?.level) {
        const level = normalizeString(options.level);
        events = events.filter((item) => normalizeString(item.level) === level);
    }

    return paginateOffset(sortByField(events, "-created_at"), options).map((item) => ({ ...item }));
}

export function demoFetchAuditEntries(options?: {
    cursor?: string;
    "page[size]"?: number;
}): { data: AuditLogEntry[]; page: PaginatedResponse<AuditLogEntry>["page"] } {
    return paginateCursor(getDemoData().auditEntries, options?.cursor, options?.["page[size]"] ?? 25);
}

function milestoneField(
    milestone?: string,
): keyof HardwareLifecycle | undefined {
    switch (normalizeString(milestone)) {
        case "eos":
            return "end_of_sale_date";
        case "eoswm":
            return "end_of_software_maintenance_date";
        case "eosec":
            return "end_of_security_fixes_date";
        case "ldos":
            return "last_day_of_support_date";
        default:
            return undefined;
    }
}

function lifecycleDateValues(
    row: HardwareLifecycle | SoftwareLifecycle,
): Array<string | undefined> {
    return [
        row.end_of_sale_date,
        row.end_of_software_maintenance_date,
        row.end_of_security_fixes_date,
        row.last_day_of_support_date,
    ];
}
