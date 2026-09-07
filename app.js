/* ===================== CONFIG ===================== */
// 👉 Pega aquí la URL de tu Google Apps Script publicado (termina en /exec)
const API_URL = "PEGA_AQUI_TU_URL_DE_APPS_SCRIPT";

const CATEGORIES = ["Autos","Numeradas","Inserts","Base","Rookies"];
const RARE_TAGS = ["Autos","Numeradas"];
const ADMIN_PIN = "4202"; // cámbialo aquí cuando quieras

let cards = [];
let adminOn = false;
let activeSport = "Todos";
let activeCats = new Set();
let searchTerm = "";
let editingId = null;

/* ===================== API (Google Sheets vía Apps Script) ===================== */
async function loadCards(){
  try{
    const res = await fetch(API_URL, {cache:"no-store"});
    const data = await res.json();
    cards = (data.cards || []).map(c=>({
      ...c,
      price: Number(c.price)||0,
      createdAt: Number(c.createdAt)||0,
      categories: Array.isArray(c.categories) ? c.categories : []
    }));
  }catch(e){
    cards = [];
    showToast("No se pudo conectar con el catálogo. Revisa tu conexión.");
  }
}

async function apiUpsert(card){
  try{
    await fetch(API_URL, {
      method:"POST",
      body: JSON.stringify({ action:"upsert", card })
    });
    return true;
  }catch(e){
    return false;
  }
}

async function apiDelete(id){
  try{
    await fetch(API_URL, {
      method:"POST",
      body: JSON.stringify({ action:"delete", id })
    });
    return true;
  }catch(e){
    return false;
  }
}

/* ===================== RENDER ===================== */
function renderChips(){
  const sportWrap = document.getElementById("sportChips");
  const sports = ["Todos","WWE","MLB"];
  sportWrap.innerHTML = sports.map(s=>{
    const cls = s==="WWE"?"sport-wwe":(s==="MLB"?"sport-mlb":"");
    return `<div class="chip ${cls} ${activeSport===s?'active':''}" data-sport="${s}">${s}</div>`;
  }).join("");
  sportWrap.querySelectorAll(".chip").forEach(el=>{
    el.onclick = ()=>{ activeSport = el.dataset.sport; renderChips(); renderGrid(); };
  });

  const catWrap = document.getElementById("catChips");
  catWrap.innerHTML = CATEGORIES.map(c=>{
    return `<div class="chip ${activeCats.has(c)?'active':''}" data-cat="${c}">${c}</div>`;
  }).join("");
  catWrap.querySelectorAll(".chip").forEach(el=>{
    el.onclick = ()=>{
      const c = el.dataset.cat;
      activeCats.has(c) ? activeCats.delete(c) : activeCats.add(c);
      renderChips(); renderGrid();
    };
  });
}

function matchesFilters(c){
  if(activeSport!=="Todos" && c.sport!==activeSport) return false;
  if(activeCats.size>0){
    const cc = c.categories||[];
    const hasAll = [...activeCats].every(t=>cc.includes(t));
    if(!hasAll) return false;
  }
  if(searchTerm){
    const hay = `${c.player} ${c.set} ${c.year} ${c.type}`.toLowerCase();
    if(!hay.includes(searchTerm.toLowerCase())) return false;
  }
  return true;
}

function renderGrid(){
  const grid = document.getElementById("grid");
  const list = cards.filter(matchesFilters).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  if(list.length===0){
    grid.innerHTML = `<div class="empty"><div class="display">Sin resultados</div>No hay tarjetas que coincidan con tu búsqueda o filtros.</div>`;
    return;
  }
  grid.innerHTML = list.map(c=>cardHTML(c)).join("");
  list.forEach(c=>{
    const el = document.getElementById("card-"+c.id);
    if(el) el.onclick = ()=> adminOn ? openActions(c.id) : openView(c.id);
  });
}

function cardHTML(c){
  const stripe = c.sport==="WWE" ? "wwe" : "mlb";
  const img = c.image
    ? `<img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.player)}" onerror="this.parentElement.innerHTML='<span class=&quot;placeholder-ic&quot;>🃏</span>'">`
    : `<span class="placeholder-ic">🃏</span>`;
  const sold = c.status==="Vendida" ? `<div class="sold-stamp"><span>Vendida</span></div>` : "";
  const badge = c.status==="Vendida"
    ? `<div class="badge-status vend">VENDIDA</div>`
    : `<div class="badge-status disp">DISPONIBLE</div>`;
  const tags = (c.categories||[]).map(t=>`<span class="tag ${RARE_TAGS.includes(t)?'rare':''}">${t}</span>`).join("");
  const serial = c.serial ? `<div class="serial">#${escapeHtml(c.serial)}</div>` : "";
  return `
  <div class="card" id="card-${c.id}">
    <div class="stripe ${stripe}"></div>
    <div class="img-wrap">${img}${sold}${badge}</div>
    <div class="card-body">
      <div class="player">${escapeHtml(c.player)}</div>
      <div class="meta">${escapeHtml(c.set)} · ${escapeHtml(c.year)}${c.type?(' · '+escapeHtml(c.type)):''}</div>
      <div class="tags">${tags}</div>
      <div class="price-row">
        <div class="price">$${Number(c.price||0).toLocaleString('es-MX')} MXN</div>
        ${serial}
      </div>
    </div>
  </div>`;
}

function escapeHtml(s){
  return (s||"").toString().replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

/* ===================== VIEW (visitante) ===================== */
function openView(id){
  const c = cards.find(x=>x.id===id);
  if(!c) return;
  buildOverlay(`
    <div class="sheet-handle"></div>
    <div class="img-wrap" style="border-radius:12px;margin-bottom:14px;">
      ${c.image?`<img src="${escapeHtml(c.image)}" onerror="this.parentElement.innerHTML='<span class=&quot;placeholder-ic&quot;>🃏</span>'">`:`<span class="placeholder-ic">🃏</span>`}
      ${c.status==="Vendida"?`<div class="sold-stamp"><span>Vendida</span></div>`:""}
    </div>
    <h2>${escapeHtml(c.player)}</h2>
    <div class="meta" style="margin-bottom:10px;">${escapeHtml(c.set)} · ${escapeHtml(c.year)}${c.type?(' · '+escapeHtml(c.type)):''}</div>
    <div class="tags" style="margin-bottom:14px;">${(c.categories||[]).map(t=>`<span class="tag ${RARE_TAGS.includes(t)?'rare':''}">${t}</span>`).join("")}</div>
    ${c.serial?`<div class="meta" style="margin-bottom:8px;">Número de serie: <b style="color:var(--text)">${escapeHtml(c.serial)}</b></div>`:""}
    <div class="price" style="font-size:26px;">$${Number(c.price||0).toLocaleString('es-MX')} MXN</div>
  `);
}

/* ===================== ADMIN: acciones sobre una tarjeta ===================== */
function openActions(id){
  const c = cards.find(x=>x.id===id);
  if(!c) return;
  const overlay = buildOverlay(`
    <div class="sheet-handle"></div>
    <h2>${escapeHtml(c.player)}</h2>
    <div class="action-list">
      <button id="actEdit">✏️ Editar tarjeta</button>
      <button id="actToggle">${c.status==="Disponible"?"✅ Marcar como Vendida":"↩️ Marcar como Disponible"}</button>
      <button id="actDelete" style="color:var(--wwe);">🗑️ Eliminar tarjeta</button>
    </div>
    <div class="sheet-actions"><button class="btn ghost" id="actCancel">Cancelar</button></div>
  `);
  overlay.querySelector("#actEdit").onclick = ()=>{ closeOverlay(); openForm(c.id); };
  overlay.querySelector("#actToggle").onclick = async ()=>{
    const newStatus = c.status==="Disponible" ? "Vendida" : "Disponible";
    const ok = await apiUpsert({...c, status:newStatus});
    if(!ok){ showToast("No se pudo actualizar. Revisa tu conexión."); return; }
    c.status = newStatus;
    closeOverlay(); renderGrid(); showToast("Estado actualizado");
  };
  overlay.querySelector("#actDelete").onclick = ()=>{
    closeOverlay();
    openDeleteConfirm(c.id);
  };
  overlay.querySelector("#actCancel").onclick = closeOverlay;
}

function openDeleteConfirm(id){
  const c = cards.find(x=>x.id===id);
  if(!c) return;
  const overlay = buildOverlay(`
    <div class="sheet-handle"></div>
    <h2>¿Eliminar tarjeta?</h2>
    <div class="meta" style="margin-bottom:18px;">Vas a eliminar "${escapeHtml(c.player)}" (${escapeHtml(c.set)} · ${escapeHtml(c.year)}). Esta acción no se puede deshacer.</div>
    <div class="sheet-actions">
      <button class="btn ghost" id="delCancel">Cancelar</button>
      <button class="btn danger" id="delOk">Sí, eliminar</button>
    </div>
  `);
  overlay.querySelector("#delCancel").onclick = closeOverlay;
  overlay.querySelector("#delOk").onclick = async ()=>{
    const ok = await apiDelete(id);
    if(!ok){ showToast("No se pudo eliminar. Revisa tu conexión."); return; }
    cards = cards.filter(x=>x.id!==id);
    closeOverlay();
    renderGrid();
    showToast("Tarjeta eliminada");
  };
}

/* ===================== FORM: agregar / editar ===================== */
function openForm(id){
  editingId = id || null;
  const c = id ? cards.find(x=>x.id===id) : {
    sport:"WWE", player:"", set:"", year:"", type:"", categories:[], serial:"", price:"", image:"", status:"Disponible"
  };
  let tempImage = c.image || "";
  let tempCats = new Set(c.categories||[]);
  let tempSport = c.sport;
  let tempStatus = c.status || "Disponible";

  const overlay = buildOverlay(`
    <div class="sheet-handle"></div>
    <h2>${id?"Editar tarjeta":"Agregar tarjeta"}</h2>

    <div class="field">
      <label>Categoría principal</label>
      <div class="seg">
        <button type="button" id="segWWE" class="${tempSport==='WWE'?'sel-wwe':''}">WWE</button>
        <button type="button" id="segMLB" class="${tempSport==='MLB'?'sel-mlb':''}">MLB</button>
      </div>
    </div>

    <div class="field">
      <label>Jugador / Luchador</label>
      <input type="text" id="fPlayer" value="${escapeHtml(c.player)}" placeholder="Ej. John Cena">
    </div>
    <div class="field">
      <label>Set</label>
      <input type="text" id="fSet" value="${escapeHtml(c.set)}" placeholder="Ej. Panini Prizm">
    </div>
    <div class="field">
      <label>Año</label>
      <input type="text" id="fYear" value="${escapeHtml(c.year)}" placeholder="Ej. 2023">
    </div>
    <div class="field">
      <label>Tipo / Paralelo</label>
      <input type="text" id="fType" value="${escapeHtml(c.type||'')}" placeholder="Ej. Silver Prizm, Refractor...">
    </div>

    <div class="field">
      <label>Etiquetas (puedes elegir varias)</label>
      <div class="chipselect" id="catSelect">
        ${CATEGORIES.map(cat=>`<div class="chip ${tempCats.has(cat)?'on':''}" data-cat="${cat}">${cat}</div>`).join("")}
      </div>
    </div>

    <div class="field">
      <label>Número de serie (opcional)</label>
      <input type="text" id="fSerial" value="${escapeHtml(c.serial||'')}" placeholder="Ej. 12/25">
    </div>
    <div class="field">
      <label>Precio (MXN)</label>
      <input type="number" id="fPrice" value="${c.price||''}" placeholder="Ej. 350">
    </div>

    <div class="field">
      <label>Imagen (opcional) — pega el link de la foto</label>
      <div class="imgpicker">
        <div class="prev" id="imgPrev">${tempImage?`<img src="${escapeHtml(tempImage)}">`:"🃏"}</div>
        <input type="text" id="fImageUrl" placeholder="https://..." value="${escapeHtml(tempImage)}"
          style="flex:1;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--text);font-size:13px;">
      </div>
    </div>

    <div class="field">
      <label>Estado</label>
      <div class="status-toggle">
        <button type="button" id="stDisp" class="${tempStatus==='Disponible'?'sel-disp':''}">Disponible</button>
        <button type="button" id="stVend" class="${tempStatus==='Vendida'?'sel-vend':''}">Vendida</button>
      </div>
    </div>

    <div class="sheet-actions">
      <button class="btn ghost" id="fCancel">Cancelar</button>
      <button class="btn primary" id="fSave">Guardar</button>
    </div>
  `);

  overlay.querySelector("#segWWE").onclick = ()=>{ tempSport="WWE"; overlay.querySelector("#segWWE").classList.add("sel-wwe"); overlay.querySelector("#segMLB").classList.remove("sel-mlb"); };
  overlay.querySelector("#segMLB").onclick = ()=>{ tempSport="MLB"; overlay.querySelector("#segMLB").classList.add("sel-mlb"); overlay.querySelector("#segWWE").classList.remove("sel-wwe"); };

  overlay.querySelectorAll("#catSelect .chip").forEach(el=>{
    el.onclick = ()=>{
      const cat = el.dataset.cat;
      tempCats.has(cat) ? tempCats.delete(cat) : tempCats.add(cat);
      el.classList.toggle("on");
    };
  });

  overlay.querySelector("#stDisp").onclick = ()=>{
    tempStatus="Disponible";
    overlay.querySelector("#stDisp").classList.add("sel-disp");
    overlay.querySelector("#stVend").classList.remove("sel-vend");
  };
  overlay.querySelector("#stVend").onclick = ()=>{
    tempStatus="Vendida";
    overlay.querySelector("#stVend").classList.add("sel-vend");
    overlay.querySelector("#stDisp").classList.remove("sel-disp");
  };

  overlay.querySelector("#fImageUrl").oninput = (e)=>{
    tempImage = e.target.value.trim();
    overlay.querySelector("#imgPrev").innerHTML = tempImage
      ? `<img src="${escapeHtml(tempImage)}" onerror="this.parentElement.textContent='🃏'">`
      : "🃏";
  };

  overlay.querySelector("#fCancel").onclick = closeOverlay;
  overlay.querySelector("#fSave").onclick = async ()=>{
    const player = overlay.querySelector("#fPlayer").value.trim();
    const set_ = overlay.querySelector("#fSet").value.trim();
    if(!player || !set_){
      showToast("Falta el jugador o el set");
      return;
    }
    const data = {
      id: id || ("c"+Date.now()+Math.random().toString(36).slice(2,7)),
      sport: tempSport,
      player, set:set_,
      year: overlay.querySelector("#fYear").value.trim(),
      type: overlay.querySelector("#fType").value.trim(),
      categories: [...tempCats],
      serial: overlay.querySelector("#fSerial").value.trim(),
      price: Number(overlay.querySelector("#fPrice").value)||0,
      image: tempImage,
      status: tempStatus,
      createdAt: id ? (c.createdAt||Date.now()) : Date.now()
    };
    const ok = await apiUpsert(data);
    if(!ok){
      showToast("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
      return;
    }
    if(id){
      const idx = cards.findIndex(x=>x.id===id);
      cards[idx] = data;
    } else {
      cards.push(data);
    }
    closeOverlay();
    renderGrid();
    showToast(id?"Tarjeta actualizada":"Tarjeta agregada");
  };
}

/* ===================== ADMIN LOCK ===================== */
function toggleAdmin(){
  if(adminOn){
    adminOn = false;
    updateAdminUI();
    showToast("Modo administrador desactivado");
    return;
  }
  openPinPrompt();
}

function openPinPrompt(){
  const overlay = buildOverlay(`
    <div class="sheet-handle"></div>
    <h2>Modo administrador</h2>
    <div class="field">
      <label>Ingresa tu PIN</label>
      <input type="text" inputmode="numeric" id="pinInput" placeholder="••••" autocomplete="off" style="width:100%;padding:14px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--text);font-size:22px;letter-spacing:6px;text-align:center;">
    </div>
    <div id="pinError" style="color:var(--wwe);font-size:13px;min-height:16px;margin-bottom:6px;"></div>
    <div class="sheet-actions">
      <button class="btn ghost" id="pinCancel">Cancelar</button>
      <button class="btn primary" id="pinOk">Entrar</button>
    </div>
  `);
  const input = overlay.querySelector("#pinInput");
  setTimeout(()=>input.focus(), 150);

  function tryUnlock(){
    const val = input.value.trim();
    if(val===ADMIN_PIN){
      adminOn = true;
      closeOverlay();
      updateAdminUI();
      showToast("Modo administrador activado");
    } else {
      overlay.querySelector("#pinError").textContent = "PIN incorrecto, intenta de nuevo.";
      input.value = "";
      input.focus();
    }
  }
  overlay.querySelector("#pinOk").onclick = tryUnlock;
  overlay.querySelector("#pinCancel").onclick = closeOverlay;
  input.addEventListener("keydown",(e)=>{ if(e.key==="Enter") tryUnlock(); });
}
function updateAdminUI(){
  const btn = document.getElementById("adminBtn");
  const fab = document.getElementById("fabAdd");
  btn.style.display = adminOn ? "flex" : "none";
  btn.textContent = adminOn ? "🔓" : "🔒";
  btn.classList.toggle("on", adminOn);
  fab.style.display = adminOn ? "flex" : "none";
  document.getElementById("subLabel").textContent = adminOn
    ? "Modo administrador · toca una tarjeta para editar"
    : "WWE & MLB · Tarjetas coleccionables";
  renderGrid();
}

/* ===================== OVERLAY HELPERS ===================== */
function buildOverlay(innerHTML){
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.id = "activeOverlay";
  overlay.innerHTML = `<div class="sheet">${innerHTML}</div>`;
  overlay.addEventListener("click",(e)=>{ if(e.target===overlay) closeOverlay(); });
  document.body.appendChild(overlay);
  return overlay;
}
function closeOverlay(){
  const el = document.getElementById("activeOverlay");
  if(el) el.remove();
}

function showToast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>t.classList.remove("show"), 2200);
}

/* ===================== INIT ===================== */
document.getElementById("adminBtn").onclick = toggleAdmin;
document.getElementById("fabAdd").onclick = ()=>openForm(null);
document.getElementById("searchInput").oninput = (e)=>{ searchTerm = e.target.value; renderGrid(); };

let tapCount = 0;
let tapTimer = null;
document.getElementById("brandTap").addEventListener("click", ()=>{
  tapCount++;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(()=>{ tapCount = 0; }, 2000);
  if(tapCount>=5){
    tapCount = 0;
    if(!adminOn) openPinPrompt();
  }
});

(async function init(){
  renderChips();
  document.getElementById("grid").innerHTML = `<div class="empty">Cargando catálogo...</div>`;
  updateAdminUI();
  await loadCards();
  renderGrid();
})();
