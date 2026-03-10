# Testing multiplayer

## 1. Start the server

In the project folder:

```bash
npm run server
```

Or directly:

```bash
node server/server.js
```

The console should show: `Server running at http://localhost:3000`

## 2. Start the game

In a **second** terminal:

```bash
npm run dev
```

Open the browser at **http://localhost:5173** (or the port shown by Vite).

## 3. Open two windows

- **Chrome:** one tab with the game URL
- **Firefox:** another tab (or window) with the same URL

Both must use **http://localhost:…** with the port from `npm run dev`.

## 4. How to tell it’s working

- **Below the FPS display on the left:**  
  If it says **"Multiplayer: 2 players"** (green), both are connected.  
  If it says **"Multiplayer: disconnected"** (red), the server isn’t running or CORS is blocking.

- **Key T** (chat):  
  In chat you’ll see "You joined the game." and "[Name] joined." when the other player is there.

## 5. Seeing the other player

- **Click once** so the pointer is locked and controls are active.
- Press **V** for **third-person view** (camera from behind).
- **WASD** to move – you start close together (spawn), so move a bit and look around.
- The other player appears as the same character (head, body, legs, arms) and moves when they move in the other window.

## Common issues

| Problem | Solution |
|--------|----------|
| "Multiplayer: disconnected" | Start and keep the server running with `npm run server`. |
| CORS errors in console | Restart the server (CORS allows all localhost ports). |
| Only 1 player shown | Open both tabs/windows with the same URL and reload if needed. |
| Can’t see other player | Press V for third-person to see your own character; then look around – the other is near spawn. |
