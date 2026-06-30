import type {
    AppEventEntry,
    AuditLogEntry,
    CompliancePolicy,
    ComplianceResult,
    ComplianceRule,
    Device,
    DeviceConfigSnapshot,
    ErrorLogEntry,
    HardwareLifecycle,
    Job,
    OperationTemplate,
    RequestLogEntry,
    SoftwareLifecycle,
} from "@/lib/types";

function randomItem<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

function randomId(): number {
    return Math.floor(Math.random() * 9000) + 1000;
}

function randomUuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}

function pastDate(maxDaysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * maxDaysAgo));
    d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
    return d.toISOString();
}

const PLATFORMS = ["cisco_ios", "cisco_nxos", "cisco_iosxe", "juniper_junos", "arista_eos"];
const SITES = ["HQ-DC1", "HQ-DC2", "Branch-NYC", "Branch-LAX", "Branch-CHI", "Cloud-AWS", "Cloud-Azure"];
const HOSTNAMES = [
    "core-rtr", "dist-sw", "access-sw", "fw", "edge-rtr", "spine", "leaf",
    "border-gw", "wan-rtr", "mgmt-sw",
];
const OS_VERSIONS = ["17.3.4", "16.12.8", "9.3(10)", "22.2R1", "4.28.3M"];

export function generateDevices(count = 30): Device[] {
    return Array.from({ length: count }, (_, i) => {
        const hostname = HOSTNAMES[i % HOSTNAMES.length];
        const site = randomItem(SITES);
        const platform = randomItem(PLATFORMS);
        return {
            id: i + 1,
            name: `${hostname}-${String(i + 1).padStart(2, "0")}.${site.toLowerCase()}.orbit.local`,
            fqdn: `${hostname}-${String(i + 1).padStart(2, "0")}.${site.toLowerCase()}.orbit.local`,
            mgmt_ipv4: `10.${Math.floor(i / 254)}.${(i % 254) + 1}.1`,
            mgmt_port: 22,
            platform_id: PLATFORMS.indexOf(platform) + 1,
            os_name: platform.replace(/_/g, "-"),
            os_version: randomItem(OS_VERSIONS),
            serial_number: `SN${String(randomId())}${String(randomId()).slice(0, 4)}`,
            is_active: Math.random() > 0.15,
            notes: i % 5 === 0 ? `Located in ${site} rack A${Math.floor(Math.random() * 10) + 1}` : undefined,
            created_at: pastDate(90),
            updated_at: pastDate(7),
        };
    });
}

const JOB_TYPES = ["password_rotation", "config_backup", "compliance_check", "health_probe", "discovery"];
const JOB_STATUSES: Job["status"][] = ["queued", "running", "finished", "finished", "finished", "failed"];

export function generateJobs(count = 15): Job[] {
    return Array.from({ length: count }, (_, i) => {
        const status = randomItem(JOB_STATUSES);
        const createdAt = pastDate(14);
        return {
            id: i + 1,
            uuid: randomUuid(),
            job_type: randomItem(JOB_TYPES),
            status,
            queue: randomItem(["default", "high_priority", "maintenance"]),
            priority: Math.floor(Math.random() * 10),
            timestamps: {
                created_at: createdAt,
                started_at: status !== "queued" ? createdAt : undefined,
                finished_at: status === "finished" || status === "failed" ? pastDate(7) : undefined,
            },
            tasks: Array.from({ length: Math.floor(Math.random() * 3) + 1 }, (_, j) => ({
                id: randomId(),
                sequence: j + 1,
                task_type: randomItem(["ssh_command", "api_call", "validation", "backup"]),
                status: status === "finished" ? "succeeded" as const : status === "failed" ? randomItem(["succeeded" as const, "failed" as const]) : "pending" as const,
            })),
            events: Array.from({ length: Math.floor(Math.random() * 2) + 1 }, () => ({
                id: randomId(),
                event_type: randomItem(["started", "progress", "completed", "error"]),
                message: randomItem(["Task initiated", "Connection established", "Operation complete", "Timeout on device"]),
                occurred_at: pastDate(7),
            })),
        };
    });
}

export function generatePolicies(count = 5): CompliancePolicy[] {
    const names = [
        "NTP Configuration Check",
        "SSH Version Enforcement",
        "SNMP Community Audit",
        "Password Complexity Policy",
        "Banner Compliance",
        "ACL Baseline Check",
        "Logging Configuration Audit",
    ];
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        name: names[i % names.length],
        description: `Validates ${names[i % names.length].toLowerCase()} across all managed devices.`,
        is_active: Math.random() > 0.3,
        scope: { platforms: randomItem([["cisco_ios"], ["cisco_nxos", "cisco_iosxe"], PLATFORMS]) },
        created_at: pastDate(60),
        updated_at: pastDate(14),
    }));
}

export function generateComplianceRules(
    policies: CompliancePolicy[],
    count = 12,
): ComplianceRule[] {
    const severities: ComplianceRule["severity"][] = ["low", "medium", "high", "critical"];
    const ruleTypes = ["regex", "config_line_present", "jsonpath"];

    return Array.from({ length: count }, (_, i) => {
        const policy = policies[i % policies.length];
        const severity = severities[i % severities.length];
        const ruleType = ruleTypes[i % ruleTypes.length];

        return {
            id: i + 1,
            policy_id: policy.id,
            name: `${policy.name} rule ${i + 1}`,
            description: `Checks ${ruleType.replace(/_/g, " ")} conditions for ${policy.name.toLowerCase()}.`,
            severity,
            rule_type: ruleType,
            expression:
                ruleType === "regex"
                    ? "^service timestamps"
                    : ruleType === "jsonpath"
                      ? "$.interfaces[*].shutdown"
                      : "logging host 10.0.0.10",
            params: { expected: true, source: "demo" },
            created_at: pastDate(45),
            updated_at: pastDate(10),
        };
    });
}

export function generateComplianceResults(
    devices: Device[],
    policies: CompliancePolicy[],
    rules: ComplianceRule[],
    count = 18,
): ComplianceResult[] {
    const statuses: ComplianceResult["status"][] = ["pass", "pass", "fail", "skip", "error"];

    return Array.from({ length: count }, (_, i) => {
        const device = devices[i % devices.length];
        const policy = policies[i % policies.length];
        const matchingRules = rules.filter((rule) => rule.policy_id === policy.id);
        const rule = matchingRules[i % Math.max(1, matchingRules.length)] ?? rules[i % rules.length];
        const status = statuses[i % statuses.length];

        return {
            id: i + 1,
            device_id: device.id,
            policy_id: policy.id,
            rule_id: rule?.id ?? null,
            evaluated_at: pastDate(14),
            status,
            details: {
                summary:
                    status === "pass"
                        ? "Observed configuration matched the expected rule."
                        : status === "fail"
                          ? "Required configuration stanza was missing."
                          : status === "error"
                            ? "Device returned an unexpected parsing error."
                            : "Policy skipped because scope did not match.",
                observed:
                    status === "fail"
                        ? "no logging host configured"
                        : "logging host 10.0.0.10",
            },
            snapshot_id: (i % 8) + 1,
        };
    });
}

export function generateOperationTemplates(count = 6): OperationTemplate[] {
    const operationTypes = ["backup", "health_check", "password_change", "show_version"];
    return Array.from({ length: count }, (_, i) => {
        const platformId = (i % PLATFORMS.length) + 1;
        const opType = operationTypes[i % operationTypes.length];
        return {
            id: i + 1,
            platform_id: platformId,
            name: `${opType.replace(/_/g, " ")} template ${i + 1}`,
            description: `Reusable ${opType.replace(/_/g, " ")} workflow for ${PLATFORMS[platformId - 1]}.`,
            op_type: opType,
            template: `show running-config\n! operation: ${opType}\n! hostname: {{ hostname }}`,
            variables: { hostname: { type: "string", required: true } },
            notes: i % 2 === 0 ? "Validated in lab." : undefined,
            created_at: pastDate(60),
            updated_at: pastDate(10),
        };
    });
}

export function generateSnapshots(devices: Device[], count = 12): DeviceConfigSnapshot[] {
    return Array.from({ length: count }, (_, i) => {
        const device = devices[i % devices.length];
        const capturedAt = pastDate(14);
        const configText = [
            `hostname ${device.name.split(".")[0]}`,
            `interface Loopback0`,
            ` ip address 10.${i}.0.1 255.255.255.255`,
            `router bgp 6500${i % 10}`,
            ` neighbor 10.${i}.0.2 remote-as 6510${i % 10}`,
        ].join("\n");

        return {
            id: i + 1,
            device_id: device.id,
            captured_at: capturedAt,
            source: i % 2 === 0 ? "napalm:get_config" : "cli:show running-config",
            config_text: configText,
            config_hash: `demo-hash-${String(i + 1).padStart(4, "0")}`,
            config_format: "text/plain",
            metadata: { vendor: device.os_name ?? "unknown" },
            notes: i % 3 === 0 ? "Pre-maintenance capture" : undefined,
            created_at: capturedAt,
            updated_at: capturedAt,
        };
    });
}

export function generateHardwareLifecycle(count = 10): HardwareLifecycle[] {
    return Array.from({ length: count }, (_, i) => {
        const pastDays = i * 15;
        const eos = new Date();
        eos.setDate(eos.getDate() - pastDays);
        const ldos = new Date();
        ldos.setDate(ldos.getDate() + 30 + i * 20);

        return {
            id: i + 1,
            product_model_id: 1000 + i,
            end_of_sale_date: eos.toISOString(),
            end_of_software_maintenance_date: new Date(eos.getTime() + 120 * 86400000).toISOString(),
            end_of_security_fixes_date: new Date(eos.getTime() + 180 * 86400000).toISOString(),
            last_day_of_support_date: ldos.toISOString(),
            source_url: `https://example.local/eox/hardware/${1000 + i}`,
            notes: i % 2 === 0 ? "Imported from vendor bulletin." : undefined,
        };
    });
}

export function generateSoftwareLifecycle(count = 10): SoftwareLifecycle[] {
    const operators: SoftwareLifecycle["match_operator"][] = ["eq", "prefix", "regex"];

    return Array.from({ length: count }, (_, i) => {
        const eos = new Date();
        eos.setDate(eos.getDate() - i * 10);
        const ldos = new Date();
        ldos.setDate(ldos.getDate() + 15 + i * 18);

        return {
            id: i + 1,
            platform_id: (i % PLATFORMS.length) + 1,
            os_name: PLATFORMS[i % PLATFORMS.length].replace(/_/g, "-"),
            match_operator: operators[i % operators.length],
            match_value:
                operators[i % operators.length] === "eq"
                    ? randomItem(OS_VERSIONS)
                    : operators[i % operators.length] === "prefix"
                      ? "17."
                      : "^9\\.",
            end_of_sale_date: eos.toISOString(),
            end_of_software_maintenance_date: new Date(eos.getTime() + 90 * 86400000).toISOString(),
            end_of_security_fixes_date: new Date(eos.getTime() + 140 * 86400000).toISOString(),
            last_day_of_support_date: ldos.toISOString(),
            source_url: `https://example.local/eox/software/${i + 1}`,
            notes: i % 3 === 0 ? "Roadmap item verified with vendor notice." : undefined,
        };
    });
}

export function generateRequestLogs(count = 25): RequestLogEntry[] {
    const methods = ["GET", "GET", "GET", "POST", "PUT", "DELETE"];
    const paths = ["/api/v1/devices", "/api/v1/jobs", "/api/v1/compliance/policies", "/api/v1/auth/me", "/api/v1/logs/requests"];
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        created_at: pastDate(3),
        correlation_id: randomUuid(),
        method: randomItem(methods),
        path: randomItem(paths),
        status_code: randomItem([200, 200, 200, 201, 400, 404, 500]),
        latency_ms: Math.floor(Math.random() * 500) + 10,
        user_id: 1,
    }));
}

export function generateErrorLogs(count = 10): ErrorLogEntry[] {
    const messages = [
        "Connection refused to device core-rtr-01",
        "Timeout waiting for SSH handshake",
        "Invalid SNMP community string",
        "Failed to parse device response",
        "Database connection pool exhausted",
    ];
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        created_at: pastDate(3),
        correlation_id: randomUuid(),
        level: randomItem(["ERROR", "ERROR", "WARNING", "CRITICAL"]),
        message: randomItem(messages),
        user_id: 1,
    }));
}

export function generateAppEvents(count = 12): AppEventEntry[] {
    const eventTypes = [
        "password_change.completed",
        "job.state_change",
        "operation.execute",
        "startup",
    ];
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        created_at: pastDate(4),
        level: randomItem(["INFO", "INFO", "WARNING", "ERROR"]),
        event: eventTypes[i % eventTypes.length],
        message:
            eventTypes[i % eventTypes.length] === "password_change.completed"
                ? "Password change batch completed"
                : eventTypes[i % eventTypes.length] === "job.state_change"
                  ? "Job changed state"
                  : eventTypes[i % eventTypes.length] === "operation.execute"
                    ? "Operation execution started"
                    : "App initialized",
        extra:
            eventTypes[i % eventTypes.length] === "password_change.completed"
                ? { total: 12, succeeded: 11, failed: 1, requested_by: "demo-admin" }
                : eventTypes[i % eventTypes.length] === "job.state_change"
                  ? { job_id: i + 1, from_status: "queued", to_status: "running" }
                  : { requested_by: "demo-admin" },
    }));
}

export function generateAuditEntries(count = 16): AuditLogEntry[] {
    const actions = ["platform.create", "credential.update", "device.delete", "policy.evaluate"];
    const targetTypes = ["platform", "credential_profile", "device", "compliance_policy"];

    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        uuid: randomUuid(),
        occurred_at: pastDate(10),
        actor_id: 1,
        actor_type: "user",
        actor_display_name: "demo-admin",
        action: actions[i % actions.length],
        target_type: targetTypes[i % targetTypes.length],
        target_id: 100 + i,
        target_uuid: randomUuid(),
        target_repr: `${targetTypes[i % targetTypes.length]}-${100 + i}`,
        request_id: randomUuid(),
        ip_address: `10.0.0.${(i % 50) + 10}`,
        user_agent: "OrbitDemo/1.0",
        job_id: i % 3 === 0 ? i + 1 : null,
        payload: { before: { is_active: true }, after: { is_active: i % 2 === 0 } },
        message: `Demo audit entry ${i + 1}`,
    }));
}

let cachedData: ReturnType<typeof buildDemoData> | null = null;

function buildDemoData() {
    const devices = generateDevices(30);
    const policies = generatePolicies(5);
    const rules = generateComplianceRules(policies, 12);
    return {
        devices,
        jobs: generateJobs(15),
        policies,
        complianceRules: rules,
        complianceResults: generateComplianceResults(devices, policies, rules, 18),
        operationTemplates: generateOperationTemplates(8),
        snapshots: generateSnapshots(devices, 16),
        hardwareLifecycle: generateHardwareLifecycle(10),
        softwareLifecycle: generateSoftwareLifecycle(10),
        auditEntries: generateAuditEntries(16),
        requestLogs: generateRequestLogs(25),
        errorLogs: generateErrorLogs(10),
        appEvents: generateAppEvents(12),
    };
}

export function getDemoData() {
    if (!cachedData) {
        cachedData = buildDemoData();
    }
    return cachedData;
}

export function resetDemoData() {
    cachedData = null;
}
