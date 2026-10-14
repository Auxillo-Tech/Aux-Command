'use strict';
const {diagnoseConnection}=require('./connection-diagnostics.cjs');
class ConnectionTimeline {
 constructor(protocol){this.protocol=protocol;this.started=Date.now();this.events=[];this.seen=new Set();this.tail='';this.add('process','Terminal process started');}
 add(stage,message){if(this.seen.has(stage))return;this.seen.add(stage);this.events.push({stage,message,at:new Date().toISOString(),elapsedMs:Date.now()-this.started});}
 feed(data){this.add('output','First terminal output received');this.tail=(this.tail+data).slice(-16384);const diagnosis=diagnoseConnection(this.protocol,this.tail);if(diagnosis)this.add(diagnosis.category,diagnosis.title+' — '+diagnosis.guidance);}
 directory(){this.add('shell','Shell reported its working directory');}
 exit(code){this.add('exit','Process exited with status '+code);}
}
module.exports={ConnectionTimeline};
