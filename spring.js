"use strict";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const R=a=>a[Math.floor(Math.random()*a.length)],NS="http://www.w3.org/2000/svg";
const f=(n,d=2)=>(+n.toFixed(d)).toString();
const shuf=a=>a.map(v=>[Math.random(),v]).sort((x,y)=>x[0]-y[0]).map(p=>p[1]);
// Tabs
$$("nav button").forEach(b=>b.onclick=()=>{$$("nav button").forEach(x=>x.classList.toggle("on",x===b));
 $$("main>section").forEach(s=>s.hidden=s.id!==b.dataset.t);
 if(b.dataset.t==="teach")newT();if(b.dataset.t==="quiz"&&!qs.length)startQ();draw();});
$("#full").onclick=()=>{document.body.classList.toggle("teach");
 if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();};
// Intro
const INFO={sup:"Fixed support (স্থির অবলম্বন): স্প্রিংয়ের উপরের প্রান্ত আটকে রাখে।",coil:"Spring coil: বল পেলে লম্বা বা ছোট হয়; এটিই restoring force দেয়।",mass:"Mass (ভর): ওজন W = mg বল নিচে দেয়, ফলে প্রসারণ x হয়।"};
$$("[data-i]").forEach(e=>e.onclick=()=>$("#info").textContent=INFO[e.dataset.i]);
// Simulation state
const S={m:0,g:9.8,L0:15,k:40,x:0,v:0,pause:false},SC=6.5,TOP=40,XL=0.25;
let pts=[],rows=[];
const Fl=()=>S.k*XL;
const force=x=>x<=XL?S.k*x:Fl()+0.5*S.k*(x-XL);       // spring force (simplified beyond limit)
const xeq=F=>F<=Fl()?F/S.k:XL+(F-Fl())/(0.5*S.k);     // equilibrium extension (m)
const W=()=>S.m*S.g;
function el(t,a,p){const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);(p||$("#ssvg")).appendChild(e);return e;}
function buildSim(){const s=$("#ssvg");s.innerHTML="";
 el("rect",{x:60,y:20,width:140,height:12,fill:"#12285a"},s);
 for(let c=0;c<=60;c++){const y=TOP+c*SC,l=c%10==0;el("line",{x1:300,x2:l?330:318,y1:y,y2:y,stroke:"#12285a"},s);
  if(l){const t=el("text",{x:334,y:y+4,"font-size":10},s);t.textContent=c;}}
 el("text",{x:300,y:432,"font-size":10},s).textContent="ruler (cm)";
 ["l0","l1"].forEach((id,i)=>el("line",{id,x1:20,x2:340,stroke:i?"#f08a24":"#12285a","stroke-dasharray":"4 3"},s));
 el("path",{id:"coil",fill:"none",stroke:"#0ea5c6","stroke-width":4,"stroke-linejoin":"round"},s);
 el("rect",{id:"blk",x:100,width:60,fill:"#f08a24",rx:4},s);el("text",{id:"bt","text-anchor":"middle",x:130,fill:"#fff","font-size":13},s);
 el("text",{id:"t0",x:24,"font-size":10,fill:"#12285a"},s);el("text",{id:"t1",x:24,"font-size":10,fill:"#c4670f"},s);}
function sim(){ // physics step: m x'' = mg - f(x) - c v
 if(S.pause)return;const M=Math.max(S.m,0.05);
 for(let i=0;i<5;i++){const a=(W()-force(S.x)-1.5*S.v)/M;S.v+=a*0.004;S.x+=S.v*0.004;if(S.x<0){S.x=0;S.v=0;}}}
function render(){
 const xe=xeq(W()),L0=S.L0,L=L0+xe*100,yb=TOP+(L0+S.x*100)*SC,y0=TOP;
 let d=`M130 ${y0}V${y0+12}`;const n=12,a=y0+12,b=yb-12;
 for(let i=0;i<n;i++)d+=`L${i%2?105:155} ${a+(i+.5)*(b-a)/n}`;d+=`L130 ${b}V${yb}`;
 $("#coil").setAttribute("d",d);
 const h=S.m>0?25+S.m*20:0,B=$("#blk");B.setAttribute("y",yb);B.setAttribute("height",h);B.style.display=h?"":"none";
 $("#bt").setAttribute("y",yb+h/2+4);$("#bt").textContent=S.m>0?f(S.m,1)+" kg":"";
 const y0l=TOP+L0*SC,y1l=TOP+L*SC;
 $("#l0").setAttribute("y1",y0l);$("#l0").setAttribute("y2",y0l);$("#l1").setAttribute("y1",y1l);$("#l1").setAttribute("y2",y1l);
 $("#t0").setAttribute("y",y0l-3);$("#t0").textContent="L₀="+f(L0,1)+" cm";$("#t1").setAttribute("y",y1l+11);$("#t1").textContent="L="+f(L,1)+" cm";
 $("#mv").textContent=f(S.m,1);$("#lv").textContent=L0;
 const F=W(),eff=xe>0?F/xe:0;
 const o=[f(S.m,1)+" kg",S.g+" m/s²",f(F)+" N",f(L0,1)+" cm",f(L,1)+" cm",f(xe*100,1)+" cm ("+f(xe,3)+" m)",xe>0?f(eff,1)+" N/m":"x = 0 (গণনা নেই)"];
 o.forEach((v,i)=>$("#o"+(i+1)).textContent=v);
 const moving=Math.abs(S.v)>0.003||Math.abs(S.x-xe)>0.002;
 $("#stat").textContent=(S.pause?"Paused. ":"")+(moving?"দোলন চলছে (oscillation) — স্থির হওয়ার অপেক্ষা করুন।":"স্থির ভারসাম্য (static equilibrium): kx = mg।")+(F>Fl()+1e-9?" ⚠ স্থিতিস্থাপক সীমা অতিক্রান্ত (সরল চিত্র): F = kx খাটছে না।":"");
 $("#formula").style.display=$("#fshow").checked?"":"none";}
function loop(){sim();render();requestAnimationFrame(loop);}
$("#m").oninput=e=>S.m=+e.target.value;$("#L0").oninput=e=>S.L0=+e.target.value;
$("#g").onchange=e=>S.g=+e.target.value;
$("#sp").onchange=e=>{S.k=+e.target.value;};
$("#add").onclick=()=>{S.m=Math.min(1.2,Math.round((S.m+0.1)*10)/10);$("#m").value=S.m;};
$("#rem").onclick=()=>{S.m=0;$("#m").value=0;};
$("#pp").onclick=e=>{S.pause=!S.pause;e.target.textContent=S.pause?"Resume":"Pause";};
$("#rst").onclick=()=>{Object.assign(S,{m:0,x:0,v:0,pause:false,L0:15,g:9.8,k:40});$("#m").value=0;$("#L0").value=15;$("#g").value="9.8";$("#sp").value="40";$("#pp").textContent="Pause";};
$("#rec").onclick=()=>{const F=W(),x=xeq(F);if(F<=0)return alert("আগে ভর যোগ করুন।");pts.push({s:S.k,F,x,ok:F<=Fl()+1e-9});draw();};
// Graph
function draw(){const g=$("#gsvg");if(!g)return;g.innerHTML="";const X0=45,Y0=260,PW=320,PH=230,xm=0.5,ym=14;
 const px=x=>X0+x/xm*PW,py=y=>Y0-y/ym*PH;
 el("line",{x1:X0,y1:Y0,x2:X0+PW,y2:Y0,stroke:"#12285a"},g);el("line",{x1:X0,y1:Y0,x2:X0,y2:Y0-PH,stroke:"#12285a"},g);
 for(let i=0;i<=5;i++)el("text",{x:px(i*.1)-8,y:Y0+14,"font-size":10},g).textContent=f(i*.1,1);
 for(let i=0;i<=14;i+=2)el("text",{x:X0-20,y:py(i)+3,"font-size":10},g).textContent=i;
 el("text",{x:150,y:292,"font-size":11},g).textContent="Extension x (m)";el("text",{x:4,y:14,"font-size":11},g).textContent="Force F (N)";
 let out=[];
 [[40,"#0ea5c6","A"],[80,"#f08a24","B"]].forEach(([k,c,n])=>{const P=pts.filter(p=>p.s===k);
  P.forEach(p=>el("circle",{cx:px(p.x),cy:py(p.F),r:4,fill:p.ok?c:"#fff",stroke:c,"stroke-width":2},g));
  const H=P.filter(p=>p.ok),sxx=H.reduce((a,p)=>a+p.x*p.x,0),sxf=H.reduce((a,p)=>a+p.x*p.F,0);
  if(sxx>0){const sl=sxf/sxx,xm2=Math.max(...H.map(p=>p.x));el("line",{x1:px(0),y1:py(0),x2:px(xm2),y2:py(sl*xm2),stroke:c,"stroke-width":2},g);
   out.push(`Spring ${n}: slope = ${f(sl,1)} N/m = k`);}});
 $("#gout").textContent=out.length?out.join(" | "):"এখনও কোনো বিন্দু নেই।";}
$("#gclr").onclick=()=>{pts=[];draw();};
// Experiment table
function otab(){$("#ot tbody").innerHTML=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${f(r.m,1)}</td><td>${f(r.F)}</td><td>${f(r.L0,3)}</td><td>${f(r.L,3)}</td><td>${f(r.x,3)}</td><td>${f(r.k,1)}</td></tr>`).join("");}
$("#oadd").onclick=()=>{const F=W(),x=xeq(F);
 if(S.m<=0)return $("#oout").textContent="ভর শূন্য। সিমুলেশনে ভর দিন।";
 if(F>Fl())return $("#oout").textContent="স্থিতিস্থাপক সীমা পার হয়েছে; কম ভর নিন।";
 rows.push({m:S.m,F,L0:S.L0/100,L:S.L0/100+x,x,k:F/x});otab();$("#oout").textContent="পর্যবেক্ষণ যোগ হয়েছে।";};
$("#odel").onclick=()=>{rows.pop();otab();};$("#orst").onclick=()=>{rows=[];otab();$("#oout").textContent="";};
$("#oavg").onclick=()=>{if(!rows.length)return $("#oout").textContent="কোনো পাঠ নেই।";
 const a=rows.reduce((s,r)=>s+r.k,0)/rows.length;$("#oout").textContent=`গড় k = ${f(a,1)} N/m (${rows.length}টি পাঠ থেকে)`;};
// Series / parallel
function zig(g,x,y1,y2,c){let d=`M${x} ${y1}v6`;const n=8,a=y1+6,b=y2-6;for(let i=0;i<n;i++)d+=`L${i%2?x-14:x+14} ${a+(i+.5)*(b-a)/n}`;d+=`L${x} ${b}V${y2}`;el("path",{d,fill:"none",stroke:c,"stroke-width":3},g);}
function combo(){const k1=+$("#k1").value,k2=+$("#k2").value;$("#k1v").textContent=k1;$("#k2v").textContent=k2;
 const ks=k1*k2/(k1+k2),kp=k1+k2,s=$("#cs"),p=$("#cp");s.innerHTML=p.innerHTML="";
 const L=k=>Math.max(30,Math.min(100,2400/k));
 el("rect",{x:30,y:10,width:140,height:8,fill:"#12285a"},s);const a=L(k1),b=L(k2);zig(s,100,18,18+a,"#0ea5c6");zig(s,100,18+a,18+a+b,"#f08a24");
 el("rect",{x:80,y:18+a+b,width:40,height:25,fill:"#12285a"},s);
 el("rect",{x:30,y:10,width:140,height:8,fill:"#12285a"},p);const l=L(kp);zig(p,70,18,18+l,"#0ea5c6");zig(p,130,18,18+l,"#f08a24");
 el("rect",{x:50,y:18+l,width:100,height:25,fill:"#12285a"},p);
 $("#cso").textContent=`k_eq = ${f(ks,1)} N/m (প্রতিটির চেয়ে কম)`;$("#cpo").textContent=`k_eq = ${f(kp,1)} N/m (প্রতিটির চেয়ে বেশি)`;}
$("#k1").oninput=$("#k2").oninput=combo;
// Problem generator
function gen(){const t=R([0,1,2,3,4,5]),k=R([20,40,50,100,200]),xc=R([2,4,5,10,20]),m=R([1,2,3,5]),P=R([[60,60],[20,30],[40,60],[30,60],[10,40]]);
 if(t==0){const F=k*xc/100;return{q:`একটি স্প্রিংয়ের k = ${k} N/m। ${xc} cm প্রসারিত করতে কত বল লাগবে?`,st:`দেওয়া: k=${k} N/m, x=${xc} cm = ${xc/100} m\nসূত্র: F = kx\nF = ${k} × ${xc/100} = ${f(F)} N`,a:F,u:"N"};}
 if(t==1){const F=k*xc/100;return{q:`${f(F)} N বলে একটি স্প্রিং (k = ${k} N/m) কত cm প্রসারিত হবে?`,st:`দেওয়া: F=${f(F)} N, k=${k} N/m\nসূত্র: x = F/k\nx = ${f(F)}/${k} = ${f(F/k,3)} m = ${xc} cm`,a:xc,u:"cm"};}
 if(t==2){const F=k*xc/100;return{q:`${f(F)} N বল প্রয়োগে স্প্রিং ${xc} cm প্রসারিত হলো। k কত?`,st:`দেওয়া: F=${f(F)} N, x=${xc} cm = ${xc/100} m\nসূত্র: k = F/x\nk = ${f(F)}/${xc/100} = ${k} N/m`,a:k,u:"N/m"};}
 if(t==3){const F=m*10;return{q:`${m} kg ভর স্প্রিংয়ে ঝোলানো হলো (g = 10 m/s²)। ওজন কত?`,st:`দেওয়া: m=${m} kg, g=10 m/s²\nসূত্র: W = mg\nW = ${m} × 10 = ${F} N`,a:F,u:"N"};}
 if(t==4){const e=P[0]*P[1]/(P[0]+P[1]);return{q:`${P[0]} N/m ও ${P[1]} N/m এর দুটি স্প্রিং সিরিজে যুক্ত। k_eq কত?`,st:`সূত্র: 1/k_eq = 1/k₁ + 1/k₂ ⇒ k_eq = k₁k₂/(k₁+k₂)\n= (${P[0]}×${P[1]})/(${P[0]+P[1]}) = ${f(e,2)} N/m`,a:e,u:"N/m"};}
 return{q:`${P[0]} N/m ও ${P[1]} N/m এর দুটি স্প্রিং প্যারালালে যুক্ত। k_eq কত?`,st:`সূত্র: k_eq = k₁ + k₂\n= ${P[0]} + ${P[1]} = ${P[0]+P[1]} N/m`,a:P[0]+P[1],u:"N/m"};}
const MC=[["স্প্রিং ধ্রুবকের SI একক কী?","N/m",["N","kg/s","N·m"],"k = F/x, তাই একক N/m।"],
["হুকের সূত্র কোন সীমার মধ্যে প্রযোজ্য?","স্থিতিস্থাপক সীমা",["ভাঙন সীমা","যেকোনো বলে","শুধু সংকোচনে"],"সীমার মধ্যে F ∝ x।"],
["F–x গ্রাফের ঢাল কী নির্দেশ করে?","স্প্রিং ধ্রুবক k",["ভর","g","ওজন"],"ঢাল = ΔF/Δx = k।"],
["সিরিজ সংযোগে k_eq প্রতিটি স্প্রিংয়ের k এর চেয়ে—","কম",["বেশি","সমান","দ্বিগুণ"],"1/k_eq = 1/k₁+1/k₂ ⇒ k_eq ছোট।"],
["প্যারালাল সংযোগে k_eq =","k₁ + k₂",["k₁k₂/(k₁+k₂)","k₁ − k₂","k₁/k₂"],"প্যারালালে বল ভাগ হয়, k যোগ হয়।"],
["প্রসারণ x এর সঠিক সূত্র—","L − L₀",["L + L₀","L₀ − L","L × L₀"],"চূড়ান্ত দৈর্ঘ্য − প্রাথমিক দৈর্ঘ্য।"]];
// Quiz
let qs=[],qi=0,sc=0,done=false;
function startQ(){qs=[];for(let i=0;i<4;i++){const g=gen();qs.push({t:"n",...g});}
 shuf(MC).slice(0,5).forEach(m=>qs.push({t:"m",q:m[0],a:m[1],o:shuf([m[1],...m[2]]),ex:m[3]}));
 qs.push({t:"f",q:"F = ___ × x (শূন্যস্থানে প্রতীক লিখুন)",a:"k",ex:"F = kx।"});qs=shuf(qs);qi=0;sc=0;showQ();}
function showQ(){const b=$("#qbox");$("#qbar").style.width=qi/qs.length*100+"%";done=false;
 if(qi>=qs.length){b.innerHTML=`<h3>শেষ! স্কোর: ${sc}/${qs.length}</h3><button id="qre" class="hot">Restart</button>`;$("#qre").onclick=startQ;$("#qscore").textContent="";return;}
 const q=qs[qi];let h=`<p class="big">প্রশ্ন ${qi+1}/${qs.length}: ${q.q}</p>`;
 if(q.t=="m")h+=q.o.map(o=>`<button class="opt" data-o="${o}">${o}</button>`).join("");
 else h+=`<input id="qa" ${q.t=="n"?'type="number" step="any"':'type="text"'}> ${q.u||""} <button id="qs" class="hot">জমা দিন</button>`;
 b.innerHTML=h+'<div id="fb" class="note" hidden></div>';
 $$(".opt").forEach(o=>o.onclick=()=>check(o.dataset.o,o));if($("#qs"))$("#qs").onclick=()=>check($("#qa").value);
 $("#qscore").textContent="স্কোর: "+sc;}
function check(v,btn){if(done||v==="")return;done=true;const q=qs[qi];let ok;
 if(q.t=="n")ok=Math.abs(+v-q.a)<=0.01*Math.abs(q.a)+1e-9;else ok=String(v).trim().toLowerCase()===q.a.toLowerCase();
 if(ok)sc++;if(btn)btn.classList.add(ok?"ok":"bad");
 const fb=$("#fb");fb.hidden=false;fb.innerHTML=(ok?"✔ সঠিক!":"✘ ভুল।")+` সঠিক উত্তর: <b>${f(q.a)} ${q.u||""}</b><br>`+(q.t=="n"?q.st.replace(/\n/g,"<br>"):q.ex)+'<br><button id="qn">পরবর্তী</button>';
 $("#qn").onclick=()=>{qi++;showQ();};$("#qscore").textContent="স্কোর: "+sc;}
// Teacher
let tp=null;function newT(){tp=gen();$("#tq").textContent=tp.q;$("#ts").hidden=true;$("#ts").innerHTML="";}
$("#tn").onclick=newT;$("#tr").onclick=()=>{const s=$("#ts");s.hidden=!s.hidden;s.innerHTML=tp.st.replace(/\n/g,"<br>")+`<br><b>উত্তর: ${f(tp.a)} ${tp.u}</b>`;};
buildSim();combo();draw();otab();loop();
