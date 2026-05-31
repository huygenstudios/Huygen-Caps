# Caption AI

Caption AI is a local short-form video captioning app for Huygen Studios. It uploads an MP4/MOV, transcribes speech with word-level timestamps, previews animated captions in the editor, and exports burned MP4s plus subtitle/transcript files.

Supported caption modes:

- Auto Mixed Indian: Telugu, Hindi, and English mixed naturally in the same sentence, rendered in Roman text
- English
- Hinglish
- Telgish / Teluglish: Telugu or Telugu-English mixed speech rendered in Roman letters, for example `nenu site ki vellanu`

The app is optimized for Instagram Reels, YouTube Shorts, and TikTok.

## Architecture

- `frontend/`: Next.js editor, media import, caption preview, SRT/JSON/MP4 export UI.
- `server/`: FastAPI upload/job/export API, SQLite job store, WebSocket progress.
- `ai_pipeline/`: audio extraction, STT provider abstraction, transcript normalization, word-level alignment, SRT/VTT rendering.
- `server/headless_export.py`: Playwright + FFmpeg frame export. It captures the same React caption component used in preview and burns it into the output video.

## Requirements

- Python 3.10+
- Node.js 18+
- FFmpeg and FFprobe on PATH, or `FFMPEG_PATH` set in `.env`
- A configured STT provider:
  - `STT_PROVIDER=auto` with one of the provider keys below
  - `STT_PROVIDER=groq_whisper` or `STT_PROVIDER=whisper` with `GROQ_API_KEY`
  - `STT_PROVIDER=openai_whisper` with `OPENAI_API_KEY`
  - `STT_PROVIDER=sarvam` with `SARVAM_API_KEY`

Sarvam is recommended for production Telgish/Teluglish because Saaras v3 supports Telugu (`te-IN`), word timestamps, and `translit` Roman output. See the official Sarvam STT docs: https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe

## Environment

Copy `.env.example` to `.env` and fill in the values:

```env
GROQ_API_KEY=your_groq_api_key_here
OPENAI_API_KEY=
STT_PROVIDER=auto
SARVAM_API_KEY=
FFMPEG_PATH=C:/ffmpeg/bin/ffmpeg.exe
PORT=8000
HOST=127.0.0.1
MAX_UPLOAD_SIZE_MB=500
RENDER_PAGE_URL=http://localhost:3000/render
```

`STT_PROVIDER=auto` chooses Sarvam first for Hinglish, Telgish, and Auto Mixed Indian when `SARVAM_API_KEY` is configured, then OpenAI Whisper, then Groq Whisper. Telgish and Auto Mixed Indian fail clearly if no Telugu-capable provider key is configured.

## Install

Backend:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m playwright install chromium
```

Frontend:

```powershell
cd frontend
npm install
```

## Run Locally

Backend:

```powershell
.\venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend:

```powershell
cd frontend
npm run dev
```

Open http://localhost:3000.

## Generate Test

1. Import an MP4 or MOV.
2. Select `Auto Mixed Indian`, `English`, `Hinglish`, or `Telgish / Teluglish`.
3. Click `Generate Captions`.
4. Confirm the editor shows processing progress.
5. Confirm captions appear with word timings.
6. Open Export and download `Burned MP4`, `SRT Subtitles`, or `Transcript JSON`.

## Language Tests

English:

- Use an English MP4.
- Select `English`.
- Verify the backend receives `languageMode=english`.
- Verify word timestamps exist and the exported MP4 highlights spoken words.

Auto Mixed Indian:

- Use a Telugu-English or Telugu-Hindi-English mixed MP4.
- Select `Auto Mixed Indian`.
- Verify Roman output, not Telugu or Devanagari script.
- Verify English words remain readable.
- Verify word timestamps and burned MP4 export.

Hinglish:

- Use a Hindi-English mixed MP4.
- Select `Hinglish`.
- Verify Roman output, not Devanagari.
- Verify word timestamps and burned MP4 export.

Telgish / Teluglish:

- Use a Telugu-English mixed MP4.
- Select `Telgish / Teluglish`.
- Verify the request sends `languageMode=telgish`.
- Verify the backend accepts it.
- Verify output is Roman text, not Telugu script.
- Verify every visible word has start/end timing.
- Verify the burned MP4 uses animated word highlights.

## Transcript Normalization

All provider output is normalized into a shared transcript shape with:

- `languageMode`
- `provider`
- `romanized`
- `segments`
- `words` with `word`, `start`, `end`, optional `originalWord`, and `languageHint`

Hinglish, Telgish, and Auto Mixed Indian detect Telugu (`U+0C00-U+0C7F`) and Devanagari (`U+0900-U+097F`) script. Native-script words are romanized while English words, names, numbers, and punctuation are preserved. If Romanization fails and native script remains, generation fails instead of outputting unreadable captions.

## Caption Chunking

Use the `Caption Chunking` controls in the editor to rebuild captions from existing word timestamps without re-running transcription.

- Max words per caption
- Max characters per caption
- Minimum and maximum caption duration
- Pause split threshold
- Merge small gaps
- Target reading speed
- Avoid single-word captions
- Balance line length

## Word Highlight Box

The default premium style is `Word Highlight Box`.

- Captions are chunked into short 2-6 word pages, preferring 4-5 words for fast Reels.
- All words in the active chunk remain visible.
- Inactive words use the configured text color.
- The currently spoken word uses the configured active word color, default `#FFD43B`.
- The caption sits inside a configurable dark rounded background.
- Active word timing is computed from word timestamps.
- Headless export advances by frame with `currentTime = frame / fps`.
- Preview and export use the same React caption component.
- Small provider/alignment overlaps are repaired before rendering and marked with a
  `*_repaired` `timing_source` in transcript JSON.
- If a caption has no word-level timestamps, the app shows:
  `Word-level timestamps are required for automatic word highlighting.`

Use the `Caption Style` panel to customize:

- Font family: Poppins, Inter, Montserrat, Roboto, Oswald, Anton, Bebas Neue, Arial.
- Font size, weight, letter spacing, line height, and uppercase mode.
- Text color and active word color.
- Active word scale, glow, animation strength, animation type, and speed.
- Background color, opacity, radius, padding, and shadow.
- X/Y position, safe area, alignment, and max width.

Fonts are installed through local `@fontsource` packages so preview and export do not depend on Google Fonts at render time.

## Word Highlight Box Tests

Test 1:

- Upload an English reel.
- Generate captions.
- Select `Word Highlight Box`.
- Confirm the active word turns yellow exactly when spoken.
- Change active word color to green.
- Export MP4 and confirm it matches preview.

Test 2:

- Change font to Poppins, Montserrat, and Anton.
- Confirm preview and exported MP4 use the selected font.

Test 3:

- Change background color, opacity, radius, and padding.
- Confirm the box wraps text cleanly and export matches.

Test 4:

- Move caption X/Y position with sliders.
- Confirm the caption stays inside the safe area and export matches.

Test 5:

- Use longer caption text.
- Confirm chunking avoids long full-sentence paragraphs.

Test 6:

- Drag captions in the preview.
- Confirm all caption chunks move together.
- Export MP4 and confirm the same position.

Test 7:

- Upload Telugu-English or Hindi-English mixed speech.
- Confirm the transcript JSON has Roman `word` values and `originalWord` only when romanization changed the token.

## Troubleshooting

Generate button does nothing:

- Confirm the backend is running on `http://127.0.0.1:8000`.
- Confirm the frontend `NEXT_PUBLIC_API_URL` points to the backend if customized.
- Check the inline error in the Caption Editor.
- Run `.\venv\Scripts\python.exe -c "from server.main import app; print(app.title)"`.

CORS error:

- Use the default frontend/backend ports first: `3000` and `8000`.
- Confirm the API URL is not mixed between `localhost` and another host unexpectedly.

FFmpeg missing:

- Install FFmpeg and FFprobe.
- Or set `FFMPEG_PATH=C:/ffmpeg/bin/ffmpeg.exe`.
- Restart the backend after changing `.env`.

Missing `SARVAM_API_KEY`:

- Use `STT_PROVIDER=auto` with `GROQ_API_KEY` or `OPENAI_API_KEY`, or add `SARVAM_API_KEY`.
- Telgish with `STT_PROVIDER=sarvam` will fail clearly without this key.

Telgish / Auto Mixed provider error:

- Configure `SARVAM_API_KEY`, `OPENAI_API_KEY`, or `GROQ_API_KEY`.
- For best Telugu-English mixed captions, prefer `STT_PROVIDER=auto` with `SARVAM_API_KEY`.

Word timings are not increasing:

- Restart the backend so it loads the latest timestamp repair logic.
- The pipeline now repairs small non-monotonic word overlaps, for example near short words like `and`.
- Repaired words are labeled in transcript JSON with a `timing_source` ending in `_repaired`.

Telgish returning Telugu script:

- Prefer `STT_PROVIDER=sarvam` with Saaras v3 transliteration mode.
- The Whisper fallback runs a Telugu Unicode romanization layer, but some loan words may need manual correction.

Render fails:

- Install Playwright Chromium:
  `.\venv\Scripts\python.exe -m playwright install chromium`
- Start the frontend before exporting MP4 because the backend captures `RENDER_PAGE_URL`.
- Confirm FFmpeg is installed.

Output file missing:

- Check the backend terminal for the export stage error.
- Verify the original upload still exists in `storage/uploads`.
- Try exporting SRT or JSON first to confirm captions exist.
