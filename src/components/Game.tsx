import React, { useEffect, useRef, useState } from 'react';
import { 
  CANVAS_WIDTH, 
  CANVAS_HEIGHT, 
  PLAYER_SIZE, 
  PLATFORM_WIDTH, 
  PLATFORM_HEIGHT, 
  GEM_SIZE, 
  GRAVITY, 
  JUMP_FORCE, 
  SUPER_BOUNCE_FORCE,
  MOVE_SPEED, 
  MIN_PLATFORM_GAP_Y,
  MAX_PLATFORM_GAP_Y,
  COLORS 
} from '../constants';
import { Player, Platform, PlatformType, Particle, GameState } from '../types';
import { audioManager } from '../audio';
import { Trophy, Play, RotateCcw, ArrowLeft, ArrowRight, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [altitudeMeters, setAltitudeMeters] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('neon-jumper-highscore');
    return saved ? parseInt(saved, 10) : 0;
  });

  const playerRef = useRef<Player>({
    x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
    y: CANVAS_HEIGHT - 100,
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    vx: 0,
    vy: 0,
    color: COLORS.PLAYER,
    glowColor: COLORS.PLAYER_GLOW,
    isGrounded: false,
    rotation: 0,
  });

  const platformsRef = useRef<Platform[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<{ x: number; y: number; size: number; alpha: number; speed: number }[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const cameraYRef = useRef(0);
  const targetCameraYRef = useRef(0);
  const requestRef = useRef<number | null>(null);
  const tickRef = useRef(0);
  const highestAltitudeRef = useRef(0);

  // Initialize background starfield for vertical ascendance
  const initStars = () => {
    const stars = [];
    for (let i = 0; i < 45; i++) {
      stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT * 2 - CANVAS_HEIGHT,
        size: Math.random() * 2 + 0.8,
        alpha: Math.random() * 0.7 + 0.2,
        speed: Math.random() * 0.5 + 0.2,
      });
    }
    starsRef.current = stars;
  };

  // Platform Generator for infinite ascending gameplay
  const generatePlatformAtY = (y: number, altitude: number, prevX?: number): Platform => {
    const rand = Math.random();
    let type: PlatformType = 'STANDARD';
    let color = COLORS.PLATFORM_STANDARD;
    let glowColor = COLORS.PLATFORM_STANDARD_GLOW;
    let vx = 0;
    
    // Dynamic difficulty distribution based on altitude ascended
    if (altitude > 1500) {
      if (rand < 0.35) {
        type = 'STANDARD';
      } else if (rand < 0.65) {
        type = 'MOVING';
        color = COLORS.PLATFORM_MOVING;
        glowColor = COLORS.PLATFORM_MOVING_GLOW;
        vx = (Math.random() > 0.5 ? 1 : -1) * (1.8 + Math.random() * 1.2);
      } else if (rand < 0.82) {
        type = 'FRAGILE';
        color = COLORS.PLATFORM_FRAGILE;
        glowColor = COLORS.PLATFORM_FRAGILE_GLOW;
      } else {
        type = 'BOUNCY';
        color = COLORS.PLATFORM_BOUNCY;
        glowColor = COLORS.PLATFORM_BOUNCY_GLOW;
      }
    } else if (altitude > 500) {
      if (rand < 0.5) {
        type = 'STANDARD';
      } else if (rand < 0.75) {
        type = 'MOVING';
        color = COLORS.PLATFORM_MOVING;
        glowColor = COLORS.PLATFORM_MOVING_GLOW;
        vx = (Math.random() > 0.5 ? 1 : -1) * (1.2 + Math.random() * 1.0);
      } else if (rand < 0.9) {
        type = 'BOUNCY';
        color = COLORS.PLATFORM_BOUNCY;
        glowColor = COLORS.PLATFORM_BOUNCY_GLOW;
      } else {
        type = 'FRAGILE';
        color = COLORS.PLATFORM_FRAGILE;
        glowColor = COLORS.PLATFORM_FRAGILE_GLOW;
      }
    } else {
      // Starting tiers
      if (rand < 0.65) {
        type = 'STANDARD';
      } else if (rand < 0.85) {
        type = 'MOVING';
        color = COLORS.PLATFORM_MOVING;
        glowColor = COLORS.PLATFORM_MOVING_GLOW;
        vx = (Math.random() > 0.5 ? 1 : -1) * 1.2;
      } else {
        type = 'BOUNCY';
        color = COLORS.PLATFORM_BOUNCY;
        glowColor = COLORS.PLATFORM_BOUNCY_GLOW;
      }
    }

    // Varied platform widths that stay fair and reachable
    const width = Math.max(56, PLATFORM_WIDTH - (type === 'FRAGILE' ? 10 : 0));
    
    // Choose horizontal position, ensuring good variety
    let x: number;
    if (prevX !== undefined) {
      // Alternate sides or jump spread
      const offset = (Math.random() * 200 - 100);
      x = Math.max(10, Math.min(CANVAS_WIDTH - width - 10, prevX + offset));
    } else {
      x = 10 + Math.random() * (CANVAS_WIDTH - width - 20);
    }

    // Floating gem chance on sturdy platforms
    const hasGem = type !== 'FRAGILE' && Math.random() < 0.35;

    return {
      x,
      y,
      width,
      height: PLATFORM_HEIGHT,
      color,
      glowColor,
      type,
      vx,
      minX: 8,
      maxX: CANVAS_WIDTH - width - 8,
      hasGem,
      gemCollected: false,
      broken: false,
      breakingTimer: 0,
      floatOffset: Math.random() * Math.PI * 2,
      floatSpeed: 0.03 + Math.random() * 0.02,
    };
  };

  const spawnParticles = (x: number, y: number, color: string, glowColor: string, count: number, speedMult = 1) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 3 + 1) * speedMult;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3 + 1.5,
        color,
        glowColor,
        alpha: 1,
        life: 0,
        maxLife: 20 + Math.random() * 20,
      });
    }
  };

  const initGame = () => {
    playerRef.current = {
      x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
      y: CANVAS_HEIGHT - 120,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      vx: 0,
      vy: 0,
      color: COLORS.PLAYER,
      glowColor: COLORS.PLAYER_GLOW,
      isGrounded: false,
      rotation: 0,
    };

    const initialPlatforms: Platform[] = [];
    
    // Solid initial starting base platform directly under red triangle
    initialPlatforms.push({
      x: CANVAS_WIDTH / 2 - 60,
      y: CANVAS_HEIGHT - 60,
      width: 120,
      height: PLATFORM_HEIGHT,
      color: COLORS.PLATFORM_STANDARD,
      glowColor: COLORS.PLATFORM_STANDARD_GLOW,
      type: 'STANDARD',
      hasGem: false,
      gemCollected: false,
      floatOffset: 0,
      floatSpeed: 0.02,
    });

    // Generate ascending staircase of floating platforms to start the ascent
    let currentY = CANVAS_HEIGHT - 60;
    let prevX = CANVAS_WIDTH / 2 - 60;
    for (let i = 1; i <= 10; i++) {
      const gap = MIN_PLATFORM_GAP_Y + Math.random() * (MAX_PLATFORM_GAP_Y - MIN_PLATFORM_GAP_Y);
      currentY -= gap;
      const platform = generatePlatformAtY(currentY, 0, prevX);
      prevX = platform.x;
      initialPlatforms.push(platform);
    }

    platformsRef.current = initialPlatforms;
    particlesRef.current = [];
    cameraYRef.current = 0;
    targetCameraYRef.current = 0;
    highestAltitudeRef.current = 0;
    tickRef.current = 0;
    setScore(0);
    setAltitudeMeters(0);
    initStars();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    keysRef.current[e.code] = true;
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    keysRef.current[e.code] = false;
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const update = () => {
    if (gameState !== 'PLAYING') return;

    tickRef.current += 1;
    const player = playerRef.current;

    // Horizontal steering
    if (keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) {
      player.vx = -MOVE_SPEED;
    } else if (keysRef.current['ArrowRight'] || keysRef.current['KeyD']) {
      player.vx = MOVE_SPEED;
    } else {
      player.vx *= 0.82; // Inertial friction
    }

    player.x += player.vx;
    // Aerodynamic tilt for the red triangle
    player.rotation = (player.vx / MOVE_SPEED) * 0.25;

    // Screen wrapping left/right
    if (player.x + player.width < 0) player.x = CANVAS_WIDTH;
    if (player.x > CANVAS_WIDTH) player.x = -player.width;

    // Vertical physics
    player.vy += GRAVITY;
    player.y += player.vy;

    // Red Triangle Thruster sparks during upward movement
    if (player.vy < -2 && Math.random() < 0.6) {
      particlesRef.current.push({
        x: player.x + player.width / 2 + (Math.random() * 6 - 3),
        y: player.y + player.height,
        vx: (Math.random() - 0.5) * 1.5 - player.vx * 0.2,
        vy: Math.random() * 2 + 1,
        size: Math.random() * 2.5 + 1,
        color: '#ff5533',
        glowColor: 'rgba(255, 85, 51, 0.8)',
        alpha: 0.9,
        life: 0,
        maxLife: 15,
      });
    }

    // Update floating platforms (movement, bobbing, breaking timer)
    platformsRef.current.forEach((platform) => {
      // Horizontal movement for moving platforms
      if (platform.type === 'MOVING' && platform.vx) {
        platform.x += platform.vx;
        if (platform.minX !== undefined && platform.maxX !== undefined) {
          if (platform.x <= platform.minX) {
            platform.x = platform.minX;
            platform.vx = Math.abs(platform.vx);
          } else if (platform.x >= platform.maxX) {
            platform.x = platform.maxX;
            platform.vx = -Math.abs(platform.vx);
          }
        }
      }

      // Handle breaking fragile platforms
      if (platform.type === 'FRAGILE' && platform.breakingTimer && platform.breakingTimer > 0) {
        platform.breakingTimer += 1;
        if (platform.breakingTimer > 14) {
          platform.broken = true;
          spawnParticles(platform.x + platform.width / 2, platform.y, COLORS.PLATFORM_FRAGILE, COLORS.PLATFORM_FRAGILE_GLOW, 8);
        }
      }
    });

    // Collision detection with floating platforms (when falling down)
    player.isGrounded = false;
    platformsRef.current.forEach((platform) => {
      if (platform.broken) return;

      const floatY = platform.y + (platform.floatOffset !== undefined ? Math.sin(tickRef.current * (platform.floatSpeed || 0.03) + platform.floatOffset) * 2 : 0);

      // Check collision only when descending
      if (player.vy > 0) {
        const playerBottom = player.y + player.height;
        const prevPlayerBottom = playerBottom - player.vy;
        
        if (
          player.x + player.width > platform.x &&
          player.x < platform.x + platform.width &&
          playerBottom >= floatY &&
          prevPlayerBottom <= floatY + platform.height + 4
        ) {
          player.y = floatY - player.height;
          player.isGrounded = true;

          // Platform Type Interaction
          if (platform.type === 'BOUNCY') {
            // Super Spring Launch!
            player.vy = SUPER_BOUNCE_FORCE;
            player.isGrounded = false;
            audioManager.playSpring();
            spawnParticles(player.x + player.width / 2, floatY, COLORS.PLATFORM_BOUNCY, COLORS.PLATFORM_BOUNCY_GLOW, 12, 1.5);
          } else if (platform.type === 'FRAGILE') {
            // Fragile platform bounce and begin breaking
            player.vy = JUMP_FORCE;
            player.isGrounded = false;
            audioManager.playCrack();
            if (!platform.breakingTimer) {
              platform.breakingTimer = 1;
            }
            spawnParticles(player.x + player.width / 2, floatY, COLORS.PLATFORM_FRAGILE, COLORS.PLATFORM_FRAGILE_GLOW, 6);
          } else {
            // Standard / Moving auto bounce
            player.vy = JUMP_FORCE;
            player.isGrounded = false;
            audioManager.playJump();
            spawnParticles(player.x + player.width / 2, floatY, platform.color, platform.glowColor, 5);
          }
        }
      }

      // Gem collection hovering on platform
      if (platform.hasGem && !platform.gemCollected && !platform.broken) {
        const gemX = platform.x + platform.width / 2 - GEM_SIZE / 2;
        const gemY = floatY - GEM_SIZE - 6 + Math.sin(tickRef.current * 0.08) * 3;
        if (
          player.x < gemX + GEM_SIZE &&
          player.x + player.width > gemX &&
          player.y < gemY + GEM_SIZE &&
          player.y + player.height > gemY
        ) {
          platform.gemCollected = true;
          setScore((s) => s + 25);
          audioManager.playGem();
          spawnParticles(gemX + GEM_SIZE / 2, gemY + GEM_SIZE / 2, COLORS.GEM, COLORS.GEM_GLOW, 14, 1.2);
        }
      }
    });

    // Manual jump boost if key pressed
    if ((keysRef.current['Space'] || keysRef.current['ArrowUp'] || keysRef.current['KeyW']) && player.isGrounded) {
      player.vy = JUMP_FORCE;
      player.isGrounded = false;
      audioManager.playJump();
    }

    // Camera follow (Ascending infinite camera)
    const cameraThreshold = cameraYRef.current + CANVAS_HEIGHT * 0.45;
    if (player.y < cameraThreshold) {
      targetCameraYRef.current = player.y - CANVAS_HEIGHT * 0.45;
    }
    // Smooth camera interpolation
    cameraYRef.current += (targetCameraYRef.current - cameraYRef.current) * 0.2;

    // Track ascent altitude & score
    const currentAltitude = Math.max(0, Math.floor(-cameraYRef.current / 8));
    if (currentAltitude > highestAltitudeRef.current) {
      highestAltitudeRef.current = currentAltitude;
      setAltitudeMeters(currentAltitude);
      setScore((prev) => Math.max(prev, currentAltitude));
    }

    // Spawn new floating platforms ahead as red triangle ascends
    const platforms = platformsRef.current;
    const topPlatform = platforms[platforms.length - 1];
    if (topPlatform && topPlatform.y > cameraYRef.current - 250) {
      const gap = MIN_PLATFORM_GAP_Y + Math.random() * (MAX_PLATFORM_GAP_Y - MIN_PLATFORM_GAP_Y);
      const nextY = topPlatform.y - gap;
      const newPlatform = generatePlatformAtY(nextY, currentAltitude, topPlatform.x);
      platforms.push(newPlatform);
    }

    // Remove old platforms below camera viewport to keep performance pristine
    if (platforms.length > 0 && platforms[0].y > cameraYRef.current + CANVAS_HEIGHT + 120) {
      platforms.shift();
    }

    // Update Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life += 1;
      p.alpha = 1 - p.life / p.maxLife;
      if (p.life >= p.maxLife) {
        particlesRef.current.splice(i, 1);
      }
    }

    // Game Over condition (falling below camera viewport)
    if (player.y > cameraYRef.current + CANVAS_HEIGHT + 40) {
      setGameState('GAMEOVER');
      audioManager.playGameOver();
      if (score > highScore) {
        setHighScore(score);
        localStorage.setItem('neon-jumper-highscore', score.toString());
      }
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw background ascending starfield & grid lines
    ctx.save();
    starsRef.current.forEach((star) => {
      const screenY = (star.y - cameraYRef.current * star.speed) % CANVAS_HEIGHT;
      const renderY = screenY < 0 ? screenY + CANVAS_HEIGHT : screenY;
      ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
      ctx.fillRect(star.x, renderY, star.size, star.size);
    });

    // Subtle neon ascension grid lines in background
    ctx.strokeStyle = 'rgba(255, 0, 127, 0.04)';
    ctx.lineWidth = 1;
    const gridOffset = (-cameraYRef.current * 0.5) % 40;
    for (let y = gridOffset; y < CANVAS_HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(0, -cameraYRef.current);

    // Draw Floating Platforms
    platformsRef.current.forEach((platform) => {
      if (platform.broken) return;

      const floatY = platform.y + (platform.floatOffset !== undefined ? Math.sin(tickRef.current * (platform.floatSpeed || 0.03) + platform.floatOffset) * 2 : 0);

      ctx.save();
      
      // Floating Platform Body with Neon Glow
      ctx.shadowBlur = 16;
      ctx.shadowColor = platform.glowColor;
      ctx.fillStyle = platform.color;

      // Render platform rounded pill bar
      const r = 5;
      ctx.beginPath();
      ctx.moveTo(platform.x + r, floatY);
      ctx.lineTo(platform.x + platform.width - r, floatY);
      ctx.quadraticCurveTo(platform.x + platform.width, floatY, platform.x + platform.width, floatY + r);
      ctx.lineTo(platform.x + platform.width, floatY + platform.height - r);
      ctx.quadraticCurveTo(platform.x + platform.width, floatY + platform.height, platform.x + platform.width - r, floatY + platform.height);
      ctx.lineTo(platform.x + r, floatY + platform.height);
      ctx.quadraticCurveTo(platform.x, floatY + platform.height, platform.x, floatY + platform.height - r);
      ctx.lineTo(platform.x, floatY + r);
      ctx.quadraticCurveTo(platform.x, floatY, platform.x + r, floatY);
      ctx.closePath();
      ctx.fill();

      // Platform Inner Highlighting
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(platform.x + 6, floatY + 2, platform.width - 12, 3);

      // Special Floating Platform Type Visual Accents
      if (platform.type === 'BOUNCY') {
        // Glowing Super Bounce Spring Indicator
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00ff66';
        ctx.shadowBlur = 10;
        const springX = platform.x + platform.width / 2;
        ctx.beginPath();
        ctx.moveTo(springX - 7, floatY + platform.height);
        ctx.lineTo(springX, floatY - 4);
        ctx.lineTo(springX + 7, floatY + platform.height);
        ctx.closePath();
        ctx.fill();
      } else if (platform.type === 'MOVING') {
        // Side directional chevrons for moving platform
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillRect(platform.x + 3, floatY + 4, 3, platform.height - 8);
        ctx.fillRect(platform.x + platform.width - 6, floatY + 4, 3, platform.height - 8);
      } else if (platform.type === 'FRAGILE') {
        // Crack lines on fragile platforms
        ctx.strokeStyle = '#220000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(platform.x + platform.width * 0.3, floatY);
        ctx.lineTo(platform.x + platform.width * 0.45, floatY + platform.height);
        ctx.moveTo(platform.x + platform.width * 0.7, floatY);
        ctx.lineTo(platform.x + platform.width * 0.6, floatY + platform.height);
        ctx.stroke();
      }

      // Draw Floating Gems
      if (platform.hasGem && !platform.gemCollected) {
        const gemX = platform.x + platform.width / 2 - GEM_SIZE / 2;
        const gemY = floatY - GEM_SIZE - 6 + Math.sin(tickRef.current * 0.08) * 3;
        
        ctx.shadowBlur = 18;
        ctx.shadowColor = COLORS.GEM_GLOW;
        ctx.fillStyle = COLORS.GEM;
        
        ctx.beginPath();
        ctx.moveTo(gemX + GEM_SIZE / 2, gemY);
        ctx.lineTo(gemX + GEM_SIZE, gemY + GEM_SIZE / 2);
        ctx.lineTo(gemX + GEM_SIZE / 2, gemY + GEM_SIZE);
        ctx.lineTo(gemX, gemY + GEM_SIZE / 2);
        ctx.closePath();
        ctx.fill();

        // Gem inner highlight
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(gemX + GEM_SIZE / 2 - 1.5, gemY + 3, 3, 3);
      }

      ctx.restore();
    });

    // Draw Particles
    particlesRef.current.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.glowColor;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Draw Player: The Glowing Red Triangle
    const player = playerRef.current;
    ctx.save();
    ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
    if (player.rotation) {
      ctx.rotate(player.rotation);
    }
    
    // Outer Neon Glow for Red Triangle
    ctx.shadowBlur = 22;
    ctx.shadowColor = player.glowColor;
    ctx.fillStyle = player.color;
    
    const halfW = player.width / 2;
    const halfH = player.height / 2;

    // Upward-pointing aerodynamic Red Triangle
    ctx.beginPath();
    ctx.moveTo(0, -halfH); // Top apex
    ctx.lineTo(halfW, halfH); // Bottom right
    ctx.lineTo(0, halfH - 4); // Bottom center aerodynamic notch
    ctx.lineTo(-halfW, halfH); // Bottom left
    ctx.closePath();
    ctx.fill();

    // Inner bright core highlight
    ctx.fillStyle = 'rgba(255, 180, 190, 0.7)';
    ctx.beginPath();
    ctx.moveTo(0, -halfH + 6);
    ctx.lineTo(halfW - 6, halfH - 2);
    ctx.lineTo(0, halfH - 6);
    ctx.lineTo(-halfW + 6, halfH - 2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.restore();
  };

  const loop = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      update();
      draw(ctx);
    }
    requestRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState]);

  const startGame = () => {
    initGame();
    setGameState('PLAYING');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 select-none">
      <div className="relative group">
        {/* Ambient Neon Outer Glow Frame */}
        <div className="absolute -inset-1 bg-gradient-to-r from-red-600 via-purple-600 to-pink-500 rounded-2xl blur-md opacity-30 group-hover:opacity-60 transition duration-700"></div>
        
        <div className="relative bg-[#08080c] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="block"
          />

          {/* Top HUD: Score, Altitude & High Score */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="font-mono text-sm font-bold text-white tracking-wider">{score}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full border border-white/5 w-fit">
                <Zap className="w-3 h-3 text-cyan-400" />
                <span className="font-mono text-[11px] font-semibold text-cyan-300">{altitudeMeters}m</span>
              </div>
            </div>
            
            <div className="bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10">
              <span className="font-mono text-[11px] uppercase tracking-wider text-gray-400">BEST <span className="text-white font-bold">{highScore}</span></span>
            </div>
          </div>

          {/* Touch / Mouse On-Screen Controls for Ascending */}
          {gameState === 'PLAYING' && (
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-auto sm:hidden">
              <button
                onTouchStart={() => { keysRef.current['ArrowLeft'] = true; }}
                onTouchEnd={() => { keysRef.current['ArrowLeft'] = false; }}
                onMouseDown={() => { keysRef.current['ArrowLeft'] = true; }}
                onMouseUp={() => { keysRef.current['ArrowLeft'] = false; }}
                className="w-14 h-14 rounded-full bg-white/10 active:bg-white/30 backdrop-blur-md border border-white/20 flex items-center justify-center text-white"
                aria-label="Steer Left"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>

              <button
                onTouchStart={() => { keysRef.current['ArrowRight'] = true; }}
                onTouchEnd={() => { keysRef.current['ArrowRight'] = false; }}
                onMouseDown={() => { keysRef.current['ArrowRight'] = true; }}
                onMouseUp={() => { keysRef.current['ArrowRight'] = false; }}
                className="w-14 h-14 rounded-full bg-white/10 active:bg-white/30 backdrop-blur-md border border-white/20 flex items-center justify-center text-white"
                aria-label="Steer Right"
              >
                <ArrowRight className="w-6 h-6" />
              </button>
            </div>
          )}

          {/* Start and Game Over Overlays */}
          <AnimatePresence>
            {gameState === 'START' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-8 text-center"
              >
                {/* Red Triangle Mascot Preview */}
                <motion.div 
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  className="mb-4"
                >
                  <div className="w-0 h-0 border-l-[22px] border-l-transparent border-r-[22px] border-r-transparent border-b-[38px] border-b-[#ff2a4b] filter drop-shadow-[0_0_15px_rgba(255,42,75,0.9)]"></div>
                </motion.div>

                <motion.h1 
                  initial={{ y: -20 }}
                  animate={{ y: 0 }}
                  className="text-4xl font-black mb-1 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-pink-400 to-purple-400"
                >
                  NEON ASCENT
                </motion.h1>
                <p className="text-gray-400 mb-6 text-xs uppercase tracking-[0.25em]">Infinite Platform Jumper</p>
                
                <div className="space-y-4 w-full max-w-xs">
                  <button
                    onClick={startGame}
                    className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-red-500 to-pink-500 text-white font-bold py-3.5 rounded-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,42,75,0.4)]"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    ASCEND NOW
                  </button>
                  
                  {/* Controls / Platform Info Cards */}
                  <div className="grid grid-cols-2 gap-2 text-left">
                    <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl text-[10px] uppercase tracking-wider text-gray-400">
                      <span className="text-gray-500 block">Controls</span>
                      <span className="text-white font-medium">A / D or Arrows</span>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl text-[10px] uppercase tracking-wider text-gray-400">
                      <span className="text-green-400 block font-semibold">Green Platforms</span>
                      <span className="text-white font-medium">Super Springs</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {gameState === 'GAMEOVER' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl p-8 text-center"
              >
                <div className="mb-5">
                  <div className="text-red-500 text-[11px] font-bold uppercase tracking-[0.3em] mb-1">Descent Detected</div>
                  <h2 className="text-4xl font-black text-white tracking-tight">GAME OVER</h2>
                </div>

                <div className="flex flex-col items-center gap-3 mb-6 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 w-full max-w-xs">
                  <div>
                    <div className="text-gray-400 text-[10px] uppercase tracking-widest">Altitude Reached</div>
                    <div className="text-3xl font-mono font-bold text-cyan-400">{altitudeMeters}m</div>
                  </div>
                  <div className="text-xs font-mono text-gray-300">Total Score: <span className="text-yellow-400 font-bold">{score}</span></div>
                  {score >= highScore && score > 0 && (
                    <motion.div 
                      initial={{ y: 5, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="bg-yellow-400/20 border border-yellow-400/30 text-yellow-300 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mt-1"
                    >
                      New Personal Best!
                    </motion.div>
                  )}
                </div>

                <button
                  onClick={startGame}
                  className="flex items-center gap-2.5 bg-gradient-to-r from-red-500 to-pink-500 text-white font-bold px-7 py-3.5 rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,42,75,0.4)]"
                >
                  <RotateCcw className="w-4 h-4" />
                  TRY AGAIN
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Instructions / Legend */}
      <div className="mt-6 text-center max-w-md">
        <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-gray-400">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#ff007f] shadow-[0_0_8px_#ff007f]"></span> Standard</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#00e5ff] shadow-[0_0_8px_#00e5ff]"></span> Moving</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#00ff66] shadow-[0_0_8px_#00ff66]"></span> Super Spring</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#ff9900] shadow-[0_0_8px_#ff9900]"></span> Fragile</span>
        </div>
      </div>
    </div>
  );
};

export default Game;

