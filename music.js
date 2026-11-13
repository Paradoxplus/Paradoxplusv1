import { getVoiceConnection } from "@discordjs/voice";
import { LavalinkManager } from "lavalink-client";
import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";

const COLOR = 0x7c5cff;
const autoplayGuilds = new Set();

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
      defaultSearchPlatform: "ytmsearch",
      clientBasedPositionUpdateInterval: 250,
      onDisconnect: { autoReconnect: true, destroyPlayer: false },
      onEmptyQueue: {
        destroyAfterMs: 30000,
        autoPlayFunction: async player => {
          if (!autoplayGuilds.has(player.guildId)) return;
          const seed = player.queue.previous?.[0] || player.queue.current;
          if (!seed?.info?.title) return;
          const query = [seed.info.title, seed.info.author].filter(Boolean).join(" ");
          const candidates = await searchMusic(player, query, seed.requester || null);
          const next = candidates.find(candidate => candidate?.info?.identifier !== seed.info?.identifier);
          if (next) {
            await player.queue.add(next);
            console.log("[Music] Autoplay queued:", clean(next.info?.title, 120));
          }
        }
      }
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
  // A Lavalink outage must never crash the Discord bot. The node error object can
  // contain connection options (including credentials), so log only safe fields.
  manager.nodeManager.on("error", error => {
    const code = error?.code;
    const message = typeof error?.message === "string" ? error.message : "";
    console.error("[Music] Lavalink node error:", code || message || "Connection failed; check Lavalink service health and matching credentials.");
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
      .setFooter({ text: "YouTube Music first • YouTube and SoundCloud fallback" }).setTimestamp();
    if (info.artworkUrl) embed.setThumbnail(info.artworkUrl);
    void channel.send({ embeds: [embed] }).catch(() => {});
  });
  manager.on("queueEnd", player => {
    const channel = client.channels.cache.get(player.textChannelId);
    if (channel?.isTextBased()) void channel.send("🎵 The queue has finished.").catch(() => {});
  });
  const fallbackInProgress = new Set();
  const recoverTrack = async (player, track, payload, eventName) => {
    const guildId = player.guildId;
    if (fallbackInProgress.has(guildId)) return;
    fallbackInProgress.add(guildId);
    const info = track?.info || player.queue.current?.info || {};
    const sourceName = String(info.sourceName || "").toLowerCase();
    const reason = payload?.exception?.message || payload?.exception?.cause || payload?.error || eventName;
    console.warn("[Music] " + eventName + ":", JSON.stringify({
      title: clean(info.title, 120),
      source: sourceName || "unknown",
      reason: clean(reason, 300)
    }));
    const channel = client.channels.cache.get(player.textChannelId);
    try {
      if ((sourceName === "youtube" || sourceName === "youtubemusic") && info.title) {
        const query = [info.title, info.author].filter(Boolean).join(" ");
        const result = await player.search({ query, source: "soundcloud" }, track?.requester);
        const alternatives = Array.isArray(result?.tracks) ? result.tracks : [];
        const duration = Number(info.duration || info.length || 0);
        const fallback = alternatives.find(candidate => {
          const candidateInfo = candidate?.info || {};
          if (String(candidateInfo.sourceName || "").toLowerCase() !== "soundcloud") return false;
          const candidateDuration = Number(candidateInfo.duration || candidateInfo.length || 0);
          return !duration || !candidateDuration || Math.abs(candidateDuration - duration) <= Math.max(30000, duration * 0.2);
        });
        if (fallback) {
          await player.queue.add(fallback, 0);
          console.log("[Music] Added SoundCloud playback fallback:", clean(fallback.info?.title, 120));
          if (channel?.isTextBased()) await channel.send("🔁 YouTube couldn't play that track. Added a SoundCloud alternative to the front of the queue.").catch(() => {});
          if (!player.playing && !player.paused) await player.play();
          return;
        }
      }
      if (channel?.isTextBased()) await channel.send("⚠️ That track failed" + (sourceName ? " on " + sourceName : "") + ". Skipping to the next queued track.").catch(() => {});
    } catch (error) {
      console.warn("[Music] Playback recovery failed:", error?.message || error);
      if (channel?.isTextBased()) await channel.send("⚠️ Playback failed and automatic fallback was unavailable. Moving on to the next track.").catch(() => {});
    } finally {
      fallbackInProgress.delete(guildId);
    }
  };
  manager.on("trackError", (player, track, payload) => { void recoverTrack(player, track, payload, "Track error"); });
  manager.on("trackStuck", (player, track, payload) => { void recoverTrack(player, track, payload, "Track stuck"); });
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
    player = client.lavalink.createPlayer({ guildId: guild.id, voiceChannelId: voice.id, textChannelId: source.channel.id, selfDeaf: true, selfMute: false, volume: 80 });
  }
  if (!player.connected) await player.connect();
  return player;
}

async function searchMusic(player, query, requester) {
  const sources = [
    { name: "YouTube Music", source: "youtube music" },
    { name: "YouTube", source: "youtube" },
    { name: "SoundCloud", source: "soundcloud" }
  ];
  for (const candidate of sources) {
    try {
      const found = await player.search({ query, source: candidate.source }, requester);
      const tracks = Array.isArray(found?.tracks) ? found.tracks : [];
      console.log("[Music] " + candidate.name + " search:", JSON.stringify({
        query: clean(query, 120), loadType: found?.loadType ?? null,
        trackCount: tracks.length, exception: found?.exception?.message ?? null
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
  throw new Error("No playable results found on YouTube Music, YouTube, or SoundCloud.");
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
  const names = ["play","playnext","pause","resume","skip","previous","stop","queue","nowplaying","volume","seek","autoplay","filter","loop","shuffle","remove","clear"];
  if (!names.includes(command)) return false;
  try {
    if (command === "playnext") {
      const guildMember = await interaction.guild.members.fetch(interaction.user.id);
      if (!guildMember.voice?.channel) throw new Error("Join a voice channel first.");
      await interaction.deferReply({ ephemeral: true });
      const player = await getPlayer(client, { guild: interaction.guild, member: guildMember, channel: interaction.channel });
      const query = interaction.options.getString("query", true).trim();
      const results = await searchMusic(player, query, interaction.user);
      const chosen = results[0];
      if (!chosen) throw new Error("No playable results found.");
      await player.queue.add(chosen, 0);
      if (!player.playing) await player.play();
      await interaction.editReply({ content: "⏭️ Added **" + clean(chosen.info?.title, 180) + "** to play next." });
      return true;
    }
    if (command === "play") {
      const guildMember = await interaction.guild.members.fetch(interaction.user.id);
      if (!guildMember.voice?.channel) throw new Error("Join a voice channel first.");
      const musicSource = { guild: interaction.guild, member: guildMember, channel: interaction.channel, user: interaction.user };
      await interaction.deferReply({ ephemeral: true });
      const player = await getPlayer(client, musicSource);
      const results = await searchMusic(player, interaction.options.getString("query", true).trim(), interaction.user);
      if (!results.length) throw new Error("No playable results found.");
      const menu = new StringSelectMenuBuilder().setCustomId("paradoxplus_music_choice").setPlaceholder("Choose a song")
        .addOptions(results.map((t,i) => ({
          label: clean(t.info?.title || "Unknown title", 95),
          description: clean((t.info?.author || "Unknown artist") + " • " + fmt(t.info?.duration || 0), 95),
          value: String(i)
        })));
      const embed = new EmbedBuilder().setColor(COLOR).setTitle("🎵 Music search results")
        .setDescription(results.slice(0, 25).map((t,i) => "**" + (i+1) + ". " + clean(t.info?.title, 120) + "**\n" + clean(t.info?.author, 140)).join("\n\n"))
        .setFooter({ text: "YouTube Music first • YouTube and SoundCloud fallback" });
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
        const resultEmbed = new EmbedBuilder().setColor(COLOR).setTitle("🎵 Added to queue")
          .setDescription("**" + clean(chosen.info?.title, 200) + "**\n" + clean(chosen.info?.author, 160))
          .setFooter({ text: "YouTube Music first • YouTube and SoundCloud fallback" });
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
    if (command === "seek") {
      const seconds = interaction.options.getInteger("seconds", true), current = player.queue.current;
      if (!current || !current.info?.isSeekable || current.info?.isStream) throw new Error("This track cannot be seeked.");
      const duration = Number(current.info.duration || current.info.length || 0);
      if (duration && seconds * 1000 >= duration) throw new Error("Choose a position before the end of the track.");
      await player.seek(seconds * 1000);
      await interaction.reply({ content: "⏩ Seeked to " + fmt(seconds * 1000) + ".", ephemeral: true });
    } else if (command === "autoplay") {
      const enabled = interaction.options.getBoolean("enabled", true);
      if (enabled) autoplayGuilds.add(interaction.guildId); else autoplayGuilds.delete(interaction.guildId);
      await interaction.reply({ content: enabled ? "🔁 Autoplay enabled. I'll find a related track when the queue ends." : "⏹️ Autoplay disabled.", ephemeral: true });
    } else if (command === "filter") {
      const preset = interaction.options.getString("preset", true), fm = player.filterManager;
      if (preset === "off") await fm.resetFilters();
      else if (preset === "nightcore") { await fm.resetFilters(); await fm.toggleNightcore(); }
      else if (preset === "vaporwave") { await fm.resetFilters(); await fm.toggleVaporwave(); }
      else if (preset === "karaoke") { await fm.resetFilters(); await fm.toggleKaraoke(); }
      else {
        const presets = { "bassboost-low":"BassboostLow", "bassboost-medium":"BassboostMedium", "bassboost-high":"BassboostHigh", "better-music":"BetterMusic", "pop":"Pop", "rock":"Rock", "classic":"Classic", "electronic":"Electronic", "full-sound":"FullSound", "gaming":"Gaming" };
        const selected = presets[preset];
        if (!selected) throw new Error("Unknown filter preset.");
        await fm.resetFilters(); await fm.setEQPreset(selected);
      }
      await interaction.reply({ content: preset === "off" ? "🎚️ All audio effects cleared." : "🎚️ Audio preset applied: **" + preset + "**.", ephemeral: true });
    } else if (command === "previous") {
      const previous = await player.queue.shiftPrevious();
      if (!previous) throw new Error("There isn't a previous track in history.");
      await player.play({ clientTrack: previous });
      await interaction.reply({ content: "⏮️ Playing the previous track: **" + clean(previous.info?.title, 160) + "**.", ephemeral: true });
    } else if (command === "pause") { await player.pause(); await interaction.reply({ content: "⏸️ Paused.", ephemeral: true }); }
    else if (command === "resume") { await player.resume(); await interaction.reply({ content: "▶️ Resumed.", ephemeral: true }); }
    else if (command === "skip") { await player.skip(); await interaction.reply({ content: "⏭️ Skipped.", ephemeral: true }); }
    else if (command === "stop") { await player.stopPlaying(true, false); await player.destroy(); await interaction.reply({ content: "⏹️ Stopped playback and left voice.", ephemeral: true }); }
    else if (command === "queue") await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle("📜 PARADOXPLUS QUEUE").setDescription(queueText(player))], ephemeral: true });
    else if (command === "nowplaying") await interaction.reply({ embeds: [nowPlayingEmbed(player)], ephemeral: true });
    else if (command === "volume") { const amount = interaction.options.getInteger("amount", true); await player.setVolume(amount); await interaction.reply({ content: "🔊 Volume set to " + amount + "%.", ephemeral: true }); }
    else if (command === "loop") { const mode = interaction.options.getString("mode", true); await player.setRepeatMode(mode); await interaction.reply({ content: "🔁 Repeat mode: " + mode + ".", ephemeral: true }); }
    else if (command === "shuffle") { player.queue.shuffle(); await interaction.reply({ content: "🔀 Queue shuffled.", ephemeral: true }); }
    else if (command === "remove") { const pos = interaction.options.getInteger("position", true); if (pos < 1 || pos > player.queue.tracks.length) throw new Error("That queue position doesn't exist."); await player.queue.remove(pos - 1); await interaction.reply({ content: "🗑️ Removed queue position " + pos + ".", ephemeral: true }); }
    else if (command === "clear") { await player.queue.splice(0, player.queue.tracks.length); await interaction.reply({ content: "🧹 Cleared upcoming tracks. The current song will finish.", ephemeral: true }); }
    return true;
  } catch (error) {
    const message = "⚠️ " + (error?.message || "Music command failed.");
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message, embeds: [], components: [] }).catch(() => {});
    else await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    return true;
  }
}

export async function handleMusicPrefix(message, command, args, client) {
  const names = ["play","playnext","pause","resume","skip","previous","stop","queue","nowplaying","volume","seek","autoplay","filter","loop","shuffle","remove","clear"];
  if (!names.includes(command)) return false;
  const send = text => message.reply({ content: text, allowedMentions: { repliedUser: false, parse: [] } });
  try {
    if (command === "playnext") {
      const query = args.join(" ").trim();
      if (!query) throw new Error("Usage: .playnext song name");
      if (!message.member.voice?.channel) throw new Error("Join a voice channel first.");
      const player = await getPlayer(client, message);
      const results = await searchMusic(player, query, message.author);
      if (!results[0]) throw new Error("No playable results found.");
      await player.queue.add(results[0], 0);
      if (!player.playing) await player.play();
      return send("⏭️ Added **" + clean(results[0].info?.title, 160) + "** to play next.");
    }
    if (command === "play") {
      const query = args.join(" ").trim();
      if (!query) throw new Error("Usage: .play song name");
      if (!message.member.voice?.channel) throw new Error("Join a voice channel first.");
      const status = await message.reply("🔎 Searching YouTube Music, then YouTube and SoundCloud…");
      const player = await getPlayer(client, message);
      const results = await searchMusic(player, query, message.author);
      if (!results.length) throw new Error("No playable results found.");
      await queueTrack(player, results[0]);
      await status.edit("🎵 Added **" + clean(results[0].info?.title, 160) + "** to the queue.");
      return true;
    }
    const player = requirePlayer(client, message.guild.id, message.member);
    if (command === "seek") {
      const seconds = Number(args[0]), current = player.queue.current;
      if (!Number.isInteger(seconds) || seconds < 0) throw new Error("Usage: .seek seconds");
      if (!current || !current.info?.isSeekable || current.info?.isStream) throw new Error("This track cannot be seeked.");
      const duration = Number(current.info.duration || current.info.length || 0);
      if (duration && seconds * 1000 >= duration) throw new Error("Choose a position before the end of the track.");
      await player.seek(seconds * 1000);
      return send("⏩ Seeked to " + fmt(seconds * 1000) + ".");
    }
    if (command === "autoplay") {
      const mode = (args[0] || "").toLowerCase();
      if (!["on","off"].includes(mode)) throw new Error("Usage: .autoplay on|off");
      if (mode === "on") autoplayGuilds.add(message.guild.id); else autoplayGuilds.delete(message.guild.id);
      return send(mode === "on" ? "🔁 Autoplay enabled." : "⏹️ Autoplay disabled.");
    }
    if (command === "filter") {
      const preset = (args[0] || "").toLowerCase();
      if (!preset) throw new Error("Usage: .filter off|nightcore|vaporwave|karaoke|bassboost-low|bassboost-medium|bassboost-high|better-music|pop|rock|classic|electronic|full-sound|gaming");
      const fm = player.filterManager;
      if (preset === "off") await fm.resetFilters();
      else if (preset === "nightcore") { await fm.resetFilters(); await fm.toggleNightcore(); }
      else if (preset === "vaporwave") { await fm.resetFilters(); await fm.toggleVaporwave(); }
      else if (preset === "karaoke") { await fm.resetFilters(); await fm.toggleKaraoke(); }
      else {
        const presets = { "bassboost-low":"BassboostLow", "bassboost-medium":"BassboostMedium", "bassboost-high":"BassboostHigh", "better-music":"BetterMusic", "pop":"Pop", "rock":"Rock", "classic":"Classic", "electronic":"Electronic", "full-sound":"FullSound", "gaming":"Gaming" };
        if (!presets[preset]) throw new Error("Unknown filter preset.");
        await fm.resetFilters(); await fm.setEQPreset(presets[preset]);
      }
      return send(preset === "off" ? "🎚️ All audio effects cleared." : "🎚️ Applied **" + preset + "**.");
    }
    if (command === "previous") {
      const previous = await player.queue.shiftPrevious();
      if (!previous) throw new Error("There isn't a previous track in history.");
      await player.play({ clientTrack: previous });
      return send("⏮️ Playing **" + clean(previous.info?.title, 160) + "**.");
    }
    if (command === "pause") await player.pause();
    else if (command === "resume") await player.resume();
    else if (command === "skip") await player.skip();
    else if (command === "stop") { await player.stopPlaying(true, false); await player.destroy(); }
    else if (command === "queue") return send(queueText(player));
    else if (command === "nowplaying") return message.reply({ embeds: [nowPlayingEmbed(player)] });
    else if (command === "volume") { const amount = Number(args[0]); if (!Number.isInteger(amount) || amount < 1 || amount > 100) throw new Error("Usage: .volume 1-100"); await player.setVolume(amount); }
    else if (command === "loop") { const mode = (args[0] || "off").toLowerCase(); if (!["off","track","queue"].includes(mode)) throw new Error("Usage: .loop off|track|queue"); await player.setRepeatMode(mode); }
    else if (command === "shuffle") player.queue.shuffle();
    else if (command === "remove") { const pos = Number(args[0]); if (!Number.isInteger(pos) || pos < 1 || pos > player.queue.tracks.length) throw new Error("Usage: .remove queue_position"); await player.queue.remove(pos - 1); }
    else if (command === "clear") await player.queue.splice(0, player.queue.tracks.length);
    const replies = { pause:"⏸️ Paused.", resume:"▶️ Resumed.", skip:"⏭️ Skipped.", stop:"⏹️ Stopped playback and left voice.", volume:"🔊 Volume updated.", loop:"🔁 Repeat mode updated.", shuffle:"🔀 Queue shuffled.", remove:"🗑️ Removed that queued track.", clear:"🧹 Cleared upcoming tracks." };
    return send(replies[command] || "Done.");
  } catch (error) { return send("⚠️ " + (error?.message || "Music command failed.")); }
}
