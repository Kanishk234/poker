# Decisions log

Append newest at the bottom. Format: `YYYY-MM-DD - Decision - Why`.

- 2026-10-22 - Web app (PWA) first, no native app - Free to ship; Apple's $99/yr fee is only needed for the App Store. Capacitor wrap is possible later.
- 2026-10-22 - Server-authoritative engine in a pure TS package - Prevents cheating, makes rules testable without a network.
- 2026-10-22 - Play money only - Avoids gambling licensing and App Store issues.
- 2026-10-22 - New players join at the start of the next hand and don't post a blind to enter - Simplicity for friend games.
- 2026-10-22 - Auto-reveal all hands at multi-player showdown - Simplicity and learning value; optional "show/muck" later.

- 2026-10-22 - Prioritize room-code entry and keep invite links using the same code - Both suit friend groups and share one server lookup; code generation/admission stays in M3.
- 2026-10-22 - M0 ships a connectivity shell and protocol v1 hello probe only - Gives the scaffold a real end-to-end acceptance check without prematurely implementing the engine or private-table flow.
- 2026-10-22 - Use workspace package names as runtime aliases, with matching TypeScript paths and project references - Shared imports stay consistent across Vite, tsx, and typechecking without a bundler-specific alias plugin.
- 2026-10-22 - Use the matching Colyseus 0.17 server/transport and SDK - This release line natively supports patched nanoid without dependency overrides. Use its router request hook for matchmaking origin checks; Express is a required transport peer and serves health checks. Tooling dependencies follow the specified architecture; no extra runtime UI library is needed.
- 2026-10-22 - Run Vitest in worker threads - Colyseus's monitoring dependency sends IPC messages that conflict with Vitest's fork pool.
- 2026-10-22 - Establish an original restrained green, warm-white, and gold shell - Follows the requested Offsuit-inspired restraint using original code-drawn cards and icons; the complete table design remains M2.
- 2026-10-22 - Implement M2 before M1 - The milestones are independent and the user prioritized seeing the poker aesthetic early. Gameplay still waits for M1 and M3.
- 2026-10-22 - Replace the green scaffold palette with near-black, charcoal, warm-white cards, and lilac actions - After reviewing Offsuit's public App Store screenshots, this follows the user's explicit aesthetic preference. All app components and marks are original; reference images stay untracked.
- 2026-10-22 - Keep the M2 view contract local to the web app - It describes fixtures only. Shared wire schemas and the protocol version stay unchanged until M3; legal limits are supplied by each fixture instead of computed by the client.
- 2026-10-22 - Use native links and modal dialogs without new dependencies - The three preview routes need no router library; browser dialogs provide focus containment and Escape handling. Explicit focus restoration handles React unmounting.
- 2026-10-22 - Show preview feedback instead of simulating game transitions - The user can inspect controls and settings without introducing competing client-side poker rules or pretending room creation/joining is live. Real iPhone hands-on acceptance remains pending; browser checks do not substitute for it.
- 2026-10-22 - Complete M1 in focused task groups, beginning with cards and evaluation - Establish and exhaustively test ranking/shuffling before betting and pot settlement. Keep the remaining M1 checkboxes open rather than claiming a full engine.
- 2026-10-22 - Define injected RNG as a bounded integer sampler - Fisher–Yates can use Node's unbiased `crypto.randomInt` directly through a server-only adapter; the engine remains free of entropy sources and I/O.
- 2026-10-22 - Implement hand evaluation in-package by enumerating five-card subsets - At most 21 combinations per seven-card hand is simple to audit for a friend-sized game and needs no runtime dependency. Base-15 category/kicker scores make ties explicit; canonical subset ordering makes returned cards deterministic without suit tiebreakers.
- 2026-10-22 - Add the matching Vitest V8 coverage provider as a development dependency - Measures the engine's required coverage and enforces >=90% per file in CI. The separate exhaustive five-card audit independently checks all category counts; the optional seven-card distribution remains future work.
- 2026-10-22 - Use a temporary HTTPS tunnel for phone preview testing - A localhost URL refers to the phone itself. Serve only the built static UI through the tunnel, with its local origin bound to loopback; keep tunnel binaries and screenshots ignored. This is not persistent production hosting or evidence of a completed physical iPhone test.
- 2026-10-22 - Phone loading and visual consistency confirmed by the user through the HTTPS preview - Record the observed phone result separately from iPhone-specific interaction/PWA checks, which remain open.
