# Anima — App Store Connect Metadata (English)

## App Name (≤ 30 chars)
```
Anima — Future You, Every Day
```
(29 chars)

## Subtitle (≤ 30 chars)
```
Lockscreen affirmation widget
```
(29 chars)

## Promotional Text (≤ 170 chars)
```
One line a day. Type your future-self affirmation, check your goals, and log
three wins — all visible on your lock screen widget.
```

## Keywords (≤ 100 chars, comma-separated)
```
affirmation,gratitude,journal,widget,motivation,habit,wins,morning,goals,mindfulness,selfcare,daily
```

## Description (≤ 4000 chars)

```
✨ Meet your future self every morning, right on your lock screen.

Anima is a daily ritual app for people who want to actually become who they
say they want to be — not just dream about it.

━━━━━━━━━━━━━━━━━━
■ What's inside

[ Today's One Line ]
- A new personalized quote every day, tuned to your stated future self.
- Multi-language: English, Korean, Spanish, Chinese.

[ One Step Closer To Your Future Self ]
- Re-type your own future-self affirmation each morning.
- A streak counter celebrates consistency without nagging.

[ Today's Actions Toward Your Goals ]
- Break your long-term goals into daily checkboxes.
- The lock-screen widget shows ✓ the day you complete every action.

[ Three Wins Today ]
- Each evening, log three small wins from the day.
- A research-backed habit that counters negativity bias.
- Auto-saves as you type — no save button.

[ Lock-screen & Home-screen Widgets ]
- See your quote and today's three checklist items at a glance.
- Real-time reflection — the moment you save in the app, the widget updates.

━━━━━━━━━━━━━━━━━━
■ Privacy first

- Your content is encrypted and visible only to you.
- No advertising identifiers (IDFA). No third-party trackers.
- Account deletion is built in — your data is permanently removed immediately.

━━━━━━━━━━━━━━━━━━
■ Pricing

- 14-day free trial.
- Lifetime access via a single one-time purchase. No subscription, no renewals.
- Securely processed through Apple In-App Purchase.

━━━━━━━━━━━━━━━━━━
■ Contact

Support: support@successfulfuture.app
Privacy: https://my-successful-future.vercel.app/privacy
Terms:   https://my-successful-future.vercel.app/terms
```

## Category
- **Primary**: Lifestyle
- **Secondary**: Health & Fitness

## Age Rating
- **4+** (subject to user-generated content flag review).

## App Privacy (must match `PrivacyInfo.xcprivacy`)

| Data Type | Collected | Tracking | Purpose |
|---|---|---|---|
| Email Address | Yes | No | App functionality |
| User ID | Yes | No | App functionality, Analytics (first-party) |
| Other User Content | Yes | No | App functionality |
| Crash Data | Yes | No | Analytics |
| Performance Data | Yes | No | Analytics |

## App Review Information

> ⚠️ **Domain warning** — the custom domain `successfulfuture.app` is not registered (DNS
> NXDOMAIN), so every URL and mailbox on it is dead. The addresses actually registered in App
> Store Connect are the `my-successful-future.vercel.app` ones used above; the
> `@successfulfuture.app` emails below still need replacing with a live mailbox before they are
> copied into ASC, or App Review can reject on Guideline 1.5 / 5.1.1.


- **Contact email**: support@successfulfuture.app
- **Demo account**:
  - Email: `apple-reviewer@successfulfuture.app`
  - Password: `<set just before submission>`
  - Note: This account has lifetime entitlement pre-granted so the reviewer can
    explore every feature without making a purchase.
- **Demo video**: `https://my-successful-future.vercel.app/demo/apple-review-2026.mp4`
  - Walkthrough: add widget → see lock-screen card → re-type affirmation →
    log a win → IAP purchase flow → account deletion.

## Pre-submission Checklist

- [ ] Bundle ID matches App Store Connect SKU
- [ ] Sign in with Apple works (Guideline 5.1.1(v))
- [ ] In-app account deletion works (`DELETE /api/account/delete`)
- [ ] Receipt → `/api/entitlement/verify-apple` issues ent claim immediately
- [ ] Widget works on Lock Screen and Home Screen
- [ ] iPad layout passes review (universal app recommended)
- [ ] Privacy / Terms URLs respond on production domain
- [ ] No external payment links anywhere in the app (Guideline 3.1.1)
- [ ] App Privacy answers match `PrivacyInfo.xcprivacy`
