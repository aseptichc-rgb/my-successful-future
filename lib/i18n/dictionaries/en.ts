/**
 * English translation dictionary. Keys must mirror ko.ts exactly.
 */
import type { DictKey } from "./ko";

const dict: Record<DictKey, string> = {
  // Common
  "common.save": "Save",
  "common.saving": "Saving…",
  "common.saved": "Saved",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.next": "Next",
  "common.prev": "Back",
  "common.skip": "Skip",
  "common.add": "Add",
  "common.edit": "Edit",
  "common.done": "Done",
  "common.write": "Write",
  "common.delete": "Delete",
  "common.remove": "Remove",
  "common.loading": "Loading…",
  "common.error": "Error",
  "common.retry": "Retry",
  "common.unsavedChanges": "You have unsaved changes",
  "common.savedState": "Up to date",
  "common.saveFailed": "Failed to save.",
  "common.tryAgainLater": "Please try again in a moment.",

  // Language
  "language.title": "Choose your language",
  "language.subtitle": "한국어 · English · Español · 中文",
  "language.changeNote": "You can change this anytime in Settings.",
  "language.settings.title": "Language",
  "language.settings.subtitle":
    "The app and your daily card will be shown in this language.",
  "language.settings.note":
    "After you change the language, your next card will arrive in the new language.",

  // Onboarding
  // "My self 10 years from now" — immersive one-question-per-screen flow.
  "onboarding.futureSelf.sectionLabel": "Me, 10 years from now",
  "onboarding.futureSelf.progress": "{current} / {total}",
  "onboarding.progress.remaining": "{remaining} to go",
  "onboarding.progress.lastStep": "Last step",
  "onboarding.futureSelf.chooseHint": "Pick the one closest to you · or write your own",
  "onboarding.futureSelf.writeMyOwn": "Write my own",
  "onboarding.futureSelf.skipRest": "I'll fill in the rest later →",
  "onboarding.futureSelf.hint":
    "Be as concrete as it comes to you. If a question feels hard right now, leave it blank and move on.",
  "onboarding.futureSelf.daily.q": "10 years from now, how does an ordinary day of yours flow?",
  "onboarding.futureSelf.daily.placeholder":
    "Where you wake up, what fills your morning, how your evening winds down.",
  "onboarding.futureSelf.daily.example1":
    "I wake at 6 in a home with a river view, open the day with a workout, do deep work all morning, and spend evenings with my family.",
  "onboarding.futureSelf.daily.example2":
    "No commute — two hours of writing in my study with coffee, then an afternoon walk while I shape the next project.",
  "onboarding.futureSelf.daily.example3":
    "From my studio overlooking the sea, I lead my team over video in the morning, then cook dinner with my kid to the sound of waves.",
  "onboarding.futureSelf.work.q": "What work do you do then, and where do you stand among people?",
  "onboarding.futureSelf.work.placeholder":
    "Your role, your place on the team, why people come to you.",
  "onboarding.futureSelf.work.example1":
    "I lead a 10-person company, and people in the industry come to me first for advice.",
  "onboarding.futureSelf.work.example2":
    "I'm one of the top voices in my field, widening my reach through talks and writing.",
  "onboarding.futureSelf.work.example3":
    "I freelance on only the projects I choose — clients wait months just to work with me.",
  "onboarding.futureSelf.wealth.q": "What do your assets and finances look like?",
  "onboarding.futureSelf.wealth.placeholder":
    "Monthly income, what you've built up, where you live, the choices money no longer limits.",
  "onboarding.futureSelf.wealth.example1":
    "I built income that pays me $8,000 a month whether I work or not, and my home carries no mortgage.",
  "onboarding.futureSelf.wealth.example2":
    "I shop without checking price tags and plan trips by picking the dates first — my balance never makes me anxious.",
  "onboarding.futureSelf.wealth.example3":
    "I cover my parents' living costs every month and still take the whole family abroad twice a year.",
  "onboarding.futureSelf.family.q": "What is life with your family like?",
  "onboarding.futureSelf.family.placeholder":
    "The time you share, what you provide, the warmth of those bonds.",
  "onboarding.futureSelf.family.example1":
    "Weekend camping trips with the kids, and dinners where we trade stories of the day — no phones at the table.",
  "onboarding.futureSelf.family.example2":
    "Every spring I take my parents on a trip to see the blossoms, and my partner and I still keep our Friday date night.",
  "onboarding.futureSelf.family.example3":
    "In a house with a yard, the kids and the dog tumble around together, and once a month the whole family cooks one big meal.",
  "onboarding.futureSelf.achievements.q": "What have you achieved by then?",
  "onboarding.futureSelf.achievements.placeholder":
    "Things you've built, goals you've reached, the wins you're proudest of.",
  "onboarding.futureSelf.achievements.example1":
    "A book with my name on it, and a service 10,000 people use.",
  "onboarding.futureSelf.achievements.example2":
    "Starting from nothing, I built a debt-free home and a solid business.",
  "onboarding.futureSelf.achievements.example3":
    "I reached financial freedom, and a scholarship in my name now funds ten students' dreams every year.",
  "onboarding.futureSelf.respect.q": "How do people see you, and what do they respect you for?",
  "onboarding.futureSelf.respect.placeholder":
    "The trust, reputation, and respect people give you — and why.",
  "onboarding.futureSelf.respect.example1":
    "People say my word can be trusted — before big decisions, they ask for my take first.",
  "onboarding.futureSelf.respect.example2":
    "Younger colleagues reach out saying they want to become like me, and I gladly make time to show them the way.",
  "onboarding.futureSelf.respect.example3":
    "I'm remembered for steadiness over flash — 'the one who showed up every single day for ten years.'",
  "onboarding.futureSelf.growth.q": "How are your body and mind, and how are you still growing?",
  "onboarding.futureSelf.growth.placeholder":
    "Your health, what you're learning, the ways you keep moving forward.",
  "onboarding.futureSelf.growth.example1":
    "A 5km run every morning still feels light, I read 50 books a year, and I keep stepping into new fields.",
  "onboarding.futureSelf.growth.example2":
    "A steady mind built through meditation, and a new language good enough to chat with locals when I travel.",
  "onboarding.futureSelf.growth.example3":
    "I'm healthier than in my twenties, learning an instrument on weekends — a little better than yesterday, every day.",

  "onboarding.step2.title": "Write the concrete actions you need to reach your goals",
  "onboarding.step2.subtitle":
    "Your top 3 goals appear on the daily card and on the lock screen — listed in order of priority.",
  "onboarding.step2.placeholder": "e.g., Read for 30 minutes every day",
  "onboarding.step2.addGoal": "+ Add a goal",
  "onboarding.step2.removeGoalAria": "Remove this goal",

  "onboarding.step3.title": "Write a one-line affirmation of your future self",
  "onboarding.step3.subtitle":
    "Your affirmations show as faint placeholder text on each daily card. Type them again, exactly, to build a streak. Leave it empty if you'd like — you can add them later in Settings.",

  "onboarding.step4.cta": "Get today's quote →",
  "onboarding.step4.preparing": "Preparing…",

  "onboarding.step5.titleLoading": "Crafting today's quote for you…",
  "onboarding.step5.titleDone": "Every morning, your day ten years from now comes vividly to life.",
  "onboarding.step5.subtitleLoading": "Just a moment.",
  "onboarding.step5.subtitleDone":
    "The lock-screen widget shows a different line each day. Install the Android app to add the widget.",
  "onboarding.step5.todayLabel": "TODAY'S LINE",
  "onboarding.step5.missionLabel": "TODAY'S MISSION",
  "onboarding.step5.missionIdentityPrefix": "I am",
  "onboarding.step5.missionFooter":
    "Answer this single line in Home and your identity grows one step at a time.",
  "onboarding.step5.previewError":
    "Couldn't generate the preview. You can try again from Home after starting.",
  "onboarding.step5.widgetTitle": "How to add the widget on Android",
  "onboarding.step5.widgetStep1": "1. Long-press an empty spot on your home screen",
  "onboarding.step5.widgetStep2": "2. \"Widgets\" → search Anima",
  "onboarding.step5.widgetStep3":
    "3. Add it to your lock screen — a fresh line arrives every day",
  "onboarding.step5.start": "Start",
  "onboarding.step5.finishing": "Finishing…",
  "onboarding.step5.portraitLabel": "ME, 10 YEARS FROM NOW",
  "onboarding.step5.portraitLoading": "Painting the you of 10 years from now…",
  "onboarding.step5.portraitError":
    "Couldn't create your future portrait. You can make it again from Home after starting.",

  "onboarding.saveError": "Failed to save.",
  "onboarding.category.philosophy": "Philosophy",
  "onboarding.category.entrepreneur": "Entrepreneur",
  "onboarding.category.classic": "Classic",
  "onboarding.category.leader": "Leader",
  "onboarding.category.scientist": "Scientist",
  "onboarding.category.literature": "Literature",

  // Home
  "home.title": "Today's motivation",
  "home.subtitle": "Start the day with a fresh line written for you.",
  "home.dateFormat": "{month}/{day}/{year}",
  "home.settingsAria": "Settings",
  "home.tab.future": "Future me",
  "home.tab.actions": "Today's actions",

  "home.future.title": "You, 10 years from now",
  "home.future.subtitle":
    "The more specific the future you, the sharper the daily line you'll receive.",
  "home.future.empty": "Nothing written yet. You can write it in Settings.",
  "home.future.saveAndRegen": "Save and regenerate today's card",
  "home.future.saveFailed": "Failed to save your future self",

  // "Me, 10 years from now" portrait card
  "futureSelf.portrait.headerLabel": "ME, 10 YEARS FROM NOW",
  "futureSelf.portrait.loading": "Painting the you of 10 years from now…",
  "futureSelf.portrait.error": "Couldn't paint your future portrait.",
  "futureSelf.portrait.regenerate": "Repaint the portrait",
  "futureSelf.portrait.regenerating": "Repainting…",

  "home.goals.title": "Today's actions toward your goals",
  "home.goals.subtitle":
    "One small action that moves you toward the future you.",
  "home.goals.todayProgress": "Today {done}/{total}",
  "home.goals.placeholder": "e.g., Read for 30 minutes every day",
  "home.goals.maxAlert": "You can add up to {max} goals.",
  "home.goals.deleteAria": "Delete goal",
  "home.goals.toggleAchievedAria": "Mark as done today",
  "home.goals.toggleUnachievedAria": "Undo done",
  "home.goals.toggleAchievedTitle": "Mark as done today",
  "home.goals.toggleUnachievedTitle": "Done today — click to undo",
  "home.goals.saveFailed": "Failed to save your goals.",

  "home.wins.title": "{max} wins for yourself today",
  "home.wins.subtitle":
    "Even small things count. Save them and you'll find them by date later.",
  "home.wins.history": "View past entries",
  "home.wins.placeholder1": "e.g., I replied to that email I'd been putting off.",
  "home.wins.placeholder2": "e.g., I walked for 10 minutes in the morning.",
  "home.wins.placeholder3": "e.g., I said something kind to my family.",
  "home.wins.saveFailed": "Failed to save. Please try again in a moment.",

  // MotivationCard
  "motivation.wallpaper.goalsLabel": "My goals",
  "motivation.wallpaper.watermark": "Anima · Future me",
  "motivation.wallpaper.download": "Save as wallpaper",
  "motivation.wallpaper.downloading": "Saving…",
  "motivation.wallpaper.downloadFailed": "Failed to save the image.",
  "motivation.regenerating": "Regenerating…",
  "motivation.headerTodayLabel": "Today's line",
  "motivation.responseEmpty": "Write a single line.",
  "motivation.responsePlaceholder": "Answer in one line (60 chars)",
  "motivation.responseEdited": "Response updated",
  "motivation.responseToast": "+1 — you are [{tag}]",
  "motivation.preparingCard": "Preparing your motivation card…",
  "motivation.loading": "Crafting today's line…",
  "motivation.error.title": "Couldn't make today's card",
  "motivation.regenerate": "Get another",
  "motivation.todayLabel": "TODAY'S LINE",
  "motivation.missionLabel": "TODAY'S MISSION",
  "motivation.missionPlaceholder": "Answer in one line…",
  "motivation.submit": "Save",
  "motivation.submitting": "Saving…",
  "motivation.alreadyAnsweredToday":
    "You answered today — your next line arrives tomorrow.",
  "motivation.firstResponseToast":
    "Your identity \"I am {tag}\" grew by 1 step today.",
  "motivation.editResponse": "Edit response",
  "motivation.identityPrefix": "I am",
  "motivation.affirmations.title": "One step closer to the future you",
  "motivation.affirmations.streak": "{count}-day streak",
  "motivation.affirmations.placeholder": "Type the line above, exactly",
  "motivation.affirmations.checkin": "Engrave today's affirmations",
  "motivation.affirmations.checkingIn": "Engraving…",
  "motivation.affirmations.matched":
    "Engraved for today. {count} days in a row!",
  "motivation.affirmations.mismatched":
    "Every character must match. Please copy the line above exactly.",
  "motivation.affirmations.alreadyToday":
    "Already engraved today. See you tomorrow.",
  "motivation.affirmations.empty":
    "Add affirmations in Settings to copy them daily and build a streak.",

  // ── Future daily vision (a day living the dream) ──
  "futureVision.headerLabel": "Today, a day living that dream",
  "futureVision.loading": "Painting your future day…",
  "futureVision.error": "Couldn't paint your future day.",
  "futureVision.regenerate": "See another day",
  "futureVision.regenerating": "Painting another day…",
  "futureVision.reveal": "Unfold today",
  "futureVision.empty.title": "First, picture your future self",
  "futureVision.empty.body":
    "Write a paragraph about who you want to become in 10 years, and each day I'll paint that dream-come-true day before your eyes.",
  "futureVision.empty.cta": "Write your future self",

  // Settings
  "settings.title": "Settings",
  "settings.subtitle":
    "Manage your future self, daily affirmations, today's actions, and quote curation in one place.",
  "settings.future.title": "You, 10 years from now",
  "settings.future.subtitle":
    "Your daily line is built from this paragraph.",
  "settings.futureSelf.legacyNote":
    "This is what you wrote before. Answering the questions above and saving will replace it.",
  "settings.affirmations.title": "One step closer to the future you",
  "settings.affirmations.subtitle":
    "Shown faintly above each daily card. Type each line back exactly to extend your streak by 1.",
  "settings.goals.title": "Today's actions toward your goals",
  "settings.goals.subtitle":
    "One small action that moves you toward the future you.",
  "settings.goals.empty":
    "Add goals from the Home screen and you'll be able to edit them here.",
  "settings.quote.title": "Quote curation",
  "settings.quote.subtitle":
    "Leave it empty for weekly auto-rotation, or pin a person and pick how often they appear.",
  "settings.quote.pinAuthor": "Pin a person",
  "settings.quote.noPin": "— No pin (weekly rotation) —",
  "settings.quote.daysLabel": "Pinned days per week:",
  "settings.quote.daysOff": "Off",
  "settings.quote.daysEveryday": "Every day",
  "settings.quote.daysPerWeek": "{n} days/week",
  "settings.account.title": "Account",
  "settings.account.signOut": "Sign out",
  "settings.account.delete": "Delete account",
  "settings.account.delete.subtitle": "Permanently removes your profile, affirmations, and history. This cannot be undone.",
  "settings.account.delete.confirmTitle": "Delete your account?",
  "settings.account.delete.confirmBody":
    "Your future self, daily affirmations, and wins log will be erased.\nReceipts will be cleared too. You can sign up again with the same email later.",
  "settings.account.delete.confirmInputLabel": "Type \"delete\" below to confirm.",
  "settings.account.delete.confirmInputKeyword": "delete",
  "settings.account.delete.confirmCancel": "Cancel",
  "settings.account.delete.confirmConfirm": "Delete permanently",
  "settings.account.delete.deleting": "Deleting…",
  "settings.account.delete.failed": "Failed to delete account. Please try again shortly.",

  // Auth
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.displayName": "Name",
  "auth.signIn": "Sign in",
  "auth.signUp": "Sign up",
  "auth.signInWithGoogle": "Continue with Google",
  "auth.continueWithGoogle": "Continue with Google",
  "auth.continueWithApple": "Continue with Apple",
  "auth.or": "or",
  "auth.noAccount": "First time here?",
  "auth.signingIn": "Signing in…",
  "auth.signingUp": "Creating account…",
  "auth.signIn.title": "Welcome back",
  "auth.signIn.subtitle":
    "Where a daily line from your 10-years-from-now self arrives.",
  "auth.signIn.noAccount": "First time here?",
  "auth.signIn.toSignUp": "Sign up",
  "auth.signUp.title": "Meet the you 10 years ahead",
  "auth.signUp.subtitle": "Get your first daily line right now.",
  "auth.signUp.haveAccount": "Already have an account?",
  "auth.signUp.toSignIn": "Sign in",
  "auth.error.invalidEmail": "Please check the email format.",
  "auth.error.invalidPassword": "Password must be at least 6 characters.",
  "auth.error.requireDisplayName": "Please enter your name.",
  "auth.error.generic": "Something went wrong. Please try again.",
  "auth.error.emailInUse": "This email is already registered. Please sign in instead.",
  "auth.error.invalidCredentials": "Incorrect email or password.",
  "auth.error.tooManyRequests": "Too many attempts. Please try again later.",
  "auth.error.network": "Please check your network connection.",
  "auth.link.title": "Link Google account",
  "auth.link.description": "{email} is already registered with email/password. Enter your password to link this Google account so you can use either method from now on.",
  "auth.link.submit": "Link and sign in",
  "auth.link.cancel": "Cancel",
  "auth.link.failed": "Couldn't link the account. Please check your password.",
  "auth.link.apple.title": "Link Apple account",
  "auth.link.apple.description": "{email} is already registered with email/password. Enter your password to link this Apple account so you can use either method from now on.",
  "auth.password.placeholder": "At least 6 characters",
  "auth.displayName.placeholder": "Display name",

  // Wins history
  "wins.history.title": "Your wins, by day",
  "wins.history.subtitle":
    "Every small line, gathered — your own quiet record over time.",
  "wins.history.empty": "Nothing written yet.",
  "wins.history.back": "← Back to home",
  "wins.history.loadFailed": "Failed to load your entries.",

  // Affirmations editor
  "affirmations.editor.placeholder":
    "e.g., I am a successful entrepreneur with assets over $1 billion.",
  "affirmations.editor.add": "+ Add affirmation",
  "affirmations.editor.removeAria": "Remove this affirmation",
  "affirmations.editor.maxNote":
    "Up to {max} entries, {len} characters per line.",

  // Billing
  "billing.trialBanner": "{days} days left in trial",
  "billing.trialEnded": "Your free trial has ended.",
  "billing.upgrade": "Upgrade",

  // Apple iOS redesign — settings/auth/legal/common additions
  "auth.signOut": "Sign out",
  "common.deleting": "Deleting…",
  "common.empty": "Empty",
  "common.none": "None",
  "common.set": "Set",
  "legal.privacy": "Privacy Policy",
  "legal.terms": "Terms of Service",
  "settings.profile.header": "Profile",
  "settings.affirmations.header": "Daily affirmations",
  "settings.quote.header": "Card",
  "settings.quote.pinnedAuthor": "Pinned author",
  "settings.language.header": "Language",
  "settings.account.header": "Account",
  "settings.account.deleteConfirm":
    "All your data will be permanently deleted. Type \"DELETE\" below to confirm.",
  "settings.streakLabel": "STREAK {count}",

  // Anima Pro (in-app purchase)
  "settings.pro.header": "ANIMA PRO",
  "settings.pro.footerActive": "All features are unlocked.",
  "settings.pro.footerInactive": "One-time purchase, lifetime access · No ads",
  "settings.pro.active": "Anima Pro active",
  "settings.pro.buy": "Buy lifetime access",
  "settings.pro.processing": "Processing…",
  "settings.pro.restore": "Restore purchase",
  "settings.pro.restoring": "Restoring…",
  "settings.pro.purchaseDone.title": "Purchase complete",
  "settings.pro.purchaseDone.desc": "Your Anima Pro purchase is complete. Thank you!",
  "settings.pro.pending.title": "Awaiting approval",
  "settings.pro.pending.desc": "Your payment is awaiting approval. It will be applied automatically once approved.",
  "settings.pro.purchaseFailed.title": "Payment failed",
  "settings.pro.purchaseFailed.desc": "The payment failed.",
  "settings.pro.purchaseIncomplete.title": "Purchase not completed",
  "settings.pro.purchaseIncomplete.desc":
    "The purchase didn’t complete. If you already bought it, tap ‘Restore purchase’ below.",
  "settings.pro.restoreDone.title": "Restore complete",
  "settings.pro.restoreDone.desc": "Your purchase has been restored.",
  "settings.pro.restoreNone.title": "Nothing to restore",
  "settings.pro.restoreNone.desc": "No previous purchases were found.",

  // ── WOOP execution plans (if-then) ────────────────
  "woop.section.title": "Execution plans (if-then)",
  "woop.section.footer": "Naming your obstacle in advance dramatically raises follow-through.",
  "woop.section.designCta": "Design",
  "woop.sheet.title": "Execution plan",
  "woop.step.wish": "Goal",
  "woop.step.outcome": "Best outcome",
  "woop.step.obstacle": "Inner obstacle",
  "woop.step.plan": "If-then plan",
  "woop.wish.hint": "Which goal is this plan for?",
  "woop.wish.empty": "Add a monthly goal in Settings first.",
  "woop.outcome.hint": "What does the best moment look like when you achieve this goal?",
  "woop.outcome.placeholder": "e.g. Picturing myself having done it makes my heart race",
  "woop.obstacle.hint": "What INNER obstacle blocks the way? Look inside your mind, not at circumstances.",
  "woop.obstacle.placeholder": "e.g. By evening I'm tired and want to put it off",
  "woop.obstacle.suggest": "Get AI suggestions",
  "woop.obstacle.suggesting": "Creating suggestions…",
  "woop.plan.ifLabel": "If",
  "woop.plan.thenLabel": "Then",
  "woop.plan.ifPlaceholder": "when the obstacle moment comes",
  "woop.plan.thenPlaceholder": "I will do this",
  "woop.identity.pickLabel": "Identity this practice reinforces",
  "woop.save": "Save",
  "woop.saving": "Saving…",
  "woop.delete": "Delete",
  "woop.saveFailed": "Couldn't save the execution plan.",
  "woop.suggestFailed": "Couldn't load suggestions.",

  // ── Today's if-then card (morning mode) ───────────
  "plan.today.title": "Today's if-then",
  "plan.today.if": "If",
  "plan.today.then": "Then",
  "plan.today.emptyCta": "Create today's execution plan",
  "plan.today.firstAction": "The first action last-night-me chose",

  // ── Evening mode: tomorrow's first action ─────────
  "home.evening.firstAction.title": "One first action for tomorrow",
  "home.evening.firstAction.placeholder": "The small action you'll do first tomorrow morning",
  "home.evening.firstAction.footer": "Writing it down quiets your mind overnight · auto-saved",

  // ── Progress (/progress) ──────────────────────────
  "progress.title": "Progress",
  "progress.back": "← Home",
  "progress.chipAria": "View progress",
  "progress.streak.current": "Current streak",
  "progress.streak.days": "{count} days",
  "progress.streak.best": "Best {count} days",
  "progress.freeze.label": "Freezes left this month",
  "progress.freeze.desc": "Miss a day and a freeze bridges your streak automatically ({max}/month)",
  "progress.heatmap.title": "Last 30 days",
  "progress.consistency": "Consistency {pct}%",
  "progress.identity.title": "Identity evidence ledger",
  "progress.identity.subtitle": "Every action is a vote for the person you're becoming.",
  "progress.identity.iAm": "I am {label}",
  "progress.identity.votes": "{count}×",
  "progress.identity.empty": "No evidence yet. Start with today's affirmation check-in.",
  "progress.evidence.title": "Recent evidence",
  "progress.source.checkin": "Affirmation",
  "progress.source.goal": "Goal",
  "progress.source.win": "Win",
  "progress.source.mission": "Mission",
  "progress.loadFailed": "Couldn't load your progress.",

  // ── Recommit card (self-compassionate return) ─────
  "recommit.title": "Today is a good day to begin again",
  "recommit.body":
    "Your {prev}-day run isn't erased · best {best} days. Shall we start again today?",
  "recommit.freezeChip": "Check in now and {count} freeze(s) will bridge your streak",
  "recommit.cta": "Check in now",
  "recommit.dismissAria": "Dismiss",

  // ── Affirmation coach ─────────────────────────────
  "coach.buttonAria": "Get AI coach suggestions",
  "coach.title": "Coach suggestions",
  "coach.loading": "Creating suggestions…",
  "coach.style.process": "Process",
  "coach.style.question": "Question",
  "coach.style.identity": "Identity",
  "coach.failed": "Couldn't load suggestions.",
  "coach.quota": "You've used today's coach suggestions. See you tomorrow.",
};

export default dict;
