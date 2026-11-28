# Elixe • As

A Discord rank-management bot built with discord.js v14 and Node.js 20+.

## Progression model

Elixe • As uses **manual progression only**. It does not award XP, grind points, or automatically promote/demote members. Staff members with Manage Roles or Administrator control every rank change.

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

The dashboard runs in the same Railway service as the bot at the service's public HTTPS domain. It supports Discord sign-in, server selection, rank-role management, detection exclusions, and log/announcement channel settings. The dashboard only displays servers where the signed-in user has Manage Roles or Administrator and Elixe • As is online.

## Prefix commands

Elixe • As also supports the `.` message prefix alongside slash commands:
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
5. For the private browser dashboard, set these Railway environment variables:
   - `DASHBOARD_PASSWORD`: a unique random password of at least 16 characters.
   - `DASHBOARD_SESSION_SECRET`: a separate random secret of at least 32 characters.
   - `DASHBOARD_GUILD_ID`: the ID of the one server this dashboard may manage.
6. Open the Railway public HTTPS domain in a browser. Enter `DASHBOARD_PASSWORD` to unlock the dashboard. This implementation uses a shared dashboard password, **not Discord OAuth**; anyone with the password can access the configured server's dashboard.
7. Invite the bot with the `bot` and `applications.commands` scopes. Grant only the permissions it needs: Manage Roles, View Channels, Send Messages, Embed Links, and Read Message History.
8. Move the bot's highest role above every rank role it needs to manage.
9. Run `npm start` (the prestart script registers slash commands).

Keep both dashboard secrets private, never reuse your Discord password, and rotate them immediately if exposed. The dashboard is restricted to the configured `DASHBOARD_GUILD_ID`; its server-side API does not grant access to other guilds.

## Storage

Configuration, rank history, log channel, and announcement channel are shared through Neon PostgreSQL (`paradoxplus_bot_state`). Each host also keeps a local `data/guild-config.json` cache on its persistent volume.

The bot keeps the most recent 1,000 rank changes per server. Backups are downloaded privately as JSON.

## Safety notes

- Role autodetection is a convenience filter, not a guarantee. Always inspect the preview before confirming an import.
- Managed roles, @everyone, roles above the bot, and common staff/utility role names are excluded from autodetection.
- The bot never grants Administrator.
- The bot checks staff and bot role hierarchy before changing member roles.
- Bulk changes and automatic promotions are intentionally not enabled.


## High availability: Railway primary + HOKAS standby

Both hosts must run the **same Git revision** and use the **same Neon `DATABASE_URL`** and **same Discord bot token**. Do not run an older bot build on HOKAS beside the lease-enabled Railway build.

The bot uses a PostgreSQL lease (`paradoxplus_bot_lease`) with a 20-second expiry and a 5-second heartbeat. Only the lease holder logs into Discord. A host that cannot reach Neon stays disconnected. If the active host loses the lease or cannot renew it, it disconnects and exits; the other host takes over after the lease expires. The guild configuration is loaded from Neon after a host acquires the lease, so the standby does not overwrite shared settings with its local files.

### Railway primary

- Keep `DATABASE_URL` pointed at the shared Neon database.
- Railway's `RAILWAY_SERVICE_ID` is used as its instance label when `BOT_INSTANCE_ID` is not set.
- Keep the Railway service running normally.

### HOKAS standby

- Deploy the same repository revision that contains the Neon lease code.
- Set `DISCORD_TOKEN` to the same bot token used by Railway.
- Set `CLIENT_ID` to the same Discord application ID.
- Set `DATABASE_URL` to the same Neon database used by Railway (not HOKAS's local MySQL database).
- Set `BOT_INSTANCE_ID=hokas-standby`.
- Keep the HOKAS process running. It will log `[Failover] STANDBY` and will not connect to Discord while Railway owns the lease.

### Verification

- Active host logs: `[Failover] ACTIVE`
- Standby host logs: `[Failover] STANDBY`
- After a controlled primary outage, standby should acquire the lease and log `ACTIVE`.
- Never test by starting two copies of an older build. Test failover only after both hosts run the lease-enabled revision.
- Keep a current backup before changing hosting or database configuration.
