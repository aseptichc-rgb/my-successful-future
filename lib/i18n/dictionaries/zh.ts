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
  "common.done": "完成",
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
  // 「十年后的我」— 沉浸式提问流程,一屏一个问题。
  "onboarding.futureSelf.sectionLabel": "我真正想要的",
  "onboarding.progress.remaining": "还剩 {remaining} 个",
  "onboarding.progress.lastStep": "最后一步",
  "onboarding.futureSelf.dream.q": "你真正想实现的梦想是什么?",
  "onboarding.futureSelf.dream.hint": "只写一个。这不会给别人看。",
  "onboarding.futureSelf.dream.placeholder":
    "例:开一间挂着自己名字的工作室,每月稳定赚 2 万元,每周有三天亲自去接孩子放学。",
  "onboarding.futureSelf.dream.why":
    "写上数字、期限和人名,越具体越好。这句话会成为你每天收到的卡片的原料。",
  "onboarding.futureSelf.daily.q": "10 年后,你平常的一天是怎样度过的?",
  "onboarding.futureSelf.daily.placeholder":
    "在哪里醒来、上午做什么、傍晚如何度过。",
  "onboarding.futureSelf.work.q": "那时你在做什么工作,在人们中处于怎样的位置?",
  "onboarding.futureSelf.work.placeholder":
    "职业与角色、在团队中的位置、人们来找你的原因。",
  "onboarding.futureSelf.wealth.q": "你的资产和经济状况如何?",
  "onboarding.futureSelf.wealth.placeholder":
    "月收入、积累的资产、住的房子、金钱不再限制的选择。",
  "onboarding.futureSelf.family.q": "与家人在一起的生活是什么样子?",
  "onboarding.futureSelf.family.placeholder":
    "一起度过的时光、你为他们做的事、关系的温度。",
  "onboarding.futureSelf.achievements.q": "到那时你已经取得了哪些成就?",
  "onboarding.futureSelf.achievements.placeholder":
    "你创造的东西、达成的目标、最自豪的成就。",
  "onboarding.futureSelf.respect.q": "人们如何看待你,尊敬你哪些方面?",
  "onboarding.futureSelf.respect.placeholder":
    "周围人给予你的信任、声誉与尊敬,以及原因。",
  "onboarding.futureSelf.growth.q": "你的身心状态如何,又在如何继续成长?",
  "onboarding.futureSelf.growth.placeholder":
    "健康状况、正在学习的东西、持续前进的样子。",

  // 第 2 步上方 —— 用第一人称现在式写「已经成为」的自己。每天照抄这一句。
  "onboarding.declaration.title": "用一句话写下实现了那个梦想的我",
  "onboarding.declaration.subtitle": "像已经成为的人那样写。这就是你每天要抄的那一句。",
  "onboarding.declaration.example1": "我是不被金钱追赶的人",
  "onboarding.declaration.example2": "我是身心都健康的人",
  "onboarding.declaration.example3": "我是用工作帮助别人的人",
  "onboarding.declaration.placeholder": "我是……的人",
  "onboarding.declaration.writeMyOwn": "自己来写",

  // 第 2 步下方 —— 为了成为那个人,今天要做的行动。与上面那一句彼此独立。
  "onboarding.goal.title": "为了成为那个人,今天只做一件事",
  "onboarding.goal.subtitle": "一个就够了。坚持下去,就能多放一个目标。",
  "onboarding.goal.placeholder": "每天读 30 页书,并写下一行心得",
  "onboarding.goal.hint": "写成「今天做了或没做」的行动,才能一眼判断有没有做到。",

  "onboarding.step4.cta": "获取今日的一句话 →",
  "onboarding.step4.preparing": "准备中…",

  "onboarding.step5.titleLoading": "正在为你准备今日的一句话…",
  "onboarding.step5.titleDone": "每天清晨，十年后你的一天，鲜活地在眼前展开。",
  "onboarding.step5.subtitleLoading": "请稍候。",
  "onboarding.step5.subtitleDone":
    "锁屏小组件每天会显示一条新的话。安装 Android 应用即可添加小组件。",
  "onboarding.step5.todayLabel": "今日的一句话",
  "onboarding.step5.missionLabel": "今日任务",
  "onboarding.step5.missionIdentityPrefix": "我是",
  "onboarding.step5.missionFooter":
    "在主页回答这一句,你的身份会一步步累积。",
  "onboarding.step5.previewError":
    "预览生成失败。开始之后可以从主页再试。",
  "onboarding.step5.widgetTitle": "Android 上添加小组件的方法",
  "onboarding.step5.widgetStep1": "1. 长按主屏幕的空白处",
  "onboarding.step5.widgetStep2": "2. 进入「小组件」 → 搜索 Anima",
  "onboarding.step5.widgetStep3":
    "3. 添加到锁屏,每天都会自动收到一条新句",
  "onboarding.step5.start": "开始",
  "onboarding.step5.finishing": "正在收尾…",
  "onboarding.step5.portraitLabel": "十年后的我",
  "onboarding.step5.portraitLoading": "正在描绘十年后的你…",
  "onboarding.step5.portraitError":
    "未能生成你的未来画像。开始之后可以从主页重新生成。",

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
  "home.future.empty": "还没有写。可以在「设置」中撰写。",
  "home.future.saveAndRegen": "保存并重新生成今日卡片",
  "home.future.saveFailed": "未能保存「未来的你」",

  // 「十年后的我」画像卡片
  "futureSelf.portrait.headerLabel": "十年后的我",
  "futureSelf.portrait.loading": "正在描绘十年后的你…",
  "futureSelf.portrait.error": "未能描绘你的未来画像。",
  "futureSelf.portrait.regenerate": "重新描绘画像",
  "futureSelf.portrait.regenerating": "重新描绘中…",

  "home.goals.title": "通往目标的今日行动",
  "home.goals.subtitle":
    "向未来的你迈出的一小步。",
  "home.goals.todayProgress": "今日 {done}/{total}",
  "home.goals.placeholder": "例:每天挑战一件没做过的事",
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

  // ── 未来日常愿景(梦想成真的一天) ──
  "futureVision.headerLabel": "今天,活在那个梦想里的一天",
  "futureVision.loading": "正在描绘你的未来一天…",
  "futureVision.error": "未能描绘你的未来一天。",
  "futureVision.regenerate": "看看另一天",
  "futureVision.regenerating": "正在描绘另一天…",
  "futureVision.reveal": "展开今天的一天",
  "futureVision.empty.title": "先描绘未来的自己",
  "futureVision.empty.body":
    "写下你十年后想成为的样子,我会每天把那个梦想成真的一天描绘在你眼前。",
  "futureVision.empty.cta": "写下未来的自己",

  // Settings
  "settings.title": "设置",
  "settings.subtitle":
    "在一个地方管理你的未来形象、每日誓言、今日行动与名言策展。",
  "settings.future.title": "10 年后的你",
  "settings.future.subtitle": "你的每日一句话,都从这段话出发。",
  "settings.futureSelf.legacyNote":
    "这是你之前写下的内容。回答上面的问题并保存后,将替换这段文字。",
  "settings.affirmations.title": "再向成功的自己迈一步",
  "settings.affirmations.subtitle":
    "每张日卡上方以浅色显示。完全一致地抄写,连续天数 +1。",
  "settings.goals.title": "通往目标的今日行动",
  "settings.goals.subtitle":
    "向未来的你迈出的一小步。",
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
  "settings.account.delete": "删除账户",
  "settings.account.delete.subtitle": "永久删除你的资料、宣言与日志。此操作无法撤销。",
  "settings.account.delete.confirmTitle": "确定要删除账户吗？",
  "settings.account.delete.confirmBody":
    "你写下的未来的自己、每日宣言、做得好的事记录都会被清除。\n购买凭证也会一并清理。日后仍可用同一邮箱重新注册。",
  "settings.account.delete.confirmInputLabel": "请在下方输入「删除」以确认。",
  "settings.account.delete.confirmInputKeyword": "删除",
  "settings.account.delete.confirmCancel": "取消",
  "settings.account.delete.confirmConfirm": "永久删除",
  "settings.account.delete.deleting": "删除中…",
  "settings.account.delete.failed": "账户删除失败，请稍后再试。",

  // Auth
  "auth.email": "邮箱",
  "auth.password": "密码",
  "auth.displayName": "昵称",
  "auth.signIn": "登录",
  "auth.signUp": "注册",
  "auth.signInWithGoogle": "使用 Google 继续",
  "auth.continueWithGoogle": "使用 Google 继续",
  "auth.continueWithApple": "使用 Apple 继续",
  "auth.or": "或",
  "auth.noAccount": "第一次来吗?",
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
  "auth.error.emailInUse": "该邮箱已注册,请直接登录。",
  "auth.error.invalidCredentials": "邮箱或密码不正确。",
  "auth.error.tooManyRequests": "尝试次数过多,请稍后再试。",
  "auth.error.network": "请检查网络连接。",
  "auth.link.title": "关联 Google 账户",
  "auth.link.description": "{email} 已使用邮箱/密码注册。请输入密码以关联此 Google 账户,之后两种方式都可以登录。",
  "auth.link.submit": "关联并登录",
  "auth.link.cancel": "取消",
  "auth.link.failed": "关联失败,请检查密码。",
  "auth.link.apple.title": "关联 Apple 账户",
  "auth.link.apple.description": "{email} 已使用邮箱/密码注册。请输入密码以关联此 Apple 账户,之后两种方式都可以登录。",
  "auth.password.placeholder": "至少 6 个字符",
  "auth.displayName.placeholder": "显示名称",

  // Wins history
  "wins.history.title": "你的好事,按天",
  "wins.history.subtitle": "每一行小事汇集起来,就是属于你的轨迹。",
  "wins.history.empty": "还没有记录。",
  "wins.history.back": "← 返回主页",
  "wins.history.loadFailed": "记录加载失败。",

  // Affirmations editor
  "affirmations.editor.placeholder": "例:我是资产超过10亿美元的成功企业家。",
  "affirmations.editor.add": "+ 添加誓言",
  "affirmations.editor.removeAria": "移除该誓言",
  "affirmations.editor.maxNote":
    "最多 {max} 条,每行最多 {len} 字。",

  // Billing
  "billing.trialBanner": "免费试用还剩 {days} 天",
  "billing.trialEnded": "免费试用已结束。",
  "billing.upgrade": "升级",

  // Apple iOS redesign — settings/auth/legal/common additions
  "auth.signOut": "退出登录",
  "common.deleting": "删除中…",
  "common.empty": "空",
  "common.none": "无",
  "common.set": "已设置",
  "legal.privacy": "隐私政策",
  "legal.terms": "服务条款",
  "settings.profile.header": "个人资料",
  "settings.affirmations.header": "每日肯定",
  "settings.quote.header": "卡片",
  "settings.quote.pinnedAuthor": "收藏作者",
  "settings.language.header": "语言",
  "settings.account.header": "账户",
  "settings.account.deleteConfirm":
    "您的所有数据将被永久删除。请在下方输入 \"删除\" 以确认。",
  "settings.streakLabel": "连续 {count} 天",

  // 通知设置（本地提醒）
  "settings.notifications.header": "通知",
  "settings.notifications.row": "每日提醒",
  "settings.notifications.off": "已关闭",
  "settings.notifications.footer":
    "提醒仅在本设备上安排。每天最多 2 条 — 已完成的事不会再提醒。",
  "settings.notifications.morning.title": "早晨誓言提醒",
  "settings.notifications.morning.desc": "以抄写成功宣言开启一天的信号。",
  "settings.notifications.evening.title": "晚间记录提醒",
  "settings.notifications.evening.desc": "仅当今天的目标尚未打卡时才会送达。",
  "settings.notifications.weekly.title": "周日回顾提醒",
  "settings.notifications.weekly.desc": "每周回顾准备好后，晚间提醒你回看一周。",
  "settings.notifications.time": "时间",

  // 通知文案（iOS 本地通知 — Android 使用原生资源）
  "notify.morning.title": "向成功的自己更近一步",
  "notify.morning.body": "以抄写誓言开始今天吧。",
  "notify.evening.title": "今天的目标还在等你",
  "notify.evening.body": "只需片刻 — 为今天的一步打卡吧。",
  "notify.weekly.title": "该回顾这一周了",
  "notify.weekly.body": "一周的记录已整理好，花一点时间回看吧。",

  // Anima Pro (应用内购买)
  "settings.pro.header": "ANIMA PRO",
  "settings.pro.footerActive": "所有功能均已解锁。",
  "settings.pro.footerInactive": "一次付费，永久使用 · 无广告",
  "settings.pro.active": "Anima Pro 使用中",
  "settings.pro.buy": "购买永久使用权",
  "settings.pro.processing": "处理中…",
  "settings.pro.restore": "恢复购买",
  "settings.pro.restoring": "恢复中…",
  "settings.pro.purchaseDone.title": "购买完成",
  "settings.pro.purchaseDone.desc": "您的 Anima Pro 购买已完成。谢谢！",
  "settings.pro.pending.title": "等待批准",
  "settings.pro.pending.desc": "您的付款正在等待批准。批准后将自动生效。",
  "settings.pro.purchaseFailed.title": "支付失败",
  "settings.pro.purchaseFailed.desc": "支付失败。",
  "settings.pro.purchaseIncomplete.title": "购买未完成",
  "settings.pro.purchaseIncomplete.desc": "购买未完成。如果您已购买，请点击下方的‘恢复购买’。",
  "settings.pro.restoreDone.title": "恢复完成",
  "settings.pro.restoreDone.desc": "已恢复您的购买。",
  "settings.pro.restoreNone.title": "没有可恢复的内容",
  "settings.pro.restoreNone.desc": "未找到以往的购买记录。",

  // ── WOOP 执行计划 (if-then) ───────────────────────
  "woop.section.title": "执行计划 (if-then)",
  "woop.section.footer": "提前写下障碍，执行概率会大幅提升。",
  "woop.section.designCta": "去设计",
  "woop.sheet.title": "执行计划",
  "woop.step.wish": "目标",
  "woop.step.outcome": "最佳结果",
  "woop.step.obstacle": "内心的障碍",
  "woop.step.plan": "if-then 计划",
  "woop.wish.hint": "这个计划是为哪个目标？",
  "woop.wish.empty": "请先在设置中添加本月目标。",
  "woop.outcome.hint": "实现这个目标时，最美好的瞬间是什么样子？",
  "woop.outcome.placeholder": "例：想象做到的自己，心跳加速",
  "woop.obstacle.hint": "挡住你的'内心'障碍是什么？从心里找，而不是外部环境。",
  "woop.obstacle.placeholder": "例：到了晚上就累得想拖延",
  "woop.obstacle.suggest": "获取 AI 建议",
  "woop.obstacle.suggesting": "正在生成建议…",
  "woop.plan.ifLabel": "如果 (if)",
  "woop.plan.thenLabel": "那么 (then)",
  "woop.plan.ifPlaceholder": "当障碍时刻来临",
  "woop.plan.thenPlaceholder": "我就这样做",
  "woop.identity.pickLabel": "这个实践强化的身份",
  "woop.save": "保存",
  "woop.saving": "保存中…",
  "woop.delete": "删除",
  "woop.saveFailed": "无法保存执行计划。",
  "woop.suggestFailed": "无法加载建议。",

  // ── 设计面板："为什么要提前定好？"介绍（默认折叠）──
  "woop.why.toggle": "为什么要提前定好？",
  "woop.why.p1":
    "做决定的那一刻，意志力最薄弱。疲惫的夜晚、已经拿在手里的手机——那时才思考做什么，往往会输。",
  "woop.why.p2":
    "提前写下一句'如果A，我就做B'，触发行动的主体就从'我'变成了'情境'。脑成像研究也显示，设定执行意图后，接管工作的是对线索作出反应的回路，而不是自主回想所依赖的内侧前额叶。",
  "woop.why.p3":
    "所以效果显著——汇总94项研究的元分析发现，目标达成的效应量为 d = 0.65。",
  "woop.why.p4":
    "还要写下'我内心的障碍'。只想象好结果反而会削弱行动的能量——这一点被反复验证。",
  "woop.why.source":
    "Gollwitzer 1999 · Gollwitzer & Sheeran 2006 · Gilbert et al. 2009 · Kappes & Oettingen 2011",

  // ── 今日 if-then 卡片（早晨模式）──────────────────
  "plan.today.title": "今日 if-then",
  "plan.today.if": "如果",
  "plan.today.then": "那么",
  "plan.today.desc": "在做决定的那一刻到来之前就定好的今日行动。情境一出现，别再犹豫，照做就好。",
  "plan.today.rotation": "已保存的 {count} 个计划每天轮流出现一个。",
  "plan.today.emptyCta": "创建今天的执行计划",
  "plan.today.emptyDesc": "一句话：「如果 A，我就做 B」· 选一个 AI 草稿即可完成，无需打字",
  "plan.today.firstAction": "昨晚的我定下的第一个行动",
  "plan.locked.title": "执行设计 (if-then)",
  "plan.locked.desc": "先想好自己可能拖延的那一刻，再用一句话把它和当下要做的行动绑在一起。",
  "unlock.locked.body": "连续{days}天即可解锁 · 目前{progress}天",

  // ── 夜晚模式：明天的第一个行动 ────────────────────
  "home.evening.firstAction.title": "明天的第一个行动",
  "home.evening.firstAction.placeholder": "明早睁眼后最先做的小行动",
  "home.evening.firstAction.footer": "写下来能让夜里安心 · 自动保存",

  // ── 进度 (/progress) ──────────────────────────────
  "progress.title": "进度",
  "progress.back": "← 首页",
  "progress.chipAria": "查看进度",
  "progress.streak.current": "当前连续",
  "progress.streak.days": "{count}天",
  "progress.streak.best": "最高 {count}天",
  "progress.goalDays": "达成目标的日子 {count} 天",
  "progress.freeze.label": "本月剩余冰冻",
  "progress.freeze.desc": "错过一天，冰冻会自动接上你的连续记录（每月{max}个）",
  "progress.heatmap.title": "最近30天",
  "progress.consistency": "坚持度 {pct}%",
  "progress.identity.title": "身份证据账本",
  "progress.identity.subtitle": "每一个行动，都是'我是那样的人'的一票。",
  "progress.identity.iAm": "我是{label}",
  "progress.identity.votes": "{count}次",
  "progress.identity.empty": "还没有累积的证据。从今天的誓言打卡开始吧。",
  "progress.evidence.title": "最近的证据",
  "progress.source.checkin": "誓言",
  "progress.source.deep": "全部刻下",
  "progress.source.goal": "目标",
  "progress.source.win": "小成就",
  "progress.source.mission": "任务",
  "progress.loadFailed": "无法加载进度。",

  // ── 重新承诺卡片 ──────────────────────────────────
  "recommit.title": "今天是重新开始的好日子",
  "recommit.body": "你坚持的{prev}天不会消失 · 最高{best}天。今天重新开始吧？",
  "recommit.freezeChip": "现在打卡，{count}个冰冻会接上你的连续记录",
  "recommit.cta": "立即打卡",
  "recommit.dismissAria": "关闭",

  // ── 誓言教练 ──────────────────────────────────────
  "coach.buttonAria": "获取 AI 教练建议",
  "coach.title": "教练建议",
  "coach.loading": "正在生成建议…",
  "coach.style.process": "过程",
  "coach.style.question": "提问",
  "coach.style.identity": "身份",
  "coach.failed": "无法加载建议。",
  "coach.quota": "今天的教练建议次数已用完，明天见。",

  // ── 今日誓言（每天只需一行，全部抄写为可选）──────────
  "affirmations.focus.title": "成功的未来的我",
  "affirmations.focus.rotation": "第 {index}/{total} 条",
  "affirmations.focus.hint": "把已经实现梦想的自己，生动地写下来。",
  "affirmations.focus.placeholder": "写得越多，那个未来越真实…",
  "affirmations.focus.expand": "刻下全部 {count} 行",
  "affirmations.focus.collapse": "只写今天这一行",
  "affirmations.focus.deepHint": "全部刻下，会多得一票身份证据。",
  "affirmations.focus.mismatch": "请与上面的句子逐字一致。",
  "affirmations.extra.mismatch": "有一行可以再看看 — 今天的打卡已经完成了。",

  // ── 打卡之后 ──────────────────────────────────────
  "checkin.reward.title": "今天你活成了那个人",
  "checkin.reward.streak": "连续第 {count} 天",
  "checkin.reward.evidence": "身份证据 +{count} · 我是{label}",
  "checkin.reward.evidencePlain": "身份证据 +{count}",
  "checkin.reward.deepBadge": "全部刻下",
  "checkin.reward.freeze": "{count} 块冰接上了空缺的日子",

  // ── 七日节律环 ────────────────────────────────────
  "rhythm.title": "本周节律",
  "rhythm.count": "{done}/{total}",
  "rhythm.footer": "过去 7 天里刻下了 {done} 天。",
  "rhythm.startCaption": "从你启程的那天开始计。",
  "rhythm.todayAria": "今天",

  // ── 每周回顾卡（周日晚，无需输入）──────────────────
  "weekly.title": "本周回顾",
  "weekly.checkinDays": "誓言 {count} 天",
  "weekly.wins": "小成就 {count} 件",
  "weekly.evidence": "证据 {count} 票",
  "weekly.topIdentity": "本周证明最多的自己 · 我是{label}",
  "weekly.empty": "这周记录不多。下次打卡我们重新开始计。",
  "weekly.footer": "不用填写 — 只要回望这 7 天。",

  // ── WOOP 快速设计（三次点击，无需键盘）─────────────
  "woop.quick.title": "快速设计",
  "woop.quick.pickGoal": "要为哪个目标设计？",
  "woop.quick.draftCta": "获取 3 份草稿",
  "woop.quick.drafting": "正在生成草稿…",
  "woop.quick.pickDraft": "选中喜欢的草稿，可以原样保存。",
  "woop.quick.saveDraft": "就这样保存",
  "woop.quick.manual": "我自己写",
  "woop.quick.outcomeLabel": "最好的结果",
  "woop.quick.obstacleLabel": "内心的阻碍",
  "woop.section.moreCta": "还有 {count} 个目标未设计",
  "woop.section.footerOne": "一次一个 — 做到一个，胜过写下三个。",

  // ── 首页折叠区块 ──────────────────────────────────
  "home.section.today": "今天的行动",
  "home.section.record": "今天的记录",
  "home.section.expandAria": "展开",
  "home.section.collapseAria": "收起",
  "home.wins.addRow": "再写一行",
  "home.record.footer": "写下的内容会自动保存。",
  "home.plans.manage": "管理执行设计",
  "home.plans.manageLocked": "管理目标",
  // 首页只留名言、今天的卡片和 7 天节奏环,其余全部折叠到这里。
  "home.section.more": "查看更多",
  "home.more.summary": "未来的我 · 记录 · 执行设计",

  // ── 今天的目标打卡(与誓言抄写同一张卡片)──
  "home.todayGoal.title": "今天的目标",
  "home.todayGoal.question": "今天做到了吗?",
  "home.todayGoal.did": "做到了",
  "home.todayGoal.notYet": "还没有",
  "home.todayGoal.doneToday": "今天已完成",
  "home.todayGoal.undo": "撤销",
  "home.todayGoal.empty": "还没有设定目标。",
  "home.todayGoal.setCta": "设定目标",
  "home.todayGoal.afterCheckin": "已经写下了。接下来只要告诉我们今天有没有真的做到。",

  // ── 未来的我(一行)──
  "home.futureLine.label": "未来的我",
  "home.futureLine.empty": "还没有写下任何内容。",
  "home.futureLine.write": "现在写",

  // ── 目标格子解锁 ──
  "goalSlot.unlock.title": "你又赢得了一个目标位",
  "goalSlot.unlock.body": "已经坚持 {days} 天。可以添加新目标,也可以把现在的目标写得更清楚。",
  "goalSlot.unlock.bodyGoal": "你已达成目标 {days} 天。可以添加新目标,也可以把现在的目标写得更清楚。",
  "goalSlot.unlock.addGoal": "添加新目标",
  "goalSlot.unlock.refine": "让现在的目标更具体",
  "goalSlot.unlock.later": "以后再说",
  "goalSlot.locked": "🔒 连续 {days} 天即可解锁",
  "goalSlot.lockedProgress": "目前 {progress} 天",
  "goalSlot.maxed": "最多 {max} 个目标。带得越少,越容易做到。",
  "goalSlot.hint": "守住一个,下一个格子就会打开。",

  // ── 成长阶段(累计证据票) ──
  "growth.title": "成长阶段",
  "growth.subtitle": "打卡、全文刻写、达成目标和做得好的事都会变成票,推动阶段成长。",
  "growth.votes": "{count}票",
  "growth.toNext": "距下一阶段还差 {count} 票",
  "growth.stage.0": "种子",
  "growth.stage.1": "新芽",
  "growth.stage.2": "茎干",
  "growth.stage.3": "枝叶",
  "growth.stage.4": "大树",
  "growth.stage.5": "森林",

  // ── 提升建议 ──
  "stepUp.title": "最近你坚持得很好",
  "stepUp.body": "要稍微提高一点吗?例如:{draft}",
  "stepUp.apply": "前往设置",
  "stepUp.later": "以后再说",

  // ── 目标具体化 ──
  "goal.specific.hint": "写得再具体一点,更容易坚持",
  "goal.specific.count": "数字",
  "goal.specific.cadence": "多久一次",
  "goal.specific.unit": "单位",
  "goal.specific.countExample": "30",
  "goal.specific.cadenceExample": "每天",
  "goal.specific.unitExample": "分钟",
  "goal.refine.title": "让目标更清楚",
  "goal.refine.subtitle": "点一下缺少的部分补进去。保持原样也没关系。",
  "goal.refine.apply": "改成这个目标",

  "settings.futureSelf.moreDetail": "写得更详细",

  // ── 只对「自动生成时代」的账号显示一次的提示(首页 DeclarationNudgeCard) ──
  "declarationNudge.title": "这一句和目标是同一句话",
  "declarationNudge.body":
    "以前我们会用目标自动生成每天要写的那一句。把它改写成「我已经是」,每天早上的感觉会不一样。",
  "declarationNudge.cta": "改写这一句",
  "declarationNudge.dismiss": "不用了",
};

export default dict;
