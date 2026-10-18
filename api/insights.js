// Jarvis v5.1 private: evidence-grounded, cross-domain insight analysis.
function outputText(d){if(d.output_text)return d.output_text;let s='';for(const item of d.output||[])for(const part of item.content||[])if(part.type==='output_text'&&part.text)s+=part.text;return s.trim()}
function jsonParse(s){return JSON.parse(String(s||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim())}
function text(v,max=2200){return String(v??'').slice(0,max)}
function array(v,max=100){return Array.isArray(v)?v.slice(0,max):[]}
function normalize(d,validIds){if(!d||typeof d!=='object'||Array.isArray(d))throw new Error('模型未返回 JSON 对象');const findings=array(d.findings,7).map(f=>({title:text(f.title,120),observation:text(f.observation),hypothesis:text(f.hypothesis),certainty:f.certainty==='supported'?'supported':'hypothesis',alternatives:array(f.alternatives,3).map(x=>text(x,500)),evidenceIds:[...new Set(array(f.evidenceIds,12).filter(id=>typeof id==='string'&&validIds.has(id)))].slice(0,8)}));return{headline:text(d.headline,160),summary:text(d.summary),coverage_note:text(d.coverage_note),findings,psychology_lens:{theory:text(d.psychology_lens?.theory,130),application:text(d.psychology_lens?.application),limits:text(d.psychology_lens?.limits)},actions:array(d.actions,4).map(a=>({title:text(a.title||a.action,130),why:text(a.why,600),how:text(a.how,700),durationDays:Math.min(30,Math.max(1,Number(a.durationDays)||7)),measure:text(a.measure,500)})),questions:array(d.questions,5).map(x=>text(x,350)),caveat:text(d.caveat,750)}}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const key=process.env.OPENAI_API_KEY,base=(process.env.OPENAI_API_BASE||'https://api.openai-proxy.org/v1').replace(/\/$/,''),model=process.env.OPENAI_MODEL;
 if(!key||!model)return res.status(500).json({error:'私人版尚未配置 CLOSEAI/OpenAI 的 API Key 或模型名称'});
 try{
  const b=req.body||{};
  const scope=b.scope||{},evidence=array(b.evidence,65),historical=array(b.historicalContext,7),validIds=new Set([...evidence,...historical].map(x=>x.id).filter(id=>typeof id==='string'));
  const stats=b.stats||{};
  if(!stats.records)return res.status(400).json({error:'没有有效记录，暂时无法分析'});
  const input={analysis_mode:scope.mode||'comprehensive',focus_tag:scope.focusTag||null,range:scope.range,statistics:stats,profile:b.profile||{},verified_previous_summaries:array(b.summaries,3),selected_evidence:evidence.map(e=>({id:e.id,createdAt:e.createdAt,eventDate:e.eventDate,title:e.title,text:e.text,followups:e.followups,tags:e.tags,metrics:e.metrics,metricMeta:e.metricMeta,structured:e.structured||null,importance:e.importance,vision:e.vision})),historical_background:historical,active_experiments:array(b.activeExperiments,8)};
  const instructions=`你是 Jarvis 私人版的“综合洞察分析器”，帮助用户在真实的长期记录中发现可验证的模式。中文回答，具体、有条理，避免空泛说教。
关键模式：comprehensive=全方位综合分析，必须覆盖所有有数据的领域（工作/学习/睡眠/情绪/精力/关系/饮食/运动/计划等），包括低频但高重要性的事件，不能只围绕高频标签；frequent=聚焦最高频主题，仍考虑其他领域的前因后果；specific=聚焦指定主题但跨领域检索相关证据。

严格规则：
1. 只引用输入里的 selected_evidence/historical_background 的真实 id，禁止编造新记录、日期、数值、事件或他人意图。引用 id 填到 findings[].evidenceIds。不要用空泛“多次出现”冒充证据。统计数据的数值要与 statistics 一致。
2. statistics 是本地扫描范围内所有可用记录计算的摘要；selected_evidence 是代表性抽样，不是全部原文；二者区分清楚。不能因未抽到原文而宣称某类事件不存在。
3. 对于睡眠，按夜间睡眠小时、夜醒与午睡区分；对于饮食，所有热量和营养是用户已记录餐食的估算值，不代表全天摄入量，也不能用它直接推断营养不足。照片识图不能准确称重，需要标明估算不确定性。统计共现、时间顺序并不证明因果。观察（可核实）与假设（待验证）分开写；样本量小或数值来自 AI 估算时必须说明。
4. 一项真正重要的跨领域关联可以关注“情感事件→睡眠→精力→学习”的假设，但必须检查其他可能原因；不要推断第三方真实心理、不贴依恋类型/心理疾病标签。
5. 心理学/行为科学理论只在有针对性时使用，说明适用边界。对健康、投资等保持谨慎，不能取代专业诊疗。
6. 输出应比普通趋势概述具体：整体状态、2～6个优先级明确的发现、支持的指标/记录、其他解释、可操作的1～3项实验和7天或约定周期的验证办法。如果事实不足先提出2～4个澄清问题，不得硬编。
7. 如果 active_experiments 有历史执行结果，比较现状与先前建议，避免每次重复提出同样方案。
8. 不要把缺失指标判作“正常”；将人工数据与 AI 推测数值区分，不制造精确的置信度百分比。
9. 仅返回合法 JSON，无 Markdown 包装，格式如下：
{
 "headline":"核心判断（简短）",
 "summary":"整体概况，100-250字，覆盖有证据的主要领域与优先级",
 "coverage_note":"记录天数/各指标缺失与手动/AI 来源等局限",
 "findings":[{"title":"问题/关联标题","observation":"可核实记录和统计结果","hypothesis":"一种或多种可能机制；若证据不足说明未知","certainty":"supported 或 hypothesis","alternatives":["其他可能解释"],"evidenceIds":["来自输入的真实id"]}],
 "psychology_lens":{"theory":"相关理论名称","application":"为什么适用以及对应记录","limits":"理论不适用或不能断言的部分"},
 "actions":[{"title":"可执行行动","why":"优先理由","how":"何时、何地、做什么、失败备选方案","durationDays":7,"measure":"可记录与比较的具体指标"}],
 "questions":["缺少哪些关键事实"],
 "caveat":"必要的分析限制"
}`;
  const response=await fetch(`${base}/responses`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions,input:JSON.stringify(input)})});
  let raw;try{raw=await response.json()}catch{return res.status(502).json({error:`模型网关响应异常（HTTP ${response.status}）`})}
  if(!response.ok)return res.status(response.status).json({error:raw?.error?.message||'CloseAI 请求失败'});
  try{return res.status(200).json(normalize(jsonParse(outputText(raw)),validIds))}catch(e){return res.status(502).json({error:`模型返回结果无法解析，请重试。${e.message}`})}
 }catch(e){return res.status(500).json({error:String(e?.message||e)})}
}
