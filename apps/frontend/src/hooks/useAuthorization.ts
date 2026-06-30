import { useMemo } from "react";

import { useAuth } from "./useAuth";
import { hasRole, isOwner, ROLES } from "@/lib/roles";
import type { Role } from "@/lib/roles";

export function useAuthorization() {
    const { payload } = useAuth();

    return useMemo(() => {
        const roles: string[] = (payload as { roles?: string[] } | null)?.roles ?? [];

        return {
            roles,
            hasRole: (role: Role | Role[]) => hasRole(roles, role),
            isOwner: isOwner(roles),
            canEdit: isOwner(roles),
            canDelete: isOwner(roles),
            canManageAdmin: hasRole(roles, [ROLES.OWNER, ROLES.ADMIN]),
        };
    }, [payload]);
}
