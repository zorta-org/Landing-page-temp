import React,{useEffect,useState} from 'react';
import {Gift,Check,Coins,Users,Share2,CircleAlert} from 'lucide-react';
import {api} from '../lib/api';
import {Avatar} from '../components/ui';

function joinedOn(v:any){
  const d=new Date(v);
  return Number.isNaN(d.getTime())?'':d.toLocaleDateString(undefined,{dateStyle:'medium'});
}

async function shareOrCopy(url:string){
  if(navigator.share){
    try{
      await navigator.share({title:'Join me on Zorta',url});
      return 'shared';
    }catch{
      return '';
    }
  }
  if(navigator.clipboard){
    await navigator.clipboard.writeText(url);
    return 'copied';
  }
  return '';
}

function Referrals(){

  const [d,setD]=useState<any>(null);
  const [err,setErr]=useState('');
  const [copied,setCopied]=useState(false);

  const load=()=>{
    setErr('');
    api('/referrals/me').then(setD).catch(e=>setErr(e.message||'Could not load your referral info.'));
  };

  useEffect(()=>{load();},[]);

  const copyLink=async()=>{
    if(!d)return;
    const result=await shareOrCopy(d.referral_link);
    if(result==='copied'||result==='shared'){
      setCopied(true);
      setTimeout(()=>setCopied(false),1800);
    }
  };

  if(err){
    return(
      <div className="page narrow">
        <div className="empty">
          <CircleAlert size={22}/>
          <b>Couldn't load your referral info.</b>
          <span>{err}</span>
          <button className="secondary" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }

  if(!d){
    return(
      <div className="page narrow">
        <span className="overline">REFERRALS</span>
        <h1>Invite friends, earn coins.</h1>
        <div className="skeletons" style={{marginTop:30}}>
          <div className="skeleton"/>
          <div className="skeleton"/>
        </div>
      </div>
    );
  }

  const referred=d.referred||[];

  return(
    <div className="page narrow">

      <span className="overline">REFERRALS</span>

      <h1>Invite friends, earn coins.</h1>

      <p className="lede">
        Share your link. When someone joins Zorta with it, you get {d.stats.reward_per_referral} coins
        and they get {d.stats.welcome_bonus} coins to start.
      </p>

      <div className="stats" style={{marginTop:28}}>
        <div className="stat">
          <span className="stat-icon"><Users size={16}/></span>
          <div>
            <b>{d.stats.total_referred}</b>
            <small>People referred</small>
          </div>
        </div>

        <div className="stat">
          <span className="stat-icon"><Coins size={16}/></span>
          <div>
            <b>{d.stats.coins_earned.toLocaleString()}</b>
            <small>Coins earned from referrals</small>
          </div>
        </div>

        <div className="stat">
          <span className="stat-icon"><Gift size={16}/></span>
          <div>
            <b>+{d.stats.reward_per_referral}</b>
            <small>Coins per signup</small>
          </div>
        </div>
      </div>

      <div className="settings" style={{marginTop:10}}>
        <section>
          <h3>Your referral link</h3>
          <p>Anyone who signs up through this link is credited to you automatically.</p>

          <div className="referral-link-row">
            <input readOnly value={d.referral_link} onFocus={e=>e.target.select()}/>
            <button className="primary" onClick={copyLink}>
              {copied
                ? <><Check size={14}/> {navigator.share?'Shared':'Copied'}</>
                : <><Share2 size={14}/> Share</>
              }
            </button>
          </div>

          <small className="settings-note">Your code: <b>{d.referral_code}</b></small>
        </section>

        <section>
          <h3>People you've invited</h3>

          {referred.length===0
            ? <p>No one yet — share your link above to start earning coins.</p>
            : <div className="referral-list">
                {referred.map((u:any)=>
                  <a className="referral-row" href={'/profile/'+u.username} key={u.id}>
                    <Avatar user={u} size="sm"/>
                    <div>
                      <b>{u.display_name}</b>
                      <small>@{u.username} · joined {joinedOn(u.created_at)}</small>
                    </div>
                  </a>
                )}
              </div>
          }
        </section>
      </div>

    </div>
  );
}

export {Referrals};
