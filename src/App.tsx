import { useStore } from "@/state/store";
import { LibraryPage } from "@/features/library/LibraryPage";
import { DesignerPage } from "@/features/designer/DesignerPage";
import { StatesShowcase } from "@/features/states/StatesShowcase";

export default function App() {
  const view = useStore((s) => s.route.view);
  if (view === "designer") return <DesignerPage />;
  if (view === "states") return <StatesShowcase />;
  return <LibraryPage />;
}
