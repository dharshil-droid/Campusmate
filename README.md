# CampusMate – Student Life Manager

Dashboard, attendance tracker (with "classes you can miss / must attend" maths), assignment and exam manager, and study planner.
Stack: React (Vite) + Node.js/Express + MongoDB Atlas.

```
campusmate/
  client/   React frontend
  server/   Express API + MongoDB (Mongoose)
```

## 0. Check your tools (Windows)
Open Command Prompt and run `node -v` (need v18 or newer; if missing, install the LTS version from nodejs.org), `git --version` (install from git-scm.com if missing). VS Code: code.visualstudio.com.

## 1. Create the free database (MongoDB Atlas)
1. Sign up at mongodb.com/atlas and create a free **M0** cluster.
2. **Database Access** → add a database user with a password (use letters and numbers only, to avoid URL-encoding problems).
3. **Network Access** → add IP `0.0.0.0/0` (needed because Render's free IPs change).
4. **Connect → Drivers** → copy the connection string. Put your database name before the `?`, e.g. `...mongodb.net/campusmate?retryWrites=true&w=majority`.

## 2. Run locally
First make a secret for login tokens. Run this and paste the output as `JWT_SECRET` in `server/.env`:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
```
cd server
copy .env.example .env      (then open .env, paste your MONGODB_URI, set JWT_SECRET)
npm install
npm run dev
```
Open a second terminal:
```
cd client
npm install
npm run dev
```
Open http://localhost:5173 and click "Create an account". Test: http://localhost:5000/api/health should show `{"ok":true}`.

## 3. Push to GitHub
Create an empty repository on github.com, then in the `campusmate` folder:
```
git init
git add .
git commit -m "CampusMate"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/campusmate.git
git push -u origin main
```
`.gitignore` already keeps `.env` (your secrets) out of GitHub. Check that `.env` does not appear on the repository page.

## 4. Deploy the backend (Render)
New → **Web Service** → connect the repo.
- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Instance type: Free
- Environment variables: `MONGODB_URI` = your connection string, `JWT_SECRET` = a new long random value (generate another with the command in section 2)

Wait for "live", then open `https://YOUR-SERVICE.onrender.com/api/health`.

## 5. Deploy the frontend (Vercel)
New Project → import the repo.
- Root Directory: `client` (framework: Vite)
- Environment variable: `VITE_API_URL` = your Render URL (no trailing slash)

## 6. Lock the API to your site
In Render, add `CLIENT_URL` = your Vercel URL (no trailing slash) and redeploy.

## Notes
- The free Render service sleeps after inactivity; the first load can take up to a minute.
- **Login:** each student registers with name, email and password. The database stores the name, email and a bcrypt hash of the password (never the password itself). Login returns a token valid for 7 days, and every record belongs to one user, so students only see their own data.
- Keep `JWT_SECRET` and `MONGODB_URI` private. If either leaks, change it.
