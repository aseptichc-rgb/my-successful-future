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
  "onboarding.futureSelf.sectionLabel": "十年后的我",
  "onboarding.futureSelf.progress": "{current} / {total}",
  "onboarding.progress.remaining": "还剩 {remaining} 个",
  "onboarding.progress.lastStep": "最后一步",
  "onboarding.futureSelf.chooseHint": "选择最接近你的一项 · 也可以自己写",
  "onboarding.futureSelf.writeMyOwn": "自己填写",
  "onboarding.futureSelf.skipRest": "其余的稍后再填 →",
  "onboarding.futureSelf.hint":
    "想到什么就具体写下来。现在难以回答的问题,可以留空跳过。",
  "onboarding.futureSelf.daily.q": "10 年后,你平常的一天是怎样度过的?",
  "onboarding.futureSelf.daily.placeholder":
    "在哪里醒来、上午做什么、傍晚如何度过。",
  "onboarding.futureSelf.daily.example1":
    "在能看到江景的家里 6 点醒来,先锻炼开启一天,上午专注工作,晚上陪伴家人。",
  "onboarding.futureSelf.daily.example2":
    "不用通勤的早晨,在书房伴着咖啡写作两小时,下午散步构思下一个项目。",
  "onboarding.futureSelf.daily.example3":
    "在看得见海的工作室里,上午通过视频带领团队,下午听着海浪声和孩子一起做晚饭。",
  "onboarding.futureSelf.work.q": "那时你在做什么工作,在人们中处于怎样的位置?",
  "onboarding.futureSelf.work.placeholder":
    "职业与角色、在团队中的位置、人们来找你的原因。",
  "onboarding.futureSelf.work.example1":
    "我经营着一家 10 人的公司,业内的人有事会先来找我请教。",
  "onboarding.futureSelf.work.example2":
    "我成为所在领域的代表声音之一,通过演讲与写作扩大影响力。",
  "onboarding.futureSelf.work.example3":
    "我自由执业,只接自己想做的项目——客户宁愿等上几个月也要和我合作。",
  "onboarding.futureSelf.wealth.q": "你的资产和经济状况如何?",
  "onboarding.futureSelf.wealth.placeholder":
    "月收入、积累的资产、住的房子、金钱不再限制的选择。",
  "onboarding.futureSelf.wealth.example1":
    "我建立了不工作也每月进账 5 万元的收入系统,住在没有贷款的自己的房子里。",
  "onboarding.futureSelf.wealth.example2":
    "买东西不看价签,旅行先定日期再定预算——账户余额从不让我焦虑。",
  "onboarding.futureSelf.wealth.example3":
    "每月给父母生活费,仍有余力一年带全家出国旅行两次。",
  "onboarding.futureSelf.family.q": "与家人在一起的生活是什么样子?",
  "onboarding.futureSelf.family.placeholder":
    "一起度过的时光、你为他们做的事、关系的温度。",
  "onboarding.futureSelf.family.example1":
    "每个周末带孩子去露营,晚餐桌上不碰手机,彼此分享一天的故事。",
  "onboarding.futureSelf.family.example2":
    "每年春天带父母去看花,和伴侣依然保留着每周五的二人约会。",
  "onboarding.futureSelf.family.example3":
    "在带院子的房子里,孩子和狗一起奔跑,每月一次全家人聚在一起做一顿大餐。",
  "onboarding.futureSelf.achievements.q": "到那时你已经取得了哪些成就?",
  "onboarding.futureSelf.achievements.placeholder":
    "你创造的东西、达成的目标、最自豪的成就。",
  "onboarding.futureSelf.achievements.example1":
    "出版了署名的书,做出了 1 万人在用的服务。",
  "onboarding.futureSelf.achievements.example2":
    "白手起家,拥有了无贷款的房子和稳固的事业。",
  "onboarding.futureSelf.achievements.example3":
    "实现了财务自由,以我名字设立的奖学金每年资助 10 名学生的梦想。",
  "onboarding.futureSelf.respect.q": "人们如何看待你,尊敬你哪些方面?",
  "onboarding.futureSelf.respect.placeholder":
    "周围人给予你的信任、声誉与尊敬,以及原因。",
  "onboarding.futureSelf.respect.example1":
    "大家都说'这个人的话可以信'——遇到重要决定,人们会先来问我的看法。",
  "onboarding.futureSelf.respect.example2":
    "后辈们说'想成为你这样的人'而来找我,我也乐意抽时间为他们指路。",
  "onboarding.futureSelf.respect.example3":
    "人们记住我的不是耀眼,而是坚持——'十年如一日做到的人'。",
  "onboarding.futureSelf.growth.q": "你的身心状态如何,又在如何继续成长?",
  "onboarding.futureSelf.growth.placeholder":
    "健康状况、正在学习的东西、持续前进的样子。",
  "onboarding.futureSelf.growth.example1":
    "每天清晨跑 5 公里依然轻松,一年读 50 本书,不断挑战新的领域。",
  "onboarding.futureSelf.growth.example2":
    "通过冥想练就沉稳的内心,新学的外语已能在旅行时与当地人畅聊。",
  "onboarding.futureSelf.growth.example3":
    "保持着比二十多岁更健康的身体,周末学习乐器,每天都比昨天更好一点。",

  "onboarding.step2.title": "写下实现目标所需的具体行动",
  "onboarding.step2.subtitle":
    "前 3 个目标会显示在每日卡片与锁屏上,按优先级排列。",
  "onboarding.step2.placeholder": "例:每天读书 30 分钟",
  "onboarding.step2.addGoal": "+ 添加目标",
  "onboarding.step2.removeGoalAria": "移除该目标",

  "onboarding.step3.title": "把那个成功的自己,一行行写下来",
  "onboarding.step3.subtitle":
    "你写下的誓言,每天会作为浅色提示文字出现在卡片上。原样照抄,可以累计连续天数。也可以留空——之后在「设置」里随时添加。",

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
  "home.tab.future": "未来的我",
  "home.tab.actions": "今日行动",

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
};

export default dict;
