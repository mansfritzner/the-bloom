import math
import struct
import wave

RATE = 44100
SECONDS = 12
TOTAL = RATE * SECONDS

def bell(t, start, frequency, amplitude):
    age = (t - start) % SECONDS
    if age > 2.8:
        return 0.0
    envelope = math.exp(-age * 2.0)
    return math.sin(2 * math.pi * frequency * age) * envelope * amplitude

with wave.open('bloom-loop.wav', 'wb') as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(RATE)
    frames = bytearray()
    for index in range(TOTAL):
        t = index / RATE
        slow = math.sin(2 * math.pi * t / SECONDS)
        station = math.sin(2 * math.pi * 55 * t) * 0.10
        station += math.sin(2 * math.pi * 110 * t + 0.3) * 0.035
        pad = math.sin(2 * math.pi * 146.83 * t + 0.4 * slow) * 0.035
        pad += math.sin(2 * math.pi * 220 * t - 0.25 * slow) * 0.022
        bells = sum(bell(t, start, frequency, 0.075) for start, frequency in (
            (1.0, 293.66), (4.0, 246.94), (7.0, 329.63), (10.0, 196.00)))
        organic = math.sin(2 * math.pi * 41 * t + 0.5 * math.sin(2 * math.pi * t / 4)) * 0.018
        noise = sum(math.sin(2 * math.pi * frequency * t + phase) for frequency, phase in (
            (0.25, 0.4), (0.5, 1.7), (1.25, 2.3), (2.5, 0.8))) * 0.0018
        left = (station + pad + bells + organic + noise) * 0.72
        right = (station * 0.96 + pad * 0.9 + bells * 0.92 + organic * 1.04 + noise) * 0.72
        frames.extend(struct.pack('<hh', int(left * 32767), int(right * 32767)))
    output.writeframes(frames)