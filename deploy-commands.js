
import "dotenv/config";
import {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} from "discord.js";

const commands = [
  new SlashCommandBuilder().setName("play").setDescription("Search and play a song.")
    .addStringOption(o=>o.setName("query").setDescription("Song title, artist, or supported link").setMinLength(2).setMaxLength(100).setRequired(true)),
  new SlashCommandBuilder().setName("playnext").setDescription("Add a song to play immediately after the current track.")
    .addStringOption(o=>o.setName("query").setDescription("Song title or artist").setMinLength(2).setMaxLength(100).setRequired(true)),
  new SlashCommandBuilder().setName("seek").setDescription("Jump to a position in the current track.")
    .addIntegerOption(o=>o.setName("seconds").setDescription("Position in seconds").setMinValue(0).setMaxValue(7200).setRequired(true)),
  new SlashCommandBuilder().setName("autoplay").setDescription("Automatically find related tracks when the queue ends.")
    .addBooleanOption(o=>o.setName("enabled").setDescription("Turn autoplay on or off").setRequired(true)),
  new SlashCommandBuilder().setName("filter").setDescription("Apply an audio effect or equalizer preset.")
    .addStringOption(o=>o.setName("preset").setDescription("Audio preset").setRequired(true).addChoices(
      {name:"Off",value:"off"},{name:"Nightcore",value:"nightcore"},{name:"Vaporwave",value:"vaporwave"},
      {name:"Karaoke",value:"karaoke"},{name:"Bassboost Low",value:"bassboost-low"},
      {name:"Bassboost Medium",value:"bassboost-medium"},{name:"Bassboost High",value:"bassboost-high"},
      {name:"Better Music",value:"better-music"},{name:"Pop",value:"pop"},{name:"Rock",value:"rock"},
      {name:"Classic",value:"classic"},{name:"Electronic",value:"electronic"},
      {name:"Full Sound",value:"full-sound"},{name:"Gaming",value:"gaming"}
    )),
  new SlashCommandBuilder().setName("previous").setDescription("Replay the previous track."),
  new SlashCommandBuilder().setName("pause").setDescription("Pause music playback."),
  new SlashCommandBuilder().setName("resume").setDescription("Resume music playback."),
  new SlashCommandBuilder().setName("skip").setDescription("Skip the current track."),
  new SlashCommandBuilder().setName("stop").setDescription("Stop playback and leave voice."),
  new SlashCommandBuilder().setName("queue").setDescription("Show the music queue."),
  new SlashCommandBuilder().setName("nowplaying").setDescription("Show the currently playing track."),
  new SlashCommandBuilder().setName("volume").setDescription("Set music volume (1–100%).")
    .addIntegerOption(o=>o.setName("amount").setDescription("Volume percentage").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("loop").setDescription("Set the repeat mode.")
    .addStringOption(o=>o.setName("mode").setDescription("Repeat mode").setRequired(true)
      .addChoices({name:"Off",value:"off"},{name:"Track",value:"track"},{name:"Queue",value:"queue"})),
  new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle upcoming tracks."),
  new SlashCommandBuilder().setName("remove").setDescription("Remove a track from the queue.")
    .addIntegerOption(o=>o.setName("position").setDescription("Queue position, starting at 1").setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName("clear").setDescription("Clear upcoming tracks."),

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
  new SlashCommandBuilder().setName("ticket-panel").setDescription("Publish the Paradoxplus ticket portal in a selected channel.")
    .addChannelOption(o=>o.setName("channel").setDescription("Text channel where the ticket panel should be posted").addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("prefix").setDescription("Change this server’s text command prefix.")
    .addStringOption(o=>o.setName("new_prefix").setDescription("New prefix (1–5 characters, no spaces)").setMinLength(1).setMaxLength(5).setRequired(true)),
  new SlashCommandBuilder().setName("recruit").setDescription("Record a new Paradoxplus recruit.")
    .addUserOption(o=>o.setName("member").setDescription("Member being recruited").setRequired(true)),
  new SlashCommandBuilder().setName("dm-optin").setDescription("Opt in to Paradoxplus server direct messages."),
  new SlashCommandBuilder().setName("dm-optout").setDescription("Opt out of Paradoxplus server direct messages."),
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
  new SlashCommandBuilder().setName("modstats").setDescription("Show Paradoxplus moderation case statistics.")
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

  new SlashCommandBuilder().setName("serverpulse").setDescription("View Paradox Pulse community activity aggregates."),
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
    .setDescription("Show Paradoxplus command help."),


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
