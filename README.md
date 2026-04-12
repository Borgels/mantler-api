# mantler-api

OpenAI-compatible gateway for exposing Mantler mantles as `/v1/*` inference endpoints.

## Run locally

1. Copy `.env.example` to `.env` and set Supabase values.
2. Install dependencies:
   - `npm install`
3. Start:
   - `npm run dev`

Default local URL: `http://localhost:8787/v1`

## Endpoints

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/completions` (returns unsupported endpoint error)

## Fly.io deployment

1. Create app:
   - `fly launch --name mantler-api --no-deploy`
2. Set secrets:
   - `fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...`
3. Deploy:
   - `fly deploy`

## DNS

After deploy, create DNS record:

- `api.mantler.dev` CNAME -> `<fly-app>.fly.dev`

Then issue certificate:

- `fly certs create api.mantler.dev`
