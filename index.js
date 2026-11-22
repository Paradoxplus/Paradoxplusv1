import "dotenv/config";
import {
  Client, GatewayIntentBits, Partials, Events, AuditLogEvent, PermissionFlagsBits,
  EmbedBuilder, AttachmentBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder
} from "discord.js";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { startDashboard } from "./dashboard.js";
import { joinVoiceChannel, VoiceConnectionStatus, entersState, getVoiceConnection } from "@discordjs/voice";
const EXILE_AS_BANNER_URL = "https://plain-eeur-prod-public.komododecks.com/202611/20/7GMXqpQZLSNrc1rfctNW/image.gif";
const RECRUIT_BANNER_URL = "https://plain-eeur-prod-public.komododecks.com/202611/20/5w9GWzIHSQjOCUJC2fHz/image.gif";
const WELCOME_BANNER_URL = "https://d2ol7oe51mr4n9.cloudfront.net/user_3LnTjrCm07BcsWANEl3eqURP53X/752328ad-804d-4e11-95b5-75dfcfe06cf1.gif";
function buildWelcomeDescription(guild, member) {
  const emoji = guild.emojis.cache.get("1415376887265628250")?.toString() || "✨";
  const defaultMessage =
    emoji + " Welcome {user} to ExileAS | 1.9+ ! " + emoji + "\n\n" +
    "**Hey there {user}**\n" +
    "**We are hyped to have you here — enjoy your stay!**\n\n" +
    "> - <:arrow_yellow:1573218795319730176> [allies](https://discord.com/channels/1572968551973654528/1572968553617817764)\n" +
    "> - <:arrow_yellow:1573218795319730176> [war logs](https://discord.com/channels/1572968551973654528/1572968553617817767)\n" +
    "> - <:arrow_yellow:1573218795319730176> [rosters](https://discord.com/channels/1572968551973654528/1572968553617817763)\n" +
    "> - <:arrow_yellow:1573218795319730176> [tvt](https://discord.com/channels/1572968551973654528/1572968553617817766)\n" +
    "> - <:arrow_yellow:1573218795319730176> [clowns](https://discord.com/channels/1572968551973654528/1572968553320157201)\n" +
    "> - <:arrow_yellow:1573218795319730176> [memories](https://discord.com/channels/1572968551973654528/1572968553320157203)";
  const template = getGuildConfig(guild.id).welcomeMessage || defaultMessage;
  return template.replace(/\{user\}/gi, member.toString()).replace(/\{server\}/gi, guild.name).replace(/\{memberCount\}/gi, String(guild.memberCount));
}


import { initRecruitmentDatabase, recordRecruit, removeRecruit, getRecruitStats, getRecruitLeaderboard, isRecruitmentDatabaseReady, exportDatabaseSnapshot, importDatabaseSnapshot, archiveDiscordMessage, getArchivedChannelMessages } from "./recruitment.js";

 
// Discord does not support loading custom fonts, so use Unicode sans-serif bold
// for embed headings and labels. Apply this consistently to every embed.
function premiumTypography(value) {
  return String(value).replace(/[A-Za-z0-9]/g, char => {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + code - 97);
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + code - 48);
    return char;
  });
}

function buildServerInfoEmbed(guild, requester) {
  const channels = guild.channels.cache;
  const textCount = channels.filter(channel =>
    [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(channel.type)
  ).size;
  const voiceCount = channels.filter(channel =>
    [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)
  ).size;
  const categoryCount = channels.filter(channel => channel.type === ChannelType.GuildCategory).size;
  const verificationNames = ["None", "Low", "Medium", "High", "Very High"];
  const verification = verificationNames[guild.verificationLevel] || "Unknown";
  const createdAt = Math.floor(guild.createdTimestamp / 1000);
  const requestedAt = Math.floor(Date.now() / 1000);
  const logo = guild.iconURL({ size: 256 });
  return new EmbedBuilder()
    .setColor(0x7c5cff)
    .setAuthor({ name: "PARADOX • CORE", ...(logo ? { iconURL: logo } : {}) })
    .setTitle("Server Information")
    .setDescription("**PARADOX - Beyond The Ordinary**")
    .setThumbnail(logo)
    .addFields(
      { name: "General Info", value: "**Name:** " + guild.name + "\n**Server ID:** " + guild.id + "\n**Owner:** <@" + guild.ownerId + ">\n**Created:** <t:" + createdAt + ":R> • <t:" + createdAt + ":F>", inline: false },
      { name: "Members & Roles", value: "**Members:** " + guild.memberCount + "\n**Roles:** " + guild.roles.cache.size + "\n**Verification Level:** " + verification, inline: true },
      { name: "Boost Status", value: "**Level:** " + guild.premiumTier + "\n**Boosts:** " + (guild.premiumSubscriptionCount ?? 0) + "\n**AFK Timeout:** " + guild.afkTimeout + " sec", inline: true },
      { name: "Channels", value: "**Text:** " + textCount + "\n**Voice:** " + voiceCount + "\n**Categories:** " + categoryCount, inline: false }
    )
    .setFooter({ text: "Paradox • Core  |  Requested by " + requester.tag + " • Today at" })
    .setTimestamp(new Date());
}

const originalSetTitle = EmbedBuilder.prototype.setTitle;
EmbedBuilder.prototype.setTitle = function(title) {
  return originalSetTitle.call(this, title == null ? title : premiumTypography(title));
};
const originalSetAuthor = EmbedBuilder.prototype.setAuthor;
EmbedBuilder.prototype.setAuthor = function(author) {
  return originalSetAuthor.call(this, author ? { ...author, name: premiumTypography(author.name) } : author);
};
const originalSetFooter = EmbedBuilder.prototype.setFooter;
EmbedBuilder.prototype.setFooter = function(footer) {
  return originalSetFooter.call(this, footer ? { ...footer, text: premiumTypography(footer.text) } : footer);
};

const TOKEN = process.env.DISCORD_TOKEN;
const BOT_OWNER_ID = "1367968697884606524";
const isBotOwner = userId => userId === BOT_OWNER_ID;
if (!TOKEN) {
  console.error("DISCORD_TOKEN is missing. Add it to your hosting environment variables.");
  process.exit(1);
}

const DATA_DIR = path.resolve("data");
const DATA_FILE = path.join(DATA_DIR, "guild-config.json");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\\\/g, "/"), "utf8");
    const source = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const compressed = deflateRawSync(source);
    const crc = crc32(source);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(source.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}


const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates],
  partials: [Partials.GuildMember, Partials.Message, Partials.Reaction, Partials.User, Partials.Channel]
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
  if (guildId === "1572968551973654528" && !config.logChannelId) config.logChannelId = "1573000934680699023";
  if (!Array.isArray(config.ranks)) config.ranks = [];
  if (!Array.isArray(config.history)) config.history = [];
  if (!Array.isArray(config.warnings)) config.warnings = [];
  if (!Array.isArray(config.autobanList)) config.autobanList = [];
  if (!Array.isArray(config.antiNukeWhitelist)) config.antiNukeWhitelist = [];
  if (!Array.isArray(config.strikes)) config.strikes = [];
  if (!Array.isArray(config.strikeHistory)) config.strikeHistory = [];
  if (!Array.isArray(config.moderationCases)) config.moderationCases = [];
  if (!Array.isArray(config.notes)) config.notes = [];
  if (!Array.isArray(config.warningHistory)) config.warningHistory = [];
  if (!config.pulse || typeof config.pulse !== "object") config.pulse = { days: {} };
  if (!config.pulse.days || typeof config.pulse.days !== "object") config.pulse.days = {};
  if (!Array.isArray(config.ignoredRoleIds)) config.ignoredRoleIds = [];
  if (!Array.isArray(config.autoresponders)) config.autoresponders = [];
  if (!Array.isArray(config.autoroleIds)) config.autoroleIds = [];
  if (typeof config.ticketStaffRoleId !== "string") config.ticketStaffRoleId = null;
  if (!Array.isArray(config.dmOptIns)) config.dmOptIns = [];
  if (!Array.isArray(config.giveaways)) config.giveaways = [];
  if (!config.selfRolePanel || typeof config.selfRolePanel !== "object") config.selfRolePanel = null;
  if (!config.afkUsers || typeof config.afkUsers !== "object" || Array.isArray(config.afkUsers)) config.afkUsers = {};
  if (!Number.isInteger(config.recruitCount) || config.recruitCount < 0) config.recruitCount = 0;
  if (!Array.isArray(config.inactiveAppeals)) config.inactiveAppeals = [];
  if (typeof config.recoveryReviewChannelId !== "string") config.recoveryReviewChannelId = null;
  if (!Array.isArray(config.pendingDeletionApprovals)) config.pendingDeletionApprovals = [];
  if (typeof config.announceChannelId !== "string") config.announceChannelId = null;
  if (typeof config.welcomeMessage !== "string") config.welcomeMessage = null;
  if (!config.tpackDropper || typeof config.tpackDropper !== "object") config.tpackDropper = { enabled: false, channelId: null, postedIds: [] };
  if (typeof config.tpackDropper.enabled !== "boolean") config.tpackDropper.enabled = false;
  if (typeof config.tpackDropper.channelId !== "string") config.tpackDropper.channelId = null;
  if (!Array.isArray(config.tpackDropper.postedIds)) config.tpackDropper.postedIds = [];
  config.ranks.sort((a, b) => a.position - b.position);
  return config;
}

function isAntiNukeWhitelisted(guildId, userId) {
  if (!guildId || !userId) return false;
  return getGuildConfig(guildId).antiNukeWhitelist.includes(userId);
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

async function syncRankRoles(guild) {
  const config = getGuildConfig(guild.id);
  const [roles, botMember] = await Promise.all([
    guild.roles.fetch(),
    guild.members.fetchMe()
  ]);
  const ignored = new Set(config.ignoredRoleIds);
  const eligible = [...roles.values()]
    .filter(role =>
      role.id !== guild.id &&
      !role.managed &&
      !ignored.has(role.id) &&
      role.position < botMember.roles.highest.position
    )
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  config.ranks = eligible.map((role, index) => ({
    id: role.id,
    position: index + 1
  }));
  await saveDatabase();
  console.log(`[Paradoxplus] Auto-synced ${eligible.length} assignable roles for ${guild.name}.`);
}

function getHighestConfiguredRank(member, ranks, roleCache = null) {
  // Use Discord's live role hierarchy when available. Config order can become
  // stale after roles are moved in Server Settings → Roles.
  const ordered = [...ranks].sort((a, b) => {
    const roleA = roleCache?.get(a.id);
    const roleB = roleCache?.get(b.id);
    if (roleA && roleB) return roleA.position - roleB.position;
    return (a.position || 0) - (b.position || 0);
  });
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (member.roles.cache.has(ordered[i].id)) return ordered[i];
  }
  return null;
}

async function getGuildMembers(guild) {
  if (guild.members.cache.size >= guild.memberCount) return guild.members.cache;
  return guild.members.fetch();
}

async function sendOptInDmall(guild, config, content) {
  const optedIn = new Set(config.dmOptIns);
  const members = await guild.members.fetch();
  const recipients = [...members.values()].filter(member => !member.user.bot && optedIn.has(member.id)).slice(0, 100);
  let sent = 0, failed = 0;
  for (const member of recipients) {
    try {
      await member.send({
        embeds: [new EmbedBuilder()
          .setColor(0x7c5cff)
          .setAuthor({ name: "PARADOXPLUS • SERVER MESSAGE", iconURL: guild.iconURL() || undefined })
          .setDescription(content.slice(0, 3900))
          .setFooter({ text: guild.name + " • You opted in to server DMs" })
          .setTimestamp()]
      });
      sent++;
    } catch {
      failed++;
    }
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
  return { total: recipients.length, sent, failed, capped: [...members.values()].filter(m => !m.user.bot && optedIn.has(m.id)).length > 100 };
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

  const oldRank = getHighestConfiguredRank(target, config.ranks, interaction.guild.roles.cache);
  const newRole = interaction.guild.roles.cache.get(desiredRank.id) ?? await interaction.guild.roles.fetch(desiredRank.id).catch(() => null);
  const previousRankRoles = config.ranks
    .filter(rank => rank.id !== desiredRank.id && target.roles.cache.has(rank.id))
    .map(rank => interaction.guild.roles.cache.get(rank.id))
    .filter(Boolean);

  if (!newRole) return replyError(interaction, "That rank role no longer exists. Update the hierarchy with `/rank-config`.");
  if (!newRole.editable || previousRankRoles.some(role => !role.editable)) {
    return replyError(interaction, "I can't manage one or more rank roles. Move my bot role above every configured rank in Server Settings → Roles.");
  }

  // Add the destination rank first, then remove every other configured rank.
  // Unrelated roles (staff, perks, colors, etc.) are never touched.
  try {
    if (!target.roles.cache.has(newRole.id)) {
      await target.roles.add(
        newRole,
        `Assign configured rank by ${interaction.user.tag}`
      );
    }
    if (previousRankRoles.length) {
      await target.roles.remove(
        previousRankRoles,
        `Replace previous configured rank roles for ${action.toLowerCase()} by ${interaction.user.tag}`
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
    const current = getHighestConfiguredRank(target, config.ranks, guild.roles.cache);
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

const MESSAGE_ARCHIVE_GUILD_ID = "1572968551973654528";

// Archive messages in PostgreSQL before Discord can remove them. The archive
// intentionally covers this server only and retains records permanently.
client.on(Events.MessageCreate, message => {
  if (!message.guild || message.guild.id !== MESSAGE_ARCHIVE_GUILD_ID || message.author?.bot) return;
  void archiveDiscordMessage(message, "create")
    .catch(error => console.error("[MessageArchive] Could not archive new message:", error));
});

client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
  if (newMessage.guildId !== MESSAGE_ARCHIVE_GUILD_ID) return;
  const message = newMessage.partial ? await newMessage.fetch().catch(() => newMessage) : newMessage;
  if (message.author?.bot) return;
  void archiveDiscordMessage(message, "edit")
    .catch(error => console.error("[MessageArchive] Could not archive edited message:", error));
});

client.on(Events.MessageDelete, async deletedMessage => {
  if (deletedMessage.guildId !== MESSAGE_ARCHIVE_GUILD_ID) return;
  const message = deletedMessage.partial ? await deletedMessage.fetch().catch(() => deletedMessage) : deletedMessage;
  void archiveDiscordMessage(message, "delete")
    .catch(error => console.error("[MessageArchive] Could not mark deleted message:", error));
});

const antiNukeMassDeleteWindows = new Map();
async function inspectMassMessageDelete(messages) {
  const first = messages.first();
  const guild = first?.guild;
  const channel = first?.channel;
  if (!guild || guild.id !== ANTI_NUKE_GUILD_ID || messages.size < 10) return;
  let entry = null;
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageBulkDelete, limit: 10 });
    entry = [...logs.entries.values()].find(item =>
      item.extra?.channel?.id === channel?.id &&
      Date.now() - item.createdTimestamp >= 0 &&
      Date.now() - item.createdTimestamp <= 15000
    ) || null;
  } catch (error) {
    console.error("[ANTI-NUKE] Mass-message-delete audit lookup failed:", error);
    await notifyAntiNukeOwner(guild, "Detected a bulk deletion of " + messages.size + " messages in #" + (channel?.name || "unknown channel") + ", but audit-log lookup failed. Check View Audit Log permission.");
    return;
  }
  const executorId = entry?.executorId ?? null;
  if (!executorId) {
    await notifyAntiNukeOwner(guild, "Detected a bulk deletion of " + messages.size + " messages in #" + (channel?.name || "unknown channel") + ", but Discord did not provide a matching executor. Review the audit log.");
    return;
  }
  if (isAntiNukeTrustedActor(guild, executorId)) return;
  const now = Date.now();
  const recent = (antiNukeMassDeleteWindows.get(executorId) || []).filter(item => now - item.at <= 60000);
  recent.push({ at: now, count: messages.size, channelId: channel.id });
  antiNukeMassDeleteWindows.set(executorId, recent);
  await notifyAntiNukeOwner(guild,
    "Mass message deletion detected. Actor: <@" + executorId + ">. Deleted: " + messages.size +
    " messages. Channel: <#" + channel.id + ">. Bulk-delete events by this actor in the last minute: " + recent.length +
    ". Archived message records are being marked for recovery/export.");
}
client.on(Events.MessageBulkDelete, messages => {
  for (const message of messages.values()) {
    if (message.guildId !== MESSAGE_ARCHIVE_GUILD_ID) continue;
    void archiveDiscordMessage(message, "delete")
      .catch(error => console.error("[MessageArchive] Could not mark bulk-deleted message:", error));
  }
  void inspectMassMessageDelete(messages)
    .catch(error => console.error("[ANTI-NUKE] Mass-message-delete detection failed:", error));
});
// Built-in and configurable autoresponders.
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  const config = getGuildConfig(message.guild.id);
  const configuredPrefix = typeof config.prefix === "string" && config.prefix.length >= 1 && config.prefix.length <= 5 ? config.prefix : DEFAULT_PREFIX;
  if (message.content.startsWith(configuredPrefix)) return;
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

// AFK status: automatically clear when the member speaks and notify others when they mention an AFK member.
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  const config = getGuildConfig(message.guild.id);
  const configuredPrefix = typeof config.prefix === "string" && config.prefix.length >= 1 && config.prefix.length <= 5 ? config.prefix : DEFAULT_PREFIX;
  if (message.content.startsWith(configuredPrefix) && message.content.slice(configuredPrefix.length).trim().split(/\s+/, 1)[0]?.toLowerCase() === "afk") return;
  const ownAfk = config.afkUsers[message.author.id];
  if (ownAfk) {
    delete config.afkUsers[message.author.id];
    await saveDatabase().catch(error => console.error("[AFK] Could not save return:", error));
    const elapsed = Math.max(0, Date.now() - Number(ownAfk.since || Date.now()));
    const minutes = Math.floor(elapsed / 60000);
    const duration = minutes < 1 ? "less than a minute" : minutes < 60 ? minutes + " minute(s)" : Math.floor(minutes / 60) + " hour(s)";
    await message.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x35d07f)
        .setTitle("✦ Welcome back")
        .setDescription(message.author.toString() + " is no longer AFK. Away for **" + duration + "**.")
        .setFooter({ text: "Paradoxplus AFK System" })
        .setTimestamp()],
      allowedMentions: { users: [message.author.id], repliedUser: false }
    }).catch(error => console.error("[AFK] Return notice failed:", error));
    return;
  }
  const afkMentions = [...message.mentions.users.values()]
    .filter(user => !user.bot && user.id !== message.author.id && config.afkUsers[user.id])
    .slice(0, 5);
  if (!afkMentions.length) return;
  const details = afkMentions.map(user => {
    const record = config.afkUsers[user.id];
    return user.toString() + ": **" + String(record.reason || "No reason provided").slice(0, 180) + "**";
  });
  await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x7c5cff)
      .setTitle("✦ AFK notice")
      .setDescription(details.join("\n"))
      .setFooter({ text: "Paradoxplus AFK System" })],
    allowedMentions: { parse: [], repliedUser: false }
  }).catch(error => console.error("[AFK] Mention notice failed:", error));
});

client.on(Events.GuildRoleCreate, async role => {
  if (role.guild.id !== ANTI_NUKE_GUILD_ID) return;
  void syncRankRoles(role.guild).catch(error => console.error("Role-create auto-sync failed:", error));

  const entry = await findRecentAuditExecutor(role.guild, AuditLogEvent.RoleCreate, role.id, 30000);
  if (!entry?.executorId) {
    await notifyAntiNukeOwner(role.guild, "A role was created, but its audit-log executor could not be identified. Role: " + role.name + " (" + role.id + ").");
    return;
  }
  if (isAntiNukeTrustedActor(role.guild, entry.executorId)) return;

  const triggered = await trackDestructiveAuditAction(role.guild, entry.executorId, "role-create", "roles created");
  if (triggered && role.editable) {
    await role.delete("Paradox • Core anti-nuke: remove role created during a confirmed rapid role-creation attack")
      .catch(error => console.error("[ANTI-NUKE] Could not remove attack-created role:", error));
  }
});
client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
  if (newRole.guild.id === "1572968551973654528") void syncRankRoles(newRole.guild).catch(error => console.error("Role-update auto-sync failed:", error));
});
function isAntiNukeTrustedActor(guild, userId) {
  // Only the actual server owner, this bot, the configured bot owner, and
  // users explicitly added by the bot owner are exempt from anti-nuke enforcement.
  return Boolean(userId) && (
    userId === guild.ownerId ||
    userId === client.user?.id ||
    userId === BOT_OWNER_ID ||
    isAntiNukeWhitelisted(guild.id, userId)
  );
}

// Anti-nuke coverage for bot invitations and rapid member bans.
const ANTI_NUKE_GUILD_ID = "1572968551973654528";
const antiNukeActorLocks = new Set();
const ANTI_NUKE_BOT_DANGEROUS_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ManageEvents,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.ManageEmojisAndStickers,
  PermissionFlagsBits.ManageGuildExpressions,
  PermissionFlagsBits.ManageThreads
];

async function findRecentAuditExecutor(guild, type, targetId, maxAgeMs = 45000) {
  for (let attempt = 0; attempt < 7; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 650));
    try {
      const logs = await guild.fetchAuditLogs({ type, limit: 20 });
      const entry = logs.entries.find(item => item.targetId === targetId &&
        Date.now() - item.createdTimestamp >= 0 && Date.now() - item.createdTimestamp <= maxAgeMs);
      if (entry?.executorId) return entry;
    } catch (error) {
      console.error("[ANTI-NUKE] Audit-log lookup failed:", error);
      return null;
    }
  }
  return null;
}

const antiNukeDestructiveWindows = new Map();

async function trackDestructiveAuditAction(guild, executorId, action, targetLabel) {
  if (guild.id !== ANTI_NUKE_GUILD_ID || !executorId) return false;
  if (isAntiNukeTrustedActor(guild, executorId)) return false;

  const now = Date.now();
  const key = guild.id + ":" + action + ":" + executorId;
  const recent = (antiNukeDestructiveWindows.get(key) || []).filter(timestamp => now - timestamp <= 12000);
  recent.push(now);
  antiNukeDestructiveWindows.set(key, recent);

  // Keep the in-memory tracker bounded even during prolonged event floods.
  if (antiNukeDestructiveWindows.size > 500) {
    for (const [storedKey, timestamps] of antiNukeDestructiveWindows) {
      if (!timestamps.length || now - timestamps[timestamps.length - 1] > 60000) antiNukeDestructiveWindows.delete(storedKey);
    }
  }

  if (recent.length < 3) return false;
  antiNukeDestructiveWindows.delete(key);
  await punishAntiNukeExecutor(guild, executorId, "rapid " + action + " activity: " + recent.length + " " + targetLabel + " within 12 seconds");
  return true;
}

async function notifyAntiNukeOwner(guild, message) {
  try {
    const owner = await client.users.fetch(BOT_OWNER_ID);
    const alert = new EmbedBuilder()
      .setColor(0x202225)
      .setTitle("🛡️ Paradox • Core  |  Security Alert")
      .setDescription(String(message).slice(0, 3900))
      .addFields({ name: "Server", value: String(guild.name || "Unknown").slice(0, 100) + "\n" + guild.id, inline: false })
      .setFooter({ text: "ANTI-NUKE SYSTEM  •  Automated security notice" })
      .setTimestamp();
    await owner.send({ embeds: [alert], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error("[ANTI-NUKE] Could not DM the configured bot owner:", error);
  }
}

async function enforceRapidBanProtection(guild, bannedUser) {
  if (guild.id !== ANTI_NUKE_GUILD_ID) return;
  const lockKey = guild.id + ":rapid-ban";
  if (antiNukeActorLocks.has(lockKey)) return;
  antiNukeActorLocks.add(lockKey);
  try {
    await new Promise(resolve => setTimeout(resolve, 900));
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 50 });
    const cutoff = Date.now() - 12000;
    const recent = [...logs.entries.values()].filter(entry =>
      entry.targetId && entry.createdTimestamp >= cutoff &&
      entry.createdTimestamp <= Date.now() + 2000 && entry.executorId
    );
    const counts = new Map();
    for (const entry of recent) counts.set(entry.executorId, (counts.get(entry.executorId) || 0) + 1);
    const candidates = [...counts.entries()].filter(([actorId, count]) => count >= 3 && !isAntiNukeTrustedActor(guild, actorId));
    for (const [executorId, count] of candidates) {
      const actor = await guild.members.fetch(executorId).catch(() => null);
      if (!actor) {
        await notifyAntiNukeOwner(guild, "Detected " + count + " bans in 12 seconds by user ID " + executorId + ", but the executor was no longer in the server.");
        continue;
      }
      if (!actor.bannable) {
        await notifyAntiNukeOwner(guild, "Detected " + count + " bans in 12 seconds by <@" + executorId + ">, but Discord says the executor is not bannable. Check bot permissions and role hierarchy.");
        continue;
      }
      await actor.ban({ reason: "Paradox • Core anti-nuke: rapid mass-ban activity (" + count + " bans in 12 seconds)" });
      console.error("[ANTI-NUKE] Banned rapid mass-ban executor:", executorId, "bans:", count);
      await notifyAntiNukeOwner(guild, "Banned <@" + executorId + "> after detecting " + count + " bans in 12 seconds.");
    }
  } catch (error) {
    console.error("[ANTI-NUKE] Rapid-ban protection failed:", error);
    await notifyAntiNukeOwner(guild, "Rapid-ban detection encountered an error: " + String(error?.message || error).slice(0, 300));
  } finally {
    antiNukeActorLocks.delete(lockKey);
  }
}

client.on(Events.GuildBanAdd, ban => {
  if (ban.guild?.id === ANTI_NUKE_GUILD_ID) void enforceRapidBanProtection(ban.guild, ban.user);
});

async function punishAntiNukeExecutor(guild, executorId, reason) {
  if (!executorId || isAntiNukeTrustedActor(guild, executorId)) {
    if (executorId === guild.ownerId) console.error("[ANTI-NUKE] Server owner performed a protected action; Discord does not allow bots to ban the owner.");
    return false;
  }
  try {
    await guild.members.ban(executorId, { reason: "Paradox • Core anti-nuke: " + reason });
    console.error("[ANTI-NUKE] Banned executor:", executorId, reason);
    await notifyAntiNukeOwner(guild, "Banned <@" + executorId + "> for: " + reason);
    return true;
  } catch (error) {
    console.error("[ANTI-NUKE] Failed to ban executor:", executorId, error);
    await notifyAntiNukeOwner(guild, "Detected " + reason + " by <@" + executorId + ">, but Discord rejected the ban: " + String(error?.message || error).slice(0, 250));
    return false;
  }
}

function hasDangerousPermissions(permissions) {
  return ANTI_NUKE_BOT_DANGEROUS_PERMISSIONS.some(permission => permissions.has(permission));
}

async function inspectRolePermissionEscalation(oldRole, newRole) {
  const guild = newRole.guild;
  if (guild.id !== ANTI_NUKE_GUILD_ID) return;
  const newlyGranted = ANTI_NUKE_BOT_DANGEROUS_PERMISSIONS.filter(permission =>
    !oldRole.permissions.has(permission) && newRole.permissions.has(permission)
  );
  if (!newlyGranted.length) return;
  const entry = await findRecentAuditExecutor(guild, AuditLogEvent.RoleUpdate, newRole.id);
  const executorId = entry?.executorId ?? null;
  if (isAntiNukeTrustedActor(guild, executorId)) return;
  if (!executorId) {
    await notifyAntiNukeOwner(guild, "A role gained dangerous permissions, but its executor could not be identified. No automatic rollback was attempted to avoid undoing a legitimate owner change. Role: " + newRole.name + " (" + newRole.id + "). Review the audit log immediately.");
    return;
  }
  try {
    await newRole.setPermissions(oldRole.permissions.bitfield, "Anti-nuke: revert unauthorized dangerous role permission escalation");
    console.error("[ANTI-NUKE] Reverted dangerous permissions on role:", newRole.id, "executor:", executorId);
  } catch (error) {
    console.error("[ANTI-NUKE] Failed to revert dangerous role permissions:", error);
    await notifyAntiNukeOwner(guild, "A role gained dangerous permissions, but Paradox could not revert them. Role: " + newRole.id + "; executor: " + executorId);
  }
  await punishAntiNukeExecutor(guild, executorId, "granting dangerous permissions to role " + newRole.name);
}

client.on(Events.GuildRoleCreate, async role => {
  if (role.guild.id !== ANTI_NUKE_GUILD_ID || !hasDangerousPermissions(role.permissions)) return;
  const entry = await findRecentAuditExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
  const executorId = entry?.executorId ?? null;
  if (!executorId) {
    await notifyAntiNukeOwner(role.guild, "A dangerous-permission role was created, but its executor could not be identified. No automatic deletion was attempted to avoid destroying a legitimate owner-created role. Review immediately: " + role.name + " (" + role.id + ").");
    return;
  }
  if (isAntiNukeTrustedActor(role.guild, executorId)) return;
  try {
    await role.delete("Anti-nuke: remove newly created role with dangerous permissions");
    console.error("[ANTI-NUKE] Deleted newly created dangerous-permission role:", role.id);
  } catch (error) {
    console.error("[ANTI-NUKE] Failed to delete dangerous-permission role:", role.id, error);
    await notifyAntiNukeOwner(role.guild, "A new role has dangerous permissions and could not be deleted. Role: " + role.name);
  }
  await punishAntiNukeExecutor(role.guild, executorId, "creating dangerous-permission role " + role.name);
});

client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
  void inspectRolePermissionEscalation(oldRole, newRole).catch(error => console.error("[ANTI-NUKE] Role escalation handler failed:", error));
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (newMember.guild.id !== ANTI_NUKE_GUILD_ID) return;
  const addedDangerousRoles = newMember.roles.cache.filter(role =>
    !oldMember.roles.cache.has(role.id) && hasDangerousPermissions(role.permissions)
  );
  if (!addedDangerousRoles.size) return;
  const entry = await findRecentAuditExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
  const executorId = entry?.executorId ?? null;
  if (!executorId) {
    await notifyAntiNukeOwner(newMember.guild, "A member received a dangerous-permission role, but its executor could not be identified. No automatic role removal was attempted to avoid stripping a legitimate owner-approved role. Member: " + newMember.id + ". Review immediately.");
    return;
  }
  if (isAntiNukeTrustedActor(newMember.guild, executorId)) return;
  try {
    await newMember.roles.remove([...addedDangerousRoles.keys()], "Anti-nuke: revert unauthorized assignment of dangerous-permission role");
    console.error("[ANTI-NUKE] Removed dangerous role assignment from member:", newMember.id);
  } catch (error) {
    console.error("[ANTI-NUKE] Failed to remove dangerous role assignment:", error);
    await notifyAntiNukeOwner(newMember.guild, "A member received a dangerous-permission role that Paradox could not remove. Member: " + newMember.id);
  }
  await punishAntiNukeExecutor(newMember.guild, executorId, "assigning dangerous role(s) to <@" + newMember.id + ">");
});

async function inspectMassKicks(guild) {
  if (guild.id !== ANTI_NUKE_GUILD_ID) return;
  const lockKey = guild.id + ":rapid-kick";
  if (antiNukeActorLocks.has(lockKey)) return;
  antiNukeActorLocks.add(lockKey);
  try {
    await new Promise(resolve => setTimeout(resolve, 800));
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 50 });
    const cutoff = Date.now() - 12000;
    const counts = new Map();
    for (const entry of logs.entries.values()) {
      if (entry.executorId && entry.createdTimestamp >= cutoff && entry.createdTimestamp <= Date.now() + 2000) {
        counts.set(entry.executorId, (counts.get(entry.executorId) || 0) + 1);
      }
    }
    const candidates = [...counts.entries()].filter(([actorId, count]) => count >= 3 && !isAntiNukeTrustedActor(guild, actorId));
    for (const [actorId, count] of candidates) {
      await punishAntiNukeExecutor(guild, actorId, "kicking " + count + " members within 12 seconds");
    }
  } catch (error) {
    console.error("[ANTI-NUKE] Mass-kick inspection failed:", error);
    await notifyAntiNukeOwner(guild, "Mass-kick inspection failed: " + String(error?.message || error).slice(0, 250));
  } finally {
    antiNukeActorLocks.delete(lockKey);
  }
}

client.on(Events.GuildMemberRemove, member => {
  if (member.guild.id === ANTI_NUKE_GUILD_ID) void inspectMassKicks(member.guild);
});

async function inspectNewBot(member) {
  if (!member.user.bot || member.guild.id !== ANTI_NUKE_GUILD_ID) return false;
  const entry = await findRecentAuditExecutor(member.guild, AuditLogEvent.BotAdd, member.id);
  const executorId = entry?.executorId ?? null;
  const freshMember = await member.guild.members.fetch(member.id).catch(() => member);
  const hasDangerousPermission = ANTI_NUKE_BOT_DANGEROUS_PERMISSIONS.some(permission => freshMember.permissions.has(permission));
  console.warn("[ANTI-NUKE] New bot joined:", { botId: member.id, executorId, dangerousPermissions: hasDangerousPermission });
  if (!hasDangerousPermission || member.id === client.user.id || isAntiNukeTrustedActor(member.guild, executorId)) return false;
  try {
    await member.guild.members.ban(member.id, { reason: "Paradox • Core anti-nuke: newly added bot had elevated server permissions" });
    console.error("[ANTI-NUKE] Removed newly added bot with elevated permissions:", member.id);
    await notifyAntiNukeOwner(member.guild, "Removed newly added bot <@" + member.id + "> because it had Administrator/moderation/server-management permissions. Added by: " + (executorId ? "<@" + executorId + ">." : "unknown (audit-log executor unavailable)."));
  } catch (error) {
    console.error("[ANTI-NUKE] Could not remove newly added privileged bot:", member.id, error);
    await notifyAntiNukeOwner(member.guild, "A newly added bot <@" + member.id + "> had elevated permissions, but I could not ban it. Audit-log inviter: " + (executorId || "unknown") + ". Error: " + String(error?.message || error).slice(0, 250));
  }
  return true;
}


async function readLatestChannelBackup(guildId) {
  const backupDir = path.join(DATA_DIR, "channel-backups", guildId);
  const files = (await fs.readdir(backupDir).catch(() => []))
    .filter(file => file.endsWith(".json"))
    .sort()
    .reverse();
  for (const file of files) {
    try {
      const snapshot = JSON.parse(await fs.readFile(path.join(backupDir, file), "utf8"));
      if (snapshot?.guildId === guildId && Array.isArray(snapshot.channels)) return snapshot;
    } catch (error) {
      console.error("[CHANNEL-ANTI-NUKE] Could not read backup file:", file, error);
    }
  }
  return null;
}

async function restoreDeletedChannel(channel, selectedSnapshot = null) {
  const guild = channel.guild;
  const snapshot = selectedSnapshot || await readLatestChannelBackup(guild.id);
  const saved = snapshot?.channels?.find(item => item.id === channel.id);
  if (!saved) {
    console.error("[CHANNEL-ANTI-NUKE] No saved channel record found for", channel.id);
    return null;
  }

  const parent = saved.parentId ? await guild.channels.fetch(saved.parentId).catch(() => null) : null;
  const options = {
    name: saved.name,
    type: saved.type,
    position: saved.position,
    parent: parent?.id,
    topic: saved.topic ?? undefined,
    nsfw: saved.nsfw,
    rateLimitPerUser: saved.rateLimitPerUser,
    bitrate: saved.bitrate ?? undefined,
    userLimit: saved.userLimit ?? undefined,
    rtcRegion: saved.rtcRegion ?? undefined,
    videoQualityMode: saved.videoQualityMode ?? undefined,
    defaultAutoArchiveDuration: saved.defaultAutoArchiveDuration ?? undefined,
    defaultThreadRateLimitPerUser: saved.defaultThreadRateLimitPerUser ?? undefined,
    permissionOverwrites: (saved.permissionOverwrites ?? []).map(overwrite => ({
      id: overwrite.id,
      type: overwrite.type,
      allow: BigInt(overwrite.allow),
      deny: BigInt(overwrite.deny)
    }))
  };
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null) delete options[key];
  }

  const restored = await guild.channels.create({
    ...options,
    reason: "Paradox • Core automatic recovery after unauthorized channel deletion"
  });
  await restored.setPosition(saved.position).catch(error => {
    console.error("[CHANNEL-ANTI-NUKE] Could not restore channel position:", error);
  });
  console.log("[CHANNEL-ANTI-NUKE] Restored deleted channel", saved.name, "as", restored.id);
  return restored;
}


async function restoreArchivedMessages(deletedChannel, restoredChannel) {
  if (typeof restoredChannel?.send !== "function") {
    console.log("[MessageArchive] Restored channel type does not support direct message replay:", restoredChannel?.id);
    return 0;
  }
  const rows = await getArchivedChannelMessages(deletedChannel.guild.id, deletedChannel.id, false, 1000);
  if (!rows.length) {
    console.log("[MessageArchive] No archived messages available to replay for", deletedChannel.name, deletedChannel.id);
    return 0;
  }

  let restoredCount = 0;
  for (const row of rows) {
    const createdAt = row.created_at ? new Date(row.created_at) : null;
    const timestamp = createdAt && !Number.isNaN(createdAt.getTime())
      ? " · " + createdAt.toISOString().replace("T", " ").slice(0, 19).replace("T", " ") + " UTC"
      : "";
    const parts = ["**" + (row.author_tag || "Unknown author") + "**" + timestamp];
    if (row.content) parts.push(row.content);

    for (const attachment of (Array.isArray(row.attachments) ? row.attachments : [])) {
      if (attachment.url) parts.push("Attachment: " + (attachment.name || "file") + " — " + attachment.url);
    }
    for (const embed of (Array.isArray(row.embeds) ? row.embeds : [])) {
      if (embed.title) parts.push("Embed title: " + String(embed.title));
      if (embed.description) parts.push("Embed: " + String(embed.description));
      if (Array.isArray(embed.fields)) {
        for (const field of embed.fields) {
          if (field?.name || field?.value) parts.push(String(field?.name || "Field") + ": " + String(field?.value || ""));
        }
      }
    }
    for (const sticker of (Array.isArray(row.stickers) ? row.stickers : [])) {
      parts.push("Sticker: " + (sticker.name || "sticker") + (sticker.url ? " — " + sticker.url : ""));
    }

    let transcript = parts.join("\n");
    if (!transcript.trim()) transcript = "[Archived message had no recoverable text or attachments.]";
    if (transcript.length > 1950) transcript = transcript.slice(0, 1947) + "...";
    await restoredChannel.send({
      content: transcript,
      allowedMentions: { parse: [] }
    });
    restoredCount++;
  }

  console.log("[MessageArchive] Replayed " + restoredCount + " archived messages into restored channel " + restoredChannel.id);
  return restoredCount;
}

client.on(Events.ChannelCreate, async channel => {
  if (!channel?.guild || channel.guild.id !== ANTI_NUKE_GUILD_ID || channel.isThread?.()) return;
  const entry = await findRecentAuditExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id, 30000);
  if (!entry?.executorId) {
    await notifyAntiNukeOwner(channel.guild, "A channel was created, but its audit-log executor could not be identified. Channel: " + channel.name + " (" + channel.id + ").");
    return;
  }
  if (isAntiNukeTrustedActor(channel.guild, entry.executorId)) return;

  const triggered = await trackDestructiveAuditAction(channel.guild, entry.executorId, "channel-create", "channels created");
  if (triggered && channel.deletable) {
    await channel.delete("Paradox • Core anti-nuke: remove channel created during a confirmed rapid channel-creation attack")
      .catch(error => console.error("[ANTI-NUKE] Could not remove attack-created channel:", error));
  }
});



// Detect permission escalation through channel overwrites (including @everyone,
// role overwrites, and member-specific overwrites). Unknown audit actors are
// alerted, never treated as proof of an attack.
const ANTI_NUKE_CHANNEL_DANGEROUS_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ManageThreads
];

async function inspectChannelPermissionEscalation(oldChannel, newChannel) {
  if (!newChannel?.guild || newChannel.guild.id !== ANTI_NUKE_GUILD_ID ||
      !oldChannel?.permissionOverwrites?.cache || !newChannel.permissionOverwrites?.cache) return;
  const changedTargets = [];
  for (const [targetId, next] of newChannel.permissionOverwrites.cache) {
    const previous = oldChannel.permissionOverwrites.cache.get(targetId);
    const granted = ANTI_NUKE_CHANNEL_DANGEROUS_PERMISSIONS.filter(permission =>
      (next.allow.has(permission) && !previous?.allow.has(permission)) ||
      (previous?.deny.has(permission) && !next.deny.has(permission))
    );
    if (granted.length) changedTargets.push({ targetId, previous, next, granted });
  }
  if (!changedTargets.length) return;

  let entry = null;
  for (const type of [
    AuditLogEvent.ChannelOverwriteUpdate,
    AuditLogEvent.ChannelOverwriteCreate,
    AuditLogEvent.ChannelOverwriteDelete
  ]) {
    try {
      const logs = await newChannel.guild.fetchAuditLogs({ type, limit: 10 });
      entry = [...logs.entries.values()].find(item =>
        item.executorId &&
        item.extra?.channel?.id === newChannel.id &&
        Date.now() - item.createdTimestamp >= 0 &&
        Date.now() - item.createdTimestamp <= 15000
      ) || null;
      if (entry) break;
    } catch (error) {
      console.error("[ANTI-NUKE] Channel-overwrite audit lookup failed:", error);
    }
  }

  const executorId = entry?.executorId ?? null;
  if (!executorId) {
    await notifyAntiNukeOwner(newChannel.guild,
      "A channel overwrite granted dangerous permissions, but the audit-log actor could not be identified. No automatic rollback was attempted. Channel: " +
      newChannel.name + " (" + newChannel.id + "). Review the audit log immediately.");
    return;
  }
  if (isAntiNukeTrustedActor(newChannel.guild, executorId)) return;

  for (const change of changedTargets) {
    try {
      if (change.previous) {
        await newChannel.permissionOverwrites.edit(change.targetId, {
          allow: change.previous.allow.bitfield,
          deny: change.previous.deny.bitfield
        }, "Paradox • Core anti-nuke: revert unauthorized dangerous channel permission escalation");
      } else {
        await newChannel.permissionOverwrites.delete(change.targetId,
          "Paradox • Core anti-nuke: remove unauthorized dangerous channel permission overwrite");
      }
    } catch (error) {
      console.error("[ANTI-NUKE] Failed to revert channel overwrite:", newChannel.id, change.targetId, error);
      await notifyAntiNukeOwner(newChannel.guild,
        "Could not revert a dangerous channel permission overwrite. Channel: " + newChannel.name +
        "; target: " + change.targetId + "; actor: <@" + executorId + ">.");
    }
  }
  await punishAntiNukeExecutor(newChannel.guild, executorId,
    "granting dangerous channel permissions in " + newChannel.name);
}

client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
  void inspectChannelPermissionEscalation(oldChannel, newChannel)
    .catch(error => console.error("[ANTI-NUKE] Channel permission inspection failed:", error));
});

const antiNukeJoinWindows = new Map();
function trackAntiNukeJoin(member) {
  if (member.guild.id !== ANTI_NUKE_GUILD_ID || member.user.bot) return;
  const now = Date.now();
  const recent = (antiNukeJoinWindows.get(member.guild.id) || []).filter(item => now - item.at <= 15000);
  recent.push({ at: now, userId: member.id, createdAt: member.user.createdTimestamp });
  antiNukeJoinWindows.set(member.guild.id, recent);
  if (recent.length === 8) {
    const youngAccounts = recent.filter(item => now - item.createdAt < 7 * 24 * 60 * 60 * 1000);
    void notifyAntiNukeOwner(member.guild,
      "Possible join raid: " + recent.length + " members joined within 15 seconds." +
      (youngAccounts.length ? " " + youngAccounts.length + " have accounts younger than 7 days." : "") +
      " No members were automatically punished; review joins and enable Discord verification/raid protections if needed.");
  }
  if (recent.length > 100) antiNukeJoinWindows.set(member.guild.id, recent.slice(-100));
}

client.on(Events.WebhooksUpdate, async channel => {
  if (!channel?.guild || channel.guild.id !== ANTI_NUKE_GUILD_ID) return;
  for (const type of [AuditLogEvent.WebhookCreate, AuditLogEvent.WebhookUpdate, AuditLogEvent.WebhookDelete]) {
    try {
      const logs = await channel.guild.fetchAuditLogs({ type, limit: 10 });
      const entry = [...logs.entries.values()].find(item =>
        item.executorId &&
        item.extra?.channel?.id === channel.id &&
        Date.now() - item.createdTimestamp >= 0 &&
        Date.now() - item.createdTimestamp <= 15000
      );
      if (!entry?.executorId) continue;
      if (isAntiNukeTrustedActor(channel.guild, entry.executorId)) continue;

      const triggered = await trackDestructiveAuditAction(channel.guild, entry.executorId, "webhook-change", "webhook changes");
      const webhook = await channel.guild.fetchWebhooks().then(collection => collection.get(entry.targetId)).catch(() => null);
      if (webhook && (type === AuditLogEvent.WebhookCreate || triggered)) {
        await webhook.delete("Paradox • Core anti-nuke: unauthorized webhook creation/update")
          .catch(error => console.error("[ANTI-NUKE] Could not remove unauthorized webhook:", error));
      }
      if (!triggered) {
        await notifyAntiNukeOwner(channel.guild, "Unauthorized webhook " +
          (type === AuditLogEvent.WebhookCreate ? "creation" : type === AuditLogEvent.WebhookDelete ? "deletion" : "update") +
          " detected in <#" + channel.id + "> by <@" + entry.executorId + ">.");
      }
    } catch (error) {
      console.error("[ANTI-NUKE] Webhook audit inspection failed:", error);
      await notifyAntiNukeOwner(channel.guild, "Webhook changes were detected, but audit-log inspection failed. Check bot permissions.");
    }
  }
});

client.on(Events.ChannelDelete, async channel => {
  if (!channel?.guild || channel.guild.id !== "1572968551973654528" || channel.isThread?.()) return;
  const guild = channel.guild;
  console.error("[CHANNEL-ANTI-NUKE] Channel deletion detected:", channel.name, channel.id);

  // Audit entries can arrive after the gateway deletion event; retry briefly.
  let entry = null;
  for (let attempt = 0; attempt < 4 && !entry; attempt++) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 600));
    try {
      const audit = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 10 });
      entry = audit.entries.find(item =>
        item.targetId === channel.id &&
        Date.now() - item.createdTimestamp < 30000
      ) ?? null;
    } catch (error) {
      console.error("[CHANNEL-ANTI-NUKE] Audit-log lookup failed:", error);
    }
  }

  const executorId = entry?.executorId ?? null;
  if (executorId) {
    await trackDestructiveAuditAction(guild, executorId, "channel-delete", "channels deleted");
  }
  if (isAntiNukeTrustedActor(guild, executorId)) {
    console.log("[CHANNEL-ANTI-NUKE] Trusted owner or bot deleted channel; no enforcement:", executorId);
    return;
  }

  // Restore immediately, then let the owner decide whether the deletion should stand.
  let restoredChannel = null;
  try {
    restoredChannel = await restoreDeletedChannel(channel);
    if (restoredChannel) await restoreArchivedMessages(channel, restoredChannel);
  } catch (error) {
    console.error("[CHANNEL-ANTI-NUKE] Recovery failed:", error);
  }
  if (!executorId) {
    await notifyAntiNukeOwner(guild, "A channel was deleted, but Discord did not provide a matching audit-log executor. Recovery was attempted. Review the audit log and verify the restored channel.");
    return;
  }
  if (executorId === guild.ownerId || executorId === client.user.id) return;
  const cfg = getGuildConfig(guild.id);
  const reviewChannel = cfg.recoveryReviewChannelId ? await guild.channels.fetch(cfg.recoveryReviewChannelId).catch(() => null) : null;
  if (restoredChannel && reviewChannel?.isTextBased?.() && typeof reviewChannel.send === "function") {
    const pending = { channelId: channel.id, channelName: channel.name, restoredChannelId: restoredChannel.id, executorId, requestedAt: new Date().toISOString(), status: "pending" };
    cfg.pendingDeletionApprovals = cfg.pendingDeletionApprovals.filter(item => !(item.channelId === channel.id && item.status === "pending"));
    cfg.pendingDeletionApprovals.push(pending);
    if (cfg.pendingDeletionApprovals.length > 100) cfg.pendingDeletionApprovals = cfg.pendingDeletionApprovals.slice(-100);
    await saveDatabase();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("px_delete_approval:accept:" + channel.id).setLabel("Accept deletion").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("px_delete_approval:reject:" + channel.id).setLabel("Reject & keep recovery").setStyle(ButtonStyle.Success)
    );
    await reviewChannel.send({
      embeds: [new EmbedBuilder().setColor(0xe0a12b).setTitle("Channel deletion approval required")
        .setDescription("A channel was deleted and has been recovered temporarily. Choose whether the deletion should stand.")
        .addFields(
          { name: "Channel", value: channel.name + " (" + channel.id + ")", inline: true },
          { name: "Executor", value: "<@" + executorId + "> (" + executorId + ")", inline: true },
          { name: "Recovered copy", value: "<#" + restoredChannel.id + ">", inline: false }
        ).setTimestamp()],
      components: [row],
      allowedMentions: { users: [guild.ownerId], parse: [] }
    }).catch(error => console.error("[DeletionApproval] Could not send approval request:", error));
    return;
  }
  // No review channel or no recoverable snapshot: retain automatic enforcement.
  try {
    await guild.members.ban(executorId, { reason: "Paradox • Core anti-nuke: unauthorized channel deletion (approval route unavailable)" });
  } catch (error) {
    console.error("[CHANNEL-ANTI-NUKE] Could not ban channel deleter:", error);
  }
});

client.on(Events.GuildRoleDelete, async role => {
  if (role.guild.id !== ANTI_NUKE_GUILD_ID) return;
  void syncRankRoles(role.guild).catch(error => console.error("Role-delete auto-sync failed:", error));

  // Detect rapid deletion of multiple roles, not just deletion of the Core role.
  const roleDeleteEntry = await findRecentAuditExecutor(role.guild, AuditLogEvent.RoleDelete, role.id, 30000);
  if (roleDeleteEntry?.executorId) {
    await trackDestructiveAuditAction(role.guild, roleDeleteEntry.executorId, "role-delete", "roles deleted");
  }

  if (role.name !== "Paradox • Core") return;

  const guild = role.guild;
  console.error("[ROLE-PROTECTION] Paradox • Core role was deleted. Checking executor and recovery.");

  // Identify the executor before taking recovery action so explicitly trusted users are exempt.
  await new Promise(resolve => setTimeout(resolve, 1500));
  let executorId = null;
  try {
    const audit = await guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 8 });
    const entry = audit.entries.find(item =>
      item.targetId === role.id &&
      Date.now() - item.createdTimestamp < 20000
    );
    executorId = entry?.executorId ?? null;
  } catch (error) {
    console.error("[ROLE-PROTECTION] Could not identify role deleter:", error);
  }

  if (isAntiNukeTrustedActor(guild, executorId)) {
    console.log("[ROLE-PROTECTION] Trusted executor; skipping protected-role recovery and enforcement:", executorId);
    return;
  }

  let recreatedRole = null;
  try {
    recreatedRole = await guild.roles.create({
      name: role.name,
      color: role.hexColor,
      hoist: role.hoist,
      permissions: role.permissions.bitfield,
      mentionable: role.mentionable,
      reason: "Automatic recovery: protected Paradox • Core role was deleted"
    });
    await recreatedRole.setPosition(Math.min(role.position, guild.roles.highest.position - 1)).catch(error => {
      console.error("[ROLE-PROTECTION] Could not restore the original role position:", error);
    });
    console.log("[ROLE-PROTECTION] Recreated protected role:", recreatedRole.id);
  } catch (error) {
    console.error("[ROLE-PROTECTION] Failed to recreate protected role:", error);
  }

  if (!executorId) {
    console.error("[ROLE-PROTECTION] Could not identify the role deleter; no ban was attempted.");
    return;
  }

  const executor = await guild.members.fetch(executorId).catch(() => null);
  if (!executor) {
    console.error("[ROLE-PROTECTION] Deleter is no longer in the server; cannot ban them.");
    return;
  }
  try {
    await executor.ban({ reason: "Paradox • Core role protection: deleting the protected role" });
    console.log("[ROLE-PROTECTION] Banned role deleter:", executorId);
  } catch (error) {
    console.error("[ROLE-PROTECTION] Could not ban role deleter:", error);
  }
});


// Paradoxplus live member counter: a locked text channel placed above categories.
const MEMBER_COUNTER_GUILD_ID = "1572968551973654528";
let memberCounterSync = Promise.resolve();

async function syncMemberCounter(guild) {
  if (guild.id !== MEMBER_COUNTER_GUILD_ID) return;
  memberCounterSync = memberCounterSync.catch(() => {}).then(async () => {
    const config = getGuildConfig(guild.id);
    let channel = config.memberCounterChannelId
      ? guild.channels.cache.get(config.memberCounterChannelId) ?? await guild.channels.fetch(config.memberCounterChannelId).catch(() => null)
      : null;

    if (channel && channel.type !== ChannelType.GuildText) {
      console.warn("[MemberCounter] Saved counter channel is no longer a text channel; creating a replacement.");
      channel = null;
      config.memberCounterChannelId = null;
    }

    if (!channel) {
      channel = await guild.channels.create({
        name: "✦・members・" + guild.memberCount.toLocaleString(),
        type: ChannelType.GuildText,
        topic: "✦ PARADOXPLUS LIVE COMMUNITY COUNT • Updates automatically",
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads] }
        ],
        reason: "Create the Paradoxplus live member counter"
      });
      config.memberCounterChannelId = channel.id;
      await saveDatabase();
      console.log("[MemberCounter] Created " + channel.name);
    }

    const desiredName = "✦・members・" + guild.memberCount.toLocaleString();
    if (channel.name !== desiredName) await channel.setName(desiredName, "Update live Paradoxplus member count");
    if (channel.parentId) await channel.setParent(null, { lockPermissions: false, reason: "Keep member counter above all categories" });
    await channel.setPosition(0, { reason: "Keep Paradoxplus member counter at the top" });
  });
  return memberCounterSync;
}

// Paradox • Core is a bot-managed security role: only this bot may grant it.
const CORE_ROLE_NAME = "Paradox • Core";
const CORE_ROLE_GUILD_ID = "1572968551973654528";
const coreRoleChecks = new Set();

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (newMember.guild.id !== CORE_ROLE_GUILD_ID) return;
  const addedCoreRoles = newMember.roles.cache.filter(role =>
    role.name === CORE_ROLE_NAME && !oldMember.roles.cache.has(role.id)
  );
  for (const role of addedCoreRoles.values()) {
    const checkKey = newMember.id + ":" + role.id;
    if (coreRoleChecks.has(checkKey)) continue;
    coreRoleChecks.add(checkKey);
    try {
      let executor = null;
      for (let attempt = 0; attempt < 6 && !executor; attempt++) {
        const logs = await newMember.guild.fetchAuditLogs({
          type: AuditLogEvent.MemberRoleUpdate,
          limit: 10
        }).catch(error => {
          console.warn("[CoreRoleGuard] Audit log lookup failed:", error.message);
          return null;
        });
        const entry = logs?.entries.find(item => {
          const addedRoles = item.changes?.find(change => change.key === "$add")?.new;
          return item.target?.id === newMember.id &&
            Date.now() - item.createdTimestamp < 15000 &&
            Array.isArray(addedRoles) &&
            addedRoles.some(addedRole => addedRole.id === role.id);
        });
        if (entry?.executor?.id) executor = entry.executor;
        if (!executor && attempt < 5) await new Promise(resolve => setTimeout(resolve, 700));
      }

      if (executor?.id === client.user.id) {
        console.log("[CoreRoleGuard] Bot-authorized assignment accepted for", newMember.id);
        continue;
      }

      const freshMember = await newMember.guild.members.fetch(newMember.id).catch(() => null);
      if (freshMember?.roles.cache.has(role.id)) {
        await freshMember.roles.remove(role.id, executor
          ? "Paradox • Core is restricted to bot-only assignment; unauthorized grant reverted."
          : "Paradox • Core is restricted to bot-only assignment; grant actor could not be verified.");
      }
      console.warn("[CoreRoleGuard] Reverted unauthorized Paradox • Core grant.", {
        memberId: newMember.id,
        executorId: executor?.id ?? null,
        roleId: role.id
      });
    } catch (error) {
      console.error("[CoreRoleGuard] Could not revert unauthorized role grant:", error);
    } finally {
      coreRoleChecks.delete(checkKey);
    }
  }
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const config = getGuildConfig(newMember.guild.id);
  if (!Array.isArray(config.permanentMutes)) config.permanentMutes = [];
  const record = config.permanentMutes.find(item => item.memberId === newMember.id);
  if (!record || record.unmuting) return;
  if (isAntiNukeWhitelisted(newMember.guild.id, newMember.id) || isBotOwner(newMember.id)) return;
  // Only renew when an existing timeout is actually cleared. Role changes
  // during the initial mute setup must not start a second timeout operation.
  const hadTimeout = Boolean(oldMember.communicationDisabledUntilTimestamp);
  const hasTimeout = Boolean(newMember.communicationDisabledUntilTimestamp);
  if (!hadTimeout || hasTimeout) return;
  if (!newMember.moderatable) { console.warn("[PermanentMute] Cannot renew timeout for", newMember.id, "because role hierarchy or permissions prevent it."); return; }
  try { await newMember.timeout(28 * 24 * 60 * 60 * 1000, "Permanent mute auto-renewal: " + (record.reason || "No reason provided")); console.log("[PermanentMute] Renewed permanent mute for", newMember.id); }
  catch (error) { console.error("[PermanentMute] Failed to renew mute for", newMember.id, error); }
});
client.on(Events.GuildMemberAdd, async member => {
  trackAntiNukeJoin(member);
  if (await inspectNewBot(member)) return;
  const config = getGuildConfig(member.guild.id);
  const autobanEntry = config.autobanList.find(entry => entry && entry.userId === member.id);
  if (autobanEntry) {
    try {
      await member.ban({ reason: "Paradox • Core autoban: " + (autobanEntry.reason || "User is on the owner-managed autoban list") });
      console.log("[AutoBan] Re-banned listed user on join:", member.id);
    } catch (error) {
      console.error("[AutoBan] Failed to re-ban listed user:", member.id, error);
    }
    return;
  }
  // Apply configured autoroles to new human members. Invalid/unmanageable roles are skipped safely.
  const autoroleIds = [...new Set(config.autoroleIds.filter(id => typeof id === "string"))];
  if (autoroleIds.length) {
    const me = member.guild.members.me ?? await member.guild.members.fetchMe().catch(() => null);
    for (const roleId of autoroleIds) {
      const role = member.guild.roles.cache.get(roleId) ?? await member.guild.roles.fetch(roleId).catch(() => null);
      if (!role || role.managed || !me?.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= me.roles.highest.position) {
        console.warn("[AutoRole] Skipping unavailable or unmanageable role", roleId, "in", member.guild.id);
        continue;
      }
      try {
        await member.roles.add(role, "Configured automatic join role");
        console.log("[AutoRole] Assigned", role.name, "to", member.user.tag);
      } catch (error) {
        console.error("[AutoRole] Failed to assign", roleId, "to", member.id, error);
      }
    }
  }
  void saveDatabase().catch(error => console.error("[AutoRole] Config save failed:", error));

  // Ghost-ping each newly joined member in the configured Paradoxplus channel.
  // Explicitly allow only this member mention; delete the ping immediately after sending.
  const autoGhostChannel = member.guild.channels.cache.get("1572968553617817760")
    ?? await member.guild.channels.fetch("1572968553617817760").catch(() => null);
  if (autoGhostChannel?.isTextBased()) {
    try {
      const ghostPing = await autoGhostChannel.send({
        content: "<@" + member.id + ">",
        allowedMentions: { users: [member.id], parse: [] }
      });
      await ghostPing.delete();
      console.log("[AutoGhost] Sent and deleted join ping for", member.id);
    } catch (error) {
      console.error("[AutoGhost] Failed to send/delete join ping for", member.id, error);
    }
  }
  pulseDay(config).joins++;
  trimPulse(config);
  void saveDatabase().catch(error => console.error("Pulse join save failed:", error));
  void syncMemberCounter(member.guild).catch(error => console.error("[MemberCounter] Join sync failed:", error));
  if (!config.welcomeChannelId) return;
  const channel = member.guild.channels.cache.get(config.welcomeChannelId)
    ?? await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const bannerUrl = WELCOME_BANNER_URL;
  const count = member.guild.memberCount;
  const embed = new EmbedBuilder()
    .setColor(0x7c5cff)
    .setAuthor({ name: "Exile AS", iconURL: client.user.displayAvatarURL() })

    .setDescription(buildWelcomeDescription(member.guild, member))
    .setThumbnail(member.user.displayAvatarURL({ extension: "png", size: 256 }))
    .setImage(bannerUrl)
    .setFooter({ text: "Paradox • Core  •  Member #" + count })
    .setTimestamp();
  await channel.send({
    embeds: [embed],
    allowedMentions: { users: [member.id], parse: [] }
  }).catch(error => console.error("Welcome message failed:", error));
});
function getOrdinalSuffix(number) {
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (number % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}
client.on(Events.GuildMemberRemove, member => {
  const config=getGuildConfig(member.guild.id); pulseDay(config).leaves++; trimPulse(config);
  void saveDatabase().catch(error=>console.error("Pulse leave save failed:",error));
  void syncMemberCounter(member.guild).catch(error => console.error("[MemberCounter] Leave sync failed:", error));
});

const OWNER_VOICE_GUILD_ID = "1572968551973654528";
const OWNER_VOICE_CHANNEL_ID = "";
let ownerVoiceRetryTimer = null;
let ownerVoiceConnecting = false;

async function connectOwnerVoice(readyClient) {
  if (!OWNER_VOICE_CHANNEL_ID) return;
  if (ownerVoiceConnecting) return;
  ownerVoiceConnecting = true;
  try {
    const guild = await readyClient.guilds.fetch(OWNER_VOICE_GUILD_ID);
    const channel = await guild.channels.fetch(OWNER_VOICE_CHANNEL_ID);
    if (!channel || ![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
      throw new Error("Configured owner voice channel was not found or is not a voice channel.");
    }
    const existing = getVoiceConnection(guild.id);
    if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
      if (existing.joinConfig.channelId === channel.id) return;
      existing.destroy();
    }
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false
    });
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 7000),
          entersState(connection, VoiceConnectionStatus.Connecting, 7000)
        ]);
      } catch {
        connection.destroy();
        if (ownerVoiceRetryTimer) clearTimeout(ownerVoiceRetryTimer);
        ownerVoiceRetryTimer = setTimeout(() => {
          ownerVoiceRetryTimer = null;
          void connectOwnerVoice(readyClient);
        }, 5000);
      }
    });
    connection.on("error", error => console.error("Owner VC connection error:", error));
    console.log("Joined owner voice channel: " + channel.name);
  } catch (error) {
    console.error("Could not join owner voice channel:", error);
    if (ownerVoiceRetryTimer) clearTimeout(ownerVoiceRetryTimer);
    ownerVoiceRetryTimer = setTimeout(() => {
      ownerVoiceRetryTimer = null;
      void connectOwnerVoice(readyClient);
    }, 15000);
  } finally {
    ownerVoiceConnecting = false;
  }
}

const STICKER_BACKUP_ROOT = path.join(DATA_DIR, "sticker-backups");

function stickerFileExtension(sticker) {
  const format = String(sticker.format);
  if (format === "1" || format.toLowerCase() === "png") return "png";
  if (format === "2" || format.toLowerCase() === "apng") return "apng";
  if (format === "3" || format.toLowerCase() === "lottie") return "json";
  if (format === "4" || format.toLowerCase() === "gif") return "gif";
  return "bin";
}

async function backupGuildStickers(guild, reason = "scheduled") {
  if (!guild || guild.id !== ANTI_NUKE_GUILD_ID) return 0;
  const stickers = await guild.stickers.fetch();
  const backupDir = path.join(STICKER_BACKUP_ROOT, guild.id);
  await fs.mkdir(backupDir, { recursive: true });
  const records = [];
  for (const sticker of stickers.values()) {
    try {
      const extension = stickerFileExtension(sticker);
      const filePath = path.join(backupDir, sticker.id + "." + extension);
      const response = await fetch(sticker.url);
      if (!response.ok) throw new Error("CDN returned HTTP " + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(filePath, bytes);
      records.push({
        id: sticker.id, name: sticker.name, description: sticker.description ?? null,
        tags: sticker.tags || "✨", format: sticker.format, available: sticker.available,
        file: sticker.id + "." + extension, backedUpAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("[StickerBackup] Could not back up sticker:", sticker.id, error);
      await notifyAntiNukeOwner(guild, "Could not back up sticker " + sticker.name + " (" + sticker.id + "). " + String(error?.message || error).slice(0, 200));
    }
  }
  const manifestPath = path.join(backupDir, "manifest.json");
  const tempPath = manifestPath + ".tmp";
  await fs.writeFile(tempPath, JSON.stringify({
    schemaVersion: 1, guildId: guild.id, reason, backedUpAt: new Date().toISOString(), stickers: records
  }, null, 2), "utf8");
  await fs.rename(tempPath, manifestPath);
  console.log("[StickerBackup] Saved " + records.length + " sticker asset(s) for " + guild.name + ".");
  return records.length;
}

async function backupGuildEmojis(guild, reason = "scheduled") {
  if (!guild || guild.id !== ANTI_NUKE_GUILD_ID) return 0;
  const emojis = await guild.emojis.fetch();
  const backupDir = path.join(DATA_DIR, "emoji-backups", guild.id);
  await fs.mkdir(backupDir, { recursive: true });
  const records = [];
  for (const emoji of emojis.values()) {
    try {
      const extension = emoji.animated ? "gif" : "png";
      const fileName = emoji.id + "." + extension;
      const response = await fetch(emoji.imageURL({ extension: emoji.animated ? "gif" : "png", forceStatic: false }));
      if (!response.ok) throw new Error("CDN returned HTTP " + response.status);
      await fs.writeFile(path.join(backupDir, fileName), Buffer.from(await response.arrayBuffer()));
      records.push({
        id: emoji.id, name: emoji.name, animated: emoji.animated,
        roles: [...emoji.roles.cache.keys()], file: fileName,
        backedUpAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("[EmojiBackup] Could not back up emoji:", emoji.id, error);
      await notifyAntiNukeOwner(guild, "Could not back up emoji " + (emoji.name || emoji.id) + ". " + String(error?.message || error).slice(0, 200));
    }
  }
  const manifestPath = path.join(backupDir, "manifest.json");
  const tempPath = manifestPath + ".tmp";
  await fs.writeFile(tempPath, JSON.stringify({
    schemaVersion: 1, guildId: guild.id, reason,
    backedUpAt: new Date().toISOString(), emojis: records
  }, null, 2), "utf8");
  await fs.rename(tempPath, manifestPath);
  console.log("[EmojiBackup] Saved " + records.length + " custom emoji asset(s) for " + guild.name + ".");
  return records.length;
}

async function restoreDeletedGuildEmoji(emoji) {
  const guild = emoji.guild;
  if (!guild || guild.id !== ANTI_NUKE_GUILD_ID) return;
  let entry = null;
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.EmojiDelete, limit: 10 });
    entry = [...logs.entries.values()].find(item =>
      item.target?.id === emoji.id &&
      Date.now() - item.createdTimestamp >= 0 &&
      Date.now() - item.createdTimestamp <= 20000
    ) || null;
  } catch (error) {
    console.error("[EmojiBackup] Emoji-delete audit lookup failed:", error);
    await notifyAntiNukeOwner(guild, "Custom emoji deletion detected for " + (emoji.name || emoji.id) + ", but audit-log lookup failed. Automatic restoration was paused.");
    return;
  }
  const executorId = entry?.executorId ?? null;
  if (!executorId) {
    await notifyAntiNukeOwner(guild, "Custom emoji " + (emoji.name || emoji.id) + " was deleted, but its executor could not be identified. Review the audit log.");
    return;
  }
  if (isAntiNukeTrustedActor(guild, executorId)) return;
  const backupDir = path.join(DATA_DIR, "emoji-backups", guild.id);
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(backupDir, "manifest.json"), "utf8"));
  } catch (error) {
    await notifyAntiNukeOwner(guild, "Unauthorized deletion of custom emoji " + (emoji.name || emoji.id) + " by <@" + executorId + "> was detected, but no readable emoji backup exists.");
    await punishAntiNukeExecutor(guild, executorId, "deleting custom emoji " + (emoji.name || emoji.id));
    return;
  }
  const saved = manifest.emojis?.find(item => item.id === emoji.id);
  if (!saved?.file) {
    await notifyAntiNukeOwner(guild, "Unauthorized deletion of custom emoji " + (emoji.name || emoji.id) + " by <@" + executorId + "> was detected, but it was not present in the latest backup.");
    await punishAntiNukeExecutor(guild, executorId, "deleting custom emoji " + (emoji.name || emoji.id));
    return;
  }
  try {
    const file = await fs.readFile(path.join(backupDir, path.basename(saved.file)));
    const restored = await guild.emojis.create({
      attachment: file,
      name: String(saved.name || emoji.name || "restored_emoji").slice(0, 32),
      reason: "Paradox • Core anti-nuke: restore unauthorized deleted custom emoji"
    });
    if (saved.roles?.length) {
      const validRoles = saved.roles.filter(roleId => guild.roles.cache.has(roleId));
      if (validRoles.length) await restored.roles.set(validRoles, "Restore saved custom emoji role restrictions").catch(error =>
        console.error("[EmojiBackup] Could not restore emoji role restrictions:", error));
    }
    await notifyAntiNukeOwner(guild, "Restored custom emoji " + (saved.name || emoji.name) + " as " + restored.id + ". Original animation: " + (saved.animated ? "GIF" : "static") + ". Deleter: <@" + executorId + ">.");
    await punishAntiNukeExecutor(guild, executorId, "deleting custom emoji " + (saved.name || emoji.name));
  } catch (error) {
    console.error("[EmojiBackup] Emoji restoration failed:", error);
    await notifyAntiNukeOwner(guild, "Detected unauthorized deletion of custom emoji " + (saved.name || emoji.name) + " by <@" + executorId + ">, but restoration failed: " + String(error?.message || error).slice(0, 250));
    await punishAntiNukeExecutor(guild, executorId, "deleting custom emoji " + (saved.name || emoji.name));
  }
}

client.on(Events.GuildEmojiCreate, emoji => {
  if (emoji.guild?.id === ANTI_NUKE_GUILD_ID) {
    void backupGuildEmojis(emoji.guild, "emoji-created").catch(error => console.error("[EmojiBackup] Create-event backup failed:", error));
  }
});
client.on(Events.GuildEmojiUpdate, (_oldEmoji, newEmoji) => {
  if (newEmoji.guild?.id === ANTI_NUKE_GUILD_ID) {
    void backupGuildEmojis(newEmoji.guild, "emoji-updated").catch(error => console.error("[EmojiBackup] Update-event backup failed:", error));
  }
});
client.on(Events.GuildEmojiDelete, emoji => {
  void restoreDeletedGuildEmoji(emoji).catch(error => console.error("[EmojiBackup] Delete-event recovery failed:", error));
});

async function restoreDeletedGuildSticker(sticker) {
  const guild = sticker.guild;
  if (!guild || guild.id !== ANTI_NUKE_GUILD_ID) return;
  let entry = null;
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.StickerDelete, limit: 10 });
    entry = [...logs.entries.values()].find(item =>
      item.target?.id === sticker.id &&
      Date.now() - item.createdTimestamp >= 0 &&
      Date.now() - item.createdTimestamp <= 20000
    ) || null;
  } catch (error) {
    console.error("[StickerBackup] Sticker-delete audit lookup failed:", error);
    await notifyAntiNukeOwner(guild, "Sticker deletion detected for " + sticker.name + ", but audit-log lookup failed. Automatic restoration was paused to avoid overriding a legitimate owner action.");
    return;
  }
  const executorId = entry?.executorId ?? null;
  if (!executorId) {
    await notifyAntiNukeOwner(guild, "Sticker " + sticker.name + " was deleted, but its executor could not be identified. Automatic restoration was paused; review the audit log.");
    return;
  }
  if (isAntiNukeTrustedActor(guild, executorId)) return;

  const backupDir = path.join(STICKER_BACKUP_ROOT, guild.id);
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(backupDir, "manifest.json"), "utf8"));
  } catch (error) {
    await notifyAntiNukeOwner(guild, "Unauthorized deletion of sticker " + sticker.name + " by <@" + executorId + "> was detected, but no readable sticker manifest exists. Cannot restore it.");
    await punishAntiNukeExecutor(guild, executorId, "deleting sticker " + sticker.name);
    return;
  }
  const saved = manifest.stickers?.find(item => item.id === sticker.id);
  if (!saved?.file) {
    await notifyAntiNukeOwner(guild, "Unauthorized deletion of sticker " + sticker.name + " by <@" + executorId + "> was detected, but that sticker was not in the latest backup.");
    await punishAntiNukeExecutor(guild, executorId, "deleting sticker " + sticker.name);
    return;
  }
  try {
    const filePath = path.join(backupDir, path.basename(saved.file));
    const file = await fs.readFile(filePath);
    const restored = await guild.stickers.create({
      file: { attachment: file, name: saved.file },
      name: String(saved.name || sticker.name).slice(0, 30),
      description: saved.description || undefined,
      tags: String(saved.tags || "✨").slice(0, 200),
      reason: "Paradox • Core anti-nuke: restore unauthorized deleted sticker"
    });
    await notifyAntiNukeOwner(guild, "Restored deleted sticker " + saved.name + " as " + restored.id + ". Deleter: <@" + executorId + ">.");
    await punishAntiNukeExecutor(guild, executorId, "deleting sticker " + saved.name);
  } catch (error) {
    console.error("[StickerBackup] Sticker restoration failed:", error);
    await notifyAntiNukeOwner(guild, "Detected unauthorized deletion of sticker " + saved.name + " by <@" + executorId + ">, but restoration failed: " + String(error?.message || error).slice(0, 250));
    await punishAntiNukeExecutor(guild, executorId, "deleting sticker " + saved.name);
  }
}

client.on(Events.GuildStickerCreate, sticker => {
  if (sticker.guild?.id === ANTI_NUKE_GUILD_ID) {
    void backupGuildStickers(sticker.guild, "sticker-created").catch(error => console.error("[StickerBackup] Create-event backup failed:", error));
  }
});
client.on(Events.GuildStickerUpdate, (_oldSticker, newSticker) => {
  if (newSticker.guild?.id === ANTI_NUKE_GUILD_ID) {
    void backupGuildStickers(newSticker.guild, "sticker-updated").catch(error => console.error("[StickerBackup] Update-event backup failed:", error));
  }
});
client.on(Events.GuildStickerDelete, sticker => {
  void restoreDeletedGuildSticker(sticker).catch(error => console.error("[StickerBackup] Delete-event recovery failed:", error));
});

async function createGuildChannelBackup(guild, reason = "hourly") {
  const channels = await guild.channels.fetch();
  if (guild.id === ANTI_NUKE_GUILD_ID) {
    await backupGuildStickers(guild, reason).catch(error => {
      console.error("[StickerBackup] Scheduled sticker backup failed:", error);
      void notifyAntiNukeOwner(guild, "Sticker backup failed: " + String(error?.message || error).slice(0, 250));
    });
    await backupGuildEmojis(guild, reason).catch(error => {
      console.error("[EmojiBackup] Scheduled emoji backup failed:", error);
      void notifyAntiNukeOwner(guild, "Custom emoji/GIF backup failed: " + String(error?.message || error).slice(0, 250));
    });
  }
  const snapshot = {
    schemaVersion: 1,
    guildId: guild.id,
    guildName: guild.name,
    createdAt: new Date().toISOString(),
    reason,
    channels: [...channels.values()].filter(channel => channel && typeof channel.id === "string").map(channel => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId ?? null,
      position: channel.position ?? 0,
      topic: channel.topic ?? null,
      nsfw: channel.nsfw ?? false,
      rateLimitPerUser: channel.rateLimitPerUser ?? 0,
      bitrate: channel.bitrate ?? null,
      userLimit: channel.userLimit ?? null,
      rtcRegion: channel.rtcRegion ?? null,
      videoQualityMode: channel.videoQualityMode ?? null,
      defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration ?? null,
      defaultThreadRateLimitPerUser: channel.defaultThreadRateLimitPerUser ?? null,
      permissionOverwrites: channel.permissionOverwrites?.cache?.filter(overwrite => overwrite && typeof overwrite.id === "string").map(overwrite => ({
        id: overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow.bitfield.toString(),
        deny: overwrite.deny.bitfield.toString()
      })) ?? []
    }))
  };

  const backupDir = path.join(DATA_DIR, "channel-backups", guild.id);
  await fs.mkdir(backupDir, { recursive: true });
  // Keep user-provided reasons in the snapshot, but never let them alter the filesystem path.
  const safeReason = String(reason).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "backup";
  const filename = `${Date.now()}-${safeReason}.json`;
  const finalPath = path.join(backupDir, filename);
  const tempPath = `${finalPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(snapshot), "utf8");
  await fs.rename(tempPath, finalPath);

  // Permanent retention: do not automatically delete older hourly snapshots.
  // Keep this directory on the persistent /app/data volume and monitor its storage usage.
  const files = (await fs.readdir(backupDir)).filter(file => file.endsWith(".json"));
  console.log(`[ChannelBackup] Saved ${snapshot.channels.length} channels for ${guild.name} (${reason}); ${files.length} retained snapshots.`);
  return snapshot.channels.length;
}

let channelBackupInterval = null;
let channelBackupRunning = false;

async function runHourlyChannelBackups(clientInstance, reason = "hourly") {
  if (channelBackupRunning) return;
  channelBackupRunning = true;
  try {
    for (const guild of clientInstance.guilds.cache.values()) {
      await createGuildChannelBackup(guild, reason)
        .catch(error => console.error(`[ChannelBackup] Failed for ${guild.id}:`, error));
    }
  } finally {
    channelBackupRunning = false;
  }
}

function startHourlyChannelBackups(clientInstance) {
  if (channelBackupInterval) clearInterval(channelBackupInterval);
  void runHourlyChannelBackups(clientInstance, "startup");
  channelBackupInterval = setInterval(() => {
    void runHourlyChannelBackups(clientInstance, "hourly");
  }, 60 * 60 * 1000);
}

client.once(Events.ClientReady, async readyClient => {
  const nicknameGuild = await readyClient.guilds.fetch(MEMBER_COUNTER_GUILD_ID).catch(() => null);
  if (nicknameGuild) {
    const botMember = await nicknameGuild.members.fetchMe().catch(() => null);
    if (botMember && botMember.nickname !== "Exile • Core") {
      await botMember.setNickname("Exile • Core", "Set official Exile • Core bot nickname")
        .catch(error => console.error("[Nickname] Could not set bot nickname:", error));
    }
  }
  const counterGuild = await readyClient.guilds.fetch(MEMBER_COUNTER_GUILD_ID).catch(() => null);
  if (counterGuild) await syncMemberCounter(counterGuild).catch(error => console.error("[MemberCounter] Startup sync failed:", error));
  const rankGuild = await readyClient.guilds.fetch("1572968551973654528").catch(() => null);
  if (rankGuild) await syncRankRoles(rankGuild).catch(error => console.error("Initial rank-role auto-sync failed:", error));
  if (rankGuild) {
    const securityMember = await rankGuild.members.fetchMe().catch(() => null);
    const required = [
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageWebhooks
    ];
    const missing = required.filter(permission => !securityMember?.permissions.has(permission));
    if (missing.length) {
      const missingNames = missing.map(permission => Object.entries(PermissionFlagsBits).find(([, value]) => value === permission)?.[0] || String(permission));
      console.error("[ANTI-NUKE] CRITICAL: missing required permissions:", missingNames.join(", "));
      await notifyAntiNukeOwner(rankGuild, "CRITICAL: the bot is missing required permissions: " + missingNames.join(", ") + ". Some anti-nuke rollback and enforcement actions will fail. Fix the bot role permissions and hierarchy.");
    } else {
      console.log("[ANTI-NUKE] Required audit-log, ban, role, channel, and webhook permissions verified at startup.");
    }
  }
  if (rankGuild) {
    const formerTrustedOwner = await rankGuild.members.fetch("1531335321537482903").catch(() => null);
    const coreRole = rankGuild.roles.cache.find(role => role.name === CORE_ROLE_NAME);
    if (formerTrustedOwner && coreRole && formerTrustedOwner.roles.cache.has(coreRole.id)) {
      await formerTrustedOwner.roles.remove(coreRole, "Remove Paradox • Core access after trusted-owner review")
        .then(() => console.log("[CoreRole] Removed Paradox • Core from former trusted owner."))
        .catch(error => console.error("[CoreRole] Could not remove Core role from former trusted owner:", error));
    }
  }
  console.log(`Online as ${readyClient.user.tag}`);
  console.log(`Serving ${readyClient.guilds.cache.size} server(s).`);
  startHourlyChannelBackups(readyClient);
  startModrinthTextureDropper();
  console.log("[MessageArchive] Permanent retention enabled; archived messages are not automatically deleted.");
  void connectOwnerVoice(readyClient);
});


function getTicketData(channel) {
  const match = channel?.topic?.match(/^paradoxplus-ticket:(\d+)(?:\|(.*))?$/);
  if (!match) return null;
  const data = { ownerId: match[1], claimedBy: null, priority: "Normal", status: "open" };
  for (const item of (match[2] || "").split("|")) {
    const [key, ...parts] = item.split("=");
    const value = parts.join("=");
    if (key === "claim" && /^\d+$/.test(value)) data.claimedBy = value;
    if (key === "priority" && ["Low", "Normal", "High", "Urgent"].includes(value)) data.priority = value;
    if (key === "status" && ["open", "closed"].includes(value)) data.status = value;
  }
  return data;
}

async function setTicketData(channel, patch) {
  const data = { ...(getTicketData(channel) || {}), ...patch };
  if (!data.ownerId) throw new Error("Ticket metadata is missing.");
  const parts = ["paradoxplus-ticket:" + data.ownerId];
  if (data.claimedBy) parts.push("claim=" + data.claimedBy);
  parts.push("priority=" + (data.priority || "Normal"));
  parts.push("status=" + (data.status || "open"));
  await channel.setTopic(parts.join("|"));
  return data;
}

function isTicketStaff(interaction, config, member) {
  return isBotOwner(interaction.user.id) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
    Boolean(config.ticketStaffRoleId && member?.roles.cache.has(config.ticketStaffRoleId));
}

function buildTicketPanel(guild, botUser) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("px_ticket_create")
    .setPlaceholder("🎫  Select a ticket category")
    .addOptions(
      { label: "Team Application", description: "Apply to join the team", value: "Team Application", emoji: "🛡️" },
      { label: "General Support", description: "Get help from the support team", value: "General Support", emoji: "🎫" },
      { label: "Ally Request", description: "Request an alliance", value: "Ally", emoji: "🤝" },
      { label: "Merge Request", description: "Request a clan merge", value: "Merge", emoji: "🔗" },
      { label: "TVT", description: "Arrange a clan versus clan match", value: "TVT", emoji: "⚔️" },
      { label: "Paid Promotion", description: "Enquire about paid promotions", value: "Paid Promotion", emoji: "📢" }
    );
  const panel = new EmbedBuilder()
    .setColor(0x6d5dfc)
    .setTitle("🎟️ Exile AS | Ticket Support")
    .setDescription(
      "## Exile AS | Ticket Support\n\n" +
      "**Types Of Support We Provide**\n\n" +
      "> - Team Application\n> - General Support\n> - Paid Promotion\n\n" +
      "**Requirements for __Team Application:__**\n\n" +
      "> • Must be LT4+ in one of these gamemodes: Nethpot / SMP / Crystal\n" +
      "> • Must be active in both VC and Chat\n" +
      "> • Must act mature and have common sense\n\n" +
      "**Types of help we can provide in __General Support:__**\n\n" +
      "> - Ally Request\n> - Merge Request\n> - TVT (Clan V/s Clan)\n> - Technical Help\n> - Staff Report\n> - Giveaways Rewards\n\n" +
      "**NOTE:** Create a ticket only for one of the support types listed above."
    )
    .setThumbnail(guild.iconURL({ size: 256 }) || botUser.displayAvatarURL())
    .setImage(EXILE_AS_BANNER_URL)
    .setFooter({ text: "Powered By Exile • Core" });
  return { embeds: [panel], components: [new ActionRowBuilder().addComponents(menu)] };
}

async function buildTicketTranscript(channel) {
  const collected = [];
  let before;
  for (let page = 0; page < 10; page++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    collected.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = [
    "EXILE AS 1.9+ | TICKET TRANSCRIPT",
    "Server: " + channel.guild.name,
    "Channel: #" + channel.name,
    "Generated: " + new Date().toISOString(),
    "Messages included: " + collected.length,
    "----------------------------------------"
  ];
  for (const message of collected) {
    const author = message.author?.tag || "Unknown user";
    const body = message.content || "";
    const attachments = [...message.attachments.values()].map(file => file.url);
    const embeds = message.embeds.map(embed => embed.title || embed.description || "[Embed]").filter(Boolean);
    lines.push("[" + message.createdAt.toISOString() + "] " + author + ": " + body);
    for (const url of attachments) lines.push("  Attachment: " + url);
    for (const embed of embeds) lines.push("  Embed: " + String(embed).replace(/\s+/g, " ").slice(0, 500));
  }
  if (collected.length >= 1000) lines.push("", "[Transcript limit reached: latest 1,000 messages included.]");
  return lines.join("\n");
}

async function archiveTicketTranscript(channel, closedBy, reason) {
  const transcript = await buildTicketTranscript(channel);
  const guild = channel.guild;
  const config = getGuildConfig(guild.id);
  const botId = channel.client.user.id;
  const supportCategoryId = "1572968553924141165";
  const supportCategory = guild.channels.cache.get(supportCategoryId)
    ?? await guild.channels.fetch(supportCategoryId).catch(() => null);
  if (!supportCategory || supportCategory.type !== ChannelType.GuildCategory) {
    throw new Error("The configured support area is missing or is not a category.");
  }
  let transcriptChannel = guild.channels.cache.find(ch => ch.type === ChannelType.GuildText && ch.name === "ticket-transcripts");
  if (!transcriptChannel) {
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }
    ];
    if (config.ticketStaffRoleId) overwrites.push({
      id: config.ticketStaffRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
    });
    transcriptChannel = await guild.channels.create({
      name: "ticket-transcripts",
      type: ChannelType.GuildText,
      topic: "Exile AS 1.9+ automatically archived ticket transcripts",
      parent: supportCategory.id,
      permissionOverwrites: overwrites,
      reason: "Create private ticket transcript archive"
    });
  } else {
    if (transcriptChannel.parentId !== supportCategory.id) {
      await transcriptChannel.setParent(supportCategory.id, {
        lockPermissions: false,
        reason: "Keep ticket transcripts inside the Exile AS support area"
      });
    }
    await transcriptChannel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false }).catch(() => null);
    await transcriptChannel.permissionOverwrites.edit(botId, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true
    }).catch(() => null);
    if (config.ticketStaffRoleId) await transcriptChannel.permissionOverwrites.edit(config.ticketStaffRoleId, {
      ViewChannel: true, ReadMessageHistory: true
    }).catch(() => null);
  }
  const ticketData = getTicketData(channel);
  const attachment = new AttachmentBuilder(Buffer.from(transcript, "utf8"), {
    name: "exile-as-" + channel.id + "-transcript.txt"
  });
  const embed = new EmbedBuilder()
    .setColor(0x6d5dfc)
    .setTitle("📄 Ticket Transcript Archived")
    .addFields(
      { name: "Ticket", value: "`" + channel.name + "`", inline: true },
      { name: "Ticket ID", value: channel.id, inline: true },
      { name: "Closed by", value: "<@" + closedBy + ">", inline: true },
      { name: "Owner", value: ticketData?.ownerId ? "<@" + ticketData.ownerId + ">" : "Unknown", inline: true },
      { name: "Reason", value: reason ? reason.slice(0, 900) : "No reason provided", inline: false }
    )
    .setFooter({ text: "Exile AS 1.9+ • Automatic Ticket Archive" })
    .setTimestamp();
  await transcriptChannel.send({ embeds: [embed], files: [attachment], allowedMentions: { users: [closedBy], parse: [] } });
  return transcriptChannel;
}

function giveawayDurationMs(value) {
  const match = String(value || "").trim().match(/^(\d+)(m|h|d)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = { m: 60000, h: 3600000, d: 86400000 }[match[2].toLowerCase()];
  const duration = amount * multiplier;
  return Number.isSafeInteger(duration) && duration >= 60000 && duration <= 30 * 86400000 ? duration : null;
}

function giveawayEmbed(giveaway) {
  const ended = Boolean(giveaway.endedAt);
  const winners = Array.isArray(giveaway.winners) ? giveaway.winners : [];
  return new EmbedBuilder()
    .setColor(ended ? 0x747f8d : 0x7c5cff)
    .setAuthor({ name: "PARADOXPLUS • GIVEAWAY", iconURL: client.user.displayAvatarURL() })
    .setTitle((ended ? "🏁 " : "🎉 ") + giveaway.prize)
    .setDescription(
      (giveaway.description ? giveaway.description + "\n\n" : "") +
      (ended ? "**Giveaway ended**" : "**Press the button below to enter!**") +
      "\n\n**Hosted by:** <@" + giveaway.hostId + ">" +
      "\n**Winners:** " + giveaway.winnerCount +
      "\n**Entries:** " + (giveaway.entries?.length || 0) +
      (ended ? "\n**Winner(s):** " + (winners.length ? winners.map(id => "<@" + id + ">").join(", ") : "No valid entries") : "\n**Ends:** <t:" + Math.floor(giveaway.endsAt / 1000) + ":R>") +
      "\n\n**Giveaway ID:** " + giveaway.messageId
    )
    .setFooter({ text: "Paradoxplus Giveaway Manager • Fair random draw" })
    .setTimestamp(new Date(giveaway.createdAt));
}

function giveawayEntryRow(messageId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("px_giveaway_enter:" + messageId)
      .setLabel(disabled ? "Giveaway Ended" : "Enter Giveaway")
      .setEmoji(disabled ? "🏁" : "🎉")
      .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

async function finishGiveaway(guild, giveaway, reroll = false) {
  const channel = guild.channels.cache.get(giveaway.channelId) ?? await guild.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) throw new Error("Giveaway channel is unavailable.");
  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (!message) throw new Error("Giveaway announcement message is unavailable.");
  const entries = [...new Set((giveaway.entries || []).filter(id => id && id !== client.user.id))];
  const excluded = new Set(reroll ? [...(giveaway.previousWinners || []), ...(giveaway.winners || [])] : []);
  const pool = entries.filter(id => !excluded.has(id));
  if (!reroll) giveaway.previousWinners = [];
  else giveaway.previousWinners = [...new Set([...(giveaway.previousWinners || []), ...(giveaway.winners || [])])];
  const winners = [];
  while (pool.length && winners.length < giveaway.winnerCount) {
    const index = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(index, 1)[0]);
  }
  giveaway.winners = winners;
  if (!reroll) giveaway.endedAt = Date.now();
  await saveDatabase();
  await message.edit({
    embeds: [giveawayEmbed(giveaway)],
    components: [giveawayEntryRow(giveaway.messageId, !reroll || Boolean(giveaway.endedAt))]
  });
  const announcement = winners.length
    ? (reroll ? "🔄 **Giveaway rerolled!** " : "🎉 **Giveaway ended!** ") + winners.map(id => "<@" + id + ">").join(", ") + " won **" + giveaway.prize + "**!"
    : (reroll ? "No new eligible entrants were available for a reroll." : "The giveaway ended with no valid entries.");
  await channel.send({ content: announcement, allowedMentions: { users: winners, parse: [] } });
  return winners;
}

let giveawayExpiryRunning = false;
setInterval(async () => {
  if (giveawayExpiryRunning || !client.isReady()) return;
  giveawayExpiryRunning = true;
  try {
    for (const guild of client.guilds.cache.values()) {
      const config = getGuildConfig(guild.id);
      const due = config.giveaways.filter(item => !item.endedAt && Number(item.endsAt) <= Date.now());
      for (const giveaway of due) {
        try {
          await finishGiveaway(guild, giveaway, false);
          console.log("[Giveaway] Automatically ended " + giveaway.messageId + " in " + guild.name);
        } catch (error) {
          console.error("[Giveaway] Automatic ending failed for " + giveaway.messageId + ":", error);
        }
      }
    }
  } finally {
    giveawayExpiryRunning = false;
  }
}, 30000);


// Modrinth texture-pack dropper. Uses the public API; only explicitly permissive licences are eligible for file re-upload.
const MODRINTH_USER_AGENT = "Paradoxplus/1.0.0 (Discord texture-pack dropper)";
const MODRINTH_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MODRINTH_REDISTRIBUTABLE_LICENSES = new Set([
  "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0",
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause"
]);
let tpackDropperRunning = false;

async function readResponseWithLimit(response, maxBytes) {
  if (!response.body) throw new Error("The download response had no body.");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => null);
        throw new Error("Texture pack exceeds the safe Discord upload size.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function runModrinthTextureDropper() {
  if (tpackDropperRunning || !client.isReady()) return;
  tpackDropperRunning = true;
  try {
    for (const guild of client.guilds.cache.values()) {
      const config = getGuildConfig(guild.id);
      const dropper = config.tpackDropper;
      if (!dropper?.enabled || !dropper.channelId) continue;

      const channel = await guild.channels.fetch(dropper.channelId).catch(() => null);
      if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
        dropper.enabled = false;
        await saveDatabase();
        console.warn("[Modrinth] Disabled dropper because its channel is missing or not a text channel:", guild.id);
        continue;
      }

      const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
      const requiredPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles
      ];
      if (!me || !channel.permissionsFor(me)?.has(requiredPermissions)) {
        console.warn("[Modrinth] Missing channel permissions (including Attach Files); skipping this cycle in", guild.id);
        continue;
      }

      try {
        const allowedLicenses = [...MODRINTH_REDISTRIBUTABLE_LICENSES];
        const facets = [
          ["project_type:resourcepack"],
          allowedLicenses.map(license => "license:" + license)
        ];
        const params = new URLSearchParams({
          facets: JSON.stringify(facets),
          limit: "100",
          index: "newest",
          offset: String(Math.floor(Math.random() * 3000))
        });
        const response = await fetch("https://api.modrinth.com/v2/search?" + params.toString(), {
          headers: { "User-Agent": MODRINTH_USER_AGENT, Accept: "application/json" },
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) {
          console.error("[Modrinth] Search request failed:", response.status, (await response.text().catch(() => "")).slice(0, 250));
          continue;
        }

        const payload = await response.json();
        const packs = Array.isArray(payload.hits) ? payload.hits.filter(pack =>
          pack && typeof pack.project_id === "string" &&
          typeof pack.latest_version === "string" &&
          typeof pack.title === "string" &&
          MODRINTH_REDISTRIBUTABLE_LICENSES.has(pack.license)
        ) : [];
        if (!packs.length) {
          console.warn("[Modrinth] No eligible resource packs were returned by the public API.");
          continue;
        }

        const posted = new Set(dropper.postedIds);
        let candidates = packs.filter(pack => !posted.has(pack.project_id + ":" + pack.latest_version));
        if (!candidates.length) {
          dropper.postedIds = [];
          candidates = [...packs];
        }
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        let published = false;
        for (const pack of candidates.slice(0, 10)) {
          try {
            const versionResponse = await fetch("https://api.modrinth.com/v2/version/" + encodeURIComponent(pack.latest_version), {
              headers: { "User-Agent": MODRINTH_USER_AGENT, Accept: "application/json" },
              signal: AbortSignal.timeout(15000)
            });
            if (!versionResponse.ok) continue;
            const version = await versionResponse.json();
            if (version.project_id !== pack.project_id || !Array.isArray(version.files)) continue;

            const file = version.files.find(item => item?.primary && typeof item.url === "string")
              || version.files.find(item => typeof item?.url === "string");
            if (!file || !/^https:\/\/cdn\.modrinth\.com\//i.test(file.url)) continue;
            const filename = String(file.filename || "texture-pack.zip");
            if (!/\.(zip|mcpack)$/i.test(filename)) continue;
            if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0 || Number(file.size) > MODRINTH_MAX_UPLOAD_BYTES) continue;

            const download = await fetch(file.url, {
              headers: { "User-Agent": MODRINTH_USER_AGENT },
              signal: AbortSignal.timeout(30000)
            });
            if (!download.ok) continue;
            const buffer = await readResponseWithLimit(download, MODRINTH_MAX_UPLOAD_BYTES);
            if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
              console.warn("[Modrinth] Skipped a file that did not look like a ZIP archive:", pack.project_id);
              continue;
            }

            const projectUrl = "https://modrinth.com/resourcepack/" + encodeURIComponent(pack.slug || pack.project_id);
            const safeDescription = String(pack.description || "A community-made Minecraft resource pack.")
              .replace(/<@!?\d+>|@everyone|@here/g, "")
              .replace(/\s+/g, " ").trim().slice(0, 700);
            const embed = new EmbedBuilder()
              .setColor(0x1bd96a)
              .setTitle(String(pack.title).slice(0, 250))
              .setURL(projectUrl)
              .setDescription(safeDescription)
              .addFields(
                { name: "Creator", value: String(pack.author || "Unknown creator").slice(0, 180), inline: true },
                { name: "Licence", value: String(pack.license), inline: true },
                { name: "Minecraft versions", value: Array.isArray(version.game_versions) && version.game_versions.length ? version.game_versions.slice(0, 12).join(", ").slice(0, 900) : "Not listed", inline: false },
                { name: "Download", value: "Attached below • " + (Number(buffer.length) / 1024 / 1024).toFixed(2) + " MB", inline: true }
              )
              .setFooter({ text: "Modrinth • Creator credited • " + String(version.version_number || version.name || "Latest version").slice(0, 70) })
              .setTimestamp();
            if (typeof pack.icon_url === "string" && /^https:\/\//i.test(pack.icon_url)) embed.setThumbnail(pack.icon_url);

            const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "texture-pack.zip";
            await channel.send({
              embeds: [embed],
              files: [new AttachmentBuilder(buffer, { name: safeFilename })],
              allowedMentions: { parse: [] }
            });

            dropper.postedIds.push(pack.project_id + ":" + pack.latest_version);
            if (dropper.postedIds.length > 5000) dropper.postedIds = dropper.postedIds.slice(-5000);
            await saveDatabase();
            console.log("[Modrinth] Uploaded", pack.title, "(" + pack.license + ") to", guild.id);
            published = true;
            break;
          } catch (error) {
            console.warn("[Modrinth] Skipped candidate " + pack.project_id + ":", error?.message || error);
          }
        }
        if (!published) console.warn("[Modrinth] No eligible, downloadable pack under 8 MB could be uploaded this cycle for", guild.id);
      } catch (error) {
        console.error("[Modrinth] Dropper cycle failed for guild " + guild.id + ":", error);
      }
    }
  } finally {
    tpackDropperRunning = false;
  }
}

function startModrinthTextureDropper() {
  void runModrinthTextureDropper();
  setInterval(() => { void runModrinthTextureDropper(); }, 5 * 60 * 1000);
}

// Self-role reaction panel. Only the configured panel message in the main server is actionable.
const SELF_ROLE_GUILD_ID = "1572968551973654528";
const SELF_ROLE_MAP = {
  "1573218793520631828": "1572968552024121478",
  "1573218797018550362": "1572968552024121480",
  "1573218800814391387": "1572968552024121479",
  "1573219700354064402": "1572968552024121481"
};
async function handleSelfRoleReaction(reaction, user, shouldAdd) {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    const message = reaction.message;
    if (!message.guild || message.guild.id !== SELF_ROLE_GUILD_ID) return;
    const config = getGuildConfig(message.guild.id);
    if (!config.selfRolePanel || config.selfRolePanel.messageId !== message.id) return;
    const roleId = SELF_ROLE_MAP[reaction.emoji.id ?? reaction.emoji.name];
    if (!roleId) return;
    const role = message.guild.roles.cache.get(roleId) ?? await message.guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      console.warn("[SelfRoles] Configured role no longer exists:", roleId);
      return;
    }
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    if (shouldAdd) {
      if (!member.roles.cache.has(roleId)) await member.roles.add(role, "Self-role reaction panel");
    } else if (member.roles.cache.has(roleId)) {
      await member.roles.remove(role, "Self-role reaction panel");
    }
  } catch (error) {
    console.error("[SelfRoles] Could not " + (shouldAdd ? "add" : "remove") + " role from reaction:", error);
  }
}
client.on(Events.MessageReactionAdd, (reaction, user) => {
  void handleSelfRoleReaction(reaction, user, true);
});
client.on(Events.MessageReactionRemove, (reaction, user) => {
  void handleSelfRoleReaction(reaction, user, false);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isButton() && interaction.customId.startsWith("px_delete_approval:")) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Server-only approval.", ephemeral: true });
    if (interaction.user.id !== interaction.guild.ownerId && !isBotOwner(interaction.user.id)) return interaction.reply({ content: "Only the server owner or Paradox • Core owner can decide.", ephemeral: true });
    const parts = interaction.customId.split(":");
    const decision = parts[1], deletedChannelId = parts[2];
    const cfg = getGuildConfig(interaction.guildId);
    const pending = cfg.pendingDeletionApprovals.find(item => item.channelId === deletedChannelId && item.status === "pending");
    if (!pending) return interaction.reply({ content: "This request has already been handled.", ephemeral: true });
    const restored = await interaction.guild.channels.fetch(pending.restoredChannelId).catch(() => null);
    if (decision === "accept") {
      if (restored) await restored.delete("Deletion approved by " + interaction.user.tag);
      pending.status = "approved"; pending.decidedBy = interaction.user.id; pending.decidedAt = new Date().toISOString();
      await saveDatabase();
      return interaction.update({ content: "Deletion approved. The recovered copy has been removed.", embeds: [], components: [] });
    }
    if (decision === "reject") {
      pending.status = "rejected"; pending.decidedBy = interaction.user.id; pending.decidedAt = new Date().toISOString();
      await saveDatabase();
      let result = "The recovered channel remains available.";
      if (pending.executorId && pending.executorId !== interaction.guild.ownerId && pending.executorId !== client.user.id) {
        await interaction.guild.members.ban(pending.executorId, { reason: "Paradox • Core: deletion request rejected by server owner" })
          .then(() => { result += " The requester was banned."; })
          .catch(error => { result += " Ban failed: " + String(error.message || error).slice(0, 150); });
      }
      return interaction.update({ content: "Deletion rejected. " + result, embeds: [], components: [] });
    }
  }

  // Persistent giveaway entry button.
  if (interaction.isButton() && interaction.customId.startsWith("px_giveaway_enter:")) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Giveaways can only be entered inside a server.", ephemeral: true });
    const messageId = interaction.customId.slice("px_giveaway_enter:".length);
    const config = getGuildConfig(interaction.guildId);
    const giveaway = config.giveaways.find(item => item.messageId === messageId);
    if (!giveaway || giveaway.endedAt || Date.now() >= giveaway.endsAt) {
      return interaction.reply({ content: "This giveaway has ended or is no longer available.", ephemeral: true });
    }
    if (giveaway.entries.includes(interaction.user.id)) {
      return interaction.reply({ content: "You're already entered! Good luck 🎉", ephemeral: true });
    }
    giveaway.entries.push(interaction.user.id);
    await saveDatabase();
    await interaction.message.edit({ embeds: [giveawayEmbed(giveaway)] }).catch(error => console.error("[Giveaway] Entry count update failed:", error));
    return interaction.reply({ content: "🎉 You're entered in **" + giveaway.prize + "**. Good luck!", ephemeral: true });
  }

  // Persistent ticket dropdown and close button handlers.
  if (interaction.isStringSelectMenu() && interaction.customId === "px_ticket_create") {
    if (!interaction.inGuild()) return interaction.reply({ content: "Tickets can only be opened inside a server.", ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
      const config = getGuildConfig(interaction.guildId);
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
      const overwrites = [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
        { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ];
      if (config.ticketStaffRoleId && interaction.guild.roles.cache.has(config.ticketStaffRoleId)) {
        overwrites.push({ id: config.ticketStaffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
      }
      const ticketType = interaction.values[0];
      const categoryId = "1572968553924141165";
      const ticketCategory = await interaction.guild.channels.fetch(categoryId).catch(() => null);
      if (!ticketCategory || ticketCategory.type !== ChannelType.GuildCategory) {
        return interaction.editReply("The ticket category is missing or is not a category. Please ask an administrator to check the ticket setup.");
      }
      const username = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "member";
      const typeSlug = ticketType === "General Support" ? "general" : ticketType === "Team Application" ? "team-application" : ticketType === "Ally" ? "ally" : ticketType === "Merge" ? "merge" : ticketType === "TVT" ? "tvt" : "paid-promotion";
      const baseName = typeSlug + "-" + username;
      let channelName = baseName;
      let suffix = 2;
      while (interaction.guild.channels.cache.some(existingChannel => existingChannel.parentId === categoryId && existingChannel.name === channelName)) {
        channelName = baseName + "-" + suffix++;
      }
      const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: ticketCategory.id,
        topic: "paradoxplus-ticket:" + interaction.user.id,
        permissionOverwrites: overwrites,
        reason: "Exile AS " + ticketType + " ticket opened by " + interaction.user.tag
      });
      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("px_ticket_close").setLabel("Close ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger)
      );
      const intro = new EmbedBuilder()
        .setColor(0x6d5dfc)
        .setAuthor({ name: "EXILE AS  /  PRIVATE SUPPORT", iconURL: interaction.client.user.displayAvatarURL() })
        .setTitle("✦  " + ticketType.toUpperCase() + "  /  SUPPORT ROOM")
        .setDescription(
          "Welcome " + member.toString() + " — your private ticket is open.\n" +
          "Please explain your request and include any useful details. Staff will assist you soon."
        )
        .addFields(
          { name: "OWNER", value: member.toString(), inline: true },
          { name: "DEPARTMENT", value: ticketType, inline: true },
          { name: "STATUS", value: "🟢 Open", inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: "EXILE AS  /  Use the button below when your issue is resolved" })
        .setTimestamp();
      await channel.send({ embeds: [intro], components: [closeRow], allowedMentions: { users: [member.id], parse: [] } });
      return interaction.editReply("Your private ticket has been created: " + channel.toString());
    } catch (error) {
      console.error("[Tickets] Could not create ticket:", error);
      return interaction.editReply("I couldn't create your ticket. Check that I have Manage Channels and View Channel permissions.");
    }
  }

  if (interaction.isButton() && interaction.customId === "px_ticket_close") {
    if (!interaction.inGuild() || !interaction.channel) return interaction.reply({ content: "This ticket is no longer available.", ephemeral: true });
    const ownerId = getTicketData(interaction.channel)?.ownerId;
    if (!ownerId) return interaction.reply({ content: "This button can only be used inside an Exile AS ticket.", ephemeral: true });
    const config = getGuildConfig(interaction.guildId);
    const staffRole = config.ticketStaffRoleId;
    const closingMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const isStaff = isBotOwner(interaction.user.id) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
      (staffRole && closingMember?.roles.cache.has(staffRole));
    if (interaction.user.id !== ownerId && !isStaff) {
      return interaction.reply({ content: "Only the ticket creator or ticket staff can close this ticket.", ephemeral: true });
    }
    try {
      await interaction.channel.permissionOverwrites.edit(ownerId, {
        SendMessages: false,
        AddReactions: false
      });
      await setTicketData(interaction.channel, { status: "closed" });
      if (!interaction.channel.name.startsWith("closed-")) {
        await interaction.channel.setName(("closed-" + interaction.channel.name).slice(0, 100));
      }
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("px_ticket_closed").setLabel("Ticket Closed").setEmoji("🔒").setStyle(ButtonStyle.Secondary).setDisabled(true)
      );
      await archiveTicketTranscript(interaction.channel, interaction.user.id, "Closed using the ticket close button.");
      await interaction.update({ content: "🔒 Ticket closed. Its transcript has been saved in #ticket-transcripts. This channel will now be deleted.", components: [disabledRow] });
      await interaction.channel.delete("Exile AS ticket archived and automatically deleted after closure");
      return;
    } catch (error) {
      console.error("[Tickets] Could not close ticket:", error);
      return interaction.reply({ content: "I couldn't close this ticket. Check my channel permissions.", ephemeral: true });
    }
  }

  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild()) return replyError(interaction, "This command only works inside a server.");

  try {
    const config = getGuildConfig(interaction.guildId);

    if (["tpackenable", "tpackdisable", "tpackstatus"].includes(interaction.commandName)) {
      if (!isBotOwner(interaction.user.id) &&
          !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) &&
          !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return replyError(interaction, "You need Manage Server or Administrator to manage the texture-pack dropper.");
      }
      if (interaction.guildId !== "1572968551973654528") {
        return replyError(interaction, "The Modrinth texture-pack dropper is configured for the Paradoxplus main server only.");
      }
      const dropper = config.tpackDropper;
      if (interaction.commandName === "tpackstatus") {
        return interaction.reply({
          content: dropper.enabled && dropper.channelId
            ? "🟢 Modrinth auto-dropper is **enabled** in <#" + dropper.channelId + ">. It posts one pack every **5 minutes**."
            : "⚪ Modrinth auto-dropper is **disabled**.",
          ephemeral: true
        });
      }
      if (interaction.commandName === "tpackdisable") {
        dropper.enabled = false;
        await saveDatabase();
        return interaction.reply({ content: "⏸️ Modrinth auto-dropper disabled. No more packs will be posted.", ephemeral: true });
      }
      const targetChannel = interaction.options.getChannel("channel", true);
      if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(targetChannel.type)) {
        return replyError(interaction, "Choose a text or announcement channel.");
      }
      const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
      if (!targetChannel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles])) {
        return replyError(interaction, "I need View Channel, Send Messages, Embed Links, and Attach Files in that channel.");
      }
      dropper.channelId = targetChannel.id;
      dropper.enabled = true;
      await saveDatabase();
      return interaction.reply({
        content: "✅ Modrinth auto-dropper enabled in " + targetChannel.toString() + ". I'll post one new pack every **5 minutes**. Use /tpackdisable to stop it or /tpackstatus to check it.",
        ephemeral: true
      });
    }

    if (interaction.commandName === "roleall") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) return replyError(interaction, "You need Manage Roles to use this command.");
      const role = interaction.options.getRole("role", true);
      const confirmed = interaction.options.getBoolean("confirm", true);
      if (!confirmed) return replyError(interaction, "No roles were assigned. Run /roleall again with confirm: True when ready.");
      const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
      if (role.managed || role.id === interaction.guild.id) return replyError(interaction, "That role cannot be assigned.");
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= me.roles.highest.position) return replyError(interaction, "I need Manage Roles, and my highest role must be above " + role.toString() + ".");
      await interaction.deferReply({ ephemeral: true });
      try {
        const members = await getGuildMembers(interaction.guild);
        const targets = [...members.values()].filter(member => !member.roles.cache.has(role.id));
        let added = 0;
        const failed = [];
        for (const member of targets) {
          try { await member.roles.add(role, "Bulk role assignment by " + interaction.user.tag); added++; }
          catch (error) { failed.push({ id: member.id, tag: member.user.tag, code: error.code || "unknown" }); console.error("[RoleAll] Failed for", member.id, error); }
        }
        const failureList = failed.slice(0, 15).map(item => item.tag + " (" + item.id + ", error " + item.code + ")").join("\n");
        const more = failed.length > 15 ? "\n…and " + (failed.length - 15) + " more." : "";
        const report = "Finished assigning " + role.toString() + ".\nAdded: **" + added + "**\nFailed: **" + failed.length + "** (including any accounts Discord would not allow me to manage)." + (failureList ? "\n\n**Failed accounts:**\n" + failureList + more : "");
        return interaction.editReply(report.slice(0, 1950));
      } catch (error) {
        console.error("[RoleAll] Bulk assignment failed:", error);
        return interaction.editReply("I couldn't complete the role assignment. Check my Server Members Intent, Manage Roles permission, and role hierarchy.");
      }
    }

    if (interaction.commandName === "autorole") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) return replyError(interaction, "You need Manage Roles to configure autoroles.");
      const action = interaction.options.getSubcommand();
      if (action === "add") {
        const role = interaction.options.getRole("role", true);
        const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        if (role.managed || role.id === interaction.guild.id) return replyError(interaction, "That role cannot be assigned by autorole.");
        if (!me.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= me.roles.highest.position) return replyError(interaction, "I need Manage Roles, and my highest role must be above " + role.toString() + ".");
        if (config.autoroleIds.includes(role.id)) return interaction.reply({ content: role.toString() + " is already an autorole.", ephemeral: true });
        config.autoroleIds.push(role.id);
        await saveDatabase();
        return interaction.reply({ content: "Added " + role.toString() + " to autoroles. New members will receive it when they join.", allowedMentions: { parse: [] }, ephemeral: true });
      }
      if (action === "remove") {
        const role = interaction.options.getRole("role", true);
        const before = config.autoroleIds.length;
        config.autoroleIds = config.autoroleIds.filter(id => id !== role.id);
        if (config.autoroleIds.length === before) return interaction.reply({ content: role.toString() + " wasn't in the autorole list.", ephemeral: true });
        await saveDatabase();
        return interaction.reply({ content: "Removed " + role.toString() + " from autoroles.", allowedMentions: { parse: [] }, ephemeral: true });
      }
      if (action === "list") {
        const roles = config.autoroleIds.map(id => interaction.guild.roles.cache.get(id)).filter(Boolean);
        return interaction.reply({ content: roles.length ? "**Configured autoroles:**\n" + roles.map(role => "• " + role.toString()).join("\n") : "No autoroles are configured.", allowedMentions: { parse: [] }, ephemeral: true });
      }
      if (action === "clear") {
        const count = config.autoroleIds.length;
        config.autoroleIds = [];
        await saveDatabase();
        return interaction.reply({ content: "Cleared " + count + " configured autorole(s).", ephemeral: true });
      }
    }

    if (interaction.commandName === "recovery") {
      if (interaction.user.id !== BOT_OWNER_ID && interaction.user.id !== interaction.guild.ownerId) return replyError(interaction, "Only the server owner or Paradox • Core owner can use Recovery Center.");
      const action = interaction.options.getSubcommand();
      if (action === "setup") {
        const channel = interaction.options.getChannel("channel", true);
        const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return replyError(interaction, "I need View Channel, Send Messages, and Embed Links in that review channel.");
        config.recoveryReviewChannelId = channel.id; await saveDatabase();
        return interaction.reply({ content: "Deletion approval requests will be sent to " + channel.toString() + ".", ephemeral: true });
      }
      if (action === "messages") {
        const channelId = interaction.options.getString("channel_id", true).trim();
        if (!/^\d{17,20}$/.test(channelId)) return replyError(interaction, "Invalid channel ID.");
        const deletedOnly = interaction.options.getBoolean("deleted_only") ?? false;
        const rows = await getArchivedChannelMessages(interaction.guildId, channelId, deletedOnly, 20);
        if (!rows.length) return interaction.reply({ content: "No archived messages found.", ephemeral: true });
        const body = rows.map(row => "**" + (row.deleted_at ? "DELETED" : "SAVED") + "** • " + row.message_id + " • " + (row.created_at ? new Date(row.created_at).toISOString() : "unknown date") + "\n" + String(row.content || "[no text]").replace(/\s+/g, " ").slice(0, 160)).join("\n\n");
        return interaction.reply({ content: "**Recovery Center — archived messages**\n" + body, ephemeral: true });
      }
      if (action === "restore-message") {
        const channelId = interaction.options.getString("channel_id", true).trim(), messageId = interaction.options.getString("message_id", true).trim();
        if (!/^\d{17,20}$/.test(channelId) || !/^\d{17,20}$/.test(messageId)) return replyError(interaction, "Invalid Discord IDs.");
        const rows = await getArchivedChannelMessages(interaction.guildId, channelId, false, 1000), row = rows.find(item => item.message_id === messageId);
        if (!row) return replyError(interaction, "Message not found in the archive for that channel.");
        const destination = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (!destination || typeof destination.send !== "function") return replyError(interaction, "The original channel is unavailable. Restore it first.");
        const parts = ["Recovered message • " + (row.author_tag || "Unknown author"), row.content || "[No text content archived]"];
        for (const file of (Array.isArray(row.attachments) ? row.attachments : [])) if (file.url) parts.push("Attachment: " + (file.name || "file") + " — " + file.url);
        const sent = await destination.send({ content: parts.join("\n").slice(0, 1950), allowedMentions: { parse: [] } });
        return interaction.reply({ content: "Message replayed: " + sent.url, ephemeral: true });
      }
      const backupDir = path.join(DATA_DIR, "channel-backups", interaction.guildId);
      const files = (await fs.readdir(backupDir).catch(() => [])).filter(file => file.endsWith(".json")).sort().reverse();
      if (action === "backups") {
        if (!files.length) return interaction.reply({ content: "No channel backups are available yet.", ephemeral: true });
        return interaction.reply({ content: "**Available backups**\n" + files.slice(0, 20).join("\n"), ephemeral: true });
      }
      if (action === "restore-channel") {
        const channelId = interaction.options.getString("channel_id", true).trim(), filename = interaction.options.getString("backup_file", true).trim();
        if (!/^\d{17,20}$/.test(channelId) || !/^[a-zA-Z0-9_-]+\.json$/.test(filename) || !files.includes(filename)) return replyError(interaction, "Invalid channel ID or backup filename. Use /recovery backups.");
        const snapshot = JSON.parse(await fs.readFile(path.join(backupDir, filename), "utf8"));
        if (snapshot.guildId !== interaction.guildId || !Array.isArray(snapshot.channels)) return replyError(interaction, "Backup does not belong to this server.");
        const saved = snapshot.channels.find(item => item.id === channelId);
        if (!saved) return replyError(interaction, "Channel is not present in that backup.");
        const existing = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (existing) return replyError(interaction, "That channel still exists; this restores missing channels only.");
        await interaction.deferReply({ ephemeral: true });
        const placeholder = { guild: interaction.guild, id: channelId, name: saved.name };
        const restored = await restoreDeletedChannel(placeholder, snapshot);
        if (!restored) return interaction.editReply("Channel restoration failed.");
        const count = await restoreArchivedMessages(placeholder, restored).catch(error => { console.error("[Recovery] Message replay failed:", error); return 0; });
        return interaction.editReply("Restored " + saved.name + " from " + filename + " and replayed " + count + " archived messages.");
      }
    }

    if (interaction.commandName === "owner") {
      if (!isBotOwner(interaction.user.id)) {
        return replyError(interaction, "Only Fearless, the configured Paradox • Core bot owner, can manage this whitelist.");
      }
      if (interaction.guildId !== ANTI_NUKE_GUILD_ID) {
        return replyError(interaction, "The owner whitelist is configured for the Paradoxplus main server only.");
      }
      if (interaction.options.getSubcommandGroup() !== "whitelist") {
        return replyError(interaction, "Unknown owner whitelist action.");
      }
      const action = interaction.options.getSubcommand();
      const config = getGuildConfig(interaction.guildId);

      if (action === "list") {
        const ids = [...new Set(config.antiNukeWhitelist)].filter(id => id !== BOT_OWNER_ID);
        if (!ids.length) {
          return interaction.reply({ content: "🛡️ The anti-nuke owner whitelist is empty.", ephemeral: true });
        }
        const lines = ids.map((id, index) => (index + 1) + ". <@" + id + "> — `" + id + "`");
        const chunks = [];
        let chunk = "**Anti-nuke trusted users (" + ids.length + ")**\n";
        for (const line of lines) {
          if ((chunk + line + "\n").length > 1800) {
            chunks.push(chunk);
            chunk = "";
          }
          chunk += line + "\n";
        }
        if (chunk) chunks.push(chunk);
        await interaction.reply({ content: chunks[0], ephemeral: true, allowedMentions: { parse: [] } });
        for (const extra of chunks.slice(1)) {
          await interaction.followUp({ content: extra, ephemeral: true, allowedMentions: { parse: [] } });
        }
        return;
      }

      const user = interaction.options.getUser("user", true);
      if (user.id === BOT_OWNER_ID) {
        return replyError(interaction, "Fearless is already the configured bot owner.");
      }

      if (action === "add") {
        if (config.antiNukeWhitelist.includes(user.id)) {
          return interaction.reply({ content: "✅ <@" + user.id + "> is already on the anti-nuke whitelist.", ephemeral: true, allowedMentions: { parse: [] } });
        }
        config.antiNukeWhitelist.push(user.id);
        await saveDatabase();
        console.log("[ANTI-NUKE] Bot owner added trusted user:", user.id, "by", interaction.user.id);
        return interaction.reply({
          content: "🛡️ Added <@" + user.id + "> to the anti-nuke whitelist. They will be exempt from anti-nuke enforcement, but this does not grant bot-owner commands or permissions.",
          ephemeral: true,
          allowedMentions: { parse: [] }
        });
      }

      if (action === "remove") {
        if (!config.antiNukeWhitelist.includes(user.id)) {
          return interaction.reply({ content: "ℹ️ <@" + user.id + "> is not on the anti-nuke whitelist.", ephemeral: true, allowedMentions: { parse: [] } });
        }
        config.antiNukeWhitelist = config.antiNukeWhitelist.filter(id => id !== user.id);
        await saveDatabase();
        console.log("[ANTI-NUKE] Bot owner removed trusted user:", user.id, "by", interaction.user.id);
        return interaction.reply({
          content: "✅ Removed <@" + user.id + "> from the anti-nuke whitelist. Anti-nuke enforcement will apply to them again.",
          ephemeral: true,
          allowedMentions: { parse: [] }
        });
      }

      return replyError(interaction, "Unknown owner whitelist action.");
    }

    if (interaction.commandName === "antinuke") {
      if (!isBotOwner(interaction.user.id)) {
        return replyError(interaction, "Only Fearless, the configured Paradox • Core bot owner, can manage anti-nuke tools.");
      }
      if (interaction.guildId !== "1572968551973654528") {
        return replyError(interaction, "Anti-nuke controls are configured for the Paradoxplus main server only.");
      }
      const action = interaction.options.getSubcommand();
      if (action === "status") {
        const backupDir = path.join(DATA_DIR, "channel-backups", interaction.guildId);
        let backupFiles = [];
        try {
          backupFiles = (await fs.readdir(backupDir)).filter(name => name.endsWith(".json"));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        const latestBackup = backupFiles.sort().at(-1) || null;
        const securityBotMember = await interaction.guild.members.fetchMe().catch(() => null);
        const requiredSecurityPermissions = [
          [PermissionFlagsBits.ViewAuditLog, "View Audit Log"],
          [PermissionFlagsBits.BanMembers, "Ban Members"],
          [PermissionFlagsBits.ManageRoles, "Manage Roles"],
          [PermissionFlagsBits.ManageChannels, "Manage Channels"],
          [PermissionFlagsBits.ManageWebhooks, "Manage Webhooks"]
        ];
        const missingSecurityPermissions = requiredSecurityPermissions
          .filter(([permission]) => !securityBotMember?.permissions.has(permission))
          .map(([, name]) => name);
        const status = new EmbedBuilder()
          .setColor(0x15171c)
          .setAuthor({ name: "PARADOX • CORE  /  SECURITY CENTER" })
          .setTitle("ANTI-NUKE OVERVIEW")
          .setDescription(missingSecurityPermissions.length
            ? "**DEGRADED PROTECTION**  ·  Missing bot permissions can prevent some detections or recovery actions. Fix the permissions listed below."
            : "**LIVE PROTECTION**  ·  Required bot permissions are present. Unknown audit-log actors are reported for review rather than blindly punished.")
          .addFields(
            { name: "01  /  Destructive actions", value: "Rapid mass-ban and mass-kick detection; channel and role creation/deletion monitoring; webhook creation, updates, and deletion monitoring.", inline: false },
            { name: "02  /  Permission escalation", value: "Dangerous role-permission grants, dangerous role assignments, and channel-overwrite permission escalation are checked and reverted when an unauthorized actor is identified.", inline: false },
            { name: "03  /  Bot security", value: "New bots with elevated moderation or server-management permissions are detected and removed when the inviter is not trusted.", inline: false },
            { name: "04  /  Raid signals", value: "A burst of 8 human joins within 15 seconds triggers an owner alert. Join detection is alert-only; it does not mass-kick ordinary members.", inline: false },
            { name: "05  /  Recovery & backups", value: "Channel configuration recovery, archived-message records, sticker backups, and custom emoji/GIF backups are available when snapshots exist. Unauthorized sticker or custom emoji deletion triggers automatic re-upload when the saved asset is available. " + backupFiles.length + " channel snapshot file(s) found; hourly backups are enabled.", inline: false },
            { name: "06  /  Message deletion", value: "Bulk deletion of 10 or more messages triggers an owner alert with the identified actor when Discord audit logs provide one. Archived message records are retained for later review/export; Discord messages are not automatically reposted.", inline: false },
            { name: "BOT PERMISSIONS", value: missingSecurityPermissions.length ? "**MISSING:** " + missingSecurityPermissions.join(", ") : "All required anti-nuke permissions are present.", inline: false },
            { name: "LATEST SNAPSHOT", value: latestBackup || "No snapshot file found.", inline: true },
            { name: "TRUST MODEL", value: "Only the actual server owner, Paradox • Core bot, configured bot owner, and users explicitly added to the owner-managed whitelist are exempt. Server administrators and moderators are not automatically trusted.", inline: true },
            { name: "CURRENT LIMITATIONS", value: "No panic-lockdown or quarantine workflow yet. This is not full Wick parity; deleted webhook tokens and all deleted server assets cannot be restored automatically.", inline: false }
          )
          .setFooter({ text: "PARADOX • CORE  /  SECURITY OPERATIONS" })
          .setTimestamp();
        return interaction.reply({ embeds: [status], ephemeral: true });
      }
      if (action === "backup-now") {
        await interaction.deferReply({ ephemeral: true });
        try {
          await createGuildChannelBackup(interaction.guild, "manual /antinuke backup by " + interaction.user.id);
          return interaction.editReply("✦ Manual channel-configuration backup completed successfully.");
        } catch (error) {
          console.error("[ANTI-NUKE] Manual backup failed:", error);
          return interaction.editReply("The backup failed. Check the bot logs and Railway volume permissions.");
        }
      }
      return replyError(interaction, "Unknown anti-nuke action.");
    }

    if (interaction.commandName === "message-archive") {
      if (!["1191997911144349738", BOT_OWNER_ID].includes(interaction.user.id)) {
        return replyError(interaction, "Only the two designated Paradox • Core owners can export archived messages.");
      }
      const subcommand = interaction.options.getSubcommand();
      if (subcommand !== "export") return replyError(interaction, "Unknown message archive action.");
      const channelId = interaction.options.getString("channel_id", true).trim();
      if (!/^\d{17,20}$/.test(channelId)) return replyError(interaction, "Enter a valid Discord channel ID.");
      const deletedOnly = interaction.options.getBoolean("deleted_only") ?? false;
      await interaction.deferReply({ ephemeral: true });
      try {
        const rows = await getArchivedChannelMessages(interaction.guildId, channelId, deletedOnly, 1000);
        if (!rows.length) return interaction.editReply("No archived messages were found for that channel.");
        const lines = [
          "PARADOX • CORE MESSAGE ARCHIVE",
          "Server: " + interaction.guild.name + " (" + interaction.guildId + ")",
          "Channel ID: " + channelId,
          "Exported: " + new Date().toISOString(),
          "Retention: permanent (no automatic expiry)",
          "Messages included: " + rows.length,
          "----------------------------------------",
          ""
        ];
        for (const row of rows) {
          const timestamp = row.created_at ? new Date(row.created_at).toISOString() : "Unknown time";
          lines.push("[" + timestamp + "] " + (row.author_tag || "Unknown author") + " (" + (row.author_id || "unknown") + ")" + (row.deleted_at ? " [DELETED]" : ""));
          lines.push(row.content || "[No text content]");
          for (const attachment of (Array.isArray(row.attachments) ? row.attachments : [])) {
            lines.push("Attachment: " + (attachment.name || "file") + (attachment.url ? " — " + attachment.url : ""));
          }
          for (const embed of (Array.isArray(row.embeds) ? row.embeds : [])) {
            if (embed.title) lines.push("Embed title: " + embed.title);
            if (embed.description) lines.push("Embed: " + String(embed.description).slice(0, 1500));
          }
          lines.push("");
        }
        let transcript = lines.join("\n");
        if (Buffer.byteLength(transcript, "utf8") > 7_500_000) {
          transcript = transcript.slice(0, 7_000_000) + "\n[Export truncated to fit Discord upload limit.]";
        }
        const file = new AttachmentBuilder(Buffer.from(transcript, "utf8"), {
          name: "paradox-message-archive-" + channelId + ".txt"
        });
        return interaction.editReply({
          content: "Archive export ready. It contains up to 1,000 archived messages. Attachment links may expire if Discord invalidates their original URLs.",
          files: [file]
        });
      } catch (error) {
        console.error("[MessageArchive] Export failed:", error);
        return interaction.editReply("The archive export failed. Check the PostgreSQL connection and bot logs.");
      }
    }

    if (interaction.commandName === "giveaway") {
      const sub = interaction.options.getSubcommand();
      const canManage = isBotOwner(interaction.user.id) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
      if (sub !== "list" && !canManage) return replyError(interaction, "You need Manage Messages, Manage Server, or Administrator to manage giveaways.");

      if (sub === "create") {
        const prize = interaction.options.getString("prize", true).trim();
        const durationText = interaction.options.getString("duration", true);
        const duration = giveawayDurationMs(durationText);
        const winnerCount = interaction.options.getInteger("winners", true);
        const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
        const description = interaction.options.getString("description")?.trim() || "";
        if (!duration) return replyError(interaction, "Duration must be between 1 minute and 30 days. Examples: 30m, 2h, 1d.");
        if (!targetChannel || targetChannel.type !== ChannelType.GuildText || targetChannel.guildId !== interaction.guildId) {
          return replyError(interaction, "Choose a text channel in this server.");
        }
        const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        if (!targetChannel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory])) {
          return replyError(interaction, "I need View Channel, Send Messages, Embed Links, and Read Message History in the giveaway channel.");
        }
        if (!Array.isArray(config.giveaways)) config.giveaways = [];
        const active = config.giveaways.filter(item => !item.endedAt).length;
        if (active >= 20) return replyError(interaction, "This server already has 20 active giveaways. End one before creating another.");
        await interaction.deferReply({ ephemeral: true });
        const giveaway = {
          messageId: null,
          channelId: targetChannel.id,
          hostId: interaction.user.id,
          prize,
          description,
          winnerCount,
          endsAt: Date.now() + duration,
          createdAt: Date.now(),
          entries: [],
          winners: [],
          endedAt: null
        };
        const announcement = await targetChannel.send({
          embeds: [giveawayEmbed(giveaway)],
          components: [giveawayEntryRow("pending")]
        });
        giveaway.messageId = announcement.id;
        await announcement.edit({ embeds: [giveawayEmbed(giveaway)], components: [giveawayEntryRow(announcement.id)] });
        config.giveaways.push(giveaway);
        await saveDatabase();
        return interaction.editReply("🎉 Giveaway created in " + targetChannel.toString() + "!\n**Prize:** " + prize + "\n**Duration:** " + durationText + "\n**Winners:** " + winnerCount + "\n**Giveaway ID:** " + announcement.id);
      }

      if (sub === "list") {
        const rows = config.giveaways.slice(-10).reverse();
        if (!rows.length) return interaction.reply({ content: "No giveaways have been created in this server yet.", ephemeral: true });
        const lines = rows.map(item => (item.endedAt ? "🏁 Ended" : "🎉 Active") + " • **" + item.prize + "** • " + item.entries.length + " entries • ID: " + item.messageId);
        return interaction.reply({ content: "**Recent giveaways**\n" + lines.join("\n"), ephemeral: true, allowedMentions: { parse: [] } });
      }

      const giveawayId = interaction.options.getString("giveaway_id", true).trim();
      const giveaway = config.giveaways.find(item => item.messageId === giveawayId);
      if (!giveaway) return replyError(interaction, "I couldn't find that giveaway ID in this server.");

      if (sub === "end") {
        if (giveaway.endedAt) return replyError(interaction, "That giveaway has already ended.");
        await interaction.deferReply({ ephemeral: true });
        try {
          const winners = await finishGiveaway(interaction.guild, giveaway, false);
          return interaction.editReply(winners.length ? "🏁 Giveaway ended. Winner(s): " + winners.map(id => "<@" + id + ">").join(", ") : "🏁 Giveaway ended, but there were no valid entries.");
        } catch (error) {
          console.error("[Giveaway] End failed:", error);
          return interaction.editReply("I couldn't end that giveaway: " + error.message);
        }
      }

      if (sub === "reroll") {
        if (!giveaway.endedAt) return replyError(interaction, "End the giveaway before rerolling.");
        await interaction.deferReply({ ephemeral: true });
        try {
          const winners = await finishGiveaway(interaction.guild, giveaway, true);
          return interaction.editReply(winners.length ? "🔄 New winner(s): " + winners.map(id => "<@" + id + ">").join(", ") : "No new eligible entrants were available.");
        } catch (error) {
          console.error("[Giveaway] Reroll failed:", error);
          return interaction.editReply("I couldn't reroll that giveaway: " + error.message);
        }
      }
    }

    if (interaction.commandName === "ticket") {
      const sub = interaction.options.getSubcommand();
      const ticketActor = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      const allowed = isBotOwner(interaction.user.id) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
        (config.ticketStaffRoleId && ticketActor?.roles.cache.has(config.ticketStaffRoleId));

      if (sub === "panel") {
        if (!isBotOwner(interaction.user.id) &&
            !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
            !interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
          return replyError(interaction, "You need Manage Channels or Administrator to publish the ticket panel.");
        }
        const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
        if (targetChannel.type !== ChannelType.GuildText) return replyError(interaction, "Choose a text channel for the ticket panel.");
        const staffRole = interaction.options.getRole("staff_role");
        if (staffRole) {
          config.ticketStaffRoleId = staffRole.id;
          await saveDatabase();
        }
        const panelPayload = buildTicketPanel(interaction.guild, interaction.client.user);
        const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        const permissions = targetChannel.permissionsFor(botMember);
        if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return replyError(interaction, "I need View Channel, Send Messages, and Embed Links permissions in that channel.");
        await targetChannel.send(panelPayload);
        return interaction.reply({ content: "✅ Ticket portal published in " + targetChannel.toString() + ".", ephemeral: true });
      }

      const ticketData = getTicketData(interaction.channel);
      const isTicketChannel = Boolean(ticketData);
      const staffMember = ticketActor;
      const staffAccess = isTicketStaff(interaction, config, staffMember);

      if (sub !== "panel" && !isTicketChannel) {
        return replyError(interaction, "Use this command inside an Exile AS ticket channel.");
      }

      if (sub === "claim") {
        if (!staffAccess) return replyError(interaction, "Only ticket staff can claim tickets.");
        if (ticketData.claimedBy && ticketData.claimedBy !== interaction.user.id) {
          return replyError(interaction, "This ticket is already claimed by <@" + ticketData.claimedBy + ">.");
        }
        await setTicketData(interaction.channel, { claimedBy: interaction.user.id });
        return interaction.reply({ content: "✅ You claimed this ticket.", ephemeral: true });
      }

      if (sub === "unclaim") {
        if (!staffAccess) return replyError(interaction, "Only ticket staff can unclaim tickets.");
        if (!ticketData.claimedBy) return replyError(interaction, "This ticket is not claimed.");
        if (ticketData.claimedBy !== interaction.user.id &&
            !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
            !isBotOwner(interaction.user.id)) {
          return replyError(interaction, "Only the current claimer or an administrator can unclaim this ticket.");
        }
        await setTicketData(interaction.channel, { claimedBy: null });
        return interaction.reply({ content: "✅ Ticket claim released.", ephemeral: true });
      }

      if (sub === "remove") {
        if (!staffAccess) return replyError(interaction, "Only ticket staff can remove people from tickets.");
        const user = interaction.options.getUser("user", true);
        if (user.id === ticketData.ownerId) return replyError(interaction, "The ticket creator cannot be removed.");
        await interaction.channel.permissionOverwrites.delete(user.id, "Removed from ticket by " + interaction.user.tag);
        return interaction.reply({ content: "✅ Removed " + user.toString() + " from this ticket.", allowedMentions: { users: [user.id], parse: [] } });
      }

      if (sub === "rename") {
        if (!staffAccess) return replyError(interaction, "Only ticket staff can rename tickets.");
        const requested = interaction.options.getString("name", true).toLowerCase()
          .replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
        if (!requested) return replyError(interaction, "Choose a name with letters or numbers.");
        await interaction.channel.setName(requested);
        return interaction.reply({ content: "✅ Ticket renamed to **#" + requested + "**.", ephemeral: true });
      }

      if (sub === "priority") {
        if (!staffAccess) return replyError(interaction, "Only ticket staff can change ticket priority.");
        const priority = interaction.options.getString("level", true);
        await setTicketData(interaction.channel, { priority });
        return interaction.reply({ content: "✅ Ticket priority set to **" + priority + "**.", ephemeral: true });
      }

      if (sub === "info") {
        const current = getTicketData(interaction.channel);
        const info = new EmbedBuilder()
          .setColor(0x6d5dfc)
          .setTitle("Ticket Information")
          .addFields(
            { name: "Owner", value: "<@" + current.ownerId + ">", inline: true },
            { name: "Status", value: current.status === "closed" ? "🔒 Closed" : "🟢 Open", inline: true },
            { name: "Priority", value: current.priority, inline: true },
            { name: "Claimed by", value: current.claimedBy ? "<@" + current.claimedBy + ">" : "Unclaimed", inline: true }
          )
          .setFooter({ text: "Exile AS 1.9+ • Ticket Management" });
        return interaction.reply({ embeds: [info], ephemeral: true, allowedMentions: { parse: [] } });
      }

      if (sub === "close") {
        if (interaction.user.id !== ticketData.ownerId && !staffAccess) {
          return replyError(interaction, "Only the ticket creator or ticket staff can close this ticket.");
        }
        if (ticketData.status === "closed") return replyError(interaction, "This ticket is already closed.");
        const reason = interaction.options.getString("reason")?.trim();
        await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, {
          SendMessages: false,
          AddReactions: false
        });
        await setTicketData(interaction.channel, { status: "closed" });
        if (!interaction.channel.name.startsWith("closed-")) {
          await interaction.channel.setName(("closed-" + interaction.channel.name).slice(0, 100));
        }
        await archiveTicketTranscript(interaction.channel, interaction.user.id, reason || "Closed using /ticket close.");
        await interaction.reply({
          content: "🔒 Ticket closed. Its transcript has been saved in #ticket-transcripts, and this channel will now be deleted.",
          allowedMentions: { users: [interaction.user.id], parse: [] }
        });
        await interaction.channel.delete("Exile AS ticket archived and automatically deleted after closure");
        return;
      }

      if (sub === "reopen") {
        if (!staffAccess) return replyError(interaction, "Only ticket staff can reopen tickets.");
        if (ticketData.status !== "closed") return replyError(interaction, "This ticket is already open.");
        await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true
        });
        await setTicketData(interaction.channel, { status: "open" });
        if (interaction.channel.name.startsWith("closed-")) {
          await interaction.channel.setName(interaction.channel.name.slice(7));
        }
        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("px_ticket_close").setLabel("Close ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger)
        );
        await interaction.channel.send({ content: "🔓 Ticket reopened by " + interaction.user.toString() + ".", components: [closeRow], allowedMentions: { users: [interaction.user.id], parse: [] } });
        return interaction.reply({ content: "✅ Ticket reopened.", ephemeral: true });
      }

      if (sub === "transcript") {
        if (!staffAccess && interaction.user.id !== ticketData.ownerId) {
          return replyError(interaction, "Only the ticket creator or ticket staff can export this transcript.");
        }
        await interaction.deferReply({ ephemeral: true });
        try {
          const transcript = await buildTicketTranscript(interaction.channel);
          const attachment = new AttachmentBuilder(Buffer.from(transcript, "utf8"), {
            name: "paradoxplus-" + interaction.channel.id + "-transcript.txt"
          });
          return interaction.editReply({ content: "📄 Transcript generated (up to the latest 1,000 messages).", files: [attachment] });
        } catch (error) {
          console.error("[Tickets] Transcript generation failed:", error);
          return interaction.editReply("I couldn't generate the transcript. Check that I have View Channel, Read Message History, and Attach Files permissions.");
        }
      }

      if (sub === "add") {
        if (!allowed) return replyError(interaction, "Only ticket staff or server managers can add members to tickets.");
        const ownerId = interaction.channel?.topic?.match(/^paradoxplus-ticket:(\d+)$/)?.[1];
        if (!ownerId) return replyError(interaction, "Use /ticket add inside an open Exile AS ticket channel.");
        const user = interaction.options.getUser("user", true);
        if (user.bot) return replyError(interaction, "Bots cannot be added to support tickets.");
        try {
          await interaction.channel.permissionOverwrites.edit(user.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true
          }, { reason: "Added to ticket by " + interaction.user.tag });
          return interaction.reply({ content: "✅ Added " + user.toString() + " to this ticket.", allowedMentions: { users: [user.id], parse: [] } });
        } catch (error) {
          console.error("[Tickets] Could not add member:", error);
          return replyError(interaction, "I couldn't add that member. Check my Manage Channels permission.");
        }
      }
    }

    if (interaction.commandName === "ticket-panel") {
      const canPublish = isBotOwner(interaction.user.id) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
      if (!canPublish) return replyError(interaction, "You need Manage Channels or Administrator to publish a ticket panel.");
      const targetChannel = interaction.options.getChannel("channel", true);
      if (targetChannel.guildId !== interaction.guildId || targetChannel.type !== ChannelType.GuildText) {
        return replyError(interaction, "Choose a text channel from this server.");
      }
      const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
      const permissions = targetChannel.permissionsFor(botMember);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return replyError(interaction, "I need View Channel, Send Messages, and Embed Links permissions in that channel.");
      }
      const panelPayload = buildTicketPanel(interaction.guild, interaction.client.user);
      await targetChannel.send(panelPayload);
      return interaction.reply({ content: "✅ Premium ticket portal published in " + targetChannel.toString() + ".", ephemeral: true });
    }

    if (interaction.commandName === "selfroles") {
      if (interaction.guildId !== "1572968551973654528") {
        return replyError(interaction, "This self-role panel is configured for the Paradoxplus main server only.");
      }
      const canPublish = isBotOwner(interaction.user.id) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
      if (!canPublish) return replyError(interaction, "You need Manage Channels or Administrator to publish the self-role panel.");
      const targetChannel = interaction.options.getChannel("channel", true);
      if (targetChannel.guildId !== interaction.guildId || targetChannel.type !== ChannelType.GuildText) {
        return replyError(interaction, "Choose a text channel from this server.");
      }
      const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
      const permissions = targetChannel.permissionsFor(botMember);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.EmbedLinks])) {
        return replyError(interaction, "I need View Channel, Send Messages, Read Message History, Add Reactions, Embed Links, and Manage Roles in that channel.");
      }
      const missingRoles = Object.values(SELF_ROLE_MAP).filter(roleId => !interaction.guild.roles.cache.has(roleId));
      if (missingRoles.length) return replyError(interaction, "One or more configured self-roles no longer exist: " + missingRoles.join(", "));
      const content = "**<a:rflx_s:1573218769386471526> <a:rflx_e:1573218771622174742> <a:rflx_l:1573218774700523530> <a:rflx_f:1573218776563060746>   <a:rflx_r:1573218779914313829> <a:rflx_o:1573218783504375869> <a:rflx_l:1573218774700523530> <a:rflx_e:1573218771622174742> <a:rflx_s:1573218769386471526> **\n\n" +
        "<:ou_clown:1573218793520631828> <:arrow_yellow:1573218795319730176> [ <@&1572968552024121478> ]\n" +
        "<:yt:1573218797018550362> <:arrow_yellow:1573218795319730176> [ <@&1572968552024121480> ]\n" +
        "<a:RedCrown:1573218800814391387> <:arrow_yellow:1573218795319730176> [ <@&1572968552024121479> ]\n" +
        "<:Netherite_Sword:1573219700354064402> <:arrow_yellow:1573218795319730176> [ <@&1572968552024121481> ]\n\n" +
        "<a:ak47_animated:1573219706167365663> **Take Your Roles From Here** <:45499gun:1573219703143403550>";
      const panelEmbed = new EmbedBuilder()
        .setColor(0x7c5cff)
        .setDescription(content);
      await interaction.deferReply({ ephemeral: true });
      try {
        const panelMessage = await targetChannel.send({ embeds: [panelEmbed], allowedMentions: { parse: [] } });
        await panelMessage.react("<:ou_clown:1573218793520631828>");
        await panelMessage.react("<:yt:1573218797018550362>");
        await panelMessage.react("<a:RedCrown:1573218800814391387>");
        await panelMessage.react("<:Netherite_Sword:1573219700354064402>");
        const config = getGuildConfig(interaction.guildId);
        config.selfRolePanel = { channelId: targetChannel.id, messageId: panelMessage.id, updatedAt: new Date().toISOString() };
        await saveDatabase();
        return interaction.editReply("✅ Self-role panel published in " + targetChannel.toString() + ". Members can click any of the four emojis to add or remove the matching role.");
      } catch (error) {
        console.error("[SelfRoles] Could not publish panel:", error);
        return interaction.editReply("I couldn't publish the panel or add its reactions. Check the channel permissions and that the custom emojis are available to the bot.");
      }
    }

    if (interaction.commandName === "tag") {
      if (!isBotOwner(interaction.user.id)) {
        return replyError(interaction, "Only the Paradox • Core bot owner can run a team-wide nickname tag.");
      }
      if (interaction.guildId !== "1572968551973654528") {
        return replyError(interaction, "This command is configured for the Paradoxplus main server only.");
      }
      if (interaction.options.getSubcommand() !== "all") return;
      const selectedRole = interaction.options.getRole("role", true);
      if (!interaction.options.getBoolean("confirm", true)) {
        return replyError(interaction, "No changes were made. Run /tag all again with confirm set to true.");
      }

      await interaction.deferReply({ ephemeral: true });
      const prefix = "! Σ᙭ヽ ";
      let members;
      try {
        members = await interaction.guild.members.fetch();
      } catch (error) {
        console.error("[TagAll] Could not fetch all guild members:", error);
        return interaction.editReply("I couldn't load the full member list. No nicknames were changed.");
      }

      let changed = 0;
      let alreadyTagged = 0;
      let failed = 0;
      let processed = 0;
      const failures = [];
      const targets = [...members.values()].filter(member =>
        !member.user.bot &&
        member.id !== interaction.guild.ownerId &&
        member.roles.cache.has(selectedRole.id)
      );

      await interaction.editReply("🏷️ Starting ! Σ᙭ヽ tagging for **" + targets.length + "** members with " + selectedRole.toString() + ". Members without that role will not be changed.");
      for (const member of targets) {
        processed++;
        // displayName is Discord's effective server display name (nickname first),
        // unlike user.username, which is the account's original username.
        const originalName = member.displayName || member.nickname || member.user.globalName || member.user.username;
        const currentName = originalName.replace(/^(?:! Σ᙭ヽ |PX ϟ |Exl 么 |𝝨𝝬𝗟 么 )/, "");
        if (originalName.startsWith(prefix)) {
          alreadyTagged++;
          continue;
        }

        const nextName = (prefix + currentName).slice(0, 32);
        try {
          await member.setNickname(nextName, "Apply the ! Σ᙭ヽ team tag to members with role " + selectedRole.name);
          changed++;
        } catch (error) {
          failed++;
          const code = error?.code ?? error?.rawError?.code ?? "unknown";
          const reason = String(error?.message || "Unknown Discord API error").replace(/\s+/g, " ").slice(0, 120);
          failures.push({ id: member.id, name: currentName, code, reason });
          console.error("[TagAll] Nickname update failed for " + member.id + " (code " + code + "):", reason);
        }

        if (processed % 10 === 0 || processed === targets.length) {
          await interaction.editReply("🏷️ **! Σ᙭ヽ team tagging in progress**\nRole: " + selectedRole.toString() + "\nProcessed: **" + processed + "/" + targets.length + "**\nChanged: **" + changed + "** • Already tagged: **" + alreadyTagged + "** • Discord rejected: **" + failed + "**");
        }
      }

      const failureDetails = failures.slice(0, 8).map(item =>
        "• " + item.name + " (<@" + item.id + ">) — code " + item.code + ": " + item.reason
      );
      const moreFailures = failures.length > 8 ? "\n…and **" + (failures.length - 8) + "** more. Check Railway logs for the full list." : "";
      const detailsText = failureDetails.length
        ? "\n\n**Members Discord would not let me edit:**\n" + failureDetails.join("\n") + moreFailures
        : "";
      const result = "✅ **! Σ᙭ヽ team tagging finished**\nRole: " + selectedRole.toString() + "\nEligible members: **" + targets.length + "**\nChanged: **" + changed + "**\nAlready tagged: **" + alreadyTagged + "**\nDiscord rejected: **" + failed + "**\nMembers without the selected role were untouched; bots and the server owner were excluded." + detailsText;
      return interaction.editReply(result.slice(0, 1950));
    }

    if (interaction.commandName === "welcome") {
      if (!isBotOwner(interaction.user.id) &&
          !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
          !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return replyError(interaction, "You need Manage Server or Administrator to configure the welcome message.");
      }
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "message") {
        const nextMessage = interaction.options.getString("text", true).trim();
        if (!nextMessage) return replyError(interaction, "Welcome message cannot be empty.");
        config.welcomeMessage = nextMessage;
        await saveDatabase();
        return interaction.reply({ content: "✅ Welcome message updated. The existing banner is unchanged. Use /welcome test to preview it.", ephemeral: true });
      }
      if (subcommand === "reset") {
        config.welcomeMessage = null;
        await saveDatabase();
        return interaction.reply({ content: "✅ Default welcome message restored. The banner is unchanged.", ephemeral: true });
      }
      if (subcommand === "test") {
        const count = interaction.guild.memberCount;
        const embed = new EmbedBuilder()
          .setColor(0x7c5cff)
          .setAuthor({ name: "Exile AS", iconURL: client.user.displayAvatarURL() })
          .setDescription(buildWelcomeDescription(interaction.guild, interaction.member))
          .setThumbnail(interaction.user.displayAvatarURL({ extension: "png", size: 256 }))
          .setImage(WELCOME_BANNER_URL)
          .setFooter({ text: "Paradox • Core  •  Member #" + count })
          .setTimestamp();
        try {
          await interaction.user.send({ embeds: [embed], allowedMentions: { parse: [] } });
          return interaction.reply({ content: "✦ Welcome preview sent to your DMs.", ephemeral: true });
        } catch {
          return replyError(interaction, "I couldn't DM you. Enable direct messages from server members, then try again.");
        }
      }
    }

    if (interaction.commandName === "prefix") {
      if (!isBotOwner(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return replyError(interaction, "You need Manage Server or Administrator to change the prefix.");
      const nextPrefix = interaction.options.getString("new_prefix", true).trim();
      if (!/^[^\s]{1,5}$/.test(nextPrefix)) return replyError(interaction, "Prefix must be 1–5 characters with no spaces.");
      config.prefix = nextPrefix;
      await saveDatabase();
      return interaction.reply({ content: "✅ Server prefix changed to `" + nextPrefix + "`", ephemeral: true });
    }

    if (interaction.commandName === "recruit") {
      const user = interaction.options.getUser("member", true);
      const target = interaction.guild.members.cache.get(user.id) ?? await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!target) return replyError(interaction, "Member not found in this server.");
      if (target.user.bot) return replyError(interaction, "Bots cannot be recruited.");
      if (target.id === interaction.user.id) return replyError(interaction, "You cannot recruit yourself.");
      if (!isRecruitmentDatabaseReady()) return replyError(interaction, "Recruitment storage is unavailable. Check the PostgreSQL connection.");
      const result = await recordRecruit({ guildId: interaction.guildId, recruitId: target.id, recruiterId: interaction.user.id, source: "slash", originalNickname: target.nickname });
      if (result.duplicate) return replyError(interaction, "That member has already been recorded as a recruit in this server.");
      await applyRecruitPerks(interaction.guild, target);
      const recruitChannel = await interaction.guild.channels.fetch("1572968553617817769").catch(() => null);
      if (!recruitChannel?.isTextBased() || !recruitChannel.permissionsFor(interaction.guild.members.me)?.has(PermissionFlagsBits.SendMessages)) {
        return replyError(interaction, "I cannot access the recruit announcement channel. Check View Channel and Send Messages permissions.");
      }
      await recruitChannel.send({
        embeds: [new EmbedBuilder()
          .setColor("#000000")
          .setImage(RECRUIT_BANNER_URL)
          .setDescription((interaction.guild.emojis.cache.find(emoji => emoji.name === "GreenCrown")?.toString() || ":GreenCrown:") + " **New recruit** " + (interaction.guild.emojis.cache.find(emoji => emoji.name === "GreenCrown")?.toString() || ":GreenCrown:") + "\n\n> " + target.toString() + " joined the team.\n\n<:bluearrow:1573207744171737098> **Recruited by:** " + interaction.user.toString() + "\n<:bluearrow:1573207744171737098> **Total recruits:** `" + result.total + "`")],
        allowedMentions: { users: [target.id, interaction.user.id], parse: [] }
      });
      return interaction.reply({ content: "✅ Recruit announcement posted in " + recruitChannel.toString() + ".", ephemeral: true });
    }
    if (interaction.commandName === "dm-optin" || interaction.commandName === "dm-optout") {
      const enabled = interaction.commandName === "dm-optin";
      config.dmOptIns = config.dmOptIns.filter(id => id !== interaction.user.id);
      if (enabled) config.dmOptIns.push(interaction.user.id);
      await saveDatabase();
      return interaction.reply({ content: enabled ? "✅ You opted in to Paradoxplus server DMs. Use /dm-optout any time to stop." : "✅ You opted out. Paradoxplus will no longer send you server DMs.", ephemeral: true });
    }

    if (interaction.commandName === "dmall") {
      if (!isBotOwner(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "Only the bot owner or a server administrator can use /dmall.", ephemeral: true });
      }
      const content = interaction.options.getString("message", true).trim();
      const confirm = interaction.options.getBoolean("confirm", true);
      if (!confirm) return interaction.reply({ content: "Set confirm to True after reviewing your message. Only opted-in members will receive it.", ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      const result = await sendOptInDmall(interaction.guild, config, content);
      return interaction.editReply("**DMall finished**\nOpted-in recipients processed: **" + result.total + "**\nSent: **" + result.sent + "**\nFailed: **" + result.failed + "**" + (result.capped ? "\nSafety cap: first 100 opted-in members only." : ""));
    }

    if (interaction.commandName === "autoresponder") {
      const sub = interaction.options.getSubcommand();
      const allowed = isBotOwner(interaction.user.id) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
      if (sub !== "list" && !allowed) {
        return interaction.reply({ content: "You need Manage Messages, Manage Server, or Administrator to manage autoresponders.", ephemeral: true });
      }
      if (sub === "list") {
        if (!config.autoresponders.length) {
          return interaction.reply({ content: "No custom autoresponders are configured.", ephemeral: true });
        }
        const lines = config.autoresponders.map((item, index) => `${index + 1}. **Trigger:** ${item.trigger}\n   **Reply:** ${item.response}`);
        return interaction.reply({ content: `**Custom autoresponders**\n${lines.join("\n")}`, ephemeral: true, allowedMentions: { parse: [] } });
      }
      if (sub === "add") {
        const trigger = interaction.options.getString("trigger", true).trim();
        const response = interaction.options.getString("response", true).trim();
        if (trigger.length < 2 || trigger.length > 100) {
          return interaction.reply({ content: "Triggers must be 2–100 characters.", ephemeral: true });
        }
        if (!response || response.length > 1800) {
          return interaction.reply({ content: "Replies must be 1–1800 characters.", ephemeral: true });
        }
        if (config.autoresponders.some(item => item.trigger.toLowerCase() === trigger.toLowerCase())) {
          return interaction.reply({ content: "That trigger already exists. Remove it first if you want to replace it.", ephemeral: true });
        }
        if (config.autoresponders.length >= 25) {
          return interaction.reply({ content: "This server has reached the 25 custom autoresponder limit.", ephemeral: true });
        }
        config.autoresponders.push({ trigger, response });
        await saveDatabase();
        return interaction.reply({ content: `✅ **Autoresponder added**\n**Trigger:** ${trigger}\n**Reply:** ${response}`, ephemeral: true, allowedMentions: { parse: [] } });
      }
      if (sub === "remove") {
        const trigger = interaction.options.getString("trigger", true).trim();
        const before = config.autoresponders.length;
        config.autoresponders = config.autoresponders.filter(item => item.trigger.toLowerCase() !== trigger.toLowerCase());
        if (config.autoresponders.length === before) {
          return interaction.reply({ content: "I couldn't find that exact trigger.", ephemeral: true });
        }
        await saveDatabase();
        return interaction.reply({ content: `🗑️ Removed autoresponder trigger: **${trigger}**`, ephemeral: true, allowedMentions: { parse: [] } });
      }
    }


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
          "`/kick`, `/ban`, `/timeout`, `/untimeout`, `/purge`, `/softban` — moderation actions",
          "`/warn`, `/warnings`, `/clear-warnings`, `/unwarn`, `/strike`, `/strikes`, `/remove-strike` — member records",
          "`/modlog`, `/case`, `/case-reason`, `/note`, `/notes`, `/clear-notes`, `/banlist` — staff records",
          "`/purge-user`, `/purge-bots`, `/purge-links`, `/purge-invites`, `/purge-attachments`, `/purge-embeds`, `/purge-mentions`, `/purge-stickers`, `/purge-contains`, `/clear-reactions` — cleanup",
          "`/hide`, `/show`, `/slowmode-off`, `/set-topic`, `/nick-reset`, `/voice-deafen`, `/voice-undeafen`, `/move-member` — channel and voice tools",
          "`/rank-config` — configure ranks, logs and announcements",
          "Rank roles are detected and synced automatically from the server role order."
        ].join("\n"),
        ephemeral: true
      });
    }

    if (["kick", "ban", "timeout", "untimeout", "purge"].includes(interaction.commandName)) {
      const cmd = interaction.commandName;
      const logModCase = (action, targetId, reason) => {
        const nextId = config.moderationCases.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
        config.moderationCases.unshift({ id: nextId, action, targetId: targetId || null, moderatorId: interaction.user.id, reason: reason || null, timestamp: new Date().toISOString() });
        config.moderationCases = config.moderationCases.slice(0, 500);
      };
      const perm = {kick:PermissionFlagsBits.KickMembers,ban:PermissionFlagsBits.BanMembers,timeout:PermissionFlagsBits.ModerateMembers,untimeout:PermissionFlagsBits.ModerateMembers,purge:PermissionFlagsBits.ManageMessages}[cmd];
      if (!isBotOwner(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) && !interaction.memberPermissions?.has(perm))
        return replyError(interaction, "You don't have permission to use this moderation command.");
      if (cmd === "purge") {
        await interaction.deferReply({ephemeral:true});
        const deleted = await interaction.channel.bulkDelete(interaction.options.getInteger("amount",true), true);
        logModCase("PURGE", null, "Deleted " + deleted.size + " messages in #" + interaction.channel.name);
        await saveDatabase();
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
        logModCase("KICK", user.id, reason);
        await saveDatabase();
        return interaction.editReply(`👢 **${user.tag}** was kicked. Reason: ${reason}`);
      }
      if (cmd === "ban") {
        if (!target.bannable) return replyError(interaction,"I can't ban that member. Check my Ban Members permission and role position.");
        await target.ban({reason});
        logModCase("BAN", user.id, reason);
        await saveDatabase();
        return interaction.editReply(`🔨 **${user.tag}** was banned. Reason: ${reason}`);
      }
      if (cmd === "timeout") {
        if (isAntiNukeWhitelisted(interaction.guildId, user.id) || isBotOwner(user.id)) return replyError(interaction, "🛡️ That member is protected as a bot owner / trusted owner and cannot be timed out.");
        if (actor.id !== interaction.guild.ownerId && target.roles.highest.comparePositionTo(actor.roles.highest) >= 0) return replyError(interaction, "🛡️ You cannot timeout a member whose highest role is equal to or higher than yours.");
        const mins=interaction.options.getInteger("minutes",true);
        if (!target.moderatable) return replyError(interaction,"I can't timeout that member.");
        await target.timeout(mins*60000,reason);
        logModCase("TIMEOUT", user.id, reason);
        await saveDatabase();
        return interaction.editReply(`⏳ **${user.tag}** was timed out for **${mins} minutes**. Reason: ${reason}`);
      }
      if (!target.moderatable) return replyError(interaction,"I can't remove that member's timeout.");
      if (!target.communicationDisabledUntilTimestamp) return replyError(interaction,"That member isn't timed out.");
      await target.timeout(null,reason);
      logModCase("UNTIMEOUT", user.id, reason);
      await saveDatabase();
      return interaction.editReply(`✅ Removed the timeout from **${user.tag}**.`);
    }

    if (interaction.commandName === "strikes") {
      const user = interaction.options.getUser("member") || interaction.user;
      if (user.id !== interaction.user.id && !isBotOwner(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return replyError(interaction, "Only staff can inspect another member's strike record.");
      const active = config.strikes.filter(item => item.memberId === user.id);
      const history = config.strikeHistory.filter(item => item.memberId === user.id).slice(0, 8);
      const lines = history.map(item => "• **#" + item.id + "** " + item.reason.slice(0, 140) + " — <t:" + Math.floor(new Date(item.timestamp).getTime()/1000) + ":R>" + (item.removedAt ? " • Revoked" : ""));
      const embed = new EmbedBuilder().setColor(0x7c5cff).setAuthor({name:"PARADOXPLUS • MODERATION",iconURL:client.user.displayAvatarURL()})
        .setTitle("📋 Strike record")
        .setDescription("**Member:** <@" + user.id + ">\n**Active strikes:** **" + active.length + "**\n\n**Recent strike history**\n" + (lines.join("\n") || "No strike history found."))
        .setFooter({text:"Revoked strikes remain visible in the audit history."}).setTimestamp();
      return interaction.reply({embeds:[embed],ephemeral:true,allowedMentions:{parse:[]}});
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
        const reviewChannel = await interaction.guild.channels.fetch("1573000934680699023").catch(() => null);
        if (!reviewChannel?.isTextBased()) return interaction.editReply("⚠️ Strike removal recorded, but I couldn't access the staff review channel.");
        await reviewChannel.send({ embeds: [embed], allowedMentions: { parse: [], users: [] } });
        const remaining = config.strikes.filter(item => item.memberId === target.id).length;
        return interaction.editReply("✅ Removed " + amount + " strike(s). Remaining active strikes: **" + remaining + "**. Logged in the staff review channel.");
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
        const reviewChannel = await interaction.guild.channels.fetch("1573000934680699023").catch(() => null);
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
        const item={id:config.moderationCases.reduce((max,row)=>Math.max(max,Number(row.id)||0),0)+1,action,targetId,moderatorId:interaction.user.id,reason:reason||null,timestamp:new Date().toISOString()};
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
        const actorIsAdmin = isBotOwner(interaction.user.id) || interaction.guild.ownerId === interaction.user.id || actor.permissions.has(PermissionFlagsBits.Administrator);
        if(target.id === interaction.guild.ownerId || !target.manageable)return replyError(interaction,"I can't manage that member. Move my bot role above the member's highest role.");
        if(role.managed || (!actorIsAdmin && role.position >= actor.roles.highest.position))return replyError(interaction,"That role is managed or above your highest role.");
        if(!bot.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable || role.position >= bot.roles.highest.position)return replyError(interaction,"I can't manage that role. Give me Manage Roles and move my bot role above it.");
        if(cmd==="role-add") {
          if(target.roles.cache.has(role.id))return replyError(interaction,"That member already has this role.");
          await target.roles.add(role,`Role added by ${interaction.user.tag}`);
        } else {
          if(!target.roles.cache.has(role.id))return replyError(interaction,"That member does not have this role.");
          await target.roles.remove(role,`Role removed by ${interaction.user.tag}`);
        }
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
        const embed = buildServerInfoEmbed(interaction.guild, interaction.user);
        return interaction.reply({ embeds: [embed], ephemeral: false, allowedMentions: { parse: [] } });
      }
      if(cmd==="modstats"){
        if(!has(PermissionFlagsBits.ModerateMembers))return replyError(interaction,"You need Moderate Members or Administrator.");
        const counts={}; for(const c of config.moderationCases)counts[c.action]=(counts[c.action]||0)+1;
        const summary=Object.entries(counts).map(([k,v])=>`• **${k}**: ${v}`).join("\n")||"No moderation cases yet.";
        return interaction.reply({content:`**Paradoxplus moderation statistics**\nTotal cases: **${config.moderationCases.length}**\nWarnings recorded: **${config.warnings.length}**\n\n${summary}`,ephemeral:true});
      }
    }


    const extraModCommands = ["modlog","case","case-reason","note","notes","clear-notes","softban","purge-user","purge-bots","purge-links","purge-invites","purge-attachments","purge-embeds","purge-mentions","purge-stickers","purge-contains","hide","show","voice-deafen","voice-undeafen","move-member","nick-reset","banlist","slowmode-off","unwarn","clear-reactions","set-topic"];
    if (extraModCommands.includes(interaction.commandName)) {
      const cmd = interaction.commandName;
      const admin = isBotOwner(interaction.user.id) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      const has = permission => admin || interaction.memberPermissions?.has(permission);
      if (!Array.isArray(config.notes)) config.notes = [];
      const record = (action, targetId, reason) => {
        const nextId = config.moderationCases.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
        const item = { id: nextId, action, targetId: targetId || null, moderatorId: interaction.user.id, reason: reason || null, timestamp: new Date().toISOString() };
        config.moderationCases.unshift(item);
        config.moderationCases = config.moderationCases.slice(0, 500);
        return item;
      };
      const requireMember = async user => {
        const target = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!target) return { error: "That member isn't in this server." };
        const actor = await interaction.guild.members.fetch(interaction.user.id);
        if (target.id === interaction.user.id || target.id === client.user.id) return { error: "You can't use this action on yourself or the bot." };
        if (!canActOnTarget(actor, target, interaction.guild)) return { error: "That member has an equal or higher role than you." };
        const bot = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        if (target.roles.highest.comparePositionTo(bot.roles.highest) >= 0) return { error: "My highest role must be above the target member's highest role." };
        return { target };
      };
      if (["modlog","case","case-reason"].includes(cmd) && !has(PermissionFlagsBits.ModerateMembers)) return replyError(interaction, "You need Moderate Members or Administrator.");
      if (cmd === "modlog") {
        const user = interaction.options.getUser("member");
        const rows = config.moderationCases.filter(item => !user || item.targetId === user.id).slice(0, 15);
        const lines = rows.map(item => "• **#" + item.id + " " + item.action + "** — " + (item.reason || "No reason") + " — <t:" + Math.floor(new Date(item.timestamp).getTime()/1000) + ":R> — by <@" + item.moderatorId + ">");
        return interaction.reply({ content: "**Moderation log" + (user ? " — " + user.tag : "") + "**\n" + (lines.join("\n") || "No cases found."), ephemeral: true, allowedMentions: { parse: [] } });
      }
      if (cmd === "case" || cmd === "case-reason") {
        const id = interaction.options.getInteger("case_id", true);
        const item = config.moderationCases.find(row => Number(row.id) === id);
        if (!item) return replyError(interaction, "I couldn't find that moderation case.");
        if (cmd === "case") return interaction.reply({ content: "**Case #" + item.id + " — " + item.action + "**\nMember: " + (item.targetId ? "<@" + item.targetId + ">" : "Not specified") + "\nModerator: <@" + item.moderatorId + ">\nReason: " + (item.reason || "No reason recorded") + "\nDate: <t:" + Math.floor(new Date(item.timestamp).getTime()/1000) + ":F>", ephemeral: true, allowedMentions: { parse: [] } });
        item.reason = interaction.options.getString("reason", true).trim();
        item.reasonUpdatedAt = new Date().toISOString();
        item.reasonUpdatedBy = interaction.user.id;
        await saveDatabase();
        return interaction.reply({ content: "✅ Updated the reason for case #" + id + ".", ephemeral: true });
      }
      if (cmd === "note" || cmd === "notes" || cmd === "clear-notes") {
        if (!has(PermissionFlagsBits.ModerateMembers)) return replyError(interaction, "You need Moderate Members or Administrator.");
        const user = interaction.options.getUser("member", true);
        if (cmd === "note") {
          const note = interaction.options.getString("note", true).trim();
          config.notes.unshift({ id: config.notes.reduce((m,n)=>Math.max(m,Number(n.id)||0),0)+1, memberId: user.id, moderatorId: interaction.user.id, note, timestamp: new Date().toISOString() });
          config.notes = config.notes.slice(0, 1000);
          record("STAFF_NOTE", user.id, note.slice(0, 400));
          await saveDatabase();
          return interaction.reply({ content: "📝 Private staff note added for **" + user.tag + "**.", ephemeral: true });
        }
        const rows = config.notes.filter(item => item.memberId === user.id);
        if (cmd === "notes") {
          const lines = rows.slice(0, 12).map(item => "• **#" + item.id + "** " + item.note + " — by <@" + item.moderatorId + "> <t:" + Math.floor(new Date(item.timestamp).getTime()/1000) + ":R>");
          return interaction.reply({ content: "**Private staff notes — " + user.tag + "**\n" + (lines.join("\n") || "No staff notes found."), ephemeral: true, allowedMentions: { parse: [] } });
        }
        if (!rows.length) return replyError(interaction, "That member has no staff notes.");
        config.notes = config.notes.filter(item => item.memberId !== user.id);
        record("CLEAR_NOTES", user.id, "Cleared " + rows.length + " staff notes");
        await saveDatabase();
        return interaction.reply({ content: "🗑️ Cleared " + rows.length + " staff notes for **" + user.tag + "**.", ephemeral: true });
      }
      if (cmd === "softban") {
        if (!has(PermissionFlagsBits.BanMembers)) return replyError(interaction, "You need Ban Members or Administrator.");
        const user = interaction.options.getUser("member", true);
        const checked = await requireMember(user);
        if (checked.error) return replyError(interaction, checked.error);
        if (!checked.target.bannable) return replyError(interaction, "I can't ban that member. Check my role position and Ban Members permission.");
        const reason = interaction.options.getString("reason") || "Softban by " + interaction.user.tag;
        await interaction.deferReply({ ephemeral: true });
        await checked.target.ban({ deleteMessageSeconds: 86400, reason: reason.slice(0, 480) });
        await interaction.guild.bans.remove(user.id, "Softban completed by " + interaction.user.tag);
        record("SOFTBAN", user.id, reason);
        await saveDatabase();
        return interaction.editReply("✅ Softbanned **" + user.tag + "**. Recent message history was deleted and the ban was immediately lifted.");
      }
      const purgeRules = {
        "purge-user": message => message.author.id === interaction.options.getUser("member", true).id,
        "purge-bots": message => message.author.bot,
        "purge-links": message => /https?:\/\/|www\./i.test(message.content),
        "purge-invites": message => /discord(?:app)?\.com\/invite\/|discord\.gg\//i.test(message.content),
        "purge-attachments": message => message.attachments.size > 0,
        "purge-embeds": message => message.embeds.length > 0,
        "purge-mentions": message => message.mentions.users.size > 0 || message.mentions.roles.size > 0,
        "purge-stickers": message => message.stickers.size > 0,
        "purge-contains": message => message.content.toLowerCase().includes(interaction.options.getString("text", true).toLowerCase())
      };
      if (Object.prototype.hasOwnProperty.call(purgeRules, cmd)) {
        if (!has(PermissionFlagsBits.ManageMessages)) return replyError(interaction, "You need Manage Messages or Administrator.");
        const amount = interaction.options.getInteger("amount", true);
        const channel = interaction.channel;
        if (!channel?.messages?.fetch || !channel.bulkDelete) return replyError(interaction, "This channel doesn't support message cleanup.");
        await interaction.deferReply({ ephemeral: true });
        const recent = await channel.messages.fetch({ limit: 100 });
        const selected = recent.filter(message => !message.pinned && purgeRules[cmd](message)).first(amount);
        if (!selected.length) return interaction.editReply("No matching recent messages were found.");
        const deleted = await channel.bulkDelete(selected, true);
        record(cmd.toUpperCase().replace(/-/g,"_"), null, "Deleted " + deleted.size + " messages in #" + channel.name);
        await saveDatabase();
        return interaction.editReply("🧹 Deleted **" + deleted.size + "** matching messages. Only the latest 100 messages were checked; messages older than 14 days can't be bulk-deleted.");
      }
      if (cmd === "hide" || cmd === "show") {
        if (!has(PermissionFlagsBits.ManageChannels)) return replyError(interaction, "You need Manage Channels or Administrator.");
        const channel = interaction.options.getChannel("channel") || interaction.channel;
        if (!channel?.permissionOverwrites?.edit) return replyError(interaction, "That channel doesn't support visibility overrides.");
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: cmd === "hide" ? false : null }, { reason: cmd + " by " + interaction.user.tag });
        record(cmd.toUpperCase(), null, channel.name);
        await saveDatabase();
        return interaction.reply({ content: cmd === "hide" ? "🙈 Hidden " + channel + " from @everyone." : "👀 Restored inherited visibility for " + channel + ".", ephemeral: false });
      }
      if (["voice-deafen","voice-undeafen","move-member"].includes(cmd)) {
        const needed = cmd === "move-member" ? PermissionFlagsBits.MoveMembers : PermissionFlagsBits.DeafenMembers;
        if (!has(needed)) return replyError(interaction, "You don't have the required voice moderation permission.");
        const user = interaction.options.getUser("member", true);
        const checked = await requireMember(user);
        if (checked.error) return replyError(interaction, checked.error);
        const target = checked.target;
        if (!target.voice.channel) return replyError(interaction, "That member isn't in a voice channel.");
        if (cmd === "move-member") {
          const destination = interaction.options.getChannel("channel", true);
          if (!destination.isVoiceBased()) return replyError(interaction, "Choose a voice or stage channel.");
          await target.voice.setChannel(destination, "Moved by " + interaction.user.tag);
          record("MOVE_MEMBER", user.id, "Moved to " + destination.name);
          await saveDatabase();
          return interaction.reply({ content: "🔀 Moved **" + user.tag + "** to " + destination + ".", ephemeral: false });
        }
        const deaf = cmd === "voice-deafen";
        await target.voice.setDeaf(deaf, interaction.options.getString("reason") || cmd + " by " + interaction.user.tag);
        record(cmd.toUpperCase().replace(/-/g,"_"), user.id, interaction.options.getString("reason") || null);
        await saveDatabase();
        return interaction.reply({ content: deaf ? "🔇 Server-deafened **" + user.tag + "**." : "🔊 Removed server deafen from **" + user.tag + "**.", ephemeral: false });
      }
      if (cmd === "nick-reset") {
        if (!has(PermissionFlagsBits.ManageNicknames)) return replyError(interaction, "You need Manage Nicknames or Administrator.");
        const user = interaction.options.getUser("member", true);
        const checked = await requireMember(user);
        if (checked.error) return replyError(interaction, checked.error);
        if (!checked.target.manageable) return replyError(interaction, "I can't manage that member's nickname. Check my role position.");
        await checked.target.setNickname(null, "Nickname reset by " + interaction.user.tag);
        record("NICK_RESET", user.id, "Nickname reset");
        await saveDatabase();
        return interaction.reply({ content: "✅ Reset **" + user.tag + "**'s server nickname.", ephemeral: true });
      }
      if (cmd === "banlist") {
        if (!has(PermissionFlagsBits.BanMembers)) return replyError(interaction, "You need Ban Members or Administrator.");
        await interaction.deferReply({ ephemeral: true });
        const bans = await interaction.guild.bans.fetch();
        const lines = bans.first(20).map(entry => "• **" + entry.user.tag + "** (" + entry.user.id + ") — " + (entry.reason || "No reason recorded"));
        return interaction.editReply("**Server ban list — " + bans.size + " total**\n" + (lines.join("\n") || "No active bans.") + (bans.size > 20 ? "\nShowing the latest 20 entries." : ""));
      }
      if (cmd === "slowmode-off") {
        if (!has(PermissionFlagsBits.ManageChannels)) return replyError(interaction, "You need Manage Channels or Administrator.");
        const channel = interaction.options.getChannel("channel") || interaction.channel;
        if (typeof channel?.setRateLimitPerUser !== "function") return replyError(interaction, "That channel doesn't support slowmode.");
        await channel.setRateLimitPerUser(0, "Slowmode disabled by " + interaction.user.tag);
        record("SLOWMODE_OFF", null, channel.name);
        await saveDatabase();
        return interaction.reply({ content: "🐢 Slowmode disabled in " + channel + ".", ephemeral: false });
      }
      if (cmd === "unwarn") {
        if (!has(PermissionFlagsBits.ModerateMembers)) return replyError(interaction, "You need Moderate Members or Administrator.");
        const user = interaction.options.getUser("member", true);
        const warningId = interaction.options.getInteger("warning_id", true);
        const reason = interaction.options.getString("reason", true).trim();
        const warning = config.warnings.find(item => item.memberId === user.id && Number(item.id) === warningId);
        if (!warning) return replyError(interaction, "I couldn't find that warning ID for this member.");
        config.warnings = config.warnings.filter(item => item !== warning);
        const c = record("UNWARN", user.id, "Removed warning #" + warningId + ": " + reason);
        warning.removedAt = new Date().toISOString();
        warning.removedBy = interaction.user.id;
        warning.removalReason = reason;
        config.warningHistory.unshift(warning);
        c.warningId = warningId;
        await saveDatabase();
        return interaction.reply({ content: "✅ Removed warning #" + warningId + " for **" + user.tag + "**. The audit record was preserved.", ephemeral: true });
      }
      if (cmd === "clear-reactions") {
        if (!has(PermissionFlagsBits.ManageMessages)) return replyError(interaction, "You need Manage Messages or Administrator.");
        const messageId = interaction.options.getString("message_id", true).trim();
        if (!/^\d{17,20}$/.test(messageId)) return replyError(interaction, "Enter a valid Discord message ID.");
        const targetMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
        if (!targetMessage) return replyError(interaction, "I couldn't find that message in this channel.");
        await targetMessage.reactions.removeAll();
        record("CLEAR_REACTIONS", null, "Message " + messageId);
        await saveDatabase();
        return interaction.reply({ content: "🧽 Removed all reactions from that message.", ephemeral: true });
      }
      if (cmd === "set-topic") {
        if (!has(PermissionFlagsBits.ManageChannels)) return replyError(interaction, "You need Manage Channels or Administrator.");
        const channel = interaction.options.getChannel("channel", true);
        const topic = interaction.options.getString("topic", true);
        if (typeof channel.setTopic !== "function") return replyError(interaction, "Choose a text channel.");
        await channel.setTopic(topic, "Topic updated by " + interaction.user.tag);
        record("SET_TOPIC", null, channel.name + ": " + topic.slice(0, 300));
        await saveDatabase();
        return interaction.reply({ content: "✅ Updated the topic for " + channel + ".", ephemeral: true });
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

const DEFAULT_PREFIX = ".";
const prefixEmbed = (title, description) => new EmbedBuilder()
  .setColor(0x7c5cff)
  .setAuthor({ name: "ＰＡＲＡＤＯＸＰＬＵＳ  •  SYSTEM", iconURL: client.user.displayAvatarURL() })
  .setTitle("✦ " + title)
  .setDescription(description)
  .setFooter({ text: "PARADOXPLUS  •  Premium rank & moderation system" })
  .setTimestamp();
const mentionedId = (value, role = false) => value?.match(role ? /^<@&(\d+)>$/ : /^<@!?(\d+)>$/)?.[1] || null;

async function applyRecruitPerks(guild, target) {
  const roleIds = ["1572968552208797698"];
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  const results = { role: false, nickname: false, errors: [] };
  let rolesAdded = 0;
  for (const roleId of roleIds) {
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) { results.errors.push('Recruit role <@&' + roleId + '> was not found.'); continue; }
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= botMember.roles.highest.position) {
      results.errors.push('Cannot assign <@&' + roleId + '>; check Manage Roles and role hierarchy.');
      continue;
    }
    try { await target.roles.add(role, 'Paradoxplus recruitment reward'); rolesAdded++; }
    catch (error) { results.errors.push('Role <@&' + roleId + '> assignment failed: ' + (error.message || 'check permissions.')); }
  }
  results.role = rolesAdded === roleIds.length;
  // Preserve the member's current server nickname/display name; never replace it with their account username.
  const currentDisplayName = target.displayName || target.nickname || target.user.globalName || target.user.username;
  const baseDisplayName = currentDisplayName.replace(/^(?:Exl 么 |PX ϟ |𝝨𝝬𝗟 么 )/, "");
  const desiredNickname = ("! Σ᙭ヽ " + baseDisplayName).slice(0, 32);
  if (!botMember.permissions.has(PermissionFlagsBits.ManageNicknames) && !botMember.permissions.has(PermissionFlagsBits.Administrator)) {
    results.errors.push('I need Manage Nicknames to set the recruit\'s server nickname.');
  } else if (target.roles.highest.position >= botMember.roles.highest.position && guild.ownerId !== target.id) {
    results.errors.push('I cannot change this member\'s nickname because their highest role is equal to or above mine.');
  } else {
    try { await target.setNickname(desiredNickname, 'Apply ! Σ᙭ヽ recruitment nickname'); results.nickname = true; }
    catch (error) { results.errors.push('Nickname update failed: ' + (error.message || 'check Manage Nicknames and role hierarchy.')); }
  }
  return results;
}
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  const config = getGuildConfig(message.guild.id);
  const prefix = typeof config.prefix === "string" && config.prefix.length >= 1 && config.prefix.length <= 5 ? config.prefix : DEFAULT_PREFIX;
  if (!message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  let command = (args.shift() || "").toLowerCase();
  if (command === "si") command = "serverinfo";
  if (command === "role") {
    const subcommand = (args.shift() || "").toLowerCase();
    if (subcommand === "add" || subcommand === "give") command = "role-add";
    else if (subcommand === "remove" || subcommand === "take" || subcommand === "revoke") command = "role-remove";
    else command = "role-help";
  } else if (command === "addrole" || command === "giverole") command = "role-add";
  else if (command === "removerole" || command === "takerole") command = "role-remove";
  if (!command) return;
  // Do not create a Discord message reference here: the command message may
  // have been deleted by moderation before this response is sent.
  const send = (title, description) => message.channel.send({
    embeds: [prefixEmbed(title, description)],
    allowedMentions: { repliedUser: false, parse: [] }
  }).catch(error => {
    console.error("[PrefixCommand] Could not send command response:", error);
    return null;
  });
  const fail = text => send("⚠️ Command error", text);
  try {
    if (command === "autoban") {
      if (!isBotOwner(message.author.id)) return fail("⛔ Only the bot owner (fearless1.dll) can manage the autoban list. Server owners, administrators, and top roles cannot use this command.");
      const sub = (args.shift() || "").toLowerCase();
      if (!Array.isArray(config.autobanList)) config.autobanList = [];
      if (sub === "list") {
        if (!config.autobanList.length) return send("🛡️ AutoBan List", "The autoban list is currently empty.");
        const rows = config.autobanList.slice(0, 25).map((entry, index) =>
          "**" + (index + 1) + ".** <@" + entry.userId + "> — `" + entry.userId + "`" +
          (entry.reason ? "\nReason: " + String(entry.reason).slice(0, 180) : "")
        );
        return send("🛡️ AutoBan List", rows.join("\n") + (config.autobanList.length > 25 ? "\n…and " + (config.autobanList.length - 25) + " more." : ""));
      }
      if (sub === "add") {
        const token = args.shift() || "";
        const user    if (command === "backup") {
      if (!isBotOwner(message.author.id)) return fail("This backup command is restricted to the bot owner.");
      try {
        await saveDatabase();
        const entries = [];
        let volumeFileCount = 0;
        async function collectBackupFiles(directory, relative = "") {
          const items = await fs.readdir(directory, { withFileTypes: true });
          for (const item of items) {
            if (!relative && item.name === "backups") continue;
            const absolute = path.join(directory, item.name);
            const rel = path.posix.join(relative.split(path.sep).join("/"), item.name);
            if (item.isDirectory()) {
              await collectBackupFiles(absolute, rel);
            } else if (item.isFile()) {
              entries.push({ name: "persistent-volume/" + rel, data: await fs.readFile(absolute) });
              volumeFileCount++;
            }
          }
        }
        await collectBackupFiles(DATA_DIR);

        const snapshot = await exportDatabaseSnapshot();
        entries.push({
          name: "paradoxplus-postgresql-backup.json",
          data: Buffer.from(JSON.stringify(snapshot, null, 2), "utf8")
        });
        const createdAt = new Date().toISOString();
        entries.push({
          name: "BACKUP-README.txt",
          data: Buffer.from(
            "PARADOX • CORE FULL BACKUP\n" +
            "Created: " + createdAt + "\n" +
            "Persistent volume files: " + volumeFileCount + "\n" +
            "PostgreSQL: exported successfully\n" +
            "Environment variables, Discord tokens, and hosting credentials are intentionally excluded.\n" +
            "Restore the persistent-volume files to /app/data and import the PostgreSQL JSON using the bot's supported restore workflow.\n",
            "utf8"
          )
        });

        const archive = createZip(entries);
        const backupDir = path.join(DATA_DIR, "backups");
        await fs.mkdir(backupDir, { recursive: true });
        const archivePath = path.join(backupDir, "Paradoxplus-Full-Backup.zip");
        const metadataPath = path.join(backupDir, "download.json");
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
        const tempArchivePath = archivePath + ".tmp";
        await fs.writeFile(tempArchivePath, archive);
        await fs.rename(tempArchivePath, archivePath);
        await fs.writeFile(metadataPath, JSON.stringify({
          tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
          expiresAt,
          filename: "Paradoxplus-Full-Backup.zip",
          size: archive.length,
          createdAt
        }, null, 2));

        const configuredDomain = process.env.BACKUP_PUBLIC_URL ||
          (process.env.RAILWAY_PUBLIC_DOMAIN
            ? "https://" + process.env.RAILWAY_PUBLIC_DOMAIN.replace(/^https?:\\/\\//, "")
            : "https://paradoxplusv1-production.up.railway.app");
        const downloadUrl = configuredDomain.replace(/\\/$/, "") + "/backup/download/" + token;
        try {
          await message.author.send({
            content:
              "✦ **PARADOX • CORE — FULL BACKUP READY**\n" +
              "**Archive:** `Paradoxplus-Full-Backup.zip`\n" +
              "**Files:** " + volumeFileCount + " persistent-volume files + PostgreSQL export\n" +
              "**Size:** " + (archive.length / 1024 / 1024).toFixed(2) + " MB\n" +
              "**Created:** " + createdAt + "\n" +
              "**Download:** " + downloadUrl + "\n" +
              "This private link expires in 24 hours. Generate a new backup to get a fresh link.\n" +
              "Environment variables and Discord tokens are not included."
          });
        } catch (dmError) {
          console.error("[Backup] Could not DM the download link:", dmError);
          return fail("The ZIP was created, but I couldn't DM the download link. Enable DMs from server members and run ?backup again.");
        }
        return send("✦ FULL BACKUP READY", "A single compressed ZIP was created and the private 24-hour download link was sent to your DMs. Check your DMs for **Paradoxplus-Full-Backup.zip**.");
      } catch (error) {
        console.error("[Backup] Archive creation failed:", error);
        return fail("Backup failed before a download link could be issued: " + String(error?.message || error).slice(0, 500));
      }
    }
olumeFiles.push({
              name: "volume-" + rel.replace(/[\\/]/g, "_"),
              data: await fs.readFile(absolute)
            });
          }
        }
      }
      await collectBackupFiles(DATA_DIR);
      const files = volumeFiles.map(file => new AttachmentBuilder(file.data, { name: file.name }));
      let databaseStatus = "PostgreSQL export unavailable.";
      try {
        const snapshot = await exportDatabaseSnapshot();
        const dbBuffer = Buffer.from(JSON.stringify(snapshot, null, 2), "utf8");
        if (dbBuffer.length > 8 * 1024 * 1024) {
          throw new Error("PostgreSQL export exceeds the safe Discord attachment limit.");
        }
        files.push(new AttachmentBuilder(dbBuffer, { name: "paradoxplus-postgresql-backup.json" }));
        databaseStatus = "PostgreSQL tables and rows exported.";
      } catch (error) {
        files.push(new AttachmentBuilder(Buffer.from(String(error.message || error), "utf8"), {
          name: "postgres-backup-status.txt"
        }));
      }
      if (!files.length) return fail("No volume files were found to back up.");
      // Discord accepts at most 10 attachments per message. Deliver the complete
      // backup in sequential batches and report partial delivery accurately.
      const batchSize = 10;
      const totalBatches = Math.ceil(files.length / batchSize);
      let sentBatches = 0;
      try {
        for (let offset = 0; offset < files.length; offset += batchSize) {
          const batch = files.slice(offset, offset + batchSize);
          const batchNumber = sentBatches + 1;
          await message.author.send({
            content: "PARADOX • CORE BACKUP" +
              "\\nBatch: " + batchNumber + "/" + totalBatches +
              (batchNumber === 1
                ? "\\nPersistent volume files: " + volumeFiles.length +
                  "\\nDatabase: " + databaseStatus +
                  "\\nCreated: " + new Date().toISOString() +
                  "\\nEnvironment variables and Discord tokens are intentionally excluded."
                : "\\nBackup continuation — keep every batch together.") +
              "\\nAttachments in this batch: " + batch.length,
            files: batch
          });
          sentBatches++;
        }
      } catch (error) {
        console.error("[Backup] DM delivery stopped:", error);
        return fail("Backup delivery stopped after " + sentBatches + "/" + totalBatches +
          " batches. " + (sentBatches * batchSize) + "/" + files.length +
          " files were sent. Check your DMs before retrying. Error: " +
          String(error?.message || error).slice(0, 300));
      }
    }
    if (command === "restore") {
      if (!isBotOwner(message.author.id)) return fail("This restore command is restricted to the bot owner.");
      if ((args[0] || "").toLowerCase() !== "confirm") return fail("This replaces the new bot configuration and clears the recruitment_records table before importing the backup. Use " + prefix + "restore confirm with both backup attachments, and only on the NEW Railway database.");
      const attachments = [...message.attachments.values()];
      if (!attachments.length) return fail("Attach the backup files to this message and run " + prefix + "restore confirm. Include volume-guild-config.json and paradoxplus-postgresql-backup.json.");
      const maxBytes = 8 * 1024 * 1024;
      const parsedFiles = [];
      for (const attachment of attachments) {
        if (attachment.size > maxBytes) return fail("Backup attachment is too large: " + attachment.name);
        const response = await fetch(attachment.url);
        if (!response.ok) return fail("Could not download backup attachment: " + attachment.name);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > maxBytes) return fail("Backup attachment exceeded the size limit: " + attachment.name);
        parsedFiles.push({ name: attachment.name, buffer });
      }
      const configFile = parsedFiles.find(file => file.name === "volume-guild-config.json");
      const databaseFile = parsedFiles.find(file => file.name === "paradoxplus-postgresql-backup.json");
      if (!configFile || !databaseFile) return fail("Both required files are missing. Attach volume-guild-config.json and paradoxplus-postgresql-backup.json together.");
      let restoredConfig, snapshot;
      try {
        restoredConfig = JSON.parse(configFile.buffer.toString("utf8"));
        snapshot = JSON.parse(databaseFile.buffer.toString("utf8"));
      } catch {
        return fail("One of the backup files is not valid JSON. Nothing was restored.");
      }
      if (!restoredConfig || typeof restoredConfig !== "object" || !restoredConfig.guilds || typeof restoredConfig.guilds !== "object" || Array.isArray(restoredConfig.guilds)) return fail("The volume backup does not contain a valid Paradoxplus guild configuration.");
      if (!isRecruitmentDatabaseReady()) return fail("PostgreSQL is not connected. Set DATABASE_URL on the new Railway bot service first.");
      const configPath = path.join(DATA_DIR, "guild-config.json");
      const tempPath = configPath + ".restore.tmp";
      try {
        const dbResult = await importDatabaseSnapshot(snapshot);
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(tempPath, JSON.stringify(restoredConfig, null, 2), "utf8");
        await fs.rename(tempPath, configPath);
        database = restoredConfig;
        await saveDatabase();
        return send("✦ RESTORE COMPLETE", "Restored " + Object.keys(restoredConfig.guilds).length + " server configuration(s) and " + dbResult.restored + " recruitment database record(s). Restart the Railway bot service once to finish loading the restored state.");
      } catch (error) {
        await fs.rm(tempPath, { force: true }).catch(() => {});
        console.error("[Restore] Backup restore failed:", error);
        return fail("Restore failed: " + String(error.message || error).slice(0, 900) + ". Check Railway logs before retrying.");
      }
    }
    if (command === "afk") {
      if (args[0]?.toLowerCase() === "off" || args[0]?.toLowerCase() === "remove") {
        if (!config.afkUsers[message.author.id]) return fail("You are not currently marked as AFK.");
        delete config.afkUsers[message.author.id];
        await saveDatabase();
        return send("✦ AFK DISABLED", "Your AFK status has been cleared.");
      }
      const reason = args.join(" ").trim().slice(0, 300) || "No reason provided";
      config.afkUsers[message.author.id] = { reason, since: Date.now() };
      await saveDatabase();
      return send("✦ AFK ENABLED", "You're now marked as AFK. I'll notify people who mention you and clear your status when you send your next message.\nReason: **" + reason + "**");
    }
    if (command === "welcome") {
      const sub = (args.shift() || "").toLowerCase();
      const canConfigure = isBotOwner(message.author.id) ||
        message.member.permissions.has(PermissionFlagsBits.Administrator) ||
        message.member.permissions.has(PermissionFlagsBits.ManageGuild);
      if (!canConfigure) return fail("You need Manage Server or Administrator to configure welcome messages.");
      if (sub === "test") {
        const bannerUrl = WELCOME_BANNER_URL;
        const count = message.guild.memberCount;
        const embed = new EmbedBuilder()
          .setColor(0x7c5cff)
          .setAuthor({ name: "Exile AS", iconURL: client.user.displayAvatarURL() })
                .setDescription(buildWelcomeDescription(message.guild, message.member))
          .setThumbnail(message.author.displayAvatarURL({ extension: "png", size: 256 }))
          .setImage(bannerUrl)
          .setFooter({ text: "Paradox • Core  •  Member #" + count })
          .setTimestamp();
        try {
          await message.author.send({ embeds: [embed], allowedMentions: { parse: [] } });
          return send("✦ Welcome test sent", "I've sent the welcome preview to your DMs.");
        } catch {
          return fail("I couldn't DM you. Enable direct messages from server members, then try again.");
        }
      }
      if (sub === "message") {
        const nextMessage = args.join(" ").trim();
        if (!nextMessage) return fail("Usage: " + prefix + "welcome message <text>\\nPlaceholders: {user}, {server}, {memberCount}. Use " + prefix + "welcome reset to restore the default.");
        if (nextMessage.length > 3500) return fail("Welcome message must be 3,500 characters or fewer.");
        config.welcomeMessage = nextMessage;
        await saveDatabase();
        return send("✦ Welcome message updated", "The welcome text is saved. Your banner stays unchanged. Preview it with " + prefix + "welcome test.");
      }
      if (sub === "reset") {
        config.welcomeMessage = null;
        await saveDatabase();
        return send("✦ Welcome message reset", "Restored the default welcome text. The banner is unchanged.");
      }
      if (sub === "set") {
        const channelId = args[0]?.match(/^<#(\d+)>$/)?.[1] || null;
        if (!channelId) return fail("Usage: " + prefix + "welcome set #channel");
        const channel = await message.guild.channels.fetch(channelId).catch(() => null);
        if (!channel?.isTextBased()) return fail("Please select a text channel.");
        const botMember = message.guild.members.me ?? await message.guild.members.fetchMe();
        if (!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
          return fail("I need View Channel, Send Messages, and Embed Links permissions in that channel.");
        }
        config.welcomeChannelId = channel.id;
        await saveDatabase();
        return send("✦ Welcome channel configured", "Paradoxplus will now send premium welcome messages in " + channel.toString() + ".");
      }
      if (sub === "remove" || sub === "disable" || sub === "off") {
        if (!config.welcomeChannelId) return fail("Welcome messages are not configured yet.");
        const previous = config.welcomeChannelId;
        config.welcomeChannelId = null;
        await saveDatabase();
        return send("✦ Welcome messages disabled", "Removed the welcome channel <#" + previous + ">.");
      }
      return fail("Usage: " + prefix + "welcome set #channel\\n" + prefix + "welcome message <text>\\n" + prefix + "welcome reset\\n" + prefix + "welcome test\\n" + prefix + "welcome remove");
    }
    if (command === "prefix") {
      if (!isBotOwner(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.Administrator) && !message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return fail("You need Manage Server or Administrator to change the prefix.");
      const nextPrefix = (args[0] || "").trim();
      if (!/^[^\\s]{1,5}$/.test(nextPrefix)) return fail("Usage: " + prefix + "prefix <new-prefix> (1–5 characters, no spaces)");
      config.prefix = nextPrefix;
      await saveDatabase();
      return send("✦ PREFIX UPDATED", "This server's command prefix is now `" + nextPrefix + "`.");
    }
    if (command === "triggerlist") {
      const rows = config.autoresponders || [];
      return send("✦ TRIGGER LIST", rows.map((item, i) => (i + 1) + ". **" + item.trigger + "** → " + item.response).join("\n") || "No triggers are configured.");
    }
    if (command === "trigger") {
      const sub = (args.shift() || "list").toLowerCase();
      if (sub === "list") {
        const rows = config.autoresponders || [];
        return send("✦ TRIGGER LIST", rows.map((item, i) => (i + 1) + ". **" + item.trigger + "** → " + item.response).join("\n") || "No triggers are configured.");
      }
      if (!isBotOwner(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.ManageMessages) && !message.member.permissions.has(PermissionFlagsBits.ManageGuild) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return fail("You need Manage Messages, Manage Server, or Administrator to manage triggers.");
      }
      const raw = args.join(" ").trim();
      if (sub === "add") {
        const separator = raw.indexOf("|");
        if (separator < 0) return fail("Usage: " + prefix + 'trigger add "hello" | Welcome!');
        const trigger = raw.slice(0, separator).trim().replace(/^["']|["']$/g, "");
        const response = raw.slice(separator + 1).trim();
        if (trigger.length < 1 || trigger.length > 100 || !response || response.length > 1800) return fail("Trigger must be 1–100 characters and response 1–1,800 characters.");
        config.autoresponders = config.autoresponders.filter(item => item.trigger.toLowerCase() !== trigger.toLowerCase());
        config.autoresponders.push({ trigger, response });
        await saveDatabase();
        return send("✦ TRIGGER ADDED", "**Trigger:** " + trigger + "\n**Response:** " + response);
      }
      if (sub === "remove") {
        const trigger = raw.replace(/^["']|["']$/g, "");
        const before = config.autoresponders.length;
        config.autoresponders = config.autoresponders.filter(item => item.trigger.toLowerCase() !== trigger.toLowerCase());
        if (before === config.autoresponders.length) return fail("I couldn't find that trigger.");
        await saveDatabase();
        return send("✦ TRIGGER REMOVED", "Removed trigger: **" + trigger + "**");
      }
      return fail("Usage: " + prefix + "trigger add <trigger> | <response>\n" + prefix + "trigger remove <trigger>\n" + prefix + "trigger list");
    }
    if (command === "ticket") {
      const sub = (args.shift() || "").toLowerCase();
      if (sub !== "panel") return fail("Usage: " + prefix + "ticket panel [#channel]");
      if (!isBotOwner(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.Administrator) && !message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return fail("You need Manage Channels or Administrator to publish the ticket panel.");
      const channelId = args[0]?.match(/^<#(\\d+)>$/)?.[1];
      const targetChannel = channelId ? await message.guild.channels.fetch(channelId).catch(() => null) : message.channel;
      if (!targetChannel || targetChannel.type !== ChannelType.GuildText) return fail("Choose a text channel in this server.");
      const botMember = message.guild.members.me ?? await message.guild.members.fetchMe();
      if (!targetChannel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return fail("I need View Channel, Send Messages, and Embed Links in that channel.");
      await targetChannel.send(buildTicketPanel(message.guild, client.user));
      return send("✦ TICKET PORTAL PUBLISHED", "The Paradoxplus ticket panel is now live in " + targetChannel.toString() + ".");
    }
    if (command === "recruit") {
      const id = mentionedId(args[0]);
      if (!id) return fail("Usage: " + prefix + "recruit @member");
      const target = message.guild.members.cache.get(id) ?? await message.guild.members.fetch(id).catch(() => null);
      if (!target) return fail("Member not found in this server.");
      if (target.user.bot) return fail("Bots cannot be recruited.");
      if (target.id === message.author.id) return fail("You cannot recruit yourself.");
      if (!isRecruitmentDatabaseReady()) return fail("Recruitment storage is unavailable. Check the PostgreSQL connection.");
      const result = await recordRecruit({ guildId: message.guild.id, recruitId: target.id, recruiterId: message.author.id, source: "prefix", originalNickname: target.nickname });
      if (result.duplicate) return fail("That member has already been recorded as a recruit in this server.");
      await applyRecruitPerks(message.guild, target);
      const recruitChannel = await message.guild.channels.fetch("1572968553617817769").catch(() => null);
      if (!recruitChannel?.isTextBased() || !recruitChannel.permissionsFor(message.guild.members.me)?.has(PermissionFlagsBits.SendMessages)) {
        return fail("I cannot access the recruit announcement channel. Check View Channel and Send Messages permissions.");
      }
      await recruitChannel.send({
        embeds: [new EmbedBuilder()
          .setColor("#000000")
          .setImage(RECRUIT_BANNER_URL)
          .setDescription((message.guild.emojis.cache.find(emoji => emoji.name === "GreenCrown")?.toString() || ":GreenCrown:") + " **New recruit** " + (message.guild.emojis.cache.find(emoji => emoji.name === "GreenCrown")?.toString() || ":GreenCrown:") + "\n\n> " + target.toString() + " joined the team.\n\n<:bluearrow:1573207744171737098> **Recruited by:** " + message.author.toString() + "\n<:bluearrow:1573207744171737098> **Total recruits:** `" + result.total + "`")],
        allowedMentions: { users: [target.id, message.author.id], parse: [] }
      });
      return message.react("✅");
    }
    if (command === "unrecruit") {
      if (!isBotOwner(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.ManageGuild) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) return fail("You need Manage Server or Administrator to unrecruit members.");
      const id = mentionedId(args[0]);
      if (!id) return fail("Usage: " + prefix + "unrecruit @member");
      if (!isRecruitmentDatabaseReady()) return fail("Recruitment storage is unavailable. Check the PostgreSQL connection.");
      const target = message.guild.members.cache.get(id) ?? await message.guild.members.fetch(id).catch(() => null);
      const record = await removeRecruit(message.guild.id, id);
      if (!record) return fail("That member is not recorded as a recruit in this server.");
      const results = [];
      const roleIds = ["1572968552208797698"];
      const botMember = message.guild.members.me ?? await message.guild.members.fetchMe();
      for (const roleId of roleIds) {
        const role = await message.guild.roles.fetch(roleId).catch(() => null);
        if (!target) continue;
        if (!role || !target.roles.cache.has(roleId)) { results.push("ℹ️ Recruit role <@&" + roleId + "> was not present"); continue; }
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= botMember.roles.highest.position) { results.push("⚠️ Cannot remove <@&" + roleId + ">; check Manage Roles and role hierarchy."); continue; }
        try { await target.roles.remove(role, "Paradoxplus unrecruit"); results.push("✅ Removed <@&" + roleId + ">"); }
        catch (error) { results.push("⚠️ Role removal failed for <@&" + roleId + ">: " + error.message); }
      }
      if (!target) results.push("ℹ️ Member has left the server; database record removed.");
      if (target && record.nickname_saved) {
        if (botMember.permissions.has(PermissionFlagsBits.ManageNicknames) || botMember.permissions.has(PermissionFlagsBits.Administrator)) {
          try { await target.setNickname(record.original_nickname, "Restore nickname after Paradoxplus unrecruit"); results.push("✅ Original server nickname restored"); }
          catch (error) { results.push("⚠️ Nickname restore failed: " + error.message); }
        } else results.push("⚠️ I need Manage Nicknames to restore the original nickname.");
      } else if (target) results.push("ℹ️ Original nickname was not saved for this older recruit; nickname left unchanged.");
      const logChannel = config.logChannelId ? await message.guild.channels.fetch(config.logChannelId).catch(() => null) : null;
      if (logChannel?.isTextBased()) await logChannel.send({ embeds: [prefixEmbed("RECRUIT REMOVED", "Member: <@" + id + ">\nAction by: " + message.author.toString() + "\nOriginal recruiter: <@" + record.recruiter_id + ">\n\n" + results.join("\n"))], allowedMentions: { parse: [] } }).catch(() => null);
      return send("✦ MEMBER UNRECRUITED", "Removed <@" + id + "> from the recruitment system.\n\n" + results.join("\n"));
    }
    if (command === "recruits") {
      const id = mentionedId(args[0]) || message.author.id;
      if (id !== message.author.id && !isBotOwner(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.ManageGuild) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) return fail("You can only view your own profile unless you have Manage Server.");
      if (!isRecruitmentDatabaseReady()) return fail("Recruitment storage is unavailable. Check the PostgreSQL connection.");
      const stats = await getRecruitStats(message.guild.id, id);
      const latest = stats.latest ? "\n**Latest recruit:** <t:" + Math.floor(new Date(stats.latest).getTime() / 1000) + ":R>" : "";
      return send("Recruiter profile", "**Recruiter:** <@" + id + ">\n**All-time recruits:** **" + stats.total + "**\n**Last 7 days:** " + stats.last_7_days + "\n**Last 30 days:** " + stats.last_30_days + latest);
    }
    if (command === "recruitleaderboard") {
      const period = (args[0] || "all").toLowerCase();
      if (!["daily", "weekly", "monthly", "all"].includes(period)) return fail("Usage: " + prefix + "recruitleaderboard [daily|weekly|monthly|all]");
      if (!isRecruitmentDatabaseReady()) return fail("Recruitment storage is unavailable. Check the PostgreSQL connection.");
      const rows = await getRecruitLeaderboard(message.guild.id, period);
      const lines = rows.map((row, index) => "**" + (index + 1) + ".** <@" + row.recruiter_id + "> — **" + row.total + "**");
      return send("Recruit leaderboard • " + period, lines.join("\n") || "No recruits have been recorded for this period yet.");
    }
    if (command === "ping") {
      const roundTrip = Math.max(0, Date.now() - message.createdTimestamp);
      const gateway = Math.round(client.ws.ping);
      return send("🏓 Pong!", "**Bot latency:** " + roundTrip + " ms\n**Gateway latency:** " + gateway + " ms");
    }
    if (command === "dm-optin" || command === "dmoptin" || command === "dm-optout" || command === "dmoptout") {
      const enabled = command === "dm-optin" || command === "dmoptin";
      config.dmOptIns = config.dmOptIns.filter(id => id !== message.author.id);
      if (enabled) config.dmOptIns.push(message.author.id);
      await saveDatabase();
      return send(enabled ? "✅ DM opt-in enabled" : "✅ DM opt-out complete", enabled ? "You can receive Paradoxplus server DMs. Use .dmoptout any time to stop." : "You will no longer receive Paradoxplus server DMs.");
    }
    if (command === "dmall") {
      if (!isBotOwner(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) return fail("Only the bot owner or a server administrator can use .dmall.");
      const raw = args.join(" ");
      const split = raw.indexOf("|");
      if (split < 1 || raw.slice(0, split).trim().toLowerCase() !== "confirm" || !raw.slice(split + 1).trim()) return fail("Preview first, then use: .dmall confirm | your message");
      const content = raw.slice(split + 1).trim();
      const status = await message.reply("⏳ Sending only to members who opted in. This can take a while...");
      const result = await sendOptInDmall(message.guild, config, content);
      return status.edit("**DMall finished**\nOpted-in recipients processed: **" + result.total + "**\nSent: **" + result.sent + "**\nFailed: **" + result.failed + "**" + (result.capped ? "\nSafety cap: first 100 opted-in members only." : ""));
    }
    if (command === "triggerlist" || command === "trigger") {
      const rawCommand = message.content.slice(prefix.length).trim();
      const rawArgs = rawCommand.replace(/^\S+\s*/, "").trim();
      const sub = command === "triggerlist" ? "list" : (args[0] || "list").toLowerCase();
      const allowed = isBotOwner(message.author.id) ||
        message.member.permissions.has(PermissionFlagsBits.Administrator) ||
        message.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
        message.member.permissions.has(PermissionFlagsBits.ManageGuild);

      if (sub === "list") {
        if (!config.autoresponders.length) return send("✦ PARADOXPLUS TRIGGERS", "No custom triggers are configured yet.");
        const lines = config.autoresponders.map((item, index) =>
          "**" + (index + 1) + ".** \`" + item.trigger + "\` → " + item.response
        );
        return send("✦ PARADOXPLUS TRIGGERS", lines.join("\n"));
      }
      if (!allowed) return fail("You need Manage Messages, Manage Server, or Administrator to manage triggers.");

      if (sub === "add") {
        const payload = rawArgs.replace(/^add\s+/i, "");
        const split = payload.indexOf("|");
        if (split < 1 || split === payload.length - 1) {
          return fail("Usage: " + prefix + "trigger add trigger phrase | reply message");
        }
        const trigger = payload.slice(0, split).trim().replace(/^["'](.*)["']$/, "$1");
        const response = payload.slice(split + 1).trim();
        if (trigger.length < 2 || trigger.length > 100) return fail("Trigger names must be 2–100 characters.");
        if (!response || response.length > 1800) return fail("Trigger replies must be 1–1800 characters.");
        if (config.autoresponders.some(item => item.trigger.toLowerCase() === trigger.toLowerCase())) {
          return fail("That trigger already exists. Remove it first if you want to replace it.");
        }
        if (config.autoresponders.length >= 25) return fail("This server has reached the 25-trigger limit.");
        config.autoresponders.push({ trigger, response });
        await saveDatabase();
        return send("✦ TRIGGER CREATED", "**Trigger:** \`" + trigger + "\`\n**Reply:** " + response);
      }

      if (sub === "remove" || sub === "delete") {
        const trigger = rawArgs.replace(/^(remove|delete)\s+/i, "").trim().replace(/^["'](.*)["']$/, "$1");
        if (!trigger) return fail("Usage: " + prefix + 'trigger remove "trigger name"');
        const before = config.autoresponders.length;
        config.autoresponders = config.autoresponders.filter(item => item.trigger.toLowerCase() !== trigger.toLowerCase());
        if (config.autoresponders.length === before) return fail("I couldn't find that exact trigger. Use " + prefix + "triggerlist to check the saved names.");
        await saveDatabase();
        return send("✦ TRIGGER REMOVED", "Removed trigger: **" + trigger + "**");
      }

      return fail("Use " + prefix + "triggerlist, " + prefix + "trigger add trigger phrase | reply, or " + prefix + 'trigger remove "trigger name".');
    }
    const modPermission = permission => isBotOwner(message.author.id) ||
      message.member.permissions.has(PermissionFlagsBits.Administrator) ||
      message.member.permissions.has(permission);
    const prefixTarget = async token => {
      const id = mentionedId(token) || (token && /^\d{17,20}$/.test(token) ? token : null);
      return id ? (message.guild.members.cache.get(id) ?? await message.guild.members.fetch(id).catch(() => null)) : null;
    };
    const addPrefixCase = (action, targetId, reason) => {
      const item = { id: config.moderationCases.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1, action, targetId: targetId || null, moderatorId: message.author.id, reason: reason || null, timestamp: new Date().toISOString() };
      config.moderationCases.unshift(item);
      config.moderationCases = config.moderationCases.slice(0, 500);
      void saveDatabase().catch(error => console.error("Moderation case save failed:", error));
      return item;
    };
    if (["warn","warnings","clear-warnings"].includes(command)) {
      if (!modPermission(PermissionFlagsBits.ModerateMembers)) return fail("You need Moderate Members or Administrator.");
      if (command === "warn" && args[0]?.toLowerCase() === "remove") {
        const issuedByMe = args[1]?.toLowerCase() === "issued";
        const targetToken = issuedByMe ? args[2] : args[1];
        const targetId = mentionedId(targetToken) || (targetToken && /^\d{17,20}$/.test(targetToken) ? targetToken : null);
        if (!targetId) return fail("Usage: " + prefix + "warn remove @member [warning-id] OR " + prefix + "warn remove issued @member [warning-id]");
        const requestedId = (issuedByMe ? args[3] : args[2]) === undefined ? null : Number(issuedByMe ? args[3] : args[2]);
        if (requestedId !== null && (!Number.isSafeInteger(requestedId) || requestedId < 1)) {
          return fail("Warning ID must be a positive number. Use " + prefix + "warnings @member to see warning IDs.");
        }
        const rows = config.warnings.filter(row => row.memberId === targetId && (!issuedByMe || row.moderatorId === message.author.id));
        if (!rows.length) return fail(issuedByMe ? "You have not issued any active warnings to that member." : "That member has no recorded warnings.");
        if (requestedId !== null) {
          const index = config.warnings.findIndex(row => row.memberId === targetId && (!issuedByMe || row.moderatorId === message.author.id) && Number(row.id) === requestedId);
          if (index === -1) return fail("Warning #" + requestedId + " was not found in the selected warnings. Use " + prefix + "warnings @member to see warning IDs.");
          const [removed] = config.warnings.splice(index, 1);
          addPrefixCase("REMOVE_WARNING", targetId, "Removed warning #" + requestedId + (issuedByMe ? " issued by " + message.author.id : "") + ": " + removed.reason);
          await saveDatabase();
          return send("✦ WARNING REMOVED", "Removed warning **#" + requestedId + "** from <@" + targetId + ">. They now have **" + config.warnings.filter(row => row.memberId === targetId).length + "** active warning(s).");
        }
        config.warnings = config.warnings.filter(row => !(row.memberId === targetId && (!issuedByMe || row.moderatorId === message.author.id)));
        addPrefixCase(issuedByMe ? "REMOVE_OWN_ISSUED_WARNINGS" : "CLEAR_WARNINGS", targetId, "Removed " + rows.length + (issuedByMe ? " warnings issued by " + message.author.id : " warnings"));
        await saveDatabase();
        return send(issuedByMe ? "✦ YOUR WARNINGS REMOVED" : "✦ WARNINGS CLEARED", "Removed **" + rows.length + "** warning(s) from <@" + targetId + ">." + (issuedByMe ? " Only warnings you issued were removed." : ""));
      }
      const target = await prefixTarget(args[0]);
      if (!target) return fail("Usage: " + prefix + command + " @member [reason]");
      const actor = message.member;
      if (command === "warn" && (target.id === message.author.id || !canActOnTarget(actor, target, message.guild))) return fail("You cannot warn yourself or a member with an equal or higher role.");
      if (command === "warn") {
        const reason = args.slice(1).join(" ").trim();
        if (!reason) return fail("Usage: " + prefix + "warn @member <reason>");
        const warning = { id: config.warnings.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1, memberId: target.id, moderatorId: message.author.id, reason, timestamp: new Date().toISOString() };
        config.warnings.unshift(warning);
        const item = addPrefixCase("WARN", target.id, reason);
        warning.caseId = item.id;
        await saveDatabase();
        return send("⚠️ WARNING ISSUED", target.toString() + " now has **" + config.warnings.filter(row => row.memberId === target.id).length + "** active warning(s). Case #" + item.id + ".");
      }
      const rows = config.warnings.filter(row => row.memberId === target.id);
      if (command === "warnings") return send("✦ MEMBER WARNINGS", rows.length ? rows.slice(0, 15).map(row => "• **#" + row.id + "** " + row.reason + " — <t:" + Math.floor(new Date(row.timestamp).getTime()/1000) + ":R>").join("\n") : "No warnings recorded.");
      if (!rows.length) return fail("That member has no recorded warnings.");
      config.warnings = config.warnings.filter(row => row.memberId !== target.id);
      addPrefixCase("CLEAR_WARNINGS", target.id, "Cleared " + rows.length + " warnings");
      await saveDatabase();
      return send("✦ WARNINGS CLEARED", "Removed **" + rows.length + "** warning(s) from " + target.toString() + ".");
    }
    if (["lock","unlock","hide","show","slowmode","slowmode-off"].includes(command)) {
      const needed = command === "lock" || command === "unlock" || command === "hide" || command === "show" || command.startsWith("slowmode") ? PermissionFlagsBits.ManageChannels : PermissionFlagsBits.ManageChannels;
      if (!modPermission(needed)) return fail("You need Manage Channels or Administrator.");
      const channelId = args[0]?.match(/^<#(\\d+)>$/)?.[1];
      const channel = channelId ? await message.guild.channels.fetch(channelId).catch(() => null) : message.channel;
      if (!channel) return fail("Channel not found.");
      if (command === "lock" || command === "unlock") {
        if (!channel.permissionOverwrites) return fail("That channel can't be locked.");
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: command === "lock" ? false : null }, { reason: command + " by " + message.author.tag });
      } else if (command === "hide" || command === "show") {
        if (!channel.permissionOverwrites) return fail("That channel can't be updated.");
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: command === "hide" ? false : null }, { reason: command + " by " + message.author.tag });
      } else {
        if (typeof channel.setRateLimitPerUser !== "function") return fail("That channel doesn't support slowmode.");
        const seconds = command === "slowmode-off" ? 0 : Number(args[channelId ? 1 : 0]);
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) return fail("Usage: " + prefix + "slowmode <0–21600 seconds> [#channel]");
        await channel.setRateLimitPerUser(seconds, "Slowmode updated by " + message.author.tag);
      }
      addPrefixCase(command.toUpperCase().replace(/-/g, "_"), null, channel.name);
      await saveDatabase();
      return send("✦ CHANNEL UPDATED", (command === "lock" ? "🔒 Locked " : command === "unlock" ? "🔓 Unlocked " : command === "hide" ? "🙈 Hidden " : command === "show" ? "👀 Restored visibility for " : "🐢 Updated slowmode in ") + channel.toString() + ".");
    }
    if (["nickname","nick-reset"].includes(command)) {
      if (!modPermission(PermissionFlagsBits.ManageNicknames)) return fail("You need Manage Nicknames or Administrator.");
      const target = await prefixTarget(args[0]);
      if (!target) return fail("Usage: " + prefix + command + " @member [nickname]");
      if (!canActOnTarget(message.member, target, message.guild) || !target.manageable) return fail("I can't manage that member. Check role hierarchy and permissions.");
      const nickname = command === "nick-reset" ? null : args.slice(1).join(" ").trim();
      if (command === "nickname" && !nickname) return fail("Usage: " + prefix + "nickname @member <new nickname>");
      await target.setNickname(nickname, command + " by " + message.author.tag);
      addPrefixCase(command.toUpperCase().replace("-", "_"), target.id, nickname || "Nickname reset");
      await saveDatabase();
      return send("✦ NICKNAME UPDATED", "Updated " + target.toString() + ".");
    }
    if (command === "roleall") {
      if (!modPermission(PermissionFlagsBits.ManageRoles)) return fail("You need Manage Roles or Administrator.");
      const roleId = args[0]?.match(/^<@&?(\\d+)>$/)?.[1] || (args[0] && /^\\d{17,20}$/.test(args[0]) ? args[0] : null);
      const role = roleId ? await message.guild.roles.fetch(roleId).catch(() => null) : null;
      if (!role) return fail("Usage: " + prefix + "roleall @role confirm");
      if ((args[1] || "").toLowerCase() !== "confirm") return fail("This assigns the role to every manageable server member. Confirm by running: " + prefix + "roleall " + role.toString() + " confirm");
      const bot = message.guild.members.me ?? await message.guild.members.fetchMe();
      const actorIsAdmin = isBotOwner(message.author.id) || message.guild.ownerId === message.author.id || message.member.permissions.has(PermissionFlagsBits.Administrator);
      if (role.managed || role.id === message.guild.id) return fail("That role cannot be assigned.");
      if (!actorIsAdmin && role.position >= message.member.roles.highest.position) return fail("That role is equal to or above your highest role.");
      if (!bot.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable || role.position >= bot.roles.highest.position) return fail("I need Manage Roles, and my highest role must be above " + role.toString() + ".");
      try {
        const members = await getGuildMembers(message.guild);
        const targets = [...members.values()].filter(member => !member.roles.cache.has(role.id));
        let added = 0;
        const failed = [];
        for (const member of targets) {
          try { await member.roles.add(role, "Bulk role assignment by " + message.author.tag); added++; }
          catch (error) { failed.push({ tag: member.user.tag, id: member.id, code: error.code || "unknown" }); }
        }
        const details = failed.slice(0, 12).map(item => item.tag + " (" + item.id + ", " + item.code + ")").join("\\n");
        const more = failed.length > 12 ? "\\n…and " + (failed.length - 12) + " more." : "";
        addPrefixCase("ROLE_ALL", null, role.name + ": added " + added + ", failed " + failed.length);
        await saveDatabase();
        return send("✦ BULK ROLE ASSIGNMENT COMPLETE", "Role: " + role.toString() + "\\nAdded: **" + added + "**\\nFailed: **" + failed.length + "**" + (details ? "\\n\\n**Failed members:**\\n" + details + more : ""));
      } catch (error) {
        console.error("[RoleAll] Prefix bulk assignment failed:", error);
        return fail("I couldn't complete the bulk assignment. Check the Server Members Intent, Manage Roles permission, and role hierarchy.");
      }
    }
    if (command === "role-help") return send("✦ ROLE COMMANDS", "`" + prefix + "role add @member @role` — Give a role\n`" + prefix + "role remove @member @role` — Remove a role\nAliases: `" + prefix + "role-add`, `" + prefix + "role-remove`.");
    if (["role-add","role-remove"].includes(command)) {
      if (!modPermission(PermissionFlagsBits.ManageRoles)) return fail("You need Manage Roles or Administrator.");
      const target = await prefixTarget(args[0]);
      const roleId = args[1]?.match(/^<@&?(\d+)>$/)?.[1] || (args[1] && /^\d{17,20}$/.test(args[1]) ? args[1] : null);
      const role = roleId ? await message.guild.roles.fetch(roleId).catch(() => null) : null;
      if (!target || !role) return fail("Usage: " + prefix + command + " @member @role");
      const bot = message.guild.members.me ?? await message.guild.members.fetchMe();
      const actorIsAdmin = isBotOwner(message.author.id) || message.guild.ownerId === message.author.id || message.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!canActOnTarget(message.member, target, message.guild)) return fail("You cannot manage a member whose highest role is equal to or above yours.");
      if (target.id === message.guild.ownerId || !target.manageable) return fail("I cannot manage that member. Move my bot role above the member's highest role.");
      if (role.managed || (!actorIsAdmin && role.position >= message.member.roles.highest.position)) return fail("That role is above your highest role or is managed.");
      if (!bot.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable || role.position >= bot.roles.highest.position) return fail("I cannot manage that role. Give me Manage Roles and move my bot role above it.");
      if (command === "role-add") {
        if (target.roles.cache.has(role.id)) return fail("That member already has this role.");
        await target.roles.add(role, "Role added by " + message.author.tag);
      } else {
        if (!target.roles.cache.has(role.id)) return fail("That member does not have this role.");
        await target.roles.remove(role, "Role removed by " + message.author.tag);
      }
      addPrefixCase(command.toUpperCase().replace("-", "_"), target.id, role.name);
      await saveDatabase();
      return send("✦ ROLE UPDATED", (command === "role-add" ? "Added " : "Removed ") + role.toString() + (command === "role-add" ? " to " : " from ") + target.toString() + ".");
    }
    if (["userinfo","serverinfo","modstats"].includes(command)) {
      if (command === "modstats" && !modPermission(PermissionFlagsBits.ModerateMembers)) return fail("You need Moderate Members or Administrator.");
      if (command === "userinfo") {
        const target = await prefixTarget(args[0]) || message.member;
        const roles = target.roles.cache.filter(role => role.id !== message.guild.id).sort((a,b) => b.position-a.position).map(role => role.toString()).slice(0, 12);
        const embed = new EmbedBuilder().setColor(0x7c5cff).setTitle("User profile").setThumbnail(target.user.displayAvatarURL()).addFields(
          { name: "Member", value: target.user.tag }, { name: "User ID", value: target.id },
          { name: "Joined", value: target.joinedTimestamp ? "<t:" + Math.floor(target.joinedTimestamp/1000) + ":R>" : "Unknown", inline: true },
          { name: "Created", value: "<t:" + Math.floor(target.user.createdTimestamp/1000) + ":D>", inline: true },
          { name: "Highest role", value: target.roles.highest.toString() }, { name: "Roles", value: roles.join(", ") || "None" }
        );
        return message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
      }
      if (command === "serverinfo") {
        const embed = buildServerInfoEmbed(message.guild, message.author);
        return message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
      }
      const counts = {};
      for (const item of config.moderationCases) counts[item.action] = (counts[item.action] || 0) + 1;
      return send("✦ MODERATION ANALYTICS", "Cases: **" + config.moderationCases.length + "**\nWarnings: **" + config.warnings.length + "**\n" + (Object.entries(counts).map(([key,value]) => "• **" + key + ":** " + value).join("\n") || "No cases recorded."));
    }
    if (command === "unban") {
      if (!modPermission(PermissionFlagsBits.BanMembers)) return fail("You need Ban Members or Administrator.");
      const id = (args[0] || "").trim();
      if (!/^[0-9]{17,20}$/.test(id)) return fail("Usage: " + prefix + "unban <user-id> [custom DM message]");
      const customMessage = args.slice(1).join(" ").trim() || "You have been unbanned from **" + message.guild.name + "**. You may rejoin the server.";
      if (customMessage.length > 2000) return fail("The DM message must be 2,000 characters or fewer.");
      const unbannedUser = await client.users.fetch(id).catch(() => null);
      await message.guild.bans.remove(id, "Unban by " + message.author.tag);
      addPrefixCase("UNBAN", id, customMessage);
      await saveDatabase();
      let dmSent = false;
      if (unbannedUser) {
        try {
          await unbannedUser.send({ content: customMessage, allowedMentions: { parse: [] } });
          dmSent = true;
        } catch (error) {
          console.warn("Unban notification DM failed for " + id + ":", error.message || error);
        }
      }
      return send("✦ MEMBER UNBANNED", "User ID `" + id + "` has been unbanned.\n" +
        (dmSent ? "✉️ Your custom DM was sent successfully." : "⚠️ The unban succeeded, but I couldn't deliver the DM (the user may have DMs disabled).") +
        "\n\n**Custom DM:**\n" + customMessage);
    }
    if (command === "mute") {
      if (!modPermission(PermissionFlagsBits.ModerateMembers)) return fail("You need Moderate Members or Administrator.");
      const target = await prefixTarget(args[0]);
      if (!target) return fail("Usage: " + prefix + "mute @member [reason]");
      if (target.id === message.author.id) return fail("You cannot mute yourself.");
      if (isAntiNukeWhitelisted(message.guild.id, target.id) || isBotOwner(target.id)) return fail("🛡️ That member is protected as a bot owner / trusted owner and cannot be muted.");
      if (!Array.isArray(config.permanentMutes)) config.permanentMutes = [];
      const reason = args.slice(1).join(" ").trim() || "No reason provided";
      const botMember = await message.guild.members.fetchMe({ force: true });
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return fail("I need Manage Roles to temporarily remove and restore removable roles.");
      const freshTarget = await message.guild.members.fetch({ user: target.id, force: true }).catch(() => null);
      if (!freshTarget) return fail("I could not refresh that member. Please try again.");
      const actorMember = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (!actorMember) return fail("I could not verify your server role.");
      if (actorMember.id !== message.guild.ownerId && freshTarget.roles.highest.comparePositionTo(actorMember.roles.highest) >= 0) {
        return fail("🛡️ You cannot mute a member whose highest role is equal to or higher than yours.");
      }
      if (freshTarget.roles.highest.comparePositionTo(botMember.roles.highest) >= 0) {
        return fail("🛡️ I cannot mute this member because their highest role is equal to or higher than mine.");
      }
      const existing = config.permanentMutes.find(item => item.memberId === target.id);
      const previouslyRemovedIds = Array.isArray(existing?.removedRoleIds) ? existing.removedRoleIds : [];
      const removableRoles = [...freshTarget.roles.cache.values()].filter(role =>
        role.id !== message.guild.id &&
        !role.managed &&
        role.editable &&
        role.position < botMember.roles.highest.position
      );
      const removedRoleIds = new Set(previouslyRemovedIds);
      const removedNow = [];
      const roleFailures = [];
      try {
        // Refresh and attempt roles one at a time so Discord's exact rejection
        // is visible instead of silently skipping a whole bulk role update.
        for (const role of removableRoles) {
          try {
            await freshTarget.roles.remove(role, "Temporarily removed for permanent mute by " + message.author.tag);
            removedNow.push(role);
            removedRoleIds.add(role.id);
          } catch (roleError) {
            roleFailures.push(role.name + ": " + String(roleError.message || roleError).slice(0, 180));
          }
        }
        const savedIds = [...removedRoleIds];
        if (existing) {
          existing.reason = reason;
          existing.moderatorId = message.author.id;
          existing.removedRoleIds = savedIds;
        } else {
          config.permanentMutes.push({
            memberId: target.id,
            moderatorId: message.author.id,
            reason,
            createdAt: new Date().toISOString(),
            removedRoleIds: savedIds
          });
        }
        await saveDatabase();
        const refreshedForTimeout = await message.guild.members.fetch({ user: target.id, force: true });
        if (!refreshedForTimeout.moderatable) {
          throw new Error("Discord still refuses the timeout after the role-removal attempts. The target may be the server owner, still have a role at/above the bot's highest role, or the bot may lack Moderate Members.");
        }
        await refreshedForTimeout.timeout(28 * 24 * 60 * 60 * 1000, "Permanent mute (auto-renewed): " + reason);
      } catch (error) {
        const restoreFailures = [];
        for (const role of removedNow) {
          try {
            const current = await message.guild.members.fetch({ user: target.id, force: true });
            if (!current.roles.cache.has(role.id) && role.editable) await current.roles.add(role, "Mute failed; restoring role");
          } catch (restoreError) {
            restoreFailures.push(role.name + ": " + String(restoreError.message || restoreError).slice(0, 120));
          }
        }
        if (existing) {
          existing.removedRoleIds = previouslyRemovedIds;
        } else {
          const recordIndex = config.permanentMutes.findIndex(item => item.memberId === target.id);
          if (recordIndex !== -1) config.permanentMutes.splice(recordIndex, 1);
        }
        await saveDatabase();
        const roleReport = "Role removals succeeded: " + removedNow.length + "/" + removableRoles.length +
          (roleFailures.length ? "\\nRole removal errors: " + roleFailures.join("; ") : "") +
          (restoreFailures.length ? "\\nRole restore errors: " + restoreFailures.join("; ") : "");
        return fail("I could not apply the mute. " + error.message + "\\n" + roleReport);
      }
      addPrefixCase("PERMANENT_MUTE", target.id, reason);
      await saveDatabase();
      return send("✦ PERMANENT MUTE APPLIED", target.toString() + " is now permanently muted. Removable roles were temporarily removed and will be restored by ?unmute. The timeout will renew automatically.\\nReason: " + reason);
    }
    if (command === "unmute") {
      if (!modPermission(PermissionFlagsBits.ModerateMembers)) return fail("You need Moderate Members or Administrator.");
      const target = await prefixTarget(args[0]);
      if (!target) return fail("Usage: " + prefix + "unmute @member");
      if (!Array.isArray(config.permanentMutes)) config.permanentMutes = [];
      const muteRecord = config.permanentMutes.find(item => item.memberId === target.id);
      const wasPermanent = Boolean(muteRecord);
      if (!wasPermanent && !target.communicationDisabledUntilTimestamp) return fail("That member is not muted.");
      // Mark the record before clearing the timeout so GuildMemberUpdate cannot
      // interpret this intentional unmute as an expired timeout and renew it.
      if (muteRecord) {
        muteRecord.unmuting = true;
        await saveDatabase();
      }
      if (target.communicationDisabledUntilTimestamp) {
        if (!target.moderatable) {
          if (muteRecord) { muteRecord.unmuting = false; await saveDatabase(); }
          return fail("I cannot remove this timeout because of Discord's role hierarchy.");
        }
        try {
          await target.timeout(null, "Permanent mute removed by " + message.author.tag);
        } catch (error) {
          if (muteRecord) { muteRecord.unmuting = false; await saveDatabase(); }
          return fail("I could not remove the timeout: " + String(error.message || error));
        }
      }
      const roleIdsToRestore = Array.isArray(muteRecord?.removedRoleIds) ? muteRecord.removedRoleIds : [];
      const rolesToRestore = roleIdsToRestore
        .map(roleId => message.guild.roles.cache.get(roleId))
        .filter(role => role && role.editable && !target.roles.cache.has(role.id));
      let restoredCount = 0;
      if (rolesToRestore.length) {
        try {
          await target.roles.add(rolesToRestore, "Restoring roles after unmute by " + message.author.tag);
          restoredCount = rolesToRestore.length;
        } catch (error) {
          console.error("[PermanentMute] Some roles could not be restored for " + target.id, error);
        }
      }
      config.permanentMutes = config.permanentMutes.filter(item => item.memberId !== target.id);
      addPrefixCase("UNMUTE", target.id, "Permanent mute removed; restored " + restoredCount + " roles");
      await saveDatabase();
      const skippedCount = Math.max(0, roleIdsToRestore.length - restoredCount);
      return send("✦ MEMBER UNMUTED", "Removed the permanent mute from " + target.toString() + ". Restored " + restoredCount + " role(s)." + (skippedCount ? "\\n⚠️ " + skippedCount + " role(s) could not be restored because they were deleted or are no longer manageable." : ""));
    }
    if (command === "untimeout") {
      if (!modPermission(PermissionFlagsBits.ModerateMembers)) return fail("You need Moderate Members or Administrator.");
      const target = await prefixTarget(args[0]);
      if (!target || !target.moderatable) return fail("Usage: " + prefix + "untimeout @member — check the role hierarchy.");
      await target.timeout(null, "Timeout removed by " + message.author.tag);
      addPrefixCase("UNTIMEOUT", target.id, "Timeout removed");
      await saveDatabase();
      return send("✦ TIMEOUT REMOVED", "Removed the timeout for " + target.toString() + ".");
    }
    if (["voice-mute","voice-unmute","voice-deafen","voice-undeafen","disconnect","move-member"].includes(command)) {
      const needed = command === "move-member" || command === "disconnect" ? PermissionFlagsBits.MoveMembers : command.includes("mute") ? PermissionFlagsBits.MuteMembers : PermissionFlagsBits.DeafenMembers;
      if (!modPermission(needed)) return fail("You need the matching voice moderation permission.");
      const target = await prefixTarget(args[0]);
      if (!target?.voice.channel) return fail("Usage: " + prefix + command + " @member — the member must be in voice.");
      if (!canActOnTarget(message.member, target, message.guild)) return fail("That member has an equal or higher role than you.");
      if (command === "disconnect") await target.voice.disconnect("Disconnected by " + message.author.tag);
      else if (command === "move-member") {
        const destinationId = args[1]?.match(/^<#(\\d+)>$/)?.[1];
        const destination = destinationId ? await message.guild.channels.fetch(destinationId).catch(() => null) : null;
        if (!destination?.isVoiceBased()) return fail("Usage: " + prefix + "move-member @member #voice-channel");
        await target.voice.setChannel(destination, "Moved by " + message.author.tag);
      } else if (command === "voice-mute" || command === "voice-unmute") await target.voice.setMute(command === "voice-mute", "Voice moderation by " + message.author.tag);
      else await target.voice.setDeaf(command === "voice-deafen", "Voice moderation by " + message.author.tag);
      addPrefixCase(command.toUpperCase().replace(/-/g, "_"), target.id, args.slice(1).join(" ") || null);
      await saveDatabase();
      return send("✦ VOICE ACTION COMPLETE", "Updated voice status for " + target.toString() + ".");
    }
    if (command === "banlist") {
      if (!modPermission(PermissionFlagsBits.BanMembers)) return fail("You need Ban Members or Administrator.");
      const bans = await message.guild.bans.fetch();
      return send("✦ SERVER BAN LIST", bans.size ? bans.first(20).map(entry => "• **" + entry.user.tag + "** — " + entry.user.id + " — " + (entry.reason || "No reason")).join("\n") : "No active bans.");
    }
    if (["modlog","case"].includes(command)) {
      if (!modPermission(PermissionFlagsBits.ModerateMembers)) return fail("You need Moderate Members or Administrator.");
      if (command === "modlog") {
        const target = await prefixTarget(args[0]);
        const rows = config.moderationCases.filter(item => !target || item.targetId === target.id).slice(0, 15);
        return send("✦ MODERATION LOG", rows.length ? rows.map(item => "• **#" + item.id + " " + item.action + "** — " + (item.reason || "No reason") + " — <t:" + Math.floor(new Date(item.timestamp).getTime()/1000) + ":R>").join("\n") : "No moderation cases found.");
      }
      const id = Number(args[0]), item = config.moderationCases.find(row => row.id === id);
      if (!item) return fail("Usage: " + prefix + "case <case-id>");
      return send("✦ CASE #" + item.id + " • " + item.action, "Member: " + (item.targetId ? "<@" + item.targetId + ">" : "Not specified") + "\nModerator: <@" + item.moderatorId + ">\nReason: " + (item.reason || "No reason") + "\nDate: <t:" + Math.floor(new Date(item.timestamp).getTime()/1000) + ":F>");
    }
    if (["note","notes","clear-notes"].includes(command)) {
      if (!modPermission(PermissionFlagsBits.ModerateMembers)) return fail("You need Moderate Members or Administrator.");
      const target = await prefixTarget(args[0]);
      if (!target) return fail("Usage: " + prefix + command + " @member [note]");
      if (command === "note") {
        const note = args.slice(1).join(" ").trim();
        if (!note) return fail("Usage: " + prefix + "note @member <private note>");
        config.notes.unshift({ id: config.notes.reduce((max,row)=>Math.max(max,Number(row.id)||0),0)+1, memberId: target.id, moderatorId: message.author.id, note, timestamp: new Date().toISOString() });
        config.notes = config.notes.slice(0,1000);
        addPrefixCase("STAFF_NOTE", target.id, note.slice(0,400));
        await saveDatabase();
        return send("✦ PRIVATE NOTE SAVED", "Added a staff note for " + target.toString() + ".");
      }
      const rows = config.notes.filter(row => row.memberId === target.id);
      if (command === "notes") return send("✦ PRIVATE STAFF NOTES", rows.length ? rows.slice(0,12).map(row => "• **#" + row.id + "** " + row.note + " — <t:" + Math.floor(new Date(row.timestamp).getTime()/1000) + ":R>").join("\n") : "No staff notes found.");
      if (!rows.length) return fail("That member has no staff notes.");
      config.notes = config.notes.filter(row => row.memberId !== target.id);
      addPrefixCase("CLEAR_NOTES", target.id, "Cleared " + rows.length + " staff notes");
      await saveDatabase();
      return send("✦ NOTES CLEARED", "Removed **" + rows.length + "** staff notes for " + target.toString() + ".");
    }
    if (command === "slowmode-off") {
      if (!modPermission(PermissionFlagsBits.ManageChannels)) return fail("You need Manage Channels or Administrator.");
      await message.channel.setRateLimitPerUser(0, "Slowmode disabled by " + message.author.tag);
      return send("✦ SLOWMODE DISABLED", "Slowmode is off in this channel.");
    }
    if (command === "clear-reactions") {
      if (!modPermission(PermissionFlagsBits.ManageMessages)) return fail("You need Manage Messages or Administrator.");
      const id = args[0];
      if (!id || !/^\d{17,20}$/.test(id)) return fail("Usage: " + prefix + "clear-reactions <message-id>");
      const targetMessage = await message.channel.messages.fetch(id).catch(() => null);
      if (!targetMessage) return fail("Message not found in this channel.");
      await targetMessage.reactions.removeAll();
      addPrefixCase("CLEAR_REACTIONS", null, "Message " + id);
      await saveDatabase();
      return send("✦ REACTIONS CLEARED", "Removed all reactions from that message.");
    }
    if (command === "set-topic") {
      if (!modPermission(PermissionFlagsBits.ManageChannels)) return fail("You need Manage Channels or Administrator.");
      const channelId = args[0]?.match(/^<#(\\d+)>$/)?.[1];
      const channel = channelId ? await message.guild.channels.fetch(channelId).catch(() => null) : message.channel;
      const topic = args.slice(channelId ? 1 : 0).join(" ").trim();
      if (!channel || !topic || typeof channel.setTopic !== "function") return fail("Usage: " + prefix + "set-topic [#channel] <topic>");
      await channel.setTopic(topic, "Topic updated by " + message.author.tag);
      addPrefixCase("SET_TOPIC", null, channel.name + ": " + topic.slice(0,300));
      await saveDatabase();
      return send("✦ CHANNEL TOPIC UPDATED", "Updated the topic for " + channel.toString() + ".");
    }
    const prefixMember = async token => {
      const id = mentionedId(token) || (token && /^\d{17,20}$/.test(token) ? token : null);
      return id ? (message.guild.members.cache.get(id) ?? await message.guild.members.fetch(id).catch(() => null)) : null;
    };
    const prefixManager = permission => isBotOwner(message.author.id) || message.member.permissions.has(PermissionFlagsBits.Administrator) || message.member.permissions.has(permission);
    const prefixRecord = (action,targetId,reason) => {
      const id=config.moderationCases.reduce((m,x)=>Math.max(m,Number(x.id)||0),0)+1;
      config.moderationCases.unshift({id,action,targetId:targetId||null,moderatorId:message.author.id,reason:reason||null,timestamp:new Date().toISOString()});
      config.moderationCases=config.moderationCases.slice(0,500); return id;
    };
    if(command==="rank-config") {
      if(!prefixManager(PermissionFlagsBits.ManageRoles))return fail("You need Manage Roles or Administrator.");
      const sub=(args.shift()||"list").toLowerCase();
      if(sub==="add") {
        const roleId=mentionedId(args[0],true)||args[0], role=roleId?await message.guild.roles.fetch(roleId).catch(()=>null):null, pos=Number(args[1]);
        const bot=message.guild.members.me??await message.guild.members.fetchMe();
        if(!role||role.id===message.guild.id||role.managed||!Number.isInteger(pos)||pos<1||pos>100)return fail("Usage: "+prefix+"rank-config add @role <position>");
        if(role.position>=bot.roles.highest.position)return fail("Move my bot role above that rank role first.");
        config.ranks=config.ranks.filter(x=>x.id!==role.id&&x.position!==pos);config.ranks.push({id:role.id,position:pos});config.ranks.sort((a,b)=>a.position-b.position);await saveDatabase();
        return send("RANK CONFIGURATION","Added "+role.toString()+" at position "+pos+".");
      }
      if(["remove","ignore","unignore"].includes(sub)) {
        const roleId=mentionedId(args[0],true)||args[0],role=roleId?await message.guild.roles.fetch(roleId).catch(()=>null):null;
        if(!role)return fail("Usage: "+prefix+"rank-config "+sub+" @role");
        if(sub==="remove")config.ranks=config.ranks.filter(x=>x.id!==role.id);
        if(sub==="ignore"){if(role.id===message.guild.id)return fail("@everyone is already excluded.");if(!config.ignoredRoleIds.includes(role.id))config.ignoredRoleIds.push(role.id);config.ranks=config.ranks.filter(x=>x.id!==role.id);}
        if(sub==="unignore"){const n=config.ignoredRoleIds.length;config.ignoredRoleIds=config.ignoredRoleIds.filter(x=>x!==role.id);if(n===config.ignoredRoleIds.length)return fail("That role is not ignored.");}
        await saveDatabase();return send("RANK CONFIGURATION","Updated rank detection for "+role.toString()+".");
      }
      if(sub==="ignored")return send("IGNORED ROLES",config.ignoredRoleIds.map(id=>"• <@&"+id+">").join("\n")||"None.");
      if(sub==="list")return send("RANK HIERARCHY",config.ranks.map((r,i)=>(i+1)+". <@&"+r.id+">").join("\n")||"No ranks configured.");
      if(sub==="logs"||sub==="announce"){const id=args[0]?.match(/^<#(\d+)>$/)?.[1],ch=id?await message.guild.channels.fetch(id).catch(()=>null):null;if(!ch?.isTextBased())return fail("Usage: "+prefix+"rank-config "+sub+" #channel");if(sub==="logs")config.logChannelId=ch.id;else config.announceChannelId=ch.id;await saveDatabase();return send("RANK CONFIGURATION","Updated destination to "+ch.toString()+".");}
      if(sub==="clear-logs"||sub==="clear-announcements"){if(sub==="clear-logs")config.logChannelId=null;else config.announceChannelId=null;await saveDatabase();return send("RANK CONFIGURATION","Setting disabled.");}
      if(sub==="backup"){const data=JSON.stringify({version:1,guildId:message.guild.id,config},null,2);return message.reply({content:"Paradoxplus configuration backup",files:[{attachment:Buffer.from(data,"utf8"),name:"paradoxplus-backup-"+message.guild.id+".json"}]});}
      return fail("Subcommands: add, remove, ignore, unignore, ignored, list, logs, clear-logs, announce, clear-announcements, backup.");
    }
    if(["rank-history","rank-search","rank-stats","rank-leaderboard","rank-panel","rank-help","rankpredict","serverpulse","staffactivity","memberjourney","spotlight"].includes(command)){
      if(command==="rank-help")return send("RANK COMMANDS",prefix+"rank, rankhistory, ranksearch, rankstats, rankleaderboard, rankpanel, rank-config, promote, demote [number-of-ranks-down], setrank.");
      if(command==="rank-panel")return send("RANK HIERARCHY",config.ranks.map((r,i)=>(i+1)+". <@&"+r.id+">").join("\n")||"No ranks configured.");
      if(command==="rank-history"){const m=await prefixMember(args[0]);if(!m)return fail("Usage: "+prefix+"rank-history @member");const rows=config.history.filter(x=>x.memberId===m.id).slice(0,10);return send("RANK HISTORY • "+m.user.tag,rows.map(x=>"• "+x.action+": "+(x.oldRankId?"<@&"+x.oldRankId+">":"Unranked")+" → "+(x.newRankId?"<@&"+x.newRankId+">":"Unranked")+" — <t:"+Math.floor(new Date(x.timestamp).getTime()/1000)+":R>").join("\n")||"No history.");}
      if(command==="rank-search"){const q=args.join(" ").toLowerCase();if(!q)return fail("Usage: "+prefix+"rank-search <name>");const members=await getGuildMembers(message.guild);const rows=members.filter(m=>m.user.username.toLowerCase().includes(q)||m.displayName.toLowerCase().includes(q)).first(10);return send("RANK SEARCH",rows.map(m=>{const r=getHighestConfiguredRank(m,config.ranks,message.guild.roles.cache);return "• "+m.user.tag+" — "+(r?"<@&"+r.id+">":"Unranked");}).join("\n")||"No matches.");}
      if(command==="rank-stats"){const members=await getGuildMembers(message.guild);return send("RANK STATISTICS","Members: "+members.size+"\n"+config.ranks.map(r=>"• <@&"+r.id+"> — "+members.filter(m=>m.roles.cache.has(r.id)).size).join("\n"));}
      if(command==="rank-leaderboard"){const members=await getGuildMembers(message.guild);const rows=members.map(m=>({m,r:getHighestConfiguredRank(m,config.ranks,message.guild.roles.cache)})).filter(x=>x.r).sort((a,b)=>b.r.position-a.r.position).slice(0,10);return send("RANK LEADERBOARD",rows.map((x,i)=>(i+1)+". "+x.m.user.tag+" — <@&"+x.r.id+">").join("\n")||"No ranked members.");}
      if (command === "rankpredict") {
        const member = await prefixMember(args[0]);
        const rankId = mentionedId(args[1], true);
        const targetRank = config.ranks.find(rank => rank.id === rankId);
        if (!member || !targetRank) return fail("Usage: " + prefix + "rankpredict @member @rank");
        const currentRank = getHighestConfiguredRank(member, config.ranks, message.guild.roles.cache);
        const currentIndex = currentRank ? config.ranks.findIndex(rank => rank.id === currentRank.id) : -1;
        const targetIndex = config.ranks.findIndex(rank => rank.id === targetRank.id);
        const gap = targetIndex - currentIndex;
        const prediction = gap === 0 ? "Already at the target rank." : Math.abs(gap) + " rank levels " + (gap > 0 ? "above" : "below") + " the current rank.";
        return send("RANK TRAJECTORY", "Current: " + (currentRank ? "<@&" + currentRank.id + ">" : "Unranked") + "\nTarget: <@&" + targetRank.id + ">\n" + prediction);
      }
      if(command==="serverpulse"){const days=Object.values(config.pulse.days||{}),t=days.reduce((a,d)=>({messages:a.messages+(d.messages||0),joins:a.joins+(d.joins||0),leaves:a.leaves+(d.leaves||0)}),{messages:0,joins:0,leaves:0});return send("PARADOX PULSE","Messages: "+t.messages+"\nJoins: "+t.joins+"\nLeaves: "+t.leaves+"\nDays: "+days.length);}
      if(command==="staffactivity"){if(!prefixManager(PermissionFlagsBits.ModerateMembers))return fail("Staff permission required.");const counts={};for(const x of config.history)counts[x.actorId]=(counts[x.actorId]||0)+1;for(const x of config.moderationCases)counts[x.moderatorId]=(counts[x.moderatorId]||0)+1;return send("STAFF ACTIVITY",Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10).map((x,i)=>(i+1)+". <@"+x[0]+"> — "+x[1]).join("\n")||"No staff actions.");}
      if(command==="memberjourney"){const m=await prefixMember(args[0]);if(!m)return fail("Usage: "+prefix+"memberjourney @member");const rows=config.history.filter(x=>x.memberId===m.id).slice(0,8),r=getHighestConfiguredRank(m,config.ranks,message.guild.roles.cache);return send("MEMBER JOURNEY","Member: "+m.toString()+"\nCurrent rank: "+(r?"<@&"+r.id+">":"Unranked")+"\nJoined: "+(m.joinedTimestamp?"<t:"+Math.floor(m.joinedTimestamp/1000)+":D>":"Unknown")+"\n"+rows.map(x=>"• "+(x.oldRankId?"<@&"+x.oldRankId+">":"Unranked")+" → "+(x.newRankId?"<@&"+x.newRankId+">":"Unranked")).join("\n"));}
      if(command==="spotlight"){if(!prefixManager(PermissionFlagsBits.ManageRoles))return fail("Manage Roles or Administrator required.");const m=await prefixMember(args[0]);if(!m)return fail("Usage: "+prefix+"spotlight @member [reason]");const r=getHighestConfiguredRank(m,config.ranks,message.guild.roles.cache);const e=new EmbedBuilder().setColor(0xffc857).setTitle("🌟 COMMUNITY SPOTLIGHT").setThumbnail(m.user.displayAvatarURL()).setDescription(m.toString()+" deserves the spotlight!\n"+(args.slice(1).join(" ")||"Recognized by staff.")).addFields({name:"Current rank",value:r?"<@&"+r.id+">":"Unranked"}).setFooter({text:message.guild.name+" • Paradoxplus"});return message.channel.send({embeds:[e],allowedMentions:{users:[m.id],parse:[]}});}
    }
    if(command==="autoresponder"){
      const sub=(args.shift()||"list").toLowerCase();
      if(sub==="list")return send("AUTO-REPLIES",config.autoresponders.map(x=>"• "+x.trigger+" → "+x.response.slice(0,100)).join("\n")||"No autoresponders.");
      if(!prefixManager(PermissionFlagsBits.ManageMessages))return fail("Manage Messages or Administrator required.");
      if(sub==="add"){const p=args.join(" ").split("|");if(p.length<2)return fail("Usage: "+prefix+"autoresponder add trigger | response");const trigger=p[0].trim(),response=p.slice(1).join("|").trim();if(trigger.length<2||trigger.length>100||!response||response.length>1800)return fail("Trigger 2–100 chars; response up to 1,800.");config.autoresponders=config.autoresponders.filter(x=>x.trigger.toLowerCase()!==trigger.toLowerCase());config.autoresponders.push({trigger,response});await saveDatabase();return send("AUTO-REPLY ADDED","Trigger: "+trigger);}
      if(sub==="remove"){const trigger=args.join(" ").trim(),n=config.autoresponders.length;config.autoresponders=config.autoresponders.filter(x=>x.trigger.toLowerCase()!==trigger.toLowerCase());if(n===config.autoresponders.length)return fail("Trigger not found.");await saveDatabase();return send("AUTO-REPLY REMOVED",trigger);}
      return fail("Use add, remove, or list.");
    }
    if(command==="inactive-reason"){
      const sub=(args.shift()||"submit").toLowerCase();
      if(sub==="submit"){const reason=args.join(" ").trim().slice(0,800);if(reason.length<5)return fail("Usage: "+prefix+"inactive-reason submit <reason>");if(config.inactiveAppeals.some(x=>x.memberId===message.author.id&&["PENDING","ON_HOLD"].includes(x.status)))return fail("You already have a pending appeal.");const a={id:config.inactiveAppeals.reduce((m,x)=>Math.max(m,Number(x.id)||0),0)+1,memberId:message.author.id,reason,status:"PENDING",submittedAt:new Date().toISOString(),reviewedAt:null,reviewerId:null,staffNote:null};config.inactiveAppeals.unshift(a);await saveDatabase();const ch=await message.guild.channels.fetch("1570589159289126962").catch(()=>null);if(ch?.isTextBased())await ch.send({embeds:[new EmbedBuilder().setColor(0xf0a33a).setTitle("INACTIVITY APPEAL #"+a.id).setDescription("Member: "+message.author.toString()+"\nStatus: Pending").addFields({name:"Reason",value:reason})],allowedMentions:{parse:[]}});return send("APPEAL SUBMITTED","Your appeal #"+a.id+" has been saved.");}
      if(!prefixManager(PermissionFlagsBits.ModerateMembers))return fail("Staff permission required.");
      if(sub==="list")return send("INACTIVITY APPEALS",config.inactiveAppeals.slice(0,15).map(a=>"#"+a.id+" <@"+a.memberId+"> — "+a.status+"\n> "+a.reason.slice(0,150)).join("\n")||"No appeals.");
      if(sub==="review"){const m=await prefixMember(args[0]),decision=(args[1]||"").toUpperCase(),a=m&&config.inactiveAppeals.find(x=>x.memberId===m.id&&["PENDING","ON_HOLD"].includes(x.status));if(!a||!["ACCEPTED","REJECTED","ON_HOLD"].includes(decision))return fail("Usage: "+prefix+"inactive-reason review @member <accepted|rejected|on_hold> [note]");a.status=decision;a.reviewedAt=new Date().toISOString();a.reviewerId=message.author.id;a.staffNote=args.slice(2).join(" ").slice(0,500)||null;await saveDatabase();return send("APPEAL REVIEWED","Appeal #"+a.id+" is now "+decision+".");}
      return fail("Use submit, review, or list.");
    }
    if(command==="clear-warnings"){
      if(!isBotOwner(message.author.id)&&!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)&&!message.member.permissions.has(PermissionFlagsBits.Administrator))return fail("You need Moderate Members or Administrator.");
      const m=await prefixMember(args[0]);if(!m)return fail("Usage: "+prefix+"clear-warnings @member");
      const rows=config.warnings.filter(x=>x.memberId===m.id);if(!rows.length)return fail("That member has no warnings.");
      config.warnings=config.warnings.filter(x=>x.memberId!==m.id);prefixRecord("CLEAR_WARNINGS",m.id,"Cleared "+rows.length+" warnings");await saveDatabase();
      return send("WARNINGS CLEARED","Removed "+rows.length+" warning(s) from "+m.toString()+".");
    }
    if(command==="unwarn"){
      if(!prefixManager(PermissionFlagsBits.ModerateMembers))return fail("You need Moderate Members or Administrator.");
      const m=await prefixMember(args[0]),id=Number(args[1]),reason=args.slice(2).join(" ").trim(),w=m&&config.warnings.find(x=>x.memberId===m.id&&Number(x.id)===id);
      if(!w||!reason)return fail("Usage: "+prefix+"unwarn @member <warning-id> <reason>");
      config.warnings=config.warnings.filter(x=>x!==w);w.removedAt=new Date().toISOString();w.removedBy=message.author.id;w.removalReason=reason;config.warningHistory.unshift(w);prefixRecord("UNWARN",m.id,"Removed warning #"+id+": "+reason);await saveDatabase();
      return send("WARNING REMOVED","Removed warning #"+id+" for "+m.toString()+". Audit history preserved.");
    }
    if(command==="case-reason"){
      if(!prefixManager(PermissionFlagsBits.ModerateMembers))return fail("You need Moderate Members or Administrator.");
      const id=Number(args.shift()),item=config.moderationCases.find(x=>Number(x.id)===id),reason=args.join(" ").trim();
      if(!item||!reason)return fail("Usage: "+prefix+"case-reason <case-id> <new reason>");
      item.reason=reason.slice(0,480);item.reasonUpdatedAt=new Date().toISOString();item.reasonUpdatedBy=message.author.id;await saveDatabase();
      return send("CASE REASON UPDATED","Updated case #"+id+".");
    }
    if(command==="softban"){
      if(!prefixManager(PermissionFlagsBits.BanMembers))return fail("You need Ban Members or Administrator.");
      const m=await prefixMember(args[0]),reason=args.slice(1).join(" ")||"Softban by "+message.author.tag;
      if(!m||m.id===message.author.id||!canActOnTarget(message.member,m,message.guild))return fail("Usage: "+prefix+"softban @member [reason] — check role hierarchy.");
      const bot=message.guild.members.me??await message.guild.members.fetchMe();if(!m.bannable||m.roles.highest.comparePositionTo(bot.roles.highest)>=0)return fail("I cannot ban that member. Check my role position and Ban Members permission.");
      await m.ban({deleteMessageSeconds:86400,reason:reason.slice(0,480)});await message.guild.bans.remove(m.id,"Softban completed by "+message.author.tag);
      prefixRecord("SOFTBAN",m.id,reason);await saveDatabase();return send("SOFTBAN COMPLETE","Softbanned "+m.user.tag+". Recent message history deleted; ban immediately lifted.");
    }
    if(["purge-user","purge-bots","purge-links","purge-invites","purge-attachments","purge-embeds","purge-mentions","purge-stickers","purge-contains"].includes(command)){
      if(!prefixManager(PermissionFlagsBits.ManageMessages))return fail("You need Manage Messages or Administrator.");
      const amount=Number(args[0]);if(!Number.isInteger(amount)||amount<1||amount>100)return fail("Usage: "+prefix+command+" <1-100> [member or text]");
      const member=command==="purge-user"?await prefixMember(args[1]):null,contains=command==="purge-contains"?args.slice(1).join(" ").toLowerCase():"";
      if(command==="purge-user"&&!member)return fail("Usage: "+prefix+"purge-user <1-100> @member");
      if(command==="purge-contains"&&!contains)return fail("Usage: "+prefix+"purge-contains <1-100> <text>");
      const recent=await message.channel.messages.fetch({limit:100});
      const matches=recent.filter(m=>{
        if(m.id===message.id||m.pinned)return false;
        if(command==="purge-user")return m.author.id===member.id;
        if(command==="purge-bots")return m.author.bot;
        if(command==="purge-links")return /https?:\/\/|www\./i.test(m.content);
        if(command==="purge-invites")return /discord(?:app)?\.com\/invite\/|discord\.gg\//i.test(m.content);
        if(command==="purge-attachments")return m.attachments.size>0;
        if(command==="purge-embeds")return m.embeds.length>0;
        if(command==="purge-mentions")return m.mentions.users.size>0||m.mentions.roles.size>0;
        if(command==="purge-stickers")return m.stickers.size>0;
        return m.content.toLowerCase().includes(contains);
      }).first(amount);
      if(!matches.length)return fail("No matching recent messages found.");
      const deleted=await message.channel.bulkDelete(matches,true);prefixRecord(command.toUpperCase().replace(/-/g,"_"),null,"Deleted "+deleted.size+" messages");await saveDatabase();
      return send("CLEANUP COMPLETE","Deleted "+deleted.size+" matching messages. Checked latest 100; Discord cannot bulk-delete messages older than 14 days.");
    }
    if(["voice-deafen","voice-undeafen"].includes(command)){
      if(!prefixManager(PermissionFlagsBits.DeafenMembers))return fail("You need Deafen Members or Administrator.");
      const m=await prefixMember(args[0]);if(!m?.voice.channel)return fail("Usage: "+prefix+command+" @member — member must be in voice.");
      if(!canActOnTarget(message.member,m,message.guild))return fail("That member has an equal or higher role than you.");
      await m.voice.setDeaf(command==="voice-deafen","Voice moderation by "+message.author.tag);prefixRecord(command.toUpperCase().replace(/-/g,"_"),m.id,null);await saveDatabase();
      return send("VOICE ACTION COMPLETE",(command==="voice-deafen"?"Server-deafened ":"Removed server deafen from ")+m.toString()+".");
    }
    if(command==="clear-reactions"){
      if(!prefixManager(PermissionFlagsBits.ManageMessages))return fail("You need Manage Messages or Administrator.");
      const id=args[0];if(!id||!/^\d{17,20}$/.test(id))return fail("Usage: "+prefix+"clear-reactions <message-id>");
      const target=await message.channel.messages.fetch(id).catch(()=>null);if(!target)return fail("Message not found in this channel.");
      await target.reactions.removeAll();prefixRecord("CLEAR_REACTIONS",null,"Message "+id);await saveDatabase();return send("REACTIONS CLEARED","Removed all reactions from that message.");
    }
    if (command === "rankhelp" || command === "help") {
      const help = new EmbedBuilder()
        .setColor(0x7c5cff)
        .setAuthor({ name: "ＰＡＲＡＤＯＸＰＬＵＳ  •  COMMAND DIRECTORY", iconURL: client.user.displayAvatarURL() })
        .setTitle("✦  COMMAND CENTER")
        .setDescription(
          "A clean guide to Paradoxplus commands.\n" +
          " **Prefix:** \`" + prefix + "\`  •  **Slash commands:** use Discord's `/` command picker.\n" +
          "━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        .addFields(
          {
            name: "🌐  COMMUNITY",
            value:
              "\`" + prefix + "welcome set #channel\` — Set welcome channel\n" +
              "\`" + prefix + "welcome remove\` — Disable welcomes\n" +
              "\`" + prefix + "welcome test\` — DM yourself a preview\n" +
              "\`" + prefix + "recruit @member\` — Record a recruit\n" +
              "\`" + prefix + "recruits [@member]\` — View recruit stats\n" +
              "\`" + prefix + "recruitleaderboard [daily|weekly|monthly|all]\` — Recruit rankings\n" +
              "\`" + prefix + "dm-optin / dm-optout\` — Manage server DMs",
            inline: false
          },
          {
            name: "🏅  MEMBER RANKS",
            value:
              "\`" + prefix + "rank [@member]\` — Check a member's rank\n" +
              "\`" + prefix + "rankpanel\` — View rank hierarchy\n" +
              "\`" + prefix + "rankhistory @member\` — Rank history\n" +
              "\`" + prefix + "ranksearch name\` — Find a member\n" +
              "\`" + prefix + "rankstats\` — Rank statistics\n" +
              "\`" + prefix + "rankleaderboard\` — Rank leaderboard",
            inline: false
          },
          {
            name: "🛡️  STAFF & MODERATION",
            value:
              "\`/promote\`, \`/demote\`, \`/setrank\` — Manage ranks\n" +
              "\`" + prefix + "kick / ban / timeout\` — Prefix moderation\n" +
              "\`/kick\`, \`/ban\`, \`/softban\`, \`/unban\`, \`/timeout\`, \`/untimeout\`\n" +
              "\`/warn\`, \`/warnings\`, \`/unwarn\`, \`/clear-warnings\`\n" +
              "\`/strike\`, \`/strikes\`, \`/remove-strike\`\n" +
              "\`/modlog\`, \`/case\`, \`/case-reason\`, \`/banlist\`\n" +
              "\`/note\`, \`/notes\`, \`/clear-notes\`",
            inline: false
          },
          {
            name: "🎫  TICKETS",
            value:
              "\`/ticket-panel channel:#channel\` — Publish the ticket portal\n" +
              "\`/ticket panel channel:#channel\` — Choose where the panel is posted (optional)\n" +
              "Categories: Support • Member Report • Partnership • Alliance / Merge\n" +
              "\`/ticket add @member\` / \`remove @member\`\n" +
              "\`/ticket claim\` / \`unclaim\` — Staff ownership\n" +
              "\`/ticket priority\` / \`info\` / \`rename\`\n" +
              "\`/ticket close\` / \`reopen\` / \`transcript\`",
            inline: false
          },
          {
            name: "⚙️  SERVER TOOLS",
            value:
              "\`/lock\`, \`/unlock\`, \`/hide\`, \`/show\`, \`/slowmode\`, \`/slowmode-off\`\n" +
              "\`/set-topic\`, \`/nickname\`, \`/nick-reset\`, \`/role-add\`, \`/role-remove\`\n" +
              "\`/purge\`, \`/purge-user\`, \`/purge-bots\`, \`/purge-links\`, \`/purge-invites\`\n" +
              "\`/purge-attachments\`, \`/purge-embeds\`, \`/purge-mentions\`, \`/purge-stickers\`, \`/purge-contains\`\n" +
              "\`/userinfo\`, \`/serverinfo\`, \`/serverpulse\`, \`/modstats\`, \`/staffactivity\`, \`/memberjourney\`, \`/spotlight\`",
            inline: false
          },
          {
            name: "✨  TRIGGERS & QUICK HELP",
            value:
              "\`" + prefix + "triggerlist\` — View saved triggers\n" +
              "\`" + prefix + "trigger add phrase | reply\` — Add a trigger\n" +
              "\`" + prefix + "trigger remove \"phrase\"\` — Remove a trigger\n" +
              "\`" + prefix + "ping\` — Check bot latency\n" +
              "\`" + prefix + "help\` — Show this command guide",
            inline: false
          }
        )
        .setFooter({ text: "PARADOXPLUS  •  ParadoxManagerV1  •  Commands vary by permissions" })
        .setTimestamp();
      return message.reply({ embeds: [help], allowedMentions: { repliedUser: false, parse: [] } });
    }
    if (command === "strikes") {
      const id = mentionedId(args[0]) || message.author.id;
      if (id !== message.author.id && !isBotOwner(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) return fail("Only staff can inspect another member's strike record.");
      const user = await client.users.fetch(id).catch(() => null);
      if (!user) return fail("Member not found.");
      const active = config.strikes.filter(item => item.memberId === id);
      const history = config.strikeHistory.filter(item => item.memberId === id).slice(0, 8);
      const lines = history.map(item => "• **#" + item.id + "** " + item.reason.slice(0, 140) + " — <t:" + Math.floor(new Date(item.timestamp).getTime()/1000) + ":R>" + (item.removedAt ? " • Revoked" : ""));
      return send("📋 Strike record", "**Member:** <@" + id + ">\n**Active strikes:** **" + active.length + "**\n\n**Recent strike history**\n" + (lines.join("\n") || "No strike history found.") + "\n\nRevoked strikes remain visible in the audit history.");
    }
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
        const reviewChannel = await message.guild.channels.fetch("1573000934680699023").catch(() => null);
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
        const reviewChannel = await message.guild.channels.fetch("1573000934680699023").catch(() => null);
        if (!reviewChannel?.isTextBased()) return message.reply("⚠️ Strike recorded, but I couldn't access the staff review channel.");
        await reviewChannel.send({ embeds: [embed], allowedMentions: { parse: [], users: [] } });
        return message.reply("✅ Strike recorded and sent to the staff review channel.");
      });
    }
    if (["kick","ban","timeout","untimeout","purge"].includes(command)) {
      const perm={kick:PermissionFlagsBits.KickMembers,ban:PermissionFlagsBits.BanMembers,timeout:PermissionFlagsBits.ModerateMembers,untimeout:PermissionFlagsBits.ModerateMembers,purge:PermissionFlagsBits.ManageMessages}[command];
      if (!isBotOwner(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.Administrator) && !message.member.permissions.has(perm)) return fail("You don't have permission to use that moderation command.");
      if(command==="purge"){
        const n=Number(args[0]); if(!Number.isInteger(n)||n<1||n>100) return fail("Usage: ?purge 1-100");
        const recent = await message.channel.messages.fetch({ limit: 100 });
        const selected = recent.filter(item => item.id !== message.id && !item.pinned).first(n);
        if (!selected.length) return fail("No recent messages were found to delete.");
        const deleted = await message.channel.bulkDelete(selected, true);
        await message.delete().catch(() => null);
        const confirmation = await send("🧹 Messages cleared",`Deleted **${deleted.size}** messages (your purge command is removed separately).`);
        if (confirmation) setTimeout(() => confirmation.delete().catch(() => null), 1000);
        return confirmation;
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
      const current = getHighestConfiguredRank(target, ranks, message.guild.roles.cache);
      let desired, action = command === "promote" ? "PROMOTED" : command === "demote" ? "DEMOTED" : "SET", reasonArgs = args.slice(1);
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
        const orderedRanks = [...ranks].sort((a, b) => {
          const roleA = message.guild.roles.cache.get(a.id);
          const roleB = message.guild.roles.cache.get(b.id);
          if (roleA && roleB) return roleA.position - roleB.position;
          return (a.position || 0) - (b.position || 0);
        });
        const currentIndex = orderedRanks.findIndex(r => r.id === current.id);
        const requestedSteps = args[1] === undefined ? 1 : Number(args[1]);
        if (!Number.isSafeInteger(requestedSteps) || requestedSteps < 1) {
          return fail("Usage: " + prefix + "demote @member [number-of-ranks-down] [reason]");
        }
        const destinationIndex = currentIndex - requestedSteps;
        if (destinationIndex < 0) {
          return fail("That member cannot be demoted " + requestedSteps + " rank(s). They are only " + currentIndex + " rank(s) above the lowest configured rank.");
        }
        desired = orderedRanks[destinationIndex];
        reasonArgs = args[1] === undefined ? args.slice(1) : args.slice(2);
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
    return fail(`Unknown command ${prefix}${command}. Use ${prefix}help.`);
  } catch (error) {
    console.error("Prefix command error:", error);
    return fail("Something went wrong. Check the bot logs.");
  }
});

await loadDatabase();
await initRecruitmentDatabase();
startDashboard({ client, getGuildConfig, saveDatabase });
client.login(TOKEN);
