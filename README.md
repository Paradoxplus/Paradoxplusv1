# Paradoxplus

A Discord rank-management bot built with discord.js v14 and Node.js 20+.

## Progression model

Paradoxplus uses **manual progression only**. It does not award XP, grind points, or automatically promote/demote members. Staff members with Manage Roles or Administrator control every rank change.

## Commands

### Member commands
- `/rank [member]` — show a member's configured rank.
- `/rank-panel` — display the server's rank hierarchy.
- `/rank-history member` — show the latest 10 rank changes for a member.
- `/rank-search query` — search members by username or nickname.
- `/rank-stats` — show member counts for configured ranks.
- `/rank-leaderboard` — list up to 10 members with the highest configured ranks.
- `/rank-help` — show command help.

### Staff commands
- `/promote member [reason]` — move a member up one configured rank.
- `/demote member [reason]` — move a member down one configured rank.
- `/setrank member rank [reason]` — assign an exact configured rank.
- `/rank-config add role position` — add a rank; position 1 is lowest.
- `/rank-config remove role` — remove a role from the hierarchy without removing it from members.
- `/rank-config list` — show the configured hierarchy.
- `/rank-config autodetect confirm:false` — preview eligible server roles before import.
- `/rank-config autodetect confirm:true` — import detected roles after reviewing the preview.
- `/rank-config logs channel` — set the audit-log channel.
- `/rank-config clear-logs` — disable audit logging.
- `/rank-config announce channel` — set rank-up announcement channel.
- `/rank-config clear-announcements` — disable rank announcements.
- `/rank-config backup` — download a JSON backup of the server's rank configuration and history.

## Browser dashboard

The dashboard runs in the same Railway service as the bot at the service's public HTTPS domain. It supports Discord sign-in, server selection, rank-role management, detection exclusions, and log/announcement channel settings. The dashboard only displays servers where the signed-in user has Manage Roles or Administrator and Paradoxplus is online.

## Prefix commands

Paradoxplus also supports the `.` message prefix alongside slash commands:
- `.rank [@member]` — check a member's rank.
- `.promote @member [reason]` / `.demote @member [reason]` — staff rank changes.
- `.setrank @member @rank [reason]` — assign an exact configured rank.
- `.rankpanel` — show the hierarchy.
- `.rankhelp` — show prefix help.

To enable prefix commands, turn on **Message Content Intent** in the Discord Developer Portal (Bot → Privileged Gateway Intents). The bot also needs the **Message Content Intent** gateway intent in code, which is already enabled. Slash commands remain available.

## Setup

1. Use Node.js 20 or newer.
2. Install dependencies with `npm install`.
3. Set `DISCORD_TOKEN` and `CLIENT_ID`. Set `GUILD_ID` for fast guild-scoped command registration during testing.
4. Enable **Server Members Intent** and **Message Content Intent** in the Discord Developer Portal.
5. For the browser dashboard, add these environment variables to Railway: `DASHBOARD_URL` (your public HTTPS Railway domain), `DISCORD_CLIENT_SECRET` (from Developer Portal → OAuth2 → Client Secret), and `DASHBOARD_SESSION_SECRET` (a long random secret). Keep the existing `CLIENT_ID`.
6. In Developer Portal → OAuth2 → Redirects, add the exact URL `https://YOUR-DASHBOARD-DOMAIN/auth/callback` (replace the domain with your Railway domain). The dashboard uses Discord OAuth2 scopes `identify` and `guilds`.
7. Open your Railway public domain in a browser and sign in with Discord. You must have Manage Roles or Administrator in a server, and Paradoxplus must already be in that server.
8. Invite the bot with the `bot` and `applications.commands` scopes. Grant only the permissions it needs: Manage Roles, View Channels, Send Messages, Embed Links, and Read Message History.
9. Move the bot's highest role above every rank role it needs to manage.
10. Run `npm start` (the prestart script registers slash commands).

## Storage

Configuration, rank history, log channel, and announcement channel are stored in `data/guild-config.json`. Mount persistent storage at `/app/data` on Railway so data survives redeploys.

The bot keeps the most recent 1,000 rank changes per server. Backups are downloaded privately as JSON.

## Safety notes

- Role autodetection is a convenience filter, not a guarantee. Always inspect the preview before confirming an import.
- Managed roles, @everyone, roles above the bot, and common staff/utility role names are excluded from autodetection.
- The bot never grants Administrator.
- The bot checks staff and bot role hierarchy before changing member roles.
- Bulk changes and automatic promotions are intentionally not enabled.
