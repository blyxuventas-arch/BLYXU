import { createHandler } from './server.js';
import {RealtimeClient} from 'npm:@supabase/realtime-js@2.117.3';

Deno.serve(createHandler({env: name => Deno.env.get(name),subscribe({topic,onMessage,onReady,onError}){
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!key)throw new Error('Realtime no está configurado en el servidor.');
  const realtime=new RealtimeClient(Deno.env.get('SUPABASE_URL')+'/realtime/v1',{params:{apikey:key},accessToken:async()=>key});
  const channel=realtime.channel(topic,{config:{private:true}}).on('broadcast',{event:'*'},({event,payload})=>onMessage(event,payload));
  channel.subscribe(status=>{if(status==='SUBSCRIBED')onReady();else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')onError();});
  return ()=>{realtime.removeChannel(channel).finally(()=>realtime.disconnect());};
}}));
