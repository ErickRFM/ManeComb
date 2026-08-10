#!/usr/bin/env python3
"""Genera los tonos de alerta operativa de ManeComb.

Son ondas sintetizadas aqui mismo: no hay audio descargado ni material con
copyright. Se versiona el generador para que los recursos sean reproducibles y
para dejar constancia de que son originales.

Salida: mobile/android/app/src/main/res/raw/*.wav (PCM 16 bit, 22050 Hz, mono).
Android admite WAV en res/raw para sonidos de canal; los tonos son cortos, asi
que el tamano se mantiene pequeno pese a no ir comprimidos.

Uso:  python scripts/generate-alert-sounds.py
"""

import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 22050
AMPLITUDE = 0.62
RAW_DIR = Path(__file__).resolve().parent.parent / "android/app/src/main/res/raw"


def tone(frequency, seconds, fade=0.012, harmonic=0.0):
    """Seno con envolvente de ataque/caida para que no chasquee."""
    total = int(SAMPLE_RATE * seconds)
    fade_samples = max(1, int(SAMPLE_RATE * fade))
    samples = []
    for index in range(total):
        t = index / SAMPLE_RATE
        value = math.sin(2 * math.pi * frequency * t)
        if harmonic:
            value += harmonic * math.sin(4 * math.pi * frequency * t)
            value /= 1 + harmonic
        envelope = 1.0
        if index < fade_samples:
            envelope = index / fade_samples
        elif index > total - fade_samples:
            envelope = max(0.0, (total - index) / fade_samples)
        samples.append(value * envelope)
    return samples


def silence(seconds):
    return [0.0] * int(SAMPLE_RATE * seconds)


def write(name, samples):
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"{name}.wav"
    frames = b"".join(
        struct.pack("<h", int(max(-1.0, min(1.0, value)) * AMPLITUDE * 32767))
        for value in samples
    )
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(frames)
    print(f"{path.name}: {len(frames) // 2} muestras, {path.stat().st_size} bytes")


def build_sos():
    """Sirena de dos tonos, insistente. Debe ser inconfundible frente a chat."""
    pattern = []
    for _ in range(3):
        pattern += tone(1245.0, 0.16, harmonic=0.35)
        pattern += silence(0.035)
        pattern += tone(933.0, 0.16, harmonic=0.35)
        pattern += silence(0.055)
    return pattern


def build_high():
    """Dos pulsos ascendentes: urgente, pero claramente por debajo del SOS."""
    return (
        tone(784.0, 0.14, harmonic=0.2)
        + silence(0.06)
        + tone(1046.0, 0.2, harmonic=0.2)
    )


def build_standard():
    """Aviso breve y neutro para incidencias informativas."""
    return tone(660.0, 0.16)


if __name__ == "__main__":
    write("alert_sos", build_sos())
    write("alert_high", build_high())
    write("alert_standard", build_standard())
