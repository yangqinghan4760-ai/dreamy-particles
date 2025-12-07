

export const IMAGE_URLS = [
  {
    name: "The Great Wave off Kanagawa",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Great_Wave_off_Kanagawa2.jpg/800px-Great_Wave_off_Kanagawa2.jpg",
  },
  {
    name: "Sunflowers (Vincent van Gogh)",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Vincent_Willem_van_Gogh_127.jpg/800px-Vincent_Willem_van_Gogh_127.jpg",
  },
  {
    name: "The Starry Night (Vincent van Gogh)",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/800px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
  },
  {
    name: "Water Lilies (Claude Monet)",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Claude_Monet_-_Water_Lilies_-_Google_Art_Project.jpg/800px-Claude_Monet_-_Water_Lilies_-_Google_Art_Project.jpg",
  },
  {
    // Substituted Dali's "Persistence of Memory" (Copyrighted/No CORS) with Munch's "The Scream" (Public Domain)
    // to ensure the application runs reliably without security errors.
    name: "The Scream (Edvard Munch)",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73.5_cm%2C_National_Gallery_of_Norway.jpg/800px-Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73.5_cm%2C_National_Gallery_of_Norway.jpg",
  },
];

export const PARTICLE_COUNT = 60000;
export const SIZE = 200;

// GLSL Vertex Shader
export const vertexShader = `
uniform float uTime;
uniform float uMixFactor; // 0.0 = Image, 1.0 = Galaxy/Hand Mode
uniform vec3 uHandPosition;
uniform float uHandActive;

attribute vec3 targetPosition;
attribute vec3 targetColor;
attribute float aIsExtra; // 0.0 = Image Particle, 1.0 = Extra Sparkle
attribute float aSize;    // Individual particle size

varying vec3 vColor;

// Simplex Noise
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vColor = targetColor;
  
  vec3 pos = targetPosition;
  
  // -- EXTRA PARTICLE LOGIC --
  if (aIsExtra > 0.5) {
      if (uMixFactor < 0.05) {
          gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          return;
      }

      vec3 randomOffset = targetPosition; 
      
      // Solar System / Galaxy swirl
      // We use the 'targetPosition' (which is random sphere) to define orbit plane and radius
      float radius = length(randomOffset.xy);
      float angle = atan(randomOffset.y, randomOffset.x);
      
      // Orbit speed depends on radius (Kepler-ish)
      float speed = 2.0 / (radius * 0.05 + 0.1); 
      float currentAngle = angle + uTime * speed * 0.2;
      
      vec3 orbitPos = vec3(
          cos(currentAngle) * radius,
          sin(currentAngle) * radius,
          randomOffset.z + sin(uTime + radius)*10.0 // Bobbing
      );
      
      // Expand from hand center
      vec3 swarmPos = uHandPosition + orbitPos * (0.5 + 2.0 * uMixFactor);
      
      vec4 mvPosition = modelViewMatrix * vec4(swarmPos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      
      // Scale size based on individual attribute 'aSize'
      gl_PointSize = (aSize * uMixFactor) * (300.0 / -mvPosition.z);
      
      return; 
  }

  // -- STANDARD IMAGE PARTICLE LOGIC --

  float n1 = snoise(vec2(pos.x * 0.01 + uTime * 0.2, pos.y * 0.01));
  vec3 noiseVec = vec3(n1, snoise(vec2(pos.x*0.02, pos.y*0.02)), 0.0) * 30.0;
  
  vec3 attractionPos = pos;
  
  if (uHandActive > 0.5) {
      vec3 toHand = uHandPosition - pos;
      vec3 dir = normalize(toHand);
      float dist = length(toHand);
      
      // Spiral attraction
      vec3 tangent = cross(dir, vec3(0.0, 0.0, 1.0));
      
      // Solar System Orbit for main pixels too?
      // Let's make them flow towards hand but swirl
      vec3 spiral = (dir * 2.0 + tangent * 1.5) * 20.0;
      
      attractionPos = uHandPosition + (pos - uHandPosition) * 0.1 + spiral * n1;
  } else {
      attractionPos = pos + noiseVec;
  }
  
  vec3 finalPos = mix(targetPosition, attractionPos, uMixFactor);
  if (uMixFactor > 0.0) {
      finalPos.z += n1 * 50.0 * uMixFactor;
  }

  vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
  
  // Use aSize for base size, increased by mix factor
  // Base size for image pixels ~ aSize (3.0-5.0)
  gl_PointSize = (aSize + 2.0 * uMixFactor) * (300.0 / -mvPosition.z);
  
  gl_Position = projectionMatrix * mvPosition;
}
`;

// GLSL Fragment Shader
export const fragmentShader = `
varying vec3 vColor;

void main() {
  vec2 xy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(xy, xy);
  if (r > 1.0) discard;
  
  // Normal Blending logic:
  // We want a solid core for clarity, but slightly soft edge
  float alpha = 1.0 - smoothstep(0.5, 1.0, r); 
  
  // Output color with high alpha to ensure it looks "Darker" (solid) 
  // rather than faint transparent.
  gl_FragColor = vec4(vColor, alpha * 0.9); 
}
`;