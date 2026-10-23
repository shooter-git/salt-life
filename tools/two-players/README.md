# Two players

Playing together on one machine, without All the Spaces' dev stack: `host.js` stands in for the app
around one player's game, and the windows open in the same browser share a room, as the app's
realtime room does.

    pnpm dev
    http://127.0.0.1:5189/tools/two-players/?name=Robin
    http://127.0.0.1:5189/tools/two-players/?name=Sam        (a second window, same browser)

- **The room** is a `BroadcastChannel` between the windows:
  - who's here, and who hosts: whoever came first, and the next when they leave;
  - the shared values, which a newcomer gets on arrival;
  - the messages.
- **Joining** works as with the app: the game starts as if alone, and who's here and the room's values arrive a moment later.
- **Saves** are kept in memory, one set per window. A window opened again starts with a fresh save, like a new player.
- **Leaving:** closing a window leaves the room. From the console, `__host.leave()` leaves without closing the window.
- **Options:** `?id=`, `?name=`, `?color=`, `?tier=low|mid|high`, `?locale=en-GB`, and `?src=` for the game (`/` by default).
- **What it doesn't stand in for:** voice, connectors, the app's menu and toasts (they go to the console), the app's limits on shared values, and its frame being on another origin.

For the real thing, see All the Spaces' `docs/development.md`.
