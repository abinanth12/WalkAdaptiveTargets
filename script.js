"use strict";
const $ = id => document.getElementById(id);
const TOTAL = 20, PRACTICE = 3, SMALL = 44, LARGE = 72;
const WINDOW_MS = 2000, THRESHOLD_ON = 0.70, THRESHOLD_OFF = 0.50;
const STABLE_MS = 800, STALE_MS = 2500;
const game = $("gameArea");
let sensorRequested = false, sensorSamples = [], lastSensorAt = -Infinity;
let detected = "unknown", pending = null, pendingSince = 0, currentRms = null;
let active = false, mode = "fixed", activity = "sitting", participant = "";
let hits = 0, misses = 0, missesTrial = 0, practiceDone = 0;
let rows = [], targetShownAt = 0, currentTarget = null, lastCenter = null;
let sensorAtTarget = null, sequence = [], blockValid = true, blockStartedAt = "";

function sensorFresh(){return performance.now()-lastSensorAt < STALE_MS;}
function resetDetection(){detected="unknown";pending=null;pendingSince=0;currentRms=null;sensorSamples=[];}
function onMotion(event){
  const a=event.acceleration;
  if(!a || ![a.x,a.y,a.z].every(Number.isFinite))return;
  const now=performance.now();lastSensorAt=now;
  sensorSamples.push({t:now,m:Math.hypot(a.x,a.y,a.z)});
  sensorSamples=sensorSamples.filter(s=>now-s.t<=WINDOW_MS);
  if(sensorSamples.length<5 || now-sensorSamples[0].t<1500)return;
  currentRms=Math.sqrt(sensorSamples.reduce((sum,s)=>sum+s.m*s.m,0)/sensorSamples.length);
  const candidate=detected==="walking" ? (currentRms<THRESHOLD_OFF?"sitting":"walking") :
    (currentRms>=THRESHOLD_ON?"walking":"sitting");
  if(candidate===detected){pending=null;}
  else if(candidate!==pending){pending=candidate;pendingSince=now;}
  else if(now-pendingSince>=STABLE_MS){detected=candidate;pending=null;}
  showSensor();
}
function showSensor(){
  if(!sensorFresh()){$("detected").textContent="Unknown";$('rms').textContent="--";return;}
  $("detected").textContent=detected;
  $("rms").textContent=currentRms==null?"--":currentRms.toFixed(3);
}
setInterval(()=>{
  if(sensorRequested && !sensorFresh()){
    resetDetection();$("sensorStatus").textContent="No recent motion data — keep Safari visible.";
    if(active && mode==="adaptive") abortBlock("Sensor data lost; block aborted. Restart this condition.");
  }
  showSensor();
},500);
$("sensorBtn").addEventListener("click",async()=>{
  if(!window.isSecureContext){$("sensorStatus").textContent="HTTPS required.";return;}
  if(!("DeviceMotionEvent" in window)){$("sensorStatus").textContent="Motion API unavailable.";return;}
  try{
    if(typeof DeviceMotionEvent.requestPermission==="function"){
      const result=await DeviceMotionEvent.requestPermission();
      if(result!=="granted"){$("sensorStatus").textContent="Sensor permission not granted.";return;}
    }
    if(!sensorRequested){window.addEventListener("devicemotion",onMotion);sensorRequested=true;}
    $("sensorBtn").disabled=true;
    $("sensorStatus").textContent="Sensor permission granted; waiting for live readings.";
  }catch(err){$("sensorStatus").textContent="Sensor error: "+err.message;}
});
function update(){
  $("trial").textContent=`${hits}/${TOTAL}`;$("hits").textContent=hits;$("misses").textContent=misses;
  const avg=rows.length?Math.round(rows.reduce((s,r)=>s+r.time_ms,0)/rows.length):null;
  $("mean").textContent=avg==null?"--":`${avg} ms`;
}
function targetSize(){return mode==="large"?LARGE:mode==="fixed"?SMALL:(detected==="walking"?LARGE:SMALL);}
function hashSeed(str){let h=2166136261;for(const c of str){h=Math.imul(h^c.charCodeAt(0),16777619);}return h>>>0;}
function makeSequence(id){
  // Normalized target centers: all stay within the play area even at 72 px.
  // The SAME sequence is generated for each participant across all six blocks.
  const spots=[[.15,.18],[.50,.18],[.85,.18],[.15,.50],[.85,.50],[.15,.82],[.50,.82],[.85,.82]];
  let state=hashSeed(id.toLowerCase())||1;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const result=[];
  for(let i=0;i<PRACTICE+TOTAL;i++){
    let choices=spots.map((_,j)=>j).filter(j=>{
      if(!result.length)return true;
      const p=spots[result[result.length-1]],q=spots[j];
      return Math.hypot(p[0]-q[0],p[1]-q[1])>=.38;
    });
    result.push(choices[Math.floor(random()*choices.length)]);
  }
  return result.map(i=>spots[i]);
}
function unlock(){["mode","activity","participant","startBtn"].forEach(id=>$(id).disabled=false);}
function abortBlock(message){
  active=false;blockValid=false;game.replaceChildren();
  $("status").textContent=message;
  unlock();$("downloadBtn").disabled=true;
}
function placeTarget(){
  if(!active)return;
  if(hits>=TOTAL){finish();return;}
  if(mode==="adaptive" && (!sensorFresh() || detected==="unknown")){
    abortBlock("Motion state unknown. Block aborted; restart when readings stabilize.");return;
  }
  game.replaceChildren();
  const isPractice=practiceDone<PRACTICE;
  const seqIndex=practiceDone+hits;
  const size=targetSize(),w=game.clientWidth,h=game.clientHeight;
  const [u,v]=sequence[seqIndex];
  // Map normalized centers into the area with a constant 36 px margin,
  // independent of target size. This equalizes target-center distances.
  const margin=LARGE/2+4;
  const center={x:margin+u*(w-2*margin),y:margin+v*(h-2*margin)};
  const x=center.x-size/2,y=center.y-size/2;
  const distance=lastCenter?Math.hypot(center.x-lastCenter.x,center.y-lastCenter.y):null;
  sensorAtTarget={detected:sensorFresh()?detected:"unknown",rms:sensorFresh()?currentRms:null,fresh:sensorFresh()};
  currentTarget={size,center,distance,isPractice,seqIndex};
  const target=document.createElement("button");target.className="target";target.type="button";
  target.setAttribute("aria-label","Tap blue target");
  Object.assign(target.style,{width:size+"px",height:size+"px",left:x+"px",top:y+"px"});
  target.addEventListener("pointerdown",event=>{
    event.stopPropagation();if(!active)return;
    const elapsed=Math.round(performance.now()-targetShownAt);
    if(currentTarget.isPractice){practiceDone++;}
    else{
      hits++;
      rows.push({participant,block_started_at:blockStartedAt,trial:hits,sequence_index:currentTarget.seqIndex,
        mode,actual_activity:activity,detected_activity:sensorAtTarget.detected,
        sensor_rms:sensorAtTarget.rms,sensor_fresh:sensorAtTarget.fresh,
        target_size_px:currentTarget.size,target_center_x_px:currentTarget.center.x,
        target_center_y_px:currentTarget.center.y,distance_px:currentTarget.distance,
        fitts_id_bits:currentTarget.distance==null?null:Math.log2(currentTarget.distance/currentTarget.size+1),
        time_ms:elapsed,misses_before_hit:missesTrial});
    }
    missesTrial=0;lastCenter=currentTarget.center;update();placeTarget();
  });
  game.appendChild(target);targetShownAt=performance.now();
  $("status").textContent=isPractice?`Practice ${practiceDone+1}/${PRACTICE} — not recorded`:
    `Recorded trial ${hits+1}/${TOTAL} — ${size}px target`;
}
game.addEventListener("pointerdown",event=>{
  if(!active || event.target!==game)return;
  missesTrial++;if(!currentTarget.isPractice)misses++;update();
});
function finish(){
  active=false;game.replaceChildren();
  const p=document.createElement("p");p.id="instruction";p.textContent="Block complete. Download your CSV.";game.appendChild(p);
  unlock();$("downloadBtn").disabled=rows.length!==TOTAL || !blockValid;
  $("status").textContent=`Completed ${rows.length} recorded trials. Download CSV before starting another block.`;
}
$("startBtn").addEventListener("click",()=>{
  mode=$("mode").value;activity=$("activity").value;participant=$("participant").value.trim();
  if(!participant){alert("Enter an anonymous participant ID.");return;}
  if(mode==="adaptive" && (!sensorFresh() || detected==="unknown")){
    alert("Adaptive mode needs live, stable motion readings. Enable sensors and wait for a detected state.");return;
  }
  if(rows.length && !$("downloadBtn").disabled && !confirm("Starting a new block will replace the previous CSV. Have you downloaded it?"))return;
  active=true;blockValid=true;hits=0;misses=0;missesTrial=0;practiceDone=0;
  rows=[];lastCenter=null;sequence=makeSequence(participant);blockStartedAt=new Date().toISOString();
  ["mode","activity","participant","startBtn"].forEach(id=>$(id).disabled=true);
  $("downloadBtn").disabled=true;update();placeTarget();
});
$("downloadBtn").addEventListener("click",()=>{
  if(rows.length!==TOTAL || !blockValid)return;
  const cols=["participant","block_started_at","trial","sequence_index","mode","actual_activity",
    "detected_activity","sensor_rms","sensor_fresh","target_size_px","target_center_x_px",
    "target_center_y_px","distance_px","fitts_id_bits","time_ms","misses_before_hit"];
  const escapeCSV=value=>{const s=value==null?"":String(value);return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
  const csv=[cols.join(","),...rows.map(row=>cols.map(key=>escapeCSV(row[key])).join(","))].join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=`walktap_${participant.replace(/[^a-zA-Z0-9_-]/g,"_")}_${mode}_${activity}.csv`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden && active)abortBlock("Block interrupted because Safari was hidden. Restart this condition.");
  if(document.hidden)resetDetection();
});
update();
