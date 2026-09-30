import { dataUrlToBytes, type FieldMedia } from "./field-photo-store";
import { bytesToDataUrl } from "./field-packet-store";

export async function compressEmailVideo(row: FieldMedia, budget: number, progress: (value: number) => void) {
  const { Input, BufferSource, ALL_FORMATS, Output, BufferTarget, Mp4OutputFormat, WebMOutputFormat, Conversion, Quality } = await import("mediabunny");
  const input = new Input({ source: new BufferSource(dataUrlToBytes(row.dataUrl)), formats: ALL_FORMATS });
  let converted: InstanceType<typeof Input> | undefined;
  try {
    const duration = await input.computeDuration();
    const video = await input.getVideoTracks();
    const audio = await input.getAudioTracks();
    if (!Number.isFinite(duration) || duration <= 0 || video.length !== 1) throw new Error("Cannot safely determine video duration/tracks.");
    const bitrate = Math.floor(budget * 8 * 0.85 / duration - audio.length * 64_000);
    if (bitrate < 120_000) throw new Error("Clips are too long for a readable email copy within the package limit.");
    const track = video[0];
    const scale = Math.min(1, 640 / Math.max(track.displayWidth, track.displayHeight));
    let target = new BufferTarget();
    let mime = "video/mp4";
    const options = {
      width: Math.max(2, Math.floor(track.displayWidth * scale / 2) * 2),
        height: Math.max(2, Math.floor(track.displayHeight * scale / 2) * 2), fit: "contain", frameRate: 24,
        quality: new Quality({ bitrate: Math.min(900_000, bitrate) }), forceTranscode: true,
    } as const;
    let conversion = await Conversion.init({ input, output: new Output({ target, format: new Mp4OutputFormat() }), tracks: "all",
      video: { ...options, codec: "avc" },
      audio: { codec: "aac", quality: new Quality({ bitrate: 64_000 }) },
    });
    if (!conversion.isValid || conversion.discardedTracks.length) {
      target = new BufferTarget(); mime = "video/webm";
      conversion = await Conversion.init({ input, output: new Output({ target, format: new WebMOutputFormat() }), tracks: "all",
        video: { ...options, codec: "vp8" }, audio: { codec: "opus", quality: new Quality({ bitrate: 64_000 }) } });
    }
    if (!conversion.isValid || conversion.discardedTracks.length) throw new Error("This browser cannot compress every video/audio track. No evidence removed.");
    conversion.onProgress = progress;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([conversion.execute(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void conversion.cancel().finally(() => reject(new Error("Video compression timed out. Keep the app open and try a shorter delivery copy.")));
        }, 300_000);
      })]);
    } finally { if (timer) clearTimeout(timer); }
    if (!target.buffer?.byteLength) throw new Error("Video compression produced no file.");
    converted = new Input({ source: new BufferSource(target.buffer), formats: ALL_FORMATS });
    if ((await converted.getAudioTracks()).length !== audio.length || (await converted.getVideoTracks()).length !== 1
      || Math.abs(await converted.computeDuration() - duration) > 0.25) throw new Error("Compressed clip failed duration/audio verification.");
    if (target.buffer.byteLength > budget) throw new Error("Compressed video still exceeds its email budget. Saved original is unchanged.");
    return { ...row, dataUrl: bytesToDataUrl(new Uint8Array(target.buffer), mime), type: mime,
      size: target.buffer.byteLength, name: row.name.replace(/\.[^.]+$/, "") + (mime === "video/mp4" ? ".mp4" : ".webm") };
  } finally { converted?.dispose(); input.dispose(); }
}
