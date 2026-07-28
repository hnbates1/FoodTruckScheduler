# Food Truck Admin

The Lowe's Store 0244 food-truck scheduler, hosted directly in the owner's
Cloudflare account. The app runs as a Cloudflare Worker with:

- D1 for trucks, visits, staff accounts, and sessions
- R2 for uploaded truck logos
- Cloudflare Images for Next/Vinext image optimization
- an application-owned staff sign-in (no ChatGPT sign-in)

## One-time Cloudflare setup

Requirements: Node.js 22.13 or newer and a Cloudflare account with Workers,
D1, and R2 enabled.

```bash
npm ci
npx wrangler login
npx wrangler d1 create food-truck-admin
npx wrangler r2 bucket create food-truck-admin-logos
```

Copy the D1 `database_id` returned by Cloudflare into `wrangler.jsonc`, replacing
the all-zero placeholder. Then create two independent random secrets:

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put SETUP_TOKEN
npm run db:migrate:remote
npm run deploy
```

`SESSION_SECRET` must be at least 32 random bytes. `SETUP_TOKEN` is only used to
create the first administrator and should be rotated after bootstrap.

## First administrator

After deployment, create the first administrator once:

```bash
curl -X POST https://YOUR-WORKER.workers.dev/api/auth \
  -H "content-type: application/json" \
  --data '{
    "action": "bootstrap",
    "setupToken": "YOUR_SETUP_TOKEN",
    "email": "admin@example.com",
    "password": "USE-A-UNIQUE-12-CHARACTER-MINIMUM-PASSWORD",
    "name": "Administrator",
    "storeNumber": "0244"
  }'
```

The bootstrap route refuses to create another administrator after the first
account exists. Authenticated administrators can add staff through the
`action: "invite"` API.

## Custom domain

Verify the `workers.dev` deployment before moving production traffic. In the
Cloudflare dashboard, open the `food-truck-admin` Worker, choose
**Settings → Domains & Routes → Add → Custom domain**, and enter
`www.foodtruckadmin.com`. Cloudflare will create the required DNS route and
certificate. Remove the old `www` CNAME only if Cloudflare asks you to resolve
the conflict.

## Development

```bash
npm ci
npm run dev
```

Useful commands:

- `npm run build` — production build
- `npm test` — build plus rendered HTML checks
- `npm run db:migrate:local` — apply D1 migrations locally
- `npm run db:migrate:remote` — apply D1 migrations in Cloudflare
- `npm run deploy` — build and deploy with Wrangler

Never commit `.dev.vars`, `.env` files, Cloudflare API tokens, passwords, or
secret values.
