import React,{useEffect,useRef,useState} from 'react';
import {MessageSquare,Plus,Send,X,Check,CheckCheck,Loader2,ChevronUp,AlertCircle,ShieldOff,Flag} from 'lucide-react';
import {api} from '../lib/api';
import {Avatar} from '../components/ui';

type Props={user:any};

function time(v:any){
  const d=new Date(v); return Number.isNaN(d.getTime())?'':d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

export function MessagesDock({user}:Props){
  const params=new URLSearchParams(window.location.search);
  const [open,setOpen]=useState(window.location.pathname.startsWith('/messages') || !!params.get('with'));
  const [unread,setUnread]=useState(0);
  const [conversations,setConversations]=useState<any[]>([]);
  const [selected,setSelected]=useState('');
  const [thread,setThread]=useState<any[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const [olderLoading,setOlderLoading]=useState(false);
  const [sending,setSending]=useState(false);
  const [body,setBody]=useState('');
  const [newUser,setNewUser]=useState('');
  const [error,setError]=useState('');
  const [permission,setPermission]=useState<any>(null);
  const endRef=useRef<HTMLDivElement|null>(null);
  const listRef=useRef<HTMLDivElement|null>(null);

  const loadUnread=async()=>{try{const x=await api('/messages/unread');setUnread(x.unread||0);}catch{}};
  const loadConversations=async()=>{
    try{const x=await api('/messages/conversations');setConversations(x.conversations||[]);}catch{}
  };
  const loadThread=async(username:string)=>{
    if(!username)return;
    setSelected(username);setLoading(true);setError('');setThread([]);setCursor(null);
    try{
      const x=await api('/messages/'+encodeURIComponent(username)+'?limit=40');
      setThread(x.messages||[]);setCursor(x.next_cursor||null);setPermission({can_message:x.can_message!==false,reason:x.message_permission_reason,context:x.context});
      await api('/messages/'+encodeURIComponent(username)+'/read',{method:'POST'}).catch(()=>{});
      loadUnread();loadConversations();
      requestAnimationFrame(()=>endRef.current?.scrollIntoView({behavior:'smooth'}));
    }catch(e:any){setError(e.message||'Unable to load messages.');}
    finally{setLoading(false);}
  };
  const loadOlder=async()=>{
    if(!selected||!cursor||olderLoading)return;
    const el=listRef.current; const before=el?.scrollHeight||0;
    setOlderLoading(true);
    try{
      const x=await api('/messages/'+encodeURIComponent(selected)+'?limit=40&cursor='+encodeURIComponent(cursor));
      setThread(prev=>[...(x.messages||[]),...prev]);setCursor(x.next_cursor||null);
      requestAnimationFrame(()=>{if(el)el.scrollTop=(el.scrollHeight-before)+(el.scrollTop||0);});
    }catch(e:any){setError(e.message||'Unable to load older messages.');}
    finally{setOlderLoading(false);}
  };
  useEffect(()=>{
    const onPop=()=>{
      const withUser=new URLSearchParams(window.location.search).get('with');
      if(window.location.pathname.startsWith('/messages')||withUser){setOpen(true);if(withUser)loadThread(withUser);}
    };
    window.addEventListener('popstate',onPop);
    return()=>window.removeEventListener('popstate',onPop);
  },[]);
  useEffect(()=>{
    if(!open||!selected)return;
    const id=window.setInterval(async()=>{
      try{
        const x=await api('/messages/'+encodeURIComponent(selected)+'?limit=40');
        if(!(thread||[]).some((m:any)=>m.optimistic)){setThread(x.messages||[]);setCursor(x.next_cursor||null);loadUnread();loadConversations();}
      }catch{}
    },8000);
    return()=>window.clearInterval(id);
  },[open,selected,thread]);
  useEffect(()=>{
    const withUser=new URLSearchParams(window.location.search).get('with');
    if(withUser){setOpen(true);setSelected(withUser);loadThread(withUser);}
    loadUnread();loadConversations();
    const id=window.setInterval(()=>{loadUnread();loadConversations();},15000);
    return()=>window.clearInterval(id);
  },[]);
  useEffect(()=>{if(open&&!selected)requestAnimationFrame(()=>endRef.current?.scrollIntoView());},[open,thread.length]);
  const send=async()=>{
    const text=body.trim();if(!text||!selected||sending)return;
    setSending(true);setError('');
    const temp={id:'local-'+Date.now(),sender_username:user.username,recipient_username:selected,body:text,created_at:new Date().toISOString(),read:false,optimistic:true};
    setThread(prev=>[...prev,temp]);setBody('');
    try{
      const x=await api('/messages',{method:'POST',body:JSON.stringify({username:selected,body:text})});
      setThread(prev=>prev.map(m=>m.id===temp.id?x.message:m));
      loadConversations();loadUnread();requestAnimationFrame(()=>endRef.current?.scrollIntoView({behavior:'smooth'}));
    }catch(e:any){
      setThread(prev=>prev.filter(m=>m.id!==temp.id));setBody(text);setError(e.message||'Unable to send message.');
    }finally{setSending(false);}
  };
  const choose=(u:string)=>loadThread(u);
  const block=async()=>{try{await api('/messages/'+encodeURIComponent(selected)+'/block',{method:'POST'});setPermission((p:any)=>({...p,can_message:false,reason:'You blocked this user'}));}catch(e:any){setError(e.message)}};
  const report=async()=>{const reason=prompt('Why are you reporting this conversation?');if(!reason?.trim())return;try{await api('/messages/'+encodeURIComponent(selected)+'/report',{method:'POST',body:JSON.stringify({reason})});setError('Conversation reported to the Zorta safety team.');}catch(e:any){setError(e.message)}};
  return <>
    <button className="messages-fab" aria-label="Messages" onClick={()=>setOpen(true)}>
      <MessageSquare size={19}/>{unread>0&&<span>{unread>99?'99+':unread}</span>}
    </button>
    {open&&<div className="messages-overlay">
      <section className="messages-panel" role="dialog" aria-label="Messages">
        <header className="messages-panel-head">
          <div><span className="overline">MESSAGES</span><h3>Direct messages</h3></div>
          <button aria-label="Close" onClick={()=>setOpen(false)}><X size={17}/></button>
        </header>
        <div className="messages-panel-body">
          <aside className="messages-list">
            <div className="messages-new">
              <input value={newUser} onChange={e=>setNewUser(e.target.value)} placeholder="Username"/>
              <button onClick={()=>{const u=newUser.trim();if(u){setNewUser('');choose(u);}}}><Plus size={14}/></button>
            </div>
            {!conversations.length?<div className="empty">No conversations yet.</div>:conversations.map(c=>
              <button className={'message-conversation '+(selected.toLowerCase()===c.user.username.toLowerCase()?'selected':'')} key={c.user.username} onClick={()=>choose(c.user.username)}>
                <Avatar user={c.user} size="sm"/>
                <div><b>{c.user.display_name||c.user.username}</b><span>{c.from_me?'You: ':''}{c.last_message}</span></div>
                {c.unread>0&&<i>{c.unread>9?'9+':c.unread}</i>}
              </button>
            )}
          </aside>
          <main className="messages-thread">
            {!selected?<div className="empty"><MessageSquare size={22}/><b>Select a conversation</b><span>Messages are available after a mutual follow.</span></div>:<>
              <div className="messages-thread-head"><div><b>@{selected}</b>{permission?.context?.title&&<small>Re: {permission.context.title}</small>}</div><div className="messages-thread-tools"><button onClick={report} aria-label="Report conversation" title="Report"><Flag size={14}/></button><button onClick={block} aria-label="Block user" title="Block"><ShieldOff size={14}/></button><button onClick={()=>loadThread(selected)} aria-label="Refresh"><Loader2 size={15} className={loading?'spin':''}/></button></div></div>
              {error&&<div className="messages-error"><AlertCircle size={14}/>{error}</div>}
              <div className="messages-scroll" ref={listRef}>
                {cursor&&<button className="load-older" onClick={loadOlder} disabled={olderLoading}>{olderLoading?<Loader2 size={14} className="spin"/>:<ChevronUp size={14}/>} Older messages</button>}
                {loading?<div className="empty"><Loader2 className="spin"/></div>:thread.length===0?<div className="empty">No messages yet.</div>:thread.map(m=>{
                  const mine=m.sender_username===user.username;
                  return <div key={m.id} className={'message-bubble '+(mine?'mine':'')}>
                    <p>{m.body}</p><small>{time(m.created_at)} {mine&&(m.optimistic?' · Sending…':m.read?<CheckCheck size={12}/>:<Check size={12}/>)}</small>
                  </div>
                })}
                <div ref={endRef}/>
              </div>
              {permission&&!permission.can_message&&<div className="messages-permission"><ShieldOff size={14}/><span>{permission.reason||'Messaging is not available for this user.'}</span></div>}
              <div className="messages-compose">
                <textarea disabled={permission&&!permission.can_message} value={body} onChange={e=>setBody(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} placeholder={`Message @${selected}`} maxLength={2000}/>
                <button className="primary" disabled={!body.trim()||sending||(permission&&!permission.can_message)} onClick={send}>{sending?<Loader2 size={15} className="spin"/>:<Send size={15}/>}</button>
              </div>
            </>}
          </main>
        </div>
      </section>
    </div>}
  </>;
}
