import { Fragment, useState } from "react";
import clsx from "clsx";

import { DataTablePagination } from "./DataTablePagination";
import type { DataTableProps } from "./types";

export function DataTable<T>({
    columns,
    data,
    keyExtractor,
    pagination,
    sorting,
    selection,
    expandable,
    isLoading,
    isError,
    errorMessage,
    onRetry,
    emptyState,
    bulkActions,
    onRowClick,
    dense = false,
    className,
    stickyHeader = false,
}: DataTableProps<T>): JSX.Element {
    const [expandedKeys, setExpandedKeys] = useState<Set<string | number>>(new Set());

    const cellPadding = dense ? "px-3 py-2" : "px-4 py-3";
    const textSize = dense ? "text-xs" : "text-sm";

    function toggleExpand(key: string | number) {
        setExpandedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }

    function handleSelectAll() {
        if (!selection) return;
        const allKeys = new Set(data.map(keyExtractor));
        const allSelected = data.every((row) => selection.selected.has(keyExtractor(row)));
        selection.onSelectionChange(allSelected ? new Set() : allKeys);
    }

    function handleSelectRow(key: string | number) {
        if (!selection) return;
        const next = new Set(selection.selected);
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
        }
        selection.onSelectionChange(next);
    }

    function handleSort(columnKey: string, sortKey?: string) {
        if (!sorting) return;
        const field = sortKey ?? columnKey;
        const direction =
            sorting.field === field && sorting.direction === "asc" ? "desc" : "asc";
        sorting.onSort(field, direction);
    }

    const totalColumns =
        columns.length + (selection ? 1 : 0) + (expandable ? 1 : 0);

    // Loading state
    if (isLoading) {
        return (
            <div className={clsx("overflow-hidden rounded-2xl border border-primary/10", className)}>
                <table className="min-w-full divide-y divide-primary/10">
                    <thead className="bg-primary/10">
                        <tr>
                            {selection && (
                                <th className={clsx(cellPadding, "w-10")} />
                            )}
                            {expandable && (
                                <th className={clsx(cellPadding, "w-10")} />
                            )}
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    className={clsx(
                                        cellPadding,
                                        "text-left font-semibold text-primary",
                                        textSize,
                                        col.width,
                                        col.headerClassName,
                                    )}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-primary/5 bg-surface">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i}>
                                {selection && (
                                    <td className={cellPadding}>
                                        <div className="h-4 w-4 animate-pulse rounded bg-primary/10" />
                                    </td>
                                )}
                                {expandable && (
                                    <td className={cellPadding}>
                                        <div className="h-4 w-4 animate-pulse rounded bg-primary/10" />
                                    </td>
                                )}
                                {columns.map((col) => (
                                    <td key={col.key} className={cellPadding}>
                                        <div
                                            className="h-4 animate-pulse rounded bg-primary/10"
                                            style={{
                                                width: `${50 + Math.random() * 40}%`,
                                            }}
                                        />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    // Error state
    if (isError) {
        return (
            <div
                className={clsx(
                    "flex flex-col items-center justify-center rounded-2xl border border-primary/10 bg-surface py-12",
                    className,
                )}
            >
                <p className="text-sm text-muted">
                    {errorMessage ?? "Failed to load data."}
                </p>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="mt-3 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/20"
                    >
                        Retry
                    </button>
                )}
            </div>
        );
    }

    // Empty state
    if (!data.length) {
        return (
            <div
                className={clsx(
                    "flex flex-col items-center justify-center rounded-2xl border border-primary/10 bg-surface py-12",
                    className,
                )}
            >
                {emptyState ?? (
                    <p className="text-sm text-muted">No data to display.</p>
                )}
            </div>
        );
    }

    const allSelected =
        selection && data.length > 0
            ? data.every((row) => selection.selected.has(keyExtractor(row)))
            : false;
    const someSelected = selection ? selection.selected.size > 0 : false;

    return (
        <div className={clsx("space-y-3", className)}>
            <div className="overflow-hidden rounded-2xl border border-primary/10">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-primary/10">
                        <thead
                            className={clsx(
                                "bg-primary/10",
                                stickyHeader && "sticky top-0 z-10",
                            )}
                        >
                            <tr>
                                {selection && (
                                    <th className={clsx(cellPadding, "w-10")}>
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={handleSelectAll}
                                            className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary/50"
                                            aria-label="Select all rows"
                                        />
                                    </th>
                                )}
                                {expandable && (
                                    <th className={clsx(cellPadding, "w-10")} />
                                )}
                                {columns.map((col) => {
                                    const isSorted =
                                        sorting &&
                                        sorting.field ===
                                            (col.sortKey ?? col.key);
                                    return (
                                        <th
                                            key={col.key}
                                            scope="col"
                                            className={clsx(
                                                cellPadding,
                                                "text-left font-semibold text-primary",
                                                textSize,
                                                col.width,
                                                col.headerClassName,
                                                col.sortable &&
                                                    "cursor-pointer select-none",
                                            )}
                                            onClick={
                                                col.sortable
                                                    ? () =>
                                                          handleSort(
                                                              col.key,
                                                              col.sortKey,
                                                          )
                                                    : undefined
                                            }
                                            aria-sort={
                                                isSorted
                                                    ? sorting!.direction ===
                                                      "asc"
                                                        ? "ascending"
                                                        : "descending"
                                                    : undefined
                                            }
                                        >
                                            <span className="inline-flex items-center gap-1">
                                                {col.header}
                                                {col.sortable && (
                                                    <SortIndicator
                                                        active={!!isSorted}
                                                        direction={
                                                            isSorted
                                                                ? sorting!
                                                                      .direction
                                                                : undefined
                                                        }
                                                    />
                                                )}
                                            </span>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-primary/5 bg-surface">
                            {data.map((row) => {
                                const key = keyExtractor(row);
                                const isExpanded = expandedKeys.has(key);
                                const isSelected = selection
                                    ? selection.selected.has(key)
                                    : false;

                                return (
                                    <Fragment key={key}>
                                        <tr
                                            className={clsx(
                                                "transition hover:bg-primary/5",
                                                isSelected && "bg-primary/5",
                                                (onRowClick || expandable) &&
                                                    "cursor-pointer",
                                            )}
                                            onClick={() => {
                                                if (onRowClick) {
                                                    onRowClick(row);
                                                } else if (expandable) {
                                                    toggleExpand(key);
                                                }
                                            }}
                                            role={
                                                onRowClick || expandable
                                                    ? "button"
                                                    : undefined
                                            }
                                            tabIndex={
                                                onRowClick || expandable
                                                    ? 0
                                                    : undefined
                                            }
                                            aria-expanded={
                                                expandable
                                                    ? isExpanded
                                                    : undefined
                                            }
                                            onKeyDown={(e) => {
                                                if (
                                                    e.key === "Enter" ||
                                                    e.key === " "
                                                ) {
                                                    e.preventDefault();
                                                    if (onRowClick) {
                                                        onRowClick(row);
                                                    } else if (expandable) {
                                                        toggleExpand(key);
                                                    }
                                                }
                                            }}
                                        >
                                            {selection && (
                                                <td
                                                    className={cellPadding}
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() =>
                                                            handleSelectRow(key)
                                                        }
                                                        className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary/50"
                                                        aria-label={`Select row ${key}`}
                                                    />
                                                </td>
                                            )}
                                            {expandable && (
                                                <td className={cellPadding}>
                                                    <svg
                                                        className={clsx(
                                                            "h-4 w-4 text-muted transition-transform",
                                                            isExpanded &&
                                                                "rotate-90",
                                                        )}
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth={2}
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    >
                                                        <path d="M9 18l6-6-6-6" />
                                                    </svg>
                                                </td>
                                            )}
                                            {columns.map((col) => (
                                                <td
                                                    key={col.key}
                                                    className={clsx(
                                                        cellPadding,
                                                        textSize,
                                                        "text-text",
                                                        col.width,
                                                        col.cellClassName,
                                                    )}
                                                >
                                                    {col.accessor(row)}
                                                </td>
                                            ))}
                                        </tr>
                                        {expandable && isExpanded && (
                                            <tr>
                                                <td
                                                    colSpan={totalColumns}
                                                    className={clsx(
                                                        "bg-background/40",
                                                        cellPadding,
                                                        textSize,
                                                    )}
                                                >
                                                    {expandable.render(row)}
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bulk action bar */}
            {selection && someSelected && bulkActions && (
                <div className="sticky bottom-4 z-20 flex items-center gap-3 rounded-xl border border-primary/20 bg-surface px-4 py-3 shadow-lg">
                    <span className="text-sm font-medium text-primary">
                        {selection.selected.size} selected
                    </span>
                    <div className="h-4 w-px bg-primary/20" />
                    {bulkActions}
                    <button
                        onClick={() => selection.onSelectionChange(new Set())}
                        className="ml-auto text-sm text-muted transition hover:text-text"
                    >
                        Clear
                    </button>
                </div>
            )}

            {/* Pagination */}
            {pagination && <DataTablePagination config={pagination} />}
        </div>
    );
}

function SortIndicator({
    active,
    direction,
}: {
    active: boolean;
    direction?: "asc" | "desc";
}): JSX.Element {
    return (
        <svg
            className={clsx(
                "h-3.5 w-3.5",
                active ? "text-primary" : "text-primary/30",
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {(!active || direction === "asc") && <path d="M12 5v14" />}
            {(!active || direction === "asc") && <path d="M18 13l-6 6-6-6" />}
            {active && direction === "desc" && <path d="M12 19V5" />}
            {active && direction === "desc" && <path d="M6 11l6-6 6 6" />}
        </svg>
    );
}
