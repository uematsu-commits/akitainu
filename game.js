// キャンバスとコンテキストの取得
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// キャンバスサイズの設定
canvas.width = 800;
canvas.height = 600;

// ==================== AssetManagerクラス ====================
class AssetManager {
    constructor() {
        this.images = {};
        this.loadedCount = 0;
        this.totalCount = 0;
        this.onComplete = null;
    }

    // 画像パス定義 (.pngを使用)
    getImageAssets() {
        return {
            player_normal: 'assets/player_normal.png',
            player_attack: 'assets/player_attack.png',
            enemy_crow: 'assets/enemy_crow.png',
            enemy_cat: 'assets/enemy_cat.png',
            item_egg: 'assets/item_egg.png',
            item_yogurt: 'assets/item_yogurt.png',
            item_chicken: 'assets/item_chicken.png',
            ground: 'assets/ground.png',
            goal: 'assets/goal.png'
        };
    }

    // 画像を読み込む
    loadImages(onComplete) {
        this.onComplete = onComplete;
        const imageAssets = this.getImageAssets();
        this.totalCount = Object.keys(imageAssets).length;
        this.loadedCount = 0;

        for (const [key, url] of Object.entries(imageAssets)) {
            const img = new Image();
            
            img.onload = () => {
                this.images[key] = img;
                this.loadedCount++;
                console.log(`画像読み込み完了: ${key}`);
                this.checkComplete();
            };
            
            img.onerror = () => {
                console.error(`画像の読み込みに失敗しました: ${url}`);
                this.images[key] = null; 
                this.loadedCount++;
                this.checkComplete();
            };
            
            img.src = url;
        }
    }

    checkComplete() {
        if (this.loadedCount === this.totalCount) {
            console.log('すべての画像の読み込み処理が完了しました');
            if (this.onComplete) this.onComplete();
        }
    }

    getImage(key) { return this.images[key] || null; }
    getProgress() { return this.totalCount === 0 ? 0 : this.loadedCount / this.totalCount; }
    isLoaded() { return this.loadedCount === this.totalCount && this.totalCount > 0; }
}

const assetManager = new AssetManager();

// ==================== ゲーム設定 ====================
const GAME_STATE = { START: 'START', PLAYING: 'PLAYING', GAME_OVER: 'GAME_OVER', GAME_CLEAR: 'GAME_CLEAR', STAGE_CLEAR: 'STAGE_CLEAR' };
const gameState = { state: GAME_STATE.START, cameraX: 0, keys: {}, score: 0, stage: 1 };

// ステージに応じたゴール位置を計算する関数
function getGoalX(stage) {
    // ステージ1: 3000px, ステージ2: 4000px, ステージ3: 5000px, ステージ4: 6000px, ステージ5: 7000px
    return 2000 + stage * 1000;
}

const GOAL_X_BASE = 3000; // 基準値（ステージ1）
const GROUND_Y = 550;
const GROUND_HEIGHT = 50;

// プレイヤー設定（サイズ120px）
const player = {
    x: 100, y: GROUND_Y - 120, width: 120, height: 120,
    velocityX: 0, velocityY: 0, speed: 6, jumpPower: -20, gravity: 0.8, friction: 0.85,
    onGround: false, color: '#ffffff', facingDirection: 1, isAttacking: false,
    life: 3, maxLife: 3, invincible: false, invincibleTimer: 0, invincibleDuration: 2.0, visible: true,
    invincibleMode: false // 隠しコマンドによる無敵モード
};

// ビームエネルギーシステム
const beamEnergy = {
    max: 100,
    current: 100,
    consumptionRate: 20, // 1秒あたりの消費量
    recoveryRate: 5 // 1秒あたりの回復量
};

// ジャンプ・障害物計算
const MAX_JUMP_HEIGHT = (Math.abs(player.jumpPower) * (-player.jumpPower / player.gravity)) - (0.5 * player.gravity * Math.pow(-player.jumpPower / player.gravity, 2));
const MAX_OBSTACLE_HEIGHT = MAX_JUMP_HEIGHT * 0.9;
const MAX_GAP_WIDTH = (player.speed * (-player.jumpPower / player.gravity) * 2) * 0.8;

// 攻撃判定（前方・上方向の両方に対応）
const attackHitbox = { 
    active: false, 
    x: 0, 
    y: 0, 
    width: 60, 
    height: 60, 
    direction: 'forward', // 'forward'（前方）または 'up'（上方向）
    duration: 0.15, 
    timer: 0, 
    cooldown: 0.5, 
    cooldownTimer: 0, 
    color: '#ff0000' 
};

function limitObstacleHeight(h) { return Math.min(h, MAX_OBSTACLE_HEIGHT); }

let goal = { x: 0, y: GROUND_Y - 100, width: 120, height: 100, color: '#8b4513', roofColor: '#654321' };

// ステージ生成
let platforms = [];
function generateStage() {
    const currentStage = gameState.stage;
    const GOAL_X = getGoalX(currentStage);
    
    // ゴール位置を更新
    goal.x = GOAL_X;
    
    platforms = [];
    let currentX = 0;
    
    // 難易度パラメータ（ステージ1-5で0.0-1.0の範囲）
    const difficulty = (currentStage - 1) / 4; // ステージ1: 0.0, ステージ5: 1.0
    
    // プラットフォームの最小長さ（ステージが上がるほど短く）
    const minPlatformLength = player.width * 3 - (difficulty * 100); // ステージ1: 360px, ステージ5: 260px
    const maxPlatformLength = 200 - (difficulty * 50); // ステージ1: 200px, ステージ5: 150px
    
    // 穴の幅（ステージが上がるほど広く）
    const minGapWidth = 50 + (difficulty * 30); // ステージ1: 50px, ステージ5: 80px
    const maxGapWidth = MAX_GAP_WIDTH * (0.6 + difficulty * 0.3); // ステージ1: 60%, ステージ5: 90%
    
    // 穴の出現確率（ステージが上がるほど高い）
    const gapProbability = 0.5 + (difficulty * 0.3); // ステージ1: 50%, ステージ5: 80%
    
    // 障害物の数（ステージが上がるほど多い）
    const obstacleCount = Math.floor(3 + difficulty * 4); // ステージ1: 3個, ステージ5: 7個
    
    // ゴール手前まで生成
    while (currentX < GOAL_X - 200) {
        const platformLength = Math.floor(minPlatformLength + Math.random() * maxPlatformLength);
        platforms.push({ x: Math.floor(currentX), y: GROUND_Y, width: platformLength, height: GROUND_HEIGHT, color: '#808080' });
        currentX += platformLength;
        
        // 穴を生成するか判定
        if (Math.random() < gapProbability) {
            const gapWidth = Math.floor(Math.min(minGapWidth + Math.random() * (maxGapWidth - minGapWidth), MAX_GAP_WIDTH));
            // 広い穴の場合は中間に足場を配置
            if (gapWidth > MAX_GAP_WIDTH * (0.5 + difficulty * 0.2)) {
                platforms.push({ x: Math.floor(currentX + gapWidth/2 - 50), y: GROUND_Y - 100, width: 100, height: 20, color: '#808080' });
            }
            currentX += gapWidth;
        } else {
            // 穴を生成しない場合、少し進める
            currentX += 20;
        }
    }
    // ゴール付近
    platforms.push({ x: GOAL_X - 300, y: GROUND_Y, width: 300, height: GROUND_HEIGHT, color: '#808080' });
    platforms.push({ x: GOAL_X + 100, y: GROUND_Y, width: 500, height: GROUND_HEIGHT, color: '#808080' });
    
    // 障害物（ステージに応じて数を調整）
    const obstacleSpacing = (GOAL_X - 400) / (obstacleCount + 1);
    for (let i = 1; i <= obstacleCount; i++) {
        const pos = obstacleSpacing * i + (Math.random() - 0.5) * 200;
        if (pos > 400 && pos < GOAL_X - 200) {
            const h = Math.floor(limitObstacleHeight(50 + Math.random() * (50 + difficulty * 50)));
            platforms.push({ x: Math.floor(pos), y: GROUND_Y - h, width: 100, height: h, color: '#808080' });
        }
    }
}
generateStage();

// ==================== サウンド管理 ====================
class SoundManager {
    constructor() { this.ctx = null; this.muted = false; this.gain = null; this.timer = null; this.ready = false; }
    async init() { if(this.ready) return; try{ this.ctx=new(window.AudioContext||window.webkitAudioContext)(); this.gain=this.ctx.createGain(); this.gain.connect(this.ctx.destination); this.gain.gain.value=0.3; this.ready=true; }catch(e){console.error(e);} }
    async resume() { if(this.ctx && this.ctx.state==='suspended') await this.ctx.resume(); }
    toggleMute() { this.muted=!this.muted; if(this.gain) this.gain.gain.value=this.muted?0:0.3; return this.muted; }
    playTone(f, d, type='sine', v=0.3) { if(!this.ready||this.muted)return; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.type=type; o.frequency.value=f; g.gain.setValueAtTime(v,this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.01,this.ctx.currentTime+d); o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime+d); }
    playJump() { this.playTone(400,0.1); setTimeout(()=>this.playTone(500,0.1),50); }
    playAttack() { this.playTone(200,0.05,'sawtooth'); setTimeout(()=>this.playTone(150,0.05,'square'),30); }
    playItemGet() { this.playTone(800,0.1); setTimeout(()=>this.playTone(1000,0.1),50); setTimeout(()=>this.playTone(1200,0.1),100); }
    playDamage() { this.playTone(150,0.2,'sawtooth'); setTimeout(()=>this.playTone(100,0.2,'sawtooth'),100); }
    playGameOver() { this.playTone(200,0.3,'sawtooth'); setTimeout(()=>this.playTone(150,0.3,'sawtooth'),300); }
    playGameClear() { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>this.playTone(f,0.2),i*150)); }
    playStageClear() { [523,659,784].forEach((f,i)=>setTimeout(()=>this.playTone(f,0.15),i*100)); } // ステージクリア用のファンファーレ（短い）
    playBGM() {
        if(!this.ready||this.muted)return; this.stopBGM();
        const melody=[{f:523,d:0.2},{f:587,d:0.2},{f:659,d:0.2},{f:523,d:0.2},{f:659,d:0.2},{f:698,d:0.2},{f:784,d:0.4}];
        const loop = () => { if(this.muted||!this.ready)return; let t=this.ctx.currentTime; melody.forEach(n=>{ const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.type='square'; o.frequency.value=n.f; g.gain.setValueAtTime(0.1,t); g.gain.exponentialRampToValueAtTime(0.01,t+n.d); o.connect(g); g.connect(this.gain); o.start(t); o.stop(t+n.d); t+=n.d; }); this.timer=setTimeout(()=>this.ready&&!this.muted&&loop(), t*1000 - this.ctx.currentTime*1000); };
        loop();
    }
    stopBGM() { if(this.timer){clearTimeout(this.timer);this.timer=null;} }
}
const soundManager = new SoundManager();

// ==================== キャラクター ====================
class Entity {
    constructor(x,y,w,h,spd,col){this.x=x;this.y=y;this.width=w;this.height=h;this.speed=spd;this.color=col;this.dir=-1;}
    update(){return this.x+this.width>=gameState.cameraX-100;}
    draw(ctx){
        const img = assetManager.getImage(this.imgKey);
        if(img) ctx.drawImage(img, this.x, this.y, this.width, this.height);
        else { ctx.fillStyle=this.color; ctx.fillRect(this.x,this.y,this.width,this.height); }
    }
    get imgKey(){return null;}
    checkHit(p){ return this.x<p.x+p.width && this.x+this.width>p.x && this.y<p.y+p.height && this.y+this.height>p.y; }
}
class Crow extends Entity { 
    constructor(x,y,l,r){
        super(x,y,60,60,2,'#000');
        this.l=l;this.r=r;
        // 当たり判定のサイズを固定（画像のサイズに関係なく）
        this.hitboxWidth = 60;
        this.hitboxHeight = 60;
    } 
    get imgKey(){return 'enemy_crow';} 
    draw(ctx){
        const img = assetManager.getImage(this.imgKey);
        if(img){
            // 画像の縦横比を維持して、幅を60pxに固定
            const targetWidth = this.width; // 60px
            const aspectRatio = img.height / img.width;
            const drawHeight = targetWidth * aspectRatio; // 描画用の高さ
            const drawWidth = targetWidth; // 描画用の幅
            
            // 当たり判定のサイズは固定（60x60px）に保つ
            // 描画サイズと当たり判定サイズの差を計算
            const widthDiff = drawWidth - this.hitboxWidth;
            const heightDiff = drawHeight - this.hitboxHeight;
            
            // 描画位置を調整して、当たり判定の中心と描画の中心を一致させる
            const xOffset = -widthDiff / 2;
            const yOffset = -heightDiff / 2;
            
            // 進行方向に合わせて画像を反転（ロジックを反転）
            ctx.save();
            if(this.dir === -1){ // 左方向に移動中（反転）
                ctx.translate(this.x + xOffset + drawWidth, this.y + yOffset);
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0, drawWidth, drawHeight);
            } else { // 右方向に移動中（デフォルト）
                ctx.drawImage(img, this.x + xOffset, this.y + yOffset, drawWidth, drawHeight);
            }
            ctx.restore();
            
            // 当たり判定のサイズは固定値のまま（変更しない）
            // this.width と this.height は固定値（60x60px）を維持
        } else {
            // フォールバック: 色付き矩形
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
    update(){
        if(this.x<=this.l)this.dir=1;else if(this.x>=this.r)this.dir=-1;
        this.x+=this.speed*this.dir;
        return super.update();
    } 
}
class Cat extends Entity { 
    constructor(x,y,l,r){
        super(x,y,45,45,6,'#f80');
        this.l=l;this.r=r;this.vy=0;this.ground=true;
    } 
    get imgKey(){return 'enemy_cat';} 
    draw(ctx){
        const img = assetManager.getImage(this.imgKey);
        if(img){
            // 画像の縦横比を維持して、幅を45pxに固定
            const targetWidth = this.width; // 45px
            const aspectRatio = img.height / img.width;
            const targetHeight = targetWidth * aspectRatio;
            
            // 描画時の高さに合わせて当たり判定の高さも更新
            this.height = targetHeight;
            
            // 進行方向に合わせて画像を反転（ロジックを反転）
            ctx.save();
            if(this.dir === -1){ // 左方向に移動中（反転）
                ctx.translate(this.x + targetWidth, this.y);
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            } else { // 右方向に移動中（デフォルト）
                ctx.drawImage(img, this.x, this.y, targetWidth, targetHeight);
            }
            ctx.restore();
        } else {
            // フォールバック: 色付き矩形
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
    update(){
        if(this.x<=this.l)this.dir=1;else if(this.x>=this.r)this.dir=-1;
        this.x+=this.speed*this.dir; 
        if(this.ground&&Math.random()<0.005){this.vy=-12;this.ground=false;} 
        if(!this.ground)this.vy+=0.8; 
        this.y+=this.vy; 
        if(this.y>=GROUND_Y-this.height){this.y=GROUND_Y-this.height;this.vy=0;this.ground=true;} 
        return super.update();
    } 
}
class Item extends Entity { constructor(x,y){super(x,y,30,30,0,'#ff0');} draw(ctx){const img=assetManager.getImage(this.imgKey);if(img)ctx.drawImage(img,this.x,this.y,30,30);else{ctx.fillStyle=this.color;ctx.fillRect(this.x,this.y,30,30);}} }
class Egg extends Item { get imgKey(){return 'item_egg';} }
class Yogurt extends Item { get imgKey(){return 'item_yogurt';} }
class Chicken extends Item { get imgKey(){return 'item_chicken';} }

const enemies=[]; const items=[]; const beams=[]; let timer=0;
let beamTimer = 0;
const BEAM_INTERVAL = 0.5; // 0.5秒間隔でrーム発射

// ビームクラス
class Beam {
    constructor(x, y, direction) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 16; // 2倍に変更（8 → 16）
        this.speed = 15;
        this.direction = direction; // 1: 右, -1: 左
        this.lifetime = 2.0; // 2秒で消える
        this.age = 0;
    }
    
    update() {
        this.x += this.speed * this.direction;
        this.age += 1/60;
        // 画面外に出た、または寿命が尽きたら削除
        if(this.x < gameState.cameraX - 100 || this.x > gameState.cameraX + canvas.width + 100 || this.age >= this.lifetime){
            return false;
        }
        return true;
    }
    
    draw(ctx) {
        // ビームの描画（水色から黄色へのグラデーション）
        const gradient = ctx.createLinearGradient(this.x, this.y, this.x + this.width, this.y);
        gradient.addColorStop(0, '#00ffff');
        gradient.addColorStop(0.5, '#ffff00');
        gradient.addColorStop(1, '#ffaa00');
        ctx.fillStyle = gradient;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 発光エフェクト
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ffff';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.shadowBlur = 0;
    }
    
    checkHit(entity) {
        return this.x < entity.x + entity.width && 
               this.x + this.width > entity.x && 
               this.y < entity.y + entity.height && 
               this.y + this.height > entity.y;
    }
}

function spawn() {
    const sx=gameState.cameraX+850;
    const currentStage = gameState.stage;
    const difficulty = (currentStage - 1) / 4; // ステージ1: 0.0, ステージ5: 1.0
    
    // 敵の出現間隔（ステージが上がるほど短く = 頻繁に）
    // ステージ1: 180フレーム（3秒）、ステージ5: 90フレーム（1.5秒）
    const enemySpawnInterval = Math.floor(180 - (difficulty * 90));
    if(timer % enemySpawnInterval === 0) {
        (Math.random()<0.5)?enemies.push(new Crow(sx,200+Math.random()*200,sx-200,sx+200)):enemies.push(new Cat(sx,GROUND_Y-40,sx-150,sx+150));
    }
    
    // アイテムの出現間隔はそのまま
    if(timer%120===0) { const t=Math.floor(Math.random()*3); const sy=Math.random()<0.4?GROUND_Y-150:GROUND_Y-30; items.push(t===0?new Egg(sx,sy):t===1?new Yogurt(sx,sy):new Chicken(sx,sy)); }
    timer++;
}

// 隠しコマンド検出用（KONAMIコード風：上上下下左右左右Z Z）
const cheatCode = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','KeyZ','KeyZ'];
let cheatCodeIndex = 0;
let cheatCodeTimer = 0;
const CHEAT_CODE_TIMEOUT = 5000; // 5秒以内に入力しないとリセット

// スマホ用無敵モード検出用（画面左上を連続タッチ）
let touchCheatCount = 0;
let touchCheatTimer = 0;
const TOUCH_CHEAT_TIMEOUT = 2000; // 2秒以内に5回タッチしないとリセット
const TOUCH_CHEAT_AREA = { x: 0, y: 0, width: 80, height: 80 }; // 画面左上80x80pxのエリア

// ==================== メイン処理 ====================
document.addEventListener('keydown',e=>{
    gameState.keys[e.code]=true;
    
    // 隠しコマンド検出（上上下下左右左右Z Z）
    if(cheatCode[cheatCodeIndex] === e.code){
        cheatCodeIndex++;
        cheatCodeTimer = 0;
        if(cheatCodeIndex >= cheatCode.length){
            // コマンド成功：無敵モードを有効化
            player.invincibleMode = !player.invincibleMode;
            cheatCodeIndex = 0;
            console.log(player.invincibleMode ? '無敵モード ON' : '無敵モード OFF');
        }
    } else {
        // 間違ったキーが押されたらリセット
        cheatCodeIndex = 0;
    }
    
    if(e.code==='Enter' && gameState.state===GAME_STATE.START){ if(assetManager.isLoaded()){soundManager.init();soundManager.resume();soundManager.playBGM();gameState.state=GAME_STATE.PLAYING;} }
    if(e.code==='Enter' && gameState.state===GAME_STATE.GAME_CLEAR){ reset(); gameState.state=GAME_STATE.START; }
    if(e.code==='Enter' && gameState.state===GAME_STATE.STAGE_CLEAR){
        // 次のステージへ
        gameState.stage++;
        gameState.cameraX = 0;
        player.x = 100;
        player.y = GROUND_Y - 120;
        player.velocityX = 0;
        player.velocityY = 0;
        enemies.length = 0;
        items.length = 0;
        beams.length = 0;
        timer = 0;
        generateStage();
        soundManager.playBGM();
        gameState.state = GAME_STATE.PLAYING;
    }
    if(e.code==='KeyM') {if(soundManager.toggleMute())soundManager.stopBGM();else soundManager.playBGM();}
    if(e.code==='Space' && player.onGround && gameState.state===GAME_STATE.PLAYING){ player.velocityY=player.jumpPower;player.onGround=false;soundManager.playJump(); }
    if(e.code==='KeyZ' && !attackHitbox.active && attackHitbox.cooldownTimer<=0 && gameState.state===GAME_STATE.PLAYING){ 
        attackHitbox.active=true;
        attackHitbox.timer=0.15;
        attackHitbox.cooldownTimer=0.5;
        soundManager.playAttack(); 
        
        // 上矢印キーが押されている場合は上方向への攻撃
        if(gameState.keys['ArrowUp']){
            attackHitbox.direction = 'up';
            // プレイヤーの頭上に攻撃判定を配置
            attackHitbox.x = player.x + player.width / 2 - attackHitbox.width / 2;
            attackHitbox.y = player.y - attackHitbox.height;
        } else {
            // 前方への攻撃（左右方向）
            attackHitbox.direction = 'forward';
            attackHitbox.x=(player.facingDirection===1)?player.x+player.width:player.x-attackHitbox.width; 
            // プレイヤーの下半分（足元から中央付近まで）をカバーするように配置
            attackHitbox.y=player.y + player.height - attackHitbox.height; // プレイヤーの足元から上方向に配置
        }
    }
    if(e.code==='KeyR' && gameState.state===GAME_STATE.GAME_OVER){ reset(); gameState.state=GAME_STATE.PLAYING; soundManager.playBGM(); }
    // デバッグ用：Dキーでスコアを1000に設定
    if(e.code==='KeyD' && gameState.state===GAME_STATE.PLAYING){ gameState.score=1000; console.log('デバッグ: スコアを1000に設定しました'); }
});
document.addEventListener('keyup',e=>gameState.keys[e.code]=false);

function update() {
    // ステージクリア時の処理
    if(gameState.state === GAME_STATE.STAGE_CLEAR){
        // 次のステージに進む処理は、キー入力または一定時間後に自動実行
        return;
    }
    if(gameState.state!==GAME_STATE.PLAYING)return;
    
    // 隠しコマンドのタイマー更新（一定時間入力がないとリセット）
    cheatCodeTimer += 1/60;
    if(cheatCodeTimer > CHEAT_CODE_TIMEOUT / 1000){
        cheatCodeIndex = 0;
        cheatCodeTimer = 0;
    }
    
    // スマホ用無敵モードのタイマー更新
    touchCheatTimer += 1/60;
    if(touchCheatTimer > TOUCH_CHEAT_TIMEOUT / 1000){
        touchCheatCount = 0;
        touchCheatTimer = 0;
    }
    
    // 無敵時間の更新（通常の無敵時間）
    if(player.invincible && !player.invincibleMode){
        player.invincibleTimer-=1/60;
        player.visible=Math.floor(player.invincibleTimer*10)%2===0;
        if(player.invincibleTimer<=0){player.invincible=false;player.visible=true;}
    }
    
    // 無敵モード中は常に点滅表示
    if(player.invincibleMode){
        player.visible = Math.floor(timer * 0.2) % 2 === 0;
    }
    
    // 移動
    if(gameState.keys['ArrowLeft']){player.velocityX=-player.speed;player.facingDirection=-1;}
    else if(gameState.keys['ArrowRight']){player.velocityX=player.speed;player.facingDirection=1;}
    else if(player.onGround)player.velocityX*=0.8;
    
    if(!player.onGround)player.velocityY+=player.gravity;
    player.x+=player.velocityX;
    
    // X軸当たり判定
    platforms.forEach(p=>{
        if(player.x<p.x+p.width && player.x+player.width>p.x && player.y<p.y+p.height && player.y+player.height>p.y){ player.x-=player.velocityX;player.velocityX=0; }
    });
    
    player.y+=player.velocityY; player.onGround=false;
    
    // Y軸当たり判定（足元の判定を面で行う）
    const FOOT_MARGIN = 10; // 左右10pxの余白
    const playerFootLeft = player.x + FOOT_MARGIN;
    const playerFootRight = player.x + player.width - FOOT_MARGIN;
    const playerFootY = player.y + player.height; // プレイヤーの足元のY座標
    const playerCenterX = player.x + player.width / 2; // プレイヤーの中心X座標
    
    platforms.forEach(p=>{
        // 基本的なAABB判定
        if(player.x<p.x+p.width && player.x+player.width>p.x && player.y<p.y+p.height && player.y+player.height>p.y){
            if(player.velocityY > 0){
                // 落下中の場合、プレイヤーの足元（余白を考慮）がプラットフォーム上にあるか確認
                // プレイヤーの足元の左端から右端の間のどこか一箇所でもプラットフォーム上にあれば接地
                if(playerFootLeft < p.x + p.width && playerFootRight > p.x){
                    player.y=p.y-player.height;player.velocityY=0;player.onGround=true;
                }
            } else if(player.velocityY <= 0){
                // 静止中または上昇中の場合は、プレイヤーの中心X座標がプラットフォームの範囲内にある場合のみ接地
                // これにより、隙間の上にいる場合は落下する
                if(playerCenterX >= p.x && playerCenterX <= p.x + p.width && playerFootY >= p.y && playerFootY <= p.y + p.height + 5){
                    // 足元もプラットフォーム上にあることを確認（左右の判定も行う）
                    if(playerFootLeft < p.x + p.width && playerFootRight > p.x){
                        player.y=p.y-player.height;player.velocityY=0;player.onGround=true;
                    }
                }
            } else {
                // 上昇中で、プレイヤーの頭がプラットフォームに当たった場合
                player.y=p.y+p.height;player.velocityY=0;
            }
        }
    });
    
    if(player.y>canvas.height){soundManager.stopBGM();soundManager.playGameOver();gameState.state=GAME_STATE.GAME_OVER;}
    if(player.x>gameState.cameraX+400)gameState.cameraX=player.x-400; if(gameState.cameraX<0)gameState.cameraX=0;
    
    // 攻撃
    if(attackHitbox.active){attackHitbox.timer-=1/60;if(attackHitbox.timer<=0){attackHitbox.active=false;player.isAttacking=false;}else player.isAttacking=true;}
    if(attackHitbox.cooldownTimer>0)attackHitbox.cooldownTimer-=1/60;
    
    // ビーム発射（Xキーが押されている場合のみ、スコア1000以上または無敵モード時）
    if(gameState.keys['KeyX'] && (gameState.score >= 1000 || player.invincibleMode)){
        // ビーム発射中は攻撃画像を表示
        if(!attackHitbox.active){
            player.isAttacking = true;
        }
        
        // 無敵モード中はエネルギー消費なし
        const canShoot = player.invincibleMode || beamEnergy.current > 0;
        
        if(canShoot){
            // beamTimerが0の場合は即座に発射（最初のビームを即座に発射できるように）
            if(beamTimer === 0){
                // プレイヤーの口元付近から発射
                const beamX = player.facingDirection === 1 ? player.x + player.width - 20 : player.x - 20;
                
                // ビームのY座標を上下キーで調整（上: 少し上、下: 地べたを這う位置、なし: 少し低め）
                let beamY;
                if(gameState.keys['ArrowUp']){
                    beamY = player.y + player.height / 3 - 8; // 少し上（カラス用）
                } else if(gameState.keys['ArrowDown']){
                    beamY = player.y + player.height - 10; // 地べたを這う位置（猫用、地面すれすれ）
                } else {
                    beamY = player.y + player.height * 0.65 - 8; // 少し低め（デフォルト、猫に当たりやすく）
                }
                
                beams.push(new Beam(beamX, beamY, player.facingDirection));
                
                // エネルギー消費（無敵モード中は消費しない）
                if(!player.invincibleMode){
                    beamEnergy.current = Math.max(0, beamEnergy.current - beamEnergy.consumptionRate * (1/60));
                }
                // 次の発射までのタイマーを設定
                beamTimer = BEAM_INTERVAL;
            } else {
                beamTimer += 1/60;
                if(beamTimer >= BEAM_INTERVAL){
                    beamTimer = 0; // 次のフレームで即座に発射できるように0に戻す
                }
            }
        }
    } else {
        // Xキーが離された場合、attackHitboxがアクティブでなければisAttackingをfalseに
        if(!attackHitbox.active){
            player.isAttacking = false;
        }
        beamTimer = 0; // キーが離された場合はタイマーをリセット
        // ビームを撃っていない間はエネルギー回復
        if(!player.invincibleMode){
            beamEnergy.current = Math.min(beamEnergy.max, beamEnergy.current + beamEnergy.recoveryRate * (1/60));
        }
    }
    
    // ビームの更新
    for(let i = beams.length - 1; i >= 0; i--){
        if(!beams[i].update()){
            beams.splice(i, 1);
            continue;
        }
        
        // ビームと敵の当たり判定
        for(let j = enemies.length - 1; j >= 0; j--){
            if(beams[i].checkHit(enemies[j])){
                enemies.splice(j, 1);
                gameState.score += 200;
                soundManager.playItemGet();
                beams.splice(i, 1);
                break; // このビームは削除されたので、次のビームへ
            }
        }
    }
    
    spawn();
    
    // 敵・アイテム処理
    for(let i=enemies.length-1;i>=0;i--){
        let e=enemies[i]; 
        if(!e.update()){enemies.splice(i,1);continue;}
        
        // 攻撃判定が敵に当たった場合（敵を倒す）
        // 攻撃判定のサイズを大きくして、敵のサイズに合わせる
        if(attackHitbox.active && e.checkHit({x:attackHitbox.x,y:attackHitbox.y,width:attackHitbox.width,height:attackHitbox.height})){
            enemies.splice(i,1);
            gameState.score+=500;
            soundManager.playItemGet();
            continue; // この敵は削除されたので、プレイヤーとの当たり判定はスキップ
        }
        
        // 攻撃中でない場合のみ、プレイヤーと敵の当たり判定を実行（攻撃判定はプレイヤーにダメージを与えない）
        // 無敵モード中はダメージを受けない
        if(!attackHitbox.active && !player.invincible && !player.invincibleMode && e.checkHit(player)){
            player.life--;
            soundManager.playDamage();
            if(player.life<=0){
                soundManager.stopBGM();
                soundManager.playGameOver();
                gameState.state=GAME_STATE.GAME_OVER;
            }else{
                player.invincible=true;
                player.invincibleTimer=2.0;
            }
        }
    }
    for(let i=items.length-1;i>=0;i--){
        let it=items[i]; if(!it.update()){items.splice(i,1);continue;}
        if(it.checkHit(player)){items.splice(i,1);gameState.score+=100;soundManager.playItemGet();}
    }
    
    // ゴール判定
    if(player.x<goal.x+goal.width && player.x+player.width>goal.x && player.y<goal.y+goal.height && player.y+player.height>goal.y){
        soundManager.stopBGM();
        if(gameState.stage < 5){
            // ステージ1-4: ステージクリア
            soundManager.playStageClear();
            gameState.state = GAME_STATE.STAGE_CLEAR;
        } else {
            // ステージ5: ゲームクリア
            soundManager.playGameClear();
            gameState.state = GAME_STATE.GAME_CLEAR;
        }
    }
}

function draw() {
    ctx.fillStyle='#87ceeb'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.save(); ctx.translate(-gameState.cameraX,0);
    
    // ★地面描画の修正ポイント★
    // 画像サイズに関係なく、マスのサイズ(60x60)に合わせて画像を描画(伸縮)する
    const gImg=assetManager.getImage('ground');
    const TILE=60;
    platforms.forEach(p=>{
        if(gImg) {
            // 画像がロードできている場合：タイル状に並べる
            for(let x=p.x; x<p.x+p.width; x+=TILE) {
                for(let y=p.y; y<p.y+p.height; y+=TILE) {
                    // 画面内のみ描画
                    if(x < gameState.cameraX + canvas.width && x + TILE > gameState.cameraX) {
                        // 画像全体(0,0,w,h)を、ターゲットの矩形に合わせて描画する
                        const drawW = Math.min(TILE, p.x+p.width-x);
                        const drawH = Math.min(TILE, p.y+p.height-y);
                        // drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
                        // ソース画像全体を使って、指定のサイズに収める
                        ctx.drawImage(gImg, 0, 0, gImg.width, gImg.height, x, y, drawW, drawH);
                    }
                }
            }
        } else {
            // 画像がない場合：茶色の矩形
            ctx.fillStyle='#654321'; ctx.fillRect(p.x,p.y,p.width,p.height);
            ctx.fillStyle='#32cd32'; ctx.fillRect(p.x,p.y,p.width,10);
        }
    });
    
    // ゴール
    const glImg=assetManager.getImage('goal');
    if(glImg)ctx.drawImage(glImg,goal.x,goal.y,120,100);else{ctx.fillStyle='#8b4513';ctx.fillRect(goal.x,goal.y,120,100);}
    
    // ビームの描画（敵より前に描画）
    beams.forEach(b=>b.draw(ctx));
    
    enemies.forEach(e=>e.draw(ctx)); items.forEach(i=>i.draw(ctx));
    
    if(player.visible){
        const pImg=assetManager.getImage(player.isAttacking?'player_attack':'player_normal');
        if(pImg){
            // 画像の縦横比を維持して、幅を120pxに固定
            const targetWidth = 120;
            const aspectRatio = pImg.height / pImg.width;
            const drawHeight = targetWidth * aspectRatio; // 描画用の高さ
            
            // 当たり判定の高さは固定（120px）に保つ（足元の位置を維持）
            const fixedHeight = 120;
            
            // 足元を地面に合わせるためのY座標オフセット
            // 当たり判定の足元位置（player.y + 120）と描画画像の足元位置（player.y + yOffset + drawHeight）を一致させる
            // 120 = yOffset + drawHeight より、yOffset = 120 - drawHeight
            const yOffset = fixedHeight - drawHeight;
            
            ctx.save();
            if(player.facingDirection===-1){ // 左向きの場合（反転）
                ctx.translate(player.x+targetWidth,player.y);
                ctx.scale(-1,1);
                // 左向きの場合、drawImageの第2引数（dy）にオフセットを加算
                ctx.drawImage(pImg,0,yOffset,targetWidth,drawHeight);
            } else {
                // 右向きの場合（デフォルト）、Y座標にオフセットを加算
                ctx.drawImage(pImg,player.x,player.y+yOffset,targetWidth,drawHeight);
            }
            ctx.restore();
            
            // 当たり判定の高さは固定値のまま（変更しない）
            // player.height は固定値（120px）を維持し、足元の位置（player.y + player.height）が変わらないようにする
        }else{ctx.fillStyle='#fff';ctx.fillRect(player.x,player.y,120,120);}
    }
    if(attackHitbox.active){
        ctx.fillStyle='#f00';
        ctx.fillRect(attackHitbox.x,attackHitbox.y,attackHitbox.width,attackHitbox.height);
        // 上方向への攻撃の場合は視覚的に区別するため、少し色を変える
        if(attackHitbox.direction === 'up'){
            ctx.fillStyle='rgba(255,100,100,0.5)';
            ctx.fillRect(attackHitbox.x,attackHitbox.y,attackHitbox.width,attackHitbox.height);
        }
    }
    ctx.restore();
    
    // UI
    if(gameState.state===GAME_STATE.PLAYING){
        ctx.fillStyle='#fff';ctx.font='24px Arial';ctx.fillText(`SCORE: ${gameState.score}`,10,30);
        ctx.fillText(`STAGE ${gameState.stage}/5`,10,60);
        for(let i=0;i<3;i++){ctx.fillStyle=i<player.life?'#f00':'#555';ctx.fillRect(10+i*30,75,20,20);}
        ctx.font='16px Arial';ctx.fillStyle=soundManager.muted?'#f00':'#0f0';ctx.fillText(soundManager.muted?'MUTE (M)':'SOUND ON (M)',650,30);
        
        // ビームエネルギーバー（ライフの下に表示）
        if(gameState.score >= 1000 || player.invincibleMode){
            const barX = 10;
            const barY = 110;
            const barWidth = 150;
            const barHeight = 15;
            const energyRatio = beamEnergy.current / beamEnergy.max;
            
            // バーの背景（灰色）
            ctx.fillStyle = '#333';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            
            // エネルギー量（青色）
            ctx.fillStyle = player.invincibleMode ? '#ffff00' : '#00aaff';
            ctx.fillRect(barX, barY, barWidth * energyRatio, barHeight);
            
            // バーの枠線
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
            
            // ラベル
            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.fillText('BEAM', barX, barY - 3);
        }
        
        // 無敵モード表示
        if(player.invincibleMode){
            ctx.fillStyle='#ff0';ctx.font='bold 20px Arial';
            ctx.fillText('INVINCIBLE MODE',10,canvas.height-20);
        }
    }
    
    // リトライボタンの表示制御
    if(btnRetry){
        if(gameState.state === GAME_STATE.GAME_OVER){
            btnRetry.classList.add('show');
        } else {
            btnRetry.classList.remove('show');
        }
    }
    
    // ビームボタンの表示制御
    if(btnBeam){
        if(gameState.state === GAME_STATE.PLAYING && (gameState.score >= 1000 || player.invincibleMode)){
            btnBeam.classList.add('show');
        } else {
            btnBeam.classList.remove('show');
        }
    }
    // オーバーレイ
    if([GAME_STATE.START,GAME_STATE.GAME_OVER,GAME_STATE.GAME_CLEAR,GAME_STATE.STAGE_CLEAR].includes(gameState.state)){
        ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle='#fff';ctx.textAlign='center';
        if(gameState.state===GAME_STATE.STAGE_CLEAR){
            ctx.fillStyle='#ff0';ctx.font='50px Arial';ctx.fillText(`STAGE ${gameState.stage} CLEAR!`,400,250);
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            ctx.fillStyle='#fff';ctx.font='20px Arial';ctx.fillText('NEXT STAGE...',400,300);
            ctx.font='18px Arial';
            ctx.fillText(isTouchDevice?'TAP TO CONTINUE':'PRESS ENTER',400,330);
        } else if(gameState.state===GAME_STATE.START){
            ctx.font='40px Arial';ctx.fillText('AKITA ADVENTURE',400,250);
            
            // 操作説明
            ctx.font='18px Arial';
            ctx.fillStyle='#ffff00';
            let yPos = 290;
            ctx.fillText('← → : Move (移動)', 400, yPos);
            yPos += 25;
            ctx.fillText('SPACE : Jump (ジャンプ)', 400, yPos);
            yPos += 25;
            ctx.fillText('Z : Bite (かみつき)', 400, yPos);
            yPos += 25;
            ctx.fillStyle='#ffd700'; // 黄色
            ctx.fillText('X : 必殺ビーム (1000点ためて発射!)', 400, yPos);
            ctx.fillStyle='#ffff00'; // 他の行は黄色に戻す
            
            // スマホ用にタッチ指示も追加
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            ctx.font='20px Arial';
            ctx.fillStyle='#fff';
            ctx.fillText(assetManager.isLoaded()?(isTouchDevice?'TAP TO START':'PRESS ENTER TO START'):'LOADING...',400,yPos+40);
        }else if(gameState.state===GAME_STATE.GAME_OVER){
            ctx.font='50px Arial';ctx.fillText('GAME OVER',400,250);
            ctx.font='30px Arial';ctx.fillText('PRESS R TO RETRY',400,320);
        }else{
            ctx.fillStyle='#ff0';ctx.font='50px Arial';ctx.fillText('CLEAR!',400,250);
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            ctx.fillStyle='#fff';ctx.font='30px Arial';
            ctx.fillText(isTouchDevice?'TAP TO TITLE':'PRESS ENTER',400,320);
        }
        ctx.textAlign='left';
    }
}

function reset(){
    gameState.score=0;
    gameState.cameraX=0;
    gameState.stage=1; // ステージを1にリセット
    player.x=100;
    player.y=GROUND_Y-120;
    player.life=3;
    player.invincibleMode=false; // 無敵モードもリセット
    enemies.length=0;
    items.length=0;
    beams.length=0; // ビームもリセット
    beamTimer=0;
    beamEnergy.current=beamEnergy.max; // エネルギーもリセット
    generateStage();
}
assetManager.loadImages(()=>console.log('OK'));

// ==================== スマホ用タッチコントローラー ====================
// ボタン要素の取得
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnJump = document.getElementById('btn-jump');
const btnAttack = document.getElementById('btn-attack');
const btnBeam = document.getElementById('btn-beam');
const btnRetry = document.getElementById('control-retry');

// タッチイベントの処理関数
function handleTouchStart(e, keyCode) {
    e.preventDefault();
    gameState.keys[keyCode] = true;
    
    // キーボードイベントと同じ処理を実行
    if(keyCode === 'Space' && player.onGround && gameState.state === GAME_STATE.PLAYING){
        player.velocityY = player.jumpPower;
        player.onGround = false;
        soundManager.playJump();
    }
    if(keyCode === 'KeyZ' && !attackHitbox.active && attackHitbox.cooldownTimer <= 0 && gameState.state === GAME_STATE.PLAYING){
        attackHitbox.active = true;
        attackHitbox.timer = 0.15;
        attackHitbox.cooldownTimer = 0.5;
        soundManager.playAttack();
        
        if(gameState.keys['ArrowUp']){
            attackHitbox.direction = 'up';
            attackHitbox.x = player.x + player.width / 2 - attackHitbox.width / 2;
            attackHitbox.y = player.y - attackHitbox.height;
        } else {
            attackHitbox.direction = 'forward';
            attackHitbox.x = (player.facingDirection === 1) ? player.x + player.width : player.x - attackHitbox.width;
            attackHitbox.y = player.y + player.height - attackHitbox.height;
        }
    }
    if(keyCode === 'KeyR' && gameState.state === GAME_STATE.GAME_OVER){
        reset();
        gameState.state = GAME_STATE.PLAYING;
        soundManager.playBGM();
    }
    if(keyCode === 'Enter' && gameState.state === GAME_STATE.START){
        if(assetManager.isLoaded()){
            soundManager.init();
            soundManager.resume();
            soundManager.playBGM();
            gameState.state = GAME_STATE.PLAYING;
        }
    }
    if(keyCode === 'Enter' && gameState.state === GAME_STATE.GAME_CLEAR){
        reset();
        gameState.state = GAME_STATE.START;
    }
    if(keyCode === 'Enter' && gameState.state === GAME_STATE.STAGE_CLEAR){
        // 次のステージへ
        gameState.stage++;
        gameState.cameraX = 0;
        player.x = 100;
        player.y = GROUND_Y - 120;
        player.velocityX = 0;
        player.velocityY = 0;
        enemies.length = 0;
        items.length = 0;
        beams.length = 0;
        timer = 0;
        generateStage();
        soundManager.playBGM();
        gameState.state = GAME_STATE.PLAYING;
    }
}

function handleTouchEnd(e, keyCode) {
    e.preventDefault();
    gameState.keys[keyCode] = false;
}

// ボタンにタッチイベントを追加
if(btnLeft){
    btnLeft.addEventListener('touchstart', (e) => handleTouchStart(e, 'ArrowLeft'), {passive: false});
    btnLeft.addEventListener('touchend', (e) => handleTouchEnd(e, 'ArrowLeft'), {passive: false});
    btnLeft.addEventListener('touchcancel', (e) => handleTouchEnd(e, 'ArrowLeft'), {passive: false});
    // PC用のマウスイベントも追加（テスト用）
    btnLeft.addEventListener('mousedown', (e) => {e.preventDefault(); handleTouchStart(e, 'ArrowLeft');});
    btnLeft.addEventListener('mouseup', (e) => {e.preventDefault(); handleTouchEnd(e, 'ArrowLeft');});
    btnLeft.addEventListener('mouseleave', (e) => {e.preventDefault(); handleTouchEnd(e, 'ArrowLeft');});
}

if(btnRight){
    btnRight.addEventListener('touchstart', (e) => handleTouchStart(e, 'ArrowRight'), {passive: false});
    btnRight.addEventListener('touchend', (e) => handleTouchEnd(e, 'ArrowRight'), {passive: false});
    btnRight.addEventListener('touchcancel', (e) => handleTouchEnd(e, 'ArrowRight'), {passive: false});
    btnRight.addEventListener('mousedown', (e) => {e.preventDefault(); handleTouchStart(e, 'ArrowRight');});
    btnRight.addEventListener('mouseup', (e) => {e.preventDefault(); handleTouchEnd(e, 'ArrowRight');});
    btnRight.addEventListener('mouseleave', (e) => {e.preventDefault(); handleTouchEnd(e, 'ArrowRight');});
}

if(btnJump){
    btnJump.addEventListener('touchstart', (e) => handleTouchStart(e, 'Space'), {passive: false});
    btnJump.addEventListener('touchend', (e) => handleTouchEnd(e, 'Space'), {passive: false});
    btnJump.addEventListener('touchcancel', (e) => handleTouchEnd(e, 'Space'), {passive: false});
    btnJump.addEventListener('mousedown', (e) => {e.preventDefault(); handleTouchStart(e, 'Space');});
    btnJump.addEventListener('mouseup', (e) => {e.preventDefault(); handleTouchEnd(e, 'Space');});
    btnJump.addEventListener('mouseleave', (e) => {e.preventDefault(); handleTouchEnd(e, 'Space');});
}

if(btnAttack){
    btnAttack.addEventListener('touchstart', (e) => handleTouchStart(e, 'KeyZ'), {passive: false});
    btnAttack.addEventListener('touchend', (e) => handleTouchEnd(e, 'KeyZ'), {passive: false});
    btnAttack.addEventListener('touchcancel', (e) => handleTouchEnd(e, 'KeyZ'), {passive: false});
    btnAttack.addEventListener('mousedown', (e) => {e.preventDefault(); handleTouchStart(e, 'KeyZ');});
    btnAttack.addEventListener('mouseup', (e) => {e.preventDefault(); handleTouchEnd(e, 'KeyZ');});
    btnAttack.addEventListener('mouseleave', (e) => {e.preventDefault(); handleTouchEnd(e, 'KeyZ');});
}

if(btnBeam){
    btnBeam.addEventListener('touchstart', (e) => handleTouchStart(e, 'KeyX'), {passive: false});
    btnBeam.addEventListener('touchend', (e) => handleTouchEnd(e, 'KeyX'), {passive: false});
    btnBeam.addEventListener('touchcancel', (e) => handleTouchEnd(e, 'KeyX'), {passive: false});
    btnBeam.addEventListener('mousedown', (e) => {e.preventDefault(); handleTouchStart(e, 'KeyX');});
    btnBeam.addEventListener('mouseup', (e) => {e.preventDefault(); handleTouchEnd(e, 'KeyX');});
    btnBeam.addEventListener('mouseleave', (e) => {e.preventDefault(); handleTouchEnd(e, 'KeyX');});
}

if(btnRetry){
    btnRetry.addEventListener('touchstart', (e) => handleTouchStart(e, 'KeyR'), {passive: false});
    btnRetry.addEventListener('touchend', (e) => handleTouchEnd(e, 'KeyR'), {passive: false});
    btnRetry.addEventListener('touchcancel', (e) => handleTouchEnd(e, 'KeyR'), {passive: false});
    btnRetry.addEventListener('mousedown', (e) => {e.preventDefault(); handleTouchStart(e, 'KeyR');});
    btnRetry.addEventListener('mouseup', (e) => {e.preventDefault(); handleTouchEnd(e, 'KeyR');});
    btnRetry.addEventListener('mouseleave', (e) => {e.preventDefault(); handleTouchEnd(e, 'KeyR');});
}

// スマホ用無敵モード検出（画面左上を連続タッチ）
document.addEventListener('touchstart', (e) => {
    // ボタン以外のタッチをチェック
    if(!e.target.classList.contains('control-btn')){
        const touch = e.touches[0] || e.changedTouches[0];
        if(touch){
            const x = touch.clientX;
            const y = touch.clientY;
            
            // START画面またはGAME_CLEAR画面で画面をタッチしたらゲーム開始/タイトルに戻る
            if(gameState.state === GAME_STATE.START){
                if(assetManager.isLoaded()){
                    soundManager.init();
                    soundManager.resume();
                    soundManager.playBGM();
                    gameState.state = GAME_STATE.PLAYING;
                }
                return;
            }
            if(gameState.state === GAME_STATE.GAME_CLEAR){
                reset();
                gameState.state = GAME_STATE.START;
                return;
            }
            if(gameState.state === GAME_STATE.STAGE_CLEAR){
                // 次のステージへ
                gameState.stage++;
                gameState.cameraX = 0;
                player.x = 100;
                player.y = GROUND_Y - 120;
                player.velocityX = 0;
                player.velocityY = 0;
                enemies.length = 0;
                items.length = 0;
                beams.length = 0;
                timer = 0;
                generateStage();
                soundManager.playBGM();
                gameState.state = GAME_STATE.PLAYING;
                return;
            }
            
            // 画面左上の指定エリア内をタッチしたかチェック（無敵モード用）
            if(x >= TOUCH_CHEAT_AREA.x && x <= TOUCH_CHEAT_AREA.x + TOUCH_CHEAT_AREA.width &&
               y >= TOUCH_CHEAT_AREA.y && y <= TOUCH_CHEAT_AREA.y + TOUCH_CHEAT_AREA.height){
                touchCheatCount++;
                touchCheatTimer = 0;
                
                // 5回連続タッチで無敵モードを有効化
                if(touchCheatCount >= 5){
                    player.invincibleMode = !player.invincibleMode;
                    touchCheatCount = 0;
                    touchCheatTimer = 0;
                    console.log(player.invincibleMode ? '無敵モード ON（タッチ）' : '無敵モード OFF（タッチ）');
                }
            } else {
                // エリア外をタッチしたらリセット
                touchCheatCount = 0;
                touchCheatTimer = 0;
            }
        }
    }
}, {passive: true});

// タッチ操作時の画面拡大・スクロールを防止
document.addEventListener('touchmove', (e) => {
    // ボタン上でのタッチ移動は防止
    if(e.target.classList.contains('control-btn')){
        e.preventDefault();
    }
}, {passive: false});

document.addEventListener('touchend', (e) => {
    // ボタン上でのタッチ終了は防止
    if(e.target.classList.contains('control-btn')){
        e.preventDefault();
    }
}, {passive: false});

function loop(){
    update();
    draw();
    requestAnimationFrame(loop);
}
loop();