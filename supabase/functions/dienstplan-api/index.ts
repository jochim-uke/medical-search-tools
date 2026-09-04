import {createClient} from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET="dienstplaene";
const ALLOWED_ORIGINS=new Set(["https://jochim-uke.github.io","http://localhost:8000","http://127.0.0.1:8000","http://localhost:8765","http://127.0.0.1:8765"]);
const encoder=new TextEncoder();

function cors(request:Request){const origin=request.headers.get("origin")||"";return{"Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:"https://jochim-uke.github.io","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"}}
function json(request:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors(request),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}
function base64url(bytes:Uint8Array){let value="";for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function fromBase64url(value:string){const base64=value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=");return Uint8Array.from(atob(base64),character=>character.charCodeAt(0))}
function encodeText(value:string){return base64url(encoder.encode(value))}
function decodeText(value:string){return new TextDecoder().decode(fromBase64url(value))}
async function hmac(value:string){const secret=Deno.env.get("SESSION_SECRET");if(!secret)throw new Error("Server nicht vollständig konfiguriert");const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);return new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(value)))}
async function secureEqual(left:string,right:string){const [a,b]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(left)),crypto.subtle.digest("SHA-256",encoder.encode(right))]);const aa=new Uint8Array(a),bb=new Uint8Array(b);return aa.length===bb.length&&aa.reduce((difference,value,index)=>difference|(value^bb[index]),0)===0}
async function issueToken(role:"reader"|"admin",remember=false){const lifetime=role==="admin"?30*60:remember?7*24*60*60:8*60*60,payload=base64url(encoder.encode(JSON.stringify({role,exp:Math.floor(Date.now()/1000)+lifetime}))),signature=base64url(await hmac(payload));return`${payload}.${signature}`}
async function verifyToken(request:Request,adminOnly=false){const raw=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"",[payload,signature]=raw.split(".");if(!payload||!signature)throw new Error("Zugang erforderlich");const expected=base64url(await hmac(payload));if(!await secureEqual(signature,expected))throw new Error("Sitzung nicht gültig");const parsed=JSON.parse(decodeText(payload));if(parsed.exp<Math.floor(Date.now()/1000))throw new Error("Sitzung abgelaufen");if(adminOnly&&parsed.role!=="admin")throw new Error("Administratorzugang erforderlich");if(parsed.role!=="reader"&&parsed.role!=="admin")throw new Error("Sitzung nicht gültig");return parsed}
function parseName(name:string){const match=name.match(/^(\d{4}-\d{2})__([0-9a-f-]+)__([A-Za-z0-9_-]+)\.pdf$/i);if(!match)return null;try{return{path:name,period:match[1],title:decodeText(match[3])}}catch{return null}}
function validPeriod(value:string){return/^\d{4}-(0[1-9]|1[0-2])$/.test(value)}

Deno.serve(async(request:Request)=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(request)});
  if(request.method!=="POST")return json(request,{error:"Methode nicht erlaubt"},405);
  try{
    const body=await request.json(),action=String(body.action||"");
    if(action==="login"){
      const role=body.role==="admin"?"admin":"reader",secret=Deno.env.get(role==="admin"?"ADMIN_PASSWORD":"VIEW_PASSWORD");
      if(!secret||!await secureEqual(String(body.password||""),secret))return json(request,{error:"Passwort nicht korrekt."},401);
      return json(request,{token:await issueToken(role,Boolean(body.remember))});
    }
    const adminOnly=["upload-url","delete"].includes(action);await verifyToken(request,adminOnly);
    const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!serviceKey)throw new Error("Supabase-Zugang nicht verfügbar");
    const supabase=createClient(url,serviceKey,{auth:{persistSession:false}}),storage=supabase.storage.from(BUCKET);
    if(action==="list"){
      const {data,error}=await storage.list("",{limit:1000,sortBy:{column:"name",order:"desc"}});if(error)throw error;
      return json(request,{plans:(data||[]).map(item=>parseName(item.name)).filter(Boolean)});
    }
    if(action==="view"){
      const path=String(body.path||"");if(!parseName(path))return json(request,{error:"Ungültiger Dateipfad."},400);
      const {data,error}=await storage.createSignedUrl(path,5*60);if(error)throw error;return json(request,{url:data.signedUrl});
    }
    if(action==="upload-url"){
      const title=String(body.title||"").trim().slice(0,80),period=String(body.period||"");if(title.length<2||!validPeriod(period))return json(request,{error:"Titel und Monat prüfen."},400);
      const path=`${period}__${crypto.randomUUID()}__${encodeText(title)}.pdf`,{data,error}=await storage.createSignedUploadUrl(path);if(error)throw error;return json(request,{path,token:data.token});
    }
    if(action==="delete"){
      const path=String(body.path||"");if(!parseName(path))return json(request,{error:"Ungültiger Dateipfad."},400);
      const {error}=await storage.remove([path]);if(error)throw error;return json(request,{ok:true});
    }
    return json(request,{error:"Unbekannte Aktion."},400);
  }catch(error){console.error(error);return json(request,{error:error instanceof Error?error.message:"Unerwarteter Fehler"},401)}
});
