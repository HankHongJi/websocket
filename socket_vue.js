/*
*websocket处理插件，
*heartBeat   websocket心机包组件保证链接不失活
	_heartBeat 心机包识别码
 * @example
 *  var ws = new  Socket(platformId,url,store);

 * ws.send 返回一个 Promise对象 向服务端发送请求  
 	1：_silence参数控制是否不显示加载动画默认false显示
 	open 心机包开关设置，开发环境可以关闭，上线必须开启
 * ws.from 提供一个服务端推送接口处理方案

*hank 2017.11.9
 */
import {authenticate} from "../api/index";

function Socket(platformId,url,store){
	//this.ws=new WebSocket(url);
	this.url=url;
	this.connectCount=0;
	this.store=store;
	this.platformId=platformId;
	this.count=1;
	this.heartBeat={
		open:false,
		valid:true,
		intervalTime:30000,
		timeOut:25000,
		checkQueue:{}
	};   
	this.delayQueue=[];
	this.loadQueue=[];
	this.callback={};
	this.fromCallback={};
	this.init();
}

Socket.prototype = {	
	init: function() {
		this.ws=new WebSocket(this.url);
		let connectIndex=this.connectCount;
		setTimeout(()=>{
			connectIndex==this.connectCount && alert("网路错误，请稍后再试");
		},5000);
		this.ws.onopen = this.onOpenCallback.bind(this);
		this.ws.onerror = this.onErrorCallback.bind(this);
		this.ws.onclose = this.onCloseCallback.bind(this);
		this.ws.onmessage = this.onMessageCallback.bind(this);
		return this;
	},
	onOpenCallback:function(){
		console.log('服务器连接成功...');
		//连接成功后启动vue
		this.connectCount++;
		this.delayQueue.length>0 && this.delayQueue.map((item,index)=>{
			this.load(item)
		})
		this.delayQueue=[];
		this.heartBeat.open &&this.startHeartBeat();
	},
	onMessageCallback:function(res){
		let respData = JSON.parse(res.data) ; 
		let name = respData.requestId || null;
		//服务端主动推送接口
		if(!name){
			this.fromCallback[res.functionName].fun();
			return;
		}
		let callback = this.callback[name]; 
		if(!callback.data.data._silence&&this.store  ){
			this.store.state.load.closeAnimation();
		}
		if(callback.data.data._heartBeat){
			this.heartBeat.valid=true;
		}
		//用户未登录status==420
		if(respData['data']['status'] == 420){
			this.store && this.store.commit('CONFIRM',{'text':respData['data'].errorMessage,okName:'去登录',noName:'去注册',okfun:()=>{
				window.location.hash = "/account/login";
			},nofun:()=>{
				window.location.hash = "/account/register";
			}});
		}else if (respData['data']['status'] == 200) {
			callback.promise.resolve(respData['data'])
		} else if(!callback.data.data._silence){
			all.tool && all.tool.msg(respData['data'].errorMessage,this.store);
			callback.promise.reject(respData['data']);
		}
		delete this.callback[name];
	},
	onErrorCallback:function (event) {
		console.log('服务器连接发生错误', event);
	},
	onCloseCallback:function(){
		console.log('服务器连接关闭');
		if(this.store&&this.store.state.loading){
			this.store.state.load.closeAnimation();
		}
	},
	promiseFun:function(resolve, reject){
		this.reject = reject;
		this.resolve = resolve;
	},
	createPromise:function(){
		 var promise = new Promise(this.promiseFun.bind(this))
		promise.reject=this.reject;
		promise.resolve=this.resolve;
		return promise;
	},
	send:function(opt){
		let promise = this.createPromise()
		if (this.ws.readyState != WebSocket.OPEN) {
			!this.delayQueue.includes([opt,promise]) && this.delayQueue.push([opt,promise]);
			return promise;
		}
		this.load([opt,promise]);
		return promise;
	},
	from:function(opt){
		this.fromCallback[opt.functionName] = opt;
	},
	load:function(arr){
		let  index = 'RQ' + this.count,sendData=arr[0];
		this.callback[index] = {};
		if(!sendData.data){
			sendData['data'] = {};
		}
		sendData['data']['requestId']=index;
		sendData['data']['platformId']=this.platformId;
		this.callback[index]['promise'] = arr[1];
		this.callback[index]['data'] = arr[0];
		!(arr[0].data._heartBeat)&&console.log('发送消息', arr[0]);
		if(!arr[0].data._silence){
			this.store && this.store.state.load.openAnimation();
		}
		this.ws.send(JSON.stringify(arr[0]));
		this.count++;
		return arr[1];
	},
	startHeartBeat: function() {
		let self = this;
		this.heartBeatTimer = setInterval(()=>{
			let user = this.store.state.user||{}
			this.heartBeat.valid=false;
			authenticate('player',{playerId:user.playerId,token:user._token,_silence:true,_heartBeat:true});
			setTimeout(()=>{
				!self.heartBeat.valid &&self.close();
			},this.heartBeat.timeOut)
		}, this.heartBeat.intervalTime)
	},
	close: function() {
		clearInterval(this.heartBeatTimer);
		this.ws.close();
		if(this.connectCount>3){
			this.store && this.store.commit('CONFIRM',{text:"网路错误，请稍后再试"});
			return;
		}
		setTimeout(()=>{
			this.init();
		},1000)
		return this;
	}

}

export default  Socket