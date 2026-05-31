/* Caption utilities for Caption AI */

import {
  Caption,
  AlignedSegment,
  AlignedWord,
  CaptionTheme,
  CaptionStyle,
  CAPTION_THEMES,
  CaptionChunkingConfig,
} from "./types";

let captionIdCounter = 0;

export const DEFAULT_CAPTION_CHUNKING_CONFIG: CaptionChunkingConfig = {
  maxWordsPerCaption: 5,
  minWordsPerCaption: 2,
  maxCharsPerCaption: 32,
  minCaptionDuration: 0.8,
  maxCaptionDuration: 3.0,
  pauseSplitThreshold: 0.45,
  mergeSmallGapThreshold: 0.18,
  targetReadingSpeedCps: 17,
  avoidSingleWordCaptions: true,
  balanceLineLength: true,
};

export function generateCaptionId(): string {
  return `c_${Date.now()}_${++captionIdCounter}`;
}

/**
 * Modern word-group caption conversion.
 * Splits aligned segments into 2-3 word groups, each with per-word timing
 * for word-by-word pop-in animation (like CapCut / MrBeast style).
 */
export function buildCaptionPages(
  words: AlignedWord[],
  options: CaptionChunkingConfig = DEFAULT_CAPTION_CHUNKING_CONFIG
): AlignedWord[][] {
  const pages: AlignedWord[][] = [];
  let current: AlignedWord[] = [];

  const flush = () => {
    if (current.length > 0) {
      pages.push(current);
      current = [];
    }
  };

  for (const word of words) {
    const cleanWord = word.word?.trim();
    if (!cleanWord || word.start === undefined || word.end === undefined || word.end <= word.start) {
      continue;
    }

    const candidate = [...current, { ...word, word: cleanWord }];
    const candidateText = candidate.map((w) => w.word).join(" ");
    const currentDuration = current.length > 0 ? current[current.length - 1].end - current[0].start : 0;
    const pauseSeconds = current.length > 0 ? word.start - current[current.length - 1].end : 0;
    const candidateDuration = candidate.length > 0 ? candidate[candidate.length - 1].end - candidate[0].start : 0;
    const readingSpeed = candidateDuration > 0 ? candidateText.length / candidateDuration : 0;
    const minWords = Math.max(1, options.minWordsPerCaption);
    const maxWords = Math.max(minWords, options.maxWordsPerCaption);
    const targetWords = Math.min(maxWords, Math.max(minWords, 4));
    const splitForPause =
      pauseSeconds >= options.pauseSplitThreshold && pauseSeconds > options.mergeSmallGapThreshold;
    const tooFast = readingSpeed > options.targetReadingSpeedCps && current.length >= minWords;
    const shouldSplit =
      current.length >= minWords &&
      currentDuration >= options.minCaptionDuration &&
      (current.length >= maxWords ||
        (options.balanceLineLength && current.length >= targetWords && candidateText.length > options.maxCharsPerCaption * 0.82) ||
        candidateText.length > options.maxCharsPerCaption ||
        splitForPause ||
        tooFast ||
        currentDuration >= options.maxCaptionDuration);

    if (shouldSplit) {
      flush();
    }

    current.push({ ...word, word: cleanWord });
  }

  flush();
  if (!options.avoidSingleWordCaptions) return pages;

  const merged: AlignedWord[][] = [];
  for (const page of pages) {
    const last = merged[merged.length - 1];
    if (page.length === 1 && last && last.length + page.length <= options.maxWordsPerCaption) {
      last.push(...page);
    } else {
      merged.push(page);
    }
  }
  return merged;
}

export function segmentsToCaptions(
  segments: AlignedSegment[],
  lang: string = "english",
  theme: string = "word_highlight_box",
  options: CaptionChunkingConfig = DEFAULT_CAPTION_CHUNKING_CONFIG
): Caption[] {
  const captions: Caption[] = [];

  for (const seg of segments) {
    if (!seg.text || !seg.text.trim()) continue;

    // If word-level data exists, create small word groups
    const validWords: AlignedWord[] = (seg.words || []).filter(
      (w) => w.word && w.start !== undefined && w.end !== undefined
    );

    if (validWords.length > 0) {
      for (const group of buildCaptionPages(validWords, options)) {
        if (group.length === 0) continue;

        captions.push({
          id: generateCaptionId(),
          start: group[0].start,
          end: group[group.length - 1].end,
          text: group.map((w) => w.word).join(" "),
          words: group,
          lang: lang as Caption["lang"],
          theme: theme as Caption["theme"],
        });
      }
    } else {
      // Fallback: no word data, use segment as single caption
      captions.push({
        id: generateCaptionId(),
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        lang: lang as Caption["lang"],
        theme: theme as Caption["theme"],
      });
    }
  }

  return captions;
}

export const segmentsToCapptions = segmentsToCaptions;

export function getActiveWordIndex(words: AlignedWord[] | undefined, currentTime: number): number {
  if (!words || words.length === 0) return -1;
  return words.findIndex((word) => currentTime >= word.start && currentTime < word.end);
}

export function wordActivationProgressFrames(word: AlignedWord, currentTime: number, fps: number): number {
  return Math.max(0, (currentTime - word.start) * fps);
}

export function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30); // 30fps frame count
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${pad(m)}:${pad(s)}.${pad(ms)}`;
}

/** Parse "MM:SS.cs" or raw seconds back to a number */
export function parseTime(input: string): number | null {
  // Try "MM:SS.cs" format
  const match = input.match(/^(\d+):(\d{1,2})\.(\d{1,2})$/);
  if (match) {
    const mins = parseInt(match[1], 10);
    const secs = parseInt(match[2], 10);
    const cs = parseInt(match[3].padEnd(2, "0"), 10);
    return mins * 60 + secs + cs / 100;
  }
  // Try raw seconds
  const num = parseFloat(input);
  if (!isNaN(num) && num >= 0) return num;
  return null;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function generateSRT(captions: Caption[]): string {
  return captions
    .sort((a, b) => a.start - b.start)
    .map((c, i) => {
      const startTC = srtTimecode(c.start);
      const endTC = srtTimecode(c.end);
      return `${i + 1}\n${startTC} --> ${endTC}\n${c.text}\n`;
    })
    .join("\n");
}

function srtTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${ms.toString().padStart(3, "0")}`;
}

// ── ASS Generation Helpers ──────────────────────────────────────────

// Map CSS hex color → ASS &HAABBGGRR
function hexToAss(hex: string, alpha = 0): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "&H00FFFFFF";
  const rr = h.slice(0, 2);
  const gg = h.slice(2, 4);
  const bb = h.slice(4, 6);
  return `&H${alpha.toString(16).padStart(2, "0").toUpperCase()}${bb}${gg}${rr}`.toUpperCase();
}

// Map rgba() → ASS BackColour
function rgbaToAss(rgba: string): string {
  const m = rgba.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return "&H00000000";
  const r = parseInt(m[1]).toString(16).padStart(2, "0");
  const g = parseInt(m[2]).toString(16).padStart(2, "0");
  const b = parseInt(m[3]).toString(16).padStart(2, "0");
  const a = m[4] ? Math.round((1 - parseFloat(m[4])) * 255) : 0;
  return `&H${a.toString(16).padStart(2, "0").toUpperCase()}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}`;
}

// Per-theme highlight color matching CaptionOverlay.tsx
const THEME_HIGHLIGHT_COLORS: Partial<Record<CaptionTheme, string>> = {
  word_highlight_box: "#FFD43B",
  viral_word_highlight: "#22f4b8",
  viral_shorts: "#FFD700",
  kalakar_fire: "#ff6b35",
  karaoke_neon: "#00ff88",
  neon_glow: "#00ffff",
  gradient_wave: "#ff6ec7",
  comic_pop: "#FFD700",
};

/**
 * Build a named ASS style line from a theme (or custom style override).
 */
function buildAssStyle(styleName: string, theme: CaptionTheme, styleOverride?: CaptionStyle): string {
  const t = styleOverride || CAPTION_THEMES[theme] || CAPTION_THEMES.word_highlight_box;
  const font = (t.fontFamily || "Arial").replace(/'/g, "").split(",")[0].trim();
  const size = t.fontSize || 24;
  const bold = t.bold ? -1 : 0;
  const italic = t.italic ? -1 : 0;
  const primary = t.color?.startsWith("#") ? hexToAss(t.color) : "&H00FFFFFF";
  const outlineClr = t.outline && t.outlineColor?.startsWith("#") ? hexToAss(t.outlineColor) : "&H00000000";
  const bg = t.backgroundColor?.startsWith("rgba") ? rgbaToAss(t.backgroundColor)
    : t.backgroundColor?.startsWith("#") ? hexToAss(t.backgroundColor)
    : "&H00000000";
  const borderStyle = (t.backgroundColor && t.backgroundColor !== "transparent") ? 3 : 1;
  const outlineW = t.outline ? 3 : (borderStyle === 1 ? 2 : 0);
  const shadow = borderStyle === 1 ? 1 : 0;
  const align = t.position === "center" ? 5 : t.position === "top" ? 8 : 2;
  const marginV = align === 5 ? 20 : 30;

  return `Style: ${styleName},${font},${size},${primary},&H000000FF,${outlineClr},${bg},${bold},${italic},0,0,100,100,0,0,${borderStyle},${outlineW},${shadow},${align},20,20,${marginV},1`;
}

/**
 * Build karaoke text with \kf tags for word-by-word color highlighting.
 * The active word shows in the theme's highlight color via \1c override.
 */
function buildKaraokeText(caption: Caption): string {
  if (!caption.words || caption.words.length === 0) return caption.text;

  const highlightHex = THEME_HIGHLIGHT_COLORS[caption.theme] || "#FFD700";
  const highlightAss = hexToAss(highlightHex);

  return caption.words.map((w) => {
    const durCs = Math.max(1, Math.round((w.end - w.start) * 100));
    return `{\\kf${durCs}\\1c${highlightAss}}${w.word}`;
  }).join(" ");
}

/**
 * Generate ASS subtitle file with per-caption theming and karaoke word highlighting.
 *
 * - Each unique theme → named ASS style (e.g. Theme_viral_shorts, Theme_cinematic)
 * - Custom per-caption overrides → unique style (Custom_0, Custom_1, ...)
 * - Word-level data → \kf karaoke tags with highlight color
 */
export function generateASS(captions: Caption[], _theme?: CaptionTheme, enableKaraoke: boolean = true): string {
  const styleMap = new Map<string, string>(); // styleName → Style line
  const captionStyleNames: string[] = [];

  const sorted = [...captions].sort((a, b) => a.start - b.start);

  sorted.forEach((c, idx) => {
    let styleName: string;

    if (c.style) {
      // Caption has custom per-instance style → unique ASS style
      styleName = `Custom_${idx}`;
      styleMap.set(styleName, buildAssStyle(styleName, c.theme, c.style));
    } else {
      // Shared theme-based style
      styleName = `Theme_${c.theme}`;
      if (!styleMap.has(styleName)) {
        styleMap.set(styleName, buildAssStyle(styleName, c.theme));
      }
    }
    captionStyleNames.push(styleName);
  });

  // Fallback if no captions
  if (styleMap.size === 0) {
    const fb = _theme || "word_highlight_box";
    styleMap.set(`Theme_${fb}`, buildAssStyle(`Theme_${fb}`, fb));
  }

  const styleLines = Array.from(styleMap.values()).join("\n");

  const header = `[Script Info]
Title: Caption AI Pro v5.0
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLines}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = sorted
    .map((c, idx) => {
      const start = assTimecode(c.start);
      const end = assTimecode(c.end);
      const sName = captionStyleNames[idx];
      const text = (enableKaraoke && c.words && c.words.length > 0) ? buildKaraokeText(c) : c.text;
      return `Dialogue: 0,${start},${end},${sName},,0,0,0,,${text}`;
    })
    .join("\n");

  return header + events;
}

function assTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revoke so the browser has time to start the download
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
