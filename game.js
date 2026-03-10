import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/PointerLockControls.js';

console.log("BOX FIGHT 3D - FASE 2 FIX + DUAL HUD");

// --- CONFIGURAÇÕES ---
const STATS = {
    PLAYER: { HP: 100, SPEED: 0.16, RELOAD: 2500, RADIUS: 0.8 },
    WEAPONS: {
        MAGNUM: { DAMAGE: 30, MAG: 10, TOTAL: 40, RATE: 400, AUTO: false, COLOR: 0x222222 },
        RIFLE: { DAMAGE: 15, MAG: 20, TOTAL: 80, RATE: 100, AUTO: true, COLOR: 0x444444 }
    },
    BOT: { HP: 100, DAMAGE: 15, SPEED: 0.08, ACCURACY: 0.4, SPREAD: 0.25, REACTION: 700, STOP_DIST: 18, STRAFE_SPEED: 0.05, RADIUS: 1.5 }
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
let combatReady = false;
const keys = {};

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
scene.add(new THREE.HemisphereLight(0xffffff, 0x080820, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(10, 100, 10);
sun.castShadow = true;
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
scene.add(sun);

let solidObjects = [];
let obstacleBoxes = [];

// --- 1. O MAPA ---
function generateMap() {
    solidObjects.forEach(o => scene.remove(o));
    solidObjects = [];
    obstacleBoxes = [];

    const floorGeo = new THREE.PlaneGeometry(500, 500);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a331a, roughness: 0.8, metalness: 0.1 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const addSolid = (mesh, x, z, y = 0) => {
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        solidObjects.push(mesh);
        const box = new THREE.Box3().setFromObject(mesh);
        obstacleBoxes.push(box);
    };

    for (let i = 0; i < 30; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 6, 8), new THREE.MeshStandardMaterial({ color: 0x2d1b10 }));
        trunk.position.y = 3;
        tree.add(trunk);
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x1b4d1b });
        const s1 = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), leafMat); s1.position.y = 5.5; tree.add(s1);
        const s2 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), leafMat); s2.position.set(0.5, 7, 0.5); tree.add(s2);
        addSolid(tree, (Math.random() - 0.5) * 150, (Math.random() - 0.5) * 150);
    }

    for (let i = 0; i < 25; i++) {
        const stoneSize = 2 + Math.random() * 4;
        const stoneGeo = new THREE.DodecahedronGeometry(stoneSize, 0);
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
        const stone = new THREE.Mesh(stoneGeo, stoneMat);
        stone.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        addSolid(stone, (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140, stoneSize * 0.5);
    }
}
window.generateMap = generateMap;

// --- 2. JOGADOR: ARSENAL ---
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);

function updateWeaponModel() {
    if (!weaponGroup) return;
    weaponGroup.clear();
    const stats = STATS.WEAPONS[currentWeapon];
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });
    const iron = new THREE.MeshStandardMaterial({ color: stats.COLOR, metalness: 0.8, roughness: 0.2 });

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.2), skin);
    arm.position.set(0.6, -0.5, -0.5);
    weaponGroup.add(arm);

    const gunGroup = new THREE.Group();
    if (currentWeapon === 'MAGNUM') {
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.6), iron);
        barrel.position.z = -0.5;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), iron);
        body.rotation.x = Math.PI / 2; body.position.z = -0.15;
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.12), wood);
        grip.position.set(0, -0.2, 0); grip.rotation.x = 0.3;
        gunGroup.add(barrel, body, grip);
    } else {
        const mainBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 1.2), iron);
        mainBody.position.z = -0.5;
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.4), wood);
        stock.position.set(0, -0.1, 0.2);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0), iron);
        barrel.rotation.x = Math.PI / 2; barrel.position.z = -1.2;
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.2), iron);
        mag.position.set(0, -0.3, -0.4); mag.rotation.x = 0.2;
        gunGroup.add(mainBody, stock, barrel, mag);
    }
    gunGroup.position.set(0.6, -0.35, -1.0);
    weaponGroup.add(gunGroup);
}
window.updateWeaponModel = updateWeaponModel;

// --- 3. BOT SISTEMA (Grounded Humanoid) ---
class ArenaBot {
    constructor(id) {
        this.id = id;
        this.group = new THREE.Group();
        this.hp = 100;
        this.lastShot = 0;
        this.strafeDir = Math.random() < 0.5 ? 1 : -1;
        this.lastStrafeChange = 0;
        this.isPlayerVisible = false;

        const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69 });
        const clothes = new THREE.MeshStandardMaterial({ color: 0x333333 });

        const legGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.8);
        this.legL = new THREE.Mesh(legGeo, clothes); this.legL.position.set(-0.2, 0.4, 0);
        this.legR = new THREE.Mesh(legGeo, clothes); this.legR.position.set(0.2, 0.4, 0);
        this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), clothes); this.torso.position.y = 1.25;
        this.head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin); this.head.position.y = 1.9;
        const armGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.7);
        this.armL = new THREE.Mesh(armGeo, skin); this.armL.position.set(-0.4, 1.3, 0);
        this.armR = new THREE.Mesh(armGeo, skin); this.armR.position.set(0.4, 1.3, 0);

        this.group.add(this.torso, this.head, this.legL, this.legR, this.armL, this.armR);
        this.group.scale.set(2.5, 2.5, 2.5); // BOT GIGANTE
        scene.add(this.group);
        this.respawn();
    }
    respawn() {
        this.hp = 100;
        this.group.visible = true;
        this.group.position.set((Math.random() - 0.5) * 80, 0, (Math.random() - 0.5) * 80 - 40);
        this.group.position.y = 0;
    }
    onHit(dmg) {
        this.hp -= dmg;
        this.torso.material.color.set(0xff00ff); // Feedback Magenta
        setTimeout(() => this.torso.material.color.set(0x333333), 100);
        if (this.hp <= 0) {
            this.group.visible = false;
            coins += 60;
            updateUI();
            checkGameState();
        }
    }
    update() {
        if (!this.group.visible || gameState !== 'PLAYING') return;
        const dist = this.group.position.distanceTo(camera.position);
        const toPlayer = new THREE.Vector3().subVectors(camera.position, this.group.position).normalize();

        const lookTarget = new THREE.Vector3(camera.position.x, 0, camera.position.z);
        const startQ = this.group.quaternion.clone();
        this.group.lookAt(lookTarget);
        const targetQ = this.group.quaternion.clone();
        this.group.quaternion.copy(startQ);
        this.group.quaternion.slerp(targetQ, 0.04);

        const ray = new THREE.Raycaster(this.group.position.clone().add(new THREE.Vector3(0, 4.5, 0)), toPlayer);
        const inter = ray.intersectObjects(solidObjects, true);
        this.isPlayerVisible = (inter.length === 0 || inter[0].distance > dist);

        if (dist > STATS.BOT.STOP_DIST || !this.isPlayerVisible) {
            const move = new THREE.Vector3(toPlayer.x, 0, toPlayer.z).multiplyScalar(STATS.BOT.SPEED);
            const nextBotPos = this.group.position.clone().add(move);
            const bBox = new THREE.Box3().setFromCenterAndSize(nextBotPos, new THREE.Vector3(2, 5, 2));
            if (!obstacleBoxes.some(box => box.intersectsBox(bBox))) {
                this.group.position.add(move);
            }
        }
        this.group.position.y = 0;

        if (Date.now() - this.lastStrafeChange > 1500) {
            this.strafeDir *= -1; this.lastStrafeChange = Date.now();
        }
        const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toPlayer).normalize();
        this.group.position.add(right.multiplyScalar(this.strafeDir * STATS.BOT.STRAFE_SPEED));

        // TIRO SOMENTE SE COMBAT READY
        if (combatReady && this.isPlayerVisible && Date.now() - this.lastShot > 1500) {
            this.lastShot = Date.now();
            if (Math.random() < 0.4) {
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
    if (currentMag <= 0) { if (reserveAmmo > 0) handleReload(); return; }
    const stats = STATS.WEAPONS[currentWeapon];
    if (Date.now() - lastFireTime < stats.RATE) return;

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
            if (hit.length > 0 && hit[0].distance < wallDist) b.onHit(stats.DAMAGE);
        }
    });

    if (currentMag === 0 && reserveAmmo > 0) handleReload();
}

function handleReload() {
    if (isReloading || reserveAmmo <= 0) return;
    isReloading = true;
    weaponGroup.position.y -= 0.2;
    setTimeout(() => {
        const stats = STATS.WEAPONS[currentWeapon];
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

    // HUD BOT A
    if (botsArray[0]) {
        document.getElementById('bot-health-fill-a').style.width = Math.max(0, botsArray[0].hp) + '%';
    }

    // HUD BOT B
    const botBContainer = document.getElementById('bot-b-container');
    if (currentPhase >= 2 && botsArray[1]) {
        botBContainer.classList.remove('hidden');
        document.getElementById('bot-health-fill-b').style.width = Math.max(0, botsArray[1].hp) + '%';
    } else {
        botBContainer.classList.add('hidden');
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
        controls.unlock();
    }
}

function resetGame(next = false) {
    if (next) { currentPhase++; } else { currentPhase = 1; playerHp = 100; coins = 0; }

    gameState = 'PLAYING';
    isReloading = false;
    combatReady = false;
    currentMag = STATS.WEAPONS[currentWeapon].MAG;
    reserveAmmo = STATS.WEAPONS[currentWeapon].TOTAL - currentMag;

    document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
    camera.position.set(0, 1.7, 15);
    camera.lookAt(0, 1.7, 0);

    generateMap();
    botsArray.forEach(b => { if (b.group) scene.remove(b.group); });
    botsArray = [];

    const botCount = currentPhase === 1 ? 1 : 2;
    for (let i = 0; i < botCount; i++) {
        botsArray.push(new ArenaBot(i));
    }

    if (controls) controls.lock();
    updateUI();
    updateWeaponModel();

    // SISTEMA DE ESPERA (5 SEGUNDOS)
    const overlay = document.getElementById('countdown-overlay');
    const text = document.getElementById('countdown-text');
    overlay.classList.remove('hidden');
    let count = 5;
    text.innerText = `O COMBATE COMEÇA EM ${count}...`;

    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            text.innerText = `O COMBATE COMEÇA EM ${count}...`;
        } else {
            clearInterval(timer);
            overlay.classList.add('hidden');
            combatReady = true;
        }
    }, 1000);
}
window.resetGame = resetGame;

// LOJA
document.getElementById('shop-btn-vic').onclick = () => document.getElementById('shop-overlay').classList.remove('hidden');
document.getElementById('close-shop').onclick = () => document.getElementById('shop-overlay').classList.add('hidden');
document.getElementById('buy-pistol').onclick = (e) => { e.stopPropagation(); currentWeapon = 'MAGNUM'; resetGame(false); document.getElementById('shop-overlay').classList.add('hidden'); };
document.getElementById('buy-rifle').onclick = (e) => {
    e.stopPropagation();
    if (coins >= 50 || currentWeapon === 'RIFLE') {
        if (currentWeapon !== 'RIFLE') coins -= 50;
        currentWeapon = 'RIFLE'; resetGame(false); document.getElementById('shop-overlay').classList.add('hidden');
    } else { alert("MOEDAS INSUFICIENTES!"); }
};

// LISTENERS
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => { if (e.button === 0) { isMouseDown = true; if (!STATS.WEAPONS[currentWeapon].AUTO) handleShoot(); } });
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
    const direction = new THREE.Vector3();
    const front = new THREE.Vector3();
    const right = new THREE.Vector3();
    camera.getWorldDirection(front);
    front.y = 0; front.normalize();
    right.crossVectors(camera.up, front).normalize().negate();

    if (keys['KeyW']) direction.add(front);
    if (keys['KeyS']) direction.sub(front);
    if (keys['KeyA']) direction.sub(right);
    if (keys['KeyD']) direction.add(right);

    if (direction.length() > 0) {
        direction.normalize().multiplyScalar(STATS.PLAYER.SPEED);
        const nextPos = camera.position.clone().add(direction);
        const pBox = new THREE.Box3().setFromCenterAndSize(nextPos, new THREE.Vector3(STATS.PLAYER.RADIUS * 2, 2, STATS.PLAYER.RADIUS * 2));
        if (!obstacleBoxes.some(box => box.intersectsBox(pBox))) { camera.position.add(direction); isMoving = true; }
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

try { generateMap(); updateWeaponModel(); loop(); console.log("GAME ENGINE STARTED"); } catch (e) { console.error("CRITICAL ERROR:", e); if (typeof loop === 'function') loop(); }
