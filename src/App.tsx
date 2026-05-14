import { Toolbar } from "./components/Toolbar";
import { Preview } from "./components/Preview";
import { Timeline } from "./components/Timeline";
import { CaptionPanel } from "./components/CaptionPanel";
import { ExportOverlay } from "./components/ExportOverlay";
import { useShortcuts } from "./hooks/useShortcuts";

export default function App() {
  useShortcuts();
  return (
    <div className="h-full flex flex-col">
      <Toolbar />
      <div className="flex-1 flex min-h-0">
        <Preview />
        <CaptionPanel />
      </div>
      <Timeline />
      <ExportOverlay />
    </div>
  );
}
