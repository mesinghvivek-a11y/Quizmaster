
let DATA=null,SUBJ=null,LIVE=null;const FORCE=new Set();
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
let KEY='',byId=new Map();
let filtered=[],order=[],current=0,selected=null,shuffled=false,submitted=false,elapsed=0,timer=null,mode='practice',retryIds=null,search='',fontScale=+(store.get('pq-font')||1)||1;
let paused=false;
const answers=new Map(),flags=new Set(),spent=new Map();
const examFilter=$('examFilter'),groupFilter=$('groupFilter'),yearFilter=$('yearFilter'),viewFilter=$('viewFilter'),card=$('questionCard'),navList=$('navList');


const stateFor=q=>answers.get(q.id)||null,currentQ=()=>order[current]||null,revealed=a=>!!a&&a.grade!=='pending';
/* reflow: PDF-extracted text has hard line breaks every ~60 chars. Join them so text fills the width,
   but keep numbered/lettered items, table rows and real paragraph ends on their own lines. */
const WORDS=new Set();
function buildWords(){WORDS.clear();if(!SUBJ.reflow)return;const re=/[a-z]{3,}/g;for(const q of DATA.questions){for(const s of [q.prompt,q.explanation,...q.options.map(o=>o.text)]){if(!s)continue;const t=s.toLowerCase();let m;re.lastIndex=0;while((m=re.exec(t)))WORDS.add(m[0]);}}}
const START=/^\s*(\d{1,2}\s*[.)]|\(?[a-zA-Z]{1,3}\)\s|\(?[ivxIVX]{1,4}[.)]\s|[A-Da-d][.)]\s|[-•●▪*–]\s|(Statement|Assertion|Reason|Codes?|Select|Choose|Consider|Which of|Match|List)\b)/;
const tabbed=s=>/\t/.test(s.replace(/^[^\t]{1,24}(\t\s*:?\s*)+/,''));
function reflow(t){
 if(!t||t.indexOf('\n')<0)return t||'';
 const L=t.split('\n');let max=0;for(const l of L)if(l.length>max)max=l.length;
 let out='',prev='',brk=false,rigid=false;
 for(const raw of L){
  const s=raw.trim();
  if(!s){brk=true;continue;}
  let sep=' ';
  if(!out)sep='';
  else if(brk)sep='\n\n';
  else{
   const table=tabbed(s);
   const short=prev.length<max*.7&&/[.?!:;)”"]$/.test(prev);
   if(rigid||table||START.test(raw)||(short&&/^[A-Z“"‘'(]/.test(s)))sep='\n';
   else if(/[A-Za-z]-$/.test(prev)&&/^[a-z]/.test(s)){
    const a=(prev.match(/([A-Za-z]+)-$/)||[])[1]||'',b=(s.match(/^[a-z]+/)||[''])[0];
    if(a&&b&&WORDS.has((a+b).toLowerCase()))out=out.slice(0,-1);
    sep='';
   }
  }
  rigid=tabbed(s);
  out+=sep+s;prev=s;brk=false;
 }
 return out;
}

const keyStr=q=>q.correct.map(x=>x.toUpperCase()).join(', ');
const selKeys=a=>!a?[]:a.sel||(a.selected?[a.selected]:[]),isMulti=q=>q.correct.length>1&&q.gradeable;
function gradeOf(q,a){if(!q.gradeable)return'ungraded';const L=new Set((typeof a==='string'?[a]:selKeys(a)).map(k=>(q.options.find(o=>o.key===k)||{}).sourceLabel));return L.size===q.correct.length&&q.correct.every(c=>L.has(c))?'correct':'wrong';}
function hay(q){return q._h||(q._h=(q.prompt+' '+q.options.map(o=>o.text).join(' ')+' '+(q.explanation||'')+' '+q.chapter).toLowerCase());}
function matchQ(q){
 if(retryIds)return retryIds.has(q.id);return setupMatch(q);
}
function setupMatch(q,ignoreChapter=false){
 const ex=examFilter.value,v=viewFilter.value,gp=groupFilter.value,yr=yearFilter.value,a=answers.get(q.id);
 if(!ignoreChapter&&chosenChapters.size&&!chosenChapters.has(q.chapterNo))return false;if(gp!=='all'&&q.group!==gp)return false;
 if((ex!=='all'||yr!=='all')&&!q.examTags.some(t=>(ex==='all'||(t.family||t.label)===ex)&&(yr==='all'||yrsOf(t).includes(+yr))))return false;
 if(v==='unattempted'&&a)return false;if(v==='incorrect'&&!(a&&a.grade==='wrong'))return false;if(v==='flagged'&&!flags.has(q.id))return false;
 if(v==='due'||v==='everwrong'||v==='weak'||v==='new'||v==='noted'){const s=QS[q.id];if(v==='due'&&!(s&&s.d<=Date.now()))return false;if(v==='everwrong'&&!(s&&s.w))return false;if(v==='weak'&&!(s&&s.a&&s.c/s.a<.6))return false;if(v==='new'&&s)return false;if(v==='noted'&&!NOTES[q.id])return false;}
 return !search||hay(q).includes(search);
}
function applyFilters(){filtered=DATA.questions.filter(matchQ);order=[...filtered];shuffled=false;current=0;selected=null;render();}
const userFilter=()=>{retryIds=null;applyFilters();};

/* persistence */
let _st;function save(){clearTimeout(_st);_st=setTimeout(saveNow,400);}
function saveNow(){clearTimeout(_st);if(!KEY)return;store.set(KEY,JSON.stringify({a:[...answers],f:[],t:[...spent],e:elapsed,s:submitted,m:mode,c:currentQ()?.id,x:sess}));}
function toast(m){const t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,4200);}
function restore(){
 const raw=store.get(KEY);if(!raw)return null;
 try{const s=JSON.parse(raw);if(!QM.user&&!s?.s)return null;if(s?.x?.account&&s.x.account!==QM.user?.id)return null;if(!s||!s.a||!s.a.length&&!s.e&&!s.x?.mock)return null;
  s.a.forEach(([id,a])=>{if(byId.has(id))answers.set(id,a)});(s.t||[]).forEach(([id,n])=>byId.has(id)&&spent.set(id,n));
  elapsed=s.e||0;sess=s.x||{};submitted=!!s.s;mode=s.m==='exam'?'exam':'practice';return s;}catch(e){return null;}
}

/* render */
function testRunning(){return !!(L()||(!submitted&&(sess.mock||sess.id||retryIds)));}
let leavingPage=false;
function warnUnload(e){if(!leavingPage&&testRunning()){e.preventDefault();e.returnValue='';}}
function syncExitGuard(){
 if(testRunning()){
  addEventListener('beforeunload',warnUnload);
  if(!history.state?.testGuard)history.pushState({testGuard:true},'');
 }else removeEventListener('beforeunload',warnUnload);
}
addEventListener('popstate',()=>{
 if(history.state?.testGuard||!testRunning()||leavingPage)return;
 if(!confirm('A test is running. Leave this test and go back?')){history.pushState({testGuard:true},'');return;}
 leavingPage=true;
 if(document.referrer||history.length>2)history.back();else location.assign('index.html');
});
addEventListener('pageshow',()=>{leavingPage=false;});
document.querySelector('a[aria-label="Home"]').addEventListener('click',e=>{
 if(!testRunning()||e.metaKey||e.ctrlKey||e.shiftKey)return;
 if(!confirm('A test is running. Leave this test and go home?'))e.preventDefault();
 else{logSession('in-progress');saveNow();flushPersist();leavingPage=true;setTimeout(()=>{leavingPage=false;},1000);}
});
function render(){
 const active=!submitted&&!!(retryIds||sess.mock||sess.id||L());
 document.body.dataset.stage=active?'active':submitted?'review':'setup';
 const page=active||submitted?'test.html':'builder.html';
 const url=new URL(location.href);
 if(!url.pathname.endsWith('/'+page)){
  const fromBuilder=url.pathname.endsWith('/builder.html');
  url.pathname=url.pathname.replace(/[^/]+$/,page);
  if(active&&fromBuilder&&!history.state?.testGuard)history.pushState({testGuard:true},'',url);
  else history.replaceState(history.state,'',url);
 }
 syncExitGuard();
 $('backChapters').hidden=!submitted;
 $('backChapters').href='builder.html?s='+encodeURIComponent(SUBJ.id);
 $('testSubmit').textContent=submitted?'Summary':L()&&!L().host?'Exit test':'End test';
 if(!active&&!submitted)drawChapterShelf();
 $('examAnalysis').hidden=false;
 $('examAnalysis').href='analysis.html?s='+encodeURIComponent(SUBJ.id)+(examFilter.value==='all'?'':'&exam='+encodeURIComponent(examFilter.value));
 $('chSummary').textContent=chosenChapters.size?chosenChapters.size+' selected':'All chapters';
 if(!active&&DATA)$('poolCount').textContent=DATA.questions.filter(q=>setupMatch(q)&&q.attemptable&&q.gradeable&&q.options.length).length+' eligible questions';

 const q=currentQ();
 $('filterSummary').textContent=retryIds?(sess.mock?`${sess.live?'Live room':'Custom session'} · ${order.length} questions`:`Retrying ${order.length} missed questions`):`${order.length} of ${DATA.questions.length} questions in view`;
 $('positionPill').textContent=order.length?`Question ${current+1} / ${order.length}`:'No questions';
 $('navSummary').textContent=`${order.length} questions · ${answers.size} attempted`;
 document.querySelectorAll('#modeSeg button').forEach(b=>b.classList.toggle('on',b.dataset.mode===mode));
 renderNavigator();updateScore();syncBar(q);save();
 if(!q){card.innerHTML='<div class="empty"><h3>No questions match this view</h3><p>Change the exam, chapter, review set or search text.</p></div>';return;}
 const saved=stateFor(q)||(FORCE.has(q.id)?{grade:'timeout',sel:[],selected:null}:null),rev=revealed(saved);selected=saved?saved.selected:null;
 const tags=(q.group&&DATA.groups&&DATA.groups.length?`<span class="tag">${esc(q.group)}</span>`:'')+(q.examTags.length?q.examTags.map(t=>`<span class="tag exam">${esc(t.label)}</span>`).join(''):(SUBJ.builtin?'<span class="tag">Exam tag not recovered</span>':''));
 const mt=q.prompt?parseMatch(q.prompt):null,prompt=(q.prompt?(mt?matchHTML(mt):`<p class="prompt">${esc(rf(q.prompt))}</p>`):'')+(q.images||[]).map(u=>`<img class="qimg" src="${esc(u)}" loading="lazy" decoding="async" alt="Question figure">`).join('');
 let options;
 if(q.options.length){options='<div class="options" role="group" aria-label="Answer options">'+q.options.map(o=>{
  let cls='opt',mark='';
  if(rev){if(q.gradeable&&q.correct.includes(o.sourceLabel)){cls+=' correct';mark='✓'}else if(selKeys(saved).includes(o.key)&&q.gradeable){cls+=' wrong';mark='✗'}else if(selKeys(saved).includes(o.key))cls+=' selected';}
  else if(selKeys(saved).includes(o.key))cls+=' selected';
  return `<button class="${cls}" type="button" data-option="${esc(o.key)}" ${rev||submitted?'disabled':''}><span class="letter">${esc(o.sourceLabel.toUpperCase())}</span><span>${(mt&&optMatch(o.text,mt))?'<span class="mo">'+optMatch(o.text,mt)+'</span>':(esc(rf(o.text))||(o.image?'':'<em>[Option text not recovered]</em>'))}${o.image?`<img class="oimg" src="${esc(o.image)}" loading="lazy" decoding="async" alt="Option ${esc(o.sourceLabel)}">`:''}</span>${mark?`<span class="mark">${mark}</span>`:''}</button>`;}).join('')+'</div>';}
 else options='<div class="note" style="margin:0 0 20px">The source layout did not yield reliable separate options for this item. The extracted prompt is retained for review; it is not scored.</div>';
 const expl=(t,label,fallback)=>(t||fallback)?`<details open><summary>${label}</summary><div class="explain">${QM.studyHTML(rf(t||fallback),esc)}</div></details>`:'';
 let fb='';
 if(rev){
  if(saved.grade==='correct')fb=`<div class="fb good"><div class="fb-head"><span class="fb-ico" data-i="✓"></span><div>Correct<small>Correct option: ${keyStr(q)}</small></div></div>${expl(q.explanation,'Explanation','No separate explanation text was recovered from the source.')}</div>`;
  else if(saved.grade==='wrong')fb=`<div class="fb bad"><div class="fb-head"><span class="fb-ico" data-i="✗"></span><div>Incorrect<small>Correct option: ${keyStr(q)}</small></div></div>${expl(q.explanation,'Explanation')}</div>`;
  else if(saved.grade==='timeout')fb=`<div class="fb neutral"><div class="fb-head"><span class="fb-ico" data-i="⏱"></span><div>Time’s up<small>Correct option: ${keyStr(q)}</small></div></div>${expl(q.explanation,'Explanation','No separate explanation text was recovered from the source.')}</div>`;
  else fb=`<div class="fb neutral"><div class="fb-head"><span class="fb-ico" data-i="!"></span><div>Attempt recorded · no answer key<small>${esc(q.answerRaw||'No printed answer key line')} — the book gives no mappable keyed option, so this cannot be scored.</small></div></div>${expl(q.explanation,'Explanation / source note')}</div>`;
 }
 const exam=mode==='exam';
 const hint=isMulti(q)&&!rev&&!submitted&&q.attemptable?'<span>Multiple answers: select every correct option'+(mode==='practice'?', then press Check':'')+'</span>':submitted?'Test submitted — review only.':!q.attemptable?'This item is retained for source review.':exam?'<span>Exam mode: change your answer any time before you submit</span>':'<span>Tap an option to check it instantly</span><kbd class="kbdhint">A–D</kbd><span class="kbdhint">then</span><kbd class="kbdhint">Enter</kbd><span class="kbdhint">for next</span>';
 const mchk=isMulti(q)&&!rev&&!submitted&&mode==='practice'&&saved&&saved.sel&&saved.sel.length?'<div style="margin:0 28px 4px"><button class="btn primary" id="chkMulti" type="button">Check answer</button></div>':'';
 card.innerHTML=`<div class="qhead"><span class="qn">Q${esc(q.number)}</span><span class="qch" title="${esc(q.chapter||'')}">Ch ${String(q.chapterNo).padStart(2,'0')} · ${esc(q.chapter||'')}</span><div class="qacts"><button class="ib ${flags.has(q.id)?'on':''}" id="flagBtn" type="button" title="Bookmark for review (F)" aria-label="Bookmark for review" aria-pressed="${flags.has(q.id)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="${flags.has(q.id)?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg></button><button class="ib rep" id="rptBtn" type="button" title="Report a problem with this question" aria-label="Report a problem"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/></svg></button></div>${tags?`<div class="tags">${tags}</div>`:''}</div>
 <div class="qbody">${prompt}${options}</div>
 <p class="hint">${hint}</p>${mchk}${fb}${noteBox(q)}`;
 card.querySelectorAll('[data-option]').forEach(b=>b.addEventListener('click',()=>pick(b.dataset.option)));
 $('flagBtn').addEventListener('click',()=>toggleFlag(q));$('rptBtn').addEventListener('click',()=>{$('rptBackdrop').hidden=false;});
 const cm=$('chkMulti');if(cm)cm.addEventListener('click',checkMulti);
 const nt=$('noteTa');if(nt)nt.addEventListener('input',()=>setNote(q.id,nt.value));
}
function syncBar(q){const a=q&&stateFor(q);$('prevBtn').disabled=!q||current===0;$('nextBtn').disabled=!q||current>=order.length-1;$('clearBtn').disabled=!a||submitted;$('nextBtn').classList.toggle('primary',!!q&&(mode==='exam'||revealed(a)));}
function setPaused(p){if(submitted)p=false;paused=p;
 const q=currentQ();
 const canRead=!!(q&&!L()&&(stateFor(q)||FORCE.has(q.id)||soloPhase()?.review));
 document.body.classList.toggle('readPaused',p&&canRead);document.body.classList.toggle('paused',p);const b=$('pauseBtn');b.textContent=p?'▶':'❚❚';b.setAttribute('aria-label',p?'Resume test':'Pause test');b.title=(p?'Resume':'Pause')+' (P)';b.disabled=submitted;if(p)stopClock();else if(!submitted)startClock();}
function pick(key){
 const q=currentQ();if(!q||paused||submitted||!signedIn())return;const a=stateFor(q);if(revealed(a))return;ensureSess();startClock();
 if(isMulti(q)){let s=selKeys(a).slice();s=s.includes(key)?s.filter(x=>x!==key):[...s,key];if(!s.length)answers.delete(q.id);else answers.set(q.id,{selected:s[0],sel:s,grade:'pending'});render();return;}
 if(mode==='exam'){answers.set(q.id,{selected:key,grade:'pending'});render();return;}
 selected=key;check(q);
}
function checkMulti(){if(paused)return;const q=currentQ(),a=q&&stateFor(q);if(!a||submitted)return;const g=gradeOf(q,a);answers.set(q.id,{selected:a.selected,sel:a.sel,grade:g});recordResult(q,g);render();}
function check(q){if(!selected||submitted||mode==='exam')return;const g=gradeOf(q,selected);answers.set(q.id,{selected,grade:g});recordResult(q,g);render();const f=card.querySelector('.fb');if(f)f.scrollIntoView({behavior:'smooth',block:'nearest'});}
const bookmarkWrites=new Map();
async function toggleFlag(q){
 const subject=SUBJ,key=QM.bookmarkKey(subject.id,q.id);
 if(bookmarkWrites.has(key))return;
 const remove=flags.has(q.id);
 const value=remove?{ts:Date.now(),deleted:true}:QM.makeBookmark(subject,q);
 bookmarkWrites.set(key,true);
 try{await QM.kvSet(key,value);
  if(SUBJ===subject){if(remove)flags.delete(q.id);else flags.add(q.id);render();}
 }catch{toast('Bookmark could not be saved. Please try again.');}finally{bookmarkWrites.delete(key);}
}
function go(i){if(i<0||i>=order.length||paused||(L()&&!L().int))return;current=i;selected=null;render();scrollTo({top:0,behavior:'smooth'});if(innerWidth<=760)$('navigator').classList.remove('open');}
let navOrder=null,navBtns=[];
function navCls(q,i){const a=stateFor(q),st=!a?'':a.grade==='correct'?' done':a.grade==='wrong'?' wrong':a.grade==='ungraded'?' ungraded':' answered';return'navitem'+(i===current?' active':'')+st+(flags.has(q.id)?' flag':'');}
navList.addEventListener('click',e=>{const b=e.target.closest('.navitem');if(b)go(+b.dataset.i);});
function renderNavigator(){
 if(navOrder!==order){navOrder=order;navBtns=[];const fr=document.createDocumentFragment();let prev=null;
  order.forEach((q,i)=>{if(!shuffled&&q.chapterNo!==prev){const g=document.createElement('div');g.className='navgrp';g.textContent=`${String(q.chapterNo).padStart(2,'0')} · ${q.chapter||''}`;fr.append(g);prev=q.chapterNo;}
   const b=document.createElement('button');b.type='button';b.dataset.i=i;b.textContent=`${q.chapterNo}·${q.number}`;b.title=`Chapter ${q.chapterNo}, question ${q.number}`;navBtns.push(b);fr.append(b);});
  navList.replaceChildren(fr);}
 for(let i=0;i<navBtns.length;i++){const c=navCls(order[i],i);if(navBtns[i].className!==c)navBtns[i].className=c;}
 const a=navBtns[current];if(a){const r=a.getBoundingClientRect(),n=navList.getBoundingClientRect();if(r.top<n.top||r.bottom>n.bottom)navList.scrollTop+=r.top-n.top-n.height/2;}
}
function updateScore(){
 let c=0,w=0,u=0;for(const a of answers.values()){if(a.grade==='correct')c++;else if(a.grade==='wrong')w++;else if(a.grade==='ungraded')u++;}
 const hide=mode==='exam'&&!submitted;
 $('correctCount').textContent=hide?'–':c;$('incorrectCount').textContent=hide?'–':w;$('ungradedCount').textContent=hide?'–':u;$('attemptedCount').textContent=answers.size;
 const g=c+w;$('scorePercent').innerHTML=hide?'Results are revealed on submit':g?`Accuracy <b>${Math.round(c/g*100)}%</b>`:'Not started';
 $('progressBar').style.width=(order.length?Math.min(100,order.filter(q=>answers.has(q.id)).length/order.length*100):0)+'%';
}

/* stopwatch + time per question */
const pad=n=>String(n).padStart(2,'0'),fmt=s=>`${pad(Math.floor(s/3600))}:${pad(Math.floor(s%3600/60))}:${pad(s%60)}`,mmss=s=>`${Math.floor(s/60)}:${pad(s%60)}`;
function drawNext(label,remaining,duration,review,stopped){
 const button=$('nextBtn'),timed=duration>0;
 button.classList.toggle('phase-clock',timed);
 button.classList.toggle('review-clock',timed&&review);
 button.classList.toggle('phase-urgent',timed&&remaining<=10000);
 $('nextTime').hidden=!timed;
 $('nextAction').textContent=label;
 if(timed){
  button.style.setProperty('--remaining',String(Math.max(0,Math.min(1,remaining/duration))));
  $('nextTime').textContent=(stopped?'Paused':review?'Review':'Answer')+' '+mmss(Math.ceil(Math.max(0,remaining)/1000));
 }
 button.setAttribute('aria-label',timed?label+' · '+$('nextTime').textContent:'Next question');
}
function soloPhase(){
 const q=currentQ();
 if(!q||!sess.qsec||sess.live||submitted||mode!=='practice')return null;
 const review=revealed(stateFor(q))||FORCE.has(q.id);
 let phase=sess.practiceClock;
 if(!phase||phase.id!==q.id||(!phase.review&&review)){
  phase=sess.practiceClock={id:q.id,review,start:elapsed};
 }
 return phase;
}
function paint(){
 const H=L(),started=document.body.dataset.stage==='active'&&(!H||!!H.cfg?.ids&&H.ph!=='lobby');
 $('timerBox').hidden=!started;
 const liveMs=H?(H.watchMs||0)+(H.watchAnchor&&!H.pz?Date.now()-H.watchAnchor:0):0;
 $('stopwatch').textContent=fmt(H?Math.floor(Math.max(0,liveMs)/1000):Math.max(0,elapsed-(sess.eb||0)));
 if(started&&H&&H.cfg?.mode==='practice'&&['live','reveal'].includes(H.ph)){
  const review=H.ph==='reveal';
  drawNext(H.host?(review?'Next →':'Reveal →'):'Next →',H.pz?H.pr:H.end-Date.now(),1000*(review?REV:H.cfg.qsec),review,H.pz);
 }else if(started&&!H&&soloPhase()){
  const phase=sess.practiceClock,seconds=phase.review?REV:sess.qsec;
  drawNext(current===order.length-1?'Finish':'Next →',1000*(seconds-elapsed+phase.start),1000*seconds,phase.review,paused);
  $('nextBtn').disabled=paused;
 }else drawNext('Next →',0,0,false,false);
}
function advanceSoloClock(){
 const phase=!LIVE&&soloPhase();
 if(!phase||paused||elapsed-phase.start<(phase.review?REV:sess.qsec))return;
 if(!phase.review){
  FORCE.add(phase.id);
  const answer=stateFor(currentQ());
  if(answer?.grade==='pending')checkMulti();
  phase.review=true;phase.start=elapsed;render();
 }else if(current<order.length-1)go(current+1);
 else autoSubmit();
}
function startClock(){if(timer!==null||submitted)return;if(!sess.id){$('timerBox').classList.add('stopped');return;}$('timerBox').classList.remove('stopped');timer=setInterval(()=>{elapsed++;advanceSoloClock();if(submitted)return;const q=currentQ();if(q&&!revealed(stateFor(q)))spent.set(q.id,(spent.get(q.id)||0)+1);paint();if(sess.lim&&!submitted&&elapsed-(sess.eb||0)>=sess.lim){autoSubmit();return;}if(elapsed%5===0)save();},1000);}
function stopClock(){if(timer!==null){clearInterval(timer);timer=null;}$('timerBox').classList.add('stopped');save();}

/* in-page confirm (browser confirm() is blocked in many viewers) */
function ask(title,msg,ok){return new Promise(res=>{$('cTitle').textContent=title;$('cMsg').textContent=msg;$('cOk').textContent=ok;const b=$('confirmBackdrop');b.hidden=false;$('cOk').focus();
 const done=v=>{b.hidden=true;$('cOk').onclick=$('cNo').onclick=null;res(v)};$('cOk').onclick=()=>done(true);$('cNo').onclick=()=>done(false);});}

/* summary */
/* summary: see paintSummary below */

/* actions */
$('backChapters').onclick=e=>{
 if(!submitted||e.ctrlKey||e.metaKey||e.shiftKey)return;
 e.preventDefault();flushPersist();resetAll();FORCE.clear();saveNow();window.scrollTo(0,0);
};
function resetAll(){if(LIVE)liveLeave();logSession(submitted?'submitted':'ended');stopClock();sess={};answers.clear();spent.clear();submitted=false;paused=false;document.body.classList.remove('paused');elapsed=0;paint();retryIds=null;$('testSubmit').textContent='Submit';$('summaryBackdrop').hidden=true;applyFilters();setPaused(false);startClock();}
async function setMode(m){if(m===mode)return;if(answers.size&&!await ask('Switch to '+(m==='exam'?'exam':'practice')+' mode?','Your current answers, flags and timer will be cleared so the new mode starts clean.','Switch and reset'))return;logSession(submitted?'submitted':'ended');sess={};mode=m;resetAll();toast(m==='exam'?'Exam mode: results appear after you submit.':'Practice mode: check each answer as you go.');}
$('modeSeg').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(b)setMode(b.dataset.mode);});
$('testSubmit').addEventListener('click',async()=>{
 if(submitted){showSummary();return;}
 const room=L();
 if(room){
  const host=room.host;
  if(!await ask(host?'End this test for everyone?':'Exit this test?',host?'Everyone will see the results with the answers received so far.':'Your attempt will be saved. The other members can continue.',host?'End test':'Exit test')||L()!==room)return;
  if(host)finish();else{gradePending();liveLeave();}
  return;
 }
 const left=order.filter(q=>!answers.has(q.id)).length;
 if(!await ask('End this test?',`${left} of ${order.length} questions are unanswered. The stopwatch will stop and your answers will be saved for review.`,'End test'))return;
 gradePending();
 submitted=true;setPaused(false);stopClock();logSession('submitted');$('testSubmit').textContent='Summary';render();showSummary();
});
$('resetTest').addEventListener('click',async()=>{if(await ask('Reset the test?','All answers, flags and the stopwatch will be cleared.','Reset'))resetAll();});
$('retryBtn').addEventListener('click',()=>{
 if(!signedIn())return;
 if(summaryCtx.rec){retryFromRec(summaryCtx.rec);return;}
 const ids=new Set(order.filter(q=>answers.get(q.id)?.grade==='wrong').map(q=>q.id));if(!ids.size)return;
 ids.forEach(id=>answers.delete(id));sess={eb:elapsed};retryIds=ids;submitted=false;$('testSubmit').textContent='Submit';$('summaryBackdrop').hidden=true;applyFilters();setPaused(false);startClock();
 toast(`Retrying ${ids.size} missed questions. Change any filter to leave this set.`);
});
$('prevBtn').addEventListener('click',()=>go(current-1));$('nextBtn').addEventListener('click',()=>{if(!LIVE&&soloPhase()&&current===order.length-1)$('testSubmit').click();else go(current+1);});
$('clearBtn').addEventListener('click',()=>{const q=currentQ();if(q&&!submitted&&!paused){answers.delete(q.id);render();}});
$('pauseBtn').addEventListener('click',()=>setPaused(!paused));$('resumeBtn').addEventListener('click',()=>setPaused(false));
$('closeSummary').addEventListener('click',()=>$('summaryBackdrop').hidden=true);
$('summaryBackdrop').addEventListener('click',e=>{if(e.target===$('summaryBackdrop'))$('summaryBackdrop').hidden=true;});
examFilter.addEventListener('change',userFilter);viewFilter.addEventListener('change',userFilter);
let sh;$('searchBox').addEventListener('input',e=>{clearTimeout(sh);sh=setTimeout(()=>{search=e.target.value.trim().toLowerCase();userFilter();},220);});
$('shuffleBtn').addEventListener('click',()=>{order=[...filtered];for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}shuffled=true;current=0;selected=null;render();});
function setNavC(c){$('shell').classList.toggle('navc',c);const b=$('navCollapse');b.textContent=c?'‹':'›';b.setAttribute('aria-expanded',String(!c));b.setAttribute('aria-label',c?'Expand navigator':'Collapse navigator');b.title=(c?'Expand':'Collapse')+' (N)';store.set('pq-navc',c?'1':'0');}
$('navCollapse').addEventListener('click',()=>setNavC(!$('shell').classList.contains('navc')));
$('navToggle').addEventListener('click',()=>$('navigator').classList.toggle('open'));
function applyFont(){document.documentElement.style.setProperty('--scale',fontScale.toFixed(2));store.set('pq-font',fontScale);}
function setTheme(d){document.body.classList.toggle('dark',d);$('themeBtn').textContent=d?'☀':'☾';store.set('pq-theme',d?'dark':'light');}
$('fontDown').addEventListener('click',()=>{fontScale=Math.max(.8,+(fontScale-.1).toFixed(2));applyFont();});
$('fontUp').addEventListener('click',()=>{fontScale=Math.min(1.6,+(fontScale+.1).toFixed(2));applyFont();});
$('themeBtn').addEventListener('click',()=>setTheme(!document.body.classList.contains('dark')));
document.addEventListener('keydown',e=>{
 if(!$('confirmBackdrop').hidden){if(e.key==='Escape')$('cNo').click();return;}
 if(e.key==='Escape'){$('summaryBackdrop').hidden=true;$('subjBackdrop').hidden=true;$('mockBackdrop').hidden=true;$('navigator').classList.remove('open');return;}
 if(document.body.dataset.stage==='setup'||$('routeDialog').open)return;
 if(e.ctrlKey||e.metaKey||e.altKey||!$('summaryBackdrop').hidden||!$('subjBackdrop').hidden||tab!=='quiz'||!$('mockBackdrop').hidden||/SELECT|INPUT|TEXTAREA/.test(document.activeElement.tagName))return;
 const q=currentQ();if(!q)return;const k=e.key.toLowerCase();
 if(k==='p'){setPaused(!paused);return;}if(paused)return;
 if(k==='arrowright')go(current+1);else if(k==='arrowleft')go(current-1);else if(k==='f')toggleFlag(q);else if(k==='n')setNavC(!$('shell').classList.contains('navc'));
 else if(k==='enter'){if(document.activeElement.tagName==='BUTTON')return;if(mode==='practice'&&!stateFor(q))return;go(current+1);}
 else if(k.length===1){const i='1234'.includes(k)?+k-1:'abcd'.indexOf(k);if(i>=0&&i<q.options.length)pick(q.options[i].key);}
});

/* ===== My PYQ Online additions: subjects · local storage · sessions · performance · import ===== */
const LS_LAST='qm-last',SUBJECTS=[];
let SESS=[],sess={},tab='quiz',pendingSubj=null;
const POLITY_SRC=$('sourceNote').innerHTML;
const fmtDate=t=>new Date(t).toLocaleString([],{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const fixLig=t=>String(t||'').replace(/\b(fi|fl) (?=[a-z]{2})/g,'$1');
const rfs=(s,t)=>QM.readingText(s?.reflow?fixLig(reflow(t||'')):t);
const rf=t=>rfs(SUBJ,t);
const yrsOf=t=>t.years||(t.year?[t.year]:[]);
const fillSel=(sel,all,opts)=>{sel.innerHTML='';sel.append(new Option(all,'all'));opts.forEach(([v,t])=>sel.append(new Option(t,v)));};
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'subject';
function dl(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},800);}

/* durable storage: IndexedDB (large data) with localStorage fallback */
const kv={db:null,
 open(){return this.db?Promise.resolve(this.db):new Promise(r=>{try{const q=indexedDB.open('quizmaster',1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>{const d=this.db=q.result;d.onclose=d.onversionchange=()=>{try{d.close()}catch(e){}this.db=null};r(d)};q.onerror=()=>r(null);}catch(e){r(null)}})},
 async run(m,fn,again){const d=await this.open();if(!d)return{ok:false};return new Promise(r=>{try{const t=d.transaction('kv',m),q=fn(t.objectStore('kv'));t.oncomplete=()=>r({ok:true,v:q&&q.result});t.onerror=t.onabort=()=>r({ok:false});}catch(e){this.db=null;r(again?{ok:false}:this.run(m,fn,1))}})},
 async get(k){const v=await QM.readStore(s=>s.get(k));if(v!==undefined)return v;try{return JSON.parse(localStorage.getItem('qmkv:'+k)||'null')}catch{return null}},
 async set(k,v){const r=await this.run('readwrite',s=>s.put(v,k));if(!r.ok)store.set('qmkv:'+k,JSON.stringify(v));return r.ok},
 async del(k){const r=await this.run('readwrite',s=>s.delete(k));if(!r.ok)try{localStorage.removeItem('qmkv:'+k)}catch(e){}},
 async keys(p){const keys=await QM.readStore(s=>s.getAllKeys());if(keys)return keys.filter(k=>k.startsWith(p));try{return Object.keys(localStorage).filter(k=>k.startsWith('qmkv:'+p)).map(k=>k.slice(5))}catch(e){return[]}}};

/* filters */
const chosenChapters=new Set();
let shelfSection=null;
$('sectionRail').onclick=e=>{
 const button=e.target.closest('button');if(!button)return;
 shelfSection=button.hasAttribute('data-all')?null:button.dataset.group;
 drawChapterShelf();
};
function fillChapters(){
 const visible=DATA.chapters.filter(c=>groupFilter.value==='all'||c.group===groupFilter.value);
 const allowed=new Set(visible.map(c=>c.no));
 for(const n of chosenChapters)if(!allowed.has(n))chosenChapters.delete(n);
 $('mkChs').innerHTML=visible.map(c=>`<label class="chk"><input type="checkbox" value="${c.no}" ${chosenChapters.has(c.no)?'checked':''}><span>${esc(c.title)}</span></label>`).join('');
}
$('chapterQuery').oninput=$('chapterStatus').onchange=drawChapterShelf;
function drawChapterShelf(){
 if(!DATA)return;
 const query=$('chapterQuery').value.trim().toLowerCase(),filter=$('chapterStatus').value;
 const groups=[...new Set(DATA.chapters.map(c=>c.group||''))];
 const rail=$('sectionRail');
 if(rail.dataset.subject!==SUBJ.id){
  rail.dataset.subject=SUBJ.id;shelfSection=null;rail.scrollLeft=0;
  rail.innerHTML='<button type="button" data-all>All sections</button>'+groups.map(g=>`<button type="button" data-group="${esc(g)}">${esc(g||'Unsectioned')}</button>`).join('');
 }
 for(const b of rail.children)b.setAttribute('aria-pressed',String(b.hasAttribute('data-all')?shelfSection===null:b.dataset.group===shelfSection));
 const counts=new Map(),latest=new Map();
 for(const q of DATA.questions){
  const c=counts.get(q.chapterNo)||{total:0,eligible:0,done:0};
  c.total++;if(q.gradeable&&q.attemptable&&q.options.length)c.eligible++;if(QS[q.id]?.a)c.done++;counts.set(q.chapterNo,c);
 }
 for(const record of SESS){
  if(record.subj!==SUBJ.id)continue;
  for(const row of record.rows||[]){
   if(row.c+row.w===0)continue;
   if(!latest.has(row.no)||latest.get(row.no).end<record.en)latest.set(row.no,{end:record.en,row,marks:record.marks||1,neg:record.neg||0});
  }
 }
 $('chapterList').innerHTML=DATA.chapters.map(ch=>{
  const {total,done,eligible}=counts.get(ch.no)||{total:0,done:0,eligible:0},last=latest.get(ch.no);
  if(shelfSection!==null&&(ch.group||'')!==shelfSection)return '';
  const status=eligible&&done>=eligible?'Complete':done?'In progress':'Remaining';
  const result=last?Number((last.row.c*last.marks-last.row.w*last.neg).toFixed(2))+' / '+Number((last.row.n*last.marks).toFixed(2)):'—';
  if(filter!=='all'&&filter!==status||query&&!(ch.title+' '+(ch.group||'')).toLowerCase().includes(query))return '';
  return `<div class="chapterRow"><div class="chapterInfo"><small>${esc(ch.group||'')} · Chapter ${esc(ch.no)}</small><strong>${esc(ch.title)}</strong><small><span class="stateChip">${status}</span> </small><div class="chapterStats"><span>Questions<b>${total}</b></span><span>Attempted<b>${done}</b></span><span>Last score<b>${result}</b></span></div><progress max="${eligible||1}" value="${done}" aria-label="Questions practised"></progress></div><button type="button" class="btn" data-chapter="${ch.no}" ${eligible?'':'disabled'} aria-label="Start ${esc(ch.title)}">Start →</button></div>`;
 }).join('')||'<p>No chapters match these filters.</p>';
}
$('chapterList').onclick=e=>{
 const b=e.target.closest('[data-chapter]');if(!b||!signedIn())return;
 $('fClear').click();$('mkSrc').value='all';chosenChapters.add(+b.dataset.chapter);
 fillChapters();userFilter();chooseRoute();
};
function populateFilters(){
 fillSel(examFilter,'All exams',[...new Set(DATA.questions.flatMap(q=>q.examTags.map(t=>t.family||t.label)).filter(Boolean))].sort((a,b)=>a.localeCompare(b)).map(x=>[x,x]));
 const ys=[...new Set(DATA.questions.flatMap(q=>q.examTags.flatMap(yrsOf)))].sort((a,b)=>a-b);
 fillSel(yearFilter,'All years',ys.map(y=>[String(y),String(y)]));yearFilter.disabled=!ys.length;
 const gs=DATA.groups||[];groupFilter.disabled=!gs.length;$('groupLbl').textContent='Section';
 fillSel(groupFilter,'All sections',gs.map(g=>[g,g]));fillChapters();
}
groupFilter.addEventListener('change',()=>{fillChapters();userFilter();});yearFilter.addEventListener('change',userFilter);

/* subjects */
async function ensureData(s){
 if(!s.data)s.data=s.builtin?await QM.deadline((window.__pre&&window.__pre.id===s.id?window.__pre.p:fetch('data/'+s.id+'.json').then(r=>r.json())),30000):s.cloud?await QM.deadline(QM.bank(s.cloud,()=>toast('Showing the saved version. Reopen this subject when the latest download is available.')),30000):await kv.get('subj:'+s.id);
 if(!s.prep){const g=new Map(s.data.chapters.map(c=>[c.no,c.group||'']));s.data.questions.forEach(q=>q.group=g.get(q.chapterNo)||'');s.data.groups=[...new Set(s.data.chapters.map(c=>c.group).filter(Boolean))];s.prep=1;}
 return s.data;}
function buildSubjectSelect(){const el=$('subjectSel');el.innerHTML='';SUBJECTS.forEach(s=>el.append(new Option(s.name,s.id)));el.append(new Option('＋ Add subject…','__add'));if(SUBJ)el.value=SUBJ.id;}
async function openSubject(id,first){
 const s=SUBJECTS.find(x=>x.id===id)||SUBJECTS[0];
 if(!first){logSession(submitted?'submitted':'in-progress');saveNow();flushPersist();stopClock();}
 if(SUBJ?.id!==s.id)chosenChapters.clear();await ensureData(s);await loadSubjData(s);SUBJ=s;DATA=s.data;KEY=s.id==='polity'?'pq-state-v2':'qm-state:'+s.id;
 byId=new Map(DATA.questions.map(q=>[q.id,q]));buildWords();
 answers.clear();spent.clear();elapsed=0;submitted=false;mode='practice';sess={};retryIds=null;search='';$('searchBox').value='';viewFilter.value='all';
 paused=false;document.body.classList.remove('paused');$('summaryBackdrop').hidden=true;
 populateFilters();store.set(LS_LAST,s.id);$('subjectSel').value=s.id;
 $('brandTitle').textContent=s.name;$('brandSub').textContent=`Master test · ${DATA.chapters.length} chapters`;document.title=s.name+' · My PYQ Online';$('sourceNote').innerHTML=s.sourceHtml||'';
 const legacy=QM.legacyFlags(s.id);
 if(legacy.length)await QM.importFlags(s,DATA.questions,legacy);
 const prefix=QM.bookmarkPrefix(s.id),keys=await QM.kvKeys(prefix);
 const savedBookmarks=await Promise.all(keys.map(key=>QM.kvGet(key)));
 flags.clear();for(const b of savedBookmarks)if(b&&!b.deleted)flags.add(b.id);
 const prior=restore();
 if(prior?.s&&location.pathname.endsWith('/builder.html')){answers.clear();spent.clear();submitted=false;sess={};elapsed=0;}
if(sess.ids)retryIds=new Set(sess.ids);const clock=prior&&sess.practiceClock;applyFilters();if(prior&&sess.ids)setOrder(sess.ids.filter(id=>byId.has(id)));if(clock){sess.practiceClock=clock;if(clock.review&&!answers.has(clock.id))FORCE.add(clock.id);}
 if(prior&&(submitted||sess.id)){const i=order.findIndex(q=>q.id===prior.c);if(i>0){current=i;render();}toast(submitted?'Restored your submitted test.':`Welcome back — restored ${answers.size} answers.`);}
 paint();$('pauseBtn').disabled=submitted;$('testSubmit').textContent=submitted?'Summary':L()&&!L().host?'Exit test':'End test';
 (submitted||tab!=='quiz')?stopClock():startClock();
}
$('subjectSel').addEventListener('change',e=>{const v=e.target.value;if(v==='__add'){e.target.value=SUBJ.id;openAdd();}else if(v!==SUBJ.id)openSubject(v);});

/* sessions (practice + tests) */
function ensureSess(){if(!sess.id){sess.id=uid();sess.st=Date.now()-(elapsed-(sess.eb||0))*1000;}}
function tally(){
 let c=0,w=0,u=0,att=0,tt=0,slow=null;const wrong=[],byCh=new Map(),items=[];
 order.forEach((q,i)=>{const a=answers.get(q.id),r=byCh.get(q.chapterNo)||{no:q.chapterNo,t:q.chapter,n:0,c:0,w:0};r.n++;byCh.set(q.chapterNo,r);if(!a)return;att++;
  const s=spent.get(q.id)||0;tt+=s;if(!slow||s>slow.s)slow={s,label:`${q.chapterNo}·${q.number}`};
  if(a.grade==='correct'){c++;r.c++}else if(a.grade==='wrong'){w++;r.w++;wrong.push({id:q.id,i,label:`${q.chapterNo}·${q.number}`,ch:q.chapter})}else if(a.grade==='ungraded')u++;
  items.push([q.id,selKeys(a).join(','),a.grade,s]);});
 return{c,w,u,att,tt,slow,wrong,total:order.length,rows:[...byCh.values()],items,marks:sess.marks||1,neg:sess.neg||0,mock:!!sess.mock,lim:sess.lim||0};}
function filterDesc(){const f=[],sel=x=>x.value!=='all';if(retryIds)f.push(sess.live?'Live room':sess.mock?'Custom session':'Retry missed');if(sel(groupFilter))f.push(groupFilter.value);if(sel(examFilter))f.push(examFilter.value);if(sel(yearFilter))f.push(yearFilter.value);if(chosenChapters.size)f.push('Chapters '+[...chosenChapters].join(', '));if(sel(viewFilter))f.push(viewFilter.options[viewFilter.selectedIndex].text);if(search)f.push('“'+search+'”');return f.join(' · ')||'All questions';}
function logSession(status){
 if(!SUBJ||!sess.id||!order.length)return;const d=tally();if(!d.att&&status!=='submitted')return;
 const rec={id:sess.id,subj:SUBJ.id,subjName:SUBJ.name,mode,status,st:sess.st,en:Date.now(),dur:Math.max(0,elapsed-(sess.eb||0)),filt:filterDesc(),questionIds:order.map(q=>q.id),...d};
 const i=SESS.findIndex(r=>r.id===rec.id);if(i>=0)SESS[i]=rec;else SESS.push(rec);kv.set('sessions',SESS);}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&SUBJ){logSession(submitted?'submitted':'in-progress');saveNow();flushPersist();}});
addEventListener('pagehide',()=>{if(SUBJ){logSession(submitted?'submitted':'in-progress');saveNow();flushPersist();}});

/* summary (live + saved sessions) */
let summaryCtx={rec:null};
function paintSummary(d,rec){
 summaryCtx={rec};const ex=d.mode==='exam';
 $('summaryTitle').textContent=rec?`${d.subjName} · ${d.mock?'Mock test':ex?'Test':'Practice'} session`:'Test summary';
 $('summaryTime').textContent=rec?`${fmtDate(d.st)} · ${fmt(d.dur)} · ${d.total} questions${d.status==='in-progress'?' · in progress':''}`:`Completed in ${fmt(elapsed)} · ${d.total} questions in this test`;
 if(d.mock||d.neg){const sc=Math.round((d.c*(d.marks||1)-d.w*d.neg)*100)/100;$('summaryTime').textContent+=` · Score ${sc} / ${d.total*(d.marks||1)}`;}$('summaryCorrect').textContent=d.c;$('summaryIncorrect').textContent=d.w;$('summaryUnattempted').textContent=d.total-d.att;$('summaryUngraded').textContent=d.u;
 $('summaryAvg').textContent=d.att?mmss(Math.round(d.tt/d.att)):'–';$('summarySlow').textContent=d.slow&&d.slow.s?mmss(d.slow.s):'–';$('summarySlowQ').textContent=d.slow&&d.slow.s?`Slowest · ${d.slow.label}`:'Slowest question';
 const pct=d.c+d.w?Math.round(d.c/(d.c+d.w)*100):0;$('ringPct').textContent=pct+'%';$('ringFg').style.strokeDashoffset=402.1;
 requestAnimationFrame(()=>requestAnimationFrame(()=>$('ringFg').style.strokeDashoffset=402.1*(1-pct/100)));
 const rows=d.rows.filter(r=>r.c+r.w>0).sort((a,b)=>a.c/(a.c+a.w)-b.c/(b.c+b.w));
 $('chapterRows').innerHTML=rows.map(r=>`<div class="chrow"><span title="${esc(r.t)}">${r.no} · ${esc(r.t)}</span><div class="track"><i style="width:${r.c/r.n*100}%;background:var(--ok)"></i><i style="width:${r.w/r.n*100}%;background:var(--bad)"></i></div><em>${r.c}/${r.n}</em></div>`).join('')||'<p class="dnote">No attempts to break down.</p>';
 $('weakNote').hidden=rows.length<2;if(rows.length>=2)$('weakNote').textContent=`Focus first on: ${rows.slice(0,3).map(r=>`${r.no} · ${r.t}`).join(', ')}`;
 $('incorrectCountSummary').textContent=`(${d.wrong.length})`;$('retryBtn').disabled=!d.wrong.length;$('reviewBox').innerHTML='';
 $('incorrectList').innerHTML=d.wrong.length?d.wrong.map((x,k)=>`<button type="button" data-k="${k}"><b>${x.label}</b><span>${esc(x.ch)}</span></button>`).join(''):'<p class="dnote">No incorrect answers. Nicely done.</p>';
 $('incorrectList').querySelectorAll('[data-k]').forEach(b=>b.addEventListener('click',()=>{const x=d.wrong[+b.dataset.k];if(rec)showReview(rec,x.id);else{$('summaryBackdrop').hidden=true;go(x.i);}}));
 $('summaryBackdrop').hidden=false;$('closeSummary').focus();}
function showSummary(){paintSummary({...tally(),mode},null);}
async function showReview(rec,qid){
 const s=SUBJECTS.find(x=>x.id===rec.subj),box=$('reviewBox');
 if(!s){box.innerHTML='<p class="dnote">This subject was removed, so the question can no longer be shown.</p>';return;}
 await ensureData(s);if(!s.map)s.map=new Map(s.data.questions.map(q=>[q.id,q]));
 const q=s.map.get(qid);if(!q){box.innerHTML='<p class="dnote">This question is no longer in the subject.</p>';return;}
 const it=rec.items.find(x=>x[0]===qid),sel=it&&it[1]?it[1].split(','):[];
 box.innerHTML=`<div class="review"><b>${q.chapterNo}·${q.number} · ${esc(q.chapter)}</b><p class="prompt" style="font-size:16px;margin:8px 0">${esc(rfs(s,q.prompt))}</p>`+q.options.map(o=>{const ok=q.correct.includes(o.sourceLabel),pk=sel.includes(o.key);return`<div class="opt ${ok?'correct':pk?'wrong':''}"><span class="letter">${esc(o.sourceLabel.toUpperCase())}</span><span>${esc(rfs(s,o.text))}</span><span class="mark">${ok?'✓':pk?'✗':''}</span></div>`}).join('')+(q.explanation?`<details open style="margin-top:10px"><summary><b>Explanation</b></summary><div style="font-family:var(--read);font-size:15px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere">${QM.studyHTML(rfs(s,q.explanation),esc)}</div></details>`:'')+'</div>';
 box.scrollIntoView({behavior:'smooth',block:'nearest'});}
async function retryFromRec(rec){
 if(!signedIn())return;
 const ids=new Set(rec.wrong.map(x=>x.id));if(!ids.size)return;
 if(SUBJ.id!==rec.subj){await openSubject(rec.subj);}
 else if(answers.size&&!await ask('Start a retry session?','Your current attempt in this subject will be ended (it stays in Performance).','Start retry'))return;
 for(const id of ids)if(!byId.has(id))ids.delete(id);
 if(!ids.size){toast('These questions are no longer in the subject.');return;}
 logSession(submitted?'submitted':'ended');sess={id:uid(),st:Date.now(),account:QM.user.id,ids:[...ids]};answers.clear();spent.clear();submitted=false;elapsed=0;mode='practice';
 $('summaryBackdrop').hidden=true;$('testSubmit').textContent='Submit';retryIds=ids;setTab('quiz');applyFilters();setPaused(false);startClock();toast(`Retrying ${ids.size} missed questions.`);}

/* performance tab */
function setTab(t){
 tab=t;document.body.classList.toggle('perfmode',t==='perf');document.querySelectorAll('#tabSeg button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
 if(t==='perf'){logSession(submitted?'submitted':'in-progress');saveNow();flushPersist();stopClock();renderPerf();scrollTo({top:0});}
 else if(!submitted&&!paused)startClock();}
$('tabSeg').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)setTab(b.dataset.tab);});
const accOf=r=>r.c+r.w?Math.round(r.c/(r.c+r.w)*100):null;
function renderPerf(){
 const sf0=$('pfSubj').value||'all',names=new Map(SESS.map(r=>[r.subj,r.subjName]));SUBJECTS.forEach(s=>names.set(s.id,s.name));
 fillSel($('pfSubj'),'All subjects',[...names]);$('pfSubj').value=names.has(sf0)?sf0:'all';
 const sf=$('pfSubj').value,mf=$('pfMode').value;
 const rows=SESS.filter(r=>(sf==='all'||r.subj===sf)&&(mf==='all'||r.mode===mf)).sort((a,b)=>b.en-a.en);
 const att=rows.reduce((n,r)=>n+r.att,0),g=rows.reduce((n,r)=>n+r.c+r.w,0),c=rows.reduce((n,r)=>n+r.c,0),t=rows.reduce((n,r)=>n+r.dur,0);
 $('pStats').innerHTML=[['Sessions',rows.length],['Questions answered',att],['Overall accuracy',g?Math.round(c/g*100)+'%':'–'],['Time practised',fmt(t)]].map(([k,v])=>`<div class="sstat"><span>${k}</span><b>${v}</b></div>`).join('');
 $('pList').innerHTML=rows.length?`<div class="prow h"><span>Date</span><span>Subject</span><span>Type</span><span>Answered</span><span>Score</span><span>Accuracy</span><span>Time</span></div>`+rows.map(r=>{const a=accOf(r);return`<button class="prow" type="button" data-id="${r.id}"><span>${fmtDate(r.st)}</span><span><b>${esc(r.subjName)}</b><br><small style="color:var(--muted)">${esc(r.filt||'')}</small></span><span><span class="chip ${r.mode==='exam'?'exam':''}">${r.mock?'Mock test':r.mode==='exam'?'Test':'Practice'}</span>${r.status==='in-progress'?' <span class="chip live">In progress</span>':''}</span><span>${r.att}/${r.total}</span><span><b style="color:var(--ok)">${r.c}✓</b> <b style="color:var(--bad)">${r.w}✗</b></span><span class="pacc"><div class="track"><span style="width:${a||0}%"></span></div><b>${a==null?'–':a+'%'}</b></span><span>${fmt(r.dur)}</span></button>`}).join('')
  :'<div class="empty"><h3>No sessions yet</h3><p>Answer a few questions in Practice or Exam mode — each attempt is saved here automatically.</p></div>';
 $('pList').querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>{const r=SESS.find(x=>x.id===b.dataset.id);if(r)paintSummary(r,r);}));renderExtra(rows);}
$('pfSubj').addEventListener('change',renderPerf);$('pfMode').addEventListener('change',renderPerf);
$('resetAcct').addEventListener('click',async()=>{
 if(!await ask('Reset your account?','This permanently deletes all saved progress and every practice/test session for all subjects on this device. Imported subjects are kept (remove them from “Add subject”).','Reset everything'))return;
 sess={};try{Object.keys(localStorage).filter(k=>/^(pq-state|qm-state)/.test(k)).forEach(k=>localStorage.removeItem(k));}catch(e){}
 SESS=[];await kv.set('sessions',SESS);resetAll();renderPerf();toast('Account reset. All progress and sessions were cleared.');});
function stateKeys(){try{return Object.keys(localStorage).filter(k=>/^(pq-|qm-)/.test(k))}catch(e){return[]}}
$('bkExport').addEventListener('click',()=>{logSession(submitted?'submitted':'in-progress');saveNow();flushPersist();const st={};stateKeys().forEach(k=>st[k]=localStorage.getItem(k));const subs={};SUBJECTS.filter(s=>!s.builtin&&s.data).forEach(s=>subs[s.id]=s.data);
 dl(`quizmaster-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({qmBackup:1,state:st,sessions:SESS,subjects:subs}));toast('Backup file created.');});
$('bkImport').addEventListener('click',()=>$('bkFile').click());
$('bkFile').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
 try{const b=JSON.parse(await f.text());if(!b.qmBackup)throw 0;
  if(!await ask('Restore this backup?','Saved progress in the backup replaces matching progress on this device; sessions are merged.','Restore'))return;
  Object.entries(b.state||{}).forEach(([k,v])=>store.set(k,v));
  const m=new Map(SESS.map(r=>[r.id,r]));(b.sessions||[]).forEach(r=>m.set(r.id,r));await kv.set('sessions',[...m.values()]);
  for(const [id,d] of Object.entries(b.subjects||{}))await kv.set('subj:'+id,d);for(const [k,v] of Object.entries(b.kvs||{}))await kv.set(k,v);
  toast('Backup restored — reloading…');setTimeout(()=>location.reload(),700);
 }catch(x){toast('That file is not a valid My PYQ Online backup.');}});

/* add / import subject */
const TEMPLATE={_readme:['Replace the sample content with your own and keep this structure. Save as .json and import it from Subject → Add subject.','subject (required): name shown in the subject list. subtitle, source and groupLabel are optional.','chapters (optional): [{ "no": 1, "title": "…", "group": "…" }]. "group" powers an extra filter (e.g. Physics / Chemistry / Biology, or Ancient / Medieval / Modern).','questions (required): chapter = chapter number (or chapter title); options = 2 to 6 choices (letters a–f are assigned in order); answer = a letter such as "b", or ["a","c"] when several options are correct. Leave answer out for an unscored question.','explanation and exams (for example "UPSC CSE (Pre) 2019") are optional; exam labels with a year feed the Exam and Year filters. This _readme key is ignored.'],format:'quizmaster-subject-v1',subject:'General Science',subtitle:'NCERT based · Class 6–10',groupLabel:'Branch',chapters:[{no:1,title:'Motion and Force',group:'Physics'},{no:2,title:'Acids, Bases and Salts',group:'Chemistry'}],questions:[{chapter:1,question:'The SI unit of force is –',options:['Joule','Newton','Watt','Pascal'],answer:'b',explanation:'Force is measured in newton (N).',exams:['UPSC CSE (Pre) 2019']},{chapter:2,question:'Which of the following are acids?\n1. HCl\n2. NaOH\n3. H2SO4',options:['1 and 2','2 only','1 and 3','1, 2 and 3'],answer:'c',explanation:'NaOH is a base.',exams:[]},{chapter:1,question:'Select all vector quantities.',options:['Speed','Velocity','Displacement','Mass'],answer:['b','c'],explanation:'Velocity and displacement have direction.'}]};
function examTag(l){const ys=new Set();String(l).replace(/\b((?:19|20)\d{2})\b/g,(_,y)=>ys.add(+y));
 const fam=String(l).replace(/\b(?:19|20)\d{2}\b/g,' ').replace(/\b\d+(?:st|nd|rd|th)\b/gi,' ').replace(/\b(?:Pre|Prelims?|Mains?|Spl|Special|Re-?Exam)\b\.?/gi,' ').replace(/[()\[\],;:-]+/g,' ').replace(/\s+/g,' ').trim();
 return{label:String(l),family:fam||String(l),stage:'',year:ys.size?[...ys][0]:0,years:[...ys]};}
/* ===== v3: Excel import/export · smart revision · notes · mock tests · goals & charts ===== */
const INTERVALS=[0,1,3,7,16,35],dayKey=(t=Date.now())=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
let QS={},NOTES={},NTS={},DAILY={},PREFS={goal:30},_ps=null;
const h32=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(36);};
async function loadSubjData(s){QS=(await kv.get('qs:'+s.id))||{};NOTES=(await kv.get('notes:'+s.id))||{};NTS=(await kv.get('nts:'+s.id))||{};}
function persistSoon(){clearTimeout(_ps);_ps=setTimeout(flushPersist,900);}
function flushPersist(){if(_ps==null)return;clearTimeout(_ps);_ps=null;if(SUBJ){kv.set('qs:'+SUBJ.id,QS);kv.set('notes:'+SUBJ.id,NOTES);kv.set('nts:'+SUBJ.id,NTS);}kv.set('daily',DAILY);kv.set('prefs',PREFS);}
function recordResult(q,g){
 if(!q||(g!=='correct'&&g!=='wrong'))return;
 const s=QS[q.id]||(QS[q.id]={a:0,c:0,w:0,b:0,t:0,d:0});s.a++;if(g==='correct'){s.c++;s.b=Math.min(5,s.b+1);}else{s.w++;s.b=0;}
 s.t=Date.now();s.d=s.t+INTERVALS[s.b]*864e5;const k=dayKey();DAILY[k]=(DAILY[k]||0)+1;persistSoon();}
function gradePending(){for(const [id,a] of answers)if(a.grade==='pending'){a.grade=gradeOf(byId.get(id),a);recordResult(byId.get(id),a.grade);}}
function autoSubmit(){gradePending();submitted=true;setPaused(false);stopClock();logSession('submitted');$('testSubmit').textContent='Summary';render();showSummary();toast('Time is up — your test was submitted.');}

/* notes */
const noteBox=q=>`<details class="mynote" ${NOTES[q.id]?'open':''}><summary>📝 ${NOTES[q.id]?'My note':'Add a note'}</summary><textarea id="noteTa" placeholder="A memory trick, source or doubt to revisit…">${esc(NOTES[q.id]||'')}</textarea></details>`;
const nMeta=id=>{const q=byId.get(id);return{ts:Date.now(),c:q?q.chapterNo:0,ch:q?q.chapter:'',n:q?String(q.number):'',p:q?String(q.prompt||'').slice(0,160):''}};
function setNote(id,t){if(t.trim()){NOTES[id]=t;NTS[id]=nMeta(id);}else{delete NOTES[id];delete NTS[id];}persistSoon();}

/* "Show" filter counts */
const VIEW_BASE={due:'Due for revision',everwrong:'Missed before',weak:'Weak: under 60%',new:'Never attempted',noted:'With my notes'};
function refreshViewCounts(){
 if(!DATA)return;const now=Date.now(),c={due:0,everwrong:0,weak:0,new:0,noted:0};
 for(const q of DATA.questions){const s=QS[q.id];if(!s)c.new++;else{if(s.d<=now)c.due++;if(s.w)c.everwrong++;if(s.a&&s.c/s.a<.6)c.weak++;}if(NOTES[q.id])c.noted++;}
 for(const o of viewFilter.options)if(VIEW_BASE[o.value])o.textContent=`${VIEW_BASE[o.value]} (${c[o.value]})`;return c;}
$('reviseBtn').addEventListener('click',()=>{const c=refreshViewCounts();if(!c.due){toast('Nothing is due for revision right now — nice work!');return;}
 chosenChapters.clear();groupFilter.value='all';fillChapters();[examFilter,yearFilter].forEach(s=>s.value='all');viewFilter.value='due';search='';$('searchBox').value='';setTab('quiz');document.body.classList.remove('fopen');userFilter();toast(`${c.due} questions due for revision.`);});

/* ---------- Excel / CSV reading (no external library) ---------- */
async function inflateRaw(u8){const ds=new DecompressionStream('deflate-raw'),w=ds.writable.getWriter();w.write(u8);w.close();return new Uint8Array(await new Response(ds.readable).arrayBuffer());}
function unzip(buf){const u8=new Uint8Array(buf),dv=new DataView(buf);let e=u8.length-22;while(e>=0&&dv.getUint32(e,true)!==0x06054b50)e--;if(e<0)throw new Error('This is not a valid .xlsx file.');
 const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const files={},dec=new TextDecoder();
 for(let i=0;i<n&&dv.getUint32(p,true)===0x02014b50;i++){const meth=dv.getUint16(p+10,true),csz=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),el=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true),name=dec.decode(u8.subarray(p+46,p+46+nl));p+=46+nl+el+cl;
  const st=off+30+dv.getUint16(off+26,true)+dv.getUint16(off+28,true);files[name]={meth,data:u8.subarray(st,st+csz)};}
 return files;}
const fileText=async f=>new TextDecoder().decode(f.meth===0?f.data:await inflateRaw(f.data));
const unent=s=>s.indexOf('&')<0?s:s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(m,e)=>{e=e.toLowerCase();return e==='amp'?'&':e==='lt'?'<':e==='gt'?'>':e==='quot'?'"':e==='apos'?"'":String.fromCodePoint(e[1]==='x'?parseInt(e.slice(2),16):+e.slice(1));});
const tText=x=>{let o='',m;const re=/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;x=x.replace(/<rPh\b[\s\S]*?<\/rPh>/g,'');while((m=re.exec(x)))o+=m[1]||'';return unent(o);};
function parseSheet(x,ss){
 const rows=[],re=/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;let m;
 while((m=re.exec(x))){const at=m[1],r=/\br="([A-Z]+)(\d+)"/.exec(at);if(!r)continue;let ci=0;for(const ch of r[1])ci=ci*26+ch.charCodeAt(0)-64;ci--;
  const ty=(/\bt="(\w+)"/.exec(at)||[])[1],body=m[2]||'';let v='';
  if(ty==='inlineStr')v=tText(body);else{const vm=/<v[^>]*>([\s\S]*?)<\/v>/.exec(body);v=vm?unent(vm[1]):'';if(ty==='s')v=ss[+v]??'';else if(ty==='b')v=v==='1'?'TRUE':'FALSE';}
  (rows[+r[2]-1]||(rows[+r[2]-1]=[]))[ci]=v;}
 return Array.from(rows,r=>r||[]);}
async function parseXlsx(buf){
 const z=unzip(buf),X=n=>z[n]?fileText(z[n]):Promise.resolve(null),dp=new DOMParser(),P=s=>dp.parseFromString(s,'application/xml');
 const wbx=await X('xl/workbook.xml');if(!wbx)throw new Error('This is not a valid Excel workbook.');
 const wb=P(wbx),rels=P(await X('xl/_rels/workbook.xml.rels')),sst=await X('xl/sharedStrings.xml');
 const ss=sst?(sst.match(/<si\b[\s\S]*?<\/si>|<si\s*\/>/g)||[]).map(tText):[];const out=[];
 for(const sh of wb.getElementsByTagName('sheet')){
  const rid=sh.getAttribute('r:id'),rel=[...rels.getElementsByTagName('Relationship')].find(r=>r.getAttribute('Id')===rid);if(!rel)continue;
  let t=rel.getAttribute('Target');t=t.startsWith('/')?t.slice(1):'xl/'+t.replace(/^\.\//,'');if(!z[t])continue;
  out.push({name:sh.getAttribute('name')||'Sheet',rows:parseSheet(await X(t),ss)});}
 if(!out.length)throw new Error('No sheets were found in this workbook.');return out;}
function parseCsv(t){
 t=t.replace(/^\uFEFF/,'');const first=t.split('\n',1)[0],d=[',',';','\t'].map(x=>[x,first.split(x).length]).sort((a,b)=>b[1]-a[1])[0][0],rows=[];let r=[],f='',q=false;
 for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
  else if(c==='"')q=true;else if(c===d){r.push(f);f='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;r.push(f);f='';rows.push(r);r=[];}else f+=c;}
 if(f!==''||r.length){r.push(f);rows.push(r);}return rows;}

/* ---------- sheet rows → subject ---------- */
function rowsToRaw(rows,info){
 const h=rows.findIndex(r=>r&&r.some(c=>String(c??'').trim()));if(h<0)return{err:['The sheet is empty.']};
 const head=rows[h].map(c=>String(c??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()),find=(...k)=>head.findIndex(x=>k.includes(x));
 const col={qid:find('question id'),ch:find('chapter','chapter name','topic','unit'),gr:find('group','era','category','branch','section'),q:find('question','questions','q','prompt'),an:find('answer','correct answer','correct','ans','key','correct option'),ex:find('explanation','solution','rationale','explain'),exam:find('exam','exams','exam tag','source','previous year','pyq'),yr:find('year')};
 const oi='abcdef'.split('').map(L=>find(L,'option '+L,'opt '+L,'options '+L,'choice '+L));
 const pictureColumns=head.map((name,i)=>/^(?:image|images|picture|figure|diagram|question image|(?:img|image|picture) [a-f]|(?:opt|option) [a-f] image)$/.test(name)?i:-1).filter(i=>i>=0);
 if(rows.slice(h+1).some(row=>pictureColumns.some(i=>String(row?.[i]??'').trim()))){
  return {err:['This workbook references pictures. Import it on the admin page and select the picture files there.']};
 }
 const err=[];if(col.q<0)err.push('No “Question” column found — the first row must hold the column headings (Chapter, Question, Option A …).');if(oi[0]<0||oi[1]<0)err.push('Columns “Option A” and “Option B” are required.');
 if(err.length)return{err};
 const qs=[];let lastCh='',lastGr='';
 for(let i=h+1;i<rows.length;i++){const r=rows[i]||[];if(!r.some(c=>String(c??'').trim()))continue;const g=k=>k<0?'':String(r[k]??'').trim();
  const ch=g(col.ch)||lastCh,gr=g(col.gr)||(g(col.ch)?'':lastGr);lastCh=ch;lastGr=gr||lastGr;if(g(col.ch)&&!g(col.gr))lastGr='';
  const opts=oi.map(g);let n=opts.length;while(n>0&&!opts[n-1])n--;
  const ans=g(col.an).toLowerCase().replace(/[().]/g,'').split(/[\s,;&\/]+/).filter(x=>x&&x!=='and').map(x=>/^[1-6]$/.test(x)?'abcdef'[+x-1]:x);
  let ex=g(col.exam).split(/[;|\n]+/).map(s=>s.trim()).filter(Boolean);const y=g(col.yr).match(/(?:19|20)\d{2}/);
  if(y)ex=ex.length?ex.map(s=>/(?:19|20)\d{2}/.test(s)?s:s+' '+y[0]):['PYQ '+y[0]];
  qs.push({_row:i+1,questionId:g(col.qid),chapter:ch||undefined,group:gr,question:g(col.q),options:opts.slice(0,n),answer:ans,explanation:g(col.ex),exams:ex});}
 return{raw:{subject:info.subject||'',subtitle:info.subtitle||'',groupLabel:info.groupLabel||'',questions:qs}};}
async function readFileToRaw(f){
 const ext=(f.name.split('.').pop()||'').toLowerCase(),stem=f.name.replace(/\.[^.]+$/,'');
 if(ext==='json')return{raw:JSON.parse(await f.text()),stem};
 let sheets;
 if(['csv','tsv','txt'].includes(ext))sheets=[{name:'Questions',rows:parseCsv(await f.text())}];
 else if(['xlsx','xlsm'].includes(ext)){if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot open .xlsx directly. In Excel use File ▸ Save As ▸ CSV UTF-8 and import that file instead.');sheets=await parseXlsx(await f.arrayBuffer());}
 else throw new Error('Unsupported file type “.'+ext+'”. Please use .xlsx, .csv or .json.');
 const q=sheets.find(s=>/question/i.test(s.name))||sheets[0],info={},is=sheets.find(s=>s!==q&&/^(info|about|subject|settings)/i.test(s.name));
 if(is)for(const r of is.rows){const k=String(r&&r[0]||'').toLowerCase().replace(/[^a-z]/g,''),v=String(r&&r[1]||'').trim();if(['subject','subjectname','name'].includes(k))info.subject=v;else if(k==='subtitle')info.subtitle=v;else if(['grouplabel','filterlabel'].includes(k))info.groupLabel=v;}
 const t=rowsToRaw(q.rows,info);if(t.err)throw new Error(t.err.join(' '));return{raw:t.raw,stem};}

/* ---------- Excel writing ---------- */
const crcT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc32=u=>{let c=-1;for(let i=0;i<u.length;i++)c=crcT[(c^u[i])&255]^(c>>>8);return(~c)>>>0;};
function zipStore(files){
 const enc=new TextEncoder(),parts=[],cd=[];let off=0;
 for(const [name,txt] of files){const nb=enc.encode(name),d=enc.encode(txt),crc=crc32(d);
  const lh=new DataView(new ArrayBuffer(30));lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint32(14,crc,true);lh.setUint32(18,d.length,true);lh.setUint32(22,d.length,true);lh.setUint16(26,nb.length,true);
  parts.push(new Uint8Array(lh.buffer),nb,d);
  const ch=new DataView(new ArrayBuffer(46));ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint32(16,crc,true);ch.setUint32(20,d.length,true);ch.setUint32(24,d.length,true);ch.setUint16(28,nb.length,true);ch.setUint32(42,off,true);
  cd.push(new Uint8Array(ch.buffer),nb);off+=30+nb.length+d.length;}
 const cl=cd.reduce((n,x)=>n+x.length,0),en=new DataView(new ArrayBuffer(22));en.setUint32(0,0x06054b50,true);en.setUint16(8,files.length,true);en.setUint16(10,files.length,true);en.setUint32(12,cl,true);en.setUint32(16,off,true);
 return new Blob([...parts,...cd,new Uint8Array(en.buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}
const xe=s=>String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const colL=i=>{let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;};
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main',XH='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
function sheetXml(sh){
 const rows=sh.rows.map((r,i)=>`<row r="${i+1}">`+r.map((v,j)=>v===''||v==null?'':`<c r="${colL(j)}${i+1}" t="inlineStr" s="${sh.header&&i===0?1:2}"><is><t xml:space="preserve">${xe(v)}</t></is></c>`).join('')+'</row>').join('');
 return`${XH}<worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0">${sh.header?'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>':''}</sheetView></sheetViews>${sh.widths?'<cols>'+sh.widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')+'</cols>':''}<sheetData>${rows}</sheetData></worksheet>`;}
function xlsxBlob(sheets){
 const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',n=sheets.length;
 const styles=`${XH}<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F4FD8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 const files=[['[Content_Types].xml',`${XH}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
  ['_rels/.rels',`${XH}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
  ['xl/workbook.xml',`${XH}<workbook xmlns="${NS}" xmlns:r="${R}"><sheets>${sheets.map((s,i)=>`<sheet name="${xe(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`],
  ['xl/_rels/workbook.xml.rels',`${XH}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="${R}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${n+1}" Type="${R}/styles" Target="styles.xml"/></Relationships>`],
  ['xl/styles.xml',styles],...sheets.map((s,i)=>[`xl/worksheets/sheet${i+1}.xml`,sheetXml(s)])];
 return zipStore(files);}
function dlBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);}
const QHEAD=['Chapter','Group','Question','Option A','Option B','Option C','Option D','Option E','Option F','Answer','Explanation','Exam','Question ID'],QW=[28,14,70,26,26,26,26,22,22,10,60,28,24];
function templateBlob(){
 const info=[['Subject','General Science'],['Subtitle','NCERT based · Class 6–10'],['Group label','Branch'],[''],['HOW TO USE THIS TEMPLATE'],['1. Keep the headings in row 1 of the “Questions” sheet. Add one row per question.'],['2. Chapter: type the chapter name. You may leave it blank on following rows of the same chapter.'],['3. Group (optional): e.g. Physics / Chemistry or Ancient / Medieval / Modern. It becomes an extra filter named “Group label” above.'],['4. Options: fill Option A–F (2 to 6 options). Leave unused option columns empty.'],['5. Answer: the correct letter, e.g. B. For several correct answers write A, C. Leave blank for an unscored question.'],['6. Explanation and Exam (e.g. UPSC CSE 2019) are optional. Separate several exams with ;'],['7. Change the Subject name above, save as .xlsx (or .csv) and import it from Subject ▸ Add subject. Re-importing the same subject name updates it and keeps student progress on unchanged questions.']];
 const q=[QHEAD,['Motion and Force','Physics','The SI unit of force is –','Joule','Newton','Watt','Pascal','','','B','Force is measured in newton (N).','UPSC CSE (Pre) 2019'],['','','Select all vector quantities.','Speed','Velocity','Displacement','Mass','','','B, C','Velocity and displacement have direction.',''],['Acids, Bases and Salts','Chemistry','Which of the following are acids?\n1. HCl\n2. NaOH\n3. H2SO4','1 and 2','2 only','1 and 3','1, 2 and 3','','','C','NaOH is a base.','SSC CGL 2021; UPSC CSE (Pre) 2018']];
 return xlsxBlob([{name:'Questions',rows:q,header:true,widths:QW},{name:'Info',rows:info,widths:[18,90]}]);}
async function exportSubject(s){
 await ensureData(s);const d=s.data,rows=[QHEAD];
 for(const q of d.questions){const o=q.options.map(x=>rfs(s,x.text));while(o.length<6)o.push('');rows.push([q.chapter,q.group||'',rfs(s,q.prompt),...o.slice(0,6),q.correct.map(x=>x.toUpperCase()).join(', '),rfs(s,q.explanation),q.examTags.map(t=>t.label).join(' ; '),q.id]);}
 dlBlob(xlsxBlob([{name:'Questions',rows,header:true,widths:QW},{name:'Info',rows:[['Subject',d.title||s.name],['Subtitle',d.subtitle||''],['Group label',d.groupLabel||'']],widths:[18,60]}]),slug(s.name)+'.xlsx');
 toast(`Exported ${d.questions.length} questions to Excel.`);}

/* ---------- import UI ---------- */
let pend=null;
function normalizeImport(raw){
 const err=[];if(!raw||typeof raw!=='object'||Array.isArray(raw))return{err:['The file must contain a JSON object or an Excel sheet with a heading row.']};
 const name=String(raw.subject||raw.name||'').trim()||'Imported subject';
 if(!Array.isArray(raw.questions)||!raw.questions.length)return{err:['No questions were found in the file.']};
 const chs=[],byNo=new Map(),byTitle=new Map(),explicit=Array.isArray(raw.chapters)&&raw.chapters.length>0;
 const fold=value=>String(value??'').trim().toLowerCase();
 function addCh(no,title,group){
  const c={no,title:String(title).trim(),group:String(group||'').trim()};
  chs.push(c);byNo.set(no,c);
  const key=fold(c.title);
  if(!byTitle.has(key))byTitle.set(key,[]);
  byTitle.get(key).push(c);
  return c;
 }
 (explicit?raw.chapters:[]).forEach((c,i)=>{const o=c&&typeof c==='object'?c:{title:c};addCh(+o.no||i+1,o.title||o.name||'Chapter '+(i+1),String(o.group||o.category||''));});
 const qs=[],cnt=new Map(),seen=new Set();
 const reservedIds=new Set(raw.questions.map(r=>String(r?.questionId||'').trim()).filter(Boolean));
 raw.questions.forEach((r,i)=>{const at=(r&&r._row?'Row '+r._row:'Question #'+(i+1))+': ';if(!r||typeof r!=='object'){err.push(at+'not an object.');return;}
  const text=String(r.question??r.prompt??'').trim();if(!text){err.push(at+'the Question cell is empty.');return;}
  let opts=r.options;if(!Array.isArray(opts)||opts.length<2||opts.length>6){err.push(at+'needs 2 to 6 options (found '+(Array.isArray(opts)?opts.length:0)+').');return;}
  opts=opts.map(o=>String(o&&typeof o==='object'?o.text??'':o??'').trim());if(opts.some(o=>!o)){err.push(at+'an option cell is empty between filled options.');return;}
  const keys='abcdef'.slice(0,opts.length).split('');let a=r.answer??r.correct;a=a==null||a===''?[]:Array.isArray(a)?a:String(a).split(/[\s,;&\/]+/);
  a=[...new Set(a.map(x=>String(x).trim().toLowerCase().replace(/[().]/g,'')).filter(Boolean))];if(a.some(x=>!keys.includes(x))){err.push(at+'Answer “'+(Array.isArray(r.answer)?r.answer.join(','):r.answer)+'” must be one of '+keys.map(k=>k.toUpperCase()).join(', ')+'.');return;}
  const cr=r.chapter,group=String(r.group||r.category||'').trim();
  let ch;
  if(typeof cr==='number'){
   ch=byNo.get(cr);
   if(!ch&&explicit){err.push(at+'chapter '+cr+' is not listed in "chapters".');return;}
   if(!ch)ch=addCh(cr,'Chapter '+cr,group);
  }else{
   const missing=cr==null||String(cr).trim()==='';
   const title=missing?'General':String(cr).trim();
   const candidates=byTitle.get(fold(title))||[];
   if(group){
    ch=candidates.find(c=>fold(c.group)===fold(group));
    if(!ch&&candidates.length===1&&!candidates[0].group)ch=candidates[0];
   }else if(candidates.length>1){
    err.push(at+'chapter "'+title+'" appears in multiple sections. Enter its Group.');return;
   }else ch=candidates[0];
   if(!ch&&!candidates.length)ch=missing?(group?undefined:chs[0]):byNo.get(+cr);
   if(!ch)ch=addCh(chs.reduce((max,c)=>Math.max(max,c.no),0)+1,title,group);
  }
  if(group&&!ch.group)ch.group=group;
  const n=(cnt.get(ch.no)||0)+1;cnt.set(ch.no,n);const given=String(r.questionId||'').trim();
  if(given&&(!/^[A-Za-z0-9_-]{1,120}$/.test(given)||seen.has(given))){err.push(at+'invalid or duplicate Question ID.');return;}
  const base='U'+h32(ch.title+'|'+text);let id=given||base,dd=0;
  if(!given)while(seen.has(id)||reservedIds.has(id))id=base+'_'+(++dd);
  seen.add(id);
  const ex=Array.isArray(r.exams)?r.exams:r.exams?[r.exams]:[];
  qs.push({id,chapterNo:ch.no,chapter:ch.title,number:n,pdfPage:'',bookPage:r.page?String(r.page):'',prompt:text,options:opts.map((t,j)=>({key:keys[j],sourceLabel:keys[j],text:t})),correct:a,answerRaw:a.length?'Ans. ('+a.join(' & ')+')':'',type:a.length>1?'Multiple answer':'Multiple choice',explanation:String(r.explanation||''),examTags:ex.filter(Boolean).map(examTag),attemptable:true,gradeable:a.length>0,reviewFlags:[]});});
 if(!qs.length)return{err:err.length?err:['No valid questions were found.']};
 qs.sort((x,y)=>x.chapterNo-y.chapterNo);const used=new Set(qs.map(q=>q.chapterNo));
 const data={title:name,subtitle:String(raw.subtitle||''),groupLabel:String(raw.groupLabel||'').trim()||'Category',chapters:chs.filter(c=>used.has(c.no)).sort((x,y)=>x.no-y.no),questions:qs,source:String(raw.source||'Imported subject'),stats:{total:qs.length}};
 return{data,skipped:err,ungraded:qs.filter(q=>!q.gradeable).length};}
const showImp=l=>{$('impGo').disabled=true;pend=null;$('impNameWrap').hidden=true;$('impMsg').innerHTML=`<div class="note" style="margin:0"><b>Couldn’t import this file</b><br>${l.slice(0,8).map(esc).join('<br>')}${l.length>8?`<br>…and ${l.length-8} more`:''}</div>`;};
function openAdd(){if(!QM.isAdmin){toast('Only admins can add subjects.');return;}$('impMsg').innerHTML='';$('impGo').disabled=true;$('impNameWrap').hidden=true;pend=null;$('impFile').value='';renderMine();$('subjBackdrop').hidden=false;}
function renderMine(){
 $('mySubj').innerHTML='<h3>Your subjects</h3>'+SUBJECTS.map(s=>`<div class="mine"><span><b>${esc(s.name)}</b>${s.builtin?' <span class="chip">built-in</span>':''}</span><span class="mbtn"><button class="btn" type="button" data-ex="${s.id}">Export Excel</button>${s.builtin?'':`<button class="btn danger" type="button" data-rm="${s.id}">Remove</button>`}</span></div>`).join('');
 $('mySubj').querySelectorAll('[data-ex]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await exportSubject(SUBJECTS.find(x=>x.id===b.dataset.ex));}finally{b.disabled=false;}}));
 $('mySubj').querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click',async()=>{const s=SUBJECTS.find(x=>x.id===b.dataset.rm);if(!s||!await ask('Remove “'+s.name+'”?','The subject, its notes and saved progress are deleted. Past sessions stay in Performance.','Remove'))return;
  await kv.del('subj:'+s.id);await kv.del('qs:'+s.id);await kv.del('notes:'+s.id);await kv.del('nts:'+s.id);try{localStorage.removeItem('qm-state:'+s.id)}catch(e){}const cur=SUBJ.id===s.id;SUBJECTS.splice(SUBJECTS.indexOf(s),1);if(cur){sess={};await openSubject('polity',true);}buildSubjectSelect();renderMine();}));}
$('tplBtn').addEventListener('click',()=>{dlBlob(templateBlob(),'quizmaster-subject-template.xlsx');toast('Template downloaded — open it in Excel, Numbers or Google Sheets.');});
$('impFile').addEventListener('change',async e=>{
 const f=e.target.files[0];if(!f)return;$('impMsg').innerHTML='<div class="note" style="margin:0">Reading file…</div>';
 try{const{raw,stem}=await readFileToRaw(f);raw.subject=String(raw.subject||raw.name||'').trim()||stem.replace(/[_-]+/g,' ');
  const r=normalizeImport(raw);if(r.err){showImp(r.err);return;}pend=r;const d=r.data,gs=new Set(d.chapters.map(c=>c.group).filter(Boolean)).size;
  $('impName').value=raw.subject;$('impNameWrap').hidden=false;
  $('impMsg').innerHTML=`<div class="note" style="margin:0;background:var(--ok-bg);color:var(--ok);border-color:var(--ok-line)"><b>${d.questions.length} questions</b> in ${d.chapters.length} chapters${gs?` · ${gs} groups (“${esc(d.groupLabel)}” filter)`:''}${r.ungraded?` · ${r.ungraded} without an answer (unscored)`:''}. Ready to import.</div>`+(r.skipped.length?`<div class="note" style="margin:8px 0 0"><b>${r.skipped.length} row${r.skipped.length>1?'s':''} will be skipped</b><br>${r.skipped.slice(0,6).map(esc).join('<br>')}${r.skipped.length>6?`<br>…and ${r.skipped.length-6} more`:''}</div>`:'');
  $('impGo').disabled=false;}catch(x){showImp([x.message||String(x)]);}});
$('impGo').addEventListener('click',async()=>{
 if(!pend)return;const d=pend.data;d.title=($('impName').value.trim()||d.title).slice(0,60);let id=slug(d.title);if(['polity','history'].includes(id))id+='-2';
 const old=SUBJECTS.find(s=>s.id===id);if(old&&!await ask('Update “'+old.name+'”?','A subject with this name exists. Its questions are replaced by the new file; student progress and notes are kept for questions whose text is unchanged.','Update'))return;
 await kv.set('subj:'+id,d);const s={id,name:d.title,builtin:false,data:d,sourceHtml:'<b>Source:</b> '+esc(d.source)+'. Imported on this device.'};
 if(old)SUBJECTS[SUBJECTS.indexOf(old)]=s;else SUBJECTS.push(s);
 $('subjBackdrop').hidden=true;buildSubjectSelect();await openSubject(id);toast('“'+d.title+'” saved — '+d.questions.length+' questions.');});
$('closeSubj').addEventListener('click',()=>$('subjBackdrop').hidden=true);
$('subjBackdrop').addEventListener('click',e=>{if(e.target===$('subjBackdrop'))$('subjBackdrop').hidden=true;});

/* ---------- mock tests ---------- */
$('hostBtn').addEventListener('click',()=>{who='host';openCustom();});$('joinBtn').addEventListener('click',()=>{who='join';openCustom();});
$('mkCancel').addEventListener('click',()=>{cancelRoomOpening();$('mockBackdrop').hidden=true;});
/* ---------- performance extras: goal, streak, charts, backup ---------- */
function streak(){let n=0,t=Date.now();if(!DAILY[dayKey(t)])t-=864e5;while(DAILY[dayKey(t)]>0){n++;t-=864e5;}return n;}
function extraHTML(rows){
 const today=DAILY[dayKey()]||0,goal=PREFS.goal||30,p=Math.min(1,today/goal),C=2*Math.PI*26,due=refreshViewCounts().due;
 const goalCard=`<div class="card pgoal"><svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--line)" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="var(--brand)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-p)}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" font-size="14" font-weight="800" fill="var(--ink)">${Math.round(p*100)}%</text></svg>
  <div class="gt"><b>Today: ${today} / ${goal} questions</b><p>${streak()?`🔥 ${streak()}-day streak`:'Answer a question to start a streak'} · ${due} due for revision in ${esc(SUBJ.name)}</p></div>
  <label class="sel" style="flex:0 0 130px"><span>Daily goal</span><select id="goalSel">${[10,20,30,50,75,100,150].map(g=>`<option ${g===goal?'selected':''}>${g}</option>`).join('')}</select></label>
  <button class="btn primary" id="reviseGo" type="button">Revise now</button></div>`;
 const days=[...Array(14)].map((_,i)=>{const t=Date.now()-(13-i)*864e5;return{k:dayKey(t),v:DAILY[dayKey(t)]||0,d:new Date(t).getDate()};}),mx=Math.max(goal,...days.map(d=>d.v),1);
 const bars=days.map((d,i)=>{const h=Math.round(d.v/mx*70);return`<rect x="${i*24+4}" y="${78-h}" width="16" height="${Math.max(h,d.v?2:0)}" rx="4" style="fill:${d.v>=goal?'var(--ok)':'var(--brand)'}"><title>${d.k}: ${d.v}</title></rect><text x="${i*24+12}" y="94" text-anchor="middle" font-size="9" style="fill:var(--muted)">${d.d}</text>`;}).join('');
 const fin=rows.filter(r=>r.c+r.w>0).sort((a,b)=>a.st-b.st).slice(-20),pts=fin.map((r,i)=>[fin.length>1?i/(fin.length-1)*320+10:170,86-accOf(r)/100*76,accOf(r)]);
 const line=pts.length>1?`<polyline fill="none" style="stroke:var(--brand)" stroke-width="2.5" points="${pts.map(p=>p[0]+','+p[1]).join(' ')}"/>`+pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="3.5" style="fill:var(--brand)"><title>${p[2]}%</title></circle>`).join('')+'<text x="2" y="14" font-size="9" style="fill:var(--muted)">100%</text><text x="2" y="88" font-size="9" style="fill:var(--muted)">0%</text>':'<text x="170" y="52" text-anchor="middle" font-size="12" style="fill:var(--muted)">Finish two sessions to see a trend</text>';
 return goalCard+`<div class="pcharts"><div class="card"><h3>Questions per day · last 14 days</h3><svg viewBox="0 0 340 100">${bars}</svg></div><div class="card"><h3>Accuracy trend · last ${fin.length||20} sessions</h3><svg viewBox="0 0 340 100">${line}</svg></div></div>`;}
function renderExtra(rows){
 $('pExtra').innerHTML=extraHTML(rows);
 $('goalSel').addEventListener('change',e=>{PREFS.goal=+e.target.value;persistSoon();renderPerf();});
 $('reviseGo').addEventListener('click',()=>$('reviseBtn').click());
 const lb=+store.get('qm-lastbackup')||0;$('bkNote').textContent=lb?`Last backup: ${Math.max(0,Math.floor((Date.now()-lb)/864e5))} day(s) ago.`:'No backup yet — export one so your progress survives a cleared browser.';}
$('bkExport').replaceWith($('bkExport').cloneNode(true));
$('bkExport').addEventListener('click',async()=>{
 logSession(submitted?'submitted':'in-progress');saveNow();flushPersist();const st={};stateKeys().forEach(k=>st[k]=localStorage.getItem(k));
 const subs={};SUBJECTS.filter(s=>!s.builtin&&s.data).forEach(s=>subs[s.id]=s.data);const kvs={};
 for(const k of [...await kv.keys('qs:'),...await kv.keys('notes:'),...await kv.keys('bookmark:'),'daily','prefs']){const v=await kv.get(k);if(v)kvs[k]=v;}
 dlBlob(new Blob([JSON.stringify({qmBackup:2,state:st,sessions:SESS,subjects:subs,kvs})],{type:'application/json'}),`quizmaster-backup-${dayKey()}.json`);store.set('qm-lastbackup',String(Date.now()));renderPerf();toast('Backup file created.');});


/* ===== v4: custom sessions (multi-chapter) + live test rooms ===== */
const REV=20;
const L=()=>LIVE&&LIVE.ph!=='over'?LIVE:null;
const myName=()=>($('mkName').value.trim()||store.get('qm-name')||'Player').slice(0,16);
const shufA=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const lab=(q,s)=>s.map(k=>((q.options.find(o=>o.key===k)||{}).sourceLabel||'?')).join(',').toUpperCase();
let who='host',cmode='practice';
const routeDialog=$('routeDialog');
function signedIn(){
 if(QM.user)return true;
 if(!QM.enabled){toast('Sign-in is unavailable. Check your connection and site configuration.');return false;}
 if(confirm('Sign in with Google to start or join a test?'))QM.signIn().catch(()=>toast('Sign-in could not start. Please try again.'));
 return false;
}
function chooseRoute(live=false){
 if(!signedIn())return;
 $('routeTitle').textContent=live?'Live test':'Start test';
 $('routeA').textContent=live?'Host a room':'Solo';
 $('routeB').textContent=live?'Join a room':'Live';
 const configure=(role,solo)=>{
  routeDialog.close();who=role;cmode=mode;$('mkAlone').checked=solo;openCustom();
 };
 $('routeA').onclick=()=>configure('host',!live);
 $('routeB').onclick=()=>live?configure('join',false):chooseRoute(true);
 if(!routeDialog.open)routeDialog.showModal();
}
$('startPortal').onclick=()=>{if(DATA&&!L())chooseRoute();};
$('routeClose').onclick=()=>routeDialog.close();
function openCustom(){
 $('mkName').value=store.get('qm-name')||'';setWho(who);document.body.classList.remove('fopen');$('mockBackdrop').hidden=false;updAvail();}
function poolOf(){
 const src=$('mkSrc').value,now=Date.now(),sel=new Set([...$('mkChs').querySelectorAll('input:checked')].map(i=>+i.value));
 return{sel,pool:DATA.questions.filter(q=>{if(!setupMatch(q,sel.size>0)||!(q.gradeable&&q.attemptable&&q.options.length)||(sel.size&&!sel.has(q.chapterNo)))return false;const s=QS[q.id];
  return src==='all'||(src==='new'?!s:src==='due'?s&&s.d<=now:src==='wrong'?s&&s.w:s&&s.a&&s.c/s.a<.6);})};}
function updAvail(){const{sel,pool}=poolOf();$('mkAvail').textContent=`${pool.length} questions available from ${sel.size||'all'} chapter${sel.size===1?'':'s'}.`;}
function buildIds(){
 const n=+$('mkN').value,{sel,pool}=poolOf();if(!pool.length){toast('No questions match that selection.');return null;}
 let ids;
 if($('mkBal').checked){const g=[...new Set(pool.map(q=>q.chapterNo))].map(no=>shufA(pool.filter(q=>q.chapterNo===no))).filter(a=>a.length);ids=[];while(ids.length<n&&g.some(a=>a.length))for(const a of g)if(a.length&&ids.length<n)ids.push(a.pop());}
 else ids=shufA(pool.slice()).slice(0,n);
 if(!$('mkShuf').checked){const ix=new Map(DATA.questions.map((q,i)=>[q.id,i]));ids.sort((a,b)=>ix.get(a.id)-ix.get(b.id));}
 return ids.map(q=>q.id);}
function setWho(w){who=w;document.querySelectorAll('#mkWho button').forEach(b=>b.classList.toggle('on',b.dataset.w===w));document.querySelectorAll('#mkModeSeg button').forEach(b=>b.classList.toggle('on',b.dataset.m===cmode));
 $('mkJoin').hidden=w!=='join';$('mkCfg').hidden=w==='join';$('mkModeSeg').hidden=w==='join';$('mkNameW').hidden=w==='host'&&$('mkAlone').checked;
 const al=w==='host'&&$('mkAlone').checked;$('qsecSetting').hidden=w==='join'||(al&&cmode!=='practice');document.querySelectorAll('.solo-only').forEach(x=>x.hidden=!al);document.querySelectorAll('.host-only').forEach(x=>x.hidden=!(w==='host'&&!al));$('mkAloneW').hidden=w!=='host';
 $('mkGo').textContent=w==='join'?'Join room':$('mkAlone').checked?'Start session':'Create room';$('mkT0').textContent=w==='join'?'Join a test':$('mkAlone').checked?'Solo test':'Host a test';}
$('mkAlone').addEventListener('change',()=>setWho(who));
$('mkWho').addEventListener('click',e=>{const b=e.target.closest('[data-w]');if(b)setWho(b.dataset.w);});
$('mkModeSeg').addEventListener('click',e=>{const b=e.target.closest('[data-m]');if(b){cmode=b.dataset.m;setWho(who);}});
function updateChapters(){chosenChapters.clear();for(const box of $('mkChs').querySelectorAll('input:checked'))chosenChapters.add(+box.value);userFilter();updAvail();}
$('mkChs').addEventListener('change',updateChapters);$('mkSrc').addEventListener('change',updAvail);
$('mkAll').addEventListener('click',()=>{$('mkChs').querySelectorAll('input').forEach(i=>i.checked=true);updateChapters();});$('mkNone').addEventListener('click',()=>{$('mkChs').querySelectorAll('input').forEach(i=>i.checked=false);updateChapters();});
$('mkCancel').addEventListener('click',()=>$('mockBackdrop').hidden=true);
function setOrder(ids){order=ids.map(id=>byId.get(id));shuffled=true;current=0;selected=null;render();}
$('mkGo').addEventListener('click',async()=>{
 if(!signedIn())return;
 if(who==='join')return joinRoom();
 const ids=buildIds();if(!ids)return;
 const marks=Number($('mkMarks').value);if(!Number.isFinite(marks)||marks<=0||!$('mkMarks').checkValidity()){toast('Enter a positive mark per correct answer.');return;}
 if(!$('mkNeg').value||!$('mkNeg').checkValidity()){toast('Enter a deduction of zero or more.');return;}
 const cfg={marks,subj:SUBJ.id,ids,mode:cmode,neg:+$('mkNeg').value,qsec:+$('mkQS').value,n:ids.length};
 if(who==='host'&&!$('mkAlone').checked)return hostRoom(cfg);
 const lim=+$('mkT').value*60;
 if(answers.size&&!await ask('Start this session?','Your current attempt in this subject will be ended (it stays in Performance).','Start'))return;
 logSession(submitted?'submitted':'ended');stopClock();answers.clear();spent.clear();submitted=false;elapsed=0;FORCE.clear();mode=cmode;
 retryIds=new Set(ids);sess={account:QM.user.id,id:uid(),st:Date.now(),qsec:cmode==='practice'?cfg.qsec:0,eb:0,lim,marks:cfg.marks||1,neg:cfg.neg,mock:1,ids};
 $('mockBackdrop').hidden=true;$('summaryBackdrop').hidden=true;$('testSubmit').textContent='Submit';setTab('quiz');applyFilters();setOrder(ids);setPaused(false);paint();
 toast(`${ids.length} questions · ${cmode}${lim?' · '+lim/60+' min':''}`);});

/* --- live rooms --- */
const names=()=>[...LIVE.roster];
const cast=m=>LIVE.peer.bc(m);
async function loadRoomClient(){
 if(!QM.enabled)throw new Error('Live rooms need a configured Supabase project.');
 let timer;
 try{
  await Promise.race([QM.load(),new Promise((_,reject)=>{
   timer=setTimeout(()=>reject(new Error('Connection timed out. Please try again.')),8000);
  })]);
 }finally{clearTimeout(timer);}
}
const mkShow=H=>()=>H.ph==='live'||H.ph==='reveal'?(H.pz?'⏸ ':'')+mmss(Math.max(0,Math.ceil((H.pz?H.pr:H.end-Date.now())/1000))):'--:--';
function liveTick(){if(!LIVE)return;if(LIVE.host)hostTick();paint();const c=$('lcd');if(c&&LIVE.show)c.textContent=LIVE.show();}
let roomOpening=null;
function beginRoomOpening(label){
 if(roomOpening||L())return null;
 if(LIVE?.ph==='over')liveLeave();
 const opening={cancelled:false};
 roomOpening=opening;
 $('mkGo').disabled=true;
 $('mkGo').textContent=label;
 return opening;
}
function finishRoomOpening(opening){
 if(roomOpening!==opening)return;
 roomOpening=null;
 $('mkGo').disabled=false;
 setWho(who);
}
function cancelRoomOpening(){
 ++joinLookupVersion;
 const opening=roomOpening;
 if(!opening)return;
 opening.cancelled=true;
 if(LIVE?.opening===opening)liveLeave();
 else{
  opening.peer?.destroy();
  finishRoomOpening(opening);
 }
}
async function roomKey(){
 const getKey=()=>{
  let key=localStorage.getItem('qm-room-device');
  if(!key){key=crypto.randomUUID();localStorage.setItem('qm-room-device',key);}
  return key;
 };
 return navigator.locks? navigator.locks.request('qm-room-device',getKey) : getKey();
}
function wireLink(H){
 H.peer.onFailure=e=>{if(LIVE===H){toast(e.message);liveLeave(false);}};
 H.peer.onNetwork=()=>{if(LIVE===H&&!H.networkLost){H.networkLost=true;toast('Connection interrupted. Retrying…');}};
 H.peer.onConnected=()=>{if(H.networkLost&&LIVE===H){H.networkLost=false;toast('Connection restored.');}};
 H.show=mkShow(H);H.iv=setInterval(liveTick,250);
}
async function openHost(cfg,saved){
 if(!signedIn())return;
 const opening=beginRoomOpening(saved?'Restoring room…':'Opening room…');
 if(!opening)return;
 const previous=localStorage.getItem('qm-room');
 let peer,H;
 try{
  await loadRoomClient();
  const key=saved?.ownerKey||crypto.randomUUID();
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  for(let tries=0;tries<3;tries++){
   if(opening.cancelled)return;
   code=saved?.code||Array.from(crypto.getRandomValues(new Uint8Array(5)),x=>alphabet[x%32]).join('');
   peer=opening.peer=new LiveRoomLink(code,key,true);
   try{await peer.open(saved?'restore':'create',false,{cfg,name:myName(),ph:'lobby',i:-1});break;}
   catch(error){
    peer.destroy();
    if(saved||error.reason!=='unavailable'||tries===2)throw error;
   }
  }
  if(opening.cancelled){
   if(!saved)await peer.rpc('close').catch(()=>{});
   return;
  }
  const name=saved?.name||myName();
  if(!saved)store.set('qm-name',name);
  H=LIVE={
   host:true,peer,opening,code,cfg,name,ownerKey:key,attemptId:saved?.attemptId||'live-'+crypto.randomUUID(),
   ph:'lobby',moderating:new Set(),members:new Map(saved?.members||[]),roster:new Set(saved?.roster||[name]),off:new Set(),
   picks:new Map((saved?.picks||[]).map(([q,m])=>[q,new Map(m)])),presenceReady:false,
   i:saved?.i??-1,end:0,ci:-1,last:'',pz:saved?.pz,pr:saved?.rem
  };
  wireLink(H);syncExitGuard();
  if(saved&&Number.isSafeInteger(saved.cursor))peer.cursor=saved.cursor;
  peer.onCheckpoint=()=>{if(LIVE===H&&H.ph!=='over')saveHost();};
  peer.onMessage=(connection,message)=>{if(LIVE===H)hostMsg(connection,message);};
  peer.onMembers=members=>{if(LIVE===H&&H.ph!=='over')reconcileRoster(H,members);};
  if(saved&&saved.ph!=='lobby'){
   await liveBegin(cfg);
   if(LIVE!==H)return;
   restoreMine(mineOf(name));
   H.ph=saved.ph;H.end=(!saved.pz&&saved.deadline)||Date.now()+saved.rem;
   castPh();
   if(H.ph==='wait'&&H.i<0)nextQ();
  }else{saveHost();$('mockBackdrop').hidden=true;showRoom();}
  peer.start();
 }catch(error){
  peer?.destroy();
  if(H&&LIVE===H)liveLeave(false);
  if(saved&&error.reason==='unavailable'&&localStorage.getItem('qm-room')===previous){
   localStorage.removeItem('qm-room');localStorage.removeItem('qm-host');clearLiveAttempt();
  }
  if(!opening.cancelled)toast(error.message||'Could not open room.');
 }finally{finishRoomOpening(opening);}
}
const hostRoom=cfg=>openHost(cfg,null);
const hostRestore=s=>s.ownerKey?openHost(s.cfg,s):toast('This room used the previous site version. Create a new room.');
function restoreMine(mine){for(const qid in mine){const q=byId.get(qid);if(!q)continue;const sel=mine[qid];answers.set(qid,{selected:sel[0]||null,sel,grade:mode==='exam'?'pending':gradeOf(q,{sel})});}}
function lobbyCast(){const c=LIVE.cfg;cast({t:'lobby',players:names(),cfg:{mode:c.mode,qsec:c.qsec,neg:c.neg,n:c.n}});}
const mineOf=n=>{const o=Object.create(null);LIVE.picks.forEach((pm,q)=>{const v=pm.get(n);if(v)o[q]=v.sel;});return o;};
function hostMsg(c,m){const H=LIVE;if(!H||!m)return;
 if(m.t==='hi'){
  if(H.ph==='over'){c.send({t:'err',m:'This test has ended.'});return;}
  let name=H.members.get(c.member);
  if(!name){
   const base=String(m.name||'Player').trim().slice(0,16)||'Player';
   name=base;let suffix=2;const reserved=new Set([H.name,...H.members.values()]);
   while(reserved.has(name))name=base+suffix++;
   H.members.set(c.member,name);
  }
  H.roster.add(name);H.off.delete(name);
  saveHost();c.send({t:'me',name});
  if(H.ph==='lobby'){lobbyCast();showRoom();}
  else{c.send({t:'rj',cfg:H.cfg,mine:mineOf(name),ph:phMsg(),names:names()});publishRoster(H);}
 }else if(m.t==='a'&&H.roster.has(H.members.get(c.member))){
  // The database accepted this answer before the member refreshed their tab.
  recPick(H.members.get(c.member),m);
 }
}
function reconcileRoster(H,members){
 let changed=false;
 for(const member of members){
  const name=H.members.get(member.member);
  if(!name)continue;
  if(member.status==='active'){
   if(!H.roster.has(name)){H.roster.add(name);changed=true;}
   if(member.online)H.off.delete(name);else H.off.add(name);
  }else if(member.status==='left'&&H.ph!=='lobby'){
   H.off.add(name);
  }else{
   changed=H.roster.delete(name)||changed;
   H.off.delete(name);
  }
 }
 H.presenceReady=true;
 if(changed)publishRoster(H);
}
function publishRoster(H){
 saveHost();
 if(H.ph==='lobby'){lobbyCast();showRoom();}
 else{cast({t:'roster',players:names()});render();}
}
function memberName(H,n){
 if(!H.host||n===H.name)return esc(n);
 return '<button class="memberName" type="button" aria-expanded="'+(H.selectedMember===n)+'">'+esc(n)+'</button>';
}
document.addEventListener('click',e=>{
 const button=e.target.closest('.memberName'),H=LIVE;
 if(!button||!H?.host)return;
 const name=button.textContent;H.selectedMember=H.selectedMember===name?null:name;
 if(H.ph==='lobby')showRoom();else render();
});
function moderationControls(H,n){
 if(!H.host||n===H.name||H.ph==='over')return '';
 const entry=[...H.members].find(([,name])=>name===n);
 if(!entry)return '';
 const id=esc(entry[0]),label=esc(n);
 return '<span class="room-member-actions" '+(H.selectedMember===n?'':'hidden')+'><button type="button" class="btn" aria-label="Kick '+label+'" data-room-action="kick" data-member="'+id+'">Kick</button><button type="button" class="btn" aria-label="Block '+label+'" data-room-action="block" data-member="'+id+'">Block</button></span>';
}
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-room-action]'),H=LIVE;if(!button||!H?.host)return;
 const {member,roomAction}=button.dataset,name=H.members.get(member);
 if(!name||H.moderating.has(member)||!['kick','block'].includes(roomAction))return;
 if(!confirm(roomAction==='kick'?'Remove '+name+'? They can join again.':'Block '+name+' from this room?'))return;
 H.moderating.add(member);button.disabled=true;
 try{
  await H.peer.moderate(roomAction,member);if(LIVE!==H)return;
  H.roster.delete(name);H.off.delete(name);publishRoster(H);
  toast(name+(roomAction==='kick'?' was removed.':' was blocked from this room.'));
 }catch(err){toast(err.message);button.disabled=false;}finally{H.moderating.delete(member);}
});
function recPick(name,m){const H=LIVE;if(!H||H.ph!=='live'||H.pz||H.cfg.ids[H.i]!==m.qid||!Array.isArray(m.sel))return;
 let pm=H.picks.get(m.qid);if(!pm)H.picks.set(m.qid,pm=new Map());const o=pm.get(name);pm.set(name,{sel:m.sel,ms:o?o.ms:(+m.ms||0)});castPh();}
const allIn=()=>{const H=LIVE,pm=H.picks.get(H.cfg.ids[H.i]);return H.presenceReady&&!!pm&&names().filter(n=>!H.off.has(n)).every(n=>pm.has(n));};
function hostTick(){const H=LIVE;if(!H||H.ph==='over'||H.pz)return;const now=Date.now();
 if(H.ph==='live'){if(now>=H.end||allIn())toReveal();}else if(H.ph==='reveal'&&now>=H.end)nextQ();}
function toReveal(){if(LIVE.cfg.mode==='exam')return nextQ();LIVE.ph='reveal';LIVE.end=Date.now()+REV*1000;castPh();}
function nextQ(){const H=LIVE;if(!H||!H.host||H.ph==='over'||H.ph==='lobby')return;H.i++;if(H.i>=H.cfg.ids.length)return finish();H.ph='live';H.end=Date.now()+H.cfg.qsec*1000;castPh();}
function hostWatch(H){return Math.max(0,(H.cfg.watchPausedAt||Date.now())-(H.cfg.watchStart||Date.now()));}
function phMsg(){const H=LIVE,pm=H.picks.get(H.cfg.ids[H.i]),pk=Object.create(null);if(pm)pm.forEach((v,n)=>{if(H.roster.has(n))pk[n]=H.cfg.mode==='exam'?[]:v.sel;});return{t:'ph',watchMs:hostWatch(H),i:H.i,ph:H.ph,rem:H.pz?H.pr:H.end-Date.now(),pz:H.pz?1:0,picks:pk};}
function castPh(){const m=phMsg();cast(m);onPh(m);saveHost();}
async function queueCheckpoint(H,snapshot){
 H.pendingSnapshot=snapshot;if(H.saving)return;H.saving=true;
 try{while(H.pendingSnapshot&&LIVE===H){
  const next=H.pendingSnapshot;H.pendingSnapshot=null;
  try{await H.peer.rpc('checkpoint',next);}catch(e){if(!e.reason&&LIVE===H){H.pendingSnapshot=H.pendingSnapshot||next;await new Promise(r=>setTimeout(r,1500));}else break;}
 }}finally{H.saving=false;}
}
async function findHost(code){
 if(!QM.user)return null;
 const local=JSON.parse(localStorage.getItem('qm-host')||'null');
 const matching=local?.ownerKey&&(!local.account||local.account===QM.user.id)&&(!code||local.code===code);
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),4000);
 let result;
 try{result=await QM.client().rpc('qm_host_room',{room_code:code||null}).abortSignal(controller.signal);}
 finally{clearTimeout(timeout);}
 const {data,error}=result;
 if(error&&matching)return local;
 if(error)throw new Error('Could not check your hosted room. Check your connection and the live-room SQL update.');
 return matching&&(!data||data.session===local.session&&local.cursor>=data.cursor)?local:data;
}
function saveHost(){const H=LIVE;const snapshot={account:QM.user?.id,code:H.code,cursor:H.peer.cursor,session:H.peer.session,ownerKey:H.ownerKey,attemptId:H.attemptId,members:[...H.members],cfg:H.cfg,name:H.name,i:H.i,ph:H.ph,deadline:H.end,rem:H.pz?H.pr:Math.max(0,H.end-Date.now()),pz:H.pz?1:0,roster:[...H.roster],picks:[...H.picks].map(([q,m])=>[q,[...m]])};queueCheckpoint(H,snapshot);try{localStorage.setItem('qm-host',JSON.stringify(snapshot));localStorage.setItem('qm-room',JSON.stringify({role:'h',code:H.code,session:H.peer.session,t:Date.now()}));}catch(e){}}
function onPh(m){const H=LIVE;if(!H||!H.cfg?.ids||!byId.has(H.cfg.ids[m.i]))return;const first=H.ci!==m.i;
 if(first&&m.ph==='live'){H.qs=Date.now()-(H.cfg.qsec*1000-m.rem);H.last='';}
 H.watchMs=m.watchMs??H.watchMs??0;H.watchAnchor=Date.now();H.ci=m.i;H.ph=m.ph;H.end=Date.now()+m.rem;H.cpicks=m.picks;H.pz=m.pz;H.pr=m.rem;
 if(m.ph==='reveal'&&H.cfg.mode==='practice'){const qq=H.cfg.ids[m.i],a=answers.get(qq);if(!a)FORCE.add(qq);else if(a.grade==='pending'){const g=gradeOf(byId.get(qq),a);answers.set(qq,{...a,grade:g});recordResult(byId.get(qq),g);}}
 if(current!==m.i){current=m.i;selected=null;scrollTo({top:0});}render();}
function finish(){const H=LIVE,ids=H.cfg.ids,neg=H.cfg.neg||0,rows=[],pk={};
 ids.forEach(id=>{pk[id]=Object.create(null);const pm=H.picks.get(id);if(pm)pm.forEach((v,n)=>{if(H.roster.has(n))pk[id][n]=v.sel;});});
 names().forEach(n=>{let c=0,w=0,t=0,att=0;ids.forEach(id=>{const v=H.picks.get(id)&&H.picks.get(id).get(n);if(!v)return;att++;t+=v.ms||0;const g=gradeOf(byId.get(id),{sel:v.sel});if(g==='correct')c++;else if(g==='wrong')w++;});rows.push({n,c,w,u:ids.length-att,t,s:Math.round((c*(H.cfg.marks||1)-w*neg)*100)/100});});
 rows.sort((a,b)=>b.s-a.s||a.t-b.t);const res={rows,ids,pk,neg};cast({t:'end',res});liveEnd(res);}
function liveEnd(res){const H=LIVE;if(!H)return;try{const saved=JSON.parse(localStorage.getItem('qm-room')||'null');if(saved?.session===H.peer.session){localStorage.removeItem('qm-room');if(H.host)localStorage.removeItem('qm-host');}}catch(e){}H.res=res;H.ph='over';clearInterval(H.iv);H.peer.outbox.finally(()=>H.peer.destroy());gradePending();submitted=true;setPaused(false);stopClock();logSession('submitted');$('testSubmit').textContent='Summary';render();paint();showLB();}
function showLB(){const r=LIVE.res,t=r.rows[0];
 $('lbBody').innerHTML=`<p class="weak" style="background:var(--ok-bg);color:var(--ok);border-color:var(--ok-line)">🏆 ${esc(t.n)} wins with ${t.s} point${t.s===1?'':'s'}</p><div style="overflow-x:auto"><table class="lbt"><tr><th>#</th><th>Player</th><th>Score</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th>Avg time</th></tr>${r.rows.map((x,i)=>`<tr><td>${i+1}</td><td><b>${esc(x.n)}</b>${x.n===LIVE.name?' (you)':''}</td><td><b>${x.s}</b></td><td>${x.c}</td><td>${x.w}</td><td>${x.u}</td><td>${x.c+x.w?mmss(Math.round(x.t/(x.c+x.w)/1000)):'–'}</td></tr>`).join('')}</table></div><h3>Responses by question</h3><div style="overflow:auto;max-height:300px"><table class="lbt"><tr><th>Q</th><th>Key</th>${r.rows.map(x=>`<th>${esc(x.n)}</th>`).join('')}</tr>${r.ids.map((id,i)=>{const q=byId.get(id);return`<tr><td>${i+1}</td><td>${keyStr(q)}</td>${r.rows.map(x=>{const s=Object.hasOwn(r.pk[id],x.n)?r.pk[id][x.n]:null;if(!s)return'<td>–</td>';const g=gradeOf(q,{sel:s})==='correct';return`<td style="color:var(--${g?'ok':'bad'});font-weight:700">${lab(q,s)} ${g?'✓':'✗'}</td>`;}).join('')}</tr>`;}).join('')}</table></div>`;
 $('lbBackdrop').hidden=false;}
function showRoom(){const H=LIVE;if(!H||H.ph!=='lobby'){$('roomBackdrop').hidden=true;return;}const ns=H.host?names():(H.players||[]),c=H.cfg||{};
 $('roomBody').innerHTML=`<div class="rcode" onclick="navigator.clipboard&&navigator.clipboard.writeText('${H.code}');toast('Code copied')">${esc(H.code)}</div><p style="margin:0;text-align:center">Friends tap Join room and enter this code.</p><p style="margin:8px 0 0;text-align:center;font-size:13px">${c.mode==='exam'?'Exam':'Practice'} · ${c.n||'?'} questions · ${c.qsec||'?'}s per question</p><h3>Players (${ns.length})</h3>`+ns.map((n,i)=>`<div class="mine"><span><b>${memberName(H,n)}</b>${i===0?' <span class="chip">host</span>':''}</span>${moderationControls(H,n)}</div>`).join('')+(H.host?'':'<p class="dnote">Waiting for the host to start…</p>');
 $('roomStart').hidden=!H.host;$('roomBackdrop').hidden=false;}
function clearLiveAttempt(){
 if(!sess.live||submitted)return;
 logSession('ended');stopClock();sess={};retryIds=null;elapsed=0;paused=false;
 document.body.classList.remove('paused');
 answers.clear();spent.clear();FORCE.clear();
 if(DATA)applyFilters();
}
function liveLeave(explicit=true){
 const H=LIVE;
 if(!H)return;
 LIVE=null;
 clearInterval(H.iv);clearTimeout(H.handshake);
 try{
  const saved=JSON.parse(localStorage.getItem('qm-room')||'null');
  if(saved?.session===H.peer.session){
   localStorage.removeItem('qm-room');
   if(H.host)localStorage.removeItem('qm-host');
  }
 }catch(e){}
 if(explicit&&H.ph!=='over'){
  H.peer.rpc(H.host?'close':'leave').catch(()=>{});
 }
 if(H.host&&H.ph==='over')H.peer.outbox.finally(()=>H.peer.destroy());
 else H.peer.destroy();
 $('roomBackdrop').hidden=true;$('lbBackdrop').hidden=true;
 if(H.ph!=='over')clearLiveAttempt();
 finishRoomOpening(H.opening);paint();if(DATA)render();
}
let findingHost=false,joinLookupVersion=0;
async function joinRoom(){
 const code=$('mkCode').value.trim().toUpperCase();if(!/^[A-Z0-9]{5}$/.test(code)){toast('Enter the five-character room code.');return;}
 if(!signedIn()||roomOpening||findingHost)return;
 const lookup=++joinLookupVersion;findingHost=true;$('mkGo').disabled=true;$('mkGo').textContent='Joining…';
 try{const saved=await findHost(code);if(lookup!==joinLookupVersion)return;if(saved)await hostRestore(saved);else{store.set('qm-name',myName());await startGuest(code,myName(),false);}}
 catch(e){toast(e.message);}finally{findingHost=false;if(!roomOpening){$('mkGo').disabled=false;setWho(who);}}
}
async function startGuest(code,name,auto){
 if(!signedIn())return;
 const opening=beginRoomOpening(auto?'Rejoining…':'Joining…');
 if(!opening)return;
 const previous=localStorage.getItem('qm-room');
 let peer,H;
 try{
  await loadRoomClient();
  const key=await roomKey();
  if(opening.cancelled)return;
  peer=opening.peer=new LiveRoomLink(code,key,false);
  await peer.open('join',!auto);
  if(opening.cancelled){await peer.rpc('leave').catch(()=>{});return;}
  H=LIVE={host:false,opening,peer,code,name,ph:'wait',players:[],cfg:null,ci:-1,last:'',attemptId:'live-'+peer.memberId};
  wireLink(H);syncExitGuard();
  H.conn={send:m=>peer.send(m)};
  H.pendingKey='qm-last-pick:'+peer.memberId;
  const hello=()=>peer.send({t:'hi',name:H.name});
  peer.onRestore=hello;
  peer.onMessage=(_,message)=>guestMsg(H,message);
  H.handshake=setTimeout(()=>{
   if(LIVE===H&&!H.admitted){
    toast('Host has not responded yet. Check the connection and try again.');
    liveLeave();
   }
  },25000);
  peer.start();hello();
 }catch(error){
  peer?.destroy();
  if(H&&LIVE===H)liveLeave(false);
  if(auto&&error.reason&&error.reason!=='superseded'&&localStorage.getItem('qm-room')===previous){
   localStorage.removeItem('qm-room');clearLiveAttempt();
  }
  if(!opening.cancelled)toast(error.message||'Could not join room.');
 }finally{
  if(!H||LIVE!==H)finishRoomOpening(opening);
 }
}
const rejoin=s=>startGuest(s.code,s.name,true);
async function guestMsg(H,m){
 if(LIVE!==H||!m)return;
 if(m.t==='err'){toast(m.m);liveLeave(false);return;}
 if(m.t==='me'){
  H.named=true;H.name=m.name;localStorage.setItem('qm-room',JSON.stringify({role:'g',code:H.code,session:H.peer.session,name:H.name,t:Date.now()}));return;
 }
 if(!H.named)return;
 if(m.t==='lobby'||m.t==='rj'){
  H.admitted=true;clearTimeout(H.handshake);finishRoomOpening(H.opening);$('mockBackdrop').hidden=true;
 }
 if(m.t==='lobby'){H.players=m.players;H.cfg=m.cfg;H.ph='lobby';showRoom();}
 else if(m.t==='roster'){H.players=m.players;if(DATA)render();}
 else if(m.t==='start')await liveBegin(m.cfg);
 else if(m.t==='rj'){await liveBegin(m.cfg);if(LIVE!==H)return;restoreMine(m.mine||{});H.players=m.names||[];onPh(m.ph);
  const pending=JSON.parse(localStorage.getItem(H.pendingKey)||'null');
  if(pending&&m.ph.ph==='live'&&H.cfg.ids[m.ph.i]===pending.qid&&!m.mine?.[pending.qid]){
   restoreMine({[pending.qid]:pending.sel});H.conn.send(pending);render();
  }
  toast('Joined room '+H.code+'.');}
 else if(m.t==='ph'&&H.cfg?.ids)onPh(m);
 else if(m.t==='end'&&H.cfg?.ids)liveEnd(m.res);
}
async function liveBegin(cfg){
 const H=LIVE;if(!SUBJECTS.some(s=>s.id===cfg.subj)){toast('Subject unavailable. Reopen the room when the subject is available.');liveLeave(false);return;}
 if(SUBJ.id!==cfg.subj)await openSubject(cfg.subj);if(LIVE!==H)return;
 if(!cfg.ids.every(id=>byId.has(id))){toast('Your copy of this subject differs from the host’s. Import the same file.');liveLeave(false);return;}
 const sameAttempt=sess.id===H.attemptId;
 if(!sameAttempt)logSession(submitted?'submitted':'ended');
 const prior=SESS.find(entry=>entry.id===H.attemptId);
 const started=(sameAttempt&&sess.st)||prior?.st||Date.now();
 stopClock();answers.clear();
 if(!sameAttempt){spent.clear();elapsed=prior?.dur||0;}
 submitted=false;FORCE.clear();mode=cfg.mode;paused=false;document.body.classList.remove('paused');
 sess={account:QM.user.id,id:H.attemptId,st:started,eb:0,lim:0,marks:cfg.marks||1,neg:cfg.neg,mock:1,live:1,ids:cfg.ids};retryIds=new Set(cfg.ids);H.cfg=cfg;H.ph='wait';H.ci=-1;H.last='';
 ['roomBackdrop','mockBackdrop','summaryBackdrop'].forEach(i=>$(i).hidden=true);$('testSubmit').textContent='Submit';setTab('quiz');applyFilters();setOrder(cfg.ids);paint();}
$('roomStart').addEventListener('click',async()=>{const H=LIVE;if(!H||!H.host||H.ph!=='lobby')return;H.ph='wait';H.cfg.watchStart=Date.now();H.i=-1;saveHost();cast({t:'start',cfg:H.cfg});await liveBegin(H.cfg);setTimeout(()=>{if(LIVE===H)nextQ();},1800);});
$('roomLeave').addEventListener('click',()=>{if(confirm(LIVE?.host?'Close this room for everyone?':'Leave this room?'))liveLeave();});$('lbClose').addEventListener('click',()=>liveLeave());$('lbSum').addEventListener('click',showSummary);
function liveAns(){const H=L();if(!H||H.ph!=='live'||H.pz)return;const q=currentQ(),a=q&&answers.get(q.id);if(!a||(mode==='practice'&&a.grade==='pending'))return;
 const sel=selKeys(a),k=q.id+sel.join(',');if(H.last===k)return;H.last=k;const m={t:'a',qid:q.id,sel,ms:Date.now()-(H.qs||Date.now())};if(H.host)recPick(H.name,m);else{try{localStorage.setItem(H.pendingKey,JSON.stringify(m));}catch(e){}H.conn.send(m);}}
const _pick=pick;pick=function(k){const H=L();if(H&&(H.ph!=='live'||H.pz)){toast(H.pz?'Paused by the host.':H.ph==='reveal'?'Time is up for this question.':'Waiting for the first question…');return;}_pick(k);liveAns();};
const _cm=checkMulti;checkMulti=function(){_cm();liveAns();};
const _sb=syncBar;syncBar=function(q){_sb(q);const H=L();if(!H)return;['prevBtn','clearBtn'].forEach(i=>$(i).disabled=true);
 $('nextBtn').disabled=!(H.host&&!H.pz&&(H.ph==='live'||H.ph==='reveal'));if(H.host)$('nextBtn').classList.add('primary');
 const p=$('pauseBtn');p.disabled=!H.host;p.textContent=H.pz?'▶':'❚❚';p.title=H.host?(H.pz?'Resume for everyone':'Pause for everyone'):'Only the host can pause';};
const _sp=setPaused;setPaused=function(p){if(L())return;_sp(p);paint();};
$('pauseBtn').addEventListener('click',e=>{const H=L();if(!H)return;e.stopImmediatePropagation();if(H.host)hostPause();},true);
$('nextBtn').addEventListener('click',e=>{const H=L();if(!H)return;e.stopImmediatePropagation();if(H.host&&!H.pz){if(H.ph==='reveal')nextQ();else if(H.ph==='live')toReveal();}},true);
const _rn=render;render=function(){_rn();liveUI();paint();};
function liveUI(){const H=L(),q=currentQ();if(!H||!H.cfg||!H.cfg.ids||!q||H.ci<0)return;
 const mine=answers.get(q.id),done=revealed(mine),prac=H.cfg.mode==='practice',pk=H.cpicks||{},nm=H.host?names():H.players;
 const rows=nm.map(n=>{const s=Object.hasOwn(pk,n)?pk[n]:null;let v;if(!s)v=`<span style="color:var(--muted)">${H.ph==='reveal'?'no answer':'thinking…'}</span>`;
  else if(!prac||!(done||H.ph==='reveal'))v='✔ answered';else{const ok=gradeOf(q,{sel:s})==='correct';v=`<b style="color:var(--${ok?'ok':'bad'})">${lab(q,s)} ${ok?'✓':'✗'}</b>`;}
  return`<div class="mine"><span>${memberName(H,n)}${n===H.name?' (you)':''}</span><span>${v}</span>${moderationControls(H,n)}</div>`;}).join('');
 const ex='';
 const p=document.createElement('div');p.id='livePanel';p.className='lpanel';
 p.innerHTML=`<div class="lhead"><b>Room ${esc(H.code)}</b><span>Question ${H.ci+1} / ${H.cfg.ids.length}</span>${prac?'':'<span id="lcd">'+H.show()+'</span>'}</div>${prac?'':'<p class="dnote" style="margin:0 0 6px">Exam: friends’ answers stay hidden until the end.</p>'}${H.pz?'<p style="margin:0 0 6px;font-weight:700">⏸ Test paused by the host</p>':''}${rows}${ex}`;
 card.append(p);}
function hostPause(){const H=LIVE;if(!H||!H.host)return;if(H.pz){if(H.cfg.watchPausedAt)H.cfg.watchStart+=Date.now()-H.cfg.watchPausedAt;delete H.cfg.watchPausedAt;H.pz=0;H.end=Date.now()+H.pr;}else{H.cfg.watchPausedAt=Date.now();H.pr=Math.max(0,H.end-Date.now());H.pz=1;}castPh();}

/* ===== v5: sync hooks · reports · shared banks ===== */
{const ks=kv.set.bind(kv);kv.set=async(k,v)=>{const r=await ks(k,v);QM.touch&&QM.touch(k);return r;};const ss=store.set;store.set=(k,v)=>{ss(k,v);if(/^(pq-state|qm-state)/.test(k)&&QM.dirty)QM.dirty();};}
const _rn3=render;render=function(){_rn3();{const nt=$('navToggle');if(nt)nt.innerHTML='☷ <b>'+(order.length?current+1:0)+'/'+order.length+'</b>';}const q=currentQ(),hd=card.querySelector('.qhead');if(q&&hd&&!$('rptBtn')){const b=document.createElement('button');b.id='rptBtn';b.type='button';b.className='btn flagbtn';b.textContent='🚩';b.title='Report a wrong answer or typo';b.setAttribute('aria-label','Report this question');b.onclick=()=>{$('rptBackdrop').hidden=false;};hd.append(b);}};
$('rptCancel').addEventListener('click',()=>$('rptBackdrop').hidden=true);
$('rptSend').addEventListener('click',async()=>{const q=currentQ();if(!q)return;const ok=await QM.report({subject_id:SUBJ.id,subject_name:SUBJ.name,qid:q.id,chapter:q.chapter,qno:q.chapterNo+'.'+q.number,prompt:String(q.prompt).slice(0,400),reason:$('rptReason').value,note:$('rptNote').value.trim().slice(0,500)});
 $('rptBackdrop').hidden=true;$('rptNote').value='';toast(ok?'Thanks — report sent to the mentor.':'Saved. It will be sent when you are signed in and online.');});
$('mySubj').addEventListener('click',async e=>{const b=e.target.closest('[data-sh]');if(!b)return;if(!QM.user){toast('Sign in on the home page to share a subject.');return;}
 const s=SUBJECTS.find(x=>x.id===b.dataset.sh);await ensureData(s);const slug=s.id+'-'+Math.random().toString(36).slice(2,6);
 const{error}=await QM.client().from('shared_subjects').insert({slug,title:s.name,data:s.data});if(error){toast('Could not share: '+error.message);return;}
 const u=new URL('index.html?bank='+slug,location.href).href;try{await navigator.clipboard.writeText(u);}catch(x){}toast('Share link copied: '+u);});
const _os=openSubject;openSubject=async function(...a){const r=await _os(...a);let ch=0;for(const id in NOTES)if(!NTS[id]){NTS[id]=nMeta(id);ch=1;}if(ch)persistSoon();return r;};
document.addEventListener('visibilitychange',()=>{if(document.hidden){try{flushPersist()}catch(e){}}});
function parseMatch(p){
 if(!p||!/List[\s-]*I\b/i.test(p))return null;
 const lines=String(p).replace(/\r/g,'').split('\n');const LR=/^\(?([A-Fa-f]|[P-Sp-s])[.)]\s*(.*)$/,RR=/^\(?(\d{1,2}|i{1,3}|iv|vi{0,3}|v)[.)]\s*(.*)$/i;
 const pre=[],L=[],R=[];let tgt=null,started=false,stop=false;
 for(const raw of lines){if(stop)break;const ln=raw.trim();if(!ln)continue;
  if(/^Codes?\s*[:–-]?\s*$|^Codes?\s*[:–-]/i.test(ln)&&started){stop=true;break}
  const parts=ln.split(/\t+/).map(s=>s.trim()).filter(Boolean);let hit=false;
  for(const part of parts){let m;
   if((m=part.match(LR))){L.push({k:m[1].toUpperCase(),t:m[2]});tgt=L;hit=true;started=true;}
   else if(started&&(m=part.match(RR))){R.push({k:m[1],t:m[2]});tgt=R;hit=true;}
   else if(started&&tgt){const a=tgt[tgt.length-1];a.t=(a.t+' '+part).trim();}
  }
  if(parts.length>1&&L.length&&R.length)tgt=L;
  if(!started)pre.push(ln);
 }
 if(L.length<3||R.length<3)return null;
 // header / intro / subheads
 let hi=pre.findIndex(l=>/^List[\s-]*I\b/i.test(l)&&!/\bwith\b|\bmatch\b/i.test(l));
 const intro=(hi<0?pre:pre.slice(0,hi)).join(' ').replace(/\s+/g,' ').trim();
 let subL='',subR='';
 if(hi>=0){const sub=pre.slice(hi+1).filter(l=>!/^List[\s-]*I{1,2}\s*$/i.test(l));const sg=[];
  for(const l of sub){const ps=l.split(/\t+/).map(s=>s.trim()).filter(Boolean);if(ps.length>=2){subL+=' '+ps[0];subR+=' '+ps[1]}else sg.push(l)}
  if(!subL&&!subR&&sg.length===2){subL=sg[0];subR=sg[1]}else if(!subL&&!subR&&sg.length)subL=sg.join(' ');
 }
 const tidy=a=>a.map(x=>({k:x.k,t:x.t.replace(/\s+/g,' ').trim()}));
 return{intro,subL:subL.trim(),subR:subR.trim(),L:tidy(L),R:tidy(R)};
}
function mapOpt(t,m){if(!m)return null;const s=String(t||'');const pr=[...s.matchAll(/([A-F]|[P-S])\s*[-–→:]?\s*\(?(\d{1,2}|[ivx]+)\)?/g)].map(x=>[x[1],x[2]]);
 if(pr.length===m.L.length&&pr.every((p,i)=>p[0]===m.L[i].k))return pr;
 const tk=s.split(/[\s,;]+/).filter(Boolean);if(tk.length===m.L.length&&tk.every(x=>/^(\d{1,2}|[ivx]+)$/i.test(x)))return tk.map((x,i)=>[m.L[i].k,x]);return null}


function matchHTML(m){const c=(a,b)=>`<td>${a?'<b>'+esc(a.k)+'.</b>':''}</td><td>${a?esc(a.t):''}</td>`,sh=t=>t?`<small>${esc(t.replace(/^\(|\)$/g,''))}</small>`:'';let r='';
 for(let i=0;i<Math.max(m.L.length,m.R.length);i++)r+='<tr>'+c(m.L[i])+c(m.R[i])+'</tr>';
 return(m.intro?`<p class="prompt">${esc(m.intro)}</p>`:'')+`<div class="mtf"><table><thead><tr><th colspan="2">List I${sh(m.subL)}</th><th colspan="2">List II${sh(m.subR)}</th></tr></thead><tbody>${r}</tbody></table></div>`;}
const optMatch=(t,m)=>{const p=mapOpt(t,m);return p?p.map(x=>`<b>${esc(x[0])}</b>→${esc(x[1])}`).join('<i></i>'):null;};
document.addEventListener('click',e=>{const i=e.target.closest('.qimg,.oimg');if(!i)return;e.stopPropagation();e.preventDefault();let z=$('zoomB');if(!z){z=document.createElement('div');z.id='zoomB';z.innerHTML='<img alt="">';z.onclick=()=>z.hidden=true;document.body.append(z);}z.firstChild.src=i.src;z.hidden=false;},true);
/* ---------- storage health + error safety net ---------- */
(function(){let ok=true;try{localStorage.setItem('qm-probe','1');ok=localStorage.getItem('qm-probe')==='1';localStorage.removeItem('qm-probe');}catch(e){ok=false;}
 if(!ok){const w=$('warnBar');w.textContent='⚠ This browser is not letting the app save data (private mode or a restricted viewer). Progress will be lost when you close the page — open the file normally in Safari or Chrome.';w.hidden=false;}
 addEventListener('error',()=>toast('Something went wrong — your saved progress is safe. Reload if the page misbehaves.'));})();

/* boot */
const savedTheme=store.get('pq-theme');setTheme(savedTheme?savedTheme==='dark':matchMedia('(prefers-color-scheme:dark)').matches);
applyFont();setNavC(store.get('pq-navc')==='1');
new ResizeObserver(()=>document.documentElement.style.setProperty('--topH',$('top').offsetHeight+'px')).observe($('top'));
(async function boot(){
 const auth=QM.init(0).catch(()=>{});
 const params=new URLSearchParams(location.search);
 const browsing=location.pathname.endsWith('/builder.html')&&params.has('s')&&!params.has('retry')&&!params.has('custom')&&!localStorage.getItem('qm-room');
 if(!browsing)await QM.deadline(auth,8000);
 const linkedAtOpen=new URLSearchParams(location.search).get('join')?.trim().toUpperCase();
 const pointer=JSON.parse(localStorage.getItem('qm-room')||'null');
 const hostLookup=!browsing&&QM.user&&(linkedAtOpen||pointer?.role!=='g')?
  findHost(linkedAtOpen||null).catch(e=>{toast(e.message);return null;}):Promise.resolve(null);
 try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist();}catch(e){}
 SUBJECTS.push({id:'polity',name:'Indian Polity & Governance',builtin:true,reflow:true,sourceHtml:POLITY_SRC},
  {id:'history',name:'Indian History',builtin:true,reflow:true,sourceHtml:'<b>Source:</b> Indian History — Complete Booklet (consolidated exam papers, printed pages B9–B760). Question text, options, answer key and explanations are extracted from the supplied booklet; questions with no printed answer key are not scored.'});
 for(const k of (QM.isAdmin?await kv.keys('subj:'):[])){const d=await kv.get(k);if(d&&d.questions)SUBJECTS.push({id:k.slice(5),name:d.title,builtin:false,data:d,sourceHtml:'<b>Source:</b> '+esc(d.source||'Imported subject')+'. Imported on this device.'});}
 const applyRows=rows=>{for(const r of rows){const i=SUBJECTS.findIndex(s=>s.id===r.id);if(r.status!=='live'){if(i>=0)SUBJECTS.splice(i,1);continue}if(r.status!=='live'||!r.path)continue;const o={id:r.id,name:r.name,builtin:false,cloud:r,sourceHtml:'<b>Source:</b> '+esc(r.subtitle||r.name)};if(i>=0)SUBJECTS[i]=o;else SUBJECTS.push(o)}};
 // Resolve the current published version before choosing the question bank.
 // QM.subjects() falls back to the stored catalog when the network is unavailable.
 let catalogSignature='';
 const cache=await QM.kvGet('cache:subjects')||[];
 const cachedSubject=cache.some(r=>r.id===params.get('s'))||['polity','history'].includes(params.get('s'));
 const rows=browsing&&cachedSubject?cache:await QM.subjects();
 applyRows(rows);catalogSignature=JSON.stringify(rows);
 let checking=false;
 async function refreshCatalog(){
  const idle=()=>DATA&&!L()&&!roomOpening&&document.body.dataset.stage==='setup'&&$('mockBackdrop').hidden&&!$('routeDialog').open;
  if(checking||!idle())return;
  checking=true;
  try{const rows=await QM.subjects();if(idle()&&JSON.stringify(rows)!==catalogSignature)location.reload();}
  finally{checking=false;}
 }
 QM.listen(event=>{if(event==='resume')refreshCatalog();});
 addEventListener('online',refreshCatalog);

 SESS=(await kv.get('sessions'))||[];DAILY=(await kv.get('daily'))||{};Object.assign(PREFS,(await kv.get('prefs'))||{});
 if(browsing){const key=params.get('s')==='polity'?'pq-state-v2':'qm-state:'+params.get('s');
  let saved;try{saved=JSON.parse(store.get(key)||'null')}catch{}
  if(saved?.x?.id&&!saved.s)await QM.deadline(auth,8000);
 }
 const qp=new URLSearchParams(location.search),localHost=await hostLookup,last=localHost?.cfg?.subj||qp.get('s')||store.get(LS_LAST);await openSubject(SUBJECTS.some(s=>s.id===last)?last:(SUBJECTS[0]||{}).id,true);buildSubjectSelect();
 const linkedCode=(qp.get('join')||'').trim().toUpperCase();
 let savedRoom;
 try{savedRoom=JSON.parse(localStorage.getItem('qm-room')||'null');}catch(e){}
 const resume=savedRoom&&Date.now()-savedRoom.t<36*3600000&&(!linkedCode||linkedCode===savedRoom.code);
 if(qp.get('add')){if(QM.isAdmin)openAdd();else toast('Only admins can add subjects.');}
 let recovering=null;
 if(QM.user&&(!resume||savedRoom.role==='h'||linkedCode)){
  recovering=localHost;
 }
 if(recovering){toast('Restoring room '+recovering.code+'…');await hostRestore(recovering);}
 else if(QM.user&&resume&&savedRoom.role==='g'&&savedRoom.name){
  toast('Rejoining room '+savedRoom.code+'…');rejoin(savedRoom);
 }else{
  clearLiveAttempt();
  if(linkedCode){who='join';openCustom();$('mkCode').value=linkedCode;}
  else if(qp.get('retry')){
   const record=SESS.find(r=>r.id===qp.get('retry')&&r.subj===SUBJ.id);
   const url=new URL(location.href);url.searchParams.delete('retry');history.replaceState(history.state,'',url);
   if(record)await retryFromRec(record);else toast('This attempt is unavailable on this device.');
  }else if(qp.get('custom'))chooseRoute();
 }
 if(browsing&&cachedSubject)auth.then(()=>refreshCatalog()).catch(()=>{});
 if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
})().catch(()=>{
 $('poolCount').textContent='Could not finish loading your questions or saved progress.';
 $('startPortal').disabled=true;$('portalRetry').hidden=false;
});
$('portalRetry').onclick=()=>location.reload();

/* ===== v2 UI behaviour: filter sheet, responsive placement, swipe, filter badge ===== */
(function(){
 const mq=matchMedia('(max-width:760px)'),sizer=document.querySelector('.sizer'),b1=document.querySelector('.bar1'),b2=document.querySelector('.bar2');
 function place(){
  if(mq.matches){b1.append(sizer,$('themeBtn'));}
  else{b2.insertBefore($('modeSeg'),$('testSubmit'));b2.insertBefore($('resetTest'),$('testSubmit'));b1.append(sizer,$('themeBtn'));document.body.classList.remove('fopen');}
 }
 place();mq.addEventListener?mq.addEventListener('change',place):mq.addListener(place);
 const open=v=>document.body.classList.toggle('fopen',v);
 $('fToggle').addEventListener('click',()=>open(!document.body.classList.contains('fopen')));
 $('fDone').addEventListener('click',()=>open(false));$('fScrim').addEventListener('click',()=>open(false));
 addEventListener('keydown',e=>{if(e.key==='Escape')open(false);});
 window.updateFCount=function(){let n=[groupFilter,examFilter,yearFilter,viewFilter].filter(s=>s.value!=='all').length+(search?1:0)+(retryIds?1:0);const c=$('fCount');c.textContent=n;c.hidden=!n;};
 const af=applyFilters;applyFilters=function(){af();updateFCount();refreshViewCounts();};
 $('fClear').addEventListener('click',()=>{chosenChapters.clear();groupFilter.value='all';fillChapters();[examFilter,yearFilter,viewFilter].forEach(s=>s.value='all');search='';$('searchBox').value='';userFilter();});
 /* swipe left / right to move between questions */
 let x0=null,y0=0,t0=0;const c=$('questionCard');
 c.addEventListener('touchstart',e=>{const t=e.touches[0];x0=t.clientX;y0=t.clientY;t0=Date.now();},{passive:true});
 c.addEventListener('touchend',e=>{if(x0==null)return;const t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0;x0=null;if(Math.abs(dx)>90&&Math.abs(dy)<45&&Date.now()-t0<600&&!paused&&tab==='quiz')go(current+(dx<0?1:-1));},{passive:true});
})();
