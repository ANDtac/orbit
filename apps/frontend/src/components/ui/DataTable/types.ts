import type { ReactNode } from "react";

export interface ColumnDef<T> {
    key: string;
    header: ReactNode;
    accessor: (row: T) => ReactNode;
    sortable?: boolean;
    sortKey?: string;
    width?: string;
    headerClassName?: string;
    cellClassName?: string;
}

export interface CursorPagination {
    mode: "cursor";
    cursor?: string;
    next?: string | null;
    prev?: string | null;
    total?: number;
    pageSize?: number;
    onPageChange: (cursor: string | undefined) => void;
}

export interface OffsetPagination {
    mode: "offset";
    page: number;
    perPage: number;
    total?: number;
    hasMore?: boolean;
    onPageChange: (page: number) => void;
}

export type PaginationConfig = CursorPagination | OffsetPagination;

export interface SortingConfig {
    field: string;
    direction: "asc" | "desc";
    onSort: (field: string, direction: "asc" | "desc") => void;
}

export interface SelectionConfig {
    selected: Set<string | number>;
    onSelectionChange: (selected: Set<string | number>) => void;
}

export interface ExpandableConfig<T> {
    render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
    columns: ColumnDef<T>[];
    data: T[];
    keyExtractor: (row: T) => string | number;

    pagination?: PaginationConfig;
    sorting?: SortingConfig;
    selection?: SelectionConfig;
    expandable?: ExpandableConfig<T>;

    isLoading?: boolean;
    isError?: boolean;
    errorMessage?: string;
    onRetry?: () => void;
    emptyState?: ReactNode;
    bulkActions?: ReactNode;
    onRowClick?: (row: T) => void;

    dense?: boolean;
    className?: string;
    stickyHeader?: boolean;
}
