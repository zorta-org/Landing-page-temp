import React,{useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {
  Search,Home as HomeIcon,Users,Briefcase,Rocket,FolderGit2,MessageSquare,Bell,
  Compass,Plus,Settings as SettingsIcon,LogOut,ArrowUp,ArrowDown,
  Bookmark,Share2,MoreHorizontal,ChevronRight,Menu,X,Send,Star,File,
  GitCommit,GitBranch,GitPullRequest,CircleAlert,CheckCircle2,ExternalLink,UserPlus,
  Trash2,Pencil,Shield,Crown,UserMinus,Ban,Hash,Moon,Clock3,Eye,GitFork,MessageCircle,
  Github,Globe,Twitter,Linkedin,Sparkles,Trophy,Coins,BadgeCheck,
  Link2,ThumbsUp,Lock,Loader2,ImagePlus,Check,Cookie,Gift
} from 'lucide-react';
import './styles.css';

import {api,API} from './lib/api';
import type {User} from './lib/types';
import {Logo,Avatar} from './components/ui';
import {applyTheme,hasChosenTheme,ThemeOnboarding} from './lib/theme';
import {Feed,Post,Comment,PostDetail} from './features/forums';
import {Settings} from './features/settings';
import {Referrals} from './features/referrals';
import {Rewards} from './features/rewards';
import {Wallet} from './features/wallet';
import {MessagesDock} from './features/messages';
const CookieIcon=Cookie;

function navigate(path:string){
  if(window.location.pathname+window.location.search===path)return;
  window.history.pushState({},'',path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function usePath(){
  const [path,setPath]=useState(
    ()=>window.location.pathname+window.location.search
  );

  useEffect(()=>{
    const onPop=()=>{
      setPath(
        window.location.pathname+
        window.location.search
      );
    };

    window.addEventListener('popstate',onPop);

    return()=>{
      window.removeEventListener('popstate',onPop);
    };
  },[]);

  return path;
}

function normalizeUser(raw:any):User|null{
  if(!raw||typeof raw!=='object'||!raw._id&& !raw.id)return null;
  return {id:String(raw.id || raw._id || raw.user_id),user_id:String(raw.user_id||''),username:String(raw.username||''),display_name:String(raw.display_name||raw.username||'Builder'),avatar:raw.avatar||'',bio:raw.bio||'',reputation:Number(raw.reputation||0),skills:Array.isArray(raw.skills)?raw.skills:[],interests:Array.isArray(raw.interests)?raw.interests:[],roles:Array.isArray(raw.roles)?raw.roles:[],onboarding_complete:Boolean(raw.onboarding_complete),platform_role:raw.platform_role||'user',cover:raw.cover||'',location:raw.location||'',website:raw.website||'',availability:raw.availability||'',pronouns:raw.pronouns||''};
}

function localTime(value:any, options:Intl.DateTimeFormatOptions={dateStyle:'medium',timeStyle:'short'}){
  if(!value)return '';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'':d.toLocaleString(undefined,options);
}

const LANG_MAP:Record<string,string>={js:'javascript',jsx:'javascript',mjs:'javascript',cjs:'javascript',ts:'typescript',tsx:'typescript',py:'python',json:'json',css:'css',html:'html',htm:'html',md:'text',txt:'text'};
const JS_KEYWORDS=['const','let','var','function','return','if','else','for','while','do','switch','case','default','break','continue','class','extends','new','import','from','export','async','await','try','catch','finally','throw','interface','type','public','private','protected','static','readonly','enum','implements','super','this','typeof','instanceof','in','of','void','yield','delete','true','false','null','undefined'];
const PY_KEYWORDS=['def','class','return','import','from','as','if','elif','else','for','while','in','not','and','or','is','try','except','finally','with','lambda','yield','async','await','raise','pass','break','continue','global','nonlocal','del','True','False','None','self'];

function esc(s:string){return s.replace(/[&<>]/g,c=>c==='&'?'&amp;':c==='<'?'&lt;':'&gt;');}
function wrap(cls:string,text:string){return '<span class="tok-'+cls+'">'+esc(text)+'</span>';}

function renderMarkdown(source:string){
  const lines=String(source||'').replace(/\r\n?/g,'\n').split('\n');
  let html='';
  let inCode=false;
  let codeLang='';
  let code='';
  let listOpen=false;

  const inline=(value:string)=>{
    let s=esc(value);
    s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
    s=s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
    s=s.replace(/__([^_]+)__/g,'<strong>$1</strong>');
    s=s.replace(/\*([^*]+)\*/g,'<em>$1</em>');
    return s;
  };

  const closeList=()=>{if(listOpen){html+='</ul>';listOpen=false;}};

  for(const line of lines){
    if(line.trim().startsWith('```')){
      if(inCode){
        html+='<pre><code>'+esc(code.replace(/\n$/,''))+'</code></pre>';
        code='';inCode=false;codeLang='';
      }else{
        closeList();inCode=true;codeLang=line.trim().slice(3).trim();
      }
      continue;
    }

    if(inCode){code+=line+'\n';continue;}

    if(!line.trim()){
      closeList();
      continue;
    }

    const heading=line.match(/^(#{1,3})\s+(.+)$/);
    if(heading){
      closeList();
      const level=heading[1].length;
      html+=`<h${level}>${inline(heading[2])}</h${level}>`;
      continue;
    }

    const bullet=line.match(/^\s*[-*+]\s+(.+)$/);
    if(bullet){
      if(!listOpen){html+='<ul>';listOpen=true;}
      html+='<li>'+inline(bullet[1])+'</li>';
      continue;
    }

    if(line.startsWith('>')){
      closeList();
      html+='<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>';
      continue;
    }

    closeList();
    html+='<p>'+inline(line)+'</p>';
  }

  closeList();
  if(inCode) html+='<pre><code>'+esc(code.replace(/\n$/,''))+'</code></pre>';
  return html||'<p class="readme-empty">No README yet.</p>';
}

function highlightCode(source:string, ext:string){
  if(!source) return '';
  const lang=LANG_MAP[(ext||'').toLowerCase()]||'text';

  if(lang==='json'){
    const re=/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|([{}\[\],:])/g;
    let out='',last=0,m:RegExpExecArray|null;
    while((m=re.exec(source))){
      out+=esc(source.slice(last,m.index));
      if(m[1]!==undefined) out+=wrap(m[2]?'attr':'string',m[1])+(m[2]?esc(m[2]):'');
      else if(m[3]!==undefined) out+=wrap('keyword',m[3]);
      else if(m[4]!==undefined) out+=wrap('number',m[4]);
      else if(m[5]!==undefined) out+=wrap('punc',m[5]);
      last=re.lastIndex;
    }
    return out+esc(source.slice(last));
  }

  if(lang==='javascript'||lang==='typescript'||lang==='python'){
    const kw=lang==='python'?PY_KEYWORDS:JS_KEYWORDS;
    const strPart=lang==='python'
      ?'(?:[rRbBuUfF]{1,2})?(?:\'\'\'[\\s\\S]*?\'\'\'|"""[\\s\\S]*?"""|"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')'
      :'(?:`(?:\\\\.|[^`\\\\])*`|"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')';
    const commentPart=lang==='python'?'#[^\\n]*':'(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)';
    const re=new RegExp(
      '('+commentPart+')'+
      '|('+strPart+')'+
      '|\\b('+kw.join('|')+')\\b'+
      '|\\b(\\d+(?:\\.\\d+)?)\\b'+
      '|\\b([A-Za-z_$][\\w$]*)(?=\\()',
      'g'
    );
    let out='',last=0,m:RegExpExecArray|null;
    while((m=re.exec(source))){
      out+=esc(source.slice(last,m.index));
      if(m[1]!==undefined) out+=wrap('comment',m[1]);
      else if(m[2]!==undefined) out+=wrap('string',m[2]);
      else if(m[3]!==undefined) out+=wrap('keyword',m[3]);
      else if(m[4]!==undefined) out+=wrap('number',m[4]);
      else if(m[5]!==undefined) out+=wrap('func',m[5]);
      last=re.lastIndex;
    }
    return out+esc(source.slice(last));
  }

  if(lang==='css'){
    const re=/(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#[0-9a-fA-F]{3,8}\b)|(-?\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg)?)|([a-zA-Z-]+)(?=\s*:)|([.#][a-zA-Z_-][\w-]*)/g;
    let out='',last=0,m:RegExpExecArray|null;
    while((m=re.exec(source))){
      out+=esc(source.slice(last,m.index));
      if(m[1]!==undefined) out+=wrap('comment',m[1]);
      else if(m[2]!==undefined) out+=wrap('string',m[2]);
      else if(m[3]!==undefined) out+=wrap('number',m[3]);
      else if(m[4]!==undefined) out+=wrap('number',m[4]);
      else if(m[5]!==undefined) out+=wrap('attr',m[5]);
      else if(m[6]!==undefined) out+=wrap('func',m[6]);
      last=re.lastIndex;
    }
    return out+esc(source.slice(last));
  }

  if(lang==='html'){
    const re=/(<!--[\s\S]*?-->)|(<\/?[a-zA-Z][\w-]*)|("(?:\\.|[^"\\])*")|([a-zA-Z-]+(?==))|(\/?>)/g;
    let out='',last=0,m:RegExpExecArray|null;
    while((m=re.exec(source))){
      out+=esc(source.slice(last,m.index));
      if(m[1]!==undefined) out+=wrap('comment',m[1]);
      else if(m[2]!==undefined) out+=wrap('keyword',m[2]);
      else if(m[3]!==undefined) out+=wrap('string',m[3]);
      else if(m[4]!==undefined) out+=wrap('attr',m[4]);
      else if(m[5]!==undefined) out+=wrap('keyword',m[5]);
      last=re.lastIndex;
    }
    return out+esc(source.slice(last));
  }

  return esc(source);
}

const navItems=[
  ['/','Home',HomeIcon],
  ['/communities','Communities',Users],
  ['/freelance','Marketplace',Briefcase],
  ['/startups','Startups',Rocket],
  ['/workspaces','Projects',FolderGit2],
  ['/servers','Servers',MessageSquare],
  ['/feed','Posts',Compass],
  ['/wallet','Wallet',Coins],
  ['/search','Explore',Search]
] as const;

function Layout({
  user,
  children,
  onLogout
}:{
  user:User;
  children:React.ReactNode;
  onLogout:()=>void
}){

  const [open,setOpen]=useState(false);
  const path=usePath();

  if(!user)return null;

  const intercept=(
    e:React.MouseEvent
  )=>{

    const target=
      e.target as HTMLElement;

    const anchor = target.closest('a') as HTMLAnchorElement | null;

    if(!anchor)return;

    const href=
      anchor.getAttribute('href');

    if(
      !href||
      href.startsWith('http')||
      href.startsWith('mailto:')||
      anchor.target==='_blank'
    ){
      return;
    }

    if(
      e.metaKey||
      e.ctrlKey||
      e.shiftKey||
      e.altKey
    ){
      return;
    }

    e.preventDefault();

    setOpen(false);

    navigate(href);
  };

  return(
    <div
      className="app"
      onClick={intercept}
    >

      <aside
        className={
          open?'open':''
        }
      >

        <div className="side-top">

          <Logo/>

          <button
            className="mobile-close"
            onClick={()=>
              setOpen(false)
            }
          >
            <X size={18}/>
          </button>

        </div>

        <nav>

          {navItems.map(
            ([p,label,I])=>
              <a
                key={p}
                className={
                  (
                    p==='/'?
                    path==='/' :
                    path.startsWith(p)
                  )
                    ?'active'
                    :''
                }
                href={p}
              >
                <I size={17}/>
                <span>{label}</span>
              </a>
          )}

        </nav>

        <div className="side-rule"/>

        <nav>

          <a href="/notifications">
            <Bell size={17}/>
            <span>Panel</span>
          </a>

          <a href="/settings">
            <SettingsIcon size={17}/>
            <span>Settings</span>
          </a>
          {user.platform_role==='admin'&&(
            <a href="/admin">
              <Shield size={17}/>
              <span>Admin</span>
            </a>
          )}

        </nav>

        <div className="side-user">

          <Avatar user={user}/>

          <div>
            <b>{user.display_name}</b>

            <small>
              Level {
                Math.max(
                  1,
                  Math.floor(
                    user.reputation/100
                  )+1
                )
              } · Builder
            </small>
          </div>

          <button
            onClick={onLogout}
            title="Log out"
          >
            <LogOut size={15}/>
          </button>

        </div>

      </aside>

      <main>

        <header>

          <button
            className="menu"
            onClick={()=>
              setOpen(true)
            }
          >
            <Menu/>
          </button>

          <a
            className="mobile-logo"
            href="/"
          >
            <Logo small/>
          </a>

          <a
            className="searchbar"
            href="/search"
          >
            <Search size={17}/>
            <span>
              Search communities, projects, people…
            </span>
            <kbd>⌘K</kbd>
          </a>

          <div className="head-actions">

            <a
              className="create"
              href="/create"
            >
              <Plus size={16}/>
              Create
            </a>

            <a
              href={
                '/profile/'+
                user.username
              }
            >
              <Avatar user={user}/>
            </a>

          </div>

        </header>

        {children}
        <MessagesDock user={user}/>

      </main>

    </div>
  );
}

function Auth({
  onLogin
}:{
  onLogin:(u:User)=>void
}){

  const refCode=
    new URLSearchParams(location.search).get('ref')||'';

  const [mode,setMode]=
    useState<'login'|'signup'>(
      refCode?'signup':'login'
    );

  const [d,setD]=
    useState<any>(
      refCode?{referral_code:refCode}:{}
    );

  const [err,setErr]=
    useState('');

  const submit=async(
    e:any
  )=>{

    e.preventDefault();

    setErr('');

    try{

      const x=await api(
        '/auth/'+mode,
        {
          method:'POST',
          body:JSON.stringify(
            mode==='signup'
              ?{
                  ...d,
                  age_confirmed:
                    d.age_confirmed
                }
              :d
          )
        }
      );

      localStorage.setItem(
        'zorta_access',
        x.access_token
      );

      localStorage.setItem(
        'zorta_refresh',
        x.refresh_token||''
      );

      const user=
        normalizeUser(x.user);

      if(!user){
        throw new Error(
          'Login succeeded but the server returned an invalid user profile.'
        );
      }

      history.replaceState({},'','/');

      onLogin(user);

    }catch(e:any){

      setErr(e.message);

    }
  };

  return(
    <div className="auth">

      <div className="auth-card">

        <Logo/>

        <div className="auth-title">

          <span>
            BUILDING TOGETHER
          </span>

          <h1>
            {
              mode==='login'
                ?'Welcome back.'
                :'Your builder identity starts here.'
            }
          </h1>

          <p>
            {
              mode==='login'
                ?'Pick up where you left off.'
                :'One identity for everything you build.'
            }
          </p>

          {refCode&&mode==='signup'&&(
            <div className="ref-banner">
              <Gift size={14}/> You were invited — sign up to claim your bonus coins.
            </div>
          )}

        </div>

        <form onSubmit={submit}>

          {mode==='signup'&&(
            <>
              <input
                placeholder="Display name"
                required
                onChange={e=>
                  setD({
                    ...d,
                    display_name:
                      e.target.value
                  })
                }
              />

              <input
                placeholder="Username"
                required
                onChange={e=>
                  setD({
                    ...d,
                    username:
                      e.target.value
                  })
                }
              />
            </>
          )}

          <input
            type="email"
            placeholder="Email"
            required
            onChange={e=>
              setD({
                ...d,
                email:e.target.value
              })
            }
          />

          <input
            type="password"
            placeholder="Password (8+ characters)"
            required
            minLength={8}
            onChange={e=>
              setD({
                ...d,
                password:e.target.value
              })
            }
          />

          {mode==='signup'&&(
            <label className="age">

              <input
                type="checkbox"
                required
                onChange={e=>
                  setD({
                    ...d,
                    age_confirmed:
                      e.target.checked
                  })
                }
              />

              I confirm I am 13 or older.

            </label>
          )}

          {err&&(
            <div className="error">
              {err}
            </div>
          )}

          <button className="primary wide">
            {
              mode==='login'
                ?'Log in'
                :'Create account'
            }
          </button>

        </form>

        <button
          className="oauth"
          onClick={async()=>{
            try{
              location.href=
                (
                  await api(
                    '/auth/google'+
                    (refCode?('?ref='+encodeURIComponent(refCode)):'')
                  )
                ).authorization_url;
            }catch(e){
              setErr(
                'Google OAuth is not configured.'
              );
            }
          }}
        >
          Continue with Google
        </button>

        <button
          className="switch"
          onClick={()=>
            setMode(
              mode==='login'
                ?'signup'
                :'login'
            )
          }
        >
          {
            mode==='login'
              ?'Create an account'
              :'Already have an account? Log in'
          }
        </button>

      </div>

    </div>
  );
}


/* =========================
   HOME + TASKS
========================= */

type Task={
  id:string;
  title:string;
  category:string;
  completed:boolean;
};

function Home({
  user
}:{
  user:User
}){
  const [counts,setCounts]=useState<{communities:number;workspaces:number;following:number}|null>(null);

  useEffect(()=>{
    let cancelled=false;

    Promise.all([
      api('/servers?mine=1').catch(()=>({servers:[]})),
      api('/profiles/'+user.username).catch(()=>({stats:{}}))
    ]).then(([serversRes,profileRes])=>{
      if(cancelled)return;
      setCounts({
        communities:(serversRes.servers||[]).length,
        workspaces:profileRes.stats?.workspaces||0,
        following:profileRes.stats?.following||0
      });
    });

    return ()=>{cancelled=true;};
  },[user.username]);

  const actions=[
    {icon:FolderGit2,title:'Build together',text:'Start projects, share code, and work with collaborators.',href:'/workspaces'},
    {icon:Briefcase,title:'Work or hire',text:'Find freelance work or bring the right person into your project.',href:'/freelance'},
    {icon:BadgeCheck,title:'Show your work',text:'Turn your projects, skills, and contributions into proof.',href:'/profile/'+user.username},
    {icon:Users,title:'Find your people',text:'Join communities, meet builders, and make friends.',href:'/communities'},
    {icon:Coins,title:'Earn while building',text:'Collect rewards through projects, events, referrals, and freelance work.',href:'/rewards'}
  ];

  return(
    <div className="home landing-home">
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="overline">BUILD · LEARN · CONNECT · EARN</span>
          <h1>A community for people who <i>create things.</i></h1>
          <p className="landing-lede">
            Zorta brings projects, people, freelance work, communities, portfolios, and rewards into one place.
            Build with others instead of just scrolling.
          </p>
          <div className="landing-ctas">
            <a className="primary landing-primary" href="/workspaces/create">
              Start building <ChevronRight size={16}/>
            </a>
            <a className="secondary landing-secondary" href="/communities">
              Explore Zorta
            </a>
          </div>
          <small className="landing-note">You’re already signed in as {user.display_name}. Start a project or find a community.</small>
        </div>

        <div className="landing-product" aria-label="Zorta product preview">
          <div className="product-window">
            <div className="product-window-head">
              <span className="window-dots"><i/><i/><i/></span>
              <span>zorta / projects</span>
              <span className="window-status">LIVE</span>
            </div>
            <div className="product-window-body">
              <div className="mini-repo">
                <div className="mini-repo-title"><FolderGit2 size={15}/> Aurora Studio <span>Public</span></div>
                <p>Building a collaborative creative toolkit.</p>
                <div className="mini-code">
                  <span><em>const</em> project = <strong>"build-together"</strong></span>
                  <span><em>await</em> collaborators.join()</span>
                  <span><em>return</em> <strong>ship()</strong></span>
                </div>
                <div className="mini-repo-meta">
                  <span><GitCommit size={12}/> 28 commits</span>
                  <span><Users size={12}/> 6 contributors</span>
                  <span><Star size={12}/> 94</span>
                </div>
              </div>
              <div className="mini-side">
                <div><Coins size={15}/><b>Reward</b><span>500 credits</span></div>
                <div><UserPlus size={15}/><b>Open for</b><span>2 collaborators</span></div>
                <div><BadgeCheck size={15}/><b>Skills</b><span>TypeScript · UI</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Stats user={user} counts={counts}/>

      <section className="landing-do">
        <div className="section-title">
          <div>
            <span className="overline">WHAT YOU CAN DO</span>
            <h2>Everything revolves around building.</h2>
          </div>
        </div>
        <div className="landing-actions-grid">
          {actions.map(({icon:Icon,title,text,href})=>(
            <a className="landing-action-card" href={href} key={title}>
              <span className="landing-action-icon"><Icon size={18}/></span>
              <div>
                <b>{title}</b>
                <p>{text}</p>
              </div>
              <ChevronRight size={15}/>
            </a>
          ))}
        </div>
      </section>

      <section className="landing-earn">
        <div className="earn-mark"><Coins size={23}/></div>
        <div>
          <span className="overline">REWARDS THAT FEEL REAL</span>
          <h2>Build things. Get rewarded.</h2>
          <p>
            Zorta is open to anyone 13+. You don’t need a bank account to earn.
            Rewards can be redeemed for things like Discord Nitro, gift cards, and game credits,
            depending on what’s available.
          </p>
        </div>
        <a className="secondary" href="/freelance">See ways to earn <ChevronRight size={14}/></a>
      </section>

      <section className="landing-bottom">
        <div>
          <span className="overline">YOUR NEXT MOVE</span>
          <h2>Don’t just scroll. Make something.</h2>
        </div>
        <div className="landing-bottom-links">
          <a className="primary" href="/workspaces/create">Create a project <Plus size={15}/></a>
          <a href="/freelance">Find freelance work <ChevronRight size={15}/></a>
          <a href="/communities">Meet the community <ChevronRight size={15}/></a>
        </div>
      </section>
    </div>
  );
}

function Stats({
  user,
  counts
}:{
  user:User;
  counts:{communities:number;workspaces:number;following:number}|null
}){

  return(
    <div className="stats">

      <Stat
        icon={<Users/>}
        value={counts?String(counts.communities):'—'}
        label="Communities"
      />

      <Stat
        icon={<FolderGit2/>}
        value={counts?String(counts.workspaces):'—'}
        label="Projects"
      />

      <Stat
        icon={<UserPlus/>}
        value={counts?String(counts.following):'—'}
        label="Following"
      />

      <Stat
        icon={<Star/>}
        value={
          user.reputation.toLocaleString()
        }
        label="Reputation"
      />

    </div>
  );
}

function Stat(p:any){

  return(
    <div className="stat">

      <span className="stat-icon">
        {p.icon}
      </span>

      <div>
        <b>{p.value}</b>
        <small>{p.label}</small>
      </div>

      {p.trend&&(
        <em>{p.trend}</em>
      )}

    </div>
  );
}


/* =========================
   FEED
========================= */

function Create(){

  return(
    <div className="page narrow">

      <span className="overline">
        CREATE
      </span>

      <h1>
        What are you building?
      </h1>

      <div className="create-grid">

        {[
          [
            'Post',
            'Share an idea, update or question',
            '/create/post',
            Compass
          ],
          [
            'Project',
            'Start a public or private workspace',
            '/workspaces/create',
            FolderGit2
          ],
          [
            'Gig',
            'Find someone to build with',
            '/freelance/create',
            Briefcase
          ],
          [
            'Startup',
            'Publish what you’re building',
            '/startups/create',
            Rocket
          ]
        ].map(
          ([a,b,c,I]:any)=>
            <a
              className="create-choice"
              href={c}
              key={a}
            >
              <I/>

              <div>
                <b>{a}</b>
                <p>{b}</p>
              </div>

              <ChevronRight/>

            </a>
        )}

      </div>

    </div>
  );
}


/* =========================
   FORMS
========================= */

function Form({
  kind
}:{
  kind:
    'post'|
    'workspace'|
    'gig'|
    'startup'
}){

  const listingType=kind==='gig' ? (new URLSearchParams(window.location.search).get('type')==='service' ? 'service' : 'job_request') : '';
  const cfg:any={
    post:[
      'Share with Zorta',
      'title',
      'body',
      '/posts'
    ],

    workspace:[
      'New workspace',
      'name',
      'description',
      '/workspaces'
    ],

    gig:[
      listingType==='service' ? 'Offer a freelance service' : 'Post a client job request',
      'title',
      'description',
      '/gigs'
    ],

    startup:[
      'New startup',
      'name',
      'description',
      '/startups'
    ]
  };

  const c=cfg[kind];

  const [d,setD]=useState<any>({});
  const [err,setErr]=useState('');
  const [busy,setBusy]=useState(false);

  const [files,setFiles]=useState<File[]>([]);
  const [previews,setPreviews]=useState<string[]>([]);

  useEffect(()=>{
    const urls=files.map(file=>URL.createObjectURL(file));
    setPreviews(urls);

    return()=>{
      urls.forEach(url=>URL.revokeObjectURL(url));
    };
  },[files]);

  const chooseImages=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const selected=Array.from(e.target.files||[]);

    if(!selected.length)return;

    const allowed=['image/jpeg','image/png','image/gif','image/webp'];
    const valid=selected.filter(file=>
      allowed.includes(file.type) &&
      file.size<=5*1024*1024
    );

    if(valid.length!==selected.length){
      setErr('Images must be JPG, PNG, GIF or WebP and 5 MB or smaller.');
    }else{
      setErr('');
    }

    setFiles(current=>[
      ...current,
      ...valid
    ].slice(0,4));

    e.target.value='';
  };

  const removeImage=(index:number)=>{
    setFiles(current=>
      current.filter((_,i)=>i!==index)
    );
  };

  const submit=async(e:any)=>{
    e.preventDefault();
    if(busy)return;

    setBusy(true);
    setErr('');

    try{
      let payload={...d};

      if(kind==='post' && files.length){
        const images=await Promise.all(
          files.map(async(file)=>{
            const form=new FormData();
            form.append('image',file);

            const result=await api(
              '/uploads/forum-image',
              {
                method:'POST',
                body:form
              }
            );

            return result.url;
          })
        );

        payload.images=images;
      }

      if(kind==='gig'){
        payload.listing_type=listingType;
        payload.skills=String(d.skillsDraft||'').split(',').map((x:string)=>x.trim()).filter(Boolean).slice(0,8);
        delete payload.skillsDraft;
      }
      await api(
        c[3],
        {
          method:'POST',
          body:JSON.stringify(payload)
        }
      );

      navigate(
        kind==='post'
          ?'/feed'
          :kind==='workspace'
            ?'/workspaces'
            :kind==='gig'
              ?'/freelance'
              :'/startups'
      );

    }catch(e:any){
      setErr(
        e?.message||
        'Could not publish this.'
      );
      setBusy(false);
    }
  };

  return(
    <div className="page narrow">

      <span className="overline">
        CREATE
      </span>

      <h1>{c[0]}</h1>

      <form
        className="editor"
        onSubmit={submit}
      >

        <input
          placeholder={c[1]}
          required
          value={d[c[1]]||''}
          onChange={e=>
            setD({
              ...d,
              [c[1]]:e.target.value
            })
          }
        />

        <textarea
          placeholder={c[2]}
          rows={10}
          required
          value={d[c[2]]||''}
          onChange={e=>
            setD({
              ...d,
              [c[2]]:e.target.value
            })
          }
        />

        {kind==='post'&&(
          <>
            <div className="tags-editor">
              {(Array.isArray(d.tags)?d.tags:[]).map((tag:string,index:number)=>(
                <span className="tag-chip" key={tag+index}>
                  #{tag}
                  <button type="button" onClick={()=>{
                    const next=[...(d.tags||[])];
                    next.splice(index,1);
                    setD({...d,tags:next});
                  }} aria-label={'Remove '+tag}>×</button>
                </span>
              ))}
              <input
                value={d.tagDraft||''}
                placeholder={d.tags?.length?'Add another tag…':'Add tags…'}
                onChange={e=>setD({...d,tagDraft:e.target.value})}
                onKeyDown={e=>{
                  if(e.key===','||e.key==='Enter'){
                    e.preventDefault();
                    const value=String(d.tagDraft||'').trim().replace(/^#/,'');
                    if(value){
                      const next=[...(d.tags||[])];
                      if(next.length<8&&!next.some((x:string)=>x.toLowerCase()===value.toLowerCase())) next.push(value);
                      setD({...d,tags:next,tagDraft:''});
                    }
                  }
                  if(e.key==='Backspace'&&!d.tagDraft&&d.tags?.length){
                    setD({...d,tags:d.tags.slice(0,-1)});
                  }
                }}
              />
            </div>

            <select
              value={d.type||'discussion'}
              onChange={e=>
                setD({
                  ...d,
                  type:e.target.value
                })
              }
            >
              <option value="discussion">
                Discussion
              </option>

              <option value="showcase">
                Showcase
              </option>

              <option value="question">
                Question
              </option>

              <option value="update">
                Project update
              </option>
            </select>

            <div className="forum-attachments">
              <label className="attachment-picker">
                <Plus size={16}/>
                Attach images
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  multiple
                  onChange={chooseImages}
                  hidden
                />
              </label>

              <small>
                {files.length}/4 images · 5 MB max each
              </small>

              {!!previews.length&&(
                <div className="attachment-previews">
                  {previews.map((src,index)=>(
                    <div
                      className="attachment-preview"
                      key={src}
                    >
                      <img
                        src={src}
                        alt=""
                      />

                      <button
                        type="button"
                        onClick={()=>
                          removeImage(index)
                        }
                        aria-label="Remove image"
                      >
                        <X size={14}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {kind==='workspace'&&(
          <>
            <input
              placeholder="Language / stack (e.g. TypeScript)"
              onChange={e=>
                setD({
                  ...d,
                  language:e.target.value
                })
              }
            />
            <select
              value={d.visibility||'public'}
              onChange={e=>setD({...d,visibility:e.target.value})}
            >
              <option value="public">Public project</option>
              <option value="private">Private project</option>
            </select>
            <label className="form-check"><input type="checkbox" checked={!!d.open_for_collaborators} onChange={e=>setD({...d,open_for_collaborators:e.target.checked})}/> Open for collaborators</label>
            <label className="form-check"><input type="checkbox" checked={!!d.hiring} onChange={e=>setD({...d,hiring:e.target.checked})}/> Hiring freelancers for this project</label>
          </>
        )}

        {kind==='gig'&&(
          <>
            <div className="market-form-callout"><b>{listingType==='service'?'Offer a service':'Post a job'}</b><span>{listingType==='service'?'Clients can hire you directly.':'Freelancers can apply to your job.'}</span></div>
            <input type="number" min="1" required placeholder={listingType==='service'?'Your price in Zorta credits':'Your budget in Zorta credits'} onChange={e=>setD({...d,budget:Number(e.target.value)})}/>
            <details className="market-advanced"><summary>Add more details</summary><div className="market-advanced-grid"><input type="date" value={d.deadline||''} onChange={e=>setD({...d,deadline:e.target.value})}/><input placeholder="Skills, comma separated" value={d.skillsDraft||''} onChange={e=>setD({...d,skillsDraft:e.target.value})}/><select value={d.category||'General'} onChange={e=>setD({...d,category:e.target.value})}><option>General</option><option>Development</option><option>Design</option><option>Writing</option><option>Marketing</option><option>Video</option><option>Research</option></select><textarea rows={4} placeholder={listingType==='service'?'Extra scope or deliverables (optional)':'Extra requirements (optional)'} value={d.requirements||''} onChange={e=>setD({...d,requirements:e.target.value})}/></div></details>
            <small className="market-credit-note">Uses Zorta credits. Live card payments are not enabled.</small>
          </>
        )}

        {kind==='startup'&&(
          <>
            <input
              placeholder="Stage (idea, prototype, launched)"
              onChange={e=>setD({...d,stage:e.target.value})}
            />
            <textarea
              rows={5}
              placeholder="What problem are you solving?"
              onChange={e=>setD({...d,problem:e.target.value})}
            />
            <textarea
              rows={5}
              placeholder="How are you solving it?"
              onChange={e=>setD({...d,solution:e.target.value})}
            />
            <input
              placeholder="Tech stack (comma separated)"
              onChange={e=>setD({...d,tech_stack:e.target.value.split(',').map((x:string)=>x.trim()).filter(Boolean)})}
            />
            <input
              placeholder="Roles needed (comma separated)"
              onChange={e=>setD({...d,roles_needed:e.target.value.split(',').map((x:string)=>x.trim()).filter(Boolean)})}
            />
          </>
        )}

        {err&&(
          <div className="error">
            {err}
          </div>
        )}

        <button
          className="primary"
          disabled={busy}
        >
          {busy
            ?kind==='post'
              ?'Publishing…'
              :'Creating…'
            :'Publish'}
        </button>

      </form>

    </div>
  );
}


/* =========================
   MARKETPLACE
========================= */
function Marketplace({user}:{user:User}){
  const [mode,setMode]=useState<'freelancer'|'client'>('freelancer');
  const [tab,setTab]=useState<'browse'|'mine'|'proposals'|'orders'>('browse');
  const [listings,setListings]=useState<any[]>([]);
  const [proposals,setProposals]=useState<any[]>([]);
  const [orders,setOrders]=useState<any[]>([]);
  const [mine,setMine]=useState<any[]>([]);
  const [q,setQ]=useState('');
  const [skill,setSkill]=useState('');
  const [sort,setSort]=useState('latest');
  const [page,setPage]=useState(1);
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(true);
  const [loadingMore,setLoadingMore]=useState(false);
  const [error,setError]=useState('');

  const listingType=mode==='client'?'service':'job_request';
  const createHref=mode==='client'?'/freelance/create?type=service':'/freelance/create?type=job_request';

  const loadBrowse=async(reset=true)=>{
    if(reset){setLoading(true);setPage(1);}else setLoadingMore(true);
    setError('');
    const nextPage=reset?1:page+1;
    try{
      const params=new URLSearchParams({status:'open',listing_type:listingType,page:String(nextPage),limit:'24',q,skill,sort});
      const g=await api('/gigs?'+params.toString());
      setListings(prev=>reset?(g.gigs||[]):[...prev,...(g.gigs||[])]);
      setHasMore(!!g.has_more);setPage(nextPage);
    }catch(e:any){setError(e?.message||'Could not load listings.');}
    finally{setLoading(false);setLoadingMore(false);}
  };

  const loadMine=async()=>{
    try{const d=await api('/marketplace/dashboard');setMine((d.gigs||[]).filter((x:any)=>(x.listing_type||'job_request')===listingType));}
    catch(e:any){setError(e?.message||'Could not load your listings.');}
  };
  const loadProposals=async()=>{try{const p=await api('/proposals');setProposals(p.proposals||[]);}catch(e:any){setError(e?.message||'Could not load proposals.');}};
  const loadOrders=async()=>{try{const o=await api('/orders');setOrders(o.orders||[]);}catch(e:any){setError(e?.message||'Could not load orders.');}};

  useEffect(()=>{setTab('browse');loadBrowse(true);},[mode]);
  useEffect(()=>{if(tab==='mine')loadMine();if(tab==='proposals')loadProposals();if(tab==='orders')loadOrders();},[tab,mode]);

  const activeOrders=orders.filter(o=>['in_progress','submitted','revision','disputed'].includes(o.status));
  const messageUser=(username:string)=>navigate('/messages?with='+encodeURIComponent(username));

  return <div className="page marketplace-page">
    <div className="marketplace-hero">
      <div className="marketplace-title-wrap"><span className="overline">WORK</span><h1>Marketplace</h1></div>
      <div className="marketplace-mode" role="tablist" aria-label="What do you want to do?">
        <button className={mode==='freelancer'?'active':''} onClick={()=>setMode('freelancer')}><Briefcase size={15}/><span><b>I want to get hired</b><small>Find client job requests</small></span></button>
        <button className={mode==='client'?'active':''} onClick={()=>setMode('client')}><Users size={15}/><span><b>I want to hire someone</b><small>Browse freelancer services</small></span></button>
      </div>
    </div>

    <div className="market-tabs">
      <button className={tab==='browse'?'active':''} onClick={()=>setTab('browse')}>{mode==='client'?'Find someone':'Find a job'}</button>
      <button className={tab==='mine'?'active':''} onClick={()=>setTab('mine')}>{mode==='client'?'My services':'My job posts'}</button>
      {mode==='freelancer'&&<button className={tab==='proposals'?'active':''} onClick={()=>setTab('proposals')}>My applications</button>}
      <button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}>Orders{activeOrders.length>0&&<i>{activeOrders.length}</i>}</button>
    </div>

    {tab==='browse'&&<>
      <div className="market-section-heading"><div><span className="overline">{mode==='client'?'SERVICES':'JOB POSTS'}</span><h2>{mode==='client'?'Find someone for the work':'Find a job you can do'}</h2></div><a className="primary" href={createHref}><Plus size={14}/>{mode==='client'?'Offer a service':'Post a job'}</a></div>
      <div className="market-filters"><div className="filter-search"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadBrowse(true)} placeholder={mode==='client'?'Search services…':'Search jobs…'}/></div><input value={skill} onChange={e=>setSkill(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadBrowse(true)} placeholder="Skill"/><select value={sort} onChange={e=>{setSort(e.target.value);setTimeout(()=>loadBrowse(true),0)}}><option value="latest">Newest</option><option value="budget">Highest price</option></select><button className="primary" onClick={()=>loadBrowse(true)}>Search</button></div>
      {error&&<div className="market-error"><CircleAlert size={16}/><span>{error}</span><button onClick={()=>loadBrowse(true)}>Retry</button></div>}
      {loading?<div className="market-gig-grid">{[1,2,3,4,5,6].map(x=><div className="market-gig-card market-skeleton" key={x}><div className="skeleton-line title"/><div className="skeleton-line wide"/><div className="skeleton-line"/><div className="skeleton-line short"/><div className="skeleton-line cta"/></div>)}</div>:<>
        <div className="market-gig-grid">{listings.map(g=><article className="market-gig-card" key={g.id}>
          <div className="market-card-kicker"><span>{mode==='client'?'SERVICE':'JOB'}</span><span>{g.category||'General'}</span></div>
          <div className="market-card-title-row"><a href={'/freelance/'+g.id}><h3>{g.title}</h3></a><strong>{Number(g.price||g.budget||0).toLocaleString('en-IN')} <small>credits</small></strong></div>
          <div className="market-poster"><Avatar user={g.poster||{username:g.poster_username}} size="sm"/><div><b>{g.poster?.display_name||g.poster_username||'Zorta member'}</b><span>@{g.poster_username||'member'} · {g.poster_reputation||0} rep</span></div></div>
          <p>{g.description}</p><div className="tags">{(g.skills||[]).slice(0,4).map((x:string)=><span key={x}>{x}</span>)}</div>
          <a className="primary market-card-cta" href={'/freelance/'+g.id}>{mode==='client'?'View & hire':'View & apply'}<ChevronRight size={14}/></a>
        </article>)}
        {!listings.length&&<div className="market-empty"><Search size={25}/><b>{mode==='client'?'No services found':'No jobs found'}</b><span>Try another search or post your own.</span><a className="primary" href={createHref}><Plus size={14}/>{mode==='client'?'Offer a service':'Post a job'}</a></div>}
        </div>{hasMore&&<div className="market-load-more"><button onClick={()=>loadBrowse(false)} disabled={loadingMore}>{loadingMore?'Loading…':'Load more'}</button></div>}
      </>}
    </>}

    {tab==='mine'&&<div className="market-panel"><div className="admin-section-head"><div><b>{mode==='client'?'My services':'My job posts'}</b></div><a className="primary" href={createHref}><Plus size={14}/>{mode==='client'?'Offer service':'Post job'}</a></div><div className="market-gig-grid">{mine.map(g=><article className="market-gig-card compact" key={g.id}><div className="market-card-kicker"><span className={'status-pill '+g.status}>{String(g.status).replace('_',' ')}</span><strong>{Number(g.price||g.budget||0).toLocaleString('en-IN')} credits</strong></div><h3>{g.title}</h3><p>{g.description}</p><div className="market-card-actions"><a className="primary" href={'/freelance/'+g.id}>Open</a>{g.listing_type==='job_request'&&<a href={'/freelance/'+g.id}>Review applications</a>}</div></article>)}{!mine.length&&<div className="market-empty"><b>Nothing here yet.</b><span>Make your first listing.</span><a className="primary" href={createHref}><Plus size={14}/>Create</a></div>}</div></div>}

    {tab==='proposals'&&<div className="market-panel"><div className="admin-section-head"><div><b>My applications</b></div><span>{proposals.length}</span></div><div className="market-proposal-list">{proposals.map(p=><div className="market-proposal-row" key={p.id}><div><b>{p.gig_title||'Job'}</b><span>{p.message||'Application'}</span></div><strong>{Number(p.offer||0).toLocaleString('en-IN')} credits</strong><span className={'status-pill '+p.status}>{p.status}</span></div>)}{!proposals.length&&<div className="market-empty"><Send size={22}/><b>No applications yet.</b><button className="primary" onClick={()=>setTab('browse')}>Find a job</button></div>}</div></div>}

    {tab==='orders'&&<div className="market-panel"><div className="admin-section-head"><div><b>Orders</b></div><span>{orders.length}</span></div><div className="market-order-list">{orders.map(o=>{const other=o.client_id===user.id?o.freelancer_username:o.client_username;return <article className="market-order-card" key={o.id}><div><b>{o.title}</b><span>{o.status.replace('_',' ')}</span></div><strong>{Number(o.amount||0).toLocaleString('en-IN')} credits</strong><div className="market-card-actions"><a className="primary" href="/freelance/orders">Open order</a>{other&&<button onClick={()=>messageUser(other)}><MessageSquare size={13}/>Message</button>}</div></article>})}{!orders.length&&<div className="market-empty"><b>No orders yet.</b><span>Your hires and accepted applications will appear here.</span><button className="primary" onClick={()=>setTab('browse')}>Browse</button></div>}</div></div>}
  </div>;
}

function Collection({
  type
}:{
  type:
    'workspaces'|
    'gigs'|
    'startups'
}){

  const [items,setItems]=
    useState<any[]>([]);

  const [q,setQ]=
    useState('');
  const [sort,setSort]=useState<'latest'|'trending'>('latest');

  const [loading,setLoading]=
    useState(true);

  const [error,setError]=
    useState('');
  const [refreshing,setRefreshing]=useState(false);

  const endpoint=
    type==='workspaces'
      ?'/workspaces'
      :type==='gigs'
        ?'/gigs'
        :'/startups';

  useEffect(()=>{

    let cancelled=false;

    const load=async()=>{

      setLoading(true);
      setError('');

      try{

        const params=new URLSearchParams();
        if(q) params.set('q',q);
        if(type==='workspaces'||type==='startups') params.set('sort',sort);
        const query=params.toString()?'?'+params.toString():'';

        const x=
          await api(
            endpoint+
            query
          );

        if(cancelled)return;

        const key=
          type==='workspaces'
            ?'workspaces'
            :type==='gigs'
              ?'gigs'
              :'startups';

        setItems(
          Array.isArray(x[key])
            ?x[key]
            :[]
        );

      }catch(e:any){

        if(!cancelled){

          setError(
            e.message
          );

          setItems([]);

        }

      }finally{

        if(!cancelled){
          setLoading(false);
        }

      }

    };

    load();

    return()=>{
      cancelled=true;
    };

  },[
    type,
    q,
    sort,
    endpoint
  ]);

  const title=
    type==='workspaces'
      ?'Projects'
      :type==='gigs'
        ?'Marketplace'
        :'Startups';

  const create=
    type==='workspaces'
      ?'/workspaces/create'
      :type==='gigs'
        ?'/freelance/create'
        :'/startups/create';

  const labels={workspaces:'Projects',gigs:'Marketplace',startups:'Startups'} as const;
  const eyebrow={workspaces:'BUILD',gigs:'WORK',startups:'VENTURES'} as const;
  const subtitle={
    workspaces:'Build in public, collaborate, and ship versions together.',
    gigs:'Offer services, find client jobs, and manage delivery in one place.',
    startups:'Discover early teams and opportunities worth joining.'
  } as const;
  const refresh=async()=>{
    setRefreshing(true);
    try{
      const params=new URLSearchParams();
      if(q) params.set('q',q);
      if(type!=='gigs') params.set('sort',sort);
      const x=await api(endpoint+(params.toString()?'?'+params.toString():''));
      const key=type==='workspaces'?'workspaces':type==='gigs'?'gigs':'startups';
      setItems(Array.isArray(x[key])?x[key]:[]);
      setError('');
    }catch(e:any){setError(e?.message||'Could not refresh.');}
    finally{setRefreshing(false);}
  };

  return(
    <div className="page">
      <div className="list-head category-head">
        <div>
          <span className="overline">{eyebrow[type]}</span>
          <h1>{labels[type]}</h1>
          <p className="lede">{subtitle[type]}</p>
        </div>
        <div className="list-head-actions">
          {type==='gigs'&&<a className="secondary" href="/freelance/orders">My orders</a>}
          <a className="primary create" href={create}><Plus size={16}/>Create</a>
        </div>
      </div>

      <div className="collection-toolbar">
        <div className="filter-search">
          <Search size={16}/>
          <input aria-label={'Search '+title} placeholder={'Search '+title.toLowerCase()+'…'} value={q} onChange={e=>setQ(e.target.value)}/>
          {q&&<button type="button" className="toolbar-clear" onClick={()=>setQ('')} aria-label="Clear search">×</button>}
        </div>
        <div className="toolbar-actions">
          {type!=='gigs'&&<select value={sort} onChange={e=>setSort(e.target.value as any)} aria-label="Sort">
            <option value="latest">Latest</option><option value="trending">Trending</option>
          </select>}
          <button className="secondary" onClick={refresh} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh'}</button>
        </div>
      </div>

      {loading?<div className="collection-skeletons">{[1,2,3].map(n=><div className="data-card skeleton-card" key={n}><div className="skeleton-line short"/><div className="skeleton-line title"/><div className="skeleton-line"/><div className="skeleton-line"/></div>)}</div>
      :error?<div className="empty error-state"><b>Couldn’t load {title.toLowerCase()}.</b><p>{error}</p><button className="primary" onClick={refresh}>Try again</button></div>
      :items.length?<div className="cards">
        {items.map(x=>{
          const href=type==='workspaces'?'/workspaces/'+x.id:type==='startups'?'/startups/'+x.id:'/freelance/'+x.id;
          const label=x.language||x.stage||(x.status||'OPEN').replace('_',' ');
          return <a className="data-card category-card" href={href} key={x.id||x.path}>
            <div className="card-top"><span>{label}</span>{type==='workspaces'&&<span><CookieIcon size={12}/> {x.cookies??x.stars??0} cookies</span>}{type!=='workspaces'&&x.stars!=null&&<span><Star size={12}/> {x.stars}</span>}{x.reputation!=null&&type==='startups'&&<span><Trophy size={12}/> {x.reputation}</span>}</div>
            <h3>{x.name||x.title}</h3>
            <p>{x.description||x.tagline||'No description added yet.'}</p>
            <div className="card-bottom">
              <span className="card-owner">@{x.owner_username||x.client_username||'builder'}</span>
              {x.budget!=null&&<b>{Number(x.budget).toLocaleString('en-IN')} credits</b>}
              {x.roles_needed?.length>0&&<span>{x.roles_needed.length} role{x.roles_needed.length===1?'':'s'} open</span>}
            </div>
          </a>;
        })}
      </div>
      :<div className="empty collection-empty"><div className="empty-icon"><Search size={18}/></div><b>No {title.toLowerCase()} found.</b><p>{q?'Try a broader search.':'Be the first to publish something here.'}</p><a className="primary" href={create}><Plus size={15}/>Create one</a></div>}
    </div>
  );
}


/* =========================
   DETAIL
========================= */

function Detail({
  type,
  id,
  user
}:{
  type:
    'workspace'|
    'startup'|
    'gig';

  id:string;
  user?:any
}){

  const [d,setD]=
    useState<any>();

  const [err,setErr]=
    useState('');

  useEffect(()=>{

    api(
      '/'+
      (
        type==='workspace'
          ?'workspaces'
          :type==='startup'
            ?'startups'
            :'gigs'
      )+
      '/'+
      id
    )
      .then(setD)
      .catch(e=>
        setErr(
          e.message
        )
      );

  },[
    type,
    id
  ]);

  if(err)
    return(
      <div className="page">
        <div className="error">
          {err}
        </div>
      </div>
    );

  if(!d)
    return(
      <div className="page">
        Loading…
      </div>
    );

  const x=d[type];

  if(type==='workspace')return(
    <div className="page">
      <a className="back-link" href="/workspaces">← Projects</a>
      <WorkspaceDetail d={d} onRepoChange={(w:any)=>setD((cur:any)=>({...cur,workspace:w}))}/>
    </div>
  );

  return(
    <div className="page">
      <a className="back-link" href={type==='startup'?'/startups':'/freelance'}>← {type==='startup'?'Startups':'Marketplace'}</a>
      <div className="detail-hero">
        <span className="overline">{type==='startup'?'VENTURE':'OPPORTUNITY'}</span>
        <h1>{x.name||x.title}</h1>
        <p className="lede">{x.description||x.tagline||'No description added yet.'}</p>
      </div>
      {type==='startup'&&<StartupDetail d={{...d,viewer_id:user?.id}}/>}
      {type==='gig'&&<GigDetail d={d} user={user}/>}
    </div>
  );
}

function WorkspaceDetail({d,onRepoChange}:any){
  const [data,setData]=useState(d);
  const w=data.workspace;
  const [tab,setTab]=useState<'files'|'versions'|'issues'|'discussion'|'access'>('files');
  const [file,setFile]=useState<any>(null);
  const [editor,setEditor]=useState('');
  const [path,setPath]=useState('');
  const [message,setMessage]=useState('');
  const [issueTitle,setIssueTitle]=useState('');
  const [issueBody,setIssueBody]=useState('');
  const [comment,setComment]=useState('');
  const [comments,setComments]=useState<any[]>([]);
  const [discussions,setDiscussions]=useState<any[]>([]);
  const [discussionTitle,setDiscussionTitle]=useState('');
  const [discussionBody,setDiscussionBody]=useState('');
  const [openDiscussion,setOpenDiscussion]=useState<any>(null);
  const [discussionReplies,setDiscussionReplies]=useState<any[]>([]);
  const [discussionReply,setDiscussionReply]=useState('');
  const [accessUser,setAccessUser]=useState('');
  const [accessRole,setAccessRole]=useState('viewer');
  const [busy,setBusy]=useState(false);
  const [accessBusy,setAccessBusy]=useState(false);
  const [error,setError]=useState('');
  const codeHighlightRef=useRef<HTMLPreElement|null>(null);

  const reload=async()=>{
    const x=await api('/workspaces/'+w.id);
    setData(x); onRepoChange(x.workspace);
    setFile((cur:any)=>cur?x.files.find((f:any)=>f.id===cur.id)||x.files[0]||null:x.files[0]||null);
    return x;
  };
  useEffect(()=>{reload().catch(e=>setError(e.message));},[w.id]);
  useEffect(()=>{setEditor(file?.content||'');setPath(file?.path||'');},[file?.id]);
  useEffect(()=>{
    if(tab!=='discussion') return;
    api('/workspaces/'+w.id+'/discussions').then(x=>setDiscussions(x.discussions||[])).catch(e=>setError(e.message));
  },[tab,w.id]);
  const run=async(fn:()=>Promise<any>)=>{if(busy)return;setBusy(true);setError('');try{return await fn()}catch(e:any){setError(e?.message||'Something went wrong.')}finally{setBusy(false)}};
  const save=()=>run(async()=>{
    if(!path.trim())return;
    const payload={path:path.trim(),content:editor,message:message.trim()||`Update ${path.trim()}`};
    const x=file?await api('/workspaces/'+w.id+'/files/'+file.id,{method:'PATCH',body:JSON.stringify(payload)}):await api('/workspaces/'+w.id+'/files',{method:'POST',body:JSON.stringify(payload)});
    setFile(x.file);setMessage('');await reload();setTab('versions');
  });
  const upload=async(e:any)=>{
    const files=Array.from(e.target.files||[]) as File[];
    if(!files.length)return;
    await run(async()=>{for(const f of files){const content=await f.text();await api('/workspaces/'+w.id+'/files',{method:'POST',body:JSON.stringify({path:f.webkitRelativePath||f.name,content,message:`Add ${f.name}`})});}await reload();setTab('files');});
    e.target.value='';
  };
  const remove=()=>run(async()=>{if(!file||!confirm('Delete '+file.path+'?'))return;await api('/workspaces/'+w.id+'/files/'+file.id,{method:'DELETE'});setFile(null);setEditor('');setPath('');await reload()});
  const cookie=()=>run(async()=>{const x=await api('/workspaces/'+w.id+'/cookies',{method:'POST'});onRepoChange({...w,cookies:x.cookies,stars:x.cookies});setData((cur:any)=>({...cur,workspace:{...cur.workspace,cookies:x.cookies,stars:x.cookies},viewer_cookie:x.cookie,viewer_starred:x.cookie}))});
  const star=cookie;
  const createDiscussion=()=>run(async()=>{if(!discussionTitle.trim()||!discussionBody.trim())return;const x=await api('/workspaces/'+w.id+'/discussions',{method:'POST',body:JSON.stringify({title:discussionTitle,body:discussionBody})});setDiscussions(prev=>[x.discussion,...prev]);setDiscussionTitle('');setDiscussionBody('')});
  const openDiscussionTopic=async(topic:any)=>{setOpenDiscussion(topic);try{const x=await api('/workspaces/'+w.id+'/discussions/'+topic.id+'/replies');setDiscussionReplies(x.replies||[]);}catch(e:any){setError(e.message);}};
  const replyDiscussion=()=>run(async()=>{if(!openDiscussion||!discussionReply.trim())return;const x=await api('/workspaces/'+w.id+'/discussions/'+openDiscussion.id+'/replies',{method:'POST',body:JSON.stringify({body:discussionReply})});setDiscussionReplies(prev=>[...prev,x.reply]);setDiscussionReply('');setDiscussions(prev=>prev.map(d=>d.id===openDiscussion.id?{...d,reply_count:(d.reply_count||0)+1,last_activity_at:x.reply.created_at}:d))});
  const createIssue=()=>run(async()=>{if(!issueTitle.trim())return;await api('/workspaces/'+w.id+'/issues',{method:'POST',body:JSON.stringify({title:issueTitle,body:issueBody})});setIssueTitle('');setIssueBody('');await reload()});
  const addComment=()=>run(async()=>{if(!comment.trim())return;const x=await api('/workspaces/'+w.id+'/comments',{method:'POST',body:JSON.stringify({body:comment})});setComments(prev=>[...prev,x.comment]);setComment('')});
  const addAccess=async()=>{if(!accessUser.trim()||accessBusy)return;setAccessBusy(true);setError('');try{await api('/workspaces/'+w.id+'/access',{method:'POST',body:JSON.stringify({username:accessUser.trim(),role:accessRole})});setAccessUser('');await reload();}catch(e:any){setError(e.message||'Unable to grant access.');}finally{setAccessBusy(false);}};
  const setVisibility=(visibility:string)=>run(async()=>{const x=await api('/workspaces/'+w.id+'/visibility',{method:'PATCH',body:JSON.stringify({visibility})});setData((cur:any)=>({...cur,workspace:x.workspace}));onRepoChange(x.workspace)});
  const tree=(data.files||[]).map((f:any)=>f.path).sort();
  const language=(file?.path||'').split('.').pop()?.toLowerCase()||'';
  const codeClass=['ts','tsx'].includes(language)?'language-typescript':['js','jsx'].includes(language)?'language-javascript':['py'].includes(language)?'language-python':['json'].includes(language)?'language-json':['css'].includes(language)?'language-css':'language-text';
  return <div className="project-shell minimal-project">
    {error&&<div className="project-error">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
    <div className="project-header">
      <div><div className="project-name"><FolderGit2 size={19}/>{w.name}<span className={'visibility-chip '+(w.visibility==='private'?'private':'')}>{w.visibility}</span></div><p>{w.description||'A Zorta project.'}</p><div className="project-stats"><span><CookieIcon size={12}/>{w.cookies??w.stars??0} cookies</span><span>{data.files?.length||0} files</span><span>{data.commits?.length||0} versions</span></div></div>
      <div className="project-actions"><button className={data.viewer_cookie?'primary':'secondary'} onClick={cookie}><CookieIcon size={14}/>{data.viewer_cookie?'Cookied':'Cookie'}</button><label className="secondary"><Plus size={14}/> Upload<input hidden type="file" multiple onChange={upload}/></label><label className="secondary"><FolderGit2 size={14}/> Folder<input hidden type="file" multiple {...({webkitdirectory:'',directory:''} as any)} onChange={upload}/></label></div>
    </div>
    {data.readme&&(
      <section className="readme-markdown" aria-label="README">
        <div className="readme-heading">
          <span className="overline">README</span>
        </div>
        <div dangerouslySetInnerHTML={{__html:renderMarkdown(data.readme)}}/>
      </section>
    )}
    <div className="project-tabs">{([['files','Files'],['versions','Versions'],['issues','Issues'],['discussion','Discussion'],['access','Access']] as const).map(([k,l])=><button className={tab===k?'sel':''} onClick={()=>setTab(k)} key={k}>{l}{k==='issues'&&<span>{data.issues?.filter((x:any)=>x.status==='open').length||0}</span>}</button>)}</div>
    {tab==='files'&&<div className="repo-browser"><aside className="repo-tree"><div className="tree-head"><b>Files</b><span>{tree.length}</span></div>{!tree.length&&<div className="tree-empty">Nothing uploaded yet.</div>}{tree.map((p:string)=><button key={p} className={file?.path===p?'sel':''} onClick={async()=>{const f=data.files.find((x:any)=>x.path===p);if(f){const x=await api('/workspaces/'+w.id+'/files/'+f.id);setFile(x.file)}}}><File size={14}/>{p}</button>)}<button className="new-file-tree" onClick={()=>{setFile(null);setPath('');setEditor('')}}><Plus size={14}/>New file</button></aside><section className="code-panel"><div className="code-head"><input value={path} onChange={e=>setPath(e.target.value)} placeholder="path/to/file.ts"/><div>{file&&<button className="danger-outline" onClick={remove}>Delete</button>}<button className="primary" disabled={busy||!path.trim()} onClick={save}>{busy?'Saving…':file?'Save version':'Create version'}</button></div></div><div className="commit-input"><GitCommit size={14}/><input value={message} onChange={e=>setMessage(e.target.value)} placeholder="Version message (optional)"/></div><div className="code-editor-wrap">
              <pre ref={codeHighlightRef} className={'code-highlight '+codeClass} aria-hidden="true"><code dangerouslySetInnerHTML={{__html:highlightCode(editor||'',language)}}/></pre>
              <textarea
                className="code-editor"
                value={editor}
                onChange={e=>setEditor(e.target.value)}
                spellCheck={false}
                placeholder="Write code or upload files…"
                aria-label={path||'Code editor'}
                onScroll={e=>{
                  if(codeHighlightRef.current){
                    codeHighlightRef.current.scrollTop=e.currentTarget.scrollTop;
                    codeHighlightRef.current.scrollLeft=e.currentTarget.scrollLeft;
                  }
                }}
              />
            </div></section></div>}
    {tab==='versions'&&<div className="minimal-list">{!data.commits?.length?<div className="empty">No versions yet.</div>:data.commits.map((c:any)=><article className="commit-card" key={c.id}><div className="commit-icon"><GitCommit size={15}/></div><div><b>{c.message}</b><span>{c.author_username} · {localTime(c.created_at)}</span>{c.files?.map((f:any)=><details key={f.path}><summary>{f.action} {f.path}</summary><pre>{f.diff||'No text diff available.'}</pre></details>)}</div></article>)}</div>}
    {tab==='issues'&&<div className="project-feature minimal-feature"><div className="feature-form"><h3>New issue</h3><input value={issueTitle} onChange={e=>setIssueTitle(e.target.value)} placeholder="What needs attention?"/><textarea value={issueBody} onChange={e=>setIssueBody(e.target.value)} placeholder="Details (optional)"/><button className="primary" onClick={createIssue} disabled={busy||!issueTitle.trim()}><CircleAlert size={14}/>Add issue</button></div><div className="issue-list">{!data.issues?.length?<div className="empty">No issues yet.</div>:data.issues.map((x:any)=><article className="issue-card" key={x.id}><div className={x.status==='open'?'issue-dot open':'issue-dot'}><CircleAlert size={14}/></div><div><b>{x.title}</b><p>{x.body||'No details.'}</p><small>{x.author_username} · {localTime(x.created_at)}</small></div><div className="issue-actions">
          <span className={x.status==='open'?'issue-status open':'issue-status'}>{x.status}</span>
          {data.viewer_role&&data.viewer_role!=='viewer'&&<button onClick={()=>run(async()=>{await api('/workspaces/'+w.id+'/issues/'+x.id,{method:'PATCH',body:JSON.stringify({status:x.status==='open'?'closed':'open'})});await reload();})}>{x.status==='open'?'Close':'Reopen'}</button>}
        </div></article>)}</div></div>}
    {tab==='discussion'&&<div className="project-feature minimal-feature">
      {!openDiscussion?<><div className="discussion-create"><h3>Start a discussion</h3><input value={discussionTitle} onChange={e=>setDiscussionTitle(e.target.value)} placeholder="Topic title"/><textarea value={discussionBody} onChange={e=>setDiscussionBody(e.target.value)} placeholder="What do you want to discuss?"/><button className="primary" onClick={createDiscussion} disabled={busy||!discussionTitle.trim()||!discussionBody.trim()}><Plus size={14}/>Create topic</button></div><div className="discussion-board">
        {!discussions.length?<div className="empty">No topics yet. Start the first discussion.</div>:discussions.map((x:any)=><button className="discussion-topic" key={x.id} onClick={()=>openDiscussionTopic(x)}><div><b>{x.title}</b><p>{x.body}</p><small>@{x.author_username} · {localTime(x.last_activity_at||x.created_at)}</small></div><span><b>{x.reply_count||0}</b><small>replies</small></span></button>)}
      </div></>:<div className="discussion-thread"><button className="back-link" onClick={()=>setOpenDiscussion(null)}>← All discussions</button><h3>{openDiscussion.title}</h3><article className="discussion-op"><b>@{openDiscussion.author_username}</b><p>{openDiscussion.body}</p><small>{localTime(openDiscussion.created_at)}</small></article><div className="discussion-replies">{!discussionReplies.length?<div className="empty">No replies yet.</div>:discussionReplies.map((r:any)=><article key={r.id}><b>@{r.author_username}</b><p>{r.body}</p><small>{localTime(r.created_at)}</small></article>)}</div><div className="discussion-reply"><textarea value={discussionReply} onChange={e=>setDiscussionReply(e.target.value)} placeholder="Reply to this topic…"/><button className="primary" onClick={replyDiscussion} disabled={busy||!discussionReply.trim()}><Send size={14}/>Reply</button></div></div>}
    </div>}
    {tab==='access'&&<div className="project-feature minimal-feature"><div className="feature-form"><h3>Who can access this project</h3><select value={accessRole} onChange={e=>setAccessRole(e.target.value)}><option value="viewer">Viewer · read</option><option value="contributor">Editor · read/write</option></select><div className="collab-add"><input value={accessUser} onChange={e=>setAccessUser(e.target.value)} placeholder="Username"/><button className="primary" onClick={addAccess} disabled={accessBusy||!accessUser.trim()}><UserPlus size={14}/>Give access</button></div></div><div className="people-list"><div className="person-row"><a href={'/profile/'+w.owner_username} className="avatar-link"><Avatar user={{username:w.owner_username}}/></a><div><a href={'/profile/'+w.owner_username}><b>{w.owner_username}</b></a><small>Owner · full access</small></div><Crown size={14}/></div>{(data.collaborators||[]).map((x:any)=><div className="person-row" key={x.id}>
          <Avatar user={{username:x.username}}/>
          <div><b>@{x.username}</b><small>{x.role==='contributor'?'Editor · read/write':'Viewer · read'}{x.zorta_user_id?' · '+x.zorta_user_id:''}</small></div>
          {data.viewer_role==='owner'&&<div className="access-actions">
            <select value={x.role} onChange={e=>run(async()=>{await api('/workspaces/'+w.id+'/collaborators/'+x.id,{method:'PATCH',body:JSON.stringify({role:e.target.value})});await reload();})}>
              <option value="viewer">Read</option>
              <option value="contributor">Write</option>
            </select>
            <button className="danger-outline" onClick={()=>run(async()=>{if(confirm('Remove access for @'+x.username+'?')){await api('/workspaces/'+w.id+'/collaborators/'+x.id,{method:'DELETE'});await reload();}})}>Remove</button>
          </div>}
        </div>)}</div></div>}
    <div className="project-settings-row"><span><b>Visibility</b> · {w.visibility==='private'?'Only people with access can open this project.':'Anyone can view this project.'}</span>{data.viewer_role==='owner'&&<select value={w.visibility} onChange={e=>setVisibility(e.target.value)}><option value="public">Public</option><option value="private">Private</option></select>}</div>
  </div>;
}

function StartupDetail({d}:any){
  const s=d.startup;
  const isOwner=s.owner_id===d?.viewer_id;
  const [role,setRole]=useState('');
  const [msg,setMsg]=useState('');
  const [comment,setComment]=useState('');
  const [comments,setComments]=useState<any[]>(d.comments||[]);
  const [applications,setApplications]=useState<any[]>(d.applications||[]);
  const [applying,setApplying]=useState(false);
  const [applied,setApplied]=useState(false);
  const [commenting,setCommenting]=useState(false);
  const apply=async()=>{
    if(isOwner||applied)return;
    if(!role||!msg.trim())return alert('Choose a role and add a short application message.');
    setApplying(true);
    try{
      await api('/startups/'+s.id+'/applications',{method:'POST',body:JSON.stringify({role,message:msg})});
      setApplied(true);setMsg('');
    }catch(e:any){alert(e.message);}
    finally{setApplying(false);}
  };
  const addComment=async()=>{
    if(!comment.trim()||commenting)return;
    setCommenting(true);
    try{
      const x=await api('/startups/'+s.id+'/comments',{method:'POST',body:JSON.stringify({body:comment.trim()})});
      setComments(prev=>[...prev,x.comment]);setComment('');
    }catch(e:any){alert(e.message);}
    finally{setCommenting(false);}
  };
  const decide=async(aid:string,status:string)=>{
    try{
      await api('/startup-applications/'+aid+'/decision',{method:'POST',body:JSON.stringify({status})});
      setApplications(prev=>prev.map(a=>a.id===aid?{...a,status}:a));
    }catch(e:any){alert(e.message);}
  };
  return <div className="detail-grid">
    <section>
      <div className="detail-block"><span>STAGE</span><b>{s.stage||'Idea'}</b></div>
      <div className="detail-block"><span>FOUNDER</span><a className="detail-person" href={'/profile/'+s.owner_username}>@{s.owner_username}</a></div>
      <div className="detail-block"><span>DESCRIPTION</span><p>{s.description||s.tagline||'No description added yet.'}</p></div>
      <div className="detail-block"><span>PROBLEM</span><p>{s.problem||'A problem worth solving.'}</p></div>
      <div className="detail-block"><span>SOLUTION</span><p>{s.solution||s.description||'The team has not added a solution yet.'}</p></div>
      {!!(s.tech_stack||[]).length&&<div className="detail-block"><span>TECH STACK</span><div className="tags">{s.tech_stack.map((x:string)=><span key={x}>{x}</span>)}</div></div>}
      {!!(s.roles_needed||[]).length&&<div className="detail-block"><span>LOOKING FOR</span><div className="tags">{s.roles_needed.map((x:string)=><span key={x}>{x}</span>)}</div></div>}

      <div className="startup-discussion detail-block">
        <div className="detail-section-head"><span>DISCUSSION</span><small>{comments.length} comment{comments.length===1?'':'s'}</small></div>
        <div className="comment-compose"><textarea maxLength={1500} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Ask a question or share a useful thought…"/><button className="primary" disabled={commenting||!comment.trim()} onClick={addComment}>{commenting?'Posting…':'Comment'}</button></div>
        <div className="comments-list">
          {comments.map(c=><article className="comment-card" key={c.id}><a href={'/profile/'+c.author_username}><b>@{c.author_username}</b></a><p>{c.body}</p><small>{localTime(c.created_at)}</small></article>)}
          {!comments.length&&<div className="empty">No discussion yet. Start it.</div>}
        </div>
      </div>

      {isOwner&&<div className="startup-applications detail-block">
        <div className="detail-section-head"><span>TEAM APPLICATIONS</span><small>{applications.filter(a=>a.status==='pending').length} pending</small></div>
        {!applications.length&&<div className="empty">No applications yet.</div>}
        {applications.map(a=><div className="application-card" key={a.id}><div><a href={'/profile/'+a.applicant_username}><b>@{a.applicant_username}</b></a><small>{a.role} · {a.status}</small></div><p>{a.message}</p>{a.status==='pending'&&<div className="proposal-actions"><button className="primary" onClick={()=>decide(a.id,'accepted')}>Accept</button><button onClick={()=>decide(a.id,'rejected')}>Decline</button></div>}</div>)}
      </div>}
    </section>

    {!isOwner&&<aside className="apply-card">
      <span className="overline">OPPORTUNITY</span>
      <h3>Join the team</h3>
      {applied?<div className="apply-success"><CheckCircle2 size={18}/><div><b>Application sent.</b><p>The founder can review your application from the startup page.</p></div></div>:
      <>
        {(s.roles_needed||[]).length?<select value={role} onChange={e=>setRole(e.target.value)}><option value="">Select a role</option>{s.roles_needed.map((r:string)=><option key={r}>{r}</option>)}</select>:<p>No roles listed yet.</p>}
        <textarea maxLength={1500} value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Tell the founder why you’re a fit…"/>
        <button className="primary" disabled={applying||!role||!msg.trim()} onClick={apply}>{applying?'Sending…':'Apply'}</button>
      </>}
    </aside>}
  </div>;
}


function GigDetail({d,user}:any){
  const g=d.gig;
  const service=g.listing_type==='service';
  const isOwner=!!user && (service ? g.freelancer_id===user.id : g.client_id===user.id);
  const [offer,setOffer]=useState(g.price||g.budget||'');
  const [msg,setMsg]=useState('');
  const [sending,setSending]=useState(false);
  const [proposalError,setProposalError]=useState('');
  const [milestones,setMilestones]=useState<any[]>([{title:'Complete project',amount:Number(g.price||g.budget||0),due_date:g.deadline||''}]);
  const [proposals,setProposals]=useState<any[]>(d.proposals||[]);

  useEffect(()=>{
    if(!isOwner || service)return;
    api('/gigs/'+g.id+'/proposals').then(x=>setProposals(x.proposals||[])).catch(()=>{});
  },[isOwner,g.id,service]);

  const send=async()=>{
    if(sending||!offer||!msg.trim())return;
    setSending(true);setProposalError('');
    try{
      const x=await api('/gigs/'+g.id+'/proposals',{method:'POST',body:JSON.stringify({offer:Number(offer),message:msg.trim(),milestones})});
      setProposals(prev=>[x.proposal,...prev]);setMsg('');alert('Proposal sent.');
    }catch(e:any){setProposalError(e?.message||'Could not send proposal.');}
    finally{setSending(false);}
  };

  const hire=async()=>{
    if(sending||!offer)return;
    setSending(true);setProposalError('');
    try{
      const x=await api('/gigs/'+g.id+'/hire',{method:'POST',body:JSON.stringify({amount:Number(offer),milestones})});
      alert('Service hired. Your credits are now escrowed and the freelancer can start work.');
      navigate('/freelance/orders');
      return x;
    }catch(e:any){setProposalError(e?.message||'Could not hire this freelancer.');}
    finally{setSending(false);}
  };

  const decide=async(pid:string,status:string)=>{
    try{
      await api('/proposals/'+pid+'/decision',{method:'POST',body:JSON.stringify({status})});
      setProposals(prev=>prev.map(p=>p.id===pid?{...p,status}:p));
    }catch(e:any){alert(e.message||'Could not update proposal.');}
  };

  return <div className="detail-grid">
    <section>
      <div className="market-detail-kicker"><span>{service?'FREELANCER SERVICE':'CLIENT JOB REQUEST'}</span><span className={'status-pill '+g.status}>{String(g.status||'open').replace('_',' ')}</span></div>
      <h2 className="market-detail-title">{g.title}</h2>
      <div className="detail-block"><span>{service?'SERVICE BY':'POSTED BY'}</span><div className="market-poster market-detail-poster"><Avatar user={d.poster||{username:service?g.freelancer_username:g.client_username}} size="md"/><div><b>{d.poster?.display_name|| (service?g.freelancer_username:g.client_username)}</b><small>@{d.poster?.username|| (service?g.freelancer_username:g.client_username)} · {d.poster?.reputation||0} reputation</small></div></div>{d.poster_history&&<small className="market-client-history">{service?`${d.poster_history.completed_orders||0} completed orders`:`${d.poster_history.gigs_posted||0} job requests · ${d.poster_history.completed_orders||0} completed orders`}</small>}</div>
      <div className="detail-block"><span>{service?'WHAT YOU GET':'THE BRIEF'}</span><p>{g.description}</p></div>
      <div className="gig-meta-grid"><div><span>{service?'PRICE':'BUDGET'}</span><b>{Number(g.price||g.budget||0).toLocaleString('en-IN')} credits</b></div><div><span>STATUS</span><b className="status-text">{String(g.status||'open').replace('_',' ')}</b></div>{g.deadline&&<div><span>DEADLINE</span><b>{new Date(g.deadline).toLocaleDateString()}</b></div>}</div>
      {(g.requirements||'').trim()&&<div className="detail-block"><span>{service?'SCOPE & DELIVERABLES':'REQUIREMENTS'}</span><p>{g.requirements}</p></div>}
      <div className="tags">{(g.skills||[]).map((x:string)=><span key={x}>{x}</span>)}</div>

      {!service&&isOwner&&<div className="proposals-list"><h3>Proposals ({proposals.length})</h3>{!proposals.length?<div className="empty">No proposals yet. Share the job request to attract freelancers.</div>:proposals.map(p=><div className="proposal-card" key={p.id}><div className="proposal-top"><b>@{p.freelancer_username}</b><span>{Number(p.offer||0).toLocaleString('en-IN')} credits</span></div><p>{p.message}</p><small>{p.freelancer_reputation??0} reputation · {p.completed_orders??0} completed orders · {p.seen?'Seen':'New'}</small>{p.status==='pending'||p.status==='seen'?<div className="proposal-actions"><button className="primary" onClick={()=>decide(p.id,'accepted')}>Accept & fund</button><button onClick={()=>decide(p.id,'rejected')}>Decline</button></div>:<span className={'status-pill '+p.status}>{p.status}</span>}</div>)}</div>}
    </section>

    {!isOwner&&<aside className="apply-card market-action-card">
      <span className="overline">{service?'DIRECT HIRE':'PROPOSAL'}</span>
      <h3>{service?'Hire this freelancer':'Send a proposal'}</h3>
      <p>{service?'Choose the agreed Zorta-credit amount. Funding is held in escrow and released milestone by milestone.':'Make your offer, explain your approach, and break the work into clear milestones.'}</p>
      <label>{service?'Agreed price':'Your offer'}<input type="number" min="1" step="1" value={offer} onChange={e=>{const value=e.target.value;setOffer(value);if(milestones.length===1)setMilestones([{...milestones[0],amount:Number(value||0)}]);}} /></label>
      <div className="milestone-editor"><div className="detail-section-head"><span>MILESTONES</span><button type="button" onClick={()=>setMilestones(v=>[...v,{title:'Milestone',amount:0,due_date:g.deadline||''}])}>+ Add</button></div>{milestones.map((m,i)=><div className="milestone-edit-row" key={i}><input value={m.title} onChange={e=>setMilestones(v=>v.map((x,j)=>j===i?{...x,title:e.target.value}:x))} placeholder="Milestone title"/><input type="number" min="1" value={m.amount} onChange={e=>setMilestones(v=>v.map((x,j)=>j===i?{...x,amount:Number(e.target.value)}:x))}/>{milestones.length>1&&<button type="button" onClick={()=>setMilestones(v=>v.filter((_,j)=>j!==i))}>×</button>}</div>)}</div>
      {!service&&<textarea maxLength={1500} value={msg} onChange={e=>setMsg(e.target.value)} placeholder="How would you approach this job?"/>}
      {proposalError&&<div className="error">{proposalError}</div>}
      <button className="primary wide" disabled={sending||!offer||g.status!=='open'||(!service&&!msg.trim())} onClick={service?hire:send}>{sending?(service?'Hiring…':'Sending…'):g.status==='open'?(service?'Hire & fund':'Send proposal'):'Unavailable'}</button>
      <small className="market-credit-note">Zorta Marketplace uses Zorta credits. This does not represent a live bank/card payment.</small>
    </aside>}
  </div>;
}


function Orders({
  user
}:any){

  const [orders,setOrders]=
    useState<any[]>([]);

  const [busy,setBusy]=
    useState('');

  const [reviewing,setReviewing]=
    useState<any>(null);

  const [rating,setRating]=
    useState(5);

  const [reviewBody,setReviewBody]=
    useState('');

  const [disputing,setDisputing]=
    useState<any>(null);

  const [disputeReason,setDisputeReason]=
    useState('');
  const [statusFilter,setStatusFilter]=useState('all');
  const [loadError,setLoadError]=useState('');
  const [balance,setBalance]=useState(0);

  const load=async()=>{
    setLoadError('');
    try{
      const [x,d]=await Promise.all([api('/orders'),api('/marketplace/dashboard')]);
      setOrders(x.orders||[]);setBalance(Number(d.balance||0));
    }catch(e:any){setLoadError(e?.message||'Could not load orders.');}
  };

  useEffect(()=>{
    load();
  },[]);

  const milestoneAction=async(o:any,m:any,action:string)=>{
    let payload:any=undefined;
    if(action==='submit'){
      const note=window.prompt('Add a short delivery note (optional):','');
      if(note===null)return;
      const url=window.prompt('Delivery link (optional):','');
      if(url===null)return;
      payload=JSON.stringify({submission_note:note.trim().slice(0,3000),delivery_url:url.trim().slice(0,1000)});
    }
    setBusy(o.id+':'+m.id);
    try{
      await api('/orders/'+o.id+'/milestones/'+m.id+'/'+action,{method:'POST',...(payload?{body:payload}:{})});
      await load();
    }catch(e:any){alert(e.message);}finally{setBusy('');}
  };

  const setStatus=async(
    o:any,
    status:string
  )=>{

    setBusy(o.id);

    try{

      await api(
        '/orders/'+
        o.id+
        '/status',
        {
          method:'POST',
          body:JSON.stringify({
            status
          })
        }
      );

      await load();

    }catch(e:any){

      alert(e.message);

    }finally{

      setBusy('');

    }
  };

  const submitDispute=async()=>{

    if(!disputing)return;

    setBusy(disputing.id);

    try{

      await api(
        '/orders/'+
        disputing.id+
        '/dispute',
        {
          method:'POST',
          body:JSON.stringify({
            reason:disputeReason
          })
        }
      );

      setDisputing(null);
      setDisputeReason('');

      await load();

    }catch(e:any){

      alert(e.message);

    }finally{

      setBusy('');

    }
  };

  const requestRefund=async(
    o:any
  )=>{

    setBusy(o.id);

    try{

      await api(
        '/orders/'+
        o.id+
        '/refund',
        {method:'POST'}
      );

      await load();

    }catch(e:any){

      alert(e.message);

    }finally{

      setBusy('');

    }
  };

  const submitReview=async()=>{

    if(!reviewing)return;

    setBusy(reviewing.id);

    try{

      await api(
        '/orders/'+
        reviewing.id+
        '/review',
        {
          method:'POST',
          body:JSON.stringify({
            rating,
            body:reviewBody
          })
        }
      );

      setReviewing(null);
      setReviewBody('');
      setRating(5);

    }catch(e:any){

      alert(e.message);

    }finally{

      setBusy('');

    }
  };

  return(
    <div className="page">

      <span className="overline">
        FREELANCE
      </span>

      <div className="list-head category-head compact-head">
        <div><span className="overline">FREELANCE</span><h1>Orders</h1><p className="lede">Track milestones, credit releases, reviews, disputes, and delivery.</p></div>
        <a className="secondary" href="/freelance">Browse marketplace</a>
      </div>

      <div className="market-balance-note"><div><span>ZORTA BALANCE</span><b>{balance.toLocaleString('en-IN')} coins</b><small>Redeemable Zorta Coins, not cash. Use your Wallet to redeem eligible items.</small></div><a className="secondary" href="/wallet">View wallet</a></div>
      <div className="order-toolbar">
        <div className="status-filter">{['all','in_progress','submitted','revision','completed','disputed','cancelled'].map(x=><button className={statusFilter===x?'active':''} onClick={()=>setStatusFilter(x)} key={x}>{x.replace('_',' ')}</button>)}</div>
      </div>

      {loadError?<div className="empty error-state"><b>Couldn’t load orders.</b><p>{loadError}</p><button className="primary" onClick={load}>Try again</button></div>:<div className="orders-list">

        {(statusFilter==='all'?orders:orders.filter(o=>o.status===statusFilter)).map(
          o=>{

            const isClient=
              o.client_id===
              user?.id;

            return(
              <div
                className="order-card"
                key={o.id}
              >

                <div className="order-top">

                  <b>{o.title}</b>

                  <span
                    className={
                      'status-pill '+
                      o.status
                    }
                  >
                    {o.status}
                  </span>

                </div>

                <div className="order-meta">

                  <span>
                    {Number(o.amount||0).toLocaleString('en-IN')} credits
                  </span>

                  <span>
                    {isClient
                      ?'You are hiring'
                      :'You are working'}
                  </span>

                </div>

                {o.status===
                 'disputed'&&
                 o.dispute_reason&&(
                  <p className="dispute-note">
                    Dispute:
                    {' '}
                    {o.dispute_reason}
                  </p>
                )}

                <div className="order-milestones"><div className="detail-section-head"><span>MILESTONES</span><small>{(o.milestones||[]).filter((m:any)=>m.status==='paid').length}/{(o.milestones||[]).length} released</small></div>{(o.milestones||[]).map((m:any)=><div className="order-milestone" key={m.id}><div className={'milestone-dot '+m.status}></div><div className="milestone-copy"><b>{m.title}</b><small>{Number(m.amount||0).toLocaleString('en-IN')} credits · {m.status}</small></div><div className="milestone-actions">{!isClient&&['pending','revision'].includes(m.status)&&<button disabled={busy===o.id+':'+m.id} onClick={()=>milestoneAction(o,m,'submit')}>{busy===o.id+':'+m.id?'Submitting…':'Submit work'}</button>}{isClient&&m.status==='submitted'&&<><button className="primary" disabled={busy===o.id+':'+m.id} onClick={()=>milestoneAction(o,m,'approve')}>Approve + release</button><button disabled={busy===o.id+':'+m.id} onClick={()=>milestoneAction(o,m,'revision')}>Request revision</button></>}</div></div>)}</div>
                <div className="order-actions">

                  {!isClient&&
                   o.status===
                   'in_progress'&&(
                    <button
                      disabled={
                        busy===o.id
                      }
                      onClick={()=>
                        setStatus(
                          o,
                          'submitted'
                        )
                      }
                    >
                      Submit work
                    </button>
                  )}

                  {isClient&&
                   o.status===
                   'submitted'&&(
                    <>
                      <button
                        className="primary"
                        disabled={
                          busy===o.id
                        }
                        onClick={()=>
                          setStatus(
                            o,
                            'completed'
                          )
                        }
                      >
                        Accept
                      </button>

                      <button
                        disabled={
                          busy===o.id
                        }
                        onClick={()=>
                          setStatus(
                            o,
                            'revision'
                          )
                        }
                      >
                        Request revision
                      </button>
                    </>
                  )}

                  {!isClient&&
                   o.status===
                   'revision'&&(
                    <button
                      disabled={
                        busy===o.id
                      }
                      onClick={()=>
                        setStatus(
                          o,
                          'submitted'
                        )
                      }
                    >
                      Resubmit
                    </button>
                  )}

                  {isClient&&
                   o.status===
                   'completed'&&(
                    <button
                      onClick={()=>
                        setReviewing(o)
                      }
                    >
                      Leave review
                    </button>
                  )}

                  {[
                    'in_progress',
                    'submitted',
                    'revision'
                  ].includes(
                    o.status
                  )&&(
                    <button
                      className="danger"
                      onClick={()=>
                        setDisputing(o)
                      }
                    >
                      Dispute
                    </button>
                  )}

                  {(o.client_username||o.freelancer_username)&&<button onClick={()=>{const other=o.client_id===user?.id?o.freelancer_username:o.client_username;if(other)navigate('/messages?with='+encodeURIComponent(other));}}><MessageSquare size={13}/> Message</button>}

                  {isClient&&
                   o.status===
                   'disputed'&&(
                    <button
                      className="danger"
                      disabled={
                        busy===o.id
                      }
                      onClick={()=>
                        requestRefund(o)
                      }
                    >
                      Refund
                    </button>
                  )}

                </div>

                {disputing?.id===
                 o.id&&(
                  <div className="dispute-form">

                    <textarea
                      value={
                        disputeReason
                      }
                      onChange={e=>
                        setDisputeReason(
                          e.target.value
                        )
                      }
                      placeholder="What went wrong?"
                    />

                    <div>

                      <button
                        className="primary"
                        onClick={
                          submitDispute
                        }
                      >
                        Submit dispute
                      </button>

                      <button
                        onClick={()=>
                          setDisputing(
                            null
                          )
                        }
                      >
                        Cancel
                      </button>

                    </div>

                  </div>
                )}

                {reviewing?.id===
                 o.id&&(
                  <div className="review-form">

                    <div className="star-picker">

                      {[1,2,3,4,5].map(
                        n=>
                          <button
                            key={n}
                            className={
                              n<=rating
                                ?'sel'
                                :''
                            }
                            onClick={()=>
                              setRating(n)
                            }
                          >
                            <Star
                              size={15}
                            />
                          </button>
                      )}

                    </div>

                    <textarea
                      value={
                        reviewBody
                      }
                      onChange={e=>
                        setReviewBody(
                          e.target.value
                        )
                      }
                      placeholder="How did it go?"
                    />

                    <div>

                      <button
                        className="primary"
                        onClick={
                          submitReview
                        }
                      >
                        Submit review
                      </button>

                      <button
                        onClick={()=>
                          setReviewing(
                            null
                          )
                        }
                      >
                        Cancel
                      </button>

                    </div>

                  </div>
                )}

              </div>
            );
          }
        )}

        {!((statusFilter==='all'?orders:orders.filter(o=>o.status===statusFilter)).length)&&(
          <div className="empty">
            {orders.length?'No orders in this view.':'No orders yet.'}
          </div>
        )}

      </div>}

    </div>
  );
}


/* =========================
   PROFILE
========================= */

function Profile({
  username,
  viewer
}:{
  username:string;
  viewer?:User|null;
}){

  const [d,setD]=useState<any>();
  const [err,setErr]=useState('');
  const [following,setFollowing]=useState(false);
  const [blocked,setBlocked]=useState(false);
  const [followBusy,setFollowBusy]=useState(false);
  const [followModal,setFollowModal]=useState<'followers'|'following'|null>(null);
  const [followList,setFollowList]=useState<any[]>([]);
  const [followListLoading,setFollowListLoading]=useState(false);
  const [followListBusy,setFollowListBusy]=useState<string|null>(null);
  const [tab,setTab]=useState<'about'|'activity'|'projects'|'freelance'|'startups'|'posts'|'achievements'>('about');
  const [editing,setEditing]=useState(false);
  const [editD,setEditD]=useState<any>(null);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);

  const load=()=>{
    setErr('');
    Promise.all([
      api('/profiles/'+username+'?compact=1'),
      viewer ? api('/users/'+username+'/follow').catch(()=>({following:false})) : Promise.resolve({following:false}),
      viewer ? api('/users/'+username+'/block').catch(()=>({blocked:false})) : Promise.resolve({blocked:false})
    ])
      .then(async([a,b,c])=>{
        setD(a);
        setFollowing(!!b.following);
        setBlocked(!!c.blocked);
        try{
          const details=await api('/profiles/'+username);
          setD((cur:any)=>({...cur,...details,user:details.user||cur.user}));
        }catch(e:any){setErr(e.message||'Could not load the rest of this profile.');}
      })
      .catch(e=>setErr(e.message||'Could not load this profile.'));
  };

  useEffect(()=>{
    setD(undefined);
    load();
    setTab('about');
    setEditing(false);
  },[username]);

  if(err){
    return(
      <div className="page">
        <div className="empty profile-empty">
          <CircleAlert size={26}/>
          <b>Couldn't load this profile.</b>
          <span>{err}</span>
          <button className="secondary" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }

  if(!d){
    return(
      <div className="page">
        <div className="profile-skeleton">
          <div className="skeleton" style={{height:150,borderRadius:12}}/>
          <div className="profile-skeleton-main">
            <div className="skeleton" style={{width:96,height:96,borderRadius:'50%'}}/>
            <div style={{flex:1,display:'grid',gap:8}}>
              <div className="skeleton" style={{height:22,width:220}}/>
              <div className="skeleton" style={{height:14,width:340}}/>
            </div>
          </div>
          <div className="skeleton" style={{height:80,borderRadius:11,marginTop:26}}/>
        </div>
      </div>
    );
  }

  const u=d.user;
  const isSelf=!!d.is_self;
  const stats=d.stats||{};
  const links:Record<string,string>=u.links||{};

  const follow=async()=>{
    if(followBusy)return;
    setFollowBusy(true);
    try{
      const x=await api('/users/'+username+'/follow',{method:'POST'});
      setFollowing(x.following);
      setD({...d,stats:{...stats,followers:(stats.followers||0)+(x.following?1:-1)}});
    }catch(e:any){
      alert(e.message||'Could not update follow status.');
    }finally{
      setFollowBusy(false);
    }
  };

  const openFollowList=async(kind:'followers'|'following')=>{
    setFollowModal(kind);
    setFollowList([]);
    setFollowListLoading(true);
    try{
      const x=await api('/users/'+username+'/'+kind);
      setFollowList(x.users||[]);
    }catch(e:any){
      alert(e.message||'Could not load this list.');
      setFollowModal(null);
    }finally{
      setFollowListLoading(false);
    }
  };

  const toggleFollowInList=async(target:any)=>{
    if(followListBusy)return;
    setFollowListBusy(target.username);
    try{
      const x=await api('/users/'+target.username+'/follow',{method:'POST'});
      setFollowList(prev=>prev.map(u=>u.username===target.username?{...u,viewer_following:x.following}:u));
      if(target.username.toLowerCase()===username.toLowerCase()){
        setFollowing(x.following);
        setD((cur:any)=>({...cur,stats:{...cur.stats,followers:(cur.stats.followers||0)+(x.following?1:-1)}}));
      }
    }catch(e:any){
      alert(e.message||'Could not update follow status.');
    }finally{
      setFollowListBusy(null);
    }
  };

  const startEdit=()=>{
    setEditD({
      display_name:u.display_name||'',
      bio:u.bio||'',
      avatar:u.avatar||'',
      cover:u.cover||'',
      show_follow_counts:u.show_follow_counts!==false,
      skills:(u.skills||[]).join(', '),
      interests:(u.interests||[]).join(', '),
      links:{
        github:links.github||'',
        website:links.website||'',
        twitter:links.twitter||'',
        linkedin:links.linkedin||'',
        discord:links.discord||''
      }
    });
    setEditing(true);
  };

  const uploadMedia=async(kind:string,file:File)=>{
    const fd=new FormData();fd.append('file',file);fd.append('kind',kind);
    const x=await api('/profiles/me/media',{method:'POST',body:fd});
    setD({...d,user:{...d.user,...x.user}});
    setEditD({...editD,[kind]:x.url});
  };

  const saveEdit=async()=>{
    setSaving(true);
    try{
      const cleanLinks=Object.fromEntries(
        Object.entries(editD.links).filter(([,v])=>String(v||'').trim())
      );
      const x=await api('/profiles/me',{
        method:'PATCH',
        body:JSON.stringify({
          display_name:editD.display_name,
          bio:editD.bio,
          avatar:editD.avatar,
          cover:editD.cover,
          skills:editD.skills.split(',').map((s:string)=>s.trim()).filter(Boolean),
          interests:editD.interests.split(',').map((s:string)=>s.trim()).filter(Boolean),
          links:cleanLinks,
          show_follow_counts:editD.show_follow_counts!==false
        })
      });
      setD({...d,user:{...u,...x.user}});
      setSaved(true);
      setTimeout(()=>setSaved(false),1800);
      setEditing(false);
    }finally{
      setSaving(false);
    }
  };

  const timelineItems=[
    ...(d.activity||[]).map((x:any)=>({
      kind:x.kind==='post'?'Post':x.kind==='comment'?'Comment':x.kind==='upvote_received'?'Upvote':x.kind==='workspace'?'Workspace':x.kind==='commit'?'Commit':x.kind==='freelance_completed'?'Freelance':x.kind==='review_positive'?'Review':x.kind,
      title:x.reason||x.kind,
      when:x.created_at,
      icon:x.kind==='commit'?GitCommit:x.kind==='workspace'?FolderGit2:x.kind==='freelance_completed'?Briefcase:x.kind==='review_positive'?ThumbsUp:MessageSquare
    })),
    ...(d.workspaces||[]).map((x:any)=>({kind:'Workspace',title:x.name,when:x.created_at,icon:FolderGit2})),
    ...(d.posts||[]).map((x:any)=>({kind:'Post',title:x.title||x.body,when:x.created_at,icon:MessageSquare})),
    ...(d.startups||[]).map((x:any)=>({kind:'Startup',title:x.name,when:x.created_at,icon:Rocket}))
  ].sort((a,b)=>b.when.localeCompare(a.when)).slice(0,25);

  const featured=(d.workspaces||[])[0]||(d.posts||[])[0];
  const featuredKind=(d.workspaces||[])[0]?'workspace':'post';

  const linkMeta:Record<string,{icon:any;label:string}>={
    github:{icon:Github,label:'GitHub'},
    website:{icon:Globe,label:'Website'},
    twitter:{icon:Twitter,label:'Twitter'},
    linkedin:{icon:Linkedin,label:'LinkedIn'},
    discord:{icon:MessageSquare,label:'Discord'}
  };

  const tabs:[string,string][]=[
    ['about','About'],
    ['activity','Activity'],
    ['projects','Projects ('+(d.workspaces?.length||0)+')'],
    ['freelance','Freelance ('+(stats.gigs_completed||0)+')'],
    ['startups','Startups ('+(d.startups?.length||0)+')'],
    ['posts','Posts ('+(d.posts?.length||0)+')'],
    ['achievements','Achievements']
  ];

  return(
    <div className="page profile-page">

      <div
        className="profile-cover"
        style={u.cover ? {backgroundImage:`url(${u.cover.startsWith('/api/') ? API.replace('/api','') + u.cover : u.cover})`,backgroundSize:'cover',backgroundPosition:'center'} : undefined}
      >
        {u.platform_role&&u.platform_role!=='user'&&
          <span className="role-flag">
            <Shield size={12}/> {u.platform_role}
          </span>
        }
      </div>

      <div className="profile-main">

        <div className="profile-avatar-wrap">
          <Avatar user={u} size="lg"/>
        </div>

        <div className="profile-info">

          <span className="overline">@{u.username}</span>
          <small className="profile-zid">Zorta ID · {u.user_id||u.id}</small>

          <h1>{u.display_name}</h1>

          {u.bio && <p className="profile-bio">{u.bio}</p>}

          <div className="tags">
            {(u.skills||[]).map((x:string)=><span key={x}>{x}</span>)}
          </div>

          {(u.interests||[]).length>0 &&
            <div className="tags interests">
              {(u.interests||[]).map((x:string)=><span key={x} className="interest-chip">#{x}</span>)}
            </div>
          }

          {Object.keys(links).length>0 &&
            <div className="profile-links">
              {Object.entries(links).filter(([,v])=>v).map(([k,v])=>{
                const meta=linkMeta[k]||{icon:Link2,label:k};
                const Icon=meta.icon;
                return(
                  <a key={k} href={String(v)} target="_blank" rel="noreferrer" title={meta.label}>
                    <Icon size={14}/> {meta.label}
                  </a>
                );
              })}
            </div>
          }

        </div>

        <div className="profile-buttons">
          {isSelf ? (
            <button className="secondary" onClick={startEdit}>
              <Pencil size={14}/> Edit profile
            </button>
          ) : viewer ? (
            <>
              <button
                onClick={follow}
                disabled={followBusy}
                className={following?'':'primary'}
              >
                {followBusy
                  ? <Loader2 className="spin" size={15}/>
                  : following
                    ? <><Check size={15}/> Following</>
                    : <><UserPlus size={15}/> Follow</>
                }
              </button>
              <button className="secondary" onClick={()=>navigate('/messages?with='+encodeURIComponent(username))} disabled={blocked}>
                <MessageSquare size={14}/> {blocked?'Blocked':'Message'}
              </button>
              <button className="secondary" onClick={async()=>{try{if(blocked){await api('/users/'+username+'/block',{method:'DELETE'});setBlocked(false)}else if(confirm('Block @'+username+'?')){await api('/users/'+username+'/block',{method:'POST'});setBlocked(true);setFollowing(false)}}catch(e:any){alert(e.message)}}}>
                <Ban size={14}/> {blocked?'Unblock':'Block'}
              </button>
            </>
          ) : null}
        </div>

      </div>

      <div className="profile-stats-row">
        <div className="profile-stat">
          <b>{u.reputation||0}</b>
          <small>Reputation</small>
        </div>
        <div className="profile-stat">
          <b>{d.rating?.avg?d.rating.avg.toFixed(1):'—'}{d.rating?.count>0 && <Star size={12} className="rating-star"/>}</b>
          <small>{d.rating?.count||0} review{d.rating?.count===1?'':'s'}</small>
        </div>
        {stats.followers!=null&&<button type="button" className="profile-stat profile-stat-link" onClick={()=>openFollowList('followers')}>
          <b>{stats.followers}</b>
          <small>Followers</small>
        </button>}
        {stats.following!=null&&<button type="button" className="profile-stat profile-stat-link" onClick={()=>openFollowList('following')}>
          <b>{stats.following}</b>
          <small>Following</small>
        </button>}
        <div className="profile-stat">
          <b>{stats.gigs_completed||0}</b>
          <small>Gigs completed</small>
        </div>
        {isSelf &&
          <div className="profile-stat credits">
            <b><Coins size={13}/> {d.credits_balance ?? 0}</b>
            <small>Credits</small>
          </div>
        }
      </div>

      {editing &&
        <div className="edit-profile-card">
          <span className="overline">EDIT PROFILE</span>
          <h3>Update your identity</h3>

          <div className="edit-profile-grid">
            <label>
              Username
              <input value={u.username} disabled />
              <small>You can change your username once every 30 days from Settings.</small>
            </label>
            <label>
              Display name
              <input value={editD.display_name} onChange={e=>setEditD({...editD,display_name:e.target.value})}/>
            </label>
            <label className="age">
              <input type="checkbox" checked={editD.show_follow_counts!==false} onChange={e=>setEditD({...editD,show_follow_counts:e.target.checked})}/>
              Show follower/following counts
            </label>
            <label>
              Avatar
              <input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&uploadMedia('avatar',e.target.files[0])}/>
              {editD.avatar&&<img className="profile-upload-preview" src={editD.avatar.startsWith('/api/')?API.replace(/\/api$/,'')+editD.avatar:editD.avatar} alt="Avatar preview"/>}
            </label>
            <label>
              Banner
              <input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&uploadMedia('cover',e.target.files[0])}/>
            </label>
          </div>

          <label>
            Bio
            <textarea value={editD.bio} onChange={e=>setEditD({...editD,bio:e.target.value})} placeholder="Tell people what you're building…"/>
          </label>

          <div className="edit-profile-grid">
            <label>
              Skills
              <input value={editD.skills} onChange={e=>setEditD({...editD,skills:e.target.value})} placeholder="TypeScript, React, UI"/>
            </label>
            <label>
              Interests
              <input value={editD.interests} onChange={e=>setEditD({...editD,interests:e.target.value})} placeholder="building, open source"/>
            </label>
          </div>

          <span className="overline" style={{marginTop:6}}>LINKS</span>
          <div className="edit-profile-grid links">
            {Object.entries(linkMeta).map(([k,meta])=>
              <label key={k}>
                {meta.label}
                <input
                  value={editD.links[k]}
                  onChange={e=>setEditD({...editD,links:{...editD.links,[k]:e.target.value}})}
                  placeholder={'https://…'}
                />
              </label>
            )}
          </div>

          <div className="edit-profile-actions">
            <button className="primary" onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="spin" size={15}/> : saved ? <><Check size={15}/> Saved</> : 'Save changes'}
            </button>
            <button className="secondary" onClick={()=>setEditing(false)}>Cancel</button>
          </div>
        </div>
      }

      {featured &&
        <div className="featured-section">
          <span className="overline">FEATURED WORK</span>
          <a
            className="featured-card"
            href={featuredKind==='workspace'?'/workspaces/'+featured.id:'/post/'+featured.id}
          >
            <Sparkles size={16}/>
            <div>
              <b>{featured.name||featured.title||featured.body?.slice(0,60)}</b>
              <p>{featured.description||featured.body||'No description yet.'}</p>
            </div>
            <ChevronRight size={16}/>
          </a>
        </div>
      }

      <div className="profile-tabs">
        {tabs.map(([id,label])=>
          <button key={id} className={tab===id?'sel':''} onClick={()=>setTab(id as any)}>
            {label}
          </button>
        )}
      </div>

      <div className="profile-tab-panel">

        {tab==='about' &&
          <div className="profile-about-grid">
            <section className="profile-about-card"><span className="overline">ABOUT</span><h3>{u.display_name}</h3><p>{u.bio||'No bio added yet.'}</p></section>
            <section className="profile-about-card"><span className="overline">SKILLS & INTERESTS</span><div className="tags">{(u.skills||[]).map((x:string)=><span key={'s'+x}>{x}</span>)}{(u.interests||[]).map((x:string)=><span key={'i'+x}>#{x}</span>)}</div></section>
            <section className="profile-about-card"><span className="overline">LINKS</span>{Object.entries(links).filter(([,v])=>v).map(([k,v])=><a key={k} className="profile-about-link" href={String(v)} target="_blank" rel="noreferrer">{linkMeta[k]?.label||k} <ExternalLink size={11}/></a>)}{!Object.values(links).some(Boolean)&&<p>No public links added.</p>}</section>
          </div>
        }

        {tab==='activity' &&
          (timelineItems.length===0
            ? <div className="empty"><MessageSquare size={22}/><b>No activity yet.</b></div>
            : <div className="timeline">{timelineItems.map((x:any,i:number)=>{const Icon=x.icon||MessageSquare;return <div className="timeline-row" key={i}><span><Icon size={11}/> {x.kind}</span><div><b>{x.title}</b><small>{localTime(x.when,{dateStyle:'medium',timeStyle:undefined})}</small></div></div>})}</div>
          )
        }

        {tab==='projects' &&
          ((d.workspaces||[]).length===0
            ? <div className="empty"><FolderGit2 size={22}/><b>No projects yet.</b>{isSelf&&<a className="primary" href="/workspaces/create">Create a workspace</a>}</div>
            : <div className="cards profile-cards">
                {(d.workspaces||[]).map((w:any)=>
                  <a className="data-card" href={'/workspaces/'+w.id} key={w.id}>
                    <div className="card-top"><span>{w.language||'Project'}</span><span>{localTime(w.created_at,{dateStyle:'medium',timeStyle:undefined})}</span></div>
                    <h3>{w.name}</h3>
                    <p>{w.description}</p>
                    <div className="card-bottom"><b><CookieIcon size={12}/> {w.cookies??w.stars??0} cookies</b></div>
                  </a>
                )}
              </div>
          )
        }

        {tab==='freelance' &&
          <div className="profile-freelance">
            {(d.orders||[]).length===0 && (d.reviews||[]).length===0 &&
              <div className="empty"><Briefcase size={22}/><b>No freelance activity yet.</b></div>
            }
            {(d.orders||[]).length>0 &&
              <div className="orders-list">
                {(d.orders||[]).map((o:any)=>
                  <div className="order-card" key={o.id}>
                    <div className="order-top">
                      <b>{o.title}</b>
                      <span className={'status-pill '+o.status}>{o.status}</span>
                    </div>
                    <div className="order-meta"><span>{o.amount} credits</span><span>{localTime(o.created_at,{dateStyle:'medium',timeStyle:undefined})}</span></div>
                  </div>
                )}
              </div>
            }
            {(d.reviews||[]).length>0 &&
              <div className="reviews-list">
                <span className="overline">REVIEWS</span>
                {(d.reviews||[]).map((r:any)=>
                  <div className="review-card" key={r.id}>
                    <div className="review-stars">
                      {Array.from({length:5}).map((_,i)=><Star key={i} size={12} className={i<r.rating?'filled':''}/>)}
                    </div>
                    <p>{r.body||'No comment left.'}</p>
                    <small>{localTime(r.created_at,{dateStyle:'medium',timeStyle:undefined})}</small>
                  </div>
                )}
              </div>
            }
          </div>
        }

        {tab==='startups' &&
          ((d.startups||[]).length===0
            ? <div className="empty"><Rocket size={22}/><b>Not involved with any startups yet.</b></div>
            : <div className="cards profile-cards">
                {(d.startups||[]).map((s:any)=>
                  <a className="data-card" href={'/startups/'+s.id} key={s.id}>
                    <div className="card-top"><span>{s.stage}</span></div>
                    <h3>{s.name}</h3>
                    <p>{s.tagline}</p>
                    <div className="card-bottom"><b>{s.owner_id===u.id?'Founder':'Team'}</b></div>
                  </a>
                )}
              </div>
          )
        }

        {tab==='posts' &&
          ((d.posts||[]).length===0
            ? <div className="empty"><MessageSquare size={22}/><b>No posts yet.</b></div>
            : <div className="profile-posts">
                {(d.posts||[]).map((p:any)=>
                  <a className="result" href={'/post/'+p.id} key={p.id}>
                    <b>{p.title||p.body?.slice(0,80)}</b>
                    <small>{localTime(p.created_at,{dateStyle:'medium',timeStyle:undefined})} · {p.score||0} points</small>
                  </a>
                )}
              </div>
          )
        }

        {tab==='achievements' &&
          <div className="achievement-grid">
            {(d.badges||[]).map((b:any)=>{
              const Icon=({FolderGit2,Sparkles,GitCommit,Star,Trophy,MessageSquare,Briefcase} as any)[b.icon]||Trophy;
              return(
                <div className={'achievement-card'+(b.earned?'':' locked')} key={b.id}>
                  {b.earned ? <Icon size={20}/> : <Lock size={18}/>}
                  <b>{b.name}</b>
                  <p>{b.description}</p>
                </div>
              );
            })}
          </div>
        }

      </div>

      {followModal &&
        <div className="follow-modal" onClick={()=>setFollowModal(null)}>
          <div className="follow-modal-card" onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <b>{followModal==='followers'?'Followers':'Following'}</b>
              <button onClick={()=>setFollowModal(null)}><X size={16}/></button>
            </div>
            <div className="follow-modal-list">
              {followListLoading
                ? <div className="empty"><Loader2 className="spin" size={18}/></div>
                : followList.length===0
                  ? <div className="empty">{followModal==='followers'?'No followers yet.':'Not following anyone yet.'}</div>
                  : followList.map(x=>
                      <div className="follow-modal-row" key={x.id}>
                        <Avatar user={x} size="sm"/>
                        <a className="fm-info" href={'/profile/'+x.username} onClick={()=>setFollowModal(null)}>
                          <b>{x.display_name}</b>
                          <span>@{x.username}</span>
                        </a>
                        {viewer && viewer.username.toLowerCase()!==x.username.toLowerCase() &&
                          <button
                            className={x.viewer_following?'':'primary'}
                            disabled={followListBusy===x.username}
                            onClick={()=>toggleFollowInList(x)}
                          >
                            {followListBusy===x.username ? <Loader2 className="spin" size={13}/> : x.viewer_following ? 'Following' : 'Follow'}
                          </button>
                        }
                      </div>
                    )
              }
            </div>
          </div>
        </div>
      }

    </div>
  );
}


/* =========================
   SEARCH
========================= */

function SearchPage(){

  const [q,setQ]=
    useState('');

  const [r,setR]=
    useState<any>();

  useEffect(()=>{

    const t=
      setTimeout(()=>{

        if(q.trim()){

          Promise.all([
            api('/search?q='+encodeURIComponent(q)),
            api('/workspaces/search?q='+encodeURIComponent(q)).catch(()=>({workspaces:[],files:[]}))
          ]).then(([base,projects])=>{
            setR({
              ...base,
              projects:projects.workspaces||[],
              code:projects.files||[]
            });
          });

        }else{
          Promise.all([
            api('/feed?sort=trending&limit=8').catch(()=>({posts:[]})),
            api('/workspaces?sort=trending').catch(()=>({workspaces:[]})),
            api('/startups?sort=trending').catch(()=>({startups:[]})),
            api('/servers').catch(()=>({servers:[]}))
          ]).then(([posts,projects,startups,communities])=>{
            setR({
              posts:posts.posts||[],
              projects:projects.workspaces||[],
              startups:startups.startups||[],
              communities:communities.servers||[]
            });
          });
        }

      },250);

    return()=>{
      clearTimeout(t);
    };

  },[q]);

  return(
    <div className="page">

      <span className="overline">
        EXPLORE
      </span>

      <h1>
        Find your people.
      </h1>

      <div className="search-large">

        <Search/>

        <input
          autoFocus
          value={q}
          onChange={e=>
            setQ(
              e.target.value
            )
          }
          placeholder="Search communities, projects, people…"
        />

      </div>

      {r&&(
        <div className="results">

          {Object.entries(r).map(
            ([k,v]:any)=>

              <section key={k}>

                <div className="result-head">

                  <b>{k}</b>

                  <span>
                    {v.length}
                  </span>

                </div>

                {v.map(
                  (x:any)=>

                    <a
                      className="result"
                      href={
                        k==='users'
                          ?'/profile/'+x.username
                          :k==='workspaces'||k==='projects'
                            ?'/workspaces/'+x.id
                            :k==='startups'
                              ?'/startups/'+x.id
                              :k==='communities'
                                ?'/servers?server='+x.id
                                :k==='posts'
                                  ?'/post/'+x.id
                                  :k==='code'
                                    ?'/workspaces/'+x.workspace_id
                                    :'#'
                      }
                      key={x.id||x.path}
                    >

                      <b>
                        {
                          x.display_name||
                          x.name||
                          x.title
                        }
                      </b>

                      <small>
                        {
                          x.bio||
                          x.description||
                          x.body||
                          x.path||
                          'Zorta result'
                        }
                      </small>

                    </a>
                )}

              </section>
          )}

        </div>
      )}

    </div>
  );
}


/* =========================
   NOTIFICATIONS
========================= */

function Notifications({user}:{user?:User|null}){
  const [n,setN]=useState<any[]>([]);
  const [tab,setTab]=useState<'all'|'messages'|'applications'|'marketplace'>('all');
  const [username,setUsername]=useState(new URLSearchParams(location.search).get('with')||'');
  const [messages,setMessages]=useState<any[]>([]);
  const [conversations,setConversations]=useState<any[]>([]);
  const [conversationsLoading,setConversationsLoading]=useState(false);
  const [showNew,setShowNew]=useState(false);
  const [newUsername,setNewUsername]=useState('');
  const [dmSearchResults,setDmSearchResults]=useState<any[]>([]);
  const [dmSearchBusy,setDmSearchBusy]=useState(false);
  const [applications,setApplications]=useState<any[]>([]);
  const [body,setBody]=useState('');
  const [busy,setBusy]=useState(false);
  const [marketOrders,setMarketOrders]=useState<any[]>([]);
  const [marketProposals,setMarketProposals]=useState<any[]>([]);

  const load=async()=>{
    const x=await api('/notifications');
    setN(x.notifications||[]);setApplications(x.applications||[]);
  };
  const loadConversations=async()=>{
    setConversationsLoading(true);
    try{
      const x=await api('/direct-messages/conversations');
      setConversations(x.conversations||[]);
    }catch{}
    finally{setConversationsLoading(false);}
  };
  const loadMessages=async()=>{
    if(!username)return;
    const x=await api('/direct-messages?with='+encodeURIComponent(username));
    setMessages(x.messages||[]);
    loadConversations();
  };
  const loadMarketplace=async()=>{
    try{
      const [o,p]=await Promise.all([api('/orders'),api('/proposals')]);
      setMarketOrders(o.orders||[]);setMarketProposals(p.proposals||[]);
    }catch{}
  };
  useEffect(()=>{load();loadConversations();loadMarketplace();},[]);
  useEffect(()=>{loadMessages();},[username]);
  useEffect(()=>{ 
    if(!showNew){setDmSearchResults([]);return;}
    const q=newUsername.trim();
    if(q.length<2){setDmSearchResults([]);return;}
    let cancelled=false;
    const t=setTimeout(async()=>{
      setDmSearchBusy(true);
      try{const x=await api('/users/search?q='+encodeURIComponent(q)+'&limit=8');if(!cancelled)setDmSearchResults(x.users||[]);}
      catch{if(!cancelled)setDmSearchResults([]);}
      finally{if(!cancelled)setDmSearchBusy(false);}
    },180);
    return()=>{cancelled=true;clearTimeout(t);};
  },[showNew,newUsername]);
  useEffect(()=>{
    const requested=new URLSearchParams(location.search).get('tab');
    if(requested==='messages')setTab('messages');
    if(requested==='marketplace')setTab('marketplace');
  },[]);

  const openConversation=(u:string)=>{setShowNew(false);setUsername(u);};

  const startNewConversation=()=>{
    const u=newUsername.trim().replace(/[^A-Za-z0-9]/g,'').slice(0,24);
    if(!u)return;
    setNewUsername('');setShowNew(false);
    openConversation(u);
  };

  const send=async()=>{
    if(!username.trim()||!body.trim()||busy)return;
    setBusy(true);
    try{
      const x=await api('/direct-messages',{method:'POST',body:JSON.stringify({username,body})});
      setMessages(prev=>[...prev,x.message]);setBody('');
      loadConversations();
    }catch(e:any){alert(e.message);}
    finally{setBusy(false);}
  };

  const openNotification=async(x:any)=>{
    if(!x.read) await api('/notifications/'+x.id+'/read',{method:'POST'}).catch(()=>{});
    const r=x.route||{};
    if(r.kind==='dm'&&r.username){navigate('/messages?with='+encodeURIComponent(r.username));return;}
    if(r.kind==='post'&&r.post_id){navigate('/post/'+r.post_id);return;}
    if(r.kind==='profile'&&r.username){navigate('/profile/'+r.username);return;}
    if(r.kind==='startup'&&r.startup_id){navigate('/startups/'+r.startup_id);return;}
    if(r.kind==='gig'&&r.gig_id){navigate('/freelance/'+r.gig_id);return;}
    if(r.kind==='workspace'&&r.workspace_id){navigate('/workspaces/'+r.workspace_id);return;}
    if(r.kind==='workspace_discussion'&&r.workspace_id){navigate('/workspaces/'+r.workspace_id);return;}
    if(r.kind==='server'&&r.server_id){navigate('/servers?server='+r.server_id);return;}
    if(r.kind==='orders'){navigate('/freelance/orders');return;}
    if(r.kind==='rewards'){navigate('/rewards');return;}
    if(r.kind==='notifications'){navigate('/notifications');return;}
    if(x.link) navigate(x.link);
    else await load();
  };

  return <div className="page">
    <div className="list-head">
      <div><span className="overline">INBOX</span><h1>Panel</h1><p className="lede">Notifications, applications, comments and direct messages in one place.</p></div>
      <button onClick={async()=>{await api('/notifications/read-all',{method:'POST'});await load();}}>Mark all read</button>
    </div>

    <div className="admin-tabs notification-tabs">
      {(['all','messages','marketplace','applications'] as const).map(x=><button className={tab===x?'active':''} onClick={()=>setTab(x)} key={x}>{x==='all'?'All':x==='messages'?'Direct messages':x==='marketplace'?'Marketplace':'Startup applications'}</button>)}
    </div>

    {tab==='marketplace'&&<div className="panel-marketplace"><div className="panel-market-grid"><section><div className="section-title"><div><span className="overline">MARKETPLACE</span><h2>Your orders</h2></div><a className="secondary" href="/freelance">Browse</a></div>{marketOrders.length?marketOrders.slice(0,8).map(o=>{const other=o.client_id===user?.id?o.freelancer_username:o.client_username;return <div className="panel-market-row" key={o.id}><div><b>{o.title}</b><small>{o.status.replace('_',' ')} · {Number(o.amount||0).toLocaleString('en-IN')} credits</small></div><div>{other&&<button onClick={()=>navigate('/messages?with='+encodeURIComponent(other))}><MessageSquare size={13}/>Message</button>}<a href="/freelance/orders">Open</a></div></div>}):<div className="empty">No marketplace orders yet.</div>}</section><section><div className="section-title"><div><span className="overline">MARKETPLACE</span><h2>Applications</h2></div></div>{marketProposals.length?marketProposals.slice(0,8).map(p=><div className="panel-market-row" key={p.id}><div><b>{p.gig_title||'Job'}</b><small>{p.status} · {Number(p.offer||0).toLocaleString('en-IN')} credits</small></div><a href={'/freelance/'+p.gig_id}>Open</a></div>):<div className="empty">No applications yet.</div>}</section></div></div>}

    {tab==='all'&&<div className="notifications">
      {n.filter(x=>tab==='all'||x.kind==='startup_application').map(x=>
        <div className={'notification '+(!x.read?'unread':'')} key={x.id} onClick={()=>openNotification(x)}>
          <div className="notif-icon">{x.kind==='startup_application'?<Rocket size={15}/>:<Bell size={15}/>}</div>
          <div><b>{x.title}</b><p>{x.body}</p><small>{localTime(x.created_at)}</small></div>
          {!x.read&&<span className="dot"/>}
        </div>
      )}
      {!n.filter(x=>tab==='all'||x.kind==='startup_application').length&&<div className="empty"><CheckCircle2/> Nothing here yet.</div>}
    </div>}

    {tab==='applications'&&<div className="notifications">
      <div className="section-title"><div><span className="overline">YOUR APPLICATIONS</span><h2>Startup applications</h2></div></div>
      {applications.map(x=><div className="notification" key={'app-'+x.id}><div className="notif-icon"><Rocket size={15}/></div><div><b>{x.role||'Startup application'}</b><p>{x.message}</p><small>{x.status} · {localTime(x.created_at)}</small></div></div>)}
    </div>}

    {tab==='messages'&&<div className="dm-layout with-list">
      <aside className="dm-conversations">
        <div className="dm-new-toggle">
          <button className="secondary wide" onClick={()=>{setShowNew(true);setNewUsername('')}}><Plus size={13}/> New message</button>
        </div>
        {showNew&&<div className="dm-search-popover">
          <div className="dm-search-head"><Search size={15}/><input autoFocus value={newUsername} onChange={e=>setNewUsername(e.target.value.slice(0,40))} placeholder="Search people…" /><button onClick={()=>{setShowNew(false);setNewUsername('')}}><X size={14}/></button></div>
          <div className="dm-search-results">
            {dmSearchBusy&&<div className="dm-search-state">Searching…</div>}
            {!dmSearchBusy&&newUsername.trim().length<2&&<div className="dm-search-state">Type a name or username.</div>}
            {!dmSearchBusy&&newUsername.trim().length>=2&&!dmSearchResults.length&&<div className="dm-search-state">No people found.</div>}
            {dmSearchResults.map(r=><button className="dm-search-result" key={r.id} disabled={!r.messageable} onClick={()=>{openConversation(r.username);setShowNew(false);setNewUsername('')}}><Avatar user={r} size="sm"/><span><b>{r.display_name||r.username}</b><small>@{r.username}{r.messageable?'':' · Follow each other first'}</small></span><MessageSquare size={14}/></button>)}
          </div>
        </div>}
        {conversationsLoading
          ? <div className="empty"><Loader2 className="spin" size={16}/></div>
          : conversations.length===0
            ? <div className="empty">No conversations yet.</div>
            : conversations.map(c=>
                <button
                  key={c.user.username}
                  className={'dm-conversation'+(username.toLowerCase()===c.user.username.toLowerCase()?' sel':'')}
                  onClick={()=>openConversation(c.user.username)}
                >
                  <Avatar user={c.user} size="sm"/>
                  <div className="dm-conv-info">
                    <b>{c.user.display_name}</b>
                    <span>{c.from_me?'You: ':''}{c.last_message}</span>
                  </div>
                  {c.unread>0&&<span className="dot"/>}
                </button>
              )
        }
      </aside>

      <section className="dm-thread">
        {username
          ? <>
              <div className="dm-thread-head">@{username}</div>
              <div className="dm-messages">
                {messages.length===0&&<div className="empty">No messages yet. Say hi!</div>}
                {messages.map(x=><div className={'dm-message'+(x.sender_username===user?.username?' mine':'')} key={x.id}><b>@{x.sender_username}</b><p>{x.body}</p><small>{localTime(x.created_at)}</small></div>)}
              </div>
              <div className="dm-compose"><textarea value={body} onChange={e=>setBody(e.target.value)} placeholder={'Message @'+username}/><button className="primary" disabled={busy||!body.trim()} onClick={send}>Send</button></div>
            </>
          : <div className="empty">Pick a conversation, or start a new one.</div>
        }
      </section>
    </div>}
  </div>;
}

function Communities(){
  const [servers,setServers]=useState<any[]>([]);
  const [showCreate,setShowCreate]=useState(false);
  const [name,setName]=useState('');
  const [description,setDescription]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [cursor,setCursor]=useState<string|null>(null);
  const [hasMore,setHasMore]=useState(false);
  const [loadingMore,setLoadingMore]=useState(false);

  const load=async()=>{
    setLoading(true);
    setError('');
    try{
      const x=await api('/servers');
      setServers(x.servers||[]);
      setCursor(x.next_cursor||null);
      setHasMore(!!x.has_more);
    }catch(e:any){
      setError(e.message||'Could not load communities.');
    }finally{
      setLoading(false);
    }
  };
  useEffect(()=>{load();},[]);

  const loadMore=async()=>{
    if(!cursor||loadingMore)return;
    setLoadingMore(true);
    try{
      const x=await api('/servers?cursor='+encodeURIComponent(cursor));
      setServers(prev=>[...prev,...(x.servers||[])]);
      setCursor(x.next_cursor||null);
      setHasMore(!!x.has_more);
    }catch(e:any){
      alert(e.message);
    }finally{
      setLoadingMore(false);
    }
  };

  const create=async()=>{
    if(!name.trim())return;
    setBusy(true);
    try{
      const x=await api('/servers',{method:'POST',body:JSON.stringify({name,description})});
      setName('');setDescription('');setShowCreate(false);
      setServers(prev=>[x.server,...prev]);
    }catch(e:any){alert(e.message);}
    finally{setBusy(false);}
  };

  const join=async(id:string)=>{
    try{
      const x=await api('/servers/'+id+'/join',{method:'POST'});
      setServers(prev=>prev.map(s=>s.id===id?{...s,...x.server,joined:true}:s));
      navigate('/servers?server='+id);
    }catch(e:any){alert(e.message);}
  };

  return <div className="page">
    <div className="list-head">
      <div>
        <span className="overline">COMMUNITY</span>
        <h1>Find your people.</h1>
        <p className="lede">Small spaces for builders who are actually making things.</p>
      </div>
      <button className="primary create" onClick={()=>setShowCreate(v=>!v)}>
        <Plus size={16}/> New community
      </button>
    </div>

    {showCreate&&<div className="community-create">
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="Community name"/>
      <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="What is this space for?"/>
      <button className="primary" onClick={create} disabled={busy}>{busy?'Creating…':'Create community'}</button>
    </div>}

    {loading&&<div className="empty"><Users size={20}/> Loading communities…</div>}

    {!loading&&error&&<div className="empty">
      <Users size={20}/> {error}
      <div style={{marginTop:12}}>
        <button className="primary" onClick={load}>Try again</button>
      </div>
    </div>}

    {!loading&&!error&&<>
      <div className="community-grid">
        {servers.map(s=><article className="community-card" key={s.id}>
          <div className="community-mark">{(s.name||'C')[0].toUpperCase()}</div>
          <div className="community-copy">
            <span className="overline">COMMUNITY</span>
            <h3>{s.name}</h3>
            <p>{s.description||'A focused space for builders.'}</p>
            <small>{s.member_count??(s.members||[]).length} members</small>
          </div>
          <div className="community-actions">
            {s.joined
              ?<button onClick={()=>navigate('/servers?server='+s.id)}>Open server</button>
              :<button onClick={()=>join(s.id)}>Join</button>}
          </div>
        </article>)}
      </div>

      {!servers.length&&!showCreate&&<div className="empty"><Users size={20}/> No communities yet. Create the first one.</div>}

      {hasMore&&<div style={{textAlign:'center',marginTop:18}}>
        <button onClick={loadMore} disabled={loadingMore}>
          {loadingMore?'Loading…':'Load more'}
        </button>
      </div>}
    </>}
  </div>;
}


/* =========================
   SERVERS
========================= */

const STREAM_API=(import.meta as any).env?.VITE_API_URL||'http://localhost:5050/api';

function RoleBadge({role}:{role:string}){
  return <span className={'role-badge '+role.toLowerCase()}>{role}</span>;
}

function Servers({user}:{user:User}){
  const currentPath=usePath();
  const [servers,setServers]=useState<any[]>([]);
  const [selected,setSelected]=useState<any>(null);
  const [channels,setChannels]=useState<any[]>([]);
  const [selChannel,setSelChannel]=useState<any>(null);
  const [msgs,setMsgs]=useState<any[]>([]);
  const [channelLoading,setChannelLoading]=useState(false);
  const [members,setMembers]=useState<any[]>([]);
  const [managementMembers,setManagementMembers]=useState<any[]>([]);
  const [audit,setAudit]=useState<any[]>([]);
  const [auditLoading,setAuditLoading]=useState(false);
  const [managementLoading,setManagementLoading]=useState(false);
  const [managementError,setManagementError]=useState('');
  const [memberSearch,setMemberSearch]=useState('');
  const [memberRoleFilter,setMemberRoleFilter]=useState('all');
  const [showMembers,setShowMembers]=useState(true);
  const [showManagement,setShowManagement]=useState(false);
  const [editing,setEditing]=useState<any>(null);
  const [editText,setEditText]=useState('');
  const [memberAction,setMemberAction]=useState<any>(null);
  const [memberActionBusy,setMemberActionBusy]=useState(false);
  const [serverNotice,setServerNotice]=useState<{type:'success'|'error';text:string}|null>(null);
  const [text,setText]=useState('');
  const [newChannel,setNewChannel]=useState('');

  const isOwner=selected?.owner_id===user.id;
  const isStaff=isOwner||(selected?.admins||[]).includes(user.id);
  const isMuted=!!selected?.viewer_muted || !!selected?.viewer_timed_out;

  const loadServers=async()=>{
    setSelected(null);setChannels([]);setSelChannel(null);setMsgs([]);setMembers([]);setManagementMembers([]);
    try{
      const x=await api('/servers?mine=1');
      const list=x.servers||[];setServers(list);
      const wanted=new URLSearchParams(window.location.search).get('server');
      setSelected((prev:any)=>prev||((wanted&&list.find((s:any)=>s.id===wanted))||(!wanted?list[0]:null)));
    }catch(e:any){setServerNotice({type:'error',text:e?.message||'Could not load servers.'});}
  };
  useEffect(()=>{loadServers();},[currentPath]);

  const loadServer=async(id:string)=>{
    try{
      const [serverData,memberData]=await Promise.all([api('/servers/'+id),api('/servers/'+id+'/members')]);
      setSelected(serverData.server);setChannels(serverData.channels||[]);setMembers(memberData.members||[]);
      setSelChannel((prev:any)=>(serverData.channels||[]).find((c:any)=>c.id===prev?.id)||(serverData.channels||[])[0]||null);
    }catch(e:any){setSelected(null);setChannels([]);setMembers([]);setManagementMembers([]);setServerNotice({type:'error',text:e?.message||'Could not load this server.'});}
  };
  useEffect(()=>{if(selected?.id)loadServer(selected.id);},[selected?.id]);

  const loadManagement=async(id:string)=>{
    setManagementLoading(true);setManagementError('');setAuditLoading(true);
    try{
      const params=new URLSearchParams();
      if(memberSearch.trim())params.set('q',memberSearch.trim());
      if(memberRoleFilter!=='all')params.set('role',memberRoleFilter);
      params.set('page','1');params.set('limit','100');
      const [memberData,auditData]=await Promise.all([
        api('/servers/'+id+'/moderation/members?'+params.toString()),
        api('/servers/'+id+'/moderation/audit')
      ]);
      setManagementMembers(memberData.members||[]);setAudit(auditData.audit||[]);
    }catch(e:any){setManagementError(e?.message||'Could not load community management.');setManagementMembers([]);setAudit([]);}
    finally{setManagementLoading(false);setAuditLoading(false);}
  };
  useEffect(()=>{if(showManagement&&selected?.id&&isStaff)loadManagement(selected.id);},[showManagement,selected?.id,isStaff,memberSearch,memberRoleFilter]);

  useEffect(()=>{
    if(!selChannel){setMsgs([]);return;}
    let closed=false;setChannelLoading(true);setMsgs([]);
    api('/channels/'+selChannel.id+'/messages').then(x=>{if(!closed)setMsgs(x.messages||[]);}).catch(()=>setMsgs([])).finally(()=>{if(!closed)setChannelLoading(false);});
    const token=localStorage.getItem('zorta_access')||'';
    const es=new EventSource(STREAM_API+'/channels/'+selChannel.id+'/stream?access_token='+encodeURIComponent(token));
    es.onmessage=e=>{try{const msg=JSON.parse(e.data);setMsgs(prev=>prev.some(x=>x.id===msg.id)?prev.map(x=>x.id===msg.id?msg:x):[...prev,msg]);}catch{}};
    return()=>{closed=true;es.close();};
  },[selChannel?.id]);

  const send=async()=>{
    if(!text.trim()||!selChannel||isMuted)return;
    try{const x=await api('/channels/'+selChannel.id+'/messages',{method:'POST',body:JSON.stringify({body:text})});setMsgs(prev=>prev.some(m=>m.id===x.message.id)?prev:[...prev,x.message]);setText('');}
    catch(e:any){setServerNotice({type:'error',text:e?.message||'Could not send message.'});}
  };

  const refreshAfterMemberAction=async()=>{
    await loadServer(selected.id);
    if(showManagement)await loadManagement(selected.id);
  };

  const runMemberAction=async()=>{
    if(!memberAction||memberActionBusy)return;
    const {action,member}=memberAction;
    setMemberActionBusy(true);
    try{
      const options:any={user_id:member.id};
      if(action==='timeout'||action==='mute'||action==='ban'){
        const minutes=Number(memberAction.minutes||0);
        if(minutes>0)options[action==='timeout'?'minutes':'duration_minutes']=action==='timeout'?Math.max(1,Math.min(10080,minutes)):Math.max(1,Math.min(43200,minutes));
        options.reason=String(memberAction.reason||'').trim().slice(0,500);
      }
      const endpoint=(action==='promote'||action==='demote')?'/servers/'+selected.id+'/members/'+member.id+'/'+action:'/servers/'+selected.id+'/'+action;
      await api(endpoint,{method:'POST',body:JSON.stringify(options)});
      const label:any={promote:'Member is now an admin.',demote:'Admin demoted to member.',kick:'Member kicked.',ban:'Member banned.',timeout:'Member timed out.',mute:'Member muted.',unmute:'Member unmuted.',untimeout:'Timeout removed.'};
      setServerNotice({type:'success',text:label[action]||'Member updated.'});
      setMemberAction(null);
      await refreshAfterMemberAction();
    }catch(e:any){setServerNotice({type:'error',text:e?.message||'Could not update member.'});}
    finally{setMemberActionBusy(false);}
  };

  const addChannel=async(e:any)=>{e.preventDefault();if(!newChannel.trim())return;try{const x=await api('/servers/'+selected.id+'/channels',{method:'POST',body:JSON.stringify({name:newChannel})});setChannels(prev=>[...prev,x.channel]);setNewChannel('');setSelChannel(x.channel);}catch(e:any){setServerNotice({type:'error',text:e?.message||'Could not create channel.'});}};
  const removeChannel=async(cid:string)=>{try{await api('/servers/'+selected.id+'/channels/'+cid,{method:'DELETE'});setChannels(prev=>prev.filter(c=>c.id!==cid));if(selChannel?.id===cid)setSelChannel(channels.find(c=>c.id!==cid)||null);}catch(e:any){setServerNotice({type:'error',text:e?.message||'Could not delete channel.'});}};
  const saveEdit=async()=>{if(!editText.trim())return;try{const x=await api('/channels/'+selChannel.id+'/messages/'+editing.id,{method:'PATCH',body:JSON.stringify({body:editText})});setMsgs(prev=>prev.map(m=>m.id===x.message.id?x.message:m));setEditing(null);}catch(e:any){setServerNotice({type:'error',text:e?.message||'Could not edit message.'});}};
  const deleteMsg=async(id:string)=>{try{await api('/channels/'+selChannel.id+'/messages/'+id,{method:'DELETE'});setMsgs(prev=>prev.filter(m=>m.id!==id));}catch(e:any){setServerNotice({type:'error',text:e?.message||'Could not delete message.'});}};

  const actionFor=(action:string,member:any)=>{
    const destructive=action==='kick'||action==='ban';
    const needsDuration=action==='timeout'||action==='mute'||action==='ban';
    const titles:any={promote:'Make admin',demote:'Demote admin',timeout:'Timeout member',untimeout:'Remove timeout',mute:'Mute member',unmute:'Unmute member',kick:'Kick member',ban:'Ban member'};
    const messages:any={promote:'Give this member admin access?',demote:'Remove admin access from this member?',timeout:'Temporarily stop this member from speaking.',untimeout:'Allow this member to speak again?',mute:'Stop this member from speaking.',unmute:'Allow this member to speak again?',kick:'Remove this member from the server?',ban:'Remove and ban this member from the server?'};
    setMemberAction({action,member,title:titles[action],message:messages[action],needsDuration,destructive,minutes:'',reason:''});
  };

  const grouped={Owner:managementMembers.filter(m=>m.role==='Owner'),Admin:managementMembers.filter(m=>m.role==='Admin'),Member:managementMembers.filter(m=>m.role==='Member')};

  return <div className="page chat-page">
    <div className="chat-heading"><div><span className="overline">SERVERS</span><h1>Your servers</h1></div><a className="secondary" href="/communities"><Compass size={15}/> Browse communities</a></div>
    {!servers.length?<div className="empty server-empty"><MessageSquare size={20}/><div><b>No servers yet.</b><p>Join a community to start chatting.</p></div><a className="primary" href="/communities">Browse communities</a></div>:
    <div className="chat">
      <div className="server-list">{servers.map(s=><button title={s.name} className={selected?.id===s.id?'sel':''} onClick={()=>navigate('/servers?server='+s.id)} key={s.id}>{(s.name||'S')[0].toUpperCase()}</button>)}</div>
      <div className="channel-list">{selected&&<>
        <div className="channel-list-head"><div><b>{selected.name}</b><small>{selected.member_count} members</small></div><div className="server-head-actions">
          <button onClick={()=>{setShowMembers(true);setShowManagement(false);}} title="Members" aria-label="Members"><Users size={16}/></button>
          {isStaff&&<button className={showManagement?'active':''} onClick={()=>{setShowManagement(true);setShowMembers(false);}} title="Community Management" aria-label="Community Management"><Shield size={16}/></button>}
        </div></div>
        <div className="channel-section-label">TEXT CHANNELS</div>
        {channels.map(c=><div className="channel-row" key={c.id}><button className={selChannel?.id===c.id?'sel':''} onClick={()=>setSelChannel(c)}><Hash size={13}/>{c.name}</button>{isStaff&&!c.is_default&&<button className="channel-del" onClick={()=>removeChannel(c.id)}><Trash2 size={12}/></button>}</div>)}
        {isStaff&&<form className="new-channel" onSubmit={addChannel}><Hash size={13}/><input value={newChannel} onChange={e=>setNewChannel(e.target.value)} placeholder="new-channel"/></form>}
      </>}</div>
      <div className="messages">
        <div className="message-channel-title">{selChannel&&<><Hash size={17}/><b>{selChannel.name}</b><span>{selected?.description}</span></>}</div>
        <div className={'message-scroll '+(channelLoading?'loading':'')}>{channelLoading&&<div className="channel-skeleton"><div/><div/><div/><div/></div>}{!channelLoading&&msgs.map(m=><div className="message" key={m.id}><Avatar user={{display_name:m.author_name}}/><div className="message-body"><div className="message-meta"><b>{m.author_name}</b><small>{localTime(m.created_at)}{m.edited_at?' · edited':''}</small></div>{editing?.id===m.id?<div className="message-edit"><input value={editText} onChange={e=>setEditText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveEdit()}/><button onClick={saveEdit}><Check size={13}/></button><button onClick={()=>setEditing(null)}><X size={13}/></button></div>:<p>{m.body}</p>}</div>{editing?.id!==m.id&&(m.author_id===user.id||isStaff)&&<div className="message-actions">{m.author_id===user.id&&<button onClick={()=>{setEditing(m);setEditText(m.body)}}><Pencil size={13}/></button>}<button onClick={()=>deleteMsg(m.id)}><Trash2 size={13}/></button></div>}</div>)}{!channelLoading&&!msgs.length&&<div className="chat-empty">No messages yet. Start the conversation.</div>}</div>
        <div className="message-input"><input disabled={!selChannel||isMuted} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder={selected?.viewer_timed_out?'You are timed out in this community':isMuted?'You are muted in this server':selChannel?'Message #'+selChannel.name:'Select a channel'}/><button disabled={!text.trim()||isMuted} onClick={send}><Send size={16}/></button></div>
      </div>

      {showMembers&&!showManagement&&<aside className="member-list-panel">
        <div className="member-panel-head"><div><b>Members</b><small>Server members</small></div><span>{members.length}</span></div>
        {serverNotice&&<div className={'server-notice '+serverNotice.type}>{serverNotice.text}<button onClick={()=>setServerNotice(null)}><X size={12}/></button></div>}
        <div className="member-list normal-member-list">{members.map(member=><div className="member-row" key={member.id}><Avatar user={member}/><div className="member-info"><b>{member.display_name}</b><small>@{member.username}</small></div><RoleBadge role={member.role}/></div>)}</div>
      </aside>}

      {showManagement&&isStaff&&<aside className="member-list-panel community-management-panel">
        <div className="member-panel-head"><div><b>Community Management</b><small>{selected.name}</small></div><button onClick={()=>setShowManagement(false)} aria-label="Close management"><X size={15}/></button></div>
        {serverNotice&&<div className={'server-notice '+serverNotice.type}>{serverNotice.text}<button onClick={()=>setServerNotice(null)}><X size={12}/></button></div>}
        <div className="management-tools"><div className="management-search"><Search size={14}/><input value={memberSearch} onChange={e=>setMemberSearch(e.target.value)} placeholder="Search members…"/></div><select value={memberRoleFilter} onChange={e=>setMemberRoleFilter(e.target.value)}><option value="all">All roles</option><option value="Owner">Owner</option><option value="Admin">Admins</option><option value="Member">Members</option></select></div>
        {managementLoading?<div className="management-skeletons"><div/><div/><div/><div/></div>:managementError?<div className="empty management-empty"><CircleAlert size={18}/><b>{managementError}</b><button className="primary" onClick={()=>loadManagement(selected.id)}>Try again</button></div>:<>
          <div className="management-count">{managementMembers.length} matching members</div>
          <div className="management-members">
            {(['Owner','Admin','Member'] as const).map(group=>grouped[group].length>0&&<section key={group}><div className="management-group-title"><span>{group==='Admin'?'ADMINS':group.toUpperCase()}</span><b>{grouped[group].length}</b></div>{grouped[group].map(member=>{
              const canAct=isOwner&&member.role==='Admin'||isOwner&&member.role==='Member'||(!isOwner&&member.role==='Member');
              return <div className="management-member-row" key={member.id}><Avatar user={member}/><div className="member-info"><b>{member.display_name}</b><small>@{member.username}</small></div><RoleBadge role={member.role}/>{canAct&&<div className="management-actions">
                {isOwner&&member.role==='Member'&&<button onClick={()=>actionFor('promote',member)}>Make Admin</button>}
                {isOwner&&member.role==='Admin'&&<button onClick={()=>actionFor('demote',member)}>Demote</button>}
                <button onClick={()=>actionFor(member.timed_out?'untimeout':'timeout',member)}>{member.timed_out?'Remove Timeout':'Timeout'}</button>
                <button onClick={()=>actionFor(member.muted?'unmute':'mute',member)}>{member.muted?'Unmute':'Mute'}</button>
                <button onClick={()=>actionFor('kick',member)}>Kick</button>
                <button className="danger" onClick={()=>actionFor('ban',member)}>Ban</button>
              </div>}</div>;
            })}</section>)}
            {!managementMembers.length&&<div className="empty">No members match this search.</div>}
          </div>
          <div className="management-audit"><div className="management-section-head"><b>Moderation History</b><button onClick={()=>loadManagement(selected.id)} title="Refresh history"><Loader2 size={13} className={auditLoading?'spin':''}/></button></div>{auditLoading?<div className="audit-skeleton"/>:!audit.length?<div className="empty">No moderation actions yet.</div>:<div className="admin-activity-list">{audit.map(a=><div key={a.id}><b>{a.action}</b><span>@{a.actor?.username||'unknown'} → @{a.target?.username||'unknown'}{a.reason?' · '+a.reason:''}{a.duration_minutes?` · ${a.duration_minutes}m`:''}</span><small>{localTime(a.created_at)}</small></div>)}</div>}</div>
        </>}
      </aside>}

      {memberAction&&<div className="admin-modal server-action-modal" onClick={()=>!memberActionBusy&&setMemberAction(null)}><div className="admin-modal-card" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><b>{memberAction.title}</b><small>@{memberAction.member.username}</small></div><button disabled={memberActionBusy} onClick={()=>setMemberAction(null)}><X size={16}/></button></div><p>{memberAction.message}</p>{memberAction.needsDuration&&<><label>Duration in minutes <input type="number" min="1" max={memberAction.action==='timeout'?'10080':'43200'} placeholder="Leave blank for indefinite" value={memberAction.minutes||''} onChange={e=>setMemberAction((v:any)=>({...v,minutes:e.target.value}))}/></label><label>Reason <textarea maxLength={500} placeholder="Optional" value={memberAction.reason||''} onChange={e=>setMemberAction((v:any)=>({...v,reason:e.target.value}))}/></label></>}<div className="modal-actions"><button disabled={memberActionBusy} onClick={()=>setMemberAction(null)}>Cancel</button><button disabled={memberActionBusy} className={memberAction.destructive?'danger-btn':'primary'} onClick={runMemberAction}>{memberActionBusy?<><Loader2 size={13} className="spin"/> Working…</>:memberAction.destructive?'Confirm':''}{!memberActionBusy&&!memberAction.destructive&&'Confirm'}</button></div></div></div>}
    </div>}
  </div>;
}

/* =========================
   ADMIN
========================= */

function Admin({user}:{user:User}){
  type Tab='overview'|'users'|'servers'|'reports'|'badges'|'activity'|'rewards';
  const [tab,setTab]=useState<Tab>('overview');
  const [stats,setStats]=useState<any>({});
  const [users,setUsers]=useState<any[]>([]);
  const [servers,setServers]=useState<any[]>([]);
  const [reports,setReports]=useState<any[]>([]);
  const [badges,setBadges]=useState<any[]>([]);
  const [activity,setActivity]=useState<any[]>([]);
  const [rewardsCatalog,setRewardsCatalog]=useState<any[]>([]);
  const [redemptions,setRedemptions]=useState<any[]>([]);
  const [redemptionFilter,setRedemptionFilter]=useState('pending_fulfillment');
  const [rewardForm,setRewardForm]=useState<any>(null);
  const [q,setQ]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selectedUser,setSelectedUser]=useState<any>(null);
  const [serverEditing,setServerEditing]=useState<any>(null);
  const [reportFilter,setReportFilter]=useState('open');
  const [reportDetail,setReportDetail]=useState<any>(null);
  const [badgeForm,setBadgeForm]=useState<any>(null);
  const [userPage,setUserPage]=useState(1);
  const [userPages,setUserPages]=useState(1);
  const [creditForm,setCreditForm]=useState<any>(null);

  const loadUsers=async(page=userPage,query=q)=>{
    try{
      const x=await api('/admin/users?q='+encodeURIComponent(query)+'&page='+page+'&limit=30');
      setUsers(x.users||[]);setUserPages(x.pages||1);setUserPage(x.page||page);
    }catch(e:any){setError(e.message||'Could not load users.');}
  };
  const loadAll=async()=>{
    setLoading(true);setError('');
    try{
      const [o,s,r,b,a,rc,rd]=await Promise.all([
        api('/admin/overview'),api('/admin/servers'),api('/admin/reports?status='+reportFilter),api('/admin/badges'),api('/admin/activity'),api('/admin/rewards'),api('/admin/redemptions?status='+redemptionFilter)
      ]);
      setStats(o.stats||{});setServers(s.servers||[]);setReports(r.reports||[]);setBadges(b.badges||[]);setActivity(a.activity||[]);setRewardsCatalog(rc.rewards||[]);setRedemptions(rd.redemptions||[]);
      await loadUsers(1,q);
    }catch(e:any){setError(e.message||'Could not load administration data.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{if(user.platform_role==='admin')loadAll();},[reportFilter,redemptionFilter]);

  const openUser=async(id:string)=>{try{const x=await api('/admin/users/'+id);setSelectedUser(x);}catch(e:any){alert(e.message)}};
  const userAction=async(id:string,action:string)=>{
    try{
      if(action==='delete'&&!confirm('Soft-delete this account? Its history will be preserved.'))return;
      await api('/admin/users/'+id+(action==='delete'?'':('/'+action)),{
        method:action==='delete'?'DELETE':'POST',
        body:action==='ban'?JSON.stringify({reason:'Administrative action'}):action==='suspend'?JSON.stringify({minutes:1440,reason:'Administrative action'}):undefined
      });
      await loadUsers(userPage,q);if(selectedUser?.user?.id===id)openUser(id);
    }catch(e:any){alert(e.message)}
  };
  const saveUser=async()=>{
    if(!selectedUser)return;
    try{await api('/admin/users/'+selectedUser.user.id,{method:'PATCH',body:JSON.stringify({display_name:selectedUser.user.display_name,bio:selectedUser.user.bio,platform_role:selectedUser.user.platform_role,location:selectedUser.user.location,website:selectedUser.user.website,availability:selectedUser.user.availability})});await openUser(selectedUser.user.id);await loadUsers(userPage,q)}catch(e:any){alert(e.message)}
  };
  const saveServer=async()=>{try{await api('/admin/servers/'+serverEditing.id,{method:'PATCH',body:JSON.stringify({name:serverEditing.name,description:serverEditing.description})});setServerEditing(null);loadAll()}catch(e:any){alert(e.message)}};
  const deleteServer=async(id:string)=>{if(!confirm('Delete this server and all of its channels and messages?'))return;try{await api('/admin/servers/'+id,{method:'DELETE'});loadAll()}catch(e:any){alert(e.message)}};
  const resolveReport=async(id:string,action:string)=>{try{await api('/admin/reports/'+id+'/resolve',{method:'POST',body:JSON.stringify({action})});setReportDetail(null);loadAll()}catch(e:any){alert(e.message)}};
  const saveBadge=async()=>{
    try{
      let criteria={};try{criteria=typeof badgeForm.criteria==='string'?JSON.parse(badgeForm.criteria||'{}'):(badgeForm.criteria||{});}catch{alert('Criteria must be valid JSON');return;}
      const method=badgeForm.id?'PATCH':'POST';const url=badgeForm.id?'/admin/badges/'+badgeForm.id:'/admin/badges';
      await api(url,{method,body:JSON.stringify({name:badgeForm.name,icon:badgeForm.icon,description:badgeForm.description,criteria})});setBadgeForm(null);loadAll();
    }catch(e:any){alert(e.message)}
  };
  const award=async(uid:string,bid:string)=>{try{await api('/admin/users/'+uid+'/badges/'+bid,{method:'POST'});openUser(uid)}catch(e:any){alert(e.message)}};
  const revoke=async(uid:string,bid:string)=>{try{await api('/admin/users/'+uid+'/badges/'+bid,{method:'DELETE'});openUser(uid)}catch(e:any){alert(e.message)}};
  const creditUser=async()=>{if(!creditForm)return;try{const amount=Number(creditForm.amount);if(!Number.isInteger(amount)||amount<=0){alert('Enter a positive whole number.');return;}await api('/admin/users/'+creditForm.uid+'/credits',{method:'POST',body:JSON.stringify({amount,reason:creditForm.reason||'Admin credit'})});setCreditForm(null);await openUser(creditForm.uid);}catch(e:any){alert(e.message)}};
  const saveReward=async()=>{
    try{
      const body={title:rewardForm.title,description:rewardForm.description,category:rewardForm.category,cost:Number(rewardForm.cost),stock:Number(rewardForm.stock)};
      if(rewardForm.id){await api('/rewards/'+rewardForm.id,{method:'PATCH',body:JSON.stringify(body)});}
      else{await api('/rewards',{method:'POST',body:JSON.stringify(body)});}
      setRewardForm(null);loadAll();
    }catch(e:any){alert(e.message)}
  };
  const toggleReward=async(r:any)=>{try{await api('/rewards/'+r.id,{method:'PATCH',body:JSON.stringify({active:!r.active})});loadAll()}catch(e:any){alert(e.message)}};
  const fulfillRedemption=async(id:string,status:'fulfilled'|'rejected')=>{
    const note=status==='rejected'?(prompt('Reason for rejecting (coins will be refunded):')||''):'';
    try{await api('/admin/redemptions/'+id+'/fulfill',{method:'POST',body:JSON.stringify({status,note})});loadAll()}catch(e:any){alert(e.message)}
  };

  if(user.platform_role!=='admin')return <div className="page"><div className="empty"><Shield size={24}/><b>Access denied</b><p>This area is restricted to platform administrators.</p></div></div>;

  const nav:[Tab,string,any][]=[['overview','Overview',HomeIcon],['users','Users',Users],['servers','Servers',MessageSquare],['reports','Reports',CircleAlert],['badges','Badges',BadgeCheck],['rewards','Rewards & payouts',Coins],['activity','Activity',Clock3]];
  return <div className="page admin-page">
    <div className="admin-hero">
      <div><span className="overline">ADMINISTRATION</span><h1>Control center</h1><p className="lede">A clean operational view of people, communities, reports, rewards and platform health.</p></div>
      <button className="admin-refresh" onClick={loadAll}><Loader2 size={15} className={loading?'spin':''}/> {loading?'Loading':'Refresh'}</button>
    </div>
    {error&&<div className="admin-error"><CircleAlert size={15}/><span>{error}</span><button onClick={loadAll}>Retry</button></div>}
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-title">CONTROL CENTER</div>
        {nav.map(([key,label,Icon])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}><Icon size={16}/><span>{label}</span>{key==='reports'&&stats.open_reports>0&&<i>{stats.open_reports}</i>}</button>)}
      </aside>
      <section className="admin-content">
        {tab==='overview'&&<>
          <div className="admin-section-head"><div><b>Platform overview</b><small>Live operational signals</small></div><span className="admin-live"><i/>Live</span></div>
          <div className="admin-kpis">{[['Users',stats.users??0,Users],['New users · 7d',stats.new_users_7d??0,UserPlus],['Projects',stats.projects??0,FolderGit2],['Startups',stats.startups??0,Rocket],['Active · 24h',stats.active_users_24h??0,Eye],['Open reports',stats.open_reports??0,CircleAlert],['Messages · 24h',stats.messages_24h??0,MessageSquare],['Posts · 24h',stats.posts_24h??0,MessageCircle]].map(([label,value,Icon])=><div className="admin-kpi" key={String(label)}><div className="admin-kpi-icon"><Icon size={16}/></div><div><span>{label}</span><b>{value}</b></div></div>)}</div>
          <div className="admin-two-col"><div className="admin-panel"><div className="admin-panel-head"><div><b>Needs attention</b><small>Prioritize these queues</small></div></div><button className="admin-queue" onClick={()=>setTab('reports')}><span className="admin-queue-icon danger"><CircleAlert size={16}/></span><span><b>{stats.open_reports??0} open reports</b><small>Review reported content and DM threads</small></span><ChevronRight size={16}/></button><button className="admin-queue" onClick={()=>setTab('users')}><span className="admin-queue-icon"><Users size={16}/></span><span><b>{stats.users??0} registered users</b><small>Search, inspect and manage accounts</small></span><ChevronRight size={16}/></button></div><div className="admin-panel"><div className="admin-panel-head"><div><b>Quick actions</b><small>Common admin workflows</small></div></div><div className="admin-quick-grid"><button onClick={()=>setTab('users')}><Users size={17}/><span>Manage users</span></button><button onClick={()=>setTab('servers')}><MessageSquare size={17}/><span>Manage servers</span></button><button onClick={()=>setTab('badges')}><BadgeCheck size={17}/><span>Manage badges</span></button><button onClick={()=>setTab('reports')}><CircleAlert size={17}/><span>Review reports</span></button></div></div></div>
        </>}
        {tab==='users'&&<div className="admin-panel"><div className="admin-section-head"><div><b>User management</b><small>Search, inspect, suspend, ban or remove accounts</small></div><span>{users.length} shown</span></div><div className="admin-search"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadUsers(1,q)} placeholder="Search username, display name or email…"/><button onClick={()=>loadUsers(1,q)}>Search</button></div><div className="admin-user-grid">{users.map(u=><article className="admin-user-card" key={u.id}><div className="admin-user-main"><Avatar user={u} size="md"/><div><button className="admin-user-name" onClick={()=>openUser(u.id)}>{u.display_name}</button><span>@{u.username}</span></div><RoleBadge role={u.platform_role==='admin'?'Admin':u.platform_role==='moderator'?'Moderator':'Member'}/></div><div className="admin-user-status">{u.deleted_at?<span className="status danger">Deleted</span>:u.platform_banned?<span className="status danger">Banned</span>:u.suspended_until?<span className="status">Suspended</span>:<span className="status good">Active</span>}<small>{localTime(u.created_at,{dateStyle:'medium'})}</small></div><div className="admin-card-actions"><button onClick={()=>openUser(u.id)}><Eye size={13}/>View</button>{u.platform_role!=='admin'&&(u.platform_banned?<button onClick={()=>userAction(u.id,'unban')}>Unban</button>:<button className="danger-btn" onClick={()=>userAction(u.id,'ban')}>Ban</button>)}{u.suspended_until?<button onClick={()=>userAction(u.id,'unsuspend')}>Unsuspend</button>:<button onClick={()=>userAction(u.id,'suspend')}>Suspend</button>}{u.platform_role!=='admin'&&<button className="danger-btn" onClick={()=>userAction(u.id,'delete')}>Delete</button>}</div></article>)}</div><div className="admin-pagination"><button disabled={userPage<=1} onClick={()=>loadUsers(userPage-1,q)}>← Previous</button><span>Page {userPage} of {userPages}</span><button disabled={userPage>=userPages} onClick={()=>loadUsers(userPage+1,q)}>Next →</button></div></div>}
        {tab==='servers'&&<div className="admin-panel"><div className="admin-section-head"><div><b>Community management</b><small>Inspect and administer servers</small></div><span>{servers.length} servers</span></div><div className="admin-server-grid">{servers.map(s=><article className="admin-server-card" key={s.id}><div className="admin-server-icon"><MessageSquare size={20}/></div><div className="admin-server-body"><div><b>{s.name}</b><span>{s.description||'No description'}</span></div><div className="admin-server-meta"><span>{s.member_count} members</span><span>Owner @{s.owner?.username||'unknown'}</span></div></div><div className="admin-card-actions"><button onClick={()=>setServerEditing({...s})}><Pencil size={13}/>Edit</button><button className="danger-btn" onClick={()=>deleteServer(s.id)}><Trash2 size={13}/>Delete</button></div></article>)}</div></div>}
        {tab==='reports'&&<div className="admin-panel"><div className="admin-section-head"><div><b>Safety & reports</b><small>Reported content and blocked/reported DM threads</small></div><select value={reportFilter} onChange={e=>setReportFilter(e.target.value)}><option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All</option></select></div>{!reports.length?<div className="admin-empty"><CircleAlert size={24}/><b>No reports in this queue</b><span>You're caught up.</span></div>:<div className="admin-report-list">{reports.map(r=><article className="admin-report-card" key={r.id}><div className="admin-report-icon"><CircleAlert size={16}/></div><div className="admin-report-body"><b>{r.target_type==='message_thread'?'Reported DM thread':r.reason||'Report'}</b><span>{r.reporter?.display_name||'Unknown reporter'} · {localTime(r.created_at)}</span><p>{r.details||'No additional details provided.'}</p></div><div className="admin-card-actions"><button onClick={()=>setReportDetail(r)}>Review</button>{r.status==='open'&&<button onClick={()=>resolveReport(r.id,'dismiss')}>Dismiss</button>}</div></article>)}</div>}{reportDetail&&<div className="admin-modal"><div className="admin-modal-card"><div className="modal-head"><b>Report review</b><button onClick={()=>setReportDetail(null)}><X size={16}/></button></div><div className="admin-report-preview"><b>{reportDetail.target_type}</b><p>{reportDetail.reason}</p><p>{reportDetail.details||'No details.'}</p></div><div className="row-actions"><button onClick={()=>resolveReport(reportDetail.id,'dismiss')}>Dismiss</button><button onClick={()=>resolveReport(reportDetail.id,'remove_content')}>Remove content</button><button className="danger-btn" onClick={()=>resolveReport(reportDetail.id,'ban_user')}>Ban user</button></div></div></div>}</div>}
        {tab==='badges'&&<div className="admin-panel"><div className="admin-section-head"><div><b>Achievement system</b><small>Create definitions and maintain the award catalog</small></div><button className="primary" onClick={()=>setBadgeForm({name:'',icon:'BadgeCheck',description:'',criteria:{}})}><Plus size={14}/>Create badge</button></div><div className="admin-badge-grid">{badges.map(b=><article className="admin-badge-card" key={b.id}><div className="admin-badge-icon">{b.icon||'🏅'}</div><div><b>{b.name}</b><p>{b.description||'No description'}</p><code>{JSON.stringify(b.criteria||{})}</code></div><div className="admin-card-actions"><button onClick={()=>setBadgeForm({...b,criteria:JSON.stringify(b.criteria||{},null,2)})}>Edit</button><button className="danger-btn" onClick={async()=>{if(confirm('Delete badge?')){await api('/admin/badges/'+b.id,{method:'DELETE'});loadAll();}}}>Delete</button></div></article>)}</div>{badgeForm&&<div className="admin-modal"><div className="admin-modal-card"><div className="modal-head"><b>{badgeForm.id?'Edit':'Create'} badge</b><button onClick={()=>setBadgeForm(null)}><X size={16}/></button></div><label>Name<input value={badgeForm.name} onChange={e=>setBadgeForm({...badgeForm,name:e.target.value})}/></label><label>Icon<input value={badgeForm.icon} onChange={e=>setBadgeForm({...badgeForm,icon:e.target.value})}/></label><label>Description<textarea value={badgeForm.description} onChange={e=>setBadgeForm({...badgeForm,description:e.target.value})}/></label><label>Criteria JSON<textarea value={typeof badgeForm.criteria==='string'?badgeForm.criteria:JSON.stringify(badgeForm.criteria||{},null,2)} onChange={e=>setBadgeForm({...badgeForm,criteria:e.target.value})}/></label><button className="primary" onClick={saveBadge}>Save badge</button></div></div>}</div>}
        {tab==='rewards'&&<div className="admin-panel">
          <div className="admin-section-head"><div><b>Redemption catalog</b><small>Gift cards, Nitro, game currency, and cash-out options users can redeem Zorta Coins for</small></div><button className="primary" onClick={()=>setRewardForm({title:'',description:'',category:'gift_card',cost:'',stock:''})}><Plus size={14}/>Add catalog item</button></div>
          <div className="admin-badge-grid">
            {rewardsCatalog.map(r=>
              <article className="admin-badge-card" key={r.id}>
                <div className="admin-badge-icon"><Coins size={18}/></div>
                <div>
                  <b>{r.title} {!r.active&&<span className="status danger">Inactive</span>}</b>
                  <p>{r.description||'No description'}</p>
                  <code>{r.category} · {r.cost} coins · {r.stock} in stock</code>
                </div>
                <div className="admin-card-actions">
                  <button onClick={()=>setRewardForm({...r,cost:String(r.cost),stock:String(r.stock)})}>Edit</button>
                  <button className={r.active?'danger-btn':''} onClick={()=>toggleReward(r)}>{r.active?'Deactivate':'Activate'}</button>
                </div>
              </article>
            )}
            {!rewardsCatalog.length&&<div className="admin-empty"><Coins size={24}/><b>No catalog items yet</b><span>Add a gift card, Nitro, or cash-out option to get started.</span></div>}
          </div>

          {rewardForm&&<div className="admin-modal"><div className="admin-modal-card">
            <div className="modal-head"><b>{rewardForm.id?'Edit':'Add'} catalog item</b><button onClick={()=>setRewardForm(null)}><X size={16}/></button></div>
            <label>Title<input value={rewardForm.title} onChange={e=>setRewardForm({...rewardForm,title:e.target.value})} placeholder="$10 Amazon gift card"/></label>
            <label>Description<textarea value={rewardForm.description} onChange={e=>setRewardForm({...rewardForm,description:e.target.value})}/></label>
            <label>Category<select value={rewardForm.category} onChange={e=>setRewardForm({...rewardForm,category:e.target.value})}><option value="gift_card">Gift card</option><option value="gaming">Gaming / in-game currency</option><option value="cash">Cash payout</option><option value="other">Other</option></select></label>
            <label>Cost (Zorta Coins)<input type="number" min="1" value={rewardForm.cost} onChange={e=>setRewardForm({...rewardForm,cost:e.target.value})}/></label>
            <label>Stock available<input type="number" min="0" value={rewardForm.stock} onChange={e=>setRewardForm({...rewardForm,stock:e.target.value})}/></label>
            {rewardForm.category==='cash'&&<small className="settings-note">Cash payouts still require manual fulfillment (bank/PayPal transfer) — there's no payment processor wired up yet. Redemptions land in the queue below as "pending fulfillment" for your team to action outside Zorta.</small>}
            <button className="primary" onClick={saveReward}>Save item</button>
          </div></div>}

          <div className="admin-section-head" style={{marginTop:28}}><div><b>Redemption queue</b><small>Requests waiting on manual fulfillment</small></div><select value={redemptionFilter} onChange={e=>setRedemptionFilter(e.target.value)}><option value="pending_fulfillment">Pending</option><option value="fulfilled">Fulfilled</option><option value="rejected">Rejected</option></select></div>
          {!redemptions.length
            ?<div className="admin-empty"><Coins size={24}/><b>Nothing in this queue</b><span>You're caught up.</span></div>
            :<div className="admin-report-list">
              {redemptions.map((r:any)=>
                <article className="admin-report-card" key={r.id}>
                  <div className="admin-report-icon"><Coins size={16}/></div>
                  <div className="admin-report-body">
                    <b>{r.reward_title}</b>
                    <span>@{r.username||r.user_id} · {r.cost} coins · {localTime(r.created_at)}</span>
                    {r.note&&<p>{r.note}</p>}
                  </div>
                  {r.status==='pending_fulfillment'&&<div className="admin-card-actions">
                    <button onClick={()=>fulfillRedemption(r.id,'fulfilled')}>Mark fulfilled</button>
                    <button className="danger-btn" onClick={()=>fulfillRedemption(r.id,'rejected')}>Reject & refund</button>
                  </div>}
                </article>
              )}
            </div>
          }
        </div>}
        {tab==='activity'&&<div className="admin-panel"><div className="admin-section-head"><div><b>Audit history</b><small>Administrative actions across the platform</small></div></div><div className="admin-audit-list">{activity.map(a=><div key={a.id}><span className="admin-audit-dot"/><div><b>{a.action}</b><span>{a.reason||'Administrative action'}</span></div><time>{localTime(a.created_at)}</time></div>)}</div></div>}
      </section>
    </div>
    {selectedUser&&<div className="admin-modal"><div className="admin-modal-card admin-user-modal"><div className="modal-head"><div><b>@{selectedUser.user.username}</b><small>{selectedUser.user.email||'User profile'}</small></div><button onClick={()=>setSelectedUser(null)}><X size={16}/></button></div><div className="admin-profile-header"><Avatar user={selectedUser.user} size="lg"/><div><h3>{selectedUser.user.display_name}</h3><span>{selectedUser.user.user_id||selectedUser.user.id}</span></div></div><div className="admin-edit-grid"><label>Display name<input value={selectedUser.user.display_name||''} onChange={e=>setSelectedUser({...selectedUser,user:{...selectedUser.user,display_name:e.target.value}})}/></label><label>Role<select value={selectedUser.user.platform_role||'user'} onChange={e=>setSelectedUser({...selectedUser,user:{...selectedUser.user,platform_role:e.target.value}})}><option value="user">User</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select></label><label>Location<input value={selectedUser.user.location||''} onChange={e=>setSelectedUser({...selectedUser,user:{...selectedUser.user,location:e.target.value}})}/></label><label>Website<input value={selectedUser.user.website||''} onChange={e=>setSelectedUser({...selectedUser,user:{...selectedUser.user,website:e.target.value}})}/></label><label>Bio<textarea value={selectedUser.user.bio||''} onChange={e=>setSelectedUser({...selectedUser,user:{...selectedUser.user,bio:e.target.value}})}/></label></div><button className="primary wide" onClick={saveUser}>Save profile</button><div className="admin-modal-section admin-credit-section"><div className="modal-section-head"><b>Zorta Coins</b><button className="secondary" onClick={()=>setCreditForm({uid:selectedUser.user.id,username:selectedUser.user.username,amount:'',reason:'Admin credit'})}><Plus size={13}/> Add coins</button></div><small>Current balance: <b>{Number(selectedUser.credit_balance||0).toLocaleString("en-IN")} coins</b> · credit this account directly. This is a balance adjustment, not a cash payout.</small></div><div className="admin-modal-section"><b>Badges</b><div className="badge-admin-list">{selectedUser.badges?.map((x:any)=><div key={x.award.id}><span>{x.badge?.icon||'🏅'} {x.badge?.name||'Badge'}</span><button onClick={()=>revoke(selectedUser.user.id,x.badge?.id||x.award.badge_id)}>Revoke</button></div>)}</div><select defaultValue="" onChange={e=>e.target.value&&award(selectedUser.user.id,e.target.value)}><option value="">Award badge…</option>{badges.filter(b=>b.active).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="admin-modal-section"><b>Recent activity</b><div className="admin-activity-mini">{selectedUser.activity?.slice(0,25).map((a:any)=><div key={a.id}><span>{a.kind||a.action}</span><small>{localTime(a.created_at)}</small></div>)}</div></div></div></div>}
    {creditForm&&<div className="admin-modal" onClick={()=>setCreditForm(null)}><div className="admin-modal-card" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><b>Add Zorta Coins</b><small>@{creditForm.username}</small></div><button onClick={()=>setCreditForm(null)}><X size={16}/></button></div><label>Coins<input autoFocus type="number" min="1" max="1000000" value={creditForm.amount} onChange={e=>setCreditForm((v:any)=>({...v,amount:e.target.value}))} placeholder="e.g. 500"/></label><label>Reason<input maxLength={200} value={creditForm.reason} onChange={e=>setCreditForm((v:any)=>({...v,reason:e.target.value}))} placeholder="Why are you adding coins?"/></label><div className="modal-actions"><button onClick={()=>setCreditForm(null)}>Cancel</button><button className="primary" onClick={creditUser}>Add coins</button></div></div></div>}
    {serverEditing&&<div className="admin-modal"><div className="admin-modal-card"><div className="modal-head"><b>Edit server</b><button onClick={()=>setServerEditing(null)}><X size={16}/></button></div><label>Name<input value={serverEditing.name} onChange={e=>setServerEditing({...serverEditing,name:e.target.value})}/></label><label>Description<textarea value={serverEditing.description||''} onChange={e=>setServerEditing({...serverEditing,description:e.target.value})}/></label><button className="primary" onClick={saveServer}>Save changes</button></div></div>}
  </div>;
}

/* =========================
   SETTINGS
========================= */

/* =========================
   APP
========================= */

function Onboarding({user,onDone}:{user:User,onDone:(u:User)=>void}){
  const [d,setD]=useState<any>({
    username:user.username||'',
    display_name:user.display_name||'',
    bio:user.bio||'',
    roles:(user.roles||[]).join(', '),
    skills:(user.skills||[]).join(', '),
    interests:(user.interests||[]).join(', '),
    location:(user as any).location||'',
    website:(user as any).website||'',
    availability:(user as any).availability||'',
    pronouns:(user as any).pronouns||'',
    age_confirmed:true
  });
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [step,setStep]=useState(1);

  const save=async()=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      let x=await api('/profiles/me',{
        method:'PATCH',
        body:JSON.stringify({
          display_name:d.display_name,
          bio:d.bio,
          location:d.location,
          website:d.website,
          availability:d.availability,
          pronouns:d.pronouns,
          roles:d.roles.split(',').map((x:string)=>x.trim()).filter(Boolean),
          skills:d.skills.split(',').map((x:string)=>x.trim()).filter(Boolean),
          interests:d.interests.split(',').map((x:string)=>x.trim()).filter(Boolean),
          age_confirmed:d.age_confirmed,
          onboarding_complete:false
        })
      });
      if(d.username!==user.username){
        x=await api('/profiles/me/username',{method:'PATCH',body:JSON.stringify({username:d.username})});
      }
      x=await api('/profiles/me',{method:'PATCH',body:JSON.stringify({onboarding_complete:true})});
      onDone(normalizeUser(x.user)!);
    }catch(e:any){setError(e.message||'Could not save your profile.');}
    finally{setBusy(false);}
  };

  return <div className="auth">
    <div className="auth-card onboarding-card">
      <Logo/>
      <div className="auth-title">
        <span>YOUR ZORTA IDENTITY</span>
        <h1>Set up your profile.</h1>
        <p>Everyone gets a unique Zorta ID. You can change your username once every 30 days.</p>
      </div>

      <div className="onboarding-steps"><span className={step===1?'active':''}>1 Identity</span><span className={step===2?'active':''}>2 About you</span><span className={step===3?'active':''}>3 Skills & links</span></div>

      {step===1&&<>
        <label>Username<input value={d.username} onChange={e=>setD({...d,username:e.target.value.replace(/[^A-Za-z0-9]/g,'').slice(0,24)})} placeholder="Letters and numbers only" /></label>
        <small>Your Zorta ID: <b>{user.user_id||user.id}</b></small>
        <label>Display name<input value={d.display_name} onChange={e=>setD({...d,display_name:e.target.value})} /></label>
        <label className="age"><input type="checkbox" checked={d.age_confirmed} onChange={e=>setD({...d,age_confirmed:e.target.checked})}/> I confirm I am 13 or older.</label>
        <button className="primary wide" onClick={()=>setStep(2)} disabled={!d.username||!d.display_name||!d.age_confirmed}>Continue</button>
      </>}

      {step===2&&<>
        <label>Bio<textarea value={d.bio} onChange={e=>setD({...d,bio:e.target.value})} placeholder="Tell people what you build, care about, or want to learn…"/></label>
        <label>What do you do?<input value={d.roles} onChange={e=>setD({...d,roles:e.target.value})} placeholder="Developer, Designer, Founder"/></label>
        <label>Location<input value={d.location} onChange={e=>setD({...d,location:e.target.value})} placeholder="City / region (optional)"/></label>
        <label>Availability<select value={d.availability} onChange={e=>setD({...d,availability:e.target.value})}><option value="">Choose…</option><option>Available</option><option>Busy</option><option>Open to opportunities</option><option>Not looking</option></select></label>
        <div className="edit-profile-actions"><button className="secondary" onClick={()=>setStep(1)}>Back</button><button className="primary" onClick={()=>setStep(3)}>Continue</button></div>
      </>}

      {step===3&&<>
        <label>Skills<input value={d.skills} onChange={e=>setD({...d,skills:e.target.value})} placeholder="TypeScript, React, Figma"/></label>
        <label>Interests<input value={d.interests} onChange={e=>setD({...d,interests:e.target.value})} placeholder="Open source, startups, design"/></label>
        <label>Website<input value={d.website} onChange={e=>setD({...d,website:e.target.value})} placeholder="https://…"/></label>
        <label>Pronouns<input value={d.pronouns} onChange={e=>setD({...d,pronouns:e.target.value})} placeholder="Optional"/></label>
        {error&&<div className="error">{error}</div>}
        <div className="edit-profile-actions"><button className="secondary" onClick={()=>setStep(2)}>Back</button><button className="primary" onClick={save} disabled={busy}>{busy?'Saving…':'Finish profile'}</button></div>
      </>}
    </div>
  </div>;
}

function App(){

  const [user,setUser]=
    useState<User|null>(null);

  const [loading,setLoading]=
    useState(true);

  const [bootError,setBootError]=
    useState('');

  const [showThemeWelcome,setShowThemeWelcome]=useState(false);

  const path=usePath();

  useEffect(()=>{

    const params=
      new URLSearchParams(
        location.search
      );

    if(
      params.get(
        'access_token'
      )
    ){

      localStorage.setItem(
        'zorta_access',
        params.get(
          'access_token'
        )!
      );

      localStorage.setItem(
        'zorta_refresh',
        params.get(
          'refresh_token'
        )||''
      );

      history.replaceState(
        {},
        '',
        location.pathname
      );
    }

    if(
      localStorage.getItem(
        'zorta_access'
      )
    ){

      api('/auth/me')
        .then(x=>{

          const u=
            normalizeUser(
              x.user
            );

          if(u){

            setUser(u);

          }else{

            localStorage.clear();

            setBootError(
              'Your session is valid, but the server returned an invalid user profile. Please log in again.'
            );

          }

        })
        .catch(e=>{

          localStorage.removeItem(
            'zorta_access'
          );

          localStorage.removeItem(
            'zorta_refresh'
          );

          setBootError(
            e.message||
            'Could not restore your session.'
          );

        })
        .finally(()=>{

          setLoading(false);

        });

    }else{

      setLoading(false);

    }

    applyTheme(localStorage.getItem('zorta_theme')||'velvet');

  },[]);

  useEffect(()=>{
    if(user && !hasChosenTheme()) setShowThemeWelcome(true);
  },[user]);

  if(loading){

    return(
      <div className="loading-screen">
        <Logo/>
      </div>
    );
  }

  if(
    bootError&&
    !user
  ){

    return(
      <div className="auth">

        <div className="auth-card">

          <Logo/>

          <div className="auth-title">

            <span>SESSION</span>

            <h1>
              Let's reconnect.
            </h1>

            <p>
              {bootError}
            </p>

          </div>

          <button
            className="primary wide"
            onClick={()=>{
              setBootError('');
              location.reload();
            }}
          >
            Back to login
          </button>

        </div>

      </div>
    );
  }

  if(!user){
    return <Auth onLogin={setUser}/>;
  }

  if(!user.onboarding_complete){
    return <Onboarding user={user} onDone={setUser}/>;
  }

  let page:
    React.ReactNode;

  const cleanPath=
    path.split('?')[0];

  if(cleanPath==='/'){

    page=<Home user={user}/>;

  }else if(
    cleanPath.startsWith('/post/')
  ){

    page=
      <PostDetail
        id={
          cleanPath.split('/')[2]
        }
        viewer={user}
      />;

  }else if(
    cleanPath==='/feed'
  ){

    page=
      <div className="page">

        <div className="list-head">

          <div>

            <span className="overline">
              POSTS
            </span>

            <h1>
              What builders are shipping.
            </h1>

            <p className="lede">
              Short updates, useful questions and things worth sharing.
            </p>

          </div>

          <a
            className="primary create"
            href="/create/post"
          >
            <Plus size={16}/>
            Create post
          </a>

        </div>

        <Feed viewer={user}/>

      </div>;

  }else if(
    cleanPath==='/create'
  ){

    page=<Create/>;

  }else if(
    cleanPath==='/create/post'
  ){

    page=<Form kind="post"/>;

  }else if(
    cleanPath==='/workspaces'
  ){

    page=
      <Collection
        type="workspaces"
      />;

  }else if(
    cleanPath==='/workspaces/create'
  ){

    page=
      <Form
        kind="workspace"
      />;

  }else if(
    cleanPath.startsWith(
      '/workspaces/'
    )
  ){

    page=
      <Detail
        type="workspace"
        id={
          cleanPath.split('/')[2]
        }
      />;

  }else if(
    cleanPath==='/communities'
  ){

    page=<Communities/>;

  }else if(
    cleanPath==='/freelance'
  ){

    page=<Marketplace user={user}/>;

  }else if(
    cleanPath==='/freelance/create'
  ){

    page=
      <Form
        kind="gig"
      />;

  }else if(
    cleanPath===
    '/freelance/orders'
  ){

    page=
      <Orders user={user}/>;

  }else if(
    cleanPath.startsWith(
      '/freelance/'
    )
  ){

    page=
      <Detail
        type="gig"
        id={
          cleanPath.split('/')[2]
        }
        user={user}
      />;

  }else if(
    cleanPath==='/startups'
  ){

    page=
      <Collection
        type="startups"
      />;

  }else if(
    cleanPath==='/startups/create'
  ){

    page=
      <Form
        kind="startup"
      />;

  }else if(
    cleanPath.startsWith(
      '/startups/'
    )
  ){

    page=
      <Detail
        type="startup"
        id={
          cleanPath.split('/')[2]
        }
      />;

  }else if(
    cleanPath==='/search'||cleanPath==='/explore'
  ){

    page=<SearchPage/>;

  }else if(
    cleanPath==='/messages'
  ){
    page=<div className="page"><div className="empty">Your messages are open in the Messages panel.</div></div>;
  }else if(
    cleanPath==='/notifications'
  ){

    page=<Notifications user={user}/>;

  }else if(
    cleanPath==='/servers'
  ){

    page=<Servers user={user}/>;

  }else if(cleanPath==='/admin'){

    page=<Admin user={user}/>;

  }else if(
    cleanPath==='/wallet'
  ){

    page=<Wallet/>;

  }else if(
    cleanPath==='/referrals'
  ){

    page=<Referrals/>;

  }else if(
    cleanPath==='/rewards'
  ){

    page=<Rewards/>;

  }else if(
    cleanPath==='/settings'
  ){

    page=
      <Settings
        user={user}
        setUser={setUser}
      />;

  }else if(
    cleanPath.startsWith(
      '/profile/'
    )
  ){

    page=
      <Profile
        username={
          cleanPath.split('/')[2]
        }
        viewer={user}
      />;

  }else{

    page=
      <div className="page">

        <h1>
          Nothing here.
        </h1>

        <a href="/">
          Back home
        </a>

      </div>;
  }

  return(
    <>
    <Layout
      user={user}
      onLogout={()=>{
        localStorage.clear();
        sessionStorage.removeItem('zorta_theme_session_seen');
        setUser(null);
      }}
    >
      {page}
    </Layout>
    {showThemeWelcome && cleanPath==='/' && <ThemeOnboarding onDone={()=>setShowThemeWelcome(false)} />}
    </>
  );
}

createRoot(
  document.getElementById('root')!
).render(
  <App/>

);
