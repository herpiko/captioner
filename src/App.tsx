import { useEffect } from "react";
import { Toolbar } from "./components/Toolbar";
import { Preview } from "./components/Preview";
import { Transport } from "./components/Transport";
import { Timeline } from "./components/Timeline";
import { CaptionPanel } from "./components/CaptionPanel";
import { ExportOverlay } from "./components/ExportOverlay";
import { useShortcuts } from "./hooks/useShortcuts";
import { useStore } from "./store";

export default function App() {
  useShortcuts();
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return (
    <div className="h-full flex flex-col">
      <Toolbar />
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <Preview />
          <Transport />
        </div>
        <CaptionPanel />
      </div>
      <Timeline />
      <ExportOverlay />
    </div>
  );
}
