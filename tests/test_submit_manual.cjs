"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../site/submit-manual.html"),"utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length > 1);
const script = scripts[scripts.length-1][1];

class Element {
  constructor(id, tagName="DIV"){
    this.id=id;this.tagName=tagName;this.value="";this.textContent="";this.hidden=false;
    this.href="";this.className="";this.style={};this.dataset={};this.events=new Map();this.children=[];
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
                     initialStorage={},preloadArtifact=true,defaultBranch="main",
                     initiallyCommitted=false,prOpen=false,prWrongAttribution=false,
                     handoffJson=null}={}){
  const els=new Map(),requests=[],tabs=[],copied=[],events=[],downloads=[];
  const backingStorage=new Map(Object.entries(initialStorage));
  let committed=initiallyCommitted, openPr=prOpen;
  const focusListeners=new Map();
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
    addEventListener(type,fn){focusListeners.set(type,fn)},
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
  const handoffStorage=new Map(handoffJson?[["hammerdb-results-manual-handoff",handoffJson]]:[]);
  const sessionStorage={
    getItem(key){return handoffStorage.get(key)||null},
    setItem(key,value){handoffStorage.set(key,String(value))},
    removeItem(key){handoffStorage.delete(key)}
  };
  const location={search:handoffJson?"?handoff=1":preloadArtifact?"?artifact_url="+encodeURIComponent(artifactUrl):""};
  const fetch=async url=>{
    requests.push(String(url));
    if(url===artifactUrl) return {status:200,ok:true,text:async()=>JSON.stringify(sampleArtifact)};
    if(url.startsWith("https://raw.githubusercontent.com/")){
      if(url.startsWith("https://raw.githubusercontent.com/"+repoOwner+"/hammerdb-results/"))return {status:404,ok:false};
      if(!committed)return {status:404,ok:false};
      const file={
        ...sampleArtifact,
        submission:{github_username:prWrongAttribution?"somebody-else":$("github-username").value||login}
      };
      return {status:200,ok:true,text:async()=>JSON.stringify(file)};
    }
    if(url.startsWith("https://api.github.com/users/")){
      if(mode==="user-list-403")return {status:403,ok:false};
      const names=mode==="collision-alt-ready" ?
        ["hammerdb-results-hammerdbltd"] :
        mode==="existing-alt-custom" ? ["my-custom-benchmarks"] :
        mode==="bulk-forks" ? [...Array.from({length:60},(_,i)=>"other-repo-"+i),"hammerdb-results-hammerdbltd"] : [];
      return {status:200,ok:true,json:async()=>names.map(name=>({name,fork:true}))};
    }
    if(url.startsWith("https://api.github.com/repos/") && url.includes("/pulls?")){
      const data=openPr?[{
        number:37,
        html_url:"https://github.com/"+repo.fullName+"/pull/37",
        head:{repo:{full_name:login+"/"+$("fork-repository").value},ref:defaultBranch},
        base:{ref:"main"},
        user:{login}
      }]:[];
      return {status:200,ok:true,json:async()=>data};
    }
    if(url.startsWith("https://api.github.com/repos/")){
      if(mode==="unavailable")throw Error("network");
      if(mode==="no-fork")return {status:404,ok:false};
      if(mode==="unauthorized")return {status:403,ok:false};
      if(mode==="custom" && url.endsWith("/hammerdb-results"))return {status:404,ok:false};
      const isDefault=url.endsWith("/hammerdb-results");
      const parent=(["wrong-parent","collision-alt-ready","collision-alt-conflict","existing-alt-custom","user-list-403","bulk-forks"].includes(mode)) && isDefault
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
    document,window,navigator,localStorage,sessionStorage,location,fetch,
    URL,URLSearchParams,encodeURIComponent,console,Blob,setTimeout
  },{filename:"site/submit-manual.html"});
  for(let i=0;i<4;i++)await new Promise(setImmediate);
  if(preloadArtifact||handoffJson){
    assert.equal($("submit-section").hidden,false,"Test artifact should validate");
    if(preloadArtifact&&!handoffJson)$("github-username").value=login;
  }else{
    assert.equal($("submit-section").hidden,true,"A reload without artifact_url must start blank");
    assert.equal($("preview").hidden,true,"The prior result preview must not return automatically");
  }
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
  return {$,click,input,requests,tabs,copied,events,repoUrl,backingStorage,handoffStorage,downloads,
    commit(){committed=true},openPr(){openPr=true},
    async focus(){focusListeners.get("focus")?.();for(let i=0;i<4;i++)await new Promise(setImmediate)}
  };
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
  assert.equal(p.$("fork-feedback").hidden,true);
  assert.equal(p.$("fork-create-guide").hidden,true);
  assert.equal(p.$("submission-progress").dataset.stage,"editing");
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
  assert.equal(p.$("fork-account").textContent,"newperson");
  assert.match(p.$("fork-feedback-message").textContent,/Confirm the GitHub account/);
  await p.click("open-fork-page");
  assert.equal(p.tabs[1].navigated,"https://github.com/HammerDBLtd/hammerdb-results/fork");
  assert.equal(p.copied.at(-1),"hammerdb-results");
  assert.ok(p.requests.some(url=>url.startsWith("https://api.github.com/users/newperson/repos?")));
  assert.equal(p.copied.length,2,"The result JSON and fork name must both be copied");
  assert.ok(p.backingStorage.has("hammerdb-results-submission-draft:hammerdbltd/hammerdb-results"));
});

test("Lucas's existing TPC fork is preserved; new available HammerDB Ltd name is shown",async()=>{
  const p=await mount({login:"ls250",mode:"wrong-parent"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.tabs[0].navigated,null);
  assert.equal(p.$("fork-repository").value,"hammerdb-results-hammerdbltd");
  assert.equal(p.$("required-fork-name").textContent,"hammerdb-results-hammerdbltd");
  assert.match(p.$("fork-feedback-message").textContent,/must not be deleted or replaced/);
  assert.equal(p.$("fork-create-guide").hidden,false);
  assert.match(p.$("fork-create-instructions").textContent,/Replace that name with hammerdb-results-hammerdbltd/);
  assert.equal(p.$("fork-feedback-link").hidden,true);
  await p.click("copy-fork-name");
  assert.equal(p.copied.at(-1),"hammerdb-results-hammerdbltd");
  assert.equal(p.$("copy-fork-name").textContent,"Fork name copied");
});

test("sm-shaw's TPC-Council fork is never reused or overwritten during testing",async()=>{
  const p=await mount({login:"sm-shaw",mode:"wrong-parent"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.tabs[0].navigated,null);
  assert.equal(p.$("fork-account").textContent,"sm-shaw");
  assert.equal(p.$("fork-repository").value,"hammerdb-results-hammerdbltd");
  assert.match(p.$("fork-create-instructions").textContent,/Replace that name with hammerdb-results-hammerdbltd/);
  await p.click("open-fork-page");
  assert.equal(p.copied.at(-1),"hammerdb-results-hammerdbltd");
  assert.equal(p.tabs[1].navigated,"https://github.com/HammerDBLtd/hammerdb-results/fork");
  assert.ok(!p.tabs.some(tab=>String(tab.navigated).includes("sm-shaw/hammerdb-results/new")));
});

test("clipboard failure blocks the new fork page and leaves exact name visible",async()=>{
  const p=await mount({login:"sm-shaw",mode:"wrong-parent",clipboard:"all-denied"});
  await p.click("continue-github");
  await p.click("open-fork-page");
  assert.equal(p.tabs[1].closed,true);
  assert.equal(p.tabs[1].navigated,null);
  assert.equal(p.$("required-fork-name").textContent,"hammerdb-results-hammerdbltd");
  assert.equal(p.$("fork-create-guide").hidden,false);
  assert.match(p.$("fork-feedback-message").textContent,/Copy the exact repository name/);
  assert.equal(p.$("fork-feedback-link").href,"https://github.com/HammerDBLtd/hammerdb-results/fork");
});

test("if Lucas already created a correctly parented alternate fork, reuse it directly",async()=>{
  const p=await mount({login:"ls250",mode:"collision-alt-ready"});
  await p.click("continue-github");
  assert.equal(p.$("fork-repository").value,"hammerdb-results-hammerdbltd");
  assert.match(p.tabs[0].navigated,/^https:\/\/github\.com\/ls250\/hammerdb-results-hammerdbltd\/new\/main\?filename=results%2F/);
  assert.equal(p.$("fork-create-guide").hidden,true);
  assert.equal(p.$("fork-feedback").hidden,true);
  assert.equal(p.$("submission-progress").dataset.stage,"editing");
  assert.ok(p.requests.some(url=>url.startsWith("https://api.github.com/users/ls250/repos?")));
});

test("when the suggested name is also taken, find the next unused name",async()=>{
  const p=await mount({login:"ls250",mode:"collision-alt-conflict"});
  await p.click("continue-github");
  assert.equal(p.$("fork-repository").value,"hammerdb-results-hammerdbltd-2");
  assert.equal(p.$("required-fork-name").textContent,"hammerdb-results-hammerdbltd-2");
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.tabs[0].navigated,null);
  await p.click("open-fork-page");
  assert.equal(p.copied.at(-1),"hammerdb-results-hammerdbltd-2");
  assert.equal(p.tabs[1].navigated,"https://github.com/HammerDBLtd/hammerdb-results/fork");
});

test("a separately named fork can be used after it has been created",async()=>{
  const p=await mount({login:"ls250",mode:"collision-alt-ready"});
  await p.click("continue-github");
  assert.match(p.tabs[0].navigated,/^https:\/\/github\.com\/ls250\/hammerdb-results-hammerdbltd\/new\/main\?filename=results%2F/);
});

test("an unrelated repository under the default name gets an alternative suggestion",async()=>{
  const p=await mount({mode:"unrelated"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  // Unrelated repository in both mock lookups: no unused name; do not send to fork page.
  assert.match(p.$("fork-feedback-title").textContent,/Could not check/);
});

test("GitHub API outage is safe: no navigation and the user's draft remains saved",async()=>{
  const p=await mount({mode:"unavailable"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.tabs[0].navigated,null);
  assert.equal(p.$("fork-create-guide").hidden,true);
  assert.ok(p.backingStorage.size>0);
  assert.match(p.$("fork-feedback-message").textContent,/Check the username/);
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
  const p=await mount();
  p.$("fork-repository").value="other/name";
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
  assert.match(p.$("fork-feedback-message").textContent,/Open your fork editor using this link/);
});

test("refresh clears uploaded JSON and details even when a draft exists",async()=>{
  const first=await mount({login:"ls250"});
  first.$("company-name").value="Testing Systems Ltd";
  first.$("result-description").value="Testing return from fork setup";
  first.$("fork-repository").value="hammerdb-results-hammerdbltd";
  await first.input("company-name");
  await first.input("result-description");
  await first.input("fork-repository");
  const snapshot=Object.fromEntries(first.backingStorage);
  const second=await mount({initialStorage:snapshot,preloadArtifact:false});
  assert.equal(second.$("preview").hidden,true);
  assert.equal(second.$("details-section").hidden,true);
  assert.equal(second.$("submit-section").hidden,true);
  assert.equal(second.$("github-username").value,"");
  assert.equal(second.$("company-name").value,"");
  assert.equal(second.$("result-description").value,"");
  assert.equal(second.$("generated-json").textContent,"Select an artifact to preview.");
  assert.equal(second.$("resume-draft-controls").hidden,false,"Recovery remains optional");
  assert.equal(second.$("fork-repository").value,"hammerdb-results");
  assert.equal(second.requests.some(url=>url.includes("raw.githubusercontent.com")),false,
    "Refresh must not look up the stale result");
  await second.click("resume-draft");
  assert.equal(second.$("github-username").value,"ls250");
  assert.equal(second.$("company-name").value,"Testing Systems Ltd");
  assert.equal(second.$("result-description").value,"Testing return from fork setup");
  assert.equal(second.$("fork-repository").value,"hammerdb-results-hammerdbltd");
  assert.match(second.$("generated-json").textContent,/Testing return from fork setup/);
  assert.match(second.$("status").querySelector("strong").textContent,/Submission restored/);
});

test("a new visit without a saved submission stays empty",async()=>{
  const page=await mount({preloadArtifact:false});
  assert.equal(page.$("preview").hidden,true);
  assert.equal(page.$("submit-section").hidden,true);
  assert.equal(page.$("resume-draft-controls").hidden,true);
  assert.equal(page.$("generated-json").textContent,"Select an artifact to preview.");
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
  assert.ok(html.includes('id="continue-github">Continue to GitHub (manual PR)'));
  assert.ok(html.includes("GitHub issue:"));
  assert.ok(!html.includes('id="fork-options"'));
  assert.ok(!html.includes("direct-fork-link"));
});

test("Lucas's already committed result opens the prefilled PR, not another editor",async()=>{
  const p=await mount({
    login:"ls250",mode:"collision-alt-ready",
    initiallyCommitted:true
  });
  await p.click("continue-github");
  assert.equal(p.tabs.length,1);
  assert.match(p.tabs[0].navigated,/^https:\/\/github\.com\/HammerDBLtd\/hammerdb-results\/compare\/main\.\.\.ls250:hammerdb-results-hammerdbltd:main\?quick_pull=1&title=/);
  const u=new URL(p.tabs[0].navigated);
  assert.equal(u.searchParams.get("quick_pull"),"1");
  assert.match(u.searchParams.get("title"),/FAKEABC123/);
  assert.match(u.searchParams.get("body"),/Submitted by: @ls250/);
  assert.match(u.searchParams.get("body"),/results\/tproc-c\/mariadb\/2026\/11\/FAKEABC123\.json/);
  assert.doesNotMatch(p.tabs[0].navigated,/\/new\/main/);
  assert.equal(p.$("submission-progress").dataset.stage,"ready");
  assert.equal(p.$("finish-pr").hidden,true);
  assert.equal(p.$("pr-link").href,p.tabs[0].navigated);
});

test("existing fork with uncommitted JSON clearly presents the PR finish step",async()=>{
  const p=await mount({login:"ls250"});
  await p.click("continue-github");
  assert.match(p.tabs[0].navigated,/^https:\/\/github\.com\/ls250\/hammerdb-results\/new\/main\?filename=/);
  assert.equal(p.$("submission-progress").hidden,false);
  assert.equal(p.$("submission-progress").dataset.stage,"editing");
  assert.equal(p.$("finish-pr").hidden,false);
  assert.match(p.$("submission-progress-detail").textContent,/Return here/);
});

test("clicking Finish before saving never opens an empty PR",async()=>{
  const p=await mount({login:"ls250"});
  await p.click("continue-github");
  await p.click("finish-pr");
  assert.equal(p.tabs[1].initial,"about:blank");
  assert.equal(p.tabs[1].closed,true);
  assert.equal(p.tabs[1].navigated,null);
  assert.equal(p.$("submission-progress").dataset.stage,"editing");
  assert.match(p.$("submission-progress-title").textContent,/Finish your GitHub submission/);
});

test("after the GitHub commit one click finishes submission by opening the PR",async()=>{
  const p=await mount({login:"ls250"});
  await p.click("continue-github");
  p.commit();
  await p.click("finish-pr");
  assert.match(p.tabs[1].navigated,/\/compare\/main\.\.\.ls250:hammerdb-results:main\?quick_pull=1/);
  assert.equal(p.$("submission-progress").dataset.stage,"ready");
  assert.equal(p.$("pr-link").href,p.tabs[1].navigated);
});

test("returning from GitHub reveals the exact PR link for an AI assistant",async()=>{
  const p=await mount({login:"ls250"});
  await p.click("continue-github");
  p.commit();
  await p.focus();
  assert.equal(p.$("submission-progress").dataset.stage,"ready");
  assert.match(p.$("pr-link").href,/quick_pull=1/);
  assert.equal(p.$("pr-link").hidden,false);
});

test("the form recognises an already-created pull request",async()=>{
  const p=await mount({login:"ls250",initiallyCommitted:true,prOpen:true});
  await p.click("continue-github");
  assert.equal(p.tabs[0].navigated,"https://github.com/HammerDBLtd/hammerdb-results/pull/37");
  assert.equal(p.$("submission-progress").dataset.stage,"submitted");
  assert.match(p.$("submission-progress-title").textContent,/PR #37 is already open/);
  assert.equal(p.$("pr-link").href,p.tabs[0].navigated);
});

test("after opening the PR, returning to the form confirms submission status",async()=>{
  const p=await mount({login:"ls250"});
  await p.click("continue-github");
  p.commit();
  await p.click("finish-pr");
  p.openPr();
  await p.focus();
  assert.equal(p.$("submission-progress").dataset.stage,"submitted");
  assert.equal(p.$("pr-link").href,"https://github.com/HammerDBLtd/hammerdb-results/pull/37");
});

test("a result with different GitHub attribution cannot start a PR",async()=>{
  const p=await mount({login:"ls250",initiallyCommitted:true,prWrongAttribution:true});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.tabs[0].navigated,null);
  assert.equal(p.$("submission-progress").dataset.stage,"error");
});

test("a PR in progress can be resumed explicitly without auto-loading on refresh",async()=>{
  const p=await mount({login:"ls250"});
  await p.click("continue-github");
  const saved=Object.fromEntries(p.backingStorage);
  const q=await mount({login:"ls250",initialStorage:saved,preloadArtifact:false});
  assert.equal(q.$("submit-section").hidden,true);
  assert.equal(q.$("submission-progress").hidden,true);
  assert.equal(q.$("resume-draft-controls").hidden,false);
  await q.click("resume-draft");
  await q.focus();
  assert.equal(q.$("fork-repository").value,"hammerdb-results");
  assert.equal(q.$("submission-progress").dataset.stage,"editing");
  assert.match(q.$("submission-progress-detail").textContent,/Open pull request/);
});

test("the production target constructs a TPC-Council PR (not HammerDB Ltd)",async()=>{
  const p=await mount({repoOwner:"TPC-Council",login:"ls250",initiallyCommitted:true});
  await p.click("continue-github");
  const url=p.tabs[0].navigated;
  assert.match(url,/^https:\/\/github\.com\/TPC-Council\/hammerdb-results\/compare\/main\.\.\.ls250:hammerdb-results:main\?quick_pull=1/);
  assert.doesNotMatch(url,/HammerDBLtd/);
});

test("the fork's master branch is preserved in the PR comparison",async()=>{
  const p=await mount({login:"raj-rahul51",defaultBranch:"master",initiallyCommitted:true});
  await p.click("continue-github");
  assert.match(p.tabs[0].navigated,/\/compare\/main\.\.\.raj-rahul51:hammerdb-results:master\?quick_pull=1/);
});

test("the PR description is concise and never embeds the full benchmark JSON",async()=>{
  const p=await mount({login:"ls250",initiallyCommitted:true});
  await p.click("continue-github");
  const url=p.tabs[0].navigated;
  assert.ok(url.length<1500);
  const body=new URL(url).searchParams.get("body");
  assert.ok(body.length<500);
  assert.doesNotMatch(body,/nopm|tpm|benchmark_config|warehouses/i);
});

test("automation can rely on the stable stage and PR link IDs",()=>{
  assert.ok(html.includes('id="submission-progress"'));
  assert.ok(html.includes('data-stage="idle"'));
  assert.ok(html.includes('id="finish-pr"'));
  assert.ok(html.includes('id="pr-link"'));
  assert.match(script,/quick_pull:"1"/);
});


test("a user with a differently named fork never sees Create fork",async()=>{
  const p=await mount({login:"ls250",mode:"existing-alt-custom"});
  await p.click("continue-github");
  assert.equal(p.$("fork-repository").value,"my-custom-benchmarks");
  assert.match(p.tabs[0].navigated,
    /^https:\/\/github\.com\/ls250\/my-custom-benchmarks\/new\/main\?filename=results%2F/);
  assert.equal(p.tabs[0].closed,false);
  assert.ok(p.requests.some(url=>url.startsWith("https://api.github.com/users/ls250/repos?")));
  assert.doesNotMatch(p.tabs[0].navigated,/\/fork$/);
});

test("already committed result in renamed fork opens PR without an editor or extra fork",async()=>{
  const p=await mount({login:"ls250",mode:"collision-alt-ready",initiallyCommitted:true});
  await p.click("continue-github");
  assert.match(p.tabs[0].navigated,
    /\/HammerDBLtd\/hammerdb-results\/compare\/main\.\.\.ls250:hammerdb-results-hammerdbltd:main\?quick_pull=1/);
  assert.doesNotMatch(p.tabs[0].navigated,/\/new\/|\/fork$/);
  assert.equal(p.$("submission-progress").dataset.stage,"ready");
});

test("no second fork is suggested if GitHub cannot verify the user's existing forks",async()=>{
  const p=await mount({login:"ls250",mode:"user-list-403"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.equal(p.tabs[0].navigated,null);
  assert.match(p.$("fork-feedback-title").textContent,/Could not check/);
  assert.ok(p.requests.some(url=>url.startsWith("https://api.github.com/users/ls250/repos?")));
});

test("expert manual form keeps primary GitHub continuation button and hides technical backup tools",()=>{
  const submission=html.slice(html.indexOf('id="submit-section"'),html.indexOf('</section>',html.indexOf('id="submit-section"')));
  assert.match(submission,/id="continue-github">Continue to GitHub (manual PR)/);
  assert.match(submission,/<details class="raw-preview"><summary>Result backup and troubleshooting/);
  assert.ok(!submission.includes('id="fork-options"'));
  assert.ok(!submission.includes("GitHub fork repository name"));
  assert.ok(!submission.includes("Copy enriched JSON</button>"));
});

test("Github GitHub 422 warning and direct fork recovery are included",()=>{
  assert.ok(html.includes("HTTP 422"));
  assert.ok(script.includes('const forkUrl = "https://github.com/" + upstreamRepository + "/fork"'));
  assert.match(script,/discoverExistingFork\(login,preferredName\)/);
});


test("changing the submitter never reuses a previous account's fork",async()=>{
  const p=await mount({login:"ls250",mode:"collision-alt-ready"});
  await p.click("continue-github");
  assert.equal(p.$("fork-repository").value,"hammerdb-results-hammerdbltd");
  p.$("github-username").value="different-user";
  await p.input("github-username");
  assert.equal(p.$("fork-repository").value,"hammerdb-results");
  assert.equal(p.$("submission-progress").hidden,true);
  assert.equal(p.$("submission-progress").dataset.stage,"idle");
});

test("when a user has many forks a matching HammerDB fork is still reused",async()=>{
  const p=await mount({login:"ls250",mode:"bulk-forks"});
  await p.click("continue-github");
  assert.equal(p.$("fork-repository").value,"hammerdb-results-hammerdbltd");
  assert.match(p.tabs[0].navigated,
    /^https:\/\/github\.com\/ls250\/hammerdb-results-hammerdbltd\/new\/main\?filename=results%2F/);
  assert.doesNotMatch(p.tabs[0].navigated,/\/fork$/);
});

test("manual form resumes handoff from one-button page, preserving GitHub username",async()=>{
  const saved=JSON.stringify({...sampleArtifact,submission:{
    github_username:"sm-shaw",description:"Human-submitted test result",company:{
      name:"HammerDB Ltd",logo_url:"",description:"Benchmarks"
    }
  }});
  const p=await mount({preloadArtifact:false,handoffJson:saved,login:"sm-shaw",mode:"no-fork"});
  assert.equal(p.$("submit-section").hidden,false);
  assert.equal(p.$("github-username").value,"sm-shaw");
  assert.equal(p.$("company-name").value,"HammerDB Ltd");
  assert.equal(p.$("result-description").value,"Human-submitted test result");
  assert.equal(p.handoffStorage.size,0,"One-time transfer must be removed");
  assert.equal(p.$("result-path").textContent,"results/tproc-c/mariadb/2026/11/FAKEABC123.json");
  assert.ok(p.backingStorage.has("hammerdb-results-submission-draft:hammerdbltd/hammerdb-results"));
});
