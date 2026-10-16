import { validateKickVodUrl, validateTimeRange, normalizeChannelName, formatPeriod } from "./core.js";
const $=s=>document.querySelector(s);
const vodStatus=$("#vod-status"), timeFields=$("#time-fields");
const rangeInputs=[...document.querySelectorAll('input[name="rangeMode"]')];
function setStatus(el,msg,kind=""){el.textContent=msg;el.className="status"+(kind?" "+kind:"")}
document.querySelectorAll(".tab").forEach(tab=>tab.addEventListener("click",()=>{
 const view=tab.dataset.view;
 document.querySelectorAll(".tab").forEach(item=>{const active=item===tab;item.classList.toggle("active",active);item.setAttribute("aria-selected",String(active))});
 $("#downloader-view").hidden=view!=="downloader";$("#wrapped-view").hidden=view!=="wrapped";
}));
rangeInputs.forEach(input=>input.addEventListener("change",()=>{timeFields.hidden=input.value!=="clip"||!input.checked}));
$("#vod-form").addEventListener("submit",event=>{
 event.preventDefault();const result=validateKickVodUrl($("#vod-url").value);
 if(!result.valid)return setStatus(vodStatus,result.reason,"error");
 const mode=rangeInputs.find(input=>input.checked)?.value||"full";
 if(mode==="clip"){const range=validateTimeRange($("#start-time").value,$("#end-time").value);if(!range.valid)return setStatus(vodStatus,range.reason,"error");
 return setStatus(vodStatus,"Enlace válido y fragmento de "+Math.floor(range.durationSeconds/60)+" min "+(range.durationSeconds%60)+" s preparado. Aún no se descargó ningún archivo.","success")}
 setStatus(vodStatus,"Enlace con formato válido. La fuente de Kick todavía no está conectada; no se inició ninguna descarga.","success");
});
const periodType=$("#period-type"),periodValue=$("#period-value"),wrappedStatus=$("#wrapped-status");
periodType.addEventListener("change",()=>{periodValue.type=periodType.value==="year"?"number":"month";if(periodType.value==="year"){periodValue.min="2000";periodValue.max="2100";periodValue.value="2026";periodValue.placeholder="2026"}else{periodValue.removeAttribute("min");periodValue.removeAttribute("max");periodValue.value="2026-10";periodValue.placeholder=""}});
$("#wrapped-form").addEventListener("submit",event=>{
 event.preventDefault();const channel=normalizeChannelName($("#channel-name").value);
 if(!channel.valid)return setStatus(wrappedStatus,channel.reason,"error");
 const period=formatPeriod(periodValue.value,periodType.value);if(period==="PERIODO")return setStatus(wrappedStatus,"Selecciona un periodo válido.","error");
 $("#card-channel").textContent="@"+channel.name;$("#card-period").textContent=period;
 setStatus(wrappedStatus,"Vista previa actualizada. Las métricas siguen como no disponibles hasta conectar una fuente verificable.","success");
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