import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBook, type BookItem } from '@/lib/bookshelf-db';
import { getArchiveStory } from '@/lib/archive-db';
import { type RegexRule } from '@/types/chat';
import { getInitialRegexRules } from '@/lib/session-storage';
import ReaderView from '@/components/reader/ReaderView';

const Reader = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<BookItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regexRules, setRegexRules] = useState<RegexRule[]>([]);
  // 关闭时的返回目标：书架条目回书架；归档故事回所属角色页（2.0 阶段1）
  const [closeTarget, setCloseTarget] = useState('/bookshelf');

  // Load book data
  useEffect(() => {
    const loadBook = async () => {
      if (!id) {
        setError('未指定作品ID');
        setLoading(false);
        return;
      }

      try {
        const bookData = await getBook(id);
        if (bookData) {
          setBook(bookData);
          // 优先使用这本书保存时的正则规则（用户当时的自定义规则），
          // 没有则回退到全局的当前规则集。不再读早已废弃、从未写入的 key。
          setRegexRules(bookData.settings?.regexRules ?? getInitialRegexRules());
          setLoading(false);
          return;
        }
        // 2.0 归档故事回退：与 BookItem 共享 session/markers/settings 形状，直接适配
        const story = await getArchiveStory(id);
        if (story) {
          setBook({
            id: story.id,
            title: story.title,
            session: story.session,
            markers: story.markers,
            settings: story.settings,
            favorites: story.favorites,
            createdAt: story.createdAt,
            updatedAt: story.updatedAt,
          });
          setRegexRules(story.settings?.regexRules ?? getInitialRegexRules());
          setCloseTarget(story.characterId ? `/character/${story.characterId}` : '/library');
        } else {
          setError('找不到该作品');
        }
      } catch (err) {
        setError('加载作品失败');
      } finally {
        setLoading(false);
      }
    };

    loadBook();
  }, [id]);

  const handleClose = () => {
    navigate(closeTarget);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <BookOpen className="w-16 h-16 text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">{error || '未知错误'}</p>
        <Button onClick={() => navigate('/bookshelf')}>返回书架</Button>
      </div>
    );
  }

  return (
    <ReaderView
      messages={book.session.messages}
      markers={book.markers}
      regexRules={regexRules}
      characterName={book.session.character.name}
      userName={book.session.user.name}
      onClose={handleClose}
      bookId={id}
    />
  );
};

export default Reader;
