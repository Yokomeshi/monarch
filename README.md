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

Then restart `npm run dev`. The key stays on your machine and is never sent to the browser. The hosted preview is a static site with no such server, so this feature works only when the app is run locally.
