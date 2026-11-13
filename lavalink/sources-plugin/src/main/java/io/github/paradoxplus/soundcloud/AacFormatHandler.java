package io.github.paradoxplus.soundcloud;

import com.sedmelluq.discord.lavaplayer.source.soundcloud.DefaultSoundCloudFormatHandler;
import com.sedmelluq.discord.lavaplayer.source.soundcloud.SoundCloudTrackFormat;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Adds SoundCloud fMP4/AAC HLS while retaining upstream MP3/Opus formats. */
final class AacFormatHandler extends DefaultSoundCloudFormatHandler {
  private static final Logger log = LoggerFactory.getLogger(AacFormatHandler.class);
  static final String PREFIX = "A:";

  private static boolean isAac(SoundCloudTrackFormat format) {
    String mime = format.getMimeType() == null
        ? "" : format.getMimeType().toLowerCase(Locale.ROOT).replace(" ", "");
    String protocol = format.getProtocol() == null
        ? "" : format.getProtocol().toLowerCase(Locale.ROOT);
    return (protocol.equals("hls") || protocol.equals("hls_aac") || protocol.equals("hls_aac_legacy"))
        && (mime.contains("mp4") || mime.contains("aac") || mime.contains("mpegurl"));
  }

  @Override
  public SoundCloudTrackFormat chooseBestFormat(List<SoundCloudTrackFormat> formats) {
    log.info("SoundCloud returned {} media formats", formats.size());
    for (SoundCloudTrackFormat format : formats) {
      log.info("SoundCloud media format: protocol='{}', mimeType='{}', lookupUrl='{}'",
          format.getProtocol(), format.getMimeType(), format.getLookupUrl());
    }

    return formats.stream().filter(AacFormatHandler::isAac).findFirst()
        .orElseGet(() -> {
          log.warn("No AAC/HLS format matched; falling back to the default SoundCloud format handler");
          return super.chooseBestFormat(formats);
        });
  }

  @Override
  public String buildFormatIdentifier(SoundCloudTrackFormat format) {
    return isAac(format) ? PREFIX + format.getLookupUrl() : super.buildFormatIdentifier(format);
  }
}
