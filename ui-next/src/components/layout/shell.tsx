import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useGateway } from "@/hooks/use-gateway";

const PAGE_TITLES: Record<string, string> = {
  "/chat": "Chat",
  "/overview": "Overview",
  "/channels": "Channels",
  "/instances": "Instances",
  "/sessions": "Sessions",
  "/cron": "Cron Jobs",
  "/agents": "Agents",
  "/skills": "Skills",
  "/nodes": "Nodes",
  "/config": "Config",
  "/debug": "Debug",
  "/logs": "Logs",
};

export function Shell() {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? "Operator";

  // Connect to gateway on mount — store is updated globally via Zustand
  useGateway();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
