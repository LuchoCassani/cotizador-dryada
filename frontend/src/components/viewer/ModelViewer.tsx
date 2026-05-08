import { Suspense, useEffect, useState } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { IconRotate3d } from '@tabler/icons-react'
import * as THREE from 'three'

function Modelo({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url)

  useEffect(() => {
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    const center = new THREE.Vector3()
    box.getCenter(center)
    geometry.translate(-center.x, -center.y, -center.z)
  }, [geometry])

  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial color="#7C3FBE" roughness={0.4} metalness={0.1} />
    </mesh>
  )
}

function Placeholder() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-dryada-gray-50 rounded-xl border border-dryada-gray-100">
      <IconRotate3d size={36} className="text-dryada-gray-100" aria-hidden />
      <span className="text-[12px] text-dryada-gray-400">El modelo 3D aparecerá aquí</span>
    </div>
  )
}

interface Props {
  file: File | null
}

export function ModelViewer({ file }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (!objectUrl) return <Placeholder />

  return (
    <div className="w-full h-full rounded-xl border border-dryada-violet-light overflow-hidden bg-dryada-gray-50">
      <Canvas camera={{ position: [0, 0, 100], fov: 45 }} shadows>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 10]} intensity={0.8} castShadow />
        <Suspense fallback={null}>
          <Modelo url={objectUrl} />
        </Suspense>
        <OrbitControls enablePan={false} />
      </Canvas>
      <p className="text-[10px] text-center text-dryada-gray-400 pb-1 -mt-5">
        Arrastrá para rotar
      </p>
    </div>
  )
}
