/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, ChangeEvent, MouseEvent } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import * as mm from 'music-metadata-browser';
import { Buffer } from 'buffer';

// Polyfill Buffer for music-metadata-browser
if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
}
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  ListMusic, 
  Shuffle,
  Repeat,
  Repeat1,
  Plus, 
  Clock,
  Radio,
  X,
  Music as MusicIcon,
  Trash2,
  Sparkles,
  Search,
} from 'lucide-react';
import { ID3Writer } from 'browser-id3-writer';

// --- Types ---
type PlayMode = 'sequential' | 'shuffle' | 'repeat-one';

interface LyricLine {
  time: number;
  text: string;
}

interface Track {
  id: string;
  name: string;
  artist: string;
  album?: string;
  url: string;
  file: File;
  coverUrl?: string;
  lyrics?: string;
}

// --- Components ---

const WaveformVisualizer: React.FC<{ audioRef: React.RefObject<HTMLAudioElement | null>; isPlaying: boolean }> = ({ audioRef, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const bassRef = useRef<number>(0);

  useEffect(() => {
    if (!audioRef.current || analyserRef.current) return;

    const initAudio = () => {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        const element = audioRef.current;
        if (!element) return;
        
        const source = audioCtx.createMediaElementSource(element);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
        
        analyser.fftSize = 128; 
        analyserRef.current = analyser;
      } catch (e) {
        // Fallback silently
      }
    };

    if (isPlaying) initAudio();
  }, [audioRef, isPlaying]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);

      if (analyserRef.current) {
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Bass Detection (low frequencies)
        const bassSum = dataArray.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
        const bassIntensity = bassSum / 255;
        bassRef.current = bassIntensity;

        // Background Pulse
        if (bassIntensity > 0.6) {
          const pulseAlpha = (bassIntensity - 0.6) * 0.15;
          ctx.fillStyle = `rgba(255, 255, 255, ${pulseAlpha})`;
          ctx.fillRect(0, 0, width, height);
        }

        // Draw Randomized High-Impact Bars
        const activeBars = 24;
        const barGap = 4;
        const barWidth = (width / activeBars) - barGap;
        const centerY = height;

        ctx.shadowBlur = 20 * bassIntensity;
        ctx.shadowColor = '#fff';

        for (let i = 0; i < activeBars; i++) {
          // Use a staggered mapping to make it look less sequential
          const freqIndex = (i * 2) % bufferLength;
          const val = dataArray[freqIndex];
          
          // Add extra jitter based on bass
          const jitter = Math.sin(Date.now() * 0.01 + i) * (bassIntensity * 20);
          const h = Math.max(10, ((val / 255) * height * 0.85) + jitter);
          
          const x = i * (barWidth + barGap);
          const alpha = (val / 255) * 0.5 + 0.1;
          
          // Create gradient-like effect for each bar
          const gradient = ctx.createLinearGradient(x, centerY, x, centerY - h);
          gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
          gradient.addColorStop(1, `rgba(255, 255, 255, ${alpha * 0.3})`);
          
          ctx.fillStyle = gradient;
          ctx.fillRect(x, centerY - h, barWidth, h);
          
          // Add a tiny glowing tip to some bars during high intensity
          if (bassIntensity > 0.7 && val > 200) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(x, centerY - h - 2, barWidth, 2);
          }
        }
        
        ctx.shadowBlur = 0;
      } else if (isPlaying) {
        // Fallback stylized animation (Randomized)
        const time = Date.now() * 0.005;
        const bars = 20;
        const bw = (width / bars) - 4;
        for (let i = 0; i < bars; i++) {
          const h = (Math.sin(time + i * 0.7) + Math.cos(time * 0.5 + i)) * 15 + 25;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.fillRect(i * (bw + 4), height - h, bw, h);
        }
      }
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying]);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute bottom-0 left-0 w-full h-44 pointer-events-none z-0 opacity-50 mix-blend-screen"
      width={400} 
      height={176} 
    />
  );
};

const PIXEL_MAP: Record<string, number[][]> = {
  '0': [[1,1,1,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,1]],
  '1': [[0,1,1,0],[1,1,1,0],[0,1,1,0],[0,1,1,0],[0,1,1,0],[0,1,1,0],[1,1,1,1]],
  '2': [[1,1,1,1],[0,0,0,1],[0,0,0,1],[1,1,1,1],[1,0,0,0],[1,0,0,0],[1,1,1,1]],
  '3': [[1,1,1,1],[0,0,0,1],[0,0,0,1],[1,1,1,1],[0,0,0,1],[0,0,0,1],[1,1,1,1]],
  '4': [[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,1],[0,0,0,1],[0,0,0,1],[0,0,0,1]],
  '5': [[1,1,1,1],[1,0,0,0],[1,0,0,0],[1,1,1,1],[0,0,0,1],[0,0,0,1],[1,1,1,1]],
  '6': [[1,1,1,1],[1,0,0,0],[1,0,0,0],[1,1,1,1],[1,0,0,1],[1,0,0,1],[1,1,1,1]],
  '7': [[1,1,1,1],[0,0,0,1],[0,0,0,1],[0,0,0,1],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
  '8': [[1,1,1,1],[1,0,0,1],[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1],[1,1,1,1]],
  '9': [[1,1,1,1],[1,0,0,1],[1,0,0,1],[1,1,1,1],[0,0,0,1],[0,0,0,1],[1,1,1,1]],
};

const PixelDigit = ({ digit }: { digit: string }) => {
  const pattern = PIXEL_MAP[digit] || PIXEL_MAP['0'];
  return (
    <div className="grid grid-cols-4 gap-1">
      {pattern.flat().map((pixel, i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 md:w-2 md:h-2 ${pixel ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'bg-transparent'}`}
        />
      ))}
    </div>
  );
};

const PixelClock = ({ audioRef, isPlaying }: { audioRef: React.RefObject<HTMLAudioElement | null>; isPlaying: boolean }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const h = time.getHours().toString().padStart(2, '0');
  const m = time.getMinutes().toString().padStart(2, '0');
  const dayName = time.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = time.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  return (
    <div className="h-44 flex flex-col items-center justify-center bg-black border-b-2 border-white/5 relative overflow-hidden">
      {/* Background Dot Grid */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" 
           style={{ 
             backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', 
             backgroundSize: '16px 16px' 
           }}>
      </div>

      <WaveformVisualizer audioRef={audioRef} isPlaying={isPlaying} />

      <div className="flex items-center gap-6 md:gap-8 relative z-10 scale-90">
        <div className="flex gap-4">
          <PixelDigit digit={h[0]} />
          <PixelDigit digit={h[1]} />
        </div>
        <div className="flex flex-col gap-4">
          <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
          <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
        </div>
        <div className="flex gap-4">
          <PixelDigit digit={m[0]} />
          <PixelDigit digit={m[1]} />
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-1 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-white font-black text-xs tracking-[0.6em] uppercase"
        >
          {dayName}
        </motion.div>
        <div className="text-white/40 font-mono text-[9px] tracking-[0.4em]">
          {dateStr.replace(',', '')}
        </div>
      </div>
    </div>
  );
};

const WaveVisualizer = ({ isPlaying }: { isPlaying: boolean }) => {
  const bars = Array.from({ length: 12 });
  
  return (
    <div className="flex items-end justify-center gap-2 h-12 mt-8 opacity-60">
      {bars.map((_, i) => (
        <motion.div
          key={i}
          className={`w-1 ${i > 4 && i < 8 ? 'bg-white' : 'bg-white/10'}`}
          animate={{
            height: isPlaying 
              ? [8, 48, 16] 
              : (i > 4 && i < 8 ? 12 : 4)
          }}
          transition={{
            duration: 0.5 + Math.random() * 0.5,
            repeat: Infinity,
            repeatType: "mirror",
            ease: "easeInOut",
            delay: i * 0.05
          }}
        />
      ))}
    </div>
  );
};

const AlbumArt = ({ track, size = "large" }: { track: Track | null, size?: "small" | "large" }) => {
  const isSmall = size === "small";
  
  return (
    <div className={`relative ${isSmall ? 'w-12 h-12' : 'w-64 h-64 md:w-80 md:h-80'} group`}>
      <div className={`w-full h-full bg-border-main border-2 border-[#2D2D2D] relative overflow-hidden flex items-center justify-center`}>
        <AnimatePresence mode="wait">
          {track?.coverUrl ? (
            <motion.img
              key={track.coverUrl}
              src={track.coverUrl}
              alt={track.name}
              className="w-full h-full object-cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          ) : (
            <motion.div 
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full flex flex-col items-center justify-center relative bg-bg-panel/40"
            >
              <MusicIcon size={isSmall ? 16 : 32} className="text-white/10" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const parseLRC = (lrc: string): LyricLine[] => {
  if (!lrc) return [];
  const lines = lrc.split('\n');
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d+):(\d+(?:\.\d+)?)\]/;

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseFloat(match[2]);
      const time = minutes * 60 + seconds;
      const text = line.replace(timeRegex, '').trim();
      if (text) {
        result.push({ time, text });
      }
    }
  }
  return result.sort((a, b) => a.time - b.time);
};

const LyricsDisplay = ({ track, currentTime, onSeek }: { track: Track | null, currentTime: number, onSeek: (time: number) => void }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLParagraphElement>(null);

  const parsedLyrics = useMemo(() => {
    if (!track?.lyrics) return [];
    const parsed = parseLRC(track.lyrics);
    // Fallback for non-timed lyrics: just return them as lines with time 0
    if (parsed.length === 0 && track.lyrics) {
      return track.lyrics.split('\n').map((text, i) => ({ time: -1, text: text.trim() }));
    }
    return parsed;
  }, [track?.lyrics]);

  const activeIndex = useMemo(() => {
    if (parsedLyrics.length === 0 || parsedLyrics[0].time === -1) return -1;
    const index = parsedLyrics.findLastIndex(line => line.time <= currentTime);
    return index;
  }, [parsedLyrics, currentTime]);

  useEffect(() => {
    if (activeLineRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const active = activeLineRef.current;
      
      const targetScroll = active.offsetTop - container.offsetHeight / 2 + active.offsetHeight / 2;
      
      container.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
      });
    }
  }, [activeIndex]);

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center relative p-2 md:p-4 overflow-hidden">
      <div className="w-full h-full bg-[#f2f2f2] rounded-[3rem] relative overflow-hidden flex flex-col shadow-inner">
        {/* Background Dot Grid for Lyrics Card */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
             style={{ 
               backgroundImage: 'radial-gradient(circle, black 1px, transparent 1px)', 
               backgroundSize: '24px 24px' 
             }}>
        </div>

        <AnimatePresence mode="wait">
          {!track ? (
            <motion.div 
              key="no-track"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full flex items-center justify-center text-center p-8 opacity-20"
            >
              <div className="space-y-2">
                <div className="text-2xl font-black tracking-widest text-black">AWAIT_STREAM</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-black/40">Searching neural network...</div>
              </div>
            </motion.div>
          ) : parsedLyrics.length > 0 ? (
            <motion.div
              key={`lyrics-${track.id}`}
              id="lyrics-container"
              ref={scrollRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full overflow-y-auto scrollbar-hide px-8 md:px-12 text-left space-y-6 pt-[20vh] pb-[20vh] relative z-10"
            >
              {parsedLyrics.map((line, i) => {
                const isActive = i === activeIndex;
                const isUntimed = line.time === -1;
                
                return (
                  <p 
                    key={i} 
                    ref={isActive ? activeLineRef : null}
                    onClick={() => !isUntimed && onSeek(line.time)}
                    className={`text-lg md:text-xl font-black leading-relaxed transition-all duration-300 cursor-pointer
                      ${isActive ? 'text-black' : 'text-black/10 hover:text-black/40'}
                      ${!line.text.trim() ? 'h-6' : ''}
                    `}
                  >
                    {line.text.trim() || ' '}
                  </p>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              key="not-found"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full flex items-center justify-center text-center opacity-10"
            >
              <div className="space-y-2">
                <div className="text-xl font-black uppercase tracking-widest">Metadata Missing</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Decorative Gradients for Lyrics Card */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#f2f2f2] to-transparent pointer-events-none z-20" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#f2f2f2] to-transparent pointer-events-none z-20" />
      </div>
    </div>
  );
};

const WaveformProgress: React.FC<{ 
  audioRef: React.RefObject<HTMLAudioElement | null>; 
  currentTime: number; 
  duration: number; 
  isPlaying: boolean; 
}> = ({ audioRef, currentTime, duration, isPlaying }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const barCount = 48;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !audioRef.current || duration === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const p = Math.max(0, Math.min(1, x / rect.width));
    audioRef.current.currentTime = p * duration;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setHoverProgress((x / rect.width) * 100);
  };

  return (
    <div 
      ref={containerRef}
      onClick={handleSeek}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverProgress(null)}
      className="relative w-full h-20 cursor-pointer flex items-center justify-between px-10 group"
    >
      <div className="absolute top-0 left-10 right-10 flex justify-between text-[10px] font-black text-black/20 uppercase tracking-widest mb-1">
        <span>{Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}</span>
        <span>{Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}</span>
      </div>

      <div className="flex items-center justify-between w-full h-12 gap-[3px]">
        {Array.from({ length: barCount }).map((_, i) => {
          const barProgress = (i / barCount) * 100;
          const isActive = barProgress <= progress;
          const isHovered = hoverProgress !== null && barProgress <= hoverProgress;
          
          // Generate an organic wave pattern
          const seed = i * 0.4;
          const waveHeight = isPlaying 
            ? Math.sin(Date.now() * 0.004 + seed) * 12 + 20
            : Math.sin(seed) * 6 + 16;

          return (
            <motion.div
              key={i}
              className={`flex-1 rounded-full transition-all duration-300 ${
                isActive ? 'bg-black' : isHovered ? 'bg-black/20' : 'bg-black/5'
              }`}
              animate={{ 
                height: waveHeight,
                opacity: isActive ? 1 : isHovered ? 0.6 : 0.3
              }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>('sequential');
  const [showQueue, setShowQueue] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentIndex = useMemo(() => tracks.findIndex(t => t.id === currentTrackId), [tracks, currentTrackId]);
  const currentTrack = tracks[currentIndex] || null;

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    return tracks.filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.artist.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [tracks, searchQuery]);

  // Audio effects
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (isPlaying) {
      audioRef.current?.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current?.pause();
    }
  }, [isPlaying, currentIndex]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newTracksPromises = Array.from(files).map(async (file: File) => {
      let coverUrl: string | undefined;
      let lyrics: string | undefined;
      let artist = "Unknown Artist";
      let album = "Unknown Album";
      let name = file.name.replace(/\.[^/.]+$/, "");

      try {
        const metadata = await mm.parseBlob(file);
        if (metadata.common.artist) artist = metadata.common.artist;
        if (metadata.common.album) album = metadata.common.album;
        if (metadata.common.title) name = metadata.common.title;

        // Extract embedded lyrics
        if (metadata.common.lyrics && metadata.common.lyrics.length > 0) {
          lyrics = metadata.common.lyrics.join('\n');
        }

        const picture = metadata.common.picture?.[0];
        if (picture) {
          const blob = new Blob([picture.data], { type: picture.format });
          coverUrl = URL.createObjectURL(blob);
        }
      } catch (err) {
        console.error("Error parsing metadata:", err);
      }

      return {
        id: Math.random().toString(36).substr(2, 9),
        name,
        artist,
        album,
        url: URL.createObjectURL(file),
        file,
        coverUrl,
        lyrics
      };
    });

    const resolvedTracks = await Promise.all(newTracksPromises);
    setTracks(prev => [...prev, ...resolvedTracks]);
    if (!currentTrackId && resolvedTracks.length > 0) setCurrentTrackId(resolvedTracks[0].id);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      const p = (cur / audioRef.current.duration) * 100;
      setCurrentTime(cur);
      setProgress(isNaN(p) ? 0 : p);
    }
  };

  const handleTrackEnd = () => {
    if (playMode === 'repeat-one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      skipForward();
    }
  };

  const togglePlayMode = () => {
    setPlayMode(prev => {
      if (prev === 'sequential') return 'shuffle';
      if (prev === 'shuffle') return 'repeat-one';
      return 'sequential';
    });
  };

  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      if (!isPlaying) {
        setIsPlaying(true);
      }
    }
  };

  const togglePlay = () => setIsPlaying(!isPlaying);
  
  const skipForward = () => {
    if (tracks.length === 0) return;
    
    if (playMode === 'shuffle' && tracks.length > 1) {
      let nextIdx = currentIndex;
      while (nextIdx === currentIndex) {
        nextIdx = Math.floor(Math.random() * tracks.length);
      }
      setCurrentTrackId(tracks[nextIdx].id);
    } else {
      const nextIdx = (currentIndex + 1) % tracks.length;
      setCurrentTrackId(tracks[nextIdx].id);
    }
    setIsPlaying(true);
  };

  const skipBackward = () => {
    if (currentIndex > 0) {
      setCurrentTrackId(tracks[currentIndex - 1].id);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const removeTrack = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    if (id === currentTrackId) {
      setIsPlaying(false);
      setCurrentTrackId(null);
    }
    setTracks(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="h-screen bg-bg-deep flex items-center justify-center p-4 overflow-hidden">
      <div className="flex items-start gap-4 h-full max-h-[900px] w-full max-w-6xl transition-all duration-500">
        
        {/* MAIN PLAYER WINDOW */}
        <div className="h-full flex flex-col bg-black select-none overflow-hidden w-full max-w-md relative border-2 border-white/5 shadow-2xl rounded-xl">
          <audio 
            ref={audioRef}
            src={currentTrack?.url}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleTrackEnd}
          />

          {/* HEADER: PIXEL CLOCK (BLACK SECTION) */}
          <section className="flex-shrink-0 h-44">
            <PixelClock audioRef={audioRef} isPlaying={isPlaying} />
          </section>

          {/* WHITE SHEET: MAIN CONTENT + CONTROLS */}
          <div className="flex-1 bg-white rounded-t-[2.5rem] flex flex-col relative overflow-hidden">
            {/* Song Info (Part of White Sheet) */}
            <div className="px-10 pt-8 pb-2 flex justify-between items-start">
              <div className="min-w-0 flex-1">
                <h1 className="text-3xl font-black text-black tracking-tight leading-tight uppercase truncate">
                  {currentTrack?.name || "AWAIT_STREAM"}
                </h1>
                <p className="text-base font-bold text-black/30 mt-0.5 uppercase">
                  {currentTrack?.artist || "READY_FOR_UPLOAD"}
                </p>
              </div>
              <AlbumArt track={currentTrack} size="small" />
            </div>

            {/* Lyrics Area (The Gray Card) */}
            <main className="flex-1 overflow-hidden relative flex flex-col mx-4 my-2">
              <LyricsDisplay track={currentTrack} currentTime={currentTime} onSeek={handleSeek} />
            </main>

            {/* Playback Progress (Wavy Bar) */}
            <div className="py-2">
              <WaveformProgress 
                audioRef={audioRef} 
                currentTime={currentTime} 
                duration={audioRef.current?.duration || 0} 
                isPlaying={isPlaying} 
              />
            </div>

            {/* Controls Bar */}
            <div className="px-10 pb-8 pt-2 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                  <button onClick={skipBackward} disabled={currentIndex <= 0} className="text-black/40 hover:text-black transition-all">
                    <SkipBack size={20} fill="currentColor" />
                  </button>
                  <button 
                    onClick={togglePlay}
                    className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center flex-shrink-0 hover:scale-105 transition-all shadow-lg"
                  >
                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                  </button>
                  <button onClick={skipForward} disabled={currentIndex >= tracks.length - 1} className="text-black/40 hover:text-black transition-all">
                    <SkipForward size={20} fill="currentColor" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <button 
                  onClick={togglePlayMode}
                  className={`p-2 transition-all ${playMode !== 'sequential' ? 'text-black' : 'text-black/20 hover:text-black'}`}
                >
                  {playMode === 'sequential' && <Repeat size={18} />}
                  {playMode === 'shuffle' && <Shuffle size={18} />}
                  {playMode === 'repeat-one' && <Repeat1 size={18} />}
                </button>

                <button 
                  onClick={() => setShowQueue(!showQueue)}
                  className={`p-2 transition-colors ${showQueue ? 'text-black' : 'text-black/20 hover:text-black'}`}
                >
                  <ListMusic size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SIDE PANELS (NEW WINDOWS) */}
        <AnimatePresence>
          {showQueue && (
            <motion.div 
              initial={{ opacity: 0, x: -20, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 340 }}
              exit={{ opacity: 0, x: -20, width: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="h-full bg-white flex flex-col border-2 border-black/5 hidden md:flex overflow-hidden rounded-xl shadow-xl"
            >
              <div className="flex flex-col h-full w-[340px]">
                <div className="p-8 flex flex-col border-b border-black/5 gap-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-black/40">Queue</h2>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => {
                          setIsSearching(!isSearching);
                          if (isSearching) setSearchQuery('');
                        }} 
                        className={`transition-colors ${isSearching ? 'text-black' : 'text-black/20 hover:text-black'}`}
                      >
                        <Search size={20} />
                      </button>
                      <button 
                        onClick={() => fileInputRef.current?.click()} 
                        className="text-black/20 hover:text-black transition-colors"
                      >
                        <Plus size={22} />
                      </button>
                    </div>
                  </div>
                  
                  <AnimatePresence>
                    {isSearching && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <input 
                          type="text"
                          autoFocus
                          placeholder="SEARCH..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-black/5 border border-black/10 px-4 py-3 text-[11px] font-mono text-black placeholder:text-black/10 focus:outline-none focus:border-black/30 uppercase rounded-xl"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <Reorder.Group 
                  axis="y" 
                  values={tracks} 
                  onReorder={setTracks}
                  className="flex-1 overflow-y-auto scrollbar-hide py-4"
                >
                  {filteredTracks.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[10px] font-mono text-black/5 uppercase tracking-[0.4em]">{searchQuery ? 'NO_MATCHES' : 'EMPTY'}</div>
                  ) : (
                    filteredTracks.map((track) => (
                      <Reorder.Item 
                        key={track.id} value={track}
                        onClick={() => { setCurrentTrackId(track.id); setIsPlaying(true); }}
                        className={`group flex items-center gap-5 p-6 mb-1 transition-all cursor-pointer border-l-4 ${
                          currentTrackId === track.id ? 'bg-black/5 border-black shadow-inner' : 'hover:bg-black/2 border-transparent'
                        }`}
                      >
                        <div className="w-14 h-14 bg-black/5 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-black/5 shadow-lg">
                          {track.coverUrl ? <img src={track.coverUrl} className="w-full h-full object-cover" /> : <MusicIcon size={24} className="text-black/5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-bold truncate uppercase tracking-tight ${currentTrackId === track.id ? 'text-black' : 'text-black/40'}`}>{track.name}</p>
                          <p className="text-[10px] font-mono text-black/20 uppercase tracking-widest">{track.artist}</p>
                        </div>
                        <button onClick={(e) => removeTrack(track.id, e)} className="p-2 text-black/10 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                          <Trash2 size={16} />
                        </button>
                      </Reorder.Item>
                    ))
                  )}
                </Reorder.Group>
                <div className="p-8 border-t border-black/5 bg-black/2">
                  <div className="flex justify-between items-center text-[10px] font-mono text-black/20 uppercase tracking-widest">
                    <span>{tracks.length} Tracks</span>
                    <span className="text-black font-black group-hover:animate-pulse">Active</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      <input 
        ref={fileInputRef}
        type="file" 
        multiple 
        accept="audio/*" 
        className="hidden" 
        onChange={handleFileChange}
      />
    </div>
  );
}
