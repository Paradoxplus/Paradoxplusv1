# Paradoxplus Lavalink service

This folder contains the standalone Lavalink v4 service.

## Railway setup

1. In the same Railway project as the bot, create a new service from this GitHub repository.
2. Set the new service's Root Directory to `/lavalink` so Railway builds this folder's Dockerfile.
3. Add `LAVALINK_SERVER_PASSWORD` as a strong random secret in the Lavalink service variables.
4. Deploy the service and use Railway private networking.
5. In the bot service variables, set:
   - `LAVALINK_HOST` to the Lavalink service's private hostname, without a protocol
   - `LAVALINK_PORT` to `2333`
   - `LAVALINK_SECURE` to `false`
   - `LAVALINK_SERVER_PASSWORD` to the same secret used by the Lavalink service
6. Redeploy the bot service.

Keep Lavalink private; do not expose port 2333 publicly. Never put credentials in GitHub or send them in chat.

## Playback

The bot searches Lavalink's built-in SoundCloud source first, then YouTube Music and YouTube as secondary search sources. YouTube tracks may not always be playable without account authorization, so SoundCloud is the preferred playback source. Search results depend on what each provider makes available.
