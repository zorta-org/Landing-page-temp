import React,{useEffect,useState} from 'react';
import {Coins,Gift,ArrowUpRight,ArrowDownRight,CircleAlert,Wallet as WalletIcon,Users,Briefcase,Star,Trophy} from 'lucide-react';
import {api} from '../lib/api';

const REASON_META:Record<string,{label:string;icon:any}>={
  milestone_released:{label:'Freelance order paid out',icon:Briefcase},
  order_funded:{label:'Funded a freelance order',icon:Briefcase},
  order_refunded:{label:'Order refund',icon:Briefcase},
  order_cancelled_refund:{label:'Order cancelled — refunded',icon:Briefcase},
  review_positive:{label:'Positive review bonus',icon:Star},
  referral_signup:{label:'Referral bonus — friend joined',icon:Users},
  referral_welcome:{label:'Welcome bonus from referral',icon:Gift},
  redemption:{label:'Redeemed a reward',icon:Gift},
  redemption_refund:{label:'Redemption refunded',icon:Gift},
  redemption_stock_race_refund:{label:'Redemption refunded (out of stock)',icon:Gift},
};

function describe(entry:any){
  if(REASON_META[entry.reason])return REASON_META[entry.reason];
  if(String(entry.reason||'').startsWith('reputation_milestone_')){
    const n=entry.reason.split('_').pop();
    return {label:'Reputation milestone — '+n+' reputation',icon:Trophy};
  }
  return {label:entry.reason||'Zorta Coins activity',icon:Coins};
}

function when(v:any){
  const d=new Date(v);
  return Number.isNaN(d.getTime())?'':d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
}

function Wallet(){

  const [balance,setBalance]=useState<number|null>(null);
  const [entries,setEntries]=useState<any[]>([]);
  const [err,setErr]=useState('');

  const load=()=>{
    setErr('');
    Promise.all([
      api('/credits/balance'),
      api('/credits/history?limit=100')
    ]).then(([b,h])=>{
      setBalance(b.balance);
      setEntries(h.entries||[]);
    }).catch(e=>setErr(e.message||'Could not load your wallet.'));
  };

  useEffect(()=>{load();},[]);

  const earned=entries.filter(e=>e.amount>0).reduce((s,e)=>s+e.amount,0);
  const spent=entries.filter(e=>e.amount<0).reduce((s,e)=>s+Math.abs(e.amount),0);

  if(err){
    return(
      <div className="page">
        <div className="empty">
          <CircleAlert size={22}/>
          <b>Couldn't load your wallet.</b>
          <span>{err}</span>
          <button className="secondary" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }

  return(
    <div className="page">

      <div className="list-head">
        <div>
          <span className="overline">WALLET</span>
          <h1>Your Zorta Coins.</h1>
          <p className="lede">Earned from completed gigs, referrals, and reputation milestones. Redeem for gift cards, game currency, and other rewards.</p>
        </div>

        <a className="primary create" href="/rewards"><Gift size={16}/> Redeem coins</a>
      </div>

      <div className="stats" style={{marginTop:10}}>
        <div className="stat">
          <span className="stat-icon"><WalletIcon size={16}/></span>
          <div>
            <b>{balance===null?'…':balance.toLocaleString()}</b>
            <small>Current balance</small>
          </div>
        </div>

        <div className="stat">
          <span className="stat-icon"><ArrowUpRight size={16}/></span>
          <div>
            <b>{earned.toLocaleString()}</b>
            <small>Total earned</small>
          </div>
        </div>

        <div className="stat">
          <span className="stat-icon"><ArrowDownRight size={16}/></span>
          <div>
            <b>{spent.toLocaleString()}</b>
            <small>Total spent / redeemed</small>
          </div>
        </div>
      </div>

      <div className="section-title">
        <div>
          <span className="overline">HISTORY</span>
          <h2>Every coin, accounted for</h2>
        </div>
        <a href="/referrals">Earn more via referrals <Users size={14}/></a>
      </div>

      {entries.length===0
        ? <div className="empty"><Coins size={22}/><b>No activity yet.</b><span>Complete a gig, refer a friend, or build reputation to start earning.</span></div>
        : <div className="referral-list">
            {entries.map((e:any)=>{
              const meta=describe(e);
              const Icon=meta.icon;
              const positive=e.amount>0;
              return(
                <div className="referral-row" key={e.id}>
                  <span className={'wallet-entry-icon '+(positive?'positive':'negative')}><Icon size={14}/></span>
                  <div style={{flex:1,minWidth:0}}>
                    <b>{meta.label}</b>
                    <small>{when(e.created_at)}</small>
                  </div>
                  <b className={positive?'wallet-amount positive':'wallet-amount negative'}>
                    {positive?'+':''}{e.amount.toLocaleString()}
                  </b>
                </div>
              );
            })}
          </div>
      }

    </div>
  );
}

export {Wallet};
