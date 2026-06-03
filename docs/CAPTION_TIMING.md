# Caption Timing

Huygen Caps builds captions from word timestamps, not from already-rendered caption blocks. The timing path is:

1. FFmpeg extracts clean mono 16 kHz WAV audio.
2. FFmpeg `silencedetect` finds speech pauses and stores silence gaps.
3. The selected STT provider returns transcript text and, when available, word timestamps.
4. WhisperX can be enabled as an optional forced-alignment provider.
5. stable-ts and Silero VAD are optional fallback/diagnostic providers.
6. Every word is validated and marked with a timing source.
7. Caption chunks are rebuilt from aligned words with pause-aware rules.
8. Preview and export use the same React renderer.

## Timing Sources

Each word carries a `timingSource`:

- `provider`: real word timing from Sarvam, OpenAI, Groq, or another STT provider.
- `whisperx`: forced-aligned word timing from WhisperX.
- `stable_ts`: stabilized Whisper timing from stable-ts when enabled.
- `vad_adjusted`: timing adjusted around detected speech pauses.
- `manual`: user-edited or nudged timing.
- `estimated`: fallback timing, usually equal distribution inside a segment or caption.

Estimated timing is allowed as a fallback, but it is marked and surfaced in the timing debug report because it is not production-grade for tight word sync.

## Pause-Aware Chunking

Defaults:

- Target words: `4`
- Max words: `5`
- Min words: `2`
- Max characters: `34`
- Min duration: `0.8s`
- Max duration: `3.0s`
- Pause split threshold: `0.45s`
- Merge gap: `0.12s`
- Phrase hold: `0.12s`

If the gap between two words is greater than the pause split threshold, Huygen Caps splits the caption and does not merge across that pause. Captions start at the first word and end at the last word plus the phrase hold. If that hold would overlap the next chunk, it is clamped.

## Timing Controls

The Caption Editor has a Timing & Sync section:

- Global offset shifts preview time and exported captions by `-1.0s` to `+1.0s`.
- Selected caption nudge shifts only the selected caption by `-0.05s`, `+0.05s`, `-0.1s`, or `+0.1s` and marks it `manual`.
- Pause split controls where chunks break around silence.
- Phrase hold controls how long captions stay after the last spoken word.
- Rebuild Timing rebuilds captions from the saved aligned transcript without re-running STT.
- Reset Timing clears offset/nudge UI state and rebuilds from the transcript.

## Debugging

Use:

```text
GET /api/captions/jobs/{jobId}/timing-debug
GET /api/health/timing
```

The timing debug endpoint returns word counts, chunk counts, timing source counts, detected silence gaps, suspicious timing warnings, first words with timestamps, and the pause threshold used.

## Render Notes

Render should keep heavy providers optional unless the plan has enough CPU/disk:

```env
ALIGNMENT_PROVIDER=auto
ENABLE_WHISPERX=false
ENABLE_STABLE_TS=false
ENABLE_SILERO_VAD=false
PAUSE_SPLIT_THRESHOLD=0.45
DEFAULT_GLOBAL_CAPTION_OFFSET=0
```

FFmpeg/FFprobe are required. WhisperX, stable-ts, and Silero are not installed by the production Dockerfile by default; install `requirements-optional-ai.txt` only for a worker or machine that can afford the heavier dependencies.

## Known Limitations

Hinglish, Telgish, and Auto Mixed Indian may use provider word timings when forced alignment cannot reliably map Romanized display text back to the spoken language. In that case, the app preserves the provider timing and marks any fallback words as `estimated` instead of pretending they are aligned.
