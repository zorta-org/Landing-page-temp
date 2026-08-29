export const API = import.meta.env.VITE_API_URL || 'http://localhost:5050/api';

async function request(path:string, opts:any = {}) {
  const token = localStorage.getItem('zorta_access');
  const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;

  const headers:any = {
    ...(isFormData ? {} : {'Content-Type':'application/json'}),
    ...(opts.headers || {})
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  let response = await fetch(API + path, {...opts, headers});

  if (response.status === 401 && localStorage.getItem('zorta_refresh')) {
    const refreshResponse = await fetch(API + '/auth/refresh', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        refresh_token:localStorage.getItem('zorta_refresh')
      })
    });

    if (refreshResponse.ok) {
      const refreshed = await refreshResponse.json();
      localStorage.setItem('zorta_access', refreshed.access_token);
      response = await fetch(API + path, {
        ...opts,
        headers:{
          ...headers,
          Authorization:`Bearer ${refreshed.access_token}`
        }
      });
    }
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export const api = request;