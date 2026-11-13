package io.github.paradoxplus.soundcloud;

import java.io.IOException;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;

/** Renews signed CDN URLs without changing the playing track timeline. */
final class RefreshingPlaylist {
  private static final long INTERVAL_NANOS = TimeUnit.MINUTES.toNanos(10);
  @FunctionalInterface interface Loader { AacPlaylist load() throws IOException; }
  private final Loader loader;
  private final LongSupplier clock;
  private AacPlaylist playlist;
  private long refreshedAt;

  RefreshingPlaylist(Loader loader) { this(loader, System::nanoTime); }
  RefreshingPlaylist(Loader loader, LongSupplier clock) {
    this.loader = loader;
    this.clock = clock;
  }

  AacPlaylist get() throws IOException {
    if (playlist == null || clock.getAsLong() - refreshedAt >= INTERVAL_NANOS) {
      AacPlaylist fresh = loader.load();
      if (playlist != null && !playlist.sameTimeline(fresh)) {
        throw new IOException("SoundCloud changed the media timeline during playback.");
      }
      playlist = fresh;
      refreshedAt = clock.getAsLong();
    }
    return playlist;
  }
}
