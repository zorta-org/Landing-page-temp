import React from 'react';
import {Moon, MoonStar, Sun, Shuffle, Check, Settings2} from 'lucide-react';

export type ThemeDefinition = {
  id:string;
  label:string;
  icon?:any;
  description:string;
  swatch:string;
};

export const THEMES:ThemeDefinition[] = [
  {id:'velvet',label:'Velvet',icon:Moon,description:'Deep charcoal with a soft violet glow.',swatch:'#15131c'},
  {id:'slate',label:'Slate',icon:MoonStar,description:'Cool neutral contrast for long sessions.',swatch:'#1b2028'},
  {id:'midnight',label:'Midnight',description:'Ink blue with a crisp electric accent.',swatch:'#0d1522'},
  {id:'forest',label:'Forest',description:'Dark green, calm and high contrast.',swatch:'#0d1a15'},
  {id:'plum',label:'Plum',description:'Rich violet with restrained highlights.',swatch:'#1a1424'},
  {id:'rose',label:'Rose',description:'Dark rose tones without sacrificing clarity.',swatch:'#211318'},
  {id:'paper',label:'Paper',icon:Sun,description:'Warm editorial light mode.',swatch:'#f7f5f0'},
  {id:'cloud',label:'Cloud',description:'Clean cool light with strong readable text.',swatch:'#f4f7fb'},
  {id:'sage',label:'Sage',description:'Soft green light with grounded contrast.',swatch:'#f1f6f2'},
  {id:'peach',label:'Peach',description:'Warm light with a muted coral accent.',swatch:'#fff5ed'},
  {id:'lavender',label:'Lavender',description:'Airy light with a confident purple accent.',swatch:'#f7f5ff'},
  {id:'sand',label:'Sand',description:'Warm neutral light inspired by paper and stone.',swatch:'#f6f1e7'},
];

export function resolveTheme(pref:string){
  return THEMES.some(t=>t.id===pref) ? pref : 'velvet';
}

export function applyTheme(pref:string){
  const theme=resolveTheme(pref);
  document.documentElement.dataset.theme=theme;
  document.documentElement.style.colorScheme=
    ['paper','cloud','sage','peach','lavender','sand'].includes(theme)
      ? 'light'
      : 'dark';
}

export function markThemeSeen(){
  localStorage.setItem('zorta_theme_seen','1');
  sessionStorage.setItem('zorta_theme_session_seen','1');
}

export function hasChosenTheme(){
  return sessionStorage.getItem('zorta_theme_session_seen')==='1';
}

export function ThemeOnboarding({onDone}:{onDone:()=>void}){
  const [selected,setSelected]=React.useState(
    resolveTheme(localStorage.getItem('zorta_theme')||'velvet')
  );

  const choose=(id:string)=>{
    setSelected(id);
    localStorage.setItem('zorta_theme',id);
    applyTheme(id);
  };

  const surprise=()=>{
    const pool=THEMES.filter(t=>t.id!==selected);
    choose(pool[Math.floor(Math.random()*pool.length)].id);
  };

  const finish=()=>{
    markThemeSeen();
    onDone();
  };

  return (
    <div className="theme-welcome-backdrop" role="dialog" aria-modal="true">
      <div className="theme-welcome">
        <div className="theme-welcome-head">
          <span className="overline">WELCOME TO ZORTA</span>
          <h2>Make Zorta feel like yours.</h2>
          <p>
            Pick a theme now. Your choice is saved automatically.
            You can change it whenever you want from <b>Settings → Appearance</b>.
          </p>
        </div>

        <div className="theme-welcome-grid">
          {THEMES.map(t=>(
            <button
              type="button"
              key={t.id}
              className={'theme-preview '+(selected===t.id?'selected':'')}
              onClick={()=>choose(t.id)}
            >
              <span className="theme-preview-art" style={{background:t.swatch}}>
                <span/>
              </span>
              <b>{t.label}</b>
              <small>{t.description}</small>
              {selected===t.id && <Check size={15}/>}
            </button>
          ))}
        </div>

        <div className="theme-welcome-footer">
          <button type="button" className="surprise-theme" onClick={surprise}>
            <Shuffle size={15}/> Surprise me
          </button>
          <div className="theme-settings-hint">
            <Settings2 size={14}/>
            <span>You can change your theme later in Settings.</span>
          </div>
          <button type="button" className="primary theme-continue" onClick={finish}>
            Continue with {THEMES.find(t=>t.id===selected)?.label||'this theme'}
          </button>
        </div>
      </div>
    </div>
  );
}
