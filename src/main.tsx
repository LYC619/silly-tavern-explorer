import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "./lib/register-sw";

// PWA：注册 Service Worker，并在有新版本时提示刷新（详见 register-sw.ts）
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
