/**
 * Created by chenchaochao on 2017/6/25.
 */
const SqqConnection = require('./SqqConnection');
const util = require('util');
const debuglog = util.debuglog('rpc-pool');
const L5            = plug('api/L5/L5.api');
const ISBUSY        = Symbol('SqqCommonPoolCon#isBusy');
const WILLDIE       = Symbol('SqqCommonPoolCon#willDie');
const LOCKED        = Symbol('SqqCommonPoolCon#locked');
const RT            = Symbol('SqqCommonPoolCon#RT');

class SqqCommonPoolCon{
    constructor(pool, host, port, option){
        this.option        = Object.assign({}, option, {host, port})
        this[LOCKED]       = false;
        this[ISBUSY]       = false;
        this[WILLDIE]      = false;
        this.isLived       = true ;
        this.isConnected   = false;
        this.retryTimes    = this.option.retryTimes || 3;
        this.pool          = pool;
        this.callBackQueue = [];
        this.queue         = [];
        this[RT]           = 0;
        this.busyTime      = Date.now();
        this.tryConnect(host, port, 3);
    }
    tryConnect(host, port, times){
		if(times < 0){
            debuglog(`can't find router:host:${host},port:${port}`);
            this.destroy();
			this.isLived = false;
			return;
		}
        this.connection = new SqqConnection(port, host, () => {
            debuglog(`connect success:host:${host},port:${port}`);
        }, this.option.packet);
        this.bindEvent();
        setTimeout(() => {
            if(!this.isConnected){
                -- times;
                this.tryConnect(host, port, times);
            }
        }, 1000)
    }
    bindEvent(){
        this.connection.on('end',(had_error) => {
            debuglog(`connect end error: ${had_error}`)
            clearTimeout(this.timeOut);
            this.destroy();
            this.isLived = false;
        });
        this.connection.on('connect',() => {
            this.isConnected = true;
            clearTimeout(this.timeOut);
            this.retryTimes = 3;
            if(this.queue.length > 0 && this.callBackQueue.length > 0){
                this.query(this.queue.shift(), this.callBackQueue.shift());
            }else{
                if(!this.pool.retryQuery(this)){
					this.pool.changeToIdle(this);
				}
            }
        });
        this.connection.on('error',() => {
            this.isConnected = false;
            clearTimeout(this.timeOut);
            if(this.retryTimes > 0){
                -- this.retryTimes;
                this.tryConnect(host, cmd, 3);
            }else{
                this.destroy();
                this.isLived = false;
            }
        });
        this.connection.on('timeout', () => {
            this.isConnected = false;
            clearTimeout(this.timeOut);
            if(this.retryTimes > 0){
                -- this.retryTimes;
                this.tryConnect(host, cmd, 3);
            }else{
                this.destroy();
                this.isLived = false;
            }
        });
        this.connection.on('packet',(data) =>{
            clearTimeout(this.timeOut);
            let option = this.queue.shift();
            let callBack = this.callBackQueue.shift();
            callBack && callBack(undefined, data);
            if(this.queue.length === 0){
                if(this[WILLDIE]){
                    this.destroy();
                    return;
                }
                this[ISBUSY] = false;
                this.pool.changeToIdle(this);
                this.pool.retryQuery(this);
            }else{
                this.query(option, callBack);
            }
        });
    }
    unbindEvent(){
        clearTimeout(this.timeOut);
        this.connection && this.connection.removeAllListeners('end');
        this.connection && this.connection.removeAllListeners('error');
        this.connection && this.connection.removeAllListeners('timeout');
        this.connection && this.connection.removeAllListeners('packet');
    }
    lock(){
        this[LOCKED] = true;
    }
    unLock(){
        this[LOCKED] = false;
    }
    isLcok(){
        return this[LOCKED];
    }
    release(){
        this[LOCKED] = false;
    }
    isBusy(){
        return this[ISBUSY];
    }
    destroy(){
        this.isConnected = false;
        this.connection && this.connection.destroy();
        this.unbindEvent();
        this.removeFromPool();
        this.isLived = false;
        this.clearQueue();
    }
    removeFromPool(){
        this.pool.removeConnection(this);
    }
    clearQueue(){
        this.queue = [];
        for(let i = 0;i < this.callBackQueue.length; i++){
            this.callBackQueue[i](new Error('the connection is dieing'))
        }
    }
    query(option, callBack){
        if(!option || !callBack){
            return;
        }
        this.timeOut = setTimeout(() => {
            if(this.retryTimes > 0){
                if(this.connection){
                    this.unbindEvent();
                    this.connection.destroy();
                    this.tryConnect(this.option.host, this.option.port, 3);
                }else{
                    this.queue.shift();
                    let callBack = this.callBackQueue.shift();
                    callBack && callBack(new Error('timeout'));
                }
            }else{
                this.queue.shift();
                let callBack = this.callBackQueue.shift();
                callBack && callBack(new Error('timeout'));
            }
        }, 3000);
        this.timeOut.unref();
        this.pool.changeToBusy(this);
        this.busyTime = Date.now();
        if(this.isBusy()){
            this.queue.push(option);
            this.callBackQueue.push(callBack);
            return;
        }
        if(!this.isConnected){
            if(this.isLived){
                this.queue.push(option);
                this.callBackQueue.push(callBack);
            }else{
                callBack(new Error('sqqCommonPoolCon Error: this connection has destroied'));
            }
            return;
        }
        this[ISBUSY] = true;
        this.queue.push(option);
        this.callBackQueue.push(callBack);
        this.connection.query(option);
    }
    get rt(){
        return this[RT];
    }
    changeRt(time){
        if(this[RT] === 0){
            this[RT] = time;
        }else{
            this[RT] = (this[RT]/10>>0)*9 + (time/10>>0);
        }
    }
    willDie(){
        this[WILLDIE] = true;
        if(!this[ISBUSY]){
            this.destroy();
        }
    }
}
module.exports = SqqCommonPoolCon;