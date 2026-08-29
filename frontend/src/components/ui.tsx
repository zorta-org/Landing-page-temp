import React from 'react';
export const Logo = ({small=false}:{small?:boolean}) => <div className={'logo '+(small?'small':'')}><img src="/zorta-mark.png" alt="Zorta"/><span>ZORTA</span></div>;
export function Avatar({user,size='sm'}:{user:any;size?:'sm'|'md'|'lg'}) {
  const clickable=!!user?.username;
  const openProfile=()=>{
    if(!clickable)return;
    window.location.href='/profile/'+encodeURIComponent(user.username);
  };
  const cls='avatar '+size+(clickable?' avatar-clickable':'');
  return user?.avatar
    ? <img className={cls} src={user.avatar} alt="" onClick={openProfile} role={clickable?'link':undefined}/>
    : <div className={cls} onClick={openProfile} role={clickable?'link':undefined}>{(user?.display_name || user?.username || 'Z')[0].toUpperCase()}</div>;
}
