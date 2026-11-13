import "dotenv/config";
import {
  Client, GatewayIntentBits, Partials, Events, PermissionFlagsBits,
  EmbedBuilder
} from "discord.js";
import fs from "node:fs/promises";
import path from "node:path";
import { startDashboard } from "./dashboard.js";

const TOKEN = process.env.DISCORD_TOKEN;
const BOT_OWNER_ID = "1367968697884606524";
const isBotOwner = userId => userId === BOT_OWNER_ID;
if (!TOKEN) {
  console.error("DISCORD_TOKEN is missing. Add it to your hosting environment variables.");
  process.exit(1);
}

const DATA_DIR = path.resolve("data");
const DATA_FILE = path.join(DATA_DIR, "guild-config.json");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
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
  // Recover the queue after a failed disk write so later saves can still run.
  saveQueue = saveQueue.catch(error => {
    console.error("Previous database save failed; retrying with latest data:", error);
  }).then(async () => {
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
  if (!Array.isArray(config.warnings)) config.warnings = [];
  if (!Array.isArray(config.strikes)) config.strikes = [];
  if (!Array.isArray(config.strikeHistory)) config.strikeHistory = [];
  if (!Array.isArray(config.moderationCases)) config.moderationCases = [];
  if (!config.pulse || typeof config.pulse !== "object") config.pulse = { days: {} };
  if (!config.pulse.days || typeof config.pulse.days !== "object") config.pulse.days = {};
  if (!Array.isArray(config.ignoredRoleIds)) config.ignoredRoleIds = [];
  if (!Array.isArray(config.autoresponders)) config.autoresponders = [];
  if (!Array.isArray(config.inactiveAppeals)) config.inactiveAppeals = [];
  if (typeof config.announceChannelId !== "string") config.announceChannelId = null;
  config.ranks.sort((a, b) => a.position - b.position);
  return config;
}

function canActOnTarget(actor, target, guild) {
  return isBotOwner(actor.id) ||
    guild.ownerId === actor.id ||
    actor.permissions.has(PermissionFlagsBits.Administrator) ||
    target.roles.highest.comparePositionTo(actor.roles.highest) < 0;
}

function hasManagerPermission(member) {
  return isBotOwner(member.id) ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageRoles);
}

function rankLabel(rank, index, total) {
  return `${index + 1}. <@&${rank.id}>`;
}

function getHighestConfiguredRank(member, ranks) {
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (member.roles.cache.has(ranks[i].id)) return ranks[i];
  }
  return null;
}

async function getGuildMembers(guild) {
  if (guild.members.cache.size >= guild.memberCount) return guild.members.cache;
  return guild.members.fetch();
}

async function replyError(interaction, message) {
  const payload = { content: `⚠️ ${message}`, ephemeral: true };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply(payload);
}

function rankActionStyle(action) {
  if (action === "PROMOTE" || action === "PROMOTED") {
    return { verb: "got promoted", title: "PROMOTION", color: 0x35d07f, emoji: "🚀" };
  }
  if (action === "DEMOTE" || action === "DEMOTED") {
    return { verb: "got demoted", title: "DEMOTION", color: 0xf0a33a, emoji: "📉" };
  }
  return { verb: "had their rank updated", title: "RANK UPDATE", color: 0x8b75ff, emoji: "👑" };
}

function rankChangeEmbed(action, target, oldRank, newRank, actor, reason, guild) {
  const style = rankActionStyle(action);
  const embed = new EmbedBuilder()
    .setColor(style.color)
    .setAuthor({ name: `PARADOXPLUS • ${style.title}`, iconURL: guild.iconURL() || undefined })
    .setTitle(`${style.emoji} Rank change`)
    .setDescription(`## ${target} ${style.verb} by ${actor}`)
    .addFields(
      { name: "⬅️ Previous rank", value: oldRank ? `<@&${oldRank.id}>` : "Unranked", inline: true },
      { name: "➡️ New rank", value: newRank ? `<@&${newRank.id}>` : "Unranked", inline: true },
      { name: "🛡️ Staff member", value: `${actor}`, inline: false }
    )
    .setFooter({ text: `${guild.name} • Paradoxplus Rank System` })
    .setTimestamp();
  if (reason) embed.addFields({ name: "📝 Reason", value: reason.slice(0, 300) });
  return embed;
}

async function logRankChange(guild, config, action, target, oldRank, newRank, actor, reason) {
  if (!config.logChannelId) return;
  const channel = guild.channels.cache.get(config.logChannelId) ?? await guild.channels.fetch(config.logChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  const embed = rankChangeEmbed(action, target, oldRank, newRank, actor, reason, guild);
  await channel.send({
    embeds: [embed],
    allowedMentions: {
      users: [target.id, actor.id],
      roles: [oldRank?.id, newRank?.id].filter(Boolean),
      parse: []
    }
  }).catch(err => console.error("Could not send rank log:", err));
}

async function applyRank(interaction, target, desiredRank, action, reason) {
  const config = getGuildConfig(interaction.guildId);
  if (config.ranks.length < 2) {
    return replyError(interaction, "The rank hierarchy needs at least two ranks. Ask an administrator to configure it with `/rank-config add`.");
  }

  const oldRank = getHighestConfiguredRank(target, config.ranks);
  const newRole = interaction.guild.roles.cache.get(desiredRank.id) ?? await interaction.guild.roles.fetch(desiredRank.id).catch(() => null);
  const oldRole = oldRank && oldRank.id !== desiredRank.id
    ? interaction.guild.roles.cache.get(oldRank.id)
    : null;

  if (!newRole) return replyError(interaction, "That rank role no longer exists. Update the hierarchy with `/rank-config`.");
  if (!newRole.editable || (oldRole && !oldRole.editable)) {
    return replyError(interaction, "I can't manage the rank role. Move my bot role above it in Server Settings → Roles.");
  }

  // Add the new rank first, then remove ONLY the member's current highest rank.
  // Never replace the member's full role list or remove unrelated roles.
  try {
    if (!target.roles.cache.has(newRole.id)) {
      await target.roles.add(
        newRole,
        `Assign configured rank by ${interaction.user.tag}`
      );
    }
    if (oldRole && target.roles.cache.has(oldRole.id)) {
      await target.roles.remove(
        oldRole,
        `Replace previous rank for ${action.toLowerCase()} by ${interaction.user.tag}`
      );
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
  config.history.length = Math.min(config.history.length, 1000);

  // Acknowledge the successful role change immediately. Disk writes and
  // optional notifications run in the background so they don't delay replies.
  const verb = action === "PROMOTED" ? "promoted" : action === "DEMOTED" ? "demoted" : "updated";
  const from = oldRank ? `<@&${oldRank.id}>` : "Unranked";
  const response = await interaction.editReply({
    content: `✅ **${target.user.tag}** was ${verb}.\n**Previous:** ${from}\n**New:** <@&${desiredRank.id}>${reason ? `\n**Reason:** ${reason}` : ""}`,
    allowedMentions: { users: [], roles: [desiredRank.id] }
  });

  void saveDatabase().catch(error => console.error("Rank history save failed:", error));
  void logRankChange(interaction.guild, config, action, target.user, oldRank, desiredRank, interaction.user, reason)
    .catch(error => console.error("Rank log failed:", error));
  if (config.announceChannelId) {
    void (async () => {
      const announcementChannel = interaction.guild.channels.cache.get(config.announceChannelId)
        ?? await interaction.guild.channels.fetch(config.announceChannelId).catch(() => null);
      if (announcementChannel?.isTextBased()) {
        const style = rankActionStyle(action);
        const embed = rankChangeEmbed(action, target.user, oldRank, desiredRank, interaction.user, reason, interaction.guild);
        await announcementChannel.send({
          content: `${style.emoji} <@${target.id}> ${style.verb} by <@${interaction.user.id}>!`,
          embeds: [embed],
          allowedMentions: {
            users: [target.id, interaction.user.id],
            roles: [oldRank?.id, desiredRank.id].filter(Boolean),
            parse: []
          }
        });
      }
    })().catch(error => console.error("Rank announcement failed:", error));
  }
  return response;
}


async function issueStrike(guild, config, target, moderator, reason, sendEmbed) {
  if (!Array.isArray(config.strikes)) config.strikes = [];
  if (!Array.isArray(config.strikeHistory)) config.strikeHistory = [];
  const record = { id: config.strikeHistory.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1, memberId: target.id, moderatorId: moderator.id, reason, timestamp: new Date().toISOString() };
  config.strikes.push(record); config.strikeHistory.unshift(record); config.strikeHistory = config.strikeHistory.slice(0, 1000);
  let total = config.strikes.filter(item => item.memberId === target.id).length;
  let demotionText = 'No demotion yet. A demotion is triggered at 3 strikes.';
  if (total >= 3) {
    const current = getHighestConfiguredRank(target, config.ranks);
    const currentIndex = current ? config.ranks.findIndex(rank => rank.id === current.id) : -1;
    const desired = currentIndex >= 2 ? config.ranks[currentIndex - 2] : null;
    if (!desired) demotionText = '3 strikes reached, but the member does not have two lower configured ranks. Strikes remain recorded.';
    else {
      const adapter = { guild, guildId: guild.id, user: moderator, client, editReply: async () => null };
      await applyRank(adapter, target, desired, 'DEMOTED', 'Automatic demotion after 3 strikes');
      if (target.roles.cache.has(desired.id)) {
        config.strikes = config.strikes.filter(item => item.memberId !== target.id);
        total = 3;
        demotionText = '✅ **3 strikes = demotion by 2 roles**\nAutomatic demotion applied. Strike count reset to **0**.';
      } else demotionText = '3 strikes reached, but automatic demotion failed. Strikes remain recorded; check the bot role position and permissions.';
    }
  }
  await saveDatabase();
  const embed = new EmbedBuilder().setColor(0xf0a33a).setTitle('⚠️ Strike issued').addFields(
    { name: 'Member', value: '<@' + target.id + '> ' + target.user.tag, inline: false },
    { name: 'Moderator', value: '<@' + moderator.id + '> ' + (moderator.tag || moderator.user?.tag || 'Moderator'), inline: false },
    { name: 'Total strikes', value: String(total), inline: true },
    { name: 'Reason', value: reason.slice(0, 1000), inline: false },
    { name: '3 strikes = demotion by 2 roles', value: demotionText, inline: false }
  ).setTimestamp(new Date(record.timestamp));
  await sendEmbed(embed);
  return { total, demotionText };
}

async function removeStrikes(guild, config, target, moderator, amount, reason, sendEmbed) {
  if (!Array.isArray(config.strikes)) config.strikes = [];
  if (!Array.isArray(config.strikeHistory)) config.strikeHistory = [];
  const active = config.strikes
    .filter(item => item.memberId === target.id)
    .sort((x, y) => new Date(y.timestamp).getTime() - new Date(x.timestamp).getTime());
  if (!active.length) return { error: "That member has no active strikes." };
  if (amount > active.length) return { error: "That member only has " + active.length + " active strike(s)." };
  const removed = active.slice(0, amount);
  const removedIds = new Set(removed.map(item => item.id));
  config.strikes = config.strikes.filter(item => !removedIds.has(item.id));
  const removedAt = new Date().toISOString();
  for (const item of config.strikeHistory) {
    if (removedIds.has(item.id)) {
      item.removedAt = removedAt;
      item.removedBy = moderator.id;
      item.removalReason = reason;
    }
  }
  const total = config.strikes.filter(item => item.memberId === target.id).length;
  await saveDatabase();
  const embed = new EmbedBuilder().setColor(0x35d07f).setTitle("➖ Strike removed").addFields(
    { name: "Member", value: "<@" + target.id + "> " + target.user.tag, inline: false },
    { name: "Moderator", value: "<@" + moderator.id + "> " + (moderator.tag || moderator.user?.tag || "Moderator"), inline: false },
    { name: "Strikes removed", value: String(amount), inline: true },
    { name: "Remaining strikes", value: String(total), inline: true },
    { name: "Reason", value: reason.slice(0, 1000), inline: false },
    { name: "Strike history", value: "Removed strikes remain in the history and are marked as revoked.", inline: false }
  ).setTimestamp(new Date(removedAt));
  await sendEmbed(embed);
  return { total };
}

// Paradox Pulse: privacy-light aggregate community activity, never message contents.
function pulseDay(config) {
  const key = new Date().toISOString().slice(0,10);
  const days = config.pulse.days;
  if (!days[key]) days[key] = { messages: 0, joins: 0, leaves: 0, activeIds: [] };
  return days[key];
}
function trimPulse(config) {
  const cutoff = Date.now() - 30*86400000;
  for (const key of Object.keys(config.pulse.days)) {
    if (new Date(key+"T00:00:00Z").getTime() < cutoff) delete config.pulse.days[key];
  }
}
let pulseMessageBuffer = 0;
client.on(Events.MessageCreate, message => {
  if (!message.guild || message.author.bot) return;
  const config = getGuildConfig(message.guild.id);
  const day = pulseDay(config);
  day.messages++;
  if (!day.activeIds.includes(message.author.id)) day.activeIds.push(message.author.id);
  trimPulse(config);
  pulseMessageBuffer++;
  if (pulseMessageBuffer >= 20) {
    pulseMessageBuffer = 0;
    void saveDatabase().catch(error => console.error("Pulse save failed:", error));
  }
});
// Built-in and configurable autoresponders.
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  const config = getGuildConfig(message.guild.id);
  const text = message.content.toLowerCase();
  const botMentioned = message.mentions.has(client.user.id) || text.includes("paradox#7975");
  const ownerQuestion = /\bwho(?:'|’)s your owner\b|\bwho is your owner\b|\bwhos your owner\b/.test(text);
  if (botMentioned && ownerQuestion) {
    return message.reply({
      content: "<@1367968697884606524> is my owner",
      allowedMentions: { users: ["1367968697884606524"], repliedUser: false }
    }).catch(error => console.error("Built-in autoresponder failed:", error));
  }
  const match = config.autoresponders.find(item => item && typeof item.trigger === "string" && text.includes(item.trigger.toLowerCase()));
  if (match) return message.reply({ content: match.response, allowedMentions: { repliedUser: false, parse: [] } })
    .catch(error => console.error("Custom autoresponder failed:", error));
});

client.on(Events.GuildMemberAdd, member => {
  const config=getGuildConfig(member.guild.id); pulseDay(config).joins++; trimPulse(config);
  void saveDatabase().catch(error=>console.error("Pulse join save failed:",error));
});
client.on(Events.GuildMemberRemove, member => {
  const config=getGuildConfig(member.guild.id); pulseDay(config).leaves++; trimPulse(config);
  void saveDatabase().catch(error=>console.error("Pulse leave save failed:",error));
});

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
        const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
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

      if (sub === "ignore") {
        const role = interaction.options.getRole("role", true);
        if (role.id === interaction.guildId) return replyError(interaction, "@everyone is already excluded from detection.");
        if (!config.ignoredRoleIds.includes(role.id)) config.ignoredRoleIds.push(role.id);
        const wasRank = config.ranks.some(rank => rank.id === role.id);
        if (wasRank) config.ranks = config.ranks.filter(rank => rank.id !== role.id);
        await saveDatabase();
        return interaction.reply({
          content: `✅ **${role.name}** is now excluded from autodetection.${wasRank ? " It was also removed from the configured rank hierarchy; members keep the role." : ""}`,
          ephemeral: true,
          allowedMentions: { parse: [] }
        });
      }

      if (sub === "unignore") {
        const role = interaction.options.getRole("role", true);
        const before = config.ignoredRoleIds.length;
        config.ignoredRoleIds = config.ignoredRoleIds.filter(id => id !== role.id);
        if (config.ignoredRoleIds.length === before) return replyError(interaction, "That role isn't on the autodetection ignore list.");
        await saveDatabase();
        return interaction.reply({ content: `✅ **${role.name}** can now appear in autodetection previews again.`, ephemeral: true });
      }

      if (sub === "ignored") {
        if (!config.ignoredRoleIds.length) return interaction.reply({ content: "No roles are being ignored. Autodetection can consider all eligible roles.", ephemeral: true });
        const lines = config.ignoredRoleIds.map(id => `• <@&${id}>`);
        return interaction.reply({ content: `**Roles excluded from autodetection**\n${lines.join("\n")}\n\nUse \`/rank-config unignore role:\` to allow a role again.`, ephemeral: true, allowedMentions: { parse: [] } });
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
        const [allRoles, botMember] = await Promise.all([
          interaction.guild.roles.fetch(),
          interaction.guild.members.fetchMe()
        ]);
        const configuredIds = new Set(config.ranks.map(rank => rank.id));
        const ignoredIds = new Set(config.ignoredRoleIds);
        const blockedByHierarchy = allRoles.filter(role =>
          role.id !== interaction.guildId &&
          !role.managed &&
          !configuredIds.has(role.id) &&
          role.position >= botMember.roles.highest.position
        );
        const managedRoles = allRoles.filter(role =>
          role.id !== interaction.guildId &&
          role.managed &&
          !configuredIds.has(role.id)
        );
        const candidates = allRoles
          .filter(role =>
            role.id !== interaction.guildId &&
            !role.managed &&
            !configuredIds.has(role.id) &&
            !ignoredIds.has(role.id) &&
            role.position < botMember.roles.highest.position
          )
          .sort((a, b) => a.position - b.position);

        if (!candidates.size) {
          return interaction.reply({
            content: "I couldn't find any new eligible roles below the bot's highest role. @everyone, managed integration roles, already-configured ranks, and roles on your ignore list are skipped.",
            ephemeral: true
          });
        }

        if (!confirm) {
          const preview = candidates.map((role, index) => `${index + 1}. **${role.name}**`).slice(0, 35);
          const remaining = candidates.size - preview.length;
          return interaction.reply({
            content: `**Rank-role detection preview**\nFound **${candidates.size}** possible rank roles, ordered from lowest to highest by Discord role position.\n\n${preview.join("\n")}${remaining > 0 ? `\n…and ${remaining} more.` : ""}\n\nNothing has been changed. Run \`/rank-config autodetect confirm:true\` to import these roles. Review the list first. Full scan: **${allRoles.size}** roles; blocked by bot hierarchy: **${blockedByHierarchy.size}**; managed roles: **${managedRoles.size}**; ignored by you: **${config.ignoredRoleIds.length}**.`,
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
      const members = await getGuildMembers(interaction.guild);
      const matches = members.filter(member =>
        member.user.username.toLowerCase().includes(query) ||
        (member.displayName || "").toLowerCase().includes(query)
      ).first(10);
      if (!matches.length) return interaction.editReply("No matching members found.");
      const lines = matches.map(member => {
        const rank = getHighestConfiguredRank(member, config.ranks);
        return `• ${member.user.tag} — ${rank ? `<@&${rank.id}>` : "Unranked"}`;
      });
      return interaction.editReply({ content: `**Member search results**\n${lines.join("\n")}`, allowedMentions: { parse: [] } });
    }

    if (interaction.commandName === "rank-stats" || interaction.commandName === "rank-leaderboard") {
      await interaction.deferReply({ ephemeral: true });
      const members = await getGuildMembers(interaction.guild);
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
          "`/kick`, `/ban`, `/timeout`, `/untimeout`, `/purge` — moderation tools",
          "`/rank-config` — configure ranks, logs, announcements and detection",
          "Progression is manual. The bot never promotes members automatically."
        ].join("\n"),
        ephemeral: true
      });
    }

    if (["kick", "ban", "timeout", "untimeout", "purge"].includes(interaction.commandName)) {
      const cmd = interaction.commandName;
      const perm = {kick:PermissionFlagsBits.KickMembers,ban:PermissionFlagsBits.BanMembers,timeout:PermissionFlagsBits.ModerateMembers,untimeout:PermissionFlagsBits.ModerateMembers,purge:PermissionFlagsBits.ManageMessages}[cmd];
      if (!isBotOwner(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) && !interaction.memberPermissions?.has(perm))
        return replyError(interaction, "You don't have permission to use this moderation command.");
      if (cmd === "purge") {
        await interaction.deferReply({ephemeral:true});
        const deleted = await interaction.channel.bulkDelete(interaction.options.getInteger("amount",true), true);
        return interaction.editReply(`🧹 Deleted **${deleted.size}** recent messages. Messages older than 14 days cannot be bulk-deleted.`);
      }
      const user = interaction.options.getUser("member",true);
      const target = await interaction.guild.members.fetch(user.id).catch(()=>null);
      if (!target) return replyError(interaction,"That member isn't in this server.");
      if (target.id === interaction.user.id || target.id === client.user.id) return replyError(interaction,"You can't use this command on yourself or the bot.");
      const actor = await interaction.guild.members.fetch(interaction.user.id);
      if (!canActOnTarget(actor,target,interaction.guild)) return replyError(interaction,"That member has an equal or higher role than you.");
      const bot = await interaction.guild.members.fetchMe();
      if (target.roles.highest.comparePositionTo(bot.roles.highest) >= 0) return replyError(interaction,"My highest role must be above the target member's highest role.");
      const reason = (interaction.options.getString("reason") || `Action by ${interaction.user.tag}`).slice(0,480);
      await interaction.deferReply({ephemeral:true});
      if (cmd === "kick") {
        if (!target.kickable) return replyError(interaction,"I can't kick that member. Check my Kick Members permission and role position.");
        await target.kick(reason);
        return interaction.editReply(`👢 **${user.tag}** was kicked. Reason: ${reason}`);
      }
      if (cmd === "ban") {
        if (!target.bannable) return replyError(interaction,"I can't ban that member. Check my Ban Members permission and role position.");
        await target.ban({reason});
        return interaction.editReply(`🔨 **${user.tag}** was banned. Reason: ${reason}`);
      }
      if (cmd === "timeout") {
        const mins=interaction.options.getInteger("minutes",true);
        if (!target.moderatable) return replyError(interaction,"I can't timeout that member.");
        await target.timeout(mins*60000,reason);
        return interaction.editReply(`⏳ **${user.tag}** was timed out for **${mins} minutes**. Reason: ${reason}`);
      }
      if (!target.moderatable) return replyError(interaction,"I can't remove that member's timeout.");
      if (!target.communicationDisabledUntilTimestamp) return replyError(interaction,"That member isn't timed out.");
      await target.timeout(null,reason);
      return interaction.editReply(`✅ Removed the timeout from **${user.tag}**.`);
    }

    if (interaction.commandName === "remove-strike") {
      if (!(isBotOwner(interaction.user.id) || interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))) return replyError(interaction, "You need Moderate Members or Administrator to remove strikes.");
      const user = interaction.options.getUser("member", true);
      const amount = interaction.options.getInteger("amount", true);
      const reason = interaction.options.getString("reason", true).trim();
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!target) return replyError(interaction, "Member not found.");
      const actor = await interaction.guild.members.fetch(interaction.user.id);
      if (!canActOnTarget(actor, target, interaction.guild)) return replyError(interaction, "That member has an equal or higher role than you.");
      await interaction.deferReply();
      const result = await removeStrikes(interaction.guild, config, target, interaction.user, amount, reason, async embed => {
        const reviewChannel = await interaction.guild.channels.fetch("1570589159289126962").catch(() => null);
        if (!reviewChannel?.isTextBased()) return interaction.editReply("⚠️ Strike removal recorded, but I couldn't access the staff review channel.");
        await reviewChannel.send({ embeds: [embed], allowedMentions: { parse: [], users: [] } });
        return interaction.editReply("✅ Removed " + amount + " strike(s). Remaining active strikes: **" + result.total + "**. Logged in the staff review channel.");
      });
      if (result.error) return interaction.editReply("⚠️ " + result.error);
      return;
    }
    if (interaction.commandName === "strike") {
      if (!(isBotOwner(interaction.user.id) || interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))) return replyError(interaction, "You need Moderate Members or Administrator to issue strikes.");
      const user = interaction.options.getUser("member", true), reason = interaction.options.getString("reason", true).trim();
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!target) return replyError(interaction, "Member not found.");
      const actor = await interaction.guild.members.fetch(interaction.user.id);
      if (!canActOnTarget(actor, target, interaction.guild)) return replyError(interaction, "That member has an equal or higher role than you.");
      const bot = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
      if (target.roles.highest.comparePositionTo(bot.roles.highest) >= 0) return replyError(interaction, "My highest role must be above the target member highest role.");
      await interaction.deferReply();
      return issueStrike(interaction.guild, config, target, interaction.user, reason, async embed => {
        const reviewChannel = await interaction.guild.channels.fetch("1570589159289126962").catch(() => null);
        if (!reviewChannel?.isTextBased()) return interaction.editReply("⚠️ Strike recorded, but I couldn't access the staff review channel.");
        await reviewChannel.send({ embeds: [embed], allowedMentions: { parse: [], users: [] } });
        return interaction.editReply("✅ Strike recorded and sent to the staff review channel.");
      });
    }
    if (["warn","warnings","clear-warnings","lock","unlock","slowmode","nickname","role-add","role-remove","userinfo","serverinfo","modstats","unban","voice-mute","voice-unmute","disconnect"].includes(interaction.commandName)) {
      const cmd=interaction.commandName;
      const isAdmin=isBotOwner(interaction.user.id) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      const has=(p)=>isAdmin||interaction.memberPermissions?.has(p);
      const addCase=(action,targetId,reason)=> {
        const item={id:config.moderationCases.length+1,action,targetId,moderatorId:interaction.user.id,reason:reason||null,timestamp:new Date().toISOString()};
        config.moderationCases.unshift(item); config.moderationCases=config.moderationCases.slice(0,500);
        void saveDatabase().catch(e=>console.error("Moderation case save failed:",e));
        return item;
      };
      if (cmd==="warn") {
        if(!has(PermissionFlagsBits.ModerateMembers)) return replyError(interaction,"You need Moderate Members or Administrator.");
        const user=interaction.options.getUser("member",true), reason=interaction.options.getString("reason",true);
        const target=await interaction.guild.members.fetch(user.id).catch(()=>null);
        if(!target)return replyError(interaction,"Member not found.");
        const actor=await interaction.guild.members.fetch(interaction.user.id);
        if(!canActOnTarget(actor,target,interaction.guild))return replyError(interaction,"That member has an equal or higher role than you.");
        const warning={id:config.warnings.length+1,memberId:user.id,moderatorId:interaction.user.id,reason,timestamp:new Date().toISOString()};
        config.warnings.unshift(warning); config.warnings=config.warnings.slice(0,1000);
        const c=addCase("WARN",user.id,reason); warning.caseId=c.id;
        await saveDatabase();
        return interaction.reply({content:`⚠️ **${user.tag}** has been warned. Case #${c.id}. They now have **${config.warnings.filter(w=>w.memberId===user.id).length}** active recorded warnings.`,ephemeral:false});
      }
      if(cmd==="warnings"||cmd==="clear-warnings"){
        if(!has(PermissionFlagsBits.ModerateMembers))return replyError(interaction,"You need Moderate Members or Administrator.");
        const user=interaction.options.getUser("member",true);
        const rows=config.warnings.filter(w=>w.memberId===user.id);
        if(cmd==="warnings"){
          if(!rows.length)return interaction.reply({content:`No warnings recorded for **${user.tag}**.`,ephemeral:true});
          return interaction.reply({content:`**Warnings for ${user.tag}**\n${rows.slice(0,15).map(w=>`• #${w.id} — ${w.reason} (<t:${Math.floor(new Date(w.timestamp).getTime()/1000)}:R>)`).join("\n")}`,ephemeral:true});
        }
        if(!rows.length)return interaction.reply({content:"That member has no recorded warnings.",ephemeral:true});
        config.warnings=config.warnings.filter(w=>w.memberId!==user.id);
        addCase("CLEAR_WARNINGS",user.id,`Cleared ${rows.length} warnings`);
        await saveDatabase();
        return interaction.reply({content:`✅ Cleared **${rows.length}** warnings for **${user.tag}**.`,ephemeral:true});
      }
      if(cmd==="lock"||cmd==="unlock"){
        if(!has(PermissionFlagsBits.ManageChannels))return replyError(interaction,"You need Manage Channels or Administrator.");
        const channel=interaction.options.getChannel("channel")||interaction.channel;
        if(!channel?.permissionOverwrites)return replyError(interaction,"That channel can't be locked.");
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone,{SendMessages:cmd==="lock"?false:null}, {reason:`${cmd} by ${interaction.user.tag}`});
        addCase(cmd.toUpperCase(),null,channel.name);
        return interaction.reply({content:cmd==="lock"?`🔒 Locked ${channel} for @everyone.`:`🔓 Unlocked ${channel} for @everyone (restored inherited permission).`,ephemeral:false});
      }
      if(cmd==="slowmode"){
        if(!has(PermissionFlagsBits.ManageChannels))return replyError(interaction,"You need Manage Channels or Administrator.");
        const seconds=interaction.options.getInteger("seconds",true);
        const channel=interaction.options.getChannel("channel")||interaction.channel;
        if(!channel?.setRateLimitPerUser)return replyError(interaction,"That channel doesn't support slowmode.");
        await channel.setRateLimitPerUser(seconds, `Slowmode set by ${interaction.user.tag}`);
        addCase("SLOWMODE",null,`${channel.name}: ${seconds}s`);
        return interaction.reply({content:`🐢 Slowmode set to **${seconds} seconds** in ${channel}.`});
      }
      if(cmd==="nickname"){
        if(!has(PermissionFlagsBits.ManageNicknames))return replyError(interaction,"You need Manage Nicknames or Administrator.");
        const user=interaction.options.getUser("member",true), nick=interaction.options.getString("nickname");
        const target=await interaction.guild.members.fetch(user.id).catch(()=>null);
        if(!target)return replyError(interaction,"Member not found.");
        const actor=await interaction.guild.members.fetch(interaction.user.id);
        if(!canActOnTarget(actor,target,interaction.guild))return replyError(interaction,"That member has an equal or higher role than you.");
        if(!target.manageable)return replyError(interaction,"I can't manage that member's nickname. Check my role position.");
        await target.setNickname(nick, `Nickname changed by ${interaction.user.tag}`);
        addCase("NICKNAME",user.id,nick||"Nickname reset");
        return interaction.reply({content:`✅ Updated nickname for **${user.tag}**.`,ephemeral:true});
      }
      if(cmd==="role-add"||cmd==="role-remove"){
        if(!has(PermissionFlagsBits.ManageRoles))return replyError(interaction,"You need Manage Roles or Administrator.");
        const user=interaction.options.getUser("member",true), role=interaction.options.getRole("role",true);
        const target=await interaction.guild.members.fetch(user.id).catch(()=>null);
        if(!target)return replyError(interaction,"Member not found.");
        const actor=await interaction.guild.members.fetch(interaction.user.id);
        const bot=await interaction.guild.members.fetchMe();
        if(!canActOnTarget(actor,target,interaction.guild))return replyError(interaction,"That member has an equal or higher role than you.");
        if(role.managed||role.position>=actor.roles.highest.position||role.position>=bot.roles.highest.position)return replyError(interaction,"That role is managed or above your/bot's role.");
        if(!role.editable)return replyError(interaction,"I can't manage that role.");
        if(cmd==="role-add")await target.roles.add(role,`Role added by ${interaction.user.tag}`);
        else await target.roles.remove(role,`Role removed by ${interaction.user.tag}`);
        addCase(cmd.toUpperCase(),user.id,role.name);
        return interaction.reply({content:`✅ ${cmd==="role-add"?"Added":"Removed"} **${role.name}** ${cmd==="role-add"?"to":"from"} **${user.tag}**.`,ephemeral:true});
      }
      if (cmd === "unban") {
        if (!has(PermissionFlagsBits.BanMembers)) return replyError(interaction, "You need Ban Members or Administrator.");
        const userId = interaction.options.getString("user_id", true).trim();
        if (!/^[0-9]{17,20}$/.test(userId)) return replyError(interaction, "Enter a valid Discord user ID.");
        const reason = interaction.options.getString("reason") || "No reason provided";
        await interaction.guild.bans.remove(userId, `Unban by ${interaction.user.tag}: ${reason}`);
        addCase("UNBAN", userId, reason);
        return interaction.reply({ content: `✅ User ID \`${userId}\` has been unbanned.`, ephemeral: false });
      }
      if (cmd === "voice-mute" || cmd === "voice-unmute" || cmd === "disconnect") {
        if (!has(PermissionFlagsBits.MuteMembers) && !has(PermissionFlagsBits.MoveMembers))
          return replyError(interaction, "You need Mute Members or Move Members permission.");
        const user = interaction.options.getUser("member", true);
        const target = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!target) return replyError(interaction, "Member not found.");
        const actor = await interaction.guild.members.fetch(interaction.user.id);
        if (!canActOnTarget(actor, target, interaction.guild)) return replyError(interaction, "That member has an equal or higher role than you.");
        if (!target.voice.channel) return replyError(interaction, "That member isn't in a voice channel.");
        if (cmd === "disconnect") {
          if (!has(PermissionFlagsBits.MoveMembers)) return replyError(interaction, "You need Move Members permission.");
          await target.voice.disconnect(`Disconnected by ${interaction.user.tag}`);
        } else {
          if (!has(PermissionFlagsBits.MuteMembers)) return replyError(interaction, "You need Mute Members permission.");
          await target.voice.setMute(cmd === "voice-mute", `Voice mute updated by ${interaction.user.tag}`);
        }
        addCase(cmd.toUpperCase(), user.id, interaction.options.getString("reason") || null);
        return interaction.reply({ content: cmd === "disconnect" ? `🔌 Disconnected **${user.tag}** from voice.` : cmd === "voice-mute" ? `🔇 Server-muted **${user.tag}**.` : `🔊 Server-unmuted **${user.tag}**.` });
      }
      if(cmd==="userinfo"){
        const user=interaction.options.getUser("member")||interaction.user;
        const member=await interaction.guild.members.fetch(user.id).catch(()=>null);
        if(!member)return replyError(interaction,"Member not found.");
        const roles=member.roles.cache.filter(r=>r.id!==interaction.guild.id).sort((a,b)=>b.position-a.position).map(r=>r.toString()).slice(0,15);
        const embed=new EmbedBuilder().setColor(0x7c5cff).setTitle(`User info • ${user.tag}`).setThumbnail(user.displayAvatarURL()).addFields(
          {name:"User ID",value:user.id},{name:"Account created",value:`<t:${Math.floor(user.createdTimestamp/1000)}:F>`},
          {name:"Joined server",value:member.joinedTimestamp?`<t:${Math.floor(member.joinedTimestamp/1000)}:R>`:"Unknown"},
          {name:"Highest role",value:member.roles.highest.toString()},
          {name:"Roles",value:roles.join(", ")||"None"}
        );
        return interaction.reply({embeds:[embed],ephemeral:true,allowedMentions:{parse:[]}});
      }
      if(cmd==="serverinfo"){
        const g=interaction.guild;
        const embed=new EmbedBuilder().setColor(0x7c5cff).setTitle(`Server info • ${g.name}`).setThumbnail(g.iconURL()).addFields(
          {name:"Server ID",value:g.id},{name:"Owner",value:`<@!${g.ownerId}>`},
          {name:"Members",value:String(g.memberCount),inline:true},{name:"Channels",value:String(g.channels.cache.size),inline:true},
          {name:"Roles",value:String(g.roles.cache.size),inline:true},{name:"Created",value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`}
        );
        return interaction.reply({embeds:[embed],ephemeral:true});
      }
      if(cmd==="modstats"){
        if(!has(PermissionFlagsBits.ModerateMembers))return replyError(interaction,"You need Moderate Members or Administrator.");
        const counts={}; for(const c of config.moderationCases)counts[c.action]=(counts[c.action]||0)+1;
        const summary=Object.entries(counts).map(([k,v])=>`• **${k}**: ${v}`).join("\n")||"No moderation cases yet.";
        return interaction.reply({content:`**Paradoxplus moderation statistics**\nTotal cases: **${config.moderationCases.length}**\nWarnings recorded: **${config.warnings.length}**\n\n${summary}`,ephemeral:true});
      }
    }

    if (interaction.commandName === "inactive-reason") {
      const sub = interaction.options.getSubcommand();
      if (sub === "submit") {
        const reason = interaction.options.getString("reason", true).trim().slice(0, 800);
        const existing = config.inactiveAppeals.find(a => a.memberId === interaction.user.id && ["PENDING", "ON_HOLD"].includes(a.status));
        if (existing) return replyError(interaction, `You already have an appeal #${existing.id} with status **${existing.status.toLowerCase().replace("_"," ")}**.`);
        const appeal = {
          id: (config.inactiveAppeals.reduce((max, a) => Math.max(max, Number(a.id) || 0), 0) + 1),
          memberId: interaction.user.id,
          reason,
          status: "PENDING",
          submittedAt: new Date().toISOString(),
          reviewedAt: null,
          reviewerId: null,
          staffNote: null
        };
        config.inactiveAppeals.unshift(appeal);
        config.inactiveAppeals = config.inactiveAppeals.slice(0, 500);
        await saveDatabase();

        const appealChannelId = "1570589159289126962";
        const appealChannel = await interaction.guild.channels.fetch(appealChannelId).catch(() => null);
        if (!appealChannel || !appealChannel.isTextBased() || !appealChannel.send) {
          return interaction.reply({ content: `⚠️ Your appeal **#${appeal.id}** was saved, but I couldn't post it to the staff review channel. Please notify an administrator.`, ephemeral: true });
        }
        const reviewEmbed = new EmbedBuilder()
          .setColor(0xf0a33a)
          .setTitle(`📨 INACTIVITY APPEAL #${appeal.id}`)
          .setDescription(`**Member:** <@${interaction.user.id}> (\`${interaction.user.id}\`)\n**Status:** 🟠 Pending review`)
          .addFields({ name: "Reason for inactivity", value: reason.slice(0, 1000) })
          .setFooter({ text: "Use /inactive-reason review to accept, reject, or hold this appeal." })
          .setTimestamp(new Date(appeal.submittedAt));
        const reviewMessage = await appealChannel.send({
          content: "📋 **New inactivity appeal submitted for staff review.**",
          embeds: [reviewEmbed],
          allowedMentions: { parse: [], users: [] }
        }).catch(() => null);
        if (reviewMessage) {
          appeal.reviewChannelId = appealChannel.id;
          appeal.reviewMessageId = reviewMessage.id;
          await saveDatabase();
        }
        return interaction.reply({
          content: reviewMessage
            ? `📨 Your inactivity appeal **#${appeal.id}** has been sent to the staff review channel.`
            : `⚠️ Your appeal **#${appeal.id}** was saved, but the bot couldn't send it to the staff review channel. Please notify an administrator.`,
          ephemeral: true
        });
      }
      if (sub === "review") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) && !isBotOwner(interaction.user.id))
          return replyError(interaction, "You need Moderate Members or Administrator to review appeals.");
        const user = interaction.options.getUser("member", true);
        const decision = interaction.options.getString("decision", true).toUpperCase();
        const note = interaction.options.getString("note")?.trim().slice(0, 500) || null;
        const appeal = config.inactiveAppeals.find(a => a.memberId === user.id && ["PENDING", "ON_HOLD"].includes(a.status));
        if (!appeal) return replyError(interaction, "No pending or held inactivity appeal was found for that member.");
        appeal.status = decision;
        appeal.reviewedAt = new Date().toISOString();
        appeal.reviewerId = interaction.user.id;
        appeal.staffNote = note;
        await saveDatabase();
        const labels = { ACCEPTED: "accepted", REJECTED: "rejected", ON_HOLD: "placed on hold" };
        if (appeal.reviewChannelId && appeal.reviewMessageId) {
          const reviewChannel = await interaction.guild.channels.fetch(appeal.reviewChannelId).catch(() => null);
          const reviewMessage = reviewChannel?.messages?.fetch
            ? await reviewChannel.messages.fetch(appeal.reviewMessageId).catch(() => null)
            : null;
          if (reviewMessage) {
            const statusColor = decision === "ACCEPTED" ? 0x35d07f : decision === "REJECTED" ? 0xf05b67 : 0xf0a33a;
            const statusLabel = decision === "ACCEPTED" ? "🟢 Accepted" : decision === "REJECTED" ? "🔴 Rejected" : "🟠 On hold";
            const updated = EmbedBuilder.from(reviewMessage.embeds[0] || new EmbedBuilder())
              .setColor(statusColor)
              .setDescription(`**Member:** <@${user.id}> (\`${user.id}\`)\n**Status:** ${statusLabel}\n**Reviewed by:** <@${interaction.user.id}>`)
              .setFooter({ text: note ? `Staff note: ${note.slice(0, 180)}` : "Appeal reviewed by Paradoxplus" })
              .setTimestamp(new Date(appeal.reviewedAt));
            await reviewMessage.edit({ content: "📋 **Inactivity appeal reviewed.**", embeds: [updated], allowedMentions: { parse: [] } }).catch(() => null);
          }
        }
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(decision === "ACCEPTED" ? 0x35d07f : decision === "REJECTED" ? 0xf05b67 : 0xf0a33a)
            .setTitle("📋 Inactivity appeal reviewed")
            .setDescription(`Appeal **#${appeal.id}** for <@${user.id}> was **${labels[decision]}** by <@${interaction.user.id}>.`)
            .addFields({ name: "Submitted reason", value: appeal.reason.slice(0, 1000) }, ...(note ? [{ name: "Staff note", value: note }] : []))
            .setTimestamp()]
        });
      }
      if (sub === "list") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) && !isBotOwner(interaction.user.id))
          return replyError(interaction, "You need Moderate Members or Administrator to view the appeal queue.");
        const rows = config.inactiveAppeals.slice(0, 15);
        return interaction.reply({ content: rows.length
          ? rows.map(a => `**#${a.id}** <@${a.memberId}> — **${a.status}** · <t:${Math.floor(new Date(a.submittedAt).getTime()/1000)}:R>\n> ${a.reason.slice(0, 180)}`).join("\n")
          : "There are no inactivity appeals yet.", ephemeral: true, allowedMentions: { parse: [] } });
      }
    }

    if (interaction.commandName === "serverpulse") {
      const days = Object.values(config.pulse.days || {});
      const totals = days.reduce((a, d) => ({
        messages: a.messages + (d.messages || 0),
        joins: a.joins + (d.joins || 0),
        leaves: a.leaves + (d.leaves || 0),
        active: a.active + (d.activeIds?.length || 0)
      }), { messages: 0, joins: 0, leaves: 0, active: 0 });
      const embed = new EmbedBuilder().setColor(0x7c5cff).setTitle("📡 PARADOX PULSE")
        .setDescription("Community activity snapshot from the bot's stored daily aggregates.")
        .addFields(
          { name: "💬 Messages tracked", value: String(totals.messages), inline: true },
          { name: "📥 Joins", value: String(totals.joins), inline: true },
          { name: "📤 Leaves", value: String(totals.leaves), inline: true },
          { name: "📅 Days recorded", value: String(days.length), inline: true }
        ).setFooter({ text: "Aggregate counts only • No message content stored" }).setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === "rankpredict") {
      const user = interaction.options.getUser("member", true);
      const role = interaction.options.getRole("target_rank", true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return replyError(interaction, "That member isn't in this server.");
      const current = getHighestConfiguredRank(member, config.ranks);
      const targetIndex = config.ranks.findIndex(r => r.id === role.id);
      const currentIndex = current ? config.ranks.findIndex(r => r.id === current.id) : -1;
      if (targetIndex < 0) return replyError(interaction, "That role isn't in the configured rank hierarchy.");
      const gap = targetIndex - currentIndex;
      const result = gap === 0 ? "Already at that rank."
        : gap > 0 ? `**${gap}** rank level(s) above the current rank.`
        : `**${Math.abs(gap)}** rank level(s) below the current rank.`;
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x7c5cff).setTitle("🎯 Rank trajectory")
          .setDescription(`**Member:** ${user}\n**Current:** ${current ? `<@&${current.id}>` : "Unranked"}\n**Target:** <@&${role.id}>\n\n${result}`)
          .setFooter({ text: "Paradoxplus • Rank intelligence" })],
        ephemeral: true, allowedMentions: { parse: [] }
      });
    }

    if (interaction.commandName === "staffactivity") {
      const counts = {};
      for (const item of config.history) counts[item.actorId] = (counts[item.actorId] || 0) + 1;
      for (const item of config.moderationCases || []) counts[item.moderatorId] = (counts[item.moderatorId] || 0) + 1;
      const rows = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,10);
      const lines = rows.map(([id,count],i) => `**${i+1}.** <@${id}> — ${count} recorded action(s)`);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x7c5cff).setTitle("🛡️ Staff activity")
          .setDescription(lines.join("\n") || "No staff actions have been recorded yet.")
          .setFooter({ text: "Rank changes + recorded moderation cases" })],
        ephemeral: true, allowedMentions: { parse: [] }
      });
    }

    if (interaction.commandName === "memberjourney") {
      const user = interaction.options.getUser("member", true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return replyError(interaction, "That member isn't in this server.");
      const rows = config.history.filter(item => item.memberId === user.id);
      const latest = rows.slice(0,5).map(item => {
        const from = item.oldRankId ? `<@&${item.oldRankId}>` : "Unranked";
        const to = item.newRankId ? `<@&${item.newRankId}>` : "Unranked";
        return `• ${from} → ${to} · <t:${Math.floor(new Date(item.timestamp).getTime()/1000)}:R>`;
      });
      const rank = getHighestConfiguredRank(member, config.ranks);
      const embed = new EmbedBuilder().setColor(0x7c5cff).setTitle("🧭 Member journey")
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: "Member", value: `${user}`, inline: true },
          { name: "Current rank", value: rank ? `<@&${rank.id}>` : "Unranked", inline: true },
          { name: "Joined server", value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp/1000)}:D>` : "Unknown", inline: true },
          { name: "Recorded rank changes", value: String(rows.length), inline: true },
          { name: "Recent journey", value: latest.join("\n") || "No rank changes recorded yet." }
        ).setFooter({ text: "Paradoxplus • Member timeline" });
      return interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
    }

    if (interaction.commandName === "spotlight") {
      if (!hasManagerPermission(interaction.member)) return replyError(interaction, "You need Manage Roles, Administrator, or bot-owner access to use Spotlight.");
      const user = interaction.options.getUser("member", true);
      const reason = interaction.options.getString("reason") || "Recognized by the staff team.";
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return replyError(interaction, "That member isn't in this server.");
      const rank = getHighestConfiguredRank(member, config.ranks);
      const embed = new EmbedBuilder().setColor(0xffc857).setTitle("🌟 COMMUNITY SPOTLIGHT")
        .setThumbnail(user.displayAvatarURL())
        .setDescription(`## ${user} deserves the spotlight!\n${reason}`)
        .addFields({ name: "Current rank", value: rank ? `<@&${rank.id}>` : "Unranked", inline: true })
        .setFooter({ text: `${interaction.guild.name} • Paradoxplus` }).setTimestamp();
      return interaction.reply({ embeds: [embed], allowedMentions: { users: [user.id], parse: [] } });
    }

    if (interaction.commandName === "rank") {
      const user = interaction.options.getUser("member") ?? interaction.user;
      const member = interaction.guild.members.cache.get(user.id) ?? await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return replyError(interaction, "I couldn't find that member in this server.");
      const ids = new Set(config.ranks.map(r => r.id));
      const found = getHighestConfiguredRank(member, config.ranks);
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
      await interaction.deferReply({ ephemeral: false });
      const user = interaction.options.getUser("member", true);
      const target = interaction.guild.members.cache.get(user.id) ?? await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!target) return replyError(interaction, "That member isn't in this server.");
      if (target.id === interaction.client.user.id) return replyError(interaction, "I can't change my own rank.");

      const actor = interaction.guild.members.cache.get(interaction.user.id) ?? await interaction.guild.members.fetch(interaction.user.id);
      if (!isBotOwner(actor.id) &&
          interaction.guild.ownerId !== actor.id &&
          !actor.permissions.has(PermissionFlagsBits.Administrator) &&
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
      return applyRank(interaction, target, desired, action, reason);
    }
  } catch (error) {
    console.error("Command error:", error);
    return replyError(interaction, "Something went wrong. Check the bot logs and try again.");
  }
});

const PREFIX = ".";
const prefixEmbed = (title, description) => new EmbedBuilder()
  .setColor(0x7c5cff)
  .setAuthor({ name: "PARADOXPLUS • RANK SYSTEM", iconURL: client.user.displayAvatarURL() })
  .setTitle(title).setDescription(description)
  .setFooter({ text: "Manual progression • Staff-controlled" }).setTimestamp();
const mentionedId = (value, role = false) => value?.match(role ? /^<@&(\d+)>$/ : /^<@!?(\d+)>$/)?.[1] || null;

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot || !message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(1).trim().split(/\s+/);
  const command = (args.shift() || "").toLowerCase();
  const config = getGuildConfig(message.guild.id);
  const send = (title, description) => message.reply({
    embeds: [prefixEmbed(title, description)],
    allowedMentions: { repliedUser: false, parse: [] }
  });
  const fail = text => send("⚠️ Command error", text);
  try {
    if (command === "ar" || command === "autoresponder") {
      const sub = (args.shift() || "").toLowerCase();
      const allowed = isBotOwner(message.author.id) || message.member.permissions.has(PermissionFlagsBits.Administrator) || message.member.permissions.has(PermissionFlagsBits.ManageMessages) || message.member.permissions.has(PermissionFlagsBits.ManageGuild);
      if (sub === "list") {
        if (!config.autoresponders.length) return send("💬 Autoresponders", "No custom autoresponders are configured.");
        return send("💬 Custom autoresponders", config.autoresponders.map((item, i) => (i + 1) + ". **Trigger:** " + item.trigger + "\n   **Reply:** " + item.response).join("\n"));
      }
      if (!allowed) return fail("You need Manage Messages, Manage Server, or Administrator to manage autoresponders.");
      if (sub === "add") {
        const raw = args.join(" ");
        const split = raw.indexOf("|");
        if (split < 1 || split === raw.length - 1) return fail("Usage: .ar add trigger | response");
        const trigger = raw.slice(0, split).trim();
        const response = raw.slice(split + 1).trim();
        if (trigger.length < 2 || trigger.length > 100) return fail("Triggers must be 2–100 characters.");
        if (!response || response.length > 1800) return fail("Replies must be 1–1800 characters.");
        if (config.autoresponders.some(item => item.trigger.toLowerCase() === trigger.toLowerCase())) return fail("That trigger already exists. Remove it first if you want to replace it.");
        if (config.autoresponders.length >= 25) return fail("This server has reached the 25 custom autoresponder limit.");
        config.autoresponders.push({ trigger, response });
        await saveDatabase();
        return send("✅ Autoresponder added", "**Trigger:** " + trigger + "\n**Reply:** " + response);
      }
      if (sub === "remove" || sub === "delete") {
        const trigger = args.join(" ").trim();
        if (!trigger) return fail("Usage: .ar remove trigger");
        const before = config.autoresponders.length;
        config.autoresponders = config.autoresponders.filter(item => item.trigger.toLowerCase() !== trigger.toLowerCase());
        if (config.autoresponders.length === before) return fail("I couldn't find that exact trigger.");
        await saveDatabase();
        return send("🗑️ Autoresponder removed", "Removed trigger: **" + trigger + "**");
      }
      return fail("Use .ar add trigger | response, .ar remove trigger, or .ar list.");
    }
    if (command === "rankhelp" || command === "help") return send("✨ Paradoxplus command center", [
      "**Member:** `.rank [@member]`, `.rankpanel`, `.rankhistory @member`, `.ranksearch name`, `.rankstats`, `.rankleaderboard`",
      "**Staff:** `.promote @member [reason]`, `.demote @member [reason]`, `.setrank @member @rank [reason]`",
      "**Moderation:** `.strike @member reason`, `.remove-strike @member amount reason`, `.kick @member`, `.ban @member`, `.timeout @member minutes`, `.untimeout @member`, `.purge 1-100`, `.lock`, `.unlock`, `.slowmode seconds`",
      "**Configuration:** use `/rank-config` for setup, detection, logs, announcements and backups.",
      "Prefix: `.` • All slash commands remain available."
    ].join("\n"));
    if (command === "remove-strike") {
      if (!isBotOwner(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) return fail("You need Moderate Members or Administrator to remove strikes.");
      const id = mentionedId(args[0]);
      const amount = Number(args[1]);
      const reason = args.slice(2).join(" ").trim().slice(0, 800);
      if (!id || !Number.isInteger(amount) || amount < 1 || !reason) return fail("Usage: .remove-strike @member amount reason");
      const target = await message.guild.members.fetch(id).catch(() => null);
      if (!target) return fail("Member not found.");
      if (!canActOnTarget(message.member, target, message.guild)) return fail("That member has an equal or higher role than you.");
      return removeStrikes(message.guild, config, target, message.author, amount, reason, async embed => {
        const reviewChannel = await message.guild.channels.fetch("1570589159289126962").catch(() => null);
        if (!reviewChannel?.isTextBased()) return message.reply("⚠️ Strike removal recorded, but I couldn't access the staff review channel.");
        await reviewChannel.send({ embeds: [embed], allowedMentions: { parse: [], users: [] } });
        const remaining = config.strikes.filter(item => item.memberId === target.id).length;
        return message.reply("✅ Removed " + amount + " strike(s). Remaining active strikes: **" + remaining + "**.");
      }).then(result => result?.error ? fail(result.error) : result);
    }
    if (command === "strike") {
      if (!isBotOwner(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) return fail("You need Moderate Members or Administrator to issue strikes.");
      const id = mentionedId(args[0]);
      if (!id) return fail("Usage: .strike @member reason");
      const target = await message.guild.members.fetch(id).catch(() => null);
      if (!target) return fail("Member not found.");
      if (target.id === message.author.id || target.id === client.user.id) return fail("You cannot strike yourself or the bot.");
      if (!canActOnTarget(message.member, target, message.guild)) return fail("That member has an equal or higher role than you.");
      const bot = message.guild.members.me ?? await message.guild.members.fetchMe();
      if (target.roles.highest.comparePositionTo(bot.roles.highest) >= 0) return fail("My highest role must be above the target member highest role.");
      const reason = args.slice(1).join(" ").trim().slice(0, 800);
      if (!reason) return fail("Usage: .strike @member reason");
      return issueStrike(message.guild, config, target, message.author, reason, async embed => {
        const reviewChannel = await message.guild.channels.fetch("1570589159289126962").catch(() => null);
        if (!reviewChannel?.isTextBased()) return message.reply("⚠️ Strike recorded, but I couldn't access the staff review channel.");
        await reviewChannel.send({ embeds: [embed], allowedMentions: { parse: [], users: [] } });
        return message.reply("✅ Strike recorded and sent to the staff review channel.");
      });
    }
    if (["kick","ban","timeout","untimeout","purge"].includes(command)) {
      const perm={kick:PermissionFlagsBits.KickMembers,ban:PermissionFlagsBits.BanMembers,timeout:PermissionFlagsBits.ModerateMembers,untimeout:PermissionFlagsBits.ModerateMembers,purge:PermissionFlagsBits.ManageMessages}[command];
      if (!isBotOwner(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.Administrator) && !message.member.permissions.has(perm)) return fail("You don't have permission to use that moderation command.");
      if(command==="purge"){
        const n=Number(args[0]); if(!Number.isInteger(n)||n<1||n>100) return fail("Usage: .purge 1-100");
        const deleted=await message.channel.bulkDelete(n,true); return send("🧹 Messages cleared",`Deleted **${deleted.size}** recent messages.`);
      }
      const id=mentionedId(args[0]); if(!id) return fail(`Usage: .${command} @member [reason]`);
      const target=await message.guild.members.fetch(id).catch(()=>null); if(!target) return fail("Member not found.");
      if(target.id===message.author.id||target.id===client.user.id) return fail("You can't moderate yourself or the bot.");
      if(!canActOnTarget(message.member,target,message.guild)) return fail("That member has an equal or higher role than you.");
      const bot=message.guild.members.me??await message.guild.members.fetchMe();
      if(target.roles.highest.comparePositionTo(bot.roles.highest)>=0) return fail("My highest role must be above the target member's highest role.");
      const reason=args.slice(command==="timeout"?2:1).join(" ").slice(0,480)||`Action by ${message.author.tag}`;
      if(command==="kick"){if(!target.kickable)return fail("I can't kick that member.");await target.kick(reason);return send("👢 Member kicked",`**${target.user.tag}** was kicked. ${reason}`);}
      if(command==="ban"){if(!target.bannable)return fail("I can't ban that member.");await target.ban({reason});return send("🔨 Member banned",`**${target.user.tag}** was banned. ${reason}`);}
      if(command==="timeout"){
        const mins=Number(args[1]);if(!Number.isInteger(mins)||mins<1||mins>40320)return fail("Usage: .timeout @member minutes [reason]");
        if(!target.moderatable)return fail("I can't timeout that member.");await target.timeout(mins*60000,reason);return send("⏳ Member timed out",`**${target.user.tag}** for **${mins} minutes**.`);
      }
      if(!target.moderatable)return fail("I can't remove that timeout.");
      if(!target.communicationDisabledUntilTimestamp)return fail("That member isn't timed out.");
      await target.timeout(null,reason);return send("✅ Timeout removed",`Removed timeout from **${target.user.tag}**.`);
    }
    if (["lock","unlock","slowmode"].includes(command)) {
      const required = command === "slowmode" ? PermissionFlagsBits.ManageChannels : PermissionFlagsBits.ManageChannels;
      if (!isBotOwner(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.Administrator) && !message.member.permissions.has(required))
        return fail("You need Manage Channels or Administrator to use this command.");
      if (!message.channel.permissionOverwrites?.edit) return fail("This channel doesn't support permission overwrites.");
      const bot = message.guild.members.me ?? await message.guild.members.fetchMe();
      if (!bot.permissions.has(PermissionFlagsBits.ManageChannels)) return fail("I need Manage Channels permission.");
      if (command === "lock" || command === "unlock") {
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
          SendMessages: command === "lock" ? false : null
        }, { reason: `${command} by ${message.author.tag}` });
        return send(command === "lock" ? "🔒 Channel locked" : "🔓 Channel unlocked",
          command === "lock" ? "Members can no longer send messages in this channel." : "The channel's message permission override has been cleared.");
      }
      const seconds = Number(args[0]);
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) return fail("Usage: .slowmode seconds (0–21600)");
      if (typeof message.channel.setRateLimitPerUser !== "function") return fail("Slowmode isn't supported in this channel.");
      await message.channel.setRateLimitPerUser(seconds, `Slowmode changed by ${message.author.tag}`);
      return send("⏱️ Slowmode updated", seconds ? `Slowmode is now **${seconds} seconds**.` : "Slowmode has been disabled.");
    }
    if (command === "rank") {
      const id = mentionedId(args[0]) || message.author.id;
      const target = message.guild.members.cache.get(id) ?? await message.guild.members.fetch(id).catch(() => null);
      if (!target) return fail("Member not found. Mention them or use their ID.");
      const rank = getHighestConfiguredRank(target, config.ranks);
      return send("🏅 Member rank", `**${target.user.tag}**\n${rank ? `<@&${rank.id}>` : "Unranked"}`);
    }
    if (command === "rankhistory") {
      const id = mentionedId(args[0]);
      if (!id) return fail("Usage: .rankhistory @member");
      const rows = config.history.filter(x => x.memberId === id).slice(0, 10);
      return send("🗂️ Rank history", rows.map(x =>
        `• **${x.action}** ${x.oldRankId ? `<@&${x.oldRankId}>` : "Unranked"} → ${x.newRankId ? `<@&${x.newRankId}>` : "Unranked"} <t:${Math.floor(new Date(x.timestamp).getTime()/1000)}:R>`
      ).join("\n") || "No history found.");
    }
    if (command === "ranksearch") {
      const query = args.join(" ").toLowerCase();
      if (query.length < 2) return fail("Usage: .ranksearch name");
      const members = await getGuildMembers(message.guild);
      const matches = members.filter(m => m.user.username.toLowerCase().includes(query) || m.displayName.toLowerCase().includes(query)).first(10);
      return send("🔎 Member search", matches.map(m => {
        const rank = getHighestConfiguredRank(m, config.ranks);
        return `• **${m.user.tag}** — ${rank ? `<@&${rank.id}>` : "Unranked"}`;
      }).join("\n") || "No matches found.");
    }
    if (command === "rankstats" || command === "rankleaderboard") {
      const members = await getGuildMembers(message.guild);
      if (command === "rankleaderboard") {
        const top = members.map(m => ({ member: m, rank: config.ranks.filter(r => m.roles.cache.has(r.id)).sort((a,b)=>b.position-a.position)[0] }))
          .filter(x => x.rank).sort((a,b)=>b.rank.position-a.rank.position).slice(0,10);
        return send("👑 Rank leaderboard", top.map((x,i)=>`${i+1}. **${x.member.user.tag}** — <@&${x.rank.id}>`).join("\n") || "No ranked members.");
      }
      const lines = config.ranks.map(r => `• <@&${r.id}> — **${members.filter(m=>m.roles.cache.has(r.id)).size}**`);
      return send("📊 Rank statistics", `**Server members:** ${members.size}\n${lines.join("\n") || "No ranks configured."}`);
    }
    if (command === "rankpanel") return send("🏆 Server rank hierarchy",
      config.ranks.map((r,i)=>`**${i+1}.** <@&${r.id}>`).join("\n") || "No ranks configured.");
    if (["promote","demote","setrank"].includes(command)) {
      if (!hasManagerPermission(message.member)) return fail("You need Manage Roles or Administrator.");
      const id = mentionedId(args[0]);
      if (!id) return fail(`Usage: .${command} @member [reason]`);
      const target = message.guild.members.cache.get(id) ?? await message.guild.members.fetch(id).catch(()=>null);
      if (!target) return fail("That member isn't in this server.");
      const actor = message.member;
      if (!isBotOwner(actor.id) && message.guild.ownerId !== actor.id && !actor.permissions.has(PermissionFlagsBits.Administrator) && target.roles.highest.comparePositionTo(actor.roles.highest) >= 0)
        return fail("You can't manage someone whose highest role is equal to or above yours.");
      const bot = message.guild.members.me ?? await message.guild.members.fetchMe();
      if (target.roles.highest.comparePositionTo(bot.roles.highest) >= 0)
        return fail("My highest role must be above the target member's highest role.");
      const ranks = config.ranks;
      const current = ranks.filter(r=>target.roles.cache.has(r.id)).sort((a,b)=>b.position-a.position)[0] || null;
      let desired, action = command.toUpperCase(), reasonArgs = args.slice(1);
      if (command === "setrank") {
        desired = ranks.find(r=>r.id===mentionedId(args[1], true));
        if (!desired) return fail("Usage: .setrank @member @configured-rank [reason]");
        action = "SET"; reasonArgs = args.slice(2);
      } else if (command === "promote") {
        const i = current ? ranks.findIndex(r=>r.id===current.id) : -1;
        if (i+1 >= ranks.length) return fail("Already at the highest configured rank.");
        desired = ranks[i+1];
      } else {
        if (!current) return fail("That member has no configured rank.");
        const i = ranks.findIndex(r=>r.id===current.id);
        if (i <= 0) return fail("Already at the lowest configured rank.");
        desired = ranks[i-1];
      }
      const adapter = {
        guild: message.guild, guildId: message.guild.id, user: message.author, client,
        editReply: payload => message.reply({
          embeds: [prefixEmbed("✅ Rank updated", payload.content || "Rank updated.")],
          allowedMentions: { repliedUser: false, parse: [] }
        })
      };
      return applyRank(adapter, target, desired, action, reasonArgs.join(" ").slice(0,300) || null);
    }
    return fail(`Unknown command .${command}. Use .rankhelp. (Slash commands still work.)`);
  } catch (error) {
    console.error("Prefix command error:", error);
    return fail("Something went wrong. Check the bot logs.");
  }
});

await loadDatabase();
startDashboard({ client, getGuildConfig, saveDatabase });
client.login(TOKEN);
