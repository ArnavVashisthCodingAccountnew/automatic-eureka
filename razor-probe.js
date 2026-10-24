// Probe bridge: one frame format {ts, T:[4 temps C], i: amps, v: volts}, four sources:
// USB serial (laptop, Android Chrome 148+), Bluetooth LE (Android/desktop Chrome), relay (any phone), replay.
const UU=[['6e400001-b5a3-f393-e0a9-e50e24dcca9e','6e400003-b5a3-f393-e0a9-e50e24dcca9e'],[0xffe0,0xffe1]]; // Nordic UART, HM-10
const CH='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export class Probe extends EventTarget{
 buf='';peers=[];frames=[];mark=null;dec=new TextDecoder();_stop=null;
 static caps(){return{secure:isSecureContext,serial:'serial' in navigator,ble:'bluetooth' in navigator,relay:!!window.Peer,ios:/iPhone|iPad/.test(navigator.userAgent)}}
 status(m){this.dispatchEvent(new CustomEvent('status',{detail:m}))}
 emit(f){this.frames.push(f);if(this.frames.length>900)this.frames.shift();this.peers.forEach(c=>c.open&&c.send(f));this.dispatchEvent(new CustomEvent('frame',{detail:f}))}
 feed(s){this.buf+=s;let i;while((i=this.buf.indexOf('\n'))>=0){const l=this.buf.slice(0,i).trim();this.buf=this.buf.slice(i+1);if(l[0]!=='{')continue;try{const o=JSON.parse(l);if(Array.isArray(o.T))this.emit({ts:Date.now(),T:o.T,i:+o.i||0,v:+o.v||0})}catch{}}}
 setMark(ts=Date.now()){this.mark=ts;this.peers.forEach(c=>c.open&&c.send({mark:ts}))}
 stop(){if(this._stop)this._stop();this._stop=null}
 async serial(baud=115200){
  if(!('serial' in navigator))throw new Error('Web Serial is not available in this browser');
  this.stop();const p=await navigator.serial.requestPort();await p.open({baudRate:baud});const r=p.readable.getReader();this._stop=()=>r.cancel();
  this.status('USB connected. The board restarts when opened; data starts in about 2 s.');
  (async()=>{try{for(;;){const{value,done}=await r.read();if(done)break;this.feed(this.dec.decode(value,{stream:true}))}}catch(e){this.status('USB error: '+e.message)}finally{try{r.releaseLock();await p.close()}catch{}this.status('USB closed')}})()}
 async ble(){
  if(!('bluetooth' in navigator))throw new Error('Web Bluetooth is not available in this browser');
  this.stop();const d=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:UU.map(u=>u[0])}),g=await d.gatt.connect();let ch;
  for(const[s,c]of UU){try{ch=await(await g.getPrimaryService(s)).getCharacteristic(c);break}catch{}}
  if(!ch)throw new Error('No UART service found. Use a BLE module (HM-10, ESP32, Nano 33 BLE), not HC-05/HC-06.');
  await ch.startNotifications();ch.addEventListener('characteristicvaluechanged',e=>this.feed(this.dec.decode(e.target.value,{stream:true})));
  d.addEventListener('gattserverdisconnected',()=>this.status('Bluetooth lost'));this._stop=()=>d.gatt.disconnect();this.status('Bluetooth connected: '+(d.name||'device'))}
 host(){ // laptop: forwards whatever it reads to any phone that joins
  if(!window.Peer)throw new Error('Relay library did not load');this.stop();let code='';for(let i=0;i<6;i++)code+=CH[Math.random()*CH.length|0];
  const p=new Peer('razor-'+code);p.on('open',()=>this.status('Relay open. On the phone choose Join and type: '+code));
  p.on('connection',c=>{c.on('open',()=>{this.peers.push(c);this.status('Phone joined ('+this.peers.length+')');if(this.mark)c.send({mark:this.mark})});c.on('close',()=>{this.peers=this.peers.filter(x=>x!==c)})});
  p.on('error',e=>this.status('Relay error: '+e.type));this._stop=()=>{p.destroy();this.peers=[]};return code}
 join(code){ // phone: receives frames from the laptop
  if(!window.Peer)throw new Error('Relay library did not load');this.stop();const p=new Peer();
  p.on('open',()=>{const c=p.connect('razor-'+code.trim().toUpperCase(),{reliable:true});c.on('open',()=>this.status('Relay connected'));c.on('data',f=>f.mark?(this.mark=f.mark):this.emit(f));c.on('close',()=>this.status('Relay closed'))});
  p.on('error',e=>this.status('Relay error: '+e.type+(e.type==='peer-unavailable'?' (check the code, laptop must be hosting)':'')));this._stop=()=>p.destroy()}
 replay(){this.stop();this.frames=[];const D=demo();this.mark=D.mark;this.status('Replaying a recorded probe run');let k=0;
  const t=setInterval(()=>{if(k>=D.frames.length){this.stop();this.status('Replay finished');return}this.emit(D.frames[k++])},100);this._stop=()=>clearInterval(t)}
}
export function demo(){ // 75 s at 2 Hz: current steps up at 30 s, main board warms first, monitor driver later
 const b=Date.now()-150*500,F=[];
 for(let k=0;k<150;k++){const n=j=>(Math.sin(k*12.9898+j*78.233)*43758.5453)%1*.12,u=Math.max(0,k-60),r=(a,tau,d=0)=>a*(1-Math.exp(-Math.max(0,u-d)/tau));
  const T=[24+n(1)+r(2.5,18,4),24.2+n(2)+r(11,14,2),24.1+n(3)+r(6,16,10),23.5+n(4)+r(.4,30)],
  i=.6+n(5)*.5+(u>0?2.6*(1-Math.exp(-u/3)):0)*(k<100?1:Math.exp(-(k-100)/4));
  F.push({ts:b+k*500,T:T.map(x=>+x.toFixed(2)),i:+Math.max(0,i).toFixed(2),v:12.1})}
 return{frames:F,mark:b+60*500}}
export function analyze(F,mark){
 if(F.length<24)return null;const med=a=>[...a].sort((x,y)=>x-y)[a.length>>1],nb=Math.min(24,F.length>>1);
 const det=(arr,min)=>{const b=arr.slice(0,nb),m=med(b),sd=Math.max(.05,1.4826*med(b.map(x=>Math.abs(x-m)))),th=m+Math.max(min,5*sd);let idx=-1;
  for(let k=nb;k<arr.length-2;k++)if(arr[k]>th&&arr[k+1]>th&&arr[k+2]>th){idx=k;break}return{m,sd,idx,peak:Math.max(...arr)}};
 const S=F[0].T.map((_,j)=>({...det(F.map(f=>f.T[j]),1),j})),C=det(F.map(f=>f.i),.3),hot=S.filter(s=>s.idx>=0).sort((a,b)=>a.idx-b.idx),first=hot[0];
 const tc=C.idx>=0?F[C.idx].ts:null,tf=first?F[first.idx].ts:null,dT=first?first.peak-first.m:0,snr=first?dT/first.sd:0;
 return{S,C,hot,first,dT,snr,n:F.length,kind:!first&&C.idx<0?'none':first&&C.idx>=0?'load':first?'heat':'current',
  lag:tc&&tf?(tf-tc)/1000:null,fromMark:mark&&tf?(tf-mark)/1000:null,conf:snr>=15?'high':snr>=6?'medium':'low'}}
