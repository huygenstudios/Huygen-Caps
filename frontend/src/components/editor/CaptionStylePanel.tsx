"use client";

import React, { useCallback } from "react";
import { RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { CREATOR_FONTS, DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG } from "@/lib/captionStyleConfig";
import { CAPTION_PRESET_LIST, getCaptionPreset } from "@/lib/captionStylePresets";
import { isCaptionLocked } from "@/lib/editorModel";
import { CaptionAlignment, CaptionEntranceAnimation, CaptionStyleConfig, CaptionStylePresetId, CaptionWordAnimation } from "@/lib/types";
import { useCaptionStore } from "@/store/captionStore";
import { useEditorStore } from "@/store/editorStore";
import { useTimelineStore } from "@/store/timelineStore";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function SliderControl({ label, value, min, max, step = 1, suffix = "", disabled = false, onChange }: SliderProps) {
  return (
    <label className="grid gap-1">
      <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
        <span>{label}</span>
        <span>{Number(value).toFixed(step < 1 ? 2 : 0)}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  );
}

function ColorControl({
  label,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
      <span>{label}</span>
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 rounded border-0 bg-transparent"
      />
    </label>
  );
}

function ToggleControl({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--accent)]"
      />
    </label>
  );
}

function SelectControl<T extends string>({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded border-0 px-2 py-1 text-xs outline-none"
        style={{ background: "var(--bg-panel-dark)", color: "var(--text-primary)" }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 pt-2">
      <div className="text-[10px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function CaptionStylePanel() {
  const {
    captionStyleConfig,
    theme,
    setCaptionStyleConfig,
    resetCaptionStyleConfig,
    saveCaptionPreset,
    applyCaptionStylePreset,
    savedCaptionPresets,
  } = useEditorStore();
  const captions = useCaptionStore((s) => s.captions);
  const selectedIds = useCaptionStore((s) => s.selectedIds);
  const setThemeForAll = useCaptionStore((s) => s.setThemeForAll);
  const tracks = useTimelineStore((s) => s.tracks);

  const locked =
    captions.some((caption) => selectedIds.has(caption.id) && isCaptionLocked(caption, tracks)) ||
    Boolean(captions.length && tracks.find((track) => track.type === "caption")?.locked);

  const update = useCallback(
    (patch: Partial<CaptionStyleConfig>) => {
      if (locked) return;
      setCaptionStyleConfig(patch);
    },
    [locked, setCaptionStyleConfig]
  );

  const applyPreset = useCallback(
    (presetId: CaptionStylePresetId) => {
      if (locked) return;
      applyCaptionStylePreset(presetId);
      setThemeForAll(presetId);
    },
    [applyCaptionStylePreset, locked, setThemeForAll]
  );

  return (
    <div className="h-full space-y-3 overflow-y-auto p-2">
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={14} style={{ color: "var(--accent)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          Caption Style
        </span>
        <div className="flex-1" />
        <button
          className="p-1 rounded hover:bg-white/10"
          title="Reset to default style"
          disabled={locked}
          onClick={() => {
            resetCaptionStyleConfig();
            setThemeForAll("word_highlight_box");
          }}
        >
          <RotateCcw size={13} style={{ color: "var(--text-muted)" }} />
        </button>
        <button
          className="p-1 rounded hover:bg-white/10"
          title="Save as preset"
          disabled={locked}
          onClick={() => saveCaptionPreset(`Preset ${savedCaptionPresets.length + 1}`)}
        >
          <Save size={13} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>

      {locked && (
        <div className="rounded px-2 py-1.5 text-[10px]" style={{ background: "rgba(255, 212, 59, 0.12)", color: "#ffd36b", border: "1px solid rgba(255, 212, 59, 0.22)" }}>
          Unlock the caption track to edit caption styling.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {CAPTION_PRESET_LIST.map((preset) => (
          <button
            key={preset.id}
            className={theme === preset.id ? "btn-primary text-xs" : "btn-ghost text-xs"}
            disabled={locked}
            onClick={() => applyPreset(preset.id)}
            title={getCaptionPreset(preset.id).description}
          >
            {preset.name.replace(" Style", "").replace(" Cinematic", "")}
          </button>
        ))}
      </div>

      <Section title="Text">
        <SelectControl
          label="Font family"
          value={captionStyleConfig.fontFamily}
          options={CREATOR_FONTS}
          disabled={locked}
          onChange={(fontFamily) => update({ fontFamily })}
        />
        <div className="grid grid-cols-2 gap-2">
          <SelectControl
            label="Font weight"
            value={String(captionStyleConfig.fontWeight)}
            options={["400", "500", "600", "700", "800", "900"]}
            disabled={locked}
            onChange={(fontWeight) => update({ fontWeight: Number(fontWeight) })}
          />
          <SelectControl
            label="Case"
            value={captionStyleConfig.textTransform}
            options={["none", "uppercase"]}
            disabled={locked}
            onChange={(textTransform) => update({ textTransform })}
          />
        </div>
        <SliderControl disabled={locked} label="Font size" value={captionStyleConfig.fontSize} min={0} max={144} onChange={(fontSize) => update({ fontSize })} />
        <SliderControl disabled={locked} label="Letter spacing" value={captionStyleConfig.letterSpacing} min={-2} max={8} step={0.1} onChange={(letterSpacing) => update({ letterSpacing })} />
        <SliderControl disabled={locked} label="Line height" value={captionStyleConfig.lineHeight} min={0.9} max={1.6} step={0.01} onChange={(lineHeight) => update({ lineHeight })} />
        <ColorControl disabled={locked} label="Text color" value={captionStyleConfig.textColor} onChange={(textColor) => update({ textColor })} />
        <ToggleControl disabled={locked} label="Text shadow" checked={captionStyleConfig.textShadowEnabled} onChange={(textShadowEnabled) => update({ textShadowEnabled })} />
      </Section>

      <Section title="Highlight">
        <ColorControl disabled={locked} label="Active word" value={captionStyleConfig.activeWordColor} onChange={(activeWordColor) => update({ activeWordColor })} />
        <SliderControl disabled={locked} label="Active scale" value={captionStyleConfig.activeWordScale} min={1} max={1.16} step={0.01} onChange={(activeWordScale) => update({ activeWordScale })} />
        <SliderControl disabled={locked} label="Strength" value={captionStyleConfig.animationStrength} min={0} max={1.4} step={0.05} onChange={(animationStrength) => update({ animationStrength })} />
        <SliderControl disabled={locked} label="Smoothness" value={captionStyleConfig.animationSmoothness} min={0} max={1} step={0.05} onChange={(animationSmoothness) => update({ animationSmoothness })} />
        <ToggleControl disabled={locked} label="Glow" checked={captionStyleConfig.activeWordGlow} onChange={(activeWordGlow) => update({ activeWordGlow })} />
        <ToggleControl disabled={locked} label="Active word background" checked={captionStyleConfig.activeWordBackgroundEnabled} onChange={(activeWordBackgroundEnabled) => update({ activeWordBackgroundEnabled })} />
        <ColorControl disabled={locked} label="Active bg color" value={captionStyleConfig.activeWordBackgroundColor} onChange={(activeWordBackgroundColor) => update({ activeWordBackgroundColor })} />
      </Section>

      {theme === "mrbeast_style" && (
        <Section title="MrBeast Controls">
          <ToggleControl disabled={locked} label="Random tilt" checked={Boolean(captionStyleConfig.randomTiltEnabled)} onChange={(randomTiltEnabled) => update({ randomTiltEnabled })} />
          <ToggleControl disabled={locked} label="Smart colors" checked={Boolean(captionStyleConfig.smartHighlightEnabled)} onChange={(smartHighlightEnabled) => update({ smartHighlightEnabled })} />
          <ColorControl disabled={locked} label="Money / winning" value={captionStyleConfig.emphasisGreenColor || "#00FF00"} onChange={(emphasisGreenColor) => update({ emphasisGreenColor })} />
          <ColorControl disabled={locked} label="Shock / now" value={captionStyleConfig.emphasisYellowColor || "#FFFF00"} onChange={(emphasisYellowColor) => update({ emphasisYellowColor })} />
          <ColorControl disabled={locked} label="Danger / wrong" value={captionStyleConfig.emphasisRedColor || "#FF0000"} onChange={(emphasisRedColor) => update({ emphasisRedColor })} />
        </Section>
      )}

      {theme === "apple_cinematic" && (
        <Section title="Apple Reveal">
          <SliderControl disabled={locked} label="Reveal duration" value={captionStyleConfig.revealDuration || 0.32} min={0.08} max={0.9} step={0.01} suffix="s" onChange={(revealDuration) => update({ revealDuration })} />
          <SliderControl disabled={locked} label="Y movement" value={captionStyleConfig.revealYOffset || 30} min={0} max={80} suffix="px" onChange={(revealYOffset) => update({ revealYOffset })} />
          <SliderControl disabled={locked} label="Blur amount" value={captionStyleConfig.revealBlur || 25} min={0} max={40} suffix="px" onChange={(revealBlur) => update({ revealBlur })} />
          <SliderControl disabled={locked} label="Phrase hold" value={captionStyleConfig.phraseHoldDuration || 0.2} min={0} max={2} step={0.05} suffix="s" onChange={(phraseHoldDuration) => update({ phraseHoldDuration })} />
        </Section>
      )}

      {theme === "modern_minimalist_lockup" && (
        <Section title="Build Controls">
          <SliderControl disabled={locked} label="Phrase width" value={captionStyleConfig.maxWidth} min={60} max={86} suffix="%" onChange={(maxWidth) => update({ maxWidth })} />
          <SliderControl disabled={locked} label="Line tightness" value={captionStyleConfig.lineHeight} min={0.9} max={1.05} step={0.01} onChange={(lineHeight) => update({ lineHeight })} />
          <SelectControl<CaptionEntranceAnimation>
            label="Word entrance"
            value={captionStyleConfig.entranceAnimation}
            options={["hard_cut", "fade", "slide_up", "pop", "blur_fade"]}
            disabled={locked}
            onChange={(entranceAnimation) => update({ entranceAnimation })}
          />
        </Section>
      )}

      <Section title="Background">
        <ToggleControl disabled={locked} label="Enabled" checked={captionStyleConfig.backgroundEnabled} onChange={(backgroundEnabled) => update({ backgroundEnabled })} />
        <ColorControl disabled={locked} label="Color" value={captionStyleConfig.backgroundColor} onChange={(backgroundColor) => update({ backgroundColor })} />
        <SliderControl disabled={locked} label="Opacity" value={captionStyleConfig.backgroundOpacity} min={0} max={1} step={0.01} onChange={(backgroundOpacity) => update({ backgroundOpacity })} />
        <SliderControl disabled={locked} label="Radius" value={captionStyleConfig.borderRadius} min={0} max={36} onChange={(borderRadius) => update({ borderRadius })} />
        <SliderControl disabled={locked} label="Padding X" value={captionStyleConfig.paddingX} min={6} max={48} onChange={(paddingX) => update({ paddingX })} />
        <SliderControl disabled={locked} label="Padding Y" value={captionStyleConfig.paddingY} min={4} max={32} onChange={(paddingY) => update({ paddingY })} />
        <ToggleControl disabled={locked} label="Shadow" checked={captionStyleConfig.backgroundShadow} onChange={(backgroundShadow) => update({ backgroundShadow })} />
      </Section>

      <Section title="Universal Border & Shadow">
        <ToggleControl disabled={locked} label="Text stroke" checked={captionStyleConfig.textStrokeEnabled} onChange={(textStrokeEnabled) => update({ textStrokeEnabled })} />
        <ColorControl disabled={locked} label="Stroke color" value={captionStyleConfig.textStrokeColor} onChange={(textStrokeColor) => update({ textStrokeColor })} />
        <SliderControl disabled={locked} label="Stroke width" value={captionStyleConfig.textStrokeWidth} min={0} max={8} step={0.25} onChange={(textStrokeWidth) => update({ textStrokeWidth })} />
        <ColorControl disabled={locked} label="Shadow color" value={captionStyleConfig.textShadowColor} onChange={(textShadowColor) => update({ textShadowColor })} />
        <SliderControl disabled={locked} label="Shadow opacity" value={captionStyleConfig.textShadowOpacity} min={0} max={1} step={0.05} onChange={(textShadowOpacity) => update({ textShadowOpacity })} />
        <SliderControl disabled={locked} label="Shadow blur" value={captionStyleConfig.textShadowBlur} min={0} max={24} onChange={(textShadowBlur) => update({ textShadowBlur })} />
        <ToggleControl disabled={locked} label="Background border" checked={captionStyleConfig.backgroundBorderEnabled} onChange={(backgroundBorderEnabled) => update({ backgroundBorderEnabled })} />
        <ColorControl disabled={locked} label="Border color" value={captionStyleConfig.backgroundBorderColor} onChange={(backgroundBorderColor) => update({ backgroundBorderColor })} />
        <SliderControl disabled={locked} label="Border width" value={captionStyleConfig.backgroundBorderWidth} min={0} max={8} step={0.25} onChange={(backgroundBorderWidth) => update({ backgroundBorderWidth })} />
      </Section>

      <Section title="Position">
        <SliderControl disabled={locked} label="X position" value={captionStyleConfig.positionX} min={0} max={100} suffix="%" onChange={(positionX) => update({ positionX })} />
        <SliderControl disabled={locked} label="Y position" value={captionStyleConfig.positionY} min={0} max={100} suffix="%" onChange={(positionY) => update({ positionY })} />
        <SliderControl disabled={locked} label="Caption scale" value={captionStyleConfig.scale} min={0} max={3} step={0.01} onChange={(scale) => update({ scale })} />
        <SliderControl disabled={locked} label="Rotation" value={captionStyleConfig.rotation} min={-180} max={180} onChange={(rotation) => update({ rotation })} />
        <SliderControl disabled={locked} label="Layer opacity" value={captionStyleConfig.opacity} min={0} max={1} step={0.01} onChange={(opacity) => update({ opacity })} />
        <SliderControl disabled={locked} label="Max width" value={captionStyleConfig.maxWidth} min={45} max={96} suffix="%" onChange={(maxWidth) => update({ maxWidth })} />
        <div className="grid grid-cols-2 gap-2">
          <SelectControl<CaptionAlignment>
            label="Alignment"
            value={captionStyleConfig.alignment}
            options={["left", "center", "right"]}
            disabled={locked}
            onChange={(alignment) => update({ alignment })}
          />
          <ToggleControl disabled={locked} label="Safe area" checked={captionStyleConfig.safeAreaEnabled} onChange={(safeAreaEnabled) => update({ safeAreaEnabled })} />
        </div>
      </Section>

      <Section title="Animation">
        <div className="grid grid-cols-2 gap-2">
          <SelectControl<CaptionWordAnimation>
            label="Word motion"
            value={captionStyleConfig.animationType}
            options={["none", "pop", "bounce"]}
            disabled={locked}
            onChange={(animationType) => update({ animationType })}
          />
          <SelectControl<CaptionEntranceAnimation>
            label="Entrance"
            value={captionStyleConfig.entranceAnimation}
            options={["none", "hard_cut", "fade", "pop", "slide_up", "blur_fade"]}
            disabled={locked}
            onChange={(entranceAnimation) => update({ entranceAnimation })}
          />
        </div>
        <SliderControl disabled={locked} label="Speed" value={captionStyleConfig.animationSpeed} min={0.4} max={2} step={0.05} onChange={(animationSpeed) => update({ animationSpeed })} />
      </Section>

      {savedCaptionPresets.length > 0 && (
        <Section title="Saved Presets">
          <div className="grid grid-cols-2 gap-1">
            {savedCaptionPresets.map((preset, index) => (
              <button
                key={`${preset.presetName}-${index}`}
                className="btn-ghost truncate"
                disabled={locked}
                onClick={() => update(preset)}
                title={preset.presetName}
              >
                {preset.presetName}
              </button>
            ))}
          </div>
        </Section>
      )}

      <button
        className="btn-ghost w-full"
        disabled={locked}
        onClick={() => update(DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG)}
      >
        Reset Defaults
      </button>
    </div>
  );
}
