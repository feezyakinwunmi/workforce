"""Soundtrack for the Workbase film: a 120 BPM beat + sound effects from cues.json."""
import json, sys, wave
import numpy as np

SR = 44100
DUR = 62.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
cues = json.load(open(sys.argv[1]))
out_path = sys.argv[2]


def t_(d):
    return np.arange(int(SR * d)) / SR


def add(buf, start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    buf[i : i + len(sig), 0] += sig * gain * l * 1.414
    buf[i : i + len(sig), 1] += sig * gain * r * 1.414


def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * np.asarray(fc) / SR)
    y = np.zeros_like(x)
    acc = 0.0
    if np.ndim(a) == 0:
        a = np.full(len(x), a)
    for k in range(len(x)):
        acc = (1 - a[k]) * x[k] + a[k] * acc
        y[k] = acc
    return y


def lp_fft(x, fc):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (f / fc) ** 4)
    return np.fft.irfft(X, len(x))


def hp_fft(x, fc):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (fc / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X, len(x))


def bp_fft(x, lo, hi):
    return hp_fft(lp_fft(x, hi), lo)


def saw(freq, d, detune=0.0):
    tt = t_(d)
    ph = (freq * (1 + detune)) * tt
    return 2 * (ph - np.floor(ph + 0.5))


def env_ad(d, a, dec):
    tt = t_(d)
    e = np.minimum(1, tt / max(a, 1e-4)) * np.exp(-np.maximum(0, tt - a) / dec)
    return e


# ---------------------------------------------------------------- drums
def kick(g=1.0):
    tt = t_(0.45)
    f = 45 + 110 * np.exp(-tt * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-tt * 7.5)
    s[: int(0.004 * SR)] += rng.normal(0, 0.4, int(0.004 * SR))
    return np.tanh(s * 1.6) * g


def hat(d=0.05, g=1.0):
    s = hp_fft(rng.normal(0, 1, int(SR * d)), 7000) * np.exp(-t_(d) * 60)
    return s * g


def clap():
    d = 0.25
    n = rng.normal(0, 1, int(SR * d))
    e = np.zeros(len(n))
    for k, off in enumerate([0, 0.011, 0.022]):
        i = int(off * SR)
        tail = np.exp(-np.arange(len(e) - i) / SR * (120 if k < 2 else 18))
        e[i:] += tail
    return bp_fft(n * e, 900, 5000) * 0.8


NOTE = {"A": 55.0, "F": 43.65, "C": 65.41, "G": 49.0}
PROG = ["A", "F", "C", "G"]
CHORD = {"A": [220.0, 261.63, 329.63], "F": [174.61, 220.0, 261.63], "C": [196.0, 261.63, 329.63], "G": [196.0, 246.94, 293.66]}


def bass_note(freq, d):
    s = saw(freq, d) * 0.6 + saw(freq * 2, d, 0.003) * 0.25 + np.sin(2 * np.pi * freq * t_(d)) * 0.6
    s = lp_fft(s, 420)
    return s * env_ad(d, 0.005, 0.18)


def pad(chord, d, bright=1.0):
    s = np.zeros(int(SR * d))
    for f in chord:
        for dt in (-0.004, 0.0, 0.005):
            s += saw(f, d, dt)
    s = lp_fft(s, 1400 * bright) / 9
    tt = t_(d)
    e = np.minimum(1, tt / 0.25) * np.minimum(1, (d - tt) / 0.35)
    return s * e


# sections: (start, end, intensity) ; 0 = none, 1 = groove A, 2 = groove B, 3 = breakdown
SECTIONS = [(7.0, 10.0, 0.5), (10.0, 20.5, 1), (20.5, 28.5, 2), (28.5, 35.0, 1), (35.0, 43.0, 3), (43.0, 50.0, 1), (50.0, 55.0, 2)]


def section_at(t):
    for a, b, k in SECTIONS:
        if a <= t < b:
            return k
    return 0


beat = 0.5
t = 7.0
while t < 55.0 - 1e-6:
    k = section_at(t)
    bar = int((t - 10.0) // 2) % 4 if t >= 10 else 0
    root = PROG[bar]
    b_in_bar = int(round(((t - 10.0) % 2) / beat)) if t >= 10 else 0
    if k in (1, 2):
        add(music, t, kick(), 0.9)
        add(music, t + 0.25, hat(0.05), 0.22, 0.3)
        if k == 2:
            add(music, t + 0.125, hat(0.03), 0.12, -0.3)
            add(music, t + 0.375, hat(0.03), 0.12, -0.3)
            if b_in_bar in (1, 3):
                add(music, t, clap(), 0.45)
        # bass on the off-beats (8ths)
        add(music, t + 0.25, bass_note(NOTE[root], 0.24), 0.55)
        if k == 2:
            add(music, t, bass_note(NOTE[root], 0.22), 0.4)
    elif k == 3:
        if t >= 38.5 and b_in_bar in (0,):
            add(music, t, kick(), 0.6)
        add(music, t + 0.25, hat(0.04), 0.1, 0.4)
    elif k == 0.5:
        pass
    t += beat

# pads: one chord per bar from 10s, softer in groove A, brighter in B and breakdown
for i, start in enumerate(np.arange(10.0, 55.0, 2.0)):
    root = PROG[i % 4]
    k = section_at(start)
    g = {1: 0.16, 2: 0.2, 3: 0.3}.get(k, 0.12)
    add(music, start, pad(CHORD[root], 2.15, 1.4 if k == 2 else 1.0), g, 0)
# swell under the logo
add(music, 7.0, pad(CHORD["A"], 3.2, 0.8), 0.22)
# outro chord
add(music, 55.0, pad([110.0, 220.0, 261.63, 329.63, 440.0], 7.0, 1.2), 0.5)
add(music, 55.0, bass_note(55.0, 3.0) * np.exp(-t_(3.0) * 0.5), 0.4)
# sidechain-ish pump on the pads/bass from the kick grid
pump = np.ones(N)
for kt in np.arange(10.0, 55.0, 0.5):
    if section_at(kt) in (1, 2):
        i = int(kt * SR)
        seg = 1 - 0.45 * np.exp(-t_(0.4) * 9)
        pump[i : i + len(seg)] = np.minimum(pump[i : i + len(seg)], seg[: N - i])
music *= pump[:, None] ** 0.6

# ---------------------------------------------------------------- effects
def noise(d):
    return rng.normal(0, 1, int(SR * d))


def sweep_noise(d, f0, f1, shape="up"):
    n = noise(d)
    tt = t_(d)
    u = tt / d
    fc = f0 * (f1 / f0) ** u
    y = onepole_lp(n, fc)
    e = (u ** 1.5) if shape == "up" else np.sin(np.pi * u) ** 1.2
    return y * e


def sine_sweep(d, f0, f1, decay):
    tt = t_(d)
    f = f0 * (f1 / f0) ** (tt / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * decay)


def fx(c):
    ty, tt, d, v = c["type"], c["t"], c["d"], c["v"]
    if ty == "tick":
        s = np.sin(2 * np.pi * 1800 * t_(0.03)) * np.exp(-t_(0.03) * 150)
        add(sfx, tt, s, 0.35 * v)
        add(sfx, tt, kick(0.6), 0.55 * v)
        add(sfx, tt + 0.18, kick(0.4), 0.3 * v)  # heartbeat double thump
    elif ty == "tick2":
        add(sfx, tt, np.sin(2 * np.pi * 2400 * t_(0.02)) * np.exp(-t_(0.02) * 200), 0.25 * v, (rng.random() - 0.5))
    elif ty == "riser":
        add(sfx, tt, sweep_noise(d, 300, 9000, "up") * 1.4, 0.45 * v)
        add(sfx, tt, sine_sweep(d, 200, 1200, 0) * np.linspace(0, 1, int(SR * d)) ** 2, 0.08 * v)
    elif ty == "boom":
        s = sine_sweep(1.6, 70, 32, 2.4) * 1.2 + onepole_lp(noise(1.6), 500) * np.exp(-t_(1.6) * 4) * 2
        add(sfx, tt, np.tanh(s * 1.3), 0.5 * v)
    elif ty == "slam":
        add(sfx, tt, np.tanh(kick(1.0) * 1.4), 0.9)
        add(sfx, tt, bp_fft(noise(0.4), 500, 6000) * np.exp(-t_(0.4) * 12), 0.4)
    elif ty == "hit":
        add(sfx, tt, kick(1.0), 0.7 * v)
        add(sfx, tt, bp_fft(noise(0.3), 1500, 9000) * np.exp(-t_(0.3) * 14), 0.35 * v)
    elif ty == "alarm":
        n = int(d / 0.125)
        for k in range(n):
            f = 1320 if k % 2 == 0 else 990
            s = np.sign(np.sin(2 * np.pi * f * t_(0.1))) * np.exp(-t_(0.1) * 12)
            add(sfx, tt + k * 0.125, lp_fft(s, 5000), 0.1 * (1 - k / n * 0.6), 0.5 if k % 2 else -0.5)
    elif ty == "pop":
        f = 900 + rng.random() * 900
        s = sine_sweep(0.09, f, f * 1.8, 40)
        add(sfx, tt, s, 0.3 * v, rng.random() * 1.6 - 0.8)
    elif ty == "glitch":
        k = 0.0
        while k < d:
            seg = rng.uniform(0.02, 0.07)
            s = np.sign(np.sin(2 * np.pi * rng.uniform(80, 900) * t_(seg))) * 0.5 + noise(seg) * 0.3
            add(sfx, tt + k, lp_fft(s, 6000), 0.14 * (rng.random() > 0.3), rng.random() * 2 - 1)
            k += seg + rng.uniform(0, 0.03)
    elif ty == "suck":
        s = sweep_noise(d, 8000, 200, "up")[::-1]
        add(sfx, tt, sweep_noise(d, 200, 7000, "up"), 0.5)
    elif ty in ("whoosh", "zoom", "whip"):
        dd = max(d, 0.25)
        s = sweep_noise(dd, 400 if ty != "whip" else 900, 6000 if ty != "zoom" else 9000, "mid")
        g = {"whoosh": 0.55, "zoom": 0.6, "whip": 0.4}[ty]
        add(sfx, tt - dd * 0.4, s * 1.5, g * v, rng.random() * 1.2 - 0.6)
    elif ty == "type":
        s = hp_fft(noise(0.018), 2500) * np.exp(-t_(0.018) * 250)
        add(sfx, tt, s, 0.18 * v * (0.7 + 0.6 * rng.random()), rng.random() * 0.6 - 0.3)
    elif ty == "click":
        s = hp_fft(noise(0.012), 1500) * np.exp(-t_(0.012) * 400) + np.sin(2 * np.pi * 3200 * t_(0.012)) * np.exp(-t_(0.012) * 300) * 0.5
        add(sfx, tt, s, 0.5 * v)
    elif ty == "tap":
        add(sfx, tt, sine_sweep(0.08, 600, 300, 50), 0.5)
    elif ty == "ding":
        s = (np.sin(2 * np.pi * 1568 * t_(0.9)) + 0.5 * np.sin(2 * np.pi * 2349 * t_(0.9))) * np.exp(-t_(0.9) * 5)
        add(sfx, tt, s, 0.18 * v)
    elif ty == "chime":
        for k, f in enumerate([880, 1108.7, 1318.5, 1760]):
            s = np.sin(2 * np.pi * f * t_(1.6)) * np.exp(-t_(1.6) * 3)
            add(sfx, tt + k * 0.08, s, 0.12, -0.4 + k * 0.27)
    elif ty == "swish":
        add(sfx, tt, sweep_noise(0.3, 2000, 8000, "mid") * 1.4, 0.35, rng.random() * 1.4 - 0.7)
    elif ty == "ring":
        # phone ring: a fast trill between two tones, in bursts
        k = 0.0
        while k < d:
            bd = min(0.8, d - k)
            tt2 = t_(bd)
            trill = (np.floor(tt2 * 24) % 2 == 0)
            f = np.where(trill, 1040.0, 1300.0)
            s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, (bd - tt2) / 0.03)
            add(sfx, tt + k, s, 0.13)
            k += 1.0
    elif ty == "beam":
        add(sfx, tt, sine_sweep(d, 400, 2400, 0) * np.sin(np.pi * t_(d) / d), 0.1)
        add(sfx, tt, sweep_noise(d, 1000, 9000, "mid"), 0.25)
    elif ty == "reveal":
        add(sfx, tt, sweep_noise(d, 200, 3000, "mid") * 1.6, 0.45)
        add(sfx, tt, sine_sweep(d, 110, 55, 1.5), 0.3)


for c in cues:
    fx(c)

# a short room reverb on the effects
ir_len = int(0.9 * SR)
ir = rng.normal(0, 1, ir_len) * np.exp(-np.arange(ir_len) / SR * 6.5)
ir[0] = 0
for ch in range(2):
    wet = np.fft.irfft(np.fft.rfft(sfx[:, ch], N + ir_len) * np.fft.rfft(ir, N + ir_len))[:N]
    sfx[:, ch] += wet * 0.02

mix = music * 1.05 + sfx
# fade the music in at 7s and the tail out
fade = np.ones(N)
end = int(60.5 * SR)
fade[end:] = np.linspace(1, 0, N - end)
mix *= fade[:, None]
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.4) / np.tanh(1.4) * 0.92

pcm = (mix * 32767).astype(np.int16)
with wave.open(out_path, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("ok", out_path)
