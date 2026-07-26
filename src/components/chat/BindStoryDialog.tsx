/**
 * 「绑定到角色」选择框（定稿第六章）：未绑定聊天随时绑定角色卡，原地升级为故事工作区。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAllCharacters } from '@/lib/archive-db';
import type { ArchiveCharacter } from '@/types/archive';

interface BindStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 选中角色后执行绑定（父组件负责建故事+跳转） */
  onSelect: (character: ArchiveCharacter) => void;
}

export function BindStoryDialog({ open, onOpenChange, onSelect }: BindStoryDialogProps) {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<ArchiveCharacter[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    getAllCharacters().then((list) => {
      setCharacters(list.sort((a, b) => b.updatedAt - a.updatedAt));
      setLoaded(true);
    });
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q ? characters.filter((c) => c.name.toLowerCase().includes(q)) : characters;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">绑定到角色</DialogTitle>
          <DialogDescription>
            这份聊天记录会成为所选角色名下的归档故事，章节标记、收藏和已生成的总结/故事树一并带走。
          </DialogDescription>
        </DialogHeader>

        {loaded && characters.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <Users className="w-10 h-10 mx-auto text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">角色库还是空的，先导入一张角色卡</p>
            <Button size="sm" onClick={() => navigate('/library')}>去角色库</Button>
          </div>
        ) : (
          <>
            {characters.length > 6 && (
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索角色名"
                className="h-8"
              />
            )}
            <ScrollArea className="flex-1 min-h-0 max-h-96 -mx-1 px-1">
              <div className="space-y-1 py-1">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { onOpenChange(false); onSelect(c); }}
                    className="w-full flex items-center gap-3 rounded-md p-2 text-left hover:bg-accent transition-colors"
                  >
                    <div className="w-9 h-[54px] shrink-0 rounded overflow-hidden bg-muted border border-border">
                      {c.pngBase64 ? (
                        <img
                          src={`data:image/png;base64,${c.pngBase64}`}
                          alt={c.name}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="w-4 h-4 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      {c.subtitle && <p className="text-xs text-muted-foreground truncate">{c.subtitle}</p>}
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">没有匹配的角色</p>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
