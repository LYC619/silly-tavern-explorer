import { IdCard } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { HelpCard } from '@/components/HelpCard';
import { CharacterCardViewer } from '@/components/CharacterCardViewer';

export default function CardViewer() {
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center shadow-card">
            <IdCard className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-display font-semibold flex items-center gap-2">
              角色卡查看
              <HelpCard>
                拖入 SillyTavern 角色卡（PNG 或 JSON，支持 V1/V2/V3），只读查看其全部字段：描述、性格、场景、开场白、备选问候、对话示例、系统提示，以及内嵌世界书。本页仅供查看与核对，不修改文件、不写卡。
              </HelpCard>
            </h1>
            <p className="text-sm text-muted-foreground">解析并查看角色卡内容（只读）</p>
          </div>
        </div>
        <CharacterCardViewer />
      </div>
    </AppLayout>
  );
}
