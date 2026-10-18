// Jarvis v5.1 - follow-up history, topical chats and opt-in web search reading/editing + multimodal records, deeper insights, Ask Jarvis
const DB_NAME='jarvis_v4_db';
const DB_VERSION=4;
const STORES=['entries','plans','summaries','tags','feedback','meta','snapshots','spaces','conversations','topics','insightReports','actionExperiments'];
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const uid=()=>crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const nowISO=()=>new Date().toISOString();
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const escapeHTML=s=>String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));

let db;
let state={profile:{},entries:[],plans:[],summaries:[],tags:[],feedback:[],spaces:[],conversations:[],topics:[],insightReports:[],actionExperiments:[],pending:null};
let activeRecordTag='all';
let editingEntryId=null;
let currentPage='dashboard';
let quickSelectedTagIds=new Set();
let modalSelectedTagIds=new Set();
let tagCreateContext='settings';
let quickImage=null,modalImage=null,askImage=null;
let selectedSpaceId='general';
let selectedTopicId=null;
let webSearchAvailable=false;
let askBusy=false;

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
    if(s==='entries'||s==='plans'||s==='tags'||s==='feedback'||s==='snapshots'||s==='spaces'||s==='conversations'||s==='topics'||s==='insightReports'||s==='actionExperiments') d.createObjectStore(s,{keyPath:'id'});
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
 return ids.length?ids:(tagById('daily')?['daily']:[]);
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
 const seeded=await metaGet('tags_seeded',false);if(seeded)return;
 const tags=await dbGetAll('tags');
 if(!tags.length)for(const t of DEFAULT_TAGS)await dbPut('tags',t);
 await metaSet('tags_seeded',true);
}
async function seedSpaces(){
 const spaces=await dbGetAll('spaces');if(spaces.length)return;
 const base=[
  {id:'general',name:'全局问答',system:true,tagIds:[],description:'读取全部生活记录，适合综合问题。',createdAt:nowISO()},
  {id:'relationship',name:'关系专题',system:true,tagIds:['love','emotion'],description:'优先读取关系、情绪和相关事件，适合长期关系分析。',createdAt:nowISO()}
 ];
 for(const x of base)await dbPut('spaces',x);
}

async function loadState(){
 state.tags=await dbGetAll('tags');
 state.entries=(await dbGetAll('entries')).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
 state.plans=(await dbGetAll('plans')).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
 state.summaries=(await dbGetAll('summaries')).sort((a,b)=>a.days-b.days);
 state.feedback=(await dbGetAll('feedback')).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
 state.spaces=(await dbGetAll('spaces')).sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
 state.conversations=(await dbGetAll('conversations')).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
 state.topics=(await dbGetAll('topics')).sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));
 state.insightReports=(await dbGetAll('insightReports')).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
 state.actionExperiments=(await dbGetAll('actionExperiments')).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
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
function serializeEntries(arr){return arr.map(e=>({createdAt:e.createdAt,text:e.text,followups:(e.followups||[]).slice(-12).map(f=>({createdAt:f.time||f.createdAt,questions:(f.questions||[]).map(q=>q.question||q),answer:f.text||f.answer||''})),title:e.title,tags:(e.tagIds||[]).map(tagName),metrics:e.metrics||{},metric_meta:e.metricMeta||{},image_context:(e.attachments||[]).map(a=>a.vision?.summary||a.vision?.description).filter(Boolean),importance:e.importance,status:e.status,analysis:e.analysis?{core:e.analysis.core,judgment:e.analysis.judgment,actions:e.analysis.actions,psychology:e.analysis.psychology}:null}))}
async function api(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let d;try{d=await r.json()}catch{throw new Error(`服务器返回 ${r.status}`)}if(!r.ok)throw new Error(d.error||`请求失败 ${r.status}`);return d}
function tagCatalog(){return state.tags.map(t=>({name:t.name,system:!!t.system}))}
function feedbackExamples(){return state.feedback.slice(-30).map(f=>({text:f.text,before:f.before,after:f.after}))}
function activePlansForAI(){return state.plans.filter(p=>p.status!=='done').slice(-8).map(p=>({title:p.title||p.goal,goal:p.goal,progress:p.progress||0,status:p.status,spec:p.spec}))}

function buildEntry(text,metrics={},status='note',manualTagIds=[]){
 const chosen=[...new Set(manualTagIds||[])].filter(id=>tagById(id));
 const cm=cleanMetrics(metrics),meta={};for(const k of Object.keys(cm))meta[k]={source:'manual',confidence:1,reason:'用户手动填写'};
 return {id:uid(),createdAt:nowISO(),updatedAt:nowISO(),text:text.trim(),title:text.trim().slice(0,28)||'新记录',status,importance:'low',tagIds:chosen.length?chosen:localGuessTagIds(text),manualTagOverride:chosen.length>0,metrics:cm,metricMeta:meta,attachments:[],analysis:null,analysisRaw:'',followups:[]};
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
 quickSelectedTagIds.clear();clearImageState('dashboard');renderComposerTagPickers();
}
async function saveOnly(text,metrics={},source='dashboard'){
 const attachment=attachmentFor(source);if(!text.trim()&&!attachment)return;
 const selected=source==='modal'?[...modalSelectedTagIds]:[...quickSelectedTagIds];const actualText=text.trim()||attachment?.vision?.suggested_note||'[图片记录]';
 const e=buildEntry(actualText,metrics,'note',selected);if(attachment){e.attachments=[attachment];mergeVisionMetrics(e,attachment.vision)}await saveEntry(e);
 if(source==='modal'){closeModal('recordModal');$('#recordModalText').value='';modalSelectedTagIds.clear();clearImageState('modal');renderComposerTagPickers();setStatus('#recordModalStatus','已实时保存到手机本地。','success')}else{clearComposer();setStatus('#composerStatus','已实时保存到手机本地。','success')}renderAll();
}
async function analyzeText(text,metrics={},source='dashboard'){
 let attachment=attachmentFor(source);if(!text.trim()&&!attachment)return;const statusSel=source==='modal'?'#recordModalStatus':'#composerStatus';setStatus(statusSel,'已先保存到本地，正在检索相关历史并分析…');
 try{if(attachment&&!attachment.vision){await recognizeImage(source);attachment=attachmentFor(source)}}catch{}
 const selected=source==='modal'?[...modalSelectedTagIds]:[...quickSelectedTagIds];const actualText=text.trim()||attachment?.vision?.suggested_note||attachment?.vision?.summary||'[图片记录]';const entry=buildEntry(actualText,metrics,'processing',selected);if(attachment){entry.attachments=[attachment];mergeVisionMetrics(entry,attachment.vision)}await saveEntry(entry);
 try{const h=selectHistory(`${actualText} ${attachment?.vision?.summary||''}`,entry.id);const d=await api('/api/analyze',{profile:state.profile,summaries:state.summaries.slice(-8),active_plans:activePlansForAI(),pending:null,mode:h.mode,recent:serializeEntries(h.recent),relevant:serializeEntries(h.relevant),text:actualText,image_context:attachment?.vision||null,tag_catalog:tagCatalog(),tag_feedback:feedbackExamples()});entry.title=d.title||entry.title;if(!entry.manualTagOverride){const aiTags=tagIdsFromNames(d.tags||[]);entry.tagIds=aiTags.length?aiTags:localGuessTagIds(actualText)}mergeAIResultMetrics(entry,d);entry.importance=d.importance||entry.importance;
  if(d.need_clarification){entry.status='pending';await saveEntry(entry);await setPending({entryId:entry.id,questions:d.questions||[],createdAt:nowISO()});openPendingModal();setStatus(statusSel,'关键信息不足：已暂停判断，等待你补充。','success')}else{entry.status='analyzed';entry.brief=d.brief||'';entry.analysis=d.analysis||null;await saveEntry(entry);await setPending(null);openAnalysis(entry.id);setStatus(statusSel,'分析完成，并已保存到本地。','success')}
  if(source==='modal'){closeModal('recordModal');$('#recordModalText').value='';modalSelectedTagIds.clear();clearImageState('modal');renderComposerTagPickers()}else clearComposer();renderAll()
 }catch(err){entry.status='note';await saveEntry(entry);setStatus(statusSel,`分析失败，但记录已经保存在手机里：${err.message}`,'error');renderAll()}
}
async function submitPending(){
 const p=state.pending;if(!p)return;const reply=$('#pendingReply').value.trim();if(!reply)return;
 const entry=state.entries.find(e=>e.id===p.entryId);if(!entry){setStatus('#pendingStatus','找不到对应记录。','error');return}
 entry.followups=[...(entry.followups||[]),{time:nowISO(),questions:(p.questions||[]).map(q=>({question:q.question||q,reason:q.reason||''})),text:reply}];await saveEntry(entry);setStatus('#pendingStatus','补充内容已保存，正在继续分析…');
 const combined=`【原始问题】\n${entry.text}\n\n【历次追问与补充（按时间顺序，全部保留）】\n${(entry.followups||[]).map((f,n)=>`第${n+1}轮追问：${(f.questions||[]).map(q=>q.question||q).join('；')||'历史问题未保存'}\n用户回答：${f.text||f.answer||''}`).join('\n\n')}`;
 try{
  const h=selectHistory(combined,entry.id);const d=await api('/api/analyze',{profile:state.profile,summaries:state.summaries.slice(-8),active_plans:activePlansForAI(),pending:p.questions||[],mode:'deep',recent:serializeEntries(h.recent),relevant:serializeEntries(h.relevant),text:combined,followup:true,tag_catalog:tagCatalog(),tag_feedback:feedbackExamples()});
  entry.title=d.title||entry.title;
  if(!entry.manualTagOverride){const aiTags=tagIdsFromNames(d.tags||[]);if(aiTags.length)entry.tagIds=aiTags;}
  mergeAIResultMetrics(entry,d);entry.importance=d.importance||entry.importance;
  if(d.need_clarification){entry.status='pending';await saveEntry(entry);await setPending({entryId:entry.id,questions:d.questions||[],createdAt:nowISO()});$('#pendingReply').value='';renderPendingModal();setStatus('#pendingStatus','还缺少少量关键事实，新的问题已保存。')}
  else{entry.status='analyzed';entry.brief=d.brief||'';entry.analysis=d.analysis||null;await saveEntry(entry);await setPending(null);$('#pendingReply').value='';closeModal('pendingModal');openAnalysis(entry.id)}
  renderAll();
 }catch(err){setStatus('#pendingStatus',`分析失败，但你的补充已经保存在手机里：${err.message}`,'error')}
}

function setStatus(sel,text,type=''){const el=$(sel);if(!el)return;el.textContent=text;el.className=`status-line ${type==='error'?'error-text':type==='success'?'success-text':''}`}
function navigate(page){currentPage=page;$$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${page}`));$$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));window.scrollTo({top:0,behavior:'smooth'});if(page==='insights')renderInsights();if(page==='records')renderRecords();if(page==='settings')renderSettings();if(page==='plans')renderPlans();if(page==='ask')renderAsk()}
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
function metricPills(m={},meta={}){const map={mood:'心情',energy:'精力',stress:'压力',sleep_hours:'睡眠h',weight_kg:'体重kg',workout_minutes:'运动min',reading_minutes:'阅读min'};return Object.entries(m||{}).filter(([k,v])=>map[k]&&v!==null&&v!==undefined).map(([k,v])=>{const mm=meta?.[k];const mark=mm?.source==='ai'?'≈':'';const tip=mm?.source==='ai'?` title="AI估算 · 置信度 ${Math.round((mm.confidence||0)*100)}%${mm.reason?' · '+escapeHTML(mm.reason):''}"`:'';return `<span class="metric-pill ${mm?.source==='ai'?'metric-ai':''}"${tip}>${map[k]} ${mark}${escapeHTML(v)}${['mood','energy','stress'].includes(k)?'/10':''}</span>`}).join('')}
function analysisSummary(e){return e.brief||e.analysis?.judgment||e.analysisRaw||''}
function followupText(e){return (e.followups||[]).map(f=>f.text||f.answer||'').join(' ')}
function completeRecordText(e){return [`【原始记录】\n${e.text||''}`,...(e.followups||[]).map((f,i)=>`【第${i+1}次补充 · ${f.time?new Date(f.time).toLocaleString():''}】\n${(f.questions||[]).map(q=>`Jarvis：${q.question||q}`).join('\n')}${(f.questions||[]).length?'\n':''}我的回答：${f.text||f.answer||''}`)].join('\n\n')}
function isLongRecordText(text=''){return text.length>120||(text.match(/\n/g)||[]).length>=4}
function renderTimelineCard(e,full=false){
 const date=new Date(e.createdAt),longText=isLongRecordText(e.text);return `<article class="${full?'record-card':'timeline-card'}" data-entry-id="${e.id}">
 <div class="record-top"><div style="display:flex;gap:9px"><span class="importance-dot ${importanceClass(e.importance)}"></span><div><div class="record-title">${escapeHTML(e.title||e.text.slice(0,28))}</div><div class="record-time">${date.toLocaleString()}</div></div></div><span class="status-badge">${e.status==='pending'?'待补充':e.status==='analyzed'?'已分析':e.status==='processing'?'分析中':'记录'}</span></div>
 <div class="record-text ${full?'record-text-long':'record-text-short'}" id="record-text-${e.id}">${escapeHTML(e.text)}</div>${longText?`<button class="text-btn record-expand-btn" data-id="${e.id}" aria-expanded="false">展开全文 ↓</button>`:''}${e.attachments?.[0]?.dataUrl?`<img class="record-thumb" src="${e.attachments[0].dataUrl}" alt="记录图片">`:''}${(e.followups||[]).length?`<div class="record-followup-hint">💬 已保存 ${(e.followups||[]).length} 次补充回答 · 点击「查看全文」可逐条查看</div>`:''}<div class="record-tags">${renderTagChips(e.tagIds)}</div>${metricPills(e.metrics,e.metricMeta)?`<div class="metric-pills">${metricPills(e.metrics,e.metricMeta)}</div>`:''}
 ${analysisSummary(e)?`<div class="analysis-preview">${escapeHTML(analysisSummary(e)).slice(0,220)}${analysisSummary(e).length>220?'…':''}</div>`:''}
 ${full?`<div class="record-actions"><button class="ghost-btn view-record-detail" data-id="${e.id}">查看全文</button>${e.status==='analyzed'?`<button class="ghost-btn view-analysis" data-id="${e.id}">查看分析</button>`:''}<button class="ghost-btn edit-tags" data-id="${e.id}">编辑标签</button>${e.status==='pending'?`<button class="ghost-btn continue-pending" data-id="${e.id}">继续回答</button>`:''}<button class="ghost-btn delete-entry" data-id="${e.id}">删除</button></div>`:`<div class="record-actions"><button class="ghost-btn view-record-detail" data-id="${e.id}">查看全文</button><button class="ghost-btn edit-tags" data-id="${e.id}">改标签</button>${e.status==='analyzed'?`<button class="ghost-btn view-analysis" data-id="${e.id}">看分析</button>`:''}</div>`}
 </article>`
}
function bindRecordActions(root=document){
 root.querySelectorAll('.record-expand-btn').forEach(b=>b.onclick=()=>{const text=document.getElementById(`record-text-${b.dataset.id}`);if(!text)return;const expanded=text.classList.toggle('expanded');b.textContent=expanded?'收起全文 ↑':'展开全文 ↓';b.setAttribute('aria-expanded',expanded?'true':'false')});
 root.querySelectorAll('.view-record-detail').forEach(b=>b.onclick=()=>openRecordDetail(b.dataset.id));
 root.querySelectorAll('.view-analysis').forEach(b=>b.onclick=()=>openAnalysis(b.dataset.id));root.querySelectorAll('.edit-tags').forEach(b=>b.onclick=()=>openTagEditor(b.dataset.id));root.querySelectorAll('.continue-pending').forEach(b=>b.onclick=()=>openPendingModal());root.querySelectorAll('.delete-entry').forEach(b=>b.onclick=()=>deleteEntry(b.dataset.id));
}

function renderAnalysisHTML(e){
 const a=e.analysis||parseLegacyAnalysis(e.analysisRaw)||{};const list=(arr,ordered=false)=>Array.isArray(arr)&&arr.length?`<${ordered?'ol':'ul'}>${arr.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</${ordered?'ol':'ul'}>`:'<p class="muted-copy">暂无</p>';
 return `<div class="eyebrow">${renderTagChips(e.tagIds)}</div><h2 class="analysis-title">${escapeHTML(e.title||'分析')}</h2>${e.brief?`<div class="analysis-brief">${escapeHTML(e.brief)}</div>`:''}
 <div class="analysis-section"><h3>问题核心</h3><p>${escapeHTML(a.core||'—')}</p></div>
 <div class="analysis-section"><h3>关键观察</h3>${list(a.observations)}</div>
 <div class="analysis-section analysis-judgment"><h3>Jarvis 的判断</h3><p>${escapeHTML(a.judgment||'—')}</p></div>${a.psychology?`<div class="analysis-section psychology-section"><h3>心理学 / 行为科学视角</h3><p>${escapeHTML(a.psychology)}</p></div>`:''}
 <div class="analysis-section analysis-actions"><h3>你现在怎么做</h3>${list(a.actions,true)}</div>
 ${a.plan_suggestion?`<div class="analysis-section"><h3>长期计划</h3><p>${escapeHTML(a.plan_suggestion)}</p></div>`:''}
 <div class="analysis-section analysis-uncertainty"><h3>仍有的不确定点</h3>${list(a.uncertainties)}</div>
 <div class="record-actions"><button class="ghost-btn view-record-detail" data-id="${e.id}">查看原文与补充回答${(e.followups||[]).length?`（${e.followups.length}次）`:''}</button><button class="ghost-btn edit-tags" data-id="${e.id}">编辑标签</button></div>`;
}
function openAnalysis(id){const e=state.entries.find(x=>x.id===id);if(!e)return;$('#analysisModalBody').innerHTML=renderAnalysisHTML(e);bindRecordActions($('#analysisModalBody'));openModal('analysisModal')}

function renderRecordDetail(e){
 const date=new Date(e.createdAt);
 const replies=(e.followups||[]);
 const history=replies.length?`<section class="record-followups"><div class="record-followup-heading">补充回答 · 共 ${replies.length} 次</div>${replies.map((f,i)=>`<article class="record-followup-item"><div class="record-followup-time">第 ${i+1} 次补充 ${f.time?`· ${escapeHTML(new Date(f.time).toLocaleString())}`:''}</div>${(f.questions||[]).length?`<div class="record-followup-questions">${(f.questions||[]).map(q=>`<p><strong>Jarvis 追问：</strong>${escapeHTML(q.question||q)}</p>`).join('')}</div>`:''}<div class="record-followup-answer">${escapeHTML(f.text||f.answer||'')}</div></article>`).join('')}</section>`:'<div class="muted-copy record-followup-empty">还没有补充回答。</div>';
 return `<div class="eyebrow">原始记录 · 完整时间线</div><h2 class="analysis-title">${escapeHTML(e.title||'记录详情')}</h2><div class="record-detail-meta">${date.toLocaleString()}${e.updatedAt&&e.updatedAt!==e.createdAt?` · 最近编辑 ${new Date(e.updatedAt).toLocaleString()}`:''}</div><div class="record-detail-original" id="recordDetailOriginal">${escapeHTML(e.text)}</div>${history}${e.attachments?.length?`<div class="record-detail-images">${e.attachments.filter(a=>a.dataUrl).map(a=>`<img class="record-detail-image" src="${a.dataUrl}" alt="记录图片">`).join('')}</div>`:''}<div class="record-tags">${renderTagChips(e.tagIds)}</div>${metricPills(e.metrics,e.metricMeta)?`<div class="metric-pills">${metricPills(e.metrics,e.metricMeta)}</div>`:''}${e.analysisStale?`<div class="record-edit-warning">原文在 AI 分析之后被修改过，现有分析可能基于旧内容。</div>`:''}<div class="record-actions"><button class="primary-btn small-btn edit-record-text" data-id="${e.id}">编辑原文</button>${e.status==='analyzed'?`<button class="secondary-btn small-btn view-analysis" data-id="${e.id}">查看 AI 分析</button>`:''}<button class="secondary-btn small-btn copy-record-text" data-id="${e.id}">复制全部内容</button>${e.status==='pending'?`<button class="secondary-btn small-btn continue-pending" data-id="${e.id}">继续补充</button>`:''}</div>`;
}
function openRecordDetail(id){const e=state.entries.find(x=>x.id===id);if(!e)return;$('#recordDetailModalBody').innerHTML=renderRecordDetail(e);bindRecordDetailActions();openModal('recordDetailModal')}
function bindRecordDetailActions(){const root=$('#recordDetailModalBody');if(!root)return;root.querySelectorAll('.view-analysis').forEach(b=>b.onclick=()=>{closeModal('recordDetailModal');openAnalysis(b.dataset.id)});root.querySelectorAll('.copy-record-text').forEach(b=>b.onclick=async()=>{const e=state.entries.find(x=>x.id===b.dataset.id);if(!e)return;try{await navigator.clipboard.writeText(completeRecordText(e));b.textContent='已复制 ✓';setTimeout(()=>b.textContent='复制全部内容',1200)}catch{alert('复制失败，请长按原文手动复制。')}});root.querySelectorAll('.edit-record-text').forEach(b=>b.onclick=()=>startRecordTextEdit(b.dataset.id));root.querySelectorAll('.continue-pending').forEach(b=>b.onclick=()=>{closeModal('recordDetailModal');openPendingModal()})}
function startRecordTextEdit(id){const e=state.entries.find(x=>x.id===id);if(!e)return;$('#recordDetailModalBody').innerHTML=`<div class="eyebrow">编辑原始记录</div><h2 class="analysis-title">修改原文</h2><p class="muted-copy">这里保存的是你最初输入的完整内容。修改后不会自动覆盖已有 AI 分析。</p><textarea id="recordDetailEditText" class="tall record-edit-textarea">${escapeHTML(e.text)}</textarea><div class="modal-actions"><button class="secondary-btn cancel-record-edit" type="button">取消</button><button class="primary-btn save-record-edit" data-id="${e.id}" type="button">保存修改</button></div><div class="status-line" id="recordDetailEditStatus"></div>`;$('#recordDetailModalBody .cancel-record-edit').onclick=()=>openRecordDetail(id);$('#recordDetailModalBody .save-record-edit').onclick=()=>saveRecordTextEdit(id)}
async function saveRecordTextEdit(id){const e=state.entries.find(x=>x.id===id);if(!e)return;const text=$('#recordDetailEditText')?.value.trim()||'';if(!text){setStatus('#recordDetailEditStatus','原始记录不能为空。','error');return}if(text===e.text){openRecordDetail(id);return}e.text=text;e.analysisStale=Boolean(e.analysis||e.analysisRaw);await saveEntry(e);renderAll();openRecordDetail(id)}

async function deleteEntry(id){if(!confirm('删除这条记录？这个操作会从手机本地数据库中删除。'))return;await dbDelete('entries',id);state.entries=state.entries.filter(e=>e.id!==id);if(state.pending?.entryId===id)await setPending(null);renderAll();}

function openTagEditor(id){editingEntryId=id;tagCreateContext='edit';const e=state.entries.find(x=>x.id===id);if(!e)return;$('#tagEditChoices').innerHTML=state.tags.map(t=>`<label class="tag-choice"><input type="checkbox" value="${t.id}" ${(e.tagIds||[]).includes(t.id)?'checked':''}><span style="border-color:${t.color}44">${escapeHTML(t.name)}</span></label>`).join('');openModal('tagEditModal')}
async function saveEditedTags(){
 const e=state.entries.find(x=>x.id===editingEntryId);if(!e)return;const before=(e.tagIds||[]).map(tagName);const selected=$$('#tagEditChoices input:checked').map(x=>x.value);e.tagIds=selected;e.manualTagOverride=true;await saveEntry(e);const after=e.tagIds.map(tagName);if(JSON.stringify(before)!==JSON.stringify(after)){const f={id:uid(),createdAt:nowISO(),entryId:e.id,text:e.text,before,after};await dbPut('feedback',f);state.feedback.push(f)}closeModal('tagEditModal');renderAll();}
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
async function deleteTag(id){const t=tagById(id);if(!t)return;const msg=t.system?`删除内置标签“${t.name}”？现有记录不会删除，但该标签会从分类系统中移除。`:`删除标签“${t.name}”？现有记录不会删除。`;if(!confirm(msg))return;await dbDelete('tags',id);state.tags=state.tags.filter(x=>x.id!==id);for(const e of state.entries){if((e.tagIds||[]).includes(id)){e.tagIds=e.tagIds.filter(x=>x!==id);await dbPut('entries',e)}}for(const sp of state.spaces||[]){if((sp.tagIds||[]).includes(id)){sp.tagIds=sp.tagIds.filter(x=>x!==id);await dbPut('spaces',sp)}}if(activeRecordTag===id)activeRecordTag='all';renderAll()}

function filteredEntries(){
 let arr=[...state.entries].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));const q=$('#recordSearch')?.value.trim().toLowerCase()||'',range=$('#recordRange')?.value||'all',status=$('#recordStatus')?.value||'all';
 if(range!=='all'){const d=Number(range);arr=arr.filter(e=>(Date.now()-new Date(e.createdAt))/86400000<=d)}if(status!=='all')arr=arr.filter(e=>status==='analyzed'?e.status==='analyzed':status==='pending'?e.status==='pending':e.status==='note');if(activeRecordTag!=='all')arr=arr.filter(e=>(e.tagIds||[]).includes(activeRecordTag));if(q)arr=arr.filter(e=>`${e.text} ${followupText(e)} ${e.title} ${analysisSummary(e)} ${(e.tagIds||[]).map(tagName).join(' ')}`.toLowerCase().includes(q));return arr;
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
function renderInsights(){const arr=insightEntries();$('#insightRecords').textContent=arr.length;const mood=averageMetric(arr,'mood'),energy=averageMetric(arr,'energy'),stress=averageMetric(arr,'stress'),sleep=averageMetric(arr,'sleep_hours');$('#insightMood').textContent=mood===null?'—':mood.toFixed(1);$('#insightEnergy').textContent=energy===null?'—':energy.toFixed(1);$('#insightStress').textContent=stress===null?'—':stress.toFixed(1);$('#insightSleep').textContent=sleep===null?'—':`${sleep.toFixed(1)}h`;const c=tagCounts(arr),top=Object.entries(c).sort((a,b)=>b[1]-a[1])[0];$('#insightTopTag').textContent=top?tagName(top[0]):'—';renderTrend('#insightTrendCanvas','#insightTrendEmpty',$('#insightMetricSelect').value,arr);renderTagBars('#insightTagBars',arr);renderInsightFocusOptions(tagCounts(insightAllInRange($('#insightIncludeSensitive').checked)));renderInsightScanPreview();renderInsightHistory();renderInsightExperiments()}
function planProgressAdvice(p){const a=p.lastReview;if(!a)return'';return `<div class="plan-section"><div class="eyebrow">最近复盘 · ${escapeHTML(a.status||'')}</div><div class="muted-copy" style="margin-top:6px">${escapeHTML(a.summary||a.advice||'')}</div>${a.next_actions?.length?`<ul class="plan-list">${a.next_actions.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul>`:''}</div>`}
function renderPlans(){const list=$('#planList'),arr=[...state.plans].sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));$('#planEmpty').classList.toggle('hidden',arr.length>0);list.innerHTML=arr.map(p=>{const spec=p.spec||{};return `<article class="plan-card" data-plan-id="${p.id}"><div class="card-head"><div><h3>${escapeHTML(p.title||p.goal)}</h3><div class="plan-meta"><span>${escapeHTML(p.status||'active')}</span><span>${spec.duration_weeks?`${spec.duration_weeks} 周`:''}</span><span>进度 ${Math.round(p.progress||0)}%</span></div></div><button class="ghost-btn plan-delete" data-id="${p.id}">删除</button></div><div class="progress-track"><div class="progress-fill" style="width:${clamp(p.progress||0,0,100)}%"></div></div>${spec.success_metrics?.length?`<div class="plan-section"><div class="eyebrow">成功标准</div><ul class="plan-list">${spec.success_metrics.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul></div>`:''}${spec.milestones?.length?`<details class="plan-section"><summary>查看阶段里程碑</summary><div>${spec.milestones.map(m=>`<div style="margin-top:10px"><b>${escapeHTML(m.period||'')}</b> · ${escapeHTML(m.objective||'')}<ul class="plan-list">${(m.checklist||[]).map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul></div>`).join('')}</div></details>`:''}${spec.first_7_days?.length?`<details class="plan-section" open><summary>前7天行动清单</summary><div>${spec.first_7_days.map(d=>`<div style="margin-top:9px"><b>${escapeHTML(d.day||'')}</b><ul class="plan-list">${(d.tasks||[]).map(t=>`<li>${escapeHTML(typeof t==='string'?t:t.task||'')}${typeof t==='object'&&t.minutes?` · ${escapeHTML(t.minutes)}分钟`:''}</li>`).join('')}</ul></div>`).join('')}</div></details>`:''}${spec.weekly_template?.length?`<details class="plan-section"><summary>每周固定安排</summary><div>${spec.weekly_template.map(d=>`<div style="margin-top:9px"><b>${escapeHTML(d.day||'')}</b><ul class="plan-list">${(d.tasks||[]).map(t=>`<li>${escapeHTML(typeof t==='string'?t:t.task||'')}${typeof t==='object'&&t.minutes?` · ${escapeHTML(t.minutes)}分钟`:''}</li>`).join('')}</ul></div>`).join('')}</div></details>`:''}${spec.review_rules?.length?`<details class="plan-section"><summary>复盘与调整规则</summary><ul class="plan-list">${spec.review_rules.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}${(spec.fallback_rules||[]).map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul></details>`:''}${planProgressAdvice(p)}<div class="plan-section"><div class="eyebrow">汇报进度</div><textarea class="checkin-area" data-plan-input="${p.id}" placeholder="例如：这周完成3次训练，周三加班没练，睡眠一般。"></textarea><button class="secondary-btn plan-review" data-id="${p.id}" style="width:100%;margin-top:8px">让 Jarvis 复盘并调整下一步</button><div class="status-line" data-plan-status="${p.id}"></div></div></article>`}).join('');$$('.plan-review').forEach(b=>b.onclick=()=>reviewPlan(b.dataset.id));$$('.plan-delete').forEach(b=>b.onclick=()=>deletePlan(b.dataset.id))}
async function createPlan(){const goal=$('#planGoal').value.trim();if(!goal)return;const btn=$('#createPlanBtn');btn.disabled=true;setStatus('#planCreateStatus','正在拆解里程碑、每周清单和复盘规则…');try{const d=await api('/api/plan',{profile:state.profile,goal,current:$('#planCurrent').value.trim(),constraints:$('#planConstraints').value.trim(),deadline:$('#planDeadline').value,time_budget:$('#planTime').value.trim(),pace:$('#planPace').value,metric:$('#planMetric').value.trim(),summaries:state.summaries.slice(-4)});const p={id:uid(),createdAt:nowISO(),updatedAt:nowISO(),status:'active',progress:0,goal,title:d.plan_title||goal,spec:d,lastReview:null};await savePlan(p);closeModal('planCreateModal');for(const id of ['#planGoal','#planCurrent','#planConstraints','#planDeadline','#planTime','#planMetric'])$(id).value='';renderAll()}catch(e){setStatus('#planCreateStatus',e.message,'error')}finally{btn.disabled=false}}
async function reviewPlan(id){const p=state.plans.find(x=>x.id===id),input=$(`[data-plan-input="${id}"]`),statusEl=`[data-plan-status="${id}"]`;if(!p||!input.value.trim())return;setStatus(statusEl,'进度汇报已保存，正在复盘…');const checkin=input.value.trim();const log=buildEntry(`[计划进度] ${p.title||p.goal}：${checkin}`,{},'note');log.tagIds=['plan'];await saveEntry(log);try{const d=await api('/api/progress',{profile:state.profile,plan:p,checkin,recent:serializeEntries(state.entries.slice(-25))});p.progress=d.progress_percent??p.progress;p.lastReview={...d,createdAt:nowISO()};p.status=d.plan_status||p.status;await savePlan(p);log.analysis={core:`计划「${p.title||p.goal}」的进度复盘`,observations:d.observations||[],judgment:d.summary||d.advice||'',actions:d.next_actions||[],plan_needed:true,plan_suggestion:(d.adjustments||[]).join('；'),uncertainties:[]};log.status='analyzed';log.brief=d.summary||'';await saveEntry(log);renderAll()}catch(e){setStatus(statusEl,e.message,'error')}}
async function deletePlan(id){if(!confirm('删除这个长期计划？相关历史记录不会删除。'))return;await dbDelete('plans',id);state.plans=state.plans.filter(p=>p.id!==id);renderAll()}

function renderSettings(){renderTagManager();fillProfile();renderSummaries()}
function renderTagManager(){const counts=tagCounts(state.entries);$('#tagManagerList').innerHTML=[...state.tags].sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0)).map(t=>`<div class="tag-manager-item"><div class="tag-manager-left"><span class="tag-color-dot" style="background:${t.color}"></span><div><div class="tag-manager-name">${escapeHTML(t.name)}</div><div class="tag-count">${counts[t.id]||0} 条记录${t.system?' · 系统标签':' · 自定义'}</div></div></div><div class="tag-manager-actions"><button class="tiny-btn rename-tag" data-id="${t.id}">改名</button><button class="tiny-btn delete-tag" data-id="${t.id}">删除</button></div></div>`).join('');$$('.rename-tag').forEach(b=>b.onclick=()=>renameTag(b.dataset.id));$$('.delete-tag').forEach(b=>b.onclick=()=>deleteTag(b.dataset.id))}
function fillProfile(){const p=state.profile;const map={profileName:'name',profileAge:'age',profileSex:'sex',profileHeight:'height',profileWeight:'weight',profileJob:'job',profileSchedule:'schedule',profileGoals:'goals',profileValues:'values',profileNotes:'notes'};for(const [id,k] of Object.entries(map))$('#'+id).value=p[k]||''}
async function saveProfile(){const map={profileName:'name',profileAge:'age',profileSex:'sex',profileHeight:'height',profileWeight:'weight',profileJob:'job',profileSchedule:'schedule',profileGoals:'goals',profileValues:'values',profileNotes:'notes'},p={};for(const [id,k] of Object.entries(map))p[k]=$('#'+id).value.trim();state.profile=p;await metaSet('profile',p);setStatus('#profileStatus','长期档案已实时保存在手机本地。','success');renderDashboard();scheduleLocalSnapshot()}
function renderSummaries(){const el=$('#summaryList');el.innerHTML=state.summaries.length?[...state.summaries].sort((a,b)=>a.days-b.days).map(s=>`<div class="summary-item"><div class="summary-title">最近 ${s.days} 天 · ${new Date(s.updatedAt||Date.now()).toLocaleDateString()}</div><div class="summary-text">${escapeHTML(s.summary||'')}</div>${s.patterns?.length?`<div class="record-tags" style="margin-top:7px">${s.patterns.slice(0,4).map(x=>`<span class="metric-pill">${escapeHTML(x)}</span>`).join('')}</div>`:''}</div>`).join(''):'<div class="muted-copy">还没有阶段总结。</div>'}
async function updateSummary(days){const arr=state.entries.filter(e=>(Date.now()-new Date(e.createdAt))/86400000<=days);if(!arr.length){setStatus('#summaryStatus','这个时间范围还没有记录。');return}setStatus('#summaryStatus',`正在整理最近 ${days} 天的长期记忆…`);try{const d=await api('/api/summarize',{profile:state.profile,days,entries:serializeEntries(arr.slice(-350)),plans:activePlansForAI()});const s={days,updatedAt:nowISO(),...d};await dbPut('summaries',s);const i=state.summaries.findIndex(x=>x.days===days);if(i>=0)state.summaries[i]=s;else state.summaries.push(s);renderSummaries();setStatus('#summaryStatus','阶段总结已更新。','success')}catch(e){setStatus('#summaryStatus',e.message,'error')}}

async function exportData(){const data=await collectBackup();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`jarvis-v5-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);setStatus('#backupStatus','备份文件已生成。iPhone 可选择保存到“文件 → 我的 iPhone”。','success')}
async function collectBackup(){return{version:'5.1.0',exportedAt:nowISO(),profile:state.profile,pending:state.pending,entries:state.entries,plans:state.plans,summaries:state.summaries,tags:state.tags,feedback:state.feedback,spaces:state.spaces,conversations:state.conversations,topics:state.topics,insightReports:state.insightReports,actionExperiments:state.actionExperiments}}
async function applyBackupData(d){if(!Array.isArray(d.entries))throw new Error('备份格式不正确');for(const s of ['entries','plans','summaries','tags','feedback','spaces','conversations','topics','insightReports','actionExperiments'])await dbClear(s);for(const x of d.entries||[])await dbPut('entries',x);for(const x of d.plans||[])await dbPut('plans',x);for(const x of d.summaries||[])await dbPut('summaries',x);for(const x of d.tags?.length?d.tags:DEFAULT_TAGS)await dbPut('tags',x);for(const x of d.feedback||[])await dbPut('feedback',x);for(const x of d.spaces||[])await dbPut('spaces',x);for(const x of d.conversations||[])await dbPut('conversations',x);for(const x of d.topics||[])await dbPut('topics',x);for(const x of d.insightReports||[])await dbPut('insightReports',x);for(const x of d.actionExperiments||[])await dbPut('actionExperiments',x);if(!(d.spaces||[]).length)await seedSpaces();await metaSet('profile',d.profile||{});await metaSet('pending',d.pending||null);await loadState();await migrateLegacyTopics();selectedTopicId=null;renderAll()}
async function importData(file){const d=JSON.parse(await file.text());await applyBackupData(d);setStatus('#backupStatus','备份已导入。','success')}
async function createSnapshot(auto=false){const data=await collectBackup(),snap={id:uid(),createdAt:nowISO(),auto,data};await dbPut('snapshots',snap);let all=(await dbGetAll('snapshots')).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));for(const x of all.slice(10))await dbDelete('snapshots',x.id);await metaSet('last_snapshot_at',snap.createdAt);if(!auto)setStatus('#backupStatus','已在手机本地创建恢复点。','success')}
let snapshotTimer=null;function scheduleLocalSnapshot(){if(snapshotTimer)clearTimeout(snapshotTimer);snapshotTimer=setTimeout(async()=>{const last=await metaGet('last_snapshot_at',null);if(!last||Date.now()-new Date(last)>6*3600000)createSnapshot(true)},1200)}
async function restoreSnapshot(){const all=(await dbGetAll('snapshots')).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));if(!all.length){setStatus('#backupStatus','还没有本地恢复点。');return}const s=all[0];if(!confirm(`恢复到 ${new Date(s.createdAt).toLocaleString()} 的本地恢复点？当前数据会被替换。`))return;await applyBackupData(s.data);setStatus('#backupStatus','已恢复最近的本地恢复点。','success')}

// ----- v5 multimodal / metrics / deep insights / Ask Jarvis -----
function imageStateFor(source){return source==='modal'?modalImage:source==='ask'?askImage:quickImage}
function setImageState(source,value){if(source==='modal')modalImage=value;else if(source==='ask')askImage=value;else quickImage=value;renderImagePreview(source)}
function clearImageState(source){setImageState(source,null)}
function imageEls(source){if(source==='modal')return{input:'#modalImageInput',preview:'#modalImagePreview',recognize:'#modalRecognizeBtn',text:'#recordModalText'};if(source==='ask')return{input:'#askImageInput',preview:'#askImagePreview',recognize:null,text:'#askText'};return{input:'#quickImageInput',preview:'#quickImagePreview',recognize:'#quickRecognizeBtn',text:'#quickText'}}
function renderImagePreview(source){const st=imageStateFor(source),els=imageEls(source),box=$(els.preview);if(!box)return;if(!st){box.classList.add('hidden');box.innerHTML='';if(els.recognize)$(els.recognize)?.classList.add('hidden');return}box.classList.remove('hidden');box.innerHTML=`<img src="${st.dataUrl}" alt="待分析图片"><div class="image-preview-meta"><b>${escapeHTML(st.name||'图片')}</b><span>${st.vision?'已识别':'等待识别'}</span><button type="button" class="tiny-btn remove-image">移除</button></div>${st.vision?`<div class="vision-note">${escapeHTML(st.vision.summary||st.vision.description||'已完成识别')}</div>`:''}`;box.querySelector('.remove-image').onclick=()=>clearImageState(source);if(els.recognize)$(els.recognize)?.classList.remove('hidden')}
async function compressImage(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{try{const max=1280,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);const dataUrl=c.toDataURL('image/jpeg',.78);URL.revokeObjectURL(url);resolve({dataUrl,name:file.name||'image.jpg',width:w,height:h})}catch(e){reject(e)}};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('图片读取失败'))};img.src=url})}
async function chooseImage(source,file){if(!file)return;try{const x=await compressImage(file);setImageState(source,{...x,vision:null})}catch(e){alert(e.message)}}
async function recognizeImage(source){const st=imageStateFor(source);if(!st)return null;const statusSel=source==='modal'?'#recordModalStatus':source==='ask'?'#askStatus':'#composerStatus';setStatus(statusSel,'正在识别图片内容…');try{const d=await api('/api/vision',{image:st.dataUrl,tag_catalog:tagCatalog(),profile:state.profile});st.vision=d;setImageState(source,st);if(source!=='ask'&&d.suggested_note){const el=$(imageEls(source).text);if(el&&!el.value.trim())el.value=d.suggested_note}setStatus(statusSel,'图片识别完成。','success');return d}catch(e){setStatus(statusSel,`识图失败：${e.message}`,'error');throw e}}
function attachmentFor(source){const st=imageStateFor(source);return st?{kind:'image',name:st.name,dataUrl:st.dataUrl,vision:st.vision||null}:null}
function mergeAIResultMetrics(entry,d){entry.metricMeta=entry.metricMeta||{};entry.metrics=entry.metrics||{};for(const [k,v] of Object.entries(cleanMetrics(d.metrics||{}))){if(['manual','vision'].includes(entry.metricMeta?.[k]?.source))continue;entry.metrics[k]=v;entry.metricMeta[k]={source:'ai',confidence:Number(d.metric_meta?.[k]?.confidence||0.6),reason:d.metric_meta?.[k]?.reason||'根据记录内容估算'}}}
function mergeVisionMetrics(entry,vision){if(!vision)return;entry.metricMeta=entry.metricMeta||{};entry.metrics=entry.metrics||{};for(const [k,v] of Object.entries(cleanMetrics(vision.metrics||{}))){if(entry.metricMeta?.[k]?.source==='manual')continue;entry.metrics[k]=v;entry.metricMeta[k]={source:'vision',confidence:0.95,reason:'从图片中明确识别出的数值'}}if(!entry.manualTagOverride){const ids=tagIdsFromNames(vision.tags||[]);if(ids.length)entry.tagIds=ids}}
function metricCoverage(entries){const keys=['mood','energy','stress','sleep_hours','weight_kg','workout_minutes','reading_minutes'],o={};for(const k of keys)o[k]={count:entries.filter(e=>e.metrics?.[k]!==undefined&&e.metrics?.[k]!==null).length,total:entries.length};return o}
function tagCooccurrence(entries){const c={};for(const e of entries){const ids=[...new Set(e.tagIds||[])];for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const a=tagName(ids[i]),b=tagName(ids[j]),k=[a,b].sort().join(' + ');c[k]=(c[k]||0)+1}}return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([pair,count])=>({pair,count}))}

// ----- v5.1 comprehensive insight engine -----
const INSIGHT_METRICS=['mood','energy','stress','sleep_hours','weight_kg','workout_minutes','reading_minutes'];
const INSIGHT_METRIC_NAMES={mood:'心情',energy:'精力',stress:'压力',sleep_hours:'睡眠',weight_kg:'体重',workout_minutes:'运动',reading_minutes:'阅读'};
const INSIGHT_DOMAINS={relationship:['love','social','family'],sleep:['sleep'],diet:['diet'],mood:['emotion'],study:['study','reading'],work:['work'],fitness:['fitness'],health:['health'],finance:['finance'],goals:['plan','decision']};
const INSIGHT_DOMAIN_NAMES={relationship:'人际与关系',sleep:'睡眠',diet:'饮食',mood:'情绪压力',study:'学习阅读',work:'工作',fitness:'运动',health:'健康',finance:'财务',goals:'目标决策',other:'其他'};
let displayedInsightReportId=null;
function insightMode(){return document.querySelector('input[name="insightMode"]:checked')?.value||'comprehensive'}
function insightTagAllowed(e,includeSensitive){return includeSensitive||!(e.tagIds||[]).includes('love')}
function insightAllInRange(includeSensitive=false){const days=$('#insightRange')?.value||'30';return state.entries.filter(e=>insightTagAllowed(e,includeSensitive)&&(days==='all'||(Date.now()-new Date(e.createdAt).getTime())/86400000<=Number(days)))}
function insightEntryDomains(e){const ids=e.tagIds||[],result=[];for(const [domain,tags] of Object.entries(INSIGHT_DOMAINS)){if(tags.some(t=>ids.includes(t)))result.push(domain)}return result.length?result:['other']}
function validNumber(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function insightMetricData(entries){const result={};for(const key of INSIGHT_METRICS){const values=entries.filter(e=>validNumber(e.metrics?.[key]));const v=values.map(e=>Number(e.metrics[key]));const bySource={};for(const e of values){const s=e.metricMeta?.[key]?.source||'unspecified';bySource[s]=(bySource[s]||0)+1}result[key]={count:values.length,days:new Set(values.map(e=>dateKey(e.createdAt))).size,total:entries.length,sourceCounts:bySource,average:v.length?Math.round(v.reduce((x,y)=>x+y,0)/v.length*10)/10:null,series:aggregateMetric(entries,key).slice(-110)}}return result}
function insightDomainSummary(entries){const groups={};for(const domain of Object.keys(INSIGHT_DOMAIN_NAMES))groups[domain]={name:INSIGHT_DOMAIN_NAMES[domain],records:0,important:0};for(const e of entries){for(const domain of insightEntryDomains(e)){groups[domain].records++;if(e.importance==='high')groups[domain].important++}}return groups}
function insightCrossLinks(entries){const pairs=new Map();for(const e of entries){const ds=insightEntryDomains(e).filter(d=>d!=='other');for(let i=0;i<ds.length;i++)for(let j=i+1;j<ds.length;j++){const key=[ds[i],ds[j]].sort().join('|'),o=pairs.get(key)||{domains:key.split('|'),count:0,evidenceIds:[]};o.count++;if(o.evidenceIds.length<5)o.evidenceIds.push(e.id);pairs.set(key,o)}}return [...pairs.values()].sort((a,b)=>b.count-a.count).slice(0,12)}
function insightNearbyLinks(entries){
 // 计算相邻两天内不同领域的时间接近次数；这是线索，不是因果证明。
 const ordered=[...entries].sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)),links=new Map();
 for(let i=0;i<ordered.length;i++){
  const a=ordered[i],domainA=insightEntryDomains(a).filter(d=>d!=='other');
  for(let j=i+1;j<ordered.length;j++){
   const b=ordered[j],diff=new Date(b.createdAt)-new Date(a.createdAt);
   if(diff>2*86400000)break;
   if(dateKey(a.createdAt)===dateKey(b.createdAt))continue;
   for(const x of domainA)for(const y of insightEntryDomains(b)){
    if(x===y||y==='other')continue;
    const id=`${x} → ${y}`,entry=links.get(id)||{from:x,to:y,count:0,exampleIds:[]};
    entry.count++;if(entry.exampleIds.length<6)entry.exampleIds.push(a.id,b.id);links.set(id,entry);
   }
  }
 }
 return [...links.values()].sort((a,b)=>b.count-a.count).slice(0,12)
}
function insightMetricChanges(entries,days){if(days==='all'||!Number.isFinite(Number(days)))return {};const n=Number(days),end=Date.now()-n*86400000,prev=state.entries.filter(e=>new Date(e.createdAt).getTime()>end-n*86400000&&new Date(e.createdAt).getTime()<=end&&insightTagAllowed(e,$('#insightIncludeSensitive').checked));return Object.fromEntries(INSIGHT_METRICS.map(k=>{const a=averageMetric(entries,k),b=averageMetric(prev,k);return[k,{current:a,previous:b,change:a!==null&&b!==null?Math.round((a-b)*10)/10:null,previousSamples:prev.filter(e=>validNumber(e.metrics?.[k])).length}]}))}
function insightStatsFor(entries,scope){const tags=tagCounts(entries),days=$('#insightRange').value,group=insightDomainSummary(entries);return{records:entries.length,days,daysWithRecords:new Set(entries.map(e=>dateKey(e.createdAt))).size,domains:group,metrics:insightMetricData(entries),changes:insightMetricChanges(entries,days),tags:Object.entries(tags).sort((a,b)=>b[1]-a[1]).slice(0,18).map(([id,count])=>({id,name:tagName(id),count})),cooccurrence:tagCooccurrence(entries),crossDomains:insightCrossLinks(entries),nearbyDomainEvents:insightNearbyLinks(entries),importantTotal:entries.filter(e=>e.importance==='high').length,plans:state.plans.map(p=>({id:p.id,title:p.title||p.goal,status:p.status,progress:p.progress||0,lastReview:p.lastReview?.summary||''})).slice(-12),selection:scope}}
function insightTokenSet(s){return grams(s||'')}
function insightScoreEntry(e,scope,topTagIds,latest){const txt=`${e.text||''} ${followupText(e)} ${(e.tagIds||[]).map(tagName).join(' ')}`,dt=(Date.now()-new Date(e.createdAt).getTime())/86400000;let score=(e.importance==='high'?24:0)+(e.followups?.length?6:0)+(e.analysisStale?3:0)+Math.max(0,12-dt/5);score+=Math.min(12,latest.has(e.id)?6:0);if(scope.mode==='frequent'&&topTagIds.some(id=>(e.tagIds||[]).includes(id)))score+=17;if(scope.mode==='specific'&&(e.tagIds||[]).includes(scope.focusTagId))score+=26;const gr=insightTokenSet(txt),q=insightTokenSet(scope.prompt||'');for(const g of q)if(gr.has(g))score+=2;return score}
function insightSelectEvidence(entries,scope){const tags=tagCounts(entries),top=Object.entries(tags).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]);const recent=new Set(entries.slice(-12).map(x=>x.id));const ranked=[...entries].map(e=>({e,score:insightScoreEntry(e,scope,top,recent)})).sort((a,b)=>b.score-a.score);const pool=new Map();const add=e=>{if(e&&pool.size<65)pool.set(e.id,e)};
 // 先覆盖每个实际有记录的领域、每个时间段，再补充重大事件及高相关记录。
 for(const domain of Object.keys(INSIGHT_DOMAIN_NAMES)){const selected=ranked.filter(x=>insightEntryDomains(x.e).includes(domain)).slice(0,3);selected.forEach(x=>add(x.e))}
 if(entries.length){const chunk=Math.max(1,Math.ceil(entries.length/6));for(let i=0;i<entries.length;i+=chunk){ranked.filter(x=>entries.slice(i,i+chunk).some(e=>e.id===x.e.id)).slice(0,3).forEach(x=>add(x.e))}}
 ranked.filter(x=>x.e.importance==='high').slice(0,18).forEach(x=>add(x.e));ranked.forEach(x=>add(x.e));return [...pool.values()].slice(0,65)}
function insightEvidenceItem(e){return{id:e.id,createdAt:e.createdAt,eventDate:e.eventDate||null,title:(e.title||'记录').slice(0,90),text:(e.text||'').slice(0,1450),followups:(e.followups||[]).slice(-8).map(f=>({time:f.time,questions:(f.questions||[]).map(q=>typeof q==='string'?q:q.question).slice(0,3),answer:String(f.text||f.answer||'').slice(0,600)})),tags:(e.tagIds||[]).map(tagName),metrics:e.metrics||{},metricMeta:e.metricMeta||{},importance:e.importance,vision:(e.attachments||[]).map(x=>x.vision?.summary||x.vision?.description).filter(Boolean).slice(0,2)}}
function insightPayload(){const mode=insightMode(),includeSensitive=$('#insightIncludeSensitive').checked,entries=insightAllInRange(includeSensitive),counts=tagCounts(entries),sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);const focusTagId=mode==='specific'?($('#insightFocusTag').value||'auto'):mode==='frequent'?(sorted[0]?.[0]||null):null;const scope={mode,focusTagId:focusTagId==='auto'?null:focusTagId,focusTag:focusTagId&&focusTagId!=='auto'?tagName(focusTagId):null,range:$('#insightRange').value,includeSensitive};const selected=insightSelectEvidence(entries,scope);const oldHistory=state.entries.filter(e=>!entries.includes(e)&&insightTagAllowed(e,includeSensitive)&&e.importance==='high').slice(-7);return {scope,stats:insightStatsFor(entries,scope),evidence:selected.map(insightEvidenceItem),historicalContext:oldHistory.map(e=>({id:e.id,createdAt:e.createdAt,title:e.title,text:(e.text||'').slice(0,520),tags:(e.tagIds||[]).map(tagName)})),profile:includeSensitive?{goals:state.profile.goals,job:state.profile.job,schedule:state.profile.schedule}:{},summaries:includeSensitive?state.summaries.slice(-3):[],recordIds:entries.map(e=>e.id),allEvidenceIds:[...selected.map(e=>e.id),...oldHistory.map(e=>e.id)]}}
function insightModeLabel(mode){return({comprehensive:'全方位综合分析',frequent:'高频主题深入分析',specific:'指定主题深入分析'})[mode]||'综合分析'}
function renderInsightFocusOptions(counts){const sel=$('#insightFocusTag');if(!sel)return;const old=sel.value;sel.innerHTML='<option value="auto">请选择一个标签</option>'+Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([id,n])=>`<option value="${escapeHTML(id)}">${escapeHTML(tagName(id))} · ${n} 条</option>`).join('');if([...sel.options].some(o=>o.value===old))sel.value=old;else if(sel.options.length>1)sel.selectedIndex=1}
function syncInsightMode(){const m=insightMode();$('#insightFocusRow').classList.toggle('hidden',m!=='specific');$('#aiInsightBtn').textContent=m==='comprehensive'?'开始全方位综合分析':m==='frequent'?'分析高频主题':'深入分析指定主题';renderInsightScanPreview()}
function renderInsightScanPreview(){if(!$('#insightScanPreview'))return;const inc=$('#insightIncludeSensitive').checked,arr=insightAllInRange(inc),all=insightEntries(),metrics=insightMetricData(arr),used=Object.entries(metrics).filter(([,x])=>x.count).map(([k,x])=>`${INSIGHT_METRIC_NAMES[k]} ${x.days}天`),domains=Object.values(insightDomainSummary(arr)).filter(x=>x.records).length;$('#insightScanPreview').textContent=`本地扫描 ${arr.length} 条记录 · ${domains} 个领域 · 数值覆盖：${used.slice(0,4).join(' / ')||'暂缺'}${!inc&&all.length>arr.length?` · ${all.length-arr.length}条私密记录未参与分析`:''}。${arr.length>65?'AI 将抽取不超过 65 条具有代表性的原文，其余参与汇总统计。':''}`}
function insightSafeRefs(ids,report){const allowed=new Set([...(report.evidenceIds||[])]);return[...new Set(Array.isArray(ids)?ids:[])].filter(x=>typeof x==='string'&&allowed.has(x)&&state.entries.some(e=>e.id===x)).slice(0,8)}
function insightRefsHTML(ids,report){const refs=insightSafeRefs(ids,report);return refs.length?`<div class="insight-evidence-refs">证据：${refs.map(id=>{const e=state.entries.find(x=>x.id===id);return `<button type="button" class="insight-evidence-link" data-entry-id="${escapeHTML(id)}" title="查看完整原文与补充回答">${escapeHTML((e?.title||'记录').slice(0,22))} ↗</button>`}).join('')}</div>`:'<div class="insight-evidence-refs muted-copy">此判断未关联到可核查的原始记录，请结合数据概览谨慎阅读。</div>'}
function insightBullets(arr){return Array.isArray(arr)?arr.map(t=>`<li>${escapeHTML(typeof t==='string'?t:(t.text||t.observation||''))}</li>`).join(''):''}
function renderInsightAI(d,report){const f=Array.isArray(d.findings)?d.findings:[],actions=Array.isArray(d.actions)?d.actions:[],lines=[];lines.push(`<div class="insight-report-head"><div><span class="eyebrow">${escapeHTML(insightModeLabel(report.scope?.mode))} · ${escapeHTML(new Date(report.createdAt).toLocaleString())}</span><h3>${escapeHTML(d.headline||'综合洞察')}</h3></div><p>${escapeHTML(d.summary||'没有获得足够的信息来形成整体判断。')}</p></div>`);if(d.coverage_note)lines.push(`<div class="analysis-section analysis-uncertainty"><h3>数据覆盖与局限</h3><p>${escapeHTML(d.coverage_note)}</p></div>`);
 lines.push('<div class="insight-report-section-label">跨领域关联与重点事件</div>');if(!f.length)lines.push('<p class="muted-copy">尚未识别出可核查的模式。可以继续记录，稍后重新分析。</p>');for(let i=0;i<f.length;i++){const x=f[i],certainty=x.certainty==='supported'?'记录支持':'有待验证';lines.push(`<div class="insight-finding"><div class="insight-finding-title"><strong>${i+1}. ${escapeHTML(x.title||'值得关注的观察')}</strong><span class="insight-certainty">${certainty}</span></div><p><b>观察：</b>${escapeHTML(x.observation||'')}</p>${x.hypothesis?`<p><b>可能解释：</b>${escapeHTML(x.hypothesis)}</p>`:''}${x.alternatives?.length?`<details><summary>其他可能性</summary><ul>${insightBullets(x.alternatives)}</ul></details>`:''}${insightRefsHTML(x.evidenceIds,report)}</div>`)}
 if(d.psychology_lens?.application)lines.push(`<div class="analysis-section psychology-section"><h3>心理学 / 行为科学视角：${escapeHTML(d.psychology_lens.theory||'')}</h3><p>${escapeHTML(d.psychology_lens.application)}</p><p class="muted-copy">适用边界：${escapeHTML(d.psychology_lens.limits||'不能由此直接断定因果或进行临床诊断。')}</p></div>`);
 if(actions.length){lines.push('<div class="insight-report-section-label">接下来可以验证的行动</div>');for(let i=0;i<actions.length;i++){const x=actions[i];lines.push(`<div class="action-card insight-action"><b>${i+1}. ${escapeHTML(x.title||x.action||'行动')}</b><p>${escapeHTML(x.why||'')}</p><p>步骤：${escapeHTML(x.how||'')}</p><p>周期：${Math.min(30,Math.max(1,Number(x.durationDays)||7))} 天 · 验证指标：${escapeHTML(x.measure||'记录实施前后差异')}</p><button class="secondary-btn small-btn insight-adopt-action" data-action-index="${i}">加入行动实验</button></div>`)}}
 if(d.questions?.length)lines.push(`<div class="analysis-section analysis-uncertainty"><h3>还需要确认</h3><ul>${insightBullets(d.questions)}</ul></div>`);if(d.caveat)lines.push(`<p class="muted-copy">${escapeHTML(d.caveat)}</p>`);return lines.join('')}
function showInsightReport(report){displayedInsightReportId=report.id;$('#aiInsightContent').innerHTML=renderInsightAI(report.result||{},report);$('#aiInsightContent').querySelectorAll('.insight-evidence-link').forEach(btn=>btn.onclick=()=>openRecordDetail(btn.dataset.entryId));$('#aiInsightContent').querySelectorAll('.insight-adopt-action').forEach(btn=>btn.onclick=()=>adoptInsightAction(report.id,Number(btn.dataset.actionIndex)));renderInsightHistory()}
function renderInsightHistory(){const root=$('#insightHistoryList');if(!root)return;root.innerHTML=state.insightReports.length?state.insightReports.slice(0,20).map(r=>`<div class="insight-history-item"><button class="text-btn insight-open-report" data-id="${escapeHTML(r.id)}">${escapeHTML(new Date(r.createdAt).toLocaleString())} · ${escapeHTML(insightModeLabel(r.scope?.mode))} · ${escapeHTML((r.result?.headline||'洞察报告').slice(0,25))}</button><button class="tiny-btn insight-delete-report" data-id="${escapeHTML(r.id)}">删除</button></div>`).join(''):'<p class="muted-copy">尚无历史报告。</p>';root.querySelectorAll('.insight-open-report').forEach(b=>b.onclick=()=>{const r=state.insightReports.find(x=>x.id===b.dataset.id);if(r)showInsightReport(r)});root.querySelectorAll('.insight-delete-report').forEach(b=>b.onclick=async()=>{if(!confirm('删除这份历史分析？不会删除生活记录或已经加入的行动实验。'))return;await dbDelete('insightReports',b.dataset.id);state.insightReports=state.insightReports.filter(x=>x.id!==b.dataset.id);if(displayedInsightReportId===b.dataset.id){displayedInsightReportId=null;$('#aiInsightContent').innerHTML='<p class="muted-copy">已删除报告。</p>'}renderInsightHistory()})}
async function adoptInsightAction(reportId,index){const report=state.insightReports.find(r=>r.id===reportId),action=report?.result?.actions?.[index];if(!action)return;const exp={id:uid(),createdAt:nowISO(),reportId,title:action.title||action.action||'行动实验',why:action.why||'',how:action.how||'',measure:action.measure||'',durationDays:clamp(Number(action.durationDays)||7,1,30),checkins:[],status:'active'};await dbPut('actionExperiments',exp);state.actionExperiments.unshift(exp);scheduleLocalSnapshot();renderInsightExperiments();setStatus('#aiInsightStatus','已加入行动实验。可在下方每天登记执行情况。','success')}
function renderInsightExperiments(){const el=$('#insightExperimentList');if(!el)return;el.innerHTML=state.actionExperiments.length?state.actionExperiments.slice(0,18).map(e=>{const due=new Date(new Date(e.createdAt).getTime()+e.durationDays*86400000),complete=e.status==='done',last=e.checkins?.at(-1);return `<div class="insight-experiment-item"><strong>${escapeHTML(e.title)}</strong><span class="insight-exp-state">${complete?'已结束':`第 ${Math.min(e.durationDays,Math.max(1,Math.floor((Date.now()-new Date(e.createdAt))/86400000)+1))} / ${e.durationDays} 天`}</span><p>${escapeHTML(e.how||'')}</p><small>验证：${escapeHTML(e.measure||'')} · ${escapeHTML(due.toLocaleDateString())} 到期 · 已记录 ${e.checkins?.length||0} 次${last?` · 最近：${escapeHTML(last.note.slice(0,32))}`:''}</small><div class="insight-experiment-actions">${complete?'':`<button class="tiny-btn insight-checkin" data-id="${escapeHTML(e.id)}">记录执行</button><button class="tiny-btn insight-complete" data-id="${escapeHTML(e.id)}">结束实验</button>`}<button class="tiny-btn insight-exp-delete" data-id="${escapeHTML(e.id)}">移除</button></div></div>`}).join(''):'<div class="muted-copy">暂无行动实验。点击分析报告里的「加入行动实验」即可开始。</div>';el.querySelectorAll('.insight-checkin').forEach(b=>b.onclick=async()=>{const e=state.actionExperiments.find(x=>x.id===b.dataset.id);if(!e)return;const note=prompt('今天执行情况如何？写下做了什么、结果和状态（会保存在本机）：');if(!note?.trim())return;e.checkins=[...(e.checkins||[]),{time:nowISO(),note:note.trim()}];await dbPut('actionExperiments',e);renderInsightExperiments();scheduleLocalSnapshot()});el.querySelectorAll('.insight-complete').forEach(b=>b.onclick=async()=>{const e=state.actionExperiments.find(x=>x.id===b.dataset.id);if(!e)return;const summary=prompt('这次实验的实际结果如何？有哪些变化或不足？');if(summary===null)return;e.status='done';e.outcome=summary.trim();e.finishedAt=nowISO();await dbPut('actionExperiments',e);renderInsightExperiments();scheduleLocalSnapshot()});el.querySelectorAll('.insight-exp-delete').forEach(b=>b.onclick=async()=>{if(!confirm('移除这项实验及其执行记录？'))return;await dbDelete('actionExperiments',b.dataset.id);state.actionExperiments=state.actionExperiments.filter(x=>x.id!==b.dataset.id);renderInsightExperiments();scheduleLocalSnapshot()})}
function validateInsightResponse(d,allowedIds){if(!d||typeof d!=='object'||Array.isArray(d))throw new Error('模型没有返回有效的结构化报告');const ids=new Set(allowedIds),safe=x=>String(x||'').slice(0,2400);const findings=(Array.isArray(d.findings)?d.findings:[]).slice(0,7).map(x=>({title:safe(x.title),observation:safe(x.observation),hypothesis:safe(x.hypothesis),certainty:x.certainty==='supported'?'supported':'hypothesis',alternatives:(Array.isArray(x.alternatives)?x.alternatives:[]).slice(0,3).map(safe),evidenceIds:[...new Set(Array.isArray(x.evidenceIds)?x.evidenceIds:[])].filter(id=>typeof id==='string'&&ids.has(id)).slice(0,8)}));const actions=(Array.isArray(d.actions)?d.actions:[]).slice(0,4).map(x=>({title:safe(x.title||x.action),why:safe(x.why),how:safe(x.how),durationDays:clamp(Number(x.durationDays)||7,1,30),measure:safe(x.measure)}));return {headline:safe(d.headline),summary:safe(d.summary),coverage_note:safe(d.coverage_note),findings,psychology_lens:{theory:safe(d.psychology_lens?.theory),application:safe(d.psychology_lens?.application),limits:safe(d.psychology_lens?.limits)},actions,questions:(Array.isArray(d.questions)?d.questions:[]).slice(0,5).map(safe),caveat:safe(d.caveat)}}
async function aiInsights(){const btn=$('#aiInsightBtn'),payload=insightPayload();if(!payload.stats.records){setStatus('#aiInsightStatus','所选范围暂无可用记录，或记录被隐私选项排除。','error');return}if(payload.scope.mode==='specific'&&!payload.scope.focusTagId){setStatus('#aiInsightStatus','请选择一个有效标签。','error');return}btn.disabled=true;setStatus('#aiInsightStatus',`本地已扫描 ${payload.stats.records} 条记录，正在分析 ${payload.evidence.length} 条代表性证据…`);try{const response=await api('/api/insights',{scope:payload.scope,stats:payload.stats,evidence:payload.evidence,historicalContext:payload.historicalContext,profile:payload.profile,summaries:payload.summaries,activeExperiments:state.actionExperiments.slice(0,8).map(e=>({title:e.title,how:e.how,measure:e.measure,checkins:(e.checkins||[]).slice(-7),status:e.status,outcome:e.outcome||''}))});const result=validateInsightResponse(response,payload.allEvidenceIds);const report={id:uid(),createdAt:nowISO(),scope:payload.scope,stats:payload.stats,evidenceIds:payload.allEvidenceIds,result};await dbPut('insightReports',report);state.insightReports.unshift(report);showInsightReport(report);scheduleLocalSnapshot();setStatus('#aiInsightStatus',`分析完成：扫描 ${payload.stats.records} 条记录；报告与证据编号已保存在本机。`,'success')}catch(e){setStatus('#aiInsightStatus',e.message,'error')}finally{btn.disabled=false}}

// Each topic has its own messages. Legacy v5 messages are grouped as a read-only-compatible topic.
function topicIdForMessage(m){return m.topicId||`legacy-${m.spaceId}`}
async function migrateLegacyTopics(){
 const spaceIds=[...new Set(state.conversations.filter(m=>!m.topicId).map(m=>m.spaceId))];
 for(const sid of spaceIds){const id=`legacy-${sid}`;if(state.topics.some(t=>t.id===id))continue;
  const msgs=state.conversations.filter(m=>m.spaceId===sid&&!m.topicId);
  const topic={id,spaceId:sid,title:'旧版问答历史（已保留）',summary:'之前的连续问答都在这里，新问题可以单独创建话题。',createdAt:msgs[0]?.createdAt||nowISO(),updatedAt:msgs.at(-1)?.createdAt||nowISO(),legacy:true};
  await dbPut('topics',topic);state.topics.push(topic);
 }
 state.topics.sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));
}
async function saveSpace(space){await dbPut('spaces',space);const i=state.spaces.findIndex(x=>x.id===space.id);if(i>=0)state.spaces[i]=space;else state.spaces.push(space)}
async function saveTopic(topic){topic.updatedAt=nowISO();await dbPut('topics',topic);const i=state.topics.findIndex(x=>x.id===topic.id);if(i>=0)state.topics[i]=topic;else state.topics.push(topic);state.topics.sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));scheduleLocalSnapshot()}
async function saveConversation(msg){await dbPut('conversations',msg);state.conversations.push(msg);state.conversations.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));scheduleLocalSnapshot()}
function currentSpace(){return state.spaces.find(x=>x.id===selectedSpaceId)||state.spaces[0]}
function spaceRelevantEntries(space,question){if(!space||space.id==='general')return selectHistory(question).relevant.concat(selectHistory(question).recent).slice(-100);const tagged=state.entries.filter(e=>(space.tagIds||[]).some(id=>(e.tagIds||[]).includes(id)));const q=grams(`${space.name} ${question}`);const scored=state.entries.filter(e=>!tagged.includes(e)).map(e=>{const eg=grams(`${e.text} ${followupText(e)} ${(e.tagIds||[]).map(tagName).join(' ')}`);let common=0;q.forEach(g=>{if(eg.has(g))common++});return[common,e]}).filter(x=>x[0]>0).sort((a,b)=>b[0]-a[0]).map(x=>x[1]);return [...new Map([...tagged,...scored].map(e=>[e.id,e])).values()].slice(-120)}
function spaceTopics(spaceId){return state.topics.filter(t=>t.spaceId===spaceId).sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt))}
function currentTopic(){return state.topics.find(t=>t.id===selectedTopicId&&t.spaceId===selectedSpaceId)||null}
function selectTopic(id){selectedTopicId=id;$('#askText').value='';setStatus('#askStatus','');renderAsk()}
function startNewTopic(){selectedTopicId=null;$('#askText').value='';setStatus('#askStatus','');renderAsk();$('#askText').focus();$('#askComposeBox').scrollIntoView({behavior:'smooth',block:'nearest'})}
async function removeTopic(id){const t=state.topics.find(x=>x.id===id);if(!t||!confirm(`删除话题「${t.title}」及其问答？生活记录不会被删除。`))return;for(const m of state.conversations.filter(m=>topicIdForMessage(m)===id))await dbDelete('conversations',m.id);state.conversations=state.conversations.filter(m=>topicIdForMessage(m)!==id);await dbDelete('topics',id);state.topics=state.topics.filter(x=>x.id!==id);if(selectedTopicId===id)selectedTopicId=null;renderAsk();scheduleLocalSnapshot()}
async function clearAsk(){const topic=currentTopic();if(!topic){setStatus('#askStatus','请先选择要删除的话题。');return}await removeTopic(topic.id)}
async function checkWebSearchStatus(){try{const r=await fetch('/api/web-search',{cache:'no-store'});const d=await r.json();webSearchAvailable=Boolean(r.ok&&d.configured);$('#askWebStatus').textContent=webSearchAvailable?'联网搜索已就绪 · 按需开启':'尚未配置联网搜索：在 Vercel 添加 TAVILY_API_KEY';}catch{webSearchAvailable=false;$('#askWebStatus').textContent='联网搜索未就绪，请检查部署 /api/web-search 接口。'}}
function safeWebUrl(url){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}}
function renderAsk(){if(!$('#askSpaceList')||!state.spaces.length)return;const sp=currentSpace();if(!sp){selectedSpaceId=state.spaces[0].id;return renderAsk()}
 $('#askSpaceTitle').textContent=sp.name;$('#askSpaceEyebrow').textContent=sp.system?'系统专题':'自定义专题';
 $('#askSpaceList').innerHTML=state.spaces.map(x=>`<button class="space-btn ${x.id===sp.id?'active':''}" data-id="${x.id}"><span>${escapeHTML(x.name)}</span><small>${escapeHTML(x.description||'')}</small></button>`).join('');
 $$('#askSpaceList .space-btn').forEach(b=>b.onclick=()=>{selectedSpaceId=b.dataset.id;selectedTopicId=null;$('#askText').value='';renderAsk()});
 const ts=spaceTopics(sp.id),topic=currentTopic();
 $('#askTopicList').innerHTML=ts.length?ts.map(t=>{const cnt=state.conversations.filter(m=>topicIdForMessage(m)===t.id&&m.role==='user').length;return `<div class="ask-topic-item ${t.id===topic?.id?'active':''}"><button class="ask-topic-open" data-id="${escapeHTML(t.id)}"><span class="ask-topic-title">${escapeHTML(t.title)}</span><span class="ask-topic-sub">${cnt} 次提问 · ${escapeHTML(new Date(t.updatedAt||t.createdAt).toLocaleDateString())}</span>${t.summary?`<span class="ask-topic-excerpt">${escapeHTML(t.summary).slice(0,75)}</span>`:''}</button><button class="ask-topic-delete" data-id="${escapeHTML(t.id)}" title="删除该话题" aria-label="删除该话题">×</button></div>`}).join(''):'<div class="ask-topic-empty">还没有话题。输入问题，就会自动创建一个。</div>';
 $$('#askTopicList .ask-topic-open').forEach(b=>b.onclick=()=>selectTopic(b.dataset.id));$$('#askTopicList .ask-topic-delete').forEach(b=>b.onclick=()=>removeTopic(b.dataset.id));
 $('#clearAskBtn').disabled=!topic;
 $('#askActiveTopic').textContent=topic?`当前话题：${topic.title}`:'新话题 · 只关联当前问题的上下文';
 const msgs=topic?state.conversations.filter(m=>topicIdForMessage(m)===topic.id):[];
 $('#askThread').innerHTML=msgs.length?msgs.map(renderChatMessage).join(''):'<div class="ask-empty"><b>开始一个新话题</b><p>每个话题独立保存，可以随时从上方切换。原来的问题不会丢失。</p></div>';
 $('#askThread').scrollTop=$('#askThread').scrollHeight;
 $('#askNewTopicBtn').disabled=askBusy;$('#askSendBtn').disabled=askBusy;
 renderImagePreview('ask')
}
function renderChatMessage(m){if(m.role==='user')return `<div class="chat-row user"><div class="chat-bubble user-bubble">${m.imageThumb?`<img class="chat-image" src="${m.imageThumb}" alt="提问图片">`:''}<p>${escapeHTML(m.text)}</p></div></div>`;
 const d=m.data||{};
 if(d.need_clarification)return `<div class="chat-row assistant"><div class="chat-bubble"><div class="eyebrow">Jarvis · 需要补充</div>${d.answer?`<p>${escapeHTML(d.answer)}</p>`:''}${(d.questions||[]).map((q,i)=>`<div class="clarify-q"><b>${i+1}. ${escapeHTML(q.question||q)}</b>${q.reason?`<small>${escapeHTML(q.reason)}</small>`:''}</div>`).join('')}</div></div>`;
 const sources=Array.isArray(m.webSources)?m.webSources:[];
 return `<div class="chat-row assistant"><div class="chat-bubble"><div class="eyebrow">JARVIS ${sources.length?'· 已联网检索':''}</div>${d.answer?`<p class="chat-answer">${escapeHTML(d.answer)}</p>`:''}${sources.length?`<details class="chat-web-sources"><summary>本次网络来源 · ${sources.length} 条（点开核对）</summary><ol>${sources.map((x,i)=>{const url=safeWebUrl(x.url);return url?`<li><a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">[${i+1}] ${escapeHTML(x.title||url)}</a></li>`:''}).join('')}</ol><small>检索结果是网页摘要，不代表已经逐字核验全文；回答中的 [序号] 对应这里的来源。</small></details>`:''}${d.evidence?.length?`<details><summary>我为什么这样判断</summary><ul>${d.evidence.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul></details>`:''}${d.psychology?`<details class="chat-theory"><summary>${escapeHTML(d.psychology.theory||'心理学视角')}</summary><p>${escapeHTML(d.psychology.analysis||'')}</p>${d.psychology.limit?`<small>${escapeHTML(d.psychology.limit)}</small>`:''}</details>`:''}${d.alternatives?.length?`<details><summary>其他可能性</summary><ul>${d.alternatives.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul></details>`:''}${d.actions?.length?`<details class="chat-actions"><summary>具体可做的事（${d.actions.length}）</summary><ol>${d.actions.map(x=>`<li>${escapeHTML(typeof x==='string'?x:x.action||'')}</li>`).join('')}</ol></details>`:''}${d.caution?`<details><summary>注意事项</summary><small class="chat-caution">${escapeHTML(d.caution)}</small></details>`:''}</div></div>`
}
async function createSpace(){const name=prompt('专题名称：例如 公务员考试、减脂、工作发展');if(!name?.trim())return;const tagText=prompt('优先关联哪些现有标签？可留空；多个用逗号分隔。','');const names=(tagText||'').split(/[,，]/).map(x=>x.trim()).filter(Boolean),tagIds=tagIdsFromNames(names);const sp={id:`space-${uid()}`,name:name.trim(),system:false,tagIds,description:tagIds.length?`优先读取：${tagIds.map(tagName).join('、')}`:'根据专题名称和问题自动检索相关记录',createdAt:nowISO()};await saveSpace(sp);selectedSpaceId=sp.id;selectedTopicId=null;renderAsk()}
async function askJarvis(){const question=$('#askText').value.trim();if((!question&&!askImage)||askBusy)return;const sp=currentSpace();if(!sp)return;
 askBusy=true;const activeTopic=currentTopic();const searchOn=$('#askWebToggle').checked;$('#askSendBtn').disabled=true;$('#askNewTopicBtn').disabled=true;
 setStatus('#askStatus',searchOn?'正在联网查找来源…':'正在查找相关记录并分析…');
 let persistedMsg=null;let createdTopic=null;
 try{
  let webSources=[];
  if(searchOn){if(!webSearchAvailable)throw new Error('联网搜索尚未启用。请先在私人版 Vercel → Environment Variables 添加 TAVILY_API_KEY 并重新部署。');if(!question)throw new Error('联网搜索需要输入查询文字。');const sd=await api('/api/web-search',{query:question.slice(0,300)});webSources=Array.isArray(sd.results)?sd.results:[];if(!webSources.length)throw new Error('本次没有找到可核实的网页结果，请修改关键词再试。');}
  let vision=askImage?.vision||null;if(askImage&&!vision)vision=await recognizeImage('ask');
  let topic=activeTopic;
  if(!topic){topic={id:`topic-${uid()}`,spaceId:sp.id,title:(question||vision?.summary||'图片分析').replace(/\s+/g,' ').slice(0,32),summary:'',createdAt:nowISO(),updatedAt:nowISO()};await saveTopic(topic);createdTopic=topic;selectedTopicId=topic.id;}
  const text=question||'请分析这张图片。';const rel=spaceRelevantEntries(sp,text||vision?.summary||'图片');const h=selectHistory(`${sp.name} ${text}`);
  // History is scoped to the current topic, never to all questions under the same space.
  const history=state.conversations.filter(m=>topicIdForMessage(m)===topic.id).slice(-16).map(m=>({role:m.role,text:m.text,data:m.role==='assistant'?m.data:null}));
  const userMsg={id:uid(),spaceId:sp.id,topicId:topic.id,role:'user',text,imageThumb:askImage?.dataUrl||null,image_context:vision||null,createdAt:nowISO()};
  await saveConversation(userMsg);persistedMsg=userMsg;renderAsk();
  setStatus('#askStatus',webSources.length?'已找到网络来源，正在结合你的记录分析…':'正在结合你的记录分析…');
  const d=await api('/api/ask',{space:{name:sp.name,description:sp.description,tag_names:(sp.tagIds||[]).map(tagName)},question:text,image_context:vision,profile:state.profile,summaries:state.summaries.slice(-6),active_plans:activePlansForAI(),recent:serializeEntries(h.recent),relevant:serializeEntries(rel),conversation_history:history,web_sources:webSources});
  await saveConversation({id:uid(),spaceId:sp.id,topicId:topic.id,role:'assistant',text:d.answer||'',data:d,webSources,createdAt:nowISO()});
  topic.summary=(d.answer||d.questions?.[0]?.question||'').slice(0,100);await saveTopic(topic);
  $('#askText').value='';$('#askWebToggle').checked=false;clearImageState('ask');renderAsk();setStatus('#askStatus',d.need_clarification?'Jarvis 需要补充信息，请在当前话题继续回答。':'已保存至当前话题。','success');
 }catch(e){
  // Keep the question editable on failure, without leaving a duplicate unanswered message.
  if(persistedMsg){await dbDelete('conversations',persistedMsg.id);state.conversations=state.conversations.filter(m=>m.id!==persistedMsg.id)}
  if(createdTopic){await dbDelete('topics',createdTopic.id);state.topics=state.topics.filter(t=>t.id!==createdTopic.id);selectedTopicId=null}
  renderAsk();setStatus('#askStatus',e.message,'error')
 }finally{askBusy=false;$('#askSendBtn').disabled=false;$('#askNewTopicBtn').disabled=false}
}

function renderAll(){renderDashboard();renderRecords();renderPlans();renderInsights();renderSettings();renderComposerTagPickers();renderAsk()}

function bindEvents(){
 $$('[data-page]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));$$('[data-goto]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.goto)));$$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));$$('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));
 $('#quickAddTop').onclick=()=>{modalSelectedTagIds.clear();renderComposerTagPickers();openModal('recordModal')};$('#newRecordBtn').onclick=()=>{modalSelectedTagIds.clear();renderComposerTagPickers();openModal('recordModal')};
 $('#saveOnlyBtn').onclick=()=>saveOnly($('#quickText').value,manualMetrics());$('#analyzeBtn').onclick=()=>analyzeText($('#quickText').value,manualMetrics());
 $('#modalSaveOnly').onclick=()=>saveOnly($('#recordModalText').value,{},'modal');$('#modalAnalyze').onclick=()=>analyzeText($('#recordModalText').value,{},'modal');
 $('#quickImageBtn').onclick=()=>$('#quickImageInput').click();$('#quickImageInput').onchange=e=>chooseImage('dashboard',e.target.files[0]);$('#quickRecognizeBtn').onclick=()=>recognizeImage('dashboard');
 $('#modalImageBtn').onclick=()=>$('#modalImageInput').click();$('#modalImageInput').onchange=e=>chooseImage('modal',e.target.files[0]);$('#modalRecognizeBtn').onclick=()=>recognizeImage('modal');
 $('#askImageBtn').onclick=()=>$('#askImageInput').click();$('#askImageInput').onchange=e=>chooseImage('ask',e.target.files[0]);$('#askSendBtn').onclick=askJarvis;$('#newSpaceBtn').onclick=createSpace;$('#clearAskBtn').onclick=clearAsk;$('#askNewTopicBtn').onclick=startNewTopic;$('#askJumpCompose').onclick=()=>{$('#askComposeBox').scrollIntoView({behavior:'smooth',block:'center'});$('#askText').focus()};
 $('#quickNewTagBtn').onclick=()=>openCreateTag('quick');$('#modalNewTagBtn').onclick=()=>openCreateTag('modal');
 $('#submitPendingBtn').onclick=submitPending;$('#saveEntryTagsBtn').onclick=saveEditedTags;$('#newTagBtn').onclick=()=>openCreateTag('settings');$('#tagEditNewTagBtn').onclick=()=>openCreateTag('edit');$('#createTagBtn').onclick=createTag;
 $('#recordSearch').oninput=renderRecords;$('#recordRange').onchange=renderRecords;$('#recordStatus').onchange=renderRecords;
 $('#dashboardMetricSelect').onchange=renderDashboard;$('#insightMetricSelect').onchange=renderInsights;$('#insightRange').onchange=renderInsights;$('#aiInsightBtn').onclick=aiInsights;$$('input[name="insightMode"]').forEach(x=>x.onchange=syncInsightMode);$('#insightIncludeSensitive').onchange=()=>{renderInsights();syncInsightMode()};$('#insightFocusTag').onchange=renderInsightScanPreview;
 $('#openPlanCreateBtn').onclick=()=>openModal('planCreateModal');$('#createPlanBtn').onclick=createPlan;
 $('#saveProfileBtn').onclick=saveProfile;$('#exportBtn').onclick=exportData;$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{try{if(e.target.files[0])await importData(e.target.files[0])}catch(err){setStatus('#backupStatus',err.message,'error')}};$('#createSnapshotBtn').onclick=()=>createSnapshot(false);$('#restoreSnapshotBtn').onclick=restoreSnapshot;$$('.memory-summary-btn').forEach(b=>b.onclick=()=>updateSummary(Number(b.dataset.days)));
 window.addEventListener('resize',()=>{if(currentPage==='dashboard')renderDashboard();if(currentPage==='insights')renderInsights()});
}

async function init(){
 try{db=await openDB();await seedTags();state.tags=await dbGetAll('tags');await seedSpaces();await migrateV3IfNeeded();await loadState();await migrateLegacyTopics();bindEvents();renderAll();syncInsightMode();checkWebSearchStatus();if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});scheduleLocalSnapshot()}catch(e){document.body.innerHTML=`<div style="padding:30px;color:white;font-family:system-ui"><h2>Jarvis 启动失败</h2><p>${escapeHTML(e.message)}</p></div>`}
}
init();
