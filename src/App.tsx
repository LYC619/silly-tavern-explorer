import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { VaultGate } from "@/components/vault/VaultGate";

// 路由级代码分割：每个页面单独打包，首屏只加载首页所需 chunk，
// 其余页面(世界书/AI工具等)按需懒加载，避免全部塞进一个大 bundle。
const Home = lazy(() => import("./pages/Home"));
const Index = lazy(() => import("./pages/Index"));
const Tools = lazy(() => import("./pages/Tools"));
const Library = lazy(() => import("./pages/Library"));
const CharacterPage = lazy(() => import("./pages/CharacterPage"));
const StoryWorkspace = lazy(() => import("./pages/StoryWorkspace"));
const AITools = lazy(() => import("./pages/AITools"));
const WorldBook = lazy(() => import("./pages/WorldBook"));
const CardViewer = lazy(() => import("./pages/CardViewer"));
const Preset = lazy(() => import("./pages/Preset"));
const RegexTool = lazy(() => import("./pages/RegexTool"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PageFallback = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
  </div>
);

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <VaultGate>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/library" element={<Library />} />
            <Route path="/character/:id" element={<CharacterPage />} />
            <Route path="/story/:id" element={<StoryWorkspace />} />
            {/* 处理区（2.0 阶段5）：入口页 + 各工具；聊天处理从 "/" 移到 /chat */}
            <Route path="/tools" element={<Tools />} />
            <Route path="/chat" element={<Index />} />
            <Route path="/worldbook" element={<WorldBook />} />
            <Route path="/card-viewer" element={<CardViewer />} />
            <Route path="/preset" element={<Preset />} />
            <Route path="/regex" element={<RegexTool />} />
            {/* /summary /story-tree 已并入故事工作区（阶段3）；/bookshelf /reader 已随书架退役删除（阶段5） */}
            <Route path="/ai-tools" element={<AITools />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      </VaultGate>
    </TooltipProvider>
  </ThemeProvider>
);

export default App;
