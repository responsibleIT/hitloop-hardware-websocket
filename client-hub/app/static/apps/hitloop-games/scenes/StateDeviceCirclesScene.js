class StateDeviceCirclesScene extends Scene {
    constructor(...a){ super(...a);
      this.targets=[]; this.parts=[]; this.play=false;
      this.mode='default'; this._k1=false;
      this.t=0; this.stars=[];
    }
  
    setup(){
      // --- build hex-dot targets from offscreen text
      const pg=createGraphics(width,height); pg.pixelDensity(1);
      pg.background(255); pg.fill(0); pg.textAlign(CENTER,CENTER); pg.textStyle(BOLD);
      const fs=min(width,height)*0.18; pg.textSize(fs);
      pg.text("Welcome to",width/2,height*0.32);
      pg.text("Hitloop",width/2,height*0.72);
      pg.loadPixels();
      const m=40,g=8,stepX=g,stepY=g*0.866025403784;
      for(let y=m,row=0;y<height-m;y+=stepY,row++){
        const xo=(row%2)*(stepX*0.5);
        for(let x=m+xo;x<width-m;x+=stepX){
          const idx=4*(int(y)*width+int(x));
          const r=pg.pixels[idx], G=pg.pixels[idx+1], b=pg.pixels[idx+2];
          if((r+G+b)/3<200) this.targets.push({x,y});
        }
      }
      pg.remove();
      this.parts=this.targets.map(t=>({x:random(width),y:random(height),tx:t.x,ty:t.y}));
      this._resetStars();
    }
  
    _resetStars(){ this.t=0; this.stars=[]; }
  
    _startWord(){
      for(const p of this.parts){ p.x=random(width); p.y=random(height); }
      this.play=true; this.mode='text';
    }
  
    _startStars(){ this.mode='default'; this._resetStars(); }
  
    _drawWord(){
      // smaller + slower easing, persist after settle
      noStroke(); fill(255);
      let moving=false;
      for(const p of this.parts){
        if(this.play){ p.x+=(p.tx-p.x)/30; p.y+=(p.ty-p.y)/30; } // slow
        const dx=p.tx-p.x, dy=p.ty-p.y;
        if(abs(dx)>0.15||abs(dy)>0.15) moving=true;
        circle(p.x,p.y,3); // tiny “stars”
      }
      if(this.play && !moving) this.play=false; // stays visible
    }
  
    _drawStars(){
      // noise-driven “falling stars” (compact version of your snippet)
      background(0,9);
      filter(BLUR,1);
      stroke(255);
      for(let i=0;i<9;i++){
        this.stars[this.t % (width*9)] = {x:(this.t*99)%width, y:0, g:0, s:3};
        this.t++;
      }
      for(const p of this.stars){
        if(!p) continue;
        // decay & move
        p.s*=0.997; strokeWeight(p.s);
        const N=noise(p.x/width, p.y/9, this.t/width);
        if(N>0.4){ p.g+=0.5; p.y+=p.g; }           // drift downward faster
        else { p.x += (N%0.1>0.05?1:-1); p.y+=0.5; p.g=0; } // horizontal jitter + slow fall
        point(p.x,p.y);
      }
    }
  
    draw(){
      background(0);
  
      // --- device circles (kept)
      const dm=this.deviceManager;
      for(const dev of dm.getAllDevices().values()){
        const d=dev.getSensorData(); noStroke(); fill(...d.color);
        const toPx=v=>(255-(v||0))/255*Math.hypot(width,height);
        const dNW=toPx(d.dNW), dNE=toPx(d.dNE), dSW=toPx(d.dSW);
        let x=((width*width)-(dNE*dNE-dNW*dNW))/(2*width);
        let y=((height*height)-(dSW*dSW-dNW*dNW))/(2*height);
        x=constrain(x,20,width-20); y=constrain(y,20,height-20);
        ellipse(x,y,40);
      }
  
      // --- toggle with '1'
      const k1=keyIsDown(49);
      if(k1&&!this._k1){ this.mode==='default' ? this._startWord() : this._startStars(); }
      this._k1=k1;
  
      // --- layer the star/word effect
      if(this.mode==='default') this._drawStars();
      else this._drawWord();
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