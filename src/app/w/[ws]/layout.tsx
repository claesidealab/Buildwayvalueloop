import type { ReactNode } from "react";
import { WorkspaceProvider } from "@/lib/store";
import { Shell } from "@/components/Shell";
import { StrategyProvider } from "@/lib/strategy-store";

export default async function WorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  return (
    <WorkspaceProvider slug={ws}>
      <StrategyProvider>
        <Shell>{children}</Shell>
      </StrategyProvider>
    </WorkspaceProvider>
  );
}
