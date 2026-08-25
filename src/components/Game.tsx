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
  MOVE_SPEED, 
  COLORS 
} from '../constants';
import { Player, Platform, GameState } from '../types';
import { audioManager } from '../audio';
import { Trophy, Play, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
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
  });

  const platformsRef = useRef<Platform[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const cameraYRef = useRef(0);
  const requestRef = useRef<number>(null);

  const initGame = () => {
    playerRef.current = {
      x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
      y: CANVAS_HEIGHT - 100,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      vx: 0,
      vy: 0,
      color: COLORS.PLAYER,
      glowColor: COLORS.PLAYER_GLOW,
      isGrounded: false,
    };

    const initialPlatforms: Platform[] = [];
    // Starting platform
    initialPlatforms.push({
      x: CANVAS_WIDTH / 2 - PLATFORM_WIDTH / 2,
      y: CANVAS_HEIGHT - 50,
      width: PLATFORM_WIDTH,
      height: PLATFORM_HEIGHT,
      color: COLORS.PLATFORM,
      glowColor: COLORS.PLATFORM_GLOW,
      hasGem: false,
      gemCollected: false,
    });

    // Generate initial set of platforms
    for (let i = 1; i < 10; i++) {
      initialPlatforms.push(generatePlatform(CANVAS_HEIGHT - 50 - i * 100));
    }

    platformsRef.current = initialPlatforms;
    cameraYRef.current = 0;
    setScore(0);
  };

  const generatePlatform = (y: number): Platform => {
    const x = Math.random() * (CANVAS_WIDTH - PLATFORM_WIDTH);
    const hasGem = Math.random() > 0.7;
    return {
      x,
      y,
      width: PLATFORM_WIDTH,
      height: PLATFORM_HEIGHT,
      color: COLORS.PLATFORM,
      glowColor: COLORS.PLATFORM_GLOW,
      hasGem,
      gemCollected: false,
    };
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

    const player = playerRef.current;

    // Horizontal movement
    if (keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) {
      player.vx = -MOVE_SPEED;
    } else if (keysRef.current['ArrowRight'] || keysRef.current['KeyD']) {
      player.vx = MOVE_SPEED;
    } else {
      player.vx *= 0.8; // Friction
    }

    player.x += player.vx;

    // Screen wrap
    if (player.x + player.width < 0) player.x = CANVAS_WIDTH;
    if (player.x > CANVAS_WIDTH) player.x = -player.width;

    // Vertical movement
    player.vy += GRAVITY;
    player.y += player.vy;

    // Jump
    if ((keysRef.current['Space'] || keysRef.current['ArrowUp'] || keysRef.current['KeyW']) && player.isGrounded) {
      player.vy = JUMP_FORCE;
      player.isGrounded = false;
      audioManager.playJump();
    }

    // Collision detection with platforms
    player.isGrounded = false;
    platformsRef.current.forEach((platform) => {
      // Only collide when falling
      if (player.vy > 0) {
        if (
          player.x < platform.x + platform.width &&
          player.x + player.width > platform.x &&
          player.y + player.height > platform.y &&
          player.y + player.height < platform.y + platform.height + player.vy
        ) {
          player.y = platform.y - player.height;
          player.vy = 0;
          player.isGrounded = true;
        }
      }

      // Gem collection
      if (platform.hasGem && !platform.gemCollected) {
        const gemX = platform.x + platform.width / 2 - GEM_SIZE / 2;
        const gemY = platform.y - GEM_SIZE - 5;
        if (
          player.x < gemX + GEM_SIZE &&
          player.x + player.width > gemX &&
          player.y < gemY + GEM_SIZE &&
          player.y + player.height > gemY
        ) {
          platform.gemCollected = true;
          setScore((s) => s + 10);
          audioManager.playGem();
        }
      }
    });

    // Camera follow
    if (player.y < cameraYRef.current + CANVAS_HEIGHT / 2) {
      const diff = (cameraYRef.current + CANVAS_HEIGHT / 2) - player.y;
      cameraYRef.current -= diff;
      
      // Update score based on height
      const heightScore = Math.floor(Math.abs(cameraYRef.current) / 10);
      setScore(prev => Math.max(prev, heightScore));
    }

    // Generate new platforms and remove old ones
    const topPlatformY = platformsRef.current[platformsRef.current.length - 1].y;
    if (topPlatformY > cameraYRef.current - 100) {
      platformsRef.current.push(generatePlatform(topPlatformY - 100));
    }

    if (platformsRef.current[0].y > cameraYRef.current + CANVAS_HEIGHT + 100) {
      platformsRef.current.shift();
    }

    // Game Over
    if (player.y > cameraYRef.current + CANVAS_HEIGHT) {
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

    ctx.save();
    ctx.translate(0, -cameraYRef.current);

    // Draw platforms
    platformsRef.current.forEach((platform) => {
      ctx.shadowBlur = 15;
      ctx.shadowColor = platform.glowColor;
      ctx.fillStyle = platform.color;
      ctx.fillRect(platform.x, platform.y, platform.width, platform.height);

      // Draw gems
      if (platform.hasGem && !platform.gemCollected) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = COLORS.GEM_GLOW;
        ctx.fillStyle = COLORS.GEM;
        const gemX = platform.x + platform.width / 2 - GEM_SIZE / 2;
        const gemY = platform.y - GEM_SIZE - 5;
        
        ctx.beginPath();
        ctx.moveTo(gemX + GEM_SIZE / 2, gemY);
        ctx.lineTo(gemX + GEM_SIZE, gemY + GEM_SIZE / 2);
        ctx.lineTo(gemX + GEM_SIZE / 2, gemY + GEM_SIZE);
        ctx.lineTo(gemX, gemY + GEM_SIZE / 2);
        ctx.closePath();
        ctx.fill();
      }
    });

    // Draw player
    const player = playerRef.current;
    ctx.shadowBlur = 20;
    ctx.shadowColor = player.glowColor;
    ctx.fillStyle = player.color;
    
    ctx.beginPath();
    ctx.moveTo(player.x + player.width / 2, player.y);
    ctx.lineTo(player.x + player.width, player.y + player.height);
    ctx.lineTo(player.x, player.y + player.height);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };

  const loop = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      update();
      draw(ctx);
    }
    (requestRef as any).current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    (requestRef as any).current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState]);

  const startGame = () => {
    initGame();
    setGameState('PLAYING');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="relative group">
        {/* Neon Border Effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
        
        <div className="relative bg-black rounded-lg overflow-hidden shadow-2xl">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="block"
          />

          {/* UI Overlays */}
          <div className="absolute top-4 left-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span className="font-mono text-sm font-bold text-white">{score}</span>
            </div>
            <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10">
              <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">Best: {highScore}</span>
            </div>
          </div>

          <AnimatePresence>
            {gameState === 'START' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md p-8 text-center"
              >
                <motion.h1 
                  initial={{ y: -20 }}
                  animate={{ y: 0 }}
                  className="text-5xl font-display mb-2 tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-purple-500"
                >
                  NEON JUMPER
                </motion.h1>
                <p className="text-gray-400 mb-8 text-sm uppercase tracking-[0.2em]">Infinite Ascendance</p>
                
                <div className="space-y-4 w-full max-w-xs">
                  <button
                    onClick={startGame}
                    className="w-full group relative flex items-center justify-center gap-3 bg-white text-black font-bold py-4 rounded-xl hover:scale-105 transition-transform"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    START MISSION
                  </button>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/5 border border-white/10 p-3 rounded-xl text-[10px] uppercase tracking-widest text-gray-500">
                      ARROWS / WASD
                      <div className="text-white mt-1">MOVE</div>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-3 rounded-xl text-[10px] uppercase tracking-widest text-gray-500">
                      SPACE / UP
                      <div className="text-white mt-1">JUMP</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {gameState === 'GAMEOVER' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl p-8 text-center"
              >
                <div className="mb-6">
                  <div className="text-red-500 text-xs uppercase tracking-[0.3em] mb-2">Signal Lost</div>
                  <h2 className="text-6xl font-black text-white italic tracking-tighter">GAME OVER</h2>
                </div>

                <div className="flex flex-col items-center gap-4 mb-8">
                  <div className="text-center">
                    <div className="text-gray-500 text-[10px] uppercase tracking-widest mb-1">Final Score</div>
                    <div className="text-4xl font-mono font-bold text-cyan-400">{score}</div>
                  </div>
                  {score >= highScore && score > 0 && (
                    <motion.div 
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
                    >
                      New Personal Best!
                    </motion.div>
                  )}
                </div>

                <button
                  onClick={startGame}
                  className="group flex items-center gap-3 bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-8 py-4 rounded-full transition-all hover:scale-105"
                >
                  <RotateCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                  RETRY SEQUENCE
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-8 text-center max-w-sm">
        <p className="text-gray-500 text-[10px] uppercase tracking-[0.2em] leading-relaxed">
          Collect the <span className="text-yellow-400">yellow gems</span> to boost your score. 
          Don't fall into the <span className="text-purple-500">void</span>.
        </p>
      </div>
    </div>
  );
};

export default Game;
