# monarch
A 3D modeling simulator

## Run it

```bash
npm install
npm run dev
```

## Test it

```bash
npm test            # unit tests
npm run test:e2e    # browser tests (first time: npx playwright install chromium)
```

## Hosted preview

Every push to `main` publishes the app to GitHub Pages at
https://yokomeshi.github.io/monarch/ (see `.github/workflows/preview.yml`).

## Identifying doors and windows (optional)

After **Detect walls**, the app can ask [TypeSafe's Jev model](https://docs.typesafe.ai) what each gap in a wall is: a door, a window or a plain opening. This sends a small image of each gap to TypeSafe.

Jev's API does not accept calls made from a browser, so the dev and preview servers forward them and add your key. To turn it on, create a file named `.env.local` in the project folder (it is not committed):

```
TYPESAFE_API_KEY=your-key-here
```

Then restart `npm run dev`. The key stays on your machine and is never sent to the browser. The hosted preview is a static site with no such server, so this feature works only when the app is run locally or hosted as described below.

## Hosting with door and window identification (Cloudflare Pages)

To use the feature in a hosted copy of the app, host it on Cloudflare Pages. The file `functions/jev.ts` then runs on Cloudflare's servers, holds your key and forwards requests to Jev, but only for people who know a shared password.

1. In Cloudflare, create a Pages project connected to this GitHub repository.
2. Set the build command to `npm run build` and the build output directory to `dist`.
3. In the project's settings, add two encrypted environment variables (secrets) for the production environment:
   - `TYPESAFE_API_KEY`: your TypeSafe key.
   - `APP_PASSWORD`: a long random password that you make up and share.
4. Deploy. If you added the variables after the first deployment, deploy again so that they take effect.
5. Open the site, run **Detect walls**, press **Identify doors and windows**, and enter the password when asked. The app remembers it in that browser.

Anyone with the password can spend your Jev credits, so share it only with people you trust. To revoke access, change `APP_PASSWORD` in Cloudflare's settings and deploy again.

The GitHub Pages preview keeps working as before, without this feature.
