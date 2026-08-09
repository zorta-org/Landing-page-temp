(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============================================================
     MOBILE NAV TOGGLE
     ============================================================ */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('is-open');
    navToggle.classList.toggle('is-open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('is-open');
      navToggle.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* ============================================================
     SCROLL REVEAL
     ============================================================ */
  const revealSelectors = [
    '.section__head', '.card', '.band p',
    '.rewards__text', '.rewards__visual', '.ecosystem .orbit'
  ];
  const revealEls = document.querySelectorAll(revealSelectors.join(','));

  if (prefersReducedMotion) {
    revealEls.forEach(el => el.classList.add('is-visible'));
  } else {
    revealEls.forEach(el => el.classList.add('reveal'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(el => io.observe(el));
  }

  /* ============================================================
     ORBIT CONVERGENCE ANIMATION (signature element)
     Badges ring the ZORTA core; as the section scrolls through
     the viewport, they spiral inward and fade into the core.
     Scrolling back out reverses the motion.
     ============================================================ */
  const orbit = document.getElementById('orbit');
  const core = orbit.querySelector('.orbit__core');
  const badges = Array.from(orbit.querySelectorAll('.orbit__badge'));
  const caption = document.getElementById('orbitCaption');

  const SPIRAL_DRIFT = -55; // degrees of extra swirl added while converging

  function layoutBadges(progress) {
    const box = orbit.getBoundingClientRect();
    const baseRadius = box.width * 0.42;
    const radius = baseRadius * (1 - progress);

    badges.forEach(badge => {
      const angleDeg = parseFloat(badge.dataset.angle) + progress * SPIRAL_DRIFT;
      const angleRad = (angleDeg * Math.PI) / 180;
      const x = Math.cos(angleRad) * radius;
      const y = Math.sin(angleRad) * radius;
      const scale = 1 - progress * 0.55;
      const opacity = Math.max(0, 1 - progress * 1.35);

      badge.style.transform =
        `translate(-50%,-50%) translate(${x}px, ${y}px) scale(${scale})`;
      badge.style.opacity = opacity.toFixed(3);
    });

    orbit.classList.toggle('is-converged', progress > 0.92);
    if (caption) {
      caption.textContent = progress > 0.92
        ? 'One interface. Every capability.'
        : 'Scroll to bring your stack home.';
    }
  }

  function computeProgress() {
    const rect = orbit.getBoundingClientRect();
    const vh = window.innerHeight;
    const p0 = vh * 0.88;  // orbit top at this viewport y -> progress 0
    const p1 = vh * 0.30;  // orbit top at this viewport y -> progress 1
    const raw = (p0 - rect.top) / (p0 - p1);
    return Math.min(1, Math.max(0, raw));
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      layoutBadges(prefersReducedMotion ? 1 : computeProgress());
      ticking = false;
    });
  }

  if (prefersReducedMotion) {
    // Respect reduced motion: settle into the converged end-state, no scroll-driven motion.
    layoutBadges(1);
  } else {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  /* ============================================================
     HERO WIREFRAME SPHERE
     Lightweight 3D wireframe rendered on canvas — latitude rings
     + longitude meridians, slow auto-rotation, brand-tinted
     depth shading (teal far side -> pink-white near rim).
     ============================================================ */
  const canvas = document.getElementById('sphere');
  const ctx = canvas.getContext('2d');

  const LAT_RINGS = 7;
  const LON_MERIDIANS = 12;
  const SEGMENTS = 48;

  function buildLines() {
    const lines = [];

    // latitude rings (horizontal circles)
    for (let i = 1; i <= LAT_RINGS; i++) {
      const phi = -Math.PI / 2 + (Math.PI * i) / (LAT_RINGS + 1);
      const ring = [];
      for (let s = 0; s <= SEGMENTS; s++) {
        const theta = (2 * Math.PI * s) / SEGMENTS;
        ring.push([
          Math.cos(phi) * Math.cos(theta),
          Math.sin(phi),
          Math.cos(phi) * Math.sin(theta)
        ]);
      }
      lines.push(ring);
    }

    // longitude meridians (vertical arcs)
    for (let j = 0; j < LON_MERIDIANS; j++) {
      const theta = (2 * Math.PI * j) / LON_MERIDIANS;
      const meridian = [];
      for (let s = 0; s <= SEGMENTS; s++) {
        const phi = -Math.PI / 2 + (Math.PI * s) / SEGMENTS;
        meridian.push([
          Math.cos(phi) * Math.cos(theta),
          Math.sin(phi),
          Math.cos(phi) * Math.sin(theta)
        ]);
      }
      lines.push(meridian);
    }

    return lines;
  }

  const lines = buildLines();
  const TILT = 0.34; // fixed slight tilt on X axis for a pleasant viewing angle
  let rotY = 0.6;

  function rotatePoint([x, y, z], rx, ry) {
    // rotate around Y
    let cosY = Math.cos(ry), sinY = Math.sin(ry);
    let x1 = x * cosY + z * sinY;
    let z1 = -x * sinY + z * cosY;
    // rotate around X
    let cosX = Math.cos(rx), sinX = Math.sin(rx);
    let y1 = y * cosX - z1 * sinX;
    let z2 = y * sinX + z1 * cosX;
    return [x1, y1, z2];
  }

  function drawSphere() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.42;
    const perspective = 2.6;

    lines.forEach(line => {
      for (let i = 0; i < line.length - 1; i++) {
        const p1 = rotatePoint(line[i], TILT, rotY);
        const p2 = rotatePoint(line[i + 1], TILT, rotY);

        const avgZ = (p1[2] + p2[2]) / 2; // -1 (far) .. 1 (near)
        const depth = (avgZ + 1) / 2;      // 0..1

        const scale1 = perspective / (perspective - p1[2]);
        const scale2 = perspective / (perspective - p2[2]);

        const sx1 = cx + p1[0] * R * scale1;
        const sy1 = cy + p1[1] * R * scale1;
        const sx2 = cx + p2[0] * R * scale2;
        const sy2 = cy + p2[1] * R * scale2;

        // depth-tinted stroke: far side muted teal, near side pink-white rim
        const r = Math.round(63 + depth * (255 - 63));
        const g = Math.round(143 + depth * (200 - 143));
        const b = Math.round(166 + depth * (243 - 166));
        const alpha = 0.12 + depth * 0.55;

        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = 0.8 + depth * 0.9;
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      }
    });
  }

  function animateSphere() {
    rotY += 0.0022;
    drawSphere();
    requestAnimationFrame(animateSphere);
  }

  // Fixed internal drawing resolution; CSS (max-width:100%) handles display size.
  canvas.width = 480;
  canvas.height = 480;

  if (prefersReducedMotion) {
    drawSphere();
  } else {
    animateSphere();
  }
})();
