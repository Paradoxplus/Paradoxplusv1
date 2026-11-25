
import "dotenv/config";
import {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} from "discord.js";

const commands = [
  new SlashCommandBuilder().setName("giveaway").setDescription("Create, end, reroll, and view server giveaways.")
    .addSubcommand(sc=>sc.setName("create").setDescription("Start a button-entry giveaway.")
      .addStringOption(o=>o.setName("prize").setDescription("What members can win").setMaxLength(100).setRequired(true))
      .addStringOption(o=>o.setName("duration").setDescription("Duration, e.g. 30m, 2h, 1d (max 30d)").setMaxLength(8).setRequired(true))
      .addIntegerOption(o=>o.setName("winners").setDescription("Number of winners").setMinValue(1).setMaxValue(10).setRequired(true))
      .addChannelOption(o=>o.setName("channel").setDescription("Announcement channel; defaults to this channel").addChannelTypes(ChannelType.GuildText))
      .addStringOption(o=>o.setName("description").setDescription("Extra giveaway details").setMaxLength(500)))
    .addSubcommand(sc=>sc.setName("end").setDescription("End a giveaway early and draw winners.")
      .addStringOption(o=>o.setName("giveaway_id").setDescription("Message ID shown in the giveaway").setRequired(true)))
    .addSubcommand(sc=>sc.setName("reroll").setDescription("Pick replacement winners from remaining entrants.")
      .addStringOption(o=>o.setName("giveaway_id").setDescription("Message ID shown in the giveaway").setRequired(true)))
    .addSubcommand(sc=>sc.setName("list").setDescription("View recent giveaways.")),
  new SlashCommandBuilder().setName("ticket").setDescription("Create and manage private support tickets.")
    .addSubcommand(sc=>sc.setName("panel").setDescription("Post the dropdown ticket panel in a chosen channel.")
      .addChannelOption(o=>o.setName("channel").setDescription("Destination text channel; defaults to this channel").addChannelTypes(ChannelType.GuildText))
      .addRoleOption(o=>o.setName("staff_role").setDescription("Optional role that can view and manage tickets")))
    .addSubcommand(sc=>sc.setName("add").setDescription("Add a member to the current ticket.")
      .addUserOption(o=>o.setName("user").setDescription("Member to add").setRequired(true)))
    .addSubcommand(sc=>sc.setName("remove").setDescription("Remove a member from the current ticket.")
      .addUserOption(o=>o.setName("user").setDescription("Member to remove").setRequired(true)))
    .addSubcommand(sc=>sc.setName("claim").setDescription("Claim the current ticket."))
    .addSubcommand(sc=>sc.setName("unclaim").setDescription("Release your ticket claim."))
    .addSubcommand(sc=>sc.setName("rename").setDescription("Rename the current ticket.")
      .addStringOption(o=>o.setName("name").setDescription("New ticket channel name").setMinLength(1).setMaxLength(90).setRequired(true)))
    .addSubcommand(sc=>sc.setName("priority").setDescription("Set the ticket priority.")
      .addStringOption(o=>o.setName("level").setDescription("Priority level").setRequired(true)
        .addChoices({name:"Low",value:"Low"},{name:"Normal",value:"Normal"},{name:"High",value:"High"},{name:"Urgent",value:"Urgent"})))
    .addSubcommand(sc=>sc.setName("info").setDescription("View the current ticket details."))
    .addSubcommand(sc=>sc.setName("close").setDescription("Close the current ticket with an optional reason.")
      .addStringOption(o=>o.setName("reason").setDescription("Why this ticket is being closed").setMaxLength(500)))
    .addSubcommand(sc=>sc.setName("reopen").setDescription("Reopen a closed ticket."))
    .addSubcommand(sc=>sc.setName("transcript").setDescription("Export the ticket conversation as a text file.")),
  new SlashCommandBuilder().setName("ticket-panel").setDescription("Publish the Exile AS 1.9+ ticket portal in a selected channel.")
    .addChannelOption(o=>o.setName("channel").setDescription("Text channel where the ticket panel should be posted").addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("selfroles").setDescription("Publish the Elixe • As reaction-based self-role panel.")
    .addChannelOption(o => o.setName("channel").setDescription("Text channel where members can choose self-roles").addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("tag").setDescription("Apply the PX ϟ nickname prefix to members with a selected role.")
    .addSubcommand(sc => sc.setName("all").setDescription("Tag members who have the selected team role.")
      .addRoleOption(o => o.setName("role").setDescription("Only members with this role will be tagged").setRequired(true))
      .addBooleanOption(o => o.setName("confirm").setDescription("Confirm tagging members with this role").setRequired(true))),
  new SlashCommandBuilder().setName("welcomeset").setDescription("Configure the welcome channel, color, message, banner, and thumbnail.")
    .addChannelOption(o=>o.setName("channel").setDescription("Welcome destination text channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    .addStringOption(o=>o.setName("color").setDescription("Six-digit HEX color, e.g. #7C5CFF").setMinLength(6).setMaxLength(7).setRequired(true))
    .addStringOption(o=>o.setName("message").setDescription("Welcome text; supports {user}, {server}, {memberCount}").setMaxLength(3500).setRequired(true))
    .addAttachmentOption(o=>o.setName("image").setDescription("Upload the welcome banner image"))
    .addAttachmentOption(o=>o.setName("thumbnail").setDescription("Upload an optional thumbnail image")),
  new SlashCommandBuilder().setName("embed").setDescription("Send a custom colored embed to a channel.")
    .addStringOption(o=>o.setName("color").setDescription("Six-digit HEX color, e.g. #7C5CFF").setMinLength(6).setMaxLength(7).setRequired(true))
    .addStringOption(o=>o.setName("message").setDescription("Embed description").setMaxLength(4000).setRequired(true))
    .addChannelOption(o=>o.setName("channel").setDescription("Destination text channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    .addAttachmentOption(o=>o.setName("image").setDescription("Upload an optional embed image"))
    .addAttachmentOption(o=>o.setName("thumbnail").setDescription("Upload an optional thumbnail image")),
  new SlashCommandBuilder().setName("welcome").setDescription("Customize the welcome message; the banner remains fixed.")
    .addSubcommand(sc=>sc.setName("message").setDescription("Change the welcome message text.")
      .addStringOption(o=>o.setName("text").setDescription("Message text; supports {user}, {server}, {memberCount}").setMaxLength(3500).setRequired(true)))
    .addSubcommand(sc=>sc.setName("reset").setDescription("Restore the default welcome message."))
    .addSubcommand(sc=>sc.setName("test").setDescription("DM yourself a preview of the current welcome message.")),
  new SlashCommandBuilder().setName("prefix").setDescription("Change this server’s text command prefix.")
    .addStringOption(o=>o.setName("new_prefix").setDescription("New prefix (1–5 characters, no spaces)").setMinLength(1).setMaxLength(5).setRequired(true)),
  new SlashCommandBuilder().setName("recruit").setDescription("Record a new Elixe • As recruit.")
    .addUserOption(o=>o.setName("member").setDescription("Member being recruited").setRequired(true)),
  new SlashCommandBuilder().setName("dm-optin").setDescription("Opt in to Elixe • As server direct messages."),
  new SlashCommandBuilder().setName("dm-optout").setDescription("Opt out of Elixe • As server direct messages."),
  new SlashCommandBuilder().setName("dmall").setDescription("Send a direct message to members who opted in.")
    .addStringOption(o=>o.setName("message").setDescription("Message to send").setMaxLength(1800).setRequired(true))
    .addBooleanOption(o=>o.setName("confirm").setDescription("Confirm sending to opted-in members").setRequired(true)),
  new SlashCommandBuilder().setName("autoresponder").setDescription("Manage custom automatic replies.")
    .addSubcommand(sc=>sc.setName("add").setDescription("Add an automatic reply.")
      .addStringOption(o=>o.setName("trigger").setDescription("Text that activates the reply").setMinLength(2).setMaxLength(100).setRequired(true))
      .addStringOption(o=>o.setName("response").setDescription("Reply the bot should send").setMaxLength(1800).setRequired(true)))
    .addSubcommand(sc=>sc.setName("remove").setDescription("Remove an automatic reply.")
      .addStringOption(o=>o.setName("trigger").setDescription("Exact trigger to remove").setMinLength(2).setMaxLength(100).setRequired(true)))
    .addSubcommand(sc=>sc.setName("list").setDescription("List configured automatic replies.")),
  new SlashCommandBuilder().setName("strikes").setDescription("View active strikes and recent strike history.")
    .addUserOption(o=>o.setName("member").setDescription("Member to inspect; defaults to yourself")),
  new SlashCommandBuilder().setName("remove-strike").setDescription("Remove active strikes while preserving strike history.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member whose strikes to remove").setRequired(true))
    .addIntegerOption(o=>o.setName("amount").setDescription("Number of most recent active strikes to remove").setMinValue(1).setMaxValue(100).setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason for removing the strikes").setMaxLength(800).setRequired(true)),
  new SlashCommandBuilder().setName("strike").setDescription("Issue a strike; 3 strikes trigger an automatic two-rank demotion.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member to strike").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason for the strike").setMaxLength(800).setRequired(true)),
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
  new SlashCommandBuilder().setName("modstats").setDescription("Show Elixe • As moderation case statistics.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("unban").setDescription("Unban a user by Discord ID.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o=>o.setName("user_id").setDescription("Discord user ID").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(480)),
  new SlashCommandBuilder().setName("voice-mute").setDescription("Server-mute a member in voice.")
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(480)),
  new SlashCommandBuilder().setName("voice-unmute").setDescription("Remove a server voice mute.")
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(480)),
  new SlashCommandBuilder().setName("disconnect").setDescription("Disconnect a member from voice.")
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(480)),
  new SlashCommandBuilder().setName("inactive-reason").setDescription("Submit or review an inactivity appeal.")
    .addSubcommand(sc=>sc.setName("submit").setDescription("Submit your reason for being inactive.")
      .addStringOption(o=>o.setName("reason").setDescription("Explain your inactivity").setMaxLength(800).setRequired(true)))
    .addSubcommand(sc=>sc.setName("review").setDescription("Accept, reject, or hold a member's appeal.")
      .addUserOption(o=>o.setName("member").setDescription("Member whose appeal to review").setRequired(true))
      .addStringOption(o=>o.setName("decision").setDescription("Decision").setRequired(true)
        .addChoices({name:"Accept",value:"accepted"},{name:"Reject",value:"rejected"},{name:"Hold",value:"on_hold"}))
      .addStringOption(o=>o.setName("note").setDescription("Optional staff note").setMaxLength(500)))
    .addSubcommand(sc=>sc.setName("list").setDescription("View the latest inactivity appeals.")),

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
      .setDescription("Download a backup of this server's rank configuration.")),

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

  new SlashCommandBuilder().setName("serverpulse").setDescription("View Elixe • As Pulse community activity aggregates."),
  new SlashCommandBuilder().setName("rankpredict").setDescription("See the rank-level distance to a target rank.")
    .addUserOption(o=>o.setName("member").setDescription("Member to check").setRequired(true))
    .addRoleOption(o=>o.setName("target_rank").setDescription("Configured target rank").setRequired(true)),
  new SlashCommandBuilder().setName("staffactivity").setDescription("View the top staff by recorded rank and moderation actions.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("memberjourney").setDescription("View a member's rank timeline and server join date.")
    .addUserOption(o=>o.setName("member").setDescription("Member to inspect").setRequired(true)),
  new SlashCommandBuilder().setName("spotlight").setDescription("Give a member a public community spotlight.")
    .addUserOption(o=>o.setName("member").setDescription("Member to recognize").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Why they deserve recognition").setMaxLength(500)),

  new SlashCommandBuilder()
    .setName("rank-help")
    .setDescription("Show Elixe • As command help."),


  new SlashCommandBuilder().setName("modlog").setDescription("View recent moderation actions.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName("member").setDescription("Filter by member")),
  new SlashCommandBuilder().setName("case").setDescription("View a moderation case.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption(o=>o.setName("case_id").setDescription("Case number").setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName("case-reason").setDescription("Update a case reason.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption(o=>o.setName("case_id").setDescription("Case number").setMinValue(1).setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("New reason").setMaxLength(800).setRequired(true)),
  new SlashCommandBuilder().setName("note").setDescription("Add a private staff note.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("note").setDescription("Staff note").setMaxLength(800).setRequired(true)),
  new SlashCommandBuilder().setName("notes").setDescription("View private staff notes.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("clear-notes").setDescription("Clear staff notes for a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("softban").setDescription("Ban then immediately unban, deleting recent messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(480)),
  new SlashCommandBuilder().setName("purge-user").setDescription("Delete recent messages from one member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption(o=>o.setName("member").setDescription("Message author").setRequired(true))
    .addIntegerOption(o=>o.setName("amount").setDescription("Maximum messages").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("purge-bots").setDescription("Delete recent bot messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName("amount").setDescription("Maximum messages").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("purge-links").setDescription("Delete recent messages containing links.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName("amount").setDescription("Maximum messages").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("purge-invites").setDescription("Delete recent Discord invite messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName("amount").setDescription("Maximum messages").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("purge-attachments").setDescription("Delete recent messages with attachments.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName("amount").setDescription("Maximum messages").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("purge-embeds").setDescription("Delete recent messages with embeds.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName("amount").setDescription("Maximum messages").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("purge-mentions").setDescription("Delete recent messages with mentions.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName("amount").setDescription("Maximum messages").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("purge-stickers").setDescription("Delete recent messages with stickers.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName("amount").setDescription("Maximum messages").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("purge-contains").setDescription("Delete recent messages containing specific text.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o=>o.setName("text").setDescription("Text to match").setMaxLength(100).setRequired(true))
    .addIntegerOption(o=>o.setName("amount").setDescription("Maximum messages").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("hide").setDescription("Hide a channel from everyone.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o=>o.setName("channel").setDescription("Channel; defaults to this one")),
  new SlashCommandBuilder().setName("show").setDescription("Restore channel visibility for everyone.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o=>o.setName("channel").setDescription("Channel; defaults to this one")),
  new SlashCommandBuilder().setName("voice-deafen").setDescription("Server-deafen a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.DeafenMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(480)),
  new SlashCommandBuilder().setName("voice-undeafen").setDescription("Remove a server deafen.")
    .setDefaultMemberPermissions(PermissionFlagsBits.DeafenMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason").setMaxLength(480)),
  new SlashCommandBuilder().setName("move-member").setDescription("Move a member to another voice channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addChannelOption(o=>o.setName("channel").setDescription("Destination voice channel").setRequired(true).addChannelTypes(ChannelType.GuildVoice,ChannelType.GuildStageVoice)),
  new SlashCommandBuilder().setName("nick-reset").setDescription("Reset a member nickname.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("banlist").setDescription("View the server ban list.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName("slowmode-off").setDescription("Disable channel slowmode.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o=>o.setName("channel").setDescription("Channel; defaults to this one")),
  new SlashCommandBuilder().setName("unwarn").setDescription("Remove one warning and preserve its audit record.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true))
    .addIntegerOption(o=>o.setName("warning_id").setDescription("Warning ID").setMinValue(1).setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Removal reason").setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder().setName("clear-reactions").setDescription("Remove all reactions from a message.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o=>o.setName("message_id").setDescription("Message ID in this channel").setRequired(true)),
  new SlashCommandBuilder().setName("set-topic").setDescription("Update a text channel topic.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o=>o.setName("channel").setDescription("Text channel").setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
    .addStringOption(o=>o.setName("topic").setDescription("New topic").setMaxLength(1024).setRequired(true)),


  new SlashCommandBuilder().setName("recovery").setDescription("Elixe • As message and channel recovery center.")
    .addSubcommand(sc=>sc.setName("setup").setDescription("Set the deletion approval review channel.")
      .addChannelOption(o=>o.setName("channel").setDescription("Private review channel").addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(sc=>sc.setName("messages").setDescription("Browse archived messages.")
      .addStringOption(o=>o.setName("channel_id").setDescription("Original channel ID").setRequired(true))
      .addBooleanOption(o=>o.setName("deleted_only").setDescription("Show only deleted messages")))
    .addSubcommand(sc=>sc.setName("restore-message").setDescription("Replay an archived message.")
      .addStringOption(o=>o.setName("channel_id").setDescription("Original channel ID").setRequired(true))
      .addStringOption(o=>o.setName("message_id").setDescription("Archived message ID").setRequired(true)))
    .addSubcommand(sc=>sc.setName("backups").setDescription("List available channel backups."))
    .addSubcommand(sc=>sc.setName("restore-channel").setDescription("Restore a channel from a selected backup.")
      .addStringOption(o=>o.setName("channel_id").setDescription("Original channel ID").setRequired(true))
      .addStringOption(o=>o.setName("backup_file").setDescription("Exact backup filename").setRequired(true))),
  new SlashCommandBuilder().setName("roleall").setDescription("Assign a role to every manageable human member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption(o=>o.setName("role").setDescription("Role to assign to all members").setRequired(true))
    .addBooleanOption(o=>o.setName("confirm").setDescription("Confirm assigning this role server-wide").setRequired(true)),
  new SlashCommandBuilder().setName("autorole").setDescription("Configure roles automatically assigned to new members.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sc=>sc.setName("add").setDescription("Add a role to the automatic join-role list.")
      .addRoleOption(o=>o.setName("role").setDescription("Role to assign to new members").setRequired(true)))
    .addSubcommand(sc=>sc.setName("remove").setDescription("Remove a role from the automatic join-role list.")
      .addRoleOption(o=>o.setName("role").setDescription("Role to stop assigning").setRequired(true)))
    .addSubcommand(sc=>sc.setName("list").setDescription("Show all configured automatic join roles."))
    .addSubcommand(sc=>sc.setName("clear").setDescription("Remove every configured automatic join role.")),
  new SlashCommandBuilder().setName("tpackenable").setDescription("Enable the automatic Modrinth texture-pack ZIP feed.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o=>o.setName("channel").setDescription("Channel for the 5-minute texture-pack feed").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
  new SlashCommandBuilder().setName("tpackdisable").setDescription("Disable the automatic Modrinth texture-pack ZIP feed.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName("tpackstatus").setDescription("Check the automatic Modrinth texture-pack ZIP feed."),
  new SlashCommandBuilder().setName("owner").setDescription("Manage trusted anti-nuke users.")
    .addSubcommandGroup(group => group.setName("whitelist").setDescription("Manage the anti-nuke trusted-user whitelist.")
      .addSubcommand(sc => sc.setName("add").setDescription("Protect a user from anti-nuke enforcement.")
        .addUserOption(o => o.setName("user").setDescription("User to trust").setRequired(true)))
      .addSubcommand(sc => sc.setName("remove").setDescription("Remove a user from anti-nuke protection.")
        .addUserOption(o => o.setName("user").setDescription("User to untrust").setRequired(true)))
      .addSubcommand(sc => sc.setName("list").setDescription("List all anti-nuke trusted users."))),
  new SlashCommandBuilder().setName("antinuke").setDescription("View and run Elixe • As anti-nuke protection.")
    .addSubcommand(sc=>sc.setName("status").setDescription("View active anti-nuke protections and backup status."))
    .addSubcommand(sc=>sc.setName("backup-now").setDescription("Create an immediate channel-configuration backup.")),
  new SlashCommandBuilder().setName("message-archive").setDescription("Export archived messages from a channel (two-owner access only).")
    .addSubcommand(sc=>sc.setName("export").setDescription("Export the last seven days of archived messages.")
      .addStringOption(o=>o.setName("channel_id").setDescription("Channel ID to export").setRequired(true))
      .addBooleanOption(o=>o.setName("deleted_only").setDescription("Only include messages that were deleted"))),

].map(c => c.toJSON());

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = "1572968551973654528";

if (!token || !clientId) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID. Check your environment variables.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

try {
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  console.log(`[COMMANDS] Registering ${commands.length} commands for application ${clientId}${guildId ? ` in guild ${guildId}` : " globally"}.`);

  const submitted = await rest.put(route, { body: commands });

  if (!Array.isArray(submitted)) {
    throw new Error("Discord registration response was not an array.");
  }

  const fetched = await rest.get(route);
  if (!Array.isArray(fetched)) {
    throw new Error("Discord command verification response was not an array.");
  }

  const expectedNames = commands.map(command => command.name).sort();
  const actualNames = fetched.map(command => command.name).sort();
  const missingNames = expectedNames.filter((name, index) => actualNames[index] !== name);
  const unexpectedNames = actualNames.filter(name => !expectedNames.includes(name));

  console.log(`[COMMANDS] Discord accepted ${submitted.length} commands; verification GET returned ${fetched.length} commands.`);
  console.log(`[COMMANDS] Registered names: ${actualNames.join(", ")}`);

  if (fetched.length !== commands.length || missingNames.length > 0 || unexpectedNames.length > 0) {
    console.error("[COMMANDS] VERIFICATION MISMATCH.", {
      expectedCount: commands.length,
      actualCount: fetched.length,
      expectedNames,
      actualNames
    });
    process.exit(1);
  }

  console.log(`[COMMANDS] VERIFIED: all ${fetched.length} commands are stored by Discord for the target ${guildId ? "guild" : "application"}.`);
} catch (error) {
  console.error("[COMMANDS] Registration/verification failed:", error);
  process.exit(1);
}
