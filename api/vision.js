function outText(d){if(d.output_text)return d.output_text;let s='';for(const i of d.output||[])for(const c of i.content||[])if(c.type==='output_text'&&c.text)s+=c.text;return s.trim()}
function parse(s){return JSON.parse(String(s||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```$/,'').trim())}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});const key=process.env.OPENAI_API_KEY,base=(process.env.OPENAI_API_BASE||'https://api.openai-proxy.org/v1').replace(/\/$/,''),model=process.env.OPENAI_MODEL;if(!key||!model)return res.status(500).json({error:'服务器 API 配置不完整'});
 try{const b=req.body||{};if(!String(b.image||'').startsWith('data:image/'))return res.status(400).json({error:'没有可识别的图片'});const tags=(b.tag_catalog||[]).map(x=>x.name).filter(Boolean);
  const instructions=`你是 Jarvis 的图片理解模块。读取用户主动上传的图片，只提取与个人记录有用的信息。不要做人脸身份识别，不要从外貌推断敏感属性或心理状态。
可以识别：截图文字、运动/体重/睡眠数据、餐食、书页/笔记、日程、聊天内容的字面事实、其他生活场景。
聊天截图只总结“画面中明确写了什么”，不要猜对方动机。
量化字段只有明确看到数字时才填写；mood/energy/stress 不要仅凭人物表情估算。
可用标签：${tags.join('、')}。
只返回合法JSON：{"summary":"一句话说明图片里最重要的信息","description":"较完整描述","extracted_text":"可辨认的关键文字，过长则摘要","suggested_note":"适合保存进生活记录的一段简洁文字","tags":["只从可用标签中选0-4个"],"metrics":{"mood":null,"energy":null,"stress":null,"sleep_hours":null,"weight_kg":null,"workout_minutes":null,"reading_minutes":null},"questions":["若图片语境不清，可给0-2个补充问题"]}`;
  const input=[{role:'user',content:[{type:'input_text',text:'请识别这张用户主动上传的图片，并转换成结构化生活记录。'},{type:'input_image',image_url:b.image}]}];
  const r=await fetch(`${base}/responses`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions,input})});const d=await r.json();if(!r.ok)return res.status(r.status).json({error:d?.error?.message||'模型识图失败'});try{return res.status(200).json(parse(outText(d)))}catch{return res.status(500).json({error:'图片识别结果解析失败，请重试'})}
 }catch(e){return res.status(500).json({error:String(e?.message||e)})}
}
