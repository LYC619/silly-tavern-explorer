import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { VaultGate } from "@/components/vault/VaultGate";
import { MigrationNotice } from "@/components/MigrationNotice";
import { ThemeSync } from "@/components/ThemeSync";
import { THEME_KEYS, DEFAULT_THEME } from "@/lib/theme";

// 路由级代码分割：每个页面单独打包，首屏只加载首页所需 chunk。
// loader 表单独列出：首屏渲染后空闲时预热全部 chunk（10.1-A7 切换卡顿专项——
// 消除首次切页的 Suspense 白屏，本地静态资源预热成本可忽略）。
const PAGE_LOADERS = {
  home: () => import("./pages/Home"),
  index: () => import("./pages/Index"),
  tools: () => import("./pages/Tools"),
  library: () => import("./pages/Library"),
  character: () => import("./pages/CharacterPage"),
  story: () => import("./pages/StoryWorkspace"),
  settings: () => import("./pages/SettingsPage"),
  worldbook: () => import("./pages/WorldBook"),
  assets: () => import("./pages/AssetLibrary"),
  cardViewer: () => import("./pages/CardViewer"),
  preset: () => import("./pages/Preset"),
  regex: () => import("./pages/RegexTool"),
  notFound: () => import("./pages/NotFound"),
};

const Home = lazy(PAGE_LOADERS.home);
const Index = lazy(PAGE_LOADERS.index);
const Tools = lazy(PAGE_LOADERS.tools);
const Library = lazy(PAGE_LOADERS.library);
const CharacterPage = lazy(PAGE_LOADERS.character);
const StoryWorkspace = lazy(PAGE_LOADERS.story);
const SettingsPage = lazy(PAGE_LOADERS.settings);
const WorldBook = lazy(PAGE_LOADERS.worldbook);
const AssetLibrary = lazy(PAGE_LOADERS.assets);
const CardViewer = lazy(PAGE_LOADERS.cardViewer);
const Preset = lazy(PAGE_LOADERS.preset);
const RegexTool = lazy(PAGE_LOADERS.regex);
const NotFound = lazy(PAGE_LOADERS.notFound);

/** 空闲时预热全部页面 chunk（失败静默：预热失败不影响正常懒加载兜底） */
function usePrefetchPages() {
  useEffect(() => {
    const prefetch = () => {
      for (const load of Object.values(PAGE_LOADERS)) load().catch(() => {});
    };
    const idle = (window as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(prefetch);
    else {
      const t = setTimeout(prefetch, 1500);
      return () => clearTimeout(t);
    }
  }, []);
}

const PageFallback = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
  </div>
);

const App = () => {
  usePrefetchPages();
  return (
  <ThemeProvider
    attribute="data-theme"
    themes={[...THEME_KEYS]}
    defaultTheme={DEFAULT_THEME}
    enableSystem={false}
    storageKey="ste-theme"
  >
    <ThemeSync />
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <VaultGate>
      <MigrationNotice>
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
            <Route path="/assets" element={<AssetLibrary />} />
            <Route path="/worldbook" element={<WorldBook />} />
            <Route path="/card-viewer" element={<CardViewer />} />
            <Route path="/preset" element={<Preset />} />
            <Route path="/regex" element={<RegexTool />} />
            {/* /summary /story-tree 已并入故事工作区（阶段3）；/bookshelf /reader 已随书架退役删除（阶段5） */}
            <Route path="/settings" element={<SettingsPage />} />
            {/* 阶段9.9：AI 配置迁入设置页，旧路径重定向兜底 */}
            <Route path="/ai-tools" element={<Navigate to="/settings" replace />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </MigrationNotice>
      </VaultGate>
    </TooltipProvider>
  </ThemeProvider>
  );
};

export default App;
