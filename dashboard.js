import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const htmlPath = path.join(process.cwd(), "dashboard", "index.html");
const json = (res, status, data) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
};
const cookieMap = header => Object.fromEntries((header || "").split(";").map(x => x.trim().split(/=(.*)/s).slice(0,2)).filter(x => x.length === 2));
const safeEqual = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function startDashboard({ client, getGuildConfig, saveDatabase }) {
  const base = process.env.DASHBOARD_URL?.replace(/\/$/, "");
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const secret = process.env.DASHBOARD_SESSION_SECRET || clientSecret;
  if (!base || !clientId || !clientSecret || !secret) {
    console.warn("Paradoxplus dashboard disabled: set DASHBOARD_URL, CLIENT_ID, DISCORD_CLIENT_SECRET, and DASHBOARD_SESSION_SECRET.");
    return;
  }
  const states = new Map();
  const sign = value => crypto.createHmac("sha256", secret).update(value).digest("base64url");
  const pack = value => {
    const body = Buffer.from(JSON.stringify(value)).toString("base64url");
    return body + "." + sign(body);
  };
  const unpack = value => {
    if (!value) return null;
    const [body, signature] = value.split(".");
    if (!body || !signature || !safeEqual(signature, sign(body))) return null;
    try {
      const session = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      return session.expiresAt > Date.now() ? session : null;
    } catch { return null; }
  };
  const readBody = req => new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 20000) { reject(new Error("Request too large")); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("Invalid JSON")); }
    });
  });
  const discord = async (route, token) => {
    const response = await fetch("https://discord.com/api/v10" + route, {
      headers: { Authorization: "Bearer " + token }
    });
    if (!response.ok) throw new Error("Discord API returned " + response.status);
    return response.json();
  };
  const isManager = guild => {
    const p = BigInt(guild.permissions || "0");
    return (p & 8n) === 8n || (p & 268435456n) === 268435456n;
  };
  const allowedGuild = (guilds, id) => guilds.find(g => g.id === id && isManager(g));
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, base);
      if (req.method === "GET" && url.pathname === "/auth/discord") {
        const state = crypto.randomBytes(24).toString("hex");
        states.set(state, Date.now() + 5 * 60_000);
        const authorize = new URL("https://discord.com/oauth2/authorize");
        authorize.searchParams.set("client_id", clientId);
        authorize.searchParams.set("response_type", "code");
        authorize.searchParams.set("redirect_uri", base + "/auth/callback");
        authorize.searchParams.set("scope", "identify guilds");
        authorize.searchParams.set("state", state);
        res.writeHead(302, { location: authorize.toString(), "cache-control": "no-store" }); return res.end();
      }
      if (req.method === "GET" && url.pathname === "/auth/callback") {
        const state = url.searchParams.get("state");
        const expiry = states.get(state);
        states.delete(state);
        for (const [key, value] of states) if (value < Date.now()) states.delete(key);
        if (!state || !expiry || expiry < Date.now() || !url.searchParams.get("code")) return json(res, 400, { error: "Login expired. Try again." });
        const form = new URLSearchParams({
          client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code",
          code: url.searchParams.get("code"), redirect_uri: base + "/auth/callback"
        });
        const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form
        });
        if (!tokenResponse.ok) throw new Error("Discord login could not be completed.");
        const tokenData = await tokenResponse.json();
        const user = await discord("/users/@me", tokenData.access_token);
        const session = pack({
          token: tokenData.access_token, user: { id: user.id, username: user.username, avatar: user.avatar },
          expiresAt: Date.now() + Math.min(tokenData.expires_in || 3600, 3600) * 1000
        });
        res.writeHead(302, {
          location: "/", "set-cookie": "pp_session=" + session + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600",
          "cache-control": "no-store"
        }); return res.end();
      }
      if (req.method === "POST" && url.pathname === "/auth/logout") {
        res.writeHead(200, { "set-cookie": "pp_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0" });
        return res.end("ok");
      }
      if (url.pathname.startsWith("/api/")) {
        const session = unpack(cookieMap(req.headers.cookie).pp_session);
        if (!session) return json(res, 401, { error: "Please sign in with Discord." });
        if (req.headers.origin && req.headers.origin !== base) return json(res, 403, { error: "Invalid request origin." });
        const guilds = await discord("/users/@me/guilds", session.token);
        if (req.method === "GET" && url.pathname === "/api/me") {
          return json(res, 200, { user: session.user, guilds: guilds.filter(g => isManager(g) && client.guilds.cache.has(g.id)).map(g => ({ id:g.id, name:g.name, icon:g.icon })) });
        }
        const match = url.pathname.match(/^\/api\/guild\/(\d+)(?:\/(roles|settings))?$/);
        if (!match) return json(res, 404, { error: "Not found." });
        const guildId = match[1];
        if (!allowedGuild(guilds, guildId)) return json(res, 403, { error: "You need Manage Roles or Administrator in this server." });
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return json(res, 409, { error: "Paradoxplus is not in this server." });
        const config = getGuildConfig(guildId);
        const bot = guild.members.me ?? await guild.members.fetchMe();
        if (req.method === "GET") {
          await guild.roles.fetch();
          const roleInfo = role => ({ id: role.id, name: role.name, position: role.position, color: role.hexColor, managed: role.managed, editable: role.editable });
          const ranks = config.ranks.map(r => guild.roles.cache.get(r.id)).filter(Boolean).map(roleInfo);
          const ignored = config.ignoredRoleIds.map(id => guild.roles.cache.get(id)).filter(Boolean).map(roleInfo);
          const available = guild.roles.cache.filter(r => r.id !== guildId && !r.managed).sort((a,b)=>a.position-b.position).map(roleInfo);
          const channels = guild.channels.cache.filter(c => c.isTextBased() && c.guildId === guildId).map(c => ({ id:c.id, name:c.name }));
          return json(res, 200, {
            guild: { id:guild.id, name:guild.name, icon:guild.iconURL({size:128}) },
            ranks, ignored, available, channels,
            logChannelId: config.logChannelId || "", announceChannelId: config.announceChannelId || "",
            botReady: true
          });
        }
        if (req.method === "POST") {
          const body = await readBody(req);
          if (url.pathname.endsWith("/roles")) {
            const role = guild.roles.cache.get(String(body.roleId || ""));
            if (!role || role.id === guildId || role.managed) return json(res, 400, { error: "That role cannot be used. Choose a normal server role." });
            if (body.action === "add") {
              if (role.position >= bot.roles.highest.position || !role.editable) return json(res, 400, { error: "Move the bot's role above this role first." });
              const position = Math.max(1, Math.min(100, Number(body.position) || config.ranks.length + 1));
              config.ranks = config.ranks.filter(r => r.id !== role.id && r.position !== position);
              config.ranks.push({ id: role.id, position });
              config.ranks.sort((a,b)=>a.position-b.position);
              config.ignoredRoleIds = config.ignoredRoleIds.filter(id => id !== role.id);
            } else if (body.action === "remove") {
              config.ranks = config.ranks.filter(r => r.id !== role.id);
            } else if (body.action === "ignore") {
              config.ranks = config.ranks.filter(r => r.id !== role.id);
              if (!config.ignoredRoleIds.includes(role.id)) config.ignoredRoleIds.push(role.id);
            } else if (body.action === "unignore") {
              config.ignoredRoleIds = config.ignoredRoleIds.filter(id => id !== role.id);
            } else return json(res, 400, { error: "Unknown role action." });
          } else if (url.pathname.endsWith("/settings")) {
            for (const key of ["logChannelId","announceChannelId"]) {
              const id = body[key] || null;
              if (id && !guild.channels.cache.get(id)?.isTextBased()) return json(res, 400, { error: "Choose a valid text channel." });
              config[key] = id;
            }
          } else return json(res, 404, { error: "Not found." });
          await saveDatabase();
          return json(res, 200, { ok: true });
        }
        return json(res, 405, { error: "Method not allowed." });
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        const page = await fs.readFile(htmlPath);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return res.end(page);
      }
      res.writeHead(404, { "content-type": "text/plain" }); res.end("Not found");
    } catch (error) {
      console.error("Dashboard error:", error);
      if (!res.headersSent) json(res, 500, { error: "Dashboard request failed. Check the hosting logs." });
      else res.end();
    }
  });
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, "0.0.0.0", () => console.log("Paradoxplus dashboard listening on port " + port));
}
