"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../site/submit.html"),"utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length > 1);
const script = scripts[scripts.length-1][1];

class Element {
  constructor(id, tagName="DIV"){
    this.id=id;this.tagName=tagName;this.value="";this.textContent="";this.hidden=false;
    this.href="";this.className="";this.style={};this.events=new Map();this.children=[];
    this.classList={add(){},remove(){}};
  }
  addEventListener(name,callback){
    const list=this.events.get(name)||[];list.push(callback);this.events.set(name,list);
  }
  append(...children){this.children.push(...children)}
  appendChild(child){this.children.push(child);return child}
  replaceChildren(...children){this.children=children}
  querySelector(selector){
    this._selectors ||= new Map();
    if(!this._selectors.has(selector))this._selectors.set(selector,new Element(selector));
    return this._selectors.get(selector);
  }
  set selectedIndex(i){
    this.index=i;
    if(i===0) this.value={
      "workload-class":"unclassified","uaw-setting":"unknown","durability-setting":"unknown"
    }[this.id]||"";
  }
  get selectedIndex(){return this.index??0}
  click(){for(const fn of this.events.get("click")||[])fn()}
  focus(){this.focused=true}
  select(){this.selected=true}
  setAttribute(){}
  remove(){this.removed=true}
  scrollIntoView(){this.scrolled=true}
}

const sampleArtifact={
  schema:"hammerdb-job-report-v1",
  disclaimer:{audited:false},
  job:{jobid:"FAKEABC123",benchmark:"TPROC-C",database:"MariaDB",
       database_display:"MariaDB",timestamp:"2026-11-10 12:34:56",
       hdb_version:"v6.0",release:"12.3.3"},
  benchmark_config:{warehouses:1000,virtual_users:24},
  result:{nopm:800000,tpm:1700000}
};
async function mount({repoOwner="HammerDBLtd",login="ls250",mode="existing",
                     clipboard="working",popupBlocked=false,forkName="hammerdb-results"}={}){
  const els=new Map(),requests=[],tabs=[],copied=[],events=[];
  function $(id){
    if(!els.has(id)){
      const select=["theme-select","workload-class","uaw-setting","durability-setting"].includes(id);
      const el=new Element(id,select?"SELECT":"DIV");
      if(select)el.selectedIndex=0;
      els.set(id,el);
    }
    return els.get(id);
  }
  const document={
    documentElement:{dataset:{}},body:new Element("body"),
    getElementById:$,
    createElement(tag){return new Element(tag,tag.toUpperCase())},
    querySelector(sel){if(sel===".raw-preview")return $("raw-preview");throw Error("Unexpected selector: "+sel)},
    execCommand(action){if(action!=="copy" || clipboard==="all-denied")return false;copied.push(document.body.children.at(-1).value);return true}
  };
  const repoUrl="https://github.com/"+repoOwner+"/hammerdb-results";
  const repo={owner:repoOwner,repo:"hammerdb-results",branch:"main",
    fullName:repoOwner+"/hammerdb-results",url:repoUrl};
  const window={
    HammerDBResultsRepo:repo,
    matchMedia(){return {matches:false,addEventListener(){}}},
    open(url,target){
      events.push("open");
      if(popupBlocked)return null;
      const tab={initial:url,target,opener:window,closed:false,navigated:null,
        close(){tab.closed=true},
        location:{replace(dest){tab.navigated=dest;events.push("navigate")}}
      };
      tabs.push(tab);return tab;
    }
  };
  const navigator={clipboard:{
    async writeText(text){
      events.push("copy");
      if(clipboard!=="working")throw Error("No clipboard");
      copied.push(text);
    }
  }};
  const localStorage={getItem(){return null},setItem(){},removeItem(){}};
  const artifactUrl="https://example.org/sample-report.json";
  const location={search:"?artifact_url="+encodeURIComponent(artifactUrl)};
  const fetch=async url=>{
    requests.push(String(url));
    if(url===artifactUrl) return {status:200,ok:true,text:async()=>JSON.stringify(sampleArtifact)};
    if(url.startsWith("https://raw.githubusercontent.com/"))return {status:404,ok:false};
    if(url.startsWith("https://api.github.com/repos/")){
      if(mode==="unavailable")throw Error("network");
      if(mode==="no-fork" || (mode==="custom" && url.endsWith("/hammerdb-results")))return {status:404,ok:false};
      if(mode==="unauthorized")return {status:403,ok:false};
      const fork=mode!=="unrelated";
      const parent=mode==="wrong-parent"?"TPC-Council/hammerdb-results":repo.fullName;
      const info={fork,default_branch:"main",parent:{full_name:parent},source:{full_name:parent}};
      return {status:200,ok:true,json:async()=>info};
    }
    throw Error("Unexpected fetch "+url);
  };
  $("details-section").hidden=true;
  $("submit-section").hidden=true;
  $("workload-section").hidden=true;
  $("fork-feedback").hidden=true;
  $("fork-repository").value=forkName;
  vm.runInNewContext(script,{
    document,window,navigator,localStorage,location,fetch,
    URL,URLSearchParams,encodeURIComponent,console
  },{filename:"site/submit.html"});
  for(let i=0;i<4;i++)await new Promise(setImmediate);
  assert.equal($("submit-section").hidden,false,"Test artifact should validate");
  $("github-username").value=login;
  async function click(id){
    const callbacks=$(id).events.get("click")||[];
    assert.ok(callbacks.length,"No click callback for "+id);
    await Promise.all(callbacks.map(fn=>fn()));
    await new Promise(setImmediate);
  }
  return {$,click,requests,tabs,copied,events,repoUrl};
}


test("already-forked contributor uses the actual HammerDB Ltd fork editor",async()=>{
  const p=await mount({login:"lucas",mode:"existing"});
  await p.click("continue-github");
  assert.equal(p.tabs.length,1);
  assert.deepEqual(p.events.slice(0,2),["copy","open"]);
  assert.equal(p.tabs[0].initial,"about:blank");
  assert.match(p.tabs[0].navigated,/^https:\/\/github\.com\/lucas\/hammerdb-results\/new\/main\?filename=results%2Ftproc-c%2Fmariadb%2F2026%2F11%2FFAKEABC123\.json$/);
  assert.doesNotMatch(p.tabs[0].navigated,/github\.com\/HammerDBLtd\/hammerdb-results\/new/);
  assert.equal(JSON.parse(p.copied[0]).submission.github_username,"lucas");
  assert.match(p.$("fork-feedback-message").textContent,/After review and merge/);
});

test("real TPC-Council deployment uses an existing TPC-Council fork",async()=>{
  const p=await mount({repoOwner:"TPC-Council",login:"ls250",mode:"existing"});
  await p.click("continue-github");
  assert.match(p.tabs[0].navigated,/^https:\/\/github\.com\/ls250\/hammerdb-results\/new\/main\?filename=results%2F/);
  assert.equal(p.$("direct-fork-link").href,"https://github.com/TPC-Council/hammerdb-results/fork");
  assert.doesNotMatch(p.tabs[0].navigated,/TPC-Council\/hammerdb-results\/new/);
});

test("first-time contributor goes to direct fork page, not the failing inline fork screen",async()=>{
  const p=await mount({mode:"no-fork"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].navigated,"https://github.com/HammerDBLtd/hammerdb-results/fork");
  assert.match(p.$("fork-feedback-message").textContent,/Return here/);
  assert.equal(p.copied.length,1);
  assert.doesNotMatch(p.tabs[0].navigated,/\/new\/main/);
});

test("Lucas's existing fork of TPC-Council is not mistaken for a HammerDB Ltd fork",async()=>{
  const p=await mount({repoOwner:"HammerDBLtd",login:"ls250",mode:"wrong-parent"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].navigated,"https://github.com/HammerDBLtd/hammerdb-results/fork");
  assert.equal(p.$("fork-repository").value,"hammerdb-results-hammerdbltd");
  assert.match(p.$("fork-feedback-message").textContent,/belongs to TPC-Council\/hammerdb-results/);
  assert.match(p.$("fork-feedback-message").textContent,/choose the different repository name 'hammerdb-results-hammerdbltd'/);
  assert.equal(p.$("fork-feedback").hidden,false);
});

test("a differently named fork of HammerDB Ltd routes correctly",async()=>{
  const p=await mount({repoOwner:"HammerDBLtd",login:"ls250",mode:"custom",forkName:"hammerdb-results-hammerdbltd"});
  await p.click("continue-github");
  assert.match(p.tabs[0].navigated,/^https:\/\/github\.com\/ls250\/hammerdb-results-hammerdbltd\/new\/main\?filename=results%2F/);
  assert.equal(p.$("fork-repository").value,"hammerdb-results-hammerdbltd");
});

test("same-name independent repository cannot be treated as an existing fork",async()=>{
  const p=await mount({mode:"unrelated"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].navigated,"https://github.com/HammerDBLtd/hammerdb-results/fork");
  assert.equal(p.$("fork-repository").value,"hammerdb-results-hammerdbltd");
});

test("GitHub API errors show a safe fallback and never the original editor",async()=>{
  const p=await mount({mode:"unavailable"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.$("fork-feedback-link").href,"https://github.com/HammerDBLtd/hammerdb-results/fork");
  assert.match(p.$("fork-feedback-message").textContent,/could not confirm your fork/);
  assert.equal(p.$("fork-feedback").hidden,false);
});

test("GitHub rate-limit errors show the same safe fallback",async()=>{
  const p=await mount({mode:"unauthorized"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.$("fork-feedback-link").href,"https://github.com/HammerDBLtd/hammerdb-results/fork");
});

test("no username means no clipboard, no popup and an actionable local error",async()=>{
  const p=await mount({login:""});
  await p.click("continue-github");
  assert.equal(p.tabs.length,0);
  assert.equal(p.copied.length,0);
  assert.match(p.$("fork-feedback-message").textContent,/GitHub username/);
});

test("bad fork repository name is rejected before any navigation",async()=>{
  const p=await mount({forkName:"other/name"});
  await p.click("continue-github");
  assert.equal(p.tabs.length,0);
  assert.match(p.$("fork-feedback-message").textContent,/fork repository name/);
});

test("clipboard API failure falls back to legacy copy",async()=>{
  const p=await mount({clipboard:"denied"});
  await p.click("continue-github");
  assert.match(p.tabs[0].navigated,/\/lucas\/hammerdb-results\/new|\/ls250\/hammerdb-results\/new/);
  assert.equal(p.copied.length,1);
});

test("when copying fails entirely JSON remains visible and no fork navigation occurs",async()=>{
  const p=await mount({clipboard:"all-denied"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.$("raw-preview").open,true);
  assert.match(p.$("generated-json").textContent,/FAKEABC123/);
  assert.match(p.$("fork-feedback-message").textContent,/Automatic copying failed/);
});

test("a blocked popup gives a link to the correct contributor editor",async()=>{
  const p=await mount({popupBlocked:true});
  await p.click("continue-github");
  assert.equal(p.tabs.length,0);
  assert.match(p.$("fork-feedback-link").href,/^https:\/\/github\.com\/ls250\/hammerdb-results\/new\/main\?filename=results%2F/);
  assert.match(p.$("fork-feedback-message").textContent,/blocked the new tab/);
});

test("submission JSON preserves benchmark evidence and includes authenticated attribution",async()=>{
  const p=await mount({repoOwner:"TPC-Council",login:"ls250"});
  p.$("company-name").value="Bench Lab";
  p.$("result-description").value="A benchmark";
  await p.click("continue-github");
  const actual=JSON.parse(p.copied[0]);
  assert.deepEqual(actual.job,sampleArtifact.job);
  assert.deepEqual(actual.result,sampleArtifact.result);
  assert.deepEqual(actual.benchmark_config,sampleArtifact.benchmark_config);
  assert.equal(actual.submission.github_username,"ls250");
  assert.equal(actual.submission.description,"A benchmark");
  assert.equal(actual.submission.company.name,"Bench Lab");
});

test("no main action ever sends a contributor to the protected target /new editor",()=>{
  assert.match(script,/lookupFork\(login,forkName\)/);
  assert.doesNotMatch(script,/const url = "https:\/\/github\.com\/" \+ TARGET_OWNER \+ "\/" \+ TARGET_REPO \+ "\/new\/"/);
  assert.ok(html.includes("Open the direct GitHub fork page"));
});
