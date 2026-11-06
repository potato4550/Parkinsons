import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, TOUCH, Vector3,
} from 'three'
import { OrbitControls as OrbitControlsImpl } from 'three/addons/controls/OrbitControls.js'
import { colorForRegion } from '../colors'
import type { AtlasGeometry, GeometryMesh, Hemisphere, Metric, RegionRecord, ViewPreset } from '../types'

interface Props {
  geometryData: AtlasGeometry
  regions: RegionRecord[]
  metric: Metric
  hemisphere: Hemisphere
  selected: RegionRecord | null
  focusNonce: number
  viewPreset: ViewPreset
  validationMode: boolean
  zDomain: [number, number]
  observedDomain: [number, number]
  validationDomain: [number, number]
  fdrThreshold: number
  overlay?: Map<number, number>
  onHover: (region: RegionRecord | null, point?: { x: number; y: number }) => void
  onSelect: (region: RegionRecord) => void
  onReset: () => void
}

interface CombinedGeometry {
  geometry: BufferGeometry
  faceRegions: number[]
  regionGeometry: Map<number, BufferGeometry>
  regionVertexRanges: Map<number, [number, number]>
  center: Vector3
}

function combineGeometry(
  source: AtlasGeometry,
  allowed: Set<number>,
): CombinedGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const faceRegions: number[] = []
  const regionGeometry = new Map<number, BufferGeometry>()
  const regionVertexRanges = new Map<number, [number, number]>()
  const boundsGeometry = new BufferGeometry()

  source.regions.forEach((parcel) => {
    if (!allowed.has(parcel.region_id)) return
    const offset = positions.length / 3
    positions.push(...parcel.positions)
    const vertexCount = parcel.positions.length / 3
    regionVertexRanges.set(parcel.region_id, [offset, vertexCount])
    for (let index = 0; index < vertexCount; index += 1) colors.push(1, 1, 1)
    indices.push(...parcel.indices.map((index) => index + offset))
    for (let index = 0; index < parcel.indices.length / 3; index += 1) faceRegions.push(parcel.region_id)
  })
  boundsGeometry.setAttribute('position', new BufferAttribute(new Float32Array(source.anatomy?.positions ?? positions), 3))
  boundsGeometry.computeBoundingBox()
  const center = new Vector3()
  boundsGeometry.boundingBox!.getCenter(center)
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] -= center.x
    positions[index + 1] -= center.y
    positions[index + 2] -= center.z
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  source.regions.forEach((parcel) => {
    if (!allowed.has(parcel.region_id)) return
    const parcelPositions = [...parcel.positions]
    for (let index = 0; index < parcelPositions.length; index += 3) {
      parcelPositions[index] -= center.x
      parcelPositions[index + 1] -= center.y
      parcelPositions[index + 2] -= center.z
    }
    const parcelGeometry = new BufferGeometry()
    parcelGeometry.setAttribute('position', new BufferAttribute(new Float32Array(parcelPositions), 3))
    parcelGeometry.setIndex(parcel.indices)
    parcelGeometry.computeVertexNormals()
    regionGeometry.set(parcel.region_id, parcelGeometry)
  })
  boundsGeometry.dispose()
  return { geometry, faceRegions, regionGeometry, regionVertexRanges, center }
}

function anatomyGeometry(source: GeometryMesh, center: Vector3, hemisphere: Hemisphere): BufferGeometry {
  const positions = new Float32Array(source.positions)
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] -= center.x
    positions[index + 1] -= center.y
    positions[index + 2] -= center.z
  }
  // For a hemisphere view, retain only triangles completely on that side.
  const triangleIndices = hemisphere === 'whole' ? source.indices : [] as number[]
  if (hemisphere !== 'whole') {
    for (let face = 0; face < source.indices.length; face += 3) {
      const vertexIds = source.indices.slice(face, face + 3)
      if (vertexIds.every((id) => hemisphere === 'L' ? positions[id * 3] + center.x <= 0 : positions[id * 3] + center.x >= 0)) {
        triangleIndices.push(...vertexIds)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(triangleIndices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

const PRESET_POSITIONS: Record<ViewPreset, Vector3> = {
  reset: new Vector3(150, 80, 180),
  left: new Vector3(-240, 10, 0),
  right: new Vector3(240, 10, 0),
  anterior: new Vector3(0, 10, 240),
  posterior: new Vector3(0, 10, -240),
  superior: new Vector3(0, 240, 0.01),
  inferior: new Vector3(0, -240, 0.01),
}

function CameraRig({ selected, focusPoint, focusNonce, viewPreset }: {
  selected: RegionRecord | null
  focusPoint: Vector3 | null
  focusNonce: number
  viewPreset: ViewPreset
}) {
  const { camera, gl } = useThree()
  const controls = useMemo(() => {
    const instance = new OrbitControlsImpl(camera, gl.domElement)
    instance.enableDamping = true
    instance.dampingFactor = 0.08
    instance.minDistance = 60
    instance.maxDistance = 400
    instance.screenSpacePanning = true
    instance.touches.ONE = TOUCH.ROTATE
    instance.touches.TWO = TOUCH.DOLLY_PAN
    return instance
  }, [camera, gl.domElement])
  const destinationPosition = useRef(PRESET_POSITIONS.reset.clone())
  const destinationTarget = useRef(new Vector3())
  const animating = useRef(true)

  useEffect(() => {
    if (selected && focusPoint && focusNonce > 0) {
      destinationTarget.current.copy(focusPoint)
      const direction = camera.position.clone().sub(controls.target).normalize()
      destinationPosition.current.copy(destinationTarget.current).add(direction.multiplyScalar(115))
    } else {
      destinationTarget.current.set(0, 0, 0)
      destinationPosition.current.copy(PRESET_POSITIONS[viewPreset])
    }
    animating.current = true
  }, [camera, focusPoint, focusNonce, selected, viewPreset])

  useFrame(() => {
    controls.update()
    if (!animating.current) return
    camera.position.lerp(destinationPosition.current, 0.09)
    controls.target.lerp(destinationTarget.current, 0.09)
    if (camera.position.distanceTo(destinationPosition.current) < 0.2 && controls.target.distanceTo(destinationTarget.current) < 0.2) {
      animating.current = false
    }
  })
  useEffect(() => () => controls.dispose(), [controls])

  return <primitive object={controls} />
}

function AtlasMesh(props: Props) {
  const records = useMemo(() => new Map(props.regions.map((region) => [region.region_id, region])), [props.regions])
  const allowed = useMemo(() => new Set(props.regions
    .filter((region) => props.hemisphere === 'whole' || region.hemisphere === props.hemisphere || region.hemisphere === 'B')
    .map((region) => region.region_id)), [props.hemisphere, props.regions])
  const combined = useMemo(() => combineGeometry(props.geometryData, allowed), [allowed, props.geometryData])
  const focusPoint = useMemo(() => {
    if (!props.selected) return null
    const mesh = combined.regionGeometry.get(props.selected.region_id)
    if (!mesh) return null
    mesh.computeBoundingBox()
    return mesh.boundingBox!.getCenter(new Vector3())
  }, [combined, props.selected])
  const anatomy = useMemo(() => props.geometryData.anatomy
    ? anatomyGeometry(props.geometryData.anatomy, combined.center, props.hemisphere)
    : null, [combined.center, props.geometryData.anatomy, props.hemisphere])
  const anatomyMaterial = useMemo(() => new MeshStandardMaterial({
    color: new Color('#d7d6c9'), roughness: 0.94, metalness: 0,
    side: DoubleSide, transparent: true,
    opacity: props.metric === 'anatomy' ? 1 : props.validationMode ? 0.27 : 0.46,
    depthWrite: props.metric === 'anatomy',
  }), [props.metric, props.validationMode])
  const material = useMemo(() => new MeshStandardMaterial({
    vertexColors: true, roughness: 0.72, metalness: 0.04, side: DoubleSide,
    transparent: true, opacity: props.validationMode ? 0.82 : 0.88,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }), [props.validationMode])
  const highlightMaterial = useMemo(() => new MeshBasicMaterial({
    color: new Color('#ffffff'), transparent: true, opacity: 0.32, depthTest: false, side: DoubleSide,
  }), [])
  const selectedMaterial = useMemo(() => new MeshBasicMaterial({
    color: new Color('#ffe08a'), transparent: true, opacity: 0.72, depthTest: false,
    side: DoubleSide, wireframe: true,
  }), [])
  const hoverId = useRef<number | null>(null)
  const hoverMesh = useRef<Mesh>(null)

  useEffect(() => () => {
    combined.geometry.dispose()
    combined.regionGeometry.forEach((geometry) => geometry.dispose())
  }, [combined])
  useEffect(() => () => { anatomy?.dispose(); anatomyMaterial.dispose() }, [anatomy, anatomyMaterial])
  useEffect(() => {
    const colorAttribute = combined.geometry.getAttribute('color') as BufferAttribute
    combined.regionVertexRanges.forEach(([offset, count], regionId) => {
      const color = colorForRegion(
        records.get(regionId)!, props.metric,
        { zDomain: props.zDomain, observedDomain: props.observedDomain, validationDomain: props.validationDomain, fdrThreshold: props.fdrThreshold },
        props.validationMode, props.overlay,
      )
      for (let index = offset; index < offset + count; index += 1) colorAttribute.setXYZ(index, color.r, color.g, color.b)
    })
    colorAttribute.needsUpdate = true
  }, [combined, props.fdrThreshold, props.metric, props.observedDomain, props.validationDomain, props.validationMode, props.zDomain, props.overlay, records])
  useEffect(() => () => { material.dispose(); highlightMaterial.dispose(); selectedMaterial.dispose() }, [highlightMaterial, material, selectedMaterial])

  const setHoverGeometry = (regionId: number | null) => {
    hoverId.current = regionId
    if (hoverMesh.current) {
      hoverMesh.current.visible = regionId !== null
      if (regionId !== null) hoverMesh.current.geometry = combined.regionGeometry.get(regionId)!
    }
  }

  const onMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (event.faceIndex == null) return
    const regionId = combined.faceRegions[event.faceIndex]
    if (hoverId.current !== regionId) setHoverGeometry(regionId)
    props.onHover(records.get(regionId) ?? null, { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY })
  }
  const onOut = () => { setHoverGeometry(null); props.onHover(null) }
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.faceIndex == null) return
    const record = records.get(combined.faceRegions[event.faceIndex])
    if (record) props.onSelect(record)
  }

  return (
    <>
      {anatomy && <mesh geometry={anatomy} material={anatomyMaterial} raycast={() => undefined} />}
      <mesh
        geometry={combined.geometry}
        material={material}
        renderOrder={2}
        visible={props.metric !== 'anatomy'}
        onPointerMove={onMove}
        onPointerOut={onOut}
        onClick={onClick}
      />
      <mesh ref={hoverMesh} material={highlightMaterial} renderOrder={5} visible={false} />
      {props.selected && allowed.has(props.selected.region_id) && (
        <mesh geometry={combined.regionGeometry.get(props.selected.region_id)} material={selectedMaterial} renderOrder={6} />
      )}
      <CameraRig
        selected={props.selected}
        focusPoint={focusPoint}
        focusNonce={props.focusNonce}
        viewPreset={props.viewPreset}
      />
    </>
  )
}

export function BrainScene(props: Props) {
  return (
    <Canvas
      aria-label="Interactive AAL3 brain atlas"
      camera={{ position: [150, 80, 180], fov: 42, near: 0.1, far: 1000 }}
      dpr={[1, 1.7]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onDoubleClick={props.onReset}
    >
      <color attach="background" args={['#071013']} />
      <ambientLight intensity={1.7} />
      <directionalLight position={[100, 150, 200]} intensity={2.2} />
      <directionalLight position={[-120, -50, -100]} intensity={0.8} color="#8ac6c9" />
      <AtlasMesh {...props} />
    </Canvas>
  )
}
