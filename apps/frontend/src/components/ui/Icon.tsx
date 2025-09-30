import clsx from "clsx";

import moonIcon from "@/assets/icons/moon.svg";
import sunIcon from "@/assets/icons/sun.svg";

export type IconName = "sun" | "moon";

const ICON_MAP: Record<IconName, string> = {
  sun: sunIcon,
  moon: moonIcon,
};

interface IconProps {
  name: IconName;
  className?: string;
  alt?: string;
}

export function Icon({ name, className, alt }: IconProps): JSX.Element {
  return <img src={ICON_MAP[name]} alt={alt ?? name} className={clsx("inline-block", className)} />;
}
