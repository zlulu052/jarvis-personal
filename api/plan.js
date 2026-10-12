function outText(d){if(d.output_text)return d.output_text;let s='';for(const i of d.output||[])for(const c of i.content||[])if(c.type==='output_text'&&c.text)s+=c.text;return s.trim()}
function parse(s){return JSON.parse(String(s||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```$/,'').trim())}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const key=process.env.OPENAI_API_KEY,base=(process.env.OPENAI_API_BASE||'https://api.openai-proxy.org/v1').replace(/\/$/,''),model=process.env.OPENAI_MODEL;
 if(!key||!model)return res.status(500).json({error:'服务器 API 配置不完整'});
 try{
  const b=req.body||{};
  const instructions=`你是 Jarvis 的长期计划引擎。根据用户目标、基础、时间和约束制定可执行、可跟踪、可调整的计划。
要求：具体，不写鸡汤；阶段负荷渐进；有成功标准、里程碑、每周模板、前7天清单、复盘规则和失败后的降级方案。
健康/健身类目标不做诊断，遇异常症状要提示暂停并寻求专业评估。
只返回合法JSON：
{"plan_title":"...","goal":"...","duration_weeks":12,"success_metrics":["..."],"tracking_fields":["..."],"milestones":[{"period":"第1-2周","objective":"...","checklist":["..."]}],"weekly_template":[{"day":"周一","tasks":[{"task":"...","minutes":30,"metric":"..."}]}],"first_7_days":[{"day":"第1天","tasks":[{"task":"...","minutes":20}]}],"review_rules":["..."],"fallback_rules":["..."],"warning_signs":["..."]}`;
  const input=JSON.stringify({profile:b.profile||{},goal:b.goal||'',current:b.current||'',constraints:b.constraints||'',deadline:b.deadline||'',time_budget:b.time_budget||'',pace:b.pace||'稳健',metric:b.metric||'',summaries:b.summaries||[]},null,2);
  const r=await fetch(`${base}/responses`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions,input})});const d=await r.json();if(!r.ok)return res.status(r.status).json({error:d?.error?.message||'模型调用失败'});try{return res.status(200).json(parse(outText(d)))}catch{return res.status(500).json({error:'计划生成完成，但结构解析失败，请重试'})}
 }catch(e){return res.status(500).json({error:String(e?.message||e)})}
}
