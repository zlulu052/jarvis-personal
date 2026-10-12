function outText(d){if(d.output_text)return d.output_text;let s="";for(const i of d.output||[])for(const c of i.content||[])if(c.type==="output_text"&&c.text)s+=c.text;return s.trim()}
function parse(s){return JSON.parse(s.trim().replace(/^```json\s*/i,"").replace(/^```\s*/,"").replace(/```$/,"").trim())}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const key=process.env.OPENAI_API_KEY;const base=(process.env.OPENAI_API_BASE||"https://api.openai-proxy.org/v1").replace(/\/$/,"");const model=process.env.OPENAI_MODEL;if(!key)return res.status(500).json({error:"服务器尚未配置 OPENAI_API_KEY"});if(!model)return res.status(500).json({error:"服务器尚未配置 OPENAI_MODEL"});
 try{
  const b=req.body||{};
  const instructions=`你是Jarvis的长期计划引擎。根据用户目标、基础、时间与约束，制定可执行、可跟踪、可调整的计划。
必须有阶段、有清单、有里程碑、有量化指标、有复盘规则、有失败后的调整方案。不要空泛。
如果是健身或健康目标，要保守渐进，不做诊断，并在warning_signs中写明异常情况。
只返回合法JSON，不要markdown：
{
"plan_title":"...",
"goal":"...",
"duration_weeks":12,
"success_metrics":["..."],
"tracking_fields":["..."],
"milestones":[{"period":"第1-2周","objective":"...","checklist":["..."]}],
"weekly_template":[{"day":"周一","tasks":[{"task":"...","minutes":30,"metric":"..."}]}],
"first_7_days":[{"day":"第1天","tasks":[{"task":"...","minutes":20}]}],
"review_rules":["..."],
"fallback_rules":["..."],
"warning_signs":["..."]
}`;
  const input=JSON.stringify({profile:b.profile||{},goal:b.goal||"",current:b.current||"",constraints:b.constraints||"",deadline:b.deadline||"",time_budget:b.time_budget||"",pace:b.pace||"稳健",metric:b.metric||"",summaries:b.summaries||[]},null,2);
  const r=await fetch(`${base}/responses`,{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,instructions,input})});
  const d=await r.json();if(!r.ok)return res.status(r.status).json({error:d?.error?.message||"OpenAI API 调用失败"});
  try{return res.status(200).json(parse(outText(d)))}catch{return res.status(500).json({error:"计划生成完成，但结构解析失败，请重试一次"})}
 }catch(e){return res.status(500).json({error:String(e?.message||e)})}
}