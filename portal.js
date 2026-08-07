import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.9/+esm';

const FALLBACK_SUPABASE_URL = 'https://utjhprrupedrqouspoiu.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0amhwcnJ1cGVkcnFvdXNwb2l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNTYyMTQsImV4cCI6MjEwMTYzMjIxNH0.LpKFFVVoleFCpGaxhFjTaYg9Q3Y8YWCHufyeVbn1G40';
const runtimeConfig = window.__F3_CONFIG__ || {};
const config = {
  supabaseUrl: runtimeConfig.supabaseUrl || FALLBACK_SUPABASE_URL,
  supabaseKey: runtimeConfig.supabaseKey || FALLBACK_SUPABASE_ANON_KEY
};
const configured = Boolean(config.supabaseUrl && config.supabaseKey);
const db = configured ? createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
window.F3_SUPABASE = db;

const shell = document.querySelector('.app-shell');
shell.hidden = true;

const auth = document.createElement('section');
auth.className = 'f3-login';
document.body.appendChild(auth);

const qs = new URLSearchParams(location.search);
let workspace = qs.get('workspace') || '';
let workspaceSettings = null;

const escapeHtml = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

async function getWorkspace(slug){
  if(!db || !slug) return null;
  const {data} = await db.from('workspace_login').select('client_id,slug,display_name,auth_method').eq('slug', slug).eq('active', true).maybeSingle();
  return data || null;
}

function authLayout(inner, kicker='F3 OPERATING SYSTEM'){
  auth.innerHTML = `<div class="login-brand-panel"><img src="./assets/f3-logo.png" alt="F3 Strategy"><div><span>FACES.</span><span>FOOD.</span><span>FEELING.</span></div><p>THE WORK HAS A HOME NOW.</p></div><div class="login-form-panel"><div class="login-form-wrap"><p class="eyebrow">${kicker}</p>${inner}</div><div class="login-footer"><span>F3 STRATEGY</span><span>SECURE CLIENT ACCESS</span></div></div>`;
}

function message(text, bad=false){
  const el=auth.querySelector('.auth-message');
  if(el){el.textContent=text; el.classList.toggle('bad',bad)}
}

function showUnifiedLogin(prefillEmail=''){
  authLayout(`<div class="login-minimal-wrap"><h1>Sign in.</h1><p class="login-intro simple">Access F3 OS with the email address invited by F3.</p><form id="password-login" class="login-stack minimal"><label>EMAIL<input name="email" type="email" autocomplete="email" required placeholder="you@company.com" value="${escapeHtml(prefillEmail)}"></label><label>PASSWORD<input name="password" type="password" autocomplete="current-password" required placeholder="Enter your password"></label><button class="button acid login-submit">SIGN IN →</button></form><div class="login-secondary-actions"><button class="login-link" id="magic-link" type="button">Email me a sign-in link</button><button class="login-link" id="forgot" type="button">Forgot password?</button></div><p class="login-micro">Client work. Approvals. Campaigns. Billing.</p><div class="auth-message"></div></div>`,'SECURE SIGN-IN');
  auth.querySelector('#password-login').onsubmit=e=>signInPassword(e);
  auth.querySelector('#magic-link').onclick=()=>sendMagicLinkFromPrimary();
  auth.querySelector('#forgot').onclick=()=>{
    const email = auth.querySelector('#password-login [name=email]')?.value || '';
    resetPassword(email);
  };
}

async function showEntry(){
  if(!configured){
    authLayout(`<h1>One wire is missing.</h1><p class="login-intro">The public Supabase login settings are missing from this build.</p>`,'SETUP REQUIRED');
    return;
  }
  if(workspace){
    workspaceSettings = await getWorkspace(workspace);
    if(workspaceSettings) return showClientLogin();
  }
  showUnifiedLogin();
}

function showStaffLogin(){
  workspace='';workspaceSettings=null;history.replaceState({},'',location.pathname);
  authLayout(`<button class="login-back" id="back">← BACK</button><h1>Make the work move.</h1><p class="login-intro">F3 team access.</p><form id="password-login" class="login-stack"><label>EMAIL<input name="email" type="email" autocomplete="email" required value="jason@f3works.com"></label><label>PASSWORD<input name="password" type="password" autocomplete="current-password" required></label><button class="button acid">ENTER F3 →</button></form><button class="login-link" id="forgot">Forgot password?</button><div class="auth-message"></div>`,'INTERNAL ACCESS');
  auth.querySelector('#back').onclick=showEntry;
  auth.querySelector('#password-login').onsubmit=e=>signInPassword(e);
  auth.querySelector('#forgot').onclick=()=>resetPassword(auth.querySelector('[name=email]').value);
}

function showClientLogin(){
  const w=workspaceSettings;
  const canPassword=['password','both'].includes(w.auth_method);
  const canMagic=['magic_link','both'].includes(w.auth_method);
  authLayout(`<button class="login-back" id="back">← BACK</button><div class="workspace-tag">WORKSPACE / ${escapeHtml(w.display_name).toUpperCase()}</div><h1>Your work.<br>Your call.</h1><p class="login-intro">Review, comment and approve without digging through email.</p>${canPassword?`<form id="password-login" class="login-stack"><label>EMAIL<input name="email" type="email" autocomplete="email" required></label><label>PASSWORD<input name="password" type="password" autocomplete="current-password" required></label><button class="button acid">SIGN IN →</button></form>`:''}${canPassword&&canMagic?'<div class="login-or"><span>OR</span></div>':''}${canMagic?`<form id="magic-login" class="magic-row"><input name="email" type="email" placeholder="you@company.com" required><button>EMAIL ME A SIGN-IN LINK →</button></form>`:''}<div class="auth-message"></div>`,'CLIENT ACCESS');
  auth.querySelector('#back').onclick=showEntry;
  auth.querySelector('#password-login')?.addEventListener('submit',e=>signInPassword(e));
  auth.querySelector('#magic-login')?.addEventListener('submit',sendMagicLink);
}

async function signInPassword(e){
  e.preventDefault();message('Signing in…');
  const f=new FormData(e.currentTarget);
  const {error}=await db.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});
  if(error)return message(error.message,true);
}


async function sendMagicLinkFromPrimary(){
  const email = auth.querySelector('#password-login [name=email]')?.value?.trim();
  if(!email) return message('Enter your email address first.', true);
  message('Sending secure link…');
  const redirect=workspace ? `${location.origin}${location.pathname}?workspace=${encodeURIComponent(workspace)}` : `${location.origin}${location.pathname}`;
  const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:redirect,shouldCreateUser:true}});
  if(error) return message(error.message,true);
  message('Check your email. The sign-in link is on its way.');
}

async function sendMagicLink(e){
  e.preventDefault();message('Sending secure link…');
  const email=new FormData(e.currentTarget).get('email');
  const redirect=workspace ? `${location.origin}${location.pathname}?workspace=${encodeURIComponent(workspace)}` : `${location.origin}${location.pathname}`;
  const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:redirect,shouldCreateUser:true}});
  if(error)return message(error.message,true);
  message('Check your email. The link will bring you straight back here.');
}

async function resetPassword(email){
  if(!email)return message('Enter your email first.',true);
  const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}${location.pathname}`});
  message(error?error.message:'Password reset email sent.',Boolean(error));
}

async function signOut(){await db.auth.signOut();location.href=location.pathname;}

async function routeSession(session){
  if(!session){shell.hidden=true;auth.hidden=false;return showEntry()}
  const {data:profile,error}=await db.from('profiles').select('*').eq('id',session.user.id).single();
  if(error || !profile){await db.auth.signOut();shell.hidden=true;auth.hidden=false;return showEntry()}
  auth.hidden=true;shell.hidden=false;
  if(profile.user_type==='staff') return enterStaff(profile);
  return enterClient(profile);
}

async function enterStaff(profile){
  document.body.dataset.mode='staff';
  const app=window.F3_APP;
  const [{data:clients},{data:projects},{data:approvals},{data:campaigns},{data:invoices}] = await Promise.all([
    db.from('clients').select('*').order('name'),
    db.from('projects').select('*,clients(name)').order('created_at',{ascending:false}),
    db.from('approvals').select('*,clients(name),creative_versions(version_number,creative_assets(name))').order('created_at',{ascending:false}),
    db.from('campaigns').select('*,clients(name)').order('created_at',{ascending:false}),
    db.from('invoices').select('*,clients(name)').order('created_at',{ascending:false})
  ]);
  if(app){
    app.state.clients=(clients||[]).map(c=>({id:c.id,name:c.name,contact:[c.primary_contact_name,c.primary_contact_email].filter(Boolean).join(' · '),status:titleCase(c.status),retainer:Number(c.monthly_value||0),openJobs:0,initials:c.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase(),health:90}));
    app.state.projects=(projects||[]).map(p=>({title:p.name,client:p.clients?.name||'',stage:statusLabel(p.status),due:p.due_date||'No date',type:'Client work'}));
    app.state.approvals=(approvals||[]).map(a=>({item:a.creative_versions?.creative_assets?.name||'Creative proof',client:a.clients?.name||'',version:`V${a.creative_versions?.version_number||1}`,status:statusLabel(a.status),sent:a.requested_at?new Date(a.requested_at).toLocaleDateString('en-CA',{month:'short',day:'numeric'}):'Draft',owner:'Client'}));
    app.state.campaigns=(campaigns||[]).map(c=>({name:c.name,client:c.clients?.name||'',platform:c.platform,budget:Number(c.media_budget||0),status:titleCase(c.status),spend:Number(c.spend||0),results:Number(c.results_count||0)}));
    app.state.invoices=(invoices||[]).map(i=>({number:i.invoice_number,client:i.clients?.name||'',amount:Number(i.amount||0),due:i.due_date||'',status:titleCase(i.status)}));
    app.render();
  }
  const profileButton=document.querySelector('.profile-button');
  if(profileButton){profileButton.querySelector('strong').textContent=profile.full_name||'F3';profileButton.onclick=signOut;profileButton.title='Sign out'}
  installRealProofUploader();
}

function titleCase(s=''){return s.replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase())}
function statusLabel(s=''){const map={client_review:'Client Review',changes_requested:'Changes requested'};return map[s]||titleCase(s)}

async function enterClient(profile){
  const {data:membership,error}=await db.from('client_members').select('can_approve,is_billing_contact,clients(*)').eq('user_id',profile.id).limit(1).single();
  if(error || !membership?.clients){shell.hidden=true;auth.hidden=false;authLayout(`<h1>No workspace yet.</h1><p class="login-intro">Your login works, but it has not been assigned to a client workspace.</p><button class="button acid" id="signout">SIGN OUT</button>`);auth.querySelector('#signout').onclick=signOut;return}
  const client=membership.clients;
  if(workspace && client.slug!==workspace){await signOut();return}
  renderClientPortalReal(profile,client,membership);
}

async function loadClientData(clientId){
  const [{data:projects},{data:approvals},{data:campaigns},{data:invoices}] = await Promise.all([
    db.from('projects').select('*').eq('client_id',clientId).order('created_at',{ascending:false}),
    db.from('approvals').select('*,creative_versions(id,version_number,storage_path,mime_type,notes,creative_assets(name))').eq('client_id',clientId).is('superseded_at',null).order('created_at',{ascending:false}),
    db.from('campaigns').select('*').eq('client_id',clientId).order('created_at',{ascending:false}),
    db.from('invoices').select('*').eq('client_id',clientId).order('created_at',{ascending:false})
  ]);
  return {projects:projects||[],approvals:approvals||[],campaigns:campaigns||[],invoices:invoices||[]};
}

async function renderClientPortalReal(profile,client,membership){
  document.body.dataset.mode='client';
  const data=await loadClientData(client.id);
  shell.innerHTML=`<aside class="client-rail"><button class="client-logo"><img src="./assets/f3-logo.png" alt="F3 Strategy"><span>CLIENT<br>PORTAL</span></button><div class="client-company"><small>WORKSPACE</small><strong>${escapeHtml(client.name).toUpperCase()}</strong><span class="status-dot">ACTIVE PARTNERSHIP</span></div><nav class="client-nav"><button class="active" data-client-view="home"><span>01</span>Overview</button><button data-client-view="proofs"><span>02</span>Proofs <b>${data.approvals.filter(a=>a.status!=='approved').length}</b></button><button data-client-view="work"><span>03</span>Active work</button><button data-client-view="results"><span>04</span>Campaigns</button><button data-client-view="files"><span>05</span>Billing</button></nav><button class="client-signout" id="client-signout">SIGN OUT ↗</button></aside><main class="client-main"><header class="client-top"><div><p class="eyebrow">F3 × ${escapeHtml(client.name).toUpperCase()}</p><h1 id="client-page-title">The work, without the chase.</h1></div><button class="button acid" id="new-request">Submit a request ↗</button></header><section id="client-view" class="client-view"></section></main>`;
  document.querySelector('#client-signout').onclick=signOut;
  document.querySelector('#new-request').onclick=()=>openRequest(client.id,profile.id);
  document.querySelectorAll('[data-client-view]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('[data-client-view]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');renderClientViewReal(btn.dataset.clientView,profile,client,membership,data)});
  renderClientViewReal('home',profile,client,membership,data);
}

function proofCard(a){const v=a.creative_versions;return `<article class="proof-card ${a.status==='approved'?'approved':''}" data-proof="${a.id}"><div class="proof-art"><span>CREATIVE PROOF</span><strong>${escapeHtml(v?.creative_assets?.name||'F3 CREATIVE')}</strong><i>F3</i></div><div class="proof-copy"><div class="proof-meta"><span>V${v?.version_number||1}</span><span>${a.requested_at?new Date(a.requested_at).toLocaleDateString():'DRAFT'}</span></div><h3>${escapeHtml(v?.creative_assets?.name||'Creative proof')}</h3><p>${escapeHtml(v?.notes||'Review this exact version and leave one clear decision.')}</p><div class="proof-state">${statusLabel(a.status).toUpperCase()}</div></div><button class="proof-open">OPEN PROOF ↗</button></article>`}

function renderClientViewReal(page,profile,client,membership,data){
  const target=document.querySelector('#client-view'),title=document.querySelector('#client-page-title');
  if(page==='home'){
    const waiting=data.approvals.filter(a=>a.status!=='approved').length;
    title.textContent='The work, without the chase.';
    target.innerHTML=`<section class="client-hero"><div><span>HELLO, ${escapeHtml((profile.full_name||'THERE').toUpperCase())}.</span><h2>${waiting?`${waiting} decision${waiting===1?'':'s'} need your eyes.`:'Nothing is blocking the work.'}</h2><p>Everything F3 needs from you is collected here.</p></div><aside><small>WORKSPACE</small><strong>${data.projects.length}</strong><span>ACTIVE / RECENT JOBS</span></aside></section><div class="client-stat-row"><article><span>01</span><strong>${waiting.toString().padStart(2,'0')}</strong><p>Waiting on you</p></article><article><span>02</span><strong>${data.projects.filter(p=>!['complete','archived'].includes(p.status)).length.toString().padStart(2,'0')}</strong><p>Moving at F3</p></article><article><span>03</span><strong>${data.campaigns.filter(c=>c.status==='live').length.toString().padStart(2,'0')}</strong><p>Live campaigns</p></article><article><span>04</span><strong>${data.invoices.filter(i=>i.status!=='paid').length.toString().padStart(2,'0')}</strong><p>Open invoices</p></article></div><div class="client-section-head"><div><p class="eyebrow">DECISIONS</p><h2>Ready for review.</h2></div></div><div class="proof-grid">${data.approvals.filter(a=>a.status!=='approved').map(proofCard).join('')||'<div class="empty-state"><h2>ALL CLEAR.</h2><p>No proofs are waiting for you.</p></div>'}</div>`;
  } else if(page==='proofs'){
    title.textContent='Look. Comment. Decide.';target.innerHTML=`<div class="client-section-head"><div><p class="eyebrow">CREATIVE SIGN-OFF</p><h2>Proofs in play.</h2></div><p class="section-note">Approval is attached to the exact version you reviewed.</p></div><div class="proof-grid all">${data.approvals.map(proofCard).join('')||'<div class="empty-state"><h2>NO PROOFS YET.</h2></div>'}</div>`;
  } else if(page==='work'){
    title.textContent='What F3 is moving.';target.innerHTML=`<div class="work-radar">${data.projects.map(p=>`<article><span>${statusLabel(p.status).toUpperCase()}</span><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.brief||'Client work in motion.')}</p><b>${p.due_date||'OPEN'}</b></article>`).join('')||'<div class="empty-state"><h2>THE QUEUE IS EMPTY.</h2></div>'}</div>`;
  } else if(page==='results'){
    title.textContent='Campaign pulse.';target.innerHTML=`<div class="work-radar">${data.campaigns.map(c=>`<article><span>${escapeHtml(c.platform.toUpperCase())} / ${escapeHtml(c.status.toUpperCase())}</span><h3>${escapeHtml(c.name)}</h3><p>Budget ${Number(c.media_budget||0).toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0})}</p><b>${Number(c.results_count||0)} RESULTS</b></article>`).join('')||'<div class="empty-state"><h2>NO CAMPAIGNS YET.</h2></div>'}</div>`;
  } else {
    title.textContent='The money, clearly.';target.innerHTML=`<div class="file-stack">${data.invoices.map(i=>`<article><div>$</div><span><strong>${escapeHtml(i.invoice_number)}</strong><small>${escapeHtml(statusLabel(i.status))} · due ${i.due_date||'—'}</small></span><button>${Number(i.amount).toLocaleString('en-CA',{style:'currency',currency:'CAD'})}</button></article>`).join('')||'<div class="empty-state"><h2>NO INVOICES YET.</h2></div>'}</div>`;
  }
  target.querySelectorAll('[data-proof]').forEach(el=>el.onclick=()=>openRealProof(el.dataset.proof,membership.can_approve,data));
}

async function openRealProof(approvalId,canApprove,data){
  const a=data.approvals.find(x=>x.id===approvalId);if(!a)return;
  const v=a.creative_versions;
  let signed='';
  if(v?.storage_path){const {data:s}=await db.storage.from('creative-proofs').createSignedUrl(v.storage_path,900);signed=s?.signedUrl||''}
  const overlay=document.createElement('div');overlay.className='proof-overlay';overlay.innerHTML=`<div class="proof-workspace"><header><div><p>CREATIVE PROOF / V${v?.version_number||1}</p><h2>${escapeHtml(v?.creative_assets?.name||'Creative')}</h2></div><button class="proof-close">×</button></header><div class="proof-layout"><section class="proof-canvas">${signed?`<div class="real-proof-media">${(v.mime_type||'').startsWith('image/')?`<img src="${signed}" alt="Creative proof">`:`<iframe src="${signed}" title="Creative proof"></iframe>`}</div>`:`<div class="proof-full-art"><span>F3 STRATEGY</span><h3>${escapeHtml(v?.creative_assets?.name||'CREATIVE')}</h3><p>FILE PREVIEW WILL APPEAR HERE.</p><i>V${v?.version_number||1}</i></div>`}</section><aside class="proof-panel"><div class="version-line"><span>VERSION</span><strong>V${v?.version_number||1}</strong></div><h3>Your call.</h3><p>${escapeHtml(v?.notes||'Review this exact version.')}</p><label>COMMENTS OR CHANGES<textarea id="proof-feedback" placeholder="Point us in the right direction..."></textarea></label><div class="proof-actions"><button class="request-change">REQUEST CHANGES</button>${canApprove?`<button class="approve-proof">APPROVE V${v?.version_number||1} ↗</button>`:''}</div><small>Approval records your identity, timestamp and this exact version. A new version requires new approval.</small></aside></div></div>`;
  document.body.appendChild(overlay);overlay.querySelector('.proof-close').onclick=()=>overlay.remove();
  overlay.querySelector('.request-change').onclick=async()=>{const feedback=overlay.querySelector('#proof-feedback').value.trim();if(!feedback)return;const {error}=await db.rpc('request_proof_changes',{target_approval_id:a.id,feedback_text:feedback});if(error)return alert(error.message);location.reload()};
  overlay.querySelector('.approve-proof')?.addEventListener('click',async()=>{const feedback=overlay.querySelector('#proof-feedback').value.trim()||null;const {error}=await db.rpc('approve_proof',{target_approval_id:a.id,feedback_text:feedback});if(error)return alert(error.message);location.reload()});
}

function openRequest(clientId,userId){
  const overlay=document.createElement('div');overlay.className='proof-overlay';overlay.innerHTML=`<form class="request-sheet"><button type="button" class="proof-close">×</button><p class="eyebrow">NEW REQUEST</p><h2>What needs moving?</h2><label>REQUEST TITLE<input name="title" required placeholder="Example: September promotion"></label><label>WHAT DO YOU NEED?<textarea name="details" required placeholder="Context, dates and desired outcome."></textarea></label><label>IDEAL DATE<input name="desired_date" type="date"></label><button class="button acid" type="submit">SEND TO F3 ↗</button></form>`;document.body.appendChild(overlay);overlay.querySelector('.proof-close').onclick=()=>overlay.remove();overlay.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));const {error}=await db.from('client_requests').insert({client_id:clientId,submitted_by:userId,title:f.title,details:f.details,desired_date:f.desired_date||null});if(error)return alert(error.message);overlay.innerHTML='<div class="request-success"><strong>REQUEST RECEIVED.</strong><p>It is now in the F3 work queue.</p><button class="button acid">BACK TO PORTAL</button></div>';overlay.querySelector('button').onclick=()=>overlay.remove()};
}

function installRealProofUploader(){
  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-add="approval"]');
    if(!btn)return;e.preventDefault();e.stopImmediatePropagation();openProofUploader();
  },true);
}

async function openProofUploader(){
  const {data:clients}=await db.from('clients').select('id,name').eq('status','active').order('name');
  const overlay=document.createElement('div');overlay.className='proof-overlay';overlay.innerHTML=`<form class="request-sheet" id="proof-upload-form"><button type="button" class="proof-close">×</button><p class="eyebrow">SEND A REAL PROOF</p><h2>Put it in front of them.</h2><label>CLIENT<select name="client_id" required>${(clients||[]).map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></label><label>PROOF NAME<input name="name" required placeholder="August Meta campaign"></label><label>FILE<input name="file" type="file" required accept="image/*,application/pdf"></label><label>NOTE<textarea name="notes" placeholder="What should the client check?"></textarea></label><button class="button acid" type="submit">UPLOAD + SEND FOR APPROVAL ↗</button><div class="auth-message"></div></form>`;document.body.appendChild(overlay);overlay.querySelector('.proof-close').onclick=()=>overlay.remove();overlay.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,fd=new FormData(form),clientId=fd.get('client_id'),file=fd.get('file'),name=fd.get('name'),notes=fd.get('notes');const msg=form.querySelector('.auth-message');msg.textContent='Uploading…';const {data:user}=await db.auth.getUser();const {data:asset,error:assetErr}=await db.from('creative_assets').insert({client_id:clientId,name}).select().single();if(assetErr){msg.textContent=assetErr.message;return}const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-');const path=`${clientId}/${asset.id}/${Date.now()}-${safe}`;const {error:uploadErr}=await db.storage.from('creative-proofs').upload(path,file,{contentType:file.type,upsert:false});if(uploadErr){msg.textContent=uploadErr.message;return}const {data:version,error:versionErr}=await db.from('creative_versions').insert({asset_id:asset.id,version_number:1,storage_path:path,mime_type:file.type,notes,created_by:user.user.id}).select().single();if(versionErr){msg.textContent=versionErr.message;return}const {error:approvalErr}=await db.from('approvals').insert({client_id:clientId,creative_version_id:version.id,status:'waiting',requested_at:new Date().toISOString()});if(approvalErr){msg.textContent=approvalErr.message;return}location.reload()};
}

if(db){
  db.auth.onAuthStateChange((_event,session)=>setTimeout(()=>routeSession(session),0));
  const {data:{session}}=await db.auth.getSession();
  await routeSession(session);
}else{
  showEntry();
}
