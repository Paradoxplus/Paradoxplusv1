import "dotenv/config";
import {
  Client, GatewayIntentBits, Partials, Events, PermissionFlagsBits,
  EmbedBuilder, AttachmentBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder
} from "discord.js";
import fs from "node:fs/promises";
import path from "node:path";
import { startDashboard } from "./dashboard.js";
import { joinVoiceChannel, VoiceConnectionStatus, entersState, getVoiceConnection } from "@discordjs/voice";
import { setupMusic, handleMusicInteraction, handleMusicPrefix } from "./music.js";
import { initRecruitmentDatabase, recordRecruit, getRecruitStats, getRecruitLeaderboard, isRecruitmentDatabaseReady } from "./recruitment.js";

 
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

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates],
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
  if (!Array.isArray(config.notes)) config.notes = [];
  if (!Array.isArray(config.warningHistory)) config.warningHistory = [];
  if (!config.pulse || typeof config.pulse !== "object") config.pulse = { days: {} };
  if (!config.pulse.days || typeof config.pulse.days !== "object") config.pulse.days = {};
  if (!Array.isArray(config.ignoredRoleIds)) config.ignoredRoleIds = [];
  if (!Array.isArray(config.autoresponders)) config.autoresponders = [];
  if (typeof config.ticketStaffRoleId !== "string") config.ticketStaffRoleId = null;
  if (!Array.isArray(config.dmOptIns)) config.dmOptIns = [];
  if (!Number.isInteger(config.recruitCount) || config.recruitCount < 0) config.recruitCount = 0;
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

client.on(Events.GuildRoleCreate, role => {
  if (role.guild.id === "1568943817762017400") void syncRankRoles(role.guild).catch(error => console.error("Role-create auto-sync failed:", error));
});
client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
  if (newRole.guild.id === "1568943817762017400") void syncRankRoles(newRole.guild).catch(error => console.error("Role-update auto-sync failed:", error));
});
client.on(Events.GuildRoleDelete, role => {
  if (role.guild.id === "1568943817762017400") void syncRankRoles(role.guild).catch(error => console.error("Role-delete auto-sync failed:", error));
});


// Paradoxplus live member counter: a locked text channel placed above categories.
const MEMBER_COUNTER_GUILD_ID = "1568943817762017400";
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

client.on(Events.GuildMemberAdd, async member => {
  const config = getGuildConfig(member.guild.id);
  pulseDay(config).joins++;
  trimPulse(config);
  void saveDatabase().catch(error => console.error("Pulse join save failed:", error));
  void syncMemberCounter(member.guild).catch(error => console.error("[MemberCounter] Join sync failed:", error));
  if (!config.welcomeChannelId) return;
  const channel = member.guild.channels.cache.get(config.welcomeChannelId)
    ?? await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const bannerUrl = "https://www.image2url.com/r2/default/gifs/1794386711876-4bbf4f54-5448-4384-960d-4424655e01a2.gif";
  const count = member.guild.memberCount;
  const embed = new EmbedBuilder()
    .setColor(0x7c5cff)
    .setAuthor({ name: "Paradoxplus", iconURL: client.user.displayAvatarURL() })
    .setTitle("✦ WELCOME TO PARADOXX")
    .setDescription(
      "A new legend just entered the realm.\n\n" +
      "Welcome aboard, " + member.toString() + "!\n" +
      "You're our **" + count.toLocaleString() + getOrdinalSuffix(count) + " member**.\n\n" +
      "Make yourself at home, meet the community, and enjoy your stay.\n\n" +
      "╰┈➤ **PARADOXX • WHERE LEGENDS CONNECT**"
    )
    .setThumbnail(member.user.displayAvatarURL({ extension: "png", size: 256 }))
    .setImage(bannerUrl)
    .setFooter({ text: "ParadoxManagerV1  •  Member #" + count })
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

const OWNER_VOICE_GUILD_ID = "1568943817762017400";
const OWNER_VOICE_CHANNEL_ID = "1568943822883528710";
let ownerVoiceRetryTimer = null;
let ownerVoiceConnecting = false;

async function connectOwnerVoice(readyClient) {
  if (readyClient.lavalink?.getPlayer(OWNER_VOICE_GUILD_ID)) return;
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

client.once(Events.ClientReady, async readyClient => {
  const counterGuild = await readyClient.guilds.fetch(MEMBER_COUNTER_GUILD_ID).catch(() => null);
  if (counterGuild) await syncMemberCounter(counterGuild).catch(error => console.error("[MemberCounter] Startup sync failed:", error));
  const rankGuild = await readyClient.guilds.fetch("1568943817762017400").catch(() => null);
  if (rankGuild) await syncRankRoles(rankGuild).catch(error => console.error("Initial rank-role auto-sync failed:", error));
  console.log(`Online as ${readyClient.user.tag}`);
  console.log(`Serving ${readyClient.guilds.cache.size} server(s).`);
  void connectOwnerVoice(readyClient);
});

setupMusic(client, () => connectOwnerVoice(client));

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
      { label: "Paid Promotion", description: "Enquire about paid promotions", value: "Paid Promotion", emoji: "📢" }
    );
  const panel = new EmbedBuilder()
    .setColor(0x6d5dfc)
    .setTitle("🎟️ Paradoxx | Ticket Support")
    .setDescription(
      "## Paradoxx | 1.9+ Ticket Support\n\n" +
      "**Types Of Support We Provide**\n\n" +
      "> - Team Application\n> - General Support\n> - Paid Promotion\n\n" +
      "**Requirements for __Team Application:__**\n\n" +
      "> • Must be LT4+ in one of these gamemodes: Nethpot / SMP / Crystal\n" +
      "> • Must be active in both VC and Chat\n" +
      "> • Must act mature and have common sense\n\n" +
      "**Types of help we can provide in __General Support:__**\n\n" +
      "> - Ally / Merge Request\n> - Technical Help\n> - Staff Report\n> - Giveaways Rewards\n> - Clan V/s Clan\n\n" +
      "**NOTE:** Create a ticket only for one of the support types listed above."
    )
    .setThumbnail(guild.iconURL({ size: 256 }) || botUser.displayAvatarURL())
    .setImage("https://www.image2url.com/r2/default/gifs/1794386711876-4bbf4f54-5448-4384-960d-4424655e01a2.gif")
    .setFooter({ text: "Powered By Paradox • Core" });
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
    "PARADOXPLUS TICKET TRANSCRIPT",
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
  const supportCategoryId = "1568943820995961012";
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
      topic: "Paradoxplus automatically archived ticket transcripts",
      parent: supportCategory.id,
      permissionOverwrites: overwrites,
      reason: "Create private ticket transcript archive"
    });
  } else {
    if (transcriptChannel.parentId !== supportCategory.id) {
      await transcriptChannel.setParent(supportCategory.id, {
        lockPermissions: false,
        reason: "Keep ticket transcripts inside the Paradoxplus support area"
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
    name: "paradoxplus-" + channel.id + "-transcript.txt"
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
    .setFooter({ text: "Paradoxplus • Automatic Ticket Archive" })
    .setTimestamp();
  await transcriptChannel.send({ embeds: [embed], files: [attachment], allowedMentions: { users: [closedBy], parse: [] } });
  return transcriptChannel;
}

client.on(Events.InteractionCreate, async interaction => {
  if (await handleMusicInteraction(interaction, client)) return;

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
      const categoryId = "1568943820995961012";
      const ticketCategory = await interaction.guild.channels.fetch(categoryId).catch(() => null);
      if (!ticketCategory || ticketCategory.type !== ChannelType.GuildCategory) {
        return interaction.editReply("The ticket category is missing or is not a category. Please ask an administrator to check the ticket setup.");
      }
      const username = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "member";
      const typeSlug = ticketType === "General Support" ? "general" : ticketType === "Team Application" ? "team-application" : "paid-promotion";
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
        reason: "Paradox 1.9+ " + ticketType + " ticket opened by " + interaction.user.tag
      });
      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("px_ticket_close").setLabel("Close ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger)
      );
      const intro = new EmbedBuilder()
        .setColor(0x6d5dfc)
        .setAuthor({ name: "PARADOX 1.9+  /  PRIVATE SUPPORT", iconURL: interaction.client.user.displayAvatarURL() })
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
        .setFooter({ text: "PARADOX 1.9+ • ParadoxManagerV1  /  Use the button below when your issue is resolved" })
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
    if (!ownerId) return interaction.reply({ content: "This button can only be used inside a Paradoxplus ticket.", ephemeral: true });
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
      await interaction.channel.delete("Paradoxplus ticket archived and automatically deleted after closure");
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
        return replyError(interaction, "Use this command inside a Paradoxplus ticket channel.");
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
          .setFooter({ text: "Paradoxplus • Ticket Management" });
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
        await interaction.channel.delete("Paradoxplus ticket archived and automatically deleted after closure");
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
        if (!ownerId) return replyError(interaction, "Use /ticket add inside an open Paradoxplus ticket channel.");
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
      const result = await recordRecruit({ guildId: interaction.guildId, recruitId: target.id, recruiterId: interaction.user.id, source: "slash" });
      if (result.duplicate) return replyError(interaction, "That member has already been recorded as a recruit in this server.");
      const embed = new EmbedBuilder()
        .setColor(0x7c5cff)
        .setAuthor({ name: "APP", iconURL: interaction.client.user.displayAvatarURL() })
        .setTitle("New recruit")
        .setDescription("**.GG/PX**\n\n**Recruit:** " + target.toString() + "\n\n**Recruited by:** " + interaction.user.toString() + "\n\n**Recruit no.:** #" + (config.recruitCount + result.total) + "\n\n**PARADOXX**")
        .setImage("https://www.image2url.com/r2/default/gifs/1794386711876-4bbf4f54-5448-4384-960d-4424655e01a2.gif")
        .setFooter({ text: interaction.guild.name })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], allowedMentions: { users: [target.id, interaction.user.id], parse: [] } });
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
        const reviewChannel = await interaction.guild.channels.fetch("1568943823361671244").catch(() => null);
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
        const reviewChannel = await interaction.guild.channels.fetch("1568943823361671244").catch(() => null);
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

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  const config = getGuildConfig(message.guild.id);
  const prefix = typeof config.prefix === "string" && config.prefix.length >= 1 && config.prefix.length <= 5 ? config.prefix : DEFAULT_PREFIX;
  if (!message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = (args.shift() || "").toLowerCase();
  if (!command) return;
  const send = (title, description) => message.reply({
    embeds: [prefixEmbed(title, description)],
    allowedMentions: { repliedUser: false, parse: [] }
  });
  const fail = text => send("⚠️ Command error", text);
  try {
    if (await handleMusicPrefix(message, command, args, client)) return;
    if (command === "welcome") {
      const sub = (args.shift() || "").toLowerCase();
      const canConfigure = isBotOwner(message.author.id) ||
        message.member.permissions.has(PermissionFlagsBits.Administrator) ||
        message.member.permissions.has(PermissionFlagsBits.ManageGuild);
      if (!canConfigure) return fail("You need Manage Server or Administrator to configure welcome messages.");
      if (sub === "test") {
        const bannerUrl = "https://www.image2url.com/r2/default/gifs/1794386711876-4bbf4f54-5448-4384-960d-4424655e01a2.gif";
        const count = message.guild.memberCount;
        const embed = new EmbedBuilder()
          .setColor(0x7c5cff)
          .setAuthor({ name: "Paradoxplus", iconURL: client.user.displayAvatarURL() })
          .setTitle("✦ WELCOME TO PARADOXX")
          .setDescription(
            "A new legend just entered the realm.\n\n" +
            "Welcome aboard, " + message.member.toString() + "!\n" +
            "You're our **" + count.toLocaleString() + getOrdinalSuffix(count) + " member**.\n\n" +
            "Make yourself at home, meet the community, and enjoy your stay.\n\n" +
            "╰┈➤ **PARADOXX • WHERE LEGENDS CONNECT**"
          )
          .setThumbnail(message.author.displayAvatarURL({ extension: "png", size: 256 }))
          .setImage(bannerUrl)
          .setFooter({ text: "ParadoxManagerV1  •  Member #" + count })
          .setTimestamp();
        try {
          await message.author.send({ embeds: [embed], allowedMentions: { parse: [] } });
          return send("✦ Welcome test sent", "I've sent the welcome preview to your DMs.");
        } catch {
          return fail("I couldn't DM you. Enable direct messages from server members, then try again.");
        }
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
      return fail("Usage: " + prefix + "welcome set #channel\n" + prefix + "welcome remove");
    }
    if (command === "prefix") {
      if (!isBotOwner(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.Administrator) && !message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return fail("You need Manage Server or Administrator to change the prefix.");
      const nextPrefix = (args[0] || "").trim();
      if (!/^[^\\s]{1,5}$/.test(nextPrefix)) return fail("Usage: " + prefix + "prefix <new-prefix> (1–5 characters, no spaces)");
      config.prefix = nextPrefix;
      await saveDatabase();
      return send("✦ PREFIX UPDATED", "This server's command prefix is now `" + nextPrefix + "`.");
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
      const result = await recordRecruit({ guildId: message.guild.id, recruitId: target.id, recruiterId: message.author.id, source: "prefix" });
      if (result.duplicate) return fail("That member has already been recorded as a recruit in this server.");
      const embed = new EmbedBuilder()
        .setColor(0x7c5cff)
        .setAuthor({ name: "APP", iconURL: client.user.displayAvatarURL() })
        .setTitle("New recruit")
        .setDescription("**.GG/PX**\n\n**Recruit:** " + target.toString() + "\n\n**Recruited by:** " + message.author.toString() + "\n\n**Recruit no.:** #" + (config.recruitCount + result.total) + "\n\n**PARADOXX**")
        .setImage("https://www.image2url.com/r2/default/gifs/1794386711876-4bbf4f54-5448-4384-960d-4424655e01a2.gif")
        .setFooter({ text: message.guild.name })
        .setTimestamp();
      const recruitChannel = await message.guild.channels.fetch("1568943820509290518").catch(() => null);
      if (!recruitChannel?.isTextBased() || !recruitChannel.permissionsFor(message.guild.members.me)?.has(PermissionFlagsBits.SendMessages)) {
        return fail("I cannot access the recruit announcement channel. Check View Channel and Send Messages permissions.");
      }
      await recruitChannel.send({ embeds: [embed], allowedMentions: { users: [target.id, message.author.id], parse: [] } });
      return message.react("✅");
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
      const id = mentionedId(token) || (token && /^\\d{17,20}$/.test(token) ? token : null);
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
      const target = await prefixTarget(args[0]);
      if (!target) return fail("Usage: " + prefix + command + " @member [reason]");
      const actor = message.member;
      if (target.id === message.author.id || !canActOnTarget(actor, target, message.guild)) return fail("You cannot moderate a member with an equal or higher role.");
      if (command === "warn") {
        const reason = args.slice(1).join(" ").trim();
        if (!reason) return fail("Usage: " + prefix + "warn @member <reason>");
        const warning = { id: config.warnings.length + 1, memberId: target.id, moderatorId: message.author.id, reason, timestamp: new Date().toISOString() };
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
    if (["role-add","role-remove"].includes(command)) {
      if (!modPermission(PermissionFlagsBits.ManageRoles)) return fail("You need Manage Roles or Administrator.");
      const target = await prefixTarget(args[0]);
      const roleId = args[1]?.match(/^<@&?(\\d+)>$/)?.[1] || (args[1] && /^\\d{17,20}$/.test(args[1]) ? args[1] : null);
      const role = roleId ? await message.guild.roles.fetch(roleId).catch(() => null) : null;
      if (!target || !role) return fail("Usage: " + prefix + command + " @member @role");
      const bot = message.guild.members.me ?? await message.guild.members.fetchMe();
      if (!canActOnTarget(message.member, target, message.guild) || role.managed || role.position >= message.member.roles.highest.position || role.position >= bot.roles.highest.position || !role.editable) return fail("That member or role is above my or your manageable role hierarchy.");
      if (command === "role-add") await target.roles.add(role, "Role added by " + message.author.tag);
      else await target.roles.remove(role, "Role removed by " + message.author.tag);
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
        const guild = message.guild;
        const embed = new EmbedBuilder().setColor(0x7c5cff).setTitle("Server overview").setThumbnail(guild.iconURL()).addFields(
          { name: "Server", value: guild.name }, { name: "Owner", value: "<@" + guild.ownerId + ">" },
          { name: "Members", value: String(guild.memberCount), inline: true }, { name: "Channels", value: String(guild.channels.cache.size), inline: true },
          { name: "Roles", value: String(guild.roles.cache.size), inline: true }, { name: "Created", value: "<t:" + Math.floor(guild.createdTimestamp/1000) + ":D>" }
        );
        return message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
      }
      const counts = {};
      for (const item of config.moderationCases) counts[item.action] = (counts[item.action] || 0) + 1;
      return send("✦ MODERATION ANALYTICS", "Cases: **" + config.moderationCases.length + "**\nWarnings: **" + config.warnings.length + "**\n" + (Object.entries(counts).map(([key,value]) => "• **" + key + ":** " + value).join("\n") || "No cases recorded."));
    }
    if (command === "unban") {
      if (!modPermission(PermissionFlagsBits.BanMembers)) return fail("You need Ban Members or Administrator.");
      const id = args[0];
      if (!id || !/^\\d{17,20}$/.test(id)) return fail("Usage: " + prefix + "unban <user-id>");
      await message.guild.bans.remove(id, "Unban by " + message.author.tag);
      addPrefixCase("UNBAN", id, args.slice(1).join(" ") || null);
      await saveDatabase();
      return send("✦ MEMBER UNBANNED", "User ID `" + id + "` has been unbanned.");
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
      if (!id || !/^\\d{17,20}$/.test(id)) return fail("Usage: " + prefix + "clear-reactions <message-id>");
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
      if(command==="rank-help")return send("RANK COMMANDS",prefix+"rank, rankhistory, ranksearch, rankstats, rankleaderboard, rankpanel, rank-config, promote, demote, setrank.");
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
            name: "🎵  MUSIC",
            value:
              "\`" + prefix + "play song\`, \`pause\`, \`resume\`, \`skip\`, \`stop\`\n" +
              "\`" + prefix + "queue\`, \`nowplaying\`, \`previous\`, \`playnext song\`\n" +
              "\`" + prefix + "volume 1-100\`, \`loop off|track|queue\`, \`shuffle\`\n" +
              "\`" + prefix + "remove position\`, \`clear\`, \`seek seconds\`, \`filter preset\`, \`autoplay on|off\`",
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
        const reviewChannel = await message.guild.channels.fetch("1568943823361671244").catch(() => null);
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
        const reviewChannel = await message.guild.channels.fetch("1568943823361671244").catch(() => null);
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
