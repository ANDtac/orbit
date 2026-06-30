export const ROLES = {
    OWNER: "owner",
    ADMIN: "admin",
    NETWORK_ADMIN: "network_admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

const ROLE_ALIASES: Record<string, string[]> = {
    [ROLES.ADMIN]: [ROLES.NETWORK_ADMIN],
    [ROLES.NETWORK_ADMIN]: [ROLES.ADMIN],
};

export function hasRole(userRoles: string[], required: Role | Role[]): boolean {
    const requiredArray = Array.isArray(required) ? required : [required];
    if (userRoles.includes(ROLES.OWNER)) return true;
    return requiredArray.some((role) => {
        if (userRoles.includes(role)) {
            return true;
        }
        return (ROLE_ALIASES[role] ?? []).some((alias) => userRoles.includes(alias));
    });
}

export function isOwner(userRoles: string[]): boolean {
    return userRoles.includes(ROLES.OWNER);
}
