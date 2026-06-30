import clsx from "clsx";

import type { PaginationConfig } from "./types";

interface DataTablePaginationProps {
    config: PaginationConfig;
}

export function DataTablePagination({ config }: DataTablePaginationProps): JSX.Element {
    if (config.mode === "cursor") {
        return (
            <div className="flex items-center justify-between">
                <span className="text-xs text-muted">
                    {config.total != null ? `${config.total} total` : ""}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        disabled={!config.prev}
                        onClick={() => config.onPageChange(config.prev ?? undefined)}
                        className={clsx(
                            "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                            config.prev
                                ? "bg-primary/10 text-primary hover:bg-primary/20"
                                : "cursor-not-allowed text-muted opacity-50",
                        )}
                    >
                        Previous
                    </button>
                    <button
                        disabled={!config.next}
                        onClick={() => config.onPageChange(config.next ?? undefined)}
                        className={clsx(
                            "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                            config.next
                                ? "bg-primary/10 text-primary hover:bg-primary/20"
                                : "cursor-not-allowed text-muted opacity-50",
                        )}
                    >
                        Next
                    </button>
                </div>
            </div>
        );
    }

    // Offset pagination
    const totalPages =
        config.total != null ? Math.ceil(config.total / config.perPage) : undefined;
    const hasPrev = config.page > 1;
    const hasNext = config.hasMore ?? (totalPages != null ? config.page < totalPages : false);

    return (
        <div className="flex items-center justify-between">
            <span className="text-xs text-muted">
                {config.total != null
                    ? `Page ${config.page} of ${totalPages} · ${config.total} total`
                    : `Page ${config.page}`}
            </span>
            <div className="flex items-center gap-2">
                <button
                    disabled={!hasPrev}
                    onClick={() => config.onPageChange(config.page - 1)}
                    className={clsx(
                        "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                        hasPrev
                            ? "bg-primary/10 text-primary hover:bg-primary/20"
                            : "cursor-not-allowed text-muted opacity-50",
                    )}
                >
                    Previous
                </button>
                <button
                    disabled={!hasNext}
                    onClick={() => config.onPageChange(config.page + 1)}
                    className={clsx(
                        "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                        hasNext
                            ? "bg-primary/10 text-primary hover:bg-primary/20"
                            : "cursor-not-allowed text-muted opacity-50",
                    )}
                >
                    Next
                </button>
            </div>
        </div>
    );
}
