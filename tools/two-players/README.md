# Two players

Playing together on one machine, without All the Spaces' dev stack: `host.js` stands in for the app
around one player's game, and the windows open in the same browser share a room, as the app's
realtime room does.

    pnpm dev
    http://127.0.0.1:5189/tools/two-players/?name=Robin
    http://127.0.0.1:5189/tools/two-players/?name=Sam        (a second window, same browser)

- **The room** is a `BroadcastChannel` between the windows:
  - who's here, and who hosts: whoever came first, and the next when they leave;
  - the shared values, which a newcomer gets on arrival (when two windows set one at once, the later stands in both, as the app's room orders them);
  - the messages.
- **Joining** works as with the app: the game starts as if alone, and who's here and the room's values arrive a moment later.
- **Saves:**
  - Each player's own save is kept in memory, one per window. A window opened again starts with a fresh save, like a new player.
  - The group's save (the `shared` scope: the island's records, the week's order) is the browser's (IndexedDB), so every window sees the same and it lasts. A save made on a stale read is refused, as the app's server does, so `update` retries; each check and write is one transaction, so two windows saving at once can't both win. `?group=` names the group (`island` by default); a new name starts afresh.
- **Leaving:** closing a window leaves the room. From the console, `__host.leave()` leaves without closing the window.
- **Options:** `?id=`, `?name=`, `?color=`, `?tier=low|mid|high`, `?locale=en-GB`, `?group=`, and `?src=` for the game (`/` by default). To start someone in another boat: `&src=/%3Fboat%3Dconsole`.
- **What it doesn't stand in for:** voice, connectors, the app's menu and toasts (they go to the console), the app's limits on shared values, and its frame being on another origin.

Run through, headless: `node tools/two-players/away.mjs` (the away boats by the bay), `far.mjs` (far out) and `boats.mjs` (each in a different boat: her copy and stand-in, the dock's spare berths, riding along and at someone else's helm, a crew's jobs, specks past the fog), each two real games, some minutes on the CPU. `boats.mjs` takes `[dir] [port] [tier]`; from a worktree, set `ALL_THE_SPACES` to that checkout.

For the real thing, see All the Spaces' `docs/development.md`.

`hard.mjs [dir] [port] [boat] [owner's fps] [guest's fps]` (`HARD_FROM=gale`, as a run's cut at 25 minutes), `seen.mjs [dir] [port] <part>`, `gap.mjs [dir] [port] [boat]`, `mem.mjs [dir] [port] [boat] [minutes] [every]` and `heel.mjs`: `docs/m16/together.md` says what each checks. `lib.mjs` is what they share. The fps asked for is only a ceiling: three runs at once here gets about 2.

`aboard.mjs [dir] [port] [boat] [owner's fps] [guest's fps] [guest's own boat]`: a guest on the owner's real boat, every area she has (`areas.mjs`), under way, walking, climbing, stepping ashore, what's fitted, her spread, her chair. A run's frames a second are printed: the fps asked for is only a ceiling on a CPU.
