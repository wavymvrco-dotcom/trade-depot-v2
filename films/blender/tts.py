# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Voice-over for the films: one WAV per narration line -> films/vo/<id>/NN.wav.
# Australian neural voice. Needs ONE of these (in the environment or .env.local):
#   AZURE_SPEECH_KEY + AZURE_SPEECH_REGION   (voice: en-AU-WilliamNeural, or AZURE_VOICE)
#   ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID (pick an Australian voice in ElevenLabs)
# Run with any Python 3 (or Blender's):  python films/blender/tts.py [film_id ...]
# Then rebuild each film (timings follow the audio) and render.

import json, os, re, sys, urllib.request, wave
from xml.sax.saxutils import escape

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REPO = os.path.abspath(os.path.join(ROOT, ".."))


def env(name):
    if os.environ.get(name):
        return os.environ[name]
    for f in (".env.local", ".env"):
        p = os.path.join(REPO, f)
        if os.path.exists(p):
            for line in open(p, encoding="utf-8"):
                m = re.match(rf"\s*{name}\s*=\s*\"?([^\"\n]+)\"?", line)
                if m:
                    return m.group(1).strip()
    return None


def azure(text_starred, key, region, voice):
    parts = re.split(r"(\*[^*]+\*)", text_starred)
    body = "".join(f'<emphasis level="moderate">{escape(p[1:-1])}</emphasis>' if p.startswith("*") else escape(p) for p in parts)
    ssml = (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-AU">'
            f'<voice name="{voice}"><prosody rate="+4%" pitch="+2%">{body}</prosody></voice></speak>')
    req = urllib.request.Request(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1", data=ssml.encode("utf-8"), method="POST",
                                 headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                                          "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm", "User-Agent": "TradeDepotFilms"})
    return urllib.request.urlopen(req, timeout=60).read()          # already a WAV


def elevenlabs(text_starred, key, voice_id):
    text = text_starred.replace("*", "")
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=pcm_24000",
                                 data=json.dumps({"text": text, "model_id": "eleven_multilingual_v2",
                                                  "voice_settings": {"stability": 0.4, "similarity_boost": 0.8, "style": 0.45}}).encode(),
                                 method="POST", headers={"xi-api-key": key, "Content-Type": "application/json"})
    pcm = urllib.request.urlopen(req, timeout=120).read()
    import io
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm)
    return buf.getvalue()


def main(ids):
    data = json.load(open(os.path.join(ROOT, "narration.json"), encoding="utf-8"))
    az_key, az_region = env("AZURE_SPEECH_KEY"), env("AZURE_SPEECH_REGION")
    el_key, el_voice = env("ELEVENLABS_API_KEY"), env("ELEVENLABS_VOICE_ID")
    if not ((az_key and az_region) or (el_key and el_voice)):
        sys.exit("No voice provider configured: set AZURE_SPEECH_KEY + AZURE_SPEECH_REGION, or ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID.")
    for fid in ids or [k for k in data if not k.startswith("_") and k != "voice"]:
        out = os.path.join(ROOT, "vo", fid); os.makedirs(out, exist_ok=True)
        for n, line in enumerate(data[fid]["lines"]):
            wav = azure(line, az_key, az_region, env("AZURE_VOICE") or data["voice"]["azure"]) if az_key else elevenlabs(line, el_key, el_voice)
            open(os.path.join(out, f"{n:02d}.wav"), "wb").write(wav)
        print(f"{fid}: {len(data[fid]['lines'])} lines")


if __name__ == "__main__":
    main(sys.argv[1:])
