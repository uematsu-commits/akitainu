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
const GAME_STATE = { START: 'START', PLAYING: 'PLAYING', GAME_OVER: 'GAME_OVER', GAME_CLEAR: 'GAME_CLEAR' };
const gameState = { state: GAME_STATE.START, cameraX: 0, keys: {}, score: 0 };

const GOAL_X = 5000;
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

const goal = { x: GOAL_X, y: GROUND_Y - 100, width: 120, height: 100, color: '#8b4513', roofColor: '#654321' };

// ステージ生成
let platforms = [];
function generateStage() {
    platforms = [];
    let currentX = 0;
    
    // ゴール手前まで生成
    while (currentX < GOAL_X - 200) {
        const platformLength = player.width * 3 + Math.random() * 200;
        platforms.push({ x: currentX, y: GROUND_Y, width: platformLength, height: GROUND_HEIGHT, color: '#808080' });
        currentX += platformLength;
        
        const gapWidth = Math.min(50 + Math.random() * (MAX_GAP_WIDTH - 50), MAX_GAP_WIDTH);
        if (gapWidth > MAX_GAP_WIDTH * 0.6) {
            platforms.push({ x: currentX + gapWidth/2 - 50, y: GROUND_Y - 100, width: 100, height: 20, color: '#808080' });
        }
        currentX += gapWidth;
    }
    // ゴール付近
    platforms.push({ x: GOAL_X - 300, y: GROUND_Y, width: 300, height: GROUND_HEIGHT, color: '#808080' });
    platforms.push({ x: GOAL_X + 100, y: GROUND_Y, width: 500, height: GROUND_HEIGHT, color: '#808080' });
    
    // 障害物
    [500, 1200, 2000, 3000, 4000].forEach(pos => {
        if (pos < GOAL_X - 200) {
            const h = limitObstacleHeight(50 + Math.random() * 100);
            platforms.push({ x: pos, y: GROUND_Y - h, width: 100, height: h, color: '#808080' });
        }
    });
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
            
            ctx.drawImage(img, this.x + xOffset, this.y + yOffset, drawWidth, drawHeight);
            
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
            
            ctx.drawImage(img, this.x, this.y, targetWidth, targetHeight);
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

const enemies=[]; const items=[]; let timer=0;
function spawn() {
    const sx=gameState.cameraX+850;
    if(timer%180===0) (Math.random()<0.5)?enemies.push(new Crow(sx,200+Math.random()*200,sx-200,sx+200)):enemies.push(new Cat(sx,GROUND_Y-40,sx-150,sx+150));
    if(timer%120===0) { const t=Math.floor(Math.random()*3); const sy=Math.random()<0.4?GROUND_Y-150:GROUND_Y-30; items.push(t===0?new Egg(sx,sy):t===1?new Yogurt(sx,sy):new Chicken(sx,sy)); }
    timer++;
}

// 隠しコマンド検出用（KONAMIコード風：上上下下左右左右Z Z）
const cheatCode = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','KeyZ','KeyZ'];
let cheatCodeIndex = 0;
let cheatCodeTimer = 0;
const CHEAT_CODE_TIMEOUT = 5000; // 5秒以内に入力しないとリセット

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
});
document.addEventListener('keyup',e=>gameState.keys[e.code]=false);

function update() {
    if(gameState.state!==GAME_STATE.PLAYING)return;
    
    // 隠しコマンドのタイマー更新（一定時間入力がないとリセット）
    cheatCodeTimer += 1/60;
    if(cheatCodeTimer > CHEAT_CODE_TIMEOUT / 1000){
        cheatCodeIndex = 0;
        cheatCodeTimer = 0;
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
    
    // Y軸当たり判定
    platforms.forEach(p=>{
        if(player.x<p.x+p.width && player.x+player.width>p.x && player.y<p.y+p.height && player.y+player.height>p.y){
            if(player.velocityY>0){player.y=p.y-player.height;player.velocityY=0;player.onGround=true;}
            else{player.y=p.y+p.height;player.velocityY=0;}
        }
    });
    
    if(player.y>canvas.height){soundManager.stopBGM();soundManager.playGameOver();gameState.state=GAME_STATE.GAME_OVER;}
    if(player.x>gameState.cameraX+400)gameState.cameraX=player.x-400; if(gameState.cameraX<0)gameState.cameraX=0;
    
    // 攻撃
    if(attackHitbox.active){attackHitbox.timer-=1/60;if(attackHitbox.timer<=0){attackHitbox.active=false;player.isAttacking=false;}else player.isAttacking=true;}
    if(attackHitbox.cooldownTimer>0)attackHitbox.cooldownTimer-=1/60;
    
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
    
    if(player.x<goal.x+goal.width && player.x+player.width>goal.x && player.y<goal.y+goal.height && player.y+player.height>goal.y){soundManager.stopBGM();soundManager.playGameClear();gameState.state=GAME_STATE.GAME_CLEAR;}
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
            if(player.facingDirection===-1){
                ctx.translate(player.x+targetWidth,player.y);
                ctx.scale(-1,1);
                // 左向きの場合、drawImageの第2引数（dy）にオフセットを加算
                ctx.drawImage(pImg,0,yOffset,targetWidth,drawHeight);
            } else {
                // 右向きの場合、Y座標にオフセットを加算
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
        for(let i=0;i<3;i++){ctx.fillStyle=i<player.life?'#f00':'#555';ctx.fillRect(10+i*30,40,20,20);}
        ctx.font='16px Arial';ctx.fillStyle=soundManager.muted?'#f00':'#0f0';ctx.fillText(soundManager.muted?'MUTE (M)':'SOUND ON (M)',650,30);
        
        // 無敵モード表示
        if(player.invincibleMode){
            ctx.fillStyle='#ff0';ctx.font='bold 20px Arial';
            ctx.fillText('INVINCIBLE MODE',10,canvas.height-20);
        }
    }
    // オーバーレイ
    if([GAME_STATE.START,GAME_STATE.GAME_OVER,GAME_STATE.GAME_CLEAR].includes(gameState.state)){
        ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle='#fff';ctx.textAlign='center';
        if(gameState.state===GAME_STATE.START){
            ctx.font='40px Arial';ctx.fillText('AKITA ADVENTURE',400,250);
            ctx.font='20px Arial';ctx.fillText(assetManager.isLoaded()?'PRESS ENTER':'LOADING...',400,320);
        }else if(gameState.state===GAME_STATE.GAME_OVER){
            ctx.font='50px Arial';ctx.fillText('GAME OVER',400,250);
            ctx.font='30px Arial';ctx.fillText('PRESS R TO RETRY',400,320);
        }else{
            ctx.fillStyle='#ff0';ctx.font='50px Arial';ctx.fillText('CLEAR!',400,250);
            ctx.fillStyle='#fff';ctx.font='30px Arial';ctx.fillText('PRESS ENTER',400,320);
        }
        ctx.textAlign='left';
    }
}

function reset(){
    gameState.score=0;
    gameState.cameraX=0;
    player.x=100;
    player.y=GROUND_Y-120;
    player.life=3;
    player.invincibleMode=false; // 無敵モードもリセット
    enemies.length=0;
    items.length=0;
    generateStage();
}
assetManager.loadImages(()=>console.log('OK'));
function loop(){update();draw();requestAnimationFrame(loop);}
loop();