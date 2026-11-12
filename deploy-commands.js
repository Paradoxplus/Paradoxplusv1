
import "dotenv/config";
import {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} from "discord.js";

const commands = [
  new SlashCommandBuilder().setName("warn").setDescription("Record a formal member warning.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Warning reason").setMaxLength(300).setRequired(true)),
  new SlashCommandBuilder().setName("warnings").setDescription("View a member's warning history.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("clear-warnings").setDescription("Clear a member's recorded warnings.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("lock").setDescription("Lock a text channel for @everyone.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o=>o.setName("channel").setDescription("Channel (defaults to this channel)")),
  new SlashCommandBuilder().setName("unlock").setDescription("Unlock a text channel for @everyone.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o=>o.setName("channel").setDescription("Channel (defaults to this channel)")),
  new SlashCommandBuilder().setName("slowmode").setDescription("Set channel slowmode.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(o=>o.setName("seconds").setDescription("0 to disable, up to 21600").setMinValue(0).setMaxValue(21600).setRequired(true))
    .addChannelOption(o=>o.setName("channel").setDescription("Channel (defaults to this channel)")),
  new SlashCommandBuilder().setName("nickname").setDescription("Change or reset a member nickname.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("nickname").setDescription("New nickname; leave blank to reset").setMaxLength(32)),
  new SlashCommandBuilder().setName("role-add").setDescription("Add a role to a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addRoleOption(o=>o.setName("role").setDescription("Role to add").setRequired(true)),
  new SlashCommandBuilder().setName("role-remove").setDescription("Remove a role from a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addRoleOption(o=>o.setName("role").setDescription("Role to remove").setRequired(true)),
  new SlashCommandBuilder().setName("userinfo").setDescription("Show detailed information about a server member.")
    .addUserOption(o=>o.setName("member").setDescription("Member to inspect")),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Show detailed server information."),
  new SlashCommandBuilder().setName("modstats").setDescription("Show Paradoxplus moderation case statistics.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder().setName("kick").setDescription("Kick a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(480)),
  new SlashCommandBuilder().setName("ban").setDescription("Ban a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(480)),
  new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addIntegerOption(o=>o.setName("minutes").setDescription("Duration in minutes (1–40320)").setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(480)),
  new SlashCommandBuilder().setName("untimeout").setDescription("Remove a member timeout.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(480)),
  new SlashCommandBuilder().setName("purge").setDescription("Delete 1–100 recent messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName("amount").setDescription("Number of messages").setMinValue(1).setMaxValue(100).setRequired(true)),

  new SlashCommandBuilder()
    .setName("promote")
    .setDescription("Move a member up one rank in the configured hierarchy.")
    .addUserOption(o =>
      o.setName("member").setDescription("Member to promote").setRequired(true))
    .addStringOption(o =>
      o.setName("reason").setDescription("Optional reason").setMaxLength(300)),

  new SlashCommandBuilder()
    .setName("demote")
    .setDescription("Move a member down one rank in the configured hierarchy.")
    .addUserOption(o =>
      o.setName("member").setDescription("Member to demote").setRequired(true))
    .addStringOption(o =>
      o.setName("reason").setDescription("Optional reason").setMaxLength(300)),

  new SlashCommandBuilder()
    .setName("setrank")
    .setDescription("Set a member to an exact configured rank.")
    .addUserOption(o =>
      o.setName("member").setDescription("Member to update").setRequired(true))
    .addRoleOption(o =>
      o.setName("rank").setDescription("Configured rank to assign").setRequired(true))
    .addStringOption(o =>
      o.setName("reason").setDescription("Optional reason").setMaxLength(300)),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show a member's current configured rank.")
    .addUserOption(o =>
      o.setName("member").setDescription("Member to check")),

  new SlashCommandBuilder()
    .setName("rank-config")
    .setDescription("Configure this server's rank system.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)

    .addSubcommand(s => s.setName("add")
      .setDescription("Add or update a rank. Position 1 is the lowest.")
      .addRoleOption(o =>
        o.setName("role").setDescription("Role to use as a rank").setRequired(true))
      .addIntegerOption(o =>
        o.setName("position").setDescription("Rank position; 1 is lowest")
          .setMinValue(1).setMaxValue(100).setRequired(true)))

    .addSubcommand(s => s.setName("remove")
      .setDescription("Remove a role from the rank hierarchy.")
      .addRoleOption(o =>
        o.setName("role").setDescription("Rank role to remove").setRequired(true)))

    .addSubcommand(s => s.setName("ignore")
      .setDescription("Exclude a role from future autodetection; remove it from ranks if already added.")
      .addRoleOption(o =>
        o.setName("role").setDescription("Role to exclude from detection").setRequired(true)))

    .addSubcommand(s => s.setName("unignore")
      .setDescription("Allow a role to appear in autodetection again.")
      .addRoleOption(o =>
        o.setName("role").setDescription("Role to allow again").setRequired(true)))

    .addSubcommand(s => s.setName("ignored")
      .setDescription("List roles excluded from autodetection."))

    .addSubcommand(s => s.setName("list")
      .setDescription("Display the configured rank hierarchy."))

    .addSubcommand(s => s.setName("logs")
      .setDescription("Choose where rank changes are logged.")
      .addChannelOption(o =>
        o.setName("channel").setDescription("Log channel")
          .addChannelTypes(ChannelType.GuildText).setRequired(true)))

    .addSubcommand(s => s.setName("clear-logs")
      .setDescription("Disable rank-change logging."))

    .addSubcommand(s => s.setName("announce")
      .setDescription("Set the channel for rank-up announcements.")
      .addChannelOption(o =>
        o.setName("channel").setDescription("Announcement channel")
          .addChannelTypes(ChannelType.GuildText).setRequired(true)))

    .addSubcommand(s => s.setName("clear-announcements")
      .setDescription("Disable rank-up announcements."))

    .addSubcommand(s => s.setName("backup")
      .setDescription("Download a backup of this server's rank configuration."))

    .addSubcommand(s => s.setName("autodetect")
      .setDescription("Detect server roles and preview or import them.")
      .addBooleanOption(o =>
        o.setName("confirm")
          .setDescription("Set true to import the detected roles")
          .setRequired(true))),

  new SlashCommandBuilder()
    .setName("rank-history")
    .setDescription("Show a member's recent rank changes.")
    .addUserOption(o => o.setName("member").setDescription("Member to inspect").setRequired(true)),

  new SlashCommandBuilder()
    .setName("rank-search")
    .setDescription("Search server members by username or nickname.")
    .addStringOption(o => o.setName("query").setDescription("Name to search for").setMinLength(2).setMaxLength(32).setRequired(true)),

  new SlashCommandBuilder()
    .setName("rank-stats")
    .setDescription("Show how members are distributed across ranks."),

  new SlashCommandBuilder()
    .setName("rank-leaderboard")
    .setDescription("Show members with the highest configured ranks."),

  new SlashCommandBuilder()
    .setName("rank-panel")
    .setDescription("Display this server's rank hierarchy."),

  new SlashCommandBuilder()
    .setName("rank-help")
    .setDescription("Show Paradoxplus command help."),

].map(c => c.toJSON());

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID. Check your environment variables.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

try {
  if (guildId) {
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log("Registered commands to the test server.");
  } else {
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    console.log("Registered global commands. They may take a while to appear.");
  }
} catch (error) {
  console.error("Command registration failed:", error);
  process.exit(1);
}
