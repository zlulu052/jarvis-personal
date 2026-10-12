function outText(d){if(d.output_text)return d.output_text;let s="";for(const i of d.output||[])for(const c of i.content||[])if(c.type==="output_text"&&c.text)s+=c.text;return s.trim()}
function parse(s){return JSON.parse(s.trim().replace(/^```json\s*/i,"").replace(/^```\s*/,"").replace(/```$/,"").trim())}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const key=process.env.OPENAI_API_KEY;const base=(process.env.OPENAI_API_BASE||"https://api.openai-proxy.org/v1").replace(/\/$/,"");const model=process.env.OPENAI_MODEL;if(!key)return res.status(500).json({error:"服务器尚未配置 OPENAI_API_KEY"});if(!model)return res.status(500).json({error:"服务器尚未配置 OPENAI_MODEL"});
 try{
  const b=req.body||{};
  const instructions=`你是Jarvis的进度教练。根据原计划、用户本次汇报和近期记录，判断真实进度并调整下一步。
不要因为一次没完成就推倒重来；优先识别阻力、调整负荷、维持连续性。
只返回合法JSON：
{"progress_percent":0,"status":"正常/落后/超前/需要调整","advice":"包含复盘、原因判断、接下来7天详细行动清单","adjustments":["..."],"next_milestone":"..."}`;
  const input=JSON.stringify({profile:b.profile||{},plan:b.plan||{},checkin:b.checkin||"",recent:b.recent||[]},null,2);
  const r=await fetch(`${base}/responses`,{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,instructions,input})});
  const d=await r.json();if(!r.ok)return res.status(r.status).json({error:d?.error?.message||"OpenAI API 调用失败"});
  try{return res.status(200).json(parse(outText(d)))}catch{return res.status(500).json({error:"进度复盘结果解析失败，请重试"})}
 }catch(e){return res.status(500).json({error:String(e?.message||e)})}
}