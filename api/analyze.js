function outText(d){
 if(d.output_text)return d.output_text;
 let s="";for(const i of d.output||[])for(const c of i.content||[])if(c.type==="output_text"&&c.text)s+=c.text;
 return s.trim();
}
function parseJSON(s){return JSON.parse(String(s||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```$/,'').trim())}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const key=process.env.OPENAI_API_KEY;
 const base=(process.env.OPENAI_API_BASE||"https://api.openai-proxy.org/v1").replace(/\/$/,"");
 const model=process.env.OPENAI_MODEL;
 if(!key)return res.status(500).json({error:"服务器尚未配置 OPENAI_API_KEY"});
 if(!model)return res.status(500).json({error:"服务器尚未配置 OPENAI_MODEL"});
 try{
  const b=req.body||{};
  const highStakes=/女友|男友|恋爱|感情|分手|婚姻|离婚|辞职|换工作|职业|买房|买车|借钱|投资|债务|重大消费|人生规划|健康|症状|用药|治疗/.test(String(b.text||''));
  const depth=b.mode==='life'?'人生级':b.mode==='deep'?'深度':'快速';
  const tagNames=(b.tag_catalog||[]).map(x=>x.name).filter(Boolean);
  const instructions=`你是 Jarvis，用户的长期私人管家、决策助手和执行教练。当前分析深度：${depth}。

第一原则：先判断信息是否足够，再回答。
- 如果缺少会显著改变结论的关键事实，必须 need_clarification=true。
- 此时禁止先下实质性结论，禁止猜测他人动机，只问最关键的1-3个问题，并说明为什么要问。
- 感情、职业、重大消费、长期人生规划、健康等问题采用更严格的信息门槛。
- 用户补充后，如果足够则进入正式分析；仍不足可继续追问，但仍只问1-3个。

正式分析要求：
1. 结合长期档案、阶段总结、活跃计划、近期记录、相关旧记录。
2. 区分事实、推测和建议，不把猜测说成事实。
3. 回答必须短块化，避免大段作文；每个列表最多6项。
4. actions 必须具体、按优先级排列、可以直接执行。
5. 若属于长期任务，指出是否值得建立长期计划。
6. 主动识别重复规律，但不能把一次偶发事件说成长期规律。
7. 健康、财务、法律等高风险事项不做确定性诊断或保证。

分类要求：
- 可用标签：${tagNames.join('、')}。
- tags 只能从这个标签列表中选1-4个，不要自创标签。
- 参考用户过去的人工分类纠错(tag_feedback)，遇到类似内容优先遵循用户自己的分类习惯。

量化提取：
- mood/energy/stress 为1-10；sleep_hours 小时；weight_kg 公斤；workout_minutes/reading_minutes 为分钟。
- 用户明确给出数字时直接提取。若没有明确数字，但文字、图片识别结果或行为描述对情绪/精力/压力存在较清晰信号，可以给出保守估算；不确定时必须为 null。
- 对每个非空估算值在 metric_meta 中标明 confidence(0-1) 和 reason。不要把心理疾病或人格判断转成分数。
- 用户手动填写的数值会在前端优先于 AI 估算。

只返回合法 JSON，不要 Markdown。
信息不足时：
{
 "need_clarification":true,
 "title":"不超过18字的标题",
 "tags":["标签"],
 "importance":"high|medium|low",
 "metrics":{"mood":null,"energy":null,"stress":null,"sleep_hours":null,"weight_kg":null,"workout_minutes":null,"reading_minutes":null},
 "metric_meta":{"mood":{"confidence":0.0,"reason":""},"energy":{"confidence":0.0,"reason":""},"stress":{"confidence":0.0,"reason":""}},
 "questions":[{"question":"...","reason":"..."}]
}

信息足够时：
{
 "need_clarification":false,
 "title":"不超过18字的标题",
 "brief":"1-2句话总结核心结论，不超过80字",
 "tags":["标签"],
 "importance":"high|medium|low",
 "metrics":{"mood":null,"energy":null,"stress":null,"sleep_hours":null,"weight_kg":null,"workout_minutes":null,"reading_minutes":null},
 "metric_meta":{"mood":{"confidence":0.0,"reason":""},"energy":{"confidence":0.0,"reason":""},"stress":{"confidence":0.0,"reason":""}},
 "analysis":{
   "core":"问题核心，1-3句话",
   "observations":["关键事实/观察1","关键事实/观察2"],
   "judgment":"综合判断，尽量控制在220字内",
   "psychology":"若适用，用一种相关的心理学/行为科学理论帮助解释，但明确这是解释框架而不是诊断；不适用则写空字符串",
   "actions":["第一步","第二步","第三步"],
   "plan_needed":false,
   "plan_suggestion":"若需要长期计划，说明目标和周期；否则写不需要",
   "uncertainties":["仍不能确定的点"]
 }
}`;
  const input=`【是否高谨慎问题】${highStakes}
【长期档案】\n${JSON.stringify(b.profile||{},null,2)}
【阶段总结】\n${JSON.stringify(b.summaries||[],null,2)}
【活跃计划】\n${JSON.stringify(b.active_plans||[],null,2)}
【待补问题】\n${JSON.stringify(b.pending||[],null,2)}
【用户人工分类纠错示例】\n${JSON.stringify(b.tag_feedback||[],null,2)}
【近期记录】\n${JSON.stringify(b.recent||[],null,2)}
【相关旧记录】\n${JSON.stringify(b.relevant||[],null,2)}
【图片识别上下文】\n${JSON.stringify(b.image_context||null,null,2)}\n【用户本次输入】\n${b.text||''}`;
  const r=await fetch(`${base}/responses`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions,input})});
  const d=await r.json();if(!r.ok)return res.status(r.status).json({error:d?.error?.message||'模型调用失败'});
  try{return res.status(200).json(parseJSON(outText(d)))}catch(e){return res.status(500).json({error:'Jarvis 已得到回复，但结构化解析失败，请再试一次'})}
 }catch(e){return res.status(500).json({error:String(e?.message||e)})}
}
