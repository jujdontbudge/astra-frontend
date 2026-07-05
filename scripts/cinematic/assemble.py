#!/usr/bin/env python3
"""Assemble the Astra hero cinematic: normalize clips, burn in title overlays,
cross-dissolve segments, mix the music bed. Re-runnable for iteration."""
import json, os, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
AI = os.path.join(ROOT, "assets/cinematic/ai")
UI = os.path.join(ROOT, "assets/cinematic/ui")
TI = os.path.join(ROOT, "assets/cinematic/titles")
SEG = os.path.join(ROOT, "assets/cinematic/_segments")
OUT = os.path.join(ROOT, "assets/cinematic/astra-hero.mp4")
FF = "/Users/johansardar/anaconda3/bin/ffmpeg"
FP = "/Users/johansardar/anaconda3/bin/ffprobe"
MUSIC = os.path.join(AI, "music.m4a")
T = 0.5  # crossfade seconds
os.makedirs(SEG, exist_ok=True)

# overlay: (png, fade_in_start, fade_in_dur, fade_out_start, fade_out_dur)  out_dur=0 -> no fade out
SEGMENTS = [
    dict(name="s0-intro", src=f"{AI}/intro.mp4", ss=0.4, t=6.6, vfin=0.6, vfout=0,
         ov=[(f"{TI}/wordmark.png", 3.0, 1.0, 0, 0)]),
    dict(name="s1-home", src=f"{UI}/ui-home.webm", ss=0.2, t=4.8, vfin=0, vfout=0, ov=[]),
    dict(name="s2-type", src=f"{UI}/ui-type-zoom.webm", ss=0.8, t=6.5, vfin=0, vfout=0, ov=[]),
    dict(name="s3-booking", src=f"{UI}/ui-booking.webm", ss=0.0, t=8.3, vfin=0, vfout=0,
         ov=[(f"{TI}/callout-1.png", 0.5, 0.8, 3.6, 0.6),
             (f"{TI}/callout-3.png", 4.3, 0.8, 0, 0)]),
    dict(name="s4-chip", src=f"{UI}/ui-chip.webm", ss=0.4, t=5.2, vfin=0, vfout=0,
         ov=[(f"{TI}/callout-2.png", 0.8, 0.8, 0, 0)]),
    dict(name="s5-gallery", src=f"{UI}/ui-gallery.webm", ss=0.2, t=5.5, vfin=0, vfout=0,
         ov=[(f"{TI}/callout-4.png", 0.6, 0.8, 0, 0)]),
    dict(name="s6-outro", src=f"{AI}/outro.mp4", ss=0.0, t=5.9, vfin=0, vfout=1.0,
         ov=[(f"{TI}/lockup.png", 0.9, 1.0, 0, 0)]),
]


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        print(" ".join(cmd)); print(p.stderr[-3000:]); sys.exit(1)


def dur(path):
    out = subprocess.check_output(
        [FP, "-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", path],
        text=True)
    return float(out.strip())


def build_segment(s):
    dst = os.path.join(SEG, s["name"] + ".mp4")
    cmd = [FF, "-y", "-ss", str(s["ss"]), "-t", str(s["t"]), "-i", s["src"]]
    for png, *_ in s["ov"]:
        # loop the still into a timed 30fps stream so the alpha fade has frames to act on
        cmd += ["-loop", "1", "-framerate", "30", "-t", str(s["t"]), "-i", png]
    fc = ("[0:v]scale=1920:1080:force_original_aspect_ratio=increase,"
          "crop=1920:1080,fps=30,setsar=1[base]")
    chains = [fc]
    cur = "[base]"
    for i, (png, fin, find, fout, foutd) in enumerate(s["ov"], start=1):
        f = f"[{i}:v]format=rgba,fade=t=in:st={fin}:d={find}:alpha=1"
        if foutd > 0:
            f += f",fade=t=out:st={fout}:d={foutd}:alpha=1"
        f += f"[ov{i}]"
        chains.append(f)
        nxt = f"[c{i}]"
        chains.append(f"{cur}[ov{i}]overlay=0:0:format=auto{nxt}")
        cur = nxt
    tail = f"{cur}format=yuv420p"
    if s["vfin"] > 0:
        tail += f",fade=t=in:st=0:d={s['vfin']}"
    if s["vfout"] > 0:
        tail += f",fade=t=out:st={s['t']-s['vfout']:.3f}:d={s['vfout']}"
    tail += "[v]"
    chains.append(tail)
    cmd += ["-filter_complex", ";".join(chains), "-map", "[v]", "-an",
            "-c:v", "h264_videotoolbox", "-b:v", "12M", "-allow_sw", "1",
            "-pix_fmt", "yuv420p", "-r", "30", dst]
    run(cmd)
    return dst


def main():
    segs = [build_segment(s) for s in SEGMENTS]
    durs = [dur(p) for p in segs]
    print("segment durations:", [round(d, 2) for d in durs])

    cmd = [FF, "-y"]
    for p in segs:
        cmd += ["-i", p]
    parts = []
    cur = "[0:v]"
    acc = durs[0]
    for i in range(1, len(segs)):
        off = acc - T
        lbl = f"[vx{i}]"
        parts.append(f"{cur}[{i}:v]xfade=transition=fade:duration={T}:offset={off:.3f}{lbl}")
        acc = acc + durs[i] - T
        cur = lbl
    video_only = os.path.join(SEG, "_video.mp4")
    cmd += ["-filter_complex", ";".join(parts), "-map", cur,
            "-c:v", "h264_videotoolbox", "-b:v", "16M", "-allow_sw", "1",
            "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", video_only]
    run(cmd)
    vdur = dur(video_only)
    print("video duration:", round(vdur, 2))

    # mux music with fades, trimmed to video length
    afout = max(0.0, vdur - 2.0)
    afilter = (f"[1:a]afade=t=in:st=0:d=1.5,afade=t=out:st={afout:.3f}:d=2.0,"
               f"atrim=0:{vdur:.3f},asetpts=N/SR/TB[a]")
    run([FF, "-y", "-i", video_only, "-i", MUSIC, "-filter_complex", afilter,
         "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
         "-shortest", "-movflags", "+faststart", OUT])
    print("WROTE", OUT, round(dur(OUT), 2), "s")


if __name__ == "__main__":
    main()
