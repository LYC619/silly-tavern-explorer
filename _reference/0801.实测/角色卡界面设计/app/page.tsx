import { AppSidebar } from "@/components/app-sidebar"
import { CharacterDetail } from "@/components/character-detail"
import { StatusBar } from "@/components/status-bar"

export default function Page() {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        <AppSidebar />
        <CharacterDetail />
      </div>
      <StatusBar />
    </div>
  )
}
