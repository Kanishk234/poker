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
