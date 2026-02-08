import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library, Plus, Trash2, Clock, MessageSquare, BookOpen, ArrowLeft, Upload, Edit3, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { getAllBooks, deleteBook, saveBook, generateBookId, type BookItem } from '@/lib/bookshelf-db';

const Bookshelf = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [books, setBooks] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBook, setEditingBook] = useState<BookItem | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCover, setEditCover] = useState<string | undefined>();
  
  // New: Action selection dialog
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);

  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    try {
      const allBooks = await getAllBooks();
      setBooks(allBooks);
    } catch (error) {
      toast({
        title: '加载失败',
        description: '无法读取书架数据',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Click on book card opens action selection
  const handleBookClick = (book: BookItem) => {
    setSelectedBook(book);
    setActionDialogOpen(true);
  };

  // Edit mode: go to main page with book data
  const handleEditMode = () => {
    if (!selectedBook) return;
    setActionDialogOpen(false);
    navigate('/', { state: { book: selectedBook } });
  };

  // Read mode: go to reader page
  const handleReadMode = () => {
    if (!selectedBook) return;
    setActionDialogOpen(false);
    navigate(`/reader/${selectedBook.id}`);
  };

  const handleEditBook = (book: BookItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBook(book);
    setEditTitle(book.title);
    setEditCover(book.cover);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingBook) return;
    try {
      const updatedBook: BookItem = {
        ...editingBook,
        title: editTitle,
        cover: editCover,
        updatedAt: Date.now(),
      };
      await saveBook(updatedBook);
      await loadBooks();
      setEditDialogOpen(false);
      toast({ title: '保存成功' });
    } catch (error) {
      toast({ title: '保存失败', variant: 'destructive' });
    }
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBookToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!bookToDelete) return;
    try {
      await deleteBook(bookToDelete);
      await loadBooks();
      toast({ title: '删除成功' });
    } catch (error) {
      toast({ title: '删除失败', variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setBookToDelete(null);
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: '图片过大', description: '请选择小于2MB的图片', variant: 'destructive' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setEditCover(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen paper-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center shadow-card">
              <Library className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold">我的书架</h1>
              <p className="text-xs text-muted-foreground">共 {books.length} 本作品</p>
            </div>
          </div>

          <Button onClick={() => navigate('/')}>
            <Plus className="w-4 h-4 mr-2" />
            导入新作品
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">加载中...</div>
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <BookOpen className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h2 className="font-display text-xl mb-2">书架空空如也</h2>
            <p className="text-muted-foreground mb-4">导入聊天记录后可以保存到书架</p>
            <Button onClick={() => navigate('/')}>
              <Plus className="w-4 h-4 mr-2" />
              开始导入
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {books.map((book) => (
              <Card
                key={book.id}
                className="group cursor-pointer hover:shadow-warm transition-all duration-300 overflow-hidden"
                onClick={() => handleBookClick(book)}
              >
                {/* Cover */}
                <div className="aspect-[3/4] bg-gradient-to-br from-primary/20 to-accent/20 relative overflow-hidden">
                  {book.cover ? (
                    <img
                      src={book.cover}
                      alt={book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="w-12 h-12 text-primary/30" />
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => handleEditBook(book, e)}
                    >
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(e) => handleDeleteClick(book.id, e)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <CardContent className="p-3">
                  <h3 className="font-display font-medium text-sm truncate mb-1">
                    {book.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {book.session.messages.length}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(book.updatedAt)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑作品</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>标题</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="输入作品标题"
              />
            </div>
            <div className="space-y-2">
              <Label>封面</Label>
              <div className="flex gap-4">
                <div className="w-24 h-32 rounded-lg border border-border overflow-hidden bg-muted flex items-center justify-center">
                  {editCover ? (
                    <img src={editCover} alt="封面" className="w-full h-full object-cover" />
                  ) : (
                    <BookOpen className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Label htmlFor="cover-upload" className="cursor-pointer">
                    <div className="flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-muted transition-colors">
                      <Upload className="w-4 h-4" />
                      上传封面
                    </div>
                    <input
                      id="cover-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCoverUpload}
                    />
                  </Label>
                  {editCover && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditCover(undefined)}
                    >
                      移除封面
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复，确定要删除这本作品吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Action Selection Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">{selectedBook?.title}</DialogTitle>
            <DialogDescription className="text-center">
              选择你想要进行的操作
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-6">
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 hover:border-primary hover:bg-primary/5"
              onClick={handleReadMode}
            >
              <Play className="w-8 h-8 text-primary" />
              <span className="font-medium">沉浸阅读</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 hover:border-primary hover:bg-primary/5"
              onClick={handleEditMode}
            >
              <Edit3 className="w-8 h-8 text-primary" />
              <span className="font-medium">编辑处理</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground flex-shrink-0">
        <p>SillyTavern 对话美化工具 · 让每一段对话都成为艺术</p>
      </footer>
    </div>
  );
};

export default Bookshelf;
