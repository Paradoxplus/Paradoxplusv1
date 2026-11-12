import "dotenv/config";
import {
  Client, GatewayIntentBits, Partials, Events, PermissionFlagsBits,
  EmbedBuilder
} from "discord.js";
import fs from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error("DISCORD_TOKEN is missing. Add it to your hosting environment variables.");
  process.exit(1);
}

const DATA_DIR = path.resolve("data");
const DATA_FILE = path.join(DATA_DIR, "guild-config.json");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember]
});

let database = { guilds: {} };
let saveQueue = Promise.resolve();

async function loadDatabase() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.guilds) database = parsed;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not read config database:", error);
      throw error;
    }
    await saveDatabase();
  }
}

function saveDatabase() {
  saveQueue = saveQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tempFile = `${DATA_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(database, null, 2), "utf8");
    await fs.rename(tempFile, DATA_FILE);
  });
  return saveQueue;
}

function getGuildConfig(guildId) {
  if (!database.guilds[guildId]) {
    database.guilds[guildId] = { ranks: [], logChannelId: null, announceChannelId: null, history: [] };
  }
  const config = database.guilds[guildId];
  if (!Array.isArray(config.ranks)) config.ranks = [];
  if (!Array.isArray(config.history)) config.history = [];
  if (typeof config.announceChannelId !== "string") config.announceChannelId = null;
  config.ranks.sort((a, b) => a.position - b.position);
  return config;
}

function hasManagerPermission(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageRoles);
}

function rankLabel(rank, index, total) {
  return `${index + 1}. <@&${rank.id}>`;
}

async function replyError(interaction, message) {
  const payload = { content: `⚠️ ${message}`, ephemeral: true };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply(payload);
}

async function logRankChange(guild, config, action, target, oldRank, newRank, actor, reason) {
  if (!config.logChannelId) return;
  const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(action === "PROMOTED" ? 0x36c98f : action === "DEMOTED" ? 0xe0a33a : 0x6597e8)
    .setTitle(`Rank ${action.toLowerCase()}`)
    .addFields(
      { name: "Member", value: `${target} (\`${target.id}\`)`, inline: false },
      { name: "Previous rank", value: oldRank ? `<@&${oldRank.id}>` : "Unranked", inline: true },
      { name: "New rank", value: newRank ? `<@&${newRank.id}>` : "Unranked", inline: true },
      { name: "Changed by", value: `${actor}`, inline: true }
    )
    .setTimestamp();

  if (reason) embed.addFields({ name: "Reason", value: reason.slice(0, 300) });
  await channel.send({ embeds: [embed] }).catch(err => console.error("Could not send rank log:", err));
}

async function applyRank(interaction, target, desiredRank, action, reason) {
  const config = getGuildConfig(interaction.guildId);
  if (config.ranks.length < 2) {
    return replyError(interaction, "The rank hierarchy needs at least two ranks. Ask an administrator to configure it with `/rank-config add`.");
  }

  const configuredIds = new Set(config.ranks.map(r => r.id));
  const currentRanks = target.roles.cache
    .filter(role => configuredIds.has(role.id))
    .map(role => config.ranks.find(r => r.id === role.id))
    .filter(Boolean)
    .sort((a, b) => b.position - a.position);

  const oldRank = currentRanks[0] ?? null;
  const rolesToRemove = config.ranks
    .filter(r => target.roles.cache.has(r.id) && r.id !== desiredRank.id)
    .map(r => interaction.guild.roles.cache.get(r.id))
    .filter(Boolean);
  const newRole = await interaction.guild.roles.fetch(desiredRank.id).catch(() => null);

  if (!newRole) return replyError(interaction, "That rank role no longer exists. Update the hierarchy with `/rank-config`.");
  if (!newRole.editable || rolesToRemove.some(role => !role.editable)) {
    return replyError(interaction, "I can't manage one or more of those roles. Move my bot role above every rank role in Server Settings → Roles.");
  }

  // Apply the new role first. If adding fails, the member keeps their old rank.
  try {
    if (!target.roles.cache.has(newRole.id)) {
      await target.roles.add(newRole, `Rank ${action.toLowerCase()} by ${interaction.user.tag}`);
    }
    const removeIds = rolesToRemove.map(role => role.id);
    if (removeIds.length) {
      await target.roles.remove(removeIds, `Replace previous rank after ${action.toLowerCase()}`);
    }
  } catch (error) {
    console.error("Role update failed:", error);
    return replyError(interaction, "Discord rejected the role update. Check my Manage Roles permission and role position.");
  }

  const historyEntry = {
    timestamp: new Date().toISOString(),
    memberId: target.id,
    actorId: interaction.user.id,
    action,
    oldRankId: oldRank?.id ?? null,
    newRankId: desiredRank.id,
    reason: reason || null
  };
  config.history.unshift(historyEntry);
  config.history = config.history.slice(0, 1000);
  await saveDatabase();

  await logRankChange(interaction.guild, config, action, target.user, oldRank, desiredRank, interaction.user, reason);
  if (config.announceChannelId) {
    const announcementChannel = await interaction.guild.channels.fetch(config.announceChannelId).catch(() => null);
    if (announcementChannel?.isTextBased()) {
      await announcementChannel.send({
        content: `🎉 **Rank update!** <@${target.id}> has moved to <@&${desiredRank.id}>!`,
        allowedMentions: { users: [target.id], roles: [desiredRank.id] }
      }).catch(error => console.error("Rank announcement failed:", error));
    }
  }

  const verb = action === "PROMOTED" ? "promoted" : action === "DEMOTED" ? "demoted" : "updated";
  const from = oldRank ? `<@&${oldRank.id}>` : "Unranked";
  await interaction.editReply({
    content: `✅ **${target.user.tag}** was ${verb}.\n**Previous:** ${from}\n**New:** <@&${desiredRank.id}>${reason ? `\n**Reason:** ${reason}` : ""}`,
    allowedMentions: { users: [], roles: [desiredRank.id] }
  });
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Online as ${readyClient.user.tag}`);
  console.log(`Serving ${readyClient.guilds.cache.size} server(s).`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild()) return replyError(interaction, "This command only works inside a server.");

  try {
    const config = getGuildConfig(interaction.guildId);

    if (interaction.commandName === "rank-config") {
      if (!hasManagerPermission(interaction.member)) {
        return replyError(interaction, "You need **Manage Roles** or **Administrator** to configure ranks.");
      }

      const sub = interaction.options.getSubcommand();

      if (sub === "add") {
        const role = interaction.options.getRole("role", true);
        const position = interaction.options.getInteger("position", true);
        if (role.id === interaction.guildId || role.managed) {
          return replyError(interaction, "That role can't be used as a rank.");
        }
        const botMember = await interaction.guild.members.fetchMe();
        if (role.position >= botMember.roles.highest.position) {
          return replyError(interaction, "Move my bot role above this rank before adding it.");
        }
        config.ranks = config.ranks.filter(r => r.id !== role.id && r.position !== position);
        config.ranks.push({ id: role.id, position });
        config.ranks.sort((a, b) => a.position - b.position);
        await saveDatabase();
        return interaction.reply({
          content: `✅ Added <@&${role.id}> at position **${position}**. Position 1 is the lowest rank.`,
          ephemeral: true,
          allowedMentions: { parse: [] }
        });
      }

      if (sub === "remove") {
        const role = interaction.options.getRole("role", true);
        const before = config.ranks.length;
        config.ranks = config.ranks.filter(r => r.id !== role.id);
        if (config.ranks.length === before) return replyError(interaction, "That role isn't in the configured hierarchy.");
        await saveDatabase();
        return interaction.reply({ content: `✅ Removed <@&${role.id}> from the rank hierarchy. Members keep the role until changed manually.`, ephemeral: true });
      }

      if (sub === "list") {
        if (!config.ranks.length) return interaction.reply({ content: "No ranks configured yet. Add them with `/rank-config add`.", ephemeral: true });
        const lines = config.ranks.map((r, i) => `${i + 1}. <@&${r.id}>`).join("\n");
        return interaction.reply({ content: `**Rank hierarchy (lowest → highest)**\n${lines}`, ephemeral: true, allowedMentions: { parse: [] } });
      }

      if (sub === "logs") {
        const channel = interaction.options.getChannel("channel", true);
        config.logChannelId = channel.id;
        await saveDatabase();
        return interaction.reply({ content: `✅ Rank-change logs will be sent to ${channel}.`, ephemeral: true });
      }

      if (sub === "clear-logs") {
        config.logChannelId = null;
        await saveDatabase();
        return interaction.reply({ content: "✅ Rank-change logging disabled.", ephemeral: true });
      }

      if (sub === "announce") {
        const channel = interaction.options.getChannel("channel", true);
        config.announceChannelId = channel.id;
        await saveDatabase();
        return interaction.reply({ content: `✅ Rank-up announcements will be sent to ${channel}.`, ephemeral: true });
      }

      if (sub === "clear-announcements") {
        config.announceChannelId = null;
        await saveDatabase();
        return interaction.reply({ content: "✅ Rank-up announcements disabled.", ephemeral: true });
      }

      if (sub === "backup") {
        const backup = JSON.stringify({ version: 1, guildId: interaction.guildId, config }, null, 2);
        return interaction.reply({
          content: "Your server's Paradoxplus configuration backup is attached.",
          files: [{ attachment: Buffer.from(backup, "utf8"), name: `paradoxplus-backup-${interaction.guildId}.json` }],
          ephemeral: true
        });
      }

      if (sub === "autodetect") {
        const confirm = interaction.options.getBoolean("confirm", true);
        const botMember = await interaction.guild.members.fetchMe();
        const excludedName = /\b(admin(istrator)?|owner|co[- ]?owner|staff|moderator|mod|helper|support|bot|verified|member|muted|mute|booster|nitro|ping|notification|announcement|ticket|blacklist|banned|jail|quarantine|developer|management)\b/i;
        const configuredIds = new Set(config.ranks.map(rank => rank.id));
        const candidates = interaction.guild.roles.cache
          .filter(role =>
            role.id !== interaction.guildId &&
            !role.managed &&
            !configuredIds.has(role.id) &&
            role.position < botMember.roles.highest.position &&
            !excludedName.test(role.name)
          )
          .sort((a, b) => a.position - b.position);

        if (!candidates.size) {
          return interaction.reply({
            content: "I couldn't find any new eligible rank roles. Existing ranks, managed roles, and common staff/utility roles are skipped.",
            ephemeral: true
          });
        }

        if (!confirm) {
          const preview = candidates.map((role, index) => `${index + 1}. **${role.name}**`).slice(0, 35);
          const remaining = candidates.size - preview.length;
          return interaction.reply({
            content: `**Rank-role detection preview**\nFound **${candidates.size}** possible rank roles, ordered from lowest to highest by Discord role position.\n\n${preview.join("\n")}${remaining > 0 ? `\n…and ${remaining} more.` : ""}\n\nNothing has been changed. Run \`/rank-config autodetect confirm:true\` to import these roles. Review the list first; staff, bot, and utility roles are filtered by name.`,
            ephemeral: true,
            allowedMentions: { parse: [] }
          });
        }

        const startPosition = config.ranks.reduce((max, rank) => Math.max(max, Number(rank.position) || 0), 0);
        const imported = candidates.map((role, index) => ({
          id: role.id,
          position: startPosition + index + 1
        }));
        config.ranks.push(...imported);
        config.ranks.sort((a, b) => a.position - b.position);
        await saveDatabase();

        const names = candidates.map(role => role.name).slice(0, 25);
        const remaining = candidates.size - names.length;
        return interaction.reply({
          content: `✅ Imported **${candidates.size}** detected rank roles into the existing hierarchy. Existing configured ranks were kept. New roles were added above them, ordered by Discord role position.\n\n${names.map((name, index) => `${index + 1}. **${name}**`).join("\n")}${remaining > 0 ? `\n…and ${remaining} more.` : ""}\n\nUse \`/rank-config list\` to review the full hierarchy.`,
          ephemeral: true,
          allowedMentions: { parse: [] }
        });
      }
    }

    if (interaction.commandName === "rank-history") {
      const user = interaction.options.getUser("member", true);
      const entries = config.history.filter(item => item.memberId === user.id).slice(0, 10);
      if (!entries.length) return interaction.reply({ content: `No saved rank history for **${user.tag}**.`, ephemeral: true });
      const lines = entries.map(item => {
        const oldRank = item.oldRankId ? `<@&${item.oldRankId}>` : "Unranked";
        const newRank = item.newRankId ? `<@&${item.newRankId}>` : "Unranked";
        const date = new Date(item.timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
        return `• **${item.action}**: ${oldRank} → ${newRank} — <t:${Math.floor(new Date(item.timestamp).getTime() / 1000)}:R> (by <@${item.actorId}>)`;
      });
      return interaction.reply({ content: `**Rank history — ${user.tag}**\n${lines.join("\n")}`, ephemeral: true, allowedMentions: { parse: [] } });
    }

    if (interaction.commandName === "rank-search") {
      const query = interaction.options.getString("query", true).toLowerCase();
      await interaction.deferReply({ ephemeral: true });
      const members = await interaction.guild.members.fetch();
      const matches = members.filter(member =>
        member.user.username.toLowerCase().includes(query) ||
        (member.displayName || "").toLowerCase().includes(query)
      ).first(10);
      if (!matches.length) return interaction.editReply("No matching members found.");
      const lines = matches.map(member => {
        const rank = config.ranks.filter(item => member.roles.cache.has(item.id)).sort((a,b) => b.position-a.position)[0];
        return `• ${member.user.tag} — ${rank ? `<@&${rank.id}>` : "Unranked"}`;
      });
      return interaction.editReply({ content: `**Member search results**\n${lines.join("\n")}`, allowedMentions: { parse: [] } });
    }

    if (interaction.commandName === "rank-stats" || interaction.commandName === "rank-leaderboard") {
      await interaction.deferReply({ ephemeral: true });
      const members = await interaction.guild.members.fetch();
      const counts = config.ranks.map(rank => ({
        rank,
        count: members.filter(member => member.roles.cache.has(rank.id)).size
      }));
      if (interaction.commandName === "rank-stats") {
        const totalRanked = counts.reduce((sum, item) => sum + item.count, 0);
        const lines = counts.map(item => `• <@&${item.rank.id}> — **${item.count}** members`);
        return interaction.editReply({
          content: `**Rank statistics**\nMembers in server: **${members.size}**\nRanked members (rank-role assignments): **${totalRanked}**\n\n${lines.length ? lines.join("\n") : "No ranks configured."}`,
          allowedMentions: { parse: [] }
        });
      }
      const ranked = members.map(member => {
        const rank = config.ranks.filter(item => member.roles.cache.has(item.id)).sort((a,b) => b.position-a.position)[0];
        return rank ? { member, rank } : null;
      }).filter(Boolean).sort((a,b) => b.rank.position-a.rank.position || a.member.user.username.localeCompare(b.member.user.username)).slice(0,10);
      if (!ranked.length) return interaction.editReply("No ranked members found.");
      return interaction.editReply({
        content: `**Rank leaderboard — highest ranks first**\n${ranked.map((item,index) => `${index+1}. **${item.member.user.tag}** — <@&${item.rank.id}>`).join("\n")}`,
        allowedMentions: { parse: [] }
      });
    }

    if (interaction.commandName === "rank-panel") {
      const embed = new EmbedBuilder()
        .setColor(0x6f8cff)
        .setTitle(`${interaction.guild.name} — Rank hierarchy`)
        .setDescription(config.ranks.length
          ? config.ranks.map((rank,index) => `${index+1}. <@&${rank.id}>`).join("\n")
          : "No ranks have been configured yet.")
        .setFooter({ text: "Manual progression • Staff-controlled promotions" });
      return interaction.reply({ embeds: [embed], ephemeral: false, allowedMentions: { parse: [] } });
    }

    if (interaction.commandName === "rank-help") {
      return interaction.reply({
        content: [
          "**Paradoxplus commands**",
          "`/rank` — check a member's rank",
          "`/rank-panel` — view the rank hierarchy",
          "`/rank-history member:` — view rank changes",
          "`/rank-search query:` — search server members",
          "`/rank-stats` — rank distribution",
          "`/rank-leaderboard` — highest configured ranks",
          "`/promote`, `/demote`, `/setrank` — staff-controlled rank changes",
          "`/rank-config` — configure ranks, logs, announcements and detection",
          "Progression is manual. The bot never promotes members automatically."
        ].join("\n"),
        ephemeral: true
      });
    }

    if (interaction.commandName === "rank") {
      const user = interaction.options.getUser("member") ?? interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return replyError(interaction, "I couldn't find that member in this server.");
      const ids = new Set(config.ranks.map(r => r.id));
      const found = config.ranks
        .filter(r => member.roles.cache.has(r.id))
        .sort((a, b) => b.position - a.position)[0];
      return interaction.reply({
        content: found ? `**${member.user.tag}**'s rank: <@&${found.id}>` : `**${member.user.tag}** is currently unranked.`,
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }

    if (["promote", "demote", "setrank"].includes(interaction.commandName)) {
      if (!hasManagerPermission(interaction.member)) {
        return replyError(interaction, "You need **Manage Roles** or **Administrator** to change ranks.");
      }
      const user = interaction.options.getUser("member", true);
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!target) return replyError(interaction, "That member isn't in this server.");
      if (target.id === interaction.client.user.id) return replyError(interaction, "I can't change my own rank.");

      const actor = await interaction.guild.members.fetch(interaction.user.id);
      if (interaction.guild.ownerId !== actor.id &&
          target.roles.highest.comparePositionTo(actor.roles.highest) >= 0) {
        return replyError(interaction, "You can't change the rank of someone whose highest role is equal to or above yours.");
      }

      const botMember = await interaction.guild.members.fetchMe();
      if (target.roles.highest.comparePositionTo(botMember.roles.highest) >= 0) {
        return replyError(interaction, "My highest role must be above the target member's highest role.");
      }

      const ranks = config.ranks;
      if (!ranks.length) return replyError(interaction, "No ranks are configured. An administrator must add ranks using `/rank-config add`.");

      const current = ranks
        .filter(r => target.roles.cache.has(r.id))
        .sort((a, b) => b.position - a.position)[0] ?? null;
      let desired = null;
      let action = interaction.commandName.toUpperCase();

      if (interaction.commandName === "setrank") {
        const role = interaction.options.getRole("rank", true);
        desired = ranks.find(r => r.id === role.id);
        if (!desired) return replyError(interaction, "That role isn't in the configured rank hierarchy. Add it first with `/rank-config add`.");
        action = "SET";
      } else if (interaction.commandName === "promote") {
        const currentIndex = current ? ranks.findIndex(r => r.id === current.id) : -1;
        const nextIndex = currentIndex + 1;
        if (nextIndex >= ranks.length) return replyError(interaction, "That member is already at the highest configured rank.");
        desired = ranks[nextIndex];
      } else {
        if (!current) return replyError(interaction, "That member has no configured rank, so they can't be demoted.");
        const currentIndex = ranks.findIndex(r => r.id === current.id);
        if (currentIndex <= 0) return replyError(interaction, "That member is already at the lowest configured rank.");
        desired = ranks[currentIndex - 1];
      }

      const reason = interaction.options.getString("reason");
      await interaction.deferReply({ ephemeral: false });
      return applyRank(interaction, target, desired, action, reason);
    }
  } catch (error) {
    console.error("Command error:", error);
    return replyError(interaction, "Something went wrong. Check the bot logs and try again.");
  }
});

await loadDatabase();
client.login(TOKEN);
