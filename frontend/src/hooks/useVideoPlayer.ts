/* useVideoPlayer — manages HTML5 video element sync with playback store */

"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePlaybackStore } from "@/store/playbackStore";
import { useEditorStore } from "@/store/editorStore";

export function useVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastPublishedTimeRef = useRef(-1);
  const sequenceFps = useEditorStore((s) => s.sequenceSettings.fps);
  const safeSequenceFps = Math.max(1, sequenceFps || 60);
  const driftToleranceSeconds = Math.max(1 / safeSequenceFps, 2 / safeSequenceFps);

  const {
    isPlaying,
    currentTime,
    volume,
    playbackRate,
    pause,
    setCurrentTime,
    setDuration,
  } = usePlaybackStore();

  // Sync video element with store
  const attachVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (!el) return;

      el.volume = volume;
      el.playbackRate = playbackRate;

      el.onloadedmetadata = () => {
        setDuration(el.duration);
      };

      el.onended = () => {
        setCurrentTime(el.duration || el.currentTime);
        pause();
      };

      el.onplay = () => {
        if (!usePlaybackStore.getState().isPlaying) usePlaybackStore.getState().play();
      };

      el.onpause = () => {
        if (usePlaybackStore.getState().isPlaying) pause();
      };

      el.ontimeupdate = () => {
        if (!usePlaybackStore.getState().isPlaying) {
          setCurrentTime(el.currentTime);
        }
      };
    },
    [volume, playbackRate, setDuration, pause, setCurrentTime]
  );

  // Play/pause sync
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (isPlaying) {
      const targetTime = usePlaybackStore.getState().currentTime;
      if (Math.abs(el.currentTime - targetTime) > driftToleranceSeconds) {
        el.currentTime = targetTime;
      }
      el.play().catch((error) => {
        console.warn("Video playback failed", error);
        pause();
      });

      const publishTime = () => {
        const nextTime = el.currentTime;
        if (Math.abs(nextTime - lastPublishedTimeRef.current) >= 1 / 240) {
          lastPublishedTimeRef.current = nextTime;
          setCurrentTime(nextTime);
        }
      };

      const tick = () => {
        publishTime();
        if (!el.paused && !el.ended) {
          animFrameRef.current = requestAnimationFrame(tick);
        }
      };
      publishTime();
      animFrameRef.current = requestAnimationFrame(tick);
    } else {
      el.pause();
      cancelAnimationFrame(animFrameRef.current);
    }

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [driftToleranceSeconds, isPlaying, pause, setCurrentTime]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isPlaying) return;
    if (Math.abs(el.currentTime - currentTime) > driftToleranceSeconds) {
      el.currentTime = currentTime;
    }
  }, [currentTime, driftToleranceSeconds, isPlaying]);

  // Volume sync
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  // Playback rate sync
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // Seek when currentTime changes externally (e.g., timeline scrub)
  const seekTo = useCallback(
    (time: number) => {
      setCurrentTime(time);
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    },
    [setCurrentTime]
  );

  // Frame step using the current sequence frame rate.
  const frameForward = useCallback(() => {
    const ct = videoRef.current?.currentTime || 0;
    seekTo(Math.min((videoRef.current?.duration || 0), ct + 1 / safeSequenceFps));
  }, [safeSequenceFps, seekTo]);

  const frameBack = useCallback(() => {
    const ct = videoRef.current?.currentTime || 0;
    seekTo(Math.max(0, ct - 1 / safeSequenceFps));
  }, [safeSequenceFps, seekTo]);

  return {
    videoRef,
    attachVideo,
    seekTo,
    frameForward,
    frameBack,
  };
}
