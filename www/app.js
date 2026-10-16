import { validateKickVodUrl, validateTimeRange, normalizeChannelName, formatPeriod } from "./core.js";
const $=s=>document.querySelector(s);
const vodStatus=$("#vod-status"), timeFields=$("#time-fields");
const rangeInputs=[...document.querySelectorAll('input[name="rangeMode"]')];
function setStatus(el,msg,kind=""){el.textContent=msg;el.className="status"+(kind?" "+kind:"")}
const apiInput=$("#api-base-url"),apiStatus=$("#api-url-status");
function getApiBase(){try{return localStorage.getItem("vodx-api-base")||""}catch{return ""}}
function apiUrl(path){const base=getApiBase();return base?base+path:path}
if(apiInput)apiInput.value=getApiBase();
$("#save-api-url")?.addEventListener("click",()=>{
 const raw=apiInput.value.trim().replace(/\/+$/,"");
 if(!raw){try{localStorage.removeItem("vodx-api-base")}catch{};setStatus(apiStatus,"Se usará el mismo dominio. En Android debes configurar la URL HTTPS del backend.","success");return}
 let parsed;try{parsed=new URL(raw)}catch{return setStatus(apiStatus,"Escribe una URL válida, por ejemplo https://tu-app.up.railway.app","error")}
 const localHost=["localhost","127.0.0.1"].includes(parsed.hostname);
 if((parsed.protocol!=="https:"&&!localHost)||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=="/")return setStatus(apiStatus,"Usa una URL HTTPS de backend sin rutas, parámetros ni credenciales.","error");
 const normalized=parsed.origin;
 try{localStorage.setItem("vodx-api-base",normalized)}catch{return setStatus(apiStatus,"No se pudo guardar la configuración en este dispositivo.","error")}
 apiInput.value=normalized;setStatus(apiStatus,"URL guardada. Comprobando el servidor…");
 fetch(apiUrl("/api/health"),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(10000)}).then(async response=>{const data=await response.json();if(!response.ok||!data.ok)throw new Error("El servidor no respondió correctamente.");setStatus(apiStatus,"Conectado al backend. "+(data.kickConfigured?"Credenciales de Kick configuradas.":"Faltan credenciales de Kick en el servidor."),"success")}).catch(()=>setStatus(apiStatus,"URL guardada, pero no se pudo verificar el servidor. Comprueba la dirección y que esté desplegado.","error"));
});
document.querySelectorAll(".tab").forEach(tab=>tab.addEventListener("click",()=>{
 const view=tab.dataset.view;
 document.querySelectorAll(".tab").forEach(item=>{const active=item===tab;item.classList.toggle("active",active);item.setAttribute("aria-selected",String(active))});
 $("#downloader-view").hidden=view!=="downloader";$("#wrapped-view").hidden=view!=="wrapped";
}));
rangeInputs.forEach(input=>input.addEventListener("change",()=>{timeFields.hidden=input.value!=="clip"||!input.checked}));
$("#vod-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const result=validateKickVodUrl($("#vod-url").value);
 if(!result.valid)return setStatus(vodStatus,result.reason,"error");
 const mode=rangeInputs.find(input=>input.checked)?.value||"full";
 const payload={url:result.normalizedUrl};
 if(mode==="clip"){
  const range=validateTimeRange($("#start-time").value,$("#end-time").value);
  if(!range.valid)return setStatus(vodStatus,range.reason,"error");
  if(range.durationSeconds>1800)return setStatus(vodStatus,"Los fragmentos están limitados a 30 minutos.","error");
  payload.startSeconds=range.startSeconds;payload.endSeconds=range.endSeconds;
 }
 const submit=event.currentTarget.querySelector('button[type="submit"]');
 const existing=$("#download-result-link");if(existing)existing.remove();
 submit.disabled=true;
 setStatus(vodStatus,"Preparando la tarea de descarga…");
 try{
  const response=await fetch(apiUrl("/api/download",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
  const body=await response.json();
  if(!response.ok)throw new Error(body.error||"No se pudo iniciar la descarga.");
  const jobId=body.data.id,deadline=Date.now()+95*60*1000;
  let file=null;
  while(Date.now()<deadline){
   await new Promise(resolve=>setTimeout(resolve,2500));
   const statusResponse=await fetch(apiUrl("/api/download/status?id="+encodeURIComponent(jobId),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
   const statusBody=await statusResponse.json();
   if(!statusResponse.ok)throw new Error(statusBody.error||"No se pudo consultar la tarea.");
   const job=statusBody.data;
   if(job.status==="completed"){file=job.result;break}
   if(job.status==="failed")throw new Error(job.error?.message||"La descarga falló.");
   setStatus(vodStatus,job.status==="queued"?"Descarga en cola…":"Descargando el VOD en el servidor. Puedes dejar esta pantalla abierta; aún no hay porcentaje de progreso.");
  }
  if(!file)throw new Error("La tarea tardó demasiado. Comprueba el estado del servidor e inténtalo de nuevo.");
  const link=document.createElement("a");link.id="download-result-link";link.href=file.downloadUrl;link.textContent="Guardar archivo descargado";link.className="download-result-link";
  vodStatus.insertAdjacentElement("afterend",link);
  const size=(file.size/1024/1024).toLocaleString("es-MX",{maximumFractionDigits:1});
  setStatus(vodStatus,"Descarga terminada ("+size+" MB). El archivo se elimina automáticamente después de 6 horas.","success");
 }catch(error){
  const message=error?.name==="TimeoutError"?"Se agotó el tiempo de espera al contactar con el servidor.":error?.message||"No se pudo conectar con el servidor.";
  setStatus(vodStatus,message,"error");
 }finally{submit.disabled=false}
});
const periodType=$("#period-type"),periodValue=$("#period-value"),wrappedStatus=$("#wrapped-status");
periodType.addEventListener("change",()=>{periodValue.type=periodType.value==="year"?"number":"month";if(periodType.value==="year"){periodValue.min="2000";periodValue.max="2100";periodValue.value="2026";periodValue.placeholder="2026"}else{periodValue.removeAttribute("min");periodValue.removeAttribute("max");periodValue.value="2026-10";periodValue.placeholder=""}});
$("#wrapped-form").addEventListener("submit",async event=>{
 event.preventDefault();const channel=normalizeChannelName($("#channel-name").value);
 if(!channel.valid)return setStatus(wrappedStatus,channel.reason,"error");
 const period=formatPeriod(periodValue.value,periodType.value);if(period==="PERIODO")return setStatus(wrappedStatus,"Selecciona un periodo válido.","error");
 $("#card-channel").textContent="@"+channel.name;$("#card-period").textContent=period;$("#channel-info").hidden=true;
 setStatus(wrappedStatus,"Vista previa creada. Consultando los datos públicos del canal…");
 try{
  const response=await fetch(apiUrl("/api/kick/channel?slug="+encodeURIComponent(channel.name),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||"No se pudieron consultar los datos del canal.");
  const data=result.data;$("#channel-display").textContent=data.name||("@"+channel.name);
  const details=[data.category,data.streamTitle].filter(Boolean);if(data.followers!==null&&data.followers!==undefined)details.push(Number(data.followers).toLocaleString("es-MX")+" seguidores");
  $("#channel-detail").textContent=details.join(" · ")||"Canal localizado en Kick.";
  const avatar=$("#channel-avatar");try{const imageUrl=new URL(data.profilePicture);if(imageUrl.protocol==="https:"){avatar.src=imageUrl.href;avatar.hidden=false}else avatar.hidden=true}catch{avatar.hidden=true}
  const live=$("#channel-live");live.textContent=data.isLive?"EN VIVO":"FUERA DE LÍNEA";live.classList.toggle("live",Boolean(data.isLive));$("#channel-info").hidden=false;
  setStatus(wrappedStatus,"Canal consultado en Kick. Las métricas históricas del periodo siguen pendientes de una fuente que las proporcione.","success");
 }catch(error){const reason=error?.name==="TimeoutError"?"La consulta tardó demasiado.":error?.message||"No se pudo conectar con el servidor.";setStatus(wrappedStatus,reason+" La vista previa sigue disponible; verifica que el backend esté desplegado y configurado.","error")}
});
function drawCard(){
 const width=1080,height=1350,canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext("2d"),gradient=ctx.createLinearGradient(0,0,width,height);gradient.addColorStop(0,"#c6ff7b");gradient.addColorStop(1,"#a2ed68");ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
 ctx.fillStyle="#17200f";ctx.font="bold 30px sans-serif";ctx.fillText("VODX / KICK WRAPPED",72,90);ctx.textAlign="right";ctx.font="bold 24px sans-serif";ctx.fillText($("#card-period").textContent,width-72,90);ctx.textAlign="left";
 ctx.font="bold 30px sans-serif";ctx.fillText("TU TEMPORADA EN KICK",72,235);ctx.font="bold 76px sans-serif";
 let channel=$("#card-channel").textContent;while(ctx.measureText(channel).width>width-144&&channel.length>8)channel=channel.slice(0,-2)+"…";ctx.fillText(channel,72,330);
 ctx.font="30px sans-serif";ctx.fillText("Una mirada a tu comunidad.",72,390);
 const metrics=[["HORAS EN VIVO","—","No disponible"],["DIRECTOS","—","No disponible"],["CLIPS DESTACADOS","—","Fuente pendiente"],["CHAT / EMOTES","—","Fuente pendiente"]];
 metrics.forEach((m,i)=>{const x=72+(i%2)*468,y=470+Math.floor(i/2)*220;ctx.fillStyle="#ffffffa8";ctx.fillRect(x,y,430,180);ctx.fillStyle="#17200f";ctx.font="bold 20px sans-serif";ctx.fillText(m[0],x+25,y+42);ctx.font="bold 60px sans-serif";ctx.fillText(m[1],x+25,y+112);ctx.font="20px sans-serif";ctx.fillText(m[2],x+25,y+150)});
 ctx.font="20px sans-serif";ctx.fillText("Métricas no conectadas: no representan estadísticas reales.",72,1000);ctx.font="bold 24px sans-serif";ctx.fillText("VODX · HECHO PARA CREADORES",72,1260);return canvas;
}
function downloadCanvas(canvas){canvas.toBlob(blob=>{if(!blob)return setStatus(wrappedStatus,"No se pudo generar la imagen.","error");const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="kick-wrapped.png";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus(wrappedStatus,"Tarjeta PNG generada. Las métricas no disponibles permanecen señaladas.","success")},"image/png")}
$("#save-card").addEventListener("click",()=>downloadCanvas(drawCard()));
$("#share-card").addEventListener("click",async()=>{
 const blob=await new Promise(resolve=>drawCard().toBlob(resolve,"image/png"));if(!blob)return setStatus(wrappedStatus,"No se pudo generar la imagen.","error");
 const file=new File([blob],"kick-wrapped.png",{type:"image/png"});
 try{if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({title:"Mi Kick Wrapped",files:[file]});setStatus(wrappedStatus,"Tarjeta compartida.","success")}else{downloadCanvas(drawCard());setStatus(wrappedStatus,"Tu dispositivo no permite compartir archivos desde aquí; se generó la descarga de la tarjeta.","success")}}
 catch(error){if(error?.name!=="AbortError")setStatus(wrappedStatus,"No se pudo compartir; puedes guardar la tarjeta como PNG.","error")}
});