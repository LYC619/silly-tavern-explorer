import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBook, type BookItem } from '@/lib/bookshelf-db';
import { DEFAULT_REGEX_RULES, type RegexRule } from '@/types/chat';
import ReaderView from '@/components/reader/ReaderView';

const REGEX_STORAGE_KEY = 'st-beautifier-regex-rules';

const Reader = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<BookItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regexRules, setRegexRules] = useState<RegexRule[]>([]);

  // Load regex rules from localStorage
  useEffect(() => {
    const savedRules = localStorage.getItem(REGEX_STORAGE_KEY);
    if (savedRules) {
      try {
        const parsed = JSON.parse(savedRules);
        // Merge with defaults
        const mergedRules = DEFAULT_REGEX_RULES.map(defaultRule => {
          const saved = parsed.find((r: RegexRule) => r.id === defaultRule.id);
          return saved ? { ...defaultRule, disabled: saved.disabled } : defaultRule;
        });
        // Add custom rules
        const customRules = parsed.filter((r: RegexRule) => !r.id.startsWith('builtin-'));
        setRegexRules([...mergedRules, ...customRules]);
      } catch {
        setRegexRules(DEFAULT_REGEX_RULES);
      }
    } else {
      setRegexRules(DEFAULT_REGEX_RULES);
    }
  }, []);

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
    navigate('/bookshelf');
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
    />
  );
};

export default Reader;
