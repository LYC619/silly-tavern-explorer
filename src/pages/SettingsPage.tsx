/**
 * 设置页（2.0 阶段9.9）：客户端化后从顶栏侧边弹窗升级为独立页面。
 * ① AI 配置（原 /ai-tools 迁入：本应用调 AI 用的提供商管理，密钥仅存本地/客户端镜像系统配置目录）
 * ② 数据与存储（原 GlobalSettings 弹窗内容：存储概览/备份恢复/清理/引导/关于）
 * 「其他资产」区将来放的是用户 ST 侧的 AI 配置概念，与这里的应用自身配置分开。
 */
import { Settings, KeyRound } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { HelpCard } from '@/components/HelpCard';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { APIConfigCard } from '@/components/ai-tools';
import { GlobalSettingsPanel } from '@/components/GlobalSettings';
import { RuntimeSettingsPanel } from '@/components/settings/RuntimeSettingsPanel';

const SettingsPage = () => (
  <AppLayout
    leftActions={
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-primary" />
        <span className="font-display font-semibold">设置</span>
      </div>
    }
  >
    <div className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
      {/* ① AI 配置 */}
      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <KeyRound className="w-4 h-4 text-primary" />
          <h2 className="font-display text-base font-semibold">AI 配置</h2>
          <HelpCard>
            全应用的 AI 能力（总结、故事树、AI 简介/评分、小说润色等）都从这里读取配置。支持保存多个提供商（OpenAI 兼容格式）并随时切换，可拉取模型列表、测试连通。密钥仅保存在本地（客户端另镜像到系统配置目录，不进库文件夹）。
          </HelpCard>
        </div>
        <div data-tour="ai-config">
          <APIConfigCard />
        </div>
      </section>

      <Separator />

      {/* ② 本地与客户端 */}
      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold">本地与客户端</h2>
        <RuntimeSettingsPanel />
      </section>

      <Separator />

      {/* ③ 数据与存储 */}
      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold">数据与存储</h2>
        <Card>
          <CardContent className="py-5">
            <GlobalSettingsPanel />
          </CardContent>
        </Card>
      </section>
    </div>
  </AppLayout>
);

export default SettingsPage;
