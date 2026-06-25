import { ThemeToggle } from "../ThemeToggle";
import { ThemeProvider } from "../ThemeProvider";

export default function ThemeToggleExample() {
  return (
    <ThemeProvider>
      <div className="p-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Theme Toggle</h3>
            <p className="text-sm text-muted-foreground">Click to switch between light and dark mode</p>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </ThemeProvider>
  );
}
