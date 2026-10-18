// Real web search via Tavily. Personal server key, not exposed to browser.
export default async function handler(req,res){
 if(req.method==='GET')return res.status(200).json({configured:Boolean(process.env.TAVILY_API_KEY),provider:'Tavily'});
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const key=process.env.TAVILY_API_KEY;
 if(!key)return res.status(503).json({error:'联网检索未配置：请在 Vercel 添加 TAVILY_API_KEY 环境变量后重新部署。',code:'SEARCH_NOT_CONFIGURED'});
 const query=String(req.body?.query||'').trim().slice(0,300);
 if(query.length<2)return res.status(400).json({error:'请输入至少两个字的检索内容。'});
 try{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),16000);
  let r;
  try{r=await fetch('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({query,search_depth:'basic',max_results:5,include_answer:false,include_raw_content:false,include_images:false}),signal:controller.signal})}finally{clearTimeout(timer)}
  const data=await r.json().catch(()=>({}));
  if(!r.ok)return res.status(r.status).json({error:data?.detail?.error||data?.error?.message||data?.error||`搜索服务返回 ${r.status}`});
  const results=(Array.isArray(data.results)?data.results:[]).filter(x=>{try{return ['http:','https:'].includes(new URL(x.url).protocol)}catch{return false}}).slice(0,5).map(x=>({title:String(x.title||'网页来源').slice(0,180),url:String(x.url).slice(0,1500),content:String(x.content||'').slice(0,750)}));
  return res.status(200).json({query,results,provider:'Tavily'});
 }catch(e){return res.status(502).json({error:e.name==='AbortError'?'网络检索超时，请稍后重试。':`网络检索失败：${String(e.message||e)}`})}
}
