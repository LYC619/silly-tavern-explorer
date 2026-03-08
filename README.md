# ST 聊天记录处理器 v0.6

SillyTavern Chat Beautifier - 将 SillyTavern 的聊天记录转换为精美格式，支持编辑、书架管理和 AI 辅助功能。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/LYC619/silly-tavern-explorer)

> 🔒 **隐私安全**：所有数据完全保存在本地浏览器，不会上传到任何服务器。

## ✨ 功能特性

### 📥 导入与解析
- 支持导入 SillyTavern 导出的 JSON/JSONL 聊天记录
- 自动识别角色名称和用户名称
- 内置正则规则，自动移除思维链、状态栏等元数据

### ✏️ 消息编辑
- 点击编辑单条消息内容
- 修改说话人名称和角色类型
- 删除不需要的消息

### 🎨 主题风格
- **典雅书籍** - 装饰边框，古典排版
- **小说排版** - 经典引号，文学风格
- **社交气泡** - 现代聊天界面
- **极简主义** - 清爽干净

### 📑 章节标记
- 单条消息点击添加章节标记
- 批量导入章节（支持【存档节点】格式）
- 自动解析卷名、章节编号、概要和事件
- 章节编号自动转换为"第一章"格式

### 📤 导出选项
- 导出弹窗：统一配置导出范围和清理选项
- 导出为 JSONL（SillyTavern 兼容格式，可直接导入继续游玩）
- 导出为 TXT 纯文本（适配 Markdown 处理器）
- 正则清理后导出，移除思维链等杂项内容
- 自动清空 swipes 冗余数据，文件体积减少 40-50%
- 可选清理插件缓存（LWB 快照等），进一步精简
- 消息范围导出：全部 / 最近N条 / 自定义楼层范围
- 实时导出统计：显示原始大小、预估大小和节省比例

### 🔧 正则处理
- 独立侧边栏：编辑规则时可实时预览效果
- 傻瓜式快速添加：输入开始/结束标签自动生成正则
- 内置常用清理规则（思维链、Theatre标签、状态栏等）
- 支持自定义正则规则
- 规则配置自动保存到浏览器
- 可按用户/助手消息分别应用

### 📚 书架功能
- 将处理后的聊天记录保存到本地书架
- 支持自定义封面图片
- 作品管理：编辑标题、删除作品
- 使用 IndexedDB 存储，支持大量数据

### 📖 沉浸式阅读
- 点击书架作品可选择「沉浸阅读」或「编辑处理」
- 小说风格阅读界面，纸张质感背景
- 手机端滑动翻页，桌面端点击/键盘翻页
- 可调节字体大小
- 阅读进度条，支持日间/夜间模式

### 🌙 界面与体验
- 日间/夜间模式切换
- 导航时自动保存工作状态（不会丢失进度）
- 设置自动持久化到浏览器
- 响应式设计，完美适配手机/平板/桌面

### 🤖 AI 工具箱
- **生成正则**：粘贴文本示例，AI 自动生成匹配规则
- **智能分卷**：分析聊天内容，建议章节分割点
- **生成标题**：根据内容摘要生成有吸引力的标题
- 支持自定义 API 接口地址（兼容 OpenAI 格式）
- 支持自定义模型名称
- API 密钥仅保存在本地浏览器

## 🚀 快速开始

### 在线使用

访问部署好的网站即可直接使用。

### 本地一键启动

本项目提供一键启动脚本，无需复杂配置：

#### Windows 用户
1. 确保已安装 [Node.js](https://nodejs.org/)（推荐 v18+）
2. 双击 `start.bat` 或在 PowerShell 中运行 `.\start.ps1`
3. 浏览器会自动打开 `http://localhost:4173`

#### Mac/Linux 用户
1. 确保已安装 [Node.js](https://nodejs.org/)（推荐 v18+）
2. 打开终端，进入项目目录
3. 运行 `chmod +x start.sh && ./start.sh`
4. 浏览器访问 `http://localhost:4173`

### 使用流程

1. 打开应用
2. 导入 SillyTavern 聊天记录（JSON/JSONL）
3. （可选）点击"编辑内容"修改消息
4. 调整主题和设置
5. （可选）添加章节标记
6. （可选）保存到书架
7. 导出为 JSONL 或 TXT

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

## 🤖 AI 工具使用说明

1. 进入"AI 工具"页面
2. 配置 API Key（支持 OpenAI 及兼容接口）
3. （可选）展开高级设置，自定义接口地址和模型
4. 选择需要的工具，粘贴内容后点击生成
5. 复制结果到相应位置使用

**支持的 API 格式：**
- OpenAI 官方 API
- 各类 OpenAI 兼容中转站
- 本地部署的兼容模型（如 Ollama + OpenAI 兼容层）

## 🛠️ 技术栈

- React 18 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- IndexedDB（本地存储）

## 🚀 快速试用

### 极简单文件版

无需部署，下载即用！适合快速体验基础功能：

1. 下载 [`minimal.html`](./public/minimal.html) 文件
2. 双击用浏览器打开
3. 导入聊天记录即可使用

> 极简版包含：导入 JSON/JSONL、正则清理、导出 TXT/JSONL。完整版还支持多种主题、章节标记、书架管理、AI 工具等。

## 📦 部署方式

### Vercel（推荐）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/LYC619/silly-tavern-explorer)

点击按钮一键部署，无需配置。

### Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/LYC619/silly-tavern-explorer)

或手动部署：
1. Fork 仓库到自己的 GitHub
2. 在 Netlify 中连接仓库
3. 构建命令：`npm run build`，发布目录：`dist`

### Cloudflare Pages

1. Fork 仓库到自己的 GitHub
2. 在 Cloudflare Dashboard 中选择 Pages → 创建项目
3. 连接 GitHub 仓库
4. 构建设置：命令 `npm run build`，输出目录 `dist`

### GitHub Pages

1. Fork 仓库
2. 进入 Settings → Pages
3. Source 选择 GitHub Actions
4. 创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci && npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### Docker

```sh
# 构建镜像
docker build -t st-chat-processor .

# 运行容器
docker run -d -p 8080:80 st-chat-processor
```

访问 `http://localhost:8080` 即可使用。

### 本地开发

```sh
# 克隆仓库
git clone https://github.com/LYC619/silly-tavern-explorer.git
cd silly-tavern-explorer

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 🔧 常见问题

### Node.js 未识别

如果运行启动脚本时提示 `node 不是内部或外部命令`：
1. 确认已安装 Node.js：访问 https://nodejs.org/ 下载安装
2. 安装时勾选"Add to PATH"选项
3. 重新打开命令行窗口再试

### 端口被占用

如果 4173 端口被占用，可以手动修改 `package.json` 中的 preview 命令，或使用开发模式：
```sh
npm run dev
```

## 📄 License

MIT

---

## 📜 版本更新记录

### v0.6
**新增功能：**
- 🧹 导出时自动清空 swipes 冗余数据，文件体积减少 40-50%
- 🔌 可选清理插件缓存（LWB快照等运行时数据）
- 📐 消息范围导出：支持全部/最近N条/自定义楼层范围
- 📊 导出统计面板：实时显示原始大小、预估大小和节省比例
- 🖥️ 导出弹窗：统一配置界面，替代原下拉菜单

### v0.5
**新增功能：**
- 📖 沉浸式阅读模式：书架作品支持小说风格阅读界面
- 📱 移动端翻页：支持触摸滑动翻页，完美适配手机
- ⌨️ 键盘导航：方向键/空格翻页，ESC退出
- 🎛️ 阅读设置：可调节字体大小
- 📊 阅读进度：实时显示阅读进度条

**优化改进：**
- 🔧 书架交互优化：点击作品弹出选择菜单（阅读/编辑）
- 📱 全面移动端适配：阅读器针对小屏幕优化布局
- 🌓 阅读器支持日间/夜间模式

### v0.4
**新增功能：**
- 🌙 夜间模式：支持日间/夜间主题切换
- 🔧 正则侧边栏：独立固定侧边栏，编辑规则时可实时预览效果
- ➕ 快速添加正则：输入开始/结束标签（如 `<thought>` 和 `</thought>`），自动生成匹配正则
- 💾 会话持久化：导航到子页面再返回不会丢失数据
- 💾 设置持久化：所有设置（包括正则规则）自动保存到浏览器

**技术改进：**
- 🔧 重构正则管理系统，从设置面板移至独立侧边栏
- 🔧 优化状态管理，使用 localStorage 持久化设置
- 🔧 改进侧边栏布局，使用 sticky 定位保持可见

### v0.3
**新增功能：**
- ✨ 书架功能：保存聊天记录到本地书架，支持封面自定义
- ✨ AI 工具箱：生成正则、智能分卷、生成标题
- ✨ 自定义 API：支持配置自定义接口地址和模型名称
- ✨ 一键启动脚本：Windows (start.bat/start.ps1) 和 Mac/Linux (start.sh)

**技术改进：**
- 🔧 使用 IndexedDB 存储书架数据，支持大容量
- 🔧 优化启动脚本，自动检测 Node.js 环境

### v0.2
**新增功能：**
- ✨ 消息编辑功能：可点击编辑单条消息内容、说话人和角色类型
- ✨ 消息删除功能：支持删除不需要的消息
- ✨ JSONL 导出：导出为 SillyTavern 兼容格式，应用正则清理后可直接导入继续游玩
- ✨ 统一导出菜单：TXT 和 JSONL 导出整合到一个下拉菜单

**优化调整：**
- 🔄 移除图片导出功能（PNG/JPEG），因长对话不适配
- 🔄 "批量导入"按钮更名为"导入总结"
- 🔄 编辑模式互斥：编辑内容、章节标记、导入总结三种模式自动切换

### v0.1
**初始版本：**
- 📥 支持导入 SillyTavern JSON/JSONL 聊天记录
- 🎨 四种主题风格：典雅书籍、小说排版、社交气泡、极简主义
- 📑 章节标记功能：单条添加和批量导入
- 📤 导出为 PNG/JPEG 图片和 TXT 文本
- 🔧 内置正则规则：自动清理思维链、状态栏等元数据
- ➕ 支持自定义正则规则
