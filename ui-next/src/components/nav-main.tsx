import { ChevronRight, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  subtitle?: string;
  items?: NavItem[];
};

export function NavMain({
  label,
  items,
  defaultOpen: _defaultOpen,
}: {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}) {
  const location = useLocation();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) =>
          item.items && item.items.length > 0 ? (
            <CollapsibleNavItem key={item.url} item={item} location={location.pathname} />
          ) : (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                isActive={location.pathname === item.url}
              >
                <NavLink to={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ),
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function CollapsibleNavItem({ item, location }: { item: NavItem; location: string }) {
  const isParentActive = location === item.url;
  const isChildActive = item.items?.some((sub) => location === sub.url) ?? false;
  const [open, setOpen] = useState(isChildActive);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={item.title}
        isActive={isParentActive}
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer"
      >
        <NavLink
          to={item.url}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">{item.title}</span>
        </NavLink>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-90",
          )}
        />
      </SidebarMenuButton>

      {open && item.items && (
        <SidebarMenuSub>
          {item.items.map((sub) => (
            <SidebarMenuSubItem key={sub.url}>
              <SidebarMenuSubButton asChild isActive={location === sub.url}>
                <NavLink to={sub.url} className="flex items-center gap-2">
                  <sub.icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{sub.title}</span>
                </NavLink>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}
