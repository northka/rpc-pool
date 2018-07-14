/**
 * Created by chenchaochao on 2017/6/25.
 */
const SqqCommonPoolCon = require('./SqqCommonPoolCon');
const defaultOption = {
    modid            : 'localmodid',
    cmd              : '3000',
    connectionLimit  : 0,
    min              : 0,
    timeout          : 3000,
    idleTimeout      : 120000
};
class SqqCommonPool{
    constructor(host, port, option){
        this.option = Object.assign({}, defaultOption, option, {host, port});
        this.busyConnections = [];
        this.idleConnections = [];
        this.queue = [];
        this.callBackQueue = [];
        this.timeList      = [];
        this.initCon();
        this.autoEliminateSlowCon();
    }
    get connetionsNum(){
        return this.busyConnections.length + this.idleConnections.length;
    }
    autoEliminateSlowCon(){
        setInterval(() => {
            this.eliminateSlowCon();
        }, 3000);
    }
    autoEliminateIdleCon(){
        setInterval(() => {
            if(this.connetionsNum <= this.option.min){
                return;
            }
            let maxEliminateConNum = this.connetionsNum - this.option.min,
                deadLine = Date.now() - this.option.idleTimeout;
            for(let i = 0; i < maxEliminateConNum && i < this.idleConnections.length; i++){
                if(this.idleConnections[i].busyTime < deadLine){
                    this.idleConnections[i].destroy();
                }else{
                    break;
                }
            }

        }, 5000)
    }
    initCon(){
        for(let i = 0; i < this.option.min; i++){
            this.newConnection();
        }
    }
    newConnection(){
        let con = new SqqCommonPoolCon(this, this.option.host, this.option.port, this.option.packet);
        this.busyConnections.push(con);
        return con;
    }
    getConnection(){
        for(let i= 0; i < this.idleConnections.length; i++){
            this.idleConnections[i].lock();
            this.changeToBusy(this.idleConnections[i]);
            return this.idleConnections[i];
        }
        if(this.option.connectionLimit == 0 || (this.busyConnections.length + this.idleConnections.length) < this.option.connectionLimit){
            let con = this.newConnection();
            con.lock();
            return con;
        }
        return false;
    }
    removeConnection(con){
        let idleIndex = this.idleConnections.indexOf(con);
        if(idleIndex >= 0){
            this.idleConnections.splice(idleIndex, 1);
        }
        let busyIndex = this.busyConnections.indexOf(con);
        if(busyIndex >= 0){
            this.busyConnections.splice(busyIndex, 1);
        }
        let needNewConLength = this.option.min - this.idleConnections.length - this.busyConnections.length
        if(needNewConLength > 0){
            for(let i = 0; i < needNewConLength; i++){
                this.newConnection();
            }
        }
    }
    changeToIdle(con){
        let busyIndex = this.busyConnections.indexOf(con);
        if(busyIndex >= 0){
            this.busyConnections.splice(busyIndex, 1);
        }
		if(this.idleConnections.indexOf(con) < 0){
			this.idleConnections.push(con);
		}
    }
    changeToBusy(con){
        let idleIndex = this.idleConnections.indexOf(con);
        if(idleIndex >= 0){
            this.idleConnections.splice(idleIndex, 1);
        }
		if(this.busyConnections.indexOf(con) < 0){
			this.busyConnections.push(con)
		}
    }
    retryQuery(con){
        if(this.queue.length > 0){
            if(Date.now() > this.timeList.shift() + this.option.timeOut){
                this.queue.shift();
                let callBack = this.callBackQueue.shift();
                callBack(new Error('timeout'));
            }else{
                let option   = this.queue.shift();
                let callBack = this.callBackQueue.shift();
                con.query(option, callBack);
                return true;
            }
        }
		return false;
    }
    queryAsync(option, resolve, reject){
        let length = this.idleConnections.length;
        for(let i = length - 1; i>=0 ; i--){
            if(!this.idleConnections[i].isLcok()){
                let pre = Date.now();
                let con = this.idleConnections[i]
                con.query(option, (error, data) => {
                    if(error){
                        reject(error);
                        return;
                    }
                    con.changeRt(Date.now() - pre);
                    resolve(data);
                });
                return;
            }
        }
        if(this.option.connectionLimit === 0 || (this.idleConnections.length + this.busyConnections.length) < this.option.connectionLimit){
            let con = this.newConnection();
            let pre = Date.now();
            con.query(option, (error, data) => {
                if(error){
                    reject(error);
                    return;
                }
                con.changeRt(Date.now() - pre);
                resolve(data);
            });
            return;
        }
        this.queue.push(option);
        this.callBackQueue.push((error, data) => {
            if(error){
                reject(error);
                return;
            }
            resolve(data);
        });
        this.timeList.push(Date.now());
    }
    query(option){
        return new Promise( (resolve, reject) => {
            let length = this.idleConnections.length;
            for(let i = length - 1; i>=0 ; i--){
                if(!this.idleConnections[i].isLcok()){
                    let pre = Date.now();
                    let con = this.idleConnections[i]
                    con.query(option, (error, data) => {
                        if(error){
                            reject(error);
                            return;
                        }
                        con.changeRt(Date.now() - pre);
                        resolve(data);
                    });
                    return;
                }
            }
            if(this.option.connectionLimit === 0 || (this.idleConnections.length + this.busyConnections.length) < this.option.connectionLimit){
                let con = this.newConnection();
                let pre = Date.now();
                con.query(option, (error, data) => {
                    if(error){
                        reject(error);
                        return;
                    }
                    con.changeRt(Date.now() - pre);
                    resolve(data);
                });
                return;
            }
            this.queue.push(option);
            this.callBackQueue.push((error, data) => {
                if(error){
                    reject(error);
                    return;
                }
                resolve(data);
            });
            this.timeList.push(Date.now());
        });
    }
    eliminateSlowCon(){
        let totalLength = this.busyConnections.length + this.idleConnections.length;
        if(totalLength < 10){
            return;
        }
        let eliminateLength = Math.ceil(totalLength/10);
        let allCon = [...this.busyConnections, ...this.idleConnections];
        let sortedCon = allCon.sort(function (a, b) {
            return a.rt < b.rt;
        });
        for(let i = 0; i < eliminateLength; i++){
            sortedCon[i].willDie();
        }
    }
    destroy(){
        this.option.min = 0;
        for(let i = 0 ; i < this.idleConnections.length; i++){
            this.idleConnections[i].destroy();
        }
        for(let i = 0 ; i < this.busyConnections.length; i++){
            this.busyConnections[i].destroy();
        }
        this.idleConnections = this.busyConnections = [];
    }
}
module.exports = SqqCommonPool;
