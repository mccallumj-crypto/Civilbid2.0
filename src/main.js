import { createClient } from '@supabase/supabase-js';
import './style.css';

const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_ANON_KEY;
if(!url||!key) document.querySelector('#app').innerHTML='<main class="center"><div class="card"><h1>CivilBid</h1><p>Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.</p></div></main>';
const supabase=(url&&key)?createClient(url,key):null;
const app=document.querySelector('#app');
let state={session:null,membership:null,projects:[],project:null,reports:[],report:null,items:[],employees:[],equipment:[]};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast=m=>{const n=document.createElement('div');n.className='toast';n.textContent=m;document.body.append(n);setTimeout(()=>n.remove(),3000)};
const err=e=>{console.error(e);toast(e?.message||String(e))};

async function loadMembership(){
 const uid=state.session.user.id;
 const {data,error}=await supabase.from('company_memberships').select('company_id,role,status,companies(name)').eq('user_id',uid).eq('status','active').limit(1).maybeSingle();
 if(error)throw error; state.membership=data;
}
async function loadProjects(){const {data,error}=await supabase.from('projects').select('*').order('created_at',{ascending:false});if(error)throw error;state.projects=data||[];}
async function loadProjectData(pid){
 const [{data:p,error:pe},{data:e,error:ee}]=await Promise.all([
   supabase.from('projects').select('*').eq('id',pid).single(),
   supabase.from('estimates').select('id,name,status,estimate_items(id,item_number,description,unit,bid_quantity,estimated_daily_production,sort_order)').eq('project_id',pid).order('revision',{ascending:false}).limit(1).maybeSingle()
 ]); if(pe)throw pe;if(ee)throw ee;state.project=p;state.items=(e?.estimate_items||[]).sort((a,b)=>a.sort_order-b.sort_order);
 const [{data:r,error:re},{data:pr,error:pre},{data:er,error:ere}]=await Promise.all([
  supabase.from('daily_reports').select('*,profiles:foreman_user_id(full_name)').eq('project_id',pid).order('report_date',{ascending:false}).limit(100),
  supabase.from('project_employees').select('employee_id,employees(id,full_name,classification)').eq('project_id',pid),
  supabase.from('project_equipment').select('equipment_id,equipment(id,equipment_number,name,make,model)').eq('project_id',pid)
 ]); if(re)throw re;if(pre)throw pre;if(ere)throw ere;state.reports=r||[];state.employees=(pr||[]).map(x=>x.employees);state.equipment=(er||[]).map(x=>x.equipment);
}
function shell(body){
 const role=state.membership?.role||'';return `<header><div class="brand" data-home>CivilBid</div><div class="spacer"></div><span class="pill">${esc(role.replace('_',' '))}</span><button class="ghost" id="logout">Sign out</button></header>${body}`;
}
function renderLogin(){app.innerHTML=`<main class="center"><form class="card login" id="login"><div class="logo">CB</div><h1>CivilBid</h1><p>Cloud field reporting & estimating</p><label>Email<input type="email" name="email" required autocomplete="username"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button>Sign in</button></form></main>`;$('#login').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await supabase.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});if(error)err(error)};}
function renderHome(){
 app.innerHTML=shell(`<main><div class="hero"><div><h1>Projects</h1><p>${esc(state.membership?.companies?.name||'Your company')}</p></div></div><div class="grid">${state.projects.map(p=>`<button class="project card" data-pid="${p.id}"><span class="status">${esc(p.status)}</span><h2>${esc(p.name)}</h2><p>${esc(p.location||'')}</p><small>${esc(p.project_number||p.contract_number||'')}</small></button>`).join('')||'<div class="card"><p>No assigned projects yet.</p></div>'}</div></main>`);bindShell();document.querySelectorAll('[data-pid]').forEach(b=>b.onclick=()=>openProject(b.dataset.pid));
}
async function openProject(pid){try{await loadProjectData(pid);renderProject()}catch(e){err(e)}}
function renderProject(){
 const p=state.project, foreman=state.membership?.role==='foreman';
 app.innerHTML=shell(`<main><button class="back" data-back>â Projects</button><div class="hero"><div><h1>${esc(p.name)}</h1><p>${esc(p.location||'')}</p></div>${foreman?'<button id="newReport">+ Daily report</button>':''}</div><section><h2>Daily reports</h2><div class="list">${state.reports.map(r=>`<button class="row" data-rid="${r.id}"><div><strong>${esc(r.report_date)}</strong><span>${esc(r.profiles?.full_name||'')}</span></div><span class="status ${r.status}">${esc(r.status)}</span></button>`).join('')||'<div class="card">No reports yet.</div>'}</div></section><section><h2>Bid items</h2><div class="table">${state.items.map(i=>`<div class="tr"><span>${esc(i.item_number)}</span><span>${esc(i.description)}</span><span>${Number(i.bid_quantity||0).toLocaleString()} ${esc(i.unit)}</span></div>`).join('')||'<div class="card">No estimate items loaded yet.</div>'}</div></section></main>`);
 bindShell();$('[data-back]').onclick=renderHome;if($('#newReport'))$('#newReport').onclick=newReport;document.querySelectorAll('[data-rid]').forEach(b=>b.onclick=()=>openReport(b.dataset.rid));
}
async function newReport(){
 const today=new Date().toISOString().slice(0,10),cid=state.membership.company_id;
 const {data,error}=await supabase.from('daily_reports').insert({company_id:cid,project_id:state.project.id,report_date:today,foreman_user_id:state.session.user.id,status:'draft'}).select().single();if(error)return err(error);state.report=data;await openReport(data.id);
}
async function openReport(id){
 try{const {data:r,error}=await supabase.from('daily_reports').select('*').eq('id',id).single();if(error)throw error;state.report=r;
 const [a,b,c,d,e]=await Promise.all([
  supabase.from('production_entries').select('*,estimate_items(item_number,description,unit)').eq('daily_report_id',id),
  supabase.from('labor_entries').select('*,employees(full_name),estimate_items(item_number,description)').eq('daily_report_id',id),
  supabase.from('equipment_entries').select('*,equipment(name,equipment_number),estimate_items(item_number,description)').eq('daily_report_id',id),
  supabase.from('delay_entries').select('*').eq('daily_report_id',id),
  supabase.from('attachments').select('*').eq('daily_report_id',id).order('created_at',{ascending:false})
 ]);[a,b,c,d,e].forEach(x=>{if(x.error)throw x.error});renderReport({prod:a.data||[],labor:b.data||[],equip:c.data||[],delays:d.data||[],files:e.data||[]});}catch(e){err(e)}
}
function opt(items,label='description'){return items.map(x=>`<option value="${x.id}">${esc(x.item_number?x.item_number+' â ':'')}${esc(x[label]||x.name||x.full_name)}</option>`).join('')}
function renderReport(data){
 const r=state.report, canEdit=['draft','returned'].includes(r.status)&&r.foreman_user_id===state.session.user.id;
 app.innerHTML=shell(`<main><button class="back" id="backProject">â ${esc(state.project.name)}</button><div class="hero"><div><h1>Daily Report</h1><p>${esc(r.report_date)}</p></div><span class="status ${r.status}">${esc(r.status)}</span></div>
 ${canEdit?`<div class="tabs"><button data-tab="production" class="active">Production</button><button data-tab="crew">Crew</button><button data-tab="equipment">Equipment</button><button data-tab="files">Files</button></div>`:''}
 <section id="tab-production"><h2>Production</h2>${canEdit?`<form class="inline card" id="prodForm"><select name="item" required><option value="">Pay itemâ¦</option>${opt(state.items)}</select><input name="qty" type="number" step="any" min="0" placeholder="Quantity" required><button>Add</button></form>`:''}<div class="list">${data.prod.map(x=>`<div class="row"><div><strong>${esc(x.estimate_items?.item_number)} ${esc(x.estimate_items?.description)}</strong><span>${esc(x.notes||'')}</span></div><b>${Number(x.quantity).toLocaleString()} ${esc(x.estimate_items?.unit)}</b></div>`).join('')||'<p>No production entered.</p>'}</div></section>
 <section id="tab-crew" class="tabpane"><h2>Crew hours</h2>${canEdit?`<form class="stack card" id="laborForm"><select name="employee" required><option value="">Employeeâ¦</option>${state.employees.map(x=>`<option value="${x.id}">${esc(x.full_name)}${x.classification?' â '+esc(x.classification):''}</option>`).join('')}</select><select name="item" required><option value="">Pay itemâ¦</option>${opt(state.items)}</select><div class="two"><label>Regular<input name="reg" type="number" step=".25" min="0" value="8"></label><label>Overtime<input name="ot" type="number" step=".25" min="0" value="0"></label></div><button>Add hours</button></form>`:''}<div class="list">${data.labor.map(x=>`<div class="row"><div><strong>${esc(x.employees?.full_name)}</strong><span>${esc(x.estimate_items?.item_number)} ${esc(x.estimate_items?.description)}</span></div><b>${Number(x.regular_hours)+Number(x.overtime_hours)} hr</b></div>`).join('')||'<p>No crew hours entered.</p>'}</div></section>
 <section id="tab-equipment" class="tabpane"><h2>Equipment hours</h2>${canEdit?`<form class="stack card" id="equipForm"><select name="equipment" required><option value="">Equipmentâ¦</option>${state.equipment.map(x=>`<option value="${x.id}">${esc(x.equipment_number?x.equipment_number+' â ':'')}${esc(x.name)}</option>`).join('')}</select><select name="item" required><option value="">Pay itemâ¦</option>${opt(state.items)}</select><div class="two"><label>Operating<input name="op" type="number" step=".25" min="0" value="8"></label><label>Idle<input name="idle" type="number" step=".25" min="0" value="0"></label></div><button>Add hours</button></form>`:''}<div class="list">${data.equip.map(x=>`<div class="row"><div><strong>${esc(x.equipment?.name)}</strong><span>${esc(x.estimate_items?.item_number)} ${esc(x.estimate_items?.description)}</span></div><b>${Number(x.operating_hours)+Number(x.idle_hours)+Number(x.downtime_hours)} hr</b></div>`).join('')||'<p>No equipment hours entered.</p>'}</div></section>
 <section id="tab-files" class="tabpane"><h2>Photos & tickets</h2>${canEdit?`<form class="stack card" id="fileForm"><input type="file" name="file" accept="image/*,.pdf" required><select name="type"><option>Job Photo</option><option>Asphalt Ticket</option><option>Stone Ticket</option><option>Concrete Ticket</option><option>Disposal Ticket</option><option>Delivery Slip</option><option>Other</option></select><input name="caption" placeholder="Caption (optional)"><button>Upload</button></form>`:''}<div class="list">${data.files.map(x=>`<button class="row file" data-file="${x.storage_path}"><div><strong>${esc(x.original_filename)}</strong><span>${esc(x.attachment_type||'File')} ${esc(x.caption||'')}</span></div><span>Open</span></button>`).join('')||'<p>No files uploaded.</p>'}</div></section>
 ${canEdit?'<button class="submit" id="submitReport">Submit daily report</button>':''}</main>`);
 bindShell();$('#backProject').onclick=()=>openProject(state.project.id);setupTabs();
 if(canEdit){$('#prodForm').onsubmit=addProd;$('#laborForm').onsubmit=addLabor;$('#equipForm').onsubmit=addEquipment;$('#fileForm').onsubmit=uploadFile;$('#submitReport').onclick=submitReport;}
 document.querySelectorAll('[data-file]').forEach(b=>b.onclick=()=>openFile(b.dataset.file));
}
function setupTabs(){document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.tabpane,#tab-production').forEach(x=>x.style.display='none');$('#tab-'+b.dataset.tab).style.display='block';});}
async function addProd(e){e.preventDefault();const f=new FormData(e.target);const {error}=await supabase.from('production_entries').insert({daily_report_id:state.report.id,estimate_item_id:f.get('item'),quantity:+f.get('qty')});if(error)return err(error);openReport(state.report.id)}
async function addLabor(e){e.preventDefault();const f=new FormData(e.target);const {error}=await supabase.from('labor_entries').insert({daily_report_id:state.report.id,employee_id:f.get('employee'),estimate_item_id:f.get('item'),regular_hours:+f.get('reg'),overtime_hours:+f.get('ot')});if(error)return err(error);openReport(state.report.id)}
async function addEquipment(e){e.preventDefault();const f=new FormData(e.target);const {error}=await supabase.from('equipment_entries').insert({daily_report_id:state.report.id,equipment_id:f.get('equipment'),estimate_item_id:f.get('item'),operating_hours:+f.get('op'),idle_hours:+f.get('idle'),downtime_hours:0});if(error)return err(error);openReport(state.report.id)}
async function uploadFile(e){e.preventDefault();const f=new FormData(e.target),file=f.get('file');if(!file?.size)return;const ext=(file.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'');const path=`${state.membership.company_id}/${state.project.id}/${state.report.id}/${crypto.randomUUID()}.${ext}`;const {error:ue}=await supabase.storage.from('job-attachments').upload(path,file,{contentType:file.type,upsert:false});if(ue)return err(ue);const {error}=await supabase.from('attachments').insert({company_id:state.membership.company_id,project_id:state.project.id,daily_report_id:state.report.id,uploaded_by:state.session.user.id,storage_bucket:'job-attachments',storage_path:path,original_filename:file.name,mime_type:file.type,file_size_bytes:file.size,attachment_type:f.get('type'),caption:f.get('caption')});if(error)return err(error);openReport(state.report.id)}
async function openFile(path){const {data,error}=await supabase.storage.from('job-attachments').createSignedUrl(path,60);if(error)return err(error);window.open(data.signedUrl,'_blank','noopener')}
async function submitReport(){if(!confirm('Submit this report for manager review?'))return;const {error}=await supabase.rpc('submit_daily_report',{p_report_id:state.report.id});if(error)return err(error);toast('Report submitted');openReport(state.report.id)}
function bindShell(){if($('#logout'))$('#logout').onclick=()=>supabase.auth.signOut();document.querySelectorAll('[data-home]').forEach(x=>x.onclick=renderHome)}
async function boot(session){state.session=session;if(!session)return renderLogin();try{await loadMembership();if(!state.membership){app.innerHTML='<main class="center"><div class="card"><h1>No CivilBid company membership</h1><p>This login exists in Supabase Auth, but is not yet assigned to a CivilBid company.</p><button id="logout">Sign out</button></div></main>';$('#logout').onclick=()=>supabase.auth.signOut();return}await loadProjects();renderHome()}catch(e){app.innerHTML='<main class="center"><div class="card"><h1>Setup error</h1><pre>'+esc(e.message)+'</pre></div></main>';}}
if(supabase){supabase.auth.getSession().then(({data})=>boot(data.session));supabase.auth.onAuthStateChange((_e,s)=>boot(s));if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(console.warn));}
