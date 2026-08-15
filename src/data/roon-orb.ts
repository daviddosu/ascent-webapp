export type RoonOrbState = 'waiting' | 'active' | 'complete'

type ProjectedDot = {
  x: number
  y: number
  depth: number
  radius: number
  whiteValue: number
  opacity: number
}

const orbCanvases = new Set<HTMLCanvasElement>()
let animationFrame: number | null = null

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function isDarkTheme() {
  if (typeof document === 'undefined') return false
  return document.body?.dataset.theme === 'dark' || document.documentElement.dataset.theme === 'dark'
}

function project(
  x: number,
  y: number,
  z: number,
  yaw: number,
  tilt: number,
  center: { x: number; y: number },
  radius: number,
) {
  const sinYaw = Math.sin(yaw)
  const cosYaw = Math.cos(yaw)
  const sinTilt = Math.sin(tilt)
  const cosTilt = Math.cos(tilt)
  const rotatedX = x * cosYaw + z * sinYaw
  const rotatedZ = -x * sinYaw + z * cosYaw
  const rotatedY = y * cosTilt - rotatedZ * sinTilt
  const projectedZ = y * sinTilt + rotatedZ * cosTilt
  return {
    x: center.x + rotatedX * radius,
    y: center.y - rotatedY * radius,
    z: projectedZ,
  }
}

function drawOrb(canvas: HTMLCanvasElement, state: RoonOrbState, elapsedSeconds: number) {
  const context = canvas.getContext('2d')
  if (!context) return
  const declaredSize = Number(canvas.closest<HTMLElement>('[data-roon-orb-size]')?.dataset.roonOrbSize ?? 20)
  const size = Math.max(12, declaredSize || 20)
  const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
  const pixelSize = Math.round(size * pixelRatio)
  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize
    canvas.height = pixelSize
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, size, size)

  const isComplete = state === 'complete'
  const dark = isDarkTheme()
  const isAnimated = state === 'active' && !prefersReducedMotion()
  const phase = isAnimated ? elapsedSeconds * 2.665 : 0.6
  const spin = 0.5
  const yaw = phase * spin
  const tilt = 0.4 + (0.06 * Math.sin(phase * 0.35))
  const scan = phase * (spin + ((1.7 - spin) * 4.335))
  const latRings = size <= 24 ? 6 : 11
  const longitudeDensity = size <= 24 ? 14 : 28
  const radius = size * 0.41
  const radiusScale = Math.pow(size / 300, 0.6)
  const sizeMultiplier = size <= 24 ? 1.75 : 1.15
  const center = { x: size / 2, y: size / 2 }
  const dots: ProjectedDot[] = []

  if (isComplete && !dark) {
    const completionPlateRadius = size * 0.46
    context.beginPath()
    context.arc(center.x, center.y, completionPlateRadius, 0, Math.PI * 2)
    context.fillStyle = '#1b1b1d'
    context.fill()
  }

  for (let ringIndex = 0; ringIndex <= latRings; ringIndex += 1) {
    const latitude = -Math.PI / 2 + (ringIndex / latRings * Math.PI)
    const cosLatitude = Math.cos(latitude)
    const sinLatitude = Math.sin(latitude)
    const dotsPerRing = Math.max(1, Math.round(Math.abs(cosLatitude) * longitudeDensity))

    for (let column = 0; column < dotsPerRing; column += 1) {
      const longitude = column / dotsPerRing * 2 * Math.PI
      const projected = project(
        cosLatitude * Math.cos(longitude),
        sinLatitude,
        cosLatitude * Math.sin(longitude),
        yaw,
        tilt,
        center,
        radius,
      )
      const depth = (projected.z + 1) / 2
      const angularDistance = Math.atan2(
        Math.sin((longitude + (phase * spin)) - scan),
        Math.cos((longitude + (phase * spin)) - scan),
      )
      const scanBoost = Math.exp(-((angularDistance * angularDistance) / 0.18)) * Math.max(0, projected.z)
      const dotRadius = Math.max(
        0.55,
        (0.6 + (1.7 * depth) + scanBoost) * radiusScale * sizeMultiplier,
      )
      const whiteValue = isComplete
        ? 1
        : dark
          ? 1 - (0.62 - (0.54 * depth))
          : 0.62 - (0.54 * depth)
      const baseOpacity = isComplete ? 1 : (dark ? 0.58 : 0.82)
      const opacity = isComplete
        ? 1
        : baseOpacity + ((1 - baseOpacity) * Math.min(1, scanBoost))

      dots.push({
        x: projected.x,
        y: projected.y,
        depth: projected.z,
        radius: dotRadius,
        whiteValue,
        opacity,
      })
    }
  }

  for (const dot of dots.sort((left, right) => left.depth - right.depth)) {
    context.beginPath()
    context.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2)
    const channel = Math.round(dot.whiteValue * 255)
    context.fillStyle = `rgba(${channel}, ${channel}, ${channel}, ${dot.opacity})`
    context.fill()
  }
}

function scheduleAnimation() {
  if (animationFrame !== null || typeof window === 'undefined') return
  const tick = (timestamp: number) => {
    animationFrame = null
    let animate = false
    for (const canvas of orbCanvases) {
      if (!canvas.isConnected) {
        orbCanvases.delete(canvas)
        continue
      }
      const state = canvas.closest<HTMLElement>('[data-roon-orb-state]')?.dataset.roonOrbState as RoonOrbState | undefined
      if (!state) {
        orbCanvases.delete(canvas)
        continue
      }
      drawOrb(canvas, state, timestamp / 1_000)
      animate = animate || state === 'active'
    }
    if (animate && !prefersReducedMotion()) scheduleAnimation()
  }
  animationFrame = window.requestAnimationFrame?.(tick) ?? window.setTimeout(() => tick(performance.now()), 16)
}

export function mountRoonOrbs(root: ParentNode = document) {
  const canvases = root.querySelectorAll<HTMLCanvasElement>('[data-roon-orb-canvas]')
  for (const canvas of canvases) orbCanvases.add(canvas)
  scheduleAnimation()
}

export function renderRoonOrb(state: RoonOrbState, size = 20) {
  const boundedSize = Math.max(12, Math.min(64, Math.round(size)))
  return `<span class="roon-orb roon-orb--${state}" data-roon-orb-state="${state}" data-roon-orb-size="${boundedSize}" aria-hidden="true"><canvas data-roon-orb-canvas width="${boundedSize}" height="${boundedSize}"></canvas></span>`
}
