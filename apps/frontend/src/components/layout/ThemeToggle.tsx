import { useCallback } from "react";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle(): JSX.Element {
  const { theme, toggleTheme } = useTheme();

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  const handleClick = useCallback(() => {
    toggleTheme();
  }, [toggleTheme]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      onClick={handleClick}
      className="rounded-full bg-surface text-primary transition hover:bg-primary/10 hover:text-primary"
    >
      <Icon name={theme === "dark" ? "moon" : "sun"} className="h-5 w-5" />
    </Button>
  );
}
