import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Generates random points in a sphere for the background effect
function ParticleNetwork(props) {
  const ref = useRef();
  
  // Create a memoized array of positions
  const count = 300;
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 5 * Math.cbrt(Math.random()); // Radius of 5
      
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta); // x
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta); // y
      pos[i * 3 + 2] = r * Math.cos(phi); // z
    }
    return pos;
  }, [count]);

  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.x -= delta / 10;
      ref.current.rotation.y -= delta / 15;
    }
  });

  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <Points ref={ref} positions={positions} stride={3} frustumCulled={false} {...props}>
        <PointMaterial transparent color="#3b82f6" size={0.05} sizeAttenuation={true} depthWrite={false} blending={THREE.AdditiveBlending} />
      </Points>
    </group>
  );
}

// A simple abstract geometry replacing the globe
function AbstractShape() {
  const meshRef = useRef();
  const edgesRef = useRef();

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.1;
      meshRef.current.rotation.y += delta * 0.15;
    }
    if (edgesRef.current) {
      edgesRef.current.rotation.x += delta * 0.1;
      edgesRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <group>
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
        {/* Core solid shape */}
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[2, 1]} />
          <meshStandardMaterial 
            color="#09090b" 
            roughness={0.2} 
            metalness={0.8}
            transparent
            opacity={0.8}
          />
        </mesh>
        
        {/* Glowing wireframe over it */}
        <mesh ref={edgesRef}>
          <icosahedronGeometry args={[2.01, 1]} /> {/* slightly larger to prevent z-fighting */}
          <meshBasicMaterial 
            color="#60a5fa" 
            wireframe={true} 
            transparent={true} 
            opacity={0.3} 
          />
        </mesh>
      </Float>
    </group>
  );
}

// Floating generic boxes to represent packages/logistics
function FloatingBoxes() {
  return (
    <>
      <Float speed={1.5} rotationIntensity={1} floatIntensity={2} position={[3, 2, -2]}>
        <mesh>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color="#f59e0b" emissive="#78350f" roughness={0.1} metalness={0.5} />
        </mesh>
      </Float>
      
      <Float speed={2} rotationIntensity={2} floatIntensity={1.5} position={[-2, -2, 1]}>
        <mesh>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color="#ec4899" emissive="#831843" roughness={0.2} metalness={0.8} />
        </mesh>
      </Float>

      <Float speed={1.2} rotationIntensity={1.5} floatIntensity={1} position={[2, -1.5, 2]}>
        <mesh>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color="#10b981" emissive="#064e3b" roughness={0.3} metalness={0.6} />
        </mesh>
      </Float>
    </>
  );
}

export default function Scene3D() {
  return (
    <Canvas camera={{ position: [0, 0, 7], fov: 45 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} color="#ffffff" />
      <directionalLight position={[-10, -10, -5]} intensity={0.5} color="#3b82f6" />
      
      {/* Visual elements */}
      <ParticleNetwork />
      <AbstractShape />
      <FloatingBoxes />
    </Canvas>
  );
}
