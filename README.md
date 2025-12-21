# ST 对话美化器 v0.2

SillyTavern Chat Beautifier - 将 SillyTavern 的聊天记录转换为精美格式，支持编辑和导出。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/LYC619/silly-tavern-explorer)

> 🔒 **隐私安全**：所有数据完全保存在本地浏览器，不会上传到任何服务器。

## ✨ 功能特性

### 导入与解析
- 支持导入 SillyTavern 导出的 JSON/JSONL 聊天记录
- 自动识别角色名称和用户名称
- 内置正则规则，自动移除思维链、状态栏等元数据

### 消息编辑
- 点击编辑单条消息内容
- 修改说话人名称和角色类型
- 删除不需要的消息

### 主题风格
- **典雅书籍** - 装饰边框，古典排版
- **小说排版** - 经典引号，文学风格
- **社交气泡** - 现代聊天界面
- **极简主义** - 清爽干净

### 章节标记
- 单条消息点击添加章节标记
- 批量导入章节（支持【存档节点】格式）
- 自动解析卷名、章节编号、概要和事件
- 章节编号自动转换为"第一章"格式

### 导出选项
- 导出为 JSONL（SillyTavern 兼容格式，可直接导入继续游玩）
- 导出为 TXT 纯文本（适配 Markdown 处理器）
- 正则清理后导出，移除思维链等杂项内容

### 正则处理
- 内置常用清理规则（思维链、Theatre标签、状态栏等）
- 支持自定义正则规则
- 可按用户/助手消息分别应用

## 🚀 快速开始

1. 打开应用
2. 导入 SillyTavern 聊天记录（JSON/JSONL）
3. （可选）点击"编辑内容"修改消息
4. 调整主题和设置
5. （可选）添加章节标记
6. 导出为 JSONL 或 TXT

## 📝 批量导入章节格式

支持以下格式的章节总结文本：

```markdown
### 存档节点：第一卷 - 初遇

#### 【本卷概要】

描述本卷的主要剧情...

#### 【关键事件索引】

- **初次相遇**: 描述事件的起因、经过和结果...
- **命运转折**: 另一个重要事件的描述...
```

## 🛠️ 技术栈

- React 18 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui

## 📦 部署方式

### Vercel 一键部署

点击上方按钮或访问：

```
https://vercel.com/new/clone?repository-url=https://github.com/LYC619/silly-tavern-explorer
```

### Docker 部署

```sh
# 构建镜像
docker build -t st-chat-beautifier .

# 运行容器
docker run -d -p 8080:80 st-chat-beautifier
```

访问 `http://localhost:8080` 即可使用。

### 本地开发

```sh
# 克隆仓库
git clone https://github.com/LYC619/silly-tavern-explorer.git

# 进入项目目录
cd silly-tavern-explorer

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 📄 License

MIT

---

## 📜 版本更新记录

### v0.2 (2024-12)

**新增功能：**
- ✨ 消息编辑功能：可点击编辑单条消息内容、说话人和角色类型
- ✨ 消息删除功能：支持删除不需要的消息
- ✨ JSONL 导出：导出为 SillyTavern 兼容格式，应用正则清理后可直接导入继续游玩
- ✨ 统一导出菜单：TXT 和 JSONL 导出整合到一个下拉菜单

**优化调整：**
- 🔄 移除图片导出功能（PNG/JPEG），因长对话不适配
- 🔄 "批量导入"按钮更名为"导入总结"
- 🔄 编辑模式互斥：编辑内容、章节标记、导入总结三种模式自动切换

### v0.1 (2024-12)

**初始版本：**
- 📥 支持导入 SillyTavern JSON/JSONL 聊天记录
- 🎨 四种主题风格：典雅书籍、小说排版、社交气泡、极简主义
- 📑 章节标记功能：单条添加和批量导入
- 📤 导出为 PNG/JPEG 图片和 TXT 文本
- 🔧 内置正则规则：自动清理思维链、状态栏等元数据
- ➕ 支持自定义正则规则
