"use client";

import React, { useCallback } from "react";
import { RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { CREATOR_FONTS, DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG } from "@/lib/captionStyleConfig";
import { CaptionAlignment, CaptionEntranceAnimation, CaptionStyleConfig, CaptionWordAnimation } from "@/lib/types";
import { useCaptionStore } from "@/store/captionStore";
import { useEditorStore } from "@/store/editorStore";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}

function SliderControl({ label, value, min, max, step = 1, suffix = "", onChange }: SliderProps) {
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
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 rounded border-0 bg-transparent"
      />
    </label>
  );
}

function ToggleControl({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
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
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
      <span>{label}</span>
      <select
        value={value}
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
    setCaptionStyleConfig,
    resetCaptionStyleConfig,
    saveCaptionPreset,
    setTheme,
    savedCaptionPresets,
  } = useEditorStore();
  const captions = useCaptionStore((s) => s.captions);
  const setCaptions = useCaptionStore((s) => s.setCaptions);

  const update = useCallback(
    (patch: Partial<CaptionStyleConfig>) => {
      setTheme("word_highlight_box");
      setCaptionStyleConfig(patch);
    },
    [setCaptionStyleConfig, setTheme]
  );

  const applyToAll = useCallback(() => {
    setTheme("word_highlight_box");
    setCaptions(captions.map((caption) => ({ ...caption, theme: "word_highlight_box" })));
  }, [captions, setCaptions, setTheme]);

  return (
    <div className="p-2 space-y-3 shrink-0 max-h-[48vh] overflow-y-auto" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={14} style={{ color: "var(--accent)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          Caption Style
        </span>
        <div className="flex-1" />
        <button
          className="p-1 rounded hover:bg-white/10"
          title="Reset to default style"
          onClick={() => {
            resetCaptionStyleConfig();
            applyToAll();
          }}
        >
          <RotateCcw size={13} style={{ color: "var(--text-muted)" }} />
        </button>
        <button
          className="p-1 rounded hover:bg-white/10"
          title="Save as preset"
          onClick={() => saveCaptionPreset(`Preset ${savedCaptionPresets.length + 1}`)}
        >
          <Save size={13} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-primary text-xs"
          onClick={() => {
            setTheme("word_highlight_box");
            update({ presetName: "Word Highlight Box" });
            applyToAll();
          }}
        >
          Word Highlight Box
        </button>
        <button className="btn-ghost text-xs" onClick={applyToAll}>
          Apply Style
        </button>
      </div>

      <Section title="Text">
        <SelectControl
          label="Font family"
          value={captionStyleConfig.fontFamily}
          options={CREATOR_FONTS}
          onChange={(fontFamily) => update({ fontFamily })}
        />
        <div className="grid grid-cols-2 gap-2">
          <SelectControl
            label="Font weight"
            value={String(captionStyleConfig.fontWeight)}
            options={["400", "500", "600", "700", "800", "900"]}
            onChange={(fontWeight) => update({ fontWeight: Number(fontWeight) })}
          />
          <SelectControl
            label="Case"
            value={captionStyleConfig.textTransform}
            options={["none", "uppercase"]}
            onChange={(textTransform) => update({ textTransform })}
          />
        </div>
        <SliderControl label="Font size" value={captionStyleConfig.fontSize} min={24} max={96} onChange={(fontSize) => update({ fontSize })} />
        <SliderControl label="Letter spacing" value={captionStyleConfig.letterSpacing} min={-1} max={8} step={0.1} onChange={(letterSpacing) => update({ letterSpacing })} />
        <SliderControl label="Line height" value={captionStyleConfig.lineHeight} min={0.9} max={1.6} step={0.01} onChange={(lineHeight) => update({ lineHeight })} />
        <ColorControl label="Text color" value={captionStyleConfig.textColor} onChange={(textColor) => update({ textColor })} />
        <ToggleControl label="Text shadow" checked={captionStyleConfig.textShadowEnabled} onChange={(textShadowEnabled) => update({ textShadowEnabled })} />
      </Section>

      <Section title="Highlight">
        <ColorControl label="Active word" value={captionStyleConfig.activeWordColor} onChange={(activeWordColor) => update({ activeWordColor })} />
        <SliderControl label="Active scale" value={captionStyleConfig.activeWordScale} min={1} max={1.16} step={0.01} onChange={(activeWordScale) => update({ activeWordScale })} />
        <SliderControl label="Strength" value={captionStyleConfig.animationStrength} min={0} max={1.4} step={0.05} onChange={(animationStrength) => update({ animationStrength })} />
        <SliderControl label="Smoothness" value={captionStyleConfig.animationSmoothness} min={0} max={1} step={0.05} onChange={(animationSmoothness) => update({ animationSmoothness })} />
        <ToggleControl label="Glow" checked={captionStyleConfig.activeWordGlow} onChange={(activeWordGlow) => update({ activeWordGlow })} />
      </Section>

      <Section title="Background">
        <ToggleControl label="Enabled" checked={captionStyleConfig.backgroundEnabled} onChange={(backgroundEnabled) => update({ backgroundEnabled })} />
        <ColorControl label="Color" value={captionStyleConfig.backgroundColor} onChange={(backgroundColor) => update({ backgroundColor })} />
        <SliderControl label="Opacity" value={captionStyleConfig.backgroundOpacity} min={0} max={1} step={0.01} onChange={(backgroundOpacity) => update({ backgroundOpacity })} />
        <SliderControl label="Radius" value={captionStyleConfig.borderRadius} min={0} max={36} onChange={(borderRadius) => update({ borderRadius })} />
        <SliderControl label="Padding X" value={captionStyleConfig.paddingX} min={6} max={48} onChange={(paddingX) => update({ paddingX })} />
        <SliderControl label="Padding Y" value={captionStyleConfig.paddingY} min={4} max={32} onChange={(paddingY) => update({ paddingY })} />
        <ToggleControl label="Shadow" checked={captionStyleConfig.backgroundShadow} onChange={(backgroundShadow) => update({ backgroundShadow })} />
      </Section>

      <Section title="Position">
        <SliderControl label="X position" value={captionStyleConfig.positionX} min={0} max={100} suffix="%" onChange={(positionX) => update({ positionX })} />
        <SliderControl label="Y position" value={captionStyleConfig.positionY} min={0} max={100} suffix="%" onChange={(positionY) => update({ positionY })} />
        <SliderControl label="Max width" value={captionStyleConfig.maxWidth} min={45} max={96} suffix="%" onChange={(maxWidth) => update({ maxWidth })} />
        <div className="grid grid-cols-2 gap-2">
          <SelectControl<CaptionAlignment>
            label="Alignment"
            value={captionStyleConfig.alignment}
            options={["left", "center", "right"]}
            onChange={(alignment) => update({ alignment })}
          />
          <ToggleControl label="Safe area" checked={captionStyleConfig.safeAreaEnabled} onChange={(safeAreaEnabled) => update({ safeAreaEnabled })} />
        </div>
      </Section>

      <Section title="Animation">
        <div className="grid grid-cols-2 gap-2">
          <SelectControl<CaptionWordAnimation>
            label="Word motion"
            value={captionStyleConfig.animationType}
            options={["none", "pop", "bounce"]}
            onChange={(animationType) => update({ animationType })}
          />
          <SelectControl<CaptionEntranceAnimation>
            label="Entrance"
            value={captionStyleConfig.entranceAnimation}
            options={["none", "fade", "pop", "slide_up"]}
            onChange={(entranceAnimation) => update({ entranceAnimation })}
          />
        </div>
        <SliderControl label="Speed" value={captionStyleConfig.animationSpeed} min={0.4} max={2} step={0.05} onChange={(animationSpeed) => update({ animationSpeed })} />
      </Section>

      {savedCaptionPresets.length > 0 && (
        <Section title="Saved Presets">
          <div className="grid grid-cols-2 gap-1">
            {savedCaptionPresets.map((preset, index) => (
              <button
                key={`${preset.presetName}-${index}`}
                className="btn-ghost truncate"
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
        onClick={() => update(DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG)}
      >
        Reset Defaults
      </button>
    </div>
  );
}
