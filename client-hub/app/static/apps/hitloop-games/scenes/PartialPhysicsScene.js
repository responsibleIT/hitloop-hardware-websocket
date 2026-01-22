class PartialPhysicsScene extends Scene {
  constructor(...a){ 
    super(...a);
    this.targets=[]; this.parts=[]; this.play=false; this._k1=false;
    this.mode='default'; this.t=0;

    this.stars=[]; this.shooters=[];
    this.starCap=0;
    this.obstacles=[];
  }

  setup(){
    // --- hex word targets
    const pg=createGraphics(width,height); pg.pixelDensity(1);
    pg.background(255); pg.fill(0); pg.textAlign(CENTER,CENTER); pg.textStyle(BOLD);
    const fs=min(width,height)*0.18; pg.textSize(fs);
    pg.text("Welcome to",width/2,height*0.32); pg.text("Hitloop",width/2,height*0.72); pg.loadPixels();
    const m=40,g=8,stepX=g,stepY=g*0.866025403784;
    for(let y=m,row=0;y<height-m;y+=stepY,row++){
      const xo=(row%2)*(stepX*0.5);
      for(let x=m+xo;x<width-m;x+=stepX){
        const idx=4*(int(y)*width+int(x));
        if((pg.pixels[idx]+pg.pixels[idx+1]+pg.pixels[idx+2])/3<200) this.targets.push({x,y});
      }
    }
    pg.remove();
    this.parts=this.targets.map(t=>({x:random(width),y:random(height),tx:t.x,ty:t.y}));

    this.starCap = width*9;
    this.stars   = new Array(this.starCap);
    this.shooters=[];
  }

  // ---------- modes ----------
  _resetStars(){ this.t=0; this.stars.fill(undefined); this.shooters.length=0; }
  _startWord(){ for(const p of this.parts){ p.x=random(width); p.y=random(height);} this.play=true; this.mode='text'; }
  _startStars(){ this.mode='default'; this._resetStars(); }

  // ---------- stars ----------
  _spawnStars(n=9){
    for(let i=0;i<n;i++){
      const idx=this.t % this.starCap;
      this.stars[idx]={ x:(this.t*101)%width, y:0, vx:random(-0.5,0.5), vy:0.6, s:2 };
      this.t++;
    }
  }
  _maybeSpawnShooter(){
    if(random() < 0.004){
      const fromTop = random()<0.5;
      const x = fromTop ? random(width*0.1,width*0.9) : random([ -40, width+40 ]);
      const y = fromTop ? -20 : random(height*0.05, height*0.4);
      const vx = fromTop ? random(4.0,6.0) * (random()<0.5?-1:1) : (x<0?random(4,6):-random(4,6));
      const vy = fromTop ? random(3.5,5.5) : random(0.5,2.0);
      this.shooters.push({ x, y, vx, vy, life: 60, s:2, trail: [] });
    }
  }

  _moveAndCollide(p){
    const N=noise(p.x/width, p.y/9, this.t/width);
    if('life' in p){ p.vy += 0.03; } 
    else {
      if(N>0.4){ p.vy+=0.25; } else { p.vx += (N%0.1>0.05?0.03:-0.03); p.vy+=0.02; }
      p.vx = constrain(p.vx,-2,2); p.vy = constrain(p.vy,-4,4);
    }
    let nx=p.x+p.vx, ny=p.y+p.vy;
    for(const o of this.obstacles){
      const dx=nx-o.x, dy=ny-o.y, d=sqrt(dx*dx+dy*dy);
      if(d < o.r+0.5){
        const nX=dx/(d||1), nY=dy/(d||1);
        nx=o.x+nX*(o.r+0.6); ny=o.y+nY*(o.r+0.6);
        const dot=p.vx*nX + p.vy*nY;
        p.vx -= 2*dot*nX; p.vy -= 2*dot*nY;
        p.vx*=0.7; p.vy*=0.7;
      }
    }
    if(nx<0||nx>width){ p.vx*=-0.6; nx=constrain(nx,0,width); }
    if(ny<0||ny>height){ p.vy*=-0.6; ny=constrain(ny,0,height); }
    p.x=nx; p.y=ny;
  }

  _drawStars(){
    this._spawnStars(9);
    this._maybeSpawnShooter();

    stroke(255); noFill();
    for(const p of this.stars){
      if(!p) continue;
      this._moveAndCollide(p);
      strokeWeight(p.s);
      point(p.x,p.y);
    }

    // shooting stars (streaks)
    for(let i=this.shooters.length-1;i>=0;i--){
      const s=this.shooters[i];
      s.trail.unshift({x:s.x,y:s.y});
      if(s.trail.length>10) s.trail.pop();
      this._moveAndCollide(s);
      s.life--;
      strokeWeight(2);
      for(let j=0;j<s.trail.length-1;j++){
        const a = map(j,0,s.trail.length-1,255,60);
        stroke(255,a);
        line(s.trail[j].x, s.trail[j].y, s.trail[j+1].x, s.trail[j+1].y);
      }
      stroke(255); strokeWeight(3); point(s.x,s.y);
      if(s.life<=0||s.x<-60||s.x>width+60||s.y>height+60) this.shooters.splice(i,1);
    }
  }

  // ---------- word dots ----------
  _drawWord(){
    noStroke(); fill(255);
    let moving=false;
    for(const p of this.parts){
      if(this.play){ p.x+=(p.tx-p.x)/30; p.y+=(p.ty-p.y)/30; }
      if(abs(p.tx-p.x)>0.15 || abs(p.ty-p.y)>0.15) moving=true;
      circle(p.x,p.y,3);
    }
    if(this.play && !moving) this.play=false;
  }

  // ---------- draw ----------
  draw(){
    background(0);

    // toggle with '1'
    const k1=keyIsDown(49);
    if(k1&&!this._k1){ this.mode==='default' ? this._startWord() : this._startStars(); }
    this._k1=k1;

    // obstacles from devices
    this.obstacles.length=0;
    const dm=this.deviceManager; const devs=[...dm.getAllDevices().values()];
    const devPos=[];
    for(const dev of devs){
      const d=dev.getSensorData();
      const toPx=v=>(255-(v||0))/255*Math.hypot(width,height);
      const dNW=toPx(d.dNW), dNE=toPx(d.dNE), dSW=toPx(d.dSW);
      let x=((width*width)-(dNE*dNE-dNW*dNW))/(2*width);
      let y=((height*height)-(dSW*dSW-dNW*dNW))/(2*height);
      x=constrain(x,40,width-40); y=constrain(y,40,height-40);
      devPos.push({x,y}); this.obstacles.push({x,y,r:40}); // bigger circles (80px)
    }

    // stars or word
    if(this.mode==='default') this._drawStars(); else this._drawWord();

    // draw device circles with eyes
    noStroke();
    for(let i=0;i<devPos.length;i++){
      const {x,y}=devPos[i];
      const d=devs[i].getSensorData();
      fill(...d.color);
      ellipse(x,y,80); // larger
      // eyes follow nearest star
      const target=this.stars.find(s=>s)?this.stars[0]:{x:width/2,y:height/2};
      const dx=target.x-x, dy=target.y-y, mag=sqrt(dx*dx+dy*dy);
      const ex=(dx/mag||0)*6, ey=(dy/mag||0)*6;
      fill(255);
      ellipse(x-12,y-8,20,20);
      ellipse(x+12,y-8,20,20);
      fill(0);
      ellipse(x-12+ex,y-8+ey,8,8);
      ellipse(x+12+ex,y-8+ey,8,8);
    }
  }
  
  drawDebugText() {
    blendMode(BLEND);
    fill(255);
    textAlign(LEFT, TOP);
    textSize(16);
    text(`Devices: ${this.deviceManager.getDeviceCount()}`, 10, 20);
    text('Press 1 to toggle mode, D for debug info', 10, height - 20);
  }
}