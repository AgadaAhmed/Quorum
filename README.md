# Quorum

A social event-coordination app for iOS and Android that fixes the "will this actually happen?" problem with group plans. Instead of endless group-chat back-and-forth, an event only locks in once enough people commit — it reaches **quorum**. Built with **Expo (SDK 55)**, **React Native**, **Firebase**, and **RevenueCat**.

## The idea

Group plans die in the "maybe" stage. Quorum makes commitment the core mechanic: a plan needs a threshold of confirmed attendees before it goes live. Below quorum, it's a proposal; at quorum, it's happening. This turns vague intentions into real events and gives everyone confidence to show up.

## Features

- **Quorum voting** — plans activate only when they cross a confirmed-attendee threshold, with a live progress bar.
- **Plan creation & discovery** — create plans, browse a social feed, join or pass.
- **Real-time chat** per plan for coordination.
- **Safety features** — safety timer, reporting flow, and moderation modals for meeting strangers responsibly.
- **Onboarding** flow, animated UI, glass-card visual style, confetti/haptic feedback.
- **Subscriptions** — premium tier via RevenueCat (`react-native-purchases`) with a paywall.

## Architecture

```
app/            file-based routing (Expo Router): auth, tabs, chat, plan-detail, create-plan, social, settings
components/     reusable UI (PaywallModal, QuorumProgressBar, SafetyTimerModal, GlassCard, …)
lib/            Firebase init (Auth + Firestore + Storage + Functions)
functions/      Firebase Cloud Functions
__tests__/      Jest tests (incl. subscription logic)
```

Backend is **Firebase**: Auth (persisted via AsyncStorage), Firestore, Storage, and Cloud Functions. Billing is handled by RevenueCat, with users identified to RevenueCat by their Firebase UID.

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Firebase web config
npx expo start
```

Firebase client config is read from `EXPO_PUBLIC_*` environment variables (see `.env.example`); no keys are committed. See `DEPLOY.md` for build and release details.

## Tech

Expo SDK 55 · React Native 0.83 · TypeScript · Firebase (Auth/Firestore/Storage/Functions) · RevenueCat · Jest.

---

*Designed and built by Agada Ahmed, with development assisted by Claude.*
