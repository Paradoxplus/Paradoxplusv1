import { getVoiceConnection } from "@discordjs/voice";
import { LavalinkManager } from "lavalink-client";
import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";

const COLOR = 0x7c5cff;

const clean = (v, n = 120) => String(v ?? "").replace(/[\r\n]/g, " ").slice(0, n);
const fmt = ms => {
  if (!Number.isFinite(ms) || ms <= 0) return "LIVE";
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? h + ":" + String(m).padStart(2,"0") + ":" + String(r).padStart(2,"0") : m + ":" + String(r).padStart(2,"0");
};

export function setupMusic(client, onPlayerDestroy = () => {}) {
  const rawHost = process.env.LAVALINK_HOST || "";
  const host = rawHost.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const secure = process.env.LAVALINK_SECURE === "true";
  const port = Number(process.env.LAVALINK_PORT || (secure ? 443 : 2333));
  const password = process.env.LAVALINK_SERVER_PASSWORD || "";
  if (!host || !password) {
    console.warn("[Music] Lavalink is not configured. Set LAVALINK_HOST and LAVALINK_SERVER_PASSWORD.");
    return null;
  }

  const manager = new LavalinkManager({
    nodes: [{ id: "paradoxplus-main", host, port, secure, authorization: password, retryAmount: 10, retryDelay: 5000, requestTimeout: 15000 }],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    client: { id: process.env.CLIENT_ID, username: "Paradoxplus" },
    autoSkip: true,
    playerOptions: {
      defaultSearchPlatform: "ytsearch",
      clientBasedPositionUpdateInterval: 250,
      onDisconnect: { autoReconnect: true, destroyPlayer: false },
      onEmptyQueue: { destroyAfterMs: 30000 }
    },
    queueOptions: { maxPreviousTracks: 20 }
  });
  client.lavalink = manager;
  client.on("raw", packet => manager.sendRawData(packet));
  client.once("ready", async ready => {
    try {
      await manager.init({ ...ready.user });
      console.log("[Music] Lavalink manager initialized.");
    } catch (error) { console.error("[Music] Lavalink initialization failed:", error); }
  });
  manager.nodeManager.on("connect", node => console.log("[Music] Lavalink node connected:", node.id));
  manager.nodeManager.on("disconnect", (node, reason) => console.warn("[Music] Lavalink disconnected:", reason || node.id));
  manager.on("trackStart", (player, track) => {
    const channel = client.channels.cache.get(player.textChannelId);
    if (!channel?.isTextBased()) return;
    const info = track.info || {};
    const embed = new EmbedBuilder().setColor(COLOR).setAuthor({ name: "PARADOXPLUS • NOW PLAYING" })
      .setTitle(clean(info.title, 240))
      .setDescription("**Artist:** " + clean(info.author, 160) + "\n**Duration:** " + fmt(info.duration))
      .setFooter({ text: "YouTube first • SoundCloud fallback" }).setTimestamp();
    if (info.artworkUrl) embed.setThumbnail(info.artworkUrl);
    void channel.send({ embeds: [embed] }).catch(() => {});
  });
  manager.on("queueEnd", player => {
    const channel = client.channels.cache.get(player.textChannelId);
    if (channel?.isTextBased()) void channel.send("🎵 The queue has finished.").catch(() => {});
  });
  manager.on("trackError", (player, track, payload) => {
    console.warn("[Music] Track error:", payload?.exception?.message || payload?.error || "Unknown");
    const channel = client.channels.cache.get(player.textChannelId);
    if (channel?.isTextBased()) void channel.send("⚠️ That track couldn't play. Try another result.").catch(() => {});
  });
  manager.on("playerDestroy", () => setTimeout(() => { void Promise.resolve(onPlayerDestroy()).catch(() => {}); }, 1500));
  return manager;
}

async function getPlayer(client, source) {
  const guild = source.guild, member = source.member, voice = member?.voice?.channel;
  if (!voice) throw new Error("Join a voice channel first.");
  if (!client.lavalink?.useable) throw new Error("The Lavalink music server isn't connected yet.");
  let player = client.lavalink.getPlayer(guild.id);
  if (player?.voiceChannelId && player.voiceChannelId !== voice.id) throw new Error("I'm already playing in another voice channel.");
  if (!player) {
    getVoiceConnection(guild.id)?.destroy();
    player = client.lavalink.createPlayer({
      guildId: guild.id, voiceChannelId: voice.id, textChannelId: source.channel.id,
      selfDeaf: true, selfMute: false, volume: 80
    });
  }
  if (!player.connected) await player.connect();
  return player;
}

async function searchMusic(player, query, requester) {
  const sources = [
    { name: "YouTube", source: "youtube" },
    { name: "SoundCloud", source: "soundcloud" }
  ];
  for (const candidate of sources) {
    try {
      const found = await player.search({ query, source: candidate.source }, requester);
      const tracks = Array.isArray(found?.tracks) ? found.tracks : [];
      console.log("[Music] " + candidate.name + " search:", JSON.stringify({
        query: clean(query, 120),
        loadType: found?.loadType ?? null,
        trackCount: tracks.length,
        exception: found?.exception?.message ?? null
      }));
      if (tracks.length) {
        console.log("[Music] Search selected source:", candidate.name);
        return tracks;
      }
      console.warn("[Music] " + candidate.name + " returned no tracks.");
    } catch (error) {
      console.warn("[Music] " + candidate.name + " search failed:", error?.message || error);
    }
  }
  throw new Error("No playable results found on YouTube or SoundCloud.");
}

async function queueTrack(player, track) {
  await player.queue.add(track);
  if (!player.playing) await player.play();
  return track;
}

function queueText(player) {
  const current = player.queue.current, upcoming = player.queue.tracks || [], lines = [];
  if (current) lines.push("**Now:** " + clean(current.info?.title) + " — " + clean(current.info?.author));
  if (upcoming.length) {
    lines.push("", "**Up next:**");
    upcoming.slice(0, 10).forEach((t,i) => lines.push((i+1) + ". " + clean(t.info?.title) + " — " + fmt(t.info?.duration)));
  }
  if (!current && !upcoming.length) return "The queue is empty.";
  if (upcoming.length > 10) lines.push("…and " + (upcoming.length - 10) + " more.");
  return lines.join("\n");
}

function nowPlayingEmbed(player) {
  const track = player.queue.current;
  if (!track) return new EmbedBuilder().setColor(COLOR).setDescription("Nothing is playing.");
  const info = track.info || {}, total = Number(info.duration) || 0, pos = Number(player.position) || 0;
  const filled = total ? Math.min(20, Math.max(0, Math.round(pos / total * 20))) : 0;
  const bar = "▬".repeat(filled) + "🔘" + "▬".repeat(20-filled);
  const embed = new EmbedBuilder().setColor(COLOR).setTitle("🎧 NOW PLAYING")
    .setDescription("**" + clean(info.title, 220) + "**\n" + clean(info.author, 150) + "\n\n" + bar + "\n" + fmt(pos) + " / " + fmt(total))
    .setFooter({ text: "Paradoxplus Music • " + (player.paused ? "Paused" : "Playing") });
  if (info.artworkUrl) embed.setThumbnail(info.artworkUrl);
  return embed;
}

function requirePlayer(client, guildId, member) {
  const player = client.lavalink?.getPlayer(guildId);
  if (!player?.connected) throw new Error("Nothing is playing. Use /play first.");
  if (!member?.voice?.channel) throw new Error("Join my voice channel first.");
  if (member.voice.channel.id !== player.voiceChannelId) throw new Error("Join the same voice channel as Paradoxplus.");
  return player;
}

export async function handleMusicInteraction(interaction, client) {
  if (!interaction.isChatInputCommand()) return false;
  const command = interaction.commandName;
  const names = ["play","pause","resume","skip","stop","queue","nowplaying","volume","loop","shuffle","remove","clear"];
  if (!names.includes(command)) return false;
  try {
    if (command === "play") {
      const guildMember = await interaction.guild.members.fetch(interaction.user.id);
      if (!guildMember.voice?.channel) throw new Error("Join a voice channel first.");
      const musicSource = { guild: interaction.guild, member: guildMember, channel: interaction.channel, user: interaction.user };
      await interaction.deferReply({ ephemeral: true });
      const player = await getPlayer(client, musicSource);
      const results = await searchMusic(player, interaction.options.getString("query", true).trim(), interaction.user);
      if (!results.length) throw new Error("Neither YouTube nor SoundCloud found playable tracks.");
      const menu = new StringSelectMenuBuilder().setCustomId("paradoxplus_music_choice").setPlaceholder("Choose a song")
        .addOptions(results.map((t,i) => ({
          label: clean(t.info?.title || "Unknown title", 95),
          description: clean((t.info?.author || "Unknown artist") + " • " + fmt(t.info?.duration || 0), 95),
          value: String(i)
        })));
      const embed = new EmbedBuilder().setColor(COLOR).setTitle("🎵 Music search results")
        .setDescription(results.slice(0, 25).map((t,i) => "**" + (i+1) + ". " + clean(t.info?.title, 120) + "**\n" + clean(t.info?.author, 140)).join("\n\n"))
        .setFooter({ text: "YouTube first • SoundCloud fallback" });
      const reply = await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      try {
        const selected = await reply.awaitMessageComponent({
          time: 45000,
          filter: component => component.user.id === interaction.user.id && component.customId === "paradoxplus_music_choice"
        });
        await selected.deferUpdate();
        const chosen = results[Number(selected.values[0])];
        if (!chosen) throw new Error("That selection expired. Run /play again.");
        await queueTrack(player, chosen);
        const queued = { track: chosen };
        const resultEmbed = new EmbedBuilder().setColor(COLOR).setTitle("🎵 Added to queue")
          .setDescription("**" + clean(queued.track.info?.title, 200) + "**\n" + clean(queued.track.info?.author, 160))
          .setFooter({ text: "YouTube first • SoundCloud fallback" });
        await interaction.editReply({ embeds: [resultEmbed], components: [] });
      } catch (error) {
        if (error?.code === "InteractionCollectorError" || /time/i.test(error?.message || "")) {
          await interaction.editReply({ content: "⌛ Selection expired. Run /play again.", embeds: [], components: [] }).catch(() => {});
          return true;
        }
        throw error;
      }
      return true;
    }

    const guildMember = await interaction.guild.members.fetch(interaction.user.id);
    const player = requirePlayer(client, interaction.guildId, guildMember);
    if (command === "pause") { await player.pause(); await interaction.reply({ content: "⏸️ Paused.", ephemeral: true }); }
    else if (command === "resume") { await player.resume(); await interaction.reply({ content: "▶️ Resumed.", ephemeral: true }); }
    else if (command === "skip") { await player.skip(); await interaction.reply({ content: "⏭️ Skipped.", ephemeral: true }); }
    else if (command === "stop") {
      await player.stopPlaying(true, false); await player.destroy();
      await interaction.reply({ content: "⏹️ Stopped playback and left voice.", ephemeral: true });
    } else if (command === "queue") {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle("📜 PARADOXPLUS QUEUE").setDescription(queueText(player))], ephemeral: true });
    } else if (command === "nowplaying") {
      await interaction.reply({ embeds: [nowPlayingEmbed(player)], ephemeral: true });
    } else if (command === "volume") {
      const amount = interaction.options.getInteger("amount", true); await player.setVolume(amount);
      await interaction.reply({ content: "🔊 Volume set to " + amount + "%.", ephemeral: true });
    } else if (command === "loop") {
      const mode = interaction.options.getString("mode", true); await player.setRepeatMode(mode);
      await interaction.reply({ content: "🔁 Repeat mode: " + mode + ".", ephemeral: true });
    } else if (command === "shuffle") {
      player.queue.shuffle(); await interaction.reply({ content: "🔀 Queue shuffled.", ephemeral: true });
    } else if (command === "remove") {
      const pos = interaction.options.getInteger("position", true);
      if (pos < 1 || pos > player.queue.tracks.length) throw new Error("That queue position doesn't exist.");
      await player.queue.remove(pos - 1); await interaction.reply({ content: "🗑️ Removed queue position " + pos + ".", ephemeral: true });
    } else if (command === "clear") {
      await player.queue.splice(0, player.queue.tracks.length); await interaction.reply({ content: "🧹 Cleared upcoming tracks. The current song will finish.", ephemeral: true });
    }
    return true;
  } catch (error) {
    const message = "⚠️ " + (error?.message || "Music command failed.");
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message, embeds: [], components: [] }).catch(() => {});
    else await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    return true;
  }
}

export async function handleMusicPrefix(message, command, args, client) {
  const names = ["play","pause","resume","skip","stop","queue","nowplaying","volume","loop","shuffle","remove","clear"];
  if (!names.includes(command)) return false;
  const send = text => message.reply({ content: text, allowedMentions: { repliedUser: false, parse: [] } });
  try {
    if (command === "play") {
      const query = args.join(" ").trim();
      if (!query) throw new Error("Usage: .play song name");
      if (!message.member.voice?.channel) throw new Error("Join a voice channel first.");
      const status = await message.reply("🔎 Searching YouTube, then SoundCloud…");
      const player = await getPlayer(client, message);
      const results = await searchMusic(player, query, message.author);
      if (!results.length) throw new Error("Neither YouTube nor SoundCloud found playable tracks.");
      await queueTrack(player, results[0]);
      const queued = { track: results[0] };
      await status.edit("🎵 Added **" + clean(queued.track.info?.title, 160) + "** to the queue.");
      return true;
    }
    const player = requirePlayer(client, message.guild.id, message.member);
    if (command === "pause") await player.pause();
    else if (command === "resume") await player.resume();
    else if (command === "skip") await player.skip();
    else if (command === "stop") { await player.stopPlaying(true, false); await player.destroy(); }
    else if (command === "queue") return send(queueText(player));
    else if (command === "nowplaying") return message.reply({ embeds: [nowPlayingEmbed(player)] });
    else if (command === "volume") {
      const amount = Number(args[0]);
      if (!Number.isInteger(amount) || amount < 1 || amount > 100) throw new Error("Usage: .volume 1-100");
      await player.setVolume(amount);
    } else if (command === "loop") {
      const mode = (args[0] || "off").toLowerCase();
      if (!["off","track","queue"].includes(mode)) throw new Error("Usage: .loop off|track|queue");
      await player.setRepeatMode(mode);
    } else if (command === "shuffle") player.queue.shuffle();
    else if (command === "remove") {
      const pos = Number(args[0]);
      if (!Number.isInteger(pos) || pos < 1 || pos > player.queue.tracks.length) throw new Error("Usage: .remove queue_position");
      await player.queue.remove(pos - 1);
    } else if (command === "clear") await player.queue.splice(0, player.queue.tracks.length);
    const replies = {
      pause:"⏸️ Paused.", resume:"▶️ Resumed.", skip:"⏭️ Skipped.",
      stop:"⏹️ Stopped playback and left voice.", volume:"🔊 Volume updated.",
      loop:"🔁 Repeat mode updated.", shuffle:"🔀 Queue shuffled.",
      remove:"🗑️ Removed that queued track.", clear:"🧹 Cleared upcoming tracks."
    };
    return send(replies[command] || "Done.");
  } catch (error) { return send("⚠️ " + (error?.message || "Music command failed.")); }
}
