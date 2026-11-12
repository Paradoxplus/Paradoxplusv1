import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
const htmlPath = path.join(process.cwd(), "dashboard", "index.html");
const json = (res,status,data) => { res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}); res.end(JSON.stringify(data)); };
const cookies = h => Object.fromEntries((h||"").split(";").map(x=>x.trim().split(/=(.*)/s).slice(0,2)).filter(x=>x.length===2));
const equal = (a,b) => { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && crypto.timingSafeEqual(x,y); };
export function startDashboard({client,getGuildConfig,saveDatabase}) {
 const password=process.env.DASHBOARD_PASSWORD, secret=process.env.DASHBOARD_SESSION_SECRET, guildId=process.env.DASHBOARD_GUILD_ID;
 if(!password || password.length<16 || !secret || secret.length<32 || !/^\d{17,20}$/.test(guildId||"")) {
  console.warn("Dashboard disabled: set DASHBOARD_PASSWORD (16+ chars), DASHBOARD_SESSION_SECRET (32+ chars), and DASHBOARD_GUILD_ID."); return;
 }
 const sign=v=>crypto.createHmac("sha256",secret).update(v).digest("base64url");
 const pack=v=>{const b=Buffer.from(JSON.stringify(v)).toString("base64url");return b+"."+sign(b);};
 const unpack=v=>{if(!v)return null;const [b,s]=v.split(".");if(!b||!s||!equal(s,sign(b)))return null;try{const x=JSON.parse(Buffer.from(b,"base64url").toString());return x.admin===true&&x.expiresAt>Date.now()?x:null;}catch{return null;}};
 const body=req=>new Promise((resolve,reject)=>{let raw="";req.on("data",c=>{raw+=c;if(raw.length>20000){reject(Error("Request too large"));req.destroy();}});req.on("end",()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(Error("Invalid JSON"));}});});
 const attempts=new Map();
 const server=http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,"http://localhost"), cookie=cookies(req.headers.cookie);
   if(req.method==="POST"&&url.pathname==="/auth/login"){
    const ip=req.socket.remoteAddress||"unknown",now=Date.now();let a=attempts.get(ip)||{count:0,until:now+600000};
    if(a.until<now)a={count:0,until:now+600000};if(a.count>=8)return json(res,429,{error:"Too many attempts. Wait 10 minutes."});
    if(req.headers.origin&&req.headers.host&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:"Invalid request origin."});
    const input=await body(req);if(typeof input.password!=="string"||!equal(input.password,password)){a.count++;attempts.set(ip,a);return json(res,401,{error:"Incorrect dashboard password."});}
    attempts.delete(ip);const session=pack({admin:true,expiresAt:now+43200000});
    res.writeHead(200,{"set-cookie":"pp_admin="+session+"; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200","cache-control":"no-store"});return res.end(JSON.stringify({ok:true}));
   }
   if(req.method==="POST"&&url.pathname==="/auth/logout"){res.writeHead(200,{"set-cookie":"pp_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"});return res.end("ok");}
   if(url.pathname.startsWith("/api/")){
    if(!unpack(cookie.pp_admin))return json(res,401,{error:"Enter the dashboard password to continue."});
    if(req.headers.origin&&req.headers.host&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:"Invalid request origin."});
    const guild=client.guilds.cache.get(guildId);if(!guild)return json(res,503,{error:"Bot is not connected to DASHBOARD_GUILD_ID. Check the server ID."});
    if(req.method==="GET"&&url.pathname==="/api/me")return json(res,200,{guild:{id:guild.id,name:guild.name,icon:guild.iconURL({size:128})}});
    const match=url.pathname.match(/^\/api\/guild\/(\d+)(?:\/(roles|settings))?$/);
    if(!match||match[1]!==guildId)return json(res,404,{error:"This dashboard is restricted to its configured server."});
    const config=getGuildConfig(guildId),bot=guild.members.me??await guild.members.fetchMe();
    if(req.method==="GET"){
     await guild.roles.fetch();
     const info=r=>({id:r.id,name:r.name,position:r.position,color:r.hexColor,managed:r.managed,editable:r.editable});
     const ranks=config.ranks.map(r=>guild.roles.cache.get(r.id)).filter(Boolean).map(info);
     const ignored=config.ignoredRoleIds.map(id=>guild.roles.cache.get(id)).filter(Boolean).map(info);
     const available=guild.roles.cache.filter(r=>r.id!==guildId&&!r.managed).sort((a,b)=>a.position-b.position).map(info);
     const channels=guild.channels.cache.filter(c=>c.isTextBased()&&c.guildId===guildId).map(c=>({id:c.id,name:c.name}));
     return json(res,200,{guild:{id:guild.id,name:guild.name,icon:guild.iconURL({size:128})},ranks,ignored,available,channels,logChannelId:config.logChannelId||"",announceChannelId:config.announceChannelId||"",botReady:true});
    }
    if(req.method==="POST"){
     const input=await body(req);
     if(url.pathname.endsWith("/roles")){
      const role=guild.roles.cache.get(String(input.roleId||""));if(!role||role.id===guildId||role.managed)return json(res,400,{error:"Choose a normal server role."});
      if(input.action==="add"){if(role.position>=bot.roles.highest.position||!role.editable)return json(res,400,{error:"Move the bot's role above this role first."});const position=Math.max(1,Math.min(100,Number(input.position)||config.ranks.length+1));config.ranks=config.ranks.filter(r=>r.id!==role.id&&r.position!==position);config.ranks.push({id:role.id,position});config.ranks.sort((a,b)=>a.position-b.position);config.ignoredRoleIds=config.ignoredRoleIds.filter(id=>id!==role.id);}
      else if(input.action==="remove")config.ranks=config.ranks.filter(r=>r.id!==role.id);
      else if(input.action==="ignore"){config.ranks=config.ranks.filter(r=>r.id!==role.id);if(!config.ignoredRoleIds.includes(role.id))config.ignoredRoleIds.push(role.id);}
      else if(input.action==="unignore")config.ignoredRoleIds=config.ignoredRoleIds.filter(id=>id!==role.id);
      else return json(res,400,{error:"Unknown role action."});
     } else if(url.pathname.endsWith("/settings")){
      for(const key of ["logChannelId","announceChannelId"]){const id=input[key]||null;if(id&&!guild.channels.cache.get(id)?.isTextBased())return json(res,400,{error:"Choose a valid text channel."});config[key]=id;}
     } else return json(res,404,{error:"Not found."});
     await saveDatabase();return json(res,200,{ok:true});
    }
    return json(res,405,{error:"Method not allowed."});
   }
   if(req.method==="GET"&&(url.pathname==="/"||url.pathname==="/index.html")){const page=await fs.readFile(htmlPath);res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});return res.end(page);}
   res.writeHead(404,{"content-type":"text/plain"});res.end("Not found");
  } catch(error){console.error("Dashboard error:",error);if(!res.headersSent)json(res,500,{error:"Dashboard request failed. Check hosting logs."});else res.end();}
 });
 const port=Number(process.env.PORT)||3000;server.listen(port,"0.0.0.0",()=>console.log("Paradoxplus single-server dashboard listening on port "+port));
}
