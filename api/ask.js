function outText(d){if(d.output_text)return d.output_text;let s='';for(const i of d.output||[])for(const c of i.content||[])if(c.type==='output_text'&&c.text)s+=c.text;return s.trim()}
function parse(s){return JSON.parse(String(s||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```$/,'').trim())}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});const key=process.env.OPENAI_API_KEY,base=(process.env.OPENAI_API_BASE||'https://api.openai-proxy.org/v1').replace(/\/$/,''),model=process.env.OPENAI_MODEL;if(!key||!model)return res.status(500).json({error:'服务器 API 配置不完整'});
 try{const b=req.body||{};const instructions=`你是 Jarvis，一个“高上下文个人导师”：长期了解用户，但绝不假装全知。
你要结合用户长期档案、阶段总结、活跃计划、相关生活记录、专题记录和问答历史回答用户的问题。

核心规则：
- 知道的说清楚；推测的标明推测；不知道的主动问。
- 若缺少会显著改变结论的事实，need_clarification=true，只问1-3个最关键问题，先不下实质性结论。
- 关系问题：可以使用依恋理论、边界、沟通模式、认知偏差等框架，但不能诊断依恋类型，不能猜他人真实动机。区分“对方明确说/做了什么”和“用户的解释”。
- 工作/学习/习惯问题：可用认知负荷、自我效能、执行意图、习惯回路、拖延的情绪调节模型等。
- 心理学理论是解释框架，不是医学或心理诊断。健康、法律、财务高风险问题要提示专业支持边界。
- 建议必须具体可执行，优先给1-4个动作，并说明为什么。
- 尽量引用具体历史模式或日期/事件类型，但不要伪造。

只返回合法JSON。
信息不足：{"need_clarification":true,"answer":"说明为什么暂时不能可靠下结论","questions":[{"question":"...","reason":"..."}],"evidence":[],"psychology":null,"alternatives":[],"actions":[],"caution":""}
信息足够：{"need_clarification":false,"answer":"核心回答，150-350字","evidence":["具体记录/趋势依据"],"psychology":{"theory":"相关理论或概念","analysis":"如何解释用户当前情况","limit":"适用边界"},"alternatives":["其他合理解释"],"actions":[{"action":"可以马上执行的动作"}],"questions":[],"caution":"必要提醒"}`;
  const input=JSON.stringify({space:b.space||{},question:b.question||'',image_context:b.image_context||null,profile:b.profile||{},summaries:b.summaries||[],active_plans:b.active_plans||[],recent:b.recent||[],relevant:b.relevant||[],conversation_history:b.conversation_history||[]},null,2);
  const r=await fetch(`${base}/responses`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions,input})});const d=await r.json();if(!r.ok)return res.status(r.status).json({error:d?.error?.message||'模型调用失败'});try{return res.status(200).json(parse(outText(d)))}catch{return res.status(500).json({error:'Jarvis 问答结构解析失败，请重试'})}
 }catch(e){return res.status(500).json({error:String(e?.message||e)})}
}
