/**
 * Created by nkchen on 2017/6/24.
 */
const Socket       = require('net').Socket;
const BufferHelper = require('./BufferHelper');

class SqqConnection extends Socket{
    constructor(port, host, callBack, packet){
        super();
        this.data = new BufferHelper();
        this.status = 'receiveHeader';
        this.packet = packet
        this.temp = new this.packet();
        if(port && host ){
            this.connect(port, host, callBack);
        }
    }
    connect(){
        super.connect(...arguments);
        this.setKeepAlive(true, 5000);
        this.on('data',this.resolveData )
    }
    resolveData(trunk) {
        this.data.concat(trunk);
        this.dataHandler();
    }
    dataHandler(){
        let needReceive = this.temp.needReceiveData();
        if(needReceive.done){
            this.temp = new this.packet();
            needReceive = this.temp.needReceiveData();
        }
        if(this.data.length >= needReceive.value){
            let result = this.temp.parseData(this.data.subBuffer(needReceive.value));
            if(result){
                this.emit('packet', this.temp);
            }
            this.dataHandler();
        }
    }
    resetStatus(){
        this.status = 'receiveHeader';
        this.data.empty();
    }
    emptyData(){
        this.temp = new this.packet();
    }
    destroy(){
        super.destroy();
        this.removeAllListeners('data');
    }
    query(option){
        let temp = new this.packet(option);
        this.write(temp.toPacket());
    }
}

module.exports = SqqConnection;