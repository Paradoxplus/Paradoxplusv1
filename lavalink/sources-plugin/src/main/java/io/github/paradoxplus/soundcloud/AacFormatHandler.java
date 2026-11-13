package io.github.paradoxplus.soundcloud;

import com.sedmelluq.discord.lavaplayer.source.soundcloud.DefaultSoundCloudFormatHandler;
import com.sedmelluq.discord.lavaplayer.source.soundcloud.SoundCloudTrackFormat;
import java.util.List;
import java.util.Locale;

/** Adds SoundCloud fMP4/AAC HLS while retaining upstream MP3/Opus formats. */
final class AacFormatHandler extends DefaultSoundCloudFormatHandler {
  static final String PREFIX = "A:";

  private static boolean isAac(SoundCloudTrackFormat format) {
    String mime = format.getMimeType().toLowerCase(Locale.ROOT).replace(" ", "");
    return "hls".equals(format.getProtocol())
        && (mime.equals("audio/mp4") || mime.startsWith("audio/mp4;codecs=\"mp4a."));
  }

  @Override
  public SoundCloudTrackFormat chooseBestFormat(List<SoundCloudTrackFormat> formats) {
    return formats.stream().filter(AacFormatHandler::isAac).findFirst()
        .orElseGet(() -> super.chooseBestFormat(formats));
  }

  @Override
  public String buildFormatIdentifier(SoundCloudTrackFormat format) {
    return isAac(format) ? PREFIX + format.getLookupUrl() : super.buildFormatIdentifier(format);
  }
}
