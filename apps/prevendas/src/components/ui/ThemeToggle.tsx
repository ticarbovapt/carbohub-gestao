import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-9 w-9 lg:h-10 lg:w-10"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 lg:h-5 lg:w-5 text-warning" />
          ) : (
            <Moon className="h-4 w-4 lg:h-5 lg:w-5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
      </TooltipContent>
    </Tooltip>
  );
}
