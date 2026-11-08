import { randomBytes, timingSafeEqual } from "node:crypto";

const BASE = "appZQ3yquS8uPXZy6";
const DEMANDES = "tblPyD8fldWdXOJ9d";
const OEUVRES = "tblwzvPNp07L2pu4Y";
const MIAMI = "tblpiu248J8WdRCVq";
const MIAMI_FIELDS={ref:"fldGpDKz5qjzEL68Z",artist:"fld8dclx4VdR9e4Pe",title:"fldl0jLsC0DqR0LBC",price:"fldVuNd5oaVqptZ9Y",dims:"fldqxfSjVMkhKyppB",image:"fldnmqx0QU6nBOdgC",visible:"fldka6vvsJjG0ff6r"};
const F = {
  name:"fldZ0oCVWFzVxkpfP", name2:"fldY0TyHLQaa9uvIl", lieu:"fldLDsAr9AUBQVafw",
  phone:"fld1lt3u1iEunwGh7",email:"fldpqFFD21q6W7eNW",date:"fldDXzbMGcAe2ps3R",
  status:"fldeKzv5sKJvUVf9n", notes:"fld8sxqmTzxjFGCdx",works:"fldnYt9Gmnmtze15y",
  origin:"fldPAPWhvPQAT9GHS",proposed:"flddSpVLiWpoAQtIe",ref:"fldWcejnf8klyosSo",
  link:"fldce56O9JAUWhkD1",last:"fldQImZQtjAxTNhp3",next:"fldHYVsymWvmY6JIz",
  catalogueState:"flddHyI8gyDmJ0vgP",miamiWorks:"fldp719xSX8ZS1c0a",miamiLink:"fldmgHK9lFrXtSfn4",miamiToken:"fldE9J4agMPYqV1Re"
};
const W={title:"fldEB4ApP5ajbkg4L",artist:"fldHhZUoLG8Ht5fkZ",photo:"fldmZixVmqpdLfbym",
  dims:"fldZQrcXm9Ds4b36U",price:"fldUXO9urG4jtloM9",dispo:"fldbMqcgEy7ruQqGp"};
const FIELDIDS = Object.values(F);
const WORKIDS=Object.values(W);
const GALLERY_HOST="jakobson-selections.mccomish-patrick.chatgpt.site";
function galleryLink(v){
 try{
  const u=new URL(String(v||"").trim());
  return u.protocol==="https:"&&u.hostname===GALLERY_HOST&&/^\/c\/[a-zA-Z0-9_-]{12,}$/.test(u.pathname);
 }catch{return false;}
}
function canonicalPhone(v){let s=String(v||"").replace(/\D/g,"");if(s.startsWith("00"))s=s.slice(2);if(/^0[1-9]\d{8}$/.test(s))s="33"+s.slice(1);return s;}
function canonicalName(v){return String(v||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();}
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
  selectionUrl:f[F.link]||"",catalogueSummary:f[F.proposed]||"",miamiWorkIds:f[F.miamiWorks]||[],miamiUrl:f[F.miamiLink]||"",lastContact:f[F.last]||"",nextContact:f[F.next]||"",
  createdAt:r.createdTime};
}
function mapWork(r){const f=fieldsOf(r);const p=(f[W.photo]||[])[0];return {
 id:r.id,title:f[W.title]||"",artist:f[W.artist]||"",dimensions:f[W.dims]||"",
 price:f[W.price]??null,image:p?.thumbnails?.large?.url||p?.url||"",available:f[W.dispo]??null
};}
async function getRecord(id,table=DEMANDES){if(!isId(id))throw Object.assign(new Error("Invalid record"),{status:400});return request(api+"/"+table+"/"+id+"?returnFieldsByFieldId=true");}
function noteAppend(old,newNote){const line=String(newNote||"").trim().slice(0,2000);if(!line)return old||"";if(!old)return line;return (old+"\n"+line).slice(-90000);}
function selectionUrl(req,id,token){const host=(process.env.PUBLIC_BASE_URL||"https://jakobson-airtable-invoices.vercel.app").replace(/\/$/,"");return host+"/art-miami.html?selection="+encodeURIComponent(id)+"."+encodeURIComponent(token);}
/**
 * Airtable's POST/PATCH responses use field NAMES unless requested otherwise.
 * Always re-fetch the stored record with returnFieldsByFieldId=true before
 * mapping it to the frontend or constructing an external selection link.
 * Also backfill links on Art Miami records created before this fix.
 */
async function ensurePrivateLink(record){
 if(!isMiami(record))throw Object.assign(new Error("Prospect hors Art Miami"),{status:403});
 const f=fieldsOf(record);
 const old=typeof f[F.ref]==="string"?f[F.ref]:"";
 const key=/^[-_A-Za-z0-9]{35,}$/.test(old)?old:randomBytes(32).toString("base64url");
 const url=selectionUrl(null,record.id,key);
 if(galleryLink(f[F.link])||(!f[F.works]?.length && !f[F.link]))return record;
 if(f[F.ref]!==key||f[F.link]!==url){
  const fields={[F.ref]:key,[F.link]:url,[F.catalogueState]:"Actif"};
  await request(api+"/"+DEMANDES+"/"+record.id,"PATCH",fields);
 }
 return await getRecord(record.id);
}
function miamiPrivateUrl(id,token){const base=(process.env.PUBLIC_BASE_URL||"https://jakobson-airtable-invoices.vercel.app").replace(/\/$/,"");return base+"/art-miami.html?miami="+encodeURIComponent(id)+"."+encodeURIComponent(token);}
async function ensureMiamiLink(r){
 const f=fieldsOf(r);
 if(!isMiami(r))throw Object.assign(new Error("Prospect hors Art Miami"),{status:403});
 if(!f[F.miamiWorks]?.length)return r;
 const old=String(f[F.miamiToken]||"");
 const token=/^[-_A-Za-z0-9]{35,}$/.test(old)?old:randomBytes(32).toString("base64url");
 const url=miamiPrivateUrl(r.id,token);
 if(f[F.miamiToken]!==token||f[F.miamiLink]!==url)await request(api+"/"+DEMANDES+"/"+r.id,"PATCH",{[F.miamiToken]:token,[F.miamiLink]:url});
 return getRecord(r.id);
}
async function readPublicMiami(req,res,u){
 const [id,token]=String(u.searchParams.get("miami")||"").split(".");
 if(!isId(id)||!/^[-_A-Za-z0-9]{35,}$/.test(String(token||"")))return res.status(404).json({error:"Sélection introuvable"});
 const lead=await getRecord(id);const f=fieldsOf(lead);
 if(!isMiami(lead)||!equal(f[F.miamiToken],token))return res.status(404).json({error:"Sélection introuvable"});
 const ids=(f[F.miamiWorks]||[]).filter(isId).slice(0,50);
 const works=await Promise.all(ids.map(id=>getRecord(id,MIAMI)));
 return res.status(200).json({currency:"USD",works:works.filter(r=>fieldsOf(r)[MIAMI_FIELDS.visible]===true).map(r=>{
 const w=fieldsOf(r);return {id:r.id,title:w[MIAMI_FIELDS.title]||"",artist:w[MIAMI_FIELDS.artist]||"",dimensions:w[MIAMI_FIELDS.dims]||"",image:w[MIAMI_FIELDS.image]||"",priceUSD:w[MIAMI_FIELDS.price]??null};
 })});
}
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
  if(req.method==="GET"&&u.searchParams.has("miami"))return await readPublicMiami(req,res,u);
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
  if(req.method==="GET"&&action==="catalogSelections"){
   const email=String(u.searchParams.get("email")||"").trim().toLowerCase();
   const phone=canonicalPhone(u.searchParams.get("phone"));
   const name=canonicalName(u.searchParams.get("name"));
   if(!email&&!phone&&!name)return res.status(400).json({error:"Indiquez un contact pour retrouver une sélection"});
   const recs=await all(DEMANDES,[F.name,F.name2,F.email,F.phone,F.link,F.proposed,F.lieu,F.date]);
   const found=recs.filter(r=>{
    const f=fieldsOf(r);
    if(!galleryLink(f[F.link]))return false;
    const e=String(f[F.email]||"").trim().toLowerCase();
    const p=canonicalPhone(f[F.phone]);
    const n=canonicalName(f[F.name]||f[F.name2]);
    return Boolean((email&&e&&email===e)||(phone&&p&&phone===p)||(name&&n&&name===n));
   }).sort((a,b)=>String(b.createdTime||"").localeCompare(String(a.createdTime||""))).slice(0,12);
   return res.status(200).json({selections:found.map(r=>{const f=fieldsOf(r);return {id:r.id,name:f[F.name]||f[F.name2]||"",url:f[F.link],summary:f[F.proposed]||"",date:r.createdTime};})});
  }
  if(req.method==="POST"&&action==="upsert"){
   const x=req.body||{};
   const name=String(x.name||"").trim().slice(0,200),phone=String(x.phone||"").trim().slice(0,70),
     email=String(x.email||"").trim().toLowerCase().slice(0,250);
   if(!name||(!phone&&!email))return res.status(400).json({error:"Nom et téléphone ou e-mail nécessaires"});
   if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"E-mail incorrect"});
   const hasMiami=Array.isArray(x.miamiWorkIds);
   const miamiIds=hasMiami?[...new Set(x.miamiWorkIds.filter(isId))].slice(0,50):[];
   if(hasMiami&&miamiIds.length){
    const verified=await Promise.all(miamiIds.map(id=>getRecord(id,MIAMI)));
    if(verified.some(r=>fieldsOf(r)[MIAMI_FIELDS.visible]!==true))return res.status(400).json({error:"Une œuvre est indisponible dans le catalogue Art Miami"});
   }
   const hasWorks=Array.isArray(x.workIds);
   const incoming=hasWorks?[...new Set(x.workIds.filter(isId))].slice(0,50):[];
   const catalogueLink=String(x.catalogueLink||"").trim();
   if(catalogueLink&&!galleryLink(catalogueLink))return res.status(400).json({error:"Utilisez un lien privé /c/ provenant de Jakobson — Sélections privées"});
   const works=incoming.length?await Promise.all(incoming.map(id=>getRecord(id,OEUVRES))):[];
   const summary=works.map(r=>{const f=fieldsOf(r);return (f[W.artist]||"")+" — "+(f[W.title]||"");}).join("\n");
   const validStatus=["À traiter","En cours","Relance à faire","Devis envoyé","Confirmé"];
   const fields={
    [F.name]:name,[F.lieu]:"ART MIAMI 2026",[F.origin]:"ART MIAMI 2026",
    [F.phone]:phone||null,[F.email]:email||null,
    [F.status]:validStatus.includes(x.status)?x.status:"À traiter"
   };
   if(hasWorks){fields[F.works]=incoming;fields[F.proposed]=summary;}
   if(hasMiami){fields[F.miamiWorks]=miamiIds;}
   if(catalogueLink){fields[F.link]=catalogueLink;fields[F.catalogueState]="Actif";
    if(typeof x.catalogueSummary==="string")fields[F.proposed]=x.catalogueSummary.slice(0,90000);
   }
   let current=null;
   if(x.id){current=await getRecord(x.id);if(!isMiami(current))return res.status(403).json({error:"Prospect hors Art Miami"});}
   else {
    const r=await all(DEMANDES,[F.name,F.email,F.phone,F.lieu,F.origin,F.ref],"{LIEU}='ART MIAMI 2026'");
    current=r.find(r=>{const f=fieldsOf(r);return (email&&f[F.email]?.toLowerCase()===email)||(phone&&f[F.phone]?.replace(/\D/g,"")===phone.replace(/\D/g,""));})||null;
   }
   if(current){
    if(x.notes!==undefined)fields[F.notes]=String(x.notes).slice(0,90000);
    await request(api+"/"+DEMANDES+"/"+current.id,"PATCH",fields);
    let stored=await getRecord(current.id);
    if(!hasMiami)stored=await ensurePrivateLink(stored);
    if(hasMiami&&miamiIds.length)stored=await ensureMiamiLink(stored);
    return res.status(200).json({lead:mapLead(stored),reused:true});
   }
   fields[F.notes]=String(x.notes||"").slice(0,90000);
   fields[F.date]=new Date().toISOString().slice(0,10);
   const created=await request(api+"/"+DEMANDES,"POST",fields);
   let stored=await getRecord(created.id);
   if(!hasMiami)stored=await ensurePrivateLink(stored);
   if(hasMiami&&miamiIds.length)stored=await ensureMiamiLink(stored);
   return res.status(201).json({lead:mapLead(stored),reused:false});
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
   await request(api+"/"+DEMANDES+"/"+x.id,"PATCH",fields);
   const stored=await getRecord(x.id);
   return res.status(200).json({lead:mapLead(stored)});
  }
  return res.status(405).json({error:"Méthode non autorisée"});
 }catch(e){console.error("Art Miami",e.message);return res.status(e.status||500).json({error:e.status===502?"Erreur de connexion Airtable":e.status===400?e.message:"Erreur du serveur"});}
}
