import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// 路由级代码分割：每个页面单独打包，首屏只加载首页所需 chunk，
// 其余页面(世界书/AI工具/阅读器等)按需懒加载，避免全部塞进一个大 bundle。
const Index = lazy(() => import("./pages/Index"));
const Bookshelf = lazy(() => import("./pages/Bookshelf"));
const Summary = lazy(() => import("./pages/Summary"));
const AITools = lazy(() => import("./pages/AITools"));
const Reader = lazy(() => import("./pages/Reader"));
const WorldBook = lazy(() => import("./pages/WorldBook"));
const CardViewer = lazy(() => import("./pages/CardViewer"));
const Preset = lazy(() => import("./pages/Preset"));
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
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/summary" element={<Summary />} />
            <Route path="/bookshelf" element={<Bookshelf />} />
            <Route path="/ai-tools" element={<AITools />} />
            <Route path="/worldbook" element={<WorldBook />} />
            <Route path="/card-viewer" element={<CardViewer />} />
            <Route path="/preset" element={<Preset />} />
            <Route path="/reader/:id" element={<Reader />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </ThemeProvider>
);

export default App;
