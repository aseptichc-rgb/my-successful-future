/**
 * 简体中文翻译字典。键名必须与 ko.ts 完全一致。
 */
import type { DictKey } from "./ko";

const dict: Record<DictKey, string> = {
  // Common
  "common.save": "保存",
  "common.saving": "保存中…",
  "common.saved": "已保存",
  "common.cancel": "取消",
  "common.close": "关闭",
  "common.next": "下一步",
  "common.prev": "上一步",
  "common.skip": "跳过",
  "common.add": "添加",
  "common.edit": "编辑",
  "common.write": "撰写",
  "common.delete": "删除",
  "common.remove": "移除",
  "common.loading": "加载中…",
  "common.error": "错误",
  "common.retry": "重试",
  "common.unsavedChanges": "有未保存的更改",
  "common.savedState": "已是最新",
  "common.saveFailed": "保存失败。",
  "common.tryAgainLater": "请稍后再试。",

  // Language
  "language.title": "选择你的语言",
  "language.subtitle": "한국어 · English · Español · 中文",
  "language.changeNote": "随时可以在「设置」中更改。",
  "language.settings.title": "语言",
  "language.settings.subtitle": "应用界面与每日卡片将使用此语言。",
  "language.settings.note": "更改后,下一张卡片将以新的语言送达。",

  // Onboarding
  "onboarding.step1.title": "10 年后的你是什么样子?",
  "onboarding.step1.subtitle":
    "用一段话写下你想成为的样子。每天送达的一句话,都从这里出发。",
  "onboarding.step1.placeholder":
    "例:10 年后的我每天清晨从锻炼与阅读开始,陪伴家人,从热爱的工作中获得稳定收入。",
  "onboarding.step1.example1":
    "5 年后,我月入 7 万,自由选择何时做什么。每个清晨从锻炼与阅读开始。",
  "onboarding.step1.example2":
    "10 年后,我成为所在领域的代表声音之一,通过演讲与写作影响更多人。",
  "onboarding.step1.example3":
    "7 年后,与家人相处的时间是第一位。每天工作 5 小时,周末完全留给自己。",

  "onboarding.step2.title": "你正朝着哪些目标前进?",
  "onboarding.step2.subtitle":
    "前 3 个目标会显示在每日卡片与锁屏上,按优先级排列。",
  "onboarding.step2.placeholder": "例:每天读书 30 分钟",
  "onboarding.step2.addGoal": "+ 添加目标",
  "onboarding.step2.removeGoalAria": "移除该目标",

  "onboarding.step3.title": "把那个成功的自己,一行行写下来",
  "onboarding.step3.subtitle":
    "你写下的誓言,每天会作为浅色提示文字出现在卡片上。原样照抄,可以累计连续天数。也可以留空——之后在「设置」里随时添加。",

  "onboarding.step4.title": "你想每天听到谁的声音?",
  "onboarding.step4.subtitle":
    "选择一个人之后,每周大约 4 天会先送达此人的话。其余天数与自动轮播由策展决定。也可以留空。",
  "onboarding.step4.autoTitle": "自动轮播",
  "onboarding.step4.autoSubtitle": "每周由约 8 位导师按确定算法轮换。",
  "onboarding.step4.changeLater": "之后在「设置」里随时可改或关闭。",
  "onboarding.step4.cta": "获取今日的一句话 →",
  "onboarding.step4.preparing": "准备中…",

  "onboarding.step5.titleLoading": "正在为你准备今日的一句话…",
  "onboarding.step5.titleDone": "这就是你每天会收到的样子。",
  "onboarding.step5.subtitleLoading": "请稍候。",
  "onboarding.step5.subtitleDone":
    "锁屏小组件每天会显示一条新的话。安装 Android 应用即可添加小组件。",
  "onboarding.step5.todayLabel": "今日的一句话",
  "onboarding.step5.missionLabel": "今日任务",
  "onboarding.step5.missionIdentityPrefix": "我是",
  "onboarding.step5.missionFooter":
    "在主页回答这一句,你的身份卡片会随之成长。",
  "onboarding.step5.previewError":
    "预览生成失败。开始之后可以从主页再试。",
  "onboarding.step5.widgetTitle": "Android 上添加小组件的方法",
  "onboarding.step5.widgetStep1": "1. 长按主屏幕的空白处",
  "onboarding.step5.widgetStep2": "2. 进入「小组件」 → 搜索 Anima",
  "onboarding.step5.widgetStep3":
    "3. 添加到锁屏,每天都会自动收到一条新句",
  "onboarding.step5.start": "开始",
  "onboarding.step5.finishing": "正在收尾…",

  "onboarding.saveError": "保存失败。",
  "onboarding.category.philosophy": "哲学",
  "onboarding.category.entrepreneur": "企业家",
  "onboarding.category.classic": "古典",
  "onboarding.category.leader": "领袖",
  "onboarding.category.scientist": "科学家",
  "onboarding.category.literature": "文学",

  // Home
  "home.title": "今日动力",
  "home.subtitle": "用一句新写给你的话开始一天。",
  "home.dateFormat": "{year} 年 {month} 月 {day} 日",
  "home.settingsAria": "设置",

  "home.future.title": "10 年后的你",
  "home.future.subtitle":
    "未来的你越具体,每天送达的一句话就越清晰。",
  "home.future.empty": "还没有写。点击撰写。",
  "home.future.saveAndRegen": "保存并重新生成今日卡片",
  "home.future.saveFailed": "未能保存「未来的你」",

  "home.goals.title": "通往目标的今日行动",
  "home.goals.subtitle":
    "向未来的你迈出的一小步。前 3 项也会显示在锁屏上。",
  "home.goals.todayProgress": "今日 {done}/{total}",
  "home.goals.placeholder": "例:每天读书 30 分钟",
  "home.goals.maxAlert": "最多可添加 {max} 个目标。",
  "home.goals.deleteAria": "删除目标",
  "home.goals.toggleAchievedAria": "标记为今日已完成",
  "home.goals.toggleUnachievedAria": "撤销已完成",
  "home.goals.toggleAchievedTitle": "标记为今日已完成",
  "home.goals.toggleUnachievedTitle": "今日已完成 — 点击撤销",
  "home.goals.saveFailed": "目标保存失败。",

  "home.wins.title": "今天为自己做得好的 {max} 件事",
  "home.wins.subtitle": "再小的事也算。保存后可按日期回看。",
  "home.wins.history": "查看过往记录",
  "home.wins.placeholder1": "例:回了那封一直拖着的邮件。",
  "home.wins.placeholder2": "例:早上散步了 10 分钟。",
  "home.wins.placeholder3": "例:对家人说了一句温暖的话。",
  "home.wins.saveFailed": "保存失败。请稍后再试。",

  // MotivationCard
  "motivation.wallpaper.goalsLabel": "我的目标",
  "motivation.wallpaper.watermark": "Anima · 未来的我",
  "motivation.wallpaper.download": "保存为壁纸",
  "motivation.wallpaper.downloading": "保存中…",
  "motivation.wallpaper.downloadFailed": "图片保存失败。",
  "motivation.regenerating": "重新生成中…",
  "motivation.headerTodayLabel": "今日的一句话",
  "motivation.responseEmpty": "请写一行。",
  "motivation.responsePlaceholder": "用一行回答(60 字以内)",
  "motivation.responseEdited": "已更新回答",
  "motivation.responseToast": "+1 — 你是「{tag}」",
  "motivation.preparingCard": "正在准备你的卡片,请稍候…",
  "motivation.loading": "正在为你准备今日的一句话…",
  "motivation.error.title": "今日卡片创建失败",
  "motivation.regenerate": "再来一句",
  "motivation.todayLabel": "今日的一句话",
  "motivation.missionLabel": "今日任务",
  "motivation.missionPlaceholder": "用一句话回答……",
  "motivation.submit": "记录",
  "motivation.submitting": "记录中…",
  "motivation.alreadyAnsweredToday":
    "今天已经回答过了 — 明天会有新的一句。",
  "motivation.firstResponseToast":
    "你的身份「我是{tag}」今天前进了 1 步。",
  "motivation.editResponse": "修改回答",
  "motivation.identityPrefix": "我是",
  "motivation.affirmations.title": "再向成功的自己迈一步",
  "motivation.affirmations.streak": "连续 {count} 天",
  "motivation.affirmations.placeholder": "请原样抄写上方的句子",
  "motivation.affirmations.checkin": "刻下今日的誓言",
  "motivation.affirmations.checkingIn": "刻写中…",
  "motivation.affirmations.matched":
    "今日已刻下,连续 {count} 天!",
  "motivation.affirmations.mismatched":
    "每个字都要一致。请原样抄写上方的句子。",
  "motivation.affirmations.alreadyToday":
    "今天已经刻过了。明天再见。",
  "motivation.affirmations.empty":
    "在「设置」中添加誓言,就能每天照抄并累积连续天数。",

  // Settings
  "settings.title": "设置",
  "settings.subtitle":
    "在一个地方管理你的未来形象、每日誓言、今日行动与名言策展。",
  "settings.future.title": "10 年后的你",
  "settings.future.subtitle": "你的每日一句话,都从这段话出发。",
  "settings.affirmations.title": "再向成功的自己迈一步",
  "settings.affirmations.subtitle":
    "每张日卡上方以浅色显示。完全一致地抄写,连续天数 +1。",
  "settings.goals.title": "通往目标的今日行动",
  "settings.goals.subtitle":
    "向未来的你迈出的一小步。前 3 项也会显示在锁屏上。",
  "settings.goals.empty":
    "先在主页添加目标,这里就可以编辑。",
  "settings.quote.title": "名言策展",
  "settings.quote.subtitle":
    "留空则每周自动轮换;也可以钉选一个人并设定出现频率。",
  "settings.quote.pinAuthor": "钉选一个人",
  "settings.quote.noPin": "— 不钉选(每周自动轮换)—",
  "settings.quote.daysLabel": "每周钉选天数:",
  "settings.quote.daysOff": "关闭",
  "settings.quote.daysEveryday": "每天",
  "settings.quote.daysPerWeek": "每周 {n} 天",
  "settings.account.title": "账户",
  "settings.account.signOut": "退出登录",

  // Auth
  "auth.email": "邮箱",
  "auth.password": "密码",
  "auth.displayName": "昵称",
  "auth.signIn": "登录",
  "auth.signUp": "注册",
  "auth.signInWithGoogle": "使用 Google 继续",
  "auth.signingIn": "登录中…",
  "auth.signingUp": "创建账户中…",
  "auth.signIn.title": "欢迎回来",
  "auth.signIn.subtitle":
    "10 年后的你,每天会在这里给你送来一句话。",
  "auth.signIn.noAccount": "第一次来吗?",
  "auth.signIn.toSignUp": "注册",
  "auth.signUp.title": "去见见 10 年后的自己",
  "auth.signUp.subtitle": "现在就收到你的第一句话。",
  "auth.signUp.haveAccount": "已经有账户?",
  "auth.signUp.toSignIn": "登录",
  "auth.error.invalidEmail": "请检查邮箱格式。",
  "auth.error.invalidPassword": "密码至少 6 个字符。",
  "auth.error.requireDisplayName": "请填写昵称。",
  "auth.error.generic": "出现了问题,请重试。",
  "auth.link.title": "关联 Google 账户",
  "auth.link.description": "{email} 已使用邮箱/密码注册。请输入密码以关联此 Google 账户,之后两种方式都可以登录。",
  "auth.link.submit": "关联并登录",
  "auth.link.cancel": "取消",
  "auth.link.failed": "关联失败,请检查密码。",
  "auth.password.placeholder": "至少 6 个字符",
  "auth.displayName.placeholder": "显示名称",

  // Wins history
  "wins.history.title": "你的好事,按天",
  "wins.history.subtitle": "每一行小事汇集起来,就是属于你的轨迹。",
  "wins.history.empty": "还没有记录。",
  "wins.history.back": "← 返回主页",
  "wins.history.loadFailed": "记录加载失败。",

  // Affirmations editor
  "affirmations.editor.placeholder": "例:我是每天写作一小时的人。",
  "affirmations.editor.add": "+ 添加誓言",
  "affirmations.editor.removeAria": "移除该誓言",
  "affirmations.editor.maxNote":
    "最多 {max} 条,每行最多 {len} 字。",

  // Billing
  "billing.trialBanner": "免费试用还剩 {days} 天",
  "billing.trialEnded": "免费试用已结束。",
  "billing.upgrade": "升级",
};

export default dict;
