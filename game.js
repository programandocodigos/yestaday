import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

console.log("BOX FIGHT 3D - EXPANSÃO FASE 2 + LOJA CARREGADA");

// --- CONFIGURAÇÕES ---
const STATS = {
    PLAYER: { HP: 100, SPEED: 0.16, RELOAD: 2500, RADIUS: 0.8 },
    WEAPONS: {
        MAGNUM: { DAMAGE: 30, MAG: 10, TOTAL: 40, RATE: 400, AUTO: false, COLOR: 0x222222 },
        RIFLE: { DAMAGE: 15, MAG: 20, TOTAL: 80, RATE: 100, AUTO: true, COLOR: 0x444444 }
    },
    BOT: { HP: 100, DAMAGE: 40, SPEED: 0.1, ACCURACY: 0.55, SPREAD: 0.035, REACTION: 500, STOP_DIST: 12, STRAFE_SPEED: 0.06, RADIUS: 0.7 }
};

// --- ESTADO GLOBAL ---
let gameState = 'START';
let currentPhase = 1;
let coins = 0;
let playerHp = 100;
let currentMag = 10;
let reserveAmmo = 30;
let isReloading = false;
let currentWeapon = 'MAGNUM';
let isMoving = false;
let isJumping = false;
let isMouseDown = false;
let lastFireTime = 0;
const keys = {};

// --- ÁUDIO (SFX) ---
const somTiro = new Audio('https://cdn.pixabay.com/audio/2022/03/10/audio_783d10a102.mp3');
const somClick = new Audio('assets/click.mp3');
const somReload = new Audio('assets/reload.mp3');
const somVictory = document.getElementById('victory-audio');

somTiro.volume = 1.0;
somClick.volume = 0.3;
somReload.volume = 0.5;

let audioUnlocked = false;

function playSfx(type) {
    let target = null;
    if (type === 'shot') target = somTiro;
    if (type === 'click') target = somClick;
    if (type === 'reload') target = somReload;

    if (target) {
        target.currentTime = 0;
        target.play().catch(() => { });
    }
}

function unlockAudio() {
    if (audioUnlocked) return;
    [somTiro, somClick, somReload].forEach(a => {
        a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => { });
    });
    audioUnlocked = true;
}

// --- SETUP THREE.JS ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.FogExp2(0x020205, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const recoilGroup = new THREE.Group();
camera.add(recoilGroup);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.getElementById('game-container').appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);

// ILUMINAÇÃO
scene.add(new THREE.HemisphereLight(0xffffff, 0x080820, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(20, 50, 10);
sun.castShadow = true;
scene.add(sun);

let solidObjects = [];
let obstacleBoxes = [];

// --- 1. O MAPA ---
function generateMap() {
    solidObjects.forEach(o => scene.remove(o));
    solidObjects = []; obstacleBoxes = [];

    const floorGeo = new THREE.PlaneGeometry(120, 120);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a401a });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const addSolid = (mesh, x, z, y = 0) => {
        mesh.position.set(x, y, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        solidObjects.push(mesh);
        obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
    };

    // Obstáculos constantes
    for (let i = 0; i < 20; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
        trunk.position.y = 2.5;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), new THREE.MeshStandardMaterial({ color: 0x0a5d0a }));
        leaves.position.y = 6.5;
        tree.add(trunk, leaves);
        addSolid(tree, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90);
    }
    for (let i = 0; i < 15; i++) {
        const stone = new THREE.Mesh(new THREE.BoxGeometry(4, 5 + Math.random() * 5, 4), new THREE.MeshStandardMaterial({ color: 0x555555 }));
        addSolid(stone, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 2.5);
    }
}

// --- 2. JOGADOR: ARSENAL ---
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);

function updateWeaponModel() {
    weaponGroup.clear();
    const stats = STATS.WEAPONS[currentWeapon];
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });
    const iron = new THREE.MeshStandardMaterial({ color: stats.COLOR, metalness: 0.8, roughness: 0.2 });

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.2), skin);
    arm.position.set(0.6, -0.5, -0.5);
    weaponGroup.add(arm);

    if (currentWeapon === 'MAGNUM') {
        const gun = new THREE.Group();
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.6), iron);
        barrel.position.z = -0.5;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), iron);
        body.rotation.x = Math.PI / 2; body.position.z = -0.15;
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.12), wood);
        grip.position.set(0, -0.2, 0); grip.rotation.x = 0.3;
        gun.add(barrel, body, grip);
        gun.position.set(0.6, -0.35, -1.0);
        weaponGroup.add(gun);
    } else {
        // RIFLE
        const rifle = new THREE.Group();
        const mainBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 1.2), iron);
        mainBody.position.z = -0.5;
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.4), wood);
        stock.position.set(0, -0.1, 0.2);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0), iron);
        barrel.rotation.x = Math.PI / 2; barrel.position.z = -1.2;
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.2), iron);
        mag.position.set(0, -0.3, -0.4); mag.rotation.x = 0.2;
        rifle.add(mainBody, stock, barrel, mag);
        rifle.position.set(0.6, -0.35, -1.0);
        weaponGroup.add(rifle);
    }
}

// --- 3. BOT SISTEMA ---
class ArenaBot {
    constructor() {
        this.group = new THREE.Group();
        this.hp = 100;
        this.lastShot = 0;
        this.strafeDir = Math.random() < 0.5 ? 1 : -1;
        this.lastStrafeChange = 0;
        this.lastVisibleTime = 0;
        this.isPlayerVisible = false;

        const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69 });
        const clothes = new THREE.MeshStandardMaterial({ color: 0x111111 });
        this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), clothes);
        this.torso.position.y = 1.25;
        this.head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
        this.head.position.y = 1.9;
        this.group.add(this.torso, this.head);
        scene.add(this.group);
        this.respawn();
    }
    respawn() {
        this.hp = 100; this.group.visible = true;
        this.group.position.set((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 40 - 20);
    }
    onHit(dmg) {
        this.hp -= dmg;
        this.torso.material.color.set(0xff0000);
        setTimeout(() => this.torso.material.color.set(0x111111), 100);
        if (this.hp <= 0) {
            this.group.visible = false;
            coins += 50;
            updateUI();
            checkGameState();
        }
    }
    update() {
        if (!this.group.visible || gameState !== 'PLAYING') return;
        const dist = this.group.position.distanceTo(camera.position);
        const toPlayer = new THREE.Vector3().subVectors(camera.position, this.group.position).normalize();
        this.group.lookAt(camera.position.x, 0, camera.position.z);

        const ray = new THREE.Raycaster(this.group.position.clone().add(new THREE.Vector3(0, 1.7, 0)), toPlayer);
        const inter = ray.intersectObjects(solidObjects, true);
        this.isPlayerVisible = (inter.length === 0 || inter[0].distance > dist);

        if (dist > STATS.BOT.STOP_DIST || !this.isPlayerVisible) {
            const move = new THREE.Vector3(toPlayer.x, 0, toPlayer.z).multiplyScalar(STATS.BOT.SPEED);
            this.group.position.add(move);
        }

        if (Date.now() - this.lastStrafeChange > 1000 + Math.random() * 2000) {
            this.strafeDir *= -1; this.lastStrafeChange = Date.now();
        }
        const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toPlayer).normalize();
        this.group.position.add(right.multiplyScalar(this.strafeDir * STATS.BOT.STRAFE_SPEED));

        if (this.isPlayerVisible && Date.now() - this.lastShot > 1000) {
            this.lastShot = Date.now();
            if (Math.random() < STATS.BOT.ACCURACY) {
                playerHp -= STATS.BOT.DAMAGE;
                updateUI();
                checkGameState();
            }
        }
    }
}

let botsArray = [];

// --- MECÂNICAS ---
function handleShoot() {
    if (gameState !== 'PLAYING' || isReloading) return;
    const stats = STATS.WEAPONS[currentWeapon];

    if (Date.now() - lastFireTime < stats.RATE) return;

    if (currentMag <= 0) {
        playSfx('click');
        if (reserveAmmo > 0) handleReload();
        return;
    }

    playSfx('shot');
    currentMag--;
    lastFireTime = Date.now();
    updateUI();

    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const wallHits = ray.intersectObjects(solidObjects, true);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : Infinity;

    botsArray.forEach(b => {
        if (b.group.visible) {
            const hit = ray.intersectObject(b.group, true);
            if (hit.length > 0 && hit[0].distance < wallDist) {
                b.onHit(stats.DAMAGE);
            }
        }
    });

    if (currentMag === 0 && reserveAmmo > 0) handleReload();
}

function handleReload() {
    if (isReloading || reserveAmmo <= 0) return;
    const stats = STATS.WEAPONS[currentWeapon];
    isReloading = true;
    playSfx('reload');
    weaponGroup.position.y -= 0.2;
    setTimeout(() => {
        const need = stats.MAG - currentMag;
        const load = Math.min(need, reserveAmmo);
        currentMag += load; reserveAmmo -= load;
        isReloading = false;
        weaponGroup.position.y += 0.2;
        updateUI();
    }, STATS.PLAYER.RELOAD);
}

function updateUI() {
    document.getElementById('player-health-fill').style.width = Math.max(0, playerHp) + '%';
    document.getElementById('coin-count').innerText = coins;
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo;
    document.getElementById('phase-display').innerText = `FASE ${currentPhase}`;

    const aliveBot = botsArray.find(b => b.group.visible);
    if (aliveBot) {
        document.getElementById('bot-health-fill').style.width = aliveBot.hp + '%';
    } else {
        document.getElementById('bot-health-fill').style.width = '0%';
    }
}

function checkGameState() {
    if (playerHp <= 0) {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        controls.unlock();
        return;
    }
    const allDead = botsArray.every(b => !b.group.visible);
    if (allDead && gameState === 'PLAYING') {
        gameState = 'VICTORY';
        document.getElementById('victory-overlay').classList.remove('hidden');
        if (somVictory) somVictory.play().catch(() => { });
        controls.unlock();
    }
}

function resetGame(next = false) {
    if (next) currentPhase++; else currentPhase = 1;
    playerHp = 100;
    const stats = STATS.WEAPONS[currentWeapon];
    currentMag = stats.MAG;
    reserveAmmo = stats.TOTAL - stats.MAG;
    isReloading = false;

    document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
    gameState = 'PLAYING';
    camera.position.set(0, 1.7, 15);
    generateMap();

    botsArray.forEach(b => scene.remove(b.group));
    botsArray = [];
    const botCount = currentPhase === 1 ? 1 : 2;
    for (let i = 0; i < botCount; i++) botsArray.push(new ArenaBot());

    controls.lock();
    updateUI();
    updateWeaponModel();
}

// LOJA LOGIC
document.getElementById('shop-btn-vic').onclick = () => {
    document.getElementById('shop-overlay').classList.remove('hidden');
};
document.getElementById('close-shop').onclick = () => {
    document.getElementById('shop-overlay').classList.add('hidden');
};
document.getElementById('buy-pistol').onclick = () => {
    currentWeapon = 'MAGNUM';
    resetGame(false); // Retoma na fase atual
    document.getElementById('shop-overlay').classList.add('hidden');
};
document.getElementById('buy-rifle').onclick = () => {
    if (coins >= 50 || currentWeapon === 'RIFLE') {
        if (currentWeapon !== 'RIFLE') coins -= 50;
        currentWeapon = 'RIFLE';
        resetGame(false);
        document.getElementById('shop-overlay').classList.add('hidden');
    } else {
        alert("MOEDAS INSUFICIENTES!");
    }
};

// LISTENERS
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => {
    if (e.button === 0) {
        isMouseDown = true;
        unlockAudio();
        if (!STATS.WEAPONS[currentWeapon].AUTO) handleShoot();
    }
});
window.addEventListener('mouseup', e => { if (e.button === 0) isMouseDown = false; });
document.getElementById('start-btn').onclick = () => resetGame(false);
document.getElementById('retry-btn').onclick = () => resetGame(false);
document.getElementById('next-phase-btn').onclick = () => resetGame(true);
document.getElementById('reset-btn').onclick = () => { coins = 0; currentWeapon = 'MAGNUM'; resetGame(false); };

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        move();
        botsArray.forEach(b => b.update());
        if (isMouseDown && STATS.WEAPONS[currentWeapon].AUTO) handleShoot();
        weaponGroup.position.y = Math.sin(Date.now() * 0.005) * 0.01;
    }
    renderer.render(scene, camera);
}

function move() {
    if (!controls.isLocked) return;
    isMoving = false;
    const mv = new THREE.Vector3();
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    f.y = 0; r.y = 0; f.normalize(); r.normalize();
    if (keys['KeyW']) mv.add(f);
    if (keys['KeyS']) mv.sub(f);
    if (keys['KeyA']) mv.sub(r);
    if (keys['KeyD']) mv.add(r);
    if (mv.length() > 0) {
        const vel = mv.normalize().multiplyScalar(STATS.PLAYER.SPEED);
        const nextPos = camera.position.clone().add(vel);
        const pBox = new THREE.Box3().setFromCenterAndSize(nextPos, new THREE.Vector3(1, 2, 1));
        if (!obstacleBoxes.some(b => b.intersectsBox(pBox))) {
            camera.position.add(vel);
            isMoving = true;
        }
    }
    if (keys['Space'] && !isJumping) {
        isJumping = true;
        let v = 0.15;
        const j = setInterval(() => {
            camera.position.y += v; v -= 0.01;
            if (camera.position.y <= 1.7) { camera.position.y = 1.7; isJumping = false; clearInterval(j); }
        }, 16);
    }
}

generateMap();
updateWeaponModel();
loop();
