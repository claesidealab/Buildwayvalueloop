import type { ReactNode } from "react";
import { StrategyProvider } from "@/lib/strategy-store";

export default function StrategyLayout({ children }: { children: ReactNode }) {
  return <StrategyProvider>{children}</StrategyProvider>;
}
