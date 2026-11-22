import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export const limits = Object.freeze({minPages:1,maxPages:20,maxSites:3,maxBytes:1_500_000,maxRedirects:4,timeoutMs:9000});
const agentName = 'HWASeoAuditBot';
const wait = (ms) => new Promise(resolve => setTimeout(resolve,ms));
const normal = v => String(v??'').replace(/\s+/g,' ').trim();
const decodeHTML = text => String(text??'').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#(\d+)|#x([\da-f]+));/gi,(m,n,hex)=>{
  if(n || hex){const cp = parseInt(n||hex, hex?16:10); return cp>0 && cp<=0x10ffff ? String.fromCodePoint(cp):m;}
  return ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[m.toLowerCase()]||m;
});

const blockedIpv4 = (ip) => {
  const s=ip.split('.').map(Number);
  if(s.length!==4 || s.some(x=>!Number.isInteger(x)||x<0||x>255)) return true;
  const [a,b,c] = s;
  return a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||
    a===100&&b>=64&&b<=127||a===192&&b===0&&c===0||a===192&&b===0&&c===2||a===198&&(b===18||b===19)||
    a===198&&b===51&&c===100||a===203&&b===0&&c===113||a===192&&b===88&&c===99||a===255;
};

export function normalizeInput(value){
  if(typeof value!=='string'||value.length>2048) throw new Error('Enter a valid public website URL.');
  let s=value.trim();
  if(!/^https?:\/\//i.test(s)) s='https://'+s;
  let u;try{u=new URL(s);}catch{throw new Error('Enter a valid website URL (example: https://example.com).');}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&u.port!==(u.protocol==='http:'?'80':'443')) throw new Error('Only public HTTP/HTTPS URLs on standard ports are allowed.');
  if(!u.hostname.includes('.')||net.isIP(u.hostname)||/\.(local|internal|test|invalid|localhost)$/i.test(u.hostname)||u.hostname.toLowerCase()==='localhost') throw new Error('Enter a public domain name, not an internal host or IP address.');
  u.hash='';u.search='';
  return u.href;
}

async function publicIpv4(hostname){
  const addresses=await dns.lookup(hostname,{all:true,verbatim:true});
  if(addresses.length===0 || addresses.some(a=>a.family===4 && blockedIpv4(a.address))) throw new Error('Domain resolves to a private or restricted network address.');
  const ip=addresses.find(a=>a.family===4 && !blockedIpv4(a.address))?.address;
  if(!ip) throw new Error('This first version requires a public IPv4 website.');
  return ip;
}

// Every request is DNS validated, with the validated IP pinned for the TCP connection.
// No arbitrary ports, userinfo, internal addresses or automatic unchecked redirects.
async function request(url,{accept='text/html,application/xhtml+xml',maxBytes=limits.maxBytes}={}){
  let target=new URL(url);
  for(let hop=0;hop<=limits.maxRedirects;hop++){
    normalizeInput(target.href);
    const address=await publicIpv4(target.hostname);
    const result=await new Promise((resolve,reject)=>{
      const fn=target.protocol==='https:'?https:http;
      const options={protocol:target.protocol,hostname:target.hostname,port:target.protocol==='https:'?443:80,path:target.pathname+target.search,
        method:'GET',servername:target.hostname,lookup:(_hostname,_options,cb)=>cb(null,address,4),
        headers:{'User-Agent':`${agentName}/1.0 (+limited local SEO diagnostic)`,Accept:accept,'Accept-Encoding':'identity','Connection':'close'}};
      const req=fn.request(options,res=>{
        const status=res.statusCode||0, chunks=[];let size=0;
        if([301,302,303,307,308].includes(status)){
          const location=res.headers.location; res.resume();resolve({redirect:location,status,headers:res.headers});return;
        }
        res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error('Page too large for safe audit.'));return;} chunks.push(chunk);});
        res.on('end',()=>resolve({status,headers:res.headers,body:Buffer.concat(chunks).toString('utf8'),bytes:size}));
        res.on('error',reject);
      });
      req.on('error',reject); req.setTimeout(limits.timeoutMs,()=>req.destroy(new Error('Request timed out.')));req.end();
    });
    if(!result.redirect) return {...result,url:target.href,redirects:hop};
    target=new URL(result.redirect,target);
  }
  throw new Error('Too many redirects.');
}

const getTags=(html,tag)=>[...String(html).matchAll(new RegExp(`<${tag}(?=[\\s/>])[^>]*>`, 'gi'))].map(m=>m[0]);
function attrs(tag){const map={}; for(const match of tag.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)){
  if(!match[1].startsWith('<')) map[match[1].toLowerCase()]=decodeHTML(match[2]??match[3]??match[4]??'');
} return map;}
const escapeRegex = s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function tagContent(html,tag){const m=html.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`,'i'));return m?normal(decodeHTML(m[1].replace(/<[^>]+>/g,' '))):'';}
export function inspectHTML(html,url){
  const pageUrl=new URL(url), meta=getTags(html,'meta').map(attrs), links=getTags(html,'link').map(attrs);
  const title=tagContent(html,'title'),description=normal(meta.find(m=>m.name?.toLowerCase()==='description')?.content||'');
  const canonicalRaw=links.find(x=>x.rel?.toLowerCase().split(/\s+/).includes('canonical'))?.href||'';
  let canonical='';try{if(canonicalRaw) canonical=new URL(canonicalRaw,pageUrl).href;}catch{canonical=canonicalRaw;}
  const robots=normal(meta.filter(m=>/^(robots|googlebot)$/i.test(m.name||'')).map(m=>m.content).join(',')).toLowerCase();
  const heading1=getTags(html,'h1').length;
  const images=getTags(html,'img').map(attrs), missingAlt=images.filter(i=>!Object.hasOwn(i,'alt')).length;
  const htmlTag=getTags(html,'html')[0]||'', lang=attrs(htmlTag).lang||'';
  const viewport=!!meta.find(m=>m.name?.toLowerCase()==='viewport'&&m.content);
  const anchorUrls=[];
  for(const a of getTags(html,'a').map(attrs)){
    if(!a.href||/^(#|mailto:|tel:|javascript:|data:)/i.test(a.href))continue;
    try{let u=new URL(a.href,pageUrl);if(!['http:','https:'].includes(u.protocol)||u.hostname!==pageUrl.hostname)continue;
      if(/\.(pdf|jpg|jpeg|png|gif|webp|svg|css|js|mp4|zip|docx?|xlsx?|xml)(?:$|\?)/i.test(u.pathname))continue;
      if(/\/(?:logout|signout|delete|cart|checkout|wp-admin)(?:\/|$)/i.test(u.pathname))continue;
      u.hash='';u.search='';anchorUrls.push(u.href);
    }catch{}
  }
  const plain=html.replace(/<(script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&\w+;/g,' ');
  const wordCount=normal(plain).split(/\s+/).filter(Boolean).length;
  return {title,description,canonical,robots,h1Count:heading1,images:images.length,missingAlt,lang,viewport,
    structuredData:getTags(html,'script').filter(t=>/application\/ld\+json/i.test(t)).length>0,
    wordCount,internalLinks:[...new Set(anchorUrls)]};
}

const issue=(site,url,category,severity,code,title,detail,fix)=>({id:`${site}:${code}:${url}`,site,url,category,severity,code,title,detail,fix});
function addPageIssues(page,site,issues){
  const {url,status,data,headers,ms,bytes}=page;
  const add=(cat,sev,code,title,detail,fix)=>issues.push(issue(site,url,cat,sev,code,title,detail,fix));
  if(status>=400){add('Technical','Critical','HTTP_ERROR',`HTTP ${status} response`,'The URL did not return a successful response.','Fix the page or update internal links to a working URL.');return;}
  if(!data){add('Technical','High','NON_HTML','Not an HTML document','The response did not contain auditable HTML.','Check whether the URL points to a public HTML page.');return;}
  if(!data.title) add('On-page','High','TITLE_MISSING','Missing page title','No <title> element with useful text.','Add a unique, descriptive HTML title.');
  else if(data.title.length>65) add('On-page','Low','TITLE_LONG','Long page title',`${data.title.length} characters; display truncation is possible.`,'Keep the title concise and descriptive; length is only a guideline.');
  if(!data.description) add('On-page','Medium','DESCRIPTION_MISSING','Missing meta description','No meta description found.','Write a unique summary of this page for search snippets.');
  if(data.h1Count===0)add('On-page','Medium','H1_MISSING','Missing H1 heading','No H1 heading found.','Add one clear main heading appropriate to the page.');
  else if(data.h1Count>1)add('On-page','Low','H1_MULTIPLE','Multiple H1 headings',`${data.h1Count} H1 headings found. This is a review suggestion, not necessarily an error.`,'Make heading hierarchy clear; multiple H1s are not always harmful.');
  if(data.missingAlt)add('On-page','Medium','ALT_MISSING','Images missing alt attribute',`${data.missingAlt} of ${data.images} image(s) have no alt attribute.`,'Give informative images descriptive alt text; decorative images should use alt="".');
  if(data.wordCount<100)add('On-page','Low','LOW_WORDS','Very little visible HTML text',`${data.wordCount} words in fetched HTML. JavaScript-rendered text may not appear here.`,'Review whether the page conveys sufficient helpful content.');
  if(!data.lang)add('Technical','Low','LANG_MISSING','HTML language not declared','The <html> element has no lang attribute.','Add the correct lang attribute, such as lang="en" or lang="ta".');
  if(!data.viewport)add('Technical','Medium','VIEWPORT_MISSING','Mobile viewport meta tag missing','No viewport meta tag detected.','Set <meta name="viewport" content="width=device-width,initial-scale=1">.');
  if(!data.canonical)add('Technical','Low','CANONICAL_MISSING','Canonical URL not specified','No rel="canonical" link found; Google can infer canonical URLs.','Consider a self-referencing canonical when appropriate.');
  else if(!/^https?:\/\//i.test(data.canonical))add('Technical','High','CANONICAL_INVALID','Invalid canonical URL',data.canonical,'Use an absolute, valid canonical URL.');
  if(/(?:^|[\s,])noindex(?:[\s,]|$)/.test(data.robots+' '+String(headers['x-robots-tag']||'').toLowerCase()))add('Technical','High','NOINDEX','Noindex directive detected','The HTML or HTTP header asks search engines not to index this page.','Confirm intentional use; remove noindex for indexable public pages.');
  if(url.startsWith('http:'))add('Technical','High','NOT_HTTPS','Page uses HTTP','The audited page was served over an unencrypted HTTP URL.','Configure HTTPS and redirect HTTP to HTTPS.');
  if(ms>2500)add('Technical','Low','SLOW_RESPONSE','Slow server fetch',`Fetched in ${ms} ms. Not a Core Web Vitals measurement.`,'Review server response time and test actual UX with PageSpeed Insights.');
  if(bytes>800000)add('Technical','Low','LARGE_HTML','Large HTML response',`Response size approximately ${Math.round(bytes/1024)} KB.`,'Reduce excessive HTML where practical.');
}

// Simplified user-agent group parser with longest-match allow/disallow rules.
export function robotsPolicy(raw){
  const groups=[];let agents=[], rules=[], inRules=false;
  const flush=()=>{if(agents.length) groups.push({agents:[...agents],rules:[...rules]});agents=[];rules=[];inRules=false;};
  for(const line of String(raw).split(/\r?\n/)){
    const m=line.split('#')[0].match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);if(!m)continue;
    const key=m[1].toLowerCase(),val=m[2];
    if(key==='user-agent') {if(inRules)flush();agents.push(val.toLowerCase());}
    else if((key==='allow'||key==='disallow')&&agents.length){rules.push({allow:key==='allow',pattern:val});inRules=true;}
  }flush();
  const exact=groups.filter(g=>g.agents.includes(agentName.toLowerCase()));
  const selected=exact.length?exact:groups.filter(g=>g.agents.includes('*'));
  const active=selected.flatMap(g=>g.rules);
  return pathname=>{
    let best=-1,allowed=true;
    for(const r of active){if(!r.pattern)continue;
      const pattern=escapeRegex(r.pattern).replace(/\\\*/g,'.*').replace(/\\\$/g,'$');
      try{if(new RegExp('^'+pattern).test(pathname)){
        const specificity=r.pattern.replace(/[\*$]/g,'').length;
        if(specificity>best||specificity===best&&r.allow){best=specificity;allowed=r.allow;}
      }}catch{}
    }return allowed;
  };
}

async function auditSite(input,maxPages){
  const start=normalizeInput(input),home=new URL(start),site=home.hostname;
  const issues=[],pages=[],warnings=[];let robotsInfo='Not available',sitemapInfo='Not found',sitemapUrls=[];
  let allow=()=>true;
  try{
    const r=await request(new URL('/robots.txt',home).href,{accept:'text/plain',maxBytes:150000});
    if(r.status===200){robotsInfo='Found';allow=robotsPolicy(r.body);
      sitemapUrls=[...r.body.matchAll(/^\s*Sitemap\s*:\s*(\S+)/gim)].map(m=>m[1]).slice(0,2);
    }else if([401,403,429].includes(r.status)||r.status>=500){robotsInfo=`HTTP ${r.status} (crawl stopped)`;return {site,start,pages,issues:[issue(site,start,'Technical','High','ROBOTS_UNAVAILABLE','Robots policy could not be confirmed',`robots.txt returned HTTP ${r.status}.`,'Verify crawler access and robots.txt response.')],warnings:['Crawl stopped because robots.txt could not be confirmed.'],robots:robotsInfo,sitemap:sitemapInfo,score:0};}
    else robotsInfo=`HTTP ${r.status} (no restrictions specified)`;
  }catch(e){robotsInfo='Request failed';warnings.push(`Robots policy could not be checked: ${e.message}`);return {site,start,pages,issues:[issue(site,start,'Technical','High','ROBOTS_FETCH_FAILED','Robots policy check failed',e.message,'Confirm robots.txt and DNS/network access before crawling.')],warnings,robots:robotsInfo,sitemap:sitemapInfo,score:0};}
  const candidates=[...sitemapUrls,new URL('/sitemap.xml',home).href];
  for(const sm of [...new Set(candidates)].slice(0,3)){
    try{const url=new URL(sm,home);if(url.hostname!==home.hostname)continue;
      const r=await request(url.href,{accept:'application/xml,text/xml,text/plain',maxBytes:500000});
      if(r.status===200&&(/<urlset\b|<sitemapindex\b/i).test(r.body)){sitemapInfo='Found';
        for(const m of r.body.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)){
          try{const u=new URL(decodeHTML(m[1]));if(u.hostname===home.hostname && !u.pathname.toLowerCase().endsWith('.xml'))sitemapUrls.push(u.href);}catch{}
        }break;
      }
    }catch(e){warnings.push(`Sitemap check: ${e.message}`);}
  }
  const queue=[start,...sitemapUrls.filter(u=>/^https?:\/\//i.test(u))],visited=new Set();
  while(queue.length&&pages.length<maxPages){
    const next=queue.shift();let u;try{u=new URL(next);u.hash='';u.search='';if(u.hostname!==home.hostname)continue;}catch{continue;}
    const url=u.href;if(visited.has(url))continue;visited.add(url);
    if(!allow(u.pathname+u.search)){warnings.push(`Skipped robots-disallowed URL: ${url}`);continue;}
    try{
      const then=Date.now(),r=await request(url),ms=Date.now()-then;
      if(new URL(r.url).hostname!==home.hostname){warnings.push(`Cross-domain redirect skipped: ${url} → ${r.url}`);continue;}
      const contentType=String(r.headers['content-type']||'').toLowerCase();
      const data=r.status<400&&(!contentType||contentType.includes('html'))?inspectHTML(r.body,r.url):null;
      const p={url:r.url,status:r.status,ms,bytes:r.bytes,data,headers:r.headers};pages.push(p);addPageIssues(p,site,issues);
      if(data)for(const link of data.internalLinks){if(!visited.has(link)&&!queue.includes(link)&&queue.length<maxPages*7)queue.push(link);}
    }catch(e){pages.push({url,status:0,ms:0,bytes:0,data:null,headers:{}});issues.push(issue(site,url,'Technical','High','FETCH_FAILED','Page could not be fetched',e.message,'Check server access, redirects, or network restrictions.'));}
    if(queue.length) await wait(120);
  }
  if(!pages.length)issues.push(issue(site,start,'Technical','High','NO_CRAWLED_PAGES','No pages could be crawled','The starting URL may be blocked by robots.txt or inaccessible.','Check the URL and robots.txt rules.'));
  if(sitemapInfo==='Not found')issues.push(issue(site,start,'Technical','Low','SITEMAP_NOT_FOUND','No XML sitemap discovered','A sitemap was not found at /sitemap.xml or in robots.txt. Not all small sites need one.','Consider publishing an XML sitemap for important canonical URLs.'));
  for(const key of ['title','description']){
    const seen=new Map();for(const p of pages){const val=normal(p.data?.[key]).toLowerCase();if(!val)continue;
      const previous=seen.get(val);if(previous){issues.push(issue(site,p.url,'On-page','Medium',`DUPLICATE_${key.toUpperCase()}`,`Duplicate ${key}`,`Also found on ${previous}.`,`Write a page-specific ${key}.`));}
      else seen.set(val,p.url);
    }
  }
  // Internal diagnostic score only. It is not Google's SEO score or a ranking prediction.
  const weights={Critical:12,High:7,Medium:3,Low:1};
  const score=pages.length?Math.max(0,Math.round(100-issues.reduce((s,i)=>s+weights[i.severity],0)/pages.length*2)):0;
  return {site,start,pages:pages.map(({url,status,ms,bytes,data})=>({url,status,ms,bytes,title:data?.title||'',description:data?.description||'',canonical:data?.canonical||'',h1Count:data?.h1Count??0,images:data?.images??0,missingAlt:data?.missingAlt??0,wordCount:data?.wordCount??0})),
    issues,warnings,robots:robotsInfo,sitemap:sitemapInfo,score};
}

export async function audit(urls,maxPages=8){
  if(!Array.isArray(urls)||urls.length<1||urls.length>limits.maxSites)throw new Error('Audit 1 to 3 websites.');
  const inputs=urls.map(normalizeInput);
  if(new Set(inputs.map(u=>new URL(u).hostname)).size!==inputs.length)throw new Error('Use a different domain for each comparison site.');
  const pageLimit=Number(maxPages);if(!Number.isInteger(pageLimit)||pageLimit<limits.minPages||pageLimit>limits.maxPages) throw new Error('Pages per site must be 1 to 20.');
  const result=[];
  for(const url of inputs){try{result.push(await auditSite(url,pageLimit));}
    catch(e){const site=new URL(url).hostname;result.push({site,start:url,pages:[],issues:[issue(site,url,'Technical','High','SITE_ERROR','Could not audit website',e.message,'Confirm that the site is public and accessible.')],warnings:[e.message],robots:'Not checked',sitemap:'Not checked',score:0});}}
  return {generatedAt:new Date().toISOString(),limit:pageLimit,sites:result,disclaimer:'HTML-source audit of a bounded public crawl. Heuristic diagnostics; no JavaScript rendering, Core Web Vitals, backlink, keyword ranking, or indexation verification.'};
}
