function outText(d){if(d.output_text)return d.output_text;let s='';for(const i of d.output||[])for(const c of i.content||[])if(c.type==='output_text'&&c.text)s+=c.text;return s.trim()}
function parse(s){return JSON.parse(String(s||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```$/,'').trim())}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const key=process.env.OPENAI_API_KEY,base=(process.env.OPENAI_API_BASE||'https://api.openai-proxy.org/v1').replace(/\/$/,''),model=process.env.OPENAI_MODEL;if(!key||!model)return res.status(500).json({error:'服务器 API 配置不完整'});
 try{
  const b=req.body||{};
  const instructions=`你是 Jarvis 的长期趋势分析器和个人成长教练。你收到用户本地程序的统计数据、真实记录、高频标签、标签共现和一个可选的重点主题。
目标不是给一句“注意休息”，而是解释：发生了什么、哪些证据支持、可能为什么、是否有重复模式、用户下一步怎样验证和改善。

规则：
1. 只能依据提供的数据和记录，不虚构因果；相关不等于因果。
2. 样本不足、指标覆盖不足时明确指出，不要强行分析。
3. 可以使用心理学/行为科学知识（如 CBT 的想法-情绪-行为链、拖延的情绪调节模型、认知负荷、自我效能、习惯回路、决策疲劳、依恋理论等），但理论只作为解释框架，禁止凭少量记录给用户贴人格或疾病标签。
4. 对关系事件不要猜测他人内心；分清用户记录的事实、可检验假设和建议。
5. 对高频标签，优先分析其相关事件、共现标签、前后状态变化和重复条件。
6. 建议必须具体可执行，最好是 3-7 天的小实验，并写清“为什么、怎么做、如何验证”。
7. 输出适合手机阅读，但可以比旧版更详细。

只返回合法 JSON：
{
 "headline":"一句话核心判断",
 "summary":"80-180字总体趋势说明",
 "data_evidence":["3-6条具体数据或记录依据"],
 "patterns":["2-5条重复模式或值得注意的关联"],
 "focus_analysis":"围绕重点高频主题/事件的具体分析；没有则为空字符串",
 "psychology_lens":{"theory":"最相关的一种理论/概念","application":"它如何帮助理解当前记录","limits":"为什么不能据此做确定性诊断"},
 "actions":[{"action":"具体动作","why":"为什么优先做","how":"执行步骤","measure":"3-7天后用什么指标验证"}],
 "questions_to_track":["接下来值得继续记录的2-4个问题"],
 "caveat":"必要的不确定性说明"
}`;
  const input=JSON.stringify({range:b.range,focus_tag:b.focus_tag,profile:b.profile||{},stats:b.stats||{},summaries:b.summaries||[],entries:b.entries||[],focus_events:b.focus_events||[]},null,2);
  const r=await fetch(`${base}/responses`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions,input})});
  const d=await r.json();if(!r.ok)return res.status(r.status).json({error:d?.error?.message||'模型调用失败'});try{return res.status(200).json(parse(outText(d)))}catch{return res.status(500).json({error:'趋势解读结构解析失败，请重试'})}
 }catch(e){return res.status(500).json({error:String(e?.message||e)})}
}
