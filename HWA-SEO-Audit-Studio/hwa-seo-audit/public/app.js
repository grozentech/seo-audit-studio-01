const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shortUrl=url=>{try{const u=new URL(url);return u.hostname+u.pathname;}catch{return url;}};
let last=null, sample=false;
const severityOrder={Critical:0,High:1,Medium:2,Low:3};
const count=(issues,severity)=>issues.filter(i=>i.severity===severity).length;
const setStatus=(message,kind='')=>{const el=$('status');el.className='status '+kind;el.textContent=message;};
$('compareToggle').addEventListener('change',e=>{$('competitorFields').hidden=!e.target.checked;});
$('auditForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const urls=[$('primary').value.trim()];
  if($('compareToggle').checked){const c1=$('competitor1').value.trim(),c2=$('competitor2').value.trim();if(c1)urls.push(c1);if(c2)urls.push(c2);}
  if(!urls[0]){setStatus('Enter your website URL.','error');return;}
  $('auditButton').disabled=true;$('auditButton').textContent='Auditing websites...';
  setStatus(`Scanning ${urls.length} website(s). Limits: ${$('pageLimit').value} pages per site. This can take time on slow websites.`, 'busy');
  try{
    const response=await fetch('/api/audit',{method:'POST',headers:{'Content-Type':'application/json','X-Audit-Password':$('auditPassword').value},body:JSON.stringify({urls,maxPages:Number($('pageLimit').value)})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Audit failed.');
    sample=false;last=data;render(data);setStatus(`Live crawl completed • ${data.sites.length} website(s) checked. Review each issue and URL before presenting a client report.`);
  }catch(e){setStatus(e.message||'Audit failed.','error');}
  finally{$('auditButton').disabled=false;$('auditButton').innerHTML='<span>⌕</span> Analyze websites <b>↗</b>';}
});

function demoData(){
  const base=[['yourbusiness.example',83,8,'Found','Found'],['competitor-one.example',68,8,'Found','Not found'],['competitor-two.example',76,8,'Found','Found']];
  const defs=[
    ['On-page','High','Missing page title','Homepage has no useful <title> element.','Write a unique page title focused on the page topic.','/services'],
    ['On-page','Medium','Missing meta description','No description found in HTML.','Add a concise, unique page summary.','/'],
    ['Technical','High','Noindex directive detected','robots meta includes noindex.','Review whether this page should be indexable.','/contact'],
    ['Technical','Medium','Mobile viewport tag missing','The HTML lacks a mobile viewport tag.','Add the appropriate viewport meta tag.','/about'],
    ['On-page','Low','Long page title','Title may truncate in search displays.','Keep titles useful and concise.','/blog']
  ];
  return {generatedAt:new Date().toISOString(),limit:8,sites:base.map(([site,score,n,robots,sitemap],si)=>{
    const issues=defs.filter((_,i)=>si===0||i%3!==si-1).map(([category,severity,title,detail,fix,pathname],i)=>({id:`sample${si}${i}`,site,url:`https://${site}${pathname}`,category,severity,title,detail,fix}));
    return {site,start:`https://${site}/`,score,robots,sitemap,warnings:[],issues,pages:Array.from({length:n},(_,i)=>({url:`https://${site}${i?'/page-'+i:''}`,status:200,ms:340+i*85,bytes:12000,title:i===1?'Example page title':`Sample page ${i}`,h1Count:1,missingAlt:i%3===0?2:0,wordCount:400}))};
  }),disclaimer:'This is sample data only. It is NOT a live crawl.'};
}
$('demoButton').addEventListener('click',()=>{last=demoData();sample=true;render(last);setStatus('SAMPLE REPORT ONLY — illustrative data; no websites were crawled.');$('results').scrollIntoView({behavior:'smooth'});});

function metric(label,value,note,cls=''){
 return `<article class="metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value ${cls}">${escapeHtml(value)}</div><div class="metric-note">${escapeHtml(note)}</div></article>`;
}
function render(data){
  const sites=data.sites||[],issues=sites.flatMap(s=>s.issues||[]).sort((a,b)=>severityOrder[a.severity]-severityOrder[b.severity]);
  const pages=sites.flatMap(s=>(s.pages||[]).map(p=>({...p,site:s.site})));
  const critical=issues.filter(i=>['Critical','High'].includes(i.severity)).length;
  $('results').hidden=false;$('sampleLabel').textContent=sample?'• SAMPLE DATA':'';
  $('runMeta').textContent=`${sites.length} domain(s) • ${pages.length} page(s) fetched • ${new Date(data.generatedAt).toLocaleString()}${sample?' • illustrative sample':''}`;
  $('metrics').innerHTML=metric('WEBSITES ANALYZED',sites.length,'Up to 3 domains')+
    metric('PAGES CRAWLED',pages.length,`Up to ${data.limit} per site`)+
    metric('ISSUES DETECTED',issues.length,'Across all audited pages')+
    metric('CRITICAL + HIGH',critical,'Prioritize these fixes','red');
  $('comparisonCards').innerHTML=sites.map((s,i)=>`<div class="site-card ${i===0?'primary':''}"><div class="site-card-top"><span class="role">${i===0?'YOUR WEBSITE':`COMPETITOR ${String(i).padStart(2,'0')}`}</span><span class="tag">${(s.pages||[]).length} pages</span></div><div class="domain" title="${escapeHtml(s.site)}">${escapeHtml(s.site)}</div><div class="scoreline"><strong>${escapeHtml(s.score)}<small>/100</small></strong><small>Diagnostic score</small></div><div class="scorebar"><span style="width:${Math.max(0,Math.min(100,Number(s.score)||0))}%"></span></div><div class="metric-note">${(s.issues||[]).length} checks flagged • ${count(s.issues||[],'High')} high</div></div>`).join('');
  $('compareTable').innerHTML=sites.map(s=>`<tr><td><strong>${escapeHtml(s.site)}</strong></td><td>${s.pages.length}</td><td>${count(s.issues,'Critical')}</td><td>${count(s.issues,'High')}</td><td>${count(s.issues,'Medium')}</td><td>${count(s.issues,'Low')}</td><td>${escapeHtml(s.robots)}</td><td>${escapeHtml(s.sitemap)}</td></tr>`).join('');
  $('siteFilter').innerHTML='<option value="all">All websites</option>'+sites.map(s=>`<option value="${escapeHtml(s.site)}">${escapeHtml(s.site)}</option>`).join('');
  $('siteFilter').value='all';$('severityFilter').value='all';$('categoryFilter').value='all';$('issueSearch').value='';
  renderIssues(issues);['siteFilter','severityFilter','categoryFilter','issueSearch'].forEach(id=>$(id).oninput=()=>renderIssues(issues));
  $('pagesTable').innerHTML=pages.length?pages.map(p=>`<tr><td><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortUrl(p.url))} ↗</a></td><td><span class="pill-status ${p.status<200||p.status>=400?'bad':''}">${p.status||'FAIL'}</span></td><td>${escapeHtml(p.title||'—')}</td><td>${p.h1Count}</td><td>${p.missingAlt}</td><td>${p.ms}ms</td></tr>`).join(''):'<tr><td colspan="6">No accessible pages were crawled for these domains.</td></tr>';
}
function renderIssues(issues){
  const site=$('siteFilter').value,severity=$('severityFilter').value,category=$('categoryFilter').value,q=$('issueSearch').value.toLowerCase();
  const selected=issues.filter(i=>(site==='all'||i.site===site)&&(severity==='all'||i.severity===severity)&&(category==='all'||i.category===category)&&[i.title,i.url,i.detail,i.fix,i.code].join(' ').toLowerCase().includes(q));
  $('issueCount').textContent=`${selected.length} issue(s)`;
  $('issueRows').innerHTML=selected.length?selected.slice(0,200).map(i=>`<article class="issue-row"><div class="issue-top"><span class="severity ${escapeHtml(i.severity)}">${escapeHtml(i.severity)}</span><span class="category">${escapeHtml(i.category)}</span><span class="issue-title">${escapeHtml(i.title)}</span></div><a class="issue-url" href="${escapeHtml(i.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(i.url)} ↗</a><div class="issue-details"><p><strong>WHAT WE FOUND</strong>${escapeHtml(i.detail)}</p><p><strong>RECOMMENDED FIX</strong>${escapeHtml(i.fix)}</p></div></article>`).join(''):'<div class="empty">No issues found for this filter. Try another severity or website.</div>';
}
function download(filename,content,type){
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
$('exportJson').addEventListener('click',()=>{if(last)download(`seo-audit-${sample?'SAMPLE-':''}${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({...last,isSample:sample},null,2),'application/json');});
$('exportCsv').addEventListener('click',()=>{
  if(!last)return;
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  const rows=[['Site','Page URL','Category','Severity','Issue','Detail','Recommended Fix']];
  for(const s of last.sites)for(const i of s.issues)rows.push([s.site,i.url,i.category,i.severity,i.title,i.detail,i.fix]);
  download(`seo-issues-${sample?'SAMPLE-':''}${new Date().toISOString().slice(0,10)}.csv`,'\ufeff'+rows.map(r=>r.map(quote).join(',')).join('\r\n'),'text/csv; charset=utf-8');
});
fetch('/api/config').then(r=>r.json()).then(config=>{$('passwordRow').hidden=!config.passwordRequired;}).catch(()=>{});
