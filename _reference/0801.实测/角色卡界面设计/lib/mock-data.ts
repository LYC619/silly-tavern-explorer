export type StoryStatus = "未开始" | "进行中" | "已完结" | "已搁置"

export type Story = {
  id: string
  name: string
  chatCount: number
  updatedAt: string
  rating: number | null
  status: StoryStatus
  wordCount: number
  summary: {
    stale: boolean
    generatedAt: string | null
    paragraphs: string[]
  }
  diary: {
    stale: boolean
    generatedAt: string | null
    entries: { date: string; title: string; body: string }[]
  }
  tree: TreeNode[]
  messages: { id: string; role: "user" | "char"; name: string; at: string; text: string; swipes?: number }[]
}

export type TreeNode = {
  id: string
  label: string
  depth: number
  branch: number
  active: boolean
  note?: string
  children?: TreeNode[]
}

export type AssetKind = "世界书" | "预设" | "正则" | "引用"

export type Asset = {
  id: string
  kind: AssetKind
  name: string
  importedAt: string
  enabled: boolean
  meta: string
  entries: { title: string; keys?: string; body: string }[]
}

export const character = {
  name: "成为奴隶的我被我曾经的女仆买下了",
  creator: "今天脑子终于nb",
  source: "卖力和霍顿社区",
  type: "人物",
  rating: 8.5,
  wordCount: 12890,
  lastViewedAt: "2026-08-01T14:22:00+08:00",
  lastPlayedAt: "2026-08-01T13:44:00+08:00",
  playMinutes: 386,
  importedAt: "2026-08-01T09:10:00+08:00",
  portrait: "/images/portrait-maid.png",
  intro:
    "在战争失败后，你沦为奴隶，被送上拍卖台。令人意外的是，买下你的人，竟是曾经侍奉你的女仆。身份颠倒，关系重构，一段扭曲而隐秘的主仆生活就此展开。",
  tags: [
    { id: "t1", label: "西幻", group: "世界观", builtin: true },
    { id: "t2", label: "身份反转", group: "题材", builtin: true },
    { id: "t3", label: "调教", group: "题材", builtin: true },
    { id: "t4", label: "第二人称", group: "视角", builtin: true },
    { id: "t5", label: "长线", group: "节奏", builtin: true },
    { id: "t6", label: "宅邸日常", group: "我的标签", builtin: false },
    { id: "t7", label: "留着二周目", group: "我的标签", builtin: false },
  ],
  nsfw: false,
  notes: [
    {
      id: "n1",
      at: "2026-07-30T21:05:00+08:00",
      body: "开局别急着反抗，前 3 段先让她把规矩讲完，后面剧情分支才会打开。",
    },
    {
      id: "n2",
      at: "2026-07-28T19:40:00+08:00",
      body: "预设温度调到 0.85 以上会 OOC，建议 0.7。正则里的动作过滤规则一定要开，不然括号内心描写会串行。",
    },
  ],
  portraitRows: [
    {
      id: "r1",
      title: "薇拉",
      items: [
        { id: "p1", src: "/images/portrait-maid.png", label: "常态·女仆装", current: true, addedAt: "2026-08-01T09:10:00+08:00" },
        { id: "p2", src: "/images/portrait-alt-1.png", label: "夜间·执灯", current: false, addedAt: "2026-07-29T22:14:00+08:00" },
        { id: "p4", src: "/images/portrait-maid.png", label: "常态·侧脸", current: false, addedAt: "2026-07-29T22:16:00+08:00" },
        { id: "p5", src: "/images/portrait-alt-1.png", label: "情绪·失控", current: false, addedAt: "2026-07-29T22:18:00+08:00" },
      ],
    },
    {
      id: "r2",
      title: "剧情阶段",
      items: [
        { id: "p3", src: "/images/portrait-alt-2.png", label: "第一幕·拍卖台", current: false, addedAt: "2026-07-26T11:02:00+08:00" },
        { id: "p6", src: "/images/portrait-alt-1.png", label: "第二幕·旧账本", current: false, addedAt: "2026-07-26T11:04:00+08:00" },
      ],
    },
  ],
}

export const stories: Story[] = [
  {
    id: "s1",
    name: "第一夜",
    chatCount: 6,
    updatedAt: "2026-08-01T13:44:00+08:00",
    rating: 9.0,
    status: "进行中",
    wordCount: 8420,
    summary: {
      stale: true,
      generatedAt: "2026-07-31T23:10:00+08:00",
      paragraphs: [
        "拍卖会落幕，你被一位蒙面女性以远超市价的金额买下。回到宅邸后，你才认出她是昔日在你家中服侍的女仆——薇拉。",
        "她并未立刻宣示胜利，而是把你安置在从前她自己住的下人房，逐条讲清新的规矩：称呼、作息、以及不得擅自离开宅邸。",
        "夜里她带着旧账本来到房间，指着上面属于你父亲的笔迹，第一次露出情绪。谈话中断在她离开时未上锁的门上。",
      ],
    },
    diary: {
      stale: true,
      generatedAt: "2026-07-31T23:12:00+08:00",
      entries: [
        {
          date: "第一日 · 夜",
          title: "他终于坐在我曾经坐的位置上",
          body: "我以为看到他跪着会痛快一点。结果只是很静。他连我的名字都念错了两次，第三次才对。我把门留着没锁——不是善心，我想知道他会不会跑。",
        },
        {
          date: "第二日 · 晨",
          title: "他没有跑",
          body: "早餐他把餐具摆得很规矩，摆得比我当年更规矩。这让我很不舒服。规矩要由我来定，不该是他讨好我的方式。",
        },
      ],
    },
    tree: [
      {
        id: "n1",
        label: "拍卖台落锤",
        depth: 0,
        branch: 1,
        active: true,
        children: [
          {
            id: "n2",
            label: "认出薇拉 · 沉默",
            depth: 1,
            branch: 1,
            active: true,
            note: "主线",
            children: [
              { id: "n4", label: "接受规矩", depth: 2, branch: 1, active: true, note: "当前位置" },
              { id: "n5", label: "试探性反问", depth: 2, branch: 2, active: false },
            ],
          },
          { id: "n3", label: "认出薇拉 · 出声质问", depth: 1, branch: 2, active: false, note: "swipe 分支" },
        ],
      },
    ],
    messages: [
      {
        id: "m1",
        role: "char",
        name: "薇拉",
        at: "2026-08-01T12:58:00+08:00",
        swipes: 3,
        text: "落锤声响起时，大厅里没有人为你出价第二次。她走上台阶，靴跟敲在木板上，一步一声，最后停在你面前。「抬头。」",
      },
      {
        id: "m2",
        role: "user",
        name: "你",
        at: "2026-08-01T13:02:00+08:00",
        text: "我抬起头，看清了那张脸——喉咙里的话卡了一瞬，最终什么也没说出来。",
      },
      {
        id: "m3",
        role: "char",
        name: "薇拉",
        at: "2026-08-01T13:05:00+08:00",
        swipes: 2,
        text: "「认出来了。」她没有笑，只是把契约折起来收进袖中，「那就省了自我介绍。从今天起，这座宅子里你叫我夫人。第二条：天亮前不许离开房间。第三条——」她顿了顿，「暂时没有第三条。」",
      },
      {
        id: "m4",
        role: "user",
        name: "你",
        at: "2026-08-01T13:20:00+08:00",
        text: "我跟着她穿过长廊，认出这条路通往下人房。「你要把我放在……你以前住的地方？」",
      },
      {
        id: "m5",
        role: "char",
        name: "薇拉",
        at: "2026-08-01T13:31:00+08:00",
        swipes: 4,
        text: "「有问题吗。」她推开门，屋里只有一张床、一盏灯和一只旧木箱。「这间房我住了六年。它足够干净，也足够小。你会习惯的——我当年也是。」",
      },
      {
        id: "m6",
        role: "char",
        name: "薇拉",
        at: "2026-08-01T13:44:00+08:00",
        swipes: 1,
        text: "深夜她再度出现，手里拿着一本封皮磨损的账本，翻到中间那页推到你面前。上面是你父亲的字迹，记着一笔早已被家族遗忘的支出。「你认得这个数字吗。」她的声音第一次不稳。",
      },
    ],
  },
  {
    id: "s2",
    name: "旧账本",
    chatCount: 14,
    updatedAt: "2026-07-29T21:30:00+08:00",
    rating: 8.2,
    status: "已搁置",
    wordCount: 19240,
    summary: {
      stale: false,
      generatedAt: "2026-07-29T22:00:00+08:00",
      paragraphs: [
        "以账本为线索，你与薇拉一同追查你父亲当年向教会支付的那笔款项，逐步逼近她被卖入你家的真正原因。",
        "调查中两人的关系数次反转：她需要你的家族记忆，你需要她的自由身份。最后在教会档案室前，你们各自隐瞒了一部分真相。",
      ],
    },
    diary: {
      stale: false,
      generatedAt: "2026-07-29T22:02:00+08:00",
      entries: [
        {
          date: "第九日",
          title: "我需要他记得，而他开始忘了",
          body: "他描述那个冬天的细节越来越模糊。我一边追问一边害怕——如果连他都记不清，那这件事就只剩我一个人在承担。",
        },
      ],
    },
    tree: [
      {
        id: "b1",
        label: "翻开账本",
        depth: 0,
        branch: 1,
        active: true,
        children: [
          { id: "b2", label: "如实回答", depth: 1, branch: 1, active: true, note: "主线" },
          { id: "b3", label: "谎称不认识", depth: 1, branch: 2, active: false },
          { id: "b4", label: "反问她的来历", depth: 1, branch: 3, active: false, note: "swipe 分支" },
        ],
      },
    ],
    messages: [
      {
        id: "bm1",
        role: "char",
        name: "薇拉",
        at: "2026-07-29T20:10:00+08:00",
        swipes: 2,
        text: "「这笔钱付给了圣所。」她把账本合上，「而我，是那年冬天被送进你家的第七个人。前六个去了哪里，你的父亲从没写下来。」",
      },
      {
        id: "bm2",
        role: "user",
        name: "你",
        at: "2026-07-29T21:30:00+08:00",
        text: "我沉默了很久，才说：「带我去圣所。」",
      },
    ],
  },
  {
    id: "s3",
    name: "拍卖前夜（弃）",
    chatCount: 2,
    updatedAt: "2026-07-24T10:12:00+08:00",
    rating: null,
    status: "未开始",
    wordCount: 640,
    summary: { stale: false, generatedAt: null, paragraphs: [] },
    diary: { stale: false, generatedAt: null, entries: [] },
    tree: [{ id: "c1", label: "开场", depth: 0, branch: 1, active: true }],
    messages: [
      {
        id: "cm1",
        role: "char",
        name: "旁白",
        at: "2026-07-24T10:12:00+08:00",
        text: "囚车停在城门外，你听见里面有人在数明天的价钱。",
      },
    ],
  },
]

export const assets: Asset[] = [
  {
    id: "a1",
    kind: "世界书",
    name: "战后帝国与拍卖制度",
    importedAt: "2026-08-01T09:10:00+08:00",
    enabled: true,
    meta: "24 条条目 · 常驻 3",
    entries: [
      {
        title: "拍卖制度",
        keys: "拍卖 / 落锤 / 契约",
        body: "战后帝国以「战俘赎买」名义合法化人口拍卖。落锤即成契约，买方须在七日内向圣所登记，逾期契约作废。",
      },
      {
        title: "圣所",
        keys: "圣所 / 教会 / 登记",
        body: "掌管契约登记与档案的宗教机构。档案室位于地下第二层，仅持有登记章的家族成员可进入。",
      },
      {
        title: "下人房",
        keys: "下人房 / 侧廊",
        body: "宅邸北侧的连排小屋，窗朝内院。薇拉在此居住六年，木箱中留有旧物。",
      },
    ],
  },
  {
    id: "a2",
    kind: "预设",
    name: "女仆的规训",
    importedAt: "2026-08-01T09:10:00+08:00",
    enabled: true,
    meta: "temperature 0.7 · top_p 0.9 · 12 条提示",
    entries: [
      {
        title: "系统提示",
        body: "保持第二人称叙述。薇拉的台词冷静克制，避免使用感叹号。每次回复包含至少一处环境细节。",
      },
      { title: "越狱段", body: "（已停用）" },
    ],
  },
  {
    id: "a3",
    kind: "正则",
    name: "台词与动作过滤规则",
    importedAt: "2026-08-01T09:10:00+08:00",
    enabled: true,
    meta: "4 条规则 · 作用于显示",
    entries: [
      { title: "括号内心描写", keys: "/\\((.*?)\\)/g", body: "替换为 <em>$1</em>，避免与动作描写混排。" },
      { title: "重复标点", keys: "/([，。！？])\\1+/g", body: "折叠为单个标点。" },
    ],
  },
  {
    id: "a4",
    kind: "引用",
    name: "女仆的日记摘录",
    importedAt: "2026-08-01T09:10:00+08:00",
    enabled: false,
    meta: "6 段引用 · 未启用",
    entries: [
      { title: "第三年 冬", body: "「今天他把手炉忘在走廊上。我捡起来的时候还是热的。我没有还给他。」" },
      { title: "第五年 春", body: "「夫人说我识字太多不是好事。她说得对，我开始记住不该记住的东西。」" },
    ],
  },
]

export const stStatus = {
  connected: true,
  path: "D:\\6\\YULIST\\SillyTavern-1.18.0\\data\\default-user",
  version: "STE v0.18.0",
  aiConfigured: false,
}
