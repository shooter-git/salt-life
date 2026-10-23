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
- **Options:** `?id=`, `?name=`, `?color=`, `?tier=low|mid|high`, `?locale=en-GB`, `?group=`, and `?src=` for the game (`/` by default).
- **What it doesn't stand in for:** voice, connectors, the app's menu and toasts (they go to the console), the app's limits on shared values, and its frame being on another origin.

For the real thing, see All the Spaces' `docs/development.md`.
