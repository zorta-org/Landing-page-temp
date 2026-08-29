import React,{useEffect,useState} from 'react';
import {Coins,Gift,Package,CircleAlert,Check} from 'lucide-react';
import {api} from '../lib/api';

function timeAgo(v:any){
  const d=new Date(v);
  return Number.isNaN(d.getTime())?'':d.toLocaleDateString(undefined,{dateStyle:'medium'});
}

function Rewards(){

  const [balance,setBalance]=useState<number|null>(null);
  const [catalog,setCatalog]=useState<any[]>([]);
  const [redemptions,setRedemptions]=useState<any[]>([]);
  const [err,setErr]=useState('');
  const [busy,setBusy]=useState('');
  const [msg,setMsg]=useState('');

  const load=()=>{
    setErr('');
    Promise.all([
      api('/credits/balance'),
      api('/rewards'),
      api('/redemptions')
    ]).then(([b,c,r])=>{
      setBalance(b.balance);
      setCatalog(c.rewards||[]);
      setRedemptions(r.redemptions||[]);
    }).catch(e=>setErr(e.message||'Could not load rewards.'));
  };

  useEffect(()=>{load();},[]);

  const redeem=async(item:any)=>{
    if(balance!==null&&balance<item.cost)return;
    setBusy(item.id);
    setMsg('');
    try{
      await api('/rewards/'+item.id+'/redeem',{method:'POST'});
      setMsg('Redeemed "'+item.title+'" — pending fulfillment.');
      load();
    }catch(e:any){
      setMsg(e.message||'Could not redeem this reward.');
    }finally{
      setBusy('');
      setTimeout(()=>setMsg(''),3000);
    }
  };

  if(err){
    return(
      <div className="page">
        <div className="empty">
          <CircleAlert size={22}/>
          <b>Couldn't load rewards.</b>
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
          <span className="overline">REWARDS</span>
          <h1>Turn building into real rewards.</h1>
          <p className="lede">Redeem Zorta coins for gift cards, Discord Nitro, game currency, and more.</p>
        </div>

        <div className="market-balance-note">
          <div>
            <span>ZORTA BALANCE</span>
            <b>{balance===null?'…':balance.toLocaleString()} coins</b>
            <small>Earned from freelance work, referrals, and reputation milestones.</small>
          </div>
        </div>
      </div>

      {msg&&<div className="ref-banner" style={{marginBottom:20}}><Gift size={14}/> {msg}</div>}

      {catalog.length===0
        ? <div className="empty"><Package size={22}/><b>No rewards available right now.</b><span>Check back soon.</span></div>
        : <div className="cards">
            {catalog.map(item=>{
              const afford=balance!==null&&balance>=item.cost;
              const inStock=item.stock>0;
              return(
                <div className="data-card" key={item.id}>
                  <div className="card-top">
                    <span>{item.category}</span>
                    <span>{inStock?item.stock+' left':'Out of stock'}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <div className="card-bottom">
                    <b><Coins size={12}/> {item.cost.toLocaleString()}</b>
                    <button
                      className="primary"
                      disabled={!afford||!inStock||busy===item.id}
                      onClick={()=>redeem(item)}
                    >
                      {busy===item.id?'Redeeming…':!inStock?'Out of stock':!afford?'Not enough coins':'Redeem'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
      }

      <div className="section-title">
        <div>
          <span className="overline">HISTORY</span>
          <h2>Your redemptions</h2>
        </div>
      </div>

      {redemptions.length===0
        ? <div className="empty">No redemptions yet.</div>
        : <div className="referral-list">
            {redemptions.map((r:any)=>
              <div className="referral-row" key={r.id}>
                <span className={'status-pill '+r.status}>
                  {r.status==='fulfilled'?<Check size={11}/>:null} {r.status.replace('_',' ')}
                </span>
                <div>
                  <b>{r.reward_title}</b>
                  <small>{r.cost.toLocaleString()} coins · {timeAgo(r.created_at)}</small>
                </div>
              </div>
            )}
          </div>
      }

    </div>
  );
}

export {Rewards};
