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

## Hosting with door and window identification (Cloudflare Workers)

To use the feature in a hosted copy of the app, host it on Cloudflare. `wrangler.jsonc` tells Cloudflare to serve the built site and to run `worker/index.ts` for the `/jev` address. That script holds your key and forwards requests to Jev, but only for people who know a shared password.

1. In the Cloudflare dashboard, open **Workers & Pages**, create an application, and import this GitHub repository.
2. On the setup screen keep the project name `monarch` (it must match `name` in `wrangler.jsonc`), the build command `npm run build` and the deploy command `npx wrangler deploy`. Deploy.
3. Open the new project's **Settings**, find **Variables and Secrets**, and add two values of type **Secret**:
   - `TYPESAFE_API_KEY`: your TypeSafe key.
   - `APP_PASSWORD`: a long random password that you make up and share.
4. Open the site, run **Detect walls**, press **Identify doors and windows**, and enter the password when asked. The app remembers it in that browser.

These must be the project's runtime **Variables and Secrets**, not the build variables on the setup screen or under the Build settings: the running app cannot read build variables. Until both secrets are set, the button reports that the server is not configured. Anyone with the password can spend your Jev credits, so share it only with people you trust. To revoke access, change `APP_PASSWORD` in Cloudflare's settings.

The GitHub Pages preview keeps working as before, without this feature.

## 3D models from photos (optional)

In the **Furniture** panel, **3D model from a photo…** turns a photo of one object into a 3D model that you place like an imported file. The photo is sent to [fal](https://fal.ai), which runs the Tripo H3.1 image-to-3D model. Each model takes a minute or two and is charged to your fal account (about $0.30 at the time of writing; see the [model's page](https://fal.ai/models/tripo3d/h3.1/image-to-3d)).

The key must stay out of the browser, so the app's own server makes the calls (`worker/fal.ts`). It always runs that one model, whatever the browser asks for.

- **Locally:** add `FAL_KEY=your-key-here` to `.env.local` and restart `npm run dev`. Create a key at [fal API keys](https://fal.ai/dashboard/keys).
- **Hosted on Cloudflare:** add a third **Secret**, `FAL_KEY`, next to the two above. The same `APP_PASSWORD` protects it, and anyone with the password can spend your fal credits.

The GitHub Pages preview has no server, so the button reports an error there.

## Chat (work in progress)

`/chat.html` is a chat-first version of Monarch. You describe a room and Claude writes the three.js code that draws it in the viewport beside the chat, looks at a screenshot of its own result, and fixes mistakes. The code runs in a sandboxed iframe that cannot reach the app or the password.

- **Locally:** add `ANTHROPIC_API_KEY=your-key-here` to `.env.local` and restart `npm run dev`, then open `/chat.html`.
- **Hosted on Cloudflare:** add a **Secret**, `ANTHROPIC_API_KEY`. The same `APP_PASSWORD` protects it, and anyone with the password can spend your Anthropic credits.
