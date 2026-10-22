# 05 - Design and mobile/PWA

## Look and feel
- **Clean and calm.** Few colors, generous spacing, one accent color for the primary action. Reference apps for *inspiration only*; all assets and visuals must be original.
- Neutral felt background, high-contrast cards, readable at arm's length.
- Information hierarchy on the table: your cards > pot > whose turn > opponent stacks > everything else.
- Nothing decorative that costs frames. Animations are short (150-300ms) and skippable.

### Suggested tokens (adjust freely)
```
--bg:        #0f1a16   /* table background */
--felt:      #17332a
--surface:   #1e2a26   /* panels */
--text:      #f2f5f3
--muted:     #93a39c
--accent:    #f5c451   /* primary action, turn highlight */
--danger:    #e5594f   /* fold */
--success:   #4cc38a
radius: 14px; tap target >= 44px; font: system UI stack; numerals tabular
```
Respect both light/dark system settings only if cheap; dark-first is fine for v1.

## Portrait table layout (390x844 reference)
```
┌──────────────────────────┐
│ ☰  Table K7QX2M      ⚙   │  top bar (code, menu, settings)
│                          │
│     (P3)       (P4)      │  opponents around an oval:
│  (P2)               (P5) │  avatar/initial, name, stack,
│                          │  current bet chip, status tag
│          POT 240         │
│     [A♠][K♦][7♣][ ][ ]   │  board: 5 slots
│                          │
│  (P1)               (P6) │
│          (YOU)           │  your seat, larger
│        [Q♥] [Q♠]         │  your hole cards, large
│                          │
│ [Fold] [Call 40] [Raise] │  action bar in thumb zone
└──────────────────────────┘
```
- Support 2-9 seats with preset seat coordinates per player count; **you are always at the bottom** (rotate seat indices client-side).
- Action bar appears only on your turn (otherwise show a quiet status like "Waiting for Sam").
- Raise opens a bottom sheet: slider + quick buttons (Min, 1/2 pot, 3/4 pot, Pot, All-in) + big confirm. Show "raise to" amounts clearly. Slider steps in big-blind increments; clamp to `minRaiseTo..maxRaiseTo` from `you.legal`.
- Turn timer: thin ring or bar around the active seat; haptic-free feedback (sound + visual) since iOS Safari has no Vibration API.
- Pre-action buttons (check/fold, call any) are a nice later addition.

## Screens
1. **Landing:** "Create table" / "Join with code". Name field (remembered).
2. **Create table:** stack, blinds, timer, seats. Big "Create & copy link".
3. **Lobby/table:** the table itself; empty seats show "Sit"; host can start; share-link button.
4. **Hand history drawer:** list of recent hands, tap to replay (later: M6).
5. **Review tab (M6):** session recap, stats, leaderboard.
6. **Settings:** sound, animations, card style, leave table.

## Components (suggested)
`TopBar`, `Table`, `Seat`, `BoardCards`, `Card`, `Pot`, `ChipStack`, `ActionBar`, `RaiseSheet`, `TimerRing`, `ChatDrawer`, `ConnectionBanner`, `ShareSheet`.
Game state in the UI = the latest `update.view` (single source of truth) + local UI state (sheet open, slider value). Don't re-implement rules in the client.

## Animation
Driven by `events` from each `update`: deal, chips to pot, pot to winner, board reveal. Queue events and play them in order; if the tab was backgrounded, **skip to the latest view** instead of replaying a backlog.

## PWA checklist
- [ ] `manifest.webmanifest`: `name`, `short_name`, `display: "standalone"`, `start_url`, `theme_color`, `background_color`, icons (192, 512, maskable).
- [ ] iOS: `<link rel="apple-touch-icon" href="/apple-touch-icon-180.png">`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`.
- [ ] `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- [ ] Safe areas: pad with `env(safe-area-inset-top/bottom/left/right)`; keep the action bar above the home indicator.
- [ ] Use `100dvh` (not `100vh`) for full-height layouts.
- [ ] `overscroll-behavior: none` on `html, body`; disable pull-to-refresh and rubber-banding on the table.
- [ ] `touch-action: manipulation` on controls; `user-select: none` on the table; prevent double-tap zoom.
- [ ] Inputs use `font-size: 16px` or larger (prevents iOS zoom on focus).
- [ ] Tap targets >= 44x44px; primary actions reachable with one thumb.
- [ ] Service worker caches the app shell; the game itself requires a connection, so show a clear offline screen.
- [ ] Update flow: when a new version is available (or `VERSION_MISMATCH`), show a "Refresh" prompt.
- [ ] Screen Wake Lock while seated at a table (feature-detect; re-acquire on `visibilitychange`).
- [ ] "Add to Home Screen" coaching banner for iOS Safari (iOS has no install prompt event). Show once, dismissible.
- [ ] Web push (later): only works for Home-Screen-installed PWAs on iOS 16.4+. Ask permission after a user gesture, not on load.

## iOS quirks to design around
- Backgrounding suspends the page and drops the WebSocket. Reconnect + resync on `visibilitychange`/`pageshow`/`online`.
- No haptics via web; use sound + motion.
- Audio needs a user gesture to start; unlock on first tap.
- Keyboard covers the bottom; chat should be a drawer that resizes with `visualViewport`.
- Safari tab vs installed app have separate storage; the token in `localStorage` won't carry between them. Say so if someone "loses their seat" after installing (or support rejoining by name + host approval).

## Accessibility
- Text contrast >= 4.5:1; never rely on color alone (use labels like FOLDED / ALL-IN).
- Cards show rank and suit as text for screen readers (`aria-label="Ace of spades"`).
- Respect `prefers-reduced-motion`.
- Optional four-color deck toggle.

## Performance budget
- First load JS < 250 KB gzipped for the landing + table.
- 60fps animations using `transform`/`opacity` only.
- Test on a mid-range device profile and a throttled connection.
