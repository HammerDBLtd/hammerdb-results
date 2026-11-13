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
async function mount({repoOwner="TPC-Council",login="rpbbox",mode="existing",
                     clipboard="working",popupBlocked=false}={}){
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
    execCommand(action){if(action!=="copy")return false;copied.push(document.body.children.at(-1).value);return true}
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
      if(clipboard==="denied")throw Error("No clipboard");
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
      if(mode==="no-fork")return {status:404,ok:false};
      if(mode==="unauthorized")return {status:403,ok:false};
      const fork=mode!=="unrelated";
      const info={fork,default_branch:"main",parent:{
        full_name:mode==="wrong-parent"?"OtherOrg/hammerdb-results":repo.fullName
      },source:{full_name:mode==="wrong-parent"?"OtherOrg/hammerdb-results":repo.fullName}};
      return {status:200,ok:true,json:async()=>info};
    }
    throw Error("Unexpected fetch "+url);
  };
  $("details-section").hidden=true;
  $("submit-section").hidden=true;
  $("workload-section").hidden=true;
  $("submit-next").hidden=true;
  $("dev-direct-editor").hidden=true;
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

test("already-forked contributor goes directly to their own editor",async()=>{
  const p=await mount({login:"rpbbox"});
  await p.click("continue-github");
  assert.equal(p.tabs.length,1);
  assert.equal(p.tabs[0].initial,"about:blank");
  assert.deepEqual(p.events.slice(0,2),["copy","open"]);
  assert.match(p.tabs[0].navigated,/^https:\/\/github\.com\/rpbbox\/hammerdb-results\/new\/main\?filename=results%2F/);
  assert.doesNotMatch(p.tabs[0].navigated,/TPC-Council\/hammerdb-results\/new/);
  assert.equal(JSON.parse(p.copied[0]).submission.github_username,"rpbbox");
  assert.match(p.$("submit-next-detail").textContent,/after approval/);
});

test("new contributor is sent to direct fork URL instead of GitHub inline fork",async()=>{
  const p=await mount({login:"newcomer",mode:"no-fork"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].navigated,"https://github.com/TPC-Council/hammerdb-results/fork");
  assert.match(p.$("submit-next-detail").textContent,/Return here/);
  assert.equal(p.copied.length,1);
});

test("existing repository with same name is not mistaken for a valid fork",async()=>{
  const p=await mount({login:"another-user",mode:"unrelated"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.match(p.$("submit-next-detail").textContent,/not a fork/);
});

test("fork of unrelated parent is not mistaken for a valid fork",async()=>{
  const p=await mount({login:"another-user",mode:"wrong-parent"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.match(p.$("submit-next-detail").textContent,/not a fork/);
});

test("GitHub API failure shows recovery links, never inline upstream editor",async()=>{
  const p=await mount({mode:"unavailable"});
  await p.click("continue-github");
  assert.equal(p.tabs[0].closed,true);
  assert.match(p.$("submit-next-detail").textContent,/could not confirm|unable to check|already have a fork/i);
  assert.equal(p.$("submit-next-link").href,"https://github.com/rpbbox/hammerdb-results");
});

test("missing GitHub username gives visible error next to actions",async()=>{
  const p=await mount({login:""});
  await p.click("continue-github");
  assert.equal(p.tabs.length,0);
  assert.equal(p.$("submit-next").hidden,false);
  assert.match(p.$("submit-next-detail").textContent,/GitHub username/);
  assert.equal(p.copied.length,0);
});

test("blocked clipboard shows manual copy path and closes blank tab",async()=>{
  const p=await mount({clipboard:"denied",mode:"existing"});
  await p.click("continue-github");
  // Legacy document.execCommand fallback succeeds here.
  assert.equal(p.tabs.length,1);
  assert.match(p.tabs[0].navigated,/\/rpbbox\/hammerdb-results\/new\/main/);
  assert.equal(p.copied.length,1);
});

test("popup blocked means visible editor fallback link",async()=>{
  const p=await mount({popupBlocked:true});
  await p.click("continue-github");
  assert.equal(p.tabs.length,0);
  assert.match(p.$("submit-next-link").href,/\/rpbbox\/hammerdb-results\/new\/main/);
  assert.match(p.$("submit-next-detail").textContent,/blocked/);
});

test("the development page offers direct maintainer testing without changing fork logic",async()=>{
  const p=await mount({repoOwner:"HammerDBLtd",login:"sm-shaw",mode:"wrong-parent"});
  assert.equal(p.$("dev-direct-editor").hidden,false);
  assert.equal(p.$("direct-fork-link").href,"https://github.com/HammerDBLtd/hammerdb-results/fork");
  assert.match(p.$("dev-editor-link").href,/https:\/\/github\.com\/HammerDBLtd\/hammerdb-results\/new\/main\?filename=results%2F/);
});

test("the source does not use the failing inline fork flow for the main button",()=>{
  assert.ok(script.includes("forkDestination(login)"));
  assert.doesNotMatch(script,/const url = "https:\/\/github\.com\/" \+ TARGET_OWNER \+ "\/" \+ TARGET_REPO \+ "\/new\/"/);
});
