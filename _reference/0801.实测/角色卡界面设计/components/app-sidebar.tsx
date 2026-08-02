"use client"

import {
  Compass,
  House,
  Library,
  MessageSquare,
  Package,
  Puzzle,
  Settings,
  UserRound,
} from "lucide-react"
import { cn } from "@/lib/utils"

const items = [
  { id: "home", label: "首页", icon: House },
  { id: "explore", label: "探索", icon: Compass },
  { id: "library", label: "角色库", icon: Library },
  { id: "chat", label: "聊天", icon: MessageSquare },
  { id: "assets", label: "资产", icon: Package, badge: 4 },
  { id: "plugins", label: "插件", icon: Puzzle },
  { id: "settings", label: "设置", icon: Settings },
  { id: "me", label: "我", icon: UserRound },
]

export function AppSidebar() {
  const active = "library"

  return (
    <nav
      aria-label="主导航"
      className="flex w-20 shrink-0 flex-col items-center gap-6 border-r border-border/70 bg-sidebar px-2 py-6"
    >
      <div className="px-1 text-center font-serif text-[13px] leading-tight font-medium text-sidebar-foreground">
        SillyTavern
        <br />
        Explorer 2.0
      </div>

      <ul className="flex w-full flex-col items-center gap-1">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = item.id === active
          return (
            <li key={item.id} className="w-full">
              <button
                type="button"
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-[11px] transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn("size-5", isActive && "text-primary")}
                    strokeWidth={isActive ? 2 : 1.6}
                  />
                  {item.badge ? (
                    <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                <span className={cn(isActive && "font-medium")}>{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
