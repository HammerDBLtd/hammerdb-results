"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const html=fs.readFileSync(path.join(__dirname,"../site/submit.html"),"utf8");
const config=fs.readFileSync(path.join(__dirname,"../site/submission-service-config.js"),"utf8");
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const script=scripts.at(-1)[1];
class Element {
  constructor(id){this.id=id;this.value="";this.textContent="";this.hidden=false;
    this.disabled=false;this.className="";this.style={};this.dataset={};this.events=new Map();
    this.tagName=["workload-class","uaw-setting","durability-setting","theme-select"].includes(id)?"SELECT":"DIV";
    this.classList={add(){},remove(){}};
    if(this.tagName==="SELECT")this.selectedIndex=0;
  }
  set selectedIndex(n){this._selected=n;
    this.value={"workload-class":"unclassified","uaw-setting":"unknown",
      "durability-setting":"unknown","theme-select":"system"}[this.id]||"";}
  get selectedIndex(){return this._selected||0;}
  addEventListener(kind,fn){const rows=this.events.get(kind)||[];rows.push(fn);this.events.set(kind,rows);}
  append(){}
  replaceChildren(){}
  querySelector(name){this._children ||=new Map();if(!this._children.has(name))
    this._children.set(name,new Element(name));return this._children.get(name);}
}
const sample={
  schema:"hammerdb-job-report-v1",
  job:{jobid:"FAKEABC123",benchmark:"TPROC-C",database:"MariaDB",
    database_display:"MariaDB",timestamp:"2026-11-13 12:00:00",hdb_version:"v6.0",
    release:"12.3"},
  result:{nopm:800000,tpm:1500000},benchmark_config:{warehouses:1000,virtual_users:32}
};
async function mount({api="https://submissions.example.workers.dev",
  oauth="https://github.com/login/oauth/authorize?client_id=test&state=123",
  failService=false,preload=true}={}){
  const elements=new Map(),requests=[],navigations=[],sessionValues=new Map(),pageEvents=new Map();
  const get=id=>{
    if(!elements.has(id))elements.set(id,new Element(id));
    return elements.get(id);
  };
  for(const id of ["details-section","workload-section","submit-section","preview"])get(id).hidden=true;
  const document={
    documentElement:{dataset:{}},getElementById:get,
    createElement:tag=>new Element(tag),
    querySelector:sel=>get(sel),
    body:{appendChild(){}},
  };
  const fakeUrl="https://example.com/result.json";
  const location={search:preload?"?artifact_url="+encodeURIComponent(fakeUrl):""};
  const window={
    HammerDBResultsRepo:{owner:"HammerDBLtd",repo:"hammerdb-results",branch:"main"},
    HammerDBSubmissionAPI:{endpoint:api},location:{assign(url){navigations.push(url)}},
    addEventListener(name,callback){const list=pageEvents.get(name)||[];list.push(callback);pageEvents.set(name,list);},
    matchMedia(){return {matches:false,addEventListener(){}}}
  };
  const fetch=async(url,opts={})=>{
    const value=String(url);requests.push({url:value,opts});
    if(value===fakeUrl)return {ok:true,status:200,text:async()=>JSON.stringify(sample)};
    if(value.startsWith("https://raw.githubusercontent.com/"))return {ok:false,status:404};
    if(value===api+"/submissions"){
      if(failService)return {ok:false,status:503,json:async()=>({error:"Service offline"})};
      return {ok:true,status:200,json:async()=>({authorizeUrl:oauth})};
    }
    throw Error("Unexpected request "+value);
  };
  const localStorage={getItem(){return null},setItem(){},removeItem(){}};
  const sessionStorage={
    getItem(key){return sessionValues.get(key)||null},
    setItem(key,value){sessionValues.set(key,String(value))},
    removeItem(key){sessionValues.delete(key)}
  };
  vm.runInNewContext(script,{document,window,location,URL,URLSearchParams,
    fetch,localStorage,sessionStorage,console,encodeURIComponent,setTimeout},
    {filename:"site/submit.html"});
  for(let i=0;i<5;i++)await new Promise(setImmediate);
  async function submit(login="ls250"){
    get("github-username").value=login;
    for(const callback of get("continue-github").events.get("click")||[])
      await callback();
    await new Promise(setImmediate);
  }
  return {get,requests,navigations,sessionValues,submit,
    pageShow(){for(const callback of pageEvents.get("pageshow")||[])callback();}
  };
}

test("one submission form offers automatic PR and expert manual PR",()=>{
  assert.match(html,/id="continue-github">Submit result/);
  assert.match(html,/id="pr-auto"[^>]*checked/);
  assert.match(html,/id="pr-manual"/);
  assert.match(html,/I'll create my own PR/);
  assert.doesNotMatch(html,/id="copy-json"|id="fork-repository"|id="open-fork-page"/);
  assert.doesNotMatch(script,/github\.com\/.*\/fork|\/new\/main|copyToClipboard|navigator\.clipboard/);
  assert.match(html,/Select your result artifact/);
  assert.match(html,/Who is submitting this result/);
});

test("TPCI baseline still validates artifact and requires benchmark details",()=>{
  assert.match(script,/buildSubmission\(\)/);
  assert.match(script,/artifactPath\(job\)/);
  assert.match(script,/workload\.classification/);
  assert.match(script,/existsInRepo\(path\)/);
});

test("one click POSTs result and then opens only GitHub authorization",async()=>{
  const p=await mount();
  assert.equal(p.get("submit-section").hidden,false);
  await p.submit();
  const post=p.requests.find(q=>q.url.includes("/submissions"));
  assert.ok(post);
  assert.equal(post.opts.method,"POST");
  const request=JSON.parse(post.opts.body);
  assert.equal(request.target,"HammerDBLtd/hammerdb-results");
  assert.deepEqual(JSON.parse(JSON.stringify(request.artifact.job)),sample.job);
  assert.equal(request.artifact.submission.github_username,"ls250");
  assert.equal(p.navigations.length,1);
  assert.match(p.navigations[0],/^https:\/\/github\.com\/login\/oauth\/authorize/);
  assert.equal(p.get("continue-github").disabled,true);
});

test("unconfigured endpoint is a clear error, never a fallback fork link",async()=>{
  const p=await mount({api:""});
  await p.submit();
  assert.equal(p.requests.some(q=>q.url.includes("/submissions")),false);
  assert.equal(p.navigations.length,0);
  assert.match(p.get("status").querySelector("strong").textContent,/not configured/);
});

test("service outage retains the completed form",async()=>{
  const p=await mount({failService:true});
  await p.submit();
  assert.equal(p.navigations.length,0);
  assert.equal(p.get("continue-github").disabled,false);
  assert.equal(p.get("submit-section").hidden,false);
  assert.match(p.get("status").querySelector("p").textContent,/Service offline/);
});

test("normal refresh starts empty and does not load a saved JSON",async()=>{
  const p=await mount({preload:false});
  assert.equal(p.get("preview").hidden,true);
  assert.equal(p.get("submit-section").hidden,true);
  assert.equal(p.requests.length,0);
  assert.doesNotMatch(script,/restoreDraft|localStorage\.setItem\(.*submission/);
});

test("the HammerDB Ltd form uses the clean branded Worker address without exposing credentials",()=>{
  assert.match(config,/endpoint:\s*"https:\/\/hammerdb-results-submit\.hammerdb\.workers\.dev"/);
  assert.doesNotMatch(config,/ghp_|ghs_|BEGIN RSA PRIVATE KEY|client_secret\s*:/);
  assert.match(html,/submission-service-config\.js/);
});

test("manual choice transfers enriched JSON to proven manual form without invoking service",async()=>{
  const p=await mount();
  p.get("pr-manual").checked=true;
  p.get("pr-auto").checked=false;
  for(const change of p.get("pr-manual").events.get("change")||[])change();
  assert.match(p.get("continue-github").textContent,/manual PR/);
  await p.submit("sm-shaw");
  assert.equal(p.requests.some(r=>r.url.endsWith("/submissions")),false);
  assert.deepEqual(p.navigations,["submit-manual.html?handoff=1"]);
  const handoff=p.sessionValues.get("hammerdb-results-manual-handoff");
  assert.ok(handoff,"The result must be retained for manual routing");
  const result=JSON.parse(handoff);
  assert.equal(result.submission.github_username,"sm-shaw");
  assert.equal(result.job.jobid,"FAKEABC123");
  assert.equal(result.result.nopm,800000);
});

test("returning from GitHub OAuth unlocks the button without losing validated details",async()=>{
  const p=await mount();
  await p.submit("ls250");
  assert.equal(p.get("continue-github").disabled,true);
  assert.equal(p.navigations.length,1);
  p.pageShow();
  assert.equal(p.get("continue-github").disabled,false);
  assert.equal(p.get("submit-section").hidden,false);
  assert.equal(p.get("github-username").value,"ls250");
  p.get("pr-manual").checked=true;
  for(const cb of p.get("pr-manual").events.get("change")||[])cb();
  await p.submit("ls250");
  assert.equal(p.get("continue-github").disabled,false);
  assert.equal(p.navigations.at(-1),"submit-manual.html?handoff=1");
  assert.equal(p.requests.filter(r=>r.url.endsWith("/submissions")).length,1);
});

test("switching from automatic to manual PR unlocks an OAuth-disabled button",async()=>{
  const p=await mount();
  await p.submit("ls250");
  assert.equal(p.get("continue-github").disabled,true);
  p.get("pr-manual").checked=true;
  for(const cb of p.get("pr-manual").events.get("change")||[])cb();
  assert.equal(p.get("continue-github").disabled,false);
  assert.match(p.get("continue-github").textContent,/manual PR/);
});
