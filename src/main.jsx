import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, ArrowLeft, BookOpen, Bookmark, Check, CheckCircle2, ChevronRight, ChevronDown, Clock3, Flame, GraduationCap, LayoutDashboard, BarChart3, ListFilter, LogIn, LogOut, Menu, Search, ShieldCheck, Sparkles, Target, Trophy, X, XCircle, Zap, RotateCcw, Cloud, CircleHelp } from 'lucide-react';
import { questions, topics, topicById, questionById } from './data/index.js';
import { emptyProgress, mergeProgress, readProgress, progressKey, latestAttempts, shuffle } from './progress.js';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';

const letters = ['A','B','C','D'];
const STATIC_SITE = import.meta.env.VITE_STATIC_SITE === 'true';
const navItems = [{id:'overview',label:'Overview',icon:LayoutDashboard},{id:'practice',label:'Practice questions',icon:BookOpen},{id:'rush',label:'Question Rush',icon:Zap},{id:'learn',label:'Rule library',icon:GraduationCap},{id:'progress',label:'My progress',icon:BarChart3}];
const uid = () => crypto.randomUUID();
const fmtTime = s => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
async function api(path, options={}) {
  const r = await fetch(`/api${path}`, { credentials:'same-origin', headers:{'Content-Type':'application/json'}, ...options });
  const data = await r.json();
  if (!r.ok) { const error=new Error(data.error || 'Could not connect. Please try again.');error.status=r.status;throw error; }
  return data;
}
function Logo({small=false}) { return <div className={`logo ${small?'small':''}`}><div className="logo-mark">c<span>·</span></div>{!small&&<div>clause<span>SAT GRAMMAR STUDIO</span></div>}</div>; }
function Tag({children,blue=false}) { return <span className={`tag ${blue?'blue':''}`}>{children}</span>; }
function App() {
  const [route,setRoute] = useState(location.hash.slice(1)||'overview');
  const [mobile,setMobile] = useState(false);
  const [user,setUser] = useState(null);
  const [progress,setProgress] = useState(()=>readProgress(null));
  const [hydrated,setHydrated] = useState(STATIC_SITE);
  const [sync,setSync] = useState('local');
  const [auth,setAuth] = useState(null);
  const [authLoading,setAuthLoading] = useState(false);
  const [notice,setNotice] = useState('');
  const bookmarkChanges = useRef(new Map());
  const [accountChanged,setAccountChanged] = useState(false);
  const [filter,setFilter] = useState('all');
  const [practiceSet,setPracticeSet] = useState(questions.map(q=>q.id));
  const [practiceIndex,setPracticeIndex] = useState(0);
  const [selected,setSelected] = useState(null);
  const [checked,setChecked] = useState(false);
  const [search,setSearch] = useState('');
  const [rushMinutes,setRushMinutes] = useState(15);
  const [rush,setRush] = useState(null);
  const [seconds,setSeconds] = useState(0);
  const finishedRuns = useRef(new Set());
  const [page,topicId] = route.split('/');
  const currentPage = navItems.some(n=>n.id===page) ? page : 'overview';
  const topic = topicById[topicId];
  const latest = latestAttempts(progress.attempts);
  const correct = progress.attempts.filter(a=>a.correct).length;
  const accuracy = progress.attempts.length ? Math.round(correct/progress.attempts.length*100) : null;
  const mastered = latest.filter(a=>a.correct).length;
  const today = progress.attempts.filter(a=>new Date(a.answeredAt).toDateString()===new Date().toDateString()).length;
  const practiced = new Set(latest.map(a=>a.questionId));
  const question = currentPage==='rush' && rush && !rush.finished ? questionById[rush.ids[rush.index]] : questionById[practiceSet[practiceIndex]];
  const weak = latest.filter(a=>!a.correct).map(a=>a.questionId);
  const nextTopic = topics.find(t=>!progress.completedLessons.includes(t.id))||topics[0];

  const navigate = path => { location.hash=path; setRoute(path); setMobile(false); window.scrollTo({top:0,behavior:'instant'}); };
  useEffect(()=>{ const fn=()=>setRoute(location.hash.slice(1)||'overview'); window.addEventListener('hashchange',fn); return()=>window.removeEventListener('hashchange',fn); },[]);
  useEffect(()=>{
    if(STATIC_SITE)return;
    let live=true;
    (async()=>{
      try { const {user:u}=await api('/auth/me'); if(!live)return;
        if(u) {
          setUser(u);
          try { bookmarkChanges.current=new Map(JSON.parse(localStorage.getItem(`${progressKey(u)}-bookmark-changes`)||'[]')); }catch{bookmarkChanges.current=new Map();}
          const cached=readProgress(u);setProgress(cached);
          const {progress:p}=await api('/progress',{headers:{'X-Account-ID':u.id}}); if(!live)return;
          setProgress(mergeRemote(cached,p));setSync('synced');
        }
      } catch { if(live)setNotice('Account service is unavailable. You can keep studying as a guest.'); }
      finally { if(live)setHydrated(true); }
    })(); return()=>{live=false;};
  },[]);
  useEffect(()=>{
    if(!hydrated)return;
    try { localStorage.setItem(progressKey(user),JSON.stringify(progress)); } catch { setNotice('Your browser could not save progress on this device.'); }
    if(STATIC_SITE){setSync('local');return;}
    persistBookmarkChanges();
    if(!user){setSync('local');return;}
    if(accountChanged)return;
    setSync('saving');
    let active=true;
    const timer=setTimeout(async()=>{
      const changes=new Map(bookmarkChanges.current);
      try {
        const {progress:p}=await saveProgress(user,progress,changes);
        if(active){clearChanges(changes);setProgress(current=>{const next=mergeRemote(current,p);return JSON.stringify(current)===JSON.stringify(next)?current:next;});setSync('synced');}
      }
      catch(e) { if(active){if(e.status===409){setAccountChanged(true);setNotice(e.message);}setSync('pending');} }
    },450);
    return()=>{active=false;clearTimeout(timer);};
  },[progress,user,hydrated,accountChanged]);
  useEffect(()=>{
    if(STATIC_SITE)return;
    if(!user||!hydrated||accountChanged)return;
    const refresh=async()=>{
      if(document.visibilityState==='hidden')return;
      try{const {progress:p}=await api('/progress',{headers:{'X-Account-ID':user.id}});setProgress(current=>{const next=mergeRemote(current,p);return JSON.stringify(current)===JSON.stringify(next)?current:next;});}
      catch(e){if(e.status===409){setAccountChanged(true);setNotice(e.message);}}
    };
    const online=()=>setProgress(p=>({...p}));
    window.addEventListener('online',online);window.addEventListener('focus',refresh);
    const timer=setInterval(refresh,20000);
    return()=>{clearInterval(timer);window.removeEventListener('online',online);window.removeEventListener('focus',refresh);};
  },[user,hydrated,accountChanged]);
  useEffect(()=>{
    if(!rush||rush.finished)return;
    const tick=()=>setSeconds(Math.max(0,Math.ceil((rush.deadline-Date.now())/1000)));
    tick(); const timer=setInterval(tick,250);return()=>clearInterval(timer);
  },[rush?.deadline,rush?.finished]);
  useEffect(()=>{ if(rush&&!rush.finished&&Date.now()>=rush.deadline)finishRush(rush); },[seconds,rush]);
  useEffect(()=>{
    if(currentPage==='rush'&&rush&&!rush.finished){
      const answer=rush.answers.find(a=>a.questionId===rush.ids[rush.index]);
      setSelected(answer?.choice??null);setChecked(Boolean(answer));
    }else resetAnswer();
  },[currentPage,rush?.id,rush?.index]);

  function persistBookmarkChanges(targetUser=user){try{localStorage.setItem(`${progressKey(targetUser)}-bookmark-changes`,JSON.stringify([...bookmarkChanges.current]));}catch{}}
  function clearChanges(changes,targetUser=user){for(const [id,saved]of changes)if(bookmarkChanges.current.get(id)===saved)bookmarkChanges.current.delete(id);persistBookmarkChanges(targetUser);}
  function mergeRemote(local,remote){const merged=mergeProgress(local,remote);const marks=new Set(remote.bookmarks);for(const [id,saved]of bookmarkChanges.current)saved?marks.add(id):marks.delete(id);merged.bookmarks=[...marks];return merged;}
  function saveProgress(u,p,changes){return api('/progress',{method:'PUT',headers:{'Content-Type':'application/json','X-Account-ID':u.id},body:JSON.stringify({progress:p,addedBookmarks:[...changes].filter(([,saved])=>saved).map(([id])=>id),removedBookmarks:[...changes].filter(([,saved])=>!saved).map(([id])=>id)})});}

  function beginPractice(topicFilter='all', subset=null) {
    const ids=subset||questions.filter(q=>topicFilter==='all'||q.topic===topicFilter).map(q=>q.id);
    setPracticeSet(ids);setPracticeIndex(0);setFilter(topicFilter);setSelected(null);setChecked(false);navigate('practice');
  }
  function resetAnswer(){setSelected(null);setChecked(false);}
  function recordAnswer(mode) {
    if(selected===null||checked||!question)return;
    if(mode==='rush'&&rush.answers.some(a=>a.questionId===question.id))return;
    if(mode==='rush'&&Date.now()>=rush.deadline){finishRush(rush);return;}
    const isCorrect=selected===question.answer;
    setChecked(true);
    setProgress(p=>({...p,attempts:[...p.attempts,{id:uid(),questionId:question.id,choice:selected,correct:isCorrect,mode,answeredAt:new Date().toISOString()}]}));
    if(mode==='rush')setRush(r=>({...r,answers:[...r.answers,{questionId:question.id,choice:selected,correct:isCorrect}]}));
  }
  function finishRush(run) {
    if(!run||finishedRuns.current.has(run.id))return;
    finishedRuns.current.add(run.id);
    const duration=Math.min(Math.round((Date.now()-run.startedAt)/1000),run.minutes*60);
    setRush({...run,finished:true,duration});if(currentPage==='rush')resetAnswer();
    setProgress(p=>({...p,rushRuns:[...p.rushRuns,{id:run.id,score:run.answers.filter(a=>a.correct).length,total:20,duration,finishedAt:new Date().toISOString()}]}));
  }
  function startRush(){
    const ids=shuffle(questions).slice(0,20).map(q=>q.id);const start=Date.now();
    setRush({id:uid(),ids,index:0,answers:[],minutes:rushMinutes,startedAt:start,deadline:start+rushMinutes*60000,finished:false});setSeconds(rushMinutes*60);resetAnswer();
  }
  function nextQuestion(mode){
    resetAnswer();
    if(mode==='rush'){if(rush.index===19){finishRush(rush);return;}setRush(r=>({...r,index:r.index+1}));}
    else setPracticeIndex(i=>i+1);
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function toggleBookmark(id){
    const has=progress.bookmarks.includes(id);
    bookmarkChanges.current.set(id,!has);
    setProgress(p=>({...p,bookmarks:has?p.bookmarks.filter(x=>x!==id):[...p.bookmarks,id]}));
  }
  async function completeAuth(values,mode){
    setAuthLoading(true);
    try {
      const {user:u}=await api(`/auth/${mode}`,{method:'POST',body:JSON.stringify(values)});
      const guest=user?emptyProgress():progress;
      const cached=mergeProgress(readProgress(u),guest);
      let cachedChanges=[];try{cachedChanges=JSON.parse(localStorage.getItem(`${progressKey(u)}-bookmark-changes`)||'[]');}catch{}
      bookmarkChanges.current=new Map([...cachedChanges,...guest.bookmarks.map(id=>[id,true])]);
      setUser(u);setProgress(cached);setAuth(null);setAccountChanged(false);setSync('saving');
      try {
        const {progress:p}=await api('/progress',{headers:{'X-Account-ID':u.id}});
        const merged=mergeRemote(cached,p);
        const changes=new Map(bookmarkChanges.current);
        const {progress:saved}=await saveProgress(u,merged,changes);
        clearChanges(changes,u);setProgress(mergeRemote(merged,saved));setSync('synced');setNotice('You’re signed in. Your progress is saved to your account.');
        try{localStorage.removeItem(progressKey(null));localStorage.removeItem(`${progressKey(null)}-bookmark-changes`);}catch{}
      }catch{setSync('pending');setNotice('You’re signed in. Your progress is saved on this device and will sync when the connection returns.');}
    } finally {setAuthLoading(false);}
  }
  async function logout(){
    let saved=false;
    try{
      if(!accountChanged){await saveProgress(user,progress,new Map(bookmarkChanges.current));saved=true;}
    }catch{}
    try{await api('/auth/logout',{method:'POST'});setUser(null);setProgress(readProgress(null));bookmarkChanges.current.clear();setAccountChanged(false);setRush(null);resetAnswer();setNotice(saved?'Signed out. Your account progress is saved.':'Signed out. Unsynced progress is retained on this device for your next sign-in.');}catch(e){setNotice(e.message);}
  }

  function renderOverview(){return <>
    <div className="page-heading"><div><div className="eyebrow">A LITTLE PRACTICE. A LOT OF PROGRESS.</div><h1>Your next great score starts here.</h1><p>Build confidence, one well-crafted sentence at a time.</p></div><span className="date-pill"><Sparkles size={15}/> Let’s make it count</span></div>
    <section className="hero">
      <div className="hero-copy"><Tag blue><span className="status-dot"/> YOUR GRAMMAR ADVANTAGE</Tag><h2>Master the rules.<br/><span>Own the test.</span></h2><p>Tricky commas? Meet your match. Learn the rules,<br className="desktop"/> take on tough questions, and make every answer count.</p><div className="hero-actions"><button className="btn primary" onClick={()=>beginPractice()}>Start practicing <ArrowRight size={18}/></button><button className="text-btn" onClick={()=>navigate('learn')}>Explore the rules <ChevronRight size={16}/></button></div><div className="hero-foot"><ShieldCheck size={15}/> Original SAT-style questions. Every answer explained.</div></div>
      <div className="hero-art" aria-hidden="true"><div className="art-ring r1"/><div className="art-ring r2"/><div className="art-plus p1">+</div><div className="art-plus p2">+</div><div className="floating-tag"><CheckCircle2 size={17}/> That’s the right idea.</div><div className="grammar-sheet"><div className="sheet-top"><span>THE DAILY GRAMMAR FIX</span><BookOpen size={17}/></div><p>A little clarity<br/>goes a <em>long way.</em></p><div className="sheet-line"/><div className="sheet-line short"/><div className="sheet-choice"><span>A</span> Your next correct answer <div className="mini-check"><Check size={13}/></div></div><div className="sheet-bottom"><span>CONFIDENCE, BUILT.</span><Sparkles size={17}/></div></div><div className="art-icon"><GraduationCap size={29}/></div><div className="floating-number"><span>250</span> ways to get better</div></div>
    </section>
    <div className="stats-strip"><Stat icon={BookOpen} value={`${practiced.size} / 250`} label="Questions practiced"/><Stat icon={Target} value={accuracy===null?'—':`${accuracy}%`} label="Overall accuracy"/><Stat icon={GraduationCap} value={`${progress.completedLessons.length} / 25`} label="Lessons completed"/><Stat icon={Flame} value={today} label="Answers today"/></div>
    <div className="section-heading"><h2>Find your flow</h2><span>Three ways to sharpen your skills</span></div>
    <div className="mode-grid">
      <ModeCard icon={BookOpen} tone="blue" label="GO AT YOUR PACE" title="Practice questions" description="250 challenging questions. Thoughtful explanations. No pressure, just progress." tags={['All skill areas','Hard difficulty']} action="Let’s practice" onClick={()=>beginPractice()}/>
      <ModeCard icon={Zap} tone="navy" label="A LITTLE FRIENDLY PRESSURE" title="Question Rush" description="20 questions. One ticking clock. Put your instincts to the test and beat your best." tags={['Timed rounds','Personal bests']} action="Take the challenge" onClick={()=>navigate('rush')}/>
      <ModeCard icon={GraduationCap} tone="pale" label="UNDERSTAND THE WHY" title="Rule library" description="From sentence boundaries to synthesis. Clear lessons that make the rules stick." tags={['25 focused lessons','Worked examples']} action="Explore the library" onClick={()=>navigate('learn')}/>
    </div>
    <div className="bottom-grid"><section className="card next-lesson"><div className="section-heading"><h2>A good place to start</h2><Tag>RECOMMENDED</Tag></div><div className="lesson-preview"><div className="lesson-icon"><BookOpen size={24}/></div><div><span className="overline">{nextTopic.group}</span><h3>{nextTopic.title}</h3><p>{nextTopic.summary}</p></div><button className="icon-btn" aria-label={`Learn ${nextTopic.title}`} onClick={()=>navigate(`learn/${nextTopic.id}`)}><ArrowRight size={21}/></button></div></section><section className="study-note"><Sparkles size={21}/><div><h3>Learn it. Try it. Make it yours.</h3><p>Review the explanation after every answer. Knowing why an answer works is what makes progress last.</p></div></section></div>
    <p className="editorial-note">Independent study resource. Original practice content; not affiliated with or endorsed by College Board.</p>
  </>;}

  function questionView(mode){
    const isRush=mode==='rush';const index=isRush?rush.index:practiceIndex;const total=isRush?20:practiceSet.length;
    if(!question)return <div className="empty-state card"><Trophy size={42}/><h2>You finished this practice set.</h2><p>Every explanation is another step forward.</p><button className="btn primary" onClick={()=>beginPractice(filter)}>Practice again <RotateCcw size={17}/></button><button className="text-btn" onClick={()=>navigate('progress')}>See your progress <ArrowRight size={17}/></button></div>;
    const qTopic=topicById[question.topic];
    return <><div className="question-meta"><span>QUESTION <strong>{index+1}</strong> OF {total}</span><div>{isRush&&<span className={`timer ${seconds<60?'urgent':''}`}><Clock3 size={18}/>{fmtTime(seconds)}</span>}<Tag>HARD</Tag><button className={`icon-btn ${progress.bookmarks.includes(question.id)?'is-saved':''}`} aria-label={progress.bookmarks.includes(question.id)?'Remove bookmark':'Bookmark question'} onClick={()=>toggleBookmark(question.id)}><Bookmark size={19}/></button></div></div><div className="progress-track"><div style={{width:`${index/total*100}%`}}/></div>
      <div className="question-layout"><section className="card question-card"><div className="question-category"><span className="status-dot"/>{qTopic.title}</div><div className="passage">{question.passage.split('___').map((s,i)=><React.Fragment key={i}>{i>0&&<span className="blank" aria-label="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>}{s}</React.Fragment>)}</div><p className="question-prompt">{question.prompt}</p><div className="choices">{question.choices.map((choice,i)=><button key={i} disabled={checked} aria-pressed={selected===i} className={`choice ${selected===i?'selected':''} ${checked&&question.answer===i?'correct':''} ${checked&&selected===i&&i!==question.answer?'incorrect':''}`} onClick={()=>setSelected(i)}><span className="choice-letter">{letters[i]}</span><span>{choice}</span>{checked&&question.answer===i?<CheckCircle2 size={20}/>:checked&&selected===i?<XCircle size={20}/>:<span className="choice-radio"/>}</button>)}</div><div className="answer-action">{checked?<button className="btn primary" onClick={()=>nextQuestion(mode)}>{isRush&&index===19?'Finish round':!isRush&&index===total-1?'Finish practice':'Next question'}<ArrowRight size={18}/></button>:<button className="btn primary" disabled={selected===null} onClick={()=>recordAnswer(mode)}>Check answer <ArrowRight size={18}/></button>}<span>{checked?'Take a moment to learn the why.':'Choose the best answer.'}</span></div></section>
      <aside className="question-aside">{checked?<section className={`card explanation ${selected===question.answer?'success':'try-again'}`} aria-live="polite"><div className="feedback-heading">{selected===question.answer?<CheckCircle2 size={23}/>:<CircleHelp size={23}/>}<h3>{selected===question.answer?'Nicely done.':'A chance to learn.'}</h3></div><p>{question.explanation}</p><h4>Why each choice works or doesn’t</h4>{question.optionExplanations.map((text,i)=><div className="option-reason" key={i}><b className={i===question.answer?'right-letter':''}>{letters[i]}</b><span>{text}</span></div>)}<div className="lesson-tip"><Sparkles size={17}/><span>{question.lessonTip}</span></div><button className="text-btn" onClick={()=>navigate(`learn/${question.topic}`)}>Review this rule <ArrowRight size={16}/></button></section>:<section className="card focus-card"><div className="lesson-icon"><Target size={25}/></div><h3>{isRush?'Trust your preparation.':'Make room for the details.'}</h3><p>{isRush?'Read the full passage, choose the best answer, and keep moving. Your clock keeps running while you review explanations.':'Read the whole passage before choosing. Small differences between the choices are often the key.'}</p><div className="focus-divider"/><span className="overline">THIS QUESTION TESTS</span><h4>{qTopic.title}</h4><p>{qTopic.summary}</p></section>}</aside></div></>;
  }
  function renderPractice(){return <><PageTitle eyebrow="ONE QUESTION. ONE STEP FORWARD." title="Practice with purpose." description="Take your time. Get curious. Learn from every answer."/><div className="practice-toolbar"><label><ListFilter size={17}/><select aria-label="Filter practice by topic" value={filter} onChange={e=>beginPractice(e.target.value)}><option value="all">All grammar topics</option>{topics.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select><ChevronDown size={15}/></label><div className="toolbar-buttons"><button className="text-btn" onClick={()=>beginPractice('all',shuffle(questions.filter(q=>!practiced.has(q.id))).map(q=>q.id))}>Unanswered ({250-practiced.size})</button><button className="text-btn" onClick={()=>beginPractice('all',progress.bookmarks.filter(id=>questionById[id]))}><Bookmark size={15}/>Saved ({progress.bookmarks.length})</button></div></div>{questionView('practice')}</>;}
  function renderRush(){
    if(rush&&!rush.finished)return <><PageTitle eyebrow="STAY SHARP. KEEP MOVING." title="Question Rush" description="20 questions. A test of focus, accuracy, and pace."/>{questionView('rush')}<button className="text-btn end-round" onClick={()=>finishRush(rush)}>End round and see results</button></>;
    if(rush?.finished){const score=rush.answers.filter(a=>a.correct).length;return <><PageTitle eyebrow="ROUND COMPLETE" title="Every round makes you stronger." description="Here’s what you learned under pressure."/><section className="card rush-results"><div className="trophy-icon"><Trophy size={40}/></div><Tag blue>YOUR RUSH RESULTS</Tag><h2>{score}<span> / 20</span></h2><p>{score>=16?'Great focus. Your preparation is paying off.':'Keep building. Review your misses and come back stronger.'}</p><div className="results-stats"><div><b>{Math.round(score/20*100)}%</b><span>Accuracy</span></div><div><b>{fmtTime(rush.duration)}</b><span>Time used</span></div><div><b>{rush.answers.length}</b><span>Answered</span></div></div><div className="hero-actions"><button className="btn primary" onClick={startRush}>Try another round <RotateCcw size={17}/></button><button className="btn secondary" onClick={()=>beginPractice('all',rush.ids.filter(id=>!rush.answers.some(a=>a.questionId===id&&a.correct)))}>Review missed questions</button></div></section><h2 className="review-title">Your round, question by question</h2><div className="round-review">{rush.ids.map((id,i)=>{const q=questionById[id],a=rush.answers.find(a=>a.questionId===id);return <details className="card" key={id}><summary><span className={`result-marker ${a?.correct?'good':''}`}>{a?.correct?<Check size={16}/>:<X size={16}/>}</span><span>{i+1}. {topicById[q.topic].title}</span><Tag>{a?(a.correct?'Correct':'Review'):'Unanswered'}</Tag><ChevronDown size={16}/></summary><p className="passage small-passage">{q.passage}</p><p><strong>Correct answer: {letters[q.answer]}.</strong> {q.choices[q.answer]}</p><p>{q.explanation}</p></details>;})}</div></>;}
    const best=progress.rushRuns.length?Math.max(...progress.rushRuns.map(r=>r.score)):null;
    return <><PageTitle eyebrow="TURN KNOWLEDGE INTO INSTINCT." title="Ready for a little rush?" description="A focused challenge for the rules you’ve been learning."/><div className="rush-intro-grid"><section className="card rush-intro"><div className="rush-symbol"><Zap size={42}/></div><Tag blue>THE 20-QUESTION CHALLENGE</Tag><h2>Think clearly.<br/><span>Answer confidently.</span></h2><p>A fresh mix of difficult questions in every round. Race the clock, keep your accuracy high, and see how far you’ve come.</p><div className="rush-facts"><span><BookOpen size={19}/><b>20</b> questions</span><span><Target size={19}/><b>Hard</b> difficulty</span></div><label className="time-label">Choose your time limit</label><div className="time-options">{[10,15,20].map(m=><button aria-pressed={rushMinutes===m} className={rushMinutes===m?'active':''} key={m} onClick={()=>setRushMinutes(m)}>{m} minutes{m===15&&<small>Recommended</small>}</button>)}</div><button className="btn primary wide" onClick={startRush}>Start Question Rush <Zap size={17}/></button><p className="quiet-text">The timer starts when your first question appears.</p></section><aside><section className="card rush-guide"><h3>A quick game plan</h3>{[['Read with intention','Find the rule the question is testing.'],['Keep your momentum','Explanations appear after every answer. The clock keeps running.'],['Finish, then reflect','At zero, your round ends automatically. Unanswered questions count toward the total.']].map(([title,desc],i)=><div className="guide-step" key={title}><span>{i+1}</span><div><h4>{title}</h4><p>{desc}</p></div></div>)}</section><section className="personal-best"><Trophy size={28}/><div><span>YOUR PERSONAL BEST</span><b>{best===null?'Your story starts here':`${best} / 20 correct`}</b><p>{progress.rushRuns.length} completed {progress.rushRuns.length===1?'round':'rounds'}</p></div></section></aside></div></>;
  }
  function renderLearn(){
    if(topic){const done=progress.completedLessons.includes(topic.id);return <><button className="text-btn back-link" onClick={()=>navigate('learn')}><ArrowLeft size={16}/>Back to the rule library</button><PageTitle eyebrow={topic.group.toUpperCase()} title={topic.title} description={topic.summary}/><div className="lesson-layout"><article className="card lesson-body"><div className="core-rule"><span className="overline">THE CORE RULE</span><p>{topic.rule}</p></div><h2>How to spot it</h2><ol className="lesson-steps">{topic.steps.map((step,i)=><li key={i}><span>{i+1}</span><p>{step}</p></li>)}</ol><h2>See the rule in action</h2>{topic.examples.map((e,i)=><div className="worked-example" key={i}><div className="example wrong"><X size={17}/><span>{e.incorrect}</span></div><div className="example right"><Check size={17}/><span>{e.correct}</span></div><p>{e.why}</p></div>)}<h2>Common traps</h2><ul className="trap-list">{topic.traps.map((t,i)=><li key={i}>{t}</li>)}</ul><div className="takeaway"><Sparkles size={21}/><div><h4>Make this your takeaway</h4><p>{topic.takeaway}</p></div></div><div className="lesson-actions"><button className={`btn ${done?'secondary':'primary'}`} disabled={done} onClick={()=>setProgress(p=>({...p,completedLessons:[...new Set([...p.completedLessons,topic.id])]}))}>{done?<CheckCircle2 size={17}/>:<Check size={17}/>} {done?'Lesson completed':'Mark lesson complete'}</button><button className="btn secondary" onClick={()=>beginPractice(topic.id)}>Practice this rule <ArrowRight size={17}/></button></div></article><aside className="card lesson-side"><GraduationCap size={28}/><h3>Understanding is your advantage.</h3><p>Read the examples, name the rule in your own words, then put it into practice.</p><div className="focus-divider"/><span className="overline">YOUR NEXT STEP</span><p>10 difficult questions on this topic, each with a full explanation.</p><button className="btn primary wide" onClick={()=>beginPractice(topic.id)}>Try the questions <ArrowRight size={17}/></button></aside></div></>;}
    const matches=topics.filter(t=>`${t.title} ${t.group} ${t.summary}`.toLowerCase().includes(search.toLowerCase()));
    return <><PageTitle eyebrow="THE WHY BEHIND THE RIGHT ANSWER." title="Good grammar is learnable." description="Your complete guide to SAT conventions and expression of ideas, plus supporting writing skills."/><div className="library-toolbar"><label className="search-box"><Search size={18}/><input placeholder="Find a rule, like commas or transitions…" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Search rules"/></label><span>{progress.completedLessons.length} of 25 lessons complete</span></div><div className="lesson-grid">{matches.map((t,i)=><button className="card lesson-tile" onClick={()=>navigate(`learn/${t.id}`)} key={t.id}><div className="lesson-tile-top"><span className="lesson-number">{String(topics.indexOf(t)+1).padStart(2,'0')}</span>{progress.completedLessons.includes(t.id)?<CheckCircle2 size={20} className="completed-icon"/>:<ArrowRight size={20}/>}</div><span className="overline">{t.group}</span><h3>{t.title}</h3><p>{t.summary}</p><span className="lesson-tile-bottom">Lesson + 10 practice questions <ChevronRight size={15}/></span></button>)}</div>{!matches.length&&<div className="empty-state"><Search size={35}/><h3>No matching rules</h3><p>Try a shorter search, such as “verb” or “comma.”</p></div>}</>;
  }
  function renderProgress(){return <><PageTitle eyebrow="PROGRESS YOU CAN SEE." title="Look how far you’re going." description="Your practice, your patterns, and your next opportunity to grow."/><div className="stats-strip progress-stats"><Stat icon={Target} value={accuracy===null?'—':`${accuracy}%`} label="Accuracy across all attempts"/><Stat icon={BookOpen} value={practiced.size} label="Unique questions practiced"/><Stat icon={CheckCircle2} value={mastered} label="Latest answers correct"/><Stat icon={Zap} value={progress.rushRuns.length} label="Rush rounds completed"/></div><div className="progress-grid"><section className="card skill-progress"><div className="section-heading"><h2>Your grammar skills</h2><Tag>25 TOPICS</Tag></div>{topics.map(t=>{const a=latest.filter(a=>questionById[a.questionId]?.topic===t.id),c=a.filter(a=>a.correct).length;return <button className="skill-row" key={t.id} onClick={()=>beginPractice(t.id)}><div><span>{t.title}</span><small>{a.length?`${c} correct · ${a.length} practiced`:'Ready when you are'}</small></div><div className="skill-track"><span style={{width:`${c/10*100}%`}}/></div><span>{c}/10</span><ChevronRight size={15}/></button>;})}</section><aside><section className="card progress-summary"><h3>A little, often.</h3><div className="completion-circle" style={{'--completion':`${progress.completedLessons.length/25*100}%`}}><div><b>{progress.completedLessons.length}</b><span>of 25 lessons</span></div></div><p>Learn a rule. Practice it. Repeat.</p><button className="btn secondary wide" onClick={()=>navigate('learn')}>Keep learning <ArrowRight size={17}/></button></section><section className="card review-card"><RotateCcw size={24}/><h3>Your next breakthrough</h3><p>{weak.length?`${weak.length} questions from your latest answers could use another look.`:'Missed questions will appear here so you can turn them into strengths.'}</p><button className="btn primary wide" disabled={!weak.length} onClick={()=>beginPractice('all',weak)}>Review missed questions</button></section><section className="card review-card"><Cloud size={24}/><h3>{STATIC_SITE?'Saved in your browser.':user?'Progress travels with you.':'Take your progress with you.'}</h3><p>{STATIC_SITE?'Your answers, bookmarks, lesson completions, and Rush results stay on this device. Clearing browser data will reset them.':user?`Signed in as ${user.email}. ${sync==='synced'?'Your progress is synced.':'Changes will sync when the connection is available.'}`:'Create an account to save your progress and pick up on another device.'}</p>{!STATIC_SITE&&!user&&<button className="btn secondary wide" onClick={()=>setAuth('register')}>Create an account <ArrowRight size={17}/></button>}</section></aside></div></>;}

  if(!hydrated)return <div className="loading-screen"><Logo/><p>Opening your study space…</p></div>;
  return <div className="app-shell"><button className="mobile-menu icon-btn" aria-label="Open navigation" onClick={()=>setMobile(!mobile)}>{mobile?<X/>:<Menu/>}</button>{mobile&&<div className="nav-scrim" onClick={()=>setMobile(false)}/>}
    <aside className={`sidebar ${mobile?'open':''}`}><a className="brand-link" href="#overview" onClick={()=>setMobile(false)}><Logo/></a><div className="nav-caption">YOUR STUDY SPACE</div><nav aria-label="Main navigation">{navItems.map(({id,label,icon:Icon})=><a href={`#${id}`} key={id} onClick={()=>{setMobile(false);}} className={currentPage===id?'active':''}><Icon size={19}/><span>{label}</span>{id==='rush'&&<span className="nav-new">GO</span>}</a>)}</nav><div className="sidebar-bottom"><div className="sidebar-tip"><div className="tip-icon"><Sparkles size={19}/></div><h4>Consistency beats cramming.</h4><p>A few focused questions every day can make a big difference.</p><button onClick={()=>beginPractice()} className="text-btn">Find your five minutes <ArrowRight size={14}/></button></div><div className="sidebar-account"><div className="avatar">{user?user.name.slice(0,1).toUpperCase():<GraduationCap size={19}/>}</div><div><b>{user?user.name:'Your study journey'}</b><small>{STATIC_SITE?'Saved in this browser':user?(sync==='synced'?'Progress synced':sync==='saving'?'Saving progress…':'Sync pending'):'Guest · saved on this device'}</small></div>{!STATIC_SITE&&<button className="icon-btn" aria-label={user?'Sign out':'Sign in'} onClick={user?logout:()=>setAuth('login')}>{user?<LogOut size={17}/>:<LogIn size={17}/>}</button>}</div></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">Your study space <ChevronRight size={13}/><b>{navItems.find(n=>n.id===currentPage)?.label}</b></div><div className="topbar-actions"><span className="study-badge"><span className="status-dot"/> SAT, one sentence at a time</span>{STATIC_SITE?<button className="btn top-signin" onClick={()=>navigate('progress')}>My progress <BarChart3 size={15}/></button>:<button className="btn top-signin" onClick={()=>user?navigate('progress'):setAuth('login')}>{user?user.name:'Sign in'}{user?<Cloud size={16}/>:<ArrowRight size={15}/>}</button>}</div></header><main>{notice&&<div className="notice" role="status">{notice}<button className="icon-btn" onClick={()=>setNotice('')} aria-label="Dismiss message"><X size={16}/></button></div>}{!STATIC_SITE&&user&&sync==='pending'&&<div className="notice">Saved on this device. Account sync is pending.<button className="text-btn" onClick={()=>setProgress(p=>({...p}))}>Retry sync</button></div>}{currentPage==='overview'?renderOverview():currentPage==='practice'?renderPractice():currentPage==='rush'?renderRush():currentPage==='learn'?renderLearn():renderProgress()}<footer><Logo small/><span>A clearer sentence. A more confident you.</span><span className="footer-right">Made for your next chapter.</span></footer></main></div>
    {!STATIC_SITE&&auth&&<AuthModal mode={auth} setMode={setAuth} loading={authLoading} onSubmit={completeAuth} onClose={()=>setAuth(null)}/>}
  </div>;
}
function PageTitle({eyebrow,title,description}){return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div></div>;}
function Stat({icon:Icon,value,label}){return <div className="stat"><div className="stat-icon"><Icon size={20}/></div><div><b>{value}</b><span>{label}</span></div></div>;}
function ModeCard({icon:Icon,tone,label,title,description,tags,action,onClick}){return <section className={`card mode-card ${tone}`}><div className="mode-icon"><Icon size={23}/></div><span className="overline">{label}</span><h3>{title}</h3><p>{description}</p><div className="mode-tags">{tags.map(t=><span key={t}>{t}</span>)}</div><button className="text-btn" onClick={onClick}>{action}<ArrowRight size={17}/></button></section>;}
function AuthModal({mode,setMode,loading,onSubmit,onClose}){
  const [error,setError]=useState('');const ref=useRef(null);
  useEffect(()=>{ref.current?.focus();const onKey=e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const f=ref.current?.closest('[role="dialog"]')?.querySelectorAll('button,input');if(!f?.length)return;const first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);},[mode]);
  async function submit(e){e.preventDefault();setError('');const d=new FormData(e.currentTarget);try{await onSubmit({name:d.get('name'),email:d.get('email'),password:d.get('password')},mode);}catch(e){setError(e.message);}}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="icon-btn modal-close" onClick={onClose} aria-label="Close sign-in dialog"><X size={20}/></button><Logo/><h2 id="auth-title">{mode==='register'?'Your next chapter starts here.':'Welcome back, learner.'}</h2><p>{mode==='register'?'Save your progress. Study on any device.':'Pick up right where you left off.'}</p><form onSubmit={submit}>{mode==='register'&&<label>Your name<input ref={ref} name="name" autoComplete="name" placeholder="Alex" maxLength={60} required/></label>}<label>Email address<input ref={mode==='login'?ref:null} name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254}/></label><label>Password<input name="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} placeholder={mode==='register'?'At least 8 characters':'Your password'} minLength={8} maxLength={128} required/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="btn primary wide" disabled={loading} type="submit">{loading?'One moment…':mode==='register'?'Create your account':'Sign in'}<ArrowRight size={17}/></button></form><div className="auth-switch">{mode==='login'?'New to Clause?':'Already have an account?'} <button className="text-btn" onClick={()=>{setError('');setMode(mode==='login'?'register':'login');}}>{mode==='login'?'Create an account':'Sign in'}</button></div><p className="auth-privacy"><ShieldCheck size={14}/> Your password is hashed. Your progress stays yours.</p></section></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
