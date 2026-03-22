import { useState, useEffect } from "react";
import { Music, Mic, BarChart3, MessageCircle, Calendar, Home } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "My Songs", url: "/songs", icon: Music },
  { title: "Practice", url: "/practice", icon: Mic },
  { title: "Progress", url: "/progress", icon: BarChart3 },
  { title: "Coach", url: "/coach", icon: MessageCircle },
];

function useHashPath() {
  const [path, setPath] = useState(window.location.hash.replace('#', '') || '/');
  useEffect(() => {
    const handler = () => setPath(window.location.hash.replace('#', '') || '/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return path;
}

export function AppSidebar() {
  const location = useHashPath();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <a href="#/" className="flex items-center gap-2">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-label="VocalCoach Logo">
            <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" />
            <path d="M10 20 C10 12, 16 8, 16 8 C16 8, 22 12, 22 20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="16" cy="14" r="2" fill="currentColor" />
            <path d="M12 22 L20 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="font-semibold text-base" data-testid="text-logo">VocalCoach</span>
        </a>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={location === item.url || (item.url !== "/" && location.startsWith(item.url))}
                  >
                    <a href={`#${item.url}`} data-testid={`link-${item.title.toLowerCase()}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <a
          href="https://www.perplexity.ai/computer"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground"
        >
          Created with Perplexity Computer
        </a>
      </SidebarFooter>
    </Sidebar>
  );
}
