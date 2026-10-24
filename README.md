# Neon Strike Arena

A mobile-friendly, browser-first multiplayer FPS prototype. It includes a small 3D night arena, keyboard/mouse and touch controls, room codes, live player movement, a scoreboard, hits, eliminations, and respawns.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000` in a browser. Do not open `index.html` directly as a file.
5. Click **CREATE MATCH** to play or share the five-character room code with a friend.

On Windows, you can double-click `PLAY_GAME.bat` to install dependencies if needed, start the server, and open the game.

Three.js is included locally. Internet access is only needed for optional web fonts. For play with friends outside your local network, deploy this Node app to a host that supports persistent WebSocket connections and HTTPS/WSS. Share the hosted URL and room code. The server currently keeps matches in memory; restarting it closes active rooms.

## Controls

- Desktop: WASD to move, click **CLICK TO START** for mouse aim (or click-drag the game to aim), left click to fire, Shift to sprint, R to reload, and hold Tab to view the scoreboard.
- Phone/tablet: left joystick to move, drag the right side to aim, and use the on-screen fire and reload buttons.
- Each room supports up to eight players.

## Play Store release

This source is a web game, not a signed Android release. Publishing requires an Android wrapper (for example, a Trusted Web Activity or Capacitor project), a public HTTPS domain for the game and WebSocket server, Android signing and a release AAB, a Google Play developer account, and the store listing / privacy and Data safety declarations. Those account, domain, signing, and store details are not available in this workspace, so nothing has been submitted or published. Do not put signing keys or account credentials in this project.

This is an early playable prototype, not a production-ready competitive shooter. Before a public release, add authoritative movement/anti-cheat, connection recovery, moderation/reporting, load testing, analytics/privacy decisions, and device testing.
