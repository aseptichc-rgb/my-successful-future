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
  "onboarding.step1.title": "What do you look like 10 years from now?",
  "onboarding.step1.subtitle":
    "Write the version of you that you want to become — one paragraph. Your daily quote is built around this.",
  "onboarding.step1.placeholder":
    "e.g., 10 years from now I start every morning with exercise and reading, spend deep time with my family, and earn a stable income from work I love.",
  "onboarding.step1.example1":
    "In 5 years I earn $10K/month and choose what to work on, when. Mornings start with exercise and reading.",
  "onboarding.step1.example2":
    "In 10 years I'm one of the top voices in my field and reach more people through talks and writing.",
  "onboarding.step1.example3":
    "In 7 years time with my family is the highest priority. Work caps at 5 hours a day; weekends are mine.",

  "onboarding.step2.title": "What goals are you walking toward?",
  "onboarding.step2.subtitle":
    "Your top 3 goals appear on the daily card and on the lock screen — listed in order of priority.",
  "onboarding.step2.placeholder": "e.g., Read for 30 minutes every day",
  "onboarding.step2.addGoal": "+ Add a goal",
  "onboarding.step2.removeGoalAria": "Remove this goal",

  "onboarding.step3.title": "Write a one-line affirmation of your future self",
  "onboarding.step3.subtitle":
    "Your affirmations show as faint placeholder text on each daily card. Type them again, exactly, to build a streak. Leave it empty if you'd like — you can add them later in Settings.",

  "onboarding.step4.title": "Whose voice do you want to hear each day?",
  "onboarding.step4.subtitle":
    "Pin one person and their words land first about 4 days a week. The rest is curated rotation. You can leave it empty.",
  "onboarding.step4.autoTitle": "Auto rotation",
  "onboarding.step4.autoSubtitle": "About 8 mentors rotate deterministically each week.",
  "onboarding.step4.changeLater": "You can change or unpin anytime in Settings.",
  "onboarding.step4.cta": "Get today's quote →",
  "onboarding.step4.preparing": "Preparing…",

  "onboarding.step5.titleLoading": "Crafting today's quote for you…",
  "onboarding.step5.titleDone": "This is what you'll get every day.",
  "onboarding.step5.subtitleLoading": "Just a moment.",
  "onboarding.step5.subtitleDone":
    "The lock-screen widget shows a different line each day. Install the Android app to add the widget.",
  "onboarding.step5.todayLabel": "TODAY'S LINE",
  "onboarding.step5.missionLabel": "TODAY'S MISSION",
  "onboarding.step5.missionIdentityPrefix": "I am",
  "onboarding.step5.missionFooter":
    "Answer this single line in Home and your identity card grows.",
  "onboarding.step5.previewError":
    "Couldn't generate the preview. You can try again from Home after starting.",
  "onboarding.step5.widgetTitle": "How to add the widget on Android",
  "onboarding.step5.widgetStep1": "1. Long-press an empty spot on your home screen",
  "onboarding.step5.widgetStep2": "2. \"Widgets\" → search Anima",
  "onboarding.step5.widgetStep3":
    "3. Add it to your lock screen — a fresh line arrives every day",
  "onboarding.step5.start": "Start",
  "onboarding.step5.finishing": "Finishing…",

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

  "home.future.title": "You, 10 years from now",
  "home.future.subtitle":
    "The more specific the future you, the sharper the daily line you'll receive.",
  "home.future.empty": "Nothing written yet. Tap to write.",
  "home.future.saveAndRegen": "Save and regenerate today's card",
  "home.future.saveFailed": "Failed to save your future self",

  "home.goals.title": "Today's actions toward your goals",
  "home.goals.subtitle":
    "One small action that moves you toward the future you. The top 3 also appear on your lock screen.",
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

  // Settings
  "settings.title": "Settings",
  "settings.subtitle":
    "Manage your future self, daily affirmations, today's actions, and quote curation in one place.",
  "settings.future.title": "You, 10 years from now",
  "settings.future.subtitle":
    "Your daily line is built from this paragraph.",
  "settings.affirmations.title": "One step closer to the future you",
  "settings.affirmations.subtitle":
    "Shown faintly above each daily card. Type each line back exactly to extend your streak by 1.",
  "settings.goals.title": "Today's actions toward your goals",
  "settings.goals.subtitle":
    "One small action that moves you toward the future you. The top 3 also appear on your lock screen.",
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

  // Auth
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.displayName": "Name",
  "auth.signIn": "Sign in",
  "auth.signUp": "Sign up",
  "auth.signInWithGoogle": "Continue with Google",
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
    "e.g., I am someone who writes for an hour every day.",
  "affirmations.editor.add": "+ Add affirmation",
  "affirmations.editor.removeAria": "Remove this affirmation",
  "affirmations.editor.maxNote":
    "Up to {max} entries, {len} characters per line.",

  // Billing
  "billing.trialBanner": "{days} days left in trial",
  "billing.trialEnded": "Your free trial has ended.",
  "billing.upgrade": "Upgrade",
};

export default dict;
