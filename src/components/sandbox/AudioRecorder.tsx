import { useState, useRef, useEffect } from "react";
import { Mic, Square, Trash2, Send } from "lucide-react";

interface AudioRecorderProps {
  onSend: (blob: Blob, durationSec: number) => void;
  onCancel: () => void;
  isRecording: boolean;
  onStartRecording: () => void;
}

export function AudioRecorder({ onSend, onCancel, isRecording, onStartRecording }: AudioRecorderProps) {
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isRecording) {
      startRecording();
    }
    return () => {
      stopTimer();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isRecording]);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      setDuration(0);
      setAudioBlob(null);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
        stopTimer();
      };

      recorder.start();
      timerRef.current = window.setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      onCancel();
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob, duration);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (audioBlob) {
    // Preview state
    return (
      <div className="flex items-center gap-2 w-full">
        <button onClick={() => { setAudioBlob(null); onCancel(); }} className="h-9 w-9 rounded-full flex items-center justify-center text-red-400 hover:bg-[#374045]">
          <Trash2 className="h-4 w-4" />
        </button>
        <div className="flex-1 flex items-center gap-2 bg-[#374045] rounded-full px-3 py-2">
          <div className="flex-1 h-1 bg-[#00a884] rounded-full" />
          <span className="text-xs text-[#8696a0]">{formatTime(duration)}</span>
        </div>
        <button onClick={handleSend} className="h-10 w-10 rounded-full bg-[#00a884] flex items-center justify-center text-white hover:bg-[#06cf9c]">
          <Send className="h-5 w-5" />
        </button>
      </div>
    );
  }

  if (isRecording) {
    // Recording state
    return (
      <div className="flex items-center gap-2 w-full">
        <button onClick={onCancel} className="h-9 w-9 rounded-full flex items-center justify-center text-red-400 hover:bg-[#374045]">
          <Trash2 className="h-4 w-4" />
        </button>
        <div className="flex-1 flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm text-[#e9edef]">{formatTime(duration)}</span>
          <div className="flex-1 flex items-center gap-[2px] h-4">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="w-[3px] bg-[#00a884] rounded-full animate-pulse"
                style={{
                  height: `${Math.random() * 100}%`,
                  animationDelay: `${i * 50}ms`,
                  minHeight: "2px",
                }}
              />
            ))}
          </div>
        </div>
        <button onClick={stopRecording} className="h-10 w-10 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600">
          <Square className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return null;
}
