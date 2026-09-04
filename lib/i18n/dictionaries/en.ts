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

  // Boot splash — the first line the app shows on cold start
  "splash.eyebrow": "YOUR FUTURE IS WHAT YOU BELIEVE",
  "splash.lead": "Your future becomes what you",
  "splash.accent": "believe.",

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
  "onboarding.futureSelf.sectionLabel": "What I actually want",
  "onboarding.progress.remaining": "{remaining} to go",
  "onboarding.progress.lastStep": "Last step",
  "onboarding.futureSelf.dream.q": "What is the dream you truly want to reach?",
  "onboarding.futureSelf.dream.hint": "Just one. No one else will read this.",
  "onboarding.futureSelf.dream.placeholder":
    "e.g. By 2035, grow a brand in my own name to $10M a year with a team of 20, work four days a week from a house by the ocean, and take a month abroad with my kid every year.",
  "onboarding.futureSelf.dream.why":
    "Numbers, dates, names — the more concrete, the better. This dream decides today's step and every line you get.",
  "onboarding.futureSelf.daily.q": "Once that dream is real, how does an ordinary day of yours flow?",
  "onboarding.futureSelf.daily.placeholder":
    "Where you wake up, what fills your morning, how your evening winds down.",
  "onboarding.futureSelf.work.q": "What work do you do then, and where do you stand among people?",
  "onboarding.futureSelf.work.placeholder":
    "Your role, your place on the team, why people come to you.",
  "onboarding.futureSelf.wealth.q": "What do your assets and finances look like?",
  "onboarding.futureSelf.wealth.placeholder":
    "Monthly income, what you've built up, where you live, the choices money no longer limits.",
  "onboarding.futureSelf.family.q": "What is life with your family like?",
  "onboarding.futureSelf.family.placeholder":
    "The time you share, what you provide, the warmth of those bonds.",
  "onboarding.futureSelf.achievements.q": "What have you achieved by then?",
  "onboarding.futureSelf.achievements.placeholder":
    "Things you've built, goals you've reached, the wins you're proudest of.",
  "onboarding.futureSelf.respect.q": "How do people see you, and what do they respect you for?",
  "onboarding.futureSelf.respect.placeholder":
    "The trust, reputation, and respect people give you — and why.",
  "onboarding.futureSelf.growth.q": "How are your body and mind, and how are you still growing?",
  "onboarding.futureSelf.growth.placeholder":
    "Your health, what you're learning, the ways you keep moving forward.",

  // Step 2 personalized suggestions — drawn from the dream written in Step 1.
  "onboarding.suggest.loading":
    "Reading the dream you just wrote, picking lines that fit you…",
  "onboarding.suggest.personalized": "Drawn from the dream you just wrote",

  // Step 2, top field — a first-person line in the present tense. Copied every day.
  "onboarding.declaration.title": "The you who reached that dream, in one line",
  "onboarding.declaration.subtitle":
    "Write it as someone who is already there. This is the line you'll copy each day.",
  "onboarding.declaration.example1": "I am someone money never chases",
  "onboarding.declaration.example2": "I am someone strong in body and mind",
  "onboarding.declaration.example3": "I am someone whose work helps others",
  "onboarding.declaration.placeholder": "I am someone who…",
  "onboarding.declaration.writeMyOwn": "Write my own",

  // Step 2, bottom field — today's action toward that person. Independent of the line above.
  "onboarding.goal.title": "One thing today, to move toward that dream",
  "onboarding.goal.subtitle":
    "One is enough. Keep it up and you'll earn room for another goal.",
  "onboarding.goal.placeholder": "read 30 pages every day and write one line about it",
  "onboarding.goal.hint":
    "Write it as an action you either did or didn't do today — that's what makes it checkable.",
  // Static fallbacks, used only when there is no personalized suggestion.
  // Each carries a number, a cadence and a countable unit (see lib/goalQuality).
  "onboarding.goal.example1": "Read 20 pages every morning and note one line",
  "onboarding.goal.example2": "Write tomorrow's 3 tasks every night in 10 min",
  "onboarding.goal.example3": "Walk 30 minutes 4 times weekly and log it",
  "onboarding.goal.pickOne":
    "Pick just one. You don't need several on day one — repeating that single one every day is the whole thing.",

  "onboarding.step4.cta": "Get today's quote →",
  "onboarding.step4.preparing": "Preparing…",

  "onboarding.step5.titleLoading": "Crafting today's quote for you…",
  "onboarding.step5.titleDone": "Every morning, the day your dream comes true unfolds before you.",
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
  "onboarding.step5.portraitLabel": "ME, LIVING THE DREAM",
  "onboarding.step5.portraitLoading": "Painting the you who's living the dream…",
  "onboarding.step5.portraitError":
    "Couldn't create that portrait. You can make it again from Home after starting.",

  "onboarding.saveError": "Failed to save.",
  "onboarding.category.philosophy": "Philosophy",
  "onboarding.category.entrepreneur": "Entrepreneur",
  "onboarding.category.classic": "Classic",
  "onboarding.category.leader": "Leader",
  "onboarding.category.scientist": "Scientist",
  "onboarding.category.literature": "Literature",

  // Home
  "home.title": "Today's step",
  "home.subtitle": "One step today, and the dream is that much closer.",
  "home.dateFormat": "{month}/{day}/{year}",
  "home.settingsAria": "Settings",

  "home.future.title": "The dream I'm going after",
  "home.future.subtitle":
    "The more specific your dream, the sharper today's step and today's line.",
  "home.future.empty": "No dream written yet. You can write it in Settings.",
  "home.future.saveAndRegen": "Save and regenerate today's card",
  "home.future.saveFailed": "Failed to save your dream",

  // "Me, 10 years from now" portrait card
  "futureSelf.portrait.headerLabel": "ME, LIVING THE DREAM",
  "futureSelf.portrait.loading": "Painting the you who's living the dream…",
  "futureSelf.portrait.error": "Couldn't paint that portrait.",
  "futureSelf.portrait.regenerate": "Repaint the portrait",
  "futureSelf.portrait.regenerating": "Repainting…",

  "home.goals.title": "Today's action toward your dream",
  "home.goals.subtitle":
    "One small action that moves you a step closer to your dream.",
  "home.goals.todayProgress": "Today {done}/{total}",
  "home.goals.placeholder": "e.g., Try 1 thing I've never done, every day",
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
  "motivation.wallpaper.watermark": "Anima · My dream",
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
  "motivation.affirmations.title": "One step closer to your dream",
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
    "Write your dream affirmations in Settings to copy them daily and build a streak.",

  // ── Future daily vision (a day living the dream) ──
  "futureVision.headerLabel": "Today, a day living that dream",
  "futureVision.loading": "Painting the day your dream is real…",
  "futureVision.error": "Couldn't paint that day.",
  "futureVision.regenerate": "See another day",
  "futureVision.regenerating": "Painting another day…",
  "futureVision.reveal": "Unfold today",
  "futureVision.empty.title": "First, write down your dream",
  "futureVision.empty.body":
    "Write a paragraph about the dream you're going after, and each day I'll paint the day it comes true, right before your eyes.",
  "futureVision.empty.cta": "Write my dream",

  // Settings
  "settings.title": "Settings",
  "settings.subtitle":
    "Manage your dream, daily affirmations, today's action, and quote curation in one place.",
  "settings.future.title": "The dream I'm going after",
  "settings.future.subtitle":
    "Today's action and your daily line are both built from this dream.",
  "settings.futureSelf.legacyNote":
    "This is what you wrote before. Answering the questions above and saving will replace it.",
  "settings.affirmations.title": "One step closer to your dream",
  "settings.affirmations.subtitle":
    "Shown faintly above each daily card. Type each line back exactly to extend your streak by 1.",
  "settings.goals.title": "Today's action toward your dream",
  "settings.goals.subtitle":
    "One small action that moves you a step closer to your dream.",
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
    "Your dream, daily affirmations, and wins log will be erased.\nReceipts will be cleared too. You can sign up again with the same email later.",
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
    "Where your dream gets one step closer, every day.",
  "auth.signIn.noAccount": "First time here?",
  "auth.signIn.toSignUp": "Sign up",
  "auth.signUp.title": "Let's go make your dream real",
  "auth.signUp.subtitle": "Write one line about your dream — we'll turn it into today's first step.",
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
    "Every small line, gathered — proof you moved toward the dream.",
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
  "billing.paywall.title": "This one needs lifetime access",
  "billing.paywall.desc":
    "Your daily card, widget, and affirmation check-in stay free. One lifetime purchase unlocks AI cards personalized to you, plus your future vision.",
  "billing.paywall.cta": "See lifetime access",
  "billing.paywall.restore": "Already purchased · Restore",
  "billing.paywall.webNotice":
    "Purchases are made in the iPhone or Android app. Sign in there and it applies to this same account.",
  "billing.paywall.goSettings": "Go to Settings",
  "billing.paywall.dismiss": "Keep using it free",

  // Apple iOS redesign — settings/auth/legal/common additions
  "auth.signOut": "Sign out",
  "common.deleting": "Deleting…",
  "common.empty": "Empty",
  "common.none": "None",
  "common.set": "Set",
  "legal.privacy": "Privacy Policy",
  "legal.terms": "Terms of Service",
  "settings.profile.header": "Profile",
  "settings.affirmations.header": "Dream affirmations",
  "settings.quote.header": "Card",
  "settings.quote.pinnedAuthor": "Pinned author",
  "settings.language.header": "Language",
  "settings.account.header": "Account",
  "settings.account.deleteConfirm":
    "All your data will be permanently deleted. Type \"DELETE\" below to confirm.",
  "settings.streakLabel": "STREAK {count}",

  // Notification settings (local reminders)
  "settings.notifications.header": "Notifications",
  "settings.notifications.row": "Daily reminders",
  "settings.notifications.off": "Off",
  "settings.notifications.footer":
    "Reminders are scheduled on this device only. At most 2 a day — never for things you've already done.",
  "settings.notifications.morning.title": "Morning affirmation reminder",
  "settings.notifications.morning.desc": "A cue to open the day by writing your dream declaration.",
  "settings.notifications.evening.title": "Evening check-in reminder",
  "settings.notifications.evening.desc": "Arrives only if today's goal isn't checked yet.",
  "settings.notifications.weekly.title": "Sunday review",
  "settings.notifications.weekly.desc": "An evening nudge when your weekly review is ready.",
  "settings.notifications.pending.title": "Unfinished setup nudges",
  "settings.notifications.pending.desc":
    "Only on evenings when you've already finished today — twice a week at most.",
  "settings.notifications.time": "Time",

  // Notification copy (iOS local notification body — Android uses native resources)
  "notify.morning.title": "One step closer to your dream",
  "notify.morning.body": "Start the day by writing your affirmation.",
  "notify.morning.quoteBody": "— {author} · Write it out and start your day",
  "notify.evening.title": "Today's goal is still waiting",
  "notify.evening.body": "It only takes a moment — check off today's step.",
  "notify.evening.bodyGoal": "It only takes a moment — check off \"{goal}\".",
  "notify.weekly.title": "Time to look back on your week",
  "notify.weekly.body": "Your week's record is ready. Take a moment to review it.",

  // ── Unfinished-setup nudges (replaces the silent evening slot) ──
  "notify.pending.title": "One thing still left",
  "notify.pending.futureSelf.body":
    "You've filled {filled} of {total} parts of your future self. Add just one more?",
  "notify.pending.affirmations.body":
    "You have {filled} dream affirmations. At {total}, you'll have more to write each day.",
  "notify.pending.portrait.body":
    "Fill in a little more and your 10-year-from-now portrait unlocks.",
  "notify.pending.goals.body": "No goal set yet. One line today changes tomorrow.",
  "notify.pending.plan.body":
    "Deciding \"when and where\" raises your odds. Want to build one if-then plan?",

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
  "woop.wish.empty": "Add today’s action in Settings first.",
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

  // ── Plan sheet: "Why decide in advance?" intro (collapsed) ──
  "woop.why.toggle": "Why decide in advance?",
  "woop.why.p1":
    "Willpower is weakest at the moment of decision. A tired evening, a phone already in your hand — deliberate then, and you usually lose.",
  "woop.why.p2":
    "Setting one sentence in advance — 'If A, then I do B' — hands the trigger from 'me' to the situation. In brain-imaging research, once an implementation intention was set, cue-driven circuits took over from the medial prefrontal regions used for self-initiated recall.",
  "woop.why.p3":
    "That is why the effect is large — a meta-analysis of 94 studies found an effect size of d = 0.65 on goal attainment.",
  "woop.why.p4":
    "And always name the obstacle inside you. Imagining only the good outcome has repeatedly been shown to drain the energy to act.",
  "woop.why.source":
    "Gollwitzer 1999 · Gollwitzer & Sheeran 2006 · Gilbert et al. 2009 · Kappes & Oettingen 2011",

  // ── Today's if-then card (morning mode) ───────────
  "plan.today.title": "Today's if-then",
  "plan.today.if": "If",
  "plan.today.then": "Then",
  "plan.today.desc":
    "Today's action, decided before the moment of choice arrives. When it does, just do it — no deliberating.",
  "plan.today.rotation": "Your {count} saved plans take turns — a different one each day.",
  "plan.today.emptyCta": "Create today's execution plan",
  "plan.today.emptyDesc":
    "One sentence: \"If A happens, I do B.\" Pick an AI draft and you're done — no typing",
  "plan.today.firstAction": "The first action last-night-me chose",
  "unlock.teaser.title": "Something not unlocked yet",
  "unlock.teaser.hint": "What it is, you'll find out the day it opens.",
  "unlock.locked.body": "Unlocks after a {days}-day streak · now {progress} days",

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
  "progress.goalDays": "{count} days with a goal achieved",
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
  "progress.source.deep": "All lines",
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

  // ── Today's affirmation (one line required, all lines optional) ──
  "affirmations.focus.title": "The you who's living the dream",
  "affirmations.focus.rotation": "{index} of {total}",
  "affirmations.focus.hint": "Write out, vividly, the you who has already lived the dream.",
  "affirmations.focus.placeholder": "Each line makes the dream more real…",
  "affirmations.focus.expand": "Engrave all {count} lines",
  "affirmations.focus.collapse": "Just today's line",
  "affirmations.focus.deepHint": "Engrave them all and you earn one more identity vote.",
  "affirmations.focus.mismatch": "Match the line above word for word.",
  "affirmations.extra.mismatch": "A line to revisit — today's check-in is already complete.",

  // ── Right after check-in ──────────────────────────
  "checkin.reward.title": "You moved a step closer to the dream",
  "checkin.reward.streak": "Day {count} in a row",
  "checkin.reward.evidence": "Identity evidence +{count} · I am {label}",
  "checkin.reward.evidencePlain": "Identity evidence +{count}",
  "checkin.reward.deepBadge": "All lines",
  "checkin.reward.freeze": "{count} freeze(s) bridged the days you missed",

  // ── 7-day rhythm ring ─────────────────────────────
  "rhythm.title": "This week's rhythm",
  "rhythm.count": "{done}/{total}",
  "rhythm.footer": "{done} of the last 7 days engraved.",
  "rhythm.startCaption": "Counting from the day you started.",
  "rhythm.todayAria": "Today",

  // ── Weekly review card (Sunday evening, no input) ──
  "weekly.title": "This week in review",
  "weekly.checkinDays": "{count} days engraved",
  "weekly.wins": "{count} wins",
  "weekly.evidence": "{count} votes",
  "weekly.topIdentity": "Proved most this week · I am {label}",
  "weekly.empty": "A quiet week. We'll start counting again at your next check-in.",
  "weekly.footer": "Nothing to fill in — just look back at the last 7 days.",

  // ── WOOP quick design (3 taps, no keyboard) ───────
  "woop.quick.title": "Quick design",
  "woop.quick.pickGoal": "Which goal are we designing for?",
  "woop.quick.draftCta": "Get 3 drafts",
  "woop.quick.drafting": "Writing drafts…",
  "woop.quick.pickDraft": "Pick the draft you like and save it as it is.",
  "woop.quick.saveDraft": "Save as is",
  "woop.quick.manual": "Write it myself",
  "woop.quick.outcomeLabel": "Best outcome",
  "woop.quick.obstacleLabel": "Inner obstacle",
  "woop.section.moreCta": "{count} more goal(s) without a plan",
  "woop.section.footerOne":
    "One at a time — practicing one beats writing down three.",

  // ── Home collapsible sections ─────────────────────
  "home.section.today": "Today's execution",
  "home.section.record": "Today's record",
  "home.section.expandAria": "Expand",
  "home.section.collapseAria": "Collapse",
  "home.wins.addRow": "Add another line",
  "home.record.footer": "Anything you write saves itself.",
  "home.plans.manage": "Manage execution plans",
  "home.plans.manageLocked": "Manage goals",
  // Home keeps only the quote, today's card and the 7-day ring — the rest folds in here.
  "home.section.more": "More",
  "home.more.summary": "My dream · Notes · Plans",
  "home.more.summaryLocked": "My dream · Goals · something still locked",

  // ── Today's goal check (same card as the transcription check-in) ──
  "home.todayGoal.title": "Today's goal",
  "home.todayGoal.doneToday": "Done today",
  "home.todayGoal.tapHint": "Tap if you kept it today",
  "home.todayGoal.undoHint": "Tap again to undo",
  "home.todayGoal.empty": "No goal set yet.",
  "home.todayGoal.setCta": "Set a goal",
  "home.todayGoal.afterCheckin": "Written. If you kept it today, tap the goal.",

  // ── Future self, one line ──
  "home.futureLine.label": "My dream",
  "home.futureLine.empty": "No dream written yet.",
  "home.futureLine.write": "Write it now",

  // ── Goal slots ──
  "goalSlot.unlock.title": "You've earned room for another goal",
  "goalSlot.unlock.body":
    "{days} days in a row. Add a new goal, or make the one you have sharper.",
  "goalSlot.unlock.bodyGoal":
    "You kept your goal {days} days. Add a new goal, or make the one you have sharper.",
  "goalSlot.unlock.addGoal": "Add a goal",
  "goalSlot.unlock.refine": "Sharpen my current goal",
  "goalSlot.unlock.later": "Later",
  "goalSlot.locked": "🔒 Opens at {days} days in a row",
  "goalSlot.lockedProgress": "{progress} so far",
  "goalSlot.maxed": "Up to {max} goals. The fewer you carry, the better you keep them.",
  "goalSlot.hint": "Keep one, and room for the next one opens up.",

  // ── Growth stage (accumulated evidence votes) ──
  "growth.title": "Growth stage",
  "growth.subtitle": "Check-ins, full transcriptions, achieved goals, and wins become votes that raise your stage.",
  "growth.votes": "{count} votes",
  "growth.toNext": "{count} votes to the next stage",
  "growth.stage.0": "Seed",
  "growth.stage.1": "Sprout",
  "growth.stage.2": "Stem",
  "growth.stage.3": "Branch",
  "growth.stage.4": "Tree",
  "growth.stage.5": "Forest",

  // ── Step-up suggestion ──
  "stepUp.title": "You've been keeping it up",
  "stepUp.body": "Ready to raise it a little? e.g. {draft}",
  "stepUp.apply": "Open settings",
  "stepUp.later": "Later",

  // ── Goal specificity ──
  "goal.specific.hint": "A little more concrete makes it easier to keep",
  "goal.specific.count": "a number",
  "goal.specific.cadence": "how often",
  "goal.specific.unit": "a unit",
  "goal.specific.countExample": "30",
  "goal.specific.cadenceExample": "every day",
  "goal.specific.unitExample": "minutes",
  "goal.refine.title": "Make it sharper",
  "goal.refine.subtitle": "Tap a missing piece to add it. Leaving it as is works too.",
  "goal.refine.apply": "Use this goal",

  "settings.futureSelf.moreDetail": "Add more detail",

  // ── One-time notice for accounts from the derived era (home DeclarationNudgeCard) ──
  "declarationNudge.title": "Your line and your goal are the same sentence",
  "declarationNudge.body":
    "We used to build your daily line from your goal. Rewriting it as “I already am” changes how it lands each morning.",
  "declarationNudge.cta": "Rewrite my line",
  "declarationNudge.dismiss": "No thanks",
};

export default dict;
