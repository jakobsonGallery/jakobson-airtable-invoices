import { randomBytes, timingSafeEqual } from "node:crypto";

const BASE = "appZQ3yquS8uPXZy6";
const DEMANDES = "tblPyD8fldWdXOJ9d";
const OEUVRES = "tblwzvPNp07L2pu4Y";
const F = {
  name:"fldZ0oCVWFzVxkpfP", name2:"fldY0TyHLQaa9uvIl", lieu:"fldLDsAr9AUBQVafw",
  phone:"fld1lt3u1iEunwGh7",email:"fldpqFFD21q6W7eNW",date:"fldDXzbMGcAe2ps3R",
  status:"fldeKzv5sKJvUVf9n", notes:"fld8sxqmTzxjFGCdx",works:"fldnYt9Gmnmtze15y",
  origin:"fldPAPWhvPQAT9GHS",proposed:"flddSpVLiWpoAQtIe",ref:"fldWcejnf8klyosSo",
  link:"fldce56O9JAUWhkD1",last:"fldQImZQtjAxTNhp3",next:"fldHYVsymWvmY6JIz",
  catalogueState:"flddHyI8gyDmJ0vgP"
};
const W={title:"fldEB4ApP5ajbkg4L",artist:"fldHhZUoLG8Ht5fkZ",photo:"fldmZixVmqpdLfbym",
  dims:"fldZQrcXm9Ds4b36U",price:"fldUXO9urG4jtloM9",dispo:"fldbMqcgEy7ruQqGp"};
const FIELDIDS = Object.values(F);
const WORKIDS=Object.values(W);
const api="https://api.airtable.com/v0/"+BASE;
const isId=id=>/^rec[A-Za-z0-9]{14}$/.test(String(id||""));
function equal(a,b){const x=Buffer.from(String(a||""));const y=Buffer.from(String(b||""));return x.length===y.length && timingSafeEqual(x,y);}
function auth(req){const s=process.env.ART_MIAMI_SECRET;const h=String(req.headers.authorization||"");return !!s&&equal(h,"Bearer "+s);}
async function query(table,opts={}){
 const u=new URL(api+"/"+table);
 u.searchParams.set("returnFieldsByFieldId","true");
 if(opts.fields)for(const f of opts.fields)u.searchParams.append("fields[]",f);
 if(opts.offset)u.searchParams.set("offset",opts.offset);
 if(opts.filter)u.searchParams.set("filterByFormula",opts.filter);
 u.searchParams.set("pageSize","100");
 return request(u.toString());
}
async function request(url,method="GET",fields){
 const r=await fetch(url,{method,headers:{Authorization:"Bearer "+process.env.AIRTABLE_TOKEN,"Content-Type":"application/json"},...(fields?{body:JSON.stringify({fields})}:{})});
 const body=await r.json().catch(()=>({}));
 if(!r.ok){console.error("Airtable error",r.status,body?.error?.type);throw Object.assign(new Error("Airtable "+r.status),{status:502});}
 return body;
}
async function all(table,fields,filter){
 const out=[];let offset;
 do{const r=await query(table,{fields,filter,offset});out.push(...r.records);offset=r.offset;}while(offset);
 return out;
}
function fieldsOf(r){return r?.fields||{};}
function isMiami(r){const f=fieldsOf(r);return f[F.lieu]==="ART MIAMI 2026" || f[F.origin]==="ART MIAMI 2026";}
function mapLead(r){
 const f=fieldsOf(r);
 return {id:r.id,name:f[F.name]||f[F.name2]||"",phone:f[F.phone]||"",email:f[F.email]||"",
  notes:f[F.notes]||"",workIds:f[F.works]||[],status:f[F.status]||"À traiter",
  selectionUrl:f[F.link]||"",lastContact:f[F.last]||"",nextContact:f[F.next]||"",
  createdAt:r.createdTime};
}
function mapWork(r){const f=fieldsOf(r);const p=(f[W.photo]||[])[0];return {
 id:r.id,title:f[W.title]||"",artist:f[W.artist]||"",dimensions:f[W.dims]||"",
 price:f[W.price]??null,image:p?.thumbnails?.large?.url||p?.url||"",available:f[W.dispo]??null
};}
async function getRecord(id,table=DEMANDES){if(!isId(id))throw Object.assign(new Error("Invalid record"),{status:400});return request(api+"/"+table+"/"+id+"?returnFieldsByFieldId=true");}
function noteAppend(old,newNote){const line=String(newNote||"").trim().slice(0,2000);if(!line)return old||"";if(!old)return line;return (old+"\n"+line).slice(-90000);}
function selectionUrl(req,id,token){const host=(process.env.PUBLIC_BASE_URL||"https://jakobson-airtable-invoices.vercel.app").replace(/\/$/,"");return host+"/art-miami.html?selection="+encodeURIComponent(id)+"."+encodeURIComponent(token);}
async function readPublic(req,res,u){
 const [id,token]=String(u.searchParams.get("selection")||"").split(".");
 if(!isId(id)||!token||!/^[-_A-Za-z0-9]{35,}$/.test(token))return res.status(404).json({error:"Sélection introuvable"});
 const record=await getRecord(id);const f=fieldsOf(record);
 if(!isMiami(record)||!equal(f[F.ref],token))return res.status(404).json({error:"Sélection introuvable"});
 const ids=(f[F.works]||[]).filter(isId).slice(0,50);
 const works=await Promise.all(ids.map(async id=>mapWork(await getRecord(id,OEUVRES))));
 res.setHeader("Cache-Control","no-store");
 return res.status(200).json({works});
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 try {
  const u=new URL(req.url,"https://local");
  if(req.method==="GET"&&u.searchParams.has("selection"))return await readPublic(req,res,u);
  if(!auth(req))return res.status(401).json({error:"Accès réservé à l'équipe"});
  const action=u.searchParams.get("action");
  if(req.method==="GET"&&action==="works"){
   const r=await all(OEUVRES,WORKIDS);
   return res.status(200).json({works:r.map(mapWork).filter(w=>w.title)});
  }
  if(req.method==="GET"&&action==="leads"){
   const r=await all(DEMANDES,FIELDIDS,"{LIEU}='ART MIAMI 2026'");
   return res.status(200).json({leads:r.filter(isMiami).map(mapLead)});
  }
  if(req.method==="POST"&&action==="upsert"){
   const x=req.body||{};
   const name=String(x.name||"").trim().slice(0,200),phone=String(x.phone||"").trim().slice(0,70),
     email=String(x.email||"").trim().toLowerCase().slice(0,250);
   if(!name||(!phone&&!email))return res.status(400).json({error:"Nom et téléphone ou e-mail nécessaires"});
   if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"E-mail incorrect"});
   const incoming=Array.isArray(x.workIds)?[...new Set(x.workIds.filter(isId))].slice(0,50):[];
   const works=incoming.length?await Promise.all(incoming.map(id=>getRecord(id,OEUVRES))):[];
   const summary=works.map(r=>{const f=fieldsOf(r);return (f[W.artist]||"")+" — "+(f[W.title]||"");}).join("\n");
   const validStatus=["À traiter","En cours","Relance à faire","Devis envoyé","Confirmé"];
   const fields={
    [F.name]:name,[F.lieu]:"ART MIAMI 2026",[F.origin]:"ART MIAMI 2026",
    [F.phone]:phone||null,[F.email]:email||null,[F.works]:incoming,[F.proposed]:summary,
    [F.status]:validStatus.includes(x.status)?x.status:"À traiter"
   };
   let current=null;
   if(x.id){current=await getRecord(x.id);if(!isMiami(current))return res.status(403).json({error:"Prospect hors Art Miami"});}
   else {
    const r=await all(DEMANDES,[F.name,F.email,F.phone,F.lieu,F.origin,F.ref],"{LIEU}='ART MIAMI 2026'");
    current=r.find(r=>{const f=fieldsOf(r);return (email&&f[F.email]?.toLowerCase()===email)||(phone&&f[F.phone]?.replace(/\D/g,"")===phone.replace(/\D/g,""));})||null;
   }
   if(current){
    if(x.notes!==undefined)fields[F.notes]=String(x.notes).slice(0,90000);
    const r=await request(api+"/"+DEMANDES+"/"+current.id,"PATCH",fields);
    return res.status(200).json({lead:mapLead(r),reused:true});
   }
   const key=randomBytes(32).toString("base64url");
   fields[F.notes]=String(x.notes||"").slice(0,90000);
   fields[F.ref]=key;
   fields[F.date]=new Date().toISOString().slice(0,10);
   const record=await request(api+"/"+DEMANDES,"POST",fields);
   const url=selectionUrl(req,record.id,key);
   const r=await request(api+"/"+DEMANDES+"/"+record.id,"PATCH",{[F.link]:url,[F.catalogueState]:"Actif"});
   return res.status(201).json({lead:mapLead(r),reused:false});
  }
  if(req.method==="POST"&&action==="log"){
   const x=req.body||{};const r=await getRecord(x.id);
   if(!isMiami(r))return res.status(403).json({error:"Prospect hors Art Miami"});
   const event=String(x.event||"").slice(0,180);
   if(!["WhatsApp préparé","E-mail préparé","WhatsApp envoyé (confirmé)","E-mail envoyé (confirmé)","Relance effectuée","Note"].includes(event))return res.status(400).json({error:"Action invalide"});
   const time=new Date().toISOString();
   const note= "["+time+"] "+event+(x.note?" — "+String(x.note).slice(0,700):"");
   const fields={[F.notes]:noteAppend(fieldsOf(r)[F.notes],note)};
   if(event.includes("confirmé")||event==="Relance effectuée")fields[F.last]=time.slice(0,10);
   if(x.nextContact&&/^\d{4}-\d{2}-\d{2}$/.test(x.nextContact))fields[F.next]=x.nextContact;
   const updated=await request(api+"/"+DEMANDES+"/"+x.id,"PATCH",fields);
   return res.status(200).json({lead:mapLead(updated)});
  }
  return res.status(405).json({error:"Méthode non autorisée"});
 }catch(e){console.error("Art Miami",e.message);return res.status(e.status||500).json({error:e.status===502?"Erreur de connexion Airtable":e.status===400?e.message:"Erreur du serveur"});}
}
