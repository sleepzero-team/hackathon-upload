# 漫步吸血鬼

## Setup

### environment variables

```bash
# .env

NUXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
NUXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

Ensure you have installed corepack. We use `pnpm` as package manager.

```sh
corepack enable
```

After that, install the dependencies:

```bash
# pnpm
pnpm install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# normal development
pnpm dev

# expose to local network
pnpm dev --public

# run cloudflare tunnel (dev server)
pnpm tunnel
```

## Production

Build the application for production:

```bash
# pnpm
pnpm build
```

Locally preview production build:

```bash
# pnpm
pnpm preview
```
