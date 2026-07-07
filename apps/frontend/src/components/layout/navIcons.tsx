import type { SVGProps } from "react";

type IconComponent = (props: SVGProps<SVGSVGElement>) => JSX.Element;

function createIcon(d: string): IconComponent {
    return function NavIcon(props: SVGProps<SVGSVGElement>) {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                width={20}
                height={20}
                {...props}
            >
                <path d={d} />
            </svg>
        );
    };
}

function createMultiPathIcon(...paths: string[]): IconComponent {
    return function NavIcon(props: SVGProps<SVGSVGElement>) {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                width={20}
                height={20}
                {...props}
            >
                {paths.map((d, i) => (
                    <path key={i} d={d} />
                ))}
            </svg>
        );
    };
}

export const navIcons: Record<string, IconComponent> = {
    dashboard: createMultiPathIcon(
        "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
        "M9 22V12h6v10",
    ),
    inventory: createMultiPathIcon(
        "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
        "M3.27 6.96 12 12.01l8.73-5.05",
        "M12 22.08V12",
    ),
    monitoring: createMultiPathIcon(
        "M22 12h-4l-3 9L9 3l-3 9H2",
    ),
    operations: createMultiPathIcon(
        "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
    ),
    compliance: createMultiPathIcon(
        "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    ),
    lifecycle: createMultiPathIcon(
        "M12 2v4",
        "M12 18v4",
        "M4.93 4.93l2.83 2.83",
        "M16.24 16.24l2.83 2.83",
        "M2 12h4",
        "M18 12h4",
        "M4.93 19.07l2.83-2.83",
        "M16.24 7.76l2.83-2.83",
    ),
    admin: createMultiPathIcon(
        "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
        "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    ),
    charts: createMultiPathIcon(
        "M18 20V10",
        "M12 20V4",
        "M6 20v-6",
    ),
    chevronDown: createIcon("M6 9l6 6 6-6"),
    chevronLeft: createIcon("M15 18l-6-6 6-6"),
    chevronRight: createIcon("M9 18l6-6-6-6"),
};
