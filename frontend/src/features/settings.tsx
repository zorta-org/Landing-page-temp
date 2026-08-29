import React,{useState} from 'react';
import {Moon,MoonStar,Sun,AtSign,Check,AlertCircle,Gift,Coins} from 'lucide-react';
import {api} from '../lib/api';
import {THEMES,applyTheme} from '../lib/theme';
import type {User} from '../lib/types';

function Settings({
  user,
  setUser
}:{
  user:User;
  setUser:(u:User)=>void
}){

  const [theme,setTheme]=
    useState(
      localStorage.getItem(
        'zorta_theme'
      )||'velvet'
    );

  const [saved,setSaved]=useState(false);
  const [username,setUsername]=useState(user.username);
  const [usernameBusy,setUsernameBusy]=useState(false);
  const [usernameMsg,setUsernameMsg]=useState('');

  const [d,setD]=
    useState({
      display_name:
        user.display_name,

      bio:
        user.bio||'',

      skills:
        (user.skills||[])
          .join(', '),

      interests:
        (user.interests||[])
          .join(', ')
    });

  const save=async()=>{

    const x=
      await api(
        '/profiles/me',
        {
          method:'PATCH',
          body:JSON.stringify({
            ...d,

            skills:
              d.skills
                .split(',')
                .map(
                  x=>x.trim()
                )
                .filter(Boolean),

            interests:
              d.interests
                .split(',')
                .map(
                  x=>x.trim()
                )
                .filter(Boolean)
          })
        }
      );

    const u:User={
      id:String(x.user?.id||x.user?._id||user.id),
      username:String(x.user?.username||user.username),
      display_name:String(x.user?.display_name||d.display_name),
      avatar:x.user?.avatar||user.avatar||'',
      bio:x.user?.bio||'',
      reputation:Number(x.user?.reputation||0),
      skills:Array.isArray(x.user?.skills)?x.user.skills:[],
      interests:Array.isArray(x.user?.interests)?x.user.interests:[],
      roles:Array.isArray(x.user?.roles)?x.user.roles:[],
      onboarding_complete:Boolean(x.user?.onboarding_complete)
    };

    setUser(u);

    setD({
      display_name:
        u.display_name,

      bio:
        u.bio||'',

      skills:
        (u.skills||[])
          .join(', '),

      interests:
        (u.interests||[])
          .join(', ')
    });

    setSaved(true); setTimeout(()=>setSaved(false),1800);
  };

  const setT=(
    t:string
  )=>{

    setTheme(t);

    localStorage.setItem(
      'zorta_theme',
      t
    );

    applyTheme(t);
  };

  return(
    <div className="page narrow">

      <span className="overline">
        SETTINGS
      </span>

      <h1>
        Make Zorta yours.
      </h1>

      <div className="settings">

        <section>

          <h3>
            Profile
          </h3>

          <input
            value={d.display_name}
            onChange={e=>
              setD({
                ...d,
                display_name:
                  e.target.value
              })
            }
          />

          <textarea
            value={d.bio}
            onChange={e=>
              setD({
                ...d,
                bio:e.target.value
              })
            }
          />

          <input
            value={d.skills}
            onChange={e=>
              setD({
                ...d,
                skills:
                  e.target.value
              })
            }
            placeholder="Skills, comma separated"
          />

          <input
            value={d.interests}
            onChange={e=>
              setD({
                ...d,
                interests:
                  e.target.value
              })
            }
            placeholder="Interests, comma separated"
          />

          <button className="primary" onClick={save}>{saved?'Saved ✓':'Save changes'}</button>

        </section>


        <section>
          <h3><AtSign size={16}/> Username</h3>
          <p>Your username is public and must contain only letters and numbers. You can change it once every 30 days.</p>
          <input value={username} onChange={e=>setUsername(e.target.value.replace(/[^A-Za-z0-9]/g,'').slice(0,24))} />
          <button className="secondary" disabled={usernameBusy||username===user.username} onClick={async()=>{
            setUsernameBusy(true);setUsernameMsg('');
            try{
              const x=await api('/profiles/me/username',{method:'PATCH',body:JSON.stringify({username})});
              const nu=x.user; setUser({...user,username:nu.username,user_id:nu.user_id||user.user_id});
              setUsernameMsg('Username updated.');
            }catch(e:any){setUsernameMsg(e.message||'Could not change username.');}
            finally{setUsernameBusy(false);}
          }}>{usernameBusy?'Updating…':username===user.username?'Current username':'Change username'}</button>
          {usernameMsg&&<small className="settings-note">{usernameMsg}</small>}
          <small>Zorta ID · {user.user_id||user.id}</small>
        </section>

        <section>
          <h3><Gift size={16}/> Invite friends</h3>
          <p>Share your referral link — you and your friend both earn Zorta coins when they join.</p>
          <a className="secondary wide" href="/referrals" style={{textAlign:'center',display:'block'}}>Get your referral link</a>
        </section>

        <section>
          <h3><Coins size={16}/> Wallet</h3>
          <p>See your Zorta Coins balance and full earning history, and redeem coins for rewards.</p>
          <a className="secondary wide" href="/wallet" style={{textAlign:'center',display:'block'}}>Open your wallet</a>
        </section>

        <section>

          <h3>
            Appearance
          </h3>

          <div className="theme-buttons">

            {THEMES.map(
              ({id,label,icon:I,swatch})=>

                <button
                  className={
                    theme===id
                      ?'sel'
                      :''
                  }
                  onClick={()=>
                    setT(id)
                  }
                  key={id}
                >
                  {swatch
                    ?<span
                        className="theme-swatch"
                        style={{background:swatch}}
                      />
                    :I?<I size={16}/>:<span className="theme-swatch" style={{background:'var(--accent)'}}/>
                  }
                  {label}
                </button>
            )}

          </div>

        </section>

        <section>

          <h3>
            Infrastructure
          </h3>

          <p>
            Hosting and payments use provider adapters.
            They return a clear provider-not-configured
            state until real credentials are supplied.
          </p>

        </section>

      </div>

    </div>
  );
}



export {Settings};
