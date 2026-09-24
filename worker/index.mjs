import {notebookAPI} from './notebook.mjs';
import {sessionAPI} from './session.mjs';
import {discoveryAPI} from './discovery.mjs';
import {jamsAPI} from './jams.mjs';
import page from '../dist/index.html';
export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(path==='/api/notebook')return notebookAPI(request,env);
    if(path==='/api/session')return sessionAPI(request,env);
    if(path==='/api/jams')return jamsAPI(request,env);
    if(path==='/api/prepare'||path==='/api/places')return discoveryAPI(request);
    if(path==='/'||path==='/index.html')return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}});
    if(env.ASSETS)return env.ASSETS.fetch(request);
    return new Response('Not found',{status:404});
  }
};
