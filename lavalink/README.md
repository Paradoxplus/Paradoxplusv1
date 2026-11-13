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
   - `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` to the credentials from your Spotify developer app
6. Redeploy the bot service.

Keep Lavalink private; do not expose port 2333 publicly. Never put credentials in GitHub or send them in chat.

## Playback

Spotify Web API supplies catalog search and metadata. Lavalink searches SoundCloud for a playable match. Spotify search results are not Spotify audio streams, so a matching SoundCloud track may not exist for every result.
