"use strict";
const $ = id => document.getElementById(id);
const TOTAL = 20, PRACTICE = 3, SMALL = 44, LARGE = 72;
const WINDOW_MS = 2000, THRESHOLD_ON = 0.70, THRESHOLD_OFF = 0.50;
const STABLE_MS = 800, STALE_MS = 2500;
let sensorRequested = false, sensorSamples = [], lastSensorAt = -Infinity;
let detected = "unknown", pending = null, pendingSince = 0, currentRms = null;
let active = false, mode = "fixed", activity = "sitting", participant = "";
let hits = 0, misses = 0, missesTrial = 0, practiceDone = 0;
let rows = [], targetShownAt = 0, currentTarget = null, lastCenter = null;
let blockStart = 0, sensorAtTarget = null;
const game = $("gameArea");
function mag(x,y,z){return Math.hypot(x,y,z);}
function sensorFresh(){return performance.now()-lastSensorAt < STALE_MS;}
function resetDetection(){detected="unknown";pending=null;pendingSince=0;currentRms=null;sensorSamples=[];}
function onMotion(event){
  const a=event.acceleration;
  if(!a || ![a.x,a.y,a.z].every(Number.isFinite))return;
  const now=performance.now();lastSensorAt=now;
  sensorSamples.push({t:now,m:mag(a.x,a.y,a.z)});
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
  if(!sensorFresh()){resetDetection();$("detected").textContent="Unknown";$("rms").textContent="--";return;}
  $("detected").textContent=detected;
  $("rms").textContent=currentRms==null?"--":currentRms.toFixed(3);
}
setInterval(()=>{showSensor();if(sensorRequested && !sensorFresh())$("sensorStatus").textContent="No recent motion data — keep Safari visible.";},500);
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
    $("sensorStatus").textContent="Permission granted; waiting for live readings.";
  }catch(err){$("sensorStatus").textContent="Sensor error: "+err.message;}
});
function update(){
  $("trial").textContent=`${hits}/${TOTAL}`;$("hits").textContent=hits;$("misses").textContent=misses;
  const avg=rows.length?Math.round(rows.reduce((s,r)=>s+r.time_ms,0)/rows.length):null;
  $("mean").textContent=avg==null?"--":`${avg} ms`;
}
function targetSize(){return mode==="large"?LARGE:mode==="fixed"?SMALL:(detected==="walking"?LARGE:SMALL);}
function placeTarget(){
  if(hits>=TOTAL){finish();return;}
  game.replaceChildren();
  const isPractice=practiceDone<PRACTICE;
  const size=targetSize(), w=game.clientWidth, h=game.clientHeight;
  const x=Math.random()*Math.max(0,w-size), y=Math.random()*Math.max(0,h-size);
  const center={x:x+size/2,y:y+size/2};
  const distance=lastCenter?Math.hypot(center.x-lastCenter.x,center.y-lastCenter.y):null;
  sensorAtTarget={detected:sensorFresh()?detected:"unknown",rms:sensorFresh()?currentRms:null, fresh:sensorFresh()};
  currentTarget={size,center,distance,isPractice};
  const target=document.createElement("button");target.className="target";target.type="button";
  target.setAttribute("aria-label","Tap blue target");
  Object.assign(target.style,{width:size+"px",height:size+"px",left:x+"px",top:y+"px"});
  target.addEventListener("pointerdown",event=>{
    event.stopPropagation();if(!active)return;
    const elapsed=Math.round(performance.now()-targetShownAt);
    if(currentTarget.isPractice){practiceDone++;}
    else{
      hits++;
      rows.push({participant,trial:hits,mode,actual_activity:activity,
        detected_activity:sensorAtTarget.detected,sensor_rms:sensorAtTarget.rms,
        sensor_fresh:sensorAtTarget.fresh,target_size_px:currentTarget.size,
        distance_px:currentTarget.distance,time_ms:elapsed,misses_before_hit:missesTrial});
    }
    missesTrial=0;lastCenter=currentTarget.center;update();placeTarget();
  });
  game.appendChild(target);targetShownAt=performance.now();
  $("status").textContent=isPractice?`Practice ${practiceDone+1}/${PRACTICE} — not recorded`:
    `Recorded trial ${hits+1}/${TOTAL} — ${size}px target`;
}
game.addEventListener("pointerdown",event=>{
  if(!active || event.target!==game)return;
  missesTrial++;
  if(!currentTarget.isPractice)misses++;
  update();
});
function finish(){
  active=false;game.replaceChildren();
  const p=document.createElement("p");p.id="instruction";p.textContent="Block complete. Download your CSV.";game.appendChild(p);
  ["mode","activity","participant","startBtn"].forEach(id=>$(id).disabled=false);
  $("downloadBtn").disabled=rows.length===0;
  $("status").textContent=`Completed ${rows.length} recorded trials. Save your CSV before starting another block.`;
}
$("startBtn").addEventListener("click",()=>{
  mode=$("mode").value;activity=$("activity").value;participant=$("participant").value.trim();
  if(!participant){alert("Enter a participant ID.");return;}
  if(mode==="adaptive" && (!sensorFresh() || detected==="unknown")){
    alert("Adaptive mode needs live, calibrated motion readings. Enable sensors and wait for a detected state.");return;
  }
  active=true;hits=0;misses=0;missesTrial=0;practiceDone=0;rows=[];lastCenter=null;blockStart=performance.now();
  ["mode","activity","participant","startBtn"].forEach(id=>$(id).disabled=true);
  $("downloadBtn").disabled=true;update();placeTarget();
});
$("downloadBtn").addEventListener("click",()=>{
  if(!rows.length)return;
  const cols=["participant","trial","mode","actual_activity","detected_activity","sensor_rms","sensor_fresh","target_size_px","distance_px","time_ms","misses_before_hit"];
  const escapeCSV=value=>{const s=value==null?"":String(value);return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
  const csv=[cols.join(","),...rows.map(row=>cols.map(key=>escapeCSV(row[key])).join(","))].join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=`walktap_${participant.replace(/[^a-zA-Z0-9_-]/g,"_")}_${mode}_${activity}.csv`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){resetDetection();if(active){active=false;game.replaceChildren();$("status").textContent="Block interrupted: page hidden. Restart this block.";
    ["mode","activity","participant","startBtn"].forEach(id=>$(id).disabled=false);
    $("downloadBtn").disabled=rows.length===0;
  }}
});
update();
