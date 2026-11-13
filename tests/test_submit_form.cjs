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
  click(){this.clicked=true;for(const fn of this.events.get("click")||[])fn()}
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
                     clipboard="working",popupBlocked=false,forkName="hammerdb-results",
                     initialStorage={},preloadArtifact=true,defaultBranch="main"}={}){
  const els=new Map(),requests=[],tabs=[],copied=[],events=[],downloads=[];
  const backingStorage=new Map(Object.entries(initialStorage));
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
    createElement(tag){const node=new Element(tag,tag.toUpperCase());if(tag==="a")downloads.push(node);return node},
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
  const localStorage={
    getItem(key){return backingStorage.get(key)||null},
    setItem(key,value){backingStorage.set(key,String(value))},
    removeItem(key){backingStorage.delete(key)}
  };
  const artifactUrl="https://example.org/sample-report.json";
  const location={search:preloadArtifact?"?artifact_url="+encodeURIComponent(artifactUrl):""};
  const fetch=async url=>{
    requests.push(String(url));
    if(url===artifactUrl) return {status:200,ok:true,text:async()=>JSON.stringify(sampleArtifact)};
    if(url.startsWith("https://raw.githubusercontent.com/"))return {status:404,ok:false};
    if(url.startsWith("https://api.github.com/repos/")){
      if(mode==="unavailable")throw Error("network");
      if(mode==="no-fork")return {status:404,ok:false};
      if(mode==="unauthorized")return {status:403,ok:false};
      if(mode==="custom" && url.endsWith("/hammerdb-results"))return {status:404,ok:false};
      const isDefault=url.endsWith("/hammerdb-results");
      const parent=(mode==="wrong-parent" || mode==="collision-alt-ready" || mode==="collision-alt-conflict") && isDefault
        ? "TPC-Council/hammerdb-results"
        : mode==="wrong-parent"&&url.includes("/hammerdb-results-hammerdbltd")
        ? null
        : mode==="collision-alt-conflict"&&url.endsWith("/hammerdb-results-hammerdbltd")
        ? "TPC-Council/hammerdb-results"
        : repo.fullName;
      if(parent===null)return {status:404,ok:false};
      if(mode==="collision-alt-conflict"&&url.endsWith("/hammerdb-results-hammerdbltd-2"))
        return {status:404,ok:false};
      const fork=mode!=="unrelated";
      const info={fork,default_branch:defaultBranch,parent:{full_name:parent},source:{full_name:parent}};
      return {status:200,ok:true,json:async()=>info};
    }
    throw Error("Unexpected fetch "+url);
  };
  $("details-section").hidden=true;
  $("submit-section").hidden=true;
  $("workload-section").hidden=true;
  $("fork-feedback").hidden=true;
  $("fork-create-guide").hidden=true;
  $("fork-repository").value=forkName;
  vm.runInNewContext(script,{
    document,window,navigator,localStorage,location,fetch,
    URL,URLSearchParams,encodeURIComponent,console,Blob,setTimeout
  },{filename:"site/submit.html"});
  for(let i=0;i<4;i++)await new Promise(setImmediate);
  assert.equal($("submit-section").hidden,false,"Test artifact should validate");
  if(preloadArtifact)$("github-username").value=login;
  async function click(id){
    const callbacks=$(id).events.get("click")||[];
    assert.ok(callbacks.length,"No click callback for "+id);
    await Promise.all(callbacks.map(fn=>fn()));
    await new Promise(setImmediate);
  }
  async function input(id){
    const handlers=$(id).events.get("input")||[];
    await Promise.all(handlers.map(fn=>fn()));
  }
  return {$,click,input,requests,tabs,copied,events,repoUrl,backingStorage,downloads};
}



test("a real existing HammerDB Ltd fork opens the user's default master branch editor",async()=>{
  const p=await mount({login:"raj-rahul51",mode:"existing",defaultBranch:"master"});
  await p.click("continue-github");
  assert.deepEqual(p.events.slice(0,2),["copy","open"]);
  assert.equal(p.tabs.length,1);
  assert.equal(p.tabs[0].initial,"about:blank");
  assert.match(p.tabs[0].navigated,/^https:\/\/github\.com\/raj-rahul51\/hammerdb-results\/new\/master\?filename=results%2F/);
  assert.doesNotMatch(p.tabs[0].navigated,/github\.com\/HammerDBLtd\/hammerdb-results\/new/);
  assert.equal(JSON.parse(p.copied[0]).submission.github_username,"raj-rahul51");
});

test("Lucas's existing TPC-Council fork opens directly on the TPC-Council site",async()=>{
  const p=await mount({repoOwner:"TPC-Council",login:"ls250",mode:"existing"});
  await p.click("continue-github");
  assert.match(p.tabs[0].navigated,/^https:\/\/github\.com\/ls250\/hammerdb-results\/new\/main\?filename=results%2F/);
  assert.equal(p.$("fork-feedback").hidden,false);
  assert.equal(p.$("fork-create-guide").hidden,true);
  assert.equal(p.$("fork-feedback-link").href,p.tabs[0].navigated);
  assert.equal(p.requests.some(url=>url.includes("TPC-Council/hammerdb-results/fork")),false);
});

test("a first-time contributor gets a clear fork name BEFORE navigating to GitHub",async()=>{
  const p=await mount({login:"newperson",mode:"no-fork"});
  await p.click("continue-github");
  assert.equal(p.tabs.length,1);
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.tabs[0].navigated,null);
  assert.equal(p.$("fork-create-guide").hidden,false);
  assert.equal(p.$("required-fork-name").textContent,"hammerdb-results");
  assert.equal(p.$("fork-feedback-link").href,"https://github.com/HammerDBLtd/hammerdb-results/fork");
  assert.match(p.$("fork-feedback-message").textContent,/change it to the exact name/);
  assert.equal(p.copied.length,1);
  assert.ok(p.backingStorage.has("hammerdb-results-submission-draft:hammerdbltd/hammerdb-results"));
});

test("Lucas's existing TPC fork is preserved; new available HammerDB Ltd name is shown",async()=>{
  const p=await mount({login:"ls250",mode:"wrong-parent"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.tabs[0].navigated,null);
  assert.equal(p.$("fork-repository").value,"hammerdb-results-hammerdbltd");
  assert.equal(p.$("required-fork-name").textContent,"hammerdb-results-hammerdbltd");
  assert.match(p.$("fork-feedback-message").textContent,/forked from TPC-Council\/hammerdb-results/);
  assert.match(p.$("fork-feedback-message").textContent,/Keep that fork/);
  assert.equal(p.$("fork-feedback-link").href,"https://github.com/HammerDBLtd/hammerdb-results/fork");
  await p.click("copy-fork-name");
  assert.equal(p.copied.at(-1),"hammerdb-results-hammerdbltd");
  assert.equal(p.$("copy-fork-name").textContent,"Fork name copied");
});

test("if Lucas already created a correctly parented alternate fork, reuse it directly",async()=>{
  const p=await mount({login:"ls250",mode:"collision-alt-ready"});
  await p.click("continue-github");
  assert.equal(p.$("fork-repository").value,"hammerdb-results-hammerdbltd");
  assert.match(p.tabs[0].navigated,/^https:\/\/github\.com\/ls250\/hammerdb-results-hammerdbltd\/new\/main\?filename=results%2F/);
  assert.equal(p.$("fork-create-guide").hidden,true);
  assert.match(p.$("fork-feedback-title").textContent,/existing fork is ready/);
});

test("when the suggested name is also taken, find the next unused name",async()=>{
  const p=await mount({login:"ls250",mode:"collision-alt-conflict"});
  await p.click("continue-github");
  assert.equal(p.$("fork-repository").value,"hammerdb-results-hammerdbltd-2");
  assert.equal(p.$("required-fork-name").textContent,"hammerdb-results-hammerdbltd-2");
  assert.equal(p.tabs[0].closed,true);
});

test("a separately named fork can be used after it has been created",async()=>{
  const p=await mount({login:"ls250",mode:"existing",forkName:"hammerdb-results-hammerdbltd"});
  await p.click("continue-github");
  assert.match(p.tabs[0].navigated,/^https:\/\/github\.com\/ls250\/hammerdb-results-hammerdbltd\/new\/main\?filename=results%2F/);
});

test("an unrelated repository under the default name gets an alternative suggestion",async()=>{
  const p=await mount({mode:"unrelated"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  // Unrelated repository in both mock lookups: no unused name; do not send to fork page.
  assert.match(p.$("fork-feedback-title").textContent,/check unavailable/);
});

test("GitHub API outage is safe: no navigation and the user's draft remains saved",async()=>{
  const p=await mount({mode:"unavailable"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.tabs[0].navigated,null);
  assert.equal(p.$("fork-create-guide").hidden,true);
  assert.ok(p.backingStorage.size>0);
  assert.match(p.$("fork-feedback-message").textContent,/could not verify your fork/);
});

test("rate-limited fork lookups also stop safely",async()=>{
  const p=await mount({mode:"unauthorized"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.tabs[0].navigated,null);
});

test("missing username reports error without opening GitHub",async()=>{
  const p=await mount({login:""});
  await p.click("continue-github");
  assert.equal(p.tabs.length,0);
  assert.match(p.$("fork-feedback-message").textContent,/GitHub username/);
});

test("invalid fork repository name is caught before navigation",async()=>{
  const p=await mount({forkName:"other/name"});
  await p.click("continue-github");
  assert.equal(p.tabs.length,0);
  assert.match(p.$("fork-feedback-message").textContent,/fork repository name/);
});

test("clipboard fallback preserves the generated JSON and still reaches an existing fork",async()=>{
  const p=await mount({clipboard:"denied"});
  await p.click("continue-github");
  assert.equal(JSON.parse(p.copied[0]).job.jobid,"FAKEABC123");
  assert.match(p.tabs[0].navigated,/\/ls250\/hammerdb-results\/new\/main/);
});

test("when all copying is denied, the JSON preview and download remain available",async()=>{
  const p=await mount({clipboard:"all-denied"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.$("raw-preview").open,true);
  assert.match(p.$("generated-json").textContent,/FAKEABC123/);
  assert.match(p.$("fork-feedback-title").textContent,/Copy your JSON/);
  assert.equal(p.$("fork-feedback-link").href.startsWith("https://github.com/ls250/"),true);
});

test("when popup is blocked an existing fork has a working fallback link",async()=>{
  const p=await mount({popupBlocked:true});
  await p.click("continue-github");
  assert.equal(p.tabs.length,0);
  assert.match(p.$("fork-feedback-link").href,/^https:\/\/github\.com\/ls250\/hammerdb-results\/new\/main\?filename=results%2F/);
  assert.match(p.$("fork-feedback-message").textContent,/blocked the tab/);
});

test("edits to the form are restored after returning from GitHub",async()=>{
  const first=await mount({login:"ls250"});
  first.$("company-name").value="Testing Systems Ltd";
  first.$("result-description").value="Testing return from fork setup";
  first.$("fork-repository").value="hammerdb-results-hammerdbltd";
  await first.input("company-name");
  await first.input("result-description");
  await first.input("fork-repository");
  const snapshot=Object.fromEntries(first.backingStorage);
  const second=await mount({initialStorage:snapshot,preloadArtifact:false});
  assert.equal(second.$("github-username").value,"ls250");
  assert.equal(second.$("company-name").value,"Testing Systems Ltd");
  assert.equal(second.$("result-description").value,"Testing return from fork setup");
  assert.equal(second.$("fork-repository").value,"hammerdb-results-hammerdbltd");
  assert.match(second.$("generated-json").textContent,/Testing return from fork setup/);
  assert.match(second.$("status").querySelector("strong").textContent,/Saved submission restored/);
});

test("changing fork repository name updates saved draft",async()=>{
  const p=await mount();
  p.$("fork-repository").value="hammerdb-results-hammerdbltd";
  await p.input("fork-repository");
  const saved=JSON.parse(p.backingStorage.get("hammerdb-results-submission-draft:hammerdbltd/hammerdb-results"));
  assert.equal(saved.forkName,"hammerdb-results-hammerdbltd");
});

test("download JSON backup creates a named file without leaving the submission page",async()=>{
  const p=await mount({login:"ls250"});
  await p.click("download-json");
  assert.equal(p.tabs.length,0);
  const last=p.downloads.at(-1);
  assert.equal(last.download,"FAKEABC123-submission.json");
  assert.equal(last.clicked,true);
  assert.match(p.$("fork-feedback-title").textContent,/Backup downloaded/);
});

test("clearing the browser backup does not remove the current submission",async()=>{
  const p=await mount();
  await p.click("copy-json");
  assert.ok(p.backingStorage.size);
  await p.click("clear-draft");
  assert.equal(p.backingStorage.size,0);
  assert.equal(p.$("submit-section").hidden,false);
  assert.match(p.$("draft-status").textContent,/backup cleared/);
});

test("prepared submission JSON preserves benchmark evidence and submits correct GitHub attribution",async()=>{
  const p=await mount({repoOwner:"TPC-Council",login:"ls250"});
  p.$("company-name").value="Bench Lab";
  p.$("result-description").value="A benchmark";
  await p.click("continue-github");
  const actual=JSON.parse(p.copied[0]);
  assert.deepEqual(actual.job,sampleArtifact.job);
  assert.deepEqual(actual.result,sampleArtifact.result);
  assert.deepEqual(actual.benchmark_config,sampleArtifact.benchmark_config);
  assert.equal(actual.submission.github_username,"ls250");
  assert.equal(actual.submission.company.name,"Bench Lab");
});

test("the controller cannot open GitHub's failing new-file editor in the original repository",()=>{
  assert.match(script,/resolveFork\(login,forkName\)/);
  assert.doesNotMatch(script,/const url = "https:\/\/github\.com\/" \+ TARGET_OWNER \+ "\/" \+ TARGET_REPO \+ "\/new\/"/);
  assert.ok(html.includes("change it to the exact name"));
  assert.ok(!html.includes("direct-fork-link"));
});
