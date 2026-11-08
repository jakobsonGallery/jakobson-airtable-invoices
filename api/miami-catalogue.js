const BASE="appZQ3yquS8uPXZy6",TABLE="tblpiu248J8WdRCVq";
const F={ref:"fldGpDKz5qjzEL68Z",artist:"fld8dclx4VdR9e4Pe",title:"fldl0jLsC0DqR0LBC",price:"fldVuNd5oaVqptZ9Y",dims:"fldqxfSjVMkhKyppB",image:"fldnmqx0QU6nBOdgC",source:"fldb6MjMc8hI1U5Ps",visible:"fldka6vvsJjG0ff6r",notes:"fldzDLxiiIzzPG870"};
const API="https://api.airtable.com/v0/"+BASE+"/"+TABLE;
function auth(req){const key=String(process.env.ART_MIAMI_SECRET||"");const provided=String(req.headers.authorization||"");return !!key&&provided==="Bearer "+key;}
function id(s){return /^rec[A-Za-z0-9]{14}$/.test(String(s||""));}
async function fetchJson(url,init={}){
 const r=await fetch(url,{...init,headers:{"Authorization":"Bearer "+process.env.AIRTABLE_TOKEN,"Content-Type":"application/json",...(init.headers||{})}});
 const obj=await r.json().catch(()=>({}));
 if(!r.ok){console.error("MIAMI CATALOG Airtable",r.status,obj?.error?.type||"");throw new Error("Airtable "+r.status);}
 return obj;
}
async function list(){
 let offset="",out=[];
 do{
  const u=new URL(API);u.searchParams.set("returnFieldsByFieldId","true");u.searchParams.set("pageSize","100");
  if(offset)u.searchParams.set("offset",offset);
  const data=await fetchJson(u);
  out.push(...(data.records||[]));offset=data.offset||"";
 }while(offset);
 return out;
}
function work(r){
 const f=r.fields||{};
 return {id:r.id,ref:f[F.ref]||"",artist:f[F.artist]||"",title:f[F.title]||"",dimensions:f[F.dims]||"",image:f[F.image]||"",priceUSD:f[F.price]??null,visible:f[F.visible]===true,source:f[F.source]||""};
}
function clean(s,n=300){return String(s??"").trim().slice(0,n);}
function imageURL(v){
 if(Array.isArray(v))return imageURL(v[0]);
 if(v&&typeof v==="object")return imageURL(v.url||v.src||v.full||v.original||v.file||v.path||v.secure_url);
 if(typeof v!=="string")return "";
 try{const u=new URL(v);return u.protocol==="https:"?u.toString().slice(0,2000):"";}catch{return "";}
}
function titleOf(v){return v?.titre||v?.title||v?.name||v?.nom||v?.oeuvre||v?.œuvre||v?.artworkName||v?.artwork_name||"";}
function artistOf(v,ctx){
 let a=v?.artist||v?.artiste||v?.artistName||v?.artist_name||ctx||"";
 if(a&&typeof a==="object")a=a.name||a.nom||a.title||"";
 return clean(a,190);
}
function extract(doc){
 const result=[];const seen=new Set();
 const arrays=["artworks","works","oeuvres","œuvres","pieces","items","sculptures","paintings","catalogue","catalog","data","artists","artistes","products","collection"];
 function visit(x,context,depth){
  if(depth>10||result.length>2500||!x)return;
  if(Array.isArray(x)){for(const v of x)visit(v,context,depth+1);return;}
  if(typeof x!=="object")return;
  const a=artistOf(x,context),title=clean(titleOf(x),220);
  const nested=arrays.filter(k=>Array.isArray(x[k]));
  const isArtistContainer=nested.length>0 && !("price" in x||"prix" in x||"dimensions" in x);
  if(a&&title&&!isArtistContainer){
   const original=clean(x.id||x.uuid||x.slug||x.reference||x.ref||"").slice(0,90);
   const ref=clean(original?("original:"+original):("name:"+a.normalize("NFKD").toLowerCase()+":"+title.normalize("NFKD").toLowerCase()),240);
   if(!seen.has(ref)){
    seen.add(ref);
    result.push({ref,artist:a,title,dimensions:clean(x.dimensions||x.size||x.dimension||x.dimensions_cm||"",120),
    image:imageURL(x.photo||x.image||x.imageUrl||x.image_url||x.thumbnail||x.images||x.photos||x.visuel||x.media),source:"Sélections privées"});
   }
  }
  for(const k of nested)visit(x[k],a||context,depth+1);
  if(!nested.length && depth<2)for(const [key,value] of Object.entries(x))if(Array.isArray(value)||typeof value==="object")visit(value,a||context,depth+1);
 }
 visit(doc,"",0);
 return result.filter(w=>w.artist&&w.title).slice(0,2400);
}
function status(res,code,error){return res.status(code).json({error});}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 try{
  if(!auth(req))return status(res,401,"Accès réservé à l'équipe");
  const u=new URL(req.url,"https://local");const action=u.searchParams.get("action");
  if(req.method==="GET"&&action==="list"){return res.status(200).json({works:(await list()).map(work)});}
  if(req.method==="POST"&&action==="price"){
   const r=req.body||{};
   if(!id(r.id))return status(res,400,"Œuvre introuvable.");
   const price=r.priceUSD===null||r.priceUSD===""?null:Number(r.priceUSD);
   if(price!==null&&(!Number.isFinite(price)||price<0||price>100000000))return status(res,400,"Prix USD invalide.");
   const existing=await fetchJson(API+"/"+r.id+"?returnFieldsByFieldId=true");
   if(!existing.id)return status(res,404,"Œuvre absente");
   await fetchJson(API+"/"+r.id,{method:"PATCH",body:JSON.stringify({fields:{[F.price]:price}})});
   const stored=await fetchJson(API+"/"+r.id+"?returnFieldsByFieldId=true");
   return res.status(200).json({work:work(stored)});
  }
  if(req.method==="POST"&&action==="import"){
   const doc=req.body?.catalogue;
   if(!doc)return status(res,400,"Fichier JSON ou contenu du catalogue manquant.");
   const parsed=extract(doc);
   if(parsed.length===0)return status(res,422,"Aucune œuvre avec artiste et titre détectée dans ce fichier.");
   if(parsed.length>1500)return status(res,413,"Catalogue trop volumineux; importez par artiste.");
   const existing=await list();const refs=new Set(existing.map(r=>r.fields?.[F.ref]).filter(Boolean));
   const pending=parsed.filter(w=>!refs.has(w.ref));
   let added=0;
   for(let i=0;i<pending.length;i+=10){
    const batch=pending.slice(i,i+10);
    const records=batch.map(w=>({fields:{[F.ref]:w.ref,[F.artist]:w.artist,[F.title]:w.title,[F.dims]:w.dimensions,[F.source]:w.source,[F.visible]:true,...(w.image?{[F.image]:w.image}:{})}}));
    const r=await fetchJson(API,{method:"POST",body:JSON.stringify({records})});
    added+=(r.records||[]).length;
   }
   return res.status(200).json({added,unchanged:parsed.length-added,total:parsed.length,works:(await list()).map(work)});
  }
  return status(res,405,"Action non autorisée");
 }catch(e){console.error("Miami pricing",e.message);return status(res,502,"Erreur Airtable ou import impossible. Aucun prix Paris n'a été modifié.");}
}