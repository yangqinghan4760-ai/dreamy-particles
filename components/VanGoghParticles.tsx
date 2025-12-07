

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { IMAGE_URLS, PARTICLE_COUNT, SIZE, vertexShader, fragmentShader } from '../constants';
import { ImageDataStore, HandState, WindowWithMediaPipe } from '../types';

// Helper to load image and extract pixel data
const loadAndExtractImage = (src: string, name: string): Promise<ImageDataStore> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = SIZE;
        canvas.height = SIZE;
        
        if (!ctx) {
          reject(new Error("Canvas context not available"));
          return;
        }

        const aspectRatio = img.width / img.height;
        let drawWidth = SIZE;
        let drawHeight = SIZE;
        let offsetX = 0;
        let offsetY = 0;

        if (aspectRatio > 1) {
          drawHeight = SIZE / aspectRatio;
          offsetY = (SIZE - drawHeight) / 2;
        } else {
          drawWidth = SIZE * aspectRatio;
          offsetX = (SIZE - drawWidth) / 2;
        }

        // Draw black background first
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        const data = ctx.getImageData(0, 0, SIZE, SIZE);
        resolve({
          name,
          width: SIZE,
          height: SIZE,
          pixels: data.data,
        });
      } catch (err) {
        reject(err);
      }
    };
    
    img.onerror = () => reject(new Error(`Failed to load image: ${name}`));
    img.src = src;
  });
};

const VanGoghParticles: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [handState, setHandState] = useState<HandState>(HandState.UNKNOWN);
  const [loadedCount, setLoadedCount] = useState(0);
  
  // Refs
  const imageDataCache = useRef<ImageDataStore[]>([]);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const animationFrameRef = useRef<number>(0);
  const targetMixFactor = useRef<number>(0);
  const currentMixFactor = useRef<number>(0);
  const handPositionRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const handActiveRef = useRef<boolean>(false);
  const wasHandActiveRef = useRef<boolean>(false);

  // Initialize ThreeJS and load images
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const results: ImageDataStore[] = [];
        for (const img of IMAGE_URLS) {
            try {
                const data = await loadAndExtractImage(img.url, img.name);
                results.push(data);
                if (mounted) setLoadedCount(c => c + 1);
            } catch (e) {
                console.warn(`Failed to load ${img.name}`, e);
            }
        }
        
        if (!mounted) return;
        
        if (results.length === 0) {
           throw new Error("No masterpieces could be loaded. Check internet connection.");
        }
        
        imageDataCache.current = results;
        initThree();
        setIsLoading(false);
      } catch (e: any) {
        if (mounted) {
          console.error(e);
          setError(e.message || "Failed to load artistic data.");
          setIsLoading(false);
        }
      }
    };
    init();

    return () => {
      mounted = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize MediaPipe
  useEffect(() => {
    if (isLoading || error) return;

    let handsInstance: any = null;
    let cameraInstance: any = null;
    let pollingInterval: any = null;

    const setupMediaPipe = () => {
      const w = window as unknown as WindowWithMediaPipe;
      if (!w.Hands || !w.Camera || !videoRef.current) return false;

      try {
          const hands = new w.Hands({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
          });

          hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });

          hands.onResults(onHandsResults);

          const camera = new w.Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && hands) await hands.send({ image: videoRef.current });
            },
            width: 640,
            height: 480,
          });
          camera.start();

          handsInstance = hands;
          cameraInstance = camera;
          return true;
      } catch (err) {
          console.error("MediaPipe Init Error:", err);
          return false;
      }
    };

    if (!setupMediaPipe()) {
        pollingInterval = setInterval(() => {
            if (setupMediaPipe()) clearInterval(pollingInterval);
        }, 500);
    }

    return () => {
        if (pollingInterval) clearInterval(pollingInterval);
        if (handsInstance) handsInstance.close();
        if (cameraInstance && cameraInstance.stop) cameraInstance.stop(); 
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, error]);

  const initThree = () => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 300;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const extras = new Float32Array(PARTICLE_COUNT);
    const sizes = new Float32Array(PARTICLE_COUNT);
    
    updateGeometryData(positions, colors, extras, sizes, imageDataCache.current[0]);

    geometry.setAttribute('targetPosition', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('targetColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aIsExtra', new THREE.BufferAttribute(extras, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); // Helper
    geometryRef.current = geometry;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMixFactor: { value: 0 }, 
        uHandPosition: { value: new THREE.Vector3(0, 0, 0) },
        uHandActive: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false, // Keep false to allow overlap without z-fighting in clouds
      blending: THREE.NormalBlending, // NORMAL BLENDING for solid, darker colors
    });
    materialRef.current = material;

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    window.addEventListener('resize', handleResize);
    animate();
  };

  const updateGeometryData = (
    positions: Float32Array, 
    colors: Float32Array, 
    extras: Float32Array,
    sizes: Float32Array,
    imgData: ImageDataStore
  ) => {
    let ptr = 0;
    const width = SIZE;
    const height = SIZE;
    const startX = -width / 2;
    const startY = height / 2;
    let particleIndex = 0;

    // 1. FILL IMAGE PARTICLES
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        
        const r = imgData.pixels[i] / 255;
        const g = imgData.pixels[i + 1] / 255;
        const b = imgData.pixels[i + 2] / 255;
        const a = imgData.pixels[i + 3] / 255;

        extras[particleIndex] = 0.0;

        if (a > 0.1) {
            positions[ptr] = startX + x;
            positions[ptr + 1] = startY - y;
            positions[ptr + 2] = 0;

            colors[ptr] = r;
            colors[ptr + 1] = g;
            colors[ptr + 2] = b;

            // Base size for pixels (clearer)
            sizes[particleIndex] = 3.0 + Math.random() * 2.0; 
        } else {
            // Invisible placeholder
            positions[ptr] = 0;
            positions[ptr + 1] = 0;
            positions[ptr + 2] = 5000; 
            colors[ptr] = 0;
            colors[ptr+1] = 0;
            colors[ptr+2] = 0;
            sizes[particleIndex] = 0;
        }
        ptr += 3;
        particleIndex++;
      }
    }

    // 2. FILL EXTRA SPARKLES (Rest of the buffer)
    while (particleIndex < PARTICLE_COUNT) {
        extras[particleIndex] = 1.0;

        let r=1, g=1, b=1;
        // Sample random valid color
        for(let attempt=0; attempt<5; attempt++) {
            const rx = Math.floor(Math.random() * width);
            const ry = Math.floor(Math.random() * height);
            const ri = (ry * width + rx) * 4;
            if (imgData.pixels[ri+3] > 20) {
                r = imgData.pixels[ri] / 255;
                g = imgData.pixels[ri + 1] / 255;
                b = imgData.pixels[ri + 2] / 255;
                break;
            }
        }
        
        colors[ptr] = r;
        colors[ptr + 1] = g;
        colors[ptr + 2] = b;

        // Variable sizes for Galaxy Effect (Big & Small)
        const sizeRoll = Math.random();
        if (sizeRoll > 0.98) sizes[particleIndex] = 10.0 + Math.random() * 10.0; // Giant planets
        else if (sizeRoll > 0.8) sizes[particleIndex] = 6.0 + Math.random() * 4.0; // Medium stars
        else sizes[particleIndex] = 2.0 + Math.random() * 3.0; // Small dust

        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const radius = 80 + Math.random() * 150; 
        const sx = radius * Math.sin(phi) * Math.cos(theta);
        const sy = radius * Math.sin(phi) * Math.sin(theta);
        const sz = radius * Math.cos(phi);

        positions[ptr] = sx;
        positions[ptr + 1] = sy;
        positions[ptr + 2] = sz;

        ptr += 3;
        particleIndex++;
    }
  };

  const handleResize = () => {
    if (cameraRef.current && rendererRef.current) {
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    }
  };

  const onHandsResults = (results: any) => {
    const handsDetected = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

    // TRIGGER LOGIC: Hand Active -> Hand Lost = Switch Image
    if (wasHandActiveRef.current && !handsDetected) {
         triggerImageSwitch();
         setHandState(HandState.UNKNOWN);
    }
    
    wasHandActiveRef.current = handsDetected;

    if (handsDetected) {
      const landmarks = results.multiHandLandmarks[0];
      const x = (landmarks[9].x - 0.5) * -2 * (window.innerWidth / window.innerHeight) * 120;
      const y = (landmarks[9].y - 0.5) * -2 * 120;
      
      handPositionRef.current.set(x, y, 0);
      handActiveRef.current = true;
      setHandState(HandState.OPEN); // Always assume open for interactivity simplicity
      targetMixFactor.current = 1.0; 
    } else {
      handActiveRef.current = false;
      targetMixFactor.current = 0.0;
    }
  };

  const triggerImageSwitch = () => {
    if (imageDataCache.current.length <= 1) return;

    setCurrentImageIndex(prev => {
      // Strictly sequential: 1->2->3->4->5->1
      const next = (prev + 1) % imageDataCache.current.length;
      
      if (geometryRef.current) {
        const positions = geometryRef.current.attributes.targetPosition.array as Float32Array;
        const colors = geometryRef.current.attributes.targetColor.array as Float32Array;
        const extras = geometryRef.current.attributes.aIsExtra.array as Float32Array;
        const sizes = geometryRef.current.attributes.aSize.array as Float32Array;
        
        updateGeometryData(positions, colors, extras, sizes, imageDataCache.current[next]);
        
        geometryRef.current.attributes.targetPosition.needsUpdate = true;
        geometryRef.current.attributes.targetColor.needsUpdate = true;
        geometryRef.current.attributes.aSize.needsUpdate = true;
        geometryRef.current.attributes.aIsExtra.needsUpdate = true;
      }
      return next;
    });
  };

  const animate = () => {
    if (!materialRef.current) return;

    const delta = 0.08; 
    if (currentMixFactor.current < targetMixFactor.current) {
      currentMixFactor.current = Math.min(currentMixFactor.current + delta, 1.0);
    } else if (currentMixFactor.current > targetMixFactor.current) {
      currentMixFactor.current = Math.max(currentMixFactor.current - delta, 0.0);
    }

    materialRef.current.uniforms.uTime.value += 0.01;
    materialRef.current.uniforms.uMixFactor.value = currentMixFactor.current;
    materialRef.current.uniforms.uHandActive.value = handActiveRef.current ? 1.0 : 0.0;
    materialRef.current.uniforms.uHandPosition.value.lerp(handPositionRef.current, 0.2);

    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  if (error) {
      return (
          <div className="w-full h-screen flex items-center justify-center bg-black text-red-500 font-mono p-10 text-center">
              <div>
                  <h2 className="text-2xl mb-4">Artistic Error</h2>
                  <p>{error}</p>
                  <button onClick={() => window.location.reload()} className="mt-6 border border-red-500 px-4 py-2 rounded">Try Again</button>
              </div>
          </div>
      );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none">
      <video 
        ref={videoRef} 
        className="absolute top-0 left-0 w-full h-full object-cover transform -scale-x-100" 
        playsInline 
        muted 
        autoPlay 
      />
      
      {/* Semi-transparent dark overlay to make NormalBlending particles visible against camera */}
      <div className="absolute inset-0 bg-black/60 z-0" />

      <div ref={containerRef} className="absolute inset-0 z-10" />

      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-20 flex flex-col justify-between p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-yellow-500 drop-shadow-md font-serif tracking-wider">
              Masterpiece AR
            </h1>
            <p className="text-white/80 text-sm mt-1">
              {isLoading ? `Loading Art... (${loadedCount}/${IMAGE_URLS.length})` : "Show hand to activate. Remove hand to switch."}
            </p>
          </div>
          
          {!isLoading && (
            <div className="bg-black/60 backdrop-blur-md p-4 rounded-lg border border-white/20 text-right">
              <p className="text-xs text-yellow-500 uppercase tracking-widest mb-1">Current</p>
              <h2 className="text-xl text-white font-serif max-w-[200px] leading-tight">
                {imageDataCache.current[currentImageIndex]?.name || "Loading..."}
              </h2>
              <div className="text-[10px] text-gray-400 mt-1">
                {currentImageIndex + 1} / {imageDataCache.current.length}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-center">
            {isLoading ? (
                 <div className="animate-pulse text-yellow-400 font-serif italic">Compiling Shaders...</div>
            ) : (
                <div className={`transition-all duration-300 px-6 py-3 rounded-full backdrop-blur-lg border shadow-lg ${
                    handActiveRef.current ? 'bg-blue-900/60 border-blue-400 text-blue-100 scale-110' :
                    'bg-yellow-900/60 border-yellow-400 text-yellow-100'
                }`}>
                    <span className="font-mono font-bold mr-3">
                        {handActiveRef.current ? "GALAXY ACTIVE" : "REMOVE HAND TO SWITCH"}
                    </span>
                    <span className="text-sm opacity-80 hidden sm:inline">
                         {handActiveRef.current ? "Swirl your hand" : "Show hand to restore"}
                    </span>
                </div>
            )}
        </div>

        <div className="text-center text-white/40 text-xs flex justify-center gap-4">
          <span>AR Mode</span>
          <span>•</span>
          <span>Normal Blending</span>
          <span>•</span>
          <span>Solar System Effect</span>
        </div>
      </div>
    </div>
  );
};

export default VanGoghParticles;