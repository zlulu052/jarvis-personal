// Jarvis v4.1 - manual tags override AI classification
const DB_NAME='jarvis_v4_db';
const DB_VERSION=1;
const STORES=['entries','plans','summaries','tags','feedback','meta','snapshots'];
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const uid=()=>crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const nowISO=()=>new Date().toISOString();
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const escapeHTML=s=>String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));

let db;
let state={profile:{},entries:[],plans:[],summaries:[],tags:[],feedback:[],pending:null};
let activeRecordTag='all';
let editingEntryId=null;
let currentPage='dashboard';
let quickSelectedTagIds=new Set();
let modalSelectedTagIds=new Set();
let tagCreateContext='settings';

const DEFAULT_TAGS=[
 {id:'love',name:'感情',color:'#ff9fb5',system:true,keywords:['女友','男友','恋爱','暧昧','喜欢','分手','关系','约会','对象']},
 {id:'emotion',name:'情绪',color:'#b99cff',system:true,keywords:['焦虑','难受','烦躁','开心','情绪','担心','害怕','压力','委屈']},
 {id:'diet',name:'饮食',color:'#f2b86b',system:true,keywords:['吃','饮食','早餐','午饭','晚饭','热量','零食','暴食','减脂']},
 {id:'sleep',name:'睡眠',color:'#8aa8ff',system:true,keywords:['睡','失眠','起床','熬夜','午睡','困']},
 {id:'fitness',name:'健身',color:'#75dfa6',system:true,keywords:['健身','训练','跑步','力量','深蹲','卧推','运动','公里']},
 {id:'work',name:'工作',color:'#73d7ff',system:true,keywords:['工作','领导','同事','上班','单位','项目','社区','加班']},
 {id:'study',name:'学习',color:'#78c6ff',system:true,keywords:['学习','考试','考证','复习','课程','刷题']},
 {id:'reading',name:'阅读',color:'#d8b27b',system:true,keywords:['读书','阅读','看书','页','章节']},
 {id:'family',name:'家庭',color:'#f19b80',system:true,keywords:['家人','父母','妈妈','爸爸','姥姥','姥爷','家庭']},
 {id:'social',name:'社交',color:'#7ddacb',system:true,keywords:['朋友','社交','聚会','聊天','人际']},
 {id:'finance',name:'财务',color:'#ffd36d',system:true,keywords:['钱','花费','工资','存钱','消费','买','投资','预算']},
 {id:'health',name:'健康',color:'#79e5cf',system:true,keywords:['身体','健康','疼','头痛','生病','药','症状']},
 {id:'plan',name:'计划',color:'#7ea9ff',system:true,keywords:['计划','目标','坚持','完成','进度']},
 {id:'decision',name:'重要决定',color:'#ff8c8c',system:true,keywords:['决定','辞职','换工作','买房','买车','分手','选择','怎么办']},
 {id:'daily',name:'日常',color:'#92a8b7',system:true,keywords:[]}
];

function openDB(){
 return new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB_NAME,DB_VERSION);
  r.onupgradeneeded=()=>{
   const d=r.result;
   for(const s of STORES){
    if(d.objectStoreNames.contains(s)) continue;
    if(s==='entries'||s==='plans'||s==='tags'||s==='feedback'||s==='snapshots') d.createObjectStore(s,{keyPath:'id'});
    else if(s==='summaries') d.createObjectStore(s,{keyPath:'days'});
    else d.createObjectStore(s,{keyPath:'key'});
   }
  };
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
}
function txStore(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function dbGetAll(store){return new Promise((resolve,reject)=>{const r=txStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
function dbGet(store,key){return new Promise((resolve,reject)=>{const r=txStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function dbPut(store,value){return new Promise((resolve,reject)=>{const r=txStore(store,'readwrite').put(value);r.onsuccess=()=>resolve(value);r.onerror=()=>reject(r.error)})}
function dbDelete(store,key){return new Promise((resolve,reject)=>{const r=txStore(store,'readwrite').delete(key);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
function dbClear(store){return new Promise((resolve,reject)=>{const r=txStore(store,'readwrite').clear();r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
async function metaGet(key,fallback=null){const x=await dbGet('meta',key);return x?x.value:fallback}
async function metaSet(key,value){await dbPut('meta',{key,value})}

function parseLegacyAnalysis(raw){
 if(!raw||typeof raw!=='string'||raw.startsWith('[待补充')) return null;
 const names=['问题核心','我观察到的','我的判断','你现在该怎么做','是否需要长期计划','仍有的不确定点','我还需要知道'];
 const out={core:'',observations:[],judgment:'',actions:[],plan_needed:false,plan_suggestion:'',uncertainties:[]};
 const re=/【([^】]+)】/g;let matches=[...raw.matchAll(re)];
 if(!matches.length){out.judgment=raw;return out}
 for(let i=0;i<matches.length;i++){
  const name=matches[i][1],start=matches[i].index+matches[i][0].length,end=i+1<matches.length?matches[i+1].index:raw.length;
  const body=raw.slice(start,end).trim();
  if(name==='问题核心') out.core=body;
  else if(name==='我观察到的') out.observations=body.split(/\n|；/).map(x=>x.replace(/^[-•\d.、\s]+/,'').trim()).filter(Boolean);
  else if(name==='我的判断') out.judgment=body;
  else if(name==='你现在该怎么做') out.actions=body.split(/\n|；/).map(x=>x.replace(/^[-•\d.、\s]+/,'').trim()).filter(Boolean);
  else if(name==='是否需要长期计划'){out.plan_needed=!/不需要|暂时不需要/.test(body);out.plan_suggestion=body}
  else if(name==='仍有的不确定点'||name==='我还需要知道') out.uncertainties=body.split(/\n|；/).map(x=>x.replace(/^[-•\d.、\s]+/,'').trim()).filter(Boolean);
 }
 return out;
}

function localGuessTagIds(text){
 const scores=[];const lower=(text||'').toLowerCase();
 for(const t of state.tags){
  let score=0;for(const k of t.keywords||[]){if(lower.includes(k.toLowerCase())) score+=1}
  if(score>0)scores.push([score,t.id]);
 }
 scores.sort((a,b)=>b[0]-a[0]);
 const ids=scores.slice(0,3).map(x=>x[1]);
 return ids.length?ids:['daily'];
}
function tagById(id){return state.tags.find(t=>t.id===id)}
function tagName(id){return tagById(id)?.name||id}
function tagIdsFromNames(names=[]){
 const ids=[];
 for(const n of names){const t=state.tags.find(x=>x.name===n);if(t&&!ids.includes(t.id))ids.push(t.id)}
 return ids;
}
function manualMetrics(){
 const num=id=>{const v=parseFloat($(id).value);return Number.isFinite(v)?v:null};
 return {mood:num('#metricMood'),energy:num('#metricEnergy'),stress:num('#metricStress'),sleep_hours:num('#metricSleep'),weight_kg:num('#metricWeight')};
}
function mergeMetrics(a={},b={}){const o={...a};for(const [k,v] of Object.entries(b||{})){if(v!==null&&v!==undefined&&v!=='')o[k]=v}return o}
function cleanMetrics(m={}){const o={};for(const [k,v] of Object.entries(m||{})){if(v!==null&&v!==undefined&&v!==''&&!Number.isNaN(Number(v)))o[k]=Number(v)}return o}

async function migrateV3IfNeeded(){
 const done=await metaGet('migration_v3_done',false);if(done)return;
 const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
 const oldEntries=read('jarvis3_entries');const oldPlans=read('jarvis3_plans');const oldSummaries=read('jarvis3_summaries');const oldProfile=read('jarvis3_profile');const oldPending=read('jarvis3_pending');
 if(Array.isArray(oldEntries)&&oldEntries.length){
  for(const e of oldEntries){
   const rec={id:e.id||uid(),createdAt:e.time||nowISO(),updatedAt:e.time||nowISO(),text:e.text||'',title:(e.text||'旧记录').slice(0,28),status:e.analysis&&e.analysis!=='[待补充信息后再判断]'?'analyzed':(e.analysis==='[待补充信息后再判断]'?'pending':'note'),importance:e.important?'high':'low',tagIds:localGuessTagIds(e.text||''),metrics:{},analysis:parseLegacyAnalysis(e.analysis),analysisRaw:e.analysis||'',followups:[]};
   await dbPut('entries',rec);
  }
 }
 if(Array.isArray(oldPlans)) for(const p of oldPlans) await dbPut('plans',{...p,id:p.id||uid(),createdAt:p.createdAt||nowISO(),updatedAt:p.updatedAt||nowISO()});
 if(Array.isArray(oldSummaries)) for(const s of oldSummaries){if(s.days)await dbPut('summaries',{...s})}
 if(oldProfile) await metaSet('profile',oldProfile);
 if(Array.isArray(oldPending)&&oldPending.length) await metaSet('pending',{entryId:null,questions:oldPending,createdAt:nowISO()});
 await metaSet('migration_v3_done',true);
}

async function seedTags(){
 const tags=await dbGetAll('tags');
 if(tags.length)return;
 for(const t of DEFAULT_TAGS)await dbPut('tags',t);
}
async function loadState(){
 state.tags=await dbGetAll('tags');
 state.entries=(await dbGetAll('entries')).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
 state.plans=(await dbGetAll('plans')).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
 state.summaries=(await dbGetAll('summaries')).sort((a,b)=>a.days-b.days);
 state.feedback=(await dbGetAll('feedback')).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
 state.profile=await metaGet('profile',{});state.pending=await metaGet('pending',null);
}
async function saveEntry(entry){entry.updatedAt=nowISO();await dbPut('entries',entry);const i=state.entries.findIndex(x=>x.id===entry.id);if(i>=0)state.entries[i]=entry;else state.entries.push(entry);state.entries.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));scheduleLocalSnapshot();}
async function savePlan(plan){plan.updatedAt=nowISO();await dbPut('plans',plan);const i=state.plans.findIndex(x=>x.id===plan.id);if(i>=0)state.plans[i]=plan;else state.plans.push(plan);scheduleLocalSnapshot();}
async function setPending(p){state.pending=p;await metaSet('pending',p);renderPendingMini()}

function grams(s){s=(s||'').toLowerCase().replace(/\s+/g,'').replace(/[，。！？、,.!?;；:："'“”‘’（）()\[\]{}]/g,'');const set=new Set();for(let i=0;i<s.length-1;i++)set.add(s.slice(i,i+2));return set}
function analysisMode(text){if(/人生|这几年|两年|三年|过去一年|长期变化|半年|长期/.test(text))return'life';if(/最近|这个月|几周|为什么|越来越|反复|总是|经常|趋势|规律/.test(text))return'deep';return'quick'}
function selectHistory(text,currentId=null){
 const all=state.entries.filter(e=>e.id!==currentId),mode=analysisMode(text),rn=mode==='quick'?20:mode==='deep'?35:50,relN=mode==='quick'?30:mode==='deep'?80:140,recent=all.slice(-rn),ids=new Set(recent.map(e=>e.id)),q=grams(text);
 const relevant=all.filter(e=>!ids.has(e.id)).map(e=>{const eg=grams(`${e.text||''} ${e.analysis?.judgment||e.analysisRaw||''}`);let common=0;q.forEach(g=>{if(eg.has(g))common++});const age=(Date.now()-new Date(e.createdAt))/86400000;return[common*4+Math.max(0,8-age/12)+(e.importance==='high'?7:0),e]}).sort((a,b)=>b[0]-a[0]).filter(x=>x[0]>1).slice(0,relN).map(x=>x[1]);
 return {mode,recent,relevant};
}
function serializeEntries(arr){return arr.map(e=>({createdAt:e.createdAt,text:e.text,title:e.title,tags:(e.tagIds||[]).map(tagName),metrics:e.metrics||{},importance:e.importance,status:e.status,analysis:e.analysis?{core:e.analysis.core,judgment:e.analysis.judgment,actions:e.analysis.actions}:null}))}
async function api(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let d;try{d=await r.json()}catch{throw new Error(`服务器返回 ${r.status}`)}if(!r.ok)throw new Error(d.error||`请求失败 ${r.status}`);return d}
function tagCatalog(){return state.tags.map(t=>({name:t.name,system:!!t.system}))}
function feedbackExamples(){return state.feedback.slice(-30).map(f=>({text:f.text,before:f.before,after:f.after}))}
function activePlansForAI(){return state.plans.filter(p=>p.status!=='done').slice(-8).map(p=>({title:p.title||p.goal,goal:p.goal,progress:p.progress||0,status:p.status,spec:p.spec}))}

function buildEntry(text,metrics={},status='note',manualTagIds=[]){
 const chosen=[...new Set(manualTagIds||[])].filter(id=>tagById(id));
 return {id:uid(),createdAt:nowISO(),updatedAt:nowISO(),text:text.trim(),title:text.trim().slice(0,28)||'新记录',status,importance:'low',tagIds:chosen.length?chosen:localGuessTagIds(text),manualTagOverride:chosen.length>0,metrics:cleanMetrics(metrics),analysis:null,analysisRaw:'',followups:[]};
}

function renderManualTagPicker(targetId,selectedSet){
 const el=$(targetId);if(!el)return;
 const tags=[...state.tags].sort((a,b)=>Number(b.system)-Number(a.system)||a.name.localeCompare(b.name,'zh-CN'));
 el.innerHTML=(selectedSet.size===0?'<span class="auto-tag-note">✨ 当前：AI 自动分类</span>':'')+
 tags.map(t=>`<button type="button" class="manual-tag-option ${selectedSet.has(t.id)?'active':''}" data-id="${t.id}" style="--tag-color:${t.color}">${escapeHTML(t.name)}</button>`).join('');
 el.querySelectorAll('.manual-tag-option').forEach(btn=>btn.onclick=()=>{
   const id=btn.dataset.id;
   if(selectedSet.has(id))selectedSet.delete(id);else selectedSet.add(id);
   renderManualTagPicker(targetId,selectedSet);
 });
}
function renderComposerTagPickers(){
 renderManualTagPicker('#quickTagPicker',quickSelectedTagIds);
 renderManualTagPicker('#modalTagPicker',modalSelectedTagIds);
}
function resetComposerTags(source='dashboard'){
 if(source==='modal')modalSelectedTagIds.clear();else quickSelectedTagIds.clear();
 renderComposerTagPickers();
}
function openCreateTag(context='settings'){
 tagCreateContext=context;
 $('#newTagName').value='';
 openModal('tagCreateModal');
}

function clearComposer(){
 $('#quickText').value='';for(const id of ['#metricMood','#metricEnergy','#metricStress','#metricSleep','#metricWeight'])$(id).value='';
 quickSelectedTagIds.clear();renderComposerTagPickers();
}
async function saveOnly(text,metrics={},source='dashboard'){
 if(!text.trim())return;
 const selected=source==='modal'?[...modalSelectedTagIds]:[...quickSelectedTagIds];
 const e=buildEntry(text,metrics,'note',selected);await saveEntry(e);
 if(source==='modal'){closeModal('recordModal');$('#recordModalText').value='';modalSelectedTagIds.clear();renderComposerTagPickers();setStatus('#recordModalStatus','已实时保存到手机本地。','success')}else{clearComposer();setStatus('#composerStatus','已实时保存到手机本地。','success')}
 renderAll();
}
async function analyzeText(text,metrics={},source='dashboard'){
 if(!text.trim())return;
 const statusSel=source==='modal'?'#recordModalStatus':'#composerStatus';
 setStatus(statusSel,'已先保存到本地，正在检索相关历史并分析…');
 const selected=source==='modal'?[...modalSelectedTagIds]:[...quickSelectedTagIds];
 const entry=buildEntry(text,metrics,'processing',selected);await saveEntry(entry);
 try{
  const h=selectHistory(text,entry.id);
  const d=await api('/api/analyze',{profile:state.profile,summaries:state.summaries.slice(-8),active_plans:activePlansForAI(),pending:null,mode:h.mode,recent:serializeEntries(h.recent),relevant:serializeEntries(h.relevant),text,tag_catalog:tagCatalog(),tag_feedback:feedbackExamples()});
  entry.title=d.title||entry.title;
  if(!entry.manualTagOverride){
    const aiTags=tagIdsFromNames(d.tags||[]);
    entry.tagIds=aiTags.length?aiTags:localGuessTagIds(text);
  }
  entry.metrics=mergeMetrics(entry.metrics,cleanMetrics(d.metrics||{}));entry.importance=d.importance||entry.importance;
  if(d.need_clarification){entry.status='pending';await saveEntry(entry);await setPending({entryId:entry.id,questions:d.questions||[],createdAt:nowISO()});openPendingModal();setStatus(statusSel,'关键信息不足：已暂停判断，等待你补充。','success')}
  else{entry.status='analyzed';entry.brief=d.brief||'';entry.analysis=d.analysis||null;await saveEntry(entry);await setPending(null);openAnalysis(entry.id);setStatus(statusSel,'分析完成，并已保存到本地。','success')}
  if(source==='modal'){closeModal('recordModal');$('#recordModalText').value='';modalSelectedTagIds.clear();renderComposerTagPickers()}else clearComposer();renderAll();
 }catch(err){entry.status='note';await saveEntry(entry);setStatus(statusSel,`分析失败，但记录已经保存在手机里：${err.message}`,'error');renderAll()}
}
async function submitPending(){
 const p=state.pending;if(!p)return;const reply=$('#pendingReply').value.trim();if(!reply)return;
 const entry=state.entries.find(e=>e.id===p.entryId);if(!entry){setStatus('#pendingStatus','找不到对应记录。','error');return}
 entry.followups=[...(entry.followups||[]),{time:nowISO(),text:reply}];await saveEntry(entry);setStatus('#pendingStatus','补充内容已保存，正在继续分析…');
 const combined=`【原始问题】\n${entry.text}\n\n【Jarvis此前追问】\n${(p.questions||[]).map((q,i)=>`${i+1}. ${q.question||q}`).join('\n')}\n\n【用户补充】\n${reply}`;
 try{
  const h=selectHistory(combined,entry.id);const d=await api('/api/analyze',{profile:state.profile,summaries:state.summaries.slice(-8),active_plans:activePlansForAI(),pending:p.questions||[],mode:'deep',recent:serializeEntries(h.recent),relevant:serializeEntries(h.relevant),text:combined,followup:true,tag_catalog:tagCatalog(),tag_feedback:feedbackExamples()});
  entry.title=d.title||entry.title;
  if(!entry.manualTagOverride){const aiTags=tagIdsFromNames(d.tags||[]);if(aiTags.length)entry.tagIds=aiTags;}
  entry.metrics=mergeMetrics(entry.metrics,cleanMetrics(d.metrics||{}));entry.importance=d.importance||entry.importance;
  if(d.need_clarification){entry.status='pending';await saveEntry(entry);await setPending({entryId:entry.id,questions:d.questions||[],createdAt:nowISO()});$('#pendingReply').value='';renderPendingModal();setStatus('#pendingStatus','还缺少少量关键事实，新的问题已保存。')}
  else{entry.status='analyzed';entry.brief=d.brief||'';entry.analysis=d.analysis||null;await saveEntry(entry);await setPending(null);$('#pendingReply').value='';closeModal('pendingModal');openAnalysis(entry.id)}
  renderAll();
 }catch(err){setStatus('#pendingStatus',`分析失败，但你的补充已经保存在手机里：${err.message}`,'error')}
}

function setStatus(sel,text,type=''){const el=$(sel);if(!el)return;el.textContent=text;el.className=`status-line ${type==='error'?'error-text':type==='success'?'success-text':''}`}
function navigate(page){currentPage=page;$$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${page}`));$$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));window.scrollTo({top:0,behavior:'smooth'});if(page==='insights')renderInsights();if(page==='records')renderRecords();if(page==='settings')renderSettings();if(page==='plans')renderPlans()}
function openModal(id){$('#'+id).classList.remove('hidden')}
function closeModal(id){$('#'+id).classList.add('hidden')}

function renderPendingMini(){
 const p=state.pending;$('#pendingCount').textContent=p?String((p.questions||[]).length):'0';
 if(!p){$('#pendingMiniContent').innerHTML='目前没有待补充的问题。';return}
 const e=state.entries.find(x=>x.id===p.entryId);$('#pendingMiniContent').innerHTML=`<div class="record-title">${escapeHTML(e?.title||'有一条记录等待补充')}</div><div class="muted-copy" style="margin-top:7px">${escapeHTML((p.questions?.[0]?.question)||'需要补充信息')}</div><button class="text-btn" id="continuePendingMini">继续回答 →</button>`;$('#continuePendingMini')?.addEventListener('click',openPendingModal);
}
function openPendingModal(){if(!state.pending)return;renderPendingModal();openModal('pendingModal')}
function renderPendingModal(){
 const p=state.pending;if(!p)return;$('#pendingQuestions').innerHTML=(p.questions||[]).map((q,i)=>`<div class="analysis-section analysis-uncertainty"><h3>问题 ${i+1}</h3><p>${escapeHTML(q.question||q)}</p>${q.reason?`<div class="muted-copy">为什么要问：${escapeHTML(q.reason)}</div>`:''}</div>`).join('');
}

function importanceClass(x){return x==='high'?'importance-high':x==='medium'?'importance-medium':'importance-low'}
function renderTagChips(ids=[]){return ids.map(id=>{const t=tagById(id);return t?`<span class="tag-chip" style="--tag-color:${t.color}">${escapeHTML(t.name)}</span>`:''}).join('')}
function metricPills(m={}){const map={mood:'心情',energy:'精力',stress:'压力',sleep_hours:'睡眠h',weight_kg:'体重kg',workout_minutes:'运动min',reading_minutes:'阅读min'};return Object.entries(m||{}).filter(([k,v])=>map[k]&&v!==null&&v!==undefined).map(([k,v])=>`<span class="metric-pill">${map[k]} ${escapeHTML(v)}</span>`).join('')}
function analysisSummary(e){return e.brief||e.analysis?.judgment||e.analysisRaw||''}
function renderTimelineCard(e,full=false){
 const date=new Date(e.createdAt);return `<article class="${full?'record-card':'timeline-card'}" data-entry-id="${e.id}">
 <div class="record-top"><div style="display:flex;gap:9px"><span class="importance-dot ${importanceClass(e.importance)}"></span><div><div class="record-title">${escapeHTML(e.title||e.text.slice(0,28))}</div><div class="record-time">${date.toLocaleString()}</div></div></div><span class="status-badge">${e.status==='pending'?'待补充':e.status==='analyzed'?'已分析':e.status==='processing'?'分析中':'记录'}</span></div>
 <div class="record-text">${escapeHTML(e.text)}</div><div class="record-tags">${renderTagChips(e.tagIds)}</div>${metricPills(e.metrics)?`<div class="metric-pills">${metricPills(e.metrics)}</div>`:''}
 ${analysisSummary(e)?`<div class="analysis-preview">${escapeHTML(analysisSummary(e)).slice(0,220)}${analysisSummary(e).length>220?'…':''}</div>`:''}
 ${full?`<div class="record-actions"><button class="ghost-btn view-analysis" data-id="${e.id}">${e.status==='analyzed'?'查看分析':'查看详情'}</button><button class="ghost-btn edit-tags" data-id="${e.id}">编辑标签</button>${e.status==='pending'?`<button class="ghost-btn continue-pending" data-id="${e.id}">继续回答</button>`:''}<button class="ghost-btn delete-entry" data-id="${e.id}">删除</button></div>`:`<div class="record-actions"><button class="ghost-btn edit-tags" data-id="${e.id}">改标签</button>${e.status==='analyzed'?`<button class="ghost-btn view-analysis" data-id="${e.id}">看分析</button>`:''}</div>`}
 </article>`
}
function bindRecordActions(root=document){
 root.querySelectorAll('.view-analysis').forEach(b=>b.onclick=()=>openAnalysis(b.dataset.id));root.querySelectorAll('.edit-tags').forEach(b=>b.onclick=()=>openTagEditor(b.dataset.id));root.querySelectorAll('.continue-pending').forEach(b=>b.onclick=()=>openPendingModal());root.querySelectorAll('.delete-entry').forEach(b=>b.onclick=()=>deleteEntry(b.dataset.id));
}

function renderAnalysisHTML(e){
 const a=e.analysis||parseLegacyAnalysis(e.analysisRaw)||{};const list=(arr,ordered=false)=>Array.isArray(arr)&&arr.length?`<${ordered?'ol':'ul'}>${arr.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</${ordered?'ol':'ul'}>`:'<p class="muted-copy">暂无</p>';
 return `<div class="eyebrow">${renderTagChips(e.tagIds)}</div><h2 class="analysis-title">${escapeHTML(e.title||'分析')}</h2>${e.brief?`<div class="analysis-brief">${escapeHTML(e.brief)}</div>`:''}
 <div class="analysis-section"><h3>问题核心</h3><p>${escapeHTML(a.core||'—')}</p></div>
 <div class="analysis-section"><h3>关键观察</h3>${list(a.observations)}</div>
 <div class="analysis-section analysis-judgment"><h3>Jarvis 的判断</h3><p>${escapeHTML(a.judgment||'—')}</p></div>
 <div class="analysis-section analysis-actions"><h3>你现在怎么做</h3>${list(a.actions,true)}</div>
 ${a.plan_suggestion?`<div class="analysis-section"><h3>长期计划</h3><p>${escapeHTML(a.plan_suggestion)}</p></div>`:''}
 <div class="analysis-section analysis-uncertainty"><h3>仍有的不确定点</h3>${list(a.uncertainties)}</div>
 <div class="record-actions"><button class="ghost-btn edit-tags" data-id="${e.id}">编辑标签</button></div>`;
}
function openAnalysis(id){const e=state.entries.find(x=>x.id===id);if(!e)return;$('#analysisModalBody').innerHTML=renderAnalysisHTML(e);bindRecordActions($('#analysisModalBody'));openModal('analysisModal')}

async function deleteEntry(id){if(!confirm('删除这条记录？这个操作会从手机本地数据库中删除。'))return;await dbDelete('entries',id);state.entries=state.entries.filter(e=>e.id!==id);if(state.pending?.entryId===id)await setPending(null);renderAll();}

function openTagEditor(id){editingEntryId=id;tagCreateContext='edit';const e=state.entries.find(x=>x.id===id);if(!e)return;$('#tagEditChoices').innerHTML=state.tags.map(t=>`<label class="tag-choice"><input type="checkbox" value="${t.id}" ${(e.tagIds||[]).includes(t.id)?'checked':''}><span style="border-color:${t.color}44">${escapeHTML(t.name)}</span></label>`).join('');openModal('tagEditModal')}
async function saveEditedTags(){
 const e=state.entries.find(x=>x.id===editingEntryId);if(!e)return;const before=(e.tagIds||[]).map(tagName);const selected=$$('#tagEditChoices input:checked').map(x=>x.value);e.tagIds=selected.length?selected:['daily'];e.manualTagOverride=true;await saveEntry(e);const after=e.tagIds.map(tagName);if(JSON.stringify(before)!==JSON.stringify(after)){const f={id:uid(),createdAt:nowISO(),entryId:e.id,text:e.text,before,after};await dbPut('feedback',f);state.feedback.push(f)}closeModal('tagEditModal');renderAll();}
async function createTag(){
 const name=$('#newTagName').value.trim(),color=$('#newTagColor').value;if(!name)return;
 const existing=state.tags.find(t=>t.name===name);
 if(existing){
   if(tagCreateContext==='quick')quickSelectedTagIds.add(existing.id);
   if(tagCreateContext==='modal')modalSelectedTagIds.add(existing.id);
   alert('这个标签已经存在。');
   closeModal('tagCreateModal');renderComposerTagPickers();return;
 }
 const t={id:`custom-${uid()}`,name,color,system:false,keywords:[]};await dbPut('tags',t);state.tags.push(t);
 if(tagCreateContext==='quick')quickSelectedTagIds.add(t.id);
 if(tagCreateContext==='modal')modalSelectedTagIds.add(t.id);
 $('#newTagName').value='';closeModal('tagCreateModal');renderAll();renderComposerTagPickers();
 if(tagCreateContext==='edit'&&editingEntryId)openTagEditor(editingEntryId);
}
async function renameTag(id){const t=tagById(id);if(!t)return;const name=prompt('新的标签名称：',t.name);if(!name||name.trim()===t.name)return;if(state.tags.some(x=>x.id!==id&&x.name===name.trim())){alert('已有同名标签');return}t.name=name.trim();await dbPut('tags',t);renderAll()}
async function deleteTag(id){const t=tagById(id);if(!t||t.system){alert('系统标签不能删除，可以通过编辑记录改用其他标签。');return}if(!confirm(`删除标签“${t.name}”？记录不会被删除。`))return;await dbDelete('tags',id);state.tags=state.tags.filter(x=>x.id!==id);for(const e of state.entries){if((e.tagIds||[]).includes(id)){e.tagIds=e.tagIds.filter(x=>x!==id);if(!e.tagIds.length)e.tagIds=['daily'];await dbPut('entries',e)}}renderAll()}

function filteredEntries(){
 let arr=[...state.entries].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));const q=$('#recordSearch')?.value.trim().toLowerCase()||'',range=$('#recordRange')?.value||'all',status=$('#recordStatus')?.value||'all';
 if(range!=='all'){const d=Number(range);arr=arr.filter(e=>(Date.now()-new Date(e.createdAt))/86400000<=d)}if(status!=='all')arr=arr.filter(e=>status==='analyzed'?e.status==='analyzed':status==='pending'?e.status==='pending':e.status==='note');if(activeRecordTag!=='all')arr=arr.filter(e=>(e.tagIds||[]).includes(activeRecordTag));if(q)arr=arr.filter(e=>`${e.text} ${e.title} ${analysisSummary(e)} ${(e.tagIds||[]).map(tagName).join(' ')}`.toLowerCase().includes(q));return arr;
}
function renderRecordTagFilters(){const counts=tagCounts(state.entries);$('#recordTagFilters').innerHTML=`<span class="tag-chip filter ${activeRecordTag==='all'?'active':''}" data-tag="all">全部</span>`+state.tags.filter(t=>counts[t.id]).sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0)).map(t=>`<span class="tag-chip filter ${activeRecordTag===t.id?'active':''}" data-tag="${t.id}" style="--tag-color:${t.color}">${escapeHTML(t.name)} ${counts[t.id]}</span>`).join('');$$('#recordTagFilters .filter').forEach(x=>x.onclick=()=>{activeRecordTag=x.dataset.tag;renderRecords()})}
function renderRecords(){if(!$('#recordList'))return;renderRecordTagFilters();const arr=filteredEntries();$('#recordList').innerHTML=arr.map(e=>renderTimelineCard(e,true)).join('');$('#recordEmpty').classList.toggle('hidden',arr.length>0);bindRecordActions($('#recordList'))}

function tagCounts(entries){const c={};for(const e of entries)for(const id of e.tagIds||[])c[id]=(c[id]||0)+1;return c}
function dateKey(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
function streakDays(){const days=[...new Set(state.entries.map(e=>dateKey(e.createdAt)))].sort().reverse();if(!days.length)return 0;let streak=0,cur=new Date();cur.setHours(0,0,0,0);for(let i=0;i<400;i++){const k=dateKey(cur);if(days.includes(k)){streak++;cur.setDate(cur.getDate()-1)}else if(i===0){cur.setDate(cur.getDate()-1)}else break}return streak}
function recentEntries(days){return state.entries.filter(e=>(Date.now()-new Date(e.createdAt))/86400000<=days)}
function renderDashboard(){
 const monthStart=new Date();monthStart.setDate(1);monthStart.setHours(0,0,0,0);$('#statMonth').textContent=state.entries.filter(e=>new Date(e.createdAt)>=monthStart).length;$('#statStreak').textContent=streakDays();$('#statPlans').textContent=state.plans.filter(p=>p.status!=='done').length;const c=tagCounts(recentEntries(30)),top=Object.entries(c).sort((a,b)=>b[1]-a[1])[0];$('#statTopTag').textContent=top?tagName(top[0]):'—';
 const recent=[...state.entries].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);$('#dashboardTimeline').innerHTML=recent.length?recent.map(e=>renderTimelineCard(e,false)).join(''):'<div class="muted-copy">还没有记录。先写下今天发生的第一件事。</div>';
 bindRecordActions($('#dashboardTimeline'));
 renderPendingMini();renderFocusSummary();renderTagBars('#dashboardTagBars',recentEntries(30));renderTrend('#dashboardTrendCanvas','#dashboardTrendEmpty',$('#dashboardMetricSelect').value,recentEntries(30));
 const name=state.profile.name?.trim();$('#greetingTitle').textContent=name?`${name}，今天发生了什么？`:'今天想记录什么？';
}
function renderFocusSummary(){const r=recentEntries(14),c=tagCounts(r),top=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([id])=>tagName(id));const pending=state.pending?'还有一件事等待你补充信息。':'';const plans=state.plans.filter(p=>p.status!=='done');let s='';if(top.length)s+=`最近两周，你记录最多的是「${top.join('」和「')}」。`;if(plans.length)s+=` 当前有 ${plans.length} 个长期计划在推进。`;if(pending)s+=` ${pending}`;$('#focusSummary').textContent=s||'记录几天后，这里会自动显示你的近期重点。'}

function aggregateMetric(entries,key){const by={};for(const e of entries){const v=e.metrics?.[key];if(v===undefined||v===null||Number.isNaN(Number(v)))continue;const k=dateKey(e.createdAt);by[k]=by[k]||[];by[k].push(Number(v))}return Object.entries(by).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,vals])=>({date,value:key==='weight_kg'?vals[vals.length-1]:vals.reduce((a,b)=>a+b,0)/vals.length}))}
function setupCanvas(canvas){const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,w:rect.width,h:rect.height}}
function renderTrend(canvasSel,emptySel,key,entries){const canvas=$(canvasSel),empty=$(emptySel);if(!canvas)return;const pts=aggregateMetric(entries,key);empty.classList.toggle('hidden',pts.length>=2);canvas.classList.toggle('hidden',pts.length<2);if(pts.length<2)return;requestAnimationFrame(()=>drawLine(canvas,pts,key))}
function drawLine(canvas,pts,key){const {ctx,w,h}=setupCanvas(canvas);ctx.clearRect(0,0,w,h);const pad={l:38,r:14,t:18,b:30};let vals=pts.map(p=>p.value),min=Math.min(...vals),max=Math.max(...vals);if(key==='mood'||key==='energy'||key==='stress'){min=1;max=10}else if(max-min<1){min-=1;max+=1}else{const d=(max-min)*.15;min-=d;max+=d}ctx.strokeStyle='rgba(137,187,211,.11)';ctx.lineWidth=1;ctx.font='10px system-ui';ctx.fillStyle='#607b8d';for(let i=0;i<4;i++){const y=pad.t+(h-pad.t-pad.b)*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();const v=max-(max-min)*i/3;ctx.fillText(key==='sleep_hours'||key==='weight_kg'?v.toFixed(1):Math.round(v),4,y+3)}const x=i=>pad.l+(w-pad.l-pad.r)*(pts.length===1?0:i/(pts.length-1)),y=v=>pad.t+(max-v)/(max-min)*(h-pad.t-pad.b);const grad=ctx.createLinearGradient(0,0,w,0);grad.addColorStop(0,'#72d8ff');grad.addColorStop(1,'#8ce6c2');ctx.strokeStyle=grad;ctx.lineWidth=2.5;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(x(i),y(p.value)):ctx.moveTo(x(i),y(p.value)));ctx.stroke();pts.forEach((p,i)=>{ctx.fillStyle='#b9f1ff';ctx.beginPath();ctx.arc(x(i),y(p.value),3.3,0,Math.PI*2);ctx.fill()});const labelCount=Math.min(4,pts.length);for(let j=0;j<labelCount;j++){const idx=Math.round(j*(pts.length-1)/(labelCount-1||1)),d=pts[idx].date.slice(5);ctx.fillStyle='#607b8d';ctx.fillText(d,x(idx)-14,h-8)}}
function renderTagBars(sel,entries){const el=$(sel),c=tagCounts(entries),rows=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,8),max=rows[0]?.[1]||1;if(!rows.length){el.innerHTML='<div class="muted-copy">还没有足够数据。</div>';return}el.innerHTML=rows.map(([id,n])=>{const t=tagById(id);return `<div class="tag-bar-row"><div class="tag-bar-name">${escapeHTML(t?.name||id)}</div><div class="tag-bar-track"><div class="tag-bar-fill" style="width:${n/max*100}%;${t?`background:linear-gradient(90deg,${t.color},#8ce6c2)`:''}"></div></div><div class="tag-bar-count">${n}</div></div>`}).join('')}
function averageMetric(entries,key){const vals=entries.map(e=>e.metrics?.[key]).filter(v=>v!==undefined&&v!==null&&!Number.isNaN(Number(v))).map(Number);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null}
function insightEntries(){const v=$('#insightRange').value;if(v==='all')return state.entries;return recentEntries(Number(v))}
function renderInsights(){const arr=insightEntries();$('#insightRecords').textContent=arr.length;const mood=averageMetric(arr,'mood'),sleep=averageMetric(arr,'sleep_hours');$('#insightMood').textContent=mood===null?'—':mood.toFixed(1);$('#insightSleep').textContent=sleep===null?'—':`${sleep.toFixed(1)}h`;const c=tagCounts(arr),top=Object.entries(c).sort((a,b)=>b[1]-a[1])[0];$('#insightTopTag').textContent=top?tagName(top[0]):'—';renderTrend('#insightTrendCanvas','#insightTrendEmpty',$('#insightMetricSelect').value,arr);renderTagBars('#insightTagBars',arr)}
async function aiInsights(){const btn=$('#aiInsightBtn'),arr=insightEntries();if(!arr.length)return;btn.disabled=true;setStatus('#aiInsightStatus','正在解读当前趋势…');try{const counts=tagCounts(arr);const payload={range:$('#insightRange').value,stats:{records:arr.length,averages:{mood:averageMetric(arr,'mood'),energy:averageMetric(arr,'energy'),stress:averageMetric(arr,'stress'),sleep_hours:averageMetric(arr,'sleep_hours')},tags:Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([id,count])=>({tag:tagName(id),count})),metrics:['mood','energy','stress','sleep_hours','weight_kg','workout_minutes','reading_minutes'].reduce((o,k)=>(o[k]=aggregateMetric(arr,k),o),{})},profile:state.profile};const d=await api('/api/insights',payload);$('#aiInsightContent').innerHTML=`<div class="analysis-section analysis-judgment"><h3>${escapeHTML(d.headline||'趋势判断')}</h3>${(d.findings||[]).map(x=>`<p>• ${escapeHTML(x)}</p>`).join('')}</div><div class="analysis-section analysis-actions"><h3>建议</h3><ol>${(d.actions||[]).map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ol></div>`;setStatus('#aiInsightStatus','趋势解读完成。','success')}catch(e){setStatus('#aiInsightStatus',e.message,'error')}finally{btn.disabled=false}}

function planProgressAdvice(p){const a=p.lastReview;if(!a)return'';return `<div class="plan-section"><div class="eyebrow">最近复盘 · ${escapeHTML(a.status||'')}</div><div class="muted-copy" style="margin-top:6px">${escapeHTML(a.summary||a.advice||'')}</div>${a.next_actions?.length?`<ul class="plan-list">${a.next_actions.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul>`:''}</div>`}
function renderPlans(){const list=$('#planList'),arr=[...state.plans].sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));$('#planEmpty').classList.toggle('hidden',arr.length>0);list.innerHTML=arr.map(p=>{const spec=p.spec||{};return `<article class="plan-card" data-plan-id="${p.id}"><div class="card-head"><div><h3>${escapeHTML(p.title||p.goal)}</h3><div class="plan-meta"><span>${escapeHTML(p.status||'active')}</span><span>${spec.duration_weeks?`${spec.duration_weeks} 周`:''}</span><span>进度 ${Math.round(p.progress||0)}%</span></div></div><button class="ghost-btn plan-delete" data-id="${p.id}">删除</button></div><div class="progress-track"><div class="progress-fill" style="width:${clamp(p.progress||0,0,100)}%"></div></div>${spec.success_metrics?.length?`<div class="plan-section"><div class="eyebrow">成功标准</div><ul class="plan-list">${spec.success_metrics.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul></div>`:''}${spec.milestones?.length?`<details class="plan-section"><summary>查看阶段里程碑</summary><div>${spec.milestones.map(m=>`<div style="margin-top:10px"><b>${escapeHTML(m.period||'')}</b> · ${escapeHTML(m.objective||'')}<ul class="plan-list">${(m.checklist||[]).map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul></div>`).join('')}</div></details>`:''}${spec.first_7_days?.length?`<details class="plan-section" open><summary>前7天行动清单</summary><div>${spec.first_7_days.map(d=>`<div style="margin-top:9px"><b>${escapeHTML(d.day||'')}</b><ul class="plan-list">${(d.tasks||[]).map(t=>`<li>${escapeHTML(typeof t==='string'?t:t.task||'')}${typeof t==='object'&&t.minutes?` · ${escapeHTML(t.minutes)}分钟`:''}</li>`).join('')}</ul></div>`).join('')}</div></details>`:''}${spec.weekly_template?.length?`<details class="plan-section"><summary>每周固定安排</summary><div>${spec.weekly_template.map(d=>`<div style="margin-top:9px"><b>${escapeHTML(d.day||'')}</b><ul class="plan-list">${(d.tasks||[]).map(t=>`<li>${escapeHTML(typeof t==='string'?t:t.task||'')}${typeof t==='object'&&t.minutes?` · ${escapeHTML(t.minutes)}分钟`:''}</li>`).join('')}</ul></div>`).join('')}</div></details>`:''}${spec.review_rules?.length?`<details class="plan-section"><summary>复盘与调整规则</summary><ul class="plan-list">${spec.review_rules.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}${(spec.fallback_rules||[]).map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul></details>`:''}${planProgressAdvice(p)}<div class="plan-section"><div class="eyebrow">汇报进度</div><textarea class="checkin-area" data-plan-input="${p.id}" placeholder="例如：这周完成3次训练，周三加班没练，睡眠一般。"></textarea><button class="secondary-btn plan-review" data-id="${p.id}" style="width:100%;margin-top:8px">让 Jarvis 复盘并调整下一步</button><div class="status-line" data-plan-status="${p.id}"></div></div></article>`}).join('');$$('.plan-review').forEach(b=>b.onclick=()=>reviewPlan(b.dataset.id));$$('.plan-delete').forEach(b=>b.onclick=()=>deletePlan(b.dataset.id))}
async function createPlan(){const goal=$('#planGoal').value.trim();if(!goal)return;const btn=$('#createPlanBtn');btn.disabled=true;setStatus('#planCreateStatus','正在拆解里程碑、每周清单和复盘规则…');try{const d=await api('/api/plan',{profile:state.profile,goal,current:$('#planCurrent').value.trim(),constraints:$('#planConstraints').value.trim(),deadline:$('#planDeadline').value,time_budget:$('#planTime').value.trim(),pace:$('#planPace').value,metric:$('#planMetric').value.trim(),summaries:state.summaries.slice(-4)});const p={id:uid(),createdAt:nowISO(),updatedAt:nowISO(),status:'active',progress:0,goal,title:d.plan_title||goal,spec:d,lastReview:null};await savePlan(p);closeModal('planCreateModal');for(const id of ['#planGoal','#planCurrent','#planConstraints','#planDeadline','#planTime','#planMetric'])$(id).value='';renderAll()}catch(e){setStatus('#planCreateStatus',e.message,'error')}finally{btn.disabled=false}}
async function reviewPlan(id){const p=state.plans.find(x=>x.id===id),input=$(`[data-plan-input="${id}"]`),statusEl=`[data-plan-status="${id}"]`;if(!p||!input.value.trim())return;setStatus(statusEl,'进度汇报已保存，正在复盘…');const checkin=input.value.trim();const log=buildEntry(`[计划进度] ${p.title||p.goal}：${checkin}`,{},'note');log.tagIds=['plan'];await saveEntry(log);try{const d=await api('/api/progress',{profile:state.profile,plan:p,checkin,recent:serializeEntries(state.entries.slice(-25))});p.progress=d.progress_percent??p.progress;p.lastReview={...d,createdAt:nowISO()};p.status=d.plan_status||p.status;await savePlan(p);log.analysis={core:`计划「${p.title||p.goal}」的进度复盘`,observations:d.observations||[],judgment:d.summary||d.advice||'',actions:d.next_actions||[],plan_needed:true,plan_suggestion:(d.adjustments||[]).join('；'),uncertainties:[]};log.status='analyzed';log.brief=d.summary||'';await saveEntry(log);renderAll()}catch(e){setStatus(statusEl,e.message,'error')}}
async function deletePlan(id){if(!confirm('删除这个长期计划？相关历史记录不会删除。'))return;await dbDelete('plans',id);state.plans=state.plans.filter(p=>p.id!==id);renderAll()}

function renderSettings(){renderTagManager();fillProfile();renderSummaries()}
function renderTagManager(){const counts=tagCounts(state.entries);$('#tagManagerList').innerHTML=[...state.tags].sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0)).map(t=>`<div class="tag-manager-item"><div class="tag-manager-left"><span class="tag-color-dot" style="background:${t.color}"></span><div><div class="tag-manager-name">${escapeHTML(t.name)}</div><div class="tag-count">${counts[t.id]||0} 条记录${t.system?' · 系统标签':' · 自定义'}</div></div></div><div class="tag-manager-actions"><button class="tiny-btn rename-tag" data-id="${t.id}">改名</button>${!t.system?`<button class="tiny-btn delete-tag" data-id="${t.id}">删除</button>`:''}</div></div>`).join('');$$('.rename-tag').forEach(b=>b.onclick=()=>renameTag(b.dataset.id));$$('.delete-tag').forEach(b=>b.onclick=()=>deleteTag(b.dataset.id))}
function fillProfile(){const p=state.profile;const map={profileName:'name',profileAge:'age',profileSex:'sex',profileHeight:'height',profileWeight:'weight',profileJob:'job',profileSchedule:'schedule',profileGoals:'goals',profileValues:'values',profileNotes:'notes'};for(const [id,k] of Object.entries(map))$('#'+id).value=p[k]||''}
async function saveProfile(){const map={profileName:'name',profileAge:'age',profileSex:'sex',profileHeight:'height',profileWeight:'weight',profileJob:'job',profileSchedule:'schedule',profileGoals:'goals',profileValues:'values',profileNotes:'notes'},p={};for(const [id,k] of Object.entries(map))p[k]=$('#'+id).value.trim();state.profile=p;await metaSet('profile',p);setStatus('#profileStatus','长期档案已实时保存在手机本地。','success');renderDashboard();scheduleLocalSnapshot()}
function renderSummaries(){const el=$('#summaryList');el.innerHTML=state.summaries.length?[...state.summaries].sort((a,b)=>a.days-b.days).map(s=>`<div class="summary-item"><div class="summary-title">最近 ${s.days} 天 · ${new Date(s.updatedAt||Date.now()).toLocaleDateString()}</div><div class="summary-text">${escapeHTML(s.summary||'')}</div>${s.patterns?.length?`<div class="record-tags" style="margin-top:7px">${s.patterns.slice(0,4).map(x=>`<span class="metric-pill">${escapeHTML(x)}</span>`).join('')}</div>`:''}</div>`).join(''):'<div class="muted-copy">还没有阶段总结。</div>'}
async function updateSummary(days){const arr=state.entries.filter(e=>(Date.now()-new Date(e.createdAt))/86400000<=days);if(!arr.length){setStatus('#summaryStatus','这个时间范围还没有记录。');return}setStatus('#summaryStatus',`正在整理最近 ${days} 天的长期记忆…`);try{const d=await api('/api/summarize',{profile:state.profile,days,entries:serializeEntries(arr.slice(-350)),plans:activePlansForAI()});const s={days,updatedAt:nowISO(),...d};await dbPut('summaries',s);const i=state.summaries.findIndex(x=>x.days===days);if(i>=0)state.summaries[i]=s;else state.summaries.push(s);renderSummaries();setStatus('#summaryStatus','阶段总结已更新。','success')}catch(e){setStatus('#summaryStatus',e.message,'error')}}

async function exportData(){const data=await collectBackup();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`jarvis-v4-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);setStatus('#backupStatus','备份文件已生成。iPhone 可选择保存到“文件 → 我的 iPhone”。','success')}
async function collectBackup(){return{version:4,exportedAt:nowISO(),profile:state.profile,pending:state.pending,entries:state.entries,plans:state.plans,summaries:state.summaries,tags:state.tags,feedback:state.feedback}}
async function applyBackupData(d){if(!Array.isArray(d.entries))throw new Error('备份格式不正确');for(const s of ['entries','plans','summaries','tags','feedback'])await dbClear(s);for(const x of d.entries||[])await dbPut('entries',x);for(const x of d.plans||[])await dbPut('plans',x);for(const x of d.summaries||[])await dbPut('summaries',x);for(const x of d.tags?.length?d.tags:DEFAULT_TAGS)await dbPut('tags',x);for(const x of d.feedback||[])await dbPut('feedback',x);await metaSet('profile',d.profile||{});await metaSet('pending',d.pending||null);await loadState();renderAll()}
async function importData(file){const d=JSON.parse(await file.text());await applyBackupData(d);setStatus('#backupStatus','备份已导入。','success')}
async function createSnapshot(auto=false){const data=await collectBackup(),snap={id:uid(),createdAt:nowISO(),auto,data};await dbPut('snapshots',snap);let all=(await dbGetAll('snapshots')).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));for(const x of all.slice(10))await dbDelete('snapshots',x.id);await metaSet('last_snapshot_at',snap.createdAt);if(!auto)setStatus('#backupStatus','已在手机本地创建恢复点。','success')}
let snapshotTimer=null;function scheduleLocalSnapshot(){if(snapshotTimer)clearTimeout(snapshotTimer);snapshotTimer=setTimeout(async()=>{const last=await metaGet('last_snapshot_at',null);if(!last||Date.now()-new Date(last)>6*3600000)createSnapshot(true)},1200)}
async function restoreSnapshot(){const all=(await dbGetAll('snapshots')).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));if(!all.length){setStatus('#backupStatus','还没有本地恢复点。');return}const s=all[0];if(!confirm(`恢复到 ${new Date(s.createdAt).toLocaleString()} 的本地恢复点？当前数据会被替换。`))return;await applyBackupData(s.data);setStatus('#backupStatus','已恢复最近的本地恢复点。','success')}

function renderAll(){renderDashboard();renderRecords();renderPlans();renderInsights();renderSettings();renderComposerTagPickers()}

function bindEvents(){
 $$('[data-page]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));$$('[data-goto]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.goto)));$$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));$$('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));
 $('#quickAddTop').onclick=()=>{modalSelectedTagIds.clear();renderComposerTagPickers();openModal('recordModal')};$('#newRecordBtn').onclick=()=>{modalSelectedTagIds.clear();renderComposerTagPickers();openModal('recordModal')};
 $('#saveOnlyBtn').onclick=()=>saveOnly($('#quickText').value,manualMetrics());$('#analyzeBtn').onclick=()=>analyzeText($('#quickText').value,manualMetrics());
 $('#modalSaveOnly').onclick=()=>saveOnly($('#recordModalText').value,{},'modal');$('#modalAnalyze').onclick=()=>analyzeText($('#recordModalText').value,{},'modal');
 $('#quickNewTagBtn').onclick=()=>openCreateTag('quick');$('#modalNewTagBtn').onclick=()=>openCreateTag('modal');
 $('#submitPendingBtn').onclick=submitPending;$('#saveEntryTagsBtn').onclick=saveEditedTags;$('#newTagBtn').onclick=()=>openCreateTag('settings');$('#tagEditNewTagBtn').onclick=()=>openCreateTag('edit');$('#createTagBtn').onclick=createTag;
 $('#recordSearch').oninput=renderRecords;$('#recordRange').onchange=renderRecords;$('#recordStatus').onchange=renderRecords;
 $('#dashboardMetricSelect').onchange=renderDashboard;$('#insightMetricSelect').onchange=renderInsights;$('#insightRange').onchange=renderInsights;$('#aiInsightBtn').onclick=aiInsights;
 $('#openPlanCreateBtn').onclick=()=>openModal('planCreateModal');$('#createPlanBtn').onclick=createPlan;
 $('#saveProfileBtn').onclick=saveProfile;$('#exportBtn').onclick=exportData;$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{try{if(e.target.files[0])await importData(e.target.files[0])}catch(err){setStatus('#backupStatus',err.message,'error')}};$('#createSnapshotBtn').onclick=()=>createSnapshot(false);$('#restoreSnapshotBtn').onclick=restoreSnapshot;$$('.memory-summary-btn').forEach(b=>b.onclick=()=>updateSummary(Number(b.dataset.days)));
 window.addEventListener('resize',()=>{if(currentPage==='dashboard')renderDashboard();if(currentPage==='insights')renderInsights()});
}

async function init(){
 try{db=await openDB();await seedTags();state.tags=await dbGetAll('tags');await migrateV3IfNeeded();await loadState();bindEvents();renderAll();if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});scheduleLocalSnapshot()}catch(e){document.body.innerHTML=`<div style="padding:30px;color:white;font-family:system-ui"><h2>Jarvis 启动失败</h2><p>${escapeHTML(e.message)}</p></div>`}
}
init();
