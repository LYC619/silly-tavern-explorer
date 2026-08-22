import { Download, ExternalLink, MoreVertical, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface CharacterActionsMenuProps {
  onOpen: () => void;
  onExport: () => void;
  onDelete: () => void;
  /** 触发按钮的类名：卡面上是悬浮圆钮，列表行里是方钮 */
  triggerClassName: string;
  iconClassName?: string;
}

/**
 * 角色卡的三项操作菜单（打开主页 / 导出 / 删除）。
 * 网格卡与列表行原先是两份逐字符相同的手抄，改一处必漏另一处。
 */
export function CharacterActionsMenu({
  onOpen, onExport, onDelete, triggerClassName, iconClassName,
}: CharacterActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button aria-label="更多操作" className={triggerClassName}>
          <MoreVertical className={cn('w-3.5 h-3.5', iconClassName)} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onOpen}>
          <ExternalLink className="w-3.5 h-3.5 mr-2" />
          打开角色主页
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport}>
          <Download className="w-3.5 h-3.5 mr-2" />
          导出角色卡
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5 mr-2" />
          删除角色
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
