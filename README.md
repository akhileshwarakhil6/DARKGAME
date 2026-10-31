# FRIEND PARTY 🎉

A small online party-game website for 2–6 friends. Includes Draw & Guess, Find the Imposter, Quiz Battle, and Would You Rather.

## Run it on your computer

1. Install Node.js (LTS) from https://nodejs.org/
2. Extract this ZIP.
3. Open a terminal in the extracted `friend-party` folder.
4. Run:

   ```bash
   npm install
   npm start
   ```

5. Open http://localhost:3000

This local address works only on your computer. To play with friends on different networks, deploy it publicly.

## Publish it free with Render

1. Create a GitHub account at https://github.com/ if you don't have one.
2. Create a new GitHub repository named `friend-party`.
3. Upload all files and folders from this project to the repository (keep `server.js`, `package.json`, `render.yaml`, and the `public` folder at the repository root).
4. Sign in at https://render.com/ using GitHub.
5. Choose **New + → Blueprint**, select your `friend-party` repository, and approve the service shown in `render.yaml`.
6. Wait for deployment to finish. Render will give you a URL ending in `onrender.com`.
7. Open that URL, create a room, and send the room code or link to your friends.

The first visit after a free service has been idle may take a little time while it wakes up.

## Notes

- Supports 2–6 players per room.
- The host chooses games and controls the next-round/lobby buttons.
- Room data is stored in server memory. Rooms disappear if the server restarts or sleeps long enough; create a new room if that happens.
- This is a fun prototype, not a hardened production service. Room codes are short and there is no account system or moderation.
- Drawing is live; guesses, votes, and quiz answers are handled by the server.
