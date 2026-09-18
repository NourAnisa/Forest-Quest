(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const ui = {
    menu: document.getElementById('menuScreen'),
    guide: document.getElementById('guideScreen'),
    status: document.getElementById('statusScreen'),
    hud: document.getElementById('hud'),
    touch: document.getElementById('touchControls'),
    message: document.getElementById('messageBanner'),
    level: document.getElementById('levelText'),
    health: document.getElementById('healthBar'),
    resourceLabel: document.getElementById('resourceLabel'),
    resource: document.getElementById('resourceText'),
    enemy: document.getElementById('enemyText'),
    statusChapter: document.getElementById('statusChapter'),
    statusTitle: document.getElementById('statusTitle'),
    statusDescription: document.getElementById('statusDescription'),
    statusActions: document.getElementById('statusActions'),
    sound: document.getElementById('soundButton')
  };

  const W = canvas.width;
  const H = canvas.height;
  const keys = new Set();
  let soundOn = true;
  let audioContext = null;
  let state = 'menu';
  let lastTime = 0;
  let levelIndex = 0;
  let world = null;
  let messageTimer = 0;

  const palette = {
    grass: ['#173d2a', '#1b4a31'],
    ruins: ['#253b38', '#314942'],
    grove: ['#162f33', '#1d4144']
  };

  const levels = [
    {
      name: 'Rimbun Awal',
      subtitle: 'Pengenalan eksplorasi dan koleksi',
      floor: 'grass',
      resourceName: 'Herbal',
      resourceColor: '#9be564',
      target: 5,
      enemyCount: 2,
      enemySpeed: 46,
      obstacles: [
        [250, 120, 90, 150], [540, 300, 140, 70], [725, 95, 85, 160]
      ],
      playerStart: [80, 460],
      portal: [875, 70],
      message: 'Kumpulkan 5 herbal, lalu masuk ke portal.'
    },
    {
      name: 'Desa Sunyi',
      subtitle: 'Kombinasi koleksi, rintangan, dan pertarungan',
      floor: 'ruins',
      resourceName: 'Perbekalan',
      resourceColor: '#ffd166',
      target: 6,
      enemyCount: 4,
      enemySpeed: 58,
      obstacles: [
        [130, 90, 170, 85], [400, 60, 110, 180], [590, 330, 220, 85], [200, 350, 130, 90]
      ],
      playerStart: [70, 270],
      portal: [875, 470],
      message: 'Cari 6 perbekalan dan taklukkan seluruh bayangan.'
    },
    {
      name: 'Gerbang Purba',
      subtitle: 'Penguasaan seluruh mekanik',
      floor: 'grove',
      resourceName: 'Kristal',
      resourceColor: '#7bdff2',
      target: 7,
      enemyCount: 6,
      enemySpeed: 70,
      obstacles: [
        [155, 80, 80, 280], [335, 180, 95, 300], [530, 60, 90, 290], [715, 210, 90, 280]
      ],
      playerStart: [65, 475],
      portal: [890, 65],
      message: 'Pulihkan 7 kristal dan bersihkan Gerbang Purba.'
    }
  ];

  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function circleRectCollision(circle, rect) {
    const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
    const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
    return Math.hypot(circle.x - closestX, circle.y - closestY) < circle.r;
  }

  function positionIsClear(x, y, radius, obstacles, others = []) {
    const probe = { x, y, r: radius };
    if (x < radius + 25 || x > W - radius - 25 || y < radius + 55 || y > H - radius - 25) return false;
    if (obstacles.some(obstacle => circleRectCollision(probe, obstacle))) return false;
    return !others.some(other => Math.hypot(x - other.x, y - other.y) < radius + other.r + 25);
  }

  function findOpenPosition(radius, obstacles, others = []) {
    for (let attempt = 0; attempt < 250; attempt += 1) {
      const x = rand(45, W - 45);
      const y = rand(75, H - 45);
      if (positionIsClear(x, y, radius, obstacles, others)) return { x, y };
    }
    return { x: W / 2, y: H / 2 };
  }

  function buildWorld(index) {
    const config = levels[index];
    const obstacles = config.obstacles.map(([x, y, w, h]) => ({ x, y, w, h }));
    const player = {
      x: config.playerStart[0], y: config.playerStart[1], r: 16,
      speed: 185, health: 100, facingX: 1, facingY: 0,
      attackCooldown: 0, invulnerable: 0
    };
    const resources = [];
    for (let i = 0; i < config.target; i += 1) {
      const pos = findOpenPosition(10, obstacles, [player, ...resources]);
      resources.push({ ...pos, r: 10, phase: rand(0, Math.PI * 2), collected: false });
    }
    const enemies = [];
    for (let i = 0; i < config.enemyCount; i += 1) {
      const pos = findOpenPosition(15, obstacles, [player, ...resources, ...enemies]);
      enemies.push({ ...pos, r: 15, health: index === 2 ? 3 : 2, speed: config.enemySpeed + rand(-6, 8), flash: 0 });
    }
    return {
      config, obstacles, player, resources, enemies,
      collected: 0, portalOpen: false, attacks: [], particles: [], elapsed: 0
    };
  }

  function showMessage(text, seconds = 2.5) {
    ui.message.textContent = text;
    ui.message.classList.remove('is-hidden');
    messageTimer = seconds;
  }

  function tone(frequency, duration = 0.08, type = 'sine', volume = 0.05) {
    if (!soundOn) return;
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  }

  function setScreen(active) {
    [ui.menu, ui.guide, ui.status].forEach(screen => screen.classList.add('is-hidden'));
    if (active) active.classList.remove('is-hidden');
  }

  function startGame() {
    levelIndex = 0;
    loadLevel(levelIndex);
  }

  function loadLevel(index) {
    levelIndex = index;
    world = buildWorld(index);
    state = 'playing';
    setScreen(null);
    ui.hud.classList.remove('is-hidden');
    ui.touch.classList.remove('is-hidden');
    updateHud();
    showMessage(`Level ${index + 1}: ${world.config.name}. ${world.config.message}`, 4);
    canvas.focus();
    tone(440, 0.12, 'triangle', 0.04);
  }

  function updateHud() {
    if (!world) return;
    ui.level.textContent = `${levelIndex + 1}/${levels.length}`;
    ui.health.style.transform = `scaleX(${world.player.health / 100})`;
    ui.resourceLabel.textContent = world.config.resourceName;
    ui.resource.textContent = `${world.collected}/${world.config.target}`;
    ui.enemy.textContent = String(world.enemies.length);
  }

  function addAction(label, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = className;
    button.addEventListener('click', handler);
    ui.statusActions.appendChild(button);
  }

  function openStatus(chapter, title, description, actions) {
    ui.statusChapter.textContent = chapter;
    ui.statusTitle.textContent = title;
    ui.statusDescription.textContent = description;
    ui.statusActions.replaceChildren();
    actions.forEach(action => addAction(action.label, action.primary ? 'primary-button' : 'secondary-button', action.handler));
    setScreen(ui.status);
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    openStatus('Permainan Dijeda', 'Rute masih menunggu', 'Lanjutkan permainan, ulangi level, atau kembali ke menu utama.', [
      { label: 'Lanjutkan', primary: true, handler: resumeGame },
      { label: 'Ulangi Level', handler: () => loadLevel(levelIndex) },
      { label: 'Menu Utama', handler: returnToMenu }
    ]);
  }

  function resumeGame() {
    state = 'playing';
    setScreen(null);
    canvas.focus();
  }

  function returnToMenu() {
    state = 'menu';
    world = null;
    ui.hud.classList.add('is-hidden');
    ui.touch.classList.add('is-hidden');
    ui.message.classList.add('is-hidden');
    setScreen(ui.menu);
  }

  function gameOver() {
    state = 'gameOver';
    tone(110, 0.5, 'sawtooth', 0.05);
    openStatus('Energi Habis', 'Penjaga hutan perlu mencoba lagi', 'Pelajari pola gerak musuh dan gunakan rintangan sebagai perlindungan.', [
      { label: 'Ulangi Level', primary: true, handler: () => loadLevel(levelIndex) },
      { label: 'Menu Utama', handler: returnToMenu }
    ]);
  }

  function completeLevel() {
    state = 'levelComplete';
    tone(660, 0.18, 'triangle', 0.05);
    if (levelIndex === levels.length - 1) {
      openStatus('Misi Selesai', 'Gerbang hutan telah pulih', 'Kamu menuntaskan tiga level dan menguasai seluruh mekanik Forest Quest.', [
        { label: 'Main Lagi', primary: true, handler: startGame },
        { label: 'Menu Utama', handler: returnToMenu }
      ]);
    } else {
      openStatus(`Level ${levelIndex + 1} Selesai`, 'Portal membuka jalur baru', 'Level berikutnya menggabungkan mekanik lama dengan tantangan yang lebih kompleks.', [
        { label: `Lanjut ke Level ${levelIndex + 2}`, primary: true, handler: () => loadLevel(levelIndex + 1) },
        { label: 'Ulangi Level', handler: () => loadLevel(levelIndex) }
      ]);
    }
  }

  function attemptMove(entity, dx, dy) {
    const oldX = entity.x;
    entity.x = clamp(entity.x + dx, entity.r + 12, W - entity.r - 12);
    if (world.obstacles.some(obstacle => circleRectCollision(entity, obstacle))) entity.x = oldX;
    const oldY = entity.y;
    entity.y = clamp(entity.y + dy, entity.r + 55, H - entity.r - 12);
    if (world.obstacles.some(obstacle => circleRectCollision(entity, obstacle))) entity.y = oldY;
  }

  function attack() {
    if (state !== 'playing' || world.player.attackCooldown > 0) return;
    const player = world.player;
    player.attackCooldown = 0.45;
    const magnitude = Math.hypot(player.facingX, player.facingY) || 1;
    world.attacks.push({
      x: player.x + (player.facingX / magnitude) * 28,
      y: player.y + (player.facingY / magnitude) * 28,
      r: 9, life: 0.42, speed: 380,
      vx: (player.facingX / magnitude) * 380,
      vy: (player.facingY / magnitude) * 380
    });
    tone(240, 0.07, 'square', 0.03);
  }

  function burst(x, y, color, count = 8) {
    for (let i = 0; i < count; i += 1) {
      world.particles.push({ x, y, color, life: rand(0.25, 0.55), vx: rand(-75, 75), vy: rand(-75, 75), size: rand(2, 5) });
    }
  }

  function update(dt) {
    if (state !== 'playing' || !world) return;
    world.elapsed += dt;
    const player = world.player;
    player.attackCooldown = Math.max(0, player.attackCooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);

    let xAxis = 0;
    let yAxis = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) xAxis -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) xAxis += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) yAxis -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) yAxis += 1;
    if (xAxis || yAxis) {
      const magnitude = Math.hypot(xAxis, yAxis);
      xAxis /= magnitude;
      yAxis /= magnitude;
      player.facingX = xAxis;
      player.facingY = yAxis;
      attemptMove(player, xAxis * player.speed * dt, yAxis * player.speed * dt);
    }

    world.resources.forEach(resource => {
      if (!resource.collected && distance(player, resource) < player.r + resource.r + 5) {
        resource.collected = true;
        world.collected += 1;
        burst(resource.x, resource.y, world.config.resourceColor, 12);
        tone(620 + world.collected * 35, 0.12, 'sine', 0.04);
        showMessage(`${world.config.resourceName} ditemukan: ${world.collected}/${world.config.target}`, 1.4);
      }
    });

    world.enemies.forEach(enemy => {
      enemy.flash = Math.max(0, enemy.flash - dt);
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const length = Math.hypot(dx, dy) || 1;
      if (length < 310) attemptMove(enemy, (dx / length) * enemy.speed * dt, (dy / length) * enemy.speed * dt);
      if (length < player.r + enemy.r + 3 && player.invulnerable <= 0) {
        player.health = Math.max(0, player.health - 18);
        player.invulnerable = 0.9;
        burst(player.x, player.y, '#ff6b6b', 10);
        tone(95, 0.16, 'sawtooth', 0.05);
        showMessage('Energi berkurang. Jaga jarak dari musuh!', 1.4);
        if (player.health <= 0) gameOver();
      }
    });

    world.attacks.forEach(shot => {
      shot.life -= dt;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (world.obstacles.some(obstacle => circleRectCollision(shot, obstacle))) shot.life = 0;
      world.enemies.forEach(enemy => {
        if (shot.life > 0 && distance(shot, enemy) < shot.r + enemy.r) {
          shot.life = 0;
          enemy.health -= 1;
          enemy.flash = 0.1;
          burst(enemy.x, enemy.y, '#b388eb', 7);
        }
      });
    });
    world.attacks = world.attacks.filter(shot => shot.life > 0 && shot.x > 0 && shot.x < W && shot.y > 0 && shot.y < H);
    const defeated = world.enemies.filter(enemy => enemy.health <= 0);
    defeated.forEach(enemy => { burst(enemy.x, enemy.y, '#f4a261', 14); tone(150, 0.09, 'triangle', 0.03); });
    world.enemies = world.enemies.filter(enemy => enemy.health > 0);

    world.particles.forEach(particle => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.97;
      particle.vy *= 0.97;
    });
    world.particles = world.particles.filter(particle => particle.life > 0);

    const objectivesMet = world.collected >= world.config.target && world.enemies.length === 0;
    if (objectivesMet && !world.portalOpen) {
      world.portalOpen = true;
      showMessage('Portal terbuka! Masuki cahaya untuk melanjutkan.', 3.2);
      tone(880, 0.25, 'sine', 0.04);
    }
    if (world.portalOpen && Math.hypot(player.x - world.config.portal[0], player.y - world.config.portal[1]) < 35) completeLevel();
    updateHud();
  }

  function drawBackground() {
    const colors = world ? palette[world.config.floor] : palette.grass;
    const gradient = ctx.createLinearGradient(0, 0, W, H);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#d9ed92';
    for (let i = 0; i < 90; i += 1) {
      const x = (i * 113) % W;
      const y = 55 + ((i * 67) % (H - 55));
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawObstacle(obstacle, index) {
    ctx.fillStyle = world.config.floor === 'ruins' ? '#5a6761' : '#315c3c';
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
    ctx.fillStyle = world.config.floor === 'ruins' ? '#77847c' : '#477a4f';
    ctx.fillRect(obstacle.x + 7, obstacle.y + 7, obstacle.w - 14, 12);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#07120e';
    for (let i = 18; i < obstacle.w - 10; i += 30) ctx.fillRect(obstacle.x + i, obstacle.y + 28 + (index % 2) * 8, 8, obstacle.h - 42);
    ctx.globalAlpha = 1;
  }

  function drawPortal() {
    const [x, y] = world.config.portal;
    const pulse = 1 + Math.sin(world.elapsed * 5) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = world.portalOpen ? 0.28 : 0.1;
    ctx.fillStyle = world.portalOpen ? '#7bdff2' : '#758078';
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = world.portalOpen ? '#b8f2e6' : '#657269';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = world.portalOpen ? '#eef8df' : '#758078';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawResource(resource) {
    if (resource.collected) return;
    const bob = Math.sin(world.elapsed * 3 + resource.phase) * 3;
    ctx.save();
    ctx.translate(resource.x, resource.y + bob);
    ctx.rotate(Math.PI / 4);
    ctx.shadowColor = world.config.resourceColor;
    ctx.shadowBlur = 14;
    ctx.fillStyle = world.config.resourceColor;
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();
  }

  function drawEnemy(enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.fillStyle = enemy.flash > 0 ? '#ffffff' : '#6a4c93';
    ctx.beginPath(); ctx.arc(0, 0, enemy.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8c4f0';
    ctx.beginPath(); ctx.arc(-5, -3, 3, 0, Math.PI * 2); ctx.arc(5, -3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a173d';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 4, 6, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    const player = world.player;
    ctx.save();
    ctx.globalAlpha = player.invulnerable > 0 && Math.floor(world.elapsed * 12) % 2 ? 0.35 : 1;
    ctx.translate(player.x, player.y);
    ctx.fillStyle = '#f4a261';
    ctx.beginPath(); ctx.arc(0, 0, player.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#264653';
    ctx.beginPath(); ctx.arc(-5, -3, 2.5, 0, Math.PI * 2); ctx.arc(5, -3, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e9c46a';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(player.facingX * 23, player.facingY * 23); ctx.stroke();
    ctx.restore();
  }

  function drawWorld() {
    drawBackground();
    if (!world) {
      ctx.fillStyle = 'rgba(143, 209, 79, 0.12)';
      ctx.beginPath(); ctx.arc(790, 180, 145, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(725, 390, 220, 0, Math.PI * 2); ctx.fill();
      return;
    }
    drawPortal();
    world.obstacles.forEach(drawObstacle);
    world.resources.forEach(drawResource);
    world.enemies.forEach(drawEnemy);
    world.attacks.forEach(shot => {
      ctx.fillStyle = '#ffe66d';
      ctx.beginPath(); ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2); ctx.fill();
    });
    drawPlayer();
    world.particles.forEach(particle => {
      ctx.globalAlpha = clamp(particle.life * 3, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(4, 15, 10, 0.65)';
    ctx.fillRect(20, H - 44, 440, 28);
    ctx.fillStyle = '#eef8df';
    ctx.font = '700 14px system-ui';
    ctx.fillText(`${world.config.name}: ${world.config.subtitle}`, 32, H - 25);
  }

  function frame(time) {
    const dt = Math.min((time - lastTime) / 1000 || 0, 0.033);
    lastTime = time;
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) ui.message.classList.add('is-hidden');
    }
    update(dt);
    drawWorld();
    requestAnimationFrame(frame);
  }

  document.getElementById('startButton').addEventListener('click', startGame);
  document.getElementById('guideButton').addEventListener('click', () => setScreen(ui.guide));
  document.getElementById('guideBackButton').addEventListener('click', () => setScreen(ui.menu));
  document.getElementById('pauseButton').addEventListener('click', pauseGame);
  ui.sound.addEventListener('click', () => {
    soundOn = !soundOn;
    ui.sound.textContent = `Suara: ${soundOn ? 'Aktif' : 'Mati'}`;
    if (soundOn) tone(520, 0.08, 'sine', 0.03);
  });

  window.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.code === 'Space' && !event.repeat) attack();
    if (event.code === 'KeyP' && !event.repeat) state === 'playing' ? pauseGame() : state === 'paused' ? resumeGame() : null;
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); if (state === 'playing') pauseGame(); });

  document.querySelectorAll('[data-key]').forEach(button => {
    const code = button.dataset.key;
    const press = event => { event.preventDefault(); keys.add(code); if (code === 'Space') attack(); };
    const release = event => { event.preventDefault(); keys.delete(code); };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
  });

  drawWorld();
  requestAnimationFrame(frame);
})();
