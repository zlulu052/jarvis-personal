function outText(d){
 if(d.output_text)return d.output_text;
 let s="";for(const i of d.output||[])for(const c of i.content||[])if(c.type==="output_text"&&c.text)s+=c.text;
 return s.trim();
}
function parseJSON(s){
 return JSON.parse(s.trim().replace(/^```json\s*/i,"").replace(/^```\s*/,"").replace(/```$/,"").trim())
}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const key=process.env.OPENAI_API_KEY;
 if(!key)return res.status(500).json({error:"服务器尚未配置 OPENAI_API_KEY"});
 try{
  const b=req.body||{};
  const highStakes=/女友|男友|恋爱|感情|分手|婚姻|离婚|辞职|换工作|职业|买房|买车|借钱|投资|债务|重大消费|人生规划|健康|症状|用药|治疗/.test(String(b.text||""));
  const depth=b.mode==="life"?"人生级":b.mode==="deep"?"深度":"快速";
  const instructions=`你是Jarvis，用户的长期私人管家、决策助手和执行教练。当前分析深度：${depth}。

最重要规则：先判断“现有信息是否足以可靠分析”，再决定是否回答。
- 如果缺少会显著改变结论的关键事实，必须返回 need_clarification=true。
- need_clarification=true 时，禁止先给实质性结论、禁止猜测用户或他人的动机、禁止用“可能就是……”代替追问。
- 只问最关键的1-3个问题，每个问题都要说明为什么需要。
- 对感情、职业、重大消费、长期人生规划、健康等问题，采用更严格的信息门槛。
- 如果只是缺少不影响核心判断的细节，可以继续分析，并在最后注明仍有不确定点。
- 用户补充回答后，如果信息已经足够，必须进入正式分析；如果仍不足，可以继续追问，但仍限制1-3个问题。

正式分析时：
1. 判断问题核心，不机械复述。
2. 综合长期档案、阶段总结、活跃计划、近期记录和相关旧记录。
3. 区分事实、推测、风险和建议。
4. 明确告诉用户“现在具体怎么做”。
5. 长期任务要判断是否需要建立或调整计划。
6. 重复问题要主动指出历史规律。
7. 健康、财务、法律等高风险事项不做确定性诊断或保证。

只返回合法JSON，不要markdown：
若信息不足：
{
 "need_clarification": true,
 "questions":[
   {"question":"...","reason":"为什么这条信息会显著影响判断"}
 ],
 "importance":"high"
}

若信息足够：
{
 "need_clarification": false,
 "analysis":"【问题核心】...\\n【我观察到的】...\\n【我的判断】...\\n【你现在该怎么做】...\\n【是否需要长期计划】...\\n【仍有的不确定点】...",
 "important": true
}`;

  const input=`【是否属于更严格门槛的问题】${highStakes}
【长期档案】
${JSON.stringify(b.profile||{},null,2)}
【阶段总结】
${JSON.stringify(b.summaries||[],null,2)}
【活跃计划】
${JSON.stringify(b.active_plans||[],null,2)}
【当前待补问题】
${JSON.stringify(b.pending||[],null,2)}
【近期记录】
${JSON.stringify(b.recent||[],null,2)}
【相关旧记录】
${JSON.stringify(b.relevant||[],null,2)}
【用户刚输入】
${b.text||""}`;

  const r=await fetch(`${base}/responses`,{
    method:"POST",
    headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify({model,instructions,input})
  });
  const d=await r.json();
  if(!r.ok)return res.status(r.status).json({error:d?.error?.message||"OpenAI API 调用失败"});
  try{
    const obj=parseJSON(outText(d));
    return res.status(200).json(obj);
  }catch{
    return res.status(500).json({error:"Jarvis 已生成结果，但结构解析失败，请再试一次"});
  }
 }catch(e){
   return res.status(500).json({error:String(e?.message||e)})
 }
}