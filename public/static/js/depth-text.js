/**
 * CinePlus x React Bits: DepthText Component (Vanilla JS Engine)
 * Replicates 100% of the React Bits 3D DepthText physics, equations, and typography extrusion.
 */

(function (global) {
  'use strict';

  const MAX_LAYERS = 64;
  const INTRO_MS = 1200;
  const PUSH_STIFFNESS = 260;
  const PUSH_DAMPING = 17;
  const PRESS_EXTRA = 0.25;
  const FLOAT_EASE = 0.7;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const getLayerColor = (faceColor, depthColor, index, total) => {
    // High-fidelity 3D extrusion gradient:
    // index goes from total (deepest back layer) down to 1 (layer right behind front face)
    // Near face (index 1): intense deep CinePlus vermilion (#E64500)
    // Furthest back (index total): luminous radiant amber (#FFA000)
    const factor = total <= 1 ? 0 : (index - 1) / (total - 1);
    const r = 255;
    const g = Math.round(68 + factor * 88); // 68 -> 156
    const b = Math.round(factor * 10);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const getFadeColor = (depthColor, index, total, outline) => {
    const reach = layer => Math.pow(clamp(1 - (layer - 0.5) / total, 0, 1), 1.6);
    const here = reach(index);
    const behind = index >= total ? 0 : reach(index + 1);
    const alpha = outline ? here : behind >= 1 ? 1 : 1 - (1 - here) / (1 - behind);
    return `color-mix(in srgb, ${depthColor} ${(clamp(alpha, 0, 1) * 100).toFixed(2)}%, transparent)`;
  };

  const getTransform = (rotateX, rotateY, lift = 0, roll = 0, sink = 0) =>
    [
      lift ? `translateY(${lift.toFixed(2)}px)` : '',
      roll ? `rotateZ(${roll.toFixed(3)}deg)` : '',
      `rotateX(${rotateX.toFixed(3)}deg) rotateY(${rotateY.toFixed(3)}deg)`,
      sink ? `translateZ(${(-sink).toFixed(2)}px)` : ''
    ]
      .filter(Boolean)
      .join(' ');

  function createDepthText(container, options = {}) {
    if (!container) return null;

    const {
      text = 'CINEMA',
      layers = 26,
      depth = 2.0,
      faceColor = '#111111',
      depthColor = '#FF5500',
      gradientDepth = false,
      tilt = 8.0,
      tiltX = undefined,
      tiltY = undefined,
      pointerTracking = true,
      smoothing = 0.14,
      perspective = 900,
      autoOrbit = true,
      orbitSpeed = 0.35,
      hoverPush = 0.45,
      float = false,
      fontSize = 'clamp(3rem, 6vw, 6rem)',
      fontWeight = 900,
      shadow = true,
      outline = false,
      intro = true,
      className = '',
      style = {}
    } = options;

    const safeLayers = clamp(Math.round(Number(layers) || 1), 2, MAX_LAYERS);
    const safeDepth = clamp(Number(depth) || 0, 0, 12);
    const safeTilt = clamp(Number(tilt) || 0, 0, 15);
    const safeSmoothing = clamp(Number(smoothing) || 0.14, 0.02, 0.35);
    const safePerspective = clamp(Number(perspective) || 900, 300, 2000);
    const safeOrbitSpeed = clamp(Number(orbitSpeed) || 0, 0, 2);
    const safePush = clamp(Number(hoverPush) || 0, 0, 1);
    const extent = safeLayers * safeDepth;

    // Resting 3D angle: customizable per element (e.g. inward facing towards center video)
    const baseRotation = {
      x: tiltX !== undefined ? Number(tiltX) : -safeTilt * 0.42,
      y: tiltY !== undefined ? Number(tiltY) : safeTilt * 0.65
    };

    // DOM Setup
    const root = document.createElement('span');
    root.className = `depth-text ${outline ? 'depth-text--outline' : ''} ${className}`.trim();

    root.style.setProperty('--depth-text-perspective', `${safePerspective}px`);
    root.style.setProperty('--depth-text-font-size', fontSize);
    root.style.setProperty('--depth-text-font-weight', fontWeight);
    root.style.setProperty('--depth-text-face-color', faceColor);
    root.style.setProperty(
      '--depth-text-shadow',
      shadow && !gradientDepth
        ? '0 8px 18px rgba(255, 85, 0, 0.22), 0 2px 4px rgba(0, 0, 0, 0.08)'
        : 'none'
    );
    root.style.setProperty('--depth-text-face-shadow', shadow ? '0 1px 2px rgba(0, 0, 0, 0.25)' : 'none');

    Object.assign(root.style, style);

    const stage = document.createElement('span');
    stage.className = 'depth-text__stage';
    stage.style.transform = getTransform(baseRotation.x, baseRotation.y);
    stage.style.setProperty('--depth-text-grow', intro ? '0' : '1');

    // Build extruded 3D layers
    for (let layerIndex = 0; layerIndex < safeLayers; layerIndex++) {
      const index = safeLayers - layerIndex;
      const layer = document.createElement('span');
      layer.setAttribute('aria-hidden', 'true');
      layer.className = `depth-text__layer ${index === safeLayers ? 'depth-text__layer--back' : ''}`.trim();
      const color = gradientDepth
        ? getFadeColor(depthColor, index, safeLayers, outline)
        : getLayerColor(faceColor, depthColor, index, safeLayers);
      layer.style.color = color;
      layer.style.transform = `translateZ(calc(var(--depth-text-grow, 1) * ${(-index * safeDepth).toFixed(2)}px))`;
      layer.textContent = text;
      stage.appendChild(layer);
    }

    // Front crisp face
    const face = document.createElement('span');
    face.className = 'depth-text__face';
    face.textContent = text;
    stage.appendChild(face);

    root.appendChild(stage);

    // CRITICAL: Wipe existing plain text inside container so it never duplicates
    container.innerHTML = '';
    container.appendChild(root);

    // Physics & Interaction State
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const canTrackPointer = pointerTracking && finePointer && !reducedMotion;
    const listensToHover = (safePush > 0 || float) && !reducedMotion;

    let frameId = 0;
    let visible = true;
    let activePointer = false;
    let hovered = false;
    let pressed = false;
    let lastTime = 0;
    let size = root.offsetHeight || 100;
    const startTime = performance.now();
    const motion = { push: 0, velocity: 0, float: 0 };
    const current = { ...baseRotation };
    const target = { ...baseRotation };
    let introProgress = intro ? 0 : 1;
    let introDone = !intro;

    const sinkAmount = () => clamp(motion.push, -0.25, 1);

    const applyTransform = (now = performance.now()) => {
      const time = (now - startTime) / 1000;
      const drift = motion.float;
      stage.style.transform = getTransform(
        current.x + (drift ? Math.cos(time * 1.19) * 2 * drift : 0),
        current.y + (drift ? Math.sin(time * 0.86 + 2.1) * 4 * drift : 0),
        drift ? Math.sin(time * 1.43) * size * 0.045 * drift : 0,
        drift ? Math.sin(time * 1.03 + 0.8) * 1.6 * drift : 0,
        sinkAmount() * extent
      );
    };

    const applyGrow = () => {
      const progress = introProgress;
      const grow = progress >= 1 ? 1 : 1 - Math.pow(1 - progress, 3);
      const value = grow * (1 - sinkAmount());
      stage.style.setProperty('--depth-text-grow', value === 1 ? '1' : value.toFixed(4));
    };

    if (reducedMotion) {
      introProgress = 1;
      motion.push = 0;
      applyGrow();
      applyTransform();
      return { destroy: () => root.remove() };
    }

    const tick = now => {
      const delta = lastTime ? Math.min(now - lastTime, 50) : 16;
      lastTime = now;

      if (introProgress < 1) {
        introProgress = Math.min(1, introProgress + delta / INTRO_MS);
        if (introProgress >= 1) introDone = true;
      }

      if ((!canTrackPointer || !activePointer) && autoOrbit) {
        const elapsed = (now - startTime) / 1000;
        const orbit = elapsed * safeOrbitSpeed * Math.PI * 2;
        const fallbackAmount = canTrackPointer ? 0.28 : 0.65;
        target.x = baseRotation.x + Math.sin(orbit) * safeTilt * fallbackAmount;
        target.y = baseRotation.y + Math.cos(orbit * 0.85) * safeTilt * fallbackAmount;
      }

      current.x += (target.x - current.x) * safeSmoothing;
      current.y += (target.y - current.y) * safeSmoothing;

      const pushGoal = safePush > 0 && (hovered || pressed) ? Math.min(1, safePush + (pressed ? PRESS_EXTRA : 0)) : 0;
      let remaining = delta / 1000;
      while (remaining > 0) {
        const step = Math.min(remaining, 1 / 120);
        motion.velocity += (PUSH_STIFFNESS * (pushGoal - motion.push) - PUSH_DAMPING * motion.velocity) * step;
        motion.push += motion.velocity * step;
        remaining -= step;
      }
      const springIdle = Math.abs(pushGoal - motion.push) < 0.0005 && Math.abs(motion.velocity) < 0.002;
      if (springIdle) {
        motion.push = pushGoal;
        motion.velocity = 0;
      }

      const floatGoal = float && !hovered && !pressed ? 1 : 0;
      motion.float += (floatGoal - motion.float) * (1 - Math.exp(-delta / 1000 / FLOAT_EASE));
      if (Math.abs(floatGoal - motion.float) < 0.001) motion.float = floatGoal;

      applyGrow();
      applyTransform(now);

      const settled = Math.abs(target.x - current.x) < 0.001 && Math.abs(target.y - current.y) < 0.001;
      if (!autoOrbit && !motion.float && settled && springIdle && introProgress >= 1) {
        frameId = 0;
        return;
      }

      frameId = requestAnimationFrame(tick);
    };

    const start = () => {
      if (frameId || !visible) return;
      lastTime = 0;
      frameId = requestAnimationFrame(tick);
    };

    const handlePointerMove = event => {
      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      activePointer = true;
      const x = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.8), -1, 1);
      const y = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.8), -1, 1);

      target.x = baseRotation.x - y * safeTilt;
      target.y = baseRotation.y + x * safeTilt;
      start();
    };

    const handlePointerLeave = () => {
      activePointer = false;
      target.x = baseRotation.x;
      target.y = baseRotation.y;
      start();
    };

    const handleEnter = event => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      hovered = true;
      start();
    };

    const handleLeave = () => {
      hovered = false;
      pressed = false;
      start();
    };

    const handleDown = () => {
      pressed = true;
      start();
    };

    const handleUp = event => {
      pressed = false;
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') hovered = false;
      start();
    };

    if (canTrackPointer) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('blur', handlePointerLeave);
    }

    if (listensToHover) {
      root.addEventListener('pointerenter', handleEnter);
      root.addEventListener('pointerleave', handleLeave);
      root.addEventListener('pointerdown', handleDown);
      root.addEventListener('pointerup', handleUp);
    }

    let observer = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
        else if (frameId) {
          cancelAnimationFrame(frameId);
          frameId = 0;
        }
      });
      observer.observe(root);
    }

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        size = root.offsetHeight || 100;
      });
      resizeObserver.observe(root);
    }

    applyGrow();
    applyTransform();
    start();

    return {
      element: root,
      destroy: () => {
        if (frameId) cancelAnimationFrame(frameId);
        if (canTrackPointer) {
          window.removeEventListener('pointermove', handlePointerMove);
          window.removeEventListener('blur', handlePointerLeave);
        }
        if (listensToHover) {
          root.removeEventListener('pointerenter', handleEnter);
          root.removeEventListener('pointerleave', handleLeave);
          root.removeEventListener('pointerdown', handleDown);
          root.removeEventListener('pointerup', handleUp);
        }
        observer?.disconnect();
        resizeObserver?.disconnect();
        root.remove();
      }
    };
  }

  // Auto-initializer for declarative DOM elements
  function initAllDepthTexts() {
    const mounts = document.querySelectorAll('[data-depth-text]');
    mounts.forEach(mount => {
      if (mount.dataset.depthInitialized === 'true') return;
      mount.dataset.depthInitialized = 'true';

      const text = mount.dataset.depthText || mount.textContent.trim();
      if (!text) return;

      const faceColor = mount.dataset.faceColor || '#111111';
      const depthColor = mount.dataset.depthColor || '#FF5500';
      const fontSize = mount.dataset.fontSize || 'clamp(3rem, 6vw, 6rem)';
      const tilt = parseFloat(mount.dataset.tilt) || 8.0;
      const tiltX = mount.dataset.tiltX ? parseFloat(mount.dataset.tiltX) : undefined;
      const tiltY = mount.dataset.tiltY ? parseFloat(mount.dataset.tiltY) : undefined;
      const layers = parseInt(mount.dataset.layers, 10) || 26;
      const depth = parseFloat(mount.dataset.depth) || 2.0;

      // Ensure mount is wiped cleanly before building 3D depth text
      mount.innerHTML = '';

      createDepthText(mount, {
        text,
        faceColor,
        depthColor,
        fontSize,
        tilt,
        tiltX,
        tiltY,
        layers,
        depth,
        autoOrbit: true,
        hoverPush: 0.45,
        shadow: true
      });
    });
  }

  global.createDepthText = createDepthText;
  global.initAllDepthTexts = initAllDepthTexts;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllDepthTexts);
  } else {
    initAllDepthTexts();
  }
})(typeof window !== 'undefined' ? window : this);
